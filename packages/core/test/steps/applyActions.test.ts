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

describe('applyActions (isolerat steg, spec avsnitt 3.1, 5 "Ekonomi", ETAPP1_5_TEKNISK_SPEC.md avsnitt 8) — INTERNAL', () => {
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

  it('BROKER/INTEL/POLITICAL/MARKET förblir no-ops (P18 bygger POLITICAL/INTEL) — men konsumerar en actionPoint', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 4 // gott om utrymme för alla fyra, oavsett scenariots default
    const before = JSON.parse(JSON.stringify(state.house)) as typeof state.house

    const { ctx, emitted } = makeCtx(state, [
      { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 },
      { type: 'INTEL', op: 'EXPAND', stationId: 'station-1' },
      { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 0 },
      { type: 'MARKET', op: 'BUY_FORWARD', spend: 0 },
    ])
    applyActions(ctx)

    expect(state.house).toEqual(before) // ingen ekonomisk effekt av något av de fyra
    expect(ctx.rejected).toEqual([]) // inte AVVISADE (ogiltiga) — bara ännu inte byggda
    expect(emitted).toEqual([])
  })

  it('(P17 klart-när) en fjärde handling avvisas med "no executive actions remaining" när chiefOfStaff <= 70 (3 actionPoints)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefOfStaff = 70 // exakt på tröskeln — INTE över, alltså 3 st (spec 8.1: "> tröskeln")
    state.house.actionPoints = 3
    state.house.creditLimit = 10000000 // gott om utrymme, så TAKE_LOAN i sig aldrig avvisas

    const actions: PlayerAction[] = [
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
    ]
    const { ctx } = makeCtx(state, actions)
    applyActions(ctx)

    expect(state.house.debt).toBe(3000) // de tre första gick igenom
    expect(ctx.rejected).toEqual([{ action: actions[3], reason: 'no executive actions remaining' }])
  })

  it('en fjärde handling GÅR igenom när chiefOfStaff > 70 (4 actionPoints)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefOfStaff = 71
    state.house.actionPoints = 4
    state.house.creditLimit = 10000000

    const actions: PlayerAction[] = Array.from({ length: 4 }, () => ({
      type: 'INTERNAL' as const,
      op: 'TAKE_LOAN' as const,
      payload: { amount: 1000 },
    }))
    const { ctx } = makeCtx(state, actions)
    applyActions(ctx)

    expect(state.house.debt).toBe(4000)
    expect(ctx.rejected).toEqual([])
  })

  it('REPAY: treasury och debt minskar med samma belopp, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.debt = 500000
    state.house.treasury = 2000000
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'REPAY', payload: { amount: 200000 } }])
    applyActions(ctx)

    expect(state.house.debt).toBe(300000)
    expect(state.house.treasury).toBe(treasuryBefore - 200000)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('REPAYS'))).toBe(true)
  })

  it('REPAY avvisas med "repayment exceeds treasury or debt" om beloppet överstiger min(treasury, debt)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.debt = 100000
    state.house.treasury = 5000000 // gott om kassa — det är SKULDEN som är taket här
    const debtBefore = state.house.debt
    const treasuryBefore = state.house.treasury

    const action: PlayerAction = { type: 'INTERNAL', op: 'REPAY', payload: { amount: 200000 } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.debt).toBe(debtBefore)
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'repayment exceeds treasury or debt' }])
  })

  it('BUILD_LINE: en ny idle-linje läggs till, kostar buildLineCost, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const linesBefore = state.house.lines.length
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }])
    applyActions(ctx)

    expect(state.house.lines.length).toBe(linesBefore + 1)
    const newLine = state.house.lines[state.house.lines.length - 1]!
    expect(newLine.status).toBe('idle')
    expect(newLine.assignedContractId).toBeNull()
    expect(newLine.unitsPerTurnAtFull).toBe(state.house.unitsPerLineTurnDefault)
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('NEW PRODUCTION LINE'))).toBe(true)
  })

  it('BUILD_LINE avvisas med "maximum production lines reached" vid maxProductionLines (9)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    while (state.house.lines.length < 9) {
      state.house.lines.push({ ...state.house.lines[0]!, id: `line-extra-${state.house.lines.length}` })
    }
    const linesBefore = state.house.lines.length

    const action: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.lines.length).toBe(linesBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'maximum production lines reached' }])
  })

  it('HIRE: den valda rollen höjs med hireGain (tak 100), kostar hireCost', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefEngineer = 50
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }])
    applyActions(ctx)

    expect(state.house.staff.chiefEngineer).toBeGreaterThan(50)
    expect(state.house.staff.chiefEngineer).toBeLessThanOrEqual(100)
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('HIRES'))).toBe(true)
  })

  it('HIRE klampar rollen till 100, går aldrig över', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefSalesman = 95

    const { ctx } = makeCtx(state, [{ type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } }])
    applyActions(ctx)

    expect(state.house.staff.chiefSalesman).toBe(100)
  })

  it('HIRE avvisas med "invalid hire role" för en okänd roll', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'ceo' } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'invalid hire role' }])
  })

  it('REPRIORITISE_RND: ett RndProject läggs i kön med turnsTotal = rndProjectTurns, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    expect(state.house.rnd).toEqual([])

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'aviation' } }])
    applyActions(ctx)

    expect(state.house.rnd).toHaveLength(1)
    const project = state.house.rnd[0]!
    expect(project.category).toBe('aviation')
    expect(project.turnsRemaining).toBe(project.turnsTotal)
    expect(project.turnsTotal).toBeGreaterThan(0)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('R&D'))).toBe(true)
  })

  it('REPRIORITISE_RND avvisas med "invalid R&D category" för en okänd kategori', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'cyberwarfare' } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.rnd).toEqual([])
    expect(ctx.rejected).toEqual([{ action, reason: 'invalid R&D category' }])
  })

  it('ett pågående RndProject avancerar en tur (turnsRemaining minskar) utan en ny REPRIORITISE_RND', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.rnd = [{ id: 'rnd-existing', category: 'artillery', turnsRemaining: 3, turnsTotal: 6 }]

    const { ctx } = makeCtx(state, [])
    applyActions(ctx)

    expect(state.house.rnd).toHaveLength(1)
    expect(state.house.rnd[0]!.turnsRemaining).toBe(2)
  })

  it('ett RndProject som når 0 turnsRemaining höjer techLevel[category] och lämnar kön', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const techBefore = state.house.techLevel.naval
    state.house.rnd = [{ id: 'rnd-almost-done', category: 'naval', turnsRemaining: 1, turnsTotal: 6 }]

    const { ctx, emitted } = makeCtx(state, [])
    applyActions(ctx)

    expect(state.house.rnd).toEqual([])
    expect(state.house.techLevel.naval).toBe(techBefore + 1)
    expect(emitted.some((e) => e.headline.includes('R&D PROJECT COMPLETE') && e.headline.includes('NAVAL'))).toBe(true)
  })
})
