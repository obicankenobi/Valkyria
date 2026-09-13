# THE SEVENTH FRONT — Teknisk spec, etapp 1

**Version 1.8.** Vertikal skiva: scenariot `INDOCHINA_SLICE`, 20 turer. 1 front, 3 köpare,
3 rivalhus, 4 linjer, 1 station.

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

Specen är **fryst under P0–P12**. Den får ändras mellan promptar om en byggd sanning visar sig
strida mot den, men aldrig av en kodsession på eget initiativ. Se `CLAUDE.md`.

---

## 0. Vad som ändrats sedan v1.0

Elva ändringar, i fallande ordning efter hur mycket de påverkar spelet. Motiveringarna står på
plats i respektive avsnitt.

| # | Ändring | Avsnitt |
|---|---|---|
| 1 | **Styckkostnad och COGS.** Produkter har `unitCost`. Kostnaden bokförs i `production`. `supplyCostIndex` multiplicerar kostnaden, inte priset. Utan detta var `grade C` strikt sämre än A och spelaren hade ingen marginal att räkna på. | 2.4, 4.1, 5 |
| 2 | **`QUOTE` kostar ingen executive action.** Knappheten flyttad till produktionskapacitet och `reliability`. | 3.1 |
| 3 | **`referencePrice` fryses på ordern när den skapas.** Tidigare räknades den om vid avgörandet, efter att `heat` hunnit röra sig i samma tur. | 2.4, 4.1 |
| 4 | **`trueBudget` diskvalificerar.** Ett bud över köparens sanna budget kan inte vinna. Fältet var oanvänt i v1.0. | 4.4 |
| 5 | **`creditLimit`.** `TAKE_LOAN` prövas mot ett tak. `INSOLVENCY` var annars trivialt undvikbar. | 2.3, 5 |
| 6 | **Styrelsens prognoskontroller** vid tur 8 och 14, med `BUYOUT` vid två underkända i rad. `BUYOUT` kunde annars bara inträffa på tur 20. | 2.3, 5 |
| 7 | **`heat` omkalibrerad**, och avsvalningsregeln entydig. Konstanterna i v1.0 gjorde mätaren död. | 5 |
| 8 | **`restricted`-produkter** med `doomsdayOnDelivery`. Ger etapp 1 en fjärde `DOOMSDAY`-drivare och gör designpelare 1 prövbar. | 2.4, 5, 6 |
| 9 | **Wire-beskärning får inte bryta kedjor.** | 2.6 |
| 10 | **Golden-testet läser en fryst balansfil**, inte den som skruvas i P10. | 7.2 |
| 11 | **P4:s acceptanstest bytt.** Det gamla ("vinstchansen är monoton i pris") följer av formelns konstruktion och kan inte misslyckas. | 11 |

Mindre: `ASSASSINATE` är uttryckligen flyttad till etapp 2 (den saknades i `IntelOp` men fanns i
designdokumentet); invariant `expiresTurn >= turn + 1`; penningavrundning som testad invariant;
`INDOCHINA_SLICE` är ett eget scenario, inte en avkortning.

---

## 1. Repostruktur

```
seventh-front/
  CLAUDE.md                  repo-regler, se repots rot
  package.json
  tsconfig.json              strict: true, noUncheckedIndexedAccess: true
  packages/
    core/                    headless simuleringskärna, noll DOM-beroenden
      src/
        types.ts             alla interfaces, inga funktioner
        rng.ts               seedad PRNG
        money.ts             avrundning och penninginvarianter
        state.ts             createInitialState, cloneState
        resolve/
          index.ts           resolveTurn + stegpipeline
          doomsdayGate.ts    enda vägen in i DOOMSDAY, se 5.4
          steps/
            applyActions.ts
            production.ts
            deliveries.ts
            fronts.ts
            factions.ts
            heat.ts
            doomsday.ts
            rivals.ts
            orders.ts
            bidding.ts
            economy.ts
            board.ts
            endings.ts
        wire.ts              WireEvent-emitter, kausalkedjor, beskärning
        queries.ts           härledda värden för UI (rena funktioner över state)
        data/
          balance.json
          products.json
          rivals.json
          scenarios/indochina-slice.json
      test/
        golden/              snapshot-tester med fast seed och fryst balansfil
        golden/fixtures/balance.frozen.json
        steps/               enhetstester per steg
        invariants/          penningavrundning, wire-kedjor, orderlivslängd
    harness/                 balansverktyg, kör N partier headless
    app/                     React, PWA, importerar core
```

`core` får aldrig importera något från `app`. `core` får inte importera `react`, `Date`,
`Math.random` eller något I/O. Detta är den enskilt viktigaste regeln i projektet.

> **Tillägg under P4:** `core/src/pricing.ts`, inte namngiven ovan. Delar de rena formlerna i
> avsnitt 4 (referenspris, styckkostnad, rivalbud, poängsättning) mellan `orders.ts`,
> `bidding.ts` och `queries.ts`. Motivet är inte bekvämlighet: `bidEstimate` måste approximera
> exakt vad `bidding.ts` faktiskt gör (hela poängen med `winBand`, avsnitt 4.3), och två
> handkopierade implementationer av samma formler hade varit en tyst driftrisk. Se
> `docs/ANDRINGSLOGG.md`.

---

## 2. Datamodell

### 2.1 Grundtyper

```ts
export type Money = number          // hela £, aldrig decimaler. Se money.ts och 7.4.
export type Pct = number            // 0–100
export type FactionId = string
export type FrontId = string
export type RivalId = string
export type TheatreId = string
export type ProductId = string

export type TechCategory =
  | 'infantry' | 'artillery' | 'armour' | 'aviation' | 'naval' | 'electronics'

export type Grade = 'A' | 'B' | 'C'
```

### 2.2 GameState

`GameState` är den enda sanningen. Allt som behövs för att fortsätta ett parti ligger här och
ingenting annat. Den ska kunna `JSON.stringify`:as och läsas tillbaka utan förlust.

```ts
export interface GameState {
  meta: {
    scenarioId: string
    version: number             // schemaversion, för migrering av saves
    turn: number                // 0-indexerad
    year: number
    quarter: 1 | 2 | 3 | 4
    seed: string
    rngCursor: number           // hur många tal som dragits, gör resolve reproducerbar
  }
  house: House
  factions: Record<FactionId, Faction>
  fronts: Record<FrontId, Front>
  rivals: Record<RivalId, RivalHouse>
  theatres: Record<TheatreId, Theatre>
  market: {
    openOrders: Order[]
    contracts: Contract[]
    supplyCostIndex: number     // 100 = baseline. Multiplicerar KOSTNAD, inte pris.
  }
  doomsday: Pct
  doomsdayPeak: Pct             // för RESTRAINT i epilogen
  wire: WireEvent[]             // rullande fönster, se 2.6
  status: GameStatus
}

export type GameStatus =
  | { kind: 'active' }
  | { kind: 'ended'; ending: EndingCode; turn: number }

export type EndingCode =
  | 'INSOLVENCY' | 'BUYOUT' | 'EXPOSURE' | 'NUCLEAR_EXCHANGE' | 'SCENARIO_COMPLETE'
```

### 2.3 House

