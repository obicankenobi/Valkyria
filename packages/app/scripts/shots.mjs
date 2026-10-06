#!/usr/bin/env node
// shots.mjs — "Claude Code ser det den bygger" (ETAPP7_TEKNISK_SPEC.md §11.3
// arbetssätt 2). Startar appens devserver + en enkel statisk server för
// docs/ui/reference/, renderar varje registrerad skärm i telefon- (390×844,
// pekskärm emulerad) och skrivbordsformat (1440×900) till docs/ui/current/,
// och renderar de tre godkända referensskisserna till PNG i telefonformat så
// att bygge och facit kan jämföras sida vid sida. Ett dev-verktyg, inte ett
// CI-test — se e2e/text-overflow.spec.ts för regel 18:s automatiska kontroll.
//
// Skärmlistan växer i takt med att fler skärmar i etapp 7 färdigställs, samma
// sorts växande lista som resten av projektets checkade-in skript. P73 lade
// bara komponentsidan; P74 lägger huvudmenyn och OPERATIONS-skalet (med
// platshållarkartan — den riktiga kartan är P76).
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer, get as httpGet } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const REFERENCE_DIR = join(REPO_ROOT, 'docs/ui/reference')
const OUT_DIR = join(REPO_ROOT, 'docs/ui/current')
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'

const APP_PORT = 4186
const REFERENCE_PORT = 4187

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

