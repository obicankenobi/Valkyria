// Alla interfaces. Inga funktioner — se CLAUDE.md, arbetssätt, och avsnitt 1 i
// ETAPP1_TEKNISK_SPEC.md. Innehållet är avsnitt 2 i den specen, ordagrant.

// ── 2.1 Grundtyper ──────────────────────────────────────────────────────────

export type Money = number // hela £, aldrig decimaler. Se money.ts och 7.4.
export type Pct = number // 0–100
export type FactionId = string
export type FrontId = string
export type RivalId = string
export type TheatreId = string
export type ProductId = string

export type TechCategory =
  | 'infantry'
  | 'artillery'
  | 'armour'
  | 'aviation'
  | 'naval'
  | 'electronics'

export type Grade = 'A' | 'B' | 'C'

// ── 2.2 GameState ────────────────────────────────────────────────────────────
//
// GameState är den enda sanningen. Allt som behövs för att fortsätta ett parti
// ligger här och ingenting annat. Den ska kunna JSON.stringify:as och läsas
// tillbaka utan förlust.

export interface GameState {
  meta: {
    scenarioId: string
    version: number // schemaversion, för migrering av saves
    turn: number // 0-indexerad
    year: number
    quarter: 1 | 2 | 3 | 4
    seed: string
    rngCursor: number // hur många tal som dragits, gör resolve reproducerbar
  }
  house: House
  factions: Record<FactionId, Faction>
  fronts: Record<FrontId, Front>
  rivals: Record<RivalId, RivalHouse>
  theatres: Record<TheatreId, Theatre>
  market: {
    openOrders: Order[]
    contracts: Contract[]
    supplyCostIndex: number // 100 = baseline. Multiplicerar KOSTNAD, inte pris.
  }
  doomsday: Pct
  doomsdayPeak: Pct // för RESTRAINT i epilogen
  wire: WireEvent[] // rullande fönster, se 2.6
  status: GameStatus
}

export type GameStatus = { kind: 'active' } | { kind: 'ended'; ending: EndingCode; turn: number }

export type EndingCode = 'INSOLVENCY' | 'BUYOUT' | 'EXPOSURE' | 'NUCLEAR_EXCHANGE' | 'SCENARIO_COMPLETE'

// ── 2.3 House ─────────────────────────────────────────────────────────────

export interface House {
  name: string
  homeState: 'neutral' | 'west' | 'east'
  specialisation: TechCategory
  treasury: Money
  debt: Money
  debtRateAnnual: number // 0.04–0.11
  creditLimit: Money // härlett, skrivs om varje tur i economy. Se 5.
  insolventTurns: number // 3 i rad → INSOLVENCY
  revenueByTurn: Money[] // index = turn. Underlag för kredit och styrelsemål.
  lines: ProductionLine[]
  rnd: RndProject[]
  stations: Station[]
  staff: {
    chiefEngineer: Pct // R&D-hastighet
    chiefSalesman: Pct // anbudsprecision och relationsvinst
    chiefOfStaff: Pct // >70 ger 4 executive actions
  }
  reputation: {
    quality: Pct // faller vid grade C-skandal
    reliability: Pct // faller vid missad leveransdeadline
    westStanding: Pct
    eastStanding: Pct
  }
  techLevel: Record<TechCategory, number> // 0–10
  boardTarget: BoardTarget
  exposureEvents: number[] // turnindex för exponerade stationer
}

export interface BoardTarget {
  label: string // "Doubling"
  dueTurn: number
  metric: 'revenue' | 'buyers' | 'techParity' | 'debtRatio'
  threshold: number
  progressSnapshot: number // uppdateras varje tur, visas i UI
  reviewTurns: number[] // [8, 14] i 20-turersskivan
  reviewsFailed: number // två i rad → BUYOUT
  lastReviewTurn: number | null
}

export interface ProductionLine {
  id: string
  productId: ProductId | null
  grade: Grade
  unitsPerTurnAtFull: number
  capacityPct: Pct
  assignedContractId: string | null
  status: 'idle' | 'running' | 'blocked'
  blockedReason: string | null
}

export interface RndProject {
  id: string
  category: TechCategory
  turnsRemaining: number
  turnsTotal: number
}

