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
  // P118 (ETAPP9 §7.1): blockens dolda generationer och framflyttningen av nästa steg. Skrivs bara av race.ts.
  race: RaceState
  // P122 (ETAPP9 §8.1): utvecklingsupphandlingar (anbudsinfordringar). Utelämnas tills den första infordran. Skrivs bara av programme.ts.
  programmes?: Programme[]
  // P124 (ETAPP9 §8.3): pappersspåren — ett per korrupt handling. Utelämnas tills det första. Skrivs bara av traces.ts.
  traces?: PaperTrace[]
  // P134 (§8b.3): vem som anställer en namngiven chefskonstruktör just nu, när det avviker från datan (designers.json). Utelämnat tills den första anställningen.
  designerMarket?: Record<string, 'player' | RivalId | null>
  pendingFormationReplacements: FormationReplacementRequest[]
  doomsday: Pct
  doomsdayPeak: Pct // för RESTRAINT i epilogen
  // ETAPP1_5_TEKNISK_SPEC.md avsnitt 9.2/9.3 — satt av doomsday.ts när doomsday
  // korsar doomsdayCrisisEventThreshold, null annars. Nästa TurnSubmission måste
  // innehålla en CRISIS-handling (annars väljs BACK_DOWN automatiskt) —
  // applyActions.ts, som kör FÖRST i pipelinen, läser och nollställer fältet.
  pendingCrisis: { turn: number; theatreId: TheatreId; restrictedRevenueThisTurn: Money } | null
  wire: WireEvent[] // rullande fönster, se 2.6
  // P89 (ETAPP7_TEKNISK_SPEC.md §9/§13): "GameState.chronicle: ChronicleEntry[]
  // — tak 80, äldsta icke-spelarhändelser gallras först." Till skillnad från
  // `wire` (ett rullande 8-turersfönster, wire.ts) sträcker sig krönikan över
  // HELA partiet — den är epilogens underlag (SHADOW, kärnvapenepilogens
  // utlösande handling, vändpunkter), inget `wire` kan räkna fram efter fler
  // än åtta turer. Byggd i resolveTurn() själv (resolve/index.ts), inte som
  // ett PIPELINE-steg — samma "cross-cutting bokföring runt pipelinen, inte
  // ett fjortonde steg"-princip som rngCursor/pruneWire redan följer, och av
  // nödvändighet: ett steg kan bara SKRIVA via ctx.emit, aldrig LÄSA tillbaka
  // den här turens redan emitterade händelser.
  chronicle: ChronicleEntry[]
  // P96 (ETAPP8_FORSLAG.md §3.1): huvudboken. En rad per spelad tur (kvartal) över
  // hela partiet — `wire` glömmer efter åtta turer, `revenueByTurn` har bara
  // intäkterna. Rent underlag för LÄSNING: inget resolve-steg får fatta ett beslut
  // ur den. Till skillnad från `chronicle` skrivs den av de penningflyttande
  // stegen själva (ledger.ts), i samma anrop som de flyttar pengarna och emittar
  // sin WireEvent (hård regel 4); resolveTurn() förseglar bara slutsaldona.
  ledger: LedgerEntry[]
  status: GameStatus
}

// P96 (ETAPP8_FORSLAG.md §3.1) — formen utökad av ägaren 2026-09-29 med tre rader
// utöver specens ursprungliga: `income.fileSale` (SELL_THE_FILE), `expenses.clawback`
// (BACK_DOWNs återtagande av restricted-intäkt) och `financing` (lån/återbetalning:
// varken intäkt eller kostnad, kassa och skuld rör sig lika mycket). Alla belopp är
// positiva heltal (Money); tecknet ligger i vilken rad beloppet står på.
// Identiteten som testas varje tur: Δ house.treasury = Σ income − Σ expenses
// + financing.loans − financing.repayments, exakt.
export interface LedgerEntry {
  turn: number
  income: {
    contracts: Money // leveranser av kontrakt vunna på anbud
    advances: Money // förskott vid tilldelning (P98)
    broker: Money // leveranser av BROKER-kontrakt (contract-broker-*)
    commodityRelease: Money // MARKET/RELEASE
    fileSale: Money // krisvalet SELL_THE_FILE
    facilitySale?: Money // P170: avvecklade anläggningar — saknas i ett sparat parti från före P170
    licence?: Money // P135: licensavgifter och royalty — saknas i ett sparat parti från före P135
    civil?: Money // P133: civila linjer (netto) — saknas i ett sparat parti från före P133
  }
  expenses: {
    fixedCosts: Money
    production: Money // kontant styckkostnad (efter forward-innehav)
    interest: Money
    political: Money // alla POLITICAL-verb som kostar kassa
    intel: Money // INTEL-verb (EXPAND/RECRUIT/LEAK/SABOTAGE/TURN)
    commodityPurchase: Money // MARKET/BUY_FORWARD
    hiring: Money // INTERNAL/HIRE
    lines: Money // INTERNAL/BUILD_LINE
    clawback: Money // krisvalet BACK_DOWN: kvartalets restricted-intäkt tas tillbaka
    works?: Money // P170: byggrater, utbyggnader och markköp — saknas i ett sparat parti från före P170
  }
  financing: {
    loans: Money // INTERNAL/TAKE_LOAN
    repayments: Money // INTERNAL/REPAY
  }
  treasuryEnd: Money
  debtEnd: Money
  creditLimitEnd: Money
}

export type GameStatus = { kind: 'active' } | { kind: 'ended'; ending: EndingCode; turn: number }

export type EndingCode = 'INSOLVENCY' | 'BUYOUT' | 'EXPOSURE' | 'NUCLEAR_EXCHANGE' | 'SCENARIO_COMPLETE'

// P89 (ETAPP7_TEKNISK_SPEC.md §9), ordagrant.
export type ChronicleKind =
  | 'coup'
  | 'incident'
  | 'assassination'
  | 'leak'
  | 'sabotage'
  | 'crisis'
  | 'exposure'
  | 'bankruptcy'
  | 'restricted_delivery'
  | 'contract'
  | 'ceasefire'
  | 'casualty' // P113: en rapport från fältet om en konstruktion (utredning öppnas) eller ett avslöjat förnekande
  | 'scandal' // P125: ett spår har kommit fram (husets eget eller en rivals) eller ett avslöjat täckelse

