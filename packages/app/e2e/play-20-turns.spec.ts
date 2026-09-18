// P11 klart-när (ETAPP1_TEKNISK_SPEC.md avsnitt 10): "du kan spela 20 turer i
// webbläsaren utan att öppna konsolen" — verifierat här som "inga console.error
// eller ofångade sidfel under 20 turer", i en riktig (headless) webbläsare mot
// den faktiskt byggda bunten, inte en jsdom-simulering.
//
// P21 klart-när (ETAPP1_5_TEKNISK_SPEC.md avsnitt 14): samma spelgenomgång
// utökad med (1) minst en executive action per tur och (2) minst en hanterad
// kris. En kris kräver att doomsday korsar doomsdayCrisisEventThreshold (75)
// inom 20 turer — ett sannolikhetsstyrt spelförlopp, inte något testet kan
// beordra fram direkt. Så här hålls det pålitligt i stället för flackigt:
//
//   - STAGE_INCIDENT mot Republic of Vietnam (alignment 70, blockgränsande per
//     indochina-slice.json) är den enda handling i spelet som höjer doomsday
//     UTAN att vara en direkt spelarvald krisrespons — 65 % lyckandechans,
//     +12..20 doomsday vid lyckande. Testet tar den varje tur DEN ÄR SÄKER: en
//     ADAPTIV regel spårar vilka turer den faktiskt misslyckades (läses direkt
//     ur wire-telexet för den turen, inte gissat) och pausar till BRIBE
//     (spend 0, riskfri) så fort två misslyckanden ligger inom de senaste sex
//     turerna — exposureEventsForEnding (3) inom exposureWindowTurns (6) kan
//     då aldrig nås av testets EGNA handlingar. En första, naiv version (fast
//     varannan-tur-kadens utan att faktiskt läsa av utfallet) gav EXPOSURE
//     innan krisen hann flaggas i en påtaglig andel körningar — se
//     docs/ANDRINGSLOGG.md för den fulla utredningen.
//   - En flaggad kris löses alltid med SELL_THE_FILE — det enda av de tre
//     utfallen som inte bränner en station (BACK_DOWN gör det ovillkorligt),
//     så det lägger inte sten på börda mot ett redan ansträngt exponeringsläge.
//   - Bud sätts till yourUnitCost × quantity × 1.3 (samma tal UI:t redan
//     visar, ingen egen balanssiffra upprepas här) — en garanterad, om än
//     blygsam, marginal på varje VUNNET kontrakt, i stället för ett fast pris
//     som lika gärna kan vara en ren förlustaffär på en stor order.
//   - Ett lån tas upp till hela creditLimit så fort treasury faller under en
//     säkerhetsmarginal — annars är INSOLVENCY (ingen av de tre sakerna ovan
//     hindrar fasta kostnader från att tära långsamt) nästan lika trolig som
//     en kris inom 20 turer.
//
// Även med allt detta är enskilda 20-turersparti fortfarande sannolikhetsstyrda
// (empiriskt runt 90-95 % av körningarna hann en kris inom 20 turer i sig
// själva) — testet spelar därför om från ett helt nytt parti (rensad
// IndexedDB, nytt frö) upp till fem gånger om inte en kris hunnit dyka upp,
// i stället för att acceptera en flackig enstaka-försök-design.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function parseMoney(text: string): number {
  return Number(text.replace(/[£,−-]/g, '').trim())
}

async function startFreshGame(page: Page): Promise<void> {
  // P65 (ETAPP6_TEKNISK_SPEC.md §3) avslöjade en race som förut var osynlig:
  // en `page.goto('/')` monterar appen, vars EGEN hydrering (useGame.ts +
  // App.tsx:s hasSavedGame-koll) genast öppnar (och därmed, om den inte finns,
  // SKAPAR) IndexedDB-databasen asynkront. Raderar man INNAN de effekterna
  // hunnit klart kan appens egen, redan pågående öppning hinna återskapa
  // databasen EFTER att raderingen lyckats — utan meny fanns inget steg som
  // avslöjade det (hasSave var aldrig frågat). Fixat genom att vänta in att
  // menyn (och därmed appens hydrering) faktiskt renderat FÖRST, sedan radera,
  // sedan ladda om — aldrig radera samtidigt som appen fortfarande öppnar.
  await page.goto('/')
  await page.getByTestId('menu-continue').waitFor()
  await page.waitForTimeout(300)
  // indexedDB.deleteDatabase är händelsestyrd, inte löftesbaserad — utan att
  // vänta in onsuccess/onerror återvänder page.evaluate innan raderingen
  // faktiskt skett.
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

  // P65 (ETAPP6_TEKNISK_SPEC.md §3): appen startar på huvudmenyn. Databasen
  // just raderad ovan — inget sparat parti, "New Game" går rakt in.
  await page.getByTestId('menu-new-game').click()
  await expect(page.getByTestId('hud')).toBeVisible()
}

