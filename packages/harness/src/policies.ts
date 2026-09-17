// policies — härnessens botstrategier. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 10.2
// (utökar de tre ursprungliga beskrivningarna från ETAPP1_TEKNISK_SPEC.md avsnitt
// 7.3 och lägger till en fjärde, `capacity`).
//
// POLITICAL-handlingarna (STAGE_INCIDENT, BACK_CHANNEL) skickas med i submission när
// villkoret är sant, trots att applyActions.ts fortfarande bara processar TAKE_LOAN
// och alla fyra INTERNAL/INTEL/POLITICAL-operationer avsnitt 10.2 nämner utöver det
// är no-ops fram till P17/P18 — samma mönster som P3:s SUBMISSION_WITH_LOAN_ATTEMPT:
// spec-ordagrant nu, och sant den dag en framtida prompt kopplar in dem.
import { BOT_BALANCE, bidEstimate, computeUnitCostNow, getProduct, officialId } from '@seventh-front/core'
import type { Bid, GameState, Grade, Order, PlayerAction, TurnSubmission } from '@seventh-front/core'

export type Policy = (state: GameState) => TurnSubmission

// ── Delade hjälpfunktioner ─────────────────────────────────────────────────

// Kostnaden i bidEstimate.winBand är HELA kontraktets pris, yourUnitCost kostnaden
// för EN enhet (spec 4.1, CLAUDE.md hård regel 10) — kostnadssidan måste skalas med
// orderns kvantitet. Se ANDRINGSLOGG.md: utan multiplikationen jämförde ett tidigare
// enhetsfel ett sexsiffrigt kontraktspris mot en tresiffrig styckkostnad.
function marginAt(price: number, totalCost: number): number {
  return price > 0 ? (price - totalCost) / price : 0
}

// balanced och capacity bjuder båda mot winBand-punkten närmast en given
// konfidensnivå (spec 7.3/10.2) — samma val, olika mål.
//
// Konfidensen i winBand är i praktiken nästan alltid 0 eller 100 (queries.ts:s
// Monte Carlo-skattning slår om skarpt inom bara fem prispunkter), så "närmast
// 60 %" möter oftast flera punkter på EXAKT samma avstånd. Specen ger ingen
// tie-break, och de två botarna behöver INTE göra samma val: `preferHigherOnTie`
// låter `balanced` välja den SISTA — dyraste — av flera lika nära punkter (den
// högsta prispunkt som ändå empiriskt vann Monte Carlo-provet) i stället för att
// degenerera till samma golvbud som `aggressive` (se ANDRINGSLOGG.md, P14: utan
// detta konvergerade balanced och aggressives slutorsaksfördelning inom P14:s
// eget klart när-villkor). `capacity` behåller standardvalet (första/billigaste
// träffen) — dess isolerade variabel är leveransförmåga, inte pris, så dess
// prisval bör vara det minst överraskande, inte ett andra experiment.
function pickClosestConfidence(
  winBand: readonly { price: number; confidence: number }[],
  target: number,
  preferHigherOnTie = false,
) {
  let closest = winBand[0]!
  for (const point of winBand.slice(1)) {
    const d = Math.abs(point.confidence - target)
    const closestD = Math.abs(closest.confidence - target)
    if (d < closestD || (preferHigherOnTie && d === closestD)) closest = point
  }
  return closest
}

function stageIncidentIfCool(state: GameState, actions: PlayerAction[]): void {
  const anyTheatreCool = Object.values(state.theatres).some((t) => t.heat < 40)
  if (!anyTheatreCool) return
  const target = Object.values(state.factions).find((f) => !f.bankrupt)
  if (target) {
    actions.push({ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: target.id, spend: 0 })
  }
}

function backChannelIfHot(state: GameState, actions: PlayerAction[]): void {
  if (state.doomsday <= 65) return
  const target = Object.values(state.factions).find((f) => !f.bankrupt)
  if (target) {
    actions.push({ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: target.id, spend: 0 })
  }
}