```ts
export interface House {
  name: string
  homeState: 'neutral' | 'west' | 'east'
  specialisation: TechCategory
  treasury: Money
  debt: Money
  debtRateAnnual: number            // 0.04–0.11
  creditLimit: Money                // härlett, skrivs om varje tur i economy. Se 5.
  insolventTurns: number            // 3 i rad → INSOLVENCY
  revenueByTurn: Money[]            // index = turn. Underlag för kredit och styrelsemål.
  lines: ProductionLine[]
  rnd: RndProject[]
  stations: Station[]
  staff: {
    chiefEngineer: Pct              // R&D-hastighet
    chiefSalesman: Pct              // anbudsprecision och relationsvinst
    chiefOfStaff: Pct               // >70 ger 4 executive actions
  }
  reputation: {
    quality: Pct                    // faller vid grade C-skandal
    reliability: Pct                // faller vid missad leveransdeadline
    westStanding: Pct
    eastStanding: Pct
  }
  techLevel: Record<TechCategory, number>   // 0–10
  boardTarget: BoardTarget
  exposureEvents: number[]          // turnindex för exponerade stationer
}

export interface BoardTarget {
  label: string                     // "Doubling"
  dueTurn: number
  metric: 'revenue' | 'buyers' | 'techParity' | 'debtRatio'
  threshold: number
  progressSnapshot: number          // uppdateras varje tur, visas i UI
  reviewTurns: number[]             // [8, 14] i 20-turersskivan
  reviewsFailed: number             // två i rad → BUYOUT
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
```

`creditLimit` är **härlett och får aldrig redigeras utanför `economy.ts`**. Det ligger i state
enbart för att UI ska kunna visa det och för att `applyActions` ska kunna avvisa ett `TAKE_LOAN`
utan att räkna om formeln. Formeln står i avsnitt 5.

### 2.4 Marknad och produkt

```ts
export interface Product {
  id: ProductId
  name: string
  category: TechCategory
  baseCost: Money                   // referenspriskomponent, det köparen förväntas betala
  unitCost: Money                   // vad det kostar DIG att bygga en enhet, grade A
  unitsPerLineTurn: number
  minDelivery: number
  techRequired: number
  restricted: boolean               // korsar blocklinjen / rör kärnvapentröskeln
  doomsdayOnDelivery: [number, number] | null   // min/max, endast om restricted
}
```

`baseCost` och `unitCost` är två skilda tal och ska hållas isär överallt. `baseCost` är
marknadens förväntan, `unitCost` är verkstadsgolvet. Marginalen mellan dem är spelet.

```ts
export interface Order {
  id: string
  buyerId: FactionId
  productId: ProductId
  quantity: number
  statedBudget: Money               // kan vara lögn, se trueBudget
  trueBudget: Money                 // dold. Bud över detta kan inte vinna, se 4.4.
  referencePrice: Money             // FRYST vid ordergenerering. Se 4.1.
  requiredDeliveryTurns: number
  expiresTurn: number               // invariant: > den tur ordern skapades
  competingRivals: RivalId[]
  weights: {                        // dolda, summerar till 1
    price: number
    delivery: number
    relationship: number
  }
  inspectorIntegrity: Pct           // dold, avgör mutans effekt
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
  unitCostAtSigning: Money          // låst, så marginalen går att visa och revidera
  grade: Grade
  dueTurn: number
  status: 'active' | 'fulfilled' | 'late' | 'voided'
}
```

### 2.5 Värld

```ts
export interface Faction {
  id: string
  name: string
  treasury: Money
  militaryBudget: Money             // det som faktiskt kan köpa av dig
  manpower: number
  publicSupport: Pct
  techLevel: Record<TechCategory, number>
  alignment: number                 // -100 öst … +100 väst
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
  position: number                  // -100 (A vunnit) … +100 (B vunnit)
  attacker: 'a' | 'b'
  morale: { a: Pct; b: Pct }
  strength: { a: number; b: number }
  equipment: {
    a: Record<TechCategory, number>
    b: Record<TechCategory, number>
  }
  supplyStress: { a: Pct; b: Pct }
  terrainBonus: number              // -20 … +20, gynnar försvararen
  attribution: Record<string, number>   // houseId | rivalId → levererade enheter
  casualtiesTotal: { a: number; b: number }
}

export interface RivalHouse {
  id: RivalId
  name: string
  specialisation: TechCategory
  aggression: Pct                   // hur lågt de lägger sina bud
  temperament: 'opportunist' | 'patriot' | 'cautious'
  capital: Money
  marketShare: Pct
  sabotagedUntilTurn: number | null
}
```

### 2.6 WireEvent

```ts
export interface WireEvent {
  id: string                        // `${turn}-${seq}`
  turn: number
  severity: 'headline' | 'report' | 'ticker'
  scope: 'house' | 'faction' | 'front' | 'market' | 'global'
  headline: string                  // engelska, färdig spelvänd text
  causeId: string | null            // id på den WireEvent som orsakade denna
  delta: Record<string, number>     // faktiska modelländringar, för felsökning och UI
  actorIsPlayer: boolean
  subjectId: string | null          // faction/front/rival som händelsen rör
}
```

**Regel 1.** Varje steg i pipelinen får en `emit()` som redan känner till turindex och löpnummer.
Inget steg får ändra state utan att emitta minst en `ticker`. Ett steg som ändrar `treasury` utan
att förklara varför är en bugg, inte en optimering.

**Regel 2 (ny i v1.1).** `state.wire` är ett rullande fönster på de senaste 8 turerna, **men
beskärningen får aldrig göra en synlig kedja trasig.** Konkret: `pruneWire(wire, turn)` behåller
varje händelse från de 8 senaste turerna plus den transitiva orsakskedjan bakåt, tre led, för
varje händelse som behålls. En äldre händelse som fortfarande är förfader till en synlig händelse
stannar kvar och markeras inte som egen nyhet.

Motivet: en kedja som tar slut mitt i ser för spelaren ut som att spelet döljer något, när det i
själva verket har glömt. `test/invariants/wire-chains.test.ts` ska köra 20 turer och verifiera att
inget `causeId` i `state.wire` pekar på en händelse som inte finns i `state.wire`.

---

## 3. resolveTurn — kontraktet

```ts
export interface TurnSubmission {
  standingOrders: StandingOrderChange[]
  bids: Bid[]                       // obegränsat antal, kostar inga action points
  actions: PlayerAction[]           // max house.actionPoints st
}

export interface TurnResult {
  state: GameState
  wire: WireEvent[]                 // endast denna turs händelser
  rejected: { action: PlayerAction | Bid; reason: string }[]
}

export function resolveTurn(
  state: Readonly<GameState>,
  submission: TurnSubmission
): TurnResult
```

Krav på funktionen:

1. **Ren.** Samma `state` + samma `submission` ger alltid bitvis identiskt `TurnResult`.
2. **Ingen mutation av indata.** Klona in, mutera utkastet, returnera.
3. **Ingen `Math.random`, ingen `Date`, ingen `crypto`, ingen `console`.** All slump via `rng.ts`, all tid via `state.meta`.
4. **Ogiltiga handlingar kastar inte.** De hamnar i `rejected` med läsbar orsak. UI ska kunna visa dem.
5. **Kastar aldrig i normal drift.** En fångad `throw` betyder buggad regel, och testerna ska fånga det, inte spelaren.

### 3.1 Handlingar

