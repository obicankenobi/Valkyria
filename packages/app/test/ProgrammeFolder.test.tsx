// ProgrammeFolder.test.tsx — P128 (ETAPP9 §8.1, §8.2, §9). Upphandlingsmappen: kravblad, tidslinje, konkurrenter med underrättelsens prickar,
// anmälan/prototyp som stående order, knepen som registerkort med prickar (inga tal) och utvärderingsprotokollet med ett överstruket ska-krav.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { Design, GameState, PlayerAction, Programme, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { ProgrammeFolders, turnDateLabel } from '../src/components/ProgrammeFolder.js'

afterEach(cleanup)
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

const design = (): Design =>
  ({
    id: 'design-1', name: 'H&V M64 Field Gun', category: 'artillery', baseProductId: '105mm_field_gun', generation: 1, focus: 'balanced', ambition: 'timely',
    performance: 70, reliability: 70, unitCostFactor: 1, trueQuality: 66, uncertainty: 1, latentFlaw: null, flawRevealed: false, testedIn: [],
    fieldRecord: { occasions: 0, proven: false }, lineage: null, introducedTurn: 1, status: 'active',
  }) as Design

const programme = (over: Partial<Programme> = {}): Programme => ({
  id: 'programme-1', buyerId: 'rvn', category: 'artillery', baseProductId: '105mm_field_gun', trigger: 'requirementCard',
  requirements: [
    { kind: 'performance', threshold: 60, mandatory: true, weight: 0.4 },
    { kind: 'reliability', threshold: 55, mandatory: false, weight: 0.3 },
    { kind: 'unitCost', threshold: 1.2, mandatory: false, weight: 0.3 },
  ],
  testEnvironment: 'jungle', grant: { kind: 'costPlus', amount: 400000 }, prize: { quantity: 20, deliveryTurns: 4, unitPrice: 300000, advancePct: 10 },
  phase: 'announced', phaseSinceTurn: 3, announcedTurn: 3, entrants: [{ houseId: 'brandt', enteredTurn: 3 }], traces: [], ...over,
})

function setup(programmes: Programme[], tweak: (s: GameState) => void = () => {}) {
  const state = createInitialState('indochina-slice', 'prog-seed')
  state.meta.turn = 4
  state.house.treasury = 20_000_000
  state.house.designs = [design()]
  state.programmes = programmes
  tweak(state)
  const onSet = vi.fn<(c: StandingOrderChange) => void>()
  const onAdd = vi.fn<(a: PlayerAction) => void>()
  render(<ProgrammeFolders state={state} draft={EMPTY} onSet={onSet} onAddAction={onAdd} />)
  return { state, onSet, onAdd }
}

