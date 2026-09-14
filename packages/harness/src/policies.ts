// policies — härnessens botstrategier. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 10.2
// (utökar de tre ursprungliga beskrivningarna från ETAPP1_TEKNISK_SPEC.md avsnitt
// 7.3 och lägger till en fjärde, `capacity`).
//
// POLITICAL-handlingarna (STAGE_INCIDENT, BACK_CHANNEL) skickas med i submission när
// villkoret är sant, trots att applyActions.ts fortfarande bara processar TAKE_LOAN
// och alla fyra INTERNAL/INTEL/POLITICAL-operationer avsnitt 10.2 nämner utöver det
// är no-ops fram till P17/P18 — samma mönster som P3:s SUBMISSION_WITH_LOAN_ATTEMPT:
// spec-ordagrant nu, och sant den dag en framtida prompt kopplar in dem.
import { BOT_BALANCE, bidEstimate, getProduct } from '@seventh-front/core'
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

function takeLoan(amount: number, actions: PlayerAction[]): void {
  const rounded = Math.round(amount)
  if (rounded <= 0) return
  actions.push({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: rounded } })
}

// ── passive ──────────────────────────────────────────────────────────────
// Bjuder bara vid marginal > 20 %, aldrig restricted, alltid grade A. Tar
// TAKE_LOAN bara när treasury < 0 (och bara för att täcka underskottet, inte
// för att expandera) — passiv betyder försiktig, inte skuldfri till varje pris.
// Respekterar dessutom kapacitet: högst BOT_BALANCE.passiveMaxConcurrentBids bud
// per tur. Vid fler kvalificerande ordrar än så prioriteras de med bäst marginal
// (deterministiskt — Policy har ingen rng, se ETAPP1_TEKNISK_SPEC.md avsnitt 3.3).
const PASSIVE_GRADE: Grade = 'A'
const PASSIVE_MARGIN_FLOOR = 0.2

export const passive: Policy = (state) => {
  const candidates: { bid: Bid; margin: number }[] = []

  for (const order of state.market.openOrders) {
    const product = getProduct(order.productId)
    if (product.restricted) continue

    const estimate = bidEstimate(state, order, PASSIVE_GRADE)
    const totalCost = estimate.yourUnitCost * order.quantity
    let best: { price: number; confidence: number } | null = null
    for (const point of estimate.winBand) {
      if (marginAt(point.price, totalCost) <= PASSIVE_MARGIN_FLOOR) continue
      if (!best || point.confidence > best.confidence) best = point
    }
    if (!best) continue

    candidates.push({
      bid: { orderId: order.id, price: best.price, deliveryTurns: order.requiredDeliveryTurns, grade: PASSIVE_GRADE, bribe: 0 },
      margin: marginAt(best.price, totalCost),
    })
  }

  candidates.sort((a, b) => b.margin - a.margin)
  const bids = candidates.slice(0, BOT_BALANCE.passiveMaxConcurrentBids).map((c) => c.bid)

  const actions: PlayerAction[] = []
  if (state.house.treasury < 0) {
    takeLoan(Math.min(state.house.creditLimit, -state.house.treasury), actions)
  }

  return { standingOrders: [], bids, actions }
}

// ── aggressive ───────────────────────────────────────────────────────────
// Underbjuder alltid, tar varje restricted-order, grade C på allt, iscensätter
// incidenter när en teater svalnat, lånar maximalt varje tur.
const AGGRESSIVE_GRADE: Grade = 'C'
const AGGRESSIVE_UNDERCUT_FACTOR = 0.9

export const aggressive: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const estimate = bidEstimate(state, order, AGGRESSIVE_GRADE)
    const price = Math.round(estimate.rivalPriceLow * AGGRESSIVE_UNDERCUT_FACTOR)
    bids.push({ orderId: order.id, price, deliveryTurns: order.requiredDeliveryTurns, grade: AGGRESSIVE_GRADE, bribe: 0 })
  }

  const actions: PlayerAction[] = []
  stageIncidentIfCool(state, actions)
  takeLoan(state.house.creditLimit, actions)

  return { standingOrders: [], bids, actions }
}

// ── balanced ─────────────────────────────────────────────────────────────
// Bjuder mot winBand-punkten närmast 60 % konfidens. Grade C när kassan är
// trängd (treasury < gradeCashPressureThreshold), annars A — spec 5.2:s
// avvägning ("C är rätt när du är trängd på kassa ... fel när du har rykte att
// förlora"). Back-channel när doomsday > 65. Lånar till halva creditLimit varje
// tur — inte hela (det är aggressives signatur), inte inget (det vore passive).
const BALANCED_TARGET_CONFIDENCE = 60
const BALANCED_LOAN_SHARE = 0.5

export const balanced: Policy = (state) => {
  const grade: Grade = state.house.treasury < BOT_BALANCE.gradeCashPressureThreshold ? 'C' : 'A'
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const estimate = bidEstimate(state, order, grade)
    const closest = pickClosestConfidence(estimate.winBand, BALANCED_TARGET_CONFIDENCE, true)
    bids.push({ orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade, bribe: 0 })
  }

  const actions: PlayerAction[] = []
  backChannelIfHot(state, actions)
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
// variabel ska vara leveransförmågan, inte ett andra pris-experiment.
const CAPACITY_GRADE: Grade = 'A'
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

    const estimate = bidEstimate(state, order, CAPACITY_GRADE)
    const closest = pickClosestConfidence(estimate.winBand, CAPACITY_TARGET_CONFIDENCE)
    bids.push({ orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade: CAPACITY_GRADE, bribe: 0 })
  }

  return { standingOrders: [], bids, actions: [] }
}

export const POLICIES: Record<string, Policy> = { passive, aggressive, balanced, capacity }
