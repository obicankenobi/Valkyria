// BidForm.doomsday.test.tsx — P190 (ETAPP10_FORSLAG.md §7, beslut 10Ä): budmappen visar doomsday-tillägget per leverans innan budet läggs, för en produkt som ger det (mk-9). En vanlig produkt visar ingen sådan rad.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'

afterEach(cleanup)

function orderFor(state: GameState, productId: string): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-dd', buyerId, productId, quantity: 1, statedBudget: 5_000_000, trueBudget: 9_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 6, expiresTurn: state.meta.turn + 3, competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'), reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
  }
}

describe('BidForm — doomsday per leverans (P190)', () => {
  it('mk-9 visar spannet per leverans och nuvarande doomsday', () => {
    const state = createInitialState('indochina-slice', 'bid-dd-seed')
    state.house.techLevel.artillery = 8
    state.doomsday = 42
    render(<BidForm state={state} order={orderFor(state, 'mk9_longhand_shell')} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-doomsday').textContent).toMatch(/Each delivery adds 14–25 to doomsday \(now 42\)/)
  })

  it('en vanlig produkt har ingen doomsday-rad', () => {
    const state = createInitialState('indochina-slice', 'bid-dd-seed-2')
    render(<BidForm state={state} order={orderFor(state, '105mm_field_gun')} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.queryByTestId('bid-doomsday')).toBeNull()
  })
})
