// policies — härnessens botstrategier. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 10.2
// (utökar de tre ursprungliga beskrivningarna från ETAPP1_TEKNISK_SPEC.md avsnitt
// 7.3 och lägger till en fjärde, `capacity`).
//
// POLITICAL-handlingarna (STAGE_INCIDENT, BACK_CHANNEL) skickas med i submission när
// villkoret är sant, trots att applyActions.ts fortfarande bara processar TAKE_LOAN
// och alla fyra INTERNAL/INTEL/POLITICAL-operationer avsnitt 10.2 nämner utöver det
// är no-ops fram till P17/P18 — samma mönster som P3:s SUBMISSION_WITH_LOAN_ATTEMPT:
// spec-ordagrant nu, och sant den dag en framtida prompt kopplar in dem.
import { BOT_BALANCE, COMMODITIES, bidEstimate, computeUnitCostNow, getProduct, officialId, playerWinCurve } from '@seventh-front/core'
import type { Bid, Commodity, GameState, Grade, Order, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'

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

// P99c (ägarbeslut 2026-09-29): en tjänstemans relation FÖRFALLER om den inte uppvaktas
// (politics.ts), så P57:s tryck är på igen. En bot som vill undvika ett policybeslut uppvaktar den
// tjänsteman som är närmast förfall — bland dem vars standing är hög nog att utfärda ett beslut
// (annars är hon ingen risk) och som inte redan har utfärdat sitt. Bara EN per tur (handlingspoängen
// är knappa, P64), den med lägst relation. FAVOUR kostar ingen kassa; marginCost väljs så att
// relationen räcker en hel förfallscykel (tröskeln + GRACE × DECAY), inte bara nästa tur.
export function courtOfficialAtRisk(state: GameState, actions: PlayerAction[]): void {
  const grace = BOT_BALANCE.officialRelationGraceTurns
  const target = BOT_BALANCE.policyDecisionRelationThreshold + BOT_BALANCE.officialRelationDecayPerTurn * grace
  const due = Object.values(state.officials).filter(
    (o) =>
      o.status === 'active' &&
      !o.hasIssuedPolicyDecision &&
      o.standing >= BOT_BALANCE.policyDecisionStandingThreshold &&
      o.relationToPlayer < target &&
      state.meta.turn - (o.lastCourtedTurn ?? 0) >= grace - 1,
  )
  if (due.length === 0) return
  let chosen = due[0]!
  for (const official of due.slice(1)) {
    if (official.relationToPlayer < chosen.relationToPlayer) chosen = official
  }
  const marginCost = Math.ceil(target - chosen.relationToPlayer) * BOT_BALANCE.favourRelationCostPerPoint
  actions.push({ type: 'POLITICAL', op: 'FAVOUR', officialId: chosen.id, marginCost })
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

// P99c (mätt, se ANDRINGSLOGG): GK-A-verben (kampanjer, underrättelseoperationer, R&D, INFLUENCE, ...)
// skickades varje tur ur grundkapitalet, medan inga intäkter ännu kommit och de fasta kostnaderna
// redan löpte — det var DET som gjorde aggressive/balanced till BUYOUT/INSOLVENCY, inte politiken.
// Ur ett överskott betalar de sig: en kostsam handling släpps igenom bara om kassan EFTER kostnaden
// fortfarande ligger över grundkapitalet. Gratis handlingar (FAVOUR, BACK_CHANNEL, ...), lån och
// BROKER (ger intäkt) rörs inte.
function costOfAction(action: PlayerAction): number | null {
  switch (action.type) {
    case 'POLITICAL':
      if (action.op === 'FUND_CAMPAIGN' || action.op === 'FUND_COUP' || action.op === 'ASSASSINATE' || action.op === 'INFLUENCE') {
        return action.spend
      }
      return null
    case 'INTEL':
      return action.op === 'LEAK' || action.op === 'SABOTAGE' || action.op === 'TURN' ? BOT_BALANCE.intelCovertOpCost : null
    case 'INTERNAL':
      return action.op === 'REPRIORITISE_RND' ? BOT_BALANCE.rndProjectCost : null
    default:
      return null
  }
}

export function spendOnlyFromSurplus(state: GameState, actions: PlayerAction[]): PlayerAction[] {
  return actions.filter((action) => {
    const cost = costOfAction(action)
    if (cost === null) return true
    return state.house.treasury - cost >= state.house.foundingCapital
  })
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
  courtOfficialAtRisk(state, actions) // P99c: först — handlingspoängen är knappa, och ett beslut kostar mer
  stageIncidentIfCool(state, actions)
  fundCampaignForWeakestOfficial(state, actions) // P56, GK-A: nytt verb, minst en bot
  brokerFavourableDeal(state, actions) // P57, GK-A: nytt verb, minst en bot
  leakAgainstFirstRival(state, actions) // P60, GK-A: nytt verb, minst en bot
  sabotageFirstRival(state, actions) // P60, GK-A: nytt verb, minst en bot
  fundCoupWeakestCounterIntelligence(state, actions) // P61, GK-A: nytt verb, minst en bot
  assassinateWeakestRelationOfficial(state, actions) // P62, GK-A: nytt verb, minst en bot
  takeLoan(state.house.creditLimit, actions)

  return { standingOrders: [], bids, actions: spendOnlyFromSurplus(state, actions) }
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

  return { standingOrders: [], bids, actions: balancedActions(state) }
}

// Utbruten oförändrad ur `balanced` (P103) så att `balanced-pwc` delar EXAKT samma handlingar — bara
// budkurvan skiljer. Rena flytten: golden-testet läser `balanced` och är oförändrat.
function balancedActions(state: GameState): PlayerAction[] {
  const actions: PlayerAction[] = []
  courtOfficialAtRisk(state, actions) // P99c: först — handlingspoängen är knappa, och ett beslut kostar mer
  reprioritiseArtilleryIfNeeded(state, actions)
  backChannelIfHot(state, actions)
  favourBestRelationOfficial(state, actions) // P56, GK-A: nytt verb, minst en bot
  influenceWeakestPublicSupport(state, actions) // P60, GK-A: nytt verb, minst en bot
  turnFirstStationsProcurementOfficial(state, actions) // P60, GK-A: nytt verb, minst en bot
  takeLoan(state.house.creditLimit * BALANCED_LOAN_SHARE, actions)
  return spendOnlyFromSurplus(state, actions)
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

// ── balanced-pwc / capacity-pwc ──────────────────────────────────────────
// P103 (ETAPP8_FORSLAG.md §7.1): ETAPP7 §16 ville flytta `balanced` och `capacity` till `playerWinCurve`,
// men golden-testet läser `balanced` direkt, så originalen lämnas orörda och två NYA varianter bjuder
// ur samma kurva reglaget i budmappen visar (P81c/P84). Samma konfidensmål (60 %), samma tie-break,
// samma handlingar och samma kapacitetsregel som originalen — bara prispunkterna kommer från
// `playerWinCurve` i stället för `bidEstimate.winBand`. Ingen marginalspärr: en ren jämförelse mot
// originalen ska visa vad kurvbytet ensamt gör.
function pwcBid(state: GameState, order: Order, target: number, preferHigherOnTie: boolean): Bid {
  const grade = chooseGrade(state, order)
  const closest = pickClosestConfidence(playerWinCurve(state, order, grade), target, preferHigherOnTie)
  return { orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 }
}

export const balancedPwc: Policy = (state) => ({
  standingOrders: [],
  bids: state.market.openOrders.map((order) => pwcBid(state, order, BALANCED_TARGET_CONFIDENCE, true)),
  actions: balancedActions(state),
})

export const capacityPwc: Policy = (state) => {
  let availableLines = state.house.lines.filter((l) => l.status === 'idle').length
  const bids: Bid[] = []
  for (const order of state.market.openOrders) {
    const needed = linesNeededFor(order)
    if (needed > availableLines) continue
    availableLines -= needed
    bids.push(pwcBid(state, order, CAPACITY_TARGET_CONFIDENCE, false))
  }
  const actions: PlayerAction[] = []
  reprioritiseArtilleryIfNeeded(state, actions)
  return { standingOrders: [], bids, actions }
}

// ── human ────────────────────────────────────────────────────────────────
// P103 (ETAPP8_FORSLAG.md §7.1, beslut 8F): en RIMLIG spelare, inte en optimal — måttstocken för
// balanspasset i P104. Den gör det en människa med spelets egna gränssnitt gör:
//  - bjuder ur `playerWinCurve` (samma kurva reglaget visar, P81c/P84), inte ur `bidEstimate.winBand`
//    som golden-testets `balanced` läser. Bland kurvans punkter väljs den med störst förväntad vinst
//    (marginal i kronor × vinstchans) som ändå ger minst HUMAN_MIN_MARGIN;
//  - föredrar förskott när kassan är låg (ordern med högst `advancePct` går före), annars bäst
//    förväntad vinst — och tar aldrig fler ordrar än linjerna räcker till (som `capacity`);
//  - lägger övertid på linjerna när ett kontrakt hotar bli sent, och ett leverantörsavtal när en
//    råvara ligger lågt (båda stående order, kostar ingen handling);
//  - använder `BACK_CHANNEL` mot en krigsfront där huset saknar kontrakt efter tur HUMAN_..._FROM_TURN;
//  - uppvaktar den tjänsteman som är närmast förfall (P99c), gör R&D-engångsförsöket, och lånar bara
//    när kassan är nära noll. Kostsamma verb bara ur överskott (P99c).
// `balanced` och `capacity` rörs inte (golden läser `balanced`); en `-pwc`-variant av dem byggs inte —
// `human` ÄR den spelarlika botten i måltabellen (8F).
const HUMAN_MIN_MARGIN = 0.05
const HUMAN_MIN_CONFIDENCE = 25
const HUMAN_LOW_CASH_SHARE = 0.5 // kassa under hälften av grundkapitalet = "låg kassa"
const HUMAN_SUPPLY_INDEX_MAX = 95 // en råvara under det här indexet är "låg" — läge för ett avtal
const HUMAN_SUPPLY_VOLUME = 50_000
const HUMAN_SUPPLY_TURNS = 6
const HUMAN_BACK_CHANNEL_FROM_TURN = 4
const HUMAN_BACK_CHANNEL_SPEND = 25_000
const HUMAN_OVERTIME_DUE_WITHIN_TURNS = 2
const HUMAN_LOAN_CASH_SHARE = 0.1 // lånar först när kassan understiger 10 % av grundkapitalet
const HUMAN_LOAN_SHARE = 0.3 // ... och då 30 % av grundkapitalet

function humanBids(state: GameState): Bid[] {
  const lowCash = state.house.treasury < state.house.foundingCapital * HUMAN_LOW_CASH_SHARE
  let availableLines = state.house.lines.filter((l) => l.status === 'idle').length
  const candidates: { bid: Bid; value: number; advancePct: number; lines: number }[] = []

  for (const order of state.market.openOrders) {
    const grade = chooseGrade(state, order)
    const curve = playerWinCurve(state, order, grade)
    const totalCost = curve[0]!.price // kurvans golv ÄR egen självkostnad (P84)
    let best: { price: number; confidence: number } | null = null
    let bestValue = 0
    for (const point of curve) {
      if (point.confidence < HUMAN_MIN_CONFIDENCE || marginAt(point.price, totalCost) < HUMAN_MIN_MARGIN) continue
      const value = (point.price - totalCost) * (point.confidence / 100)
      if (value > bestValue) {
        best = point
        bestValue = value
      }
    }
    if (!best) continue
    candidates.push({
      bid: { orderId: order.id, price: best.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 },
      value: bestValue,
      advancePct: order.advancePct,
      lines: linesNeededFor(order),
    })
  }

  candidates.sort((a, b) => (lowCash ? b.advancePct - a.advancePct || b.value - a.value : b.value - a.value))
  const bids: Bid[] = []
  for (const c of candidates) {
    if (c.lines > availableLines) continue
    availableLines -= c.lines
    bids.push(c.bid)
  }
  return bids
}

function humanStandingOrders(state: GameState): StandingOrderChange[] {
  const changes: StandingOrderChange[] = []
  const turn = state.meta.turn
  const affordable = state.house.treasury >= state.house.foundingCapital * HUMAN_LOW_CASH_SHARE

  // Övertid när ett kontrakt hotar bli sent — och tillbaka till normalt skift när hotet är över.
  const atRisk = state.market.contracts.some(
    (c) => c.status === 'active' && c.unitsDelivered < c.quantity && c.dueTurn - turn <= HUMAN_OVERTIME_DUE_WITHIN_TURNS,
  )
  const wanted = atRisk && affordable ? 'overtime' : 'normal'
  for (const line of state.house.lines) {
    const current = state.house.standingOrders?.lines[line.id]?.shift ?? 'normal'
    if (current !== wanted) changes.push({ kind: 'LINE', lineId: line.id, category: null, shift: wanted })
  }

  // Ett leverantörsavtal (högst ett nytt per tur) för den billigaste råvaran under gränsen.
  if (affordable) {
    const held = new Set((state.house.standingOrders?.supply ?? []).map((a) => a.commodity))
    let cheapest: Commodity | null = null
    for (const commodity of COMMODITIES) {
      if (held.has(commodity) || state.market.commodities[commodity] >= HUMAN_SUPPLY_INDEX_MAX) continue
      if (cheapest === null || state.market.commodities[commodity] < state.market.commodities[cheapest]) cheapest = commodity
    }
    if (cheapest !== null) {
      changes.push({ kind: 'SUPPLY', op: 'SET', commodity: cheapest, volumePerTurn: HUMAN_SUPPLY_VOLUME, durationTurns: HUMAN_SUPPLY_TURNS })
    }
  }
  return changes
}

function backChannelOnPoorFront(state: GameState, actions: PlayerAction[]): void {
  if (state.meta.turn < HUMAN_BACK_CHANNEL_FROM_TURN) return
  const served = new Set(state.market.contracts.filter((c) => c.status !== 'voided').map((c) => c.frontId))
  const front = Object.values(state.fronts).find((f) => f.status === 'war' && !served.has(f.id))
  if (!front) return
  const target = [front.sideA, front.sideB].map((id) => state.factions[id]).find((f) => f && !f.bankrupt)
  if (!target) return
  const surplus = state.house.treasury - HUMAN_BACK_CHANNEL_SPEND >= state.house.foundingCapital
  actions.push({
    type: 'POLITICAL',
    op: 'BACK_CHANNEL',
    targetFactionId: target.id,
    spend: surplus ? HUMAN_BACK_CHANNEL_SPEND : 0,
  })
}

export const human: Policy = (state) => {
  const actions: PlayerAction[] = []
  courtOfficialAtRisk(state, actions)
  backChannelOnPoorFront(state, actions)
  reprioritiseArtilleryIfNeeded(state, actions)
  if (state.house.treasury < state.house.foundingCapital * HUMAN_LOAN_CASH_SHARE) {
    takeLoan(Math.min(state.house.creditLimit, state.house.foundingCapital * HUMAN_LOAN_SHARE), actions)
  }

  const affordable = spendOnlyFromSurplus(state, actions).slice(0, state.house.actionPoints)
  return { standingOrders: humanStandingOrders(state), bids: humanBids(state), actions: affordable }
}

export const POLICIES: Record<string, Policy> = {
  passive,
  aggressive,
  balanced,
  capacity,
  human,
  'balanced-pwc': balancedPwc,
  'capacity-pwc': capacityPwc,
}
