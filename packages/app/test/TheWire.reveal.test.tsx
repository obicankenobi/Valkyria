// TheWire.reveal.test.tsx — P70 klart-når (ETAPP6_TEKNISK_SPEC.md §5): "ett
// test bevisar att alla händelser renderas synkront när
// prefers-reduced-motion: reduce är satt, och sekventiellt annars."
//
// jsdom saknar `window.matchMedia` helt (verifierat, samma sorts lucka som
// `indexedDB`/P65) — mockas här manuellt, standardteknik för att testa
// prefers-reduced-motion-beroende kod i jsdom. Sekventiell-grenen kräver
// riktiga timers (vi.useFakeTimers, `TheWire.tsx`s REVEAL_INTERVAL_MS) — ingen
// tidigare fil i repot gjorde det, så tekniken införs här första gången.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
import { REVEAL_INTERVAL_MS, TheWire } from '../src/components/TheWire.js'

afterEach(cleanup)

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function makeWire(count: number): WireEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${i}`,
    turn: 3,
    severity: 'ticker',
    scope: 'house',
    headline: `TEST EVENT ${i}`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  }))
}

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

describe('TheWire — turövergången dramatiseras (P70 klart-når)', () => {
  it('med prefers-reduced-motion: reduce renderas ALLA händelser synkront, utan att någon timer behöver köras', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'wire-reveal-seed')
    const wire = makeWire(5)

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    expect(screen.getAllByText(/TEST EVENT/).length).toBe(5)
  })

  it('utan prefers-reduced-motion avslöjas händelserna SEKVENTIELLT, en per REVEAL_INTERVAL_MS', () => {
    mockMatchMedia(false)
    vi.useFakeTimers()
    try {
      const state: GameState = createInitialState('indochina-slice', 'wire-reveal-seed')
      const wire = makeWire(4)

      render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

      // Ingen händelse ännu i det allra första rendret.
      expect(screen.queryByText(/TEST EVENT/)).toBeNull()

      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS)
      })
      expect(document.querySelectorAll('.wire-item').length).toBe(1)

      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS)
      })
      expect(document.querySelectorAll('.wire-item').length).toBe(2)

      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS * 2)
      })
      expect(document.querySelectorAll('.wire-item').length).toBe(4)

      // Ingen ytterligare timer springer iväg efter att alla avslöjats.
      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS * 3)
      })
      expect(document.querySelectorAll('.wire-item').length).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('en tom wire kraschar inte i någon av de två grenarna', () => {
    const state: GameState = createInitialState('indochina-slice', 'wire-reveal-seed')

    mockMatchMedia(true)
    expect(() => render(<TheWire wire={[]} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)).not.toThrow()
    cleanup()

    mockMatchMedia(false)
    expect(() => render(<TheWire wire={[]} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)).not.toThrow()
  })
})
