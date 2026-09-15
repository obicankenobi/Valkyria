// Alla interfaces. Inga funktioner — se CLAUDE.md, arbetssätt, och avsnitt 1 i
// ETAPP1_TEKNISK_SPEC.md. Innehållet är avsnitt 2 (P1) och avsnitt 3.1/3
// (resolveTurns kontrakt, P2), ordagrant där specen ger en form.

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
    // shipments: inte i avsnitt 2 — se ANDRINGSLOGG.md. Krävs för att implementera
    // "Leveranser anländer 1–3 turer efter produktionen" (avsnitt 5), som inte har
    // någon egen datamodell i specen. Producerade-men-inte-levererade enheter,
    // borttagna ur listan när de anländer (deliveries.ts).
    shipments: Shipment[]
    supplyCostIndex: number // 100 = baseline. Multiplicerar KOSTNAD, inte pris.
    // Inte i avsnitt 2 — se ANDRINGSLOGG.md (P20). Transient, självnollställande
    // räknare, samma mönster som Theatre.deliveriesIntoActiveWarThisTurn: deliveries.ts
    // fyller på den, doomsday.ts läser (och kopierar in i pendingCrisis) i samma
    // steg-passage. Ger BACK_DOWN (avsnitt 9.3, "kvartalets restricted-intäkt
    // annulleras") ett tal att annullera utan en hel ny per-tur-array på House.
    restrictedRevenueThisTurn: Money
  }
  doomsday: Pct
  doomsdayPeak: Pct // för RESTRAINT i epilogen
  // ETAPP1_5_TEKNISK_SPEC.md avsnitt 9.2/9.3 — satt av doomsday.ts när doomsday
  // korsar doomsdayCrisisEventThreshold, null annars. Nästa TurnSubmission måste
  // innehålla en CRISIS-handling (annars väljs BACK_DOWN automatiskt) —
  // applyActions.ts, som kör FÖRST i pipelinen, läser och nollställer fältet.
  pendingCrisis: { turn: number; theatreId: TheatreId; restrictedRevenueThisTurn: Money } | null
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
  // Inte i avsnitt 2 — se ANDRINGSLOGG.md. board.ts (P8) behöver husets ursprungliga
  // kapital för att räkna progressSnapshot ("Doubling" = kumulativ intäkt når 2×
  // det här talet) — treasury muteras redan från och med P3, så startvärdet finns
  // annars ingenstans kvar att läsa efter tur 0.
  foundingCapital: Money
  // Inte i avsnitt 2 — se ANDRINGSLOGG.md. board.ts (P8): "skärpta lånevillkor" vid
  // en underkänd styrelsekontroll (spec 5, "Board") behöver en faktisk mekanisk
  // effekt. economy.ts (P3, patchad) multiplicerar creditLimit med det här talet.
  // Default 1 (ingen effekt) tills en kontroll faktiskt underkänns.
  creditPenaltyMultiplier: number
  // Inte i avsnitt 2 — se ANDRINGSLOGG.md (P16). production.ts (avsnitt 4.1) behöver
  // scenariots unitsPerLineTurnDefault för att räkna lineEfficiency = en linjes
  // unitsPerTurnAtFull / detta tal — en linjekvalitetsfaktor som är 1,0 för alla
  // linjer i dagens scenario men ger BUILD_LINE (avsnitt 8) något att variera.
  // Samma mönster som foundingCapital ovan: ett scenario-frö som bara fanns i
  // state.ts:s inläsning tills en senare prompt behövde läsa det efter tur 0.
  unitsPerLineTurnDefault: number
  // ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.1 — härlett, skrivs bara av economy.ts
  // (samma mönster som creditLimit): 4 om staff.chiefOfStaff > tröskeln, annars 3.
  // Beräknat för NÄSTA tur (economy.ts kör sist i pipelinen; applyActions, som
  // faktiskt läser fältet, kör FÖRST — se applyActions.ts).
  actionPoints: number
  // ETAPP1_5_TEKNISK_SPEC.md avsnitt 5.1 — satt av deliveries.ts vid en
  // grade-skandal (turn + qualityScandalTurns), null när ingen skandal är aktiv.
  // Läst av economy.ts (creditLimit multipliceras med scandalCreditPenalty medan
  // aktiv) och nollställd av deliveries.ts själv när turen faktiskt nås
  // (reputation.quality återställs samtidigt).
  scandalUntilTurn: number | null
}

