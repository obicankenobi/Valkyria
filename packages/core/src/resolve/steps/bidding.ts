// bidding — avgör anbud som löper ut denna tur. Se ETAPP1_TEKNISK_SPEC.md avsnitt
// 4.2, 4.4.
import { BALANCE, alignmentPenalty, computeRivalBid, computeScore, computeUnitCostNow, getProduct } from '../../pricing.js'
import type { ResolveStep } from '../index.js'
import type { Contract, Grade, Money, Order, RivalId } from '../../types.js'

interface Candidate {
  source: 'player' | RivalId
  price: Money
  deliveryTurns: number
  grade: Grade
  bribe: Money
  score: number
}

function pickWinner(candidates: readonly Candidate[]): Candidate | null {
  if (candidates.length === 0) return null
  let best = candidates[0]!
  for (const c of candidates.slice(1)) {
    if (c.score > best.score) best = c
  }
  return best
}

export const bidding: ResolveStep = (ctx) => {
  const { draft, rng, submission, emit, rejected } = ctx
  const knownOrderIds = new Set(draft.market.openOrders.map((o) => o.id))

  // Bud mot en order som inte finns (aldrig utlyst, eller redan avgjord) är ogiltiga.
  for (const bid of submission.bids) {
    if (!knownOrderIds.has(bid.orderId)) {
      rejected.push({ action: bid, reason: `unknown order "${bid.orderId}"` })
    }
  }

  const stillOpen: Order[] = []

  for (const order of draft.market.openOrders) {
    if (order.expiresTurn > draft.meta.turn) {
      stillOpen.push(order)
      continue
    }

    const product = getProduct(order.productId)
    const faction = draft.factions[order.buyerId]
    const buyerName = faction ? faction.name.toUpperCase() : order.buyerId.toUpperCase()

    const playerBids = submission.bids.filter((b) => b.orderId === order.id)
    for (const extra of playerBids.slice(1)) {
      rejected.push({ action: extra, reason: `duplicate bid on order "${order.id}", first one kept` })
    }
    const playerBid = playerBids[0]

    const candidates: Candidate[] = []

    if (playerBid) {
      if (playerBid.price > order.trueBudget) {
        // Diskvalificerad: över trueBudget. Tyst mot spelaren (ingen upplysning om
        // var taket låg), men synlig som ticker för felsökning (spec 4.4).
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: PRICE EXCEEDS BUYER'S TRUE BUDGET`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (draft.house.reputation.reliability < BALANCE.reliabilityBidFloor) {
        // Avsnitt 6.2.B: en hård spärr, direkt efter trueBudget-kontrollen. Till
        // skillnad från trueBudget-diskvalificeringen (tyst, bara ticker) avvisas
        // den här UTTRYCKLIGEN — specens egen pseudokod pushar till rejected.
        rejected.push({ action: playerBid, reason: 'reputation below buyer threshold' })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${draft.house.name.toUpperCase()}'S RELIABILITY BELOW BUYER THRESHOLD`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else {
        const score = computeScore({
          bidPrice: playerBid.price,
          bidDeliveryTurns: playerBid.deliveryTurns,
          bidGrade: playerBid.grade,
          bidBribe: playerBid.bribe,
          referencePrice: order.referencePrice,
          requiredDeliveryTurns: order.requiredDeliveryTurns,
          weights: order.weights,
          inspectorIntegrity: order.inspectorIntegrity,
          relationToPlayer: faction ? faction.relationToPlayer : 0,
          reputation: draft.house.reputation,
          blocTerm: faction ? alignmentPenalty(faction.alignment, draft.house) : 0,
        })
        candidates.push({
          source: 'player',
          price: playerBid.price,
          deliveryTurns: playerBid.deliveryTurns,
          grade: playerBid.grade,
          bribe: playerBid.bribe,
          score,
        })
      }
    }

    for (const rivalId of order.competingRivals) {
      const rival = draft.rivals[rivalId]
      if (!rival) continue

      const rivalBid = computeRivalBid(rng, rival, product, order.referencePrice)
      if (rivalBid.price > order.trueBudget) {
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `${rival.name.toUpperCase()}'S BID ON ${order.id} DISQUALIFIED: PRICE EXCEEDS BUYER'S TRUE BUDGET`,
          causeId: null,
          delta: {},
          actorIsPlayer: false,
          subjectId: order.buyerId,
        })
        continue
      }

      // Rivaler har ingen grade (spec 4.2 tillämpar ingen gradeFactor på rivalbudet)
      // och inget spårat relationToPlayer/reputation (RivalHouse saknar de fälten —
      // se pricing.ts). 'A' ger effectiveRef = referencePrice, exakt vad formeln de
      // facto redan bjöd mot.
      const score = computeScore({
        bidPrice: rivalBid.price,
        bidDeliveryTurns: rivalBid.deliveryTurns,
        bidGrade: 'A',
        bidBribe: 0,
        referencePrice: order.referencePrice,
        requiredDeliveryTurns: order.requiredDeliveryTurns,
        weights: order.weights,
        inspectorIntegrity: order.inspectorIntegrity,
        relationToPlayer: 0,
        reputation: null,
        blocTerm: 0,
      })
      candidates.push({ source: rivalId, price: rivalBid.price, deliveryTurns: rivalBid.deliveryTurns, grade: 'A', bribe: 0, score })
    }

    const winner = pickWinner(candidates)

    if (!winner) {
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${buyerName}'S ORDER FOR ${product.name.toUpperCase()} GOES UNFULFILLED`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
      continue
    }

    if (faction && winner.price > faction.militaryBudget) {
      // Avsnitt 7.1.A: golv vid tilldelning, samma gren som "no winner" — en
      // vinnare fanns, men köparen har inte råd med DEN.
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${buyerName}'S ORDER FOR ${product.name.toUpperCase()} WITHDRAWN — BUDGET EXHAUSTED`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
      continue
    }

    if (faction) {
      faction.militaryBudget -= winner.price
    }

    if (winner.source === 'player') {
      const unitCostAtSigning = computeUnitCostNow(product, winner.grade, draft.market.supplyCostIndex)
      const contract: Contract = {
        id: `contract-${order.id}`,
        buyerId: order.buyerId,
        productId: order.productId,
        quantity: order.quantity,
        unitsDelivered: 0,
        price: winner.price,
        unitCostAtSigning,
        grade: winner.grade,
        dueTurn: draft.meta.turn + winner.deliveryTurns,
        status: 'active',
      }
      draft.market.contracts.push(contract)

      if (faction) {
        const boost = rng.int(BALANCE.relationBoostMin, BALANCE.relationBoostMax)
        faction.relationToPlayer = Math.min(100, faction.relationToPlayer + boost)
      }

      emit({
        severity: 'headline',
        scope: 'market',
        headline: `${draft.house.name.toUpperCase()} WINS CONTRACT: ${product.name.toUpperCase()} × ${order.quantity} TO ${buyerName}`,
        causeId: null,
        delta: { price: winner.price },
        actorIsPlayer: true,
        subjectId: order.buyerId,
      })
    } else {
      const rival = draft.rivals[winner.source]
      const rivalName = rival ? rival.name.toUpperCase() : winner.source.toUpperCase()
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${rivalName} WINS CONTRACT: ${product.name.toUpperCase()} × ${order.quantity} TO ${buyerName}`,
        causeId: null,
        delta: { price: winner.price },
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
    }
  }

  draft.market.openOrders = stillOpen
}
