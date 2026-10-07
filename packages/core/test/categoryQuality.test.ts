// categoryQuality.test.ts — P107 (ETAPP9_FORSLAG.md §4.3–4.4, beslut 9C, skyddsräcke 1 och 3).
//
// `reputation.quality` delas upp per kategori ("känt för artilleri"): House.categoryQuality är ett tillägg i
// poäng (−tak…+tak) på den husomfattande kvaliteten, och läses av budpoängen för den kategorins produkt.
// Fullgjorda kontrakt i klass A höjer det med ett tak, klass C sänker det även utan skandal, klass B rör det
// inte. Erfarenhet: leveranser in i en krigsfront bankar forskningsförsprång (House.researchHeadStart, i
// turer) som ett pågående projekt i kategorin förbrukar hela turer av.
import { describe, expect, it } from 'vitest'
import balanceData from '../src/data/balance.json'
import { categoryReputation } from '../src/bidTerms.js'
import { playerWinCurve } from '../src/queries.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { advanceRndQueue } from '../src/resolve/upkeep.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, Order, Shipment, TurnSubmission, WireEvent } from '../src/types.js'

const B = balanceData as unknown as {
  qualityCategoryGradeABonus: number
  qualityCategoryGradeCPenalty: number
  qualityCategoryCap: number
  headStartPerShipment: number
  headStartCap: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 20,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 0,
    advancePaid: 0,
    ...overrides,
  }
}

function shipment(units = 20): Shipment {
  return { id: 'shipment-test-0', contractId: 'contract-test-0', units, arrivalTurn: 3 }
}

function deliver(state: GameState, c: Contract, seed = 'quality-seed'): Omit<WireEvent, 'id' | 'turn'>[] {
  state.meta.turn = 3
  state.market.contracts = [c]
  state.market.shipments = [shipment(c.quantity)]
  const { ctx, emitted } = makeCtx(state, seed)
  deliveries(ctx)
  return emitted
}

describe('rykte per kategori (P107, §4.3)', () => {
  it('startar på 0 i alla kategorier', () => {
    const state = createInitialState('indochina-slice', 'cq-start')
    expect(Object.values(state.house.categoryQuality).every((v) => v === 0)).toBe(true)
    expect(Object.keys(state.house.categoryQuality).sort()).toEqual(Object.keys(state.house.techLevel).sort())
  })

  it('ett fullgjort klass A-kontrakt höjer den produktens kategori med qualityCategoryGradeABonus, inte de andra', () => {
    const state = createInitialState('indochina-slice', 'cq-a')
    const scalarBefore = state.house.reputation.quality
    const emitted = deliver(state, contract({ grade: 'A' }))
    expect(state.house.categoryQuality.artillery).toBe(B.qualityCategoryGradeABonus)
    expect(state.house.categoryQuality.naval).toBe(0)
    expect(state.house.reputation.quality).toBe(scalarBefore)
    const ev = emitted.find((e) => e.headline.includes('KNOWN FOR'))
    expect(ev).toBeDefined()
    expect(ev!.delta).toEqual({ 'categoryQuality.artillery': B.qualityCategoryGradeABonus })
    expect(ev!.causeId).not.toBeNull() // kontraktets FULFILLED-händelse (hård regel 4)
  })

  it('höjningen stannar vid taket och ger då ingen händelse', () => {
    const state = createInitialState('indochina-slice', 'cq-cap')
    state.house.categoryQuality.artillery = B.qualityCategoryCap
    const emitted = deliver(state, contract({ grade: 'A' }))
    expect(state.house.categoryQuality.artillery).toBe(B.qualityCategoryCap)
    expect(emitted.some((e) => e.headline.includes('KNOWN FOR'))).toBe(false)
  })

  it('ett fullgjort klass C-kontrakt sänker kategorin med qualityCategoryGradeCPenalty, även utan skandal', () => {
    // Sök ett frö där gradeScandalChance.C inte slår till — sänkningen ska ske ändå.
    for (let i = 0; i < 20; i++) {
      const s = createInitialState('indochina-slice', 'cq-c')
      const emitted = deliver(s, contract({ grade: 'C' }), `cq-c-seed-${i}`)
      if (!emitted.some((e) => e.headline.includes('QUALITY SCANDAL'))) {
        expect(s.house.categoryQuality.artillery).toBe(-B.qualityCategoryGradeCPenalty)
        expect(emitted.some((e) => e.headline.includes('REPUTATION SLIPS'))).toBe(true)
        return
      }
    }
    throw new Error('hittade inget frö utan skandal på 20 försök')
  })

  it('sänkningen stannar vid −taket, och klass B rör inte kategorin', () => {
    const low = createInitialState('indochina-slice', 'cq-floor')
    low.house.categoryQuality.artillery = -B.qualityCategoryCap
    deliver(low, contract({ grade: 'C' }), 'cq-floor-seed')
    expect(low.house.categoryQuality.artillery).toBe(-B.qualityCategoryCap)

    const b = createInitialState('indochina-slice', 'cq-b')
    deliver(b, contract({ grade: 'B' }), 'cq-b-seed')
    expect(b.house.categoryQuality.artillery).toBe(0)
  })

  it('ett sparat parti utan fältet läses som 0 utan att kasta', () => {
    const state = createInitialState('indochina-slice', 'cq-old')
    delete (state.house as Partial<GameState['house']>).categoryQuality
    expect(categoryReputation(state.house, 'artillery').quality).toBe(state.house.reputation.quality)
    expect(() => deliver(state, contract({ grade: 'A' }))).not.toThrow()
  })
})

