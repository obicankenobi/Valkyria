// research.test.ts — P108 (ETAPP9_FORSLAG.md §4.5, beslut 9C, ETAPP8 skyddsräcke 6).
//
// Forskning som stående order: varje kategori kan få ett spår i takten låg/normal/hög, utan handling, från
// nästa tur; spåret startar ett projekt när kategorin saknar ett och fortsätter av sig självt. REPRIORITISE_RND
// blir ett krasprogram: halverad tid, dubbel totalkostnad, kostar en handling och huset kan inte bjuda i
// kategorin nästa kvartal. staff.chiefEngineer får sin första läsare: ett projekt blir en tur kortare över en
// tröskel.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { advanceRndQueue } from '../src/resolve/upkeep.js'
import { resolveTurn } from '../src/resolve/index.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { isBidLocked, projectCostPerTurn, researchDuration } from '../src/research.js'
import { validateAction } from '../src/validateAction.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { previewAction } from '../src/previewAction.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { GameState, Order, StandingOrderChange, TurnResult, TurnSubmission } from '../src/types.js'

const B = balance as unknown as {
  rndProjectTurns: number
  researchPace: Record<'low' | 'normal' | 'high', { turnsFactor: number; costFactor: number }>
  crashTimeFactor: number
  crashCostMultiple: number
  chiefEngineerProjectThreshold: number
  chiefEngineerTurnsSaved: number
  specialisationRndCostFactor: number
  fixedCosts: { rndOverhead: number }
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const SET = (category: 'naval' | 'artillery', pace: 'low' | 'normal' | 'high'): StandingOrderChange => ({ kind: 'RESEARCH', op: 'SET', category, pace })
const CANCEL = (category: 'naval' | 'artillery'): StandingOrderChange => ({ kind: 'RESEARCH', op: 'CANCEL', category })

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'research-seed')
  state.house.treasury = 50_000_000
  return state
}

describe('researchDuration och projectCostPerTurn (P108)', () => {
  it('låg/normal/hög ger rndProjectTurns × turnsFactor (avrundat) och chefsingenjören kortar en tur över tröskeln', () => {
    const house = fresh().house
    house.staff.chiefEngineer = B.chiefEngineerProjectThreshold
    expect(researchDuration(house, 'low')).toBe(Math.round(B.rndProjectTurns * B.researchPace.low.turnsFactor))
    expect(researchDuration(house, 'normal')).toBe(B.rndProjectTurns)
    expect(researchDuration(house, 'high')).toBe(Math.round(B.rndProjectTurns * B.researchPace.high.turnsFactor))
    house.staff.chiefEngineer = B.chiefEngineerProjectThreshold + 1
    expect(researchDuration(house, 'normal')).toBe(B.rndProjectTurns - B.chiefEngineerTurnsSaved)
  })

  it('ett projekt blir aldrig kortare än en tur', () => {
    const house = fresh().house
    house.staff.chiefEngineer = 100
    expect(researchDuration(house, 'crash')).toBeGreaterThanOrEqual(1)
  })

  it('kostnaden per tur: tempots costFactor; krasprogrammet dubblar TOTALkostnaden trots halverad tid', () => {
    expect(projectCostPerTurn('low')).toBe(B.researchPace.low.costFactor)
    expect(projectCostPerTurn('high')).toBe(B.researchPace.high.costFactor)
    // krasch: total = crashCostMultiple × normaltotal; tiden är crashTimeFactor → per tur = multipel / tidsfaktor
    expect(projectCostPerTurn('crash')).toBe(B.crashCostMultiple / B.crashTimeFactor)
    expect(projectCostPerTurn('crash') * B.crashTimeFactor * B.rndProjectTurns).toBeCloseTo(B.crashCostMultiple * B.rndProjectTurns, 9)
  })
})

