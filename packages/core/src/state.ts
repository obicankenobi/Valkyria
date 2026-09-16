// createInitialState(scenarioId, seed), cloneState. Se ETAPP1_TEKNISK_SPEC.md avsnitt 2.2, 6.
//
// Läser den statiska scenariokatalogen (data/scenarios/*.json) och rivalkatalogen
// (data/rivals.json) och bygger ett fullständigt GameState. Startvärdena är de som
// står i scenariofilen — createInitialState uppfinner inget eget och kör ingen
// spelregel (ingen ekonomi-, anbuds- eller frontlogik hör hemma här, det är P3–P8).
import rivalsCatalog from './data/rivals.json' with { type: 'json' }
import indochinaSlice from './data/scenarios/indochina-slice.json' with { type: 'json' }
import type {
  BoardTarget,
  Commodity,
  Doctrine,
  Faction,
  FactionId,
  Formation,
  Front,
  GameState,
  House,
  ProductionLine,
  RivalHouse,
  RivalId,
  Station,
  TechCategory,
  Theatre,
} from './types.js'

const TECH_CATEGORIES: readonly TechCategory[] = [
  'infantry',
  'artillery',
  'armour',
  'aviation',
  'naval',
  'electronics',
]

function uniformCategoryRecord(value: number): Record<TechCategory, number> {
  const record = {} as Record<TechCategory, number>
  for (const category of TECH_CATEGORIES) record[category] = value
  return record
}

// P48 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.1), samma mönster som TECH_CATEGORIES ovan.
const COMMODITIES: readonly Commodity[] = ['oil', 'steel', 'uranium', 'titanium', 'rare_earths']

function uniformCommodityRecord(value: number): Record<Commodity, number> {
  const record = {} as Record<Commodity, number>
  for (const commodity of COMMODITIES) record[commodity] = value
  return record
}

function techLevelWithSpecialisationBonus(
  defaultLevel: number,
  specialisation: TechCategory,
  bonus: number,
): Record<TechCategory, number> {
  const record = uniformCategoryRecord(defaultLevel)
  record[specialisation] = defaultLevel + bonus
  return record
}

// Formen på scenariofilerna i data/scenarios/*.json — en ergonomisk startmall, inte
// samma sak som det färdiga GameState. Hör hemma här och inte i types.ts, eftersom
// den inte är del av avsnitt 2:s datamodell utan bara ett internt inläsningsformat.
// Exporterad sedan P43 — inte del av paketets publika yta (index.ts re-exporterar
// den inte), bara så att buildWorld nedan kan testas direkt mot en konstruerad
// scenariofil (P43:s eget klart-när), samma mönster som andra interna moduler
// redan importeras direkt av sina testfiler (../src/... i stället för paketets
// index) i den här kodbasen.
export interface ScenarioFile {
  id: string
  name: string
  startYear: number
  startQuarter: 1 | 2 | 3 | 4
  turnCount: number
  rivalIds: RivalId[]
  house: {
    name: string
    homeState: House['homeState']
    specialisation: TechCategory
    foundingCapital: number
    debtRateAnnual: number
    lineCount: number
    unitsPerLineTurnDefault: number
    staff: House['staff']
    reputation: House['reputation']
    techLevelDefault: number
    techLevelSpecialisationBonus: number
    station: {
      city: string
      nation: FactionId
      depth: Station['depth']
      coverage: Station['coverage']
    }
    boardTarget: {
      label: string
      dueTurn: number
      metric: BoardTarget['metric']
      threshold: number
      reviewTurns: number[]
    }
  }
  factions: {
    id: string
    name: string
    treasury: number
    militaryBudget: number
    manpower: number
    publicSupport: number
    alignment: number
    relationToPlayer: number
    techLevelDefault: number
  }[]
  // P43 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.1): flertaliga sedan etapp 4 — var
  // singularobjekt fram till och med etapp 3, ett scenario kunde bara ha EN
  // teater och EN front. Ren formatändring: `indochina-slice.json` har
  // fortfarande bara ett element i varje array, se ANDRINGSLOGG.md.
  theatres: {
    id: string
    name: string
    heat: number
  }[]
  fronts: {
    id: string
    // NYTT i P43 — fanns inget behov av att ange det när det bara fanns en
    // teater att tillhöra (den härleddes implicit). Bestämmer vilken teater i
    // `theatres` ovan fronten hör till, alltså vilken `heat`-kurva den delar.
    theatreId: string
    sideA: FactionId
    sideB: FactionId
    attacker: 'a' | 'b'
    position: number
    moraleA: number
    moraleB: number
    strengthA: number
    strengthB: number
    terrainBonus: number
    // P38 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.2): förbandsordningen,
    // en ergonomisk startmall (bara det scenariofilen behöver ange per förband —
    // equipment/readiness/status/engagedWith är alltid samma startvärde, satta av
    // buildWorld nedan, inte upprepade i varje post här).
    formations: {
      id: string
      name: string
      factionId: FactionId
      side: 'a' | 'b'
      sectorId: string
      doctrine: Doctrine
      strength: number
    }[]
  }[]
  // Konsumeras av orders.ts (P4), som avgör det exakta formatet då. Oanvänd här —
  // createInitialState bygger bara startläget, inte framtida turers utlysningar.
  scriptedEvents: unknown[]
}

