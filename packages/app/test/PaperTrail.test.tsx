// PaperTrail.test.tsx — P128 (ETAPP9 §8.3, §8.4, §9). Utredningskortet med tre dåliga vägar (prickar, inga tal), rent rykte, avstängning och
// juridisk rådgivning som stående order.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { GameState, PaperTrace, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { PaperTrail } from '../src/components/PaperTrail.js'
import { deriveThisQuarter } from '../src/thisQuarter.js'

afterEach(cleanup)
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

const trace = (over: Partial<PaperTrace> = {}): PaperTrace => ({
  id: 'trace-1', houseId: 'player', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'bribeBoard', severity: 2, turn: 2,
  status: 'surfaced', surfacedTurn: 5, deadlineTurn: 8, ...over,
})

function setup(traces: PaperTrace[], tweak: (s: GameState) => void = () => {}, draft: TurnSubmission = EMPTY) {
  const state = createInitialState('indochina-slice', 'trail-seed')
  state.meta.turn = 5
  state.house.treasury = 20_000_000
  state.traces = traces
  tweak(state)
  const onSet = vi.fn<(c: StandingOrderChange) => void>()
  render(<PaperTrail state={state} draft={draft} onSet={onSet} />)
  return { state, onSet }
}

describe('pappersspåret och utredningskortet (P128)', () => {
  it('utan framkomna spår: bara det rena ryktet, antal öppna filer och juridisk rådgivning', () => {
    setup([trace({ status: 'open', surfacedTurn: undefined, deadlineTurn: undefined }), trace({ id: 'trace-2', status: 'open' })])
    expect(screen.queryByTestId('inquiry-trace-1')).toBeNull()
    expect(screen.getByTestId('paper-trail').textContent).toContain('Probity')
    expect(screen.getByText('2 files on record')).toBeTruthy()
  })

  it('ett framkommet spår blir ett utredningskort med tre vägar och prickar utan tal', () => {
    setup([trace()])
    const card = screen.getByTestId('inquiry-trace-1')
    expect(card.textContent).toContain('payments to the test board')
    expect(screen.getByTestId('inquiry-dots-DENY-trace-1').textContent).toContain('REPUTATION')
    expect(screen.getByTestId('inquiry-dots-SETTLE-trace-1').textContent).toContain('CASH')
    for (const choice of ['DENY', 'SACRIFICE', 'SETTLE']) expect(screen.getByTestId(`inquiry-dots-${choice}-trace-1`).textContent).not.toMatch(/£|\d/)
  })

  it('FÖRNEKA och FÖRLIKAS köar en TRACE RESPOND; OFFRA tar den valda rollen', () => {
    const { onSet } = setup([trace()])
    fireEvent.click(screen.getByTestId('inquiry-DENY-trace-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'TRACE', op: 'RESPOND', traceId: 'trace-1', choice: 'DENY' })
    fireEvent.click(screen.getByTestId('inquiry-SETTLE-trace-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'TRACE', op: 'RESPOND', traceId: 'trace-1', choice: 'SETTLE' })
    fireEvent.click(screen.getByText('ENGINEER'))
    fireEvent.click(screen.getByTestId('inquiry-SACRIFICE-trace-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'TRACE', op: 'RESPOND', traceId: 'trace-1', choice: 'SACRIFICE', role: 'chiefEngineer' })
  })

  it('FÖRLIKAS är spärrat med orsaken när kassan inte räcker', () => {
    setup([trace()], (s) => (s.house.treasury = 10))
    expect((screen.getByTestId('inquiry-SETTLE-trace-1') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('inquiry-trace-1').textContent).toContain('not enough cash to settle')
  })

  it('ett redan besvarat kort visas inte; ett förnekat ger en rad om att det kan avslöjas', () => {
    setup([trace({ choice: 'DENY', choiceTurn: 5 })])
    expect(screen.queryByTestId('inquiry-trace-1')).toBeNull()
    expect(screen.getByTestId('paper-trail-denied').textContent).toContain('1 denied matter')
  })

  it('en avstängning visas med köparen och sista turen', () => {
    setup([], (s) => (s.house.suspendedFrom = { rvn: 9 }))
    expect(screen.getByTestId('suspension-rvn').textContent).toContain('until quarter 9')
  })

  it('juridisk rådgivning: SET köas när den inte finns, CANCEL när den finns', () => {
    const { onSet } = setup([])
    fireEvent.click(screen.getByTestId('legal-toggle'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'LEGAL', op: 'SET' })
    cleanup()
    const second = setup([], (s) => (s.house.standingOrders.legal = { sinceTurn: 2 }))
    fireEvent.click(screen.getByTestId('legal-toggle'))
    expect(second.onSet).toHaveBeenCalledWith({ kind: 'LEGAL', op: 'CANCEL' })
  })

  it('This Quarter får en rad för ett obesvarat kort — och ingen för ett besvarat', () => {
    const state = createInitialState('indochina-slice', 'trail-seed')
    state.traces = [trace()]
    expect(deriveThisQuarter(state).some((i) => i.kind === 'inquiry')).toBe(true)
    state.traces = [trace({ choice: 'DENY' })]
    expect(deriveThisQuarter(state).some((i) => i.kind === 'inquiry')).toBe(false)
  })
})