// P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.3/6, GK-A/skyddsräcke 4: "varje nytt
// verb ska användas av minst en botpolicy i samma prompt som bygger det").
// Ingen rng tillgänglig i en Policy (hård regel 2) — valet av tjänsteman är
// alltså deterministiskt: den med lägst standing (den som mest "behöver"
// stöd), tie-broken av Object.values:s fasta iterationsordning.
const FUND_CAMPAIGN_SPEND = 20000

function fundCampaignForWeakestOfficial(state: GameState, actions: PlayerAction[]): void {
  if (state.house.treasury < FUND_CAMPAIGN_SPEND) return
  const officials = Object.values(state.officials).filter((o) => o.status === 'active')
  if (officials.length === 0) return
  let weakest = officials[0]!
  for (const official of officials.slice(1)) {
    if (official.standing < weakest.standing) weakest = official
  }
  actions.push({ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: weakest.id, spend: FUND_CAMPAIGN_SPEND })
}

// FAVOUR kostar aldrig kassa (avsnitt 3.3) — ingen treasury-spärr behövs.
// Väljer den tjänsteman med HÖGST relationToPlayer under 100 (den boten redan
// investerat mest i, samma "bygg vidare på det som redan fungerar"-princip
// som balanced:s övriga val).
const FAVOUR_MARGIN_COST = 10000

function favourBestRelationOfficial(state: GameState, actions: PlayerAction[]): void {
  const officials = Object.values(state.officials).filter((o) => o.status === 'active' && o.relationToPlayer < 100)
  if (officials.length === 0) return
  let best = officials[0]!
  for (const official of officials.slice(1)) {
    if (official.relationToPlayer > best.relationToPlayer) best = official
  }
  actions.push({ type: 'POLITICAL', op: 'FAVOUR', officialId: best.id, marginCost: FAVOUR_MARGIN_COST })
}

// P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.5/6, GK-A/skyddsräcke 4): "ingen bot har
// någonsin anropat BROKER" (avsnitt 1.10) — samma genomgående krav som P56:s
// FUND_CAMPAIGN/FAVOUR. Prövar mot EXAKT samma två trösklar som applyActions.ts:s
// BROKER-gren faktiskt avgör mot (BOT_BALANCE.brokerRelationThreshold/
// -IntegrityThreshold), inte en separat bot-gissning. m1_rifle — samma val som
// crisis.ts:s krisköp (den enda produkten varje hus/faktion är techLevel-
// behörig för, se den filens kommentar); BROKER går förbi anbudsformeln helt
// (spec 3.5) så det finns ingen referensprispunkt att bjuda mot — priset sätts
// i stället till egen styckkostnad × en fast marginal.
const BROKER_QUANTITY = 50
const BROKER_MARGIN_MULTIPLIER = 1.3

function brokerFavourableDeal(state: GameState, actions: PlayerAction[]): void {
  const officials = Object.values(state.officials).filter(
    (o) =>
      o.status === 'active' &&
      o.post === 'procurement' &&
      o.relationToPlayer >= BOT_BALANCE.brokerRelationThreshold &&
      o.integrity >= BOT_BALANCE.brokerIntegrityThreshold,
  )
  if (officials.length === 0) return
  let chosen = officials[0]!
  for (const official of officials.slice(1)) {
    if (official.relationToPlayer > chosen.relationToPlayer) chosen = official
  }

  const product = getProduct('m1_rifle')
  const unitCost = computeUnitCostNow(product, 'A', state.market.commodities)
  const price = Math.round(unitCost * BROKER_QUANTITY * BROKER_MARGIN_MULTIPLIER)
  actions.push({ type: 'BROKER', buyerId: chosen.factionId, productId: product.id, quantity: BROKER_QUANTITY, price })
}

// P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3/6, GK-A/skyddsräcke 4): INFLUENCE
// var deklarerad OCH byggd i samma prompt — precis den kombination GK-A
// varnar för om ingen bot lär sig den. Väljer deterministiskt (ingen rng i
// Policy) den icke-bankrutta faktion med LÄGST publicSupport (den som mest
// "behöver" kampanjen, samma "hjälp den svagaste"-princip som
// fundCampaignForWeakestOfficial).
const INFLUENCE_SPEND = 15000

