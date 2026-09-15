// P46 klart-när (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.3, sista
// meningen): "Order.weights visas aldrig." Renderar TheFloor.tsx PÅ RIKTIGT
// (jsdom, @testing-library/react) med ett bud öppnat (BidForm synlig också),
// och letar efter distinkta talsträngar ur en order med avsiktligt ovanliga
// vikter — om någon framtida ändring råkar rendera weights.price/delivery/
// relationship fångas det här, inte bara genom att läsa källkoden.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { TheFloor } from '../src/components/TheFloor.js'

afterEach(cleanup)

// Ovanliga, lätt igenkännbara decimaltal — osannolika att dyka upp av misstag
// i någon annan visad siffra (pris, kvantitet, budget).
const DISTINCTIVE_WEIGHTS = { price: 0.187654, delivery: 0.687654, relationship: 0.124692 }

function makeOrder(state: GameState): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-weights-test-0',
    buyerId,
    productId: 'm1_rifle',
    quantity: 250,
    statedBudget: 5_000_000,
    trueBudget: 8_000_000,
    referencePrice: 4_000_000,
    requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3,
    competingRivals: [],
    weights: DISTINCTIVE_WEIGHTS,
    inspectorIntegrity: 50,
  }
}

describe('TheFloor — P46 klart-när: Order.weights exponeras aldrig i UI:t', () => {
  it('varken den stängda ordertraden eller det öppnade budformuläret visar weights.price/delivery/relationship', () => {
    const state = createInitialState('indochina-slice', 'weights-hidden-seed')
    const order = makeOrder(state)
    state.market.openOrders = [order]
    const draft: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

    const { container } = render(
      <TheFloor state={state} draft={draft} onSubmitBid={() => {}} onRemoveBid={() => {}} />,
    )

    // Stängd vy.
    for (const value of Object.values(DISTINCTIVE_WEIGHTS)) {
      expect(container.textContent).not.toContain(String(value))
    }

    // Öppna budformuläret också — weights får inte läcka där heller.
    fireEvent.click(screen.getByRole('button', { name: 'quote' }))
    for (const value of Object.values(DISTINCTIVE_WEIGHTS)) {
      expect(container.textContent).not.toContain(String(value))
    }
  })
})
