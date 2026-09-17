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
export type OfficialId = string

export type TechCategory =
  | 'infantry'
  | 'artillery'
  | 'armour'
  | 'aviation'
  | 'naval'
  | 'electronics'

export type Grade = 'A' | 'B' | 'C'

// P38 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.2), ordagrant.
export type Doctrine = 'infantry' | 'mechanised' | 'armoured' | 'artillery' | 'irregular'

// P48 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.1). DESIGN.md avsnitt 14, ordagrant: "olja,
// stål, uran, titan, sällsynta jordartsmetaller."
export type Commodity = 'oil' | 'steel' | 'uranium' | 'titanium' | 'rare_earths'

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
  // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): en tjänsteman per (faktion, post),
  // id:ad `official-${factionId}-${post}` (se state.ts:s buildOfficials). Order.
  // officialId pekar hit — samma person svarar på flera ordrar i rad, till
  // skillnad från Order.inspectorIntegrity som nyrullades per order.
  officials: Record<OfficialId, Official>
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
    // P48 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.1/4.2): fem prisindex, 100 = utgångsläge
    // per råvara — samma skala som supplyCostIndex hade ensam. Skrivs bara av
    // supply.ts. supplyCostIndex nedan blir DERIVERAD ur det här fältet
    // (Σ commodities[c] × commodityIndexWeight[c]), inte längre en egen, fritt
    // skriven storhet.
    commodities: Record<Commodity, number>
    // P50 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.4): "krigsefterfrågan"-drivarens
    // denna-tur-transient — samma självnollställande mönster som
    // Theatre.deliveriesIntoActiveWarThisTurn (deliveries.ts fyller på, supply.ts
    // läser OCH nollställer i samma steg). Global, inte per teater, eftersom
    // commodities är globalt, till skillnad från heat.
    commodityDemandThisTurn: Record<Commodity, number>
    supplyCostIndex: number // 100 = baseline. Multiplicerar KOSTNAD, inte pris.
    // Inte i avsnitt 2 — se ANDRINGSLOGG.md (P20). Transient, självnollställande
    // räknare, samma mönster som Theatre.deliveriesIntoActiveWarThisTurn: deliveries.ts
    // fyller på den, doomsday.ts läser (och kopierar in i pendingCrisis) i samma
    // steg-passage. Ger BACK_DOWN (avsnitt 9.3, "kvartalets restricted-intäkt
    // annulleras") ett tal att annullera utan en hel ny per-tur-array på House.
    restrictedRevenueThisTurn: Money
  }
  // P40 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.4): nödvändig
  // transportkanal, samma mönster som pendingCrisis nedan — resolve/engagement.ts
  // (körs inuti steps/fronts.ts) fyller på den när ett förband blir mauled/
  // destroyed, steps/orders.ts (senare i SAMMA turs pipeline) tömmer den och
  // utlyser namngivna ersättningsordrar. Specen ger inget eget fältnamn för den
  // här kön — bara Order.reason:s form (avsnitt 5.4:s egen jsonc-block).
  pendingFormationReplacements: FormationReplacementRequest[]
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
  // P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5): pengar avsatta via BUY_FORWARD,
  // ett prepaid-innehav per råvara (inte en låst kvantitet/pris — se
  // applyActions.ts/production.ts för hela motiveringen). Sänker den FAKTISKT
  // bokförda materialkostnaden i production.ts så länge det räcker, tappas ner
  // krona för krona i takt med att den täcker produktion. RELEASE säljer
  // tillbaka det, samma kurs.
  commodityHoldings: Record<Commodity, Money>
  // P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.3): FAVOUR "kostar marginal, inte
  // kassa" — en löpande summa, bara för att bevisa (testbart, synligt) att
  // treasury verkligen förblir orört. Skriver INGEN annan del av ekonomin
  // (grossMarginPct, board.ts:s progressSnapshot m.fl.) — se applyPolitical.ts:s
  // egen kommentar om varför.
  favourMarginSpent: Money
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
  // P49 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.3): andel av unitCost som är råvara c.
  // Frånvarande = fall tillbaka på balance.json:s bomDefaultByCategory[category]
  // (avsnitt 4.3: "per-produkt-överskrivning bara där kategorin inte räcker") —
  // en per-produkt override finns bara där en produkt genuint avviker från sin
  // kategoris typiska materialprofil (mk9_longhand_shell — ett kärnladdat
  // granatskal bär uran, till skillnad från en vanlig artilleripjäs).
  bom?: Partial<Record<Commodity, number>>
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
  // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): ersätter det tidigare inspectorIntegrity
  // (nyrullat per order) — pekar nu på en persistent Official i state.officials.
  // computeScore läser samma Pct-tal, bara ur en annan källa (skyddsräcke 2,
  // formeln själv oförändrad).
  officialId: OfficialId
  reason: OrderReason
  // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): vilken front leveransen är avsedd
  // för — null om ingen kan härledas eller väljas (SCRIPTED utan angiven front).
  // deliveries.ts faller tillbaka på findFrontForBuyer när den är null (samma
  // funktion, oförändrad — se avsnitt 3.2:s tabell).
  frontId: FrontId | null
}