function influenceWeakestPublicSupport(state: GameState, actions: PlayerAction[]): void {
  if (state.house.treasury < INFLUENCE_SPEND) return
  const candidates = Object.values(state.factions).filter((f) => !f.bankrupt)
  if (candidates.length === 0) return
  let weakest = candidates[0]!
  for (const faction of candidates.slice(1)) {
    if (faction.publicSupport < weakest.publicSupport) weakest = faction
  }
  actions.push({
    type: 'POLITICAL',
    op: 'INFLUENCE',
    targetFactionId: weakest.id,
    spend: INFLUENCE_SPEND,
    direction: 'up',
    effect: { kind: 'publicSupport' },
  })
}

// P60 (GK-A): LEAK/SABOTAGE gick från "deklarerad, avvisad" (etapp 1,5) till
// faktiskt byggda i P60 — samma GK-A-krav som en helt ny handling. Kräver en
// egen aktiv station (annars ingen "i landet"-bas för operationen) och en
// känd rival — väljer deterministiskt den FÖRSTA av vardera i
// Object.values:s fasta iterationsordning.
function firstActiveStationAndRival(state: GameState): { stationId: string; rivalId: string } | null {
  const station = state.house.stations.find((s) => s.status === 'active')
  const rival = Object.values(state.rivals)[0]
  if (!station || !rival) return null
  return { stationId: station.id, rivalId: rival.id }
}

function leakAgainstFirstRival(state: GameState, actions: PlayerAction[]): void {
  const target = firstActiveStationAndRival(state)
  if (!target) return
  actions.push({ type: 'INTEL', op: 'LEAK', stationId: target.stationId, targetId: target.rivalId })
}

function sabotageFirstRival(state: GameState, actions: PlayerAction[]): void {
  const target = firstActiveStationAndRival(state)
  if (!target) return
  actions.push({ type: 'INTEL', op: 'SABOTAGE', stationId: target.stationId, targetId: target.rivalId })
}

// P61 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.4/6, GK-A/skyddsräcke 4): FUND_COUP
// är helt nytt. "Stor, sällsynt, dyr" — boten kräver en STOR kassabuffert
// (2× fundCoupCost, inte bara precis råd) innan den ens överväger en kupp,
// och väljer deterministiskt den icke-bankrutta, icke-redan-försökta
// faktion med LÄGST counterIntelligence (den enklaste måltavlan — samma
// "svag tjänst -> billigare/säkrare operation"-princip som P60:s
// intelOpSuccessPct).
const FUND_COUP_TREASURY_MULTIPLE = 2

function fundCoupWeakestCounterIntelligence(state: GameState, actions: PlayerAction[]): void {
  if (state.house.treasury < BOT_BALANCE.fundCoupCost * FUND_COUP_TREASURY_MULTIPLE) return
  const candidates = Object.values(state.factions).filter((f) => !f.bankrupt && !f.coupAttempted)
  if (candidates.length === 0) return
  let weakest = candidates[0]!
  for (const faction of candidates.slice(1)) {
    if (faction.counterIntelligence < weakest.counterIntelligence) weakest = faction
  }
  actions.push({ type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: weakest.id, spend: BOT_BALANCE.fundCoupCost })
}

// P62 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.5/6, GK-A/skyddsräcke 4): ASSASSINATE
// är helt nytt. Kräver samma stora kassabuffert-princip som FUND_COUP innan
// den ens övervägs, riktad deterministiskt mot den aktiva tjänsteman med
// LÄGST relationToPlayer (den boten har minst investerat i — inget att
// förlora genom att eliminera henne).
const ASSASSINATE_SPEND = 500000
const ASSASSINATE_TREASURY_MULTIPLE = 4

function assassinateWeakestRelationOfficial(state: GameState, actions: PlayerAction[]): void {
  if (state.house.treasury < ASSASSINATE_SPEND * ASSASSINATE_TREASURY_MULTIPLE) return
  const candidates = Object.values(state.officials).filter((o) => o.status === 'active')
  if (candidates.length === 0) return
  let weakest = candidates[0]!
  for (const official of candidates.slice(1)) {
    if (official.relationToPlayer < weakest.relationToPlayer) weakest = official
  }
  actions.push({ type: 'POLITICAL', op: 'ASSASSINATE', officialId: weakest.id, spend: ASSASSINATE_SPEND })
}

