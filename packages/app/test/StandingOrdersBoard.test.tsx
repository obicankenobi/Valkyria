// StandingOrdersBoard.test.tsx — P101 (ETAPP8_FORSLAG.md §5.2). Anslagstavlan i THE COMPANY: stående
// order som registerkort under tumstift, ett per linje, avtal och station. Ett tryck vänder kortet;
// ändringar görs med Segmented och Stepper (regel 2). Ett kort med larm får ett rött fettkritsstreck och
// en rad i This Quarter som hoppar till kortet. Linjekorten visar samma produktionslinjeband som P85.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { StandingOrdersBoard } from '../src/components/StandingOrdersBoard.js'
import { QuarterBand } from '../src/components/Shell.js'
import { standingOrderAlarms, standingOrderKey } from '../src/standingOrderBoard.js'

afterEach(cleanup)

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function setup(overrides: { state?: GameState; draft?: TurnSubmission; focusCard?: string | null } = {}) {
  const provided = overrides.state
  const state = provided ?? createInitialState('indochina-slice', 'board-seed')
  if (!provided) state.meta.turn = 5
  const onSet = vi.fn<(change: StandingOrderChange) => void>()
  const onRemove = vi.fn<(key: string) => void>()
  render(
    <StandingOrdersBoard
      state={state}
      draft={overrides.draft ?? EMPTY_DRAFT}
      onSet={onSet}
      onRemove={onRemove}
      focusCard={overrides.focusCard ?? null}
    />,
  )
  return { state, onSet, onRemove }
}

const card = (id: string) => screen.getByTestId(`standing-card-${id}`)

describe('tavlan visar ett kort per linje, avtal och station', () => {
  it('ett kort per produktionslinje och station, plus ett "nytt leverantörsavtal"', () => {
    const { state } = setup()
    for (const line of state.house.lines) expect(card(line.id)).toBeTruthy()
    for (const station of state.house.stations) expect(card(station.id)).toBeTruthy()
    expect(card('supply-new')).toBeTruthy()
  })

  it('ett gällande avtal får ett eget kort med låst index och löptid', () => {
    const state = createInitialState('indochina-slice', 'board-agreement-seed')
    state.house.standingOrders.supply = [
      { id: 'supply-steel-4', commodity: 'steel', volumePerTurn: 40_000, lockedIndex: 100, startTurn: 5, endTurn: 9, lossStreak: 1 },
    ]
    setup({ state })
    const el = card('supply-steel')
    expect(el.textContent).toContain('STEEL')
    expect(el.textContent).toContain('£40,000')
    expect(el.textContent).toContain('100') // låst index
    expect(el.textContent).toContain('T9') // sista turen
  })

  it('linjekortet visar SAMMA produktionslinjeband som P85 (en linje, en sanning)', () => {
    const state = createInitialState('indochina-slice', 'board-band-seed')
    setup({ state })
    const band = within(card('line-1')).getByTestId('production-line-band')
    expect(band.textContent).toContain('LINE-1')
  })
})