export interface ChronicleEntry {
  turn: number
  kind: ChronicleKind
  headline: string
  actorIsPlayer: boolean
  causeHeadlines: string[] // upp till tre led, kopierade vid skrivtillfället
  doomsdayDelta: number
}

// P89 (ETAPP7_TEKNISK_SPEC.md §9, DESIGN.md §17, ordagrant): "Ett scenario
// avslutas och betygsätts längs fyra axlar." Ren utdata, aldrig lagrad i
// GameState — scenarioVerdict(state) räknar om den varje gång, samma
// "härledd, inte lagrad"-princip som ActionPreview/BidEstimate.
export interface ScenarioVerdict {
  capital: Money // slutkassa + tillgångar (treasury + commodityHoldings)
  reach: { buyers: number; continents: number } // antal köpare och kontinenter
  shadow: number // kupper, incidenter, lönnmord m.fl. — hur mycket av världen som är ditt verk
  restraint: Pct // doomsdayPeak, lägre är bättre
  ending: { code: EndingCode; headline: string; turn: number } | null // null: scenariot pågår
  turningPoints: ChronicleEntry[] // upp till tre, rankade efter |doomsdayDelta|
  nuclearEpilogue: NuclearEpilogue | null // bara satt när ending.code === 'NUCLEAR_EXCHANGE'
  // P125 (§8.4): ett rent hus — hög integritet och inget avslöjat spår i partiet (en fjärde, tyst epilogaxel).
  cleanHouse: boolean
  // P133 (§8b.2): andelen av husets bokförda intäkter som var civila (härledd ur huvudboken) — det en vapenvila inte tar ifrån huset.
  civilSharePct: number
}

// DESIGN.md §6.3, ordagrant: "vad ditt hus levererade under de sista tolv
// turerna, vilka fronter som fanns, vilken enskild leverans som modellen kan
// spåra som utlösande, och en dödsruna över huset."
export interface NuclearEpilogue {
  deliveriesLastTwelveTurns: string[] // headlines, senaste tolv turerna
  frontNames: string[]
  triggeringEntry: ChronicleEntry | null // sista spelarhändelsen med doomsdayDelta > 0
  obituary: string
}

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
  plot: Plot // P170: tomten; varje anläggning (även under byggnad) tar en plats
  works: Facility[] // P169: anläggningarna; produktionslinjerna bor i monteringsverken (works.ts: allLines)
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
    // P125 (ETAPP9 §8.4, beslut 9N): "rent rykte" — stiger långsamt (traceCleanTurns), sjunker kraftigt när ett spår
    // kommer fram. Läses av integrityBidTerm (hög-integritets-tjänstemän gillar ett rent hus) och epilogen (cleanHouse).
    integrity: Pct
  }
  // P125: köpare som stängt huset ute från anbud till och med (exklusivt) den turen — sätts när ett spår avslöjas.
  suspendedFrom?: Record<FactionId, number>
  // P125: avdrag på styrelsens nästa granskning (i samma enhet som progressSnapshot); nollställs av board.ts.
  boardDeduction?: number
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
  // kassa" — den kumulativa summan av all marginal som lämnats i favörer (statistik).
  // Själva skulden som betalas är favourMarginOwed nedan (P99d).
  favourMarginSpent: Money
  // P99d (ägarbeslut 2026-09-29): den del av favourMarginSpent som ännu inte betalats. Varje FAVOUR
  // lägger poängen den faktiskt köpte × favourRelationCostPerPoint här; deliveries.ts drar den från
  // intäkten på husets nästa leveranser tills den är noll ("kostnaden bokförs i marginal", spec 3.3).
  favourMarginOwed: Money
  // P100 (ETAPP8_FORSLAG.md §5.1): det gällande läget för de tre slagen stående order. Ett sparat parti
  // från före P100 saknar fältet — standingOrders.ts läser det defensivt.
  standingOrders: StandingOrders
  // P102 (beslut 8E, "under utredning"): sista turen en utredning gäller. Sätts när en station bränns
  // (tur + 1); economy.ts drar investigationActionPointPenalty från nästa tur handlingar så länge nästa tur
  // ligger inom den. null = ingen utredning har öppnats. Ett sparat parti utan fältet läses som null.
  investigationUntilTurn: number | null
  // P107 (ETAPP9_FORSLAG.md §4.3): "känt för artilleri". Tillägg i poäng (−qualityCategoryCap…+qualityCategoryCap)
  // på den husomfattande reputation.quality, per kategori; läses av budpoängen för den kategorins produkt
  // (categoryReputation i bidTerms.ts). Fullgjorda klass A-kontrakt höjer, klass C sänker (deliveries.ts).
  // Ett sparat parti från före P107 saknar fältet och läses som 0.
  categoryQuality: Record<TechCategory, number>
  // P107 (§4.4): forskningsförsprång i hela och bråkdelar av turer per kategori, bankat av leveranser in i en
  // krigsfront (deliveries.ts) och förbrukat i hela turer av ett pågående projekt (upkeep.ts advanceRndQueue).
  // Ett sparat parti från före P107 saknar fältet och läses som 0.
  researchHeadStart: Record<TechCategory, number>
  // P135 (§8b.4): licenser på husets konstruktioner. Utelämnat tills den första — ett sparat parti från före P135 läses som inga.
  licences?: Licence[]
  // P134 (§8b.3): husets namngivna chefskonstruktör (data/designers.json). Utelämnat = ingen.
  designer?: { id: string; sinceTurn: number }
  // P108 (§4.5): krasprogrammet låser husets bud i kategorin NÄSTA kvartal — kategori → den tur då budet avvisas.
  // Ett sparat parti från före P108 saknar fältet och läses som inga lås.
  rndBidLock: Partial<Record<TechCategory, number>>
  // P109 (ETAPP9 §5.1): husets egna konstruktioner. Ett sparat parti från före P109 saknar fältet och läses som tomt.
  designs: Design[]
  // P116 (ETAPP9 §6.5): fiendens erövrade materiel som köpare överlämnat (per system, enheter) och hur många exemplar av varje
  // system huset studerat med REVERSE_ENGINEER (P117:s motmedelsforskning läser den). Båda utelämnas tills något fångats.
  capturedMateriel?: CapturedMateriel[]
  studiedSystems?: Record<string, number>
  // P117 (§6.6): färdiga motmedel mot ett namngivet fiendesystem (id = `${faktion}-${kategori}`), med turen det blev klart.
  // Utelämnas tills ett riktat forskningsprojekt blivit klart.
  counters?: Record<string, { factionId: FactionId; category: TechCategory; turn: number }>
  // P113 (ETAPP9 §5.6): utredningar efter olycksfåglar i fält. Ett sparat parti från före P113 saknar fältet och läses som tomt.
  investigations: Investigation[]
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
  // P125: avdraget (skandal) som drogs från den senaste granskningens framsteg — PM:et (boardMemo) räknar med det.
  lastDeduction?: number
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

