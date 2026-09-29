// thisQuarter.test.ts — P83 (ETAPP7_TEKNISK_SPEC.md §7.7, §13).
import { describe, expect, it } from 'vitest'
import { createInitialState, DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState, Order, WireEvent } from '@seventh-front/core'
import { deriveQuarterlyNotice, deriveThisQuarter } from '../src/thisQuarter.js'

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: 'order-1',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 500,
    statedBudget: 200_000,
    trueBudget: 200_000,
    referencePrice: 380,
    requiredDeliveryTurns: 4,
    expiresTurn: 6,
    competingRivals: [],
    weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'SCRIPTED' },
    frontId: null,
    advancePct: 0,
    ...overrides,
  }
}

describe('deriveThisQuarter (P83, §7.7)', () => {
  it('en tom, nystartad state har inga lägen (utom eventuellt öppna ordrar scenariot inte har vid tur 0)', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-empty-seed')
    expect(deriveThisQuarter(state)).toEqual([])
  })

  it('en öppen order ger en order-rad som pekar mot contracts', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-order-seed')
    state.market.openOrders.push(makeOrder({ id: 'o1' }))

    const items = deriveThisQuarter(state)
    const orderItem = items.find((i) => i.kind === 'order')
    expect(orderItem).toBeTruthy()
    expect(orderItem!.target).toEqual({ view: 'contracts' })
    expect(orderItem!.label).toContain('M-1 Standard Infantry Rifle')
  })

  it('en station med exponering under gränsen ger inget läge, över gränsen ger ett som pekar mot landet', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-station-seed')
    const station = state.house.stations.find((s) => s.nation === 'rvn')!
    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold - 1
    expect(deriveThisQuarter(state).some((i) => i.kind === 'station')).toBe(false)

    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold
    const items = deriveThisQuarter(state)
    const stationItem = items.find((i) => i.kind === 'station')
    expect(stationItem).toBeTruthy()
    expect(stationItem!.target).toEqual({ view: 'operations', factionId: 'rvn' })
  })

  it('en tjänsteman med låg standing ger ett läge, en fallen tjänsteman ignoreras', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-official-seed')
    const official = Object.values(state.officials).find((o) => o.factionId === 'rvn')!
    official.standing = 10
    const items = deriveThisQuarter(state)
    expect(items.some((i) => i.kind === 'official' && i.id === `official-${official.id}`)).toBe(true)

    official.status = 'fallen'
    expect(deriveThisQuarter(state).some((i) => i.kind === 'official')).toBe(false)
  })

  it('ett kontrakt som förfaller nästa tur ger ett läge, ett med gott om tid gör det inte', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-contract-seed')
    state.market.contracts.push({
      id: 'c1',
      buyerId: 'rvn',
      productId: 'm1_rifle',
      quantity: 100,
      unitsDelivered: 0,
      price: 40_000,
      unitCostAtSigning: 290,
      grade: 'B',
      dueTurn: state.meta.turn + 1,
      status: 'active',
      lateEventId: null,
      frontId: null, advancePct: 0, advancePaid: 0,
    })
    expect(deriveThisQuarter(state).some((i) => i.kind === 'contract' && i.id === 'contract-c1')).toBe(true)

    state.market.contracts[0]!.dueTurn = state.meta.turn + 10
    expect(deriveThisQuarter(state).some((i) => i.kind === 'contract')).toBe(false)
  })

  it('skuld nära kredittaket ger ett läge som pekar mot company', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-credit-seed')
    state.house.creditLimit = 1000
    state.house.debt = 950
    const items = deriveThisQuarter(state)
    const creditItem = items.find((i) => i.kind === 'credit')
    expect(creditItem).toBeTruthy()
    expect(creditItem!.target).toEqual({ view: 'company' })

    state.house.debt = 100
    expect(deriveThisQuarter(state).some((i) => i.kind === 'credit')).toBe(false)
  })

  it('en väntande kris ger ett läge som pekar mot news', () => {
    const state: GameState = createInitialState('indochina-slice', 'this-quarter-crisis-seed')
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
    const items = deriveThisQuarter(state)
    const crisisItem = items.find((i) => i.kind === 'crisis')
    expect(crisisItem).toBeTruthy()
    expect(crisisItem!.target).toEqual({ view: 'news' })
  })
})

describe('deriveQuarterlyNotice (P81-11, ETAPP7_TEKNISK_SPEC.md §13)', () => {
  function makeEvent(overrides: Partial<WireEvent>): WireEvent {
    return {
      id: 'e-1',
      turn: 5,
      severity: 'headline',
      scope: 'market',
      headline: 'TEST',
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: null,
      ...overrides,
    }
  }

  it('en tom wire ger en tom lista', () => {
    const state: GameState = createInitialState('indochina-slice', 'quarterly-notice-empty-seed')
    expect(deriveQuarterlyNotice(state)).toEqual([])
  })

  it('bara SENASTE turens market-händelser tas med, tidigare turer ignoreras', () => {
    const state: GameState = createInitialState('indochina-slice', 'quarterly-notice-seed')
    state.wire.push(
      makeEvent({ id: 'old', turn: 3, headline: 'MERIDIAN ARMS WINS CONTRACT: OLD', actorIsPlayer: true }),
      makeEvent({ id: 'new', turn: 5, headline: 'MERIDIAN ARMS WINS CONTRACT: NEW', actorIsPlayer: true }),
    )
    const items = deriveQuarterlyNotice(state)
    expect(items.map((i) => i.id)).toEqual(['new'])
  })

  it('spelarens egen vinst får en check, en rivals vinst ett kryss', () => {
    const state: GameState = createInitialState('indochina-slice', 'quarterly-notice-win-loss-seed')
    state.wire.push(
      makeEvent({ id: 'won', turn: 5, headline: 'MERIDIAN ARMS WINS CONTRACT: X', actorIsPlayer: true }),
      makeEvent({ id: 'lost', turn: 5, headline: 'RIVAL CO WINS CONTRACT: Y', actorIsPlayer: false }),
    )
    const items = deriveQuarterlyNotice(state)
    expect(items.find((i) => i.id === 'won')!.icon).toBe('✓')
    expect(items.find((i) => i.id === 'lost')!.icon).toBe('✗')
  })

  it('leverans och fullföljt kontrakt tas med, en icke-market-händelse ignoreras', () => {
    const state: GameState = createInitialState('indochina-slice', 'quarterly-notice-delivery-seed')
    state.wire.push(
      makeEvent({ id: 'delivered', turn: 5, headline: 'DELIVERED 10× M-1 RIFLE TO RVN (+£4,000)' }),
      makeEvent({ id: 'fulfilled', turn: 5, headline: 'CONTRACT c1 FULFILLED: M-1 RIFLE TO RVN' }),
      makeEvent({ id: 'other', turn: 5, headline: 'SOME OTHER MARKET NOISE' }),
      makeEvent({ id: 'non-market', turn: 5, scope: 'front', headline: 'FRONT-1: 3 CASUALTIES THIS QUARTER' }),
    )
    const items = deriveQuarterlyNotice(state)
    expect(items.map((i) => i.id).sort()).toEqual(['delivered', 'fulfilled'])
  })
})
