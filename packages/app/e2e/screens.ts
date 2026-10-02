// screens.ts — delad skärmlista för de e2e-test som går igenom VARJE skärm i båda
// formaten: text-overflow.spec.ts (regel 11 och 18) och accessibility.spec.ts
// (axe, P94). Flyttad hit ur text-overflow.spec.ts i P94 så att en ny skärm bara
// behöver läggas till på ett ställe och automatiskt får båda kontrollerna.
// Varje Playwright-test får en egen, tom browserkontext, så `setup` klickar
// igenom "New Game" utan att någonsin möta bekräftelsedialogen för att skriva
// över ett sparat parti.
import type { Page } from '@playwright/test'

export const FORMATS: { name: string; width: number; height: number }[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

export async function enterOperations(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
}

// P88: New Game/Briefing — five options in one Segmented row already clipped
// a full-word specialisation label at phone width once (caught visually in
// npm run shots, fixed by reusing CompanyActions.tsx's short codes). Regel
// 18/11 coverage catches a regression mechanically from now on.
export async function enterNewGame(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('new-game-screen').waitFor()
}

export async function enterBriefing(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-name-Ashford & Vale').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-screen').waitFor()
}

// P86: CONTACTS — personakter med politikverben, faktionsverben (STAGE_
// INCIDENT/BACK_CHANNEL/FUND_COUP/BROKER) och rivalhusens akter, den
// textmässigt tätaste skärmen etapp 7 hittills byggt.
export async function enterContacts(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  await page.getByTestId('tab-contacts').click()
  await page.getByTestId('contacts-verb-BROKER-rvn').waitFor()
}

// P87: krisens helskärmskort (§7.6) — sannolikhetsstyrd i ett riktigt parti
// (samma skäl play-20-turns.spec.ts har en adaptiv väntloop), så samma
// IndexedDB-injektion som scripts/shots.mjs:s "crisis"-skärm används här:
// skriv pendingCrisis direkt in i den redan autosparade "save:default"-
// posten (persistence.ts) och ladda om, i stället för att spela fram ett
// helt parti i varje CI-körning.
export async function enterCrisis(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{ state: { theatres: Record<string, unknown>; meta: { turn: number }; doomsday: number; pendingCrisis: unknown } }>(
      (resolve, reject) => {
        getReq.onsuccess = () => resolve(getReq.result)
        getReq.onerror = () => reject(getReq.error)
      },
    )
    const theatreId = Object.keys(saved.state.theatres)[0]
    saved.state.doomsday = 82
    saved.state.pendingCrisis = { turn: saved.state.meta.turn, theatreId, restrictedRevenueThisTurn: 2_000_000 }
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('tab-news').click()
  await page.getByTestId('crisis-modal').waitFor()
}

// P89 (ETAPP7_TEKNISK_SPEC.md §9/§13): Epilogue — samma sannolikhetsproblem
// som krisen (ett scenario slutar bara efter många turer i ett riktigt
// parti), löst med exakt samma IndexedDB-injektionsteknik som enterCrisis
// ovan. status: 'ended'/NUCLEAR_EXCHANGE ger den textmässigt tätaste
// varianten (kärnvapenepilogens obituary/frontnamn/leveranslista utöver de
// fyra axlarna och slutkortet) — samma "täta variant fångar mest"-princip
// som enterContacts/enterCrisis redan följer.
export async function enterEpilogue(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{
      state: {
        meta: { turn: number }
        doomsday: number
        wire: { id: string; turn: number; headline: string; actorIsPlayer: boolean }[]
        chronicle: unknown[]
        status: unknown
      }
    }>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    saved.state.doomsday = 100
    saved.state.wire = [
      { id: '1-0', turn: saved.state.meta.turn - 1, headline: 'DELIVERED 12× NAPALM CANISTERS TO RVN (+£240,000)', actorIsPlayer: true },
    ]
    saved.state.chronicle = [
      {
        turn: Math.max(0, saved.state.meta.turn - 2),
        kind: 'coup',
        headline: 'YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS',
        actorIsPlayer: true,
        causeHeadlines: [],
        doomsdayDelta: 9,
      },
      {
        turn: saved.state.meta.turn - 1,
        kind: 'restricted_delivery',
        headline: 'DELIVERED 12× NAPALM CANISTERS TO RVN (+£240,000)',
        actorIsPlayer: true,
        causeHeadlines: [],
        doomsdayDelta: 18,
      },
    ]
    saved.state.status = { kind: 'ended', ending: 'NUCLEAR_EXCHANGE', turn: saved.state.meta.turn }
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('ended-banner-epilogue').click()
  await page.getByTestId('epilogue-screen').waitFor()
}

