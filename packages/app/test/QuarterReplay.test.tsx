// QuarterReplay.test.tsx — P80 (ETAPP7_TEKNISK_SPEC.md §8). Klart-när berör
// wireAnchor/mätningen (se wireAnchor.test.ts); den här filen verifierar
// §8s andra tre krav ordagrant: "Standardläge: bara rubrikhändelser, i hög
// takt. Full uppspelning av alla händelser är ett val ... Hoppa över med en
// knapp. Omedelbar vid prefers-reduced-motion." Samma matchMedia-mockteknik
// som TheWire.reveal.test.tsx (P70) — jsdom saknar window.matchMedia helt.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { GameState, WireEvent } from '@seventh-front/core'
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

const state: GameState = createInitialState('indochina-slice', 'quarter-replay-seed')

function makeEvent(partial: Partial<WireEvent>): WireEvent {
  return {
    id: `event-${Math.random()}`,
    turn: 3,
    severity: 'ticker',
    scope: 'house',
    headline: 'TEST',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...partial,
  }
}

describe('QuarterReplay', () => {
  it('prefers-reduced-motion → onDone anropas omedelbart, inget renderas (§8 ordagrant: "Omedelbar vid prefers-reduced-motion")', () => {
    mockMatchMedia(true)
    const onDone = vi.fn()
    const wire = [makeEvent({ severity: 'headline', headline: 'HEADLINE ONE' })]

    render(
      <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={onDone} />,
    )

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('quarter-replay')).toBeNull()
  })

  it('inga rubrikhändelser denna tur → onDone anropas omedelbart (ett tyst kvartal)', () => {
    mockMatchMedia(false)
    const onDone = vi.fn()
    const wire = [makeEvent({ severity: 'ticker' }), makeEvent({ severity: 'report' })]

    render(
      <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={onDone} />,
    )

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('standardläge visar bara rubrikhändelser, en i taget (§8: "bara rubrikhändelser, i hög takt")', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const wire = [
        makeEvent({ severity: 'ticker', headline: 'TICKER, DOLD I STANDARDLÄGE' }),
        makeEvent({ severity: 'headline', headline: 'FIRST HEADLINE' }),
        makeEvent({ severity: 'headline', headline: 'SECOND HEADLINE' }),
      ]
      render(
        <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={() => {}} />,
      )

      expect(screen.queryByText('TICKER, DOLD I STANDARDLÄGE')).toBeNull()
      expect(screen.queryByText('FIRST HEADLINE')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      expect(screen.getByText('FIRST HEADLINE')).toBeTruthy()
      expect(screen.queryByText('SECOND HEADLINE')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      expect(screen.getByText('SECOND HEADLINE')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fullReplay=true visar ALLA severities, inte bara rubriker (§8: "Full uppspelning av alla händelser är ett val")', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const wire = [makeEvent({ severity: 'ticker', headline: 'A TICKER EVENT' })]
      render(
        <QuarterReplay wire={wire} state={state} fullReplay={true} onToggleFullReplay={() => {}} onDone={() => {}} />,
      )

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      expect(screen.getByText('A TICKER EVENT')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sekvensen avslutas automatiskt med onDone efter sista händelsen', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const wire = [makeEvent({ severity: 'headline', headline: 'ONLY HEADLINE' })]
      render(
        <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={onDone} />,
      )

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      expect(onDone).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Skip-knappen anropar onDone direkt (§8: "Hoppa över med en knapp")', () => {
    mockMatchMedia(false)
    const onDone = vi.fn()
    const wire = [makeEvent({ severity: 'headline', headline: 'HEADLINE' })]
    render(<QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={onDone} />)

    fireEvent.click(screen.getByTestId('replay-skip'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('togglen anropar onToggleFullReplay med motsatt värde', () => {
    mockMatchMedia(false)
    const onToggleFullReplay = vi.fn()
    const wire = [makeEvent({ severity: 'headline', headline: 'HEADLINE' })]
    render(
      <QuarterReplay
        wire={wire}
        state={state}
        fullReplay={false}
        onToggleFullReplay={onToggleFullReplay}
        onDone={() => {}}
      />,
    )

    fireEvent.click(screen.getByTestId('replay-full-toggle'))
    expect(onToggleFullReplay).toHaveBeenCalledWith(true)
  })

  // P81d (§13, P81-blockquoten): "ett helskärmstelex för de fåtal
  // händelsetyper som ändrar läget" — en blixthändelse får .is-flash och en
  // egen testid, en vanlig rubrikhändelse får ingetdera.
  it('en blixthändelse (isFlashEvent) får is-flash-klassen och replay-item-flash-testid', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const wire = [
        makeEvent({ severity: 'headline', headline: 'NUCLEAR EXCHANGE' }),
        makeEvent({ severity: 'headline', headline: 'MERIDIAN ARMS WINS THE CONTRACT FOR 105MM FIELD GUNS' }),
      ]
      render(
        <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={() => {}} />,
      )

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      const flashItems = screen.getAllByTestId('replay-item-flash')
      expect(flashItems.length).toBe(1)
      expect(flashItems[0]!.className).toContain('is-flash')
      expect(flashItems[0]!.textContent).toContain('NUCLEAR EXCHANGE')

      act(() => {
        vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
      })
      // Den vanliga rubriken lägger INTE till en ny replay-item-flash-post.
      expect(screen.getAllByTestId('replay-item-flash').length).toBe(1)
      expect(screen.queryByTestId('replay-item-flash')?.textContent).not.toContain('105MM')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('QuarterReplay — kartfokus (P158)', () => {
  it('onFocus får varje händelse i tur och ordning medan den visas, och null när uppspelningen är slut eller stängs', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    const focused: (string | null)[] = []
    const wire = [makeEvent({ id: 'a', severity: 'headline', headline: 'A' }), makeEvent({ id: 'b', severity: 'headline', headline: 'B' })]
    const { unmount } = render(
      <QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onFocus={(e) => focused.push(e ? e.id : null)} onDone={() => {}} />,
    )
    expect(focused.at(-1)).toBeNull() // ingen händelse än
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
    })
    expect(focused.at(-1)).toBe('a')
    act(() => {
      vi.advanceTimersByTime(REPLAY_INTERVAL_MS)
    })
    expect(focused.at(-1)).toBe('b')
    unmount()
    expect(focused.at(-1)).toBeNull() // kartan ska inte behålla en ring efter uppspelningen
    vi.useRealTimers()
  })

  it('överlagret är en flik i kartans nederkant (kartan ska synas), inte ett helskärmsöverlägg', () => {
    mockMatchMedia(false)
    const wire = [makeEvent({ severity: 'headline', headline: 'A' })]
    render(<QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={() => {}} />)
    expect(screen.getByTestId('quarter-replay').className).toContain('is-map-replay')
  })

  it('med styrelsens PM synligt går överlagret tillbaka till ett vanligt, centrerat kort (PM:et och Continue måste rymmas)', () => {
    mockMatchMedia(true)
    const memo = { reviewNumber: 1, passed: true, sentence: 'x', progress: 1, required: 1, topItems: [], turnsToNext: 4 } as never
    render(<QuarterReplay wire={[]} state={state} fullReplay={false} onToggleFullReplay={() => {}} memo={memo} onDone={() => {}} />)
    expect(screen.getByTestId('quarter-replay').className).not.toContain('is-map-replay')
  })
})
