// TheWire.reveal.test.tsx — P70 klart-når (ETAPP6_TEKNISK_SPEC.md §5): "ett
// test bevisar att alla händelser renderas synkront när
// prefers-reduced-motion: reduce är satt, och sekventiellt annars."
//
// jsdom saknar `window.matchMedia` helt (verifierat, samma sorts lucka som
// `indexedDB`/P65) — mockas här manuellt, standardteknik för att testa
// prefers-reduced-motion-beroende kod i jsdom. Sekventiell-grenen kräver
// riktiga timers (vi.useFakeTimers, `TheWire.tsx`s REVEAL_INTERVAL_MS) — ingen
// tidigare fil i repot gjorde det, så tekniken införs här första gången.
//
// P81d (ETAPP7_TEKNISK_SPEC.md §13): förstasidan visar numera bara
// RUBRIKhändelser från den SENASTE turen, grupperade per avdelning — fixturerna
// ändrades därför från severity:'ticker' (aldrig synliga på förstasidan) till
// severity:'headline' (subjectId: null ger alla samma avdelning, "business"),
// annars mäter testet en avslöjningsräkning mot rader som aldrig renderas.
// Själva mekanismen (useRevealedCount/REVEAL_INTERVAL_MS) är oförändrad.
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
    severity: 'headline',
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

      // P81d: den FÖRSTA avslöjade händelsen blir hjälterubriken
      // (news-hero) i stället för en rad i avdelningslistan (TheWire.tsx:s
      // egen kommentar — en dubblett av samma text direkt under vore bara
      // brus). Räknar därför den TOTALA texttäckningen (hero + rader),
      // inte bara .wire-item, som är robust mot den omfördelningen.
      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS)
      })
      expect(screen.getAllByText(/TEST EVENT/).length).toBe(1)

      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS)
      })
      expect(screen.getAllByText(/TEST EVENT/).length).toBe(2)

      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS * 2)
      })
      expect(screen.getAllByText(/TEST EVENT/).length).toBe(4)

      // Ingen ytterligare timer springer iväg efter att alla avslöjats.
      act(() => {
        vi.advanceTimersByTime(REVEAL_INTERVAL_MS * 3)
      })
      expect(screen.getAllByText(/TEST EVENT/).length).toBe(4)
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