// ── P169 (ETAPP11_FORSLAG.md §4): anläggningarna ─────────────────────────────

// De sju anläggningarna (§4.2). Data (namn, en mening, nivåer) ligger i data/facilities.json.
export type FacilityKind = 'assembly' | 'component' | 'laboratory' | 'design' | 'proving' | 'depot' | 'civil'

export interface Facility {
  id: string
  kind: FacilityKind
  level: 1 | 2 | 3
  // Kategorin ett monteringsverk eller labb arbetar i; null = ingen bindning (verk migrerade från före etapp 11, och verken tills P171 ger kategorin en effekt).
  category: TechCategory | null
  condition: Pct // skick 0–100 (P174 sliter på det)
  staffing: Pct // bemanning, andel av full styrka (P173)
  skill: Pct // yrkesskicklighet (P173)
  status: 'operating' | 'under_construction' | 'retooling' | 'idle' | 'strike'
  // Produktionslinjerna, bara i ett monteringsverk (annars tom). Det finns inga fristående linjer (skyddsräcke 1).
  lines: ProductionLine[]
  // P170: det som investerats i anläggningen (byggkostnad, utbyggnader) — underlaget för vad den säljs för. Startpaketets labb är gratis: 0.
  invested: Money
  // P170: ett pågående bygge. Ett nytt hus har level 1 och status 'under_construction' tills det är klart; en utbyggnad lämnar statusen 'operating'
  // (monteringsverket går på halv fart, expansionSpeedPct) och höjer nivån till toLevel när det är klart. Kostnaden betalas i lika rater från startTurn.
  build?: { toLevel: 1 | 2 | 3; startTurn: number; turnsTotal: number; turnsLeft: number; costTotal: Money; costPerTurn: Money; forced: boolean }
}

// P170 (§4.1): hemmatomten. slots = antal platser (åtta, 11C); en gång kan fler köpas.
export interface Plot {
  slots: number
  landBought: boolean
}

export interface RndProject {
  id: string
  category: TechCategory
  turnsRemaining: number
  turnsTotal: number
  // P108 (ETAPP9_FORSLAG.md §4.5): faktor på rndOverhead per tur (forskningsspårets tempo eller krasprogrammet).
  // Saknas i ett sparat parti från före P108 och läses då som 1.
  costFactor?: number
  // P108: ett krasprogram (REPRIORITISE_RND) — halverad tid, dubbel totalkostnad, bud i kategorin låsta nästa kvartal.
  crash?: boolean
  // P109 (ETAPP9 §5.2): ett designprojekt i stället för ett teknikprojekt — ger en Design när det blir klart, inte
  // techLevel + 1. Delar kön, kostnadsmekaniken (costFactor, specialiseringens halvering), chefsingenjörens
  // kortning och erfarenhetsförsprånget med teknikprojekten.
  design?: DesignProjectSpec
  // P117 (§6.6): projektet är riktat mot ett namngivet, studerat fiendesystem (id = `${faktion}-${kategori}`).
  counterTo?: string
}

// P109 (ETAPP9 §5.2): ritbordsuppdraget. Inriktningen väljer spelstil, ambitionen hur långt förbi det tidsenliga
// (blockens generation, §7.1) huset sträcker sig — högre värden mot längre tid, högre kostnad och större
// risk för brister (Hearts of Iron IV: man får forska före sin tid, men det kostar).
export type DesignFocus = 'robust' | 'balanced' | 'advanced'
export type DesignAmbition = 'timely' | 'forward' | 'ahead'
export type QualityClass = 'A' | 'B' | 'C' | 'D'
// P110 (§5.3): miljöer en brist kan höra till, och som en front kan ha.
export type DesignEnvironment = 'jungle' | 'monsoon' | 'mine' | 'wear'
export type DesignId = string

export interface DesignProjectSpec {
  focus: DesignFocus
  ambition: DesignAmbition
  // Måldgenerationen, fastställd vid start (tidsenlig generation då + ambitionens steg).
  targetGeneration: number
  // P112 (§5.5): en uppgradering av en egen konstruktion — billigare och snabbare, ärver fältryktet.
  upgradeOf: DesignId | null
  // P113 (§5.6): "konstruera om" efter en olycksfågel — kortare tid, och konstruktionen blir felfri.
  redesignOf?: DesignId | null
  // P134 (§8b.3): ett specialprojekt ("skunk works") — snabbare och dyrare, med mindre insyn och därmed större risk för en dold brist.
  skunk?: boolean
}

// P110: en miljöbrist — dold tills den avslöjats (egen provning i rätt miljö eller en front med miljön).
export interface DesignFlaw {
  environment: DesignEnvironment
  severity: number // 1–3
}

// P114 (§6.2): fältrykte. Stubben finns sedan P109 eftersom typbladet (§5.1) listar den.
export interface DesignFieldRecord {
  occasions: number
  proven: boolean
}

