// bidTerms.test.ts — P106 (ETAPP9_FORSLAG.md §4.1–4.2, beslut 9C, skyddsräcke 1 och 3).
//
// Två termer läggs till spelarens budpoäng EFTER computeScore (som BROKER-bonusen i P57): `techTerm`
// (teknik över kravet) och specialiseringstermen (+10 % anbudsstyrka i den egna kategorin). Samma term
// läses av bidding.ts, bidEstimate.winBand och playerWinCurve — ett test underkänner om de skiljer sig.
// Specialiseringen halverar också forskningskostnaden (rndOverhead) för projekt i den egna kategorin.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { playerBidTerm, specialisationTerm, techTerm } from '../src/bidTerms.js'
import { bidEstimate, playerWinCurve } from '../src/queries.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { getProduct } from '../src/pricing.js'
import type { GameState, Order } from '../src/types.js'

const B = balance as unknown as {
  scoreBase: number
  techMarginWeight: number
  specialisationBidBonusPct: number
  specialisationRndCostFactor: number
  fixedCosts: { rndOverhead: number }
}

function orderFor(state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 0,
  }
}

describe('techTerm (P106, §4.1)', () => {
  it('är techMarginWeight × min(2, techLevel − techRequired)', () => {
    expect(techTerm(3, 3)).toBe(0)
    expect(techTerm(4, 3)).toBe(B.techMarginWeight * 1)
    expect(techTerm(5, 3)).toBe(B.techMarginWeight * 2)
    expect(techTerm(9, 3)).toBe(B.techMarginWeight * 2) // taket: mer än två nivåer över kravet ger inget extra
  })

  it('är aldrig negativ — en produkt under kravet är redan avvisad av diskvalificeringsgrinden', () => {
    expect(techTerm(1, 4)).toBe(0)
  })
})

describe('specialisationTerm (P106, §4.2)', () => {
  it('är +specialisationBidBonusPct % av scoreBase i den egna kategorin och 0 i alla andra', () => {
    const bonus = (B.scoreBase * B.specialisationBidBonusPct) / 100
    expect(specialisationTerm('artillery', 'artillery')).toBe(bonus)
    expect(specialisationTerm('artillery', 'naval')).toBe(0)
    expect(specialisationTerm('infantry', 'artillery')).toBe(0)
  })
})

describe('playerBidTerm — en formel, en källa (skyddsräcke 3)', () => {
  it('är summan av de två termerna för husets faktiska teknik och specialisering', () => {
    const state = createInitialState('indochina-slice', 'bidterm-seed')
    const product = getProduct('105mm_field_gun')
    const expected =
      techTerm(state.house.techLevel[product.category], product.techRequired) +
      specialisationTerm(state.house.specialisation, product.category)
    expect(playerBidTerm(state.house, product)).toBe(expected)
    expect(expected).toBeGreaterThan(0) // startläget: artilleri är specialiseringen och teknik 7 mot krav 2
  })

  it('bidEstimate.winBand och playerWinCurve ser termen: sänkt teknik och annan specialisering ger lägre vinstchans', () => {
    const strong = createInitialState('indochina-slice', 'bidterm-curve-seed')
    const weak = createInitialState('indochina-slice', 'bidterm-curve-seed')
    weak.house.techLevel.artillery = getProduct('105mm_field_gun').techRequired
    weak.house.specialisation = 'infantry'
    const order = orderFor(strong)

    const strongCurve = playerWinCurve(strong, order, 'A')
    const weakCurve = playerWinCurve(weak, order, 'A')
    expect(strongCurve.map((p) => p.price)).toEqual(weakCurve.map((p) => p.price))
    const sum = (c: { confidence: number }[]): number => c.reduce((s, p) => s + p.confidence, 0)
    expect(sum(strongCurve)).toBeGreaterThan(sum(weakCurve))

    const strongBand = bidEstimate(strong, order, 'A').winBand
    const weakBand = bidEstimate(weak, order, 'A').winBand
    expect(sum(strongBand)).toBeGreaterThanOrEqual(sum(weakBand))
  })

  it('bidding.ts avgör med samma term som playerWinCurve lovar: frekvens och kurva stämmer inom ±15 pp med termen på', () => {
    const base = createInitialState('indochina-slice', 'bidterm-parity-seed')
    const order = orderFor(base)
    const curve = playerWinCurve(base, order, 'A')
    // Mitt i kurvan, där konfidensen inte är mättad vid 0 eller 100 och termen därför syns.
    const point = curve.reduce((best, p) => (Math.abs(p.confidence - 50) < Math.abs(best.confidence - 50) ? p : best))

    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const state = createInitialState('indochina-slice', `bidterm-parity-${i}`)
      const testOrder: Order = { ...orderFor(state), expiresTurn: 0 }
      state.market.openOrders = [testOrder]
      state.meta.turn = 0
      bidding({
        state,
        draft: state,
        submission: {
          standingOrders: [],
          bids: [{ orderId: testOrder.id, price: point.price, deliveryTurns: testOrder.requiredDeliveryTurns, grade: 'A', bribe: 0 }],
          actions: [],
        },
        rng: createRng(`bidterm-parity-${i}`, 0),
        emit: () => 't',
        rejected: [],
      })
      if (state.market.contracts.length > 0) wins++
    }
    expect(Math.abs((wins / SEEDS) * 100 - point.confidence)).toBeLessThanOrEqual(15)
  })
})

describe('specialiseringen halverar forskningskostnaden i den egna kategorin (P106, §4.2)', () => {
  it('ett projekt i specialiseringen kostar rndOverhead × specialisationRndCostFactor per tur, andra kategorier fullt', () => {
    const own = createInitialState('indochina-slice', 'rnd-own-seed')
    own.house.rnd = [{ id: 'r1', category: own.house.specialisation, turnsRemaining: 3, turnsTotal: 6 }]
    const other = createInitialState('indochina-slice', 'rnd-other-seed')
    other.house.rnd = [{ id: 'r2', category: 'naval', turnsRemaining: 3, turnsTotal: 6 }]

    expect(computeFixedCostsBreakdown(own.house).rndOverhead).toBe(Math.round(B.fixedCosts.rndOverhead * B.specialisationRndCostFactor))
    expect(computeFixedCostsBreakdown(other.house).rndOverhead).toBe(B.fixedCosts.rndOverhead)
  })

  it('ett hus utan forskningsprojekt betalar inget, och summan över flera projekt räknas per projekt', () => {
    const state = createInitialState('indochina-slice', 'rnd-sum-seed')
    expect(computeFixedCostsBreakdown(state.house).rndOverhead).toBe(0)
    state.house.rnd = [
      { id: 'r1', category: state.house.specialisation, turnsRemaining: 3, turnsTotal: 6 },
      { id: 'r2', category: 'naval', turnsRemaining: 3, turnsTotal: 6 },
    ]
    expect(computeFixedCostsBreakdown(state.house).rndOverhead).toBe(
      Math.round(B.fixedCosts.rndOverhead * B.specialisationRndCostFactor) + B.fixedCosts.rndOverhead,
    )
  })
})
