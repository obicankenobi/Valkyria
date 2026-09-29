// LedgerChart.test.tsx — P97 (ETAPP8_FORSLAG.md §3.2): huvudboken i THE COMPANY. Diagrammet
// ritar EXAKT vad huvudboken (P96) innehåller, ett tryck öppnar kvartalets verifikationer, och
// verifikationens siffror är huvudbokens egna — inget omräknat i appen.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { LedgerChart } from '../src/components/LedgerChart.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Ett riktigt spelat parti: en enkel policy som bara tar ett lån på tur 0 (creditLimit räknas
// om av economy.ts varje tur och är 0 utan intäkter, så bara startlimiten räcker), så financing-raden finns.
function playedState(turns: number): GameState {
  let state = createInitialState('indochina-slice', 'ledger-chart-ui')
  state.house.creditLimit = 1_000_000 // så att lånet på tur 0 inte avvisas
  for (let t = 0; t < turns; t++) {
    const actions =
      t === 0 ? ([{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 300000 } }] as const) : ([] as const)
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [...actions] }).state
  }
  return state
}

describe('LedgerChart (P97)', () => {
  it('ett parti utan avslutat kvartal visar en ärlig tom text, inget diagram', () => {
    render(<LedgerChart state={createInitialState('indochina-slice', 'ledger-empty-ui')} />)
    expect(screen.getByTestId('ledger-empty')).toBeTruthy()
    expect(screen.queryByTestId('ledger-chart')).toBeNull()
  })

  it('ritar en stapplats per huvudboksrad, och en BOOK NOW-markör', () => {
    const state = playedState(4)
    render(<LedgerChart state={state} />)
    for (const entry of state.ledger) expect(screen.getByTestId(`ledger-bar-${entry.turn}`)).toBeTruthy()
    expect(screen.getAllByTestId(/^ledger-bar-/)).toHaveLength(state.ledger.length)
    expect(screen.getByTestId('ledger-book-now')).toBeTruthy()
  })

  it('sammanfattningen visar bokens värde och styrelsens krav vid nästa granskning', () => {
    const state = playedState(3)
    render(<LedgerChart state={state} />)
    const summary = screen.getByTestId('ledger-summary').textContent ?? ''
    expect(summary).toContain('Book now')
    expect(summary).toContain('by T6')
  })

  it('tangentbordsaktivering (ingen pekarposition) öppnar senaste kvartalets verifikationer', () => {
    const state = playedState(4)
    render(<LedgerChart state={state} />)
    fireEvent.click(screen.getByTestId('ledger-chart'), { detail: 0 })
    const sheet = screen.getByTestId('ledger-vouchers')
    expect(sheet.textContent).toContain(`Quarter T${state.ledger[state.ledger.length - 1]!.turn}`)
  })

  it('ett tryck vid vänsterkanten öppnar första kvartalet, vid högerkanten det sista', () => {
    const state = playedState(4)
    render(<LedgerChart state={state} />)
    const hit = screen.getByTestId('ledger-chart')
    vi.spyOn(hit.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 340, height: 232, right: 340, bottom: 232, x: 0, y: 0, toJSON: () => ({}) })

    fireEvent.click(hit, { detail: 1, clientX: 46 }) // plotytans vänsterkant (ML = 46 av 340)
    expect(screen.getByTestId('ledger-vouchers').textContent).toContain('Quarter T0')
    fireEvent.click(screen.getByLabelText('Close'))

    fireEvent.click(hit, { detail: 1, clientX: 339 })
    expect(screen.getByTestId('ledger-vouchers').textContent).toContain(`Quarter T${state.ledger[state.ledger.length - 1]!.turn}`)
  })

  it('verifikationen visar huvudbokens egna rader och slutsaldon, och nettot är exakt kassaförändringen', () => {
    const state = playedState(4)
    render(<LedgerChart state={state} />)
    fireEvent.click(screen.getByTestId('ledger-chart'), { detail: 0 })

    const entry = state.ledger[state.ledger.length - 1]!
    const voucher = screen.getByTestId('ledger-voucher')
    expect(within(voucher).getByTestId('ledger-voucher-row-fixedCosts').textContent).toContain(entry.expenses.fixedCosts.toLocaleString('en-GB'))
    expect(within(voucher).getByTestId('ledger-voucher-treasury').textContent).toContain(entry.treasuryEnd.toLocaleString('en-GB'))

    const previous = state.ledger[state.ledger.length - 2]!
    const delta = entry.treasuryEnd - previous.treasuryEnd
    const net = within(voucher).getByTestId('ledger-voucher-net').textContent ?? ''
    expect(net).toContain(Math.abs(delta).toLocaleString('en-GB'))
    expect(net.includes('−')).toBe(delta < 0)
  })

  it('ett lån syns på Financing-raden, inte som intäkt', () => {
    const state = playedState(4) // lånet tas på tur 0
    expect(state.ledger[0]!.financing.loans).toBe(300000)
    render(<LedgerChart state={state} />)
    fireEvent.click(screen.getByTestId('ledger-chart'), { detail: 0 })
    const decrease = within(screen.getByTestId('ledger-voucher-stepper')).getByLabelText('Decrease Quarter')
    for (let i = 0; i < 3; i++) fireEvent.click(decrease) // T3 → T0
    const voucher = screen.getByTestId('ledger-voucher')
    expect(within(voucher).getByTestId('ledger-voucher-row-loans').textContent).toContain('300,000')
    expect(within(voucher).queryByTestId('ledger-voucher-row-contracts')).toBeNull()
  })

  it('steppern bläddrar mellan kvartalen och stannar vid första och sista', () => {
    const state = playedState(3)
    render(<LedgerChart state={state} />)
    fireEvent.click(screen.getByTestId('ledger-chart'), { detail: 0 })
    const stepper = screen.getByTestId('ledger-voucher-stepper')
    const decrease = within(stepper).getByLabelText('Decrease Quarter') as HTMLButtonElement
    const increase = within(stepper).getByLabelText('Increase Quarter') as HTMLButtonElement

    expect(increase.disabled).toBe(true) // redan på sista kvartalet
    fireEvent.click(decrease)
    fireEvent.click(decrease)
    expect(screen.getByTestId('ledger-vouchers').textContent).toContain('Quarter T0')
    expect(decrease.disabled).toBe(true)
  })

  it('en migrerad huvudbok som börjar mitt i partiet kan ritas och öppnas', () => {
    const state = playedState(4)
    state.ledger = state.ledger.slice(2) // som efter en migrering: raderna före inläsningen saknas
    render(<LedgerChart state={state} />)
    fireEvent.click(screen.getByTestId('ledger-chart'), { detail: 0 })
    const stepper = screen.getByTestId('ledger-voucher-stepper')
    fireEvent.click(within(stepper).getByLabelText('Decrease Quarter'))
    expect(screen.getByTestId('ledger-vouchers').textContent).toContain('Quarter T2')
    expect((within(stepper).getByLabelText('Decrease Quarter') as HTMLButtonElement).disabled).toBe(true)
  })
})