// P60 (GK-A): TURN, samma "deklarerad, avvisad -> faktiskt byggd"-status som
// LEAK/SABOTAGE. Riktas mot den FÖRSTA aktiva stationens NATIONS
// procurement-tjänsteman — samma post BRIBE (etapp 1,5) alltid riktat mot,
// så TURN blir en dyrare, mer dramatisk variant av samma mål, inte ett nytt.
function turnFirstStationsProcurementOfficial(state: GameState, actions: PlayerAction[]): void {
  const station = state.house.stations.find((s) => s.status === 'active')
  if (!station) return
  const official = state.officials[officialId(station.nation, 'procurement')]
  if (!official || official.status !== 'active') return
  actions.push({ type: 'INTEL', op: 'TURN', stationId: station.id, targetId: official.id })
}

function takeLoan(amount: number, actions: PlayerAction[]): void {
  const rounded = Math.round(amount)
  if (rounded <= 0) return
  actions.push({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: rounded } })
}

// P31 (ETAPP2_TEKNISK_SPEC.md avsnitt 6.1): alla fyra botar väljer grade PER
// ORDER enligt samma enkla regel, i stället för att hårdkoda en grade var
// (P9/P14 — se ANDRINGSLOGG.md för de tre hårdkodningarna det här ersätter).
// En pågående grade-skandal väger tyngst: B återhämtar reputation.quality utan
// att antingen riskera en NY skandal (grade C:s gradeScandalChance är 14 %,
// grade A:s är 0 %) eller ge upp hela A-marginalen mitt i en redan skadad
// period. Utan skandal: C när kassan är trängd ELLER ordern viktar pris högt,
// annars A — ordagrant avsnitt 6.1:s formulering.
function chooseGrade(state: GameState, order: Order): Grade {
  if (state.house.scandalUntilTurn !== null && state.meta.turn < state.house.scandalUntilTurn) return 'B'
  if (state.house.treasury < BOT_BALANCE.gradeCashPressureThreshold) return 'C'
  if (order.weights.price > BOT_BALANCE.gradePriceWeightThreshold) return 'C'
  return 'A'
}

// P28 (ETAPP2_TEKNISK_SPEC.md avsnitt 3.3, "teknikspärr OCH R&D-VÄRDE"): innan
// den här funktionen fanns investerade INGEN av de fyra botarna någonsin i
// REPRIORITISE_RND — P28:s eget klart när-villkor ("minst 25 % av partierna
// når mk9-ordern med tillräcklig tekniknivå OCH minst 25 % inte gör det") går
// alltså inte att uppfylla utan att NÅGON bot faktiskt investerar. Ingen
// prompt i avsnitt 9 äger R&D-investering explicit, så valet görs här,
// motiverat och loggat i ANDRINGSLOGG.md: `balanced` och `capacity` (de två
// mer "planerande" arketyperna — 10.2:s egna beskrivningar) gör ETT
// engångsförsök i artillery (det enda hål 3.3:s techLevelDefault(4)-höjning
// lämnar kvar innan mk9), `passive`/`aggressive` gör det INTE. Att låta ALLA
// fyra investera gav en uppmätt 0 % "otillräcklig teknik vid mk9-ordern" —
// nästan alla partier som överlever till tur 10 hinner klart oavsett policy,
// så splitten måste komma från VILKA botar som investerar, inte från vilka
// partier som överlever.
function reprioritiseArtilleryIfNeeded(state: GameState, actions: PlayerAction[]): void {
  if (state.house.techLevel.artillery >= 8) return
  const alreadyQueued = state.house.rnd.some((p) => p.category === 'artillery')
  if (alreadyQueued) return
  actions.push({ type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'artillery' } })
}

