// favourMargin.test.ts — P99d (ägarbeslut 2026-09-29, svar på frågan efter P99c): FAVOUR får en
// VERKLIG kostnad. Den kostar fortfarande ingen kassa när den utförs — men beloppet (poängen den faktiskt
// köpte × favourRelationCostPerPoint) blir en skuld i marginal (House.favourMarginOwed) som dras från
// intäkten på husets NÄSTA leveranser, tills den är slutbetald. "Kostnaden bokförs i marginal, inte i
// kassa" (ETAPP5_TEKNISK_SPEC.md §3.3) — det som tidigare bara var bokföring (favourMarginSpent lästes av
// ingenting) är nu det spelaren mäts på av styrelsen: den bokförda intäkten.
import { describe, expect, it } from 'vitest'
import { applyActions } from '../../src/resolve/steps/applyActions.js'
import { deliveries } from '../../src/resolve/steps/deliveries.js'
import { projectedQuarter } from '../../src/queries.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Contract, GameState, PlayerAction, Shipment, TurnSubmission, WireEvent } from '../../src/types.js'

const PER_POINT = balance.favourRelationCostPerPoint
const OFFICIAL = 'official-rvn-procurement'

function makeCtx(state: GameState, actions: PlayerAction[] = []): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const submission: TurnSubmission = { standingOrders: [], bids: [], actions }
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission,
    rng: createRng('favour-margin', 0),
    emit: (e) => {
      emitted.push(e)
      return `w-${seq++}`
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
    quantity: 100,
    unitsDelivered: 0,
    price: 2_000_000,
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

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return { id: 'shipment-test-0', contractId: 'contract-test-0', units: 20, arrivalTurn: 3, ...overrides }
}

function withDelivery(state: GameState): void {
  state.market.contracts = [contract()]
  state.market.shipments = [shipment()]
  state.meta.turn = 3
}

describe('FAVOUR skapar en marginalskuld', () => {
  it('kassan rörs inte, men skulden blir poängen × favourRelationCostPerPoint (och favourMarginSpent räknar upp)', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    state.officials[OFFICIAL]!.relationToPlayer = 40
    const treasury = state.house.treasury

    applyActions(makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: OFFICIAL, marginCost: 3 * PER_POINT }]).ctx)

    expect(state.house.treasury).toBe(treasury)
    expect(state.officials[OFFICIAL]!.relationToPlayer).toBe(43)
    expect(state.house.favourMarginOwed).toBe(3 * PER_POINT)
    expect(state.house.favourMarginSpent).toBe(3 * PER_POINT)
  })

  it('man betalar bara för de poäng man faktiskt fick: vid relation 100 (ingen vinst) blir skulden 0', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    state.officials[OFFICIAL]!.relationToPlayer = 100
    applyActions(makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: OFFICIAL, marginCost: 50_000 }]).ctx)
    expect(state.house.favourMarginOwed).toBe(0)
    expect(state.house.favourMarginSpent).toBe(0)
  })

  it('klampas relationen mot 100 betalas bara de faktiska poängen', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    state.officials[OFFICIAL]!.relationToPlayer = 98
    applyActions(makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: OFFICIAL, marginCost: 10 * PER_POINT }]).ctx)
    expect(state.officials[OFFICIAL]!.relationToPlayer).toBe(100)
    expect(state.house.favourMarginOwed).toBe(2 * PER_POINT)
  })

  it('skulden är ett heltal även när relationsvinsten inte är det (hård regel 8)', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    state.officials[OFFICIAL]!.relationToPlayer = 40.3
    applyActions(makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: OFFICIAL, marginCost: 7_777 }]).ctx)
    expect(Number.isInteger(state.house.favourMarginOwed)).toBe(true)
  })
})

describe('skulden dras från nästa leveransers intäkt', () => {
  it('en leverans betalar skulden först: kassa, huvudbok och revenueByTurn får NETTOT, och en synlig händelse säger hur mycket', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    withDelivery(state)
    state.house.favourMarginOwed = 100_000
    const treasury = state.house.treasury
    const gross = Math.round(2_000_000 * (20 / 100))

    const { ctx, emitted } = makeCtx(state)
    deliveries(ctx)

    expect(state.house.favourMarginOwed).toBe(0)
    expect(state.house.treasury).toBe(treasury + gross - 100_000)
    expect(state.house.revenueByTurn[3]).toBe(gross - 100_000)
    const settled = emitted.find((e) => e.headline.includes('FAVOUR MARGIN'))
    expect(settled).toBeDefined()
    expect(settled!.headline).toContain('100,000')
    expect(settled!.delta.favourMarginOwed).toBe(-100_000)
    expect(settled!.actorIsPlayer).toBe(true)
  })

  it('är skulden större än leveransen går hela leveransen till skulden och resten står kvar', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    withDelivery(state)
    const gross = Math.round(2_000_000 * (20 / 100))
    state.house.favourMarginOwed = gross + 250_000
    const treasury = state.house.treasury

    deliveries(makeCtx(state).ctx)

    expect(state.house.treasury).toBe(treasury)
    expect(state.house.revenueByTurn[3]).toBe(0)
    expect(state.house.favourMarginOwed).toBe(250_000)
  })

  it('utan skuld är leveransen oförändrad och ingen marginalhändelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    withDelivery(state)
    const { ctx, emitted } = makeCtx(state)
    deliveries(ctx)
    expect(emitted.some((e) => e.headline.includes('FAVOUR MARGIN'))).toBe(false)
    expect(state.house.revenueByTurn[3]).toBe(Math.round(2_000_000 * (20 / 100)))
  })

  it('ett sparat parti från före P99d (favourMarginOwed saknas) räknas som skuldfritt, kraschar inte', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    withDelivery(state)
    delete (state.house as unknown as { favourMarginOwed?: number }).favourMarginOwed
    expect(() => deliveries(makeCtx(state).ctx)).not.toThrow()
    expect(state.house.revenueByTurn[3]).toBe(Math.round(2_000_000 * (20 / 100)))
  })
})

describe('prognosen (projectedQuarter) räknar med skulden', () => {
  it('förväntad intäkt nästa tur är bruttot minus den skuld som hinner betalas', () => {
    const state = createInitialState('indochina-slice', 'fav-seed')
    state.market.contracts = [contract()]
    state.market.shipments = [shipment({ arrivalTurn: 4 })]
    state.meta.turn = 3
    const gross = Math.round(2_000_000 * (20 / 100))

    expect(projectedQuarter(state).expectedRevenueNextTurn).toBe(gross)
    state.house.favourMarginOwed = 100_000
    expect(projectedQuarter(state).expectedRevenueNextTurn).toBe(gross - 100_000)
    state.house.favourMarginOwed = gross + 1
    expect(projectedQuarter(state).expectedRevenueNextTurn).toBe(0)
  })
})