// P40 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.4), ordagrant.
export type OrderReason =
  | { kind: 'REPLACE_FORMATION_LOSSES'; formationId: string; formationName: string; engagementWireId: string }
  | { kind: 'PEACETIME_REPLACEMENT' }
  | { kind: 'SCRIPTED' }

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
  // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): ärvt från Order.frontId vid
  // signering (bidding.ts). null för kontrakt som inte går via en Order (t.ex.
  // crisis.ts:s krisköp) — samma fallback-princip som Order.frontId.
  frontId: FrontId | null
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
  // P34 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.1). Skrivs av
  // attrition.ts (+= denna faktions sidas förlorade materiel), orders.ts
  // (−= utlyst kvantitet, P35) och factions.ts (+= peacetimeReplacement,
  // klampat till needCeiling) — av ingen annan.
  materielNeed: Record<TechCategory, number>
  // P50 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.4): vilka råvaror embargot mot den
  // här faktionen (om embargoed) trycker upp priset på. PROVISORISKT och
  // OBESATT i indochina-slice.json — samma "byggd och testad, strukturellt
  // vilande i dagens scenario"-status som embargoed:s ekonomiska effekt redan
  // har (se factions.ts:s egen kommentar: ingen PlayerAction kan sätta
  // embargoed i den här etappen ändå). Frånvarande = embargot ger inget
  // råvarutryck, bara sin befintliga ekonomiska smäll.
  commoditySources?: Commodity[]
  // P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.4): tre av `PolicyDecision`s fem
  // effekter skriver hit. `embargoed` (ovan) och `Station.exposure` (LICENCE_
  // REVIEW) hade redan färdiga fält — dessa tre saknades.
  //
  // PRICE_CAP: ett tak på `orders.ts`s `trueBudgetFactor`-slump, permanent för
  // faktionen tills en framtida prompt river det. `undefined` = inget tak.
  trueBudgetCapFactor?: number
  // TENDER_REFORM: ERSÄTTER (inte skiftar) `orders.ts`s pressure/agenda-vikter
  // för faktionens ordrar, permanent. `undefined` = ordinarie vikter gäller.
  weightsOverride?: { price: number; delivery: number; relationship: number }
  // PREFERRED_SUPPLIER: en poängbonus i bidding.ts till EN vinnare —
  // `'player'` eller en specifik rivals id. Kan gå till en rival, avsiktligt
  // (avsnitt 3.4: "politiken ska vara en arena där spelaren kan förlora mot
  // någon annan"). `undefined` = ingen bonus.
  preferredSupplier?: 'player' | RivalId
  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.1), ordagrant: "samma form som
  // RivalHouse.relations" — land-till-land, inte land-till-spelare
  // (relationToPlayer, ovan, är ett helt separat fält). Nyckel: en annan
  // FactionId. Faller av leveranser till en front denna faktionen är part i
  // (deliveries.ts) och av ett lyckat STAGE_INCIDENT (political.ts); stiger av
  // BACK_CHANNEL (political.ts) och tid (factions.ts, ett litet, begränsat
  // drag varje tur). Läst av factions.ts:s frontstatus-övergångar (avsnitt 4.2).
  relations: Record<FactionId, Pct>
  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): "landets egen tjänst" — skalar
  // hur mycket exposure spelarens INTEL-operationer i landet genererar
  // (applyActions.ts, EXPAND och de tre nya ops), och stiger när en sådan
  // operation misslyckas ("spelaren åker fast"). counterIntelligenceDefault
  // (balance.json) är BÅDE startvärdet och nämnaren i skalningsformeln — se
  // _p60_note.
  counterIntelligence: Pct
}

