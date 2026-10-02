// customise.test.ts — P135 (ETAPP9_FORSLAG.md §8b.4, resterande del): kundanpassning av ett bud.
import { describe, expect, it } from 'vitest'
import { CUSTOMISE_TERMS, customiseBidTerm } from '../src/design.js'
import { playerWinCurve } from '../src/queries.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { GameState, Order, WireEvent } from '../src/types.js'

function order(_state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 10,
  }
}

function run(customise: boolean, seed: string): { state: GameState; wire: WireEvent[]; cursorMoved: boolean } {
  const state = createInitialState('indochina-slice', 'customise-seed')
  state.meta.turn = 0
  const o = order(state)
  state.market.openOrders = [o]
  const budgetBefore = state.factions['rvn']!.militaryBudget
  const cursor = state.meta.rngCursor
  const wire: WireEvent[] = []
  let seq = 0
  bidding({
    state,
    draft: state,
    submission: { standingOrders: [], bids: [{ orderId: o.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, ...(customise ? { customise: true } : {}) }], actions: [] },
    rng: createRng(seed, 0),
    emit: (e: Omit<WireEvent, 'id' | 'turn'>) => {
      const id = `0-${seq++}`
      wire.push({ id, turn: 0, ...e })
      return id
    },
    rejected: [],
  } as never)
  void budgetBefore
  return { state, wire, cursorMoved: state.meta.rngCursor !== cursor }
}

describe('kundanpassning (P135)', () => {
  it('ger en poängbonus och dyrare styckkostnad i vinstkurvan — samma funktion som bidding.ts läser', () => {
    const state = createInitialState('indochina-slice', 'customise-curve')
    state.meta.turn = 0
    const o = order(state)
    const plain = playerWinCurve(state, o, 'A')
    const custom = playerWinCurve(state, o, 'A', undefined, false, true)
    expect(customiseBidTerm()).toBeGreaterThan(0)
    expect(custom[0]!.price).toBeGreaterThan(plain[0]!.price) // prisgolvet = styckkostnad × antal
    expect(custom[0]!.price / plain[0]!.price).toBeCloseTo(CUSTOMISE_TERMS.costFactor, 2)
  })

  it('ett vanligt bud ger inget kundanpassat kontrakt och ingen skandal', () => {
    const { state, wire } = run(false, 'plain')
    const c = state.market.contracts[0]!
    expect(c.customised).toBeUndefined()
    expect(c.scandalHalved).toBeUndefined()
    expect(c.quantity).toBe(100)
    expect(wire.some((e) => e.headline.startsWith('SCANDAL IN'))).toBe(false)
  })

  it('ett kundanpassat kontrakt har högre styckkostnad; över många utfall inträffar skandalen ibland och halverar antal och pris', () => {
    let scandals = 0
    let normal = 0
    for (let i = 0; i < 300; i++) {
      const { state, wire } = run(true, `c-${i}`)
      const c = state.market.contracts[0]
      if (!c) continue
      expect(c.customised).toBe(true)
      if (c.scandalHalved) {
        scandals++
        expect(c.quantity).toBe(Math.round(100 * CUSTOMISE_TERMS.scandalOrderFactor))
        expect(c.price).toBe(Math.round(1_900_000 * CUSTOMISE_TERMS.scandalOrderFactor))
        expect(wire.some((e) => e.headline.startsWith('SCANDAL IN') && e.headline.includes('HALVES THE ORDER'))).toBe(true)
      } else {
        normal++
        expect(c.quantity).toBe(100)
        expect(c.price).toBe(1_900_000)
      }
    }
    expect(scandals).toBeGreaterThan(0)
    expect(normal).toBeGreaterThan(scandals) // standardrisken är en minoritet
  })

  it('skandalen sänker köparens relation och återför halva beloppet till köparens budget', () => {
    for (let i = 0; i < 300; i++) {
      const base = createInitialState('indochina-slice', 'customise-seed')
      const relBefore = base.factions['rvn']!.relationToPlayer
      const budgetBefore = base.factions['rvn']!.militaryBudget
      const { state } = run(true, `rel-${i}`)
      const c = state.market.contracts[0]
      if (c?.scandalHalved) {
        const f = state.factions['rvn']!
        expect(f.militaryBudget).toBe(budgetBefore - c.price)
        expect(f.relationToPlayer).toBeLessThanOrEqual(relBefore) // −förlusten, plus en ev. relationsvinst vid tilldelning drogs inte (skandal)
        return
      }
    }
    throw new Error('ingen skandal i 300 försök')
  })
})