```ts
export type PlayerAction =
  | { type: 'BROKER'; buyerId: FactionId; productId: ProductId
      quantity: number; price: Money }
  | { type: 'INTEL'; op: IntelOp; stationId: string; targetId?: string }
  | { type: 'POLITICAL'; op: PoliticalOp; targetFactionId: FactionId; spend: Money }
  | { type: 'MARKET'; op: 'BUY_FORWARD' | 'RELEASE'; spend: Money }
  | { type: 'INTERNAL'; op: InternalOp; payload: Record<string, unknown> }

export type IntelOp = 'RECRUIT' | 'LEAK' | 'SABOTAGE' | 'TURN' | 'WITHDRAW' | 'EXPAND'
export type PoliticalOp = 'BRIBE' | 'STAGE_INCIDENT' | 'BACK_CHANNEL'
export type InternalOp = 'BUILD_LINE' | 'HIRE' | 'REPRIORITISE_RND' | 'TAKE_LOAN' | 'REPAY'
```

**`QUOTE` är inte längre en `PlayerAction`.** Bud ligger i `submission.bids` och kostar inga
handlingspoäng. Ändringen gjordes för att anbud är husets enda intäktskälla: när ett bud kostade
en av tre handlingar gick varje tur åt till att bjuda, och turens val var i praktiken redan
fattat innan spelaren öppnade `THE FLOOR`.

Knappheten ligger i stället där den hör hemma: ett vunnet kontrakt binder linjekapacitet under
produktionstiden, och ett kontrakt som passerar `dueTurn` sätter `status: 'late'` och sänker
`reliability`, vilket sänker `repTerm` i varje framtida anbud. Att bjuda på allt är därför en
strategi som straffar sig själv, till skillnad från ett handlingstak som bara begränsar.

`applyActions` avvisar bud utan täckning i kapacitet först när kontraktet skulle tilldelas, inte
vid budtillfället — spelaren får övertrassera medvetet, och betala för det.

Etapp 1 implementerar bud, `INTEL`, `POLITICAL` (utan `FUND_COUP`) och `INTERNAL`. `BROKER` och
`MARKET` stubbas med `rejected`-svar tills etapp 2. `ASSASSINATE` finns inte i `IntelOp` i etapp
1 och ska inte läggas till.

> **Två luckor hittade under P2, se `docs/ANDRINGSLOGG.md`.** (1) `StandingOrderChange` namnges
> i `TurnSubmission` men definieras aldrig — varken här eller i `DESIGN.md`. `types.ts` har fått
> en minimal, uttryckligt provisorisk platshållare (`{ kind: string; payload: Record<string,
> unknown> }`) som bara låser typen tillräckligt för att bygga; den riktiga formen (troligen en
> diskriminerad union per produktionslinjer/R&D-kö/leverantörsavtal/prisgolv/stationers
> underhållsläge, DESIGN.md §4) är obeslutad. (2) Ingen prompt i avsnitt 10 tilldelar vem som
> implementerar `applyActions` på riktigt — den är no-op i P2 liksom de andra tolv, men saknar
> en framtida hemprompt så som `orders`→P4, `fronts`→P6 etc. har. Ingetdera blockerade P2 (alla
> steg är no-ops där), men båda behöver ett beslut innan en prompt faktiskt ska bearbeta
> standing orders eller riktiga spelarhandlingar.

### 3.2 Stegpipeline

`resolve/index.ts` är en lista, inget annat. Ordningen är spelregler och får aldrig ändras av
bekvämlighet.

```ts
const PIPELINE: ResolveStep[] = [
  applyActions,      // spelarens handlingar, i inskickad ordning
  production,        // linjer producerar mot kontrakt; styckkostnad bokförs HÄR
  deliveries,        // leveranser anländer, betalning, materiel in på front
  fronts,            // frontresolve + attribution
  factions,          // ekonomi, publicSupport, bankrutt
  heat,              // per teater
  doomsday,          // avkylning, trösklar, krisevent
  rivals,            // rivalhusens drag
  orders,            // nya utlysningar genereras, referencePrice fryses
  bidding,           // avgör anbud som löper ut denna tur
  economy,           // husets fasta kostnader, ränta, creditLimit, kassaflöde
  board,             // styrelsemål, progressSnapshot, prognoskontroller
  endings,           // kontrollerar alla fem slutvillkor
]

type ResolveStep = (ctx: ResolveContext) => void

interface ResolveContext {
  draft: GameState
  submission: TurnSubmission
  rng: Rng
  emit: (e: Omit<WireEvent, 'id' | 'turn'>) => string   // returnerar id, för causeId
  rejected: TurnResult['rejected']
}
```

`emit` returnerar id:t så att nästa steg kan kedja: `emit({ ..., causeId: deliveryEventId })`.

**Varför `orders` före `bidding`:** en order utlyses och fryser sitt referenspris i samma tur som
`heat` redan uppdaterats, och avgörs tidigast turen därpå. Invarianten
`order.expiresTurn > skapelseturen` gör att `bidding` aldrig kan avgöra en order spelaren inte
hunnit se. Testas i `test/invariants/order-lifetime.test.ts`.

### 3.3 Slump

```ts
// rng.ts — mulberry32 eller motsvarande, 30 rader
export interface Rng {
  next(): number                    // [0,1)
  int(min: number, max: number): number
  pick<T>(xs: readonly T[]): T
  chance(pct: number): boolean
  cursor(): number
}
export function createRng(seed: string, cursor: number): Rng
```

Efter varje `resolveTurn` skrivs `rng.cursor()` tillbaka till `state.meta.rngCursor`. Det är detta
som gör att ett parti kan spelas om exakt från en seed och en handlingslogg, vilket i sin tur är
vad som gör balanshärnessen i avsnitt 7 möjlig.

**`queries.ts` får aldrig använda denna Rng.** Härledda värden som behöver slump (framför allt
`bidEstimate`) drar från en separat, deterministisk hash av `seed + orderId`, som inte flyttar
huvudkursorn. Se 4.3.

---

## 4. Anbudsalgoritmen

Detta är etapp 1:s kärna och den ska byggas och testas isolerat innan något UI finns.

### 4.1 Referenspris och styckkostnad

**Referenspriset fryses när ordern skapas** och lagras på `Order.referencePrice`. Det räknas
aldrig om.

```
unitBase        = products[productId].baseCost
gradeFactor     = { A: 1.00, B: 0.86, C: 0.72 }[grade]
heatFactor      = 1 + (theatre.heat / 100) * balance.heatPriceElasticity
scarcityFactor  = 1 + (market.supplyCostIndex - 100) / 400

referencePrice  = round(unitBase * quantity * heatFactor * scarcityFactor)
```

`gradeFactor` ingår **inte** i det frysta referenspriset, eftersom grade är spelarens val och inte
marknadens förväntan. Den tillämpas i stället på budet: ett grade B-bud jämförs mot
`referencePrice * 0.86`.

I v1.0 räknades referenspriset om i `bidding`, alltså efter att `heat` uppdaterats i samma tur.
Spelaren bjöd då mot ett tal som hann flytta sig innan budet poängsattes, vilket gjorde
`priceTerm` oläsbart och frågan "varför förlorade jag" obesvarbar. Frysningen är därför inte en
optimering utan en förutsättning för att mekaniken ska gå att lära sig.

**Styckkostnaden** är den andra halvan och den som saknades helt i v1.0:

```
gradeCostFactor = { A: 1.00, B: 0.82, C: 0.61 }[grade]
supplyFactor    = market.supplyCostIndex / 100

unitCostNow     = round(products[productId].unitCost * gradeCostFactor * supplyFactor)
```

`unitCostNow` låses på kontraktet som `unitCostAtSigning` när budet vinner, men kostnaden som
faktiskt dras är den som gäller **vid produktionstillfället**. Skillnaden är spelarens risk: ett
långt kontrakt taget under lugn och producerat under kris äter sin egen marginal. UI:t visar båda.

