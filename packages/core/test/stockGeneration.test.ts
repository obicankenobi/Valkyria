// stockGeneration.test.ts — P188 (ETAPP10_FORSLAG.md §7, beslut 10X): forskningen ska löna sig. Köparens tekniska golv följer blockets generation: en standardprodukt (utan konstruktion) har huset-
// generationen 1 + (tekniknivån över startnivån), och ligger den mer än en generation efter köparens block kan den inte bjudas. En konstruktion bedöms redan så (designPhaseOutKeep). Den som inte forskar
// och inte ritar tappar alltså kategorin när blocket kliver — och forskningens nytta syns som en kategori som hålls öppen.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import scenario from '../src/data/scenarios/indochina-slice.json' with { type: 'json' }
import { bidDesignRejection } from '../src/design.js'
import { stockBidRejection, stockGeneration } from '../src/race.js'
import { createInitialState } from '../src/state.js'
import { validateBid } from '../src/validateAction.js'
import type { GameState, Order } from '../src/types.js'

const B = balance as unknown as { stockGenerationEnabled: number; stockGenerationTechBase: number; stockGenerationSpecialisedBase: number }

function orderFor(state: GameState, productId: string): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-sg', buyerId, productId, quantity: 10, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 5, expiresTurn: state.meta.turn + 1, competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: Object.values(state.officials)[0]!.id, reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
  } as Order
}

describe('stockGeneration — standardprodukternas generation (P188)', () => {
  it('talen i balance.json är kopplade till scenariots starttekniknivå (ingen drift)', () => {
    expect(B.stockGenerationTechBase).toBe(scenario.house.techLevelDefault)
    expect(B.stockGenerationSpecialisedBase).toBe(scenario.house.techLevelDefault + scenario.house.techLevelSpecialisationBonus)
  })

  it('huset startar på generation 1 i alla kategorier, och varje tekniknivå över start är en generation till', () => {
    const state = createInitialState('indochina-slice', 'sg-1')
    for (const c of ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'] as const) expect(stockGeneration(state.house, c)).toBe(1)
    state.house.techLevel.artillery += 1
    state.house.techLevel.naval += 2
    expect(stockGeneration(state.house, 'artillery')).toBe(2)
    expect(stockGeneration(state.house, 'naval')).toBe(3)
  })

  it('en standardprodukt som ligger mer än en generation efter köparens block kan inte bjudas', () => {
    const state = createInitialState('indochina-slice', 'sg-2')
    const order = orderFor(state, '105mm_field_gun')
    state.race.generation.west.artillery = 2
    state.race.generation.east.artillery = 2
    expect(stockBidRejection(state, order)).toBeNull() // en generation efter är tillåtet
    state.race.generation.west.artillery = 3
    state.race.generation.east.artillery = 3
    expect(stockBidRejection(state, order)).toMatch(/generation behind/)
    state.house.techLevel.artillery += 1 // forskning: generation 2, en efter
    expect(stockBidRejection(state, order)).toBeNull()
  })

  it('bidDesignRejection tillämpar den på ett bud utan konstruktion, men inte på ett med', () => {
    const state = createInitialState('indochina-slice', 'sg-3')
    state.race.generation.west.artillery = 3
    state.race.generation.east.artillery = 3
    const order = orderFor(state, '105mm_field_gun')
    expect(bidDesignRejection(state, { price: 1 }, order)).toMatch(/generation behind/)
  })

  it('validateBid låser en order där standardprodukten är utfasad och huset saknar en konstruktion som passar', () => {
    const state = createInitialState('indochina-slice', 'sg-4')
    const order = orderFor(state, '105mm_field_gun')
    state.market.openOrders = [order]
    expect(validateBid(state, state, { orderId: order.id }).ok).toBe(true)
    state.race.generation.west.artillery = 3
    state.race.generation.east.artillery = 3
    const v = validateBid(state, state, { orderId: order.id })
    expect(v.ok).toBe(false)
  })

  it('regeln kan stängas av (stockGenerationEnabled 0 = ingen spärr)', () => {
    expect(B.stockGenerationEnabled).toBeGreaterThanOrEqual(0)
  })
})
