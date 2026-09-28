// EpilogueScreen.test.tsx — P89 (ETAPP7_TEKNISK_SPEC.md §9/§13). Klart-när,
// ordagrant: "GameState.chronicle, scenarioVerdict(state), slutkort per
// slutorsak, kärnvapenepilog, vändpunkter."
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { ChronicleEntry } from '@seventh-front/core'
import { EpilogueScreen } from '../src/components/EpilogueScreen.js'

afterEach(cleanup)

describe('EpilogueScreen (P89 klart-när)', () => {
  it('visar slutkortet med rätt etikett och tur när scenariot är slut', async () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed', { houseName: 'Meridian Arms' })
    state.status = { kind: 'ended', ending: 'BUYOUT', turn: 11 }
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    const ending = await screen.findByTestId('epilogue-ending')
    expect(ending.textContent).toContain('Bought out')
    expect(ending.textContent).toContain('Turn 11')
  })

  it('visar de fyra axlarna', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: 20 }
    state.house.treasury = 5_000_000
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    const axes = screen.getByTestId('epilogue-axes')
    expect(axes.textContent).toContain('CAPITAL')
    expect(axes.textContent).toContain('REACH')
    expect(axes.textContent).toContain('SHADOW')
    expect(axes.textContent).toContain('RESTRAINT')
  })

  it('visar vändpunkter när krönikan har poster', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: 20 }
    const entry: ChronicleEntry = {
      turn: 7,
      kind: 'coup',
      headline: 'YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS',
      actorIsPlayer: true,
      causeHeadlines: [],
      doomsdayDelta: 9,
    }
    state.chronicle = [entry]
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    const points = screen.getByTestId('epilogue-turning-points')
    expect(points.textContent).toContain('YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS')
    expect(points.textContent).toContain('TURN 7')
  })

  it('visar en kärnvapenepilog bara vid NUCLEAR_EXCHANGE', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'NUCLEAR_EXCHANGE', turn: 15 }
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    expect(screen.getByTestId('epilogue-nuclear')).toBeTruthy()
  })

  it('visar ingen kärnvapenepilog vid andra slutorsaker', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'INSOLVENCY', turn: 15 }
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    expect(screen.queryByTestId('epilogue-nuclear')).toBeNull()
  })

  it('FULL CHRONICLE öppnar historikskärmen med krönikans poster', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: 20 }
    state.chronicle = [
      {
        turn: 3,
        kind: 'ceasefire',
        headline: 'CEASEFIRE ON THE FRONT-1 FRONT',
        actorIsPlayer: false,
        causeHeadlines: [],
        doomsdayDelta: 0,
      },
    ]
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)

    expect(screen.queryByTestId('epilogue-history-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('epilogue-history-button'))
    const sheet = screen.getByTestId('epilogue-history-sheet')
    expect(sheet.textContent).toContain('CEASEFIRE ON THE FRONT-1 FRONT')
  })

  it('TITLE SCREEN anropar onTitleScreen', () => {
    const state = createInitialState('indochina-slice', 'epilogue-seed')
    state.status = { kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: 20 }
    const onTitleScreen = vi.fn()
    render(<EpilogueScreen state={state} onTitleScreen={onTitleScreen} />)

    fireEvent.click(screen.getByTestId('epilogue-title-button'))
    expect(onTitleScreen).toHaveBeenCalledOnce()
  })
})
