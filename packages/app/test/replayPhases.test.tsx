// Etapp 14, P207: kvartalsuppspelningen i tre faser (replayPhases.ts, MapQuarterReplay.tsx) och kontraktens id i rubrikerna (cleanHeadline).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { WireEvent } from '@seventh-front/core'
import { orderByPhase, replayPhase } from '../src/replayPhases.js'
import { cleanHeadline } from '../src/displayNames.js'
import { MapQuarterReplay } from '../src/components/MapQuarterReplay.js'

afterEach(cleanup)

function event(id: string, headline: string, overrides: Partial<WireEvent> = {}): WireEvent {
  return { id, turn: 1, scope: 'market', subjectId: null, headline, delta: {}, causeId: null, severity: 'headline', actorIsPlayer: false, ...overrides } as WireEvent
}

describe('replayPhase', () => {
  const state = createInitialState('indochina-slice', 'phases-seed')
  it('leveranser först, fronten sedan, resten sist', () => {
    expect(replayPhase(state, event('a', 'DELIVERED 40× M-1 RIFLE TO REPUBLIC OF VIETNAM'))).toBe('convoys')
    expect(replayPhase(state, event('b', 'BRANDT DELIVERS 20× 105MM'))).toBe('convoys')
    const front = Object.values(state.fronts)[0]!
    expect(replayPhase(state, event('c', 'HEAVY FIGHTING', { scope: 'front', subjectId: front.id }))).toBe('guns')
    expect(replayPhase(state, event('d', 'SUPPLY COST INDEX: 100 → 104'))).toBe('telegrams')
  })
  it('orderByPhase sorterar i fasordning och behåller ordningen inom en fas', () => {
    const front = Object.values(state.fronts)[0]!
    const events = [
      event('t1', 'SUPPLY COST INDEX: 100 → 104'),
      event('g1', 'HEAVY FIGHTING', { scope: 'front', subjectId: front.id }),
      event('c1', 'DELIVERED 40× M-1 RIFLE'),
      event('t2', 'A CABINET RESHUFFLE'),
    ]
    expect(orderByPhase(state, events).map((p) => p.event.id)).toEqual(['c1', 'g1', 't1', 't2'])
  })
})

describe('cleanHeadline', () => {
  it('byter ett kontrakts interna id mot löpnumret', () => {
    const state = createInitialState('indochina-slice', 'clean-seed')
    state.market.contracts.push({
      id: 'contract-order-12', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B',
      dueTurn: 5, status: 'late', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    expect(cleanHeadline(state, 'CONTRACT contract-order-12 LATE — ACME BEHIND SCHEDULE')).toBe('CONTRACT No. 1 LATE — ACME BEHIND SCHEDULE')
    expect(cleanHeadline(state, 'NOTHING TO CLEAN')).toBe('NOTHING TO CLEAN')
  })
})

describe('MapQuarterReplay — tre faser', () => {
  it('visar fasremsan och en rubrik där varje fas börjar, i fasordning', () => {
    vi.useFakeTimers()
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
    let state = createInitialState('indochina-slice', 'replay-phases-seed')
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state
    const front = Object.values(state.fronts)[0]!
    const wire = [event('t1', 'SUPPLY COST INDEX: 100 → 104'), event('g1', 'HEAVY FIGHTING', { scope: 'front', subjectId: front.id }), event('c1', 'DELIVERED 40× M-1 RIFLE')]
    render(<MapQuarterReplay wire={wire} state={state} fullReplay onToggleFullReplay={() => {}} onDone={() => {}} />)
    expect(screen.getByTestId('replay-phases')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(screen.getByTestId('replay-phase-convoys').getAttribute('aria-current')).toBe('step')
    // En timer per steg: nästa schemaläggs först när komponenten ritats om.
    for (let i = 0; i < 2; i++)
      act(() => {
        vi.advanceTimersByTime(700)
      })
    expect(screen.getByTestId('replay-phase-telegrams').getAttribute('aria-current')).toBe('step')
    for (const phase of ['convoys', 'guns', 'telegrams']) expect(screen.getByTestId(`replay-phase-head-${phase}`)).toBeTruthy()
    const items = [...document.querySelectorAll('.replay-text')].map((el) => el.textContent)
    expect(items).toEqual(['DELIVERED 40× M-1 RIFLE', 'HEAVY FIGHTING', 'SUPPLY COST INDEX: 100 → 104'])
    vi.useRealTimers()
  })
})