export interface BoardTarget {
  label: string // "Doubling"
  dueTurn: number
  metric: 'revenue' | 'buyers' | 'techParity' | 'debtRatio'
  threshold: number
  // Uppdateras varje tur av board.ts (P8), visas i UI. KONTRAKT (utnyttjat redan av
  // endings.ts, P3): normaliserat så att `progressSnapshot >= threshold` alltid
  // betyder "målet nått", oavsett metric. För 'debtRatio', där en LÄGRE siffra är
  // bättre, är det board.ts:s jobb att räkna om till den gemensamma riktningen (t.ex.
  // spara avståndet till målet, inte den råa kvoten) — inte att invertera jämförelsen
  // hos varje konsument.
  progressSnapshot: number
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
  // 'retooling' (P27, ETAPP2_TEKNISK_SPEC.md avsnitt 3.2) — linjen har bytt
  // productId och producerar ingenting under retoolingUntilTurn.
  status: 'idle' | 'running' | 'blocked' | 'retooling'
  blockedReason: string | null
  retoolingUntilTurn: number | null
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
  // ETAPP1_5_TEKNISK_SPEC.md avsnitt 4.2: per-produkt ordervolym, eftersom
  // balance.json:s globala orderQuantityMin/Max blev orimliga när produktionstakten
  // (unitsPerLineTurn) gick från en platt konstant till en per-produkt siffra
  // (avsnitt 4.1) — 20 gevär är ingen order, 185 kärnvapengranater är ett krig.
  // Frånvarande = fall tillbaka på balance.json:s globala tal (orders.ts).
  orderQuantityMin?: number
  orderQuantityMax?: number
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
  // P27 (ETAPP2_TEKNISK_SPEC.md avsnitt 3.1): id:t på den WireEvent som satte
  // kontraktet 'late' — specens egen pseudokod kräver den som causeId när
  // kontraktet senare blir 'voided' (CLAUDE.md hård regel 4, kedjad orsak).
  lateEventId: string | null
}

// Inte i avsnitt 2 — se ANDRINGSLOGG.md. production.ts (P5) skapar en Shipment när
// en linje producerar enheter mot ett kontrakt; deliveries.ts (P5) tar bort den när
// arrivalTurn nås och bokför leveransen. Contract.unitsDelivered räknar bara det som
// FAKTISKT anlänt — enheter i transit finns bara här, aldrig dubbelräknade.
export interface Shipment {
  id: string
  contractId: string
  units: number
  arrivalTurn: number
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
  // Inte i avsnitt 2 — se ANDRINGSLOGG.md. House har insolventTurns för samma syfte
  // (spec 2.3); Faction saknade motsvarande räknare trots att avsnitt 5 kräver dem
  // ("treasury < 0 i två turer", "publicSupport < 25 i tre turer").
  negativeTreasuryTurns: number
  lowSupportTurns: number
}

export interface Theatre {
  id: string
  name: string
  heat: Pct
  frontIds: FrontId[]
  // Inte i avsnitt 2 — se ANDRINGSLOGG.md. Transient, självnollställande räknare:
  // deliveries.ts fyller på den när materiel når en front i den här teatern,
  // heat.ts läser och nollställer den i samma steg. Enda sättet att ge
  // heatFromDeliveries-formeln (spec 5) det den behöver ("denna turs leveranser")
  // utan en resolveTurn-intern scratch-kanal ResolveContext inte har.
  deliveriesIntoActiveWarThisTurn: number
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
  // P43 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 3.1/3.3): resolve/steps/
  // attrition.ts körs i ett EGET pipeline-steg direkt efter fronts, och behöver
  // fronts.ts:s clampedAdvantage samt causeId:t till turens förlust-ticker — data
  // som annars bara finns lokalt inuti fronts.ts:s resolveFront. Samma mönster som
  // Theatre.deliveriesIntoActiveWarThisTurn (P6): enda sättet att flytta ett värde
  // mellan två separata pipelinepassager utan att bryta ResolveContext:s frysta
  // form. Skrivs bara när resolveFront faktiskt kör (dvs. fronten inte stagnerar);
  // attrition.ts upprepar samma stagnationskontroll och läser dem aldrig annars.
  lastClampedAdvantage: number
  lastCasualtyEventId: string | null
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

  // NYA (P24, ETAPP2_TEKNISK_SPEC.md avsnitt 2.1) — stänger spec 4.4:s ursprungliga
  // prosa ("Rivaler poängsätts med samma formel men med relationTerm och repTerm
  // från deras egna värden"), som P4 var tvungen att arbeta runt eftersom fälten
  // inte fanns.
  homeState: 'neutral' | 'west' | 'east'
  relations: Record<FactionId, Pct> // samma roll som Faction.relationToPlayer
  reputation: { quality: Pct; reliability: Pct }
  contracts: RivalContract[] // se RivalContract, byggs av P25