export async function enterEpilogueHistory(page: Page): Promise<void> {
  await enterEpilogue(page)
  await page.getByTestId('epilogue-history-button').click()
  await page.getByTestId('epilogue-history-sheet').waitFor()
}

// P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): handledningsbanderollen.
// Samma flöde som enterOperations, bara med ett väntemål på banderollen i
// stället för bara HUD:en — varje Playwright-test får sin egen tomma
// browserkontext, så det här ÄR ett genuint första nytt parti.
export async function enterTutorial(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('tutorial-banner').waitFor()
}

// P90 (ETAPP7_TEKNISK_SPEC.md §9/§13): SettingsOverlay, nådd FRÅN pausen
// (PauseOverlay.tsx:s nya "Settings"-knapp) — samma väg en riktig spelare
// tar, inte ett direkt Escape-genvägstest.
export async function enterSettings(page: Page): Promise<void> {
  await enterOperations(page)
  await page.getByTestId('hud-menu-button').click()
  await page.getByTestId('pause-overlay').waitFor()
  await page.getByTestId('pause-settings').click()
  await page.getByTestId('settings-overlay').waitFor()
}

// P91b (§9/§13, P81-20): Handboken nådd via Settings' "Open Handbook"-knapp,
// en av de tre dokumenterade ingångarna (de andra två är huvudmenyn och HUD:ens
// info-ikoner — samma komponent i alla tre, en egen skärm räcker för regel 18/11).
export async function enterHandbook(page: Page): Promise<void> {
  await enterSettings(page)
  await page.getByTestId('settings-open-handbook').click()
  await page.getByTestId('handbook').waitFor()
  // Pausöverlaget låg kvar ovanpå Handboken när den öppnades härifrån (fångat
  // först av npm run shots) — det får inte täcka den.
  await page.getByTestId('pause-overlay').waitFor({ state: 'hidden' })
}

// P94: de tre flikar och landsakten som saknades i listan. Kontrakt-, företags-
// och nyhetsflikarna är spelets vardagsskärmar — de hade ingen regel 11/18-
// täckning alls — och landsakten är kartflödets enda bottenark med formulär.
async function enterTab(page: Page, view: 'contracts' | 'company' | 'news'): Promise<void> {
  await enterOperations(page)
  await page.getByTestId(`tab-${view}`).click()
  await page.locator(`[data-testid="tab-${view}"][aria-current="page"]`).waitFor()
}

export async function enterContracts(page: Page): Promise<void> {
  await enterTab(page, 'contracts')
}

export async function enterCompany(page: Page): Promise<void> {
  await enterTab(page, 'company')
}

export async function enterNews(page: Page): Promise<void> {
  await enterTab(page, 'news')
}

export async function enterCountryFile(page: Page): Promise<void> {
  await enterOperations(page)
  await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
  await page.getByTestId('country-file').waitFor()
}

// P97 (ETAPP8_FORSLAG.md §3.2): huvudboken och styrelsens PM. Båda kräver ett parti som
// spelats några kvartal (ledger-raderna finns först efter End Quarter; styrelsens PM kommer
// vid första granskningsturen, tur 6). Reducerad rörelse gör kvartalsuppspelningen
// omedelbar — utom vid en granskningstur, där PM:et ALDRIG försvinner av sig självt och
// spelaren kvitterar med Continue (QuarterReplay.tsx).
export async function endQuarters(page: Page, count: number): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (let i = 0; i < count; i++) {
    await page.getByTestId('end-quarter-button').click()
    await page.waitForTimeout(150)
  }
}

