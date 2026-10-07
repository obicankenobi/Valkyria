// orderLocks.test.ts — P185 (ETAPP11_FORSLAG.md §9b, 11O): huvudleverantörsregeln syns på samma sätt överallt — skälet i klartext kommer ur validateBid (kärnan). Här: listan, kartans orderlager,
// kartans informationskort och This Quarter.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { lockedOrders } from '../src/orderLocks.js'
import { layerTags } from '../src/mapLayers.js'
import { deriveMapInfo } from '../src/mapInfo.js'
import { deriveThisQuarter } from '../src/thisQuarter.js'

// Appen läser kärnan ur dist, så testerna kör mot den mjuka spärren som datan har: en liten order går igenom, en större utan verk är låst.

function order(overrides: Partial<Order>): Order {
  return {
    id: 'order-1', buyerId: 'rvn', productId: 'm3_apc', quantity: 40, statedBudget: 3_000_000, trueBudget: 4_000_000, referencePrice: 3_000_000, requiredDeliveryTurns: 5, expiresTurn: 3,
    competingRivals: [], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 }, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
    ...overrides,
  }
}

function withOrders(seed: string, orders: Order[]): GameState {
  const state = createInitialState('indochina-slice', seed)
  state.market.openOrders = orders
  return state
}

describe('lockedOrders', () => {
  it('listar bara de öppna ordrar huset inte får bjuda på, med skälet — en pansarorder är låst, en artilleriorder är det inte', () => {
    const state = withOrders('locks-1', [order({ id: 'apc' }), order({ id: 'gun', productId: '105mm_field_gun', quantity: 80 })])
    const locked = lockedOrders(state)
    expect(locked.map((l) => l.order.id)).toEqual(['apc'])
    expect(locked[0]!.reason).toMatch(/^Requires an Assembly Works for armour/)
  })

  it('kan begränsas till en köpare', () => {
    const state = withOrders('locks-2', [order({ id: 'a', buyerId: 'rvn' }), order({ id: 'b', buyerId: 'nlf', officialId: 'official-nlf-procurement' })])
    expect(lockedOrders(state, 'nlf').map((l) => l.order.id)).toEqual(['b'])
  })

  it('en liten order (den mjuka spärrens undantag) är inte låst', () => {
    expect(lockedOrders(withOrders('locks-3', [order({ id: 'small', quantity: 10 })]))).toEqual([])
  })
})

describe('kartans orderlager och informationskort', () => {
  it('orderlagrets tagg säger hur många av köparens öppna ordrar som är låsta', () => {
    const state = withOrders('locks-map', [order({ id: 'apc' }), order({ id: 'gun', productId: '105mm_field_gun', quantity: 80 })])
    const tag = layerTags(state, 'orders').find((t) => t.id === 'rvn')!
    expect(tag.lines[0]).toBe('2 open, 1 locked')
  })

  it('utan låsta ordrar står bara antalet öppna', () => {
    const state = withOrders('locks-map-2', [order({ id: 'gun', productId: '105mm_field_gun', quantity: 80 })])
    expect(layerTags(state, 'orders').find((t) => t.id === 'rvn')!.lines[0]).toBe('1 open')
  })

  it('köparens informationskort har en rad "Locked for you" med skälet', () => {
    const state = withOrders('locks-info', [order({ id: 'apc' })])
    const info = deriveMapInfo(state, { kind: 'country', countryId: 'south-vietnam' })
    const row = info?.rows.find((r) => r.label === 'Locked for you')
    expect(row?.value).toMatch(/^Requires an Assembly Works for armour/)
  })
})

describe('This Quarter', () => {
  it('en låst order står med skälet i klartext; en vanlig order som förut', () => {
    const state = withOrders('locks-tq', [order({ id: 'apc' }), order({ id: 'gun', productId: '105mm_field_gun', quantity: 80 })])
    const items = deriveThisQuarter(state).filter((i) => i.kind === 'order')
    const locked = items.find((i) => i.id === 'order-apc')!
    const open = items.find((i) => i.id === 'order-gun')!
    expect(locked.label).toContain('Locked order')
    expect(locked.label).toContain('Requires an Assembly Works for armour')
    expect(open.label).toContain('New order')
    expect(open.label).not.toContain('Requires')
  })
})
