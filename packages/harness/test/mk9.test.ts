// mk9.test.ts — P190 (ETAPP10_FORSLAG.md §7, beslut 10Ä): kärnvapenskalet mk-9 är forskningens pris. `human` avstår från det när doomsday ligger på 60 eller högre (en försiktig spelare); `human-hawk` säljer det alltid.
import { describe, expect, it } from 'vitest'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { POLICIES } from '../src/policies.js'

function mk9State(doomsday: number): GameState {
  const state = createInitialState('indochina-slice', 'mk9-seed')
  state.house.techLevel.artillery = 8
  state.doomsday = doomsday
  const buyerId = Object.keys(state.factions)[0]!
  const order: Order = {
    id: 'order-mk9', buyerId, productId: 'mk9_longhand_shell', quantity: 1, statedBudget: 5_000_000, trueBudget: 9_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 6, expiresTurn: state.meta.turn + 1,
    competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'), reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
  }
  state.market.openOrders = [order]
  return state
}

const mk9Bids = (policy: string, doomsday: number): number => POLICIES[policy]!(mk9State(doomsday)).bids.filter((b) => b.orderId === 'order-mk9').length

describe('mk-9 i härnessen (P190, 10Ä)', () => {
  it('human bjuder på mk-9 under doomsday 60 och avstår från det vid 60 eller högre', () => {
    expect(mk9Bids('human', 59)).toBe(1)
    expect(mk9Bids('human', 60)).toBe(0)
    expect(mk9Bids('human', 85)).toBe(0)
  })

  it('human-hawk säljer det alltid', () => {
    expect(mk9Bids('human-hawk', 59)).toBe(1)
    expect(mk9Bids('human-hawk', 85)).toBe(1)
  })
})
