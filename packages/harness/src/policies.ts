// policies — de tre botstrategierna. Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.3.
//
// "Botstrategier behöver inte vara smarta. De behöver vara olika." — ingen av de tre
// beskrivningarna nämner lån, grade-val utöver 'A', eller några INTERNAL-handlingar
// alls. De byggs därför inte in här: en bot som bara gör det specen faktiskt
// beskriver, inget mer. POLITICAL-handlingarna (STAGE_INCIDENT, BACK_CHANNEL)
// skickas ändå med i submission när villkoret är sant, trots att applyActions.ts
// bara processar TAKE_LOAN på riktigt (P8) — samma mönster som P3:s
// SUBMISSION_WITH_LOAN_ATTEMPT: spec-ordagrant nu, och sant den dag en framtida
// prompt kopplar in dem.
import { bidEstimate, getProduct } from '@seventh-front/core'
import type { Bid, GameState, Grade, PlayerAction, TurnSubmission } from '@seventh-front/core'

const GRADE: Grade = 'A' // ingen av de tre beskrivningarna säger något om grade-val

export type Policy = (state: GameState) => TurnSubmission

// passive — bjuder bara där winBand visar marginal > 20 %, inga politiska
// operationer, tackar alltid nej till restricted.
export const passive: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const product = getProduct(order.productId)
    if (product.restricted) continue

    const estimate = bidEstimate(state, order, GRADE)
    // point.price är HELA kontraktets pris, yourUnitCost kostnaden för EN enhet
    // (spec 4.1, CLAUDE.md hård regel 10) — kostnadssidan måste skalas med
    // orderns kvantitet. Utan multiplikationen jämförde filtret ett
    // sexsiffrigt kontraktspris mot en tresiffrig styckkostnad och släppte
    // igenom bud som garanterat gick med förlust. Se ANDRINGSLOGG.md.
    const totalCost = estimate.yourUnitCost * order.quantity
    let best: { price: number; confidence: number } | null = null
    for (const point of estimate.winBand) {
      const margin = point.price > 0 ? (point.price - totalCost) / point.price : 0
      if (margin <= 0.2) continue
      if (!best || point.confidence > best.confidence) best = point
    }
    if (!best) continue

    bids.push({ orderId: order.id, price: best.price, deliveryTurns: order.requiredDeliveryTurns, grade: GRADE, bribe: 0 })
  }

  return { standingOrders: [], bids, actions: [] }
}

// aggressive — underbjuder alltid, tar varje restricted-order, iscensätter
// incidenter när heat < 40.
export const aggressive: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const estimate = bidEstimate(state, order, GRADE)
    // "Underbjuder alltid" — gott under den skattade lägsta rivalprisänden, oavsett
    // produkttyp (restricted tas alltid, till skillnad från passive).
    const price = Math.round(estimate.rivalPriceLow * 0.9)
    bids.push({ orderId: order.id, price, deliveryTurns: order.requiredDeliveryTurns, grade: GRADE, bribe: 0 })
  }

  const actions: PlayerAction[] = []
  const anyTheatreCool = Object.values(state.theatres).some((t) => t.heat < 40)
  if (anyTheatreCool) {
    const target = Object.values(state.factions).find((f) => !f.bankrupt)
    if (target) {
      actions.push({ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: target.id, spend: 0 })
    }
  }

  return { standingOrders: [], bids, actions }
}

// balanced — bjuder mot winBand-priset närmast 60 % konfidens, back-channel när
// doomsday > 65.
export const balanced: Policy = (state) => {
  const bids: Bid[] = []

  for (const order of state.market.openOrders) {
    const estimate = bidEstimate(state, order, GRADE)
    let closest = estimate.winBand[0]!
    for (const point of estimate.winBand.slice(1)) {
      if (Math.abs(point.confidence - 60) < Math.abs(closest.confidence - 60)) closest = point
    }
    bids.push({ orderId: order.id, price: closest.price, deliveryTurns: order.requiredDeliveryTurns, grade: GRADE, bribe: 0 })
  }

  const actions: PlayerAction[] = []
  if (state.doomsday > 65) {
    const target = Object.values(state.factions).find((f) => !f.bankrupt)
    if (target) {
      actions.push({ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: target.id, spend: 0 })
    }
  }

  return { standingOrders: [], bids, actions }
}

export const POLICIES: Record<string, Policy> = { passive, aggressive, balanced }
