// race.assessment.test.ts — P120 (ETAPP9_FORSLAG.md §7.3, beslut 9H, skyddsräcke 4 och 5). Bedömningar, inte sanningen: falska gap.
//
// Spelaren ser aldrig blockens generation direkt, bara en underrättelsebedömning: ett intervall med en stämpel för säkerheten
// (stationer och deras täckning snävar in det). Köparnas budgetar följer det UPPLEVDA hotet, inte det verkliga: en överdriven
// bedömning (ett rykte vid ett generationsskifte, eller en LEAK) ger större ordrar tills sanningen kommer fram. Ett avslöjat
// LEAK sänker tjänstemännens förtroende och höjer doomsday.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { raceAssessment } from '../src/queries.js'
import {
  advanceRace,
  advancePerception,
  parseAssessmentTarget,
  perceivedBudgetPct,
} from '../src/race.js'
import { previewAction } from '../src/previewAction.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { validateAction } from '../src/validateAction.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, PlayerAction, Station, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as {
  blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>
  assessmentWidthByDepth: number[]
  falseGapChancePct: number
  falseGapLifeTurns: number
  leakExposeChancePct: number
  leakLifeTurns: number
  perceivedBudgetPctPerStep: number
  leakExposedRelationPenalty: number
  leakExposedDoomsday: number
  intelCovertOpCost: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const EAST_ART = B.blocGenerationSchedule.artillery.east[0]! // tur 4

function station(nation: string, depth: Station['depth'], coverage: Station['coverage'] = ['military']): Station {
  return { id: `st-${nation}`, city: nation, nation, depth, exposure: 0, coverage, status: 'active' }
}

function makeCtx(state: GameState, rng = createRng('assess', 0)): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng,
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

// Första seedsträngen vars första `chance(pct)`-drag går (eller inte) — så testerna är deterministiska utan att gissa.
function seedWhere(pct: number, hit: boolean): string {
  for (let i = 0; i < 500; i++) if (createRng(`s${i}`, 0).chance(pct) === hit) return `s${i}`
  throw new Error('no seed')
}

describe('bedömningen (P120, §7.3)', () => {
  it('är ett intervall som alltid innehåller sanningen, med bredd efter underrättelsedjup', () => {
    const state = createInitialState('indochina-slice', 'assess-seed')
    state.race.generation.east.artillery = 3
    for (let depth = 0; depth <= 5; depth++) {
      state.house.stations = [station('nlf', depth as Station['depth'])]
      const a = raceAssessment(state, 'east', 'artillery')
      expect(a.low).toBeLessThanOrEqual(3)
      expect(a.high).toBeGreaterThanOrEqual(3)
      expect(a.high - a.low).toBeLessThanOrEqual(2 * B.assessmentWidthByDepth[Math.min(5, depth + (state.house.staff.chiefSalesman > 75 ? 1 : 0))]!)
      expect(a.low).toBeGreaterThanOrEqual(1)
    }
  })

  it('utan station är den bred (låg säkerhet) och sanningen pekas inte ut; med full underrättelse är den exakt och bekräftad', () => {
    const state = createInitialState('indochina-slice', 'assess-seed')
    state.house.stations = []
    state.house.staff.chiefSalesman = 0
    state.race.generation.west.armour = 4
    const blind = raceAssessment(state, 'west', 'armour')
    expect(blind.stamp).toBe('ESTIMATE — LOW CONFIDENCE')
    expect(blind.confidence).toBe('LOW')
    expect(blind.high - blind.low).toBeGreaterThan(0)
    state.house.stations = [station('rvn', 5)]
    const exact = raceAssessment(state, 'west', 'armour')
    expect(exact).toMatchObject({ low: 4, high: 4, confidence: 'CONFIRMED', stamp: 'CONFIRMED' })
  })

  it('en station i fel block hjälper inte, och en station utan militär/industri-täckning är ett steg sämre', () => {
    const state = createInitialState('indochina-slice', 'assess-seed')
    state.house.staff.chiefSalesman = 0
    state.house.stations = [station('rvn', 5)] // väst
    expect(raceAssessment(state, 'east', 'artillery').confidence).toBe('LOW')
    state.house.stations = [station('rvn', 5, ['military'])]
    const full = raceAssessment(state, 'west', 'artillery')
    state.house.stations = [station('rvn', 5, ['procurement'])]
    const thin = raceAssessment(state, 'west', 'artillery')
    expect(thin.high - thin.low).toBeGreaterThanOrEqual(full.high - full.low)
    expect(thin.confidence).not.toBe('CONFIRMED')
  })

  it('är stabil: samma tillstånd ger samma intervall (hashad, aldrig ur spelets slump)', () => {
    const state = createInitialState('indochina-slice', 'assess-seed')
    state.house.stations = []
    const before = state.meta.rngCursor
    expect(raceAssessment(state, 'east', 'naval')).toEqual(raceAssessment(state, 'east', 'naval'))
    expect(state.meta.rngCursor).toBe(before)
  })

  it('visar aldrig det upplevda hotet (en LEAK-bias syns inte i bedömningen av sanningen)', () => {
    const state = createInitialState('indochina-slice', 'assess-seed')
    state.house.stations = [station('nlf', 5)]
    const clean = raceAssessment(state, 'east', 'artillery')
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 0, source: 'leak', causeId: null } }, east: {} }
    expect(raceAssessment(state, 'east', 'artillery')).toEqual(clean)
  })
})

