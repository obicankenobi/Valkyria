// design.skunk.test.ts — P134 (ETAPP9_FORSLAG.md §8b.3, reducerad): specialprojekt ("skunk works") på ritbordet.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { newDesignProject, rollDesign, validateDesignStart } from '../src/design.js'
import { designStartPreview } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { GameState, TurnSubmission } from '../src/types.js'

const B = balance as unknown as { skunkTurnsFactor: number; skunkCostFactor: number; skunkFlawGainPct: number; rndProjectTurns: number }
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'skunk-seed')
  state.house.treasury = 50_000_000
  return state
}

const spec = { category: 'artillery' as const, focus: 'balanced' as const, ambition: 'timely' as const, targetGeneration: 1, upgradeOf: null }

describe('specialprojekt (P134)', () => {
  it('går på skunkTurnsFactor av tiden men kostar skunkCostFactor × per tur; ett vanligt projekt är oförändrat', () => {
    const state = fresh()
    const plain = newDesignProject(state.house, spec, 0)
    const skunk = newDesignProject(state.house, { ...spec, skunk: true }, 0)
    expect(skunk.turnsTotal).toBe(Math.max(1, Math.round(plain.turnsTotal * B.skunkTurnsFactor)))
    expect(skunk.turnsTotal).toBeLessThan(plain.turnsTotal)
    expect(skunk.costFactor).toBeCloseTo((plain.costFactor ?? 1) * B.skunkCostFactor, 9)
    expect(plain.design).not.toHaveProperty('skunk')
    expect(skunk.design?.skunk).toBe(true)
  })

  it('ger en större risk för en dold brist: andelen konstruktioner med brist är högre över många dragningar', () => {
    const state = fresh()
    const flawRate = (skunk: boolean): number => {
      let flawed = 0
      const n = 2000
      for (let i = 0; i < n; i++) {
        const d = rollDesign(createRng(`skunk-${i}`, 0), state.house, { ...spec, turn: 0, year: 1964, ...(skunk ? { skunk: true } : {}) })
        if (d.latentFlaw) flawed++
      }
      return flawed / n
    }
    expect(flawRate(true)).toBeGreaterThan(flawRate(false) + (B.skunkFlawGainPct / 100) * 0.5)
  })

  it('konstruktionen bär Design.skunk, ett vanligt gör det inte', () => {
    const state = fresh()
    expect(rollDesign(createRng('a', 0), state.house, { ...spec, turn: 0, year: 1964, skunk: true }).skunk).toBe(true)
    expect(rollDesign(createRng('a', 0), state.house, { ...spec, turn: 0, year: 1964 })).not.toHaveProperty('skunk')
  })

  it('kan inte vara en uppgradering', () => {
    const state = fresh()
    expect(validateDesignStart(state.house, { category: 'artillery', focus: 'balanced', ambition: 'timely', upgradeOf: 'design-1', skunk: true })).toBe('a special project cannot be an upgrade')
  })

  it('en stående order DESIGN START med skunk lägger ett snabbare, dyrare projekt i kön — och förhandsvisningen läser samma funktion', () => {
    let state = fresh()
    const preview = designStartPreview(state, { category: 'artillery', focus: 'balanced', ambition: 'timely', skunk: true })
    const previewPlain = designStartPreview(state, { category: 'artillery', focus: 'balanced', ambition: 'timely' })
    expect(preview.turns).toBeLessThan(previewPlain.turns)
    expect(preview.costPerTurn).toBeGreaterThan(previewPlain.costPerTurn)
    state = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'DESIGN', op: 'START', category: 'artillery', focus: 'balanced', ambition: 'timely', skunk: true }] }).state
    const project = state.house.rnd.find((p) => p.design)!
    expect(project.design?.skunk).toBe(true)
    expect(project.turnsTotal).toBe(preview.turns)
  })

  it('en färdig konstruktion ur ett specialprojekt bär flaggan (hela vägen genom resolveTurn)', () => {
    let state = fresh()
    state = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'DESIGN', op: 'START', category: 'artillery', focus: 'balanced', ambition: 'timely', skunk: true }] }).state
    for (let i = 0; i < B.rndProjectTurns + 2 && state.house.designs.length === 0; i++) state = resolveTurn(state, EMPTY).state
    expect(state.house.designs).toHaveLength(1)
    expect(state.house.designs[0]!.skunk).toBe(true)
  })
})
