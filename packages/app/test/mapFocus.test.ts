// Etapp 14, P204: kopplingen mellan kartan och mapparna (mapFocus.ts).
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import type { Order } from '@seventh-front/core'
import { ordersFilterLabel, ordersMatching, selectionGeoAnchor } from '../src/mapFocus.js'
import { CAPITALS } from '../src/capitals.js'

function order(id: string, buyerId: string, reason: Order['reason']): Order {
  return {
    id, buyerId, productId: 'm1_rifle', quantity: 10, statedBudget: 1000, trueBudget: 1000, referencePrice: 1000, requiredDeliveryTurns: 4,
    expiresTurn: 4, competingRivals: [], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 }, officialId: 'official-rvn-procurement',
    reason, frontId: null, advancePct: 0,
  } as Order
}

describe('ordersMatching', () => {
  const state = createInitialState('indochina-slice', 'map-focus-seed')
  const formation = state.fronts['front-1']!.formations[0]!
  state.market.openOrders = [
    order('a', 'rvn', { kind: 'PEACETIME_REPLACEMENT' }),
    order('b', 'laos', { kind: 'SCRIPTED' }),
    order('c', 'rvn', { kind: 'REPLACE_FORMATION_LOSSES', formationId: formation.id, formationName: formation.name, engagementWireId: 'x' }),
  ]
  it('utan filter alla ordrar; en köpare ger köparens; ett förband ger dess ersättningsordrar', () => {
    expect(ordersMatching(state, null).map((o) => o.id)).toEqual(['a', 'b', 'c'])
    expect(ordersMatching(state, { kind: 'buyer', factionId: 'rvn' }).map((o) => o.id)).toEqual(['a', 'c'])
    expect(ordersMatching(state, { kind: 'formation', formationId: formation.id, formationName: formation.name }).map((o) => o.id)).toEqual(['c'])
  })
  it('filtret har en läsbar etikett utan ID:n', () => {
    expect(ordersFilterLabel(state, { kind: 'buyer', factionId: 'rvn' })).toBe('Orders from Republic of Vietnam')
    expect(ordersFilterLabel(state, { kind: 'formation', formationId: formation.id, formationName: formation.name })).toBe(`Replacement orders for the ${formation.name}`)
  })
})

describe('selectionGeoAnchor', () => {
  const state = createInitialState('indochina-slice', 'map-focus-seed')
  it('ett land ligger vid sin huvudstad, ett förband i sin sektor', () => {
    expect(selectionGeoAnchor(state, { kind: 'country', countryId: 'south-vietnam' })).toEqual(CAPITALS.find((c) => c.factionId === 'rvn')!.anchor)
    const formation = state.fronts['front-1']!.formations[0]!
    expect(selectionGeoAnchor(state, { kind: 'formation', formationId: formation.id })).not.toBeNull()
  })
  it('ett hemmaverk har ingen plats på kartan', () => {
    const works = state.house.works[0]!
    expect(selectionGeoAnchor(state, { kind: 'works', facilityId: works.id })).toBeNull()
  })
})