// ── passive ──────────────────────────────────────────────────────────────
// Bjuder bara vid marginal > 20 %, aldrig restricted. Grade väljs dynamiskt
// (P31, avsnitt 6.1 — se chooseGrade). Tar TAKE_LOAN bara när treasury < 0
// (och bara för att täcka underskottet, inte för att expandera) — passiv
// betyder försiktig, inte skuldfri till varje pris. Respekterar dessutom
// kapacitet: högst BOT_BALANCE.passiveMaxConcurrentBids bud per tur. Vid fler
// kvalificerande ordrar än så prioriteras de med bäst marginal
// (deterministiskt — Policy har ingen rng, se ETAPP1_TEKNISK_SPEC.md avsnitt 3.3).
const PASSIVE_MARGIN_FLOOR = 0.2

export const passive: Policy = (state) => {
  const candidates: { bid: Bid; margin: number }[] = []

  for (const order of state.market.openOrders) {
    const product = getProduct(order.productId)
    if (product.restricted) continue

    const grade = chooseGrade(state, order)
    const estimate = bidEstimate(state, order, grade)
    const totalCost = estimate.yourUnitCost * order.quantity
    let best: { price: number; confidence: number } | null = null
    for (const point of estimate.winBand) {
      if (marginAt(point.price, totalCost) <= PASSIVE_MARGIN_FLOOR) continue
      if (!best || point.confidence > best.confidence) best = point
    }
    if (!best) continue

    candidates.push({
      bid: { orderId: order.id, price: best.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 },
      margin: marginAt(best.price, totalCost),
    })
  }

  candidates.sort((a, b) => b.margin - a.margin)
  const bids = candidates.slice(0, BOT_BALANCE.passiveMaxConcurrentBids).map((c) => c.bid)

  // Investerar INTE i R&D (P28) — passive är den minimala arketypen, se
  // reprioritiseArtilleryIfNeeded:s egen motivering (balanced/capacity gör det).
  const actions: PlayerAction[] = []
  if (state.house.treasury < 0) {
    takeLoan(Math.min(state.house.creditLimit, -state.house.treasury), actions)
  }

  return { standingOrders: [], bids, actions }
}

// ── aggressive ───────────────────────────────────────────────────────────
// Underbjuder alltid, tar varje restricted-order. Grade väljs dynamiskt (P31,
// avsnitt 6.1 — se chooseGrade), inte längre hårdkodat C på allt. Iscensätter
// incidenter när en teater svalnat, lånar maximalt varje tur.
const AGGRESSIVE_UNDERCUT_FACTOR = 0.9

export const aggressive: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const grade = chooseGrade(state, order)
    const estimate = bidEstimate(state, order, grade)
    const price = Math.round(estimate.rivalPriceLow * AGGRESSIVE_UNDERCUT_FACTOR)
    bids.push({ orderId: order.id, price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 })
  }

  // Investerar INTE i R&D (P28) — se reprioritiseArtilleryIfNeeded:s motivering.
  const actions: PlayerAction[] = []
  stageIncidentIfCool(state, actions)
  fundCampaignForWeakestOfficial(state, actions) // P56, GK-A: nytt verb, minst en bot
  brokerFavourableDeal(state, actions) // P57, GK-A: nytt verb, minst en bot
  leakAgainstFirstRival(state, actions) // P60, GK-A: nytt verb, minst en bot
  sabotageFirstRival(state, actions) // P60, GK-A: nytt verb, minst en bot
  fundCoupWeakestCounterIntelligence(state, actions) // P61, GK-A: nytt verb, minst en bot
  assassinateWeakestRelationOfficial(state, actions) // P62, GK-A: nytt verb, minst en bot
  takeLoan(state.house.creditLimit, actions)

  return { standingOrders: [], bids, actions }
}

// ── balanced ─────────────────────────────────────────────────────────────
// Bjuder mot winBand-punkten närmast 60 % konfidens. Grade väljs dynamiskt PER
// ORDER (P31, avsnitt 6.1 — se chooseGrade; ersätter den tidigare per-tur-
// regeln som bara såg treasury). Back-channel när doomsday > 65. Lånar till
// halva creditLimit varje tur — inte hela (det är aggressives signatur), inte
// inget (det vore passive).
const BALANCED_TARGET_CONFIDENCE = 60
const BALANCED_LOAN_SHARE = 0.5

