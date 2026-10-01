// queries.projectPreviews.test.ts — P126 (ETAPP9_FORSLAG.md §9, ritbordet). designStartPreview och researchTrackPreview är
// rena läsningar som ritbordet visar INNAN ordern köas: längd, kostnad per tur, målgeneration och eventuell avvisningsorsak.
// "En formel, en källa": siffrorna måste vara exakt de standingOrders.ts faktiskt tillämpar.
import { describe, expect, it } from 'vitest'
import { designStartPreview, researchTrackPreview } from '../src/queries.js'
import { designCostPerTurn, designDuration } from '../src/design.js'
import { researchDuration, projectCostPerTurn, projectOverheadPerTurn } from '../src/research.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import { frontierGeneration } from '../src/race.js'
import type { GameState, TurnSubmission } from '../src/types.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const fresh = (): GameState => {
  const state = createInitialState('indochina-slice', 'preview-seed')
  state.house.treasury = 20_000_000
  return state
}

describe('designStartPreview (P126)', () => {
  it('visar längd, kostnad per tur och målgeneration ur samma funktioner som ordern tillämpar', () => {
    const state = fresh()
    const category = state.house.specialisation
    const preview = designStartPreview(state, { category, focus: 'balanced', ambition: 'forward' })
    expect(preview.reason).toBeNull()
    expect(preview.turns).toBeGreaterThanOrEqual(designDuration(state.house, 'forward') - 1) // efterföljarrabatten kan kortat
    expect(preview.targetGeneration).toBeGreaterThanOrEqual(frontierGeneration(state, category))
    expect(preview.costPerTurn).toBeGreaterThan(0)
    expect(preview.costPerTurn).toBeLessThanOrEqual(Math.round(projectOverheadPerTurn(state.house, { category, costFactor: designCostPerTurn('forward') })))
  })

  it('stämmer med det projekt som faktiskt läggs i kön (turnsTotal, costFactor)', () => {
    const state = fresh()
    const category = state.house.specialisation
    const preview = designStartPreview(state, { category, focus: 'robust', ambition: 'timely' })
    const r = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'DESIGN', op: 'START', category, focus: 'robust', ambition: 'timely' }] })
    expect(r.rejected).toEqual([])
    const project = r.state.house.rnd.find((p) => p.design && p.category === category)!
    expect(project.turnsTotal).toBe(preview.turns)
    expect(Math.round(projectOverheadPerTurn(r.state.house, { category, costFactor: project.costFactor }))).toBe(preview.costPerTurn)
  })

  it('en längre ambition tar längre tid och kostar mer per tur', () => {
    const state = fresh()
    const category = state.house.specialisation
    const timely = designStartPreview(state, { category, focus: 'balanced', ambition: 'timely' })
    const ahead = designStartPreview(state, { category, focus: 'balanced', ambition: 'ahead' })
    expect(ahead.turns).toBeGreaterThanOrEqual(timely.turns)
    expect(ahead.costPerTurn).toBeGreaterThan(timely.costPerTurn)
    expect(ahead.targetGeneration).toBeGreaterThanOrEqual(timely.targetGeneration)
  })

  it('ger avvisningsorsaken i klartext när ritbordet inte kan starta (samma text som validateDesignStart)', () => {
    const state = fresh()
    const category = state.house.specialisation
    state.house.techLevel[category] = 0
    const preview = designStartPreview(state, { category, focus: 'balanced', ambition: 'timely' })
    expect(preview.reason).toBe('tech level too low for a design in that category')
  })
})

describe('researchTrackPreview (P126)', () => {
  it('längd och kostnad per tur är researchDuration × projectCostPerTurn (en formel, en källa)', () => {
    const state = fresh()
    const category = state.house.specialisation
    for (const pace of ['low', 'normal', 'high'] as const) {
      const p = researchTrackPreview(state, category, pace)
      expect(p.turns).toBe(researchDuration(state.house, pace))
      expect(p.costPerTurn).toBe(Math.round(projectOverheadPerTurn(state.house, { category, costFactor: projectCostPerTurn(pace) })))
    }
  })

  it('ett högre tempo är kortare men dyrare per tur', () => {
    const state = fresh()
    const category = state.house.specialisation
    const low = researchTrackPreview(state, category, 'low')
    const high = researchTrackPreview(state, category, 'high')
    expect(high.turns).toBeLessThanOrEqual(low.turns)
    expect(high.costPerTurn).toBeGreaterThan(low.costPerTurn)
  })
})