// P109 (ETAPP9 §5.1): typbladet. Tre synliga egenskaper (performance, reliability, unitCostFactor); trueQuality
// och latentFlaw är DOLDA (9D, skyddsräcke 5) och visas bara som ett intervall respektive när de avslöjats.
export interface Design {
  id: DesignId
  name: string // "H&V M64 Field Gun" (9L)
  category: TechCategory
  baseProductId: ProductId
  generation: number
  focus: DesignFocus
  ambition: DesignAmbition
  performance: Pct // nominellt, synligt
  reliability: Pct // nominellt, synligt
  unitCostFactor: number // produktionskostnad mot basprodukten, synligt
  trueQuality: Pct // DOLD — som byggd, efter utfallet
  uncertainty: number // P110: osäkerheten i klasssteg (±), smalnar av vid provning
  latentFlaw: DesignFlaw | null // DOLD
  flawRevealed: boolean // P110: bristen känd för spelaren
  testedIn: DesignEnvironment[] // P110: miljöer huset provat i egen regi
  fieldRecord: DesignFieldRecord
  lineage: DesignId | null // P112: föregångaren vid uppgradering
  introducedTurn: number
  status: 'active' | 'withdrawn' // P113: tillbakadragen under en omkonstruktion
  // P113 (§5.6): spelaren förnekade en olycksfågel — ryktet sjunker per leverans tills bristen åtgärdas eller sanningen kommer fram.
  denied?: boolean
  // P115 (§6.4): FIELD_TRIAL per köpare — bonusActive = bonusen i köparens nästa upphandling är kvar (förbrukas när
  // konstruktionen vinner där). En köpare kan prova en konstruktion en gång. Utelämnat = aldrig provad.
  trials?: Record<FactionId, { turn: number; bonusActive: boolean }>
  // P115: resultatet av ett fältprov blir känt för alla — rivalerna ser konstruktionens verkliga kvalitet (P116 läser flaggan).
  exposedToRivals?: boolean
  // P116 (§6.5): motståndaren har tagit husets materiel av den här konstruktionen vid ett genombrott (en gång). En rival i
  // motståndarens block kan därefter kopiera den (copiedBy); varje kopia sänker budtermen.
  captured?: { turn: number; byFactionId: FactionId; eventId: string | null }
  copiedBy?: RivalId[]
  // P117 (§6.3): turen då utfasningen för ett block märktes (av advanceDesignLifecycle) — bara en markering för rubriken
  // och visningen. Behörigheten läses alltid ur generationen (designPhasedOutForBuyer), aldrig ur den här flaggan.
  phasedOut?: Partial<Record<'west' | 'east', number>>
  // P132 (§8b.1): konstruktionen togs fram med ett forskningsanslag och är bunden till köparens block — kan inte bjudas till det andra blocket
  // eller till neutrala köpare (exportRules.ts). Utelämnat = ingen bindning.
  exclusiveTo?: 'west' | 'east'
  // P134 (§8b.3): konstruktionen kom ur ett specialprojekt ("skunk works").
  skunk?: boolean
}

// P116: ett namngivet fiendesystem (data/enemySystems.json) huset fått överlämnat — id = `${faktion}-${kategori}`.
export interface CapturedMateriel {
  systemId: string
  name: string
  category: TechCategory
  fromFactionId: FactionId
  units: number
}

// P113 (ETAPP9 §5.6): en utredning efter en olycksfågel i fält. open → spelaren väljer; denied → förnekad (kan fortfarande
// åtgärdas eller konstrueras om, eller avslöjas); fixed → åtgärdad eller omkonstruerad; exposed → förnekandet avslöjades;
// redesigning → ett omkonstruktionsprojekt pågår.
export type InvestigationChoice = 'FIX' | 'DENY' | 'REDESIGN'
export interface Investigation {
  id: string
  designId: DesignId
  environment: DesignEnvironment
  severity: number
  frontId: FrontId
  buyerId: FactionId
  openedTurn: number
  deadlineTurn: number
  status: 'open' | 'denied' | 'fixed' | 'exposed' | 'redesigning'
  causeEventId: string | null
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
  // P98 (ETAPP8_FORSLAG.md §4.1): andelen av kontraktsvärdet köparen betalar vid
  // TILLDELNING. Sätts när ordern utlyses och fryses där, som referencePrice — härledd ur
  // köparens brådska, betalningsförmåga och procurement-tjänstemannens relation (advance.ts).
  advancePct: Pct
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
  // P109 (ETAPP9_FORSLAG.md §5.1, beslut 9B): en konstruktion att bjuda med. Måste vara en egen, aktiv Design
  // vars baseProductId är ordens produkt. Utelämnat = ett vanligt bud, exakt som förut.
  designId?: string
  // P112 (§5.5): en uppgraderingssats till köparens befintliga materiel — kräver en uppgraderad konstruktion vars
  // föregångare köparen fått levererad. Lägre marginal (prisgolv och styckkostnad) mot snabbare affär (poängbonus).
  kit?: boolean
  // P135 (§8b.4): en kundanpassning — dyrare att bygga, en poängbonus, och en risk för en politisk skandal hos köparen som halverar ordern.
  customise?: boolean
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
  // P98 (ETAPP8_FORSLAG.md §4.1): förskottet, ärvt av Order.advancePct vid tilldelning. 0/0 för
  // kontrakt utan Order (BROKER, krisköp). advancePaid är det som faktiskt betalades in;
  // leveranserna betalar (price − advancePaid) proportionellt, och förskottet betalas tillbaka
  // om SPELAREN annullerar kontraktet (deliveries.ts) men behålls om köparen försvinner
  // (konkurs, regimskifte).
  advancePct: Pct
  advancePaid: Money
  // P109: konstruktionen kontraktet bjöds med (Bid.designId). Styckkostnaden vid signering och produktionen
  // räknas med dess unitCostFactor. Utelämnat = basprodukten.
  designId?: string
  // P112: kontraktet är en uppgraderingssats (Bid.kit).
  kit?: boolean
  // P135: kontraktet är kundanpassat; scandalHalved = en politisk skandal hos köparen halverade ordern vid tilldelningen.
  customised?: boolean
  scandalHalved?: boolean
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
  // P61 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.4): en lyckad FUND_COUP sätter
  // BÅDA `preferredSupplier`/detta fält tillsammans — "förköpsrätt" som
  // upphör efter `fundCoupPreferredSupplierTurns` (GK-B, avsnitt 10 punkt 6:
  // DESIGN.md §13:s "fem år" skrevs om till fem TURER), läst och rensat av
  // factions.ts:s expirePreferredSupplier. `undefined`/`null` = P57:s
  // ursprungliga, ORÄNDSADE `preferredSupplier` (permanent tills en ny
  // PolicyDecision skriver över den) — den här expiry-mekaniken är alltså
  // OPT-IN, inte en bakåtgående ändring av P57:s beteende.
  preferredSupplierUntilTurn?: number | null
  // P61: "stor, sällsynt" — en kupp kan bara FÖRSÖKAS en gång per faktion
  // och parti, vinst eller förlust. Enklaste, mest bokstavliga läsningen av
  // "sällsynt" som inte kräver en gissad nedkylningslängd.
  coupAttempted?: boolean
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
  // P99b (ägarbeslut 2026-09-29): turen tjänstemannen VARNADE för ett kommande policybeslut, annars
  // null. Beslutet utfärdas först en tur efter varningen och bara om villkoren fortfarande gäller;
  // höjs relationen över tröskeln i mellantiden nollställs fältet (varningen avvärjd).
  policyWarningTurn: number | null
  // P99c (ägarbeslut 2026-09-29): turen spelaren senast uppvaktade tjänstemannen (lyckat BRIBE,
  // FAVOUR eller TURN); 0 = aldrig. Relationen förfaller först officialRelationGraceTurns efter den.
  lastCourtedTurn: number
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
  // P114 (ETAPP9 §6.1, beslut 9E): husets konstruktioner på fronten. equipmentQuality är sidans materielkvalitet per kategori
  // (1 = vanlig; enhetsviktat medelvärde, högst ±fieldQualityRange); designUnits hur många enheter av varje konstruktion som
  // levererats till sidan (fälttillfällen går till dem). Båda utelämnas tills en konstruktion levereras — ett vanligt parti är
  // bitvis oförändrat.
  equipmentQuality?: Record<'a' | 'b', Partial<Record<TechCategory, number>>>
  designUnits?: Record<'a' | 'b', Record<DesignId, number>>
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

