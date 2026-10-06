// stationCoverage.test.ts — P167 (ETAPP10_FORSLAG.md §3b, S5): en stations täckning växer med djupet, så att 'military', 'industry' och 'cabinet' går att nå, och en
// vilande station kan öppnas igen mot en kostnad (REOPEN). Båda var döda grindar: ingen kod gav en station annat än ['procurement'], och en dragen-tillbaka station kunde aldrig användas igen.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { coverageForDepth } from '../src/stationCoverage.js'
import { createInitialState } from '../src/state.js'
import { officialDisplay, raceAssessment } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { validateAction } from '../src/validateAction.js'
import { previewAction } from '../src/previewAction.js'
import type { GameState, PlayerAction, Station } from '../src/types.js'

const B = balance as unknown as {
  stationCoverageDepth: { military: number; industry: number; cabinet: number }
  intelReopenCost: number
  intelExpandCost: number
}
const turn = (state: GameState, actions: PlayerAction[] = []) => resolveTurn(state, { standingOrders: [], bids: [], actions })
const expand = (s: GameState): PlayerAction => ({ type: 'INTEL', op: 'EXPAND', stationId: s.house.stations[0]!.id })

describe('coverageForDepth', () => {
  it('upphandling alltid; övriga täckningar från de djup balance.json anger', () => {
    expect(coverageForDepth(0)).toEqual(['procurement'])
    const d = B.stationCoverageDepth
    for (const depth of [0, 1, 2, 3, 4, 5] as const) {
      const c = coverageForDepth(depth)
      expect(c.includes('military'), `military vid djup ${depth}`).toBe(depth >= d.military)
      expect(c.includes('industry'), `industry vid djup ${depth}`).toBe(depth >= d.industry)
      expect(c.includes('cabinet'), `cabinet vid djup ${depth}`).toBe(depth >= d.cabinet)
      expect(c[0]).toBe('procurement')
    }
  })

  it('de tre nya täckningarna nås i ordning och på olika djup (ingen är fri vid djup 1)', () => {
    const d = B.stationCoverageDepth
    expect(d.military).toBeGreaterThan(1)
    expect(d.industry).toBeGreaterThan(d.military - 1)
    expect(d.cabinet).toBeGreaterThanOrEqual(d.industry)
    expect(d.cabinet).toBeLessThanOrEqual(5)
  })
})

describe('täckningen följer djupet i spelet', () => {
  it('en ny station (RECRUIT) täcker bara upphandling', () => {
    const s = createInitialState('indochina-slice', 'coverage-recruit')
    const next = turn(s, [{ type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }]).state
    const fresh = next.house.stations.find((st) => st.nation === 'laos')!
    expect(fresh.depth).toBe(0)
    expect(fresh.coverage).toEqual(['procurement'])
  })

  it('EXPAND till ett djup som ger militär täckning lägger till den, och händelsen säger det', () => {
    const s = createInitialState('indochina-slice', 'coverage-expand')
    s.house.stations[0]!.depth = (B.stationCoverageDepth.military - 1) as Station['depth']
    s.house.stations[0]!.coverage = ['procurement']
    s.house.treasury = 5_000_000
    const result = turn(s, [expand(s)])
    expect(result.state.house.stations[0]!.coverage).toContain('military')
    expect(result.wire.some((e) => e.headline.includes('EXPANDED') && /COVERS .*MILITARY/.test(e.headline))).toBe(true)
  })

  it('en EXPAND som inte ger en ny täckning nämner ingen', () => {
    const s = createInitialState('indochina-slice', 'coverage-nochange')
    s.house.stations[0]!.depth = 0
    s.house.stations[0]!.coverage = ['procurement']
    const result = turn(s, [expand(s)])
    expect(result.state.house.stations[0]!.depth).toBe(1)
    expect(result.wire.find((e) => e.headline.includes('EXPANDED'))!.headline).not.toMatch(/COVERS/)
  })

  it('kabinettäckning (djup från balance.json) gör att tjänstemäns integritet och agenda syns — den grind som tidigare aldrig gick att öppna', () => {
    const s = createInitialState('indochina-slice', 'coverage-cabinet')
    const official = Object.values(s.officials).find((o) => o.factionId === s.house.stations[0]!.nation)!
    expect(officialDisplay(s, official).integrity).toBeNull()
    s.house.stations[0]!.depth = (B.stationCoverageDepth.cabinet - 1) as Station['depth']
    s.house.treasury = 5_000_000
    const next = turn(s, [expand(s)]).state
    const shown = officialDisplay(next, next.officials[official.id]!)
    expect(shown.cabinetCoverage).toBe(true)
    expect(shown.integrity).toBe(next.officials[official.id]!.integrity)
    expect(shown.agenda).toBe(next.officials[official.id]!.agenda)
  })

  it('täckningen krymper aldrig, och en täckning som scenariot redan gav behålls', () => {
    const s = createInitialState('indochina-slice', 'coverage-keep')
    s.house.stations[0]!.coverage = ['procurement', 'industry']
    s.house.stations[0]!.depth = 1
    s.house.treasury = 5_000_000
    const next = turn(s, [expand(s)]).state
    expect(next.house.stations[0]!.coverage).toEqual(expect.arrayContaining(['procurement', 'industry']))
  })

  it('militär täckning smalnar bedömningen av blockets generation (raceAssessment läser täckningen)', () => {
    const s = createInitialState('indochina-slice', 'coverage-assessment')
    s.house.staff.chiefSalesman = 0
    const st = s.house.stations[0]!
    st.depth = 3
    st.coverage = ['procurement']
    const without = raceAssessment(s, 'west', 'armour')
    st.coverage = coverageForDepth(3)
    const withCoverage = raceAssessment(s, 'west', 'armour')
    expect(withCoverage.high - withCoverage.low).toBeLessThanOrEqual(without.high - without.low)
  })
})

