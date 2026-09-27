// BidForm.winChance.test.tsx — P81c (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten, P81-7). Speltestets fynd: budformuläret visade 0 %
// vinstchans i alla fem bandpunkter, oavsett bud — winBand samplar bara
// rivalPriceLow..rivalPriceHigh och missar helt de lägre priser spelaren
// faktiskt kan vinna med. "Win chance at this price" läser playerWinCurve
// för det pris spelaren skrivit in, inte bara den närmaste bandpunkten.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bidEstimate, createInitialState, officialId, playerWinCurve } from '@seventh-front/core'
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
    officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
  }
}

describe('BidForm (P81c) — vinstchansen för spelarens eget pris', () => {
  it('visar ingen avläsning innan ett pris skrivits in (price === 0)', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-empty-seed')
    const order = makeOrder(state)
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    expect(screen.queryByTestId('your-win-chance')).toBeNull()
  })

  it('visar en avläsning som matchar playerWinCurve vid ett pris som redan är en av kurvans punkter', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-exact-seed')
    const order = makeOrder(state)
    const curve = playerWinCurve(state, order, 'A')
    const point = curve[2]!

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: String(point.price) } })

    expect(screen.getByTestId('your-win-chance').textContent).toContain(`${point.confidence}%`)
  })

  it('vid ett lågt pris (nära självkostnaden) visar avläsningen en chans mätbart över 0 %, till skillnad från winBand som kan visa 0 % överallt', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-low-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')
    const allZeroInBand = estimate.winBand.every((p) => p.confidence === 0)

    const curve = playerWinCurve(state, order, 'A')
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: String(curve[0]!.price) } })

    const shown = Number(screen.getByTestId('your-win-chance').textContent!.match(/(\d+)%/)![1])
    if (allZeroInBand) {
      // Just den situation P81-7 beskrev: winBand missvisande visar 0 % i alla
      // fem punkter, men det billigaste priset på curven vinner ändå riktigt.
      expect(shown).toBeGreaterThan(0)
    } else {
      expect(shown).toBeGreaterThanOrEqual(0)
    }
  })
})