export const balanced: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const grade = chooseGrade(state, order)
    const estimate = bidEstimate(state, order, grade)
    const closest = pickClosestConfidence(estimate.winBand, BALANCED_TARGET_CONFIDENCE, true)
    bids.push({ orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 })
  }

  const actions: PlayerAction[] = []
  reprioritiseArtilleryIfNeeded(state, actions)
  backChannelIfHot(state, actions)
  favourBestRelationOfficial(state, actions) // P56, GK-A: nytt verb, minst en bot
  influenceWeakestPublicSupport(state, actions) // P60, GK-A: nytt verb, minst en bot
  turnFirstStationsProcurementOfficial(state, actions) // P60, GK-A: nytt verb, minst en bot
  takeLoan(state.house.creditLimit * BALANCED_LOAN_SHARE, actions)

  return { standingOrders: [], bids, actions }
}

// ── capacity ─────────────────────────────────────────────────────────────
// Referensboten (avsnitt 10.2): bjuder BARA på ordrar huset faktiskt kan leverera
// i tid, givet lediga produktionslinjer och product.unitsPerLineTurn — inte
// line.unitsPerTurnAtFull, som production.ts fortfarande använder (RAPPORT1_
// GRANSKNING.md 4.2, kopplas in först i P16). capacity mäter alltså mot den
// kapacitet spelet SKA ha, inte den det råkar ha idag; det är avsiktligt, för att
// samma bot ska kunna köras om oförändrad efter P16 och visa samma sak på riktigt.
//
// "Ledig kapacitet" är en enkel, deterministisk engångsbudget: linjer som är
// `idle` NU, en gång, delad girigt mellan ordrarna i den ordning de listas i
// state.market.openOrders. Ingen simulering av när upptagna linjer friläggs —
// det hade krävt att gissa hur produktionens auto-tilldelning (production.ts)
// beter sig, vilket inte är den här boten uppgift att modellera. En order som
// kräver fler samtidiga linjer än vad som är ledigt NU räknas som ej leveransbar,
// även om den i praktiken skulle hinnas med över flera turer.
//
// Ingen politik, inga lån (spec 10.2, ordagrant) — 10.2 ger inget eget prismål för
// capacity, så den återanvänder balanceds konfidensmål (60 %) OCH standard-
// tie-breaken (inte balanceds preferHigherOnTie): referensbotens isolerade
// variabel ska vara leveransförmågan, inte ett andra pris-experiment. Grade
// väljs dynamiskt PER ORDER (P31, avsnitt 6.1 — se chooseGrade), inte längre
// hårdkodat A.
const CAPACITY_TARGET_CONFIDENCE = 60

function linesNeededFor(order: Order): number {
  const product = getProduct(order.productId)
  if (product.unitsPerLineTurn <= 0 || order.requiredDeliveryTurns <= 0) return Number.POSITIVE_INFINITY
  const perTurnPerLine = product.unitsPerLineTurn
  const maxUnitsOneLine = perTurnPerLine * order.requiredDeliveryTurns
  return Math.max(1, Math.ceil(order.quantity / maxUnitsOneLine))
}

export const capacity: Policy = (state) => {
  let availableLines = state.house.lines.filter((l) => l.status === 'idle').length
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const needed = linesNeededFor(order)
    if (needed > availableLines) continue
    availableLines -= needed

    const grade = chooseGrade(state, order)
    const estimate = bidEstimate(state, order, grade)
    const closest = pickClosestConfidence(estimate.winBand, CAPACITY_TARGET_CONFIDENCE)
    bids.push({ orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 })
  }

  // "Ingen politik, inga lån" (spec 10.2, ordagrant) — men R&D är varken.
  // Se reprioritiseArtilleryIfNeeded:s egen motivering ovan (P28).
  const actions: PlayerAction[] = []
  reprioritiseArtilleryIfNeeded(state, actions)

  return { standingOrders: [], bids, actions }
}

export const POLICIES: Record<string, Policy> = { passive, aggressive, balanced, capacity }