// P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1), ordagrant. Ersätter
// Order.inspectorIntegrity — samma tal, en persistent källa i stället för
// nyrullad per order. Post/Agenda är egna typer eftersom båda återanvänds
// utanför Official (PolicyDecision, P57, skriver ur en tjänstemans post/agenda).
export type Post = 'procurement' | 'defence' | 'finance' | 'interior'

// P54 (avsnitt 3.2). Vikteffekten (weights.*-skiftet) byggs i P55 — här bara
// den diskriminerade unionen, samma "typ i P54, effekt i P55"-uppdelning som
// PolicyDecision (P57) och FUND_COUP (P61) har mot sina egna följdprompter.
export type Agenda = 'REARM' | 'AUSTERITY' | 'MODERNISE' | 'NON_ALIGNMENT' | 'SELF_ENRICHMENT'

export interface Official {
  id: OfficialId
  name: string // fiktivt, register per land — DESIGN.md §15
  factionId: FactionId
  post: Post
  integrity: Pct // dold, ärver Order.inspectorIntegrity:s roll (avgör mutans effekt)
  standing: Pct // hur säker posten är. Faller vid skandal, stiger vid kampanjstöd (P56/P57)
  relationToPlayer: Pct
  agenda: Agenda
  status: 'active' | 'fallen' | 'dead'
  // P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.3): "BRIBE ... höjer hennes scandalRisk."
  // Startar på 0 för alla — en spelregel (byggs upp av spelarens BRIBE, inte
  // scenariodata), inte något officials.json sätter per tjänsteman.
  scandalRisk: Pct
  // P57 (avsnitt 3.4): en enda PolicyDecision per tjänsteman — inte en ny per
  // tur så fort villkoren håller i sig (annars re-triggar t.ex. PREFERRED_
  // SUPPLIER en ny slumpad mottagare varje tur). PROVISORISKT (specen ger
  // ingen kadens) — hon har "använt sitt inflytande" en gång, sedan är hon
  // tyst tills en framtida prompt bygger en verklig återhämtning.
  hasIssuedPolicyDecision: boolean
}

// P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.4), tabellen ordagrant. Rent
// beskrivande — TAS ALDRIG emot som spelarhandling, bara emitterad i
// WireEvent-rubriken för att namnge vilket beslut som fattades. Själva
// EFFEKTEN skrivs direkt till Faction/Station-fälten tabellen namnger (se
// politics.ts), inte till en lagrad PolicyDecision-post i state.
export type PolicyDecision = 'EMBARGO' | 'PRICE_CAP' | 'TENDER_REFORM' | 'LICENCE_REVIEW' | 'PREFERRED_SUPPLIER'

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
  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.2). 'war' är den enda status en
  // scenariofront startar i (fynd 1.5 — inget scenario har en front som INTE
  // redan är i strid vid partistart). 'ceasefire': ingen strid, inget
  // materielbehov (fronts.ts/attrition.ts gate:ar på exakt det här fältet,
  // inte bara "0 artilleri" som innan). 'dormant': samma noll-effekt som
  // 'ceasefire' på stridsresolvet, men reserverad för en front som ALDRIG
  // haft strid (ingen nuvarande övergångsregel sätter den — se factions.ts:s
  // egen kommentar) i stället för en som en gång var i krig.
  status: 'war' | 'ceasefire' | 'dormant'
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
  // P33 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 3.1/3.3): resolve/steps/
  // attrition.ts körs i ett EGET pipeline-steg direkt efter fronts, och behöver
  // fronts.ts:s clampedAdvantage samt causeId:t till turens förlust-ticker — data
  // som annars bara finns lokalt inuti fronts.ts:s resolveFront. Samma mönster som
  // Theatre.deliveriesIntoActiveWarThisTurn (P6): enda sättet att flytta ett värde
  // mellan två separata pipelinepassager utan att bryta ResolveContext:s frysta
  // form. Skrivs bara när resolveFront faktiskt kör (dvs. fronten inte stagnerar);
  // attrition.ts upprepar samma stagnationskontroll och läser dem aldrig annars.
  lastClampedAdvantage: number
  lastCasualtyEventId: string | null
  // P36 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.3). Specen
  // refererar `front.trace` som om fältet redan finns ("härlett ur
  // position-förändring senaste 3 turerna (front.trace)") — det gjorde det
  // inte, sökt igenom hela repot, se docs/ANDRINGSLOGG.md. `position` skrivs
  // bara av fronts.ts, en gång per tur, oavsett om fronten stagnerar (då
  // orört), så trace fångar senaste positionerna i tidsordning, äldst
  // först. Hålls kort (fyra punkter räcker för en tre-turers jämförelse) —
  // ingen anledning att spara hela partiets historik här.
  trace: number[]
  // P38 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1/5.2): en
  // dekomposition av front.equipment/strength, inte ett andra lager sanning —
  // fronts.ts:s egna formler (ratioAdvantage, genombrottströskeln) rörs inte,
  // de räknar vidare på aggregaten. Invariant (5.1, fäst av ett eget test):
  // Σ formations[side].equipment[c] === front.equipment[side][c] för varje c,
  // Σ formations[side].strength === front.strength[side].
  formations: Formation[]
}