export async function enterCompanyLedger(page: Page): Promise<void> {
  await enterOperations(page)
  await endQuarters(page, 4)
  await page.getByTestId('tab-company').click()
  await page.getByTestId('ledger-chart').waitFor()
}

export async function enterLedgerVouchers(page: Page): Promise<void> {
  await enterCompanyLedger(page)
  await page.getByTestId('ledger-chart').click()
  await page.getByTestId('ledger-vouchers').waitFor()
}

// Spelar tills PM:et visas (turn 6 resolveras av End Quarter nummer 7).
export async function enterBoardMemo(page: Page): Promise<void> {
  await enterOperations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (let i = 0; i < 9; i++) {
    await page.getByTestId('end-quarter-button').click()
    try {
      await page.getByTestId('board-memo').waitFor({ state: 'visible', timeout: 400 })
      return
    } catch {
      // Ingen granskningstur än.
    }
  }
  throw new Error('styrelsens PM visades aldrig inom nio kvartal')
}

// P99 (ETAPP8_FORSLAG.md §4.2): en öppen ordermapp med förskotts- och kreditstämpel och de tre
// talen vid prisreglaget. Ordrar utlyses först efter ett avslutat kvartal och köpare/tur varierar
// inte här (samma seed-oberoende väntloop som scripts/shots.mjs:s contracts-bid-open), så spelas
// högst tio kvartal fram tills en order finns. Reducerad rörelse: kvartalsuppspelningen omedelbar
// — utom en granskningstur (tur 6), där PM:et kvitteras med Continue.
export async function enterContractsBidOpen(page: Page): Promise<void> {
  await enterOperations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('tab-contracts').click()
    if ((await page.getByRole('button', { name: 'quote' }).count()) > 0) break
    await page.getByTestId('end-quarter-button').click()
    await page.waitForTimeout(150)
    if (await page.getByTestId('board-memo').isVisible().catch(() => false)) await page.getByTestId('replay-skip').click()
  }
  await page.getByRole('button', { name: 'quote' }).first().click()
  await page.getByTestId('bid-form').waitFor()
}

// P99b (EMBARGO-fällan): varningen turen före ett policybeslut. Ett riktigt parti når den inte
// (ingen mekanik sänker en tjänstemans relation, se ANDRINGSLOGG P99b), så samma IndexedDB-
// injektion som enterCrisis: sänk NLF-försvarstjänstemannens relation till 0 vid tur 4 och
// avsluta ett kvartal — varningen hamnar på NEWS DESK:s förstasida som en blixt.
export async function enterPolicyWarning(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{
      state: { meta: { turn: number }; officials: Record<string, { relationToPlayer: number; standing: number; agenda: string }> }
    }>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    saved.state.meta.turn = 4
    for (const o of Object.values(saved.state.officials)) {
      if (o.agenda === 'NON_ALIGNMENT') {
        o.relationToPlayer = 0
        o.standing = 80
      }
    }
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('end-quarter-button').click()
  await page.getByText('IS PREPARING').first().waitFor({ state: 'attached', timeout: 5000 })
  await page.getByTestId('tab-news').click()
  await page.getByText('IS PREPARING').first().waitFor()
}

// P101 (ETAPP8_FORSLAG.md §5.2): anslagstavlan i THE COMPANY. Densaste varianten: ett nytt-avtal-kort
// vänt (två Stepper och en Segmented med fem alternativ) bredvid linje- och stationskorten.
export async function enterStandingOrders(page: Page): Promise<void> {
  await enterOperations(page)
  await page.getByTestId('tab-company').click()
  await page.getByTestId('standing-flip-supply-new').click()
  await page.getByTestId('standing-back-supply-new').waitFor()
}

