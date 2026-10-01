// programme.trial.test.ts — P123 (ETAPP9_FORSLAG.md §8.1 fas 4, §8.2 motköp, beslut 9O, skyddsräcke 5 och 7). Det jämförande provet i
// köparens miljö, utvärderingsprotokollet och motköpet.
//
// Uppmätt värde = verklig kvalitet + prototypfaktor + mätbrus, dragna med ctx.rng. Provet görs i köparens miljö, så en miljöbrist
// kan avslöjas redan här (och en robust konstruktion belönas). Resultatet kommer som ett utvärderingsprotokoll med uppmätt värde
// per kravrad. Den som förlorar nära behåller sin konstruktion och får ett litet rykte ("TESTED BY THE … MINISTRY"). Motköp
// (PROCUREMENT/COUNTERPURCHASE, lagligt, kostar en handling): högre poäng, särskilt hos NON_ALIGNMENT-tjänstemän, men lägre marginal.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designTrueValues } from '../src/design.js'
import { previewAction } from '../src/previewAction.js'
import {
  advanceProgrammes,
  applyTestedReputation,
  counterPurchaseScore,
  evaluateTrial,
  measureEntrant,
  programmeProtocol,
  programmeRequirements,
} from '../src/programme.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { validateAction } from '../src/validateAction.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, GameState, PlayerAction, Programme, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  programmePrototypeMax: number
  programmeMeasureNoise: number
  programmeFlawReliabilityPenalty: number
  programmeFlawPerformancePenalty: number
  programmeTestedMargin: number
  programmeTestedQualityGain: number
  programmeCounterPurchaseScore: number
  programmeCounterPurchaseNonAlignedFactor: number
  programmeCounterPurchaseMarginPct: number
  qualityCategoryCap: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const NO_NOISE = { int: () => 0, chance: () => false, next: () => 0, pick: <T,>(a: readonly T[]) => a[0]!, cursor: () => 0 } as unknown as ResolveContext['rng']
const COUNTER: PlayerAction = { type: 'PROCUREMENT', op: 'COUNTERPURCHASE', programmeId: 'programme-1' }

