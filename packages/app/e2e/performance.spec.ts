// performance.spec.ts — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5). Den delen av
// prestandabudgeten som går att bevisa mekaniskt i en webbläsare i stället för på
// en telefon: "Omgivningsrörelse animeras bara med transform och opacity, och
// högst ett trettiotal element rör sig samtidigt. Sjunker bildtakten stängs
// omgivningsrörelsen av automatiskt." Bildtakten på en RIKTIG telefon går inte att
// mäta härifrån — se docs/ETAPP7_TEKNISK_SPEC.md §13:s P94-blockquote och
// scripts/perf.mjs för vad som faktiskt mäts, och vad som inte gör det.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const FORMATS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false },
]

// Inget emulateMedia('reduce') här: prefers-reduced-motion stänger av just den
// rörelse som testas.
async function enterGame(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  await page.getByTestId('theatre-map-svg').waitFor()
}

// Alla oändliga animationer som körs just nu (= omgivningsrörelse; en animation
// som svarar på en handling är ändlig), med de egenskaper de animerar.
function runningAmbient(page: Page) {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations === Infinity)
      .map((animation) => ({
        name: (animation as CSSAnimation).animationName,
        properties: [
          ...new Set(
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .flatMap((keyframe) => Object.keys(keyframe))
              .filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key)),
          ),
        ],
      })),
  )
}

for (const format of FORMATS) {
  test.describe(format.name, () => {
    test.use({ viewport: format.viewport, hasTouch: format.hasTouch, isMobile: format.isMobile, actionTimeout: 15_000 })

    test(`omgivningsrörelsen håller budgeten: högst 30 rörliga element, bara transform och opacity (${format.name})`, async ({
      page,
    }) => {
      await enterGame(page)
      await page.waitForTimeout(500) // låt animationerna komma igång

      const ambient = await runningAmbient(page)
      expect(ambient.length, 'ingen omgivningsrörelse alls — testet mäter ingenting').toBeGreaterThan(0)
      expect(ambient.length).toBeLessThanOrEqual(30)
      for (const animation of ambient) {
        for (const property of animation.properties) {
          expect(['transform', 'opacity'], `${animation.name} animerar ${property}`).toContain(property)
        }
      }
    })

    test(`sjunker bildtakten stängs omgivningsrörelsen av automatiskt (${format.name})`, async ({ page }) => {
      await enterGame(page)
      expect(await page.evaluate(() => document.documentElement.dataset.ambient)).toBeUndefined()
      expect((await runningAmbient(page)).length).toBeGreaterThan(0)

      // Tvinga fram en låg bildtakt: 45 ms huvudtrådsarbete per bildruta ≈ 20 bilder/s.
      await page.evaluate(() => {
        const burn = () => {
          const start = performance.now()
          while (performance.now() - start < 45) {
            // upptagen
          }
          requestAnimationFrame(burn)
        }
        requestAnimationFrame(burn)
      })

      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.ambient), { timeout: 30_000 })
        .toBe('off')
      expect(await runningAmbient(page)).toEqual([])
    })
  })
}
