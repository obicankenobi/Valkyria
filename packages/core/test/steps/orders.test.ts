import { describe, expect, it } from 'vitest'
import { orders } from '../../src/resolve/steps/orders.js'
import { getProduct } from '../../src/pricing.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('orders (isolerat steg, spec avsnitt 4.1, 6)', () => {
  it('scenariots scriptade restricted-order dyker upp exakt på den angivna turen, inte tidigare eller senare', () => {
    const before = createInitialState('indochina-slice', 'seed')
    before.meta.turn = 9
    orders(makeCtx(before, 'orders-seed').ctx)
    expect(before.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)

    const atTurn = createInitialState('indochina-slice', 'seed')
    atTurn.meta.turn = 10 // indochina-slice.json: scriptedEvents[0].turn
    orders(makeCtx(atTurn, 'orders-seed').ctx)
    const restricted = atTurn.market.openOrders.find((o) => o.productId === 'mk9_longhand_shell')
    expect(restricted).toBeDefined()
    expect(restricted!.quantity).toBe(8)
    expect(restricted!.buyerId).toBe('rvn')

    const after = createInitialState('indochina-slice', 'seed')
    after.meta.turn = 11
    orders(makeCtx(after, 'orders-seed').ctx)
    expect(after.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)
  })

  it('mk9 (restricted) har ett baseCost tre till fem gånger en ordinär produkts (designkravet i spec avsnitt 6)', () => {
    // ETAPP1_5_TEKNISK_SPEC.md avsnitt 4.3 höjde mk9_longhand_shell.baseCost till
    // 1 600 000 EXAKT för att uppfylla det här kravet, kalibrerat mot
    // ch3_transport_helicopter (per-produkt baseCost, inte en scriptad orders
    // totala referencePrice — den senare beror även på den scriptade kvantiteten
    // och råkar inte längre ligga i intervallet efter höjningen, se ANDRINGSLOGG.md).
    const restricted = getProduct('mk9_longhand_shell')
    const ordinary = getProduct('ch3_transport_helicopter')
    const ratio = restricted.baseCost / ordinary.baseCost
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(ratio).toBeLessThanOrEqual(5)
  })

  it('ordinarie generering väljer aldrig en restricted produkt', () => {
    // Kör många turer/seeds för att ge slumpen chans att välja fel om den kunde.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const trial = createInitialState('indochina-slice', 'seed')
      for (let turn = 0; turn < 9; turn++) {
        // Stannar före tur 10 så den SCRIPTADE restricted-ordern inte blandas in —
        // den här testar bara den ordinarie genereringens produktval.
        trial.meta.turn = turn
        orders(makeCtx(trial, seed + turn).ctx)
      }
      expect(trial.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)
    }
  })

  it('genererar inga ordrar för en bankrutt eller embargerad faktion', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.factions['rvn']!.bankrupt = true
    state.factions['nlf']!.embargoed = true
    orders(makeCtx(state, 'orders-seed').ctx)
    expect(state.market.openOrders.every((o) => o.buyerId === 'laos')).toBe(true)
  })

  it('varje genererad order har expiresTurn > skapelseturen (order-lifetime-invarianten)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 3
    orders(makeCtx(state, 'orders-seed').ctx)
    for (const order of state.market.openOrders) {
      expect(order.expiresTurn).toBeGreaterThan(3)
    }
  })

  it('statedBudget är aldrig högre än trueBudget', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (let turn = 0; turn < 20; turn++) {
      state.meta.turn = turn
      orders(makeCtx(state, `budget-seed-${turn}`).ctx)
    }
    expect(state.market.openOrders.length).toBeGreaterThan(0)
    for (const order of state.market.openOrders) {
      expect(order.statedBudget).toBeLessThanOrEqual(order.trueBudget)
    }
  })

  it('emittar minst en händelse per skapad order (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 10 // garanterar minst den scriptade ordern
    const { ctx, emitted } = makeCtx(state, 'orders-seed')

    const before = state.market.openOrders.length
    orders(ctx)

    expect(state.market.openOrders.length).toBeGreaterThan(before)
    expect(emitted.length).toBeGreaterThanOrEqual(state.market.openOrders.length - before)
  })

  it('(P19 klart-när) en faktion vars militaryBudget är slut utlyser inga ordinarie ordrar (avsnitt 7.1.C)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.factions['rvn']!.militaryBudget = 0
    state.factions['nlf']!.militaryBudget = 0
    // laos har kvar sin normala budget — kontroll: genereringen fungerar alls.

    for (let turn = 0; turn < 9; turn++) {
      // Stannar före tur 10 — samma skäl som "ordinarie generering väljer aldrig
      // en restricted produkt" ovan: den scriptade restricted-ordern (mot rvn)
      // ska INTE blandas in här, den prövas medvetet i en egen rad i ANDRINGSLOGG.md.
      state.meta.turn = turn
      orders(makeCtx(state, `budget-exhausted-seed-${turn}`).ctx)
    }

    expect(state.market.openOrders.some((o) => o.buyerId === 'rvn' || o.buyerId === 'nlf')).toBe(false)
    expect(state.market.openOrders.some((o) => o.buyerId === 'laos')).toBe(true)
  })
})