// Litet, avsiktligt namngivet undantag från annars strikt typning: statisk JSON-data
// har ingen egen körtidsverifiering, och vi litar på att data/*.json matchar formen
// ovan. En felaktig fil ger ett tydligt fel längre ner (t.ex. ett saknat rivalId),
// inte en tyst felaktig typ.
function castJson<T>(value: unknown): T {
  return value as T
}

const SCENARIOS: Record<string, unknown> = {
  'indochina-slice': indochinaSlice,
}

function loadScenario(scenarioId: string): ScenarioFile {
  const raw = SCENARIOS[scenarioId]
  if (!raw) {
    throw new Error(`createInitialState: okänt scenarioId "${scenarioId}"`)
  }
  return castJson<ScenarioFile>(raw)
}

function buildHouse(scenario: ScenarioFile): House {
  const seed = scenario.house

  const lines: ProductionLine[] = Array.from({ length: seed.lineCount }, (_, i) => ({
    id: `line-${i + 1}`,
    productId: null,
    grade: 'A',
    unitsPerTurnAtFull: seed.unitsPerLineTurnDefault,
    capacityPct: 100,
    assignedContractId: null,
    status: 'idle',
    blockedReason: null,
    retoolingUntilTurn: null,
  }))

  const station: Station = {
    id: 'station-1',
    city: seed.station.city,
    nation: seed.station.nation,
    depth: seed.station.depth,
    exposure: 0,
    coverage: seed.station.coverage,
    status: 'active',
  }

  const boardTarget: BoardTarget = {
    label: seed.boardTarget.label,
    dueTurn: seed.boardTarget.dueTurn,
    metric: seed.boardTarget.metric,
    threshold: seed.boardTarget.threshold,
    progressSnapshot: 0,
    reviewTurns: seed.boardTarget.reviewTurns,
    reviewsFailed: 0,
    lastReviewTurn: null,
  }

  return {
    name: seed.name,
    homeState: seed.homeState,
    specialisation: seed.specialisation,
    treasury: seed.foundingCapital,
    debt: 0,
    debtRateAnnual: seed.debtRateAnnual,
    // Härlett av economy.ts (P3) enligt formeln i spec avsnitt 5. Formeln själv,
    // körd på en tom revenueByTurn och debt 0, ger också 0 — så det här är inte en
    // gissning, det råkar bara sammanfalla innan första turen är spelad.
    creditLimit: 0,
    insolventTurns: 0,
    revenueByTurn: [],
    lines,
    rnd: [],
    stations: [station],
    staff: { ...seed.staff },
    reputation: { ...seed.reputation },
    techLevel: techLevelWithSpecialisationBonus(
      seed.techLevelDefault,
      seed.specialisation,
      seed.techLevelSpecialisationBonus,
    ),
    boardTarget,
    exposureEvents: [],
    foundingCapital: seed.foundingCapital,
    creditPenaltyMultiplier: 1,
    unitsPerLineTurnDefault: seed.unitsPerLineTurnDefault,
    // Härlett av economy.ts (P17) enligt formeln i spec 8.1
    // (chiefOfStaff > chiefOfStaffActionBonusThreshold(70) ? 4 : 3). Samma
    // "råkar bara sammanfalla"-motivering som creditLimit ovan: seed.staff.
    // chiefOfStaff är 45 i indochina-slice.json, under tröskeln, så formeln körd
    // på turnollens värden ger 3 — ingen gissning, bara den frusna evalueringen.
    actionPoints: 3,
    scandalUntilTurn: null,
  }
}

function buildFactions(scenario: ScenarioFile): Record<FactionId, Faction> {
  const factions: Record<FactionId, Faction> = {}
  for (const seed of scenario.factions) {
    factions[seed.id] = {
      id: seed.id,
      name: seed.name,
      treasury: seed.treasury,
      militaryBudget: seed.militaryBudget,
      manpower: seed.manpower,
      publicSupport: seed.publicSupport,
      techLevel: uniformCategoryRecord(seed.techLevelDefault),
      alignment: seed.alignment,
      relationToPlayer: seed.relationToPlayer,
      embargoed: false,
      bankrupt: false,
      negativeTreasuryTurns: 0,
      lowSupportTurns: 0,
      materielNeed: uniformCategoryRecord(0),
    }
  }
  return factions
}