  // NY (P26, ETAPP2_TEKNISK_SPEC.md avsnitt 2.4) — "en gång per
  // rivalSupplyPlayCooldownTurns" kräver ett spårat "senast använd"-tillstånd.
  // Inte i avsnitt 2.1:s egen datamodell (specen ger bara balansfälten, inte en
  // implementationsmekanism för kadensen) — se ANDRINGSLOGG.md, samma sorts
  // nödvändiga, PROVISORISKA tillägg som house.foundingCapital/scandalUntilTurn.
  supplyPlayCooldownUntilTurn: number | null
}

// Se ETAPP2_TEKNISK_SPEC.md avsnitt 2.1/2.3. Symmetrisk motsvarighet till Contract,
// men för en rival — 'voided' tillagt (granskning inför antagande) så att samma
// sena-kontrakt-eskalering (avsnitt 3.1) kan gälla en rival, inte bara spelaren.
export interface RivalContract {
  id: string
  buyerId: FactionId
  productId: ProductId
  quantity: number
  unitsDelivered: number
  dueTurn: number
  status: 'active' | 'fulfilled' | 'late' | 'voided'
  // Se Contract.lateEventId (P27) — samma roll, symmetrisk för en rival.
  lateEventId: string | null
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

// ── 3. resolveTurn — kontraktet, 3.1 Handlingar ──────────────────────────────

export type PlayerAction =
  | { type: 'BROKER'; buyerId: FactionId; productId: ProductId; quantity: number; price: Money }
  | { type: 'INTEL'; op: IntelOp; stationId: string; targetId?: string }
  | { type: 'POLITICAL'; op: PoliticalOp; targetFactionId: FactionId; spend: Money }
  | { type: 'MARKET'; op: 'BUY_FORWARD' | 'RELEASE'; spend: Money }
  | { type: 'INTERNAL'; op: InternalOp; payload: Record<string, unknown> }
  // Avsnitt 9.2 — den ENDA ändringen av den här unionen i hela etapp 1,5. Kostar
  // ingen actionPoint (krisen är inte valfri) — applyActions.ts hanterar den
  // separat från handlingstaket, se den filens huvudkommentar.
  | { type: 'CRISIS'; choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE' }

export type IntelOp = 'RECRUIT' | 'LEAK' | 'SABOTAGE' | 'TURN' | 'WITHDRAW' | 'EXPAND'
export type PoliticalOp = 'BRIBE' | 'STAGE_INCIDENT' | 'BACK_CHANNEL'
export type InternalOp = 'BUILD_LINE' | 'HIRE' | 'REPRIORITISE_RND' | 'TAKE_LOAN' | 'REPAY'

// QUOTE är inte en PlayerAction. Bud ligger i TurnSubmission.bids och kostar inga
// handlingspoäng. Se spec 3.1. ASSASSINATE finns inte i IntelOp i etapp 1 och ska
// inte läggas till (spec 3.1, DESIGN.md avsnitt 9).

// StandingOrderChange nämns i TurnSubmission (spec 3, "standingOrders:
// StandingOrderChange[]") men definieras aldrig — varken formen eller vilken prompt
// som ska bearbeta den anges i avsnitt 10:s promptsekvens. Se ANDRINGSLOGG.md
// 2026-09-13 "StandingOrderChange saknar definition". applyActions är ett no-op i
// P2 och läser aldrig innehållet, så den här platshållaren låser bara typen
// tillräckligt för att TurnSubmission ska gå att bygga och skicka ett tomt fält —
// den riktiga formen (troligen en diskriminerad union per DESIGN.md §4:
// produktionslinjer, R&D-kö, leverantörsavtal, prisgolv, stationers
// underhållsläge) är en design­fråga som ska beslutas separat innan en prompt
// faktiskt bearbetar standing orders.
export interface StandingOrderChange {
  kind: string
  payload: Record<string, unknown>
}

export interface TurnSubmission {
  standingOrders: StandingOrderChange[]
  bids: Bid[] // obegränsat antal, kostar inga action points
  actions: PlayerAction[] // max house.actionPoints st
}

export interface TurnResult {
  state: GameState
  wire: WireEvent[] // endast denna turs händelser
  rejected: { action: PlayerAction | Bid; reason: string }[]
}

// ── 4.3 Vad spelaren får se ──────────────────────────────────────────────────

export interface BidEstimate {
  rivalPriceLow: Money
  rivalPriceHigh: Money
  lowestRivalHouse: RivalId | null // endast depth >= 4
  winBand: { price: Money; confidence: Pct }[]
  yourUnitCost: Money // alltid exakt — du känner din egen verkstad
}
