import { describe, expect, it } from 'vitest'
import { createInitialState, getProduct } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { aggressive, balanced, passive } from '../src/policies.js'

// En handbyggd order med ett SATT referencePrice, så marginalen kan styras
// exakt. Allt annat kommer ur ett riktigt initialstate.
function withOrder(state: GameState, overrides: Partial<Order>): GameState {
  const order: Order = {
    id: 'order-test',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 100,
    statedBudget: 20000,
    trueBudget: 40000,
    referencePrice: 15000,
    requiredDeliveryTurns: 4,
    expiresTurn: state.meta.turn,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    inspectorIntegrity: 50,
    ...overrides,
  }
  state.market.openOrders = [order]
  return state
}

describe('passive (marginalfiltret, spec avsnitt 7.3)', () => {
  it('bjuder INTE när hela kontraktspriset ligger under styckkostnaden × kvantiteten + 20 %', () => {
    // m1_rifle: unitCost 210 grade A. 100 enheter ⇒ 21 000 i verklig kostnad.
    // Ett referencePrice på 15 000 lägger hela winBandet under den nivån, så
    // ingen prispunkt kan ge 20 % marginal.
    const state = withOrder(createInitialState('indochina-slice', 'passive-margin-seed'), {
      quantity: 100,
      referencePrice: 15000,
    })
    const product = getProduct('m1_rifle')
    expect(product.unitCost * 100).toBeGreaterThan(15000) // premissen testet vilar på

    expect(passive(state).bids).toEqual([])
  })

  it('bjuder när marginalen mot HELA kontraktets kostnad faktiskt räcker', () => {
    // Samma order, men ett referencePrice som lägger winBandet klart över
    // 21 000 + 20 %.
    const state = withOrder(createInitialState('indochina-slice', 'passive-margin-seed'), {
      quantity: 100,
      referencePrice: 90000,
    })

    expect(passive(state).bids.length).toBe(1)
  })

  it('tackar alltid nej till restricted, oavsett marginal', () => {
    const state = withOrder(createInitialState('indochina-slice', 'passive-restricted-seed'), {
      productId: 'mk9_longhand_shell',
      quantity: 2,
      referencePrice: 90000000,
      trueBudget: 200000000,
    })

    expect(passive(state).bids).toEqual([])
  })
})

describe('aggressive och balanced (spec avsnitt 7.3)', () => {
  it('aggressive bjuder på varje order, även restricted, och underbjuder rivalerna', () => {
    const state = withOrder(createInitialState('indochina-slice', 'aggressive-seed'), {
      productId: 'mk9_longhand_shell',
      quantity: 2,
      referencePrice: 1800000,
      trueBudget: 4000000,
    })

    const bids = aggressive(state).bids
    expect(bids.length).toBe(1)
    expect(bids[0]!.price).toBeLessThan(state.market.openOrders[0]!.referencePrice)
  })

  it('balanced bjuder på varje order', () => {
    const state = withOrder(createInitialState('indochina-slice', 'balanced-seed'), { referencePrice: 90000 })

    expect(balanced(state).bids.length).toBe(1)
  })
})
