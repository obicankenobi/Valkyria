// BidForm.capacity.test.tsx — P180 (ETAPP11_FORSLAG.md §8 punkt 4): budmappen visar "ready by" och vad ordern tränger undan, ur samma projektion som produktionstavlan.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { capacityOutlook, createInitialState, officialId } from '@seventh-front/core'
import type { Contract, GameState, Order } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'

afterEach(cleanup)

function makeOrder(state: GameState, overrides: Partial<Order> = {}): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-test-0', buyerId, productId: '105mm_field_gun', quantity: 100, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000,
    requiredDeliveryTurns: 5, expiresTurn: state.meta.turn + 3, competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: officialId(buyerId, 'procurement'), reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0, ...overrides,
  }
}

describe('BidForm — "ready by" (P180)', () => {
  it('visar tidigast färdig, linjen och leveransfönstret exakt som capacityOutlook säger', () => {
    const state = createInitialState('indochina-slice', 'bidform-capacity-seed')
    const order = makeOrder(state, { quantity: 40 })
    const o = capacityOutlook(state, { productId: order.productId, quantity: order.quantity, designId: null, deliveryTurns: order.requiredDeliveryTurns })
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-ready').textContent).toContain(`T${o.readyTurn}`)
    expect(screen.getByTestId('bid-ready').textContent).toContain(o.line!.toUpperCase())
    expect(screen.getByTestId('bid-delivered').textContent).toContain(`T${o.deliveredBetween![0]}–T${o.deliveredBetween![1]}`)
    expect(screen.queryByTestId('bid-late')).toBeNull()
  })

  it('en kategori inget verk bygger går via en underleverantör, och det står i klartext', () => {
    const state = createInitialState('indochina-slice', 'bidform-capacity-sub-seed')
    render(<BidForm state={state} order={makeOrder(state, { productId: 'm3_apc', quantity: 15 })} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-ready').textContent).toContain('with a subcontractor')
  })

  it('en kort leveranstid som inte hinner varnar med hur många kvartal som saknas — och räknas om när leveranstiden ändras', () => {
    const state = createInitialState('indochina-slice', 'bidform-capacity-late-seed')
    const order = makeOrder(state, { quantity: 4000, requiredDeliveryTurns: 2 })
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-late').textContent).toMatch(/Too late at 2 quarters — short by \d+ quarter/)
    const before = screen.getByTestId('bid-delivered').textContent
    fireEvent.click(screen.getByLabelText('Increase Delivery time'))
    expect(screen.getByTestId('bid-late').textContent).toContain('Too late at 3 quarters')
    expect(screen.getByTestId('bid-delivered').textContent).not.toBe(before) // "wants it by T…" följer reglaget
  })

  it('väntande kontrakt: ordern ställs bakom dem, och visar vilka den skulle skjuta förbi sin förfallodag om den gick först', () => {
    const state = createInitialState('indochina-slice', 'bidform-capacity-queue-seed')
    const mk = (id: string, quantity: number, dueTurn: number): Contract => ({
      id, buyerId: 'rvn', productId: '105mm_field_gun', quantity, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
      dueTurn, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0,
    })
    state.market.contracts = [mk('contract-1', 100, state.meta.turn + 5), mk('contract-2', 100, state.meta.turn + 5), mk('contract-3', 30, state.meta.turn + 7)]
    const order = makeOrder(state, { quantity: 400 })
    const o = capacityOutlook(state, { productId: order.productId, quantity: order.quantity, designId: null, deliveryTurns: order.requiredDeliveryTurns })
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.getByTestId('bid-queue').textContent).toContain(`${o.waitingAhead.length} waiting contract`)
    if (o.displacesIfFirst.length > 0) expect(screen.getByTestId('bid-displaces').textContent).toContain(o.displacesIfFirst[0]!.contractId.replace(/^contract-/, ''))
    else expect(screen.queryByTestId('bid-displaces')).toBeNull()
  })
})
