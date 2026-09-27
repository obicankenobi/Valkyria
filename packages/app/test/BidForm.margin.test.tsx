// P21 klart-när (ETAPP1_5_TEKNISK_SPEC.md avsnitt 14): "Minst ett komponenttest
// verifierar att den visade bruttomarginalen stämmer mot price − unitCost ×
// quantity." Renderar BidForm.tsx på riktigt (jsdom, @testing-library/react) —
// inte bara den underliggande formeln isolerat — så att en framtida ändring som
// glömmer multiplicera med quantity, eller läser fel unitCost, faktiskt fångas
// här och inte bara i den rena core-koden (som redan testas i
// packages/core/test/queries.test.ts).
//
// P84 (ETAPP7_TEKNISK_SPEC.md §7.5, regel 2): priset flyttades från ett fritt
// <input type="number"> till DsSlider, bundet till playerWinCurve:s eget
// [min, max]-intervall. Testet kan därför inte längre fylla in ett godtyckligt
// pris — det styr reglaget med tangentbordet (samma interaktion en riktig
// spelare har, se DsSlider:s handleKeyDown) och räknar sina förväntade värden
// mot vilket pris reglaget FAKTISKT landar på, i stället för ett hårdkodat tal.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bidEstimate, createInitialState, officialId } from '@seventh-front/core'
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
    // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): buyerId är faktions-beroende
    // (Object.keys ovan) — officialId() (samma id-schema som state.ts) i stället
    // för att anta vilken faktion det blir.
    officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
  }
}

describe('BidForm — P21 klart-når: bruttomarginalen stämmer mot price − unitCost × quantity', () => {
  it('visar en bruttomarginal (£ och %) som räknats mot samma yourUnitCost och quantity som resten av formuläret', () => {
    const state = createInitialState('indochina-slice', 'bidform-margin-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    // Reglaget till sitt tak (End) — ett deterministiskt, känt pris (playerWinCurve:s
    // eget sista punkt), utan att behöva gissa stegstorleken.
    const slider = screen.getByLabelText('Price')
    fireEvent.keyDown(slider, { key: 'End' })
    const price = Number(slider.getAttribute('aria-valuenow'))

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

  it('visar brytpunkten (0 %, "is-loss"-stil) vid reglagets golv — priset kan aldrig sättas under självkostnaden', () => {
    // Genuint fynd (P84): playerWinCurve:s lägsta punkt ÄR yourUnitCost × quantity
    // (queries.ts:s costFloor) — samma tal bidEstimate räknar fram. Reglagets golv
    // är alltså alltid exakt brytpunkten, aldrig en förlust. En riktig förlust är
    // därför strukturellt onåbar via UI:t (samma linje som P52:s
    // supplyIndexMaxStep-fynd, dokumenterat i ANDRINGSLOGG.md) — kvar att testa är
    // att golvet visas som 0 % och fortfarande får varningsstilen.
    const state = createInitialState('indochina-slice', 'bidform-margin-floor-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    const slider = screen.getByLabelText('Price')
    fireEvent.keyDown(slider, { key: 'Home' })
    const price = Number(slider.getAttribute('aria-valuenow'))

    const expectedCost = estimate.yourUnitCost * order.quantity
    expect(price).toBe(expectedCost)

    const marginReadout = document.querySelector('.margin-readout')!
    expect(marginReadout.className).toContain('is-loss')
    screen.getByText('0.0%')
  })
})
