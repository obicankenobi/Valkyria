// deliveries — leveranser anländer, betalning bokförs, reliability faller vid
// missad deadline, restricted-leverans anropar doomsdayGate. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Leverans").
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import { getProduct } from '../../pricing.js'
import { addDoomsday } from '../doomsdayGate.js'
import type { ResolveStep } from '../index.js'

interface Balance {
  reliabilityLatePenalty: number
}
const BALANCE = balanceData as unknown as Balance

export const deliveries: ResolveStep = (ctx) => {
  const { draft, rng, emit } = ctx
  const house = draft.house

  // 1) Skeppningar som anlänt den här turen.
  const arrived = draft.market.shipments.filter((s) => s.arrivalTurn <= draft.meta.turn)
  const stillInTransit = draft.market.shipments.filter((s) => s.arrivalTurn > draft.meta.turn)

  for (const shipment of arrived) {
    const contract = draft.market.contracts.find((c) => c.id === shipment.contractId)
    if (!contract || (contract.status !== 'active' && contract.status !== 'late')) continue

    const product = getProduct(contract.productId)
    const buyer = draft.factions[contract.buyerId]
    const buyerName = buyer ? buyer.name.toUpperCase() : contract.buyerId.toUpperCase()

    contract.unitsDelivered += shipment.units
    // Betalning bokförs proportionellt mot levererad andel (spec 5).
    const revenue = round(contract.price * (shipment.units / contract.quantity))
    house.treasury += revenue
    house.revenueByTurn[draft.meta.turn] = (house.revenueByTurn[draft.meta.turn] ?? 0) + revenue

    const deliveryId = emit({
      severity: 'report',
      scope: 'market',
      headline: `DELIVERED ${shipment.units}× ${product.name.toUpperCase()} TO ${buyerName} (+£${revenue.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { treasury: revenue, unitsDelivered: shipment.units },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })

    if (product.restricted && product.doomsdayOnDelivery) {
      const [min, max] = product.doomsdayOnDelivery
      addDoomsday(ctx, rng.int(min, max), deliveryId)
    }

    if (contract.unitsDelivered >= contract.quantity) {
      contract.status = 'fulfilled'
      emit({
        severity: 'headline',
        scope: 'market',
        headline: `CONTRACT ${contract.id} FULFILLED: ${product.name.toUpperCase()} TO ${buyerName}`,
        causeId: deliveryId,
        delta: {},
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
    }
  }

  draft.market.shipments = stillInTransit

  // 2) Försenade kontrakt — en engångsövergång 'active' → 'late', inte en
  //    återkommande straffavgift varje tur den förblir försenad.
  for (const contract of draft.market.contracts) {
    if (contract.status !== 'active') continue
    if (draft.meta.turn <= contract.dueTurn) continue

    contract.status = 'late'
    house.reputation.reliability = Math.max(0, house.reputation.reliability - BALANCE.reliabilityLatePenalty)

    emit({
      severity: 'headline',
      scope: 'house',
      headline: `CONTRACT ${contract.id} LATE — ${house.name.toUpperCase()}'S RELIABILITY FALLS`,
      causeId: null,
      delta: { reliability: -BALANCE.reliabilityLatePenalty },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })
  }
}
