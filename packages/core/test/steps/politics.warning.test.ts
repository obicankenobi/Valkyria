// politics.warning.test.ts — P99b (ägarbeslut 2026-09-29, RAPPORT3_GRANSKNING.md §1/§5).
// A: Official.relationToPlayer startar på policyDecisionRelationThreshold (30) i stället för 0 —
//    "ohörsammad" betyder att spelaren gjort något som sänkt relationen, inte att spelaren ännu inte
//    hunnit agera. B: en varning en tur innan ett beslut ("ingen förlust utan en varning i THE WIRE
//    minst en tur innan").
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@seventh-front/harness/dist/policies.js'
import type { Policy } from '@seventh-front/harness/dist/policies.js'
import { politics } from '../../src/resolve/steps/politics.js'
import { resolveTurn } from '../../src/resolve/index.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const THRESHOLD = balance.policyDecisionRelationThreshold

function step(state: GameState): Omit<WireEvent, 'id' | 'turn'>[] {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng('politics-warning', 0),
    emit: (e) => {
      emitted.push(e)
      return `w-${seq++}`
    },
    rejected: [],
  }
  politics(ctx)
  return emitted
}

// Alla andra hörsammade, så bara EN tjänsteman (nlf defence, NON_ALIGNMENT → EMBARGO) prövas.
function isolate(state: GameState, id = 'official-nlf-defence'): void {
  for (const official of Object.values(state.officials)) official.relationToPlayer = 100
  const official = state.officials[id]!
  official.standing = balance.policyDecisionStandingThreshold
  official.relationToPlayer = THRESHOLD - 1
  state.meta.turn = balance.policyDecisionMinTurn
}

describe('A — startvärdet', () => {
  it('varje tjänsteman startar på policyDecisionRelationThreshold, läst ur balance.json', () => {
    const state = createInitialState('indochina-slice', 'start-seed')
    const officials = Object.values(state.officials)
    expect(officials.length).toBeGreaterThan(0)
    for (const official of officials) expect(official.relationToPlayer).toBe(THRESHOLD)
    expect(THRESHOLD).toBe(30)
  })

  it('en tjänsteman på startvärdet är "hörsammad": inget beslut och ingen varning, oavsett tur', () => {
    const state = createInitialState('indochina-slice', 'start-seed')
    for (const turn of [balance.policyDecisionMinTurn, 6, 12, 19]) {
      state.meta.turn = turn
      expect(step(state)).toEqual([])
    }
    expect(Object.values(state.officials).every((o) => !o.hasIssuedPolicyDecision)).toBe(true)
  })
})