// P38 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.2), ordagrant.
export interface Formation {
  id: string
  name: string
  factionId: FactionId
  frontId: FrontId
  side: 'a' | 'b'
  sectorId: string
  doctrine: Doctrine
  strength: number
  equipment: Record<TechCategory, number>
  readiness: Pct // 0 = utslaget, 100 = stridsdugligt
  status: 'active' | 'mauled' | 'refitting' | 'destroyed'
  engagedWith: string | null // motståndarförbandets id, denna tur
  // P39 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.3): `combatPower`s
  // egen formel refererar `F.strengthAtFull` som om fältet redan fanns — det
  // gjorde det inte, avsnitt 5.2:s datamodell (P38) namnger det aldrig. Nödvändigt
  // tillägg, samma mönster som `front.trace` (P36): satt en gång vid uppresning
  // (= startstyrkan, INNAN några förluster), aldrig ändrad sedan — representerar
  // förbandets fulla, avsedda styrka (TOE), inte dess nuvarande.
  strengthAtFull: number
  // P39: hur många turer i RAD förbandet varit `mauled` UTAN att ha stridit —
  // avsnitt 5.3 punkt 4 kräver "'mauled' utan strid i 2 turer → 'refitting'" men
  // ger ingen räknare i datamodellen. Nollställs varje gång status lämnar
  // `mauled` (åt endera hållet), inkrementeras bara för ett förband som redan
  // VAR mauled före den här turen (ett förband som precis BLEV mauled har per
  // definition just stridit, se resolve/engagement.ts).
  turnsMauled: number
}

