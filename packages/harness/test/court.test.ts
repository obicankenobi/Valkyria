// court.test.ts — P99c: botarnas uppvaktning av tjänstemän som annars skulle bli ohörsammade.
import { describe, expect, it } from 'vitest'
import { BOT_BALANCE, createInitialState } from '@seventh-front/core'
import type { PlayerAction } from '@seventh-front/core'
import { courtOfficialAtRisk } from '../src/policies.js'

const GRACE = BOT_BALANCE.officialRelationGraceTurns
const THRESHOLD = BOT_BALANCE.policyDecisionRelationThreshold
const DECAY = BOT_BALANCE.officialRelationDecayPerTurn

function fresh() {
  const state = createInitialState('indochina-slice', 'court-bot')
  for (const official of Object.values(state.officials)) official.standing = 0 // ingen är i riskzonen
  return state
}

function run(state: ReturnType<typeof fresh>): PlayerAction[] {
  const actions: PlayerAction[] = []
  courtOfficialAtRisk(state, actions)
  return actions
}

describe('courtOfficialAtRisk', () => {
  it('gör ingenting när ingen tjänsteman med tillräcklig standing närmar sig förfall', () => {
    const state = fresh()
    state.officials['official-nlf-defence']!.standing = 80
    state.meta.turn = 2
    expect(run(state)).toEqual([])
  })

  it('uppvaktar en tjänsteman med hög standing turen innan förfallet börjar, med en FAVOUR som räcker en hel cykel', () => {
    const state = fresh()
    const official = state.officials['official-nlf-defence']!
    official.standing = BOT_BALANCE.policyDecisionStandingThreshold
    state.meta.turn = GRACE - 1
    const actions = run(state)
    expect(actions).toHaveLength(1)
    const action = actions[0]!
    expect(action).toMatchObject({ type: 'POLITICAL', op: 'FAVOUR', officialId: official.id })
    const gain = (action as { marginCost: number }).marginCost / BOT_BALANCE.favourRelationCostPerPoint
    expect(official.relationToPlayer + gain).toBeGreaterThanOrEqual(THRESHOLD + DECAY * GRACE)
  })

  it('väljer den med lägst relation, och bara EN per tur (handlingspoängen är knappa)', () => {
    const state = fresh()
    for (const id of ['official-nlf-defence', 'official-rvn-procurement']) state.officials[id]!.standing = 80
    state.officials['official-nlf-defence']!.relationToPlayer = 34
    state.officials['official-rvn-procurement']!.relationToPlayer = 31
    state.meta.turn = GRACE
    const actions = run(state)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ officialId: 'official-rvn-procurement' })
  })

  it('hoppar över tjänstemän med låg standing, redan utfärdat beslut, eller som inte är aktiva', () => {
    const state = fresh()
    const official = state.officials['official-nlf-defence']!
    state.meta.turn = GRACE + 3
    official.standing = BOT_BALANCE.policyDecisionStandingThreshold - 1
    expect(run(state)).toEqual([])
    official.standing = 90
    official.hasIssuedPolicyDecision = true
    expect(run(state)).toEqual([])
    official.hasIssuedPolicyDecision = false
    official.status = 'dead'
    expect(run(state)).toEqual([])
  })

  it('en nyss uppvaktad tjänsteman lämnas i fred', () => {
    const state = fresh()
    const official = state.officials['official-nlf-defence']!
    official.standing = 90
    official.lastCourtedTurn = 10
    state.meta.turn = 10 + GRACE - 2
    expect(run(state)).toEqual([])
  })
})
