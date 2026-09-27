// TheWire.newsdesk.test.tsx — P81d (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten):
// "NEWS DESK i tre nivåer... (2) Förstasidan: kvartalets rubriker, grupperade
// under fasta avdelningar (Dina affärer, Fronten, Politik, Marknaden), högst
// fem per avdelning och resten bakom 'More' (regel 7). (3) Telexarkivet: alla
// händelser, filtrerbara per avdelning och på 'bara mina'." Den här filen
// testar just de tre delarna — reveal-sekvensen (nivå 1, "blixt" i
// QuarterReplay) och synkron/sekventiell avslöjning täcks redan av
// TheWire.reveal.test.tsx (P70). prefers-reduced-motion=true används här
// genomgående så alla händelser är synliga direkt, utan timers.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
import { TheWire } from '../src/components/TheWire.js'

afterEach(cleanup)

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeEvent(overrides: Partial<WireEvent>): WireEvent {
  return {
    id: `e-${Math.random()}`,
    turn: 5,
    severity: 'headline',
    scope: 'house',
    headline: 'TEST HEADLINE',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...overrides,
  }
}

describe('TheWire — NEWS DESK i tre nivåer (P81d)', () => {
  it('förstasidan visar högst fem rader per avdelning, resten bakom "More"', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-cap-seed')
    // 7 "business"-händelser (subjectId: null → 'business', se newsClassification.ts)
    // samma tur, ingen är blixt.
    const wire = Array.from({ length: 7 }, (_, i) =>
      makeEvent({ id: `biz-${i}`, headline: `BUSINESS EVENT ${i}`, turn: 5, subjectId: null }),
    )

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    const section = screen.getByTestId('news-department-business')
    // Hjälterubriken tar en av de sju (den senast avslöjade), så avdelnings-
    // listan har som mest 6 kvar att visa — fortfarande takat till 5.
    const rows = section.querySelectorAll('.wire-item')
    expect(rows.length).toBe(5)
    expect(screen.getByTestId('news-more-business')).toBeTruthy()
  })

  it('en blixthändelse klipps aldrig bort av femtaket, även när avdelningen har fler händelser', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-flash-priority-seed')
    // 3 blixthändelser + 4 vanliga = 7 i samma avdelning ("business").
    const flashEvents = [
      makeEvent({ id: 'flash-1', headline: 'NUCLEAR EXCHANGE', turn: 5, subjectId: null }),
      makeEvent({ id: 'flash-2', headline: 'MERIDIAN ARMS EXPOSED — LICENCE REVOKED', turn: 5, subjectId: null }),
      makeEvent({ id: 'flash-3', headline: 'MERIDIAN ARMS LIQUIDATED — INSOLVENT', turn: 5, subjectId: null }),
    ]
    const routineEvents = Array.from({ length: 4 }, (_, i) =>
      makeEvent({ id: `routine-${i}`, headline: `ROUTINE BUSINESS EVENT ${i}`, turn: 5, subjectId: null }),
    )
    const wire = [...routineEvents, ...flashEvents]

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    // Hjälten tar en av dem (den senast avslöjade — en av blixthändelserna,
    // eftersom flashEvents ligger sist i arrayen och reveal med
    // reduced-motion visar allt i ordning). Alla TRE blixthändelser måste
    // ändå synas NÅGONSTANS på sidan (hero + avdelning tillsammans).
    for (const flash of flashEvents) {
      expect(screen.getByText(flash.headline)).toBeTruthy()
    }
  })

  it('"More"-knappen växlar till arkivet, redan filtrerat på samma avdelning', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-more-seed')
    const wire = Array.from({ length: 7 }, (_, i) =>
      makeEvent({ id: `biz-${i}`, headline: `BUSINESS EVENT ${i}`, turn: 5, subjectId: null }),
    )

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    fireEvent.click(screen.getByTestId('news-more-business'))

    expect(screen.getByTestId('archive-list')).toBeTruthy()
    expect(screen.queryByTestId('news-front-page')).toBeNull()
    // Avdelningsfiltret (Segmented) ska nu stå på "Your Business".
    const filterButtons = screen
      .getByTestId('news-department-filter')
      .querySelectorAll('[role="radio"][aria-checked="true"]')
    expect(Array.from(filterButtons).some((b) => b.textContent === 'Your Business')).toBe(true)
  })

  it('fliken "Archive" visar ALLA händelser, oavsett avdelning, tills ett filter sätts', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-archive-all-seed')
    const wire = [
      makeEvent({ id: 'biz-1', headline: 'A BUSINESS EVENT', turn: 5, subjectId: null }),
      makeEvent({ id: 'front-1', headline: 'A FRONT EVENT', turn: 5, scope: 'front', subjectId: Object.keys(state.fronts)[0] }),
    ]

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))

    const archive = within(screen.getByTestId('archive-list'))
    expect(archive.getByText('A BUSINESS EVENT')).toBeTruthy()
    expect(archive.getByText('A FRONT EVENT')).toBeTruthy()
  })

  it('avdelningsfiltret i arkivet begränsar listan till vald avdelning', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-archive-filter-seed')
    const frontId = Object.keys(state.fronts)[0]!
    const wire = [
      makeEvent({ id: 'biz-1', headline: 'A BUSINESS EVENT', turn: 5, subjectId: null }),
      makeEvent({ id: 'front-1', headline: 'A FRONT EVENT', turn: 5, scope: 'front', subjectId: frontId }),
    ]

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'The Front' }))

    const archive = within(screen.getByTestId('archive-list'))
    expect(archive.getByText('A FRONT EVENT')).toBeTruthy()
    expect(archive.queryByText('A BUSINESS EVENT')).toBeNull()
  })

  it('"Only mine"-togglen visar bara spelarens egna händelser', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-only-mine-seed')
    const wire = [
      makeEvent({ id: 'mine-1', headline: 'MY OWN EVENT', turn: 5, subjectId: null, actorIsPlayer: true }),
      makeEvent({ id: 'other-1', headline: 'SOMEONE ELSES EVENT', turn: 5, subjectId: null, actorIsPlayer: false }),
    ]

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))
    let archive = within(screen.getByTestId('archive-list'))
    expect(archive.getByText('MY OWN EVENT')).toBeTruthy()
    expect(archive.getByText('SOMEONE ELSES EVENT')).toBeTruthy()

    fireEvent.click(screen.getByTestId('news-only-mine-toggle'))

    archive = within(screen.getByTestId('archive-list'))
    expect(archive.getByText('MY OWN EVENT')).toBeTruthy()
    expect(archive.queryByText('SOMEONE ELSES EVENT')).toBeNull()
  })

  it('rutinhändelser (ticker) slås ihop till en sammanfattningsrad per mall i arkivet', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-ticker-group-seed')
    const wire = [
      makeEvent({ id: 't-1', severity: 'ticker', headline: 'MERIDIAN ARMS DEBT INTEREST: -£10,000', turn: 4, subjectId: null }),
      makeEvent({ id: 't-2', severity: 'ticker', headline: 'MERIDIAN ARMS DEBT INTEREST: -£12,000', turn: 5, subjectId: null }),
    ]

    render(<TheWire wire={wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))

    const groupRows = screen.getAllByTestId('ticker-group-row')
    expect(groupRows.length).toBe(1)
    expect(groupRows[0]!.textContent).toContain('×2')
  })

  it('en tom wire kraschar inte i vare sig förstasidan eller arkivet', () => {
    mockMatchMedia(true)
    const state: GameState = createInitialState('indochina-slice', 'newsdesk-empty-seed')

    expect(() =>
      render(<TheWire wire={[]} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />),
    ).not.toThrow()
    expect(screen.getByText(/Quiet on the line/)).toBeTruthy()

    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))
    })
    expect(screen.getByText(/No events match this filter/)).toBeTruthy()
  })
})