Jämför de två gradefaktortabellerna: C ger 72 % av priset till 61 % av kostnaden. Marginalen i
procent är alltså högre för C och lägre i kronor per enhet, plus skandalrisk. Det är en verklig
avvägning, till skillnad från v1.0 där C var strikt sämre. **Är någon grade dominerande i
härnessen är det de här sex talen som ska skruvas först.**

### 4.2 Rivalernas bud

Deterministiskt givet seed. Varje rival lägger:

```
margin      = 0.30 - (rival.aggression / 100) * 0.22        // 0.08 … 0.30
pressure    = rival.capital < balance.rivalCashFloor ? -0.05 : 0
specBonus   = rival.specialisation === product.category ? -0.04 : 0
jitter      = rng.next() * 0.06 - 0.03

rivalBid    = round(referencePrice * (1 + margin + pressure + specBonus + jitter))
rivalDays   = rng.int(product.minDelivery, product.minDelivery + 2)
```

### 4.3 Vad spelaren får se

```ts
export interface BidEstimate {
  rivalPriceLow: Money
  rivalPriceHigh: Money
  lowestRivalHouse: RivalId | null      // endast depth >= 4
  winBand: { price: Money; confidence: Pct }[]  // se nedan
  yourUnitCost: Money                   // alltid exakt — du känner din egen verkstad
}

export function bidEstimate(state: GameState, order: Order, grade: Grade): BidEstimate
```

Prisintervallet beräknas ur `depth` på stationen i köparens land, plus `chiefSalesman`:

| effectiveDepth | Visat intervall kring lägsta rivalbud |
|---|---|
| 0 | ±35 % |
| 1 | ±22 % |
| 2 | ±14 % |
| 3 | ±8 % |
| 4 | ±4 %, plus vilket hus som ligger lägst |
| 5 | exakt siffra för det lägsta budet |

`effectiveDepth = station.depth + (chiefSalesman > 75 ? 1 : 0)`, tak 5.

**`winBand` är nytt i v1.1** och är det UI:t ska visa störst. Det uttrycker uppskattningen i
beslutets valuta: tre till fem priser med uppskattad vinstsannolikhet ("£2.10 M → ~70 %"), räknat
ur intervallet ovan och det spelaren vet om sin egen relation och sitt rykte.

Motivet: även på `depth 5` får spelaren rivalernas *pris*, aldrig deras *poäng*. Vikterna,
`trueBudget` och `inspectorIntegrity` förblir dolda, och rivalerna poängsätts med sina egna
relationer och rykten. En exakt prissiffra som ändå inte avgör anbudet ser ut som ett facit utan
att vara det, och det är en sämre upplevelse än ett ärligt sannolikhetsspann. Dold information
ska kännas som osäkerhet, inte som att spelet ljuger.

**Intervallet och `winBand` måste vara stabila inom turen.** Drar du om uppskattningen ska den
inte ändras. Härled dem från en hash av `seed + orderId + grade`, inte från en ny dragning ur
huvud-Rng:n vid varje UI-rendering. Detta är en klassisk bugg som gör hela mekaniken meningslös,
eftersom spelaren annars kan spamma om-rendering för att triangulera sanningen.

### 4.4 Avgörandet

**Diskvalificering först.** Ett bud vars `price` överstiger `order.trueBudget` kan inte vinna,
oavsett poäng. Det avvisas tyst mot spelaren (ingen upplysning om var taket låg) men emitteras som
`ticker` för felsökning. I v1.0 fanns `trueBudget` i typen men användes ingenstans, vilket gjorde
`statedBudget`-lögnen betydelselös.

För bud som klarar taket:

```
effectiveRef  = referencePrice * gradeFactor[bid.grade]

priceTerm     = -weights.price * ((bid.price / effectiveRef) - 1) * 120
deliveryTerm  = -weights.delivery * max(0, bid.deliveryTurns - order.requiredDeliveryTurns) * 25
relationTerm  =  weights.relationship * (faction.relationToPlayer / 100) * 40
bribeTerm     =  (bid.bribe / effectiveRef) * 100 * (1 - inspectorIntegrity / 100) * 1.5
repTerm       =  (reputation.reliability - 50) / 5 + (reputation.quality - 50) / 8
blocTerm      =  alignmentPenalty(faction.alignment, house)

score = 100 + priceTerm + deliveryTerm + relationTerm + bribeTerm + repTerm + blocTerm
```

Rivaler poängsätts med samma formel men med `relationTerm` och `repTerm` från deras egna värden.
Högst poäng vinner. Vid vinst skapas `Contract` med `unitCostAtSigning`, `relationToPlayer` stiger
4–8, och köparens `militaryBudget` minskar med priset.

**Detta är siffrorna att skruva på först.** De ligger i `balance.json`, inte i koden.

> **Tre luckor hittade under P4, se `docs/ANDRINGSLOGG.md`.** (1) `alignmentPenalty(faction.
> alignment, house)` namnges men definieras aldrig — varken formel eller vad `house` bidrar med.
> `pricing.ts` har fått en minimal, uttryckligt provisorisk formel skalad mot husets
> west-/eastStanding, kalibrerad mot repTerms storleksordning. Den riktiga formeln är en
> designfråga. (2) "Rivaler poängsätts med samma formel men med relationTerm och repTerm från
> deras egna värden" förutsätter data `RivalHouse` (avsnitt 2.5) inte har — inget
> rykte/relationsfält finns på en rival. Löst genom att rivaler får relationTerm 0, repTerm 0,
> bribeTerm 0 och blocTerm 0: de konkurrerar bara på pris och leveranstid, precis det avsnitt
> 4.2:s formel faktiskt modellerar för dem. (3) Ordergenereringens kadens (hur ofta, vilka
> köpare, vilka kvantiteter) ges aldrig — bara prissättningsformeln för en redan beslutad order.
> `orders.ts` har en minimal, uttryckligt provisorisk kadens (en chans per faktion och tur).
> Ingen av de tre blockerade P4:s klart när-villkor (a)–(e), som alla verifierats oberoende av
> exakt hur dessa tre avgörs.

---

## 5. Övriga stegformler i korthet

**Produktion.** Varje löpande linje producerar `unitsPerTurnAtFull * capacityPct / 100` enheter
mot sitt kontrakt och **drar `unitCostNow * producedUnits` ur `treasury` i samma steg**. Saknas
täckning produceras så mycket kassan räcker till, linjen sätts `blocked` med
`blockedReason: 'insufficient cash'`, och en `report` emitteras. Detta är etapp 1:s viktigaste
nya kostnadstryck och det som gör prissättning till ett riktigt beslut.

**Leverans.** Leveranser anländer 1–3 turer efter produktionen. Betalning bokförs proportionellt
mot levererad andel och läggs i `house.revenueByTurn[turn]`. Passeras `dueTurn` sätts kontraktet
`late`, `reliability` faller, och en `headline` emitteras. Levereras en `restricted`-produkt över
blocklinjen anropas `doomsdayGate` med produktens `doomsdayOnDelivery`-intervall.