// P40 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.4): en väntande
// begäran, skriven av resolve/engagement.ts när ett förband blir mauled/
// destroyed, konsumerad av steps/orders.ts SAMMA tur. statusEventId är den
// mauled/destroyed-händelsens EGNA id (Order.causeId kedjar hit — nästa led,
// tre led totalt); engagementWireId är själva drabbningens id (Order.reason:s
// egen referens, "kedjan bakåt till striden").
export interface FormationReplacementRequest {
  factionId: FactionId
  formationId: string
  formationName: string
  category: TechCategory
  quantity: number
  statusEventId: string
  engagementWireId: string
  // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): förbandets EGEN front — redan känd
  // av engagement.ts (Formation.frontId) när begäran läggs, så orders.ts slipper
  // söka efter den. Ersättningsordern som byggs ur begäran ärver den rakt av.
  frontId: FrontId
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
  // P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.3/6, skyddsräcke 3): POLITICAL delad i
  // TRE varianter (samma `type`, diskriminerad vidare på `op` — PlayerAction['type']
  // förblir oförändrad, se types.skyddsracke4.test.ts) i stället för en. STAGE_
  // INCIDENT/BACK_CHANNEL behåller targetFactionId (rör ett LAND, ingen person).
  // BRIBE/FUND_CAMPAIGN och FAVOUR tar `officialId` — ALDRIG ett FactionId ensamt,
  // ALDRIG ett fritextnamn (skyddsräcke 3, se types.skyddsracke3.test.ts).
  // FAVOUR kostar `marginCost`, inte `spend` — "det enda verbet i spelet som inte
  // kostar pengar" (avsnitt 3.3) ska inte kunna bokföras mot treasury av misstag.
  | { type: 'POLITICAL'; op: 'STAGE_INCIDENT' | 'BACK_CHANNEL'; targetFactionId: FactionId; spend: Money }
  | { type: 'POLITICAL'; op: 'BRIBE' | 'FUND_CAMPAIGN'; officialId: OfficialId; spend: Money }
  | { type: 'POLITICAL'; op: 'FAVOUR'; officialId: OfficialId; marginCost: Money }
  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): "betala för att flytta en
  // faktions publicSupport ELLER dess relations mot ett annat land" — två
  // olika mål, en gemensam diskriminant (`effect.kind`) i stället för två
  // separata op:er, samma "en handling, flera former"-mönster som BROKER
  // inte behövde men INTERNAL/CRISIS redan har (payload/choice). `direction`
  // gör INFLUENCE dubbelriktad (driva isär ELLER dra samman) — specen säger
  // "flytta", inte "sänka"/"höja".
  | {
      type: 'POLITICAL'
      op: 'INFLUENCE'
      targetFactionId: FactionId
      spend: Money
      direction: 'up' | 'down'
      effect: { kind: 'publicSupport' } | { kind: 'relations'; towardFactionId: FactionId }
    }
  // P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5): commodity tillagt — den ENDA
  // ändringen av unionen i hela etapp 4 (skyddsräcke 4). Varianten fanns redan
  // (fynd 1.5) men var obyggd fram till P51; utan commodity vet BUY_FORWARD/
  // RELEASE inte VILKEN råvara handlingen gäller.
  | { type: 'MARKET'; op: 'BUY_FORWARD' | 'RELEASE'; commodity: Commodity; spend: Money }
  | { type: 'INTERNAL'; op: InternalOp; payload: Record<string, unknown> }
  // Avsnitt 9.2 — den ENDA ändringen av den här unionen i hela etapp 1,5. Kostar
  // ingen actionPoint (krisen är inte valfri) — applyActions.ts hanterar den
  // separat från handlingstaket, se den filens huvudkommentar.
  | { type: 'CRISIS'; choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE' }

export type IntelOp = 'RECRUIT' | 'LEAK' | 'SABOTAGE' | 'TURN' | 'WITHDRAW' | 'EXPAND'
// P56 (avsnitt 3.3): FUND_CAMPAIGN och FAVOUR tillagda. P60 (avsnitt 4.3): INFLUENCE.
export type PoliticalOp = 'BRIBE' | 'STAGE_INCIDENT' | 'BACK_CHANNEL' | 'FUND_CAMPAIGN' | 'FAVOUR' | 'INFLUENCE'
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

// P41 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 7, skyddsräcke 3), byggd av
// queries.ts:s formationDisplay(). Ordagrant gated: bara `readiness` och exakt
// `equipment` — namnet blir 'UNKNOWN FORMATION' och strength ersätts av ett band som
// en DIREKT KONSEKVENS av det (spec: "Utan station: UNKNOWN FORMATION och ett
// styrkeband"), inte en egen, uppfunnen gatinglista. `sectorId`/`doctrine`/`status`
// nämns aldrig som dolda i skyddsräcke 3 och visas därför alltid — samma "ordagrann
// läsning" som resten av etappens tolkningar, se docs/ANDRINGSLOGG.md.
export interface FormationDisplay {
  id: string
  name: string // formation.name, eller 'UNKNOWN FORMATION' om known === false
  factionId: FactionId
  frontId: FrontId
  side: 'a' | 'b'
  sectorId: string
  doctrine: Doctrine
  status: 'active' | 'mauled' | 'refitting' | 'destroyed'
  strength: number | null // null om known === false — se strengthBand
  strengthBand: 'svag' | 'medel' | 'stark'
  readiness: Pct | null // null om known === false
  equipment: Record<TechCategory, number> | null // null om known === false
  known: boolean // true om huset har en aktiv station i förbandets faktions land
}
