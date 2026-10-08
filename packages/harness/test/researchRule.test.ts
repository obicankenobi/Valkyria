// researchRule.test.ts — P188 (ETAPP10_FORSLAG.md §7, beslut 10X): `human` forskar i artilleri direkt (ett billigt projekt som håller standardprodukten aktuell) och bjuder inte med en standardprodukt
// som ligger en generation för långt efter köparens block.
import { describe, expect, it } from 'vitest'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { POLICIES } from '../src/policies.js'

function orderFor(state: GameState): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-rr', buyerId, productId: '105mm_field_gun', quantity: 40, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 5, expiresTurn: state.meta.turn + 1,
    competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'), reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
  }
}

describe('forskningens regel i härnessen (P188)', () => {
  it('human sätter ett forskningsspår i artilleri från start, även utan överskott', () => {
    const state = createInitialState('indochina-slice', 'rr-1')
    state.house.treasury = 2_000_000 // under grundkapitalet: tidigare gick spåret bara att sätta ur ett överskott
    const sub = POLICIES.human!(state)
    expect(sub.standingOrders).toContainEqual({ kind: 'RESEARCH', op: 'SET', category: 'artillery', pace: 'normal' })
  })

  it('ett designprojekt i artilleri hindrar inte spåret (de är olika projekt)', () => {
    const state = createInitialState('indochina-slice', 'rr-2')
    state.house.rnd.push({ category: 'artillery', turnsRemaining: 4, turnsTotal: 6, design: { focus: 'balanced', ambition: 'cards' } } as never)
    const sub = POLICIES.human!(state)
    expect(sub.standingOrders.some((c) => c.kind === 'RESEARCH' && c.op === 'SET' && c.category === 'artillery')).toBe(true)
  })

  it('human bjuder inte på en order där standardprodukten är en generation för gammal', () => {
    const state = createInitialState('indochina-slice', 'rr-3')
    state.market.openOrders = [orderFor(state)]
    expect(POLICIES.human!(state).bids).toHaveLength(1)
    state.race.generation.west.artillery = 3
    state.race.generation.east.artillery = 3
    expect(POLICIES.human!(state).bids).toHaveLength(0)
    state.house.techLevel.artillery += 1
    expect(POLICIES.human!(state).bids).toHaveLength(1)
  })
})
