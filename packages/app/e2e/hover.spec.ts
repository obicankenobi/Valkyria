// hover.spec.ts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 3, "Skrivbordslayouten
// genomgången med hovring"). Regel 3: "Varje interaktivt element har fyra
// tillstånd: idle, pressed, selected, disabled (plus hover, bara på skrivbord)."
// Granskningen i P94 hittade ett stort antal interaktiva element utan något
// hovertillstånd alls (flikraden, Segmented, TierPicker, landsaktens verb,
// handlingsplatserna m.fl.). Här bevisas två saker i en riktig webbläsare:
//   1. på skrivbord ÄNDRAR hovring elementets utseende, och
//   2. på en pekskärm gör den inte det — annars fastnar hovertillståndet efter
//      ett tryck ("sticky hover"), regel 13:s andra hälft.
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

async function enterGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // övergångar av: hovring syns direkt
  await page.goto('/')
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
}

// Allt som en hovring rimligen kan ändra, inklusive SVG-egenskaper.
function look(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return JSON.stringify([
      style.backgroundColor,
      style.backgroundImage,
      style.borderTopColor,
      style.borderBottomColor,
      style.borderLeftColor,
      style.color,
      style.boxShadow,
      style.opacity,
      style.filter,
      style.strokeWidth,
      style.fill,
    ])
  })
}

interface Target {
  name: string
  open?: (page: Page) => Promise<void>
  locator: (page: Page) => Locator
}

const TARGETS: Target[] = [
  { name: 'flik (inaktiv)', locator: (p) => p.getByTestId('tab-contracts') },
  { name: 'tom handlingsplats', locator: (p) => p.getByTestId('action-slot-0-empty') },
  { name: 'kvartalsbandets huvud', locator: (p) => p.locator('.ds-quarterband-head') },
  { name: 'HUD:ens menyknapp', locator: (p) => p.getByTestId('hud-menu-button') },
  { name: 'HUD-raden', locator: (p) => p.locator('.ds-hud-row') },
  { name: 'kartans huvudstadsmarkör', locator: (p) => p.getByTestId('map-capital-rvn').locator('.map-capital-marker') },
  {
    name: 'landsaktens verb',
    open: async (p) => {
      await p.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await p.getByTestId('country-file').waitFor()
    },
    locator: (p) => p.getByTestId('cf-verb-EXPAND'),
  },
  {
    name: 'bottenarkets stängknapp',
    open: async (p) => {
      await p.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await p.getByTestId('country-file').waitFor()
    },
    locator: (p) => p.locator('[data-testid="country-file"] .ds-sheet-close'),
  },
  {
    name: 'TierPicker (ovald nivå)',
    open: async (p) => {
      await p.getByTestId('tab-company').click()
    },
    locator: (p) => p.getByTestId('company-credit-tier').getByRole('radio', { name: /SERIOUS/ }),
  },
  {
    name: 'Segmented (ovalt alternativ)',
    open: async (p) => {
      await p.getByTestId('tab-company').click()
    },
    locator: (p) => p.getByRole('radio', { name: 'REPAY' }),
  },
]

test.describe('skrivbord: hovring ändrar utseendet (regel 3)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const target of TARGETS) {
    test(target.name, async ({ page }) => {
      await enterGame(page)
      if (target.open) await target.open(page)
      const element = target.locator(page)
      await element.first().scrollIntoViewIfNeeded()
      const idle = await look(element.first())
      await element.first().hover()
      const hovered = await look(element.first())
      expect(hovered, `${target.name}: samma utseende vid hovring som i vila`).not.toBe(idle)
    })
  }
})

test.describe('pekskärm: hovring lämnar inget kvar (regel 13)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('hovertillstånden är avstängda när enheten inte kan hovra', async ({ page }) => {
    await enterGame(page)
    // Förutsättningen: den emulerade telefonen svarar att den inte kan hovra.
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)

    for (const target of TARGETS.filter((t) => !t.open)) {
      const element = target.locator(page).first()
      const idle = await look(element)
      await element.hover({ force: true })
      expect(await look(element), `${target.name}: fastnade i hovertillstånd på en pekskärm`).toBe(idle)
    }
  })
})
