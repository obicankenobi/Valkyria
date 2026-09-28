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
import type { Locator, Page } from '@playwright/test'

function parseMoney(text: string): number {
  return Number(text.replace(/[£,−-]/g, '').trim())
}

// P84 (ETAPP7_TEKNISK_SPEC.md §7.5, regel 2): priset är nu DsSlider, inte ett
// <input type="number"> — Playwrights .fill() kräver ett riktigt input/
// textarea/[contenteditable] och kastar på en div[role="slider"]. Sätter
// reglaget genom att klicka på spåret vid den position DsSlider:s egen
// handlePointer räknar ut ratio från (samma formel, se designSystem.tsx),
// exakt den interaktion en riktig spelare har på skrivbord/pekskärm.
//
// Genuint fynd (P84): orderns mapp stängs aldrig efter ett lagt bud (samma
// beteende som den gamla OrderRow redan hade) — flera mappar kan alltså stå
// öppna samtidigt när fler än en order finns samma tur. Ett `.first()`-sökt
// reglage över HELA sidan siktar då kvar på den FÖRSTA (äldsta) mappen, som
// kan ha skrollat utanför synligt läge (negativt y) när en senare mapp
// öppnades — ett klick på de koordinaterna kan träffa vad som helst,
// inklusive HUD:ens expanderingsknapp (observerat: ett sådant felträff
// öppnade HUD:en och dubblerade credit-limit-testid:t, se ANDRINGSLOGG.md).
// Root scoperas därför till precis DEN mapp som just öppnades, aldrig sidan.
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

async function startFreshGame(page: Page): Promise<void> {
  // P70 (ETAPP6_TEKNISK_SPEC.md §5): THE WIRE avslöjar nu händelser en i
  // taget med en kort fördröjning, avstängt vid prefers-reduced-motion — och
  // testet nedan läser `.wire-item` direkt efter endTurnButton.click() utan
  // att vänta in animationen. reducedMotion: 'reduce' gör att ALLA händelser
  // renderas synkront (exakt den gren komponenten själv har för det), så
  // kontrollen förblir deterministisk i stället för att racea mot en timer.
  await page.emulateMedia({ reducedMotion: 'reduce' })
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
  // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
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

    const endTurnButton = page.getByTestId('end-quarter-button')
    if (await endTurnButton.isDisabled()) break // partiet redan slut (en ending inträffade)

    // Bjud på varje öppen order till ett pris som garanterar en marginal.
    // Mappen stängs aldrig efter ett lagt bud (§7.5) — flera kan alltså stå
    // öppna samma tur. Varje mapp scopeas till EN specifik `[data-testid=
    // "order-folder"]`, aldrig till sidan i stort — se setPriceSlider:s egen
    // kommentar för det ursprungliga fyndet.
    //
    // GENUINT FYND (P84, andra rundan): en `.filter({ has: quote-knappen })`
    // -baserad locator är INTE en stabil referens till "mappen jag just
    // öppnade" — Playwright-lokatorer är lata och körs om vid VARJE nytt
    // anrop. Så fort quote-knappen klickats visar just DEN mappen "close" i
    // stället, filtret slutar matcha DEN mappen och `.first()` glider tyst
    // vidare till NÄSTA mapp som fortfarande har en quote-knapp (om någon
    // order till finns samma tur) — kvantiteten lästes då av en helt annan
    // mapp än den vars formulär faktiskt öppnades, vars `your-unit-cost`
    // aldrig fanns (formuläret var aldrig öppnat) och testet hängde tills
    // timeouten slog till. Löst med ett stabilt INDEX (`.nth(i)`) i stället
    // — mappar varken tas bort eller byter ordning under en tur, så index i
    // förblir samma mapp genom hela varvet.
    await page.getByTestId('tab-contracts').click()
    const folderCount = await page.getByTestId('order-folder').count()
    for (let i = 0; i < folderCount; i++) {
      const folder = page.getByTestId('order-folder').nth(i)
      const quoteButton = folder.getByRole('button', { name: 'quote' })
      if ((await quoteButton.count()) === 0) continue // redan bjudet (t.ex. en tidigare tur)
      await quoteButton.click()
      const quantity = Number((await folder.getByTestId('order-quantity').innerText()).replace('×', '').trim())
      const unitCost = parseMoney(await folder.getByTestId('your-unit-cost').innerText())
      await setPriceSlider(page, folder, 'bid-price', Math.round(unitCost * quantity * 1.5))
      await folder.getByRole('button', { name: /Place Bid/ }).click()
    }

    await page.getByTestId('tab-company').click()

    // Säkerhetslån — håll partiet likvitt så INSOLVENCY inte hinner före krisen.
    // P85 (ETAPP7_TEKNISK_SPEC.md §13, regel 2): "Loan amount" är nu en
    // TierPicker (LoanRepaySection, CompanyActions.tsx), inte ett
    // <input type="number"> — LAVISH-nivån är exakt 100 % av creditLimit
    // (TIER_FRACTIONS.lavish === 1), samma belopp testet tidigare fyllde in.
    const treasury = parseMoney(await page.getByTestId('hud-treasury').innerText())
    const creditLimit = parseMoney(await page.getByTestId('credit-limit').innerText())
    if (treasury < 6000000 && creditLimit > 0) {
      await page.locator('[data-testid="company-credit-tier"]').getByRole('radio', { name: 'LAVISH' }).click()
      await page.getByRole('button', { name: /Take Loan/ }).click()
    }

    // Minst en executive action per tur (P21 klart-när) — se filhuvudets
    // motivering för den adaptiva STAGE_INCIDENT/BRIBE-regeln.
    const recentFailures = failureTurns.filter((t) => t > turn - 6).length
    const useStageIncident = recentFailures < 2

    // P86: POLITICAL-formuläret flyttade till CONTACTS (ThePolitics.tsx) —
    // STAGE_INCIDENT är en faktionshandling (targetFactionId "rvn" direkt,
    // ingen väljare längre); BRIBE riktas mot RVN:s FÖRSTA tjänsteman (vilken
    // post spelar ingen roll för det här testets syfte, "minst en executive
    // action per tur" — id-prefixet `official-rvn-` räcker för att hålla
    // målet inom Republic of Vietnam, samma faktion filhuvudets STAGE_
    // INCIDENT-motivering redan bygger på). Bägge formulären öppnar på
    // MODEST-nivån som standard — ett spend-belopp som INTE påverkar
    // STAGE_INCIDENT:s 65 %-chans eller doomsday-intervallet (se
    // ThePolitics.tsx:s huvudkommentar), så testets adaptiva
    // misslyckande-spårning nedan förblir giltig oförändrad.
    await page.getByTestId('tab-contacts').click()
    if (useStageIncident) {
      await page.getByTestId('contacts-verb-STAGE_INCIDENT-rvn').click()
      await page.getByTestId('contacts-STAGE_INCIDENT-file-rvn').click()
    } else {
      await page.locator('[data-testid^="contacts-verb-BRIBE-official-rvn-"]').first().click()
      await page.locator('[data-testid^="contacts-BRIBE-file-official-rvn-"]').first().click()
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
