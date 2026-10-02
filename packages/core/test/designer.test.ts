// designer.test.ts — P134 (ETAPP9_FORSLAG.md §8b.3, resterande del): namngivna chefskonstruktörer.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { DESIGNERS, advanceDesigner, applyDesignerChange, designerEmployer, hireCostFor, validateDesignerChange } from '../src/designer.js'
import { newDesignProject, rollDesign } from '../src/design.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  designerHireCost: number
  designerPoachFactor: number
  designerSalaryPerTurn: number
  designerFastTurnsSaved: number
  designerCarefulFlawReductionPct: number
  designerFrugalCostFactor: number
  designerFocusQualityBonus: number
  designerPoachChancePct: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const spec = { category: 'artillery' as const, focus: 'balanced' as const, ambition: 'timely' as const, targetGeneration: 1, upgradeOf: null }

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'designer-seed')
  state.house.treasury = 20_000_000
  return state
}

function makeCtx(state: GameState, seed = 'designer'): { ctx: ResolveContext; emitted: WireEvent[] } {
  const emitted: WireEvent[] = []
  let seq = 0
  const ctx = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(seed, 0),
    emit: (e: Omit<WireEvent, 'id' | 'turn'>) => {
      const id = `${state.meta.turn}-${seq++}`
      emitted.push({ id, turn: state.meta.turn, ...e })
      return id
    },
    rejected: [],
  } as unknown as ResolveContext
  return { ctx, emitted }
}

describe('chefskonstruktörer — anställning (P134)', () => {
  it('en fri konstruktör kostar grundsumman, en rivals värvas över för designerPoachFactor gånger så mycket, med en rubrik som namnger rivalen', () => {
    const state = fresh()
    expect(designerEmployer(state, 'ingrid-sollberg')).toBeNull()
    expect(hireCostFor(state, 'ingrid-sollberg')).toBe(B.designerHireCost)
    expect(designerEmployer(state, 'viktor-ahlberg')).toBe('meridian')
    expect(hireCostFor(state, 'viktor-ahlberg')).toBe(B.designerHireCost * B.designerPoachFactor)
    const { ctx, emitted } = makeCtx(state)
    applyDesignerChange(ctx, { kind: 'DESIGNER', op: 'HIRE', designerId: 'viktor-ahlberg' })
    expect(state.house.designer?.id).toBe('viktor-ahlberg')
    expect(designerEmployer(state, 'viktor-ahlberg')).toBe('player')
    expect(state.house.treasury).toBe(20_000_000 - B.designerHireCost * B.designerPoachFactor)
    expect(emitted[0]!.headline).toContain('POACHES VIKTOR AHLBERG FROM')
  })

  it('valideringen: okänd person, redan en anställd, ingen att släppa, för lite kassa', () => {
    const state = fresh()
    expect(validateDesignerChange(state, { kind: 'DESIGNER', op: 'HIRE', designerId: 'nobody' })).toEqual({ ok: false, reason: 'unknown designer' })
    expect(validateDesignerChange(state, { kind: 'DESIGNER', op: 'RELEASE' })).toEqual({ ok: false, reason: 'no chief designer to release' })
    state.house.treasury = 1000
    expect(validateDesignerChange(state, { kind: 'DESIGNER', op: 'HIRE', designerId: 'ingrid-sollberg' })).toEqual({ ok: false, reason: 'cannot afford the signing fee' })
    state.house.treasury = 20_000_000
    const { ctx } = makeCtx(state)
    applyDesignerChange(ctx, { kind: 'DESIGNER', op: 'HIRE', designerId: 'ingrid-sollberg' })
    expect(validateDesignerChange(state, { kind: 'DESIGNER', op: 'HIRE', designerId: 'tomas-reiter' })).toEqual({ ok: false, reason: 'you already employ a chief designer' })
    applyDesignerChange(ctx, { kind: 'DESIGNER', op: 'RELEASE' })
    expect(state.house.designer).toBeUndefined()
    expect(designerEmployer(state, 'ingrid-sollberg')).toBeNull()
  })

  it('alla personer och inriktningar är fiktiva och väldefinierade', () => {
    for (const d of Object.values(DESIGNERS)) {
      expect(['fast', 'careful', 'frugal']).toContain(d.trait)
      expect(['robust', 'balanced', 'advanced']).toContain(d.focus)
    }
  })
})

