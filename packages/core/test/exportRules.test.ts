// exportRules.test.ts — P132 (ETAPP9_FORSLAG.md §8b.1, beslut 9I): exklusivitet och exportlistan.
import { describe, expect, it } from 'vitest'
import { bidDesignRejection } from '../src/design.js'
import { applyExportViolation, bindDesignToGrantBloc, exclusivityRejection, isExportControlled, isExportViolation } from '../src/exportRules.js'
import { blocOfFaction } from '../src/race.js'
import { createRng } from '../src/rng.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createInitialState } from '../src/state.js'
import { createWireEmitter } from '../src/wire.js'
import balance from '../src/data/balance.json'
import type { Bloc } from '../src/race.js'
import type { Design, GameState, Order } from '../src/types.js'

const B = balance as unknown as { exportControlGeneration: number; exportViolationDoomsday: number; exportViolationHeat: number }

function designWith(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 60,
    reliability: 56,
    unitCostFactor: 1,
    trueQuality: 58,
    uncertainty: 2,
    latentFlaw: null,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
    ...over,
  }
}

// Två köpare i varsitt block ur scenariot.
function twoBlocBuyers(state: GameState): { west: string; east: string } {
  const west = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === 'west')
  const east = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === 'east')
  if (!west || !east) throw new Error('scenariot saknar köpare i båda blocken')
  return { west, east }
}

function orderTo(_state: GameState, buyerId: string): Order {
  return {
    id: 'order-test-0',
    buyerId,
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: `official-${buyerId}-procurement`,
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 0,
  }
}

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'export-seed')
  state.house.treasury = 50_000_000
  return state
}

describe('exklusivitet (P132)', () => {
  it('en konstruktion utan bindning avvisas aldrig av exklusiviteten', () => {
    const state = fresh()
    expect(exclusivityRejection(state, designWith(), Object.keys(state.factions)[0]!)).toBeNull()
  })

  it('en bunden konstruktion får bjudas till sitt eget block men avvisas hos det andra och hos en köpare utan block', () => {
    const state = fresh()
    const { west, east } = twoBlocBuyers(state)
    const bound = designWith({ exclusiveTo: 'west' })
    expect(exclusivityRejection(state, bound, west)).toBeNull()
    expect(exclusivityRejection(state, bound, east)).toBe('design bound to the west by its research grant')
    const neutral = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === null)
    if (neutral) expect(exclusivityRejection(state, bound, neutral)).not.toBeNull()
  })

  it('bidDesignRejection (den enda källan) bär avvisningen — bidding.ts, bidEstimate och playerWinCurve läser den', () => {
    const state = fresh()
    const { east } = twoBlocBuyers(state)
    state.house.designs = [designWith({ exclusiveTo: 'west' })]
    const order = orderTo(state, east)
    expect(bidDesignRejection(state, { designId: 'design-1', price: 0 }, order)).toBe('design bound to the west by its research grant')
  })

  it('bindDesignToGrantBloc binder bara när upphandlingen hade ett anslag, bara en gång, och inte mot en köpare utan block', () => {
    const state = fresh()
    const { west } = twoBlocBuyers(state)
    const none = designWith()
    expect(bindDesignToGrantBloc(state, none, west, false)).toBeNull()
    expect(none.exclusiveTo).toBeUndefined()
    const bound = designWith()
    expect(bindDesignToGrantBloc(state, bound, west, true)).toBe<Bloc>('west')
    expect(bound.exclusiveTo).toBe('west')
    expect(bindDesignToGrantBloc(state, bound, twoBlocBuyers(state).east, true)).toBeNull() // redan bunden — ingen omskrivning
    expect(bound.exclusiveTo).toBe('west')
  })
})

