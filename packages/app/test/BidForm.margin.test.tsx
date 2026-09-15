// P21 klart-när (ETAPP1_5_TEKNISK_SPEC.md avsnitt 14): "Minst ett komponenttest
// verifierar att den visade bruttomarginalen stämmer mot price − unitCost ×
// quantity." Renderar BidForm.tsx på riktigt (jsdom, @testing-library/react) —
// inte bara den underliggande formeln isolerat — så att en framtida ändring som
// glömmer multiplicera med quantity, eller läser fel unitCost, faktiskt fångas
// här och inte bara i den rena core-koden (som redan testas i
// packages/core/test/queries.test.ts).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bidEstimate, createInitialState } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'

afterEach(cleanup)

function makeOrder(state: GameState): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-test-0',
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
    inspectorIntegrity: 50,
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
  }
}

describe('BidForm — P21 klart-när: bruttomarginalen stämmer mot price − unitCost × quantity', () => {
  it('visar en bruttomarginal (£ och %) som räknats mot samma yourUnitCost och quantity som resten av formuläret', () => {
    const state = createInitialState('indochina-slice', 'bidform-margin-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    const price = 3_000_000
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: String(price) } })

    const expectedCost = estimate.yourUnitCost * order.quantity
    const expectedProfit = price - expectedCost
    const expectedMarginPct = (expectedProfit / price) * 100

    // getByText kastar om texten inte finns — det räcker som assertion.
    screen.getByText(`${expectedMarginPct.toFixed(1)}%`)
    screen.getByText(
      (_, node) =>
        node?.textContent ===
        `£${Math.round(expectedProfit).toLocaleString('en-GB')} after £${Math.round(expectedCost).toLocaleString('en-GB')} in unit cost (${order.quantity} units)`,
    )
  })

  it('visar en förlust (rött, negativ marginal) när priset ligger under unitCost × quantity', () => {
    const state = createInitialState('indochina-slice', 'bidform-margin-loss-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    // Garanterat under kostnad, oavsett scenariots faktiska unitCost.
    const price = 1
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: String(price) } })

    const expectedMarginPct = ((price - estimate.yourUnitCost * order.quantity) / price) * 100
    expect(expectedMarginPct).toBeLessThan(0)
    screen.getByText(`${expectedMarginPct.toFixed(1)}%`)
  })
})