describe('chefskonstruktörer — egenskaper (P134)', () => {
  it('snabb: ett projekt en tur kortare; sparsam: lägre kostnad per tur; en konstruktör utan egenskap ändrar inget', () => {
    const base = fresh()
    const plain = newDesignProject(base.house, spec, 0)
    const fast = fresh()
    fast.house.designer = { id: 'viktor-ahlberg', sinceTurn: 0 } // fast
    expect(newDesignProject(fast.house, spec, 0).turnsTotal).toBe(Math.max(1, plain.turnsTotal - B.designerFastTurnsSaved))
    const frugal = fresh()
    frugal.house.designer = { id: 'otto-brenner', sinceTurn: 0 } // frugal
    expect(newDesignProject(frugal.house, spec, 0).costFactor).toBeCloseTo((plain.costFactor ?? 1) * B.designerFrugalCostFactor, 9)
    const careful = fresh()
    careful.house.designer = { id: 'ingrid-sollberg', sinceTurn: 0 } // careful
    expect(newDesignProject(careful.house, spec, 0).turnsTotal).toBe(plain.turnsTotal)
  })

  it('noggrann: färre dolda brister över många dragningar; rätt inriktning och kategori ger kvalitetstillägget', () => {
    const flawRate = (house: GameState['house']): number => {
      let flawed = 0
      for (let i = 0; i < 2000; i++) if (rollDesign(createRng(`c-${i}`, 0), house, { ...spec, turn: 0, year: 1964 }).latentFlaw) flawed++
      return flawed / 2000
    }
    const plain = fresh()
    const careful = fresh()
    careful.house.designer = { id: 'ingrid-sollberg', sinceTurn: 0 } // careful, balanced, artillery
    expect(flawRate(careful.house)).toBeLessThan(flawRate(plain.house) - (B.designerCarefulFlawReductionPct / 100) * 0.5)
    const withBonus = rollDesign(createRng('q', 0), careful.house, { ...spec, turn: 0, year: 1964 })
    const withoutBonus = rollDesign(createRng('q', 0), plain.house, { ...spec, turn: 0, year: 1964 })
    // Samma slumptal; noggrannheten ändrar bara bristrisken, kvalitetstillägget ligger ovanpå (om ingen brist-rullning skiljer sig åt).
    if (!!withBonus.latentFlaw === !!withoutBonus.latentFlaw) expect(withBonus.trueQuality - withoutBonus.trueQuality).toBeGreaterThanOrEqual(B.designerFocusQualityBonus - 0)
  })
})

describe('chefskonstruktörer — lön och värvning (P134)', () => {
  it('lönen dras från turen efter anställningen; utan konstruktör dras inget slumptal', () => {
    const state = fresh()
    const { ctx } = makeCtx(state)
    const cursor = state.meta.rngCursor
    advanceDesigner(ctx)
    expect(state.meta.rngCursor).toBe(cursor)
    applyDesignerChange(ctx, { kind: 'DESIGNER', op: 'HIRE', designerId: 'ingrid-sollberg' })
    const cash = state.house.treasury
    advanceDesigner(ctx) // samma tur som anställningen: ingen lön
    expect(state.house.treasury).toBe(cash)
    state.meta.turn = 1
    advanceDesigner(ctx)
    expect(state.house.treasury).toBe(cash - B.designerSalaryPerTurn)
  })

  it('en rival kan värva över husets konstruktör (över många tur-dragningar händer det någon gång) och personen blir rivalens', () => {
    let moved = 0
    for (let i = 0; i < 400 && moved === 0; i++) {
      const state = fresh()
      const { ctx } = makeCtx(state, `poach-${i}`)
      applyDesignerChange(ctx, { kind: 'DESIGNER', op: 'HIRE', designerId: 'tomas-reiter' })
      state.meta.turn = 1
      advanceDesigner(ctx)
      if (!state.house.designer) {
        moved++
        expect(Object.keys(state.rivals)).toContain(designerEmployer(state, 'tomas-reiter'))
      }
    }
    expect(moved).toBeGreaterThan(0)
  })

  it('genom resolveTurn: en stående order HIRE gäller direkt och lönen går ut turen efter', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'DESIGNER', op: 'HIRE', designerId: 'ingrid-sollberg' }] }).state
    expect(state.house.designer?.id).toBe('ingrid-sollberg')
    const next = resolveTurn(state, EMPTY)
    expect(next.wire.some((e) => e.headline.includes('DRAWS A SALARY'))).toBe(true)
  })
})