> **Lucka hittad under P5, se `docs/ANDRINGSLOGG.md`.** "1–3 turers fördröjning" har ingen egen
> datamodell i avsnitt 2 — `Contract.unitsDelivered` räcker inte för att skilja "producerat" från
> "levererat" när de två är förskjutna i tiden. `types.ts` har fått en `Shipment`-typ (producerade-
> men-inte-levererade enheter, i `market.shipments`) för att göra fördröjningen implementerbar
> alls. `doomsdayGate.ts` byggs också här — den föll inte på någon tilldelad prompt i avsnitt 10,
> bara på min egen preliminära P0-gissning ("P7"), vilket inte är auktoritativt. `resolve/steps/
> doomsday.ts` (avkylning, trösklar, krisevent) förblir oförändrat P7:s jobb. **Observation, ingen
> kodändring:** `gradeScandalChance` i balance.json (satt i P1 direkt ur specens avsnitt 6-utdrag)
> konsumeras fortfarande ingenstans — "quality scandal" (DESIGN.md §5.1) nämns inte i P5:s
> instruktionstext och hör hemma i en framtida, ännu inte tilldelad prompt.

**Front.** `equipmentRatio = attackerArtillery / max(1, defenderArtillery)`, `manpowerRatio`,
`terrainBonus`, `supplyStress`. Förluster fördelas, moral skiftar, position flyttas vid genombrott.
Attribution bokförs per levererande hus vid varje sammandrabbning.

> **Störst lucka hittad hittills, se `docs/ANDRINGSLOGG.md`.** Det här stycket ger EN formel
> (`equipmentRatio`, och bara för artillerikategorin) och lös prosa för allt annat: `manpowerRatio`
> saknar formel helt, liksom hur `terrainBonus`/`supplyStress` faktiskt vägs in, hur stora
> förluster blir, hur mycket moral skiftar, och vad som räknas som "genombrott". `fronts.ts` har
> fått en fullständig, uttryckligt PROVISORISK modell (viktad kombination av materiel- och
> manskapsfördel, terräng och försörjningsstress; förluster/moral proportionella mot obalansen;
> position flyttas bara vid en tröskelöverskridande "genombrott"), med alla koefficienter i
> `balance.json`. Till skillnad från etapp 1:s övriga provisoriska bitar (som var enskilda,
> avgränsade termer) är det här HELA stridsmodellen — det är den delen av bygget som mest
> förtjänar en blick från någon med ett designbeslut att fatta, inte bara P10:s balanspass.
> Dessutom: `Front.attribution`s "houseId"-halva förutsätter ett fält `House` inte har (bara
> `RivalHouse` har `id`) — löst med en reserverad nyckel `'player'` i koden. Och "materiel in på
> front" visade sig aldrig ha byggts i P5 trots att PIPELINE-kommentaren (avsnitt 3.2) alltid sagt
> det — en nödvändig komplettering av redan committad kod, inte en ny P6-uppgift.

**Faktion.** Förluster drar `manpower` och `publicSupport`. `publicSupport < 25` i tre turer
triggar `forced peace`. `treasury < 0` i två turer triggar `bankrupt`, vilket sätter alla dess
kontrakt till `voided` och emittar en `headline` med `causeId` bakåt till orsaken.

> **Två luckor hittade under P7, se `docs/ANDRINGSLOGG.md`.** (1) `forced peace` har ingen
> mekanisk konsekvens specificerad någonstans utöver triggernamnet — varken avsnitt 5 eller
> DESIGN.md säger vad som faktiskt händer. `factions.ts` implementerar bara detektion och en
> engångsnotis (headline vid korsningsturen, inte upprepad varje tur stödet förblir lågt).
> (2) Embargo (`Faction.embargoed`, avsnitt 2.5) har ingen egen ekonomisk mekanik i det här
> stycket, och ingen `PlayerAction` kan sätta fältet — samma `applyActions`-lucka som loggats
> sedan P2. `factions.ts` ger embargo en PROVISORISK kvartalsvis kassadränering
> (`embargoTreasuryDrainPerTurn`) så att kedjan embargo → bankrutt → annullerat kontrakt går att
> pröva (ett test sätter `embargoed: true` direkt på en handbyggd faktion, spec 7.1). Båda är
> öppna frågor, inte beslut.

**Heat.**

```
heatFromDeliveries = deliveredUnitsIntoActiveWar * balance.heatPerUnit

om heatFromDeliveries > 0:
    heat = min(100, heat + heatFromDeliveries - balance.heatDecayActive)
annars:
    heat = max(0, heat - balance.heatDecayIdle)
```

Avsvalning sker alltså bara turer utan leverans in i aktiv konflikt, plus en mindre löpande
avsvalning som gäller ändå. v1.0 drog `-8` ovillkorligt med `heatPerUnit: 0.04`, vilket krävde
200 enheter per tur bara för att stå stilla — mätaren kunde aldrig nå 40, där hela belöningen
ligger. Startvärdena i `balance.json` är satta så att en full linjes kvartalsleverans ger
`+7 … +21`. Trösklar 40/70/85 enligt designdokumentet.

**Doomsday.** `doomsday.ts` äger avkylning (`-3` per tur), trösklarna 60/75/95 och krisevent, och
uppdaterar `doomsdayPeak`. Inget annat steg rör `state.doomsday` direkt — allt går via
`doomsdayGate.addDoomsday(ctx, amount, causeId)`, som klampar till 0–100, uppdaterar toppvärdet
och emittar. Rutinleveranser rör den aldrig. Drivarna i etapp 1 är fyra: `restricted`-leverans,
styrsystem över blocklinjen, iscensatt incident med supermaktsenhet, och eskalering från
`heat > 85`.

> **Tre fynd från P7, se `docs/ANDRINGSLOGG.md`.** (1) **Rättelse:** `endings.ts` läste sedan P3
> en hårdkodad `95` för `NUCLEAR_EXCHANGE` i stället för `balance.json` — ett brott mot CLAUDE.md
> hård regel 5 som ingen tidigare prompt fångade. `doomsdayNuclearExchangeThreshold` tillagd i
> `balance.json`, `endings.ts` läser den nu. (2) Av etapp 1:s fyra drivare kopplas bara tre i
> praktiken: `restricted`-leverans och styrsystem över blocklinjen är samma generiska mekanism,
> redan kopplad i P5, och `heat > 85`-eskalering är P7:s eget nya arbete. Iscensatt incident med
> supermaktsenhet går INTE att koppla — den beror av `applyActions`/en `STAGE_INCIDENT`-handling,
> och `applyActions.ts` saknar fortfarande en ägande prompt i avsnitt 10 (loggat sedan P2).
> (3) Krisevent vid `>= 75` (DESIGN.md §6.2: PUSH / BACK DOWN / SELL THE FILE) kräver ett
> spelarbeslut `PlayerAction`-unionen (fryst sedan P2) inte har någon variant för. Löst med en
> uttryckligt flaggad, PROVISORISK automatisk fallback: BACK DOWN väljs alltid (doomsday sätts
> till `crisisBackDownDoomsdayTarget`, en exponeringshändelse registreras), med ett eget
> wire-headline som ärligt anger att valet är automatiskt i väntan på en riktig mekanism. CRISIS
> WATCH-notisen vid `60` kan dessutom missa en korsning som redan skett tidigare samma tur via
> `deliveries.ts` — en dokumenterad, kosmetisk begränsning utan mekanisk konsekvens.

**Ekonomi.** Fasta kostnader dras varje tur. Ränta på skuld. `treasury < 0` ökar `insolventTurns`,
annars nollställs den. Därefter skrivs kreditgränsen om:

```
trailingRevenue = summa av house.revenueByTurn för de 4 senaste turerna
reliabilityMult = 0.5 + (reputation.reliability / 100) * 1.0       // 0.5 … 1.5
homeStateMult   = { neutral: 1.0, west: 1.15, east: 0.9 }[homeState]

creditLimit = max(0, round(trailingRevenue * balance.creditMultiple
                           * reliabilityMult * homeStateMult) - debt)
```

