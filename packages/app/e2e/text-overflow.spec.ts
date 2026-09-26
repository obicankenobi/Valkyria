// text-overflow.spec.ts — regel 18 (CLAUDE.md, "Spelgränssnitt — regler
// (etapp 7)"): "Ingen text får överlappa annan text eller klippas av sin
// ruta. Kontrolleras automatiskt: ett Playwright-test går igenom varje
// textelement på varje skärm i båda formaten och underkänner om
// scrollWidth > clientWidth." Körs i CI (npm run test:e2e).
//
// Skärmlistan delar samma princip som scripts/shots.mjs: växer i takt med
// att fler etapp 7-skärmar färdigställs. P73 lade bara komponentsidan; P74
// lägger huvudmenyn och OPERATIONS-skalet (`setup` klickar igenom "New
// Game" — varje Playwright-test får en egen, tom browserkontext, så
// bekräftelsedialogen för att skriva över ett sparat parti aldrig visas här).
//
// Kartkollisionsdelen av regel 18 ("ett test över kartan underkänner om två
// etiketters eller markörers avgränsningsrutor skär varandra") gäller
// SECTOR_REGIONS/etiketterna som byggs i P76 — ingen karta finns än, så den
// delen av testet läggs till där, inte här.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const FORMATS: { name: string; width: number; height: number }[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

async function enterOperations(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('hud').waitFor()
}

const SCREENS: { name: string; path: string; setup?: (page: Page) => Promise<void> }[] = [
  { name: 'components', path: '/?screen=components' },
  { name: 'main-menu', path: '/' },
  { name: 'operations', path: '/', setup: enterOperations },
]

for (const format of FORMATS) {
  for (const screen of SCREENS) {
    test(`ingen text klipps eller överlappar sin ruta — ${screen.name}, ${format.name} (regel 18)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto(screen.path)
      if (screen.setup) await screen.setup(page)
      await page.waitForTimeout(300)

      const offenders = await page.evaluate(() => {
        const found: string[] = []
        const all = document.body.querySelectorAll('*')
        for (const el of all) {
          const node = el as HTMLElement
          const style = window.getComputedStyle(node)
          // Inline-element rapporterar scrollWidth/clientWidth opålitligt (alltid 0
          // eller identiskt med sina barn) — bara block-liknande boxar har en egen
          // ruta att klippas av, vilket är precis vad regel 18 pratar om.
          if (style.display === 'inline' || style.display === 'none') continue
          // Bara element med EGEN direkt textnod (inte bara andra elements
          // wrapper) — annars flaggas containern för sina barns skull också.
          const hasDirectText = Array.from(node.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
          )
          if (!hasDirectText) continue
          if (node.scrollWidth > node.clientWidth + 1) {
            const label = (node.textContent ?? '').trim().slice(0, 50)
            const cls = node.className ? `.${String(node.className).split(' ').join('.')}` : ''
            found.push(`${node.tagName.toLowerCase()}${cls}: "${label}" (scrollWidth ${node.scrollWidth} > clientWidth ${node.clientWidth})`)
          }
        }
        return found
      })

      expect(offenders, `Textelement klipps av sin ruta:\n${offenders.join('\n')}`).toEqual([])
    })
  }
}

// Regel 11 (CLAUDE.md, "Spelgränssnitt — regler (etapp 7)"): "Träffytor minst
// 44×44 px." Samma komponentlista som ovan — växer i takt med fler skärmar.
for (const format of FORMATS) {
  for (const screen of SCREENS) {
    test(`alla träffytor minst 44×44 px — ${screen.name}, ${format.name} (regel 11)`, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto(screen.path)
      if (screen.setup) await screen.setup(page)
      await page.waitForTimeout(300)

      const tooSmall = await page.evaluate(() => {
        const found: string[] = []
        const interactive = document.body.querySelectorAll(
          'button, a[href], [role="slider"], [role="switch"], [role="radio"], [role="tab"]',
        )
        for (const el of interactive) {
          const node = el as HTMLElement
          if (window.getComputedStyle(node).display === 'none') continue
          const rect = node.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue // inte renderad (t.ex. dold)
          if (rect.width < 44 || rect.height < 44) {
            const label = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)
            found.push(`${node.tagName.toLowerCase()} "${label}": ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}`)
          }
        }
        return found
      })

      expect(tooSmall, `Träffytor under 44×44 px:\n${tooSmall.join('\n')}`).toEqual([])
    })
  }
}
