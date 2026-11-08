// TheFloor.front.test.tsx — P46 klart-når (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2/8):
// "ett test visar att en orderrad namnger sin front; ett test visar att en
// order utan frontId inte kraschar vyn." Renderar TheFloor.tsx PÅ RIKTIGT
// (jsdom), samma mönster som TheFloor.weights.test.tsx.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { TheFloor } from '../src/components/TheFloor.js'

afterEach(cleanup)

function makeOrder(state: GameState, frontId: string | null): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-front-test-0',
    buyerId,
    productId: 'm1_rifle',
    quantity: 250,
    statedBudget: 5_000_000,
    trueBudget: 8_000_000,
    referencePrice: 4_000_000,
    requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): buyerId är faktions-beroende
    // (Object.keys ovan) — officialId() i stället för att anta vilken faktion.
    officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId, advancePct: 0,
  }
}

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

describe('TheFloor — P46 klart-når: fronten synlig på order- och kontraktsraderna', () => {
  it('en orderrad namnger sin front', () => {
    const state = createInitialState('indochina-slice', 'front-visible-seed')
    state.market.openOrders = [makeOrder(state, 'front-laos')]

    const { container } = render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)

    // P202 (etapp 14): frontens namn, inte front-id:t.
    expect(container.textContent).toContain('Laos front')
    expect(container.textContent).not.toContain('front-laos')
  })

  it('en order utan frontId (null) kraschar inte vyn — visas som "No front" i stället', () => {
    const state = createInitialState('indochina-slice', 'front-null-seed')
    state.market.openOrders = [makeOrder(state, null)]

    expect(() =>
      render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />),
    ).not.toThrow()

    const { container } = render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    expect(container.textContent).toContain('No front')
  })

  it('kontraktstabellen visar frontens namn, eller "—" när den är null', () => {
    const state = createInitialState('indochina-slice', 'contract-front-seed')
    state.market.contracts = [
      {
        id: 'contract-with-front',
        buyerId: 'rvn',
        productId: 'm1_rifle',
        quantity: 100,
        unitsDelivered: 0,
        price: 100000,
        unitCostAtSigning: 500,
        grade: 'A',
        dueTurn: 10,
        status: 'active',
        lateEventId: null,
        frontId: 'front-1', advancePct: 0, advancePaid: 0,
      },
      {
        id: 'contract-without-front',
        buyerId: 'nlf',
        productId: 'm1_rifle',
        quantity: 50,
        unitsDelivered: 0,
        price: 50000,
        unitCostAtSigning: 500,
        grade: 'A',
        dueTurn: 10,
        status: 'active',
        lateEventId: null,
        frontId: null, advancePct: 0, advancePaid: 0,
      },
    ]

    const { container } = render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)

    expect(container.textContent).toContain('Indochina front')
    expect(container.textContent).not.toContain('front-1')
    expect(container.textContent).toContain('—')
  })
})

describe('TheFloor — P204: filtret kartan öppnar mappen med', () => {
  it('visar bara köparens ordrar, säger det, och SHOW ALL tar bort filtret', () => {
    const state = createInitialState('indochina-slice', 'floor-filter-seed')
    const rvn = { ...makeOrder(state, 'front-1'), id: 'order-rvn', buyerId: 'rvn' as const }
    const laos = { ...makeOrder(state, 'front-laos'), id: 'order-laos', buyerId: 'laos' as const }
    state.market.openOrders = [rvn, laos]
    let cleared = false
    const { container, getByTestId } = render(
      <TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} ordersFilter={{ kind: 'buyer', factionId: 'laos' }} onClearOrdersFilter={() => { cleared = true }} />,
    )
    expect(container.querySelectorAll('[data-testid="order-folder"]')).toHaveLength(1)
    expect(getByTestId('orders-filter').textContent).toContain('Orders from Kingdom of Laos · 1 of 2')
    getByTestId('orders-filter-clear').click()
    expect(cleared).toBe(true)
  })
})