describe('forskningsspår som stående order (P108, §4.5)', () => {
  it('SET giltigt för varje tempo, ogiltigt för okänd kategori/tempo, CANCEL utan spår avvisas', () => {
    const state = fresh()
    for (const pace of ['low', 'normal', 'high'] as const) {
      expect(validateStandingOrderChange(state, state, SET('naval', pace)).ok).toBe(true)
    }
    expect(validateStandingOrderChange(state, state, { kind: 'RESEARCH', op: 'SET', category: 'cyber', pace: 'low' } as unknown as StandingOrderChange).ok).toBe(false)
    expect(validateStandingOrderChange(state, state, { kind: 'RESEARCH', op: 'SET', category: 'naval', pace: 'turbo' } as unknown as StandingOrderChange).ok).toBe(false)
    expect(validateStandingOrderChange(state, state, CANCEL('naval'))).toEqual({ ok: false, reason: 'no research track for that category' })
  })

  it('kostar ingen handling och gäller från NÄSTA tur: inget projekt startar samma tur', () => {
    const state = fresh()
    const result = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'normal')] })
    expect(result.rejected).toEqual([])
    expect(result.state.house.standingOrders.research?.naval).toEqual({ pace: 'normal', sinceTurn: state.meta.turn + 1 })
    expect(result.state.house.rnd).toEqual([])
    expect(result.wire.some((e) => e.headline.includes('RESEARCH TRACK') && e.headline.includes('NAVAL'))).toBe(true)
  })

  it('turen efter startar spåret ett projekt med tempots längd och kostnadsfaktor, och det avslutas med +1 techLevel', () => {
    let state = fresh()
    const before = state.house.techLevel.naval
    state = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'high')] }).state
    state = resolveTurn(state, EMPTY).state
    expect(state.house.rnd).toHaveLength(1)
    const project = state.house.rnd[0]!
    expect(project).toMatchObject({ category: 'naval', turnsTotal: researchDuration(state.house, 'high'), costFactor: B.researchPace.high.costFactor })
    for (let i = 0; i < project.turnsTotal; i++) state = resolveTurn(state, EMPTY).state
    expect(state.house.techLevel.naval).toBeGreaterThanOrEqual(before + 1)
  })

  it('spåret startar nästa projekt av sig självt när det förra blivit klart, men aldrig ett andra samtidigt i samma kategori', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'high')] }).state
    const started: number[] = []
    let maxConcurrent = 0
    for (let i = 0; i < 14; i++) {
      state = resolveTurn(state, EMPTY).state
      const naval = state.house.rnd.filter((p) => p.category === 'naval')
      maxConcurrent = Math.max(maxConcurrent, naval.length)
      if (naval.length && naval[0]!.turnsRemaining === naval[0]!.turnsTotal) started.push(state.meta.turn)
    }
    expect(maxConcurrent).toBe(1)
    expect(started.length).toBeGreaterThanOrEqual(2)
  })

  it('spåret stannar när kategorin nått techLevel 10', () => {
    let state = fresh()
    state.house.techLevel.naval = 10
    state = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'normal')] }).state
    state = resolveTurn(state, EMPTY).state
    expect(state.house.rnd).toEqual([])
  })

  it('CANCEL tar bort spåret men låter ett pågående projekt löpa klart', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'normal')] }).state
    state = resolveTurn(state, EMPTY).state
    expect(state.house.rnd).toHaveLength(1)
    state = resolveTurn(state, { ...EMPTY, standingOrders: [CANCEL('naval')] }).state
    expect(state.house.standingOrders.research?.naval).toBeUndefined()
    expect(state.house.rnd).toHaveLength(1)
  })

  it('ett projekt kostar rndOverhead × costFactor per tur, och specialiseringen halverar det ovanpå', () => {
    const state = fresh()
    state.house.rnd = [
      { id: 'r1', category: 'naval', turnsRemaining: 3, turnsTotal: 6, costFactor: 0.5 },
      { id: 'r2', category: state.house.specialisation, turnsRemaining: 3, turnsTotal: 6, costFactor: 4, crash: true },
    ]
    expect(computeFixedCostsBreakdown(state.house).rndOverhead).toBe(
      Math.round(B.fixedCosts.rndOverhead * 0.5 + B.fixedCosts.rndOverhead * 4 * B.specialisationRndCostFactor),
    )
  })

  it('ett sparat parti utan spårfältet kraschar inte', () => {
    const state = fresh()
    delete (state.house.standingOrders as { research?: unknown }).research
    expect(() => resolveTurn(state, EMPTY)).not.toThrow()
  })
})

