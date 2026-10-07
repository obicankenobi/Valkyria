// design.testing.test.ts — P110 (ETAPP9_FORSLAG.md §5.3, beslut 9D, skyddsräcke 5).
//
// Dold verklig kvalitet som intervall ("B±1"), provning i egen regi som stående order (kostar pengar och tid,
// smalnar av osäkerheten) och miljöbrister: en brist hör till en miljö (monsunfukt, djungel, minor, slitage) och
// syns inte vid provning i fel miljö. Fronter har miljöer (data/environments.json); bristen visar sig på en front
// med rätt miljö (P113) eller vid provning i rätt miljö (här).
import { withKnowledgeWorks } from './helpers/facilities.js'
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import environments from '../src/data/environments.json'
import { DESIGN_ENVIRONMENTS, frontEnvironments } from '../src/design.js'
import { designDisplay } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { createInitialState } from '../src/state.js'
import type { Design, DesignEnvironment, GameState, StandingOrderChange, TurnSubmission } from '../src/types.js'

const B = balance as unknown as { testingTurnsPerStep: number; testingOverheadFactor: number; fixedCosts: { rndOverhead: number } }
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const TEST = (designId: string, environment: DesignEnvironment): StandingOrderChange => ({ kind: 'TESTING', op: 'SET', designId, environment })
const STOP = (designId: string): StandingOrderChange => ({ kind: 'TESTING', op: 'CANCEL', designId })

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 60,
    reliability: 56,
    unitCostFactor: 1,
    trueQuality: 58,
    uncertainty: 2,
    latentFlaw: null,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
    ...over,
  }
}

function fresh(d: Design = design()): GameState {
  const state = withKnowledgeWorks(createInitialState('indochina-slice', 'testing-seed'))
  state.house.treasury = 50_000_000
  state.house.designs = [d]
  return state
}

function run(state: GameState, turns: number): GameState {
  let s = state
  for (let i = 0; i < turns; i++) s = resolveTurn(s, EMPTY).state
  return s
}

describe('fronternas miljöer (P110, §5.3)', () => {
  it('varje front i scenariot har en eller flera giltiga miljöer', () => {
    const state = createInitialState('indochina-slice', 'env-seed')
    for (const frontId of Object.keys(state.fronts)) {
      const envs = frontEnvironments(frontId)
      expect(envs.length, frontId).toBeGreaterThan(0)
      for (const e of envs) expect(DESIGN_ENVIRONMENTS).toContain(e)
    }
    expect(Object.keys(environments)).toEqual(expect.arrayContaining(Object.keys(state.fronts)))
  })

  it('en okänd front har inga miljöer', () => {
    expect(frontEnvironments('front-nowhere')).toEqual([])
  })
})

describe('provning i egen regi som stående order (P110)', () => {
  it('SET giltig; okänd konstruktion/miljö, en tillbakadragen konstruktion avvisas; CANCEL kräver en provning', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, TEST('design-1', 'jungle')).ok).toBe(true)
    expect(validateStandingOrderChange(state, state, TEST('design-9', 'jungle'))).toEqual({ ok: false, reason: 'unknown design' })
    expect(validateStandingOrderChange(state, state, { ...TEST('design-1', 'jungle'), environment: 'desert' } as unknown as StandingOrderChange)).toEqual({
      ok: false,
      reason: 'unknown test environment',
    })
    const withdrawn = fresh(design({ status: 'withdrawn' }))
    expect(validateStandingOrderChange(withdrawn, withdrawn, TEST('design-1', 'jungle')).ok).toBe(false)
    expect(validateStandingOrderChange(state, state, STOP('design-1'))).toEqual({ ok: false, reason: 'no testing of that design' })
  })

  it('kostar ingen handling och gäller från NÄSTA tur', () => {
    const state = fresh()
    const result = resolveTurn(state, { ...EMPTY, standingOrders: [TEST('design-1', 'jungle')] })
    expect(result.rejected).toEqual([])
    expect(result.state.house.standingOrders.testing?.['design-1']).toMatchObject({ environment: 'jungle', sinceTurn: state.meta.turn + 1, turnsRun: 0 })
    expect(result.state.house.designs[0]!.uncertainty).toBe(2)
    expect(result.wire.some((e) => e.headline.includes('TESTING') && e.headline.includes('JUNGLE'))).toBe(true)
  })

  it('osäkerheten smalnar av ett klasssteg per testingTurnsPerStep turer, provningsmiljön noteras, och provningen slutar själv vid 0', () => {
    let state = resolveTurn(fresh(), { ...EMPTY, standingOrders: [TEST('design-1', 'jungle')] }).state
    const d = (): Design => state.house.designs[0]!
    state = run(state, B.testingTurnsPerStep)
    expect(d().uncertainty).toBe(1)
    expect(d().testedIn).toEqual(['jungle'])
    state = run(state, B.testingTurnsPerStep)
    expect(d().uncertainty).toBe(0)
    expect(state.house.standingOrders.testing?.['design-1']).toBeUndefined() // slut av sig självt
    state = run(state, 3)
    expect(d().uncertainty).toBe(0)
  })

  it('kostar pengar medan den pågår (rndOverhead × testingOverheadFactor per tur), och inget före den gäller', () => {
    const state = fresh()
    expect(computeFixedCostsBreakdown(state.house).rndOverhead).toBe(0)
    state.house.standingOrders.testing = { 'design-1': { environment: 'jungle', sinceTurn: 5, turnsRun: 0 } }
    expect(computeFixedCostsBreakdown(state.house, 4).rndOverhead).toBe(0)
    expect(computeFixedCostsBreakdown(state.house, 5).rndOverhead).toBe(Math.round(B.fixedCosts.rndOverhead * B.testingOverheadFactor))
  })

  it('CANCEL avbryter provningen', () => {
    let state = resolveTurn(fresh(), { ...EMPTY, standingOrders: [TEST('design-1', 'jungle')] }).state
    state = resolveTurn(state, { ...EMPTY, standingOrders: [STOP('design-1')] }).state
    expect(state.house.standingOrders.testing?.['design-1']).toBeUndefined()
  })
})

