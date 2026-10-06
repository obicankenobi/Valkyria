// operations-intel.spec.ts — P79 (ETAPP7_TEKNISK_SPEC.md §13), klart-när
// ordagrant: "alla sex underrättelseverb går att köa från kartan och avgörs
// korrekt i en e2e-tur." house.actionPoints (3 vid partistart, se
// House.actionPoints:s egen kommentar) räcker inte till alla sex samma tur —
// testet köar tre, avslutar kvartalet, köar de tre återstående, avslutar
// igen, och kontrollerar att INGEN av de sex avvisades (rejected-banner)
// någon av de två gångerna. RVN (har en station vid partistart, Saigon) ger
// EXPAND/WITHDRAW/LEAK/SABOTAGE/TURN; Laos (ingen station) ger RECRUIT.
//
// Ordningen mellan de två kvartalen är MEDVETEN: WITHDRAW sätter Saigons
// station till 'dormant' när turen AVGÖRS (inte när den köas — draften
// muterar aldrig `state` innan resolveTurn körs, så COUNTRY FILE fortsätter
// visa COVERT-sektionen ända till dess). WITHDRAW läggs därför i det ANDRA
// kvartalet, tillsammans med de andra verb som fortfarande behöver en AKTIV
// station för att knappen ens ska synas i landets bottenark.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function startFreshGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('menu-continue').waitFor()
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
  // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await expect(page.getByTestId('hud')).toBeVisible()
}

// Öppnar RVN:s bottenark via HUVUDSTADSMARKÖREN, inte landmassan: en
// concav kustlinje (t.ex. Sydvietnams) kan ha sin geometriska boundingbox-
// mittpunkt i en bukt där ett angränsande land (Kambodja), ritat SENARE i
// SVG-paint-ordningen, faktiskt ligger överst — Playwright klickar mitten av
// boundingboxen och missade då landmassan helt (genuint fynd, hittat av
// testet självt: "map-country-cambodia intercepts pointer events"). Den lilla,
// isolerade huvudstadscirkeln har ingen sådan risk — samma tapp-mål kartan
// själv erbjuder (§7.1), bara mer robust i ett automatiserat test.
async function queueRvnVerb(page: Page, verb: 'EXPAND' | 'WITHDRAW' | 'LEAK' | 'SABOTAGE' | 'TURN'): Promise<void> {
  await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
  await page.getByTestId('map-info-card').waitFor() // P165: kortet först
  await page.getByTestId('map-info-open-file').click()
  await page.getByTestId('country-file').waitFor()
  await page.getByTestId(`cf-verb-${verb}`).click()
  if (verb === 'EXPAND' || verb === 'WITHDRAW') {
    // P163: EXPAND/WITHDRAW går via handlingskortet och köas med FILE.
    await page.getByTestId(`action-card-${verb}`).waitFor()
    await page.getByTestId(`cf-file-${verb}`).click()
  }
  if (verb === 'LEAK' || verb === 'SABOTAGE' || verb === 'TURN') {
    await page.getByTestId(`cf-target-picker-${verb}`).waitFor()
    await page.locator('[data-testid^="cf-target-"]:not([data-testid^="cf-target-picker"])').first().click()
  }
  await page.getByTestId('country-file').waitFor({ state: 'hidden' })
}

async function queueLaosRecruit(page: Page): Promise<void> {
  await page.getByTestId('map-capital-laos').locator('.map-capital-marker').click()
  await page.getByTestId('map-info-card').waitFor() // P165: kortet först
  await page.getByTestId('map-info-open-file').click()
  await page.getByTestId('country-file').waitFor()
  await page.getByTestId('cf-verb-RECRUIT').click()
  await page.getByTestId('action-card-RECRUIT').waitFor() // P163: kortet först, FILE sedan
  await page.getByTestId('cf-file-RECRUIT').click()
  await page.getByTestId('country-file').waitFor({ state: 'hidden' })
}

test('alla sex underrättelseverb går att köa från kartan och avgörs korrekt (P79 klart-när)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await startFreshGame(page)

  // Kvartal 1: verb som inte ändrar stationens status.
  await queueRvnVerb(page, 'EXPAND')
  await expect(page.getByTestId('action-slot-0')).toContainText('EXPAND')
  await queueRvnVerb(page, 'LEAK')
  await expect(page.getByTestId('action-slot-1')).toContainText('LEAK')
  await queueRvnVerb(page, 'SABOTAGE')
  await expect(page.getByTestId('action-slot-2')).toContainText('SABOTAGE')

  await page.getByTestId('end-quarter-button').click()
  await page.getByTestId('tab-operations').click()
  await expect(page.getByTestId('rejected-banner')).toHaveCount(0)

  // Kvartal 2: TURN och RECRUIT behöver ingen särskild ordning; WITHDRAW
  // läggs sist eftersom det är det enda av de tre som (vid avgörandet,
  // inte vid köningen) gör Saigon inaktiv.
  await queueRvnVerb(page, 'TURN')
  await expect(page.getByTestId('action-slot-0')).toContainText('TURN')
  await queueLaosRecruit(page)
  await expect(page.getByTestId('action-slot-1')).toContainText('RECRUIT')
  await queueRvnVerb(page, 'WITHDRAW')
  await expect(page.getByTestId('action-slot-2')).toContainText('WITHDRAW')

  await page.getByTestId('end-quarter-button').click()
  await page.getByTestId('tab-operations').click()
  await expect(page.getByTestId('rejected-banner')).toHaveCount(0)

  expect(errors).toEqual([])
})
