import { describe, expect, it } from 'vitest'
import { orders } from '../../src/resolve/steps/orders.js'
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

  it('den scriptade ordern fryser ett referencePrice tre till fem gånger en ordinär order (design­kravet i spec avsnitt 6)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 10
    orders(makeCtx(state, 'orders-seed').ctx)
    const restricted = state.market.openOrders.find((o) => o.productId === 'mk9_longhand_shell')!

    // Designdokumentets eget exempel: 120 st 105mm-kanoner à referencePrice ≈ 2 400 000.
    const ordinaryOrderValue = 2400000
    expect(restricted.referencePrice).toBeGreaterThanOrEqual(ordinaryOrderValue * 3)
    expect(restricted.referencePrice).toBeLessThanOrEqual(ordinaryOrderValue * 5)
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
})