describe('categoryReputation — en formel, en källa (skyddsräcke 3)', () => {
  it('effektiv kvalitet är husomfattande kvalitet + kategoritillägget, klampad 0–100', () => {
    const state = createInitialState('indochina-slice', 'cq-eff')
    state.house.reputation.quality = 50
    state.house.categoryQuality.artillery = 3
    expect(categoryReputation(state.house, 'artillery')).toEqual({ reliability: state.house.reputation.reliability, quality: 53 })
    state.house.reputation.quality = 99
    expect(categoryReputation(state.house, 'artillery').quality).toBe(100)
    state.house.reputation.quality = 1
    state.house.categoryQuality.artillery = -3
    expect(categoryReputation(state.house, 'artillery').quality).toBe(0)
  })

  it('playerWinCurve ser kategoriryktet: ett ryktestillägg i produktens kategori höjer kurvan, i en annan kategori inte', () => {
    const base = createInitialState('indochina-slice', 'cq-curve')
    const order: Order = {
      id: 'order-test-0',
      buyerId: 'rvn',
      productId: '105mm_field_gun',
      quantity: 100,
      statedBudget: 1800000,
      trueBudget: 2400000,
      referencePrice: 2000000,
      requiredDeliveryTurns: 3,
      expiresTurn: base.meta.turn + 1,
      competingRivals: Object.keys(base.rivals),
      weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
      officialId: 'official-rvn-procurement',
      reason: { kind: 'PEACETIME_REPLACEMENT' },
      frontId: 'front-1',
      advancePct: 0,
    }
    const sum = (s: GameState): number => playerWinCurve(s, order, 'A').reduce((t, p) => t + p.confidence, 0)
    // P141: med specialiseringens och tekniknivåns bonus på specens nivå (2b) ligger hela kurvan vid 100 % med husets grundrykte — ett lägre grundrykte håller kurvan under taket så att ryktestillägget syns.
    base.house.reputation.quality = 10
    const plain = sum(base)
    const own = createInitialState('indochina-slice', 'cq-curve')
    own.house.reputation.quality = 10
    own.house.categoryQuality.artillery = B.qualityCategoryCap
    const other = createInitialState('indochina-slice', 'cq-curve')
    other.house.reputation.quality = 10
    other.house.categoryQuality.naval = B.qualityCategoryCap
    expect(sum(own)).toBeGreaterThan(plain)
    expect(sum(other)).toBe(plain)
  })
})

