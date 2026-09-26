// wireAnchor.test.ts — P80 (ETAPP7_TEKNISK_SPEC.md §8/§13). Verifierar
// routningsregeln (wireAnchor.ts:s egen kommentar) mot RIKTIGA subjectId/
// scope-kombinationer, kopierade ordagrant från de faktiska emit()-anropen i
// packages/core/src/resolve/ (upkeep.ts, applyActions.ts, political.ts,
// deliveries.ts, rivals.ts) — inte gissade.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import type { WireEvent } from '@seventh-front/core'
import { anchorLabel, wireAnchor } from '../src/wireAnchor.js'

const state = createInitialState('indochina-slice', 'wire-anchor-seed')

function event(partial: Partial<WireEvent> & Pick<WireEvent, 'scope' | 'subjectId'>): WireEvent {
  return {
    id: 't-0',
    turn: 0,
    severity: 'ticker',
    headline: 'TEST',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    ...partial,
  }
}

describe('wireAnchor', () => {
  it('subjectId null → hud, oavsett scope', () => {
    expect(wireAnchor(state, event({ scope: 'house', subjectId: null }))).toEqual({ kind: 'hud', id: 'hud' })
    expect(wireAnchor(state, event({ scope: 'global', subjectId: null }))).toEqual({ kind: 'hud', id: 'hud' })
  })

  it('subjectId är ett FrontId → sector, oavsett scope (front.ts/deliveries.ts/engagement.ts-mönstret)', () => {
    expect(wireAnchor(state, event({ scope: 'front', subjectId: 'front-1' }))).toEqual({
      kind: 'sector',
      id: 'front-1',
    })
  })

  it('genuint fynd: adjustFrontOpponentRelations (political.ts) emittar scope "faction" med front.id som subjectId — routas ändå till sector', () => {
    expect(wireAnchor(state, event({ scope: 'faction', subjectId: 'front-1' }))).toEqual({
      kind: 'sector',
      id: 'front-1',
    })
  })

  it('genuint fynd: heat.ts/doomsday.ts emittar HEAT-händelser med subjectId = theatre.id (en tredje id-rymd) — routas till sector', () => {
    expect(state.theatres['indochina']).toBeTruthy()
    expect(state.factions['indochina']).toBeUndefined()
    expect(wireAnchor(state, event({ scope: 'market', subjectId: 'indochina' }))).toEqual({
      kind: 'sector',
      id: 'indochina',
    })
  })

  it('dokumenterad kollision: teatern "laos" delar sträng med faktionen "laos" — faktionstolkningen prioriteras (landets, mycket vanligare, händelser väger tyngre än teaterns sällsynta HEAT-ticker)', () => {
    expect(state.theatres['laos']).toBeTruthy()
    expect(state.factions['laos']).toBeTruthy()
    expect(wireAnchor(state, event({ scope: 'market', subjectId: 'laos' }))).toEqual({ kind: 'country', id: 'laos' })
  })

  it('scope "house" + subjectId = en nations kod DÄR huset har en station → station, id = stationens id (upkeep.ts/applyActions.ts-mönstret)', () => {
    const stationInRvn = state.house.stations.find((s) => s.nation === 'rvn')!
    expect(wireAnchor(state, event({ scope: 'house', subjectId: 'rvn' }))).toEqual({
      kind: 'station',
      id: stationInRvn.id,
    })
  })

  it('scope "house" + subjectId = en nations kod UTAN egen station → country (deliveries.ts:s köparnotiser)', () => {
    expect(state.house.stations.some((s) => s.nation === 'laos')).toBe(false)
    expect(wireAnchor(state, event({ scope: 'house', subjectId: 'laos' }))).toEqual({ kind: 'country', id: 'laos' })
  })

  it('scope "faction" + subjectId = FactionId → country (applyActions.ts:s counterIntelligence-mönstret)', () => {
    expect(wireAnchor(state, event({ scope: 'faction', subjectId: 'nlf' }))).toEqual({ kind: 'country', id: 'nlf' })
  })

  it('scope "market" + subjectId = FactionId (contract.buyerId) → country (deliveries.ts/orders.ts-mönstret)', () => {
    expect(wireAnchor(state, event({ scope: 'market', subjectId: 'rvn' }))).toEqual({ kind: 'country', id: 'rvn' })
  })

  it('känd, dokumenterad lucka: subjectId = ett RivalId (rivals.ts) → hud, ingen kind-variant för rivalhus finns än', () => {
    const rivalId = Object.keys(state.rivals)[0]!
    expect(wireAnchor(state, event({ scope: 'market', subjectId: rivalId }))).toEqual({ kind: 'hud', id: 'hud' })
  })

  it('okänt subjectId (varken front, faktion eller station) → hud, ingen krasch', () => {
    expect(wireAnchor(state, event({ scope: 'house', subjectId: 'not-a-real-id' }))).toEqual({
      kind: 'hud',
      id: 'hud',
    })
  })
})

describe('anchorLabel', () => {
  it('hud → null (ingen badge att visa)', () => {
    expect(anchorLabel(state, { kind: 'hud', id: 'hud' })).toBeNull()
  })

  it('country → faktionens namn, versaler', () => {
    expect(anchorLabel(state, { kind: 'country', id: 'rvn' })).toBe(state.factions['rvn']!.name.toUpperCase())
  })

  it('station → stationens stad, versaler', () => {
    const station = state.house.stations.find((s) => s.nation === 'rvn')!
    expect(anchorLabel(state, { kind: 'station', id: station.id })).toBe(station.city.toUpperCase())
  })

  it('sector med ett front-id → frontens TEATERS namn (Front har inget eget namn)', () => {
    const front = state.fronts['front-1']!
    const theatre = state.theatres[front.theatreId]!
    expect(anchorLabel(state, { kind: 'sector', id: 'front-1' })).toBe(theatre.name.toUpperCase())
  })

  it('sector med ett direkt teater-id → teaterns eget namn', () => {
    expect(anchorLabel(state, { kind: 'sector', id: 'indochina' })).toBe(state.theatres['indochina']!.name.toUpperCase())
  })
})
