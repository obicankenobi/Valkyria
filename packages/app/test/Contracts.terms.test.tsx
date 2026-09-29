// Contracts.terms.test.tsx — P99 (ETAPP8_FORSLAG.md §4.2, skyddsräcke 4): betalningsvillkoren i
// budmappen. Förskottet är ett villkor i affären och syns alltid ("ADVANCE 30 %"); köparens
// kreditstämpel (A/B/C) och faktorerna bakom grindas genom underrättelse — utan station "?".
// Vid prisreglaget sitter tre tal: vinstchans, marginal och pengar i kassan nästa kvartal.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { advanceAmount, createInitialState, officialId, orderTerms, playerWinCurve } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'
import { TheFloor } from '../src/components/TheFloor.js'

afterEach(cleanup)

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function order(state: GameState, patch: Partial<Order> = {}): Order {
  return {
    id: 'order-terms-0',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 250,
    statedBudget: 5_000_000,
    trueBudget: 8_000_000,
    referencePrice: 4_000_000,
    requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: officialId('rvn', 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 30,
    ...patch,
  }
}

function withIntel(state: GameState): void {
  const station = state.house.stations.find((s) => s.nation === 'rvn')!
  station.depth = 3
  station.status = 'active'
}
function withoutIntel(state: GameState): void {
  state.house.stations = state.house.stations.filter((s) => s.nation !== 'rvn')
  state.house.staff.chiefSalesman = 50
}

function renderFloor(state: GameState) {
  return render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
}

describe('ordermappen — förskottsstämpel och kreditstämpel (P99)', () => {
  it('förskottet stämplas på mappen ("ADVANCE 30 %"), i samma register som fristen', () => {
    const state = createInitialState('indochina-slice', 'terms-ui-1')
    state.market.openOrders = [order(state, { advancePct: 30 })]
    renderFloor(state)
    const stamp = screen.getByTestId('order-advance-stamp')
    expect(stamp.textContent).toMatch(/advance 30 %/i)
    expect(stamp.className).toContain('order-stamp')
    expect(screen.getByTestId('order-deadline-stamp').className).toContain('order-stamp')
  })

  it('utan förskott står det ärligt "No advance"', () => {
    const state = createInitialState('indochina-slice', 'terms-ui-2')
    state.market.openOrders = [order(state, { advancePct: 0 })]
    renderFloor(state)
    expect(screen.getByTestId('order-advance-stamp').textContent).toMatch(/no advance/i)
  })

  it('MED underrättelse visar mappens flik köparens kreditstämpel — samma bokstav som orderTerms ger', () => {
    const state = createInitialState('indochina-slice', 'terms-ui-3')
    withIntel(state)
    state.factions['rvn']!.militaryBudget = 1e12
    state.factions['rvn']!.treasury = 1e12
    const o = order(state)
    state.market.openOrders = [o]
    renderFloor(state)
    const stamp = screen.getByTestId('credit-stamp')
    expect(orderTerms(state, o).credit).toBe('A')
    expect(stamp.textContent).toBe('A')
    expect(stamp.getAttribute('aria-label')).toBe('Buyer credit rating A')
  })

  it('en pank köpare får C', () => {
    const state = createInitialState('indochina-slice', 'terms-ui-4')
    withIntel(state)
    state.factions['rvn']!.militaryBudget = 50_000
    state.factions['rvn']!.treasury = 50_000
    state.market.openOrders = [order(state)]
    renderFloor(state)
    expect(screen.getByTestId('credit-stamp').textContent).toBe('C')
  })

  it('UTAN underrättelse är stämpeln "?" och etiketten säger varför — ingen bokstav läcker', () => {
    const state = createInitialState('indochina-slice', 'terms-ui-5')
    withoutIntel(state)
    state.factions['rvn']!.militaryBudget = 1e12 // hade varit A
    state.factions['rvn']!.treasury = 1e12
    state.market.openOrders = [order(state)]
    renderFloor(state)
    const stamp = screen.getByTestId('credit-stamp')
    expect(stamp.textContent).toBe('?')
    expect(stamp.getAttribute('aria-label')).toContain('unknown')
    expect(stamp.className).toContain('is-unknown')
    expect(screen.queryByText('A', { selector: '[data-testid="credit-stamp"]' })).toBeNull()
  })
})

describe('BidForm — tre tal vid prisreglaget (P99)', () => {
  function renderForm(state: GameState, o: Order) {
    return render(<BidForm state={state} order={o} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
  }

  it('vinstchans, marginal och pengar nästa kvartal sitter i samma remsa, direkt under reglaget', () => {
    const state = createInitialState('indochina-slice', 'terms-form-1')
    renderForm(state, order(state))
    const strip = screen.getByTestId('bid-readouts')
    expect(within(strip).getByTestId('your-win-chance')).toBeTruthy()
    expect(within(strip).getByTestId('readout-margin')).toBeTruthy()
    expect(within(strip).getByTestId('readout-cash')).toBeTruthy()
    // Remsan kommer efter prisreglaget i dokumentordning (den sitter "vid" det).
    const slider = screen.getByLabelText('Price')
    expect(slider.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('pengar nästa kvartal = advanceAmount(pris, orderns advancePct) — exakt den formel bidding.ts betalar med — och följer reglaget', () => {
    const state = createInitialState('indochina-slice', 'terms-form-2')
    const o = order(state, { advancePct: 30 })
    const curve = playerWinCurve(state, o, 'A')
    renderForm(state, o)
    const cash = () => screen.getByTestId('readout-cash').textContent ?? ''

    fireEvent.keyDown(screen.getByLabelText('Price'), { key: 'Home' })
    expect(cash()).toContain(advanceAmount(curve[0]!.price, 30).toLocaleString('en-GB'))
    fireEvent.keyDown(screen.getByLabelText('Price'), { key: 'End' })
    const high = advanceAmount(curve[curve.length - 1]!.price, 30)
    expect(cash()).toContain(high.toLocaleString('en-GB'))
    expect(cash()).toContain('30% advance, if won')
    expect(high).toBeGreaterThan(advanceAmount(curve[0]!.price, 30))
  })

  it('en order utan förskott visar +£0', () => {
    const state = createInitialState('indochina-slice', 'terms-form-3')
    renderForm(state, order(state, { advancePct: 0 }))
    expect(screen.getByTestId('readout-cash').textContent).toContain('+£0')
  })

  it('marginalen i remsan är den enda marginalprocenten (ingen dubblett längre ned i formuläret)', () => {
    const state = createInitialState('indochina-slice', 'terms-form-4')
    renderForm(state, order(state))
    const pct = (screen.getByTestId('readout-margin').textContent ?? '').match(/-?\d+\.\d%/)![0]
    expect(screen.getAllByText(pct)).toHaveLength(1)
  })

  it('MED underrättelse: faktorerna bakom förskottet (låg/mellan/hög) visas som "buyer now"', () => {
    const state = createInitialState('indochina-slice', 'terms-form-5')
    withIntel(state)
    renderForm(state, order(state))
    const hint = screen.getByTestId('advance-drivers').textContent ?? ''
    expect(hint).toMatch(/^Buyer now: need (LOW|MID|HIGH) · funds (LOW|MID|HIGH) · relationship (LOW|MID|HIGH)$/)
  })

  it('UTAN underrättelse: inga faktorer — bara att de är okända', () => {
    const state = createInitialState('indochina-slice', 'terms-form-6')
    withoutIntel(state)
    renderForm(state, order(state))
    const hint = screen.getByTestId('advance-drivers').textContent ?? ''
    expect(hint).toContain('unknown')
    expect(hint).not.toMatch(/LOW|MID|HIGH/)
  })

  it('de dolda fälten (trueBudget) syns fortfarande aldrig', () => {
    const state = createInitialState('indochina-slice', 'terms-form-7')
    renderForm(state, order(state, { trueBudget: 8_123_456 }))
    expect(document.body.textContent).not.toContain('8,123,456')
  })
})
