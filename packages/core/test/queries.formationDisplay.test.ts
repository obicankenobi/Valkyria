// queries.formationDisplay.test.ts — P51 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 7, skyddsräcke 3): "Spelaren ser aldrig ett förbands dolda värden. readiness
// och exakt equipment per förband visas bara på den underrättelsenivå Station.depth i
// landet medger — samma princip som bidEstimate. Utan station: UNKNOWN FORMATION och
// ett styrkeband." Se queries.test.ts:s withStationDepth för samma mönster mot
// bidEstimate — den här filen upprepar det mot formationDisplay/effectiveDepth i
// stället för att bygga om det.
import { describe, expect, it } from 'vitest'
import { effectiveDepth, formationDisplay } from '../src/queries.js'
import { createInitialState } from '../src/state.js'
import type { GameState, Station } from '../src/types.js'

function withStations(state: GameState, stations: Station[]): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  clone.house.stations = stations
  clone.house.staff.chiefSalesman = 50 // under 75 — ingen bonus, isolerar station-täckningen
  return clone
}

describe('formationDisplay (avsnitt 7, skyddsräcke 3)', () => {
  it('(P51 klart-när) ett förband utan aktiv station i sin faktions land visas som UNKNOWN FORMATION, readiness/equipment/exakt strength dolda', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [])
    const formation = state.fronts['front-1']!.formations[0]!

    const display = formationDisplay(state, formation)

    expect(display.known).toBe(false)
    expect(display.name).toBe('UNKNOWN FORMATION')
    expect(display.readiness).toBeNull()
    expect(display.equipment).toBeNull()
    expect(display.strength).toBeNull()
    expect(['svag', 'medel', 'stark']).toContain(display.strengthBand)
  })

  it('ett förband MED en aktiv station i sin faktions land visar sitt riktiga namn, readiness och equipment', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 0, coverage: ['military'], status: 'active' },
    ])
    const formation = state.fronts['front-1']!.formations.find((f) => f.factionId === 'rvn')!

    const display = formationDisplay(state, formation)

    expect(display.known).toBe(true)
    expect(display.name).toBe(formation.name)
    expect(display.readiness).toBe(formation.readiness)
    expect(display.equipment).toEqual(formation.equipment)
    expect(display.strength).toBe(formation.strength)
  })

  it('en dormant/burned station räknas inte som täckning — samma princip som effectiveDepth/bidEstimate', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 3, exposure: 0, coverage: ['military'], status: 'dormant' },
    ])
    const formation = state.fronts['front-1']!.formations.find((f) => f.factionId === 'rvn')!

    expect(formationDisplay(state, formation).known).toBe(false)
  })

  it('sectorId, doctrine och status döljs aldrig — skyddsräcke 3 namnger bara readiness/equipment', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [])
    const formation = state.fronts['front-1']!.formations[0]!

    const display = formationDisplay(state, formation)

    expect(display.sectorId).toBe(formation.sectorId)
    expect(display.doctrine).toBe(formation.doctrine)
    expect(display.status).toBe(formation.status)
  })

  it('rör aldrig indata (CLAUDE.md hård regel 3, samma disciplin som bidEstimate)', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [])
    const formation = state.fronts['front-1']!.formations[0]!
    const before = JSON.parse(JSON.stringify(formation))

    formationDisplay(state, formation)

    expect(formation).toEqual(before)
  })
})

describe('effectiveDepth (nu exporterad — delas mellan bidEstimate och formationDisplay)', () => {
  it('samma funktion, samma resultat för samma land, oavsett anropare', () => {
    const state = withStations(createInitialState('indochina-slice', 'formation-display-seed'), [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 3, exposure: 0, coverage: ['military'], status: 'active' },
    ])

    expect(effectiveDepth(state, 'rvn')).toBe(3)
    expect(effectiveDepth(state, 'nlf')).toBe(0)
  })
})