describe('miljöbrister syns bara i rätt miljö (P110, skyddsräcke 5)', () => {
  const flawed = (): Design => design({ latentFlaw: { environment: 'mine', severity: 2 } })

  it('provning i fel miljö avslöjar inte bristen, även när provningen är klar', () => {
    let state = resolveTurn(fresh(flawed()), { ...EMPTY, standingOrders: [TEST('design-1', 'jungle')] }).state
    state = run(state, B.testingTurnsPerStep * 2 + 1)
    const d = state.house.designs[0]!
    expect(d.uncertainty).toBe(0)
    expect(d.flawRevealed).toBe(false)
    expect(designDisplay(state, d).flaw).toBeNull()
  })

  it('provning i rätt miljö avslöjar bristen den första turen provningen gäller, med en rubrik', () => {
    let state = resolveTurn(fresh(flawed()), { ...EMPTY, standingOrders: [TEST('design-1', 'mine')] }).state
    const headlines: string[] = []
    for (let i = 0; i < 2; i++) {
      const r = resolveTurn(state, EMPTY)
      state = r.state
      headlines.push(...r.wire.map((e) => e.headline))
    }
    const d = state.house.designs[0]!
    expect(d.flawRevealed).toBe(true)
    expect(designDisplay(state, d).flaw).toEqual({ environment: 'mine', severity: 2 })
    expect(headlines.some((h) => h.includes('FLAW') && h.includes('MINE') && h.includes('H&V M64 FIELD GUN'))).toBe(true)
  })

  it('en felfri konstruktion avslöjar aldrig något, och en redan avslöjad brist avslöjas inte igen', () => {
    let state = resolveTurn(fresh(design()), { ...EMPTY, standingOrders: [TEST('design-1', 'mine')] }).state
    state = run(state, 2)
    expect(state.house.designs[0]!.flawRevealed).toBe(false)

    const again = resolveTurn(fresh(design({ latentFlaw: { environment: 'mine', severity: 1 }, flawRevealed: true })), {
      ...EMPTY,
      standingOrders: [TEST('design-1', 'mine')],
    }).state
    const r = resolveTurn(again, EMPTY)
    expect(r.wire.filter((e) => e.headline.includes('FLAW'))).toEqual([])
  })
})

describe('klassen som ett intervall (P110, §5.3)', () => {
  it('intervallets bredd är osäkerheten och den verkliga klassen ligger alltid i det, före och efter provning', () => {
    const order = ['A', 'B', 'C', 'D'] as const
    const state = fresh()
    for (let q = 0; q <= 100; q += 4) {
      for (const uncertainty of [2, 1, 0]) {
        const shown = designDisplay(state, design({ id: `d-${q}`, trueQuality: q, uncertainty }))
        expect(shown.qualityClass.plusMinus).toBe(uncertainty)
        const trueClass = q >= 70 ? 'A' : q >= 50 ? 'B' : q >= 30 ? 'C' : 'D'
        expect(Math.abs(order.indexOf(shown.qualityClass.center) - order.indexOf(trueClass))).toBeLessThanOrEqual(uncertainty)
        if (uncertainty === 0) expect(shown.qualityClass.center).toBe(trueClass)
      }
    }
  })
})

describe('sparade partier (P110)', () => {
  it('ett sparat parti utan standingOrders.testing kraschar inte', () => {
    const state = fresh()
    delete (state.house.standingOrders as { testing?: unknown }).testing
    expect(() => resolveTurn(state, EMPTY)).not.toThrow()
  })
})
