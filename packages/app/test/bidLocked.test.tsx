// bidLocked.test.tsx — P185 (ETAPP11_FORSLAG.md §9b, 11O): ett låst bud i budmappen — en LOCKED-ruta med skälet i klartext, och Place Bid avstängd. En order i verkets kategori är oförändrad.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'
import { TheFloor } from '../src/components/TheFloor.js'

afterEach(cleanup)

function makeOrder(state: GameState, overrides: Partial<Order> = {}): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-test-0', buyerId, productId: 'm3_apc', quantity: 40, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3, competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0, ...overrides,
  }
}

describe('BidForm — låst bud (P185)', () => {
  it('en order i en kategori utan verk visar LOCKED, skälet och en avstängd Place Bid', () => {
    const state = createInitialState('indochina-slice', 'bid-locked-seed')
    state.house.techLevel.armour = 9
    const onSubmit = vi.fn()
    render(<BidForm state={state} order={makeOrder(state)} existingBid={undefined} onSubmit={onSubmit} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-locked-reason').textContent).toMatch(/^Requires an Assembly Works for armour/)
    const submit = screen.getByTestId('bid-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('en order i verkets kategori har ingen låsruta och Place Bid fungerar', () => {
    const state = createInitialState('indochina-slice', 'bid-open-seed')
    const onSubmit = vi.fn()
    render(<BidForm state={state} order={makeOrder(state, { productId: '105mm_field_gun', quantity: 80 })} existingBid={undefined} onSubmit={onSubmit} onRemove={() => {}} />)
    expect(screen.queryByTestId('bid-locked')).toBeNull()
    const submit = screen.getByTestId('bid-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('ett verk som blir klart inom ett kvartal öppnar låset', () => {
    const state = createInitialState('indochina-slice', 'bid-building-seed')
    state.house.works.push({ ...state.house.works[0]!, id: 'works-9', category: 'armour', lines: [], status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 3, turnsLeft: 1, costTotal: 1, costPerTurn: 1, forced: false } })
    render(<BidForm state={state} order={makeOrder(state)} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.queryByTestId('bid-locked')).toBeNull()
  })
})

describe('TheFloor — LOCKED-stämpeln på mappen (P185)', () => {
  it('en låst order har stämpeln, en öppen har den inte', () => {
    const state = createInitialState('indochina-slice', 'floor-locked-seed')
    state.market.openOrders = [makeOrder(state, { id: 'locked' }), makeOrder(state, { id: 'open', productId: '105mm_field_gun', quantity: 80 })]
    const draft: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
    render(<TheFloor state={state} draft={draft} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    expect(screen.getAllByTestId('order-locked-stamp')).toHaveLength(1)
    expect(screen.getAllByTestId('order-folder')).toHaveLength(2)
  })
})