describe('krasprogram (REPRIORITISE_RND, P108, §4.5)', () => {
  const crash = (category: string) => ({ type: 'INTERNAL' as const, op: 'REPRIORITISE_RND' as const, payload: { category } })

  it('utan pågående projekt startar det ett krasprojekt: halverad tid, totalkostnaden dubbel, kostar en handling', () => {
    const state = fresh()
    const result = resolveTurn(state, { ...EMPTY, actions: [crash('naval')] })
    expect(result.rejected).toEqual([])
    const project = result.state.house.rnd.find((p) => p.category === 'naval')!
    expect(project.crash).toBe(true)
    expect(project.turnsTotal).toBe(researchDuration(state.house, 'crash'))
    expect(project.turnsTotal).toBe(Math.round(B.rndProjectTurns * B.crashTimeFactor))
    expect(project.costFactor).toBe(projectCostPerTurn('crash'))
  })

  it('med ett pågående projekt i kategorin halveras återstående tid och kostnaden dubblas i stället för ett andra projekt', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [SET('naval', 'normal')] }).state
    state = resolveTurn(state, EMPTY).state
    const remainingBefore = state.house.rnd[0]!.turnsRemaining
    const result = resolveTurn(state, { ...EMPTY, actions: [crash('naval')] })
    const naval = result.state.house.rnd.filter((p) => p.category === 'naval')
    expect(naval).toHaveLength(1)
    expect(naval[0]!.crash).toBe(true)
    // ordinarie tur först (−1), sedan krasch: ceil(resten × crashTimeFactor)
    expect(naval[0]!.turnsRemaining).toBe(Math.max(1, Math.ceil((remainingBefore - 1) * B.crashTimeFactor)))
    expect(naval[0]!.costFactor).toBe(projectCostPerTurn('crash'))
  })

  it('ett andra krasprogram i samma kategori avvisas av validateAction och av resolveTurn', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, actions: [crash('naval')] }).state
    const action = crash('naval')
    expect(validateAction(state, state, action)).toEqual({ ok: false, reason: 'crash programme already running for that category' })
    const again = resolveTurn(state, { ...EMPTY, actions: [action] })
    expect(again.rejected.some((r) => r.reason === 'crash programme already running for that category')).toBe(true)
  })

  it('huset kan inte bjuda i kategorin nästa kvartal — bara den turen, bara den kategorin', () => {
    const state = fresh()
    const turn = state.meta.turn
    const after = resolveTurn(state, { ...EMPTY, actions: [crash('artillery')] }).state
    expect(after.house.rndBidLock?.artillery).toBe(turn + 1)
    expect(isBidLocked(after.house, 'artillery', turn + 1)).toBe(true)
    expect(isBidLocked(after.house, 'artillery', turn + 2)).toBe(false)
    expect(isBidLocked(after.house, 'naval', turn + 1)).toBe(false)

    // bidding.ts avvisar budet den låsta turen (samma grind som tech-spärren)
    const s = structuredClone(after)
    const order: Order = {
      id: 'order-test-0',
      buyerId: 'rvn',
      productId: '105mm_field_gun',
      quantity: 100,
      statedBudget: 1800000,
      trueBudget: 2400000,
      referencePrice: 2000000,
      requiredDeliveryTurns: 3,
      expiresTurn: s.meta.turn,
      competingRivals: [],
      weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
      officialId: 'official-rvn-procurement',
      reason: { kind: 'PEACETIME_REPLACEMENT' },
      frontId: 'front-1',
      advancePct: 0,
    }
    s.market.openOrders = [order]
    s.meta.turn = turn + 1
    const rejected: TurnResult['rejected'] = []
    bidding({
      state: s,
      draft: s,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0 }], actions: [] },
      rng: createRng('lock', 0),
      emit: () => 't',
      rejected,
    })
    expect(rejected.some((r) => r.reason === 'crash programme: no bids in this category this quarter')).toBe(true)
    expect(s.market.contracts).toEqual([])
  })

  it('previewAction visar krasprogrammets totalkostnad', () => {
    const state = fresh()
    const preview = previewAction(state, crash('naval'))
    const duration = researchDuration(state.house, 'crash')
    expect(preview.cost).toBe(Math.round(B.fixedCosts.rndOverhead * projectCostPerTurn('crash') * duration))
  })
})

describe('chefsingenjören (P108, §4.5): första läsaren av staff.chiefEngineer', () => {
  it('ett nytt spårprojekt blir en tur kortare med chiefEngineer över tröskeln', () => {
    const low = fresh()
    const high = fresh()
    high.house.staff.chiefEngineer = B.chiefEngineerProjectThreshold + 1
    let a = resolveTurn(low, { ...EMPTY, standingOrders: [SET('naval', 'normal')] }).state
    let b = resolveTurn(high, { ...EMPTY, standingOrders: [SET('naval', 'normal')] }).state
    a = resolveTurn(a, EMPTY).state
    b = resolveTurn(b, EMPTY).state
    expect(a.house.rnd[0]!.turnsTotal - b.house.rnd[0]!.turnsTotal).toBe(B.chiefEngineerTurnsSaved)
  })

  it('advanceRndQueue påverkas inte — kortningen sker vid projektstart', () => {
    const state = fresh()
    state.house.rnd = [{ id: 'r1', category: 'naval', turnsRemaining: 3, turnsTotal: 6 }]
    advanceRndQueue(state.house, () => 'x')
    expect(state.house.rnd[0]!.turnsRemaining).toBe(2)
  })
})
