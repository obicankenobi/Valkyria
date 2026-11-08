// Etapp 14, P206: konvojlinjer för öppna ersättningsordrar och etiketten på spelarens leveranslinje (supplyLines.ts).
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import type { Order } from '@seventh-front/core'
import { orderConvoys, playerSupplyLabel, THEATRE_ENTRY_POINTS } from '../src/supplyLines.js'
import { SECTOR_REGIONS } from '../src/sectorRegions.js'
import { shortDesignation } from '../src/displayNames.js'

function replacementOrder(formationId: string, formationName: string): Order {
  return {
    id: 'order-convoy', buyerId: 'rvn', productId: 'm1_rifle', quantity: 80, statedBudget: 1000, trueBudget: 1000, referencePrice: 1000,
    requiredDeliveryTurns: 4, expiresTurn: 4, competingRivals: [], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
    officialId: 'official-rvn-procurement', reason: { kind: 'REPLACE_FORMATION_LOSSES', formationId, formationName, engagementWireId: 'x' },
    frontId: 'front-1', advancePct: 0,
  } as Order
}

describe('orderConvoys', () => {
  it('en öppen ersättningsorder ger en konvoj från teaterns ingångspunkt till förbandets egen sektor, med antal och produkt', () => {
    const state = createInitialState('indochina-slice', 'convoy-seed')
    const front = state.fronts['front-1']!
    const formation = front.formations[0]!
    state.market.openOrders = [replacementOrder(formation.id, formation.name)]
    const [convoy] = orderConvoys(state, SECTOR_REGIONS)
    expect(convoy).toBeDefined()
    expect(convoy!.fromAnchor).toEqual(THEATRE_ENTRY_POINTS[front.theatreId]!.anchor)
    expect(convoy!.toAnchor).toEqual(SECTOR_REGIONS[front.theatreId]!.find((r) => r.sectorId === formation.sectorId)!.anchor)
    expect(convoy!.label).toMatch(/^WANTED · 80× /)
    expect(convoy!.label).not.toContain(',')
  })
  it('andra ordrar ger ingen konvoj', () => {
    const state = createInitialState('indochina-slice', 'convoy-seed')
    state.market.openOrders = [{ ...replacementOrder('x', 'x'), reason: { kind: 'PEACETIME_REPLACEMENT' } }]
    expect(orderConvoys(state, SECTOR_REGIONS)).toEqual([])
  })
})

describe('playerSupplyLabel', () => {
  it('säger hur mycket som är på väg till fronten och när det första anländer', () => {
    const state = createInitialState('indochina-slice', 'supply-label-seed')
    state.market.contracts.push({
      id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B', dueTurn: 5,
      status: 'active', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    state.market.shipments.push({ id: 's1', contractId: 'c1', units: 5, arrivalTurn: 3 }, { id: 's2', contractId: 'c1', units: 4, arrivalTurn: 2 })
    expect(playerSupplyLabel(state, 'front-1')).toBe('YOU · 9 UNITS · ARRIVES Q3 1964')
    expect(playerSupplyLabel(state, 'front-laos')).toBeNull()
  })
})

describe('shortDesignation', () => {
  it('förkortar förbandsnamnen till kartbeteckningar', () => {
    expect(shortDesignation('1st Infantry Division')).toBe('1st Inf Div')
    expect(shortDesignation('1st Armoured Cavalry Regiment')).toBe('1st Armd Cav Rgt')
    expect(shortDesignation('559th Transportation Group')).toBe('559th Trans Gp')
  })
})
