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
  Faction,
  FactionId,
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
interface ScenarioFile {
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
  theatre: {
    id: string
    name: string
    heat: number
  }
  front: {
    id: string
    sideA: FactionId
    sideB: FactionId
    attacker: 'a' | 'b'
    position: number
    moraleA: number
    moraleB: number
    strengthA: number
    strengthB: number
    terrainBonus: number
  }
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
    rivals[id] = { ...rival }
  }
  return rivals
}

function buildWorld(scenario: ScenarioFile): { theatre: Theatre; front: Front } {
  const f = scenario.front

  const front: Front = {
    id: f.id,
    theatreId: scenario.theatre.id,
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
  }

  const theatre: Theatre = {
    id: scenario.theatre.id,
    name: scenario.theatre.name,
    heat: scenario.theatre.heat,
    frontIds: [front.id],
    deliveriesIntoActiveWarThisTurn: 0,
  }

  return { theatre, front }
}

export function createInitialState(scenarioId: string, seed: string): GameState {
  const scenario = loadScenario(scenarioId)
  const { theatre, front } = buildWorld(scenario)

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
    fronts: { [front.id]: front },
    rivals: buildRivals(scenario),
    theatres: { [theatre.id]: theatre },
    market: {
      openOrders: [],
      contracts: [],
      shipments: [],
      supplyCostIndex: 100,
    },
    doomsday: 0,
    doomsdayPeak: 0,
    wire: [],
    status: { kind: 'active' },
  }
}

export function cloneState(state: GameState): GameState {
  // GameState ska per definition (avsnitt 2.2) kunna JSON.stringify:as och läsas
  // tillbaka utan förlust. JSON-runtrippen är därför en korrekt, fullständig djup
  // kopia i sig själv och kräver inga extra globaler (t.ex. structuredClone) som
  // skulle dra in DOM/Node-typer i en kärna som ska förbli headless.
  return JSON.parse(JSON.stringify(state)) as GameState
}
