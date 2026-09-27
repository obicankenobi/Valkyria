// queries.playerWinCurve.test.ts — P81c (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten). playerWinCurve besvarar "var, mellan min egen
// självkostnad och rivalPriceHigh, börjar jag vinna" — en annan fråga än
// bidEstimate.winBand, som bara samplar mellan rivalPriceLow/rivalPriceHigh
// och kan missa hela intervallet där spelarens eget bud faktiskt vinner
// (speltestets fynd, P81-7).
import { describe, expect, it } from 'vitest'
import { playerWinCurve, bidEstimate } from '../src/queries.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createInitialState } from '../src/state.js'
import { createRng } from '../src/rng.js'
import type { GameState, Order } from '../src/types.js'

function orderFor(state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
  }
}

describe('playerWinCurve (P81c)', () => {
  it('bitvis identisk vid upprepade anrop inom samma tur, rör aldrig huvud-Rng:ns cursor (hård regel 2)', () => {
    const state = createInitialState('indochina-slice', 'wincurve-seed')
    const order = orderFor(state)
    const cursorBefore = state.meta.rngCursor

    const first = playerWinCurve(state, order, 'A')
    for (let i = 0; i < 20; i++) {
      expect(playerWinCurve(state, order, 'A')).toEqual(first)
    }
    expect(state.meta.rngCursor).toBe(cursorBefore)
  })

  it('har fler punkter än bidEstimate.winBand och sträcker sig NER mot spelarens egen självkostnad, inte bara rivalprisbandet', () => {
    const state = createInitialState('indochina-slice', 'wincurve-range-seed')
    const order = orderFor(state)

    const estimate = bidEstimate(state, order, 'A')
    const curve = playerWinCurve(state, order, 'A')

    expect(curve.length).toBeGreaterThan(estimate.winBand.length)
    const lowestCurvePrice = curve[0]!.price
    // Golvet ska ligga vid eller under bidEstimate.rivalPriceLow — annars
    // löser curven inte P81-7:s fynd (bandet centrerat för högt för att
    // någonsin visa var spelaren faktiskt vinner).
    expect(lowestCurvePrice).toBeLessThanOrEqual(estimate.rivalPriceLow)
  })

  it('konfidensen ökar (eller står still) med FALLANDE pris — ett lägre bud vinner aldrig mer sällan än ett högre', () => {
    const state = createInitialState('indochina-slice', 'wincurve-monotone-seed')
    const order = orderFor(state)
    const curve = playerWinCurve(state, order, 'A')

    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.confidence).toBeLessThanOrEqual(curve[i - 1]!.confidence)
    }
  })

  it('vid ett lågt pris (nära självkostnaden) är konfidensen mätbart över 0 %, till skillnad från winBand som kan visa 0 % i alla fem punkter', () => {
    const state = createInitialState('indochina-slice', 'wincurve-nonzero-seed')
    const order = orderFor(state)
    const curve = playerWinCurve(state, order, 'A')

    expect(curve[0]!.confidence).toBeGreaterThan(0)
  })

  it('curvens lägsta prispunkt matchar en verklig vinstfrekvens i bidding.ts inom rimlig felmarginal (±15 procentenheter, 150 dragningar)', () => {
    const base = createInitialState('indochina-slice', 'wincurve-parity-seed')
    const order = orderFor(base)
    const curve = playerWinCurve(base, order, 'A')
    const price = curve[0]!.price

    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const state = createInitialState('indochina-slice', `wincurve-parity-${i}`)
      const testOrder: Order = { ...orderFor(state), expiresTurn: 0 }
      state.market.openOrders = [testOrder]
      state.meta.turn = 0

      const submission = {
        standingOrders: [],
        bids: [{ orderId: testOrder.id, price, deliveryTurns: testOrder.requiredDeliveryTurns, grade: 'A' as const, bribe: 0 }],
        actions: [],
      }
      bidding({
        state,
        draft: state,
        submission,
        rng: createRng(`wincurve-parity-${i}`, 0),
        emit: () => 't',
        rejected: [],
      })
      if (state.market.contracts.length > 0) wins++
    }

    const actualPct = (wins / SEEDS) * 100
    expect(Math.abs(actualPct - curve[0]!.confidence)).toBeLessThanOrEqual(15)
  })
})