describe('upphandlingsmappen (P128)', () => {
  it('utan upphandlingar visas en tom-text', () => {
    setup([])
    expect(screen.getByTestId('programmes-empty')).toBeTruthy()
  })

  it('kravbladet visar raderna med MUST/SHOULD, datum och fasen; tidslinjen markerar fasen', () => {
    const { state } = setup([programme()])
    const sheet = screen.getByTestId('programme-sheet-programme-1')
    expect(sheet.textContent).toContain('PERFORMANCE')
    expect(sheet.textContent).toContain('MUST')
    expect(sheet.textContent).toContain('SHOULD')
    expect(sheet.textContent).toContain(`ISSUED ${turnDateLabel(state, 3)}`)
    expect(screen.getByTestId('programme-phase-programme-1').textContent).toBe('CALL FOR TENDERS')
  })

  it('turnDateLabel räknar bakåt från innevarande tur', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = 4
    state.meta.year = 1965
    state.meta.quarter = 1
    expect(turnDateLabel(state, 4)).toBe('Q1 1965')
    expect(turnDateLabel(state, 3)).toBe('Q4 1964')
    expect(turnDateLabel(state, 0)).toBe('Q1 1964')
  })

  it('konkurrenterna: framsteg syns bara med underrättelse (annars "progress unknown")', () => {
    setup([programme()], (s) => (s.house.stations = []))
    expect(screen.getByTestId('programme-entrants-programme-1').textContent).toContain('progress unknown')
  })

  it('ENTER köar en PROGRAMME ENTER (ingen handling); efter anmälan kan en prototyp lämnas in', () => {
    const { onSet } = setup([programme()])
    fireEvent.click(screen.getByTestId('programme-enter-programme-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'PROGRAMME', op: 'ENTER', programmeId: 'programme-1' })
    cleanup()

    const entered = setup([programme({ phase: 'development', entrants: [{ houseId: 'brandt', enteredTurn: 3 }, { houseId: 'player', enteredTurn: 3 }] })])
    fireEvent.click(screen.getByTestId('programme-submit-programme-1'))
    expect(entered.onSet).toHaveBeenCalledWith({ kind: 'PROGRAMME', op: 'SUBMIT', programmeId: 'programme-1', designId: 'design-1' })
  })

  it('knepen är registerkort med prickar utan tal; ett kort är spärrat med orsaken, annars köas en PROCUREMENT-handling', () => {
    const { onAdd } = setup([programme({ phase: 'development', entrants: [{ houseId: 'brandt', enteredTurn: 3 }, { houseId: 'player', enteredTurn: 3 }] })])
    fireEvent.click(screen.getByTestId('programme-tricks-toggle-programme-1'))
    const dots = screen.getByTestId('trick-dots-FALSIFY-programme-1').textContent!
    expect(dots).toContain('CASH')
    expect(dots).not.toMatch(/£|\d/)
    fireEvent.click(screen.getByTestId('trick-go-FALSIFY-programme-1'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'PROCUREMENT', op: 'FALSIFY', programmeId: 'programme-1' })
    // WRITE_SPEC kräver fasen anbudsinfordran.
    expect((screen.getByTestId('trick-go-WRITE_SPEC-programme-1') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('trick-WRITE_SPEC-programme-1').textContent).toContain('requirements are locked')
  })

  it('SABOTAGE och LEAK mot en deltagande rival köar en INTEL-handling med upphandlingen som mål (P136) — och är spärrade utan station i landet', () => {
    const entrants = [{ houseId: 'brandt', enteredTurn: 3 }, { houseId: 'player', enteredTurn: 3 }]
    const { onAdd, state } = setup([programme({ phase: 'development', entrants })], (s) => {
      s.house.stations = [{ id: 'station-rvn', city: 'Saigon', nation: 'rvn', depth: 3, exposure: 10, coverage: ['procurement'], status: 'active' }]
    })
    fireEvent.click(screen.getByTestId('intel-go-SABOTAGE-programme-1'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'INTEL', op: 'SABOTAGE', stationId: 'station-rvn', targetId: 'programme:programme-1:brandt' })
    fireEvent.click(screen.getByTestId('intel-go-LEAK-programme-1'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'INTEL', op: 'LEAK', stationId: 'station-rvn', targetId: 'programme:programme-1:brandt' })
    expect(state.house.stations).toHaveLength(1)
    cleanup()
    setup([programme({ phase: 'development', entrants })], (s) => {
      s.house.stations = []
    })
    expect((screen.getByTestId('intel-go-SABOTAGE-programme-1') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('intel-SABOTAGE-programme-1').textContent).toContain('needs an active station')
  })

  it('utvärderingsprotokollet visar en rad per krav och stryker ett underkänt ska-krav; en diskvalificering syns', () => {
    const rows = (pass: boolean) => [
      { kind: 'performance' as const, measured: pass ? 70 : 50, threshold: 60, mandatory: true, pass },
      { kind: 'reliability' as const, measured: 60, threshold: 55, mandatory: false, pass: true },
    ]
    setup([
      programme({
        phase: 'awarded',
        entrants: [{ houseId: 'brandt', enteredTurn: 3 }, { houseId: 'player', enteredTurn: 3, designId: 'design-1' }],
        result: {
          winner: 'player', turn: 4,
          scores: [
            { houseId: 'player', score: 80, disqualified: null, rows: rows(true) },
            { houseId: 'brandt', score: 0, disqualified: 'FAILED A MANDATORY REQUIREMENT', rows: rows(false) },
          ],
        },
      }),
    ])
    const protocol = screen.getByTestId('protocol-programme-1')
    expect(within(protocol).getByTestId('protocol-entry-player').textContent).toContain('AWARDED')
    const brandt = within(protocol).getByTestId('protocol-entry-brandt')
    expect(brandt.textContent).toContain('DISQUALIFIED')
    expect(brandt.querySelector('tr.is-struck')).not.toBeNull()
    expect(within(protocol).getByTestId('protocol-entry-player').querySelector('tr.is-struck')).toBeNull()
  })

  it('protokollet visas inte för ett hus som inte deltog (skyddsräcke 5)', () => {
    setup([programme({ phase: 'awarded', result: { winner: 'brandt', turn: 4, scores: [{ houseId: 'brandt', score: 70, disqualified: null, rows: [] }] } })])
    expect(screen.queryByTestId('protocol-programme-1')).toBeNull()
  })
})