describe('ändringar görs med Segmented och Stepper och köas via onSet', () => {
  it('LINJE: ett tryck vänder kortet, kategori + skift → SET köar en LINE-ändring', () => {
    const { onSet } = setup()
    fireEvent.click(within(card('line-1')).getByTestId('standing-flip-line-1'))
    fireEvent.click(within(card('line-1')).getByRole('radio', { name: 'ART' }))
    fireEvent.click(within(card('line-1')).getByRole('radio', { name: 'OVERTIME' }))
    fireEvent.click(within(card('line-1')).getByTestId('standing-set-line-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'LINE', lineId: 'line-1', category: 'artillery', shift: 'overtime' })
  })

  it('LINJE: "ANY" ger category null (fritt)', () => {
    const { onSet } = setup()
    fireEvent.click(within(card('line-1')).getByTestId('standing-flip-line-1'))
    fireEvent.click(within(card('line-1')).getByRole('radio', { name: 'ANY' }))
    fireEvent.click(within(card('line-1')).getByTestId('standing-set-line-1'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'LINE', lineId: 'line-1', category: null, shift: 'normal' })
  })

  it('AVTAL: råvara + volym (Stepper) + löptid (Stepper) → SET köar en SUPPLY SET', () => {
    const { onSet } = setup()
    const el = card('supply-new')
    fireEvent.click(within(el).getByTestId('standing-flip-supply-new'))
    fireEvent.click(within(el).getByRole('radio', { name: 'STEEL' }))
    fireEvent.click(within(el).getByLabelText('Increase Volume per quarter'))
    fireEvent.click(within(el).getByLabelText('Increase Duration'))
    fireEvent.click(within(el).getByTestId('standing-set-supply-new'))
    const change = onSet.mock.calls[0]![0]
    expect(change).toMatchObject({ kind: 'SUPPLY', op: 'SET', commodity: 'steel' })
    if (change.kind === 'SUPPLY' && change.op === 'SET') {
      expect(change.volumePerTurn).toBeGreaterThan(0)
      expect(change.durationTurns).toBeGreaterThanOrEqual(4)
      expect(change.durationTurns).toBeLessThanOrEqual(8)
    }
  })

  it('AVTAL: en råvara som redan har ett avtal kan inte sättas på nytt (SET avstängd med orsak)', () => {
    const state = createInitialState('indochina-slice', 'board-dupe-seed')
    state.house.standingOrders.supply = [
      { id: 'supply-steel-4', commodity: 'steel', volumePerTurn: 40_000, lockedIndex: 100, startTurn: 5, endTurn: 9, lossStreak: 0 },
    ]
    setup({ state })
    const el = card('supply-new')
    fireEvent.click(within(el).getByTestId('standing-flip-supply-new'))
    fireEvent.click(within(el).getByRole('radio', { name: 'STEEL' }))
    expect((within(el).getByTestId('standing-set-supply-new') as HTMLButtonElement).disabled).toBe(true)
    expect(el.textContent).toContain('already exists')
  })

  it('AVTAL: ett gällande avtal kan sägas upp → CANCEL', () => {
    const state = createInitialState('indochina-slice', 'board-cancel-seed')
    state.house.standingOrders.supply = [
      { id: 'supply-steel-4', commodity: 'steel', volumePerTurn: 40_000, lockedIndex: 100, startTurn: 5, endTurn: 9, lossStreak: 0 },
    ]
    const { onSet } = setup({ state })
    const el = card('supply-steel')
    fireEvent.click(within(el).getByTestId('standing-flip-supply-steel'))
    fireEvent.click(within(el).getByTestId('standing-cancel-supply-steel'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'SUPPLY', op: 'CANCEL', commodity: 'steel' })
  })

  it('STATION: läget väljs med Segmented → SET köar en STATION-ändring', () => {
    const { onSet, state } = setup()
    const id = state.house.stations[0]!.id
    fireEvent.click(within(card(id)).getByTestId(`standing-flip-${id}`))
    fireEvent.click(within(card(id)).getByRole('radio', { name: 'ACTIVE' }))
    fireEvent.click(within(card(id)).getByTestId(`standing-set-${id}`))
    expect(onSet).toHaveBeenCalledWith({ kind: 'STATION', stationId: id, mode: 'active' })
  })

  it('en köad ändring visas som väntande på kortet och kan ångras', () => {
    const draft: TurnSubmission = {
      ...EMPTY_DRAFT,
      standingOrders: [{ kind: 'STATION', stationId: 'station-1', mode: 'quiet' }],
    }
    const { onRemove } = setup({ draft })
    const el = card('station-1')
    expect(el.textContent).toContain('PENDING')
    expect(el.textContent).toContain('QUIET')
    fireEvent.click(within(el).getByTestId('standing-undo-station-1'))
    expect(onRemove).toHaveBeenCalledWith(standingOrderKey({ kind: 'STATION', stationId: 'station-1', mode: 'quiet' }))
  })

  it('en gällande order visas på kortets framsida (linjens skift och kategori)', () => {
    const state = createInitialState('indochina-slice', 'board-current-seed')
    state.house.standingOrders.lines['line-2'] = { category: 'armour', shift: 'overtime', sinceTurn: 1 }
    setup({ state })
    expect(card('line-2').textContent).toContain('OVERTIME')
    expect(card('line-2').textContent).toContain('ARMOUR')
  })
})

describe('larm: rött fettkritsstreck på kortet och en rad i This Quarter som hoppar till det', () => {
  function alarmState(): GameState {
    const state = createInitialState('indochina-slice', 'board-alarm-seed')
    state.meta.turn = 8
    state.house.standingOrders.supply = [
      { id: 'supply-steel-1', commodity: 'steel', volumePerTurn: 40_000, lockedIndex: 100, startTurn: 1, endTurn: 20, lossStreak: DISPLAY_THRESHOLDS.supplyLossStreakTurns },
    ]
    const station = state.house.stations[0]!
    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold + 5
    state.house.standingOrders.stations[station.id] = { mode: 'active', sinceTurn: 1, activeTurns: 0 }
    state.house.standingOrders.lines['line-1'] = { category: null, shift: 'normal', sinceTurn: 1 }
    state.wire = [
      {
        id: 'w-1',
        turn: 7,
        severity: 'headline',
        scope: 'house',
        headline: 'LINE-1 WAS BUILDING FOR A VOIDED CONTRACT (contract-9) — FREED',
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      },
    ]
    return state
  }

  it('standingOrderAlarms härleder alla tre larmen ur state', () => {
    const alarms = standingOrderAlarms(alarmState())
    expect(alarms.map((a) => a.cardId).sort()).toEqual(['line-1', 'station-1', 'supply-steel'])
  })

  it('inga larm i ett fräscht parti, och ett larm bara för linjer som HAR en stående order', () => {
    expect(standingOrderAlarms(createInitialState('indochina-slice', 'no-alarm-seed'))).toEqual([])
    const state = alarmState()
    delete state.house.standingOrders.lines['line-1']
    expect(standingOrderAlarms(state).some((a) => a.cardId === 'line-1')).toBe(false)
  })

  it('korten får has-alarm och larmtexten', () => {
    setup({ state: alarmState() })
    for (const id of ['line-1', 'station-1', 'supply-steel']) {
      expect(card(id).className).toContain('has-alarm')
      expect(within(card(id)).getByTestId(`standing-alarm-${id}`)).toBeTruthy()
    }
  })

  it('This Quarter har en rad per larm som hoppar till company med rätt kort som fokus', () => {
    const onNavigate = vi.fn()
    render(<QuarterBand state={alarmState()} onNavigate={onNavigate} />)
    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    fireEvent.click(document.querySelector('[data-testid="quarterband-item-standing-supply-steel"]')!)
    expect(onNavigate).toHaveBeenCalledWith({ view: 'company', focus: 'supply-steel' })
  })

  it('fokus på ett kort öppnar det (vänt) så larmet syns direkt', () => {
    setup({ state: alarmState(), focusCard: 'supply-steel' })
    expect(within(card('supply-steel')).getByTestId('standing-back-supply-steel')).toBeTruthy()
  })
})
