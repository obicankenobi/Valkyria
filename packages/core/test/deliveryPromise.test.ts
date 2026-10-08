// deliveryPromise.test.ts — P189 (ETAPP11_FORSLAG.md §9b, beslut 11AD): kapacitet köper leveranstid. `computeScore` ger inget för en kortare leveranstid än kravet (bara straff för längre), så en term läggs EFTER
// computeScore i bidTerms.ts: poäng per kvartal ett bud lovar under köparens krav, med tak. Delas av bidding.ts (avgörandet), bidEstimate och playerWinCurve (en formel, en källa). Rivalerna får den på samma
// villkor, begränsade av sin kapacitet (en fullbelagd rival, rivalCapacityContracts aktiva kontrakt, kan inte lova snabbare). computeScore är orörd.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { deliveryPromiseTerm, rivalDeliveryPromiseTerm } from '../src/bidTerms.js'
import { playerWinCurve } from '../src/queries.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { GameState, Order } from '../src/types.js'

const B = balance as unknown as { deliveryPromiseFactor: number; deliveryPromiseCapTurns: number; deliveryTermWeight: number; rivalCapacityContracts: number }
const W = { price: 0.55, delivery: 0.3, relationship: 0.15 }

function orderFor(state: GameState, over: Partial<Order> = {}): Order {
  return {
    id: 'order-dp', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, statedBudget: 1_800_000, trueBudget: 2_400_000, referencePrice: 2_000_000, requiredDeliveryTurns: 5, expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals), weights: W, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0, ...over,
  }
}

describe('deliveryPromiseTerm (P189)', () => {
  it('är faktor × leveransvikt × leveransterminens vikt × kvartal under kravet, och noll vid eller över kravet', () => {
    const per = B.deliveryPromiseFactor * W.delivery * B.deliveryTermWeight
    expect(deliveryPromiseTerm(W, 5, 5)).toBe(0)
    expect(deliveryPromiseTerm(W, 7, 5)).toBe(0) // sent löfte straffas av computeScore, inte här
    expect(deliveryPromiseTerm(W, 4, 5)).toBeCloseTo(per, 10)
  })

  it('har ett tak: fler kvartal än deliveryPromiseCapTurns ger inget extra', () => {
    const per = B.deliveryPromiseFactor * W.delivery * B.deliveryTermWeight
    expect(deliveryPromiseTerm(W, 1, 9)).toBeCloseTo(per * B.deliveryPromiseCapTurns, 10)
    expect(deliveryPromiseTerm(W, 1, 40)).toBeCloseTo(per * B.deliveryPromiseCapTurns, 10)
  })

  it('en rival som redan bär sin kapacitet får ingen term; en med luft får den fulla', () => {
    expect(rivalDeliveryPromiseTerm(B.rivalCapacityContracts, W, 3, 5)).toBe(0)
    expect(rivalDeliveryPromiseTerm(B.rivalCapacityContracts - 1, W, 3, 5)).toBe(deliveryPromiseTerm(W, 3, 5))
  })
})

describe('playerWinCurve och avgörandet ser samma term', () => {
  it('ett kortare löfte ger högre vinstchans i kurvan (samma priser)', () => {
    const state = createInitialState('indochina-slice', 'dp-curve')
    const order = orderFor(state)
    const slow = playerWinCurve(state, order, 'A', undefined, false, false, order.requiredDeliveryTurns)
    const fast = playerWinCurve(state, order, 'A', undefined, false, false, order.requiredDeliveryTurns - B.deliveryPromiseCapTurns)
    expect(fast.map((p) => p.price)).toEqual(slow.map((p) => p.price))
    const sum = (c: { confidence: number }[]): number => c.reduce((s, p) => s + p.confidence, 0)
    expect(sum(fast)).toBeGreaterThan(sum(slow))
  })

  it('bidding.ts avgör med termen: frekvens och kurva stämmer inom ±15 pp för ett bud som lovar snabbare', () => {
    const base = createInitialState('indochina-slice', 'dp-parity')
    const early = orderFor(base).requiredDeliveryTurns - B.deliveryPromiseCapTurns
    const curve = playerWinCurve(base, orderFor(base), 'A', undefined, false, false, early)
    const point = curve.reduce((best, p) => (Math.abs(p.confidence - 50) < Math.abs(best.confidence - 50) ? p : best))
    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const state = createInitialState('indochina-slice', `dp-parity-${i}`)
      const order: Order = { ...orderFor(state), expiresTurn: 0 }
      state.market.openOrders = [order]
      state.meta.turn = 0
      bidding({
        state, draft: state, submission: { standingOrders: [], bids: [{ orderId: order.id, price: point.price, deliveryTurns: early, grade: 'A', bribe: 0 }], actions: [] },
        rng: createRng(`dp-parity-${i}`, 0), emit: () => 't', rejected: [],
      })
      if (state.market.contracts.length > 0) wins++
    }
    expect(Math.abs((wins / SEEDS) * 100 - point.confidence)).toBeLessThanOrEqual(15)
  })
})