describe('erfarenhet ger forskningsförsprång (P107, §4.4)', () => {
  it('en leverans in i en krigsfront bankar headStartPerShipment turer i produktens kategori', () => {
    const state = createInitialState('indochina-slice', 'cq-exp')
    for (const f of Object.values(state.fronts)) f.status = 'war'
    const emitted = deliver(state, contract({ grade: 'A' }))
    expect(state.house.researchHeadStart.artillery).toBe(B.headStartPerShipment)
    expect(state.house.researchHeadStart.naval).toBe(0)
    expect(emitted.some((e) => e.delta['researchHeadStart.artillery'] === B.headStartPerShipment)).toBe(true)
  })

  it('en leverans in i en front utan krig (vapenvila) ger ingen erfarenhet', () => {
    const state = createInitialState('indochina-slice', 'cq-exp-cf')
    for (const f of Object.values(state.fronts)) f.status = 'ceasefire'
    deliver(state, contract({ grade: 'A' }))
    expect(state.house.researchHeadStart.artillery).toBe(0)
  })

  it('banken stannar vid headStartCap', () => {
    const state = createInitialState('indochina-slice', 'cq-exp-cap')
    for (const f of Object.values(state.fronts)) f.status = 'war'
    state.house.researchHeadStart.artillery = B.headStartCap
    deliver(state, contract({ grade: 'A' }))
    expect(state.house.researchHeadStart.artillery).toBe(B.headStartCap)
  })

  it('ett pågående projekt i kategorin förbrukar hela turer ur banken och blir klart tidigare', () => {
    const state = createInitialState('indochina-slice', 'cq-exp-rnd')
    state.house.researchHeadStart.artillery = 1.5
    state.house.rnd = [{ id: 'r1', category: 'artillery', turnsRemaining: 4, turnsTotal: 6 }]
    const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
    advanceRndQueue(state.house, (e) => {
      emitted.push(e)
      return 'x'
    })
    // 1 ordinarie tur + 1 hel tur ur banken: 4 → 2. Den halva turen ligger kvar.
    expect(state.house.rnd[0]!.turnsRemaining).toBe(2)
    expect(state.house.researchHeadStart.artillery).toBe(0.5)
    expect(emitted.some((e) => e.delta['researchHeadStart.artillery'] === -1)).toBe(true)
  })

  it('förbrukningen lämnar aldrig ett projekt på mindre än att det blir klart den turen, och andra kategorier rörs inte', () => {
    const state = createInitialState('indochina-slice', 'cq-exp-edge')
    state.house.researchHeadStart.artillery = 2
    state.house.researchHeadStart.naval = 1
    state.house.rnd = [{ id: 'r1', category: 'artillery', turnsRemaining: 2, turnsTotal: 6 }]
    const before = state.house.techLevel.artillery
    advanceRndQueue(state.house, () => 'x')
    expect(state.house.rnd).toEqual([])
    expect(state.house.techLevel.artillery).toBe(before + 1)
    expect(state.house.researchHeadStart.artillery).toBe(1) // bara 1 hel tur behövdes (2 → klart efter 1 + 1)
    expect(state.house.researchHeadStart.naval).toBe(1)
  })

  it('ett sparat parti utan banken läses som 0 utan att kasta', () => {
    const state = createInitialState('indochina-slice', 'cq-exp-old')
    delete (state.house as Partial<GameState['house']>).researchHeadStart
    state.house.rnd = [{ id: 'r1', category: 'artillery', turnsRemaining: 3, turnsTotal: 6 }]
    expect(() => advanceRndQueue(state.house, () => 'x')).not.toThrow()
    expect(state.house.rnd[0]!.turnsRemaining).toBe(2)
  })
})
