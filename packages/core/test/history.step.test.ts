// history.step.test.ts — P149 (ETAPP10_FORSLAG.md §9.2). Steget `history`: kvartalets händelser kommer in en gång, villkoren prövas, effekterna går genom befintliga
// funktioner med en WireEvent var (causeId history:<id>), krönikan får bara förstasidorna, brytaren historyEnabled stänger av allt.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { advanceHistory, eventsForQuarter, historyEventOf, quarterKey } from '../src/history.js'
import { createRng } from '../src/rng.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../src/types.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const B = balance as unknown as { historyEffects: Record<string, number> }

function ctxFor(state: GameState): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng('history', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function atQuarter(year: number, quarter: 1 | 2 | 3 | 4): GameState {
  const state = createInitialState('indochina-slice', 'history-seed')
  state.meta.year = year
  state.meta.quarter = quarter
  state.meta.turn = (year - 1964) * 4 + quarter - 1
  return state
}

describe('steget history (P149)', () => {
  it('ett kvartal utan händelser ger ingenting och lämnar GameState.history utelämnat', () => {
    const state = atQuarter(1964, 1)
    const { ctx, emitted } = ctxFor(state)
    advanceHistory(ctx)
    expect(emitted).toEqual([])
    expect(state.history).toBeUndefined()
  })

  it('en förstasida ger en rubrik med causeId history:<id>, en post i historiken, och händelsen kommer bara en gång', () => {
    const state = atQuarter(1964, 4)
    const { ctx, emitted } = ctxFor(state)
    advanceHistory(ctx)
    const china = emitted.find((e) => e.headline.includes('CHINA EXPLODES'))!
    expect(china.severity).toBe('headline')
    expect(china.scope).toBe('global')
    expect(china.causeId).toBe('history:china-bomb')
    expect(state.history!.occurred['china-bomb']).toEqual({ turn: state.meta.turn })
    const rows = emitted.length
    advanceHistory(ctx)
    expect(emitted.length).toBe(rows)
  })

  it('effekten går genom addDoomsday: Kinas prov lägger chinaTestDoomsday och rubriken har history:-causeId', () => {
    const state = atQuarter(1964, 4)
    const before = state.doomsday
    const { ctx, emitted } = ctxFor(state)
    advanceHistory(ctx)
    expect(state.doomsday).toBeCloseTo(before + B.historyEffects.chinaTestDoomsday!, 9)
    expect(emitted.some((e) => e.headline.startsWith('DOOMSDAY') && e.causeId === 'history:china-bomb')).toBe(true)
  })

  it('telex utan effekt: tre telexrader i 1964 Q4 men barrel-roll bara med en station i Laos', () => {
    const noStation = atQuarter(1964, 4)
    noStation.house.stations = []
    const a = ctxFor(noStation)
    advanceHistory(a.ctx)
    expect(a.emitted.some((e) => e.headline.includes('SECRET STRIKES OVER LAOS'))).toBe(false)
    expect(Object.keys(noStation.history!.occurred)).not.toContain('barrel-roll')

    const withStation = atQuarter(1964, 4)
    withStation.house.stations = [{ id: 's-laos', nation: 'laos', status: 'active', depth: 2, exposure: 0, coverage: ['military'] } as never]
    const b = ctxFor(withStation)
    advanceHistory(b.ctx)
    expect(b.emitted.some((e) => e.headline.includes('SECRET STRIKES OVER LAOS'))).toBe(true)
  })

  it('villkoret no-player-coup: Thiệu och Kỳ kommer inte om huset finansierat en kupp i RVN', () => {
    const coup = atQuarter(1965, 2)
    coup.factions.rvn!.coupAttempted = true
    const a = ctxFor(coup)
    advanceHistory(a.ctx)
    expect(Object.keys(coup.history?.occurred ?? {})).not.toContain('thieu-ky')
    const plain = atQuarter(1965, 2)
    const b = ctxFor(plain)
    advanceHistory(b.ctx)
    expect(Object.keys(plain.history!.occurred)).toContain('thieu-ky')
  })

  it('villkoret front-war: bombstoppet kräver en front i krig; i en vapenvila uteblir det', () => {
    const peace = atQuarter(1968, 4)
    for (const f of Object.values(peace.fronts)) f.status = 'ceasefire'
    advanceHistory(ctxFor(peace).ctx)
    expect(Object.keys(peace.history?.occurred ?? {})).not.toContain('bombing-halt')
    const war = atQuarter(1968, 4)
    const before = war.theatres.indochina!.heat
    advanceHistory(ctxFor(war).ctx)
    expect(Object.keys(war.history!.occurred)).toContain('bombing-halt')
    expect(war.theatres.indochina!.heat).toBeLessThanOrEqual(before)
  })

  it('Laoskuppen nollar Laos materielbehov det kvartalet; Rolling Thunder höjer behov och heat', () => {
    const laos = atQuarter(1964, 2)
    laos.factions.laos!.materielNeed.infantry = 50
    advanceHistory(ctxFor(laos).ctx)
    expect(Object.values(laos.factions.laos!.materielNeed).every((v) => v === 0)).toBe(true)

    const thunder = atQuarter(1965, 1)
    const needBefore = thunder.factions.rvn!.materielNeed.infantry
    const heatBefore = thunder.theatres.indochina!.heat
    advanceHistory(ctxFor(thunder).ctx)
    expect(thunder.factions.rvn!.materielNeed.infantry).toBeGreaterThan(needBefore)
    expect(thunder.theatres.indochina!.heat).toBeGreaterThan(heatBefore)
  })

  it('pundets värdesänkning höjer alla råvaruindex med poundCommodityPct', () => {
    const state = atQuarter(1967, 4)
    const before = { ...state.market.commodities }
    advanceHistory(ctxFor(state).ctx)
    for (const name of Object.keys(before) as (keyof typeof before)[]) {
      expect(state.market.commodities[name]).toBeCloseTo(before[name] * (1 + B.historyEffects.poundCommodityPct! / 100), 9)
    }
  })

  it('en förstasida hamnar i krönikan som kind history; effekterna och telexraderna gör det inte', () => {
    let state = createInitialState('indochina-slice', 'history-seed')
    for (let i = 0; i < 4; i++) state = resolveTurn(state, EMPTY).state // tur 0–3 → 1964 Q4 löses på tur 3
    const kinds = state.chronicle.filter((e) => e.kind === 'history')
    expect(kinds.map((e) => e.headline)).toContain('CHINA EXPLODES ITS FIRST ATOMIC BOMB')
    expect(kinds.every((e) => e.actorIsPlayer === false)).toBe(true)
    expect(state.chronicle.some((e) => e.kind === 'history' && e.headline.includes('KHRUSHCHEV'))).toBe(false)
  })

  it('brytaren historyEnabled 0 stänger av hela steget', async () => {
    const mod = await import('../src/history.js')
    expect(typeof mod.advanceHistory).toBe('function')
    // Brytaren läser balans-datan vid import; att den finns och är 1 i data är det som vaktas här — härnessen sätter den till 0 med sin laddningskrok.
    expect((balance as unknown as { historyEnabled: number }).historyEnabled).toBe(1)
  })

  it('historyEventOf känner igen en rubrik på deltat och på causeId-prefixet', () => {
    expect(historyEventOf('history:china-bomb', {})?.id).toBe('china-bomb')
    expect(historyEventOf(null, { 'history.laos-coup': 1 })?.id).toBe('laos-coup')
    expect(historyEventOf('test-1', {})).toBeNull()
  })

  it('eventsForQuarter ger kvartalets händelser i datans ordning', () => {
    expect(eventsForQuarter(1968, 1).map((e) => e.id)).toEqual(['f111k-cancelled', 'pueblo', 'johnson-not-running'])
    expect(eventsForQuarter(1966, 3)).toEqual([])
    expect(quarterKey(1964, 2)).toBe('1964-Q2')
  })
})
