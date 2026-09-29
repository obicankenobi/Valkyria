// QuarterReplay.memo.test.tsx — P97 (ETAPP8_FORSLAG.md §3.2): "vid varje granskningstur visas
// ett stencilerat PM från THE SYNDICATE i kvartalsuppspelningen". Klart-när: varje
// granskningstur visar ett PM — alltså även med prefers-reduced-motion och i ett tyst kvartal,
// där uppspelningen annars avslutas direkt. Ett PM försvinner aldrig av sig självt.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { boardMemo, createInitialState } from '@seventh-front/core'
import type { BoardMemo as BoardMemoData, GameState, WireEvent } from '@seventh-front/core'
import { QuarterReplay, REPLAY_INTERVAL_MS } from '../src/components/QuarterReplay.js'

afterEach(cleanup)

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function reviewState(): { state: GameState; memo: BoardMemoData } {
  const state = createInitialState('indochina-slice', 'replay-memo-seed')
  state.meta.turn = 7 // turn 6 (en granskningstur) har just avgjorts
  const memo = boardMemo(state, 6)
  if (!memo) throw new Error('turn 6 ska vara en granskningstur i indochina-slice')
  return { state, memo }
}

const headline = (text: string): WireEvent => ({
  id: `e-${text}`,
  turn: 6,
  severity: 'headline',
  scope: 'house',
  headline: text,
  causeId: null,
  delta: {},
  actorIsPlayer: false,
  subjectId: null,
})

describe('QuarterReplay — styrelsens PM (P97)', () => {
  it('prefers-reduced-motion + PM: överlagret visas med PM:et och onDone anropas INTE av sig självt', () => {
    mockMatchMedia(true)
    const onDone = vi.fn()
    const { state, memo } = reviewState()
    render(<QuarterReplay wire={[headline('A')]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={memo} onDone={onDone} />)

    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('board-memo')).toBeTruthy()
    expect(screen.getByTestId('replay-skip').textContent).toBe('Continue')
    fireEvent.click(screen.getByTestId('replay-skip'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ett tyst kvartal (inga rubriker) med PM visar PM:et i stället för att avsluta direkt', () => {
    mockMatchMedia(false)
    const onDone = vi.fn()
    const { state, memo } = reviewState()
    render(<QuarterReplay wire={[]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={memo} onDone={onDone} />)

    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('board-memo')).toBeTruthy()
  })

  it('utan PM är beteendet oförändrat: reducerad rörelse → onDone direkt, inget renderas', () => {
    mockMatchMedia(true)
    const onDone = vi.fn()
    const { state } = reviewState()
    render(<QuarterReplay wire={[headline('A')]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={null} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('board-memo')).toBeNull()
  })

  it('med rörelse: listan spelas först, PM:et kommer fram när den är slut och stänger aldrig av sig självt', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const { state, memo } = reviewState()
      render(
        <QuarterReplay wire={[headline('ONE'), headline('TWO')]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={memo} onDone={onDone} />,
      )
      expect(screen.queryByTestId('board-memo')).toBeNull()
      expect(screen.getByTestId('replay-skip').textContent).toBe('Skip')

      // Ett steg per akt: varje setShown måste hinna rendera och schemalägga nästa timer.
      for (let i = 0; i < 4; i++) {
        act(() => {
          vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
        })
      }
      expect(screen.getByTestId('board-memo')).toBeTruthy()

      for (let i = 0; i < 10; i++) {
        act(() => {
          vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
        })
      }
      expect(onDone).not.toHaveBeenCalled()
      expect(screen.getByTestId('replay-skip').textContent).toBe('Continue')
    } finally {
      vi.useRealTimers()
    }
  })

  it('Skip mitt i listan hoppar till PM:et (visar det), och först Continue stänger', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const { state, memo } = reviewState()
      render(
        <QuarterReplay wire={[headline('ONE'), headline('TWO'), headline('THREE')]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={memo} onDone={onDone} />,
      )
      fireEvent.click(screen.getByTestId('replay-skip'))
      expect(onDone).not.toHaveBeenCalled()
      expect(screen.getByTestId('board-memo')).toBeTruthy()
      fireEvent.click(screen.getByTestId('replay-skip'))
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
