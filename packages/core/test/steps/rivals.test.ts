import { describe, expect, it } from 'vitest'
import { rivals } from '../../src/resolve/steps/rivals.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

function makeCtx(
  state: GameState,
  submission: TurnSubmission,
): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission,
    rng: createRng('rivals-test', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('rivals (isolerat steg, DESIGN.md avsnitt 12 "Rivalhus")', () => {
  it('(P8) en spelare som varken lägger bud eller använder handlingar räknas som passiv — varje rivalhus växer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital
    const marketShareBefore = rival.marketShare

    const { ctx, emitted } = makeCtx(state, { standingOrders: [], bids: [], actions: [] })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore + balance.rivalPassiveGrowthCapital)
    expect(rival.marketShare).toBe(marketShareBefore + balance.rivalPassiveGrowthMarketShare)
    expect(emitted.some((e) => e.subjectId === 'brandt' && e.headline.includes('EXPANDS'))).toBe(true)
  })

  it('alla rivalhus växer samtidigt när spelaren är passiv, inte bara ett', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = Object.fromEntries(Object.entries(state.rivals).map(([id, r]) => [id, r.capital]))

    rivals(makeCtx(state, { standingOrders: [], bids: [], actions: [] }).ctx)

    for (const [id, rival] of Object.entries(state.rivals)) {
      expect(rival.capital).toBe(before[id]! + balance.rivalPassiveGrowthCapital)
    }
  })

  it('en spelare som lägger minst ett bud räknas INTE som passiv — ingen tillväxt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital

    const { ctx, emitted } = makeCtx(state, {
      standingOrders: [],
      bids: [{ orderId: 'does-not-matter', price: 1000, deliveryTurns: 1, grade: 'A', bribe: 0 }],
      actions: [],
    })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore)
    expect(emitted).toEqual([])
  })

  it('en spelare som använder minst en handling räknas INTE som passiv — ingen tillväxt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital

    const { ctx } = makeCtx(state, {
      standingOrders: [],
      bids: [],
      actions: [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1 } }],
    })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore)
  })

  it('marketShare klamras aldrig över 100', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.marketShare = 100

    rivals(makeCtx(state, { standingOrders: [], bids: [], actions: [] }).ctx)

    expect(rival.marketShare).toBe(100)
  })
})
