// Shell.thisQuarter.test.tsx — P83 (ETAPP7_TEKNISK_SPEC.md §7.7, §13).
// "Varje rad har en ikon och hoppar till föremålet" — QuarterBand's rader
// via deriveThisQuarter (thisQuarter.ts), plus P81-11:s kvartalsbesked
// överst i listan.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createInitialState, DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { WireEvent } from '@seventh-front/core'
import { QuarterBand } from '../src/components/Shell.js'

afterEach(cleanup)

describe('QuarterBand (P83) — This Quarter-lägena', () => {
  it('en exponerad station ger en rad som, vid tryck, hoppar till operations med rätt faktion', () => {
    const state = createInitialState('indochina-slice', 'quarterband-item-seed')
    const station = state.house.stations.find((s) => s.nation === 'rvn')!
    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold
    const onNavigate = vi.fn()
    render(<QuarterBand state={state} onNavigate={onNavigate} />)

    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    const item = document.querySelector(`[data-testid="quarterband-item-station-${station.id}"]`)
    expect(item).toBeTruthy()
    fireEvent.click(item!)
    expect(onNavigate).toHaveBeenCalledWith({ view: 'operations', factionId: 'rvn' })
  })

  it('en väntande kris ger en rad som hoppar till news', () => {
    const state = createInitialState('indochina-slice', 'quarterband-crisis-seed')
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
    const onNavigate = vi.fn()
    render(<QuarterBand state={state} onNavigate={onNavigate} />)

    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    fireEvent.click(document.querySelector('[data-testid="quarterband-item-crisis"]')!)
    expect(onNavigate).toHaveBeenCalledWith({ view: 'news' })
  })

  it('badgens räknare inkluderar deriveThisQuarter-lägena, inte bara den gamla ad hoc-räkningen', () => {
    const state = createInitialState('indochina-slice', 'quarterband-count-items-seed')
    state.house.creditLimit = 1000
    state.house.debt = 950 // ett läge (kredit nära gränsen) som inte fanns i den gamla, hårdkodade räkningen
    const onNavigate = vi.fn()
    render(<QuarterBand state={state} onNavigate={onNavigate} />)

    expect(document.querySelector('[data-testid="quarterband-toggle"] .ds-quarterband-count')!.textContent).toBe('1')
  })
})

describe('QuarterBand (P81-11) — kvartalsbeskedet överst', () => {
  function makeEvent(overrides: Partial<WireEvent>): WireEvent {
    return {
      id: 'e-1',
      turn: 5,
      severity: 'headline',
      scope: 'market',
      headline: 'TEST',
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: null,
      ...overrides,
    }
  }

  it('visar senaste turens vunna/förlorade bud och leveranser i den utfällda kroppen', () => {
    const state = createInitialState('indochina-slice', 'quarterband-notice-seed')
    state.meta.turn = 5
    state.wire.push(
      makeEvent({ id: 'won', turn: 4, headline: 'MERIDIAN ARMS WINS CONTRACT: RIFLES TO RVN', actorIsPlayer: true }),
    )
    const onNavigate = vi.fn()
    render(<QuarterBand state={state} onNavigate={onNavigate} />)

    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    expect(document.querySelector('[data-testid="quarterband-notice"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="quarterband-notice-won"]')!.textContent).toContain('WINS CONTRACT')
  })

  it('ingen wire-historik ger inget kvartalsbesked, ingen krasch', () => {
    const state = createInitialState('indochina-slice', 'quarterband-notice-empty-seed')
    const onNavigate = vi.fn()
    render(<QuarterBand state={state} onNavigate={onNavigate} />)

    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    expect(document.querySelector('[data-testid="quarterband-notice"]')).toBeNull()
  })
})