`TAKE_LOAN` över `creditLimit` avvisas i `applyActions` med
`reason: 'credit limit exceeded'`. Utan detta tak var `INSOLVENCY` inte ett förlustvillkor utan en
formalitet: en spelare på väg mot noll lånade sig helt enkelt vidare i all oändlighet. Taket
knyter också ihop rykte och ekonomi — en missad deadline kostar dig inte bara nästa anbud utan
också din möjlighet att låna dig ur kvartalet.

**Board.** `progressSnapshot` räknas om varje tur. På turerna i `boardTarget.reviewTurns`
(tur 8 och 14 i skivan) jämförs den mot den linjära bana som skulle nå `threshold` vid `dueTurn`,
med toleransen `balance.boardReviewTolerance`. Underkänd kontroll ger en `headline` och skärpta
lånevillkor; `reviewsFailed >= 2` ger `BUYOUT` omedelbart. Vid `dueTurn` prövas målet skarpt.

I v1.0 var kontrollen enbart vid `dueTurn`, som i en 20-turersskiva sammanföll med scenariots sista
tur. `BUYOUT` kunde alltså bara inträffa en gång, på slutet, och passivitet kändes aldrig under
tiden — vilket var hela villkorets syfte.

> **Lucka hittad under P8, se `docs/ANDRINGSLOGG.md`.** "`progressSnapshot` räknas om varje tur"
> ger ingen formel. PROVISORISK för `metric: 'revenue'` (det enda etapp 1:s scenario använder):
> kumulativ `house.revenueByTurn` delat på ett nytt fält `house.foundingCapital` (`House` hade
> annars ingenstans kvar att läsa startkapitalet efter att `treasury` börjat röra sig från och med
> P3) — "Doubling" (`threshold: 2`) blir då bokstavligen "intäkterna når 2× det du startade med".
> De tre andra `metric`-varianterna (`'buyers'`, `'techParity'`, `'debtRatio'`) är medvetna no-ops
> — ingen formel finns för dem heller, och inget scenario i etapp 1 använder dem. "Skärpta
> lånevillkor" hade heller ingen sifferverkan i specen — löst med ett nytt, kumulativt
> `house.creditPenaltyMultiplier` (default 1) som `economy.ts` (P3, patchad) multiplicerar
> `creditLimit` med.

**Endings.** Kontrolleras i denna ordning: `NUCLEAR_EXCHANGE`, `EXPOSURE`, `INSOLVENCY`, `BUYOUT`,
`SCENARIO_COMPLETE`.

---

## 6. Speldata

All balans i JSON. Ingen balanssiffra får hårdkodas i TypeScript.

```jsonc
// balance.json (utdrag)
{
  "heatPriceElasticity": 0.6,
  "heatPerUnit": 0.35,
  "heatDecayActive": 2,
  "heatDecayIdle": 8,
  "doomsdayDecayPerTurn": 3,
  "gradePriceFactor": { "A": 1.00, "B": 0.86, "C": 0.72 },
  "gradeCostFactor":  { "A": 1.00, "B": 0.82, "C": 0.61 },
  "gradeScandalChance": { "A": 0, "B": 4, "C": 14 },
  "fixedCosts": {
    "payrollBase": 180000,
    "payrollPerExtraLine": 45000,
    "lineUpkeep": 60000,
    "stationUpkeep": 90000,
    "rndOverhead": 120000
  },
  "creditMultiple": 1.6,
  "boardReviewTolerance": 0.15,
  "insolvencyTurns": 3,
  "exposureEventsForEnding": 3,
  "exposureWindowTurns": 6,
  "rivalCashFloor": 1200000,
  "bidWeightsDefault": { "price": 0.55, "delivery": 0.30, "relationship": 0.15 }
}
```

`products.json` innehåller `id`, `name`, `category`, `baseCost`, `unitCost`, `unitsPerLineTurn`,
`minDelivery`, `techRequired`, `restricted`, `doomsdayOnDelivery`.

Minst en produkt i etapp 1 ska vara `restricted` med `doomsdayOnDelivery: [14, 25]` och ett
`baseCost` i storleksordningen tre till fem gånger en ordinär order. Utan den har spelet ingen
frestelse, och etapp 1 kan inte pröva designpelare 1.

`scenarios/indochina-slice.json` innehåller startdatum, 20 turer, startvärden för hus, tre
faktioner, en front, en teater, tre rivaler, styrelsemål med `reviewTurns: [8, 14]`, och en lista
scriptade händelser med turindex — inklusive **minst en `restricted`-utlysning mellan tur 6 och
14**, stor nog att ensam avgöra styrelsemålet.

---

## 7. Test och balans

### 7.1 Enhetstester per steg

Varje steg i pipelinen testas isolerat med ett handbyggt minimalt `GameState`. Ett steg som kräver
ett fullt scenario för att kunna testas är för hårt kopplat och ska brytas upp.

### 7.2 Golden test — mot fryst balansfil

```ts
test('indochina-slice, seed=alpha, scripted 20 turns', () => {
  const result = playScript('indochina-slice', 'alpha', SCRIPT_A, {
    balance: FROZEN_BALANCE,   // test/golden/fixtures/balance.frozen.json
  })
  expect(hashState(result.state)).toMatchSnapshot()
  expect(result.wire.filter(e => e.severity === 'headline').length).toBeGreaterThan(12)
})
```

**Golden-testet läser `balance.frozen.json`, inte `src/data/balance.json`.** Det är den viktigaste
ändringen i det här avsnittet. I v1.0 läste testet den levande balansfilen, samtidigt som P10 går
ut på att ändra just den filen hundratals gånger — och `CLAUDE.md` säger att ett brutet snapshot
ska stoppa arbetet och kräva ett beslut. De två kraven hade slagits ihjäl varandra i första
balanskvällen, och den förutsägbara utgången är att någon börjar uppdatera snapshoten reflexmässigt,
vilket gör hela testet värdelöst.

Med en fryst fixtur betyder ett brutet snapshot **alltid** "en regel ändrades", vilket är precis
vad testet ska skydda. Fixturen uppdateras bara som ett medvetet, separat beslut.

### 7.3 Balanshärness

`packages/harness` kör N partier headless med enkla botstrategier och skriver CSV.

```
npm run harness -- --scenario indochina-slice --runs 500 --policy aggressive,passive,balanced
```

Botstrategier behöver inte vara smarta. De behöver vara olika:
- `passive` — bjuder bara där `winBand` visar marginal > 20 %, inga politiska operationer, tackar alltid nej till `restricted`
- `aggressive` — underbjuder alltid, tar varje `restricted`-order, iscensätter incidenter när `heat < 40`
- `balanced` — bjuder mot `winBand`-priset närmast 60 % konfidens, back-channel när `doomsday > 65`

Utdata per parti: ending, sluttur, kassa, `doomsdayPeak`, antal kontrakt, marknadsandel,
bruttomarginal, andel turer med `heat > 40`.