// P101: larmvarianten — ett avtal som gått med förlust tre turer i rad och en station på aktiv över
// tröskeln, injicerade via IndexedDB (ett riktigt parti når dem inte utan att spelas långt), och This
// Quarter-raden som hoppar till kortet.
export async function enterStandingAlarm(page: Page): Promise<void> {
  await enterOperations(page)
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{
      state: {
        meta: { turn: number }
        house: {
          standingOrders: { supply: unknown[]; stations: Record<string, unknown> }
          stations: { id: string; exposure: number }[]
        }
      }
    }>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    saved.state.meta.turn = 8
    saved.state.house.standingOrders.supply = [
      { id: 'supply-steel-1', commodity: 'steel', volumePerTurn: 40000, lockedIndex: 100, startTurn: 1, endTurn: 20, lossStreak: 3 },
    ]
    const station = saved.state.house.stations[0]!
    station.exposure = 90
    saved.state.house.standingOrders.stations[station.id] = { mode: 'active', sinceTurn: 1, activeTurns: 0 }
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('hud').waitFor()
  await page.getByTestId('quarterband-toggle').click()
  await page.getByTestId('quarterband-item-standing-supply-steel').click()
  await page.getByTestId('standing-back-supply-steel').waitFor()
}

// P126 (ETAPP9_FORSLAG.md §9): ritbordet och typbladen. Ett riktigt parti har inga konstruktioner förrän ett designprojekt
// gått klart (flera kvartal), och ingen fångad materiel förrän ett genombrott — så samma IndexedDB-injektion som
// enterCrisis: tre konstruktioner (ej provad med dold miljöbrist, beprövad, under utredning), ett pågående projekt, en
// öppen utredning och ett fångat system, och en relation hos köparna som tillåter fältprov.
async function injectDesigns(page: Page): Promise<void> {
  await enterOperations(page)
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{ state: { house: Record<string, unknown>; officials: Record<string, unknown> } }>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    const house = saved.state.house
    const base = {
      category: 'artillery',
      baseProductId: '105mm_field_gun',
      generation: 1,
      focus: 'balanced',
      ambition: 'timely',
      unitCostFactor: 1.1,
      uncertainty: 1,
      flawRevealed: false,
      testedIn: [],
      fieldRecord: { occasions: 0, proven: false },
      lineage: null,
      introducedTurn: 1,
      status: 'active',
    }
    house.designs = [
      { ...base, id: 'design-1', name: 'H&V M64 Field Gun', performance: 62, reliability: 71, trueQuality: 66, latentFlaw: { environment: 'monsoon', severity: 2 } },
      { ...base, id: 'design-2', name: 'H&V M65 Field Gun', performance: 74, reliability: 58, trueQuality: 72, latentFlaw: null, testedIn: ['jungle'], fieldRecord: { occasions: 3, proven: true }, uncertainty: 0 },
      { ...base, id: 'design-3', name: 'H&V M66 Heavy Gun', performance: 55, reliability: 80, trueQuality: 48, latentFlaw: { environment: 'mine', severity: 1 }, flawRevealed: true },
    ]
    // P128: två upphandlingar (en i utveckling med spelaren anmäld, en tilldelad med protokoll) och ett framkommet pappersspår.
    ;(saved.state as unknown as { programmes: unknown[]; traces: unknown[] }).programmes = [
      {
        id: 'programme-1', buyerId: 'rvn', category: 'artillery', baseProductId: '105mm_field_gun', trigger: 'requirementCard',
        requirements: [
          { kind: 'performance', threshold: 62, mandatory: true, weight: 0.4 },
          { kind: 'reliability', threshold: 55, mandatory: false, weight: 0.3 },
          { kind: 'unitCost', threshold: 1.2, mandatory: false, weight: 0.3 },
        ],
        testEnvironment: 'jungle', grant: { kind: 'costPlus', amount: 400000 }, prize: { quantity: 20, deliveryTurns: 4, unitPrice: 300000, advancePct: 10 },
        phase: 'development', phaseSinceTurn: 0, announcedTurn: 0, entrants: [{ houseId: 'brandt', enteredTurn: 0 }, { houseId: 'player', enteredTurn: 0 }], traces: [],
      },
      {
        id: 'programme-2', buyerId: 'laos', category: 'armour', baseProductId: 'm3_apc', trigger: 'gapShock',
        requirements: [
          { kind: 'performance', threshold: 60, mandatory: true, weight: 0.5 },
          { kind: 'reliability', threshold: 60, mandatory: true, weight: 0.5 },
        ],
        testEnvironment: 'monsoon', grant: null, prize: { quantity: 10, deliveryTurns: 3, unitPrice: 500000, advancePct: 10 }, phase: 'awarded', phaseSinceTurn: 0, announcedTurn: 0,
        entrants: [{ houseId: 'costigan', enteredTurn: 0 }, { houseId: 'player', enteredTurn: 0, designId: 'design-1' }], traces: [],
        result: {
          winner: 'costigan', turn: 0,
          scores: [
            { houseId: 'costigan', score: 74, disqualified: null, rows: [{ kind: 'performance', measured: 68, threshold: 60, mandatory: true, pass: true }, { kind: 'reliability', measured: 63, threshold: 60, mandatory: true, pass: true }] },
            { houseId: 'player', score: 0, disqualified: 'FAILED A MANDATORY REQUIREMENT', rows: [{ kind: 'performance', measured: 70, threshold: 60, mandatory: true, pass: true }, { kind: 'reliability', measured: 52, threshold: 60, mandatory: true, pass: false }] },
          ],
        },
      },
    ]
    ;(saved.state as unknown as { traces: unknown[] }).traces = [
      { id: 'trace-1', houseId: 'player', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'bribeBoard', severity: 2, turn: 0, status: 'surfaced', surfacedTurn: 0, deadlineTurn: 3 },
      { id: 'trace-2', houseId: 'player', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'favour', severity: 1, turn: 0, status: 'open' },
    ]
    ;(house.designs as { id: string; exclusiveTo?: string; skunk?: boolean; generation?: number }[]).forEach((d) => {
      if (d.id === 'design-2') {
        d.exclusiveTo = 'west'
        d.skunk = true
        d.generation = 2
      }
    })
    house.licences = [{ id: 'licence-1', designId: 'design-2', factionId: 'rvn', sinceTurn: 1, capability: 45, status: 'active' }]
    house.investigations = [
      { id: 'inv-1', designId: 'design-3', environment: 'mine', severity: 1, frontId: 'front-1', buyerId: 'rvn', openedTurn: 1, deadlineTurn: 5, status: 'open', causeEventId: null },
    ]
    ;(house.rnd as unknown[]).push({ id: 'rnd-design-armour-1', category: 'armour', turnsRemaining: 2, turnsTotal: 4, costFactor: 1, design: { focus: 'advanced', ambition: 'forward', targetGeneration: 2, upgradeOf: null } })
    house.capturedMateriel = [{ systemId: 'nlf-artillery', name: 'Type 63 rocket launcher', category: 'artillery', fromFactionId: 'nlf', units: 3 }]
    ;(house.standingOrders as Record<string, unknown>).research = { artillery: { pace: 'normal', sinceTurn: 1 } }
    house.treasury = 20_000_000
    ;(saved.state as unknown as { market: { openOrders: unknown[] }; race: { generation: Record<string, Record<string, number>>; gap?: unknown } }).market.openOrders = [
      {
        id: 'order-9', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 12, statedBudget: 7000000, trueBudget: 8000000, referencePrice: 6000000,
        requiredDeliveryTurns: 3, expiresTurn: 6, competingRivals: ['brandt', 'costigan'], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
        officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 15,
      },
    ]
    // P127: ett block har gått upp en generation och ett gap är aktivt — kapplöpningstavlan och kravnivåstämpeln har något att visa.
    const race = (saved.state as unknown as { race: { generation: Record<string, Record<string, number>>; gap?: unknown } }).race
    race.generation['west']!['artillery'] = 2
    race.generation['east']!['armour'] = 2
    race.gap = { artillery: { leader: 'west', sinceTurn: 1 } }
    for (const o of Object.values(saved.state.officials) as { relationToPlayer: number }[]) o.relationToPlayer = 80
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('hud').waitFor()
  await page.getByTestId('tab-company').click()
}

