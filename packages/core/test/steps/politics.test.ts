import { describe, expect, it } from 'vitest'
import { politics } from '../../src/resolve/steps/politics.js'
import { orders } from '../../src/resolve/steps/orders.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

// scenariodata (officials.json) ger flera tjänstemän tillräcklig standing (>= 60)
// redan från start, med relationToPlayer 0 (< 30) — de räknas alltså redan som
// "ohörsammade" i ett obehandlat createInitialState. Varje test som ska isolera
// EN tjänsteman måste därför uttryckligen hörsamma alla andra (relationToPlayer
// över tröskeln) innan den sätter upp sitt eget scenario.
function neutralizeAllOfficials(state: GameState): void {
  for (const official of Object.values(state.officials)) {
    official.relationToPlayer = 100
  }
}

// Gör en tjänsteman "ohörsammad": tillräcklig standing, för låg relationToPlayer,
// och turen framflyttad förbi policyDecisionMinTurn-grinden (annars kan ingen
// tjänsteman någonsin fatta ett beslut, se politics.ts:s egen kommentar).
function ignore(state: GameState, officialId: string): void {
  const official = state.officials[officialId]!
  official.standing = balance.policyDecisionStandingThreshold
  official.relationToPlayer = balance.policyDecisionRelationThreshold - 1
  state.meta.turn = Math.max(state.meta.turn, balance.policyDecisionMinTurn)
}

describe('politics (isolerat steg, ETAPP5_TEKNISK_SPEC.md avsnitt 3.4)', () => {
  it('(P57 klart-när) en ohörsammad agenda leder till ett PolicyDecision — hasIssuedPolicyDecision sätts, en headline emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-finance') // AUSTERITY -> PRICE_CAP

    const { ctx, emitted } = makeCtx(state, 'politics-seed')
    politics(ctx)

    expect(state.officials['official-rvn-finance']!.hasIssuedPolicyDecision).toBe(true)
    expect(emitted.some((e) => e.headline.includes('PRICE CAP'))).toBe(true)
  })

  it('en tjänsteman med för låg standing fattar inget beslut', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    const official = state.officials['official-rvn-finance']!
    official.standing = balance.policyDecisionStandingThreshold - 1
    official.relationToPlayer = balance.policyDecisionRelationThreshold - 1
    state.meta.turn = balance.policyDecisionMinTurn

    const { ctx, emitted } = makeCtx(state, 'politics-seed')
    politics(ctx)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(emitted).toEqual([])
  })

  it('en tjänsteman som INTE är ohörsammad (relationToPlayer över tröskeln) fattar inget beslut', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    const official = state.officials['official-rvn-finance']!
    official.standing = balance.policyDecisionStandingThreshold
    official.relationToPlayer = balance.policyDecisionRelationThreshold
    state.meta.turn = balance.policyDecisionMinTurn

    const { ctx, emitted } = makeCtx(state, 'politics-seed')
    politics(ctx)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(emitted).toEqual([])
  })

  it('innan policyDecisionMinTurn fattar ingen tjänsteman något beslut, även om hon annars kvalificerar', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    const official = state.officials['official-rvn-finance']!
    official.standing = balance.policyDecisionStandingThreshold
    official.relationToPlayer = balance.policyDecisionRelationThreshold - 1
    state.meta.turn = balance.policyDecisionMinTurn - 1

    const { ctx, emitted } = makeCtx(state, 'politics-seed')
    politics(ctx)

    expect(official.hasIssuedPolicyDecision).toBe(false)
    expect(emitted).toEqual([])
  })

  it('en tjänsteman som redan fattat ett beslut fattar inget nytt (fire-once-ratchet)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-finance')
    state.officials['official-rvn-finance']!.hasIssuedPolicyDecision = true
    const before = state.factions['rvn']!.trueBudgetCapFactor

    const { ctx, emitted } = makeCtx(state, 'politics-seed')
    politics(ctx)

    expect(state.factions['rvn']!.trueBudgetCapFactor).toBe(before)
    expect(emitted).toEqual([])
  })

  it('(P57 klart-när) EMBARGO stoppar faktionens ordrar via den redan byggda kedjan (orders.ts)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-interior') // SELF_ENRICHMENT skulle annars ge PREFERRED_SUPPLIER — sätts om nedan
    state.officials['official-rvn-interior']!.agenda = 'NON_ALIGNMENT' // -> EMBARGO

    politics(makeCtx(state, 'politics-seed').ctx)
    expect(state.factions['rvn']!.embargoed).toBe(true)

    for (const category of Object.keys(state.factions['rvn']!.materielNeed) as (keyof GameState['factions'][string]['materielNeed'])[]) {
      state.factions['rvn']!.materielNeed[category] = 100 // långt över orderTriggerThreshold
    }
    orders(makeCtx(state, 'orders-seed').ctx)

    expect(state.market.openOrders.filter((o) => o.buyerId === 'rvn')).toEqual([])
  })

  it('PRICE_CAP sätter Faction.trueBudgetCapFactor till policyPriceCapFactor', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-finance') // AUSTERITY

    politics(makeCtx(state, 'politics-seed').ctx)

    expect(state.factions['rvn']!.trueBudgetCapFactor).toBe(balance.policyPriceCapFactor)
  })

  it('TENDER_REFORM sätter Faction.weightsOverride till tenderReformWeights', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-procurement') // REARM

    politics(makeCtx(state, 'politics-seed').ctx)

    expect(state.factions['rvn']!.weightsOverride).toEqual(balance.tenderReformWeights)
  })

  it('LICENCE_REVIEW höjer exposure på husets aktiva station i landet, ingen effekt utan station', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-defence') // MODERNISE -> LICENCE_REVIEW
    // Scenariots enda station (state.ts:s uppresning) ligger redan i 'rvn'.
    const station = state.house.stations.find((s) => s.nation === 'rvn' && s.status === 'active')!
    const before = station.exposure

    politics(makeCtx(state, 'politics-seed').ctx)

    expect(station.exposure).toBe(before + balance.licenceReviewExposurePenalty)
  })

  it('LICENCE_REVIEW gör ingenting när landet inte har någon aktiv station (samma princip som misattributionExposurePenalty)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-nlf-interior') // MODERNISE -> LICENCE_REVIEW; NLF har ingen station i indochina-slice
    const stationsBefore = JSON.parse(JSON.stringify(state.house.stations)) as typeof state.house.stations

    politics(makeCtx(state, 'politics-seed').ctx)

    expect(state.house.stations).toEqual(stationsBefore)
  })

  it('(P57 klart-när) PREFERRED_SUPPLIER kan gå till en rival — faction.preferredSupplier sätts till ett känt RivalId', () => {
    const state = createInitialState('indochina-slice', 'seed')
    neutralizeAllOfficials(state)
    ignore(state, 'official-rvn-interior') // SELF_ENRICHMENT

    politics(makeCtx(state, 'politics-seed').ctx)

    const preferred = state.factions['rvn']!.preferredSupplier
    expect(preferred).not.toBe('player')
    expect(Object.keys(state.rivals)).toContain(preferred)
  })
})