describe('REOPEN — en vilande station kan öppnas igen mot en kostnad', () => {
  const dormant = (seed: string): GameState => {
    const s = createInitialState('indochina-slice', seed)
    s.house.stations[0]!.status = 'dormant'
    s.house.stations[0]!.exposure = 40
    s.house.treasury = 5_000_000
    return s
  }
  const reopen = (s: GameState): PlayerAction => ({ type: 'INTEL', op: 'REOPEN', stationId: s.house.stations[0]!.id })

  it('godkänns bara för en vilande station', () => {
    const s = dormant('reopen-valid')
    expect(validateAction(s, s, reopen(s))).toEqual({ ok: true })
    s.house.stations[0]!.status = 'active'
    expect(validateAction(s, s, reopen(s))).toEqual({ ok: false, reason: 'station is not dormant' })
    s.house.stations[0]!.status = 'burned'
    expect(validateAction(s, s, reopen(s)).ok).toBe(false)
    expect(validateAction(s, s, { type: 'INTEL', op: 'REOPEN', stationId: 'nope' })).toEqual({ ok: false, reason: 'unknown station' })
  })

  it('förhandsvisningen visar kostnaden ur balance.json och ingen chans (lyckas alltid)', () => {
    const s = dormant('reopen-preview')
    expect(previewAction(s, reopen(s))).toMatchObject({ cost: B.intelReopenCost, successPct: null, successPctKnown: true })
  })

  it('stationen blir aktiv med sitt djup och sin täckning kvar, kassan dras, och exponeringen är den nedkylda', () => {
    const s = dormant('reopen-resolve')
    s.house.stations[0]!.depth = 3
    s.house.stations[0]!.coverage = coverageForDepth(3)
    const before = s.house.treasury
    const result = turn(s, [reopen(s)])
    const st = result.state.house.stations[0]!
    expect(st.status).toBe('active')
    expect(st.depth).toBe(3)
    expect(st.coverage).toEqual(coverageForDepth(3))
    expect(st.exposure).toBeLessThan(40) // en vilande station kyls av innan den öppnas — tiden vilande var inte förlorad
    expect(result.state.house.treasury).toBeLessThan(before)
    const ev = result.wire.find((e) => e.headline.includes('REOPENED'))!
    expect(ev.actorIsPlayer).toBe(true)
    expect(ev.delta.treasury).toBe(-B.intelReopenCost)
    expect(result.state.ledger.at(-1)!.expenses.intel).toBeGreaterThanOrEqual(B.intelReopenCost)
  })

  it('kostar en handling som alla andra verb, och en bränd station kan inte öppnas', () => {
    const s = dormant('reopen-points')
    s.house.actionPoints = 1
    const result = turn(s, [reopen(s), { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }])
    expect(result.rejected.map((r) => r.reason)).toContain('no executive actions remaining')
  })
})
