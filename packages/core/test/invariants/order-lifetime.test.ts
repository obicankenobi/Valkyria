import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../../src/resolve/index.js'
import { createInitialState } from '../../src/state.js'
import type { GameState, Order, TurnSubmission } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// order.id har formen `order-${skapelsetur}-${seq}` (orders.ts) — precis så att den
// här invarianten kan verifieras utan ett separat "createdTurn"-fält. Se spec 3.2:
// "order.expiresTurn > skapelseturen".
function creationTurnFromId(order: Order): number {
  const match = /^order-(\d+)-\d+$/.exec(order.id)
  if (!match) {
    throw new Error(`order-lifetime-testet kan inte tolka skapelsetur ur id "${order.id}"`)
  }
  return Number(match[1])
}

describe('order-lifetime invariant (spec 3.2)', () => {
  it('ingen order har expiresTurn <= den tur den skapades, över 20 turer och flera seeds', () => {
    for (const seed of ['order-lifetime-a', 'order-lifetime-b', 'order-lifetime-c']) {
      let state: GameState = createInitialState('indochina-slice', seed)
      let checked = 0

      for (let i = 0; i < 20; i++) {
        const result = resolveTurn(state, EMPTY_SUBMISSION)
        state = result.state

        for (const order of state.market.openOrders) {
          const createdTurn = creationTurnFromId(order)
          expect(order.expiresTurn).toBeGreaterThan(createdTurn)
          checked++
        }
      }

      // Om ingen order någonsin skapades testar vi ingenting — ett tecken på att
      // ordergenereringen är trasig, inte att invarianten håller.
      expect(checked).toBeGreaterThan(0)
    }
  })

  it('en scriptad restricted-order (tur 10 i indochina-slice) uppfyller invarianten också', () => {
    let state: GameState = createInitialState('indochina-slice', 'restricted-lifetime-seed')
    for (let i = 0; i < 11; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }
    const restricted = state.market.openOrders.find((o) => o.productId === 'mk9_longhand_shell')
    expect(restricted).toBeDefined()
    expect(restricted!.expiresTurn).toBeGreaterThan(creationTurnFromId(restricted!))
  })
})
