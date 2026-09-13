import { describe, expect, it } from 'vitest'
import { applyActions } from '../../src/resolve/steps/applyActions.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, PlayerAction, TurnSubmission, WireEvent } from '../../src/types.js'

function makeCtx(
  state: GameState,
  actions: PlayerAction[],
): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const submission: TurnSubmission = { standingOrders: [], bids: [], actions }
  const ctx: ResolveContext = {
    draft: state,
    submission,
    rng: createRng('apply-actions-test', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('applyActions (isolerat steg, spec avsnitt 3.1, 5 "Ekonomi") — bara TAKE_LOAN', () => {
  it('(P8) ett lån inom creditLimit accepteras: debt och treasury ökar, en händelse emitteras (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 1000000
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 500000 } }])
    applyActions(ctx)

    expect(state.house.debt).toBe(500000)
    expect(state.house.treasury).toBe(treasuryBefore + 500000)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('TAKES OUT A LOAN'))).toBe(true)
  })

  it('(spec avsnitt 5, "Ekonomi") ett lån över creditLimit avvisas med reason "credit limit exceeded"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 100000
    const debtBefore = state.house.debt
    const treasuryBefore = state.house.treasury

    const action: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 200000 } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.debt).toBe(debtBefore)
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'credit limit exceeded' }])
  })

  it('flera TAKE_LOAN i samma inskickning bokförs mot en krympande lokal kreditrest, inte var för sig mot samma creditLimit', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 100000

    const first: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }
    const second: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }
    const { ctx } = makeCtx(state, [first, second])
    applyActions(ctx)

    expect(state.house.debt).toBe(60000) // bara den första fick plats (60 000 <= 100 000, men 60 000+60 000 > 100 000)
    expect(ctx.rejected).toEqual([{ action: second, reason: 'credit limit exceeded' }])
  })

  it('ett ogiltigt låneutfall (icke-numeriskt/negativt amount) avvisas med reason "invalid loan amount"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 1000000

    const badAmount: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: -500 } }
    const badType: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 'a lot' } }
    const { ctx } = makeCtx(state, [badAmount, badType])
    applyActions(ctx)

    expect(state.house.debt).toBe(0)
    expect(ctx.rejected).toEqual([
      { action: badAmount, reason: 'invalid loan amount' },
      { action: badType, reason: 'invalid loan amount' },
    ])
  })

  it('alla andra handlingstyper förblir no-ops (fyra av fem PlayerAction-typer, fyra av fem INTERNAL-op — se ANDRINGSLOGG.md)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = JSON.parse(JSON.stringify(state.house)) as typeof state.house

    const { ctx, emitted } = makeCtx(state, [
      { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 },
      { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} },
      { type: 'INTERNAL', op: 'HIRE', payload: {} },
      { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: {} },
      { type: 'INTERNAL', op: 'REPAY', payload: { amount: 1 } },
    ])
    applyActions(ctx)

    expect(state.house).toEqual(before)
    expect(ctx.rejected).toEqual([])
    expect(emitted).toEqual([])
  })
})