// Spelar upp till 20 turer. Returnerar true så fort en kris flaggats OCH lösts.
async function playUntilCrisisOrTurnLimit(page: Page): Promise<boolean> {
  let crisisHandled = false
  const failureTurns: number[] = []

  for (let turn = 0; turn < 20; turn++) {
    const crisisModal = page.getByTestId('crisis-modal')
    if (await crisisModal.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /SELL THE FILE/ }).click()
      crisisHandled = true
    }

    const endTurnButton = page.getByRole('button', { name: /End Turn/ })
    if (await endTurnButton.isDisabled()) break // partiet redan slut (en ending inträffade)

    // Bjud på varje öppen order till ett pris som garanterar en marginal.
    await page.getByRole('button', { name: /THE FLOOR/ }).click()
    let quoteCount = await page.getByRole('button', { name: 'quote' }).count()
    while (quoteCount > 0) {
      await page.getByRole('button', { name: 'quote' }).first().click()
      const quantity = Number((await page.getByTestId('order-quantity').first().innerText()).replace('×', '').trim())
      const unitCost = parseMoney(await page.getByTestId('your-unit-cost').first().innerText())
      await page
        .getByLabel('Price')
        .first()
        .fill(String(Math.round(unitCost * quantity * 1.5)))
      await page
        .getByRole('button', { name: /Place Bid/ })
        .first()
        .click()
      quoteCount = await page.getByRole('button', { name: 'quote' }).count()
    }

    await page.getByRole('button', { name: /THE HOUSE/ }).click()

    // Säkerhetslån — håll partiet likvitt så INSOLVENCY inte hinner före krisen.
    const treasury = parseMoney(await page.getByTestId('hud-treasury').innerText())
    const creditLimit = parseMoney(await page.getByTestId('credit-limit').innerText())
    if (treasury < 6000000 && creditLimit > 0) {
      await page.getByLabel('Loan amount').fill(String(creditLimit))
      await page.getByRole('button', { name: 'Take Loan' }).click()
    }

    // Minst en executive action per tur (P21 klart-när) — se filhuvudets
    // motivering för den adaptiva STAGE_INCIDENT/BRIBE-regeln.
    const recentFailures = failureTurns.filter((t) => t > turn - 6).length
    const useStageIncident = recentFailures < 2

    const targetSelect = page.locator('.action-form').nth(1).locator('select').first()
    await targetSelect.selectOption({ label: 'Republic of Vietnam' }).catch(() => {})
    if (useStageIncident) {
      await page.getByRole('button', { name: 'Stage Incident' }).click()
    } else {
      await page.getByRole('button', { name: 'Bribe' }).click()
    }

    await endTurnButton.click()

    if (useStageIncident) {
      const stamp = `T${String(turn).padStart(2, '0')}`
      const failed = await page
        .locator('.wire-item', { hasText: stamp })
        .filter({ hasText: 'ATTRIBUTION FAILED' })
        .count()
      if (failed > 0) failureTurns.push(turn)
    }
  }

  return crisisHandled
}

test('spela 20 turer utan konsolfel, med executive actions varje tur och minst en hanterad kris', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  let crisisHandled = false
  for (let attempt = 0; attempt < 5 && !crisisHandled; attempt++) {
    await startFreshGame(page)
    crisisHandled = await playUntilCrisisOrTurnLimit(page)
  }

  expect(crisisHandled).toBe(true)
  expect(errors).toEqual([])
})
