// buildLoanUi.test.tsx — P185 (ETAPP11_FORSLAG.md §9b, 11Q): byggmenyn har valet kontant eller byggnadslån med villkoren, anläggningskortet visar lånet, och Books listar lånen och kvartalets betalning.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildLoanTerms, cashPartOf, createInitialState, projectedQuarter, resolveTurn } from '@seventh-front/core'
import type { GameState, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { WorksPlan } from '../src/components/WorksPlan.js'
import { TheHouse } from '../src/components/TheHouse.js'

afterEach(cleanup)
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function renderPlan(state: GameState, draft: TurnSubmission = EMPTY) {
  const onSet = vi.fn<(c: StandingOrderChange) => void>()
  render(<WorksPlan state={state} draft={draft} onSet={onSet} onRemove={() => {}} />)
  return onSet
}

function stateWithLoan(): GameState {
  let s = createInitialState('indochina-slice', 'build-loan-ui')
  s.house.treasury = 60_000_000
  s = resolveTurn(s, { standingOrders: [{ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour', financing: 'loan' }], bids: [], actions: [] }).state
  for (let i = 0; i < 2; i++) s = resolveTurn(s, EMPTY).state
  return s
}

describe('byggmenyn (P185, 11Q)', () => {
  it('valet kontant/byggnadslån: lån visar villkoren och köar en BUILD med financing loan', () => {
    const state = createInitialState('indochina-slice', 'build-loan-menu')
    const onSet = renderPlan(state)
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-assembly'))
    expect(screen.queryByTestId('build-loan-hint')).toBeNull()
    fireEvent.click(screen.getByText('BUILDING LOAN'))
    const hint = screen.getByTestId('build-loan-hint').textContent ?? ''
    const terms = buildLoanTerms()
    expect(hint).toContain(`${terms.sharePct}%`)
    expect(hint).toContain(`${terms.amortTurns} equal quarters`)
    expect(hint).toContain('security')
    fireEvent.click(screen.getByTestId('build-file'))
    expect(onSet).toHaveBeenCalledTimes(1)
    const change = onSet.mock.calls[0]![0] as Extract<StandingOrderChange, { kind: 'WORKS' }>
    expect(change).toMatchObject({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', financing: 'loan' })
  })

  it('kontant är standard: ingen financing i ordern', () => {
    const state = createInitialState('indochina-slice', 'build-loan-cash')
    const onSet = renderPlan(state)
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-assembly'))
    fireEvent.click(screen.getByTestId('build-file'))
    expect((onSet.mock.calls[0]![0] as { financing?: string }).financing).toBeUndefined()
  })

  it('med lån räcker en lägre kassa för byggknappen än kontant', () => {
    const state = createInitialState('indochina-slice', 'build-loan-cash-low')
    state.house.treasury = 150_000 // under första raten (200 000) men över kontantdelen med lån
    expect(cashPartOf(200_000, 'loan')).toBeLessThan(150_000)
    renderPlan(state)
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-assembly'))
    expect((screen.getByTestId('build-file') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('BUILDING LOAN'))
    expect((screen.getByTestId('build-file') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('anläggningskortet och Books (P185)', () => {
  it('kortet visar lånet: utestående, räntan och att verket är säkerhet', () => {
    const state = stateWithLoan()
    const works = state.house.works.find((w) => w.loan)!
    renderPlan(state)
    fireEvent.click(screen.getByTestId(`works-slot-${works.id}`))
    const card = screen.getByTestId('facility-loan')
    expect(card.textContent).toContain('Building loan')
    expect(screen.getByTestId('facility-loan-outstanding').textContent).toContain('security')
    expect(screen.getByTestId('facility-loan-payment').textContent).toContain('Interest')
  })

  it('Books listar lånet med utestående och kvartalets betalning, och Next quarter räknar med den', () => {
    const state = stateWithLoan()
    render(<TheHouse state={state} draft={EMPTY} onAddAction={() => {}} onRemoveAction={() => {}} initialDrawer="books" />)
    const panel = screen.getByTestId('build-loans')
    expect(panel.textContent).toContain('owed')
    const q = projectedQuarter(state)
    expect(q.buildLoans.total).toBeGreaterThan(0)
    expect(screen.getByTestId('next-quarter-build-loans').textContent).toContain(q.buildLoans.total.toLocaleString('en-GB'))
  })

  it('utan lån finns ingen lånepanel', () => {
    const state = createInitialState('indochina-slice', 'no-loan-books')
    render(<TheHouse state={state} draft={EMPTY} onAddAction={() => {}} onRemoveAction={() => {}} initialDrawer="books" />)
    expect(screen.queryByTestId('build-loans')).toBeNull()
  })
})