function buildRivals(scenario: ScenarioFile): Record<RivalId, RivalHouse> {
  const catalog = castJson<Record<string, RivalHouse>>(rivalsCatalog)
  const rivals: Record<RivalId, RivalHouse> = {}
  for (const id of scenario.rivalIds) {
    const rival = catalog[id]
    if (!rival) {
      throw new Error(`createInitialState: okänt rivalId "${id}" i scenario ${scenario.id}`)
    }
    rivals[id] = {
      ...rival,
      relations: { ...rival.relations },
      reputation: { ...rival.reputation },
      contracts: [],
    }
  }
  return rivals
}

function buildFormations(f: ScenarioFile['fronts'][number]): Formation[] {
  return f.formations.map((seed) => ({
    id: seed.id,
    name: seed.name,
    factionId: seed.factionId,
    frontId: f.id,
    side: seed.side,
    sectorId: seed.sectorId,
    doctrine: seed.doctrine,
    strength: seed.strength,
    // P39: strengthAtFull sätts en gång, vid uppresning — förbandets startstyrka
    // ÄR dess fulla, avsedda styrka (TOE) innan någon strid ägt rum.
    strengthAtFull: seed.strength,
    // Ingen leverans har skett än — samma startpunkt som front.equipment.
    equipment: uniformCategoryRecord(0),
    readiness: 100,
    status: 'active',
    engagedWith: null,
    turnsMauled: 0,
  }))
}

// P43 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.1): flertalig sedan etapp 4 — bygger N
// fronter och N teatrar, i stället för exakt en av varje. Varje front binds till
// sin teater genom sitt EGNA theatreId (scenariodata, inte härlett). Exporterad
// (se ScenarioFile ovan) så P43:s eget klart-när — "ett test visar att buildWorld
// bygger två teatrar med var sin front ur en konstruerad scenariofil" — kan
// testas direkt, utan att gå via den hårdkodade SCENARIOS-katalogen nedan.
export function buildWorld(scenario: ScenarioFile): { theatres: Theatre[]; fronts: Front[] } {
  const fronts: Front[] = scenario.fronts.map((f) => ({
    id: f.id,
    theatreId: f.theatreId,
    sideA: f.sideA,
    sideB: f.sideB,
    position: f.position,
    attacker: f.attacker,
    morale: { a: f.moraleA, b: f.moraleB },
    strength: { a: f.strengthA, b: f.strengthB },
    // Ingen leverans har skett än — inget hus har levererat materiel till fronten.
    equipment: { a: uniformCategoryRecord(0), b: uniformCategoryRecord(0) },
    supplyStress: { a: 0, b: 0 },
    terrainBonus: f.terrainBonus,
    attribution: {},
    casualtiesTotal: { a: 0, b: 0 },
    lastClampedAdvantage: 0,
    lastCasualtyEventId: null,
    trace: [f.position],
    formations: buildFormations(f),
  }))

  const theatres: Theatre[] = scenario.theatres.map((t) => ({
    id: t.id,
    name: t.name,
    heat: t.heat,
    frontIds: fronts.filter((front) => front.theatreId === t.id).map((front) => front.id),
    deliveriesIntoActiveWarThisTurn: 0,
  }))

  return { theatres, fronts }
}

export function createInitialState(scenarioId: string, seed: string): GameState {
  const scenario = loadScenario(scenarioId)
  const { theatres, fronts } = buildWorld(scenario)

  return {
    meta: {
      scenarioId: scenario.id,
      version: 1,
      turn: 0,
      year: scenario.startYear,
      quarter: scenario.startQuarter,
      seed,
      rngCursor: 0,
    },
    house: buildHouse(scenario),
    factions: buildFactions(scenario),
    fronts: Object.fromEntries(fronts.map((front) => [front.id, front])),
    rivals: buildRivals(scenario),
    theatres: Object.fromEntries(theatres.map((theatre) => [theatre.id, theatre])),
    market: {
      openOrders: [],
      contracts: [],
      shipments: [],
      commodities: uniformCommodityRecord(100),
      supplyCostIndex: 100,
      restrictedRevenueThisTurn: 0,
    },
    pendingFormationReplacements: [],
    doomsday: 0,
    doomsdayPeak: 0,
    wire: [],
    status: { kind: 'active' },
    pendingCrisis: null,
  }
}

export function cloneState(state: GameState): GameState {
  // GameState ska per definition (avsnitt 2.2) kunna JSON.stringify:as och läsas
  // tillbaka utan förlust. JSON-runtrippen är därför en korrekt, fullständig djup
  // kopia i sig själv och kräver inga extra globaler (t.ex. structuredClone) som
  // skulle dra in DOM/Node-typer i en kärna som ska förbli headless.
  return JSON.parse(JSON.stringify(state)) as GameState
}