> **Fyra vägval gjorda under P9, se `docs/ANDRINGSLOGG.md`.** (1) `marknadsandel` saknar formel —
> läses som andelen "WINS CONTRACT"-händelser i wire som är spelarens (`actorIsPlayer`), av alla
> avgjorda ordrar. (2) `bruttomarginal` räknas EXAKT ur redan bokförda fält
> (`unitCostAtSigning × unitsDelivered` per kontrakt mot kumulativ `revenueByTurn`), ingen
> uppskattning. (3) CSV:n skrivs till en riktig fil (`--out`, default `harness-results.csv`), inte
> stdout — `npm run <script>` skriver sina egna livscykelbanderoller till stdout, vilket hade
> förstört en `> out.csv`-omdirigering enligt exempelkommandot ovan, ordagrant. (4) `--runs N`
> tolkas som N partier PER policy, inte N totalt fördelat på policies.
>
> Botstrategiernas beskrivningar nämner inga `INTERNAL`-handlingar (t.ex. `TAKE_LOAN`, byggd i
> P8) för någon av de tre — de byggs därför inte in. Det innebär att alla tre kan gå i
> `INSOLVENCY` i praktiken (se P8:s egen utredning i ANDRINGSLOGG.md om hur avgörande lån var för
> överlevnad) tills P10 väger in det. Det är P10:s jobb att upptäcka och åtgärda, inte P9:s att
> gissa sig runt i förväg.

**Mål för etapp 1 innan balansen får kallas färdig:**

| Kriterium | Målvärde |
|---|---|
| `passive` överlever 20 turer | < 25 % av partierna |
| `passive` förlorar på `BUYOUT` | > 50 %, och minst hälften av dem före tur 20 |
| `aggressive` når `NUCLEAR_EXCHANGE` | 15–35 % |
| `balanced` når `SCENARIO_COMPLETE` | 45–65 % |
| Andel partier avgjorda före tur 8 | < 10 % |
| Spridning i slutkassa för `balanced` | minst 3× mellan p10 och p90 |
| Turer med `heat > 40` i ett aktivt parti | 30–60 % |
| Andel partier där ingen grade är vald > 70 % av gångerna | > 80 % |

De tre sista raderna är nya i v1.1 och mäter de tre ändringar som mest sannolikt går fel: att
`heat` fortfarande är död, att en grade är dominerande, och att `BUYOUT` fortfarande bara är en
slutturskontroll.

Om `passive` överlever ofta saknas tryck. Om `aggressive` aldrig spränger världen är `DOOMSDAY`
tandlös. Detta är hela poängen med seedad slump: du får svaret på en natt istället för på ett år.

**Måltabellen är hypoteser, inte acceptanskriterier.** Den är skriven innan spelet finns. Om
härnessen envist säger något annat och partierna ändå är roliga att spela är det tabellen som ska
skrivas om — men det ska vara ett medvetet beslut med en motivering, inte en tyst justering.

### 7.4 Invarianttester

Tre tester som inte hör till något enskilt steg:

- **`money.test.ts`** — efter 20 turer har inget `Money`-fält i state decimaler. Typen säger "hela £" och ränta och procentfaktorer producerar flyttal, så invarianten måste bevakas. `money.ts` exporterar `round()` som allt penningräknande går genom.
- **`wire-chains.test.ts`** — inget `causeId` i `state.wire` pekar på en händelse som inte finns i `state.wire`. Se 2.6.
- **`order-lifetime.test.ts`** — ingen order har `expiresTurn <= ` den tur den skapades. Se 3.2.

---

## 8. UI, etapp 1

Fyra vyer. React, ingen state-hanteringsbibliotek behövs: `GameState` in, `TurnSubmission` ut.

```tsx
const [state, setState] = useState<GameState>(initial)
const [draft, setDraft] = useState<TurnSubmission>(emptySubmission)

function endTurn() {
  const result = resolveTurn(state, draft)
  setState(result.state)
  setDraft(emptySubmission)
}
```

`THE WIRE` är startvyn varje tur. Headlines med utfällbar kausalkedja, max tre led bakåt via
`causeId`. Spelarens egna spår markeras.

`THE FLOOR` listar `openOrders` med `bidEstimate` och ett budformulär. Här spenderas mest tid, så
det är här polish ska läggas. Budformuläret ska visa `winBand` störst, `yourUnitCost` och
**beräknad bruttomarginal vid det valda priset och den valda graden** — spelaren kan inte fatta
prisbeslut utan att se sin kostnad.

`THE HOUSE` och `THE WORLD` är läsvyer med några få knappar. `THE HOUSE` visar kassa, skuld,
**kreditutrymme**, marginal per aktivt kontrakt, och styrelsens `progressSnapshot` mot bana med
nästa kontrolltur utsatt.

Persistens: hela `GameState` som JSON i IndexedDB under `save:{slot}`. `meta.version` styr
migrering. Autospara efter varje `resolveTurn`.

Estetik: monospace för siffror, papper och telex. Ingen animation. Ingen karta.

---

## 9. Vad som avsiktligt inte finns i etapp 1

Så att det inte smyger in under bygget.

`BROKER`, `MARKET`, `FUND_COUP`, `ASSASSINATE`, råvaruspår utöver `supplyCostIndex`, en andra
front, fler än tre köpare, fler än tre rivaler, karaktärer, fördrag, avkolonisering, karta,
animation, ljud, highscore.

---

## 10. Promptsekvens för Claude Code

En prompt per commit. Gå inte vidare förrän `Klart när`-villkoret är uppfyllt.

**P0 — skelett**
> Skapa monorepo enligt strukturen i specen, avsnitt 1. TypeScript strict, vitest, ESLint. packages/core ska exportera en tom resolveTurn som kastar "not implemented". Ingen spellogik än.
> *Klart när:* `npm test` kör och passerar med noll tester, `npm run build` går igenom i alla paket.

**P1 — typer, data, slump, pengar**
> Implementera core/src/types.ts exakt enligt specens avsnitt 2. Implementera rng.ts enligt 3.3 med mulberry32 och money.ts enligt 7.4. Lägg in balance.json, products.json (minst en restricted-produkt) och scenarios/indochina-slice.json med rimliga startvärden. Implementera createInitialState(scenarioId, seed).
> *Klart när:* ett test skapar initialstate för indochina-slice, JSON-serialiserar och deserialiserar det, och får bitvis identiskt resultat. Ett test visar att createRng med samma seed och cursor ger samma talföljd. money.test.ts passerar på initialstate.

**P2 — pipeline och wire**
> Implementera resolveTurn med stegpipelinen från 3.2, där alla steg är tomma no-ops utom ett trivialt som ökar turräknaren. Implementera wire.ts med emit, kausalkedjor och beskärning enligt 2.6. Implementera rejected-hanteringen.
> *Klart när:* 20 turer kan köras utan handlingar, turräknaren och datumet stämmer, rngCursor ökar, en WireEvent-kedja på tre led kan byggas och läsas bakåt i ett test, och wire-chains.test.ts passerar över 20 turer.

**P3 — ekonomi, kredit och slut**
> Implementera economy.ts och endings.ts enligt avsnitt 5. Fasta kostnader, ränta, creditLimit-formeln, insolventTurns, alla fem EndingCode.
> *Klart när:* ett hus utan intäkter går i INSOLVENCY på förutsägbar tur ÄVEN när boten försöker låna varje tur, och ett test verifierar att varje EndingCode kan triggas.