function makeCtx(state: GameState, rng?: ResolveContext['rng']): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: rng ?? createRng('trial', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function tuned(performance: number, reliability: number, unitCostFactor = 1, over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance,
    reliability,
    unitCostFactor,
    trueQuality: (performance + reliability) / 2,
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

function trialState(d: Design | null, over: Partial<Programme> = {}): GameState {
  const state = createInitialState('indochina-slice', 'trial-seed')
  state.house.designs = d ? [d] : []
  state.house.treasury = 20_000_000
  state.meta.turn = 5
  state.programmes = [
    {
      id: 'programme-1',
      buyerId: 'rvn',
      category: 'artillery',
      baseProductId: '105mm_field_gun',
      trigger: 'requirementCard',
      requirements: programmeRequirements(state, 'rvn', 'artillery'),
      testEnvironment: 'jungle',
      grant: null,
      prize: { quantity: 60, deliveryTurns: 5, unitPrice: 19_000, advancePct: 10 },
      phase: 'trial',
      phaseSinceTurn: 4,
      announcedTurn: 0,
      entrants: [{ houseId: 'player', enteredTurn: 0, ...(d ? { designId: d.id } : {}) }, { houseId: 'brandt', enteredTurn: 0 }],
      traces: [],
      ...over,
    },
  ]
  return state
}

describe('uppmätt värde: verklig kvalitet + prototypfaktor + mätbrus (P123, §8.1 fas 4)', () => {
  it('ligger inom [sann − brus, sann + prototyp + brus], styckpris och leverans mäts utan brus, och samma rng ger samma mått', () => {
    const state = trialState(tuned(70, 66, 0.9))
    const p = state.programmes![0]!
    const entrant = p.entrants[0]!
    const truth = designTrueValues(state.house.designs[0]!)
    for (let i = 0; i < 40; i++) {
      const m = measureEntrant(state, p, entrant, createRng(`m${i}`, 0))
      expect(m.performance).toBeGreaterThanOrEqual(truth.performance - B.programmeMeasureNoise)
      expect(m.performance).toBeLessThanOrEqual(truth.performance + B.programmePrototypeMax + B.programmeMeasureNoise)
      expect(m.reliability).toBeGreaterThanOrEqual(truth.reliability - B.programmeMeasureNoise)
      expect(m.reliability).toBeLessThanOrEqual(truth.reliability + B.programmePrototypeMax + B.programmeMeasureNoise)
      expect(m.unitCostFactor).toBe(0.9)
    }
    expect(measureEntrant(state, p, entrant, createRng('same', 0))).toEqual(measureEntrant(state, p, entrant, createRng('same', 0)))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => measureEntrant(state, p, entrant, createRng(`v${i}`, 0)).performance))
    expect(seen.size).toBeGreaterThan(1) // slumpen verkar
  })

  it('rivalerna mäts på samma sätt (prototyp och brus runt deras spec)', () => {
    const state = trialState(tuned(70, 66))
    const p = state.programmes![0]!
    const rival = p.entrants[1]!
    const none = measureEntrant(state, p, rival, NO_NOISE)
    const seen = new Set(Array.from({ length: 40 }, (_, i) => measureEntrant(state, p, rival, createRng(`r${i}`, 0)).performance))
    expect(seen.size).toBeGreaterThan(1)
    for (const v of seen) {
      expect(v).toBeGreaterThanOrEqual(none.performance - B.programmeMeasureNoise)
      expect(v).toBeLessThanOrEqual(none.performance + B.programmePrototypeMax + B.programmeMeasureNoise)
    }
  })

  it('mätningen är ren: den skriver ingenting i staten', () => {
    const state = trialState(tuned(70, 66, 1, { latentFlaw: { environment: 'jungle', severity: 2 } }))
    const before = JSON.stringify(state)
    measureEntrant(state, state.programmes![0]!, state.programmes![0]!.entrants[0]!, createRng('pure', 0))
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('köparens miljö och miljöbrister (P123, §5.3 och §8.1)', () => {
  it('en brist som hör till provmiljön sänker uppmätt prestanda och tillförlitlighet med allvaret × straffet; en brist i en annan miljö gör det inte', () => {
    const clean = trialState(tuned(70, 70))
    const same = trialState(tuned(70, 70, 1, { latentFlaw: { environment: 'jungle', severity: 2 } }))
    const other = trialState(tuned(70, 70, 1, { latentFlaw: { environment: 'mine', severity: 2 } }))
    const measure = (s: GameState) => measureEntrant(s, s.programmes![0]!, s.programmes![0]!.entrants[0]!, createRng('flaw', 0))
    const base = measure(clean)
    const hit = measure(same)
    expect(hit.reliability).toBe(base.reliability - 2 * B.programmeFlawReliabilityPenalty)
    expect(hit.performance).toBe(base.performance - 2 * B.programmeFlawPerformancePenalty)
    expect(measure(other)).toEqual(base)
  })

  it('provet avslöjar bristen (flawRevealed, med en rubrik) bara när miljön stämmer', () => {
    const state = trialState(tuned(70, 70, 1, { latentFlaw: { environment: 'jungle', severity: 1 } }))
    const { ctx, emitted } = makeCtx(state)
    advanceProgrammes(ctx)
    expect(state.house.designs[0]!.flawRevealed).toBe(true)
    expect(emitted.some((e) => e.actorIsPlayer && e.headline.includes('FLAW') && e.headline.includes('JUNGLE'))).toBe(true)
    const miss = trialState(tuned(70, 70, 1, { latentFlaw: { environment: 'mine', severity: 1 } }))
    advanceProgrammes(makeCtx(miss).ctx)
    expect(miss.house.designs[0]!.flawRevealed).toBe(false)
  })

  it('en robust konstruktion belönas: med samma brist klarar den tillförlitlighetsgolvet medan en avancerad diskvalificeras', () => {
    const robust = trialState(tuned(60, 72, 0.85, { focus: 'robust', latentFlaw: { environment: 'jungle', severity: 2 } }))
    const advanced = trialState(tuned(74, 42, 1.25, { focus: 'advanced', latentFlaw: { environment: 'jungle', severity: 2 } }))
    advanceProgrammes(makeCtx(robust, NO_NOISE).ctx)
    advanceProgrammes(makeCtx(advanced, NO_NOISE).ctx)
    expect(robust.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!.disqualified).toBeNull()
    expect(advanced.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!.disqualified).toContain('RELIABILITY')
  })

  it('provet gör att huset prövat konstruktionen i miljön: testedIn och ett smalare intervall (minst 0)', () => {
    const state = trialState(tuned(70, 70, 1, { uncertainty: 2 }))
    advanceProgrammes(makeCtx(state).ctx)
    const d = state.house.designs[0]!
    expect(d.testedIn).toContain('jungle')
    expect(d.uncertainty).toBe(1)
    const zero = trialState(tuned(70, 70, 1, { uncertainty: 0, testedIn: ['jungle'] }))
    advanceProgrammes(makeCtx(zero).ctx)
    expect(zero.house.designs[0]!.uncertainty).toBe(0)
    expect(zero.house.designs[0]!.testedIn).toEqual(['jungle'])
  })
})

describe('utvärderingsprotokollet (P123, §8.1 fas 4)', () => {
  it('visar uppmätt värde per kravrad för alla deltagare — men bara för den som själv deltog (skyddsräcke 5) och först när provet är gjort', () => {
    const state = trialState(tuned(70, 70))
    expect(programmeProtocol(state, state.programmes![0]!)).toBeNull() // provet ännu inte gjort
    advanceProgrammes(makeCtx(state).ctx)
    const p = state.programmes![0]!
    const view = programmeProtocol(state, p)!
    expect(view.entries.map((e) => e.name).sort()).toEqual([state.house.name, state.rivals['brandt']!.name].sort())
    const own = view.entries.find((e) => e.houseId === 'player')!
    expect(own.rows.map((r) => r.kind)).toEqual(['performance', 'reliability', 'unitCost', 'delivery'])
    expect(own.rows[0]).toHaveProperty('measured')
    expect(own.rows[0]).toHaveProperty('pass')
    expect(view.winner).toBe(p.result!.winner)
    expect(view.entries.every((e) => !('score' in e))).toBe(true) // poängen är inte en del av protokollet
    // En som inte deltog får inget protokoll.
    const out = trialState(tuned(70, 70))
    out.programmes![0]!.entrants = out.programmes![0]!.entrants.filter((e) => e.houseId !== 'player')
    advanceProgrammes(makeCtx(out).ctx)
    expect(programmeProtocol(out, out.programmes![0]!)).toBeNull()
  })

  it('ett underkänt ska-krav syns som underkänt med orsaken', () => {
    const state = trialState(tuned(30, 70))
    advanceProgrammes(makeCtx(state, NO_NOISE).ctx)
    const view = programmeProtocol(state, state.programmes![0]!)!
    const own = view.entries.find((e) => e.houseId === 'player')!
    expect(own.disqualified).toContain('PERFORMANCE')
    expect(own.rows[0]!.pass).toBe(false)
  })
})

describe('ett litet rykte åt den som förlorar nära (P123, §8.1)', () => {
  const lost = (margin: number, over: Partial<{ disqualified: string | null; winner: string }> = {}): { state: GameState; p: Programme } => {
    const state = trialState(tuned(60, 60))
    const p = state.programmes![0]!
    p.phase = 'awarded'
    p.result = {
      winner: over.winner ?? 'brandt',
      turn: 5,
      scores: [
        { houseId: 'player', score: 10 - margin, disqualified: over.disqualified ?? null, rows: [] },
        { houseId: 'brandt', score: 10, disqualified: null, rows: [] },
      ],
    }
    return { state, p }
  }

  it('en kvalificerad förlorare inom programmeTestedMargin får programmeTestedQualityGain på kategoriryktet, med rubriken "TESTED BY THE … MINISTRY"', () => {
    const { state, p } = lost(B.programmeTestedMargin)
    const { ctx, emitted } = makeCtx(state)
    applyTestedReputation(ctx, p)
    expect(state.house.categoryQuality.artillery).toBe(B.programmeTestedQualityGain)
    const row = emitted.find((e) => e.headline.includes('TESTED BY THE'))!
    expect(row.headline).toContain('REPUBLIC OF VIETNAM')
    expect(row.actorIsPlayer).toBe(true)
  })

  it('inte när förlusten är stor, när huset var diskvalificerat, när huset vann, eller när huset inte deltog', () => {
    for (const [margin, over] of [[B.programmeTestedMargin + 1, {}], [0, { disqualified: 'X' }], [0, { winner: 'player' }]] as const) {
      const { state, p } = lost(margin, over)
      applyTestedReputation(makeCtx(state).ctx, p)
      expect(state.house.categoryQuality.artillery).toBe(0)
    }
    const { state, p } = lost(0)
    p.entrants = p.entrants.filter((e) => e.houseId !== 'player')
    applyTestedReputation(makeCtx(state).ctx, p)
    expect(state.house.categoryQuality.artillery).toBe(0)
  })

  it('klampas vid qualityCategoryCap', () => {
    const { state, p } = lost(0)
    state.house.categoryQuality.artillery = B.qualityCategoryCap
    applyTestedReputation(makeCtx(state).ctx, p)
    expect(state.house.categoryQuality.artillery).toBe(B.qualityCategoryCap)
  })
})

describe('motköp (PROCUREMENT/COUNTERPURCHASE) (P123, §8.2, beslut 9O)', () => {
  const open = (over: Partial<Programme> = {}, d: Design | null = tuned(70, 70)): GameState => {
    const state = trialState(d, { phase: 'announced', phaseSinceTurn: 0, ...over })
    state.meta.turn = 0
    return state
  }

  it('valideras: okänd infordran, ej deltagare, fel fas, redan erbjudet', () => {
    const state = open()
    expect(validateAction(state, state, COUNTER)).toEqual({ ok: true })
    expect(validateAction(state, state, { ...COUNTER, programmeId: 'nope' } as PlayerAction)).toEqual({ ok: false, reason: 'unknown programme' })
    const notIn = open()
    notIn.programmes![0]!.entrants = notIn.programmes![0]!.entrants.filter((e) => e.houseId !== 'player')
    expect(validateAction(notIn, notIn, COUNTER)).toEqual({ ok: false, reason: 'not entered in this programme' })
    const late = open({ phase: 'trial' })
    expect(validateAction(late, late, COUNTER)).toEqual({ ok: false, reason: 'counter-purchase is no longer possible' })
    const dev = open({ phase: 'development' })
    expect(validateAction(dev, dev, COUNTER)).toEqual({ ok: true })
    const done = open()
    done.programmes![0]!.entrants.find((e) => e.houseId === 'player')!.counterPurchase = true
    expect(validateAction(done, done, COUNTER)).toEqual({ ok: false, reason: 'counter-purchase already offered' })
  })

  it('kostar en handling (och bara en), emitterar en rad och markerar anmälan; previewAction visar ingen kostnad', () => {
    const state = open()
    const hire: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } }
    const full = Array.from({ length: state.house.actionPoints }, () => hire)
    const blocked = resolveTurn(state, { ...EMPTY, actions: [...full, COUNTER] })
    expect(blocked.rejected.some((r) => r.reason === 'no executive actions remaining')).toBe(true)
    expect(blocked.state.programmes![0]!.entrants.find((e) => e.houseId === 'player')!.counterPurchase).toBeUndefined()
    const ok = resolveTurn(state, { ...EMPTY, actions: [COUNTER] })
    expect(ok.rejected).toEqual([])
    expect(ok.state.programmes![0]!.entrants.find((e) => e.houseId === 'player')!.counterPurchase).toBe(true)
    expect(ok.wire.some((e) => e.actorIsPlayer && e.headline.includes('COUNTER-PURCHASE'))).toBe(true)
    expect(previewAction(state, COUNTER).cost).toBeNull()
  })

  it('ger högre provpoäng, och mer hos en NON_ALIGNMENT-tjänsteman', () => {
    const state = open()
    expect(counterPurchaseScore(state, state.programmes![0]!)).toBe(B.programmeCounterPurchaseScore)
    state.officials['official-rvn-procurement']!.agenda = 'NON_ALIGNMENT'
    expect(counterPurchaseScore(state, state.programmes![0]!)).toBe(B.programmeCounterPurchaseScore * B.programmeCounterPurchaseNonAlignedFactor)
    const base = { houseId: 'player', performance: 70, reliability: 70, unitCostFactor: 1, deliveryTurns: 3 }
    const [plain, bonus] = evaluateTrial(open().programmes![0]!, [base, { ...base, counterPurchaseScore: B.programmeCounterPurchaseScore }], { relation: {}, reputation: {}, neutral: {} })
    expect(bonus!.score - plain!.score).toBeCloseTo(B.programmeCounterPurchaseScore, 9)
  })

  it('mätningen bär motköpet, och vinner huset blir marginalen lägre (styckkostnaden vid signering är högre)', () => {
    const run = (counter: boolean): { measured: number; unitCost: number } => {
      const state = trialState(tuned(95, 95, 0.6))
      state.programmes![0]!.entrants[0]!.counterPurchase = counter
      const m = measureEntrant(state, state.programmes![0]!, state.programmes![0]!.entrants[0]!, NO_NOISE)
      advanceProgrammes(makeCtx(state, NO_NOISE).ctx)
      const contract = state.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!
      return { measured: m.counterPurchaseScore ?? 0, unitCost: contract.unitCostAtSigning }
    }
    const plain = run(false)
    const counter = run(true)
    expect(plain.measured).toBe(0)
    expect(counter.measured).toBeGreaterThan(0)
    expect(counter.unitCost).toBe(Math.round(plain.unitCost * (1 + B.programmeCounterPurchaseMarginPct / 100)))
  })
})
