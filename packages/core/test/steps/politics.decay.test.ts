// politics.decay.test.ts — P99c (ägarbeslut 2026-09-29, alternativ A i frågan efter P99b): en
// tjänstemans relationToPlayer FÖRFALLER över tid om spelaren inte uppvaktar henne. Efter P99b
// fanns ingenting som sänkte relationen, så P57:s tryck (varning → PolicyDecision) var i praktiken
// avstängt i vanligt spel. Uppvaktning = ett BRIBE, FAVOUR eller lyckat TURN med verklig relationsvinst (Official.lastCourtedTurn).
import { describe, expect, it } from 'vitest'
import { politics } from '../../src/resolve/steps/politics.js'
import { resolveTurn } from '../../src/resolve/index.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const GRACE = balance.officialRelationGraceTurns
const DECAY = balance.officialRelationDecayPerTurn
const FLOOR = balance.officialRelationDecayFloor
const THRESHOLD = balance.policyDecisionRelationThreshold

function step(state: GameState): Omit<WireEvent, 'id' | 'turn'>[] {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng('politics-decay', 0),
    emit: (e) => {
      emitted.push(e)
      return `w-${seq++}`
    },
    rejected: [],
  }
  politics(ctx)
  return emitted
}

const ID = 'official-rvn-procurement'

// Ingen tjänsteman kan utfärda ett beslut under de här testerna (låg standing) — bara förfallet prövas.
function calm(state: GameState): void {
  for (const official of Object.values(state.officials)) official.standing = 0
}

describe('förfall över tid', () => {
  it('startar en spelare som aldrig uppvaktat: relationen står still under hela tiden GRACE, sedan sjunker den DECAY per tur', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    const start = state.officials[ID]!.relationToPlayer
    for (let turn = 1; turn <= GRACE; turn++) {
      state.meta.turn = turn
      step(state)
      expect(state.officials[ID]!.relationToPlayer).toBe(start)
    }
    state.meta.turn = GRACE + 1
    step(state)
    expect(state.officials[ID]!.relationToPlayer).toBe(start - DECAY)
    state.meta.turn = GRACE + 2
    step(state)
    expect(state.officials[ID]!.relationToPlayer).toBe(start - 2 * DECAY)
  })

  it('golvet håller: relationen sjunker aldrig under officialRelationDecayFloor', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    for (let turn = 1; turn <= 60; turn++) {
      state.meta.turn = turn
      step(state)
    }
    expect(state.officials[ID]!.relationToPlayer).toBe(FLOOR)
  })

  it('uppvaktning nollställer nedräkningen: förfallet börjar först GRACE turer efter senaste uppvaktningen', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    state.officials[ID]!.lastCourtedTurn = 10
    state.meta.turn = 10 + GRACE
    step(state)
    expect(state.officials[ID]!.relationToPlayer).toBe(THRESHOLD)
    state.meta.turn = 10 + GRACE + 1
    step(state)
    expect(state.officials[ID]!.relationToPlayer).toBe(THRESHOLD - DECAY)
  })

  it('bara aktiva tjänstemän förfaller', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    state.officials[ID]!.status = 'dead'
    state.meta.turn = GRACE + 5
    step(state)
    expect(state.officials[ID]!.relationToPlayer).toBe(THRESHOLD)
  })

  it('ett sparat parti från före P99c (lastCourtedTurn saknas) räknas som aldrig uppvaktad, kraschar inte', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    delete (state.officials[ID] as unknown as { lastCourtedTurn?: number }).lastCourtedTurn
    state.meta.turn = GRACE + 1
    expect(() => step(state)).not.toThrow()
    expect(state.officials[ID]!.relationToPlayer).toBe(THRESHOLD - DECAY)
  })
})

describe('förfallet syns (hård regel 4)', () => {
  it('ett ticker-event per faktion vars tjänstemän förföll, med varje tjänstemans faktiska delta', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    state.meta.turn = GRACE + 1
    const emitted = step(state).filter((e) => e.severity === 'ticker')

    const factions = new Set(Object.values(state.officials).map((o) => o.factionId))
    expect(emitted).toHaveLength(factions.size)
    for (const event of emitted) {
      expect(event.scope).toBe('faction')
      expect(event.actorIsPlayer).toBe(false)
      expect(factions.has(event.subjectId as never)).toBe(true)
      const keys = Object.keys(event.delta)
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) expect(event.delta[key]).toBe(-DECAY)
    }
  })

  it('inget event när ingenting förföll (inom GRACE, eller vid golvet)', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    calm(state)
    state.meta.turn = GRACE
    expect(step(state)).toEqual([])
    for (const official of Object.values(state.officials)) official.relationToPlayer = FLOOR
    state.meta.turn = GRACE + 10
    expect(step(state)).toEqual([])
  })
})

