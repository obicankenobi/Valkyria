// queries.deriveSectorControl.test.ts — P66 klart-när (ETAPP6_TEKNISK_SPEC.md
// §4.6): "queries.deriveSectorControl.test.ts (gruppering, side-beräkning,
// 'empty'/'contested'-fallen)". Samma mönster som queries.formationDisplay.
// test.ts — riktig scenariodata (indochina-slice), tweakad på specifika fält
// för att engineera de fyra utfallen ('a'/'b'/'contested'/'empty') i stället
// för handskrivna Formation-literaler.
import { describe, expect, it } from 'vitest'
import { deriveSectorControl, formationDisplay } from '../src/queries.js'
import { createInitialState } from '../src/state.js'
import type { Formation, GameState } from '../src/types.js'

function withFormations(state: GameState, formations: Formation[]): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  clone.fronts['front-1']!.formations = formations
  return clone
}

function bySector(controls: ReturnType<typeof deriveSectorControl>, sectorId: string) {
  return controls.find((c) => c.sectorId === sectorId)
}

describe('deriveSectorControl (§4.3, P66 klart-när)', () => {
  it('grupperar front-1s riktiga scenarioformationer per sectorId — fyra sektorer, en rad per grupp', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const front = state.fronts['front-1']!

    const controls = deriveSectorControl(state, front)

    expect(controls.map((c) => c.sectorId).sort()).toEqual(['an-loc', 'cu-chi', 'da-nang', 'hue'])
  })

  it('en sektor med bara sida A ger side "a" (hue: rvn 40+20, ingen nlf-närvaro)', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const controls = deriveSectorControl(state, state.fronts['front-1']!)

    expect(bySector(controls, 'hue')?.side).toBe('a')
  })

  it('en sektor med bara sida B ger side "b" (cu-chi: nlf 35+30, ingen rvn-närvaro)', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const controls = deriveSectorControl(state, state.fronts['front-1']!)

    expect(bySector(controls, 'cu-chi')?.side).toBe('b')
  })

  it('en sektor där A klart dominerar (75 % av styrkan, över formationStrengthBandHighPct 66) ger "a" (da-nang)', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const controls = deriveSectorControl(state, state.fronts['front-1']!)

    // da-nang: rvn (a) 30 mot nlf (b) 10 — 75 % till A.
    expect(bySector(controls, 'da-nang')?.side).toBe('a')
  })

  it('en jämn sektor (50/50) ger "contested"', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const engineered: Formation[] = state.fronts['front-1']!.formations.map((f) =>
      f.sectorId === 'da-nang' ? { ...f, strength: 20 } : f,
    )
    const front = withFormations(state, engineered).fronts['front-1']!

    const controls = deriveSectorControl(state, front)

    expect(bySector(controls, 'da-nang')?.side).toBe('contested')
  })

  it('en "praktiskt taget" jämn sektor (40/60, innanför 33-66-bandet) ger också "contested"', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    // an-loc: rvn (a) 10, nlf (b) 5 — höj nlf till 15 så det blir 10 mot 15 (40 %/60 %).
    const engineered: Formation[] = state.fronts['front-1']!.formations.map((f) =>
      f.id === 'nlf-c10-artillery' ? { ...f, strength: 15 } : f,
    )
    const front = withFormations(state, engineered).fronts['front-1']!

    const controls = deriveSectorControl(state, front)

    expect(bySector(controls, 'an-loc')?.side).toBe('contested')
  })

  it('en sektor där all styrka slagits ut (strength 0 på bägge sidor) ger "empty", inte "contested"', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const engineered: Formation[] = state.fronts['front-1']!.formations.map((f) =>
      f.sectorId === 'an-loc' ? { ...f, strength: 0 } : f,
    )
    const front = withFormations(state, engineered).fronts['front-1']!

    const controls = deriveSectorControl(state, front)

    expect(bySector(controls, 'an-loc')?.side).toBe('empty')
  })

  it('formations i resultatet är EXAKT formationDisplay-projektioner — skyddsräcke 3 ärvs, ingen egen gatinglogik', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    state.house.stations = [] // ingen station — allt ska vara dimmat
    const front = state.fronts['front-1']!

    const controls = deriveSectorControl(state, front)
    const hue = bySector(controls, 'hue')!

    expect(hue.formations.length).toBeGreaterThan(0)
    for (const display of hue.formations) {
      const original = front.formations.find((f) => f.id === display.id)!
      expect(display).toEqual(formationDisplay(state, original))
      expect(display.known).toBe(false)
      expect(display.name).toBe('UNKNOWN FORMATION')
    }
  })

  it('rör aldrig indata (CLAUDE.md hård regel 3)', () => {
    const state = createInitialState('indochina-slice', 'sector-control-seed')
    const front = state.fronts['front-1']!
    const before = JSON.parse(JSON.stringify(front))

    deriveSectorControl(state, front)

    expect(front).toEqual(before)
  })
})
