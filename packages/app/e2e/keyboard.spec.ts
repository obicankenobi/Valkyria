// keyboard.spec.ts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 16 och "skrivbords-
// layouten genomgången med hovring och tangentbord"). Regel 16: "Kortkommandon
// (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus." Bara Esc
// fanns; 1–5 och Enter byggdes i P94. Här bevisas de i en riktig webbläsare, plus
// det som gör tangentbordet användbart på riktigt: att kartans markörer går att
// nå och att fokus syns.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

async function enterGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
}

const TURN = '.ds-hud-cell-date .ds-hud-label'

const TABS = ['operations', 'contracts', 'company', 'contacts', 'news'] as const

async function expectActiveTab(page: Page, view: (typeof TABS)[number]): Promise<void> {
  for (const tab of TABS) {
    const locator = page.getByTestId(`tab-${tab}`)
    if (tab === view) await expect(locator).toHaveAttribute('aria-current', 'page')
    else await expect(locator).not.toHaveAttribute('aria-current', 'page')
  }
}

test('1–5 byter skärm i flikordning, och tillbaka', async ({ page }) => {
  await enterGame(page)
  await expectActiveTab(page, 'operations')

  await page.keyboard.press('2')
  await expectActiveTab(page, 'contracts')
  await page.keyboard.press('3')
  await expectActiveTab(page, 'company')
  await page.keyboard.press('4')
  await expectActiveTab(page, 'contacts')
  await page.keyboard.press('5')
  await expectActiveTab(page, 'news')
  await page.keyboard.press('1')
  await expectActiveTab(page, 'operations')
})

test('Enter avslutar kvartalet — HUD-turen går fram ett steg', async ({ page }) => {
  await enterGame(page)
  await expect(page.locator(TURN)).toHaveText('Turn 0')

  await page.keyboard.press('Enter')
  // Med reducerad rörelse (emulerad ovan) gör uppspelningen sig själv omedelbar,
  // så det som märks är att kvartalet gått: HUD-turen.
  await expect(page.locator(TURN)).toHaveText('Turn 1')
})

test('Enter på en fokuserad knapp är knappens egen: flikbyte, inte ett avslutat kvartal', async ({ page }) => {
  await enterGame(page)
  await page.getByTestId('tab-contracts').focus()
  await page.keyboard.press('Enter')

  await expectActiveTab(page, 'contracts')
  await page.waitForTimeout(400)
  await expect(page.locator(TURN)).toHaveText('Turn 0')
})

test('en hållen Enter avslutar bara ett kvartal', async ({ page }) => {
  await enterGame(page)
  await page.keyboard.down('Enter')
  await page.keyboard.down('Enter') // auto-repeat: event.repeat = true
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  await expect(page.locator(TURN)).toHaveText('Turn 1')
  // ...och förblir 1: de upprepade tryckningarna avslutade inga fler kvartal.
  await page.waitForTimeout(600)
  await expect(page.locator(TURN)).toHaveText('Turn 1')
})

test('ett öppet pausöverlagg blockerar kortkommandona, Esc stänger det igen', async ({ page }) => {
  await enterGame(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-overlay')).toBeVisible()

  await page.keyboard.press('3')
  await expectActiveTab(page, 'operations')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await expect(page.locator(TURN)).toHaveText('Turn 0')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0)
  await page.keyboard.press('3')
  await expectActiveTab(page, 'company')
})

test('kortkommandon fungerar inte på huvudmenyn (ingen flikrad, inget kvartal att avsluta)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-new-game').waitFor()
  await page.keyboard.press('3')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('menu-new-game')).toBeVisible()
  await expect(page.getByTestId('tabbar')).toHaveCount(0)
})

test('kartans huvudstadsmarkör nås med tangentbordet och öppnar landsakten med Enter och mellanslag', async ({
  page,
}) => {
  await enterGame(page)
  const marker = page.getByTestId('map-capital-rvn').locator('.map-capital-marker')

  await marker.focus()
  await expect(marker).toBeFocused()
  await page.keyboard.press('Enter')
  // P165: markören väljer landet och visar dess kort; landsakten öppnas med kortets knapp.
  await expect(page.getByTestId('map-info-title')).toHaveText('Republic of Vietnam')
  await page.getByTestId('map-info-open-file').click()
  await expect(page.getByTestId('country-file')).toBeVisible()

  // Stäng arket och prova mellanslag på den andra markören.
  await page.locator('[data-testid="country-file"] .ds-sheet-close').click()
  await expect(page.getByTestId('country-file')).toHaveCount(0)
  const laos = page.getByTestId('map-capital-laos').locator('.map-capital-marker')
  await laos.focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('map-info-title')).toHaveText('Kingdom of Laos')
  await page.getByTestId('map-info-open-file').click()
  await expect(page.getByTestId('country-file')).toBeVisible()
})

test('fokus syns: en solid 3 px-ring på fliken, HUD-knappen och kartmarkören vid tangentbordsfokus', async ({ page }) => {
  await enterGame(page)
  // Ett tangenttryck först — :focus-visible matchar programmatisk fokus bara när
  // den senaste interaktionen var från tangentbordet.
  await page.keyboard.press('Tab')

  const outline = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      ;(element as HTMLElement | SVGElement).focus()
      const style = getComputedStyle(element)
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
    })

  for (const selector of ['[data-testid="tab-contracts"]', '[data-testid="hud-menu-button"]', '[data-testid="map-capital-rvn"] .map-capital-marker']) {
    const result = await outline(selector)
    expect(result.style, selector).toBe('solid')
    expect(result.width, selector).toBe('3px')
  }

  // Ockra ring på HUD:ens mörka stål, blå på ljusa ytor — annars syns den inte.
  const onHud = await outline('[data-testid="hud-menu-button"]')
  const onPaper = await outline('[data-testid="tab-contracts"]')
  expect(onHud.color).not.toBe(onPaper.color)
})