export interface Station {
  id: string
  city: string
  nation: FactionId
  depth: 0 | 1 | 2 | 3 | 4 | 5
  exposure: Pct
  coverage: ('procurement' | 'military' | 'cabinet' | 'industry')[]
  status: 'active' | 'dormant' | 'burned'
}

// creditLimit är härlett och får aldrig redigeras utanför economy.ts. Det ligger i
// state enbart för att UI ska kunna visa det och för att applyActions ska kunna
// avvisa ett TAKE_LOAN utan att räkna om formeln. Formeln står i spec avsnitt 5.

// ── 2.4 Marknad och produkt ──────────────────────────────────────────────────

export interface Product {
  id: ProductId
  name: string
  category: TechCategory
  baseCost: Money // referenspriskomponent, det köparen förväntas betala
  unitCost: Money // vad det kostar DIG att bygga en enhet, grade A
  unitsPerLineTurn: number
  minDelivery: number
  techRequired: number
  restricted: boolean // korsar blocklinjen / rör kärnvapentröskeln
  doomsdayOnDelivery: [number, number] | null // min/max, endast om restricted
}

// baseCost och unitCost är två skilda tal och ska hållas isär överallt. baseCost är
// marknadens förväntan, unitCost är verkstadsgolvet. Marginalen mellan dem är spelet.

export interface Order {
  id: string
  buyerId: FactionId
  productId: ProductId
  quantity: number
  statedBudget: Money // kan vara lögn, se trueBudget
  trueBudget: Money // dold. Bud över detta kan inte vinna, se 4.4.
  referencePrice: Money // FRYST vid ordergenerering. Se 4.1.
  requiredDeliveryTurns: number
  expiresTurn: number // invariant: > den tur ordern skapades
  competingRivals: RivalId[]
  weights: {
    // dolda, summerar till 1
    price: number
    delivery: number
    relationship: number
  }
  inspectorIntegrity: Pct // dold, avgör mutans effekt
}

export interface Bid {
  orderId: string
  price: Money
  deliveryTurns: number
  grade: Grade
  bribe: Money
}

export interface Contract {
  id: string
  buyerId: FactionId
  productId: ProductId
  quantity: number
  unitsDelivered: number
  price: Money
  unitCostAtSigning: Money // låst, så marginalen går att visa och revidera
  grade: Grade
  dueTurn: number
  status: 'active' | 'fulfilled' | 'late' | 'voided'
}

// ── 2.5 Värld ─────────────────────────────────────────────────────────────

export interface Faction {
  id: string
  name: string
  treasury: Money
  militaryBudget: Money // det som faktiskt kan köpa av dig
  manpower: number
  publicSupport: Pct
  techLevel: Record<TechCategory, number>
  alignment: number // -100 öst … +100 väst
  relationToPlayer: Pct
  embargoed: boolean
  bankrupt: boolean
}

export interface Theatre {
  id: string
  name: string
  heat: Pct
  frontIds: FrontId[]
}

export interface Front {
  id: string
  theatreId: TheatreId
  sideA: FactionId
  sideB: FactionId
  position: number // -100 (A vunnit) … +100 (B vunnit)
  attacker: 'a' | 'b'
  morale: { a: Pct; b: Pct }
  strength: { a: number; b: number }
  equipment: {
    a: Record<TechCategory, number>
    b: Record<TechCategory, number>
  }
  supplyStress: { a: Pct; b: Pct }
  terrainBonus: number // -20 … +20, gynnar försvararen
  attribution: Record<string, number> // houseId | rivalId → levererade enheter
  casualtiesTotal: { a: number; b: number }
}

export interface RivalHouse {
  id: RivalId
  name: string
  specialisation: TechCategory
  aggression: Pct // hur lågt de lägger sina bud
  temperament: 'opportunist' | 'patriot' | 'cautious'
  capital: Money
  marketShare: Pct
  sabotagedUntilTurn: number | null
}

// ── 2.6 WireEvent ────────────────────────────────────────────────────────────

export interface WireEvent {
  id: string // `${turn}-${seq}`
  turn: number
  severity: 'headline' | 'report' | 'ticker'
  scope: 'house' | 'faction' | 'front' | 'market' | 'global'
  headline: string // engelska, färdig spelvänd text
  causeId: string | null // id på den WireEvent som orsakade denna
  delta: Record<string, number> // faktiska modelländringar, för felsökning och UI
  actorIsPlayer: boolean
  subjectId: string | null // faction/front/rival som händelsen rör
}