// Ritbordet: en blåkopia vänd, så att Segmented-raderna (fokus, ambition, startpunkt, tempo) syns i sin tätaste form.
export async function enterDrawingBoard(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('standing-flip-drawing-artillery').click()
  await page.getByTestId('standing-back-drawing-artillery').waitFor()
}

// Typbladet: tre blad med instrument och stämplar, det under utredning med sina order öppna (utredningskortet, provning, fältprov).
export async function enterTypeSheet(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('type-orders-toggle-design-3').click()
  await page.getByTestId('type-orders-design-3').waitFor()
}

// P136: typbladet med taggar (bunden, exportreglerad, specialprojekt) och licenssektionen öppen.
export async function enterLicence(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('type-licence-toggle-design-2').click()
  await page.getByTestId('licence-section-design-2').waitFor()
}

// P127: kapplöpningstavlan (CONTRACTS) med kravkort, gap-ledare och bedömningsstämplar.
export async function enterRaceBoard(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('tab-contracts').click()
  await page.getByTestId('race-board').waitFor()
}

// P127: budmappen med konstruktionsval och stämplar — en order är injicerad så att formuläret är deterministiskt.
export async function enterBidDesign(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('tab-contracts').click()
  await page.getByRole('button', { name: 'quote' }).first().click()
  await page.getByTestId('bid-form').waitFor()
  await page.getByTestId('bid-design').getByText('#2').click()
}