describe('falska gap (P120, §7.3)', () => {
  it('ett generationsskifte kan ge ett rykte: det andra blockets köpare tror att försprånget är ett steg större (dragen med ctx.rng)', () => {
    const state = createInitialState('indochina-slice', 'rumour-seed')
    state.meta.turn = EAST_ART
    const { ctx, emitted } = makeCtx(state, createRng(seedWhere(B.falseGapChancePct, true), 0))
    advanceRace(ctx)
    const bias = state.race.perception?.west?.artillery
    expect(bias).toMatchObject({ bias: 1, source: 'rumour', sinceTurn: EAST_ART })
    expect(emitted.some((e) => e.headline.includes('RUMOUR') && e.headline.includes('ARTILLERY'))).toBe(true)
    // Bara en bias per kategori och block, och det andra blocket tror inte att västs försprång är större.
    expect(state.race.perception?.east?.artillery).toBeUndefined()
  })

  it('utan träff på dragningen blir det inget rykte', () => {
    const state = createInitialState('indochina-slice', 'rumour-seed')
    state.meta.turn = EAST_ART
    advanceRace(makeCtx(state, createRng(seedWhere(B.falseGapChancePct, false), 0)).ctx)
    expect(state.race.perception?.west?.artillery).toBeUndefined()
  })

  it('perceivedBudgetPct: perceivedBudgetPctPerStep × biasen för köpare i det blocket i kategorin, annars 0', () => {
    const state = createInitialState('indochina-slice', 'rumour-seed')
    expect(perceivedBudgetPct(state, 'rvn', 'artillery')).toBe(0)
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 0, source: 'rumour', causeId: null } }, east: {} }
    expect(perceivedBudgetPct(state, 'rvn', 'artillery')).toBe(B.perceivedBudgetPctPerStep)
    expect(perceivedBudgetPct(state, 'nlf', 'artillery')).toBe(0)
    expect(perceivedBudgetPct(state, 'rvn', 'infantry')).toBe(0)
  })

  it('köparnas budgetar följer det upplevda hotet: en order i det panikslagna blocket får större budgetar (samma seed, utan bias som kontroll)', () => {
    const run = (biased: boolean) => {
      const state = createInitialState('indochina-slice', 'panic-orders')
      state.meta.turn = 2
      if (biased) state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 1, source: 'rumour', causeId: null } }, east: {} }
      state.factions['rvn']!.materielNeed.artillery = 80
      const order = resolveTurn(state, EMPTY).state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')
      expect(order).toBeDefined()
      return order!
    }
    const panic = run(true)
    const calm = run(false)
    expect(panic.trueBudget).toBe(Math.round(calm.trueBudget * (1 + B.perceivedBudgetPctPerStep / 100)))
    expect(panic.statedBudget).toBeGreaterThan(calm.statedBudget)
    expect(panic.referencePrice).toBe(calm.referencePrice) // priset är det verkliga; bara budgeten följer hotbilden
  })

  it('ett rykte försvinner av sig självt efter falseGapLifeTurns, med en rubrik ("sanningen kommer fram, efterfrågan sjunker")', () => {
    const state = createInitialState('indochina-slice', 'rumour-seed')
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 5, source: 'rumour', causeId: null } }, east: {} }
    state.meta.turn = 5 + B.falseGapLifeTurns - 1
    advancePerception(makeCtx(state).ctx)
    expect(state.race.perception.west.artillery).toBeDefined()
    state.meta.turn = 5 + B.falseGapLifeTurns
    const { ctx, emitted } = makeCtx(state)
    advancePerception(ctx)
    expect(state.race.perception.west.artillery).toBeUndefined()
    expect(emitted.some((e) => e.headline.includes('ARTILLERY') && e.headline.includes('MYTH'))).toBe(true)
  })
})