describe('exportlistan (P132)', () => {
  it('en konstruktion är exportreglerad från exportControlGeneration', () => {
    expect(isExportControlled(designWith({ generation: B.exportControlGeneration - 1 }))).toBe(false)
    expect(isExportControlled(designWith({ generation: B.exportControlGeneration }))).toBe(true)
  })

  it('ett brott kräver exportreglerad konstruktion, ett block- eller östanslutet hus och en köpare i andra blocket', () => {
    const state = fresh()
    const { west, east } = twoBlocBuyers(state)
    const controlled = designWith({ generation: B.exportControlGeneration })
    state.house.homeState = 'west'
    expect(isExportViolation(state, controlled, east)).toBe(true)
    expect(isExportViolation(state, controlled, west)).toBe(false)
    expect(isExportViolation(state, designWith({ generation: 1 }), east)).toBe(false)
    state.house.homeState = 'east'
    expect(isExportViolation(state, controlled, west)).toBe(true)
  })

  it('ett neutralt hus undantas (beslut 9I)', () => {
    const state = fresh()
    const { east } = twoBlocBuyers(state)
    state.house.homeState = 'neutral'
    expect(isExportViolation(state, designWith({ generation: B.exportControlGeneration }), east)).toBe(false)
  })

  it('att vinna ett bud över blockgränsen med en exportreglerad konstruktion ger doomsday, heat, rubrik och ett pappersspår', () => {
    const state = fresh()
    const { east } = twoBlocBuyers(state)
    state.house.homeState = 'west'
    state.house.designs = [designWith({ generation: B.exportControlGeneration })]
    const order = orderTo(state, east)
    state.market.openOrders = [order]
    state.meta.turn = 0
    const front = Object.values(state.fronts).find((f) => f.sideA === east || f.sideB === east)
    const heatBefore = front ? state.theatres[front.theatreId]!.heat : 0
    const doomsdayBefore = state.doomsday
    const wire = createWireEmitter(state.meta.turn, [])
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }], actions: [] },
      rng: createRng('export-win', 0),
      emit: wire.emit,
      rejected: [],
    })
    // Bara om budet faktiskt vann (en ensam spelare på en order gör det); annars finns inget att kontrollera.
    expect(state.market.contracts).toHaveLength(1)
    const events = wire.thisTurnEvents()
    expect(events.some((e) => e.headline.startsWith('EXPORT CONTROL BREACHED'))).toBe(true)
    expect(state.doomsday).toBeGreaterThanOrEqual(doomsdayBefore + B.exportViolationDoomsday)
    if (front) expect(state.theatres[front.theatreId]!.heat).toBe(Math.min(100, heatBefore + B.exportViolationHeat))
    const trace = (state.traces ?? []).find((t) => t.kind === 'illegalExport')
    expect(trace).toBeDefined()
    expect(trace!.houseId).toBe('player')
    expect(trace!.contractId).toBe(state.market.contracts[0]!.id)
  })

  it('samma försäljning inom det egna blocket ger inget brott', () => {
    const state = fresh()
    const { west } = twoBlocBuyers(state)
    state.house.homeState = 'west'
    state.house.designs = [designWith({ generation: B.exportControlGeneration })]
    const order = orderTo(state, west)
    state.market.openOrders = [order]
    state.meta.turn = 0
    const wire = createWireEmitter(state.meta.turn, [])
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }], actions: [] },
      rng: createRng('export-own', 0),
      emit: wire.emit,
      rejected: [],
    })
    expect(wire.thisTurnEvents().some((e) => e.headline.startsWith('EXPORT CONTROL BREACHED'))).toBe(false)
    expect((state.traces ?? []).some((t) => t.kind === 'illegalExport')).toBe(false)
  })

  it('applyExportViolation är rent mot sina indata: ingen teater att värma ändrar inget annat än doomsday och spåret', () => {
    const state = fresh()
    const { east } = twoBlocBuyers(state)
    state.fronts = {}
    const wire = createWireEmitter(state.meta.turn, [])
    const ctx = { state, draft: state, submission: { standingOrders: [], bids: [], actions: [] }, rng: createRng('v', 0), emit: wire.emit, rejected: [] }
    applyExportViolation(ctx as never, designWith({ generation: 3 }), east, 'contract-x', null)
    expect(state.doomsday).toBeGreaterThan(0)
    expect(state.traces?.[0]?.kind).toBe('illegalExport')
  })
})
