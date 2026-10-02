// civil.test.ts — P133 (ETAPP9_FORSLAG.md §8b.2, beslut 9J): den civila grenen.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { CIVIL_CATEGORIES, advanceCivil, applyCivilChange, civilOptions, civilRevenueFor, civilShare, validateCivilChange } from '../src/civil.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { scenarioVerdict } from '../src/scenarioVerdict.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as { civilMinTechLevel: number; civilRevenuePerTurn: number; civilRevenueTechStep: number; civilHeadStartEveryTurns: number }
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'civil-seed')
  state.house.treasury = 20_000_000
  for (const c of CIVIL_CATEGORIES) state.house.techLevel[c] = B.civilMinTechLevel
  return state
}

function makeCtx(state: GameState): { ctx: ResolveContext; emitted: WireEvent[] } {
  const emitted: WireEvent[] = []
  let seq = 0
  const ctx = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng('civil', 0),
    emit: (e: Omit<WireEvent, 'id' | 'turn'>) => {
      const id = `${state.meta.turn}-${seq++}`
      emitted.push({ id, turn: state.meta.turn, ...e })
      return id
    },
    rejected: [],
  } as unknown as ResolveContext
  return { ctx, emitted }
}

describe('civil gren — validering (P133)', () => {
  it('kräver techLevel över golvet och en civil kategori; en linje per kategori', () => {
    const state = fresh()
    state.house.techLevel.armour = B.civilMinTechLevel - 1
    expect(validateCivilChange(state, { kind: 'CIVIL', op: 'SET', category: 'armour' })).toEqual({ ok: false, reason: `needs tech level ${B.civilMinTechLevel} in armour` })
    expect(validateCivilChange(state, { kind: 'CIVIL', op: 'SET', category: 'electronics' })).toEqual({ ok: true })
    expect(validateCivilChange(state, { kind: 'CIVIL', op: 'SET', category: 'artillery' as never })).toEqual({ ok: false, reason: 'no civil product in that category' })
    expect(validateCivilChange(state, { kind: 'CIVIL', op: 'CANCEL', category: 'electronics' })).toEqual({ ok: false, reason: 'no civil line in that category' })
    const { ctx } = makeCtx(state)
    applyCivilChange(ctx, { kind: 'CIVIL', op: 'SET', category: 'electronics' })
    expect(validateCivilChange(state, { kind: 'CIVIL', op: 'SET', category: 'electronics' })).toEqual({ ok: false, reason: 'a civil line already runs in that category' })
    expect(civilOptions(state.house)).toEqual(['aviation'])
  })
})

describe('civil gren — intäkt och försprång (P133)', () => {
  it('betalar netto civilRevenuePerTurn × (1 + steg × (techLevel − golv)) från nästa tur, i kassan, revenueByTurn och huvudboken', () => {
    const state = fresh()
    state.house.techLevel.electronics = B.civilMinTechLevel + 2
    const { ctx } = makeCtx(state)
    applyCivilChange(ctx, { kind: 'CIVIL', op: 'SET', category: 'electronics' })
    state.meta.turn = 0
    advanceCivil(ctx) // sinceTurn = 1 → betalar inte tur 0
    expect(state.house.treasury).toBe(20_000_000)
    state.meta.turn = 1
    state.ledger = [{ turn: 1, income: { contracts: 0, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 } } as never]
    const expected = Math.round(B.civilRevenuePerTurn * (1 + B.civilRevenueTechStep * 2))
    expect(civilRevenueFor(state.house, 'electronics')).toBe(expected)
    advanceCivil(ctx)
    expect(state.house.treasury).toBe(20_000_000 + expected)
    expect(state.house.revenueByTurn[1]).toBe(expected)
    expect(state.ledger![0]!.income.civil).toBe(expected)
  })

  it('ger ett forskningsförsprång var civilHeadStartEveryTurns:e tur', () => {
    const state = fresh()
    const { ctx } = makeCtx(state)
    applyCivilChange(ctx, { kind: 'CIVIL', op: 'SET', category: 'aviation' })
    const before = state.house.researchHeadStart.aviation ?? 0
    for (let t = 1; t <= B.civilHeadStartEveryTurns; t++) {
      state.meta.turn = t
      advanceCivil(ctx)
    }
    expect(state.house.researchHeadStart.aviation).toBe(before + 1)
  })

  it('upphör när kategorins techLevel faller under golvet (en rubrik, ingen betalning)', () => {
    const state = fresh()
    const { ctx, emitted } = makeCtx(state)
    applyCivilChange(ctx, { kind: 'CIVIL', op: 'SET', category: 'armour' })
    state.house.techLevel.armour = B.civilMinTechLevel - 1
    state.meta.turn = 1
    advanceCivil(ctx)
    expect(state.house.standingOrders.civil?.armour).toBeUndefined()
    expect(state.house.treasury).toBe(20_000_000)
    expect(emitted.some((e) => e.headline.includes('LINE LAPSES'))).toBe(true)
  })

  it('betalar också under en vapenvila: intäkten läser ingen front eller ordning', () => {
    const state = fresh()
    for (const front of Object.values(state.fronts)) front.status = 'ceasefire'
    const { ctx } = makeCtx(state)
    applyCivilChange(ctx, { kind: 'CIVIL', op: 'SET', category: 'armour' })
    state.meta.turn = 1
    advanceCivil(ctx)
    expect(state.house.treasury).toBeGreaterThan(20_000_000)
  })
})

describe('civil gren — i en hel tur och i epilogen (P133)', () => {
  it('en stående order SET i resolveTurn gäller från nästa tur och betalar via race-steget', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'CIVIL', op: 'SET', category: 'armour' }] }).state
    expect(state.house.standingOrders.civil?.armour).toEqual({ sinceTurn: 1 })
    const before = state.house.treasury
    const result = resolveTurn(state, EMPTY)
    expect(result.wire.some((e) => e.headline.startsWith('CIVIL FARM TRACTORS EARN'))).toBe(true)
    expect(result.state.ledger!.at(-1)!.income.civil).toBe(civilRevenueFor(state.house, 'armour'))
    expect(result.state.house.treasury).toBeGreaterThan(before - 5_000_000) // inte en teknisk nolla
  })

  it('civilShare är 0 utan civila linjer och scenarioVerdict bär den', () => {
    const state = fresh()
    expect(civilShare(state)).toBe(0)
    expect(scenarioVerdict(state).civilSharePct).toBe(0)
    state.ledger = [{ turn: 1, income: { contracts: 300_000, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0, civil: 100_000 } } as never]
    expect(civilShare(state)).toBeCloseTo(25, 9)
    expect(scenarioVerdict(state).civilSharePct).toBeCloseTo(25, 9)
  })
})