  // P117 (ETAPP9 §6.3, beslut 9F): rivalens konstruktioner, enligt schema (balance.rivalDesignSchedule). Enkla — ingen
  // egen forskningsmodell. Saknas i ett sparat parti från före P117 och läses då som inga.
  designs?: RivalDesign[]
}

// P118: blockens kapplöpning. generation = dold generation per block och kategori (start 1); pulled = hur många turer
// en händelse flyttat blockets NÄSTA steg i kategorin tidigare (nollställs när steget sker).
export interface RaceState {
  generation: Record<'west' | 'east', Record<TechCategory, number>>
  pulled: Record<'west' | 'east', Partial<Record<TechCategory, number>>>
  // P119 (§7.2): pågående gap-chock per kategori (blocket som tog steget och när). Aktiv i gapShockTurns turer eller tills det
  // andra blocket matchar. Utelämnas tills första gapet.
  gap?: Partial<Record<TechCategory, GapShock>>
  // P119 (§7.2): första hus på plats på blockets nuvarande nivå, per block och kategori. Utelämnas tills första claimen.
  firstInPlace?: Record<'west' | 'east', Partial<Record<TechCategory, FirstInPlace>>>
  // P120 (§7.3): hur ett blocks köpare UPPLEVER det andra blockets generation i en kategori — bias i generationer över sanningen. Ett
  // rykte vid ett generationsskifte eller en LEAK; köparnas budgetar följer det upplevda hotet. Utelämnas tills första biasen.
  perception?: Record<'west' | 'east', Partial<Record<TechCategory, PerceivedBias>>>
  // P121 (§7.4): kategorier där huset redan märkts sälja till båda sidorna (turen det upptäcktes) och antalet vapenviletur som skjutit
  // upp väntande steg. Båda utelämnas tills det inträffar.
  bothSides?: Partial<Record<TechCategory, { sinceTurn: number }>>
  ceasefireTurns?: number
}

export interface PerceivedBias {
  bias: number
  sinceTurn: number
  source: 'rumour' | 'leak'
  causeId: string | null
}

export interface GapShock {
  leader: 'west' | 'east'
  sinceTurn: number
}

// holder = 'player' eller en rivals id; spec = (prestanda + tillförlitlighet) / 2 för konstruktionen som levererades.
export interface FirstInPlace {
  generation: number
  holder: string
  turn: number
  spec: number
}

// ── P122: utvecklingsupphandlingen (ETAPP9 §8.1) ────────────────────────────

export type ProgrammePhase = 'announced' | 'specLocked' | 'development' | 'trial' | 'awarded' | 'cancelled'
export type RequirementKind = 'performance' | 'reliability' | 'unitCost' | 'delivery'

// En kravrad: ska-krav (mandatory) diskvalificerar vid underkänt, bör-krav väger bara poängen.
export interface ProgrammeRequirement {
  kind: RequirementKind
  threshold: number // prestanda/tillförlitlighet: lägst; styckpris (faktor) och leverans (turer): högst
  mandatory: boolean
  weight: number
}

// houseId = 'player' eller en rivals id. designId = den inlämnade prototypen (saknas → diskvalificerad vid provet).
export interface ProgrammeEntrant {
  houseId: 'player' | RivalId
  designId?: DesignId
  enteredTurn: number
  // P123 (§8.2): huset har lovat lokal tillverkning (högre provpoäng, lägre marginal på serien).
  counterPurchase?: boolean
  // P124 (§8.2): knepen. handbuilt/boardBribed/falsified/lowball är husets (eller en rivals, boardBribed) drag; sabotaged/leaked är
  // husets SABOTAGE/LEAK mot en rival; reported = rivalen är redan anmäld; barred = diskvalificerad av en anmälan.
  handbuilt?: boolean
  boardBribed?: boolean
  falsified?: boolean
  lowball?: boolean
  sabotaged?: boolean
  leaked?: boolean
  reported?: boolean
  barred?: string
}

// ── P124/P125: pappersspåret (ETAPP9 §8.3) ───────────────────────────────────

export type TraceKind = 'writeSpec' | 'handbuilt' | 'bribeBoard' | 'falsify' | 'bidBribe' | 'bribe' | 'broker' | 'favour' | 'legal' | 'illegalExport'

// Ett spår per korrupt handling: vem, vilken tjänsteman, vilken sorts handling, hur allvarlig, vilken tur. open = ännu dolt,
// surfaced = har kommit fram (P125:s utredningskort), closed = avgjort, swept = sopat (juridisk rådgivning).
export interface PaperTrace {
  id: string
  houseId: 'player' | RivalId
  officialId: OfficialId | null
  buyerId: FactionId | null
  kind: TraceKind
  severity: 1 | 2 | 3
  turn: number
  programmeId?: string
  contractId?: string
  status: 'open' | 'surfaced' | 'closed' | 'swept'
  // P125: när spåret kom fram, fristen för utredningskortet, husets val och hur det slutade.
  surfacedTurn?: number
  deadlineTurn?: number
  choice?: TraceChoice
  choiceTurn?: number // turen valet gjordes (ett förnekande kan avslöjas först från nästa tur)
  resolution?: 'denied' | 'sacrificed' | 'settled' | 'exposed'
}