describe('LEAK mot en bedömning (P120, §7.3)', () => {
  const LEAK = (over: Partial<Extract<PlayerAction, { type: 'INTEL' }>> = {}): PlayerAction => ({ type: 'INTEL', op: 'LEAK', stationId: 'st-rvn', targetId: 'assessment:east:artillery', ...over }) as PlayerAction
  const fresh = (seed = 'leak-seed'): GameState => {
    const state = createInitialState('indochina-slice', seed)
    state.house.stations = [station('rvn', 2)]
    state.house.treasury = 50_000_000
    return state
  }

  it('parseAssessmentTarget läser "assessment:block:kategori" och avvisar allt annat', () => {
    expect(parseAssessmentTarget('assessment:east:artillery')).toEqual({ bloc: 'east', category: 'artillery' })
    expect(parseAssessmentTarget('assessment:north:artillery')).toBeNull()
    expect(parseAssessmentTarget('assessment:east:tanks')).toBeNull()
    expect(parseAssessmentTarget('brandt')).toBeNull()
    expect(parseAssessmentTarget(undefined)).toBeNull()
  })

  it('valideras: giltigt mål godtas, ogiltigt avvisas, och en redan uppblåst bedömning kan inte blåsas upp igen', () => {
    const state = fresh()
    expect(validateAction(state, state, LEAK())).toEqual({ ok: true })
    expect(validateAction(state, state, LEAK({ targetId: 'assessment:east:tanks' }))).toEqual({ ok: false, reason: 'unknown assessment target' })
    expect(validateAction(state, state, LEAK({ stationId: 'nope' }))).toEqual({ ok: false, reason: 'unknown station' })
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 0, source: 'rumour', causeId: null } }, east: {} }
    expect(validateAction(state, state, LEAK())).toEqual({ ok: false, reason: 'that assessment is already inflated' })
    // En LEAK mot en rival fungerar som förut.
    expect(validateAction(state, state, LEAK({ targetId: 'brandt' }))).toEqual({ ok: true })
  })

  it('previewAction ger kostnad och lyckandechans som för övriga LEAK', () => {
    const state = fresh()
    state.house.stations = [{ ...station('rvn', 2) }]
    const p = previewAction(state, LEAK())
    expect(p.cost).toBe(B.intelCovertOpCost)
    expect(p.successPctKnown).toBe(true)
  })

  it('lyckad LEAK blåser upp bedömningen hos motsidan (bias, rubrik utan husets namn, privat rad med det); misslyckad gör det inte', () => {
    let success: GameState | null = null
    let failure: GameState | null = null
    let events: WireEvent[] = []
    for (let i = 0; i < 80 && (!success || !failure); i++) {
      const state = fresh(`leak-${i}`)
      const result = resolveTurn(state, { ...EMPTY, actions: [LEAK()] })
      const inflated = result.state.race.perception?.west?.artillery
      if (inflated && !success) {
        success = result.state
        events = result.wire
      }
      if (!inflated && !failure) failure = result.state
    }
    expect(success).not.toBeNull()
    expect(failure).not.toBeNull()
    expect(success!.race.perception!.west.artillery).toMatchObject({ bias: 1, source: 'leak' })
    expect(success!.race.perception!.east.artillery).toBeUndefined()
    const pub = events.find((e) => e.headline.includes('RUMOUR') && e.headline.includes('ARTILLERY'))!
    expect(pub.actorIsPlayer).toBe(false)
    expect(pub.headline).not.toContain(success!.house.name.toUpperCase())
    expect(events.some((e) => e.actorIsPlayer && e.headline.includes('ASSESSMENT'))).toBe(true)
    expect(success!.house.treasury).toBeLessThan(50_000_000)
    expect(failure!.house.treasury).toBeLessThan(50_000_000) // kostnaden är betald även när den spåras tillbaka
  })

  it('en avslöjad LEAK: tjänstemännen i det blocket tappar förtroende, doomsday stiger, biasen försvinner, rubrik namnger huset', () => {
    const state = fresh()
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 0, source: 'leak', causeId: null } }, east: {} }
    state.meta.turn = 1
    const relationBefore = state.officials['official-rvn-procurement']!.relationToPlayer
    const eastBefore = state.officials['official-nlf-procurement']!.relationToPlayer
    const doomsdayBefore = state.doomsday
    const { ctx, emitted } = makeCtx(state, createRng(seedWhere(B.leakExposeChancePct, true), 0))
    advancePerception(ctx)
    expect(state.race.perception.west.artillery).toBeUndefined()
    expect(state.officials['official-rvn-procurement']!.relationToPlayer).toBe(Math.max(0, relationBefore - B.leakExposedRelationPenalty))
    expect(state.officials['official-nlf-procurement']!.relationToPlayer).toBe(eastBefore)
    expect(state.doomsday).toBe(doomsdayBefore + B.leakExposedDoomsday)
    const row = emitted.find((e) => e.headline.includes('EXPOSED'))!
    expect(row.headline).toContain(state.house.name.toUpperCase())
    expect(row.actorIsPlayer).toBe(true)
  })

  it('en LEAK som inte avslöjas lever tills sanningen kommer fram (leakLifeTurns): inget straff, bara slut på efterfrågan', () => {
    const state = fresh()
    state.race.perception = { west: { artillery: { bias: 1, sinceTurn: 0, source: 'leak', causeId: null } }, east: {} }
    state.meta.turn = B.leakLifeTurns
    const relationBefore = state.officials['official-rvn-procurement']!.relationToPlayer
    const { ctx, emitted } = makeCtx(state, createRng(seedWhere(B.leakExposeChancePct, false), 0))
    advancePerception(ctx)
    expect(state.race.perception.west.artillery).toBeUndefined()
    expect(state.officials['official-rvn-procurement']!.relationToPlayer).toBe(relationBefore)
    expect(emitted.some((e) => e.headline.includes('MYTH'))).toBe(true)
  })
})
