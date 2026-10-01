// TypeSheet.test.tsx — P126 (ETAPP9_FORSLAG.md §5.1/§9). Typbladet: instrument, klass med osäkerhet ("B ±1"), stämplar, och
// konstruktionens order (provning, fältprov, utredningskortets tre svar). Den dolda kvaliteten och bristen visas aldrig före avslöjandet.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { Design, GameState, Investigation, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { TypeSheets } from '../src/components/TypeSheet.js'

afterEach(cleanup)

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeDesign(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 62,
    reliability: 71,
    unitCostFactor: 1.1,
    trueQuality: 66,
    uncertainty: 1,
    latentFlaw: { environment: 'monsoon', severity: 2 },
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 3,
    status: 'active',
    ...over,
  } as Design
}

function setup(designs: Design[], tweak: (state: GameState) => void = () => {}, draft: TurnSubmission = EMPTY) {
  const state = createInitialState('indochina-slice', 'type-seed')
  state.house.treasury = 20_000_000
  state.house.designs = designs
  tweak(state)
  const onSet = vi.fn<(change: StandingOrderChange) => void>()
  const onAdd = vi.fn<(action: PlayerAction) => void>()
  render(<TypeSheets state={state} draft={draft} onAddAction={onAdd} onSet={onSet} />)
  return { state, onSet, onAdd }
}

const inquiry = (status: Investigation['status'] = 'open'): Investigation => ({
  id: 'inv-1',
  designId: 'design-1',
  environment: 'monsoon',
  severity: 2,
  frontId: 'front-1',
  buyerId: 'rvn',
  openedTurn: 4,
  deadlineTurn: 7,
  status,
  causeEventId: null,
})

describe('typbladet (P126, §9)', () => {
  it('utan konstruktioner visas en tom-text, med dem ett blad per konstruktion', () => {
    setup([])
    expect(screen.getByText(/No designs yet/)).toBeTruthy()
    cleanup()
    setup([makeDesign(), makeDesign({ id: 'design-2', name: 'H&V M65 Field Gun' })])
    expect(screen.getByTestId('type-sheet-design-1')).toBeTruthy()
    expect(screen.getByTestId('type-sheet-design-2')).toBeTruthy()
  })

  it('visar instrumenten, klassen med osäkerhet och stämpeln UNTESTED — aldrig den verkliga kvaliteten eller den dolda bristen', () => {
    setup([makeDesign()])
    expect(screen.getByTestId('type-perf-design-1').textContent).toContain('62')
    expect(screen.getByTestId('type-rel-design-1').textContent).toContain('71')
    expect(screen.getByTestId('type-class-design-1').textContent).toMatch(/^[ABCD] ±1$/)
    expect(screen.getByTestId('type-stamp-design-1').textContent).toBe('UNTESTED')
    expect(screen.getByTestId('type-flaw-design-1').textContent).toBe('none known')
    expect(screen.getByTestId('type-sheet-design-1').textContent).not.toContain('MONSOON')
  })

  it('en avslöjad miljöbrist visas på bladet', () => {
    setup([makeDesign({ flawRevealed: true })])
    expect(screen.getByTestId('type-flaw-design-1').textContent).toContain('MONSOON')
  })

  it('stämplar: PROVEN IN THE FIELD, UNDER REVIEW (utredning) och RECALLED (tillbakadragen)', () => {
    setup([makeDesign({ fieldRecord: { occasions: 3, proven: true } })])
    expect(screen.getByTestId('type-stamp-design-1').textContent).toBe('PROVEN IN THE FIELD')
    cleanup()
    setup([makeDesign()], (s) => (s.house.investigations = [inquiry()]))
    expect(screen.getByTestId('type-stamp-design-1').textContent).toBe('UNDER REVIEW')
    cleanup()
    setup([makeDesign({ status: 'withdrawn' })])
    expect(screen.getByTestId('type-stamp-design-1').textContent).toBe('RECALLED')
  })

  it('provning: välj miljö → START TESTING köar en TESTING SET; en pågående provning kan stoppas', () => {
    const { onSet } = setup([makeDesign()])
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    fireEvent.click(within(screen.getByTestId('type-env-design-1')).getByText('MONSOON'))
    fireEvent.click(screen.getByTestId('type-test-set-design-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'TESTING', op: 'SET', designId: 'design-1', environment: 'monsoon' })
    cleanup()

    const second = setup([makeDesign()], (s) => {
      s.house.standingOrders.testing = { 'design-1': { environment: 'jungle', sinceTurn: 2, turnsRun: 1 } }
    })
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    fireEvent.click(screen.getByTestId('type-test-stop-design-1'))
    expect(second.onSet).toHaveBeenCalledWith({ kind: 'TESTING', op: 'CANCEL', designId: 'design-1' })
  })

  it('fältprov: spärrat med orsaken när relationen är för låg, annars köas FIELD_TRIAL som en handling', () => {
    setup([makeDesign()], (s) => {
      for (const o of Object.values(s.officials)) o.relationToPlayer = 0
    })
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    expect((screen.getByTestId('type-trial-design-1') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('type-orders-design-1').textContent).toContain('relation too low')
    cleanup()

    const { onAdd } = setup([makeDesign()], (s) => {
      for (const o of Object.values(s.officials)) o.relationToPlayer = 90
    })
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    fireEvent.click(screen.getByTestId('type-trial-design-1'))
    expect(screen.getByTestId('type-trial-dots-design-1').textContent).toContain('CASH')
    expect(screen.getByTestId('type-trial-dots-design-1').textContent).toContain('RELATIONS')
    expect(screen.getByTestId('type-trial-dots-design-1').textContent).toContain('RIVALS')
    expect(screen.getByTestId('type-trial-dots-design-1').textContent).not.toMatch(/£|\d/)
    const first = onAdd.mock.calls[0]![0] as Extract<PlayerAction, { type: 'POLITICAL' }>
    expect(first.op).toBe('FIELD_TRIAL')
    expect((first as { designId: string }).designId).toBe('design-1')
    expect((first as { officialId: string }).officialId).toBe(officialId('rvn', 'procurement'))
  })

  it('utredningskortet: tre svar, FIX köar en INVESTIGATION-ändring; DENY är spärrat för en redan förnekad utredning', () => {
    const { onSet } = setup([makeDesign()], (s) => (s.house.investigations = [inquiry('open')]))
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    expect(screen.getByTestId('type-inquiry-inv-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('type-inquiry-inv-1-FIX'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'INVESTIGATION', investigationId: 'inv-1', choice: 'FIX' })
    // Beslutskortets prickar: vilka mätare ett svar rör, utan tal.
    expect(screen.getByTestId('type-inquiry-inv-1-FIX-dots').textContent).toContain('CASH')
    expect(screen.getByTestId('type-inquiry-inv-1-DENY-dots').textContent).toContain('REPUTATION')
    expect(screen.getByTestId('type-inquiry-inv-1-REDESIGN-dots').textContent).toContain('TIME')
    expect(screen.getByTestId('type-inquiry-inv-1-FIX-dots').textContent).not.toMatch(/£|\d/)
    cleanup()

    setup([makeDesign()], (s) => (s.house.investigations = [inquiry('denied')]))
    fireEvent.click(screen.getByTestId('type-orders-toggle-design-1'))
    expect((screen.getByTestId('type-inquiry-inv-1-DENY') as HTMLButtonElement).disabled).toBe(true)
  })
})