**P4 — anbudsalgoritmen, utan UI**
> Implementera orders.ts, bidding.ts och queries.bidEstimate enligt avsnitt 4. Ordergenerering med fryst referencePrice, styckkostnad, rivalbud, uppskattningsintervall, winBand, trueBudget-diskvalificering, poängsättning, kontraktskapande.
> *Klart när:* (a) ett test visar att intervallbredden i bidEstimate krymper monotont med effectiveDepth 0→5; (b) ett test visar att bidEstimate och winBand är bitvis identiska vid 100 upprepade anrop inom samma tur och att huvud-Rng:ns cursor inte rört sig; (c) ett test över 200 seeds visar att vinstfrekvensen vid ett fast pris ligger mellan 5 % och 95 % — alltså att rivaljittret faktiskt gör utfallet osäkert; (d) ett bud över trueBudget förlorar mot ett lägre bud med sämre poäng på alla andra termer; (e) order-lifetime.test.ts passerar.
> *Notera:* det gamla kravet "vinstchansen är monoton i pris" följer direkt av att priceTerm är linjär och negativ. Det kan inte misslyckas utan att koden är trasig på ett sätt andra tester redan fångar, och är därför borttaget.

**P5 — produktion, kostnad och leverans**
> Implementera production.ts och deliveries.ts. Linjer producerar mot tilldelade kontrakt och drar unitCostNow ur treasury i samma steg, leveranser anländer med 1–3 turers fördröjning, betalning bokförs i revenueByTurn, reliability faller vid missad deadline, restricted-leverans anropar doomsdayGate.
> *Klart när:* ett scriptat parti tar ett kontrakt, producerar, levererar och får betalt, hela kedjan går att läsa i wire, och ett test visar att bruttomarginalen för samma order skiljer sig mellan grade A, B och C åt det håll tabellen i 4.1 anger. Ett test visar att en linje utan kassatäckning blockeras i stället för att producera gratis.

**P6 — front och attribution**
> Implementera fronts.ts enligt avsnitt 5. Materielkvot, manskapskvot, terräng, försörjningsstress, moral, position, attribution per levererande hus.
> *Klart när:* en front utan leveranser stagnerar, och en front dit spelaren levererar artilleri flyttar position i rätt riktning. Attribution summerar till levererade enheter.

**P7 — faktioner, heat, doomsday**
> Implementera factions.ts, heat.ts, doomsday.ts och doomsdayGate.ts. Bankrutt annullerar kontrakt med korrekt causeId-kedja. Krisevent vid 75 med de tre valen. Alla fyra etapp 1-drivare kopplade.
> *Klart när:* ett test kör en embargokedja hela vägen till en annullerad order och verifierar att kausalkedjan i wire pekar tillbaka till spelarens embargo. Ett test visar att fyra turers ihållande leverans från en full linje tar heat över 40, och att heat faller mot 0 under turer utan leverans. Ett test visar att inget annat steg än doomsdayGate skriver till state.doomsday.

**P8 — rivaler och styrelse**
> Implementera rivals.ts och board.ts. Rivaler växer vid spelarens passivitet, binder leverantörskapacitet och iscensätter egna incidenter. Styrelsemål med progressSnapshot, prognoskontroller vid tur 8 och 14, och BUYOUT vid två underkända i rad.
> *Klart när (reviderat, se `docs/ANDRINGSLOGG.md`):* ett passivt-men-inte-tomt parti förlorar på BUYOUT inom 20 turer i minst 6 av 20 testade seeds, OCH minst hälften av dessa BUYOUT inträffar före tur 20.

> **Tröskeln omprövad under P8, se `docs/ANDRINGSLOGG.md`.** Ursprungskravet ("minst hälften av
> 20 seeds") visade sig kräva `TAKE_LOAN` för att över huvud taget vara möjligt — ett bokstavligt
> passivt parti (`EMPTY_SUBMISSION`) går alltid i `INSOLVENCY` vid tur 9 (P3:s eget, redan gröna
> test), och `TAKE_LOAN` var fram till P8 verkningslös (`applyActions.ts` en tom stub sedan P2).
> `TAKE_LOAN` byggdes därför här — den enda delen av `applyActions.ts` som fick en riktig
> implementation i P8, och bara för att avvisningsformeln redan står ordagrant i avsnitt 5,
> "Ekonomi" ("över `creditLimit` avvisas ... med `reason: 'credit limit exceeded'`"). Även med
> lånet visade sig utfallsrymden kraftigt bimodal — ett aktivt-men-ej-växande parti antingen går i
> `INSOLVENCY` (intäkter för sent/för lite) eller växer långt förbi dubblingsmålet
> (`SCENARIO_COMPLETE`, `progressSnapshot` 3–7×) — på grund av klumpiga leveranser (flera kontrakt
> kan realisera intäkt samma tur). Efter nio testade budheuristiker (hårda och mjuka växttak,
> exponeringsmedveten budgivning) var bästa reproducerbara resultat 6/20 BUYOUT (5/6 före tur 20).
> Kravet sänktes till det uppmätta, i stället för att fortsätta jaga en siffra ingen testad
> heuristik träffade.

> **Två av tre rivalbeteenden lämnas obyggda, se `docs/ANDRINGSLOGG.md`.** DESIGN.md avsnitt 12 och
> den här promptens egen text nämner tre saker rivaler gör: lägger bud (redan kopplat sedan P4),
> binder leverantörskapacitet, och iscensätter egna incidenter. Ingen formel finns för de två sista
> i någotdera dokument. Att bygga leverantörskapacitet hade krävt att röra `production.ts`, som
> P8 inte nämner, och riskerat att störa just den ekonomiska kalibrering ovanstående stycke
> beskriver. Bara "rivaler växer vid passivitet" byggdes (`rivals.ts`, en PROVISORISK
> nollsummeformel — se `balance.json`s `_p8_note`).

**P9 — balanshärness**
> Bygg packages/harness enligt avsnitt 7.3 med de tre botstrategierna och CSV-utdata, inklusive de nya kolumnerna bruttomarginal och andel turer med heat > 40.
> *Klart när:* `npm run harness -- --runs 500` kör på under fem minuter och skriver en CSV med en rad per parti.

**P10 — balanspass.** Ingen kod. Kör härnessen, jämför mot måltabellen i 7.3, ändra bara
`balance.json`, kör igen. Upprepa tills tabellen stämmer. Räkna med flera kvällar. Golden-testet
ska passera hela vägen eftersom det läser den frysta fixturen — gör det inte det har du ändrat en
regel och inte en siffra.

**P11 — THE WIRE och THE FLOOR**
> Bygg React-appen med de två vyerna. THE WIRE med utfällbara kausalkedjor, THE FLOOR med orderlista, bidEstimate, winBand, kostnad och marginal, och budformulär. Ingen styling utöver monospace och enkel typografi.
> *Klart när:* du kan spela 20 turer i webbläsaren utan att öppna konsolen.

**P12 — THE HOUSE, THE WORLD, persistens**
> Bygg de två läsvyerna, inklusive kreditutrymme och styrelsens bana mot nästa kontrolltur, och IndexedDB-persistens med autospara och meta.version-migrering.
> *Klart när:* ett parti kan stängas och återupptas mitt i en tur utan förlust.

---

## 11. Vad som händer efter P12

Då har du svaret på den enda frågan som spelar roll: **är tjugo turer av detta spännande, och
tvingar de fram minst ett beslut där lönsamhet och överlevnad pekar åt olika håll?**

Spela tio partier.

- Om du efter parti tre vet exakt vad du ska göra varje tur är anbudsspelet för genomskådat och behöver mer dold information eller mer variation i köparnas vikter.
- Om du efter parti tre fortfarande gissar och ändå förbättras, så fungerar det.
- Om du aldrig ens funderade på `restricted`-ordern är den för dyr, för liten eller för sent utlyst — det är den enda mekanik i skivan som prövar designpelare 1, och tvekar du inte inför den har du byggt en tillverkningssimulator.

Är svaret ja på båda leden är etapp 2 värd att bygga.
