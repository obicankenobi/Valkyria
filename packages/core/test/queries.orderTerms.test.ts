// queries.orderTerms.test.ts — P99 (ETAPP8_FORSLAG.md §4.2, skyddsräcke 4): villkoren som
// ordermappen visar. Förskottets procent är ett villkor i affären och syns alltid; köparens
// kreditstämpel (A/B/C) och faktorerna bakom förskottet grindas genom underrättelse — samma
// effectiveDepth-grind som formationDisplay: utan station "?", inga faktorer.
import { describe, expect, it } from 'vitest'
import { advanceAmount, computeAdvancePct, createInitialState, effectiveDepth, orderTerms } from '../src/index.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { GameState, Order } from '../src/index.js'

const B = balance as unknown as { advanceCoverageFull: number; orderTriggerThreshold: Record<string, number> }

function orderFor(patch: Partial<Order> = {}): Order {
  return {
    id: 'order-t',
    buyerId: 'rvn',
    productId: 'm1_rifle', // infantry
    quantity: 100,
    statedBudget: 1,
    trueBudget: 1,
    referencePrice: 1_000_000,
    requiredDeliveryTurns: 3,
    expiresTurn: 5,
    competingRivals: [],
    weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'SCRIPTED' },
    frontId: null,
    advancePct: 27,
    ...patch,
  }
}

function withStation(state: GameState, depth: 0 | 1 | 2 | 3 | 4 | 5): void {
  const station = state.house.stations.find((s) => s.nation === 'rvn')!
  station.depth = depth
  station.status = 'active'
}
function withoutStation(state: GameState): void {
  state.house.stations = state.house.stations.filter((s) => s.nation !== 'rvn')
  state.house.staff.chiefSalesman = 50
}

describe('advanceAmount (en formel för bidding.ts och budformuläret)', () => {
  it('är round(pris × procent / 100) — samma avrundning som bidding.ts betalar ut', () => {
    expect(advanceAmount(1_500_000, 30)).toBe(450_000)
    expect(advanceAmount(1_500_000, 13)).toBe(Math.round(1_500_000 * 0.13))
    expect(advanceAmount(999_999, 0)).toBe(0)
    expect(Number.isInteger(advanceAmount(1_234_567, 17))).toBe(true)
  })
})

describe('orderTerms (P99)', () => {
  it('förskottets procent är alltid känd — den är ett villkor i affären, inte dold information', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withoutStation(state)
    const terms = orderTerms(state, orderFor({ advancePct: 31 }))
    expect(terms.advancePct).toBe(31)
  })

  it('UTAN underrättelse: kreditstämpeln är null ("?") och inga faktorer avslöjas', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withoutStation(state)
    expect(effectiveDepth(state, 'rvn')).toBe(0)
    const terms = orderTerms(state, orderFor())
    expect(terms.known).toBe(false)
    expect(terms.credit).toBeNull()
    expect(terms.drivers).toBeNull()
  })

  it('MED en station är samma grind som formationDisplay: effectiveDepth > 0 ger stämpel och faktorer', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withStation(state, 1)
    const terms = orderTerms(state, orderFor())
    expect(terms.known).toBe(true)
    expect(terms.credit).not.toBeNull()
    expect(terms.drivers).not.toBeNull()
  })

  it('grinden är effectiveDepth, inte bara "finns en station": en chief salesman över 75 ger också en glimt', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withoutStation(state)
    state.house.staff.chiefSalesman = 90
    expect(effectiveDepth(state, 'rvn')).toBeGreaterThan(0)
    expect(orderTerms(state, orderFor()).known).toBe(true)
  })

  it('kreditstämpeln A/B/C följer köparens betalningsförmåga (tredjedelar av 0..1): rik → A, mellan → B, pank → C', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withStation(state, 3)
    const faction = state.factions['rvn']!
    const order = orderFor({ referencePrice: 1_000_000 })

    faction.militaryBudget = B.advanceCoverageFull * 1_000_000 * 10
    faction.treasury = faction.militaryBudget
    expect(orderTerms(state, order).credit).toBe('A')

    faction.militaryBudget = B.advanceCoverageFull * 1_000_000 * 0.5 // hälften av fullt täckningsmått
    faction.treasury = faction.militaryBudget
    expect(orderTerms(state, order).credit).toBe('B')

    faction.militaryBudget = 100_000
    faction.treasury = 100_000
    expect(orderTerms(state, order).credit).toBe('C')
  })

  it('kreditstämpeln läser BÅDA: en rik budget med tom kassa är fortfarande C', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withStation(state, 3)
    const faction = state.factions['rvn']!
    faction.militaryBudget = 1e12
    faction.treasury = -5_000_000 // ett underskott
    expect(orderTerms(state, orderFor()).credit).toBe('C')
  })

  it('faktorerna är låg/mellan/hög: brådska, medel och relation, var för sig', () => {
    const state = createInitialState('indochina-slice', 'terms-seed')
    withStation(state, 3)
    const faction = state.factions['rvn']!
    const threshold = B.orderTriggerThreshold.infantry!
    faction.materielNeed.infantry = threshold * 10
    faction.militaryBudget = 100_000
    faction.treasury = 100_000
    state.officials['official-rvn-procurement']!.relationToPlayer = 50
    const drivers = orderTerms(state, orderFor()).drivers!
    expect(drivers).toEqual({ urgency: 'high', funds: 'low', relationship: 'mid' })
  })

  it('samma ability-tal som förskottsformeln: stämpeln kan aldrig säga något annat än det som drev procenten', () => {
    // A ⇔ ability ≥ 2/3 — och ability är exakt advanceFactors().ability i computeAdvancePct.
    const state = createInitialState('indochina-slice', 'terms-seed')
    withStation(state, 3)
    const faction = state.factions['rvn']!
    faction.militaryBudget = faction.treasury = 1e12
    const order = orderFor()
    const pctRich = computeAdvancePct({ faction, official: state.officials[order.officialId]!, category: 'infantry', referencePrice: order.referencePrice })
    faction.militaryBudget = faction.treasury = 10_000
    const pctPoor = computeAdvancePct({ faction, official: state.officials[order.officialId]!, category: 'infantry', referencePrice: order.referencePrice })
    expect(pctRich).toBeGreaterThan(pctPoor)
    expect(orderTerms(state, order).credit).toBe('C')
  })
})
