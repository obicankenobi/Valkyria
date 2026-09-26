// previewAction.test.ts — P78 (ETAPP7_TEKNISK_SPEC.md §7.4). Täcker cost/
// successPct/successPctKnown per verbgrupp, inklusive "Unknown"-exemplet
// ordagrant ur specen: "Motståndarens counterIntelligence utan station visas
// som Unknown."
import { describe, expect, it } from 'vitest'
import { previewAction } from '../src/previewAction.js'
import { createInitialState } from '../src/state.js'
import { officialId } from '../src/officials.js'
import balanceData from '../src/data/balance.json' with { type: 'json' }

const BALANCE = balanceData as unknown as {
  buildLineCost: number
  hireCost: number
  intelExpandCost: number
  intelRecruitCost: number
  intelCovertOpCost: number
  stageIncidentSuccessPct: number
}

describe('previewAction — kostnad', () => {
  it('BUILD_LINE: kostnaden är BALANCE.buildLineCost', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }).cost).toBe(BALANCE.buildLineCost)
  })

  it('HIRE: kostnaden är BALANCE.hireCost', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }).cost).toBe(BALANCE.hireCost)
  })

  it('TAKE_LOAN: ingen kostnad (inflöde), REPRIORITISE_RND: ingen kostnad', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } }).cost).toBeNull()
    expect(previewAction(state, { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'infantry' } }).cost).toBeNull()
  })

  it('REPAY: kostnaden är det begärda beloppet', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'INTERNAL', op: 'REPAY', payload: { amount: 42000 } }).cost).toBe(42000)
  })

  it('POLITICAL spend-baserade verb ekar tillbaka action.spend, FAVOUR har ingen kostnad ("kostar inga pengar")', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(
      previewAction(state, { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 30000 }).cost,
    ).toBe(30000)
    expect(
      previewAction(state, { type: 'POLITICAL', op: 'FAVOUR', officialId: officialId('rvn', 'procurement'), marginCost: 5000 })
        .cost,
    ).toBeNull()
  })

  it('EXPAND/RECRUIT/LEAK/SABOTAGE/TURN läser sina fasta INTEL-kostnader ur balance.json', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'INTEL', op: 'EXPAND', stationId: 'station-1' }).cost).toBe(BALANCE.intelExpandCost)
    expect(previewAction(state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'nlf' }).cost).toBe(BALANCE.intelRecruitCost)
    expect(previewAction(state, { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'brandt' }).cost).toBe(
      BALANCE.intelCovertOpCost,
    )
  })

  it('BROKER och RELEASE har ingen upfront-kostnad (se applyActions.ts:s egna kommentarer)', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, price: 1000 }).cost).toBeNull()
    expect(previewAction(state, { type: 'MARKET', op: 'RELEASE', commodity: 'oil', spend: 1000 }).cost).toBeNull()
  })
})

describe('previewAction — sannolikhet', () => {
  it('STAGE_INCIDENT: fast, global sannolikhet, alltid KÄND (inte gated av mål-counterIntelligence)', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'nlf', spend: 20000 })
    expect(p.successPct).toBe(BALANCE.stageIncidentSuccessPct)
    expect(p.successPctKnown).toBe(true)
  })

  it('BACK_CHANNEL/BRIBE/FUND_CAMPAIGN/INFLUENCE/ASSASSINATE: successPct null (lyckas alltid eller avvisas aldrig av rng)', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    expect(previewAction(state, { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 10000 }).successPct).toBeNull()
    expect(
      previewAction(state, { type: 'POLITICAL', op: 'BRIBE', officialId: officialId('rvn', 'procurement'), spend: 10000 }).successPct,
    ).toBeNull()
    expect(
      previewAction(state, {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 1000,
        direction: 'up',
        effect: { kind: 'publicSupport' },
      }).successPct,
    ).toBeNull()
    expect(
      previewAction(state, { type: 'POLITICAL', op: 'ASSASSINATE', officialId: officialId('rvn', 'procurement'), spend: 50000 })
        .successPct,
    ).toBeNull()
  })

  // §7.4, ordagrant: "Motståndarens counterIntelligence utan station visas
  // som Unknown." nlf/laos saknar en aktiv station vid partistart (bara
  // Saigon/rvn finns, se indochina-slice.json) — samma effectiveDepth-grind
  // som formationDisplay/officialDisplay redan använder.
  it('FUND_COUP mot ett land UTAN egen station visas som Unknown (successPctKnown false)', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'nlf', spend: 500000 })
    expect(p.successPctKnown).toBe(false)
  })

  it('FUND_COUP mot ett land MED egen station (rvn, Saigon) visar ett känt tal — samma formel som political.ts:s fundCoupSuccessPct', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend: 500000 })
    expect(p.successPctKnown).toBe(true)
    expect(p.successPct).not.toBeNull()
  })

  it('LEAK/SABOTAGE/TURN från en DJUP station (rvn, depth 1) visar ett känt tal', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'brandt' })
    expect(p.successPctKnown).toBe(true)
    expect(p.successPct).not.toBeNull()
  })

  it('LEAK från en NYREKRYTERAD station (depth 0) visas som Unknown — samma effectiveDepth-grind, oavsett att stationen är DIN egen', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    state.house.stations.push({
      id: 'station-shallow',
      city: 'TEST',
      nation: 'nlf',
      depth: 0,
      exposure: 0,
      coverage: ['procurement'],
      status: 'active',
    })
    const p = previewAction(state, { type: 'INTEL', op: 'LEAK', stationId: 'station-shallow', targetId: 'brandt' })
    expect(p.successPctKnown).toBe(false)
    expect(p.successPct).toBeNull()
  })

  it('okänd station ger successPct null och successPctKnown false, utan att kasta', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'INTEL', op: 'TURN', stationId: 'station-999', targetId: 'nobody' })
    expect(p.successPct).toBeNull()
    expect(p.successPctKnown).toBe(false)
  })
})

describe('previewAction — CRISIS', () => {
  it('ingen kostnad, ingen sannolikhet — avgörs av resolvePendingCrisis, inte av handlingen själv', () => {
    const state = createInitialState('indochina-slice', 'pa-seed')
    const p = previewAction(state, { type: 'CRISIS', choice: 'PUSH' })
    expect(p).toEqual({ cost: null, successPct: null, successPctKnown: true })
  })
})