describe('B — varning turen innan', () => {
  it('första turen villkoren gäller varnas det (headline, scope faction, subjectId faktionen) men INGET beslut utfärdas', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    const official = state.officials['official-nlf-defence']!

    const emitted = step(state)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(state.factions['nlf']!.embargoed).toBe(false)
    expect(emitted).toHaveLength(1)
    const warning = emitted[0]!
    expect(warning.severity).toBe('headline')
    expect(warning.scope).toBe('faction')
    expect(warning.subjectId).toBe('nlf')
    expect(warning.actorIsPlayer).toBe(false)
  })

  it('varningen namnger tjänstemannen och beslutet och vad som krävs (relation ≥ tröskeln) — men avslöjar inte integrity', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    const official = state.officials['official-nlf-defence']!
    official.integrity = 73 // ett igenkännbart tal som aldrig får läcka

    const text = step(state)[0]!.headline
    expect(text).toContain(official.name.toUpperCase())
    expect(text).toContain('IS PREPARING EMBARGO')
    expect(text).toContain(String(THRESHOLD))
    expect(text).not.toContain('73')
    expect(text.toLowerCase()).not.toContain('integrity')
  })

  it('varningen är läsbar utan station: den beror inte på underrättelse', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    state.house.stations = []
    state.house.staff.chiefSalesman = 10
    expect(step(state)[0]!.headline).toContain('IS PREPARING EMBARGO')
  })

  it('turen efter varningen utfärdas beslutet, om villkoren fortfarande gäller — och ingen andra varning', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    step(state) // varning
    state.meta.turn += 1
    const emitted = step(state)

    expect(state.officials['official-nlf-defence']!.hasIssuedPolicyDecision).toBe(true)
    expect(state.factions['nlf']!.embargoed).toBe(true)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.headline).toContain('ISSUES EMBARGO')
    expect(emitted.some((e) => e.headline.includes('IS PREPARING'))).toBe(false)
  })

  it('höjs tjänstemannen till ≥ 30 mellan varning och beslut utfärdas INGET beslut, och det syns att det avvärjdes', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    const official = state.officials['official-nlf-defence']!
    step(state) // varning
    official.relationToPlayer = THRESHOLD // spelaren agerade
    state.meta.turn += 1
    const emitted = step(state)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(state.factions['nlf']!.embargoed).toBe(false)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.severity).toBe('ticker')
    expect(emitted[0]!.headline).toContain('EMBARGO')
    expect(emitted[0]!.headline).toMatch(/RESTORED|AVERTED/)
  })

  it('sjunker relationen igen efter en avvärjd varning kommer en NY varning först, inte ett direkt beslut', () => {
    const state = createInitialState('indochina-slice', 'warn-seed')
    isolate(state)
    const official = state.officials['official-nlf-defence']!
    step(state)
    official.relationToPlayer = THRESHOLD
    state.meta.turn += 1
    step(state) // avvärjd
    official.relationToPlayer = THRESHOLD - 5
    state.meta.turn += 1
    const emitted = step(state)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.headline).toContain('IS PREPARING EMBARGO')
  })

  it('varningen kommer inte före policyDecisionMinTurn, och inte för en tjänsteman med för låg standing', () => {
    const early = createInitialState('indochina-slice', 'warn-seed')
    isolate(early)
    early.meta.turn = balance.policyDecisionMinTurn - 1
    expect(step(early)).toEqual([])

    const weak = createInitialState('indochina-slice', 'warn-seed')
    isolate(weak)
    weak.officials['official-nlf-defence']!.standing = balance.policyDecisionStandingThreshold - 1
    expect(step(weak)).toEqual([])
  })

  it('genom en hel resolveTurn: relation sänkt tur 3 → varning på tur 4, beslut på tur 5', () => {
    let state = createInitialState('indochina-slice', 'warn-full-seed')
    const passive = POLICIES.passive as Policy
    const events: { turn: number; headline: string }[] = []
    for (let t = 0; t < 7; t++) {
      // resolveTurn klonar tillståndet — mutera det AKTUELLA, inte en referens från starten.
      if (state.meta.turn === 3) state.officials['official-nlf-defence']!.relationToPlayer = THRESHOLD - 1 // spelaren har (på något sätt) tappat henne
      const result = resolveTurn(state, passive(state))
      for (const e of result.wire) events.push({ turn: state.meta.turn, headline: e.headline })
      state = result.state
    }
    const warned = events.find((e) => e.headline.includes('IS PREPARING EMBARGO'))
    const issued = events.find((e) => e.headline.includes('ISSUES EMBARGO'))
    expect(warned?.turn).toBe(balance.policyDecisionMinTurn)
    expect(issued?.turn).toBe(balance.policyDecisionMinTurn + 1)
  })
})

describe('utan spelaråtgärd utfärdas inga policybeslut under ett helt parti', () => {
  it('passive-boten (ingen åtgärd alls): 20 turer, noll beslut, noll varningar, inget embargo', () => {
    const passive = POLICIES.passive as Policy
    for (const seed of ['nopolicy-1', 'nopolicy-2', 'nopolicy-3']) {
      let state = createInitialState('indochina-slice', seed)
      const headlines: string[] = []
      for (let t = 0; t < 21 && state.status.kind !== 'ended'; t++) {
        const result = resolveTurn(state, passive(state))
        headlines.push(...result.wire.map((e) => e.headline))
        state = result.state
      }
      expect(headlines.filter((h) => / ISSUES (EMBARGO|PRICE CAP|TENDER REFORM|LICENCE REVIEW|PREFERRED SUPPLIER)/.test(h))).toEqual([])
      expect(headlines.filter((h) => h.includes('IS PREPARING'))).toEqual([])
      expect(Object.values(state.factions).some((f) => f.embargoed)).toBe(false)
    }
  })
})