// P126 (ETAPP9 §9): ritbordet och typbladen. Ett riktigt parti har inga konstruktioner förrän ett designprojekt gått klart
// och ingen fångad materiel förrän ett genombrott — samma IndexedDB-injektion som "crisis". Tre konstruktioner (ej provad med
// dold miljöbrist, beprövad, under utredning), ett pågående projekt, en öppen utredning, ett fångat system och goda relationer.
async function injectDesigns(page) {
  await enterOperationsAndPlay(page, 0)
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    const house = saved.state.house
    const base = { category: 'artillery', baseProductId: '105mm_field_gun', generation: 1, focus: 'balanced', ambition: 'timely', unitCostFactor: 1.1, uncertainty: 1, flawRevealed: false, testedIn: [], fieldRecord: { occasions: 0, proven: false }, lineage: null, introducedTurn: 1, status: 'active' }
    house.designs = [
      { ...base, id: 'design-1', name: 'H&V M64 Field Gun', performance: 62, reliability: 71, trueQuality: 66, latentFlaw: { environment: 'monsoon', severity: 2 } },
      { ...base, id: 'design-2', name: 'H&V M65 Field Gun', performance: 74, reliability: 58, trueQuality: 72, latentFlaw: null, testedIn: ['jungle'], fieldRecord: { occasions: 3, proven: true }, uncertainty: 0 },
      { ...base, id: 'design-3', name: 'H&V M66 Heavy Gun', performance: 55, reliability: 80, trueQuality: 48, latentFlaw: { environment: 'mine', severity: 1 }, flawRevealed: true },
    ]
    for (const d of house.designs) if (d.id === 'design-2') Object.assign(d, { exclusiveTo: 'west', skunk: true, generation: 2 })
    house.licences = [{ id: 'licence-1', designId: 'design-2', factionId: 'rvn', sinceTurn: 1, capability: 45, status: 'active' }]
    house.investigations = [{ id: 'inv-1', designId: 'design-3', environment: 'mine', severity: 1, frontId: 'front-1', buyerId: 'rvn', openedTurn: 1, deadlineTurn: 5, status: 'open', causeEventId: null }]
    house.rnd.push({ id: 'rnd-design-armour-1', category: 'armour', turnsRemaining: 2, turnsTotal: 4, costFactor: 1, design: { focus: 'advanced', ambition: 'forward', targetGeneration: 2, upgradeOf: null } })
    house.capturedMateriel = [{ systemId: 'nlf-artillery', name: 'Type 63 rocket launcher', category: 'artillery', fromFactionId: 'nlf', units: 3 }]
    house.standingOrders.research = { artillery: { pace: 'normal', sinceTurn: 1 } }
    house.treasury = 20000000
    saved.state.market.openOrders = [
      {
        id: 'order-9', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 12, statedBudget: 7000000, trueBudget: 8000000, referencePrice: 6000000,
        requiredDeliveryTurns: 3, expiresTurn: 6, competingRivals: ['brandt', 'costigan'], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
        officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 15,
      },
    ]
    // P127: ett block har gått upp en generation och ett gap är aktivt.
    saved.state.race.generation.west.artillery = 2
    saved.state.race.generation.east.armour = 2
    saved.state.race.gap = { artillery: { leader: 'west', sinceTurn: 1 } }
    // P128: två upphandlingar (en i utveckling med spelaren anmäld, en tilldelad med protokoll) och ett framkommet pappersspår.
    saved.state.programmes = [
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
    saved.state.traces = [
      { id: 'trace-1', houseId: 'player', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'bribeBoard', severity: 2, turn: 0, status: 'surfaced', surfacedTurn: 0, deadlineTurn: 3 },
      { id: 'trace-2', houseId: 'player', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'favour', severity: 1, turn: 0, status: 'open' },
    ]
    for (const o of Object.values(saved.state.officials)) o.relationToPlayer = 80
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

// P97: ett nytt parti spelat `quarters` kvartal med reducerad rörelse (uppspelningen
// omedelbar, PM:et undantaget — se QuarterReplay.tsx). Samma New Game-väg som övriga skärmar.
async function enterOperationsAndPlay(page, quarters) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('menu-new-game').click()
  const confirmYes = page.getByTestId('new-game-confirm-yes')
  try {
    await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
    await confirmYes.click()
  } catch {
    // Inget sparat parti.
  }
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
  for (let i = 0; i < quarters; i++) {
    await page.getByTestId('end-quarter-button').click()
    await page.waitForTimeout(150)
  }
}

// Skärmar denna prompt bygger. `path` är appens query-styrda ingång (samma
// ?screen=-mönster som App.tsx:s wantsComponentLibrary()). En skärm utan egen
// query-ingång (huvudmenyn ligger redan på '/', OPERATIONS kräver att man
// klickar sig förbi menyn) tar en `afterGoto`-hook i stället för att uppfinna
// fler query-parametrar bara för skärmdumpsskriptet.
// P163: gemensam väg in i ett nytt parti för de nya skärmarna nedan (de äldre skärmarna har samma sekvens utskriven i sin egen afterGoto).
async function startGame(page) {
  await page.getByTestId('menu-new-game').click()
  const confirmYes = page.getByTestId('new-game-confirm-yes')
  try {
    await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
    await confirmYes.click()
  } catch {
    // Inget sparat parti — "New Game" gick rakt in.
  }
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()
}

const APP_SCREENS = [
  { name: 'components', path: '/?screen=components' },
  { name: 'main-menu', path: '/' },
  {
    // P88 (§9/§13): New Game-formuläret (ingen egen referensskiss).
    name: 'new-game',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Ingen bekräftelsedialog visades — inget sparat parti fanns.
      }
      await page.getByTestId('new-game-screen').waitFor()
    },
  },
  {
    // P91a (§9/§13, P81-20): handledningsbanderollen — måste vara det
    // FÖRSTA skärmen i den här listan som faktiskt skickar in New Game
    // (restart()), annars har tutorialSeen redan satts av en tidigare
    // skärm i samma delade browserkontext (main.mjs:s egen loop, en
    // context per format) och banderollen visas aldrig. Ingen egen
    // referensskiss.
    name: 'tutorial',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Ingen bekräftelsedialog visades — inget sparat parti fanns.
      }
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('tutorial-banner').waitFor()
    },
  },
  {
    // P88 (§9/§13): Briefing, med husets nyss valda namn och kartan.
    name: 'briefing',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Ingen bekräftelsedialog visades — inget sparat parti fanns.
      }
      await page.getByTestId('newgame-name-Ashford & Vale').click()
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-screen').waitFor()
    },
  },
  {
    name: 'operations',
    path: '/',
    async afterGoto(page) {
      // Den föregående skärmen (main-menu) monterar redan <App/> en gång,
      // vilket useGame.ts:s autospar-effekt (körs vid varje hydrering, även
      // med ett helt nytt, oanvänt parti) redan hunnit spara till IndexedDB
      // innan den här navigeringen — "New Game" visar då bekräftelsedialogen
      // (hasSave=true), precis som för en riktig spelare med ett sparat
      // parti. Samma gren som en riktig andra-besök-runda, inte en bugg i
      // skärmdumpsskriptet.
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Ingen bekräftelsedialog visades — inget sparat parti fanns, "New
        // Game" gick rakt in.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
    },
  },
  {
    // P79: landets bottenark, jämförs mot operations-2-country-selected.
    name: 'country-file',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await page.getByTestId('country-file').waitFor()
    },
  },
  {
    // P79: INFLUENCE-formuläret, jämförs mot operations-3-configure-action.
    name: 'country-file-influence',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await page.getByTestId('country-file').waitFor()
      await page.getByTestId('cf-verb-INFLUENCE').click()
      await page.getByTestId('cf-influence-preview').waitFor()
    },
  },
  {
    // P80: kvartalsuppspelningen, mitt i sekvensen (ingen egen referensskiss
    // finns — §11.6:s referensskisser täcker bara OPERATIONS).
    name: 'quarter-replay',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('end-quarter-button').click()
      await page.getByTestId('quarter-replay').waitFor()
    },
  },
  {
    // P80: NEWS DESK:s förstasida (f.d. THE WIRE) — Skip stänger uppspelningen
    // direkt, samma genväg spelaren själv har (§8: "Hoppa över med en knapp").
    // reducedMotion satt HÄR (inte på hela kontexten, som skulle påverka alla
    // andra skärmars animationer) så att telexets reveal-sekvens (TheWire.tsx,
    // P70) visar ALLA händelser synkront, inklusive rubriken — annars kan
    // hjälteboxen (.news-hero) hinna missas i en enda 300 ms skärmdump.
    name: 'news-desk',
    path: '/',
    async afterGoto(page) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      // reducedMotion gör QuarterReplay.tsx omedelbar (§8: "Omedelbar vid
      // prefers-reduced-motion") — överlaget hinner aldrig monteras, appen
      // går rakt till NEWS DESK, precis som en riktig spelare med den
      // systeminställningen skulle uppleva det.
      await page.getByTestId('end-quarter-button').click()
      await page.getByTestId('tab-news').waitFor()
    },
  },
  {
    // P81a: teckenförklaringen, öppnad över OPERATIONS (ingen egen
    // referensskiss — samma linje som quarter-replay ovan).
    name: 'map-legend',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('map-legend-button').click()
      await page.getByTestId('map-legend').waitFor()
    },
  },
  {
    // P83: This Quarter-bandet utfällt, med kvartalsbeskedet (P81-11) och
    // lägena (§7.7) synliga (ingen egen referensskiss).
    name: 'quarterband-expanded',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('quarterband-toggle').click()
      await page.getByTestId('quarterband-body').waitFor()
    },
  },
  {
    // P163: handlingskortet för EXPAND (kortet först, FILE sedan).
    name: 'country-file-confirm',
    path: '/',
    async afterGoto(page) {
      await startGame(page)
      await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await page.getByTestId('country-file').waitFor()
      await page.getByTestId('cf-verb-EXPAND').click()
      await page.getByTestId('action-card-EXPAND').waitFor()
    },
  },
  {
    // P163: målväljaren för LEAK med handlingskortet (chans ur previewAction) ovanför listan.
    name: 'country-file-target',
    path: '/',
    async afterGoto(page) {
      await startGame(page)
      await page.getByTestId('map-capital-rvn').locator('.map-capital-marker').click()
      await page.getByTestId('country-file').waitFor()
      await page.getByTestId('cf-verb-LEAK').click()
      await page.getByTestId('action-card-LEAK').waitFor()
    },
  },
  {
    // P163: ett land utan station — stationskortet säger vad en station är och att RECRUIT är vägen.
    name: 'country-file-nostation',
    path: '/',
    async afterGoto(page) {
      await startGame(page)
      await page.getByTestId('map-capital-laos').locator('.map-capital-marker').click()
      await page.getByTestId('country-file').waitFor()
      await page.getByTestId('station-card').waitFor()
    },
  },
  {
    // P163: ett verb valt i Actions-menyn — remsan och den markerade knappen i CONTACTS.
    name: 'armed-verb',
    path: '/',
    async afterGoto(page) {
      await startGame(page)
      await page.getByTestId('action-slot-0-empty').click()
      await page.getByTestId('action-catalog-entry-BRIBE').click()
      await page.getByTestId('armed-verb').waitFor()
      await page.waitForTimeout(600)
    },
  },
  {
    // P81-12: handlingskatalogen, öppnad från en tom handlingsplats (ingen
    // egen referensskiss).
    name: 'action-catalog',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('action-slot-0-empty').click()
      await page.getByTestId('action-catalog').waitFor()
    },
  },
  {
    // P84: CONTRACTS med en stämplad mapp utfälld och prisreglaget synligt
    // (ingen egen referensskiss). Ordergenerering är sannolikhetsbaserad per
    // faktion och tur (samma skäl e2e-specerna har en egen väntloop) — spelar
    // därför fram högst 10 turer tills en order faktiskt finns.
    name: 'contracts-bid-open',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      for (let i = 0; i < 10; i++) {
        await page.getByTestId('tab-contracts').click()
        const quoteCount = await page.getByRole('button', { name: 'quote' }).count()
        if (quoteCount > 0) break
        await page.getByTestId('end-quarter-button').click()
      }
      await page.getByRole('button', { name: 'quote' }).first().click()
      await page.getByTestId('bid-form').waitFor()
    },
  },
  {
    // P85: THE COMPANY — produktionslinjebanden, Next Quarter-panelen,
    // INTERNAL-formulären och råvarupanelen (ingen egen referensskiss).
    name: 'company',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('tab-company').click()
      await page.getByTestId('company-credit-tier').waitFor()
    },
  },
  {
    // P86: CONTACTS — personakter med politikverben, faktionernas akter och
    // rivalhusens akter (ingen egen referensskiss).
    name: 'contacts',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('tab-contacts').click()
      await page.getByTestId('contacts-verb-BROKER-rvn').waitFor()
    },
  },
  {
    // P86: BROKER-formuläret, ThePolitics.tsx:s mest komplexa (produktlista,
    // kvantitet, prisreglage) — ingen egen referensskiss.
    name: 'contacts-broker',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('tab-contacts').click()
      await page.getByTestId('contacts-verb-BROKER-rvn').click()
      await page.getByTestId('contacts-broker-preview-rvn').waitFor()
    },
  },
  {
    // P87: krisens helskärmskort (§7.6) — ingen egen referensskiss. En kris
    // är sannolikhetsstyrd (doomsday måste korsa en tröskel, se play-20-
    // turns.spec.ts:s egen motivering) — går inte att nå genom att bara
    // klicka. Skriver `pendingCrisis` direkt in i IndexedDB-sparfilen (samma
    // "save:default"-nyckel appen självt autosparar till, persistence.ts)
    // och laddar om, i stället för att spela fram ett helt parti och hoppas.
    name: 'crisis',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      // P88 (§5): New Game -> Briefing -> OPERATIONS, two new legs.
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.evaluate(async () => {
        const dbReq = indexedDB.open('seventh-front', 1)
        const db = await new Promise((resolve, reject) => {
          dbReq.onsuccess = () => resolve(dbReq.result)
          dbReq.onerror = () => reject(dbReq.error)
        })
        const tx = db.transaction('saves', 'readwrite')
        const store = tx.objectStore('saves')
        const getReq = store.get('save:default')
        const saved = await new Promise((resolve, reject) => {
          getReq.onsuccess = () => resolve(getReq.result)
          getReq.onerror = () => reject(getReq.error)
        })
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
    },
  },
  {
    // P97 (ETAPP8_FORSLAG.md §3.2): huvudboken i THE COMPANY — fyra spelade kvartal så att
    // diagrammet har staplar, kassakurva, målkurva och BOOK NOW (ingen referensskiss).
    name: 'company-ledger',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 4)
      await page.getByTestId('tab-company').click()
      await page.getByTestId('ledger-chart').waitFor()
      await page.getByTestId('ledger-chart').scrollIntoViewIfNeeded()
    },
  },
  {
    // P97: kvartalets verifikationer — bottenarket som ett tryck på diagrammet öppnar.
    name: 'ledger-vouchers',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 4)
      await page.getByTestId('tab-company').click()
      await page.getByTestId('ledger-chart').click()
      await page.getByTestId('ledger-vouchers').waitFor()
    },
  },
  {
    // P99b: varningen turen före ett policybeslut (ingen referensskiss). Ingen mekanik sänker en
    // tjänstemans relation i ett riktigt parti, så samma IndexedDB-injektion som "crisis".
    name: 'policy-warning',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti.
      }
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.evaluate(async () => {
        const dbReq = indexedDB.open('seventh-front', 1)
        const db = await new Promise((resolve, reject) => {
          dbReq.onsuccess = () => resolve(dbReq.result)
          dbReq.onerror = () => reject(dbReq.error)
        })
        const tx = db.transaction('saves', 'readwrite')
        const store = tx.objectStore('saves')
        const getReq = store.get('save:default')
        const saved = await new Promise((resolve, reject) => {
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
      await page.getByTestId('tab-news').click()
      await page.getByText('IS PREPARING').first().waitFor()
    },
  },
  {
    // P101: anslagstavlan i THE COMPANY (ingen referensskiss) — ett nytt-avtal-kort vänt.
    name: 'standing-orders',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 0)
      await page.getByTestId('tab-company').click()
      await page.getByTestId('standing-flip-supply-new').click()
      await page.getByTestId('standing-back-supply-new').waitFor()
      await page.getByTestId('standing-card-supply-new').scrollIntoViewIfNeeded()
    },
  },
  {
    // P101: larmvarianten — avtal med förlustföljd och en station på aktiv över tröskeln (IndexedDB-injektion),
    // och This Quarter-raden som hoppar till kortet.
    name: 'standing-alarm',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 0)
      await page.evaluate(async () => {
        const dbReq = indexedDB.open('seventh-front', 1)
        const db = await new Promise((resolve, reject) => {
          dbReq.onsuccess = () => resolve(dbReq.result)
          dbReq.onerror = () => reject(dbReq.error)
        })
        const tx = db.transaction('saves', 'readwrite')
        const store = tx.objectStore('saves')
        const getReq = store.get('save:default')
        const saved = await new Promise((resolve, reject) => {
          getReq.onsuccess = () => resolve(getReq.result)
          getReq.onerror = () => reject(getReq.error)
        })
        saved.state.meta.turn = 8
        saved.state.house.standingOrders.supply = [
          { id: 'supply-steel-1', commodity: 'steel', volumePerTurn: 40000, lockedIndex: 100, startTurn: 1, endTurn: 20, lossStreak: 3 },
        ]
        const station = saved.state.house.stations[0]
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
    },
  },
  {
    // P126: ritbordet — en blåkopia vänd (Segmented för fokus, ambition, startpunkt, tempo), ritning i blyerts, fångad materiel.
    name: 'drawing-board',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('standing-flip-drawing-artillery').click()
      await page.getByTestId('standing-back-drawing-artillery').waitFor()
      await page.getByTestId('drawing-board').scrollIntoViewIfNeeded()
    },
  },
  {
    // P126: typbladen — tre blad med instrument och stämplar, det under utredning med sina order öppna.
    name: 'type-sheet',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('type-orders-toggle-design-3').click()
      await page.getByTestId('type-orders-design-3').waitFor()
      await page.getByTestId('type-sheets').scrollIntoViewIfNeeded()
    },
  },
  {
    // P136: typbladet med taggar (bunden, exportreglerad, specialprojekt) och licenssektionen öppen.
    name: 'licence',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('type-licence-toggle-design-2').click()
      await page.getByTestId('licence-section-design-2').waitFor()
      await page.getByTestId('licence-section-design-2').scrollIntoViewIfNeeded()
    },
  },
  {
    // P127: kapplöpningstavlan — väst/öst, bedömd generation med säkerhetsstämpel, gap-ledare och kravkort.
    name: 'race-board',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('tab-contracts').click()
      await page.getByTestId('race-board').waitFor()
    },
  },
  {
    // P127: budmappen med konstruktionsval och stämplarna BATTLE-PROVEN / REQUIRED LEVEL.
    name: 'bid-design',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('tab-contracts').click()
      await page.getByRole('button', { name: 'quote' }).first().click()
      await page.getByTestId('bid-form').waitFor()
      await page.getByTestId('bid-design').getByText('#2').click()
    },
  },
  {
    // P127: ett daterat PM som skrivmaskinsblad.
    name: 'memo',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 0)
      await page.getByTestId('quarterband-memo-count').waitFor()
      await page.getByTestId('quarterband-toggle').click()
      await page.getByTestId('quarterband-memo-drawing-board').click()
      await page.getByTestId('memo-sheet').waitFor()
    },
  },
  {
    // P128: upphandlingsmappen — kravblad, tidslinje, konkurrenter, knepen som registerkort och ett protokoll med ett underkänt ska-krav.
    name: 'programme',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('tab-contracts').click()
      await page.getByTestId('programme-tricks-toggle-programme-1').click()
      await page.getByTestId('programme-tricks-programme-1').waitFor()
    },
  },
  {
    // P128: utredningskortet — tre dåliga vägar med prickar, rent rykte och juridisk rådgivning.
    name: 'inquiry',
    path: '/',
    async afterGoto(page) {
      await injectDesigns(page)
      await page.getByTestId('inquiry-trace-1').waitFor()
      await page.getByTestId('inquiry-trace-1').scrollIntoViewIfNeeded()
    },
  },
  {
    // P97: styrelsens PM från THE SYNDICATE vid första granskningen (tur 6).
    name: 'board-memo',
    path: '/',
    async afterGoto(page) {
      await enterOperationsAndPlay(page, 0)
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
    },
  },
  {
    // P89: epilogen (§9) — ingen egen referensskiss. Ett scenario slutar
    // bara efter många turer i ett riktigt parti, samma sannolikhetsproblem
    // som krisen ovan — samma IndexedDB-injektionsteknik, bara status:
    // 'ended'/NUCLEAR_EXCHANGE i stället för pendingCrisis (den textmässigt
    // tätaste varianten: kärnvapenepilogens obituary/frontnamn/leveranslista
    // utöver de fyra axlarna och slutkortet alla ändor delar).
    name: 'epilogue',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.evaluate(async () => {
        const dbReq = indexedDB.open('seventh-front', 1)
        const db = await new Promise((resolve, reject) => {
          dbReq.onsuccess = () => resolve(dbReq.result)
          dbReq.onerror = () => reject(dbReq.error)
        })
        const tx = db.transaction('saves', 'readwrite')
        const store = tx.objectStore('saves')
        const getReq = store.get('save:default')
        const saved = await new Promise((resolve, reject) => {
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
    },
  },
  {
    // P90: SettingsOverlay, nådd FRÅN pausen (PauseOverlay.tsx:s nya
    // "Settings"-knapp) — ingen egen referensskiss.
    name: 'settings',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('hud-menu-button').click()
      await page.getByTestId('pause-overlay').waitFor()
      await page.getByTestId('pause-settings').click()
      await page.getByTestId('settings-overlay').waitFor()
    },
  },
  {
    // P91b (§9/§13, P81-20): Handboken, nådd via Settings' "Open Handbook"-
    // knapp — en av de tre dokumenterade ingångarna, ingen egen referensskiss.
    name: 'handbook',
    path: '/',
    async afterGoto(page) {
      await page.getByTestId('menu-new-game').click()
      const confirmYes = page.getByTestId('new-game-confirm-yes')
      try {
        await confirmYes.waitFor({ state: 'visible', timeout: 1500 })
        await confirmYes.click()
      } catch {
        // Inget sparat parti — samma gren som ovan.
      }
      await page.getByTestId('newgame-submit').click()
      await page.getByTestId('briefing-begin').click()
      await page.getByTestId('hud').waitFor()
      await page.getByTestId('hud-menu-button').click()
      await page.getByTestId('pause-overlay').waitFor()
      await page.getByTestId('pause-settings').click()
      await page.getByTestId('settings-overlay').waitFor()
      await page.getByTestId('settings-open-handbook').click()
      await page.getByTestId('handbook').waitFor()
    },
  },
]

const REFERENCE_FILES = [
  'operations-1-start.html',
  'operations-2-country-selected.html',
  'operations-3-configure-action.html',
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// Node 22:s inbyggda fetch (undici) avvisar vissa portar rakt av ("bad port",
// samma spärrlista webbläsare använder) INNAN något anrop ens görs — träffade
// flera av de först valda utvecklingsportarna i den här sandlådan. Node:s
// egen http-modul har ingen sådan spärr, så väntan görs med den i stället.
function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = httpGet(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`))
        else setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

function startReferenceServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname
      const filePath = join(REFERENCE_DIR, decodeURIComponent(urlPath))
      const body = await readFile(filePath)
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(REFERENCE_PORT, () => resolve(server))
  })
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`Startar appens devserver på :${APP_PORT}...`)
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(APP_PORT), '--strictPort'], {
    cwd: APP_DIR,
    stdio: 'ignore',
  })
  const referenceServer = await startReferenceServer()
  console.log(`Referensserver på :${REFERENCE_PORT}...`)

  try {
    await waitForServer(`http://localhost:${APP_PORT}`)

    const browser = await chromium.launch(
      existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
    )

    for (const format of ['phone', 'desktop']) {
      const viewport = format === 'phone' ? PHONE : DESKTOP
      const context = await browser.newContext({
        viewport,
        hasTouch: format === 'phone',
        isMobile: format === 'phone',
      })
      const page = await context.newPage()

      for (const screen of APP_SCREENS) {
        await page.goto(`http://localhost:${APP_PORT}${screen.path}`)
        if (screen.afterGoto) await screen.afterGoto(page)
        await page.waitForTimeout(300)
        const outPath = join(OUT_DIR, `${screen.name}-${format}.png`)
        await page.screenshot({ path: outPath, fullPage: true })
        console.log(`  ${outPath}`)
      }

      if (format === 'phone') {
        for (const file of REFERENCE_FILES) {
          await page.goto(`http://localhost:${REFERENCE_PORT}/${file}`)
          await page.waitForTimeout(300)
          const outPath = join(OUT_DIR, `reference-${file.replace('.html', '')}.png`)
          await page.screenshot({ path: outPath })
          console.log(`  ${outPath}`)
        }
      }

      await context.close()
    }

    await browser.close()
    console.log(`Klart. Skärmdumpar i ${OUT_DIR}`)
  } finally {
    devServer.kill()
    referenceServer.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