describe('förfall → varning → beslut (P57 fungerar igen)', () => {
  it('sjunker relationen under tröskeln varnas det SAMMA tur, beslutet kommer turen efter', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    for (const official of Object.values(state.officials)) official.relationToPlayer = 100
    const official = state.officials['official-nlf-defence']!
    official.standing = balance.policyDecisionStandingThreshold
    official.relationToPlayer = THRESHOLD // precis på gränsen
    state.meta.turn = Math.max(balance.policyDecisionMinTurn, GRACE + 1)

    const first = step(state)
    expect(official.relationToPlayer).toBe(THRESHOLD - DECAY)
    expect(first.some((e) => e.headline.includes('IS PREPARING EMBARGO'))).toBe(true)
    expect(official.hasIssuedPolicyDecision).toBe(false)

    state.meta.turn += 1
    const second = step(state)
    expect(second.some((e) => e.headline.includes('ISSUES EMBARGO'))).toBe(true)
    expect(state.factions['nlf']!.embargoed).toBe(true)
  })

  it('en uppvaktning mellan varning och beslut avvärjer beslutet (relationen höjd ≥ tröskeln)', () => {
    const state = createInitialState('indochina-slice', 'decay-seed')
    for (const official of Object.values(state.officials)) official.relationToPlayer = 100
    const official = state.officials['official-nlf-defence']!
    official.standing = balance.policyDecisionStandingThreshold
    official.relationToPlayer = THRESHOLD
    state.meta.turn = Math.max(balance.policyDecisionMinTurn, GRACE + 1)
    step(state) // förfall + varning

    official.relationToPlayer = THRESHOLD + DECAY + 5
    official.lastCourtedTurn = state.meta.turn
    state.meta.turn += 1
    step(state)
    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(state.factions['nlf']!.embargoed).toBe(false)
  })
})

describe('vad som räknas som uppvaktning (hela resolveTurn)', () => {
  function courted(action: TurnSubmission['actions'][number], turn = 3): GameState {
    const state = createInitialState('indochina-slice', 'court-seed')
    state.meta.turn = turn
    state.house.treasury = 5_000_000
    const result = resolveTurn(state, { ...EMPTY, actions: [action] })
    return result.state
  }

  it('BRIBE stämplar lastCourtedTurn', () => {
    const next = courted({ type: 'POLITICAL', op: 'BRIBE', officialId: ID, spend: 20_000 })
    expect(next.officials[ID]!.lastCourtedTurn).toBe(3)
  })

  it('FAVOUR stämplar lastCourtedTurn', () => {
    const next = courted({ type: 'POLITICAL', op: 'FAVOUR', officialId: ID, marginCost: 5_000 })
    expect(next.officials[ID]!.lastCourtedTurn).toBe(3)
  })

  it('ett lyckat TURN stämplar lastCourtedTurn (ett misslyckat gör det inte)', () => {
    let stamped = 0
    let unstamped = 0
    for (let i = 0; i < 40; i++) {
      const state = createInitialState('indochina-slice', `turn-seed-${i}`)
      state.meta.turn = 3
      state.house.treasury = 5_000_000
      const station = state.house.stations.find((st) => st.nation === 'rvn')
      if (!station) throw new Error('startstation i rvn saknas')
      const result = resolveTurn(state, {
        ...EMPTY,
        actions: [{ type: 'INTEL', op: 'TURN', stationId: station.id, targetId: ID }],
      })
      const official = result.state.officials[ID]!
      if (official.relationToPlayer > THRESHOLD) {
        expect(official.lastCourtedTurn).toBe(3)
        stamped++
      } else {
        expect(official.lastCourtedTurn).toBe(0)
        unstamped++
      }
    }
    expect(stamped).toBeGreaterThan(0)
    expect(stamped + unstamped).toBe(40)
  })

  it('en FAVOUR utan effekt (marginCost 0 → ingen relationsvinst) nollställer INTE förfallet', () => {
    const next = courted({ type: 'POLITICAL', op: 'FAVOUR', officialId: ID, marginCost: 0 })
    expect(next.officials[ID]!.lastCourtedTurn).toBe(0)
  })

  it('FUND_CAMPAIGN och andras tjänstemän räknas INTE — bara den uppvaktade tjänstemannen stämplas', () => {
    const next = courted({ type: 'POLITICAL', op: 'BRIBE', officialId: ID, spend: 20_000 })
    const other = Object.values(next.officials).find((o) => o.id !== ID)!
    expect(other.lastCourtedTurn).toBe(0)
    const campaign = courted({ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: ID, spend: 20_000 })
    expect(campaign.officials[ID]!.lastCourtedTurn).toBe(0)
  })
})
