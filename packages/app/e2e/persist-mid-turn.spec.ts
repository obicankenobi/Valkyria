// P12 klart-när (ETAPP1_TEKNISK_SPEC.md avsnitt 10): "ett parti kan stängas
// och återupptas mitt i en tur utan förlust." Verifierat i en riktig
// (headless) webbläsare: spela fram till en order finns, LÄGG ett bud (utan
// att avsluta turen — "mitt i en tur" betyder att turen fortfarande pågår,
// inte att ett oskickat formulär ska överleva keystroke för keystroke), ladda
// om sidan, och kontrollera att både partiets tillstånd och det lagda-men-
// oskickade budet i draften överlevde IndexedDB-tur-och-retur.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// P84 (ETAPP7_TEKNISK_SPEC.md §7.5, regel 2): pris och muta är nu DsSlider,
// inte <input type="number"> — Playwrights .fill()/.toHaveValue() gäller bara
// riktiga input-element. Sätter reglaget genom att klicka på spåret (samma
// formel som DsSlider:s egen handlePointer, se designSystem.tsx) och läser
// tillbaka det FAKTISKT landade värdet ur aria-valuenow — turen-och-retur-
// testet jämför alltså "vad reglaget visade före" mot "vad det visar efter",
// inte mot ett förutbestämt tal som kanske inte går att landa exakt på.
async function setSlider(page: Page, testId: string, targetValue: number): Promise<number> {
  const slider = page.locator(`[data-testid="${testId}"] [role="slider"]`).first()
  const min = Number(await slider.getAttribute('aria-valuemin'))
  const max = Number(await slider.getAttribute('aria-valuemax'))
  const clamped = Math.min(max, Math.max(min, targetValue))
  const ratio = max > min ? (clamped - min) / (max - min) : 0
  const track = page.locator(`[data-testid="${testId}"] .ds-slider-track`).first()
  const box = await track.boundingBox()
  if (!box) throw new Error(`reglaget ${testId} hittades inte`)
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2)
  return Number(await slider.getAttribute('aria-valuenow'))
}

async function readSlider(page: Page, testId: string): Promise<number> {
  return Number(await page.locator(`[data-testid="${testId}"] [role="slider"]`).first().getAttribute('aria-valuenow'))
}

test('ett parti kan stängas och återupptas mitt i en tur utan förlust', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'THE SEVENTH FRONT' })).toBeVisible()

  // P65 (ETAPP6_TEKNISK_SPEC.md §3): appen startar nu på huvudmenyn, inte
  // spelet direkt. Inget sparat parti finns i en färsk browserkontext, så
  // "New Game" går rakt in — ingen bekräftelsedialog att klicka igenom.
  await page.getByTestId('menu-new-game').click()
  await expect(page.getByTestId('hud')).toBeVisible()

  // Spela fram tills en order faktiskt finns att bjuda på (ordergenerering är
  // sannolikhetsbaserad per faktion och tur) — högst 10 turer, annars är
  // scenariot fel konfigurerat.
  let hasOrder = false
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('tab-contracts').click()
    hasOrder = (await page.getByRole('button', { name: 'quote' }).count()) > 0
    if (hasOrder) break
    await page.getByTestId('end-quarter-button').click()
  }
  expect(hasOrder).toBe(true)

  const headerBefore = await page.getByTestId('datestamp').textContent()

  // Mitt i en tur: lägg ett bud (skickar det till draften), men avsluta ALDRIG
  // turen — resolveTurn har alltså inte körts, precis som "mitt i en tur" kräver.
  await page.getByRole('button', { name: 'quote' }).first().click()
  const setPrice = await setSlider(page, 'bid-price', 1_234_567)
  const setBribe = await setSlider(page, 'bid-bribe', 999)
  await page
    .getByRole('button', { name: /Place Bid/ })
    .first()
    .click()

  // Ge den async IndexedDB-autosparningen tid att hinna skriva klart innan
  // sidan laddas om.
  await page.waitForTimeout(500)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'THE SEVENTH FRONT' })).toBeVisible()

  // Ett sparat parti finns nu (autosparat) — menyn visas igen (P65), men med
  // "Continue" aktiverad den här gången. Samma parti, inte ett nytt.
  await expect(page.getByTestId('menu-continue')).toBeEnabled()
  await page.getByTestId('menu-continue').click()
  await expect(page.getByTestId('hud')).toBeVisible()

  // Partiets tillstånd (tur, kassa, doomsday — headerraden) är oförändrat.
  const headerAfter = await page.getByTestId('datestamp').textContent()
  expect(headerAfter).toBe(headerBefore)

  // Det ospardade budutkastet finns kvar: samma order visar "Update Bid"
  // (inte "Place Bid"), med samma pris och muta som reglagen landade på före
  // omladdningen.
  await page.getByTestId('tab-contracts').click()
  await page.getByRole('button', { name: 'quote' }).first().click()
  expect(await readSlider(page, 'bid-price')).toBe(setPrice)
  expect(await readSlider(page, 'bid-bribe')).toBe(setBribe)
  await expect(page.getByRole('button', { name: /Update Bid/ })).toBeVisible()
})
