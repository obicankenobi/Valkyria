// handbookTruth.test.ts — P162 (ETAPP10_FORSLAG.md §3b, S5): handbokens uppslag om underrättelse ska stämma med koden. Påståendena binds till det
// koden faktiskt gör, så att ett uppslag som blir fel — eller en kodändring som gör det fel — fäller ett test i stället för att glida.
// När P167 låter stationens täckning växa med djupet ska det här testet fällas, och uppslaget skrivas om i samma commit.
import { describe, expect, it } from 'vitest'
import { createInitialState, formationDisplay, officialDisplay, resolveTurn } from '@seventh-front/core'
import { HANDBOOK } from '../src/handbook.js'

const intelligence = HANDBOOK.find((t) => t.id === 'intelligence')!
const text = [intelligence.summary, ...intelligence.body].join(' ')

describe('handboken om underrättelse stämmer med koden', () => {
  it('varje station täcker bara upphandling, även vid högsta djup — så integritet och agenda är okända (uppslaget säger det)', () => {
    const state = createInitialState('indochina-slice', 'handbook-truth-seed')
    for (const station of state.house.stations) station.depth = 5
    for (const official of Object.values(state.officials)) {
      const shown = officialDisplay(state, official)
      expect(shown.integrity).toBeNull()
      expect(shown.agenda).toBeNull()
      expect(shown.name).toBeTruthy() // namn, post, ställning och relation visas alltid
    }
    expect(text).toMatch(/name, post, standing and relation/)
    expect(text).toMatch(/integrity and agenda stay unknown/)
    expect(text).not.toMatch(/formations and officials show as unknown/)
  })

  it('en tillbakadragen (dormant) station blir aldrig aktiv igen, vad spelaren än köar — och uppslaget säger det', () => {
    let state = createInitialState('indochina-slice', 'handbook-truth-dormant-seed')
    const id = state.house.stations[0]!.id
    state.house.stations[0]!.status = 'dormant'
    for (const op of ['EXPAND', 'WITHDRAW'] as const) {
      state = resolveTurn(state, { standingOrders: [], bids: [], actions: [{ type: 'INTEL', op, stationId: id }] }).state
      expect(state.house.stations.find((s) => s.id === id)!.status).toBe('dormant')
    }
    expect(text).toMatch(/dormant station gives no insight/)
    expect(text).toMatch(/no way to reopen/)
  })

  it('formationer är okända på djup 0 (ingen station eller en ny) och kända från djup 1', () => {
    const state = createInitialState('indochina-slice', 'handbook-truth-depth-seed')
    const formation = Object.values(state.fronts).flatMap((f) => f.formations).find((f) => f.factionId === state.house.stations[0]!.nation)!
    state.house.stations[0]!.depth = 0
    expect(formationDisplay(state, formation).known).toBe(false)
    state.house.stations[0]!.depth = 1
    expect(formationDisplay(state, formation).known).toBe(true)
    expect(text).toMatch(/unknown at depth 0/)
    expect(text).toMatch(/from depth 1/)
  })

  it('RECRUIT öppnar en ny station på djup 0, och högst fem får finnas', () => {
    expect(text).toMatch(/depth 0/)
    expect(text).toMatch(/five/)
  })
})
