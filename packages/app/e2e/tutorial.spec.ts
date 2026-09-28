// tutorial.spec.ts — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20). Klart-när
// (ordagrant): "de tre första kvartalen i ett nytt parti leds steg för
// steg (välj land, lägg ett bud, fyll en handlingsplats, avsluta
// kvartalet, läs förstasidan). Den går att stänga av och att starta om
// från menyn." En riktig genomspelning av alla fem steg, inte bara att
// banderollen SYNS — samma disciplin som operations-intel.spec.ts.
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

function parseMoney(text: string): number {
  return Number(text.replace(/[£,−-]/g, '').trim())
}

async function setPriceSlider(page: Page, scope: Locator, testId: string, targetValue: number): Promise<void> {
  const slider = scope.locator(`[data-testid="${testId}"] [role="slider"]`)
  const min = Number(await slider.getAttribute('aria-valuemin'))
  const max = Number(await slider.getAttribute('aria-valuemax'))
  const clamped = Math.min(max, Math.max(min, targetValue))
  const ratio = max > min ? (clamped - min) / (max - min) : 0
  const track = scope.locator(`[data-testid="${testId}"] .ds-slider-track`)
  const box = await track.boundingBox()
  if (!box) throw new Error(`reglaget ${testId} hittades inte`)
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2)
}

// Samma indexedDB.deleteDatabase-teknik som operations-intel.spec.ts:s
// startFreshGame — ett genuint FÖRSTA nytt parti krävs (tutorialSeen måste
// vara "aldrig satt") för att handledningen ens ska autostarta.
async function startGenuinelyFreshGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('menu-new-game').waitFor()
  await page.waitForTimeout(300)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('seventh-front')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'THE SEVENTH FRONT' })).toBeVisible()
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await expect(page.getByTestId('hud')).toBeVisible()
}

test('handledningen leder alla fem steg och avslutas av sig själv (P91a klart-när)', async ({ page }) => {
  await startGenuinelyFreshGame(page)

  await expect(page.getByTestId('tutorial-banner')).toBeVisible()
  await expect(page.getByTestId('tutorial-prompt')).toHaveText(/capital/i)

  // GENUINT FYND: CONTRACTS är TOMT vid partistart (state.ts:s
  // market.openOrders: []) — orders.ts genererar ordrar först under
  // resolveTurn. §9:s ordning ("välj land, lägg ett bud, fyll en
  // handlingsplats, avsluta kvartalet") går alltså INTE att följa
  // bokstavligt före första kvartalets slut: det finns inget att bjuda på
  // förrän en tur redan avgjorts. tutorial.ts:s steg är avsiktligt inte
  // hårt grindade i ordning (se filens egen kommentar) av precis den här
  // anledningen — testet följer den ordning spelet FAKTISKT tillåter,
  // inte specens bokstav.

  // Steg 1 + 3 i ett svep: RVN:s huvudstad öppnar landfilen (steg 1) och en
  // köad handling fyller en handlingsplats (steg 3). Panelen visar alltid
  // det TIDIGASTE ofärdiga steget (tutorial.ts:s egen princip) — "place-bid"
  // ligger tidigare i TUTORIAL_STEPS än "fill-action-slot", så den prompten
  // syns fortfarande här trots att steg 3 redan är klart.
  await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
  await page.getByTestId('country-file').waitFor()
  await page.getByTestId('cf-verb-EXPAND').click()
  await page.getByTestId('country-file').waitFor({ state: 'hidden' })
  await expect(page.getByTestId('tutorial-prompt')).toHaveText(/bid/i)

  // Steg 4: avsluta kvartalet — inte grindat av att steg 2 ännu är ofärdigt
  // (tutorial.ts:s ordning är en vägledning, aldrig en spärr). Genererar
  // samtidigt turens första ordrar.
  await page.getByTestId('end-quarter-button').click()

  // Steg 5 (läs förstasidan) är automatiskt — NEWS DESK är standardvyn efter
  // en tur (§8). Bara steg 2 (lägg ett bud) återstår nu.
  await expect(page.getByTestId('tab-news')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('tutorial-prompt')).toHaveText(/bid/i)

  // Steg 2: lägg ett bud på en av kvartal 1:s nya ordrar.
  await page.getByTestId('tab-contracts').click()
  const folder = page.getByTestId('order-folder').first()
  await folder.getByRole('button', { name: 'quote' }).click()
  const quantity = Number((await folder.getByTestId('order-quantity').innerText()).replace('×', '').trim())
  const unitCost = parseMoney(await folder.getByTestId('your-unit-cost').innerText())
  await setPriceSlider(page, folder, 'bid-price', Math.round(unitCost * quantity * 1.5))
  await folder.getByRole('button', { name: /Place Bid/ }).click()

  // Alla fem steg klara — handledningen är borta.
  await expect(page.getByTestId('tutorial-banner')).toBeHidden()
})

test('Dismiss stänger av handledningen för resten av partiet, och Restart Tutorial i Settings startar om den (P91a klart-när)', async ({
  page,
}) => {
  await startGenuinelyFreshGame(page)
  await expect(page.getByTestId('tutorial-banner')).toBeVisible()

  await page.getByTestId('tutorial-dismiss').click()
  await expect(page.getByTestId('tutorial-banner')).toBeHidden()

  // Överlever ett tabbyte — inte bara ett lokalt state i den skärm den
  // stängdes från.
  await page.getByTestId('tab-contracts').click()
  await expect(page.getByTestId('tutorial-banner')).toBeHidden()
  await page.getByTestId('tab-operations').click()

  await page.getByTestId('hud-menu-button').click()
  await page.getByTestId('pause-settings').click()
  await page.getByTestId('settings-restart-tutorial').click()
  await page.getByTestId('settings-close').click()
  await page.getByTestId('pause-resume').click()

  await expect(page.getByTestId('tutorial-banner')).toBeVisible()
  await expect(page.getByTestId('tutorial-prompt')).toHaveText(/capital/i)
})
