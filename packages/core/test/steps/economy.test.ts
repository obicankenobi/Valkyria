import { describe, expect, it } from 'vitest'
import { economy } from '../../src/resolve/steps/economy.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng('economy-test', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('economy (isolerat steg, spec avsnitt 5)', () => {
  it('drar fasta kostnader från treasury och emittar en förklaring (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = state.house.treasury
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    expect(state.house.treasury).toBeLessThan(before)
    expect(emitted.some((e) => e.headline.includes('FIXED COSTS'))).toBe(true)
  })

  it('startlägets fasta kostnad: payroll + line upkeep×4 + station upkeep×1 + 0 R&D = 510 000', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = state.house.treasury
    const { ctx } = makeCtx(state)

    economy(ctx)

    expect(before - state.house.treasury).toBe(510000)
  })

  it('drar ingen ränta när skulden är 0', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    expect(emitted.some((e) => e.headline.includes('INTEREST'))).toBe(false)
  })

  it('drar ränta = round(debt × debtRateAnnual / 4) när det finns skuld', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.debt = 1000000
    const before = state.house.treasury
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    const expectedInterest = Math.round((1000000 * state.house.debtRateAnnual) / 4)
    expect(before - state.house.treasury).toBe(510000 + expectedInterest)
    expect(emitted.some((e) => e.headline.includes('INTEREST'))).toBe(true)
  })

  it('ökar insolventTurns när treasury blir negativ efter kostnaderna', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.treasury = 100 // räcker inte till 510 000 i fasta kostnader
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    expect(state.house.treasury).toBeLessThan(0)
    expect(state.house.insolventTurns).toBe(1)
    expect(emitted.some((e) => e.severity === 'report' && e.headline.includes('DEFICIT'))).toBe(true)
  })

  it('nollställer insolventTurns när treasury är tillbaka i svart', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.insolventTurns = 2
    state.house.treasury = 100000000 // gott om marginal
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    expect(state.house.insolventTurns).toBe(0)
    expect(emitted.some((e) => e.headline.includes('SOLVENCY'))).toBe(true)
  })

  it('creditLimit är 0 för ett hus utan intäktshistorik, oavsett rykte eller hemstat', () => {
    const state = createInitialState('indochina-slice', 'seed')
    expect(state.house.revenueByTurn).toEqual([])
    const { ctx } = makeCtx(state)

    economy(ctx)

    expect(state.house.creditLimit).toBe(0)
  })

  it('creditLimit räknas enligt formeln (trailingRevenue × creditMultiple × reliabilityMult × homeStateMult − debt) när det finns intäkter', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 5
    // index = turn. De fyra senaste (2..5) summerar till 7 000 000.
    state.house.revenueByTurn = [0, 0, 1000000, 2000000, 3000000, 1000000]
    state.house.reputation.reliability = 50 // reliabilityMult = 0.5 + 0.5×1.0 = 1.0
    state.house.homeState = 'neutral' // homeStateMult = 1.0
    const { ctx, emitted } = makeCtx(state)

    economy(ctx)

    const trailingRevenue = 1000000 + 2000000 + 3000000 + 1000000
    const expected = Math.max(0, Math.round(trailingRevenue * 1.6 * 1.0 * 1.0) - state.house.debt)
    expect(state.house.creditLimit).toBe(expected)
    expect(emitted.some((e) => e.headline.includes('CREDIT LINE'))).toBe(true)
  })

  it('högre reliability ger högre creditLimit, allt annat lika', () => {
    const lowRep = createInitialState('indochina-slice', 'seed')
    lowRep.meta.turn = 5
    lowRep.house.revenueByTurn = [0, 0, 1000000, 1000000, 1000000, 1000000]
    lowRep.house.reputation.reliability = 10
    economy(makeCtx(lowRep).ctx)

    const highRep = createInitialState('indochina-slice', 'seed')
    highRep.meta.turn = 5
    highRep.house.revenueByTurn = [0, 0, 1000000, 1000000, 1000000, 1000000]
    highRep.house.reputation.reliability = 90
    economy(makeCtx(highRep).ctx)

    expect(highRep.house.creditLimit).toBeGreaterThan(lowRep.house.creditLimit)
  })
})