// P125: utredningskortets tre dåliga vägar (förneka / offra någon / förlikas).
export type TraceChoice = 'DENY' | 'SACRIFICE' | 'SETTLE'

export interface TrialRow {
  kind: RequirementKind
  measured: number
  threshold: number
  mandatory: boolean
  pass: boolean
}

// Ett utvärderingsprotokoll per deltagare: en rad per kravrad med uppmätt värde, poängen och en ev. diskvalificeringsorsak.
export interface TrialScore {
  houseId: 'player' | RivalId
  score: number
  disqualified: string | null
  rows: TrialRow[]
}

export interface ProgrammeResult {
  winner: 'player' | RivalId | null
  split?: { second: 'player' | RivalId; sharePct: number }
  scores: TrialScore[]
  turn: number
}

export interface Programme {
  id: string
  buyerId: FactionId
  category: TechCategory
  baseProductId: ProductId
  trigger: 'requirementCard' | 'gapShock' | 'frontLoss'
  requirements: ProgrammeRequirement[]
  testEnvironment: DesignEnvironment
  grant: { kind: 'costPlus' | 'fixedPrice'; amount: Money } | null
  prize: { quantity: number; deliveryTurns: number; unitPrice: Money; advancePct: Pct }
  phase: ProgrammePhase
  phaseSinceTurn: number
  announcedTurn: number
  entrants: ProgrammeEntrant[]
  traces: string[] // id:n på PaperTrace kopplade till upphandlingen (P124/P125)
  grantPaid?: Money // ackumulerat kostnad-plus-anslag (P122)
  grantHearing?: boolean // granskningen efter ett överskridande har redan hållits
  // P124 (§8.2): ett underbud som vunnit — serien tecknades till ett lägre pris; tilläggsbeställningen kommer efter några turer.
  lowball?: { houseId: 'player' | RivalId; awardedTurn: number; discount: Money; contractId: string }
  result?: ProgrammeResult
}

