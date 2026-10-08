// BidForm.promise.test.tsx — P189 (ETAPP11_FORSLAG.md §9b, 11AD): budmappen visar leveransterminens poäng bredvid leveranstiden, och vinstchansen räknas om med löftet.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'

afterEach(cleanup)

function makeOrder(state: GameState): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-promise', buyerId, productId: '105mm_field_gun', quantity: 40, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3, competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'), reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1', advancePct: 0,
  }
}

describe('BidForm — leveransterminen (P189)', () => {
  it('på kravet står en uppmaning; ett kortare löfte visar poängen termen ger', () => {
    const state = createInitialState('indochina-slice', 'bid-promise-seed')
    render(<BidForm state={state} order={makeOrder(state)} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-promise-term').textContent).toMatch(/Promise less than the buyer's 5 quarters/)
    fireEvent.click(within(screen.getByTestId('bid-delivery')).getByRole('button', { name: /decrease|−|-/i }))
    expect(screen.getByTestId('bid-promise-term').textContent).toMatch(/Promising 1 quarter early adds [0-9.]+ points/)
  })
})