// P127: ett daterat PM öppet som skrivmaskinsblad ur kvartalsbandet.
export async function enterMemo(page: Page): Promise<void> {
  await enterOperations(page)
  await page.getByTestId('quarterband-memo-count').waitFor()
  await page.getByTestId('quarterband-toggle').click()
  await page.getByTestId('quarterband-memo-drawing-board').click()
  await page.getByTestId('memo-sheet').waitFor()
}

// P128: upphandlingsmappen med knepen och protokollet, och utredningskortet.
export async function enterProgramme(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('tab-contracts').click()
  await page.getByTestId('programme-tricks-toggle-programme-1').click()
  await page.getByTestId('programme-tricks-programme-1').waitFor()
}

export async function enterInquiry(page: Page): Promise<void> {
  await injectDesigns(page)
  await page.getByTestId('tab-company').click()
  await page.getByTestId('inquiry-trace-1').waitFor()
  await page.getByTestId('inquiry-trace-1').scrollIntoViewIfNeeded()
}

export const SCREENS: { name: string; path: string; setup?: (page: Page) => Promise<void> }[] = [
  { name: 'components', path: '/?screen=components' },
  { name: 'main-menu', path: '/' },
  { name: 'new-game', path: '/', setup: enterNewGame },
  { name: 'briefing', path: '/', setup: enterBriefing },
  { name: 'operations', path: '/', setup: enterOperations },
  { name: 'country-file', path: '/', setup: enterCountryFile },
  { name: 'contracts', path: '/', setup: enterContracts },
  { name: 'company', path: '/', setup: enterCompany },
  { name: 'news', path: '/', setup: enterNews },
  { name: 'contacts', path: '/', setup: enterContacts },
  { name: 'crisis', path: '/', setup: enterCrisis },
  { name: 'epilogue', path: '/', setup: enterEpilogue },
  { name: 'epilogue-history', path: '/', setup: enterEpilogueHistory },
  { name: 'settings', path: '/', setup: enterSettings },
  { name: 'tutorial', path: '/', setup: enterTutorial },
  { name: 'handbook', path: '/', setup: enterHandbook },
  { name: 'contracts-bid-open', path: '/', setup: enterContractsBidOpen },
  { name: 'company-ledger', path: '/', setup: enterCompanyLedger },
  { name: 'ledger-vouchers', path: '/', setup: enterLedgerVouchers },
  { name: 'board-memo', path: '/', setup: enterBoardMemo },
  { name: 'policy-warning', path: '/', setup: enterPolicyWarning },
  { name: 'standing-orders', path: '/', setup: enterStandingOrders },
  { name: 'standing-alarm', path: '/', setup: enterStandingAlarm },
  { name: 'drawing-board', path: '/', setup: enterDrawingBoard },
  { name: 'type-sheet', path: '/', setup: enterTypeSheet },
  { name: 'licence', path: '/', setup: enterLicence },
  { name: 'race-board', path: '/', setup: enterRaceBoard },
  { name: 'bid-design', path: '/', setup: enterBidDesign },
  { name: 'memo', path: '/', setup: enterMemo },
  { name: 'programme', path: '/', setup: enterProgramme },
  { name: 'inquiry', path: '/', setup: enterInquiry },
]
