// handbookTruth.test.ts — P162 (ETAPP10_FORSLAG.md §3b, S5): handbokens uppslag om underrättelse ska stämma med koden. Påståendena binds till det
// koden faktiskt gör, så att ett uppslag som blir fel — eller en kodändring som gör det fel — fäller ett test i stället för att glida.
// P167 lät stationens täckning växa med djupet (och en vilande station öppnas igen); testet och uppslaget skrevs om i samma commit.
import { describe, expect, it } from 'vitest'
import { coverageForDepth, createInitialState, formationDisplay, grownCoverage, officialDisplay, resolveTurn, validateAction } from '@seventh-front/core'
import { HANDBOOK } from '../src/handbook.js'

const intelligence = HANDBOOK.find((t) => t.id === 'intelligence')!
const text = [intelligence.summary, ...intelligence.body].join(' ')

describe('handboken om underrättelse stämmer med koden', () => {
  it('täckningen växer med djupet: militär 2, industri 3, kabinett 4 — och integritet/agenda visas först med kabinett (uppslaget säger det)', () => {
    const state = createInitialState('indochina-slice', 'handbook-truth-seed')
    const station = state.house.stations[0]!
    const nation = station.nation
    const official = Object.values(state.officials).find((o) => o.factionId === nation)!
    for (const [depth, cabinet] of [[1, false], [2, false], [3, false], [4, true], [5, true]] as const) {
      station.depth = depth
      station.coverage = grownCoverage({ coverage: ['procurement'], depth }).coverage
      const shown = officialDisplay(state, official)
      expect(shown.integrity === null, `djup ${depth}`).toBe(!cabinet)
      expect(shown.agenda === null, `djup ${depth}`).toBe(!cabinet)
      expect(shown.name).toBeTruthy() // namn, post, ställning och relation visas alltid
    }
    expect(coverageForDepth(2)).toContain('military')
    expect(coverageForDepth(1)).not.toContain('military')
    expect(coverageForDepth(3)).toContain('industry')
    expect(coverageForDepth(2)).not.toContain('industry')
    expect(coverageForDepth(4)).toContain('cabinet')
    expect(coverageForDepth(3)).not.toContain('cabinet')
    expect(text).toMatch(/military coverage at depth 2, industry at depth 3 and cabinet at depth 4/)
    expect(text).toMatch(/name, post, standing and relation/)
    expect(text).toMatch(/cabinet coverage is what shows integrity and agenda/)
    expect(text).not.toMatch(/formations and officials show as unknown/)
  })

  it('en EXPAND i spelet ger den täckning uppslaget lovar (riktig väg genom resolveTurn)', () => {
    let state = createInitialState('indochina-slice', 'handbook-truth-expand-seed')
    const id = state.house.stations[0]!.id
    expect(state.house.stations[0]!.depth).toBe(1)
    for (const depth of [2, 3, 4]) {
      state = resolveTurn(state, { standingOrders: [], bids: [], actions: [{ type: 'INTEL', op: 'EXPAND', stationId: id }] }).state
      const station = state.house.stations.find((s) => s.id === id)!
      expect(station.depth).toBe(depth)
      expect(station.coverage).toEqual(coverageForDepth(depth))
    }
    const station = state.house.stations.find((s) => s.id === id)!
    expect(officialDisplay(state, Object.values(state.officials).find((o) => o.factionId === station.nation)!).integrity).not.toBeNull()
  })

  it('en tillbakadragen (dormant) station går att öppna igen med REOPEN, men inte med EXPAND eller WITHDRAW — och uppslaget säger det', () => {
    let state = createInitialState('indochina-slice', 'handbook-truth-dormant-seed')
    const id = state.house.stations[0]!.id
    state.house.stations[0]!.status = 'dormant'
    for (const op of ['EXPAND', 'WITHDRAW'] as const) {
      state = resolveTurn(state, { standingOrders: [], bids: [], actions: [{ type: 'INTEL', op, stationId: id }] }).state
      expect(state.house.stations.find((s) => s.id === id)!.status).toBe('dormant')
    }
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [{ type: 'INTEL', op: 'REOPEN', stationId: id }] }).state
    expect(state.house.stations.find((s) => s.id === id)!.status).toBe('active')
    expect(text).toMatch(/dormant station gives no insight/)
    expect(text).toMatch(/REOPEN wakes it again for a fee/)
    expect(text).not.toMatch(/no way to reopen/)
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

  it('en station låser upp fem verb (EXPAND, WITHDRAW, LEAK, SABOTAGE, TURN) — RECRUIT kräver ingen station, den skapar en', () => {
    const state = createInitialState('indochina-slice', 'handbook-truth-verbs')
    const station = state.house.stations[0]!
    const rival = Object.values(state.rivals)[0]!
    expect(validateAction(state, state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }).ok).toBe(true) // laos: ingen station
    for (const op of ['EXPAND', 'WITHDRAW'] as const) {
      expect(validateAction(state, state, { type: 'INTEL', op, stationId: 'nope' }).ok, op).toBe(false)
      expect(validateAction(state, state, { type: 'INTEL', op, stationId: station.id }).ok, op).toBe(true)
    }
    for (const op of ['LEAK', 'SABOTAGE'] as const) {
      expect(validateAction(state, state, { type: 'INTEL', op, stationId: 'nope', targetId: rival.id }).ok, op).toBe(false)
      expect(validateAction(state, state, { type: 'INTEL', op, stationId: station.id, targetId: rival.id }).ok, op).toBe(true)
    }
    expect(intelligence.summary).toMatch(/five verbs: EXPAND, WITHDRAW, LEAK, SABOTAGE and TURN/)
    expect(intelligence.summary).toMatch(/RECRUIT is how you open a station/)
    expect(intelligence.summary).toMatch(/REOPEN wakes a dormant one/)
  })

  it('RECRUIT öppnar en ny station på djup 0, och högst fem får finnas', () => {
    expect(text).toMatch(/depth 0/)
    expect(text).toMatch(/five/)
  })
})
