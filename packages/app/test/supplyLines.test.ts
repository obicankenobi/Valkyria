// supplyLines.test.ts — P82 (ETAPP7_TEKNISK_SPEC.md §13, §6.7).
import { describe, expect, it } from 'vitest'
import { createInitialState, PLAYER_ATTRIBUTION_KEY } from '@seventh-front/core'
import type { Contract, GameState, Shipment } from '@seventh-front/core'
import { playerSupplyLines, rivalSupplyLines, snapshotAttribution, THEATRE_ENTRY_POINTS } from '../src/supplyLines.js'
import { SECTOR_REGIONS } from '../src/sectorRegions.js'

function makeContract(overrides: Partial<Contract>): Contract {
  return {
    id: 'contract-1',
    buyerId: 'rvn',
    productId: 'p-artillery-basic',
    quantity: 10,
    unitsDelivered: 0,
    price: 1000,
    unitCostAtSigning: 500,
    grade: 'B',
    dueTurn: 5,
    status: 'active',
    lateEventId: null,
    frontId: 'front-1',
    advancePct: 0, advancePaid: 0,
    ...overrides,
  }
}

function makeShipment(overrides: Partial<Shipment>): Shipment {
  return { id: 'shipment-1', contractId: 'contract-1', units: 5, arrivalTurn: 3, ...overrides }
}

describe('playerSupplyLines', () => {
  it('ritar ingen linje utan aktiva försändelser', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    expect(playerSupplyLines(state, SECTOR_REGIONS)).toEqual([])
  })

  it('en försändelse mot en front med känd teater ger en linje från teaterns ingångshamn till frontens ankare', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    state.market.contracts.push(makeContract({ id: 'c1', frontId: 'front-1' }))
    state.market.shipments.push(makeShipment({ id: 's1', contractId: 'c1' }))

    const lines = playerSupplyLines(state, SECTOR_REGIONS)

    expect(lines.length).toBe(1)
    expect(lines[0]!.kind).toBe('player')
    expect(lines[0]!.frontId).toBe('front-1')
    expect(lines[0]!.fromAnchor).toEqual(THEATRE_ENTRY_POINTS.indochina!.anchor)
  })

  it('flera försändelser mot SAMMA front ger bara EN linje (ingen dubblett)', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    state.market.contracts.push(makeContract({ id: 'c1', frontId: 'front-1' }), makeContract({ id: 'c2', frontId: 'front-1' }))
    state.market.shipments.push(makeShipment({ id: 's1', contractId: 'c1' }), makeShipment({ id: 's2', contractId: 'c2' }))

    expect(playerSupplyLines(state, SECTOR_REGIONS).length).toBe(1)
  })

  it('en försändelse mot ett kontrakt utan frontId (t.ex. ett kriskontrakt) ger ingen linje', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    state.market.contracts.push(makeContract({ id: 'c1', frontId: null }))
    state.market.shipments.push(makeShipment({ id: 's1', contractId: 'c1' }))

    expect(playerSupplyLines(state, SECTOR_REGIONS)).toEqual([])
  })

  it('täcker båda teatrarna (front-laos → laos-hamnen)', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    state.market.contracts.push(makeContract({ id: 'c1', frontId: 'front-laos' }))
    state.market.shipments.push(makeShipment({ id: 's1', contractId: 'c1' }))

    const lines = playerSupplyLines(state, SECTOR_REGIONS)
    expect(lines[0]!.fromAnchor).toEqual(THEATRE_ENTRY_POINTS.laos!.anchor)
  })
})

describe('rivalSupplyLines', () => {
  it('ingen förändring i attribution → ingen linje', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    const prev = snapshotAttribution(state)
    expect(rivalSupplyLines(state, prev, SECTOR_REGIONS)).toEqual([])
  })

  it('en rivals attribution som stiger ger en linje i den fronten', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    const prev = snapshotAttribution(state)
    const rivalId = Object.keys(state.rivals)[0]!
    state.fronts['front-1']!.attribution[rivalId] = (state.fronts['front-1']!.attribution[rivalId] ?? 0) + 20

    const lines = rivalSupplyLines(state, prev, SECTOR_REGIONS)
    expect(lines.length).toBe(1)
    expect(lines[0]!.kind).toBe('rival')
    expect(lines[0]!.frontId).toBe('front-1')
  })

  it('spelarens egen attribution (PLAYER_ATTRIBUTION_KEY) ger ALDRIG en rival-linje', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    const prev = snapshotAttribution(state)
    state.fronts['front-1']!.attribution[PLAYER_ATTRIBUTION_KEY] =
      (state.fronts['front-1']!.attribution[PLAYER_ATTRIBUTION_KEY] ?? 0) + 20

    expect(rivalSupplyLines(state, prev, SECTOR_REGIONS)).toEqual([])
  })

  it('en attribution som SJUNKER (eller står still) ger ingen linje', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    const rivalId = Object.keys(state.rivals)[0]!
    state.fronts['front-1']!.attribution[rivalId] = 50
    const prev = snapshotAttribution(state)
    state.fronts['front-1']!.attribution[rivalId] = 40

    expect(rivalSupplyLines(state, prev, SECTOR_REGIONS)).toEqual([])
  })

  it('en okänd tidigare snapshot (t.ex. första turen) behandlas som noll, ingen krasch', () => {
    const state: GameState = createInitialState('indochina-slice', 'supply-seed')
    const rivalId = Object.keys(state.rivals)[0]!
    state.fronts['front-1']!.attribution[rivalId] = 10

    expect(() => rivalSupplyLines(state, {}, SECTOR_REGIONS)).not.toThrow()
    expect(rivalSupplyLines(state, {}, SECTOR_REGIONS).length).toBe(1)
  })
})