// P117: en rivals konstruktion. Kvalitetsbonusen på rivalens rykte i kategorin avtar med nyhetsvärdet.
export interface RivalDesign {
  id: string
  name: string
  category: TechCategory
  generation: number
  introducedTurn: number
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
  // P61 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.4): FUND_COUP har samma FORM
  // (targetFactionId + spend, rör ett LAND, ingen person) som STAGE_INCIDENT/
  // BACK_CHANNEL, men en EGEN unionsmedlem — samma "delad form, egen op"-
  // uppdelning som BRIBE/FUND_CAMPAIGN har mot FAVOUR, så `applyPolitical`s
  // switch kan dispatcha FUND_COUP till sin egen funktion utan att bredda
  // `applyFactionTargetedPolitical`s Extract-signatur.
  | { type: 'POLITICAL'; op: 'FUND_COUP'; targetFactionId: FactionId; spend: Money }
  // P62 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.5, skyddsräcke 3): "handlingen kan
  // STRUKTURELLT inte peka på något annat än ett Official-id" — `officialId`,
  // ALDRIG ett FactionId eller fritextnamn (samma garanti som BRIBE/
  // FUND_CAMPAIGN/FAVOUR, se types.skyddsracke3.test.ts).
  | { type: 'POLITICAL'; op: 'ASSASSINATE'; officialId: OfficialId; spend: Money }
  | { type: 'POLITICAL'; op: 'BRIBE' | 'FUND_CAMPAIGN'; officialId: OfficialId; spend: Money }
  | { type: 'POLITICAL'; op: 'FAVOUR'; officialId: OfficialId; marginCost: Money }
  // P115 (ETAPP9 §6.4, beslut 9G): FIELD_TRIAL — ett av de två nya verben. Pekar på en tjänsteman (skyddsräcke 3: aldrig ett
  // fritextnamn) och en egen konstruktion; kostar satsen till självkostnad (fieldTrialBatch), ingen `spend`.
  | { type: 'POLITICAL'; op: 'FIELD_TRIAL'; officialId: OfficialId; designId: DesignId }
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
  // P123 (ETAPP9 §8.2, beslut 9O): dragen i upphandlingsmappen — en handling var. P123 bygger motköpet, P124 knepen.
  | { type: 'PROCUREMENT'; op: 'COUNTERPURCHASE' | 'HANDBUILT' | 'BRIBE_BOARD' | 'FALSIFY' | 'LOWBALL'; programmeId: string }
  // P124: att skriva kravet — en kravrad lutas mot husets konstruktion; kräver relation över ett golv, eller en muta (bribe).
  | { type: 'PROCUREMENT'; op: 'WRITE_SPEC'; programmeId: string; requirementKind: RequirementKind; bribe?: boolean }

export type IntelOp = 'RECRUIT' | 'LEAK' | 'SABOTAGE' | 'TURN' | 'WITHDRAW' | 'EXPAND' | 'REOPEN'
// P56 (avsnitt 3.3): FUND_CAMPAIGN och FAVOUR tillagda. P60 (avsnitt 4.3): INFLUENCE.
export type PoliticalOp =
  | 'BRIBE'
  | 'STAGE_INCIDENT'
  | 'BACK_CHANNEL'
  | 'FUND_CAMPAIGN'
  | 'FAVOUR'
  | 'INFLUENCE'
  | 'FUND_COUP'
  | 'ASSASSINATE'
export type InternalOp = 'BUILD_LINE' | 'HIRE' | 'REPRIORITISE_RND' | 'TAKE_LOAN' | 'REPAY' | 'REVERSE_ENGINEER'

// QUOTE är inte en PlayerAction. Bud ligger i TurnSubmission.bids och kostar inga
// handlingspoäng. Se spec 3.1. ASSASSINATE finns inte i IntelOp i etapp 1 och ska
// inte läggas till (spec 3.1, DESIGN.md avsnitt 9).

// P100 (ETAPP8_FORSLAG.md §5.1): stående order i tre slag — de tre av DESIGN.md §4:s fem som är ekonomi.
// En ändring kostar INGEN handling (skyddsräcke 6), gäller från NÄSTA tur och ligger kvar tills den ändras.
export type LineShift = 'normal' | 'overtime'
export type StationMode = 'quiet' | 'normal' | 'active'
export type ResearchPace = 'low' | 'normal' | 'high'

export type StandingOrderChange =
  // Linjeuppdrag: en produktkategori (null = "fritt", dagens automatiska tilldelning) och ett skift.
  | { kind: 'LINE'; lineId: string; category: TechCategory | null; shift: LineShift }
  // Leverantörsavtal: SET (råvara, volym per tur, löptid 4–8 turer) eller CANCEL.
  | { kind: 'SUPPLY'; op: 'SET'; commodity: Commodity; volumePerTurn: Money; durationTurns: number }
  | { kind: 'SUPPLY'; op: 'CANCEL'; commodity: Commodity }
  // Stationsläge: tyst, normal eller aktiv.
  | { kind: 'STATION'; stationId: string; mode: StationMode }
  // P108 (ETAPP9_FORSLAG.md §4.5): forskningsspår — ett per kategori, i takten låg/normal/hög. SET eller CANCEL.
  | { kind: 'RESEARCH'; op: 'SET'; category: TechCategory; pace: ResearchPace; counterTo?: string }
  | { kind: 'RESEARCH'; op: 'CANCEL'; category: TechCategory }
  // P109 (ETAPP9_FORSLAG.md §5.2): ritbordsuppdraget — starta ett designprojekt (inriktning + ambition) eller
  // avbryt det pågående i kategorin. Kostar ingen handling.
  // P112: upgradeOf = en uppgradering av en egen konstruktion i samma kategori (billigare, snabbare, lägre tak, ärver ryktet).
  | { kind: 'DESIGN'; op: 'START'; category: TechCategory; focus: DesignFocus; ambition: DesignAmbition; upgradeOf?: DesignId; skunk?: boolean }
  | { kind: 'DESIGN'; op: 'CANCEL'; category: TechCategory }
  // P122 (ETAPP9 §8.1): att anmäla sig till, lämna in en prototyp i och lämna en utvecklingsupphandling kostar ingen handling.
  | { kind: 'PROGRAMME'; op: 'ENTER'; programmeId: string }
  | { kind: 'PROGRAMME'; op: 'SUBMIT'; programmeId: string; designId: DesignId }
  | { kind: 'PROGRAMME'; op: 'WITHDRAW'; programmeId: string }
  // P124 (§8.2): att anmäla en rival som fuskat kostar ingen handling (9O) men kräver underrättelse i köparens land.
  | { kind: 'PROGRAMME'; op: 'REPORT'; programmeId: string; rivalId: RivalId }
  // P110 (ETAPP9 §5.3): provning i egen regi — en miljö per konstruktion åt gången; kostar pengar och tid.
  | { kind: 'TESTING'; op: 'SET'; designId: DesignId; environment: DesignEnvironment }
  | { kind: 'TESTING'; op: 'CANCEL'; designId: DesignId }
  // P113: utredningskortets val — ingen handling.
  | { kind: 'INVESTIGATION'; investigationId: string; choice: InvestigationChoice }
  // P125 (§8.3): pappersspårets kort — förneka, offra en direktör (role) eller förlikas. Kostar ingen handling.
  | { kind: 'TRACE'; op: 'RESPOND'; traceId: string; choice: TraceChoice; role?: keyof House['staff'] }
  // P125: juridisk rådgivning — en stående order som sänker chansen att spår kommer fram. Kostar ingen handling.
  | { kind: 'LEGAL'; op: 'SET' | 'CANCEL' }
  | { kind: 'CIVIL'; op: 'SET' | 'CANCEL'; category: CivilCategory }
  | { kind: 'DESIGNER'; op: 'HIRE'; designerId: string }
  | { kind: 'DESIGNER'; op: 'RELEASE' }
  | { kind: 'LICENCE'; op: 'GRANT'; designId: DesignId; factionId: FactionId }
  | { kind: 'LICENCE'; op: 'REVOKE'; licenceId: string }
  // P170 (ETAPP11 §4.3): bygge, utbyggnad, avveckling och markköp är stående order och kostar ingen handling. Forcerat = halva tiden mot dubbla priset.
  // category krävs för ett monteringsverk och ett laboratorium (ett laboratorium per kategori) och ges inte för övriga slag.
  | { kind: 'WORKS'; op: 'BUILD'; facilityKind: FacilityKind; category?: TechCategory; forced?: boolean }
  | { kind: 'WORKS'; op: 'EXPAND'; facilityId: string; forced?: boolean }
  | { kind: 'WORKS'; op: 'SELL'; facilityId: string }
  | { kind: 'WORKS'; op: 'BUY_LAND' }

// Det gällande läget (House.standingOrders). sinceTurn = första turen ordern gäller.
export interface LineStandingOrder {
  category: TechCategory | null
  shift: LineShift
  sinceTurn: number
}

export interface SupplyAgreement {
  id: string
  commodity: Commodity
  volumePerTurn: Money
  // Råvaruindexet när avtalet slöts — "låser priset till dagens råvaruindex".
  lockedIndex: number
  startTurn: number // första betalda turen
  endTurn: number // sista betalda turen
  // Antal turer i följd avtalet gått med förlust (index under låst index) — larmet vid supplyLossStreakTurns.
  lossStreak: number
}

export interface StationStandingOrder {
  mode: StationMode
  sinceTurn: number
  // Antal turer i följd på aktiv sedan senaste djupsteget (stationActiveDepthTurns → +1 djup).
  activeTurns: number
}

// P108: ett forskningsspår i kraft från och med sinceTurn.
export interface ResearchTrackOrder {
  pace: ResearchPace
  sinceTurn: number
  // P117 (§6.6): spåret riktar varje nytt projekt mot ett studerat fiendesystem.
  counterTo?: string
}

// P110: en pågående provning. turnsRun räknar turer den gällt (sinceTurn och framåt).
export interface DesignTestOrder {
  environment: DesignEnvironment
  sinceTurn: number
  turnsRun: number
}

// P135 (§8b.4): en licens på en av husets konstruktioner till en faktion. capability 0–100 växer varje tur; vid licenceRivalCapability upphör
// licensen och licenstagaren blir en ny rival (licensee-<faktion>).
export interface Licence {
  id: string
  designId: DesignId
  factionId: FactionId
  sinceTurn: number
  capability: number
  status: 'active' | 'ended'
}

// P133 (§8b.2): kategorierna som har en civil produkt (pansar → traktorer, elektronik → radioapparater, flyg → transporthelikoptrar).
export type CivilCategory = 'armour' | 'electronics' | 'aviation'

export interface StandingOrders {
  lines: Record<string, LineStandingOrder>
  supply: SupplyAgreement[]
  stations: Record<string, StationStandingOrder>
  // P108: saknas i ett sparat parti från före P108 (och tills första spåret sätts) — läses som inga spår.
  research?: Partial<Record<TechCategory, ResearchTrackOrder>>
  // P110: pågående provningar, per konstruktion. Saknas i ett sparat parti från före P110 — läses som inga.
  testing?: Record<DesignId, DesignTestOrder>
  // P125: juridisk rådgivning i kraft från och med sinceTurn.
  legal?: { sinceTurn: number }
  // P133: civila linjer per kategori (sinceTurn = första turen de betalar). Saknas i ett sparat parti från före P133 — läses som inga.
  civil?: Partial<Record<CivilCategory, { sinceTurn: number }>>
}

export interface TurnSubmission {
  standingOrders: StandingOrderChange[]
  bids: Bid[] // obegränsat antal, kostar inga action points
  actions: PlayerAction[] // max house.actionPoints st
}

export interface TurnResult {
  state: GameState
  wire: WireEvent[] // endast denna turs händelser
  rejected: { action: PlayerAction | Bid | StandingOrderChange; reason: string }[]
}

// P78 (ETAPP7_TEKNISK_SPEC.md §7.4), ordagrant: "validateAction(state, draft,
// action): { ok: true } | { ok: false; reason: string }". Samma reason-form
// som en rejected-post redan har, bara utan action-fältet — validateAction()
// vet redan vilken action den prövade, anroparen behöver bara orsaken.
export type ActionValidation = { ok: true } | { ok: false; reason: string }

// ── 4.3 Vad spelaren får se ──────────────────────────────────────────────────

export interface BidEstimate {
  rivalPriceLow: Money
  rivalPriceHigh: Money
  lowestRivalHouse: RivalId | null // endast depth >= 4
  winBand: { price: Money; confidence: Pct }[]
  yourUnitCost: Money // alltid exakt — du känner din egen verkstad
}

// P78 (ETAPP7_TEKNISK_SPEC.md §7.4), byggd av previewAction(). Ordagrant:
// "kostnad, intervall ur balansfilen, sannolikheter där underrättelsen
// räcker" — P78:s första version täckte bara cost/successPct (de två fält
// som gäller FLEST av de 22 verben). P79 lägger `effect` — referensskissens
// "PUBLIC SUPPORT 52 → ~67" (INFLUENCE, operations-3-configure-action.html)
// — det första verbet vars förhandsvisning faktiskt konsumerar den
// tredje sortens data §7.4 nämner (en beräknad före/efter-siffra, inte bara
// kostnad/sannolikhet). Fortfarande INTE med: ett fast balansintervall per
// verb (STAGE_INCIDENTs heat-spann) — inget i 7B behöver det än. Se
// ANDRINGSLOGG.md.
export interface ActionPreview {
  cost: Money | null // treasury-effekten handlingen självdeklarerar. null = ingen (FAVOUR, TAKE_LOAN, WITHDRAW, BROKER m.fl. — se previewAction.ts)
  successPct: Pct | null // null = inte slumpavgjord (t.ex. INFLUENCE, ASSASSINATE lyckas alltid) ELLER dold (successPctKnown === false)
  // Samma princip som FormationDisplay.known/OfficialDisplay.cabinetCoverage:
  // false → UI visar successPct som "Unknown", inte det faktiska talet.
  // "Motståndarens counterIntelligence utan station visas som Unknown" (§7.4,
  // ordagrant) — gated av effectiveDepth(state, den berörda nationen) > 0.
  successPctKnown: boolean
  // P79: en beräknad före/efter-siffra för handlingar vars huvudeffekt är en
  // enda, direkt läsbar mätarrörelse (i dag bara INFLUENCE — label är
  // "PUBLIC SUPPORT" eller "RELATIONS", inte ett gated fält).
  effect: { label: string; before: number; after: number } | null
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

// P63 (ETAPP5_TEKNISK_SPEC.md avsnitt 8, "rummet blir synligt"), byggd av
// queries.ts:s officialDisplay(). Gated av Station.coverage som inkluderar
// 'cabinet' (fynd 1.4 — coverage-typens FÖRSTA faktiska läsare; 'cabinet' har
// funnits sedan etapp 1 utan att någon kod någonsin kontrollerat den).
// Ordagrant gated, samma "direkt konsekvens av avsnitt 8:s egen mening"-
// princip som FormationDisplay: "tjänstemän, agendor, ställning och
// relation ... en tjänsteman utan 'cabinet'-täckning visas UTAN integritet
// OCH agenda" — bara de två, name/post/standing/relationToPlayer nämns
// aldrig som dolda och visas därför alltid.
export interface OfficialDisplay {
  id: OfficialId
  name: string
  factionId: FactionId
  post: Post
  standing: Pct
  relationToPlayer: Pct
  integrity: Pct | null // null om cabinetCoverage === false
  agenda: Agenda | null // null om cabinetCoverage === false
  cabinetCoverage: boolean // true om huset har en aktiv station med 'cabinet' i landet
}

// P66 (ETAPP6_TEKNISK_SPEC.md §4.3), byggd av queries.ts:s deriveSectorControl().
// formations återanvänder FormationDisplay rakt av — skyddsräcke 3 ärvs gratis,
// ingen egen gatinglogik här. side är grov kontrollstatus (vilken sida som har
// mest styrka i sektorn), inte förbandsdetaljer — synlig oavsett station,
// samma princip som Front.position redan varit.
export interface SectorControl {
  sectorId: string
  side: 'a' | 'b' | 'contested' | 'empty'
  formations: FormationDisplay[]
}
