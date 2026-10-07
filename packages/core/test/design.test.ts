// design.test.ts — P109 (ETAPP9_FORSLAG.md §5.1–5.2, beslut 9B/9D/9L, skyddsräcke 1–3 och 5).
//
// Typbladet (Design), ritbordsuppdraget (inriktning + ambition som stående order DESIGN, ingen handling) och
// utfallet (ett genombrott, en gedigen konstruktion eller en med en dold brist, dragen med ctx.rng). En
// konstruktion är en variant av en basprodukt (9B): ett bud kan bära designId på en order för basprodukten, och
// termen läggs EFTER computeScore via en enda funktion (designBidTerm) som bidding.ts, bidEstimate och
// playerWinCurve delar. Ett bud utan konstruktion beter sig exakt som förut. Dolda värden läcker inte.
import { withKnowledgeWorks } from './helpers/facilities.js'
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import {
  designBaseProduct,
  designBidTerm,
  designCostPerTurn,
  designDuration,
  designTrueValues,
  qualityClassOf,
  rollDesign,
} from '../src/design.js'
import { bidEstimate, designDisplay, playerWinCurve } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { getProduct, computeUnitCostNow } from '../src/pricing.js'
import { createRng } from '../src/rng.js'
import { frontierGeneration } from '../src/race.js'
import { createInitialState } from '../src/state.js'
import type { Design, DesignAmbition, DesignFocus, GameState, Order, StandingOrderChange, TurnSubmission } from '../src/types.js'

const B = balance as unknown as {
  rndProjectTurns: number
  chiefEngineerProjectThreshold: number
  chiefEngineerTurnsSaved: number
  designFocus: Record<DesignFocus, { performance: number; reliability: number; unitCostFactor: number }>
  designAmbition: Record<DesignAmbition, { steps: number; turnsFactor: number; costFactor: number }>
  designAmbitionPerformanceGain: number
  designAmbitionReliabilityLoss: number
  designBreakthroughBasePct: number
  designFlawBasePct: number
  designAmbitionFlawGainPct: number
  designChiefEngineerFlawReductionPct: number
  designExperienceFlawReductionPct: number
  designExperienceCap: number
  qualityClassThresholds: { A: number; B: number; C: number }
  designBidWeight: number
  designBenchmarkBase: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const START = (focus: DesignFocus, ambition: DesignAmbition, category: 'artillery' | 'naval' = 'artillery'): StandingOrderChange => ({
  kind: 'DESIGN',
  op: 'START',
  category,
  focus,
  ambition,
})

function fresh(): GameState {
  const state = withKnowledgeWorks(createInitialState('indochina-slice', 'design-seed'))
  state.house.treasury = 50_000_000
  return state
}

function designWith(over: Partial<Design> = {}): Design {
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

function orderFor(state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 0,
  }
}

describe('startläget och basprodukten (P109)', () => {
  it('ett nytt hus har inga konstruktioner', () => {
    expect(fresh().house.designs).toEqual([])
  })

  it('basprodukten är kategorins icke-restricted produkt (artilleri → 105 mm, inte Mk-9)', () => {
    expect(designBaseProduct('artillery').id).toBe('105mm_field_gun')
    expect(designBaseProduct('naval').restricted).toBe(false)
  })

  it('ett nytt designprojekts mål är det ledande blockets generation i kategorin plus ambitionens steg (P118)', () => {
    const state = createInitialState('indochina-slice', 'gen-target')
    expect(frontierGeneration(state, 'artillery')).toBe(1)
    state.race.generation.east.artillery = 2
    expect(frontierGeneration(state, 'artillery')).toBe(2)
  })
})

describe('ritbordsuppdraget som stående order DESIGN (P109, §5.2)', () => {
  it('START giltig; okänd inriktning/ambition/kategori, för låg teknik och ett andra projekt i kategorin avvisas', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, START('balanced', 'timely')).ok).toBe(true)
    const bad = (over: object): StandingOrderChange => ({ ...START('balanced', 'timely'), ...over }) as StandingOrderChange
    expect(validateStandingOrderChange(state, state, bad({ focus: 'fast' })).ok).toBe(false)
    expect(validateStandingOrderChange(state, state, bad({ ambition: 'wild' })).ok).toBe(false)
    expect(validateStandingOrderChange(state, state, bad({ category: 'cyber' })).ok).toBe(false)

    const low = fresh()
    low.house.techLevel.artillery = designBaseProduct('artillery').techRequired - 1
    expect(validateStandingOrderChange(low, low, START('balanced', 'timely'))).toEqual({ ok: false, reason: 'tech level too low for a design in that category' })

    const busy = fresh()
    const started = resolveTurn(busy, { ...EMPTY, standingOrders: [START('balanced', 'timely')] }).state
    expect(validateStandingOrderChange(started, started, START('robust', 'forward'))).toEqual({ ok: false, reason: 'a design project is already running in that category' })
  })

  it('CANCEL kräver ett pågående designprojekt och tar bort det', () => {
    const state = fresh()
    const cancel: StandingOrderChange = { kind: 'DESIGN', op: 'CANCEL', category: 'artillery' }
    expect(validateStandingOrderChange(state, state, cancel)).toEqual({ ok: false, reason: 'no design project in that category' })
    let s = resolveTurn(state, { ...EMPTY, standingOrders: [START('balanced', 'timely')] }).state
    expect(s.house.rnd).toHaveLength(1)
    s = resolveTurn(s, { ...EMPTY, standingOrders: [cancel] }).state
    expect(s.house.rnd).toEqual([])
  })

  it('kostar ingen handling och startar ett projekt med ambitionens längd och kostnadsfaktor', () => {
    for (const ambition of ['timely', 'forward', 'ahead'] as const) {
      const state = fresh()
      const result = resolveTurn(state, { ...EMPTY, standingOrders: [START('robust', ambition)] })
      expect(result.rejected).toEqual([])
      const project = result.state.house.rnd[0]!
      expect(project.design).toMatchObject({ focus: 'robust', ambition })
      expect(project.turnsTotal).toBe(designDuration(state.house, ambition))
      expect(project.costFactor).toBe(designCostPerTurn(ambition))
    }
    const house = fresh().house
    expect(designDuration(house, 'timely')).toBe(B.rndProjectTurns)
    expect(designDuration(house, 'ahead')).toBeGreaterThan(designDuration(house, 'forward'))
    expect(designCostPerTurn('ahead')).toBeGreaterThan(designCostPerTurn('forward'))
    house.staff.chiefEngineer = B.chiefEngineerProjectThreshold + 1
    expect(designDuration(house, 'timely')).toBe(B.rndProjectTurns - B.chiefEngineerTurnsSaved)
  })

  it('ett designprojekt blockerar inte ett forskningsspår i samma kategori, och tvärtom', () => {
    let state = fresh()
    state = resolveTurn(state, {
      ...EMPTY,
      standingOrders: [START('balanced', 'timely'), { kind: 'RESEARCH', op: 'SET', category: 'artillery', pace: 'normal' }],
    }).state
    state = resolveTurn(state, EMPTY).state
    expect(state.house.rnd.filter((p) => p.design)).toHaveLength(1)
    expect(state.house.rnd.filter((p) => !p.design)).toHaveLength(1)
  })
})

describe('utfallet: en konstruktion föds (P109, §5.2)', () => {
  function completeOne(focus: DesignFocus, ambition: DesignAmbition, seedState = fresh()): GameState {
    let state = resolveTurn(seedState, { ...EMPTY, standingOrders: [START(focus, ambition)] }).state
    for (let i = 0; i < 40 && state.house.rnd.length > 0; i++) state = resolveTurn(state, EMPTY).state
    return state
  }

  it('projektet avslutas med en Design: namn enligt 9L, generation, synliga värden efter inriktning och ambition', () => {
    const state = completeOne('balanced', 'forward')
    expect(state.house.designs).toHaveLength(1)
    const design = state.house.designs[0]!
    expect(design.name).toMatch(/^H&V M\d\d Field Gun$/)
    expect(design.category).toBe('artillery')
    expect(design.baseProductId).toBe('105mm_field_gun')
    expect(design.status).toBe('active')
    expect(design.lineage).toBeNull()
    expect(design.generation).toBe(1 + B.designAmbition.forward.steps)
    expect(design.performance).toBe(B.designFocus.balanced.performance + B.designAmbitionPerformanceGain)
    expect(design.reliability).toBe(B.designFocus.balanced.reliability - B.designAmbitionReliabilityLoss)
    expect(design.trueQuality).toBeGreaterThanOrEqual(0)
    expect(design.trueQuality).toBeLessThanOrEqual(100)
  })

  it('inriktningen avgör spelstilen: robust är billig och tillförlitlig, avancerad är stark och dyr', () => {
    const robust = completeOne('robust', 'timely').house.designs[0]!
    const advanced = completeOne('advanced', 'timely').house.designs[0]!
    expect(advanced.performance).toBeGreaterThan(robust.performance)
    expect(robust.reliability).toBeGreaterThan(advanced.reliability)
    expect(advanced.unitCostFactor).toBeGreaterThan(robust.unitCostFactor)
    expect(robust.unitCostFactor).toBeLessThan(1)
  })

  it('utfallet är deterministiskt för samma frö och rör huvud-Rng:n bara när en konstruktion blir klar', () => {
    const a = completeOne('advanced', 'ahead').house.designs[0]!
    const b = completeOne('advanced', 'ahead').house.designs[0]!
    expect(a).toEqual(b)
    const noDesign = resolveTurn(fresh(), EMPTY).state
    expect(noDesign.house.designs).toEqual([])
  })

  it('en tur med en händelse "design klar" som inte avslöjar dolda värden (skyddsräcke 5)', () => {
    let state = resolveTurn(fresh(), { ...EMPTY, standingOrders: [START('balanced', 'timely')] }).state
    const headlines: string[] = []
    for (let i = 0; i < 12 && state.house.rnd.length > 0; i++) {
      const r = resolveTurn(state, EMPTY)
      state = r.state
      headlines.push(...r.wire.map((e) => e.headline))
    }
    const done = headlines.find((h) => h.includes('DESIGN COMPLETE'))
    expect(done).toBeDefined()
    expect(done).toContain(state.house.designs[0]!.name.toUpperCase())
    expect(done).not.toContain(String(state.house.designs[0]!.trueQuality))
    expect(done!.toLowerCase()).not.toContain('flaw')
  })

  it('rollDesign: andelarna genombrott/brist följer balansen, ambition höjer bristrisken, chefsingenjör och erfarenhet sänker den', () => {
    const N = 600
    const share = (
      ambition: DesignAmbition,
      tweak: (h: GameState['house']) => void = () => undefined,
    ): { flawed: number; breakthrough: number } => {
      let flawed = 0
      let breakthrough = 0
      for (let i = 0; i < N; i++) {
        const state = fresh()
        tweak(state.house)
        const d = rollDesign(createRng(`roll-${ambition}-${i}`, 0), state.house, {
          category: 'artillery',
          focus: 'balanced',
          ambition,
          upgradeOf: null,
          targetGeneration: 1 + B.designAmbition[ambition].steps,
          turn: 4,
          year: 1965,
        })
        if (d.latentFlaw) flawed++
        if (d.trueQuality - (d.performance + d.reliability) / 2 > 8) breakthrough++
      }
      return { flawed: flawed / N, breakthrough: breakthrough / N }
    }
    const timely = share('timely')
    expect(timely.flawed).toBeGreaterThan((B.designFlawBasePct - 6) / 100)
    expect(timely.flawed).toBeLessThan((B.designFlawBasePct + 6) / 100)
    expect(timely.breakthrough).toBeGreaterThan(0.04)
    const ahead = share('ahead')
    expect(ahead.flawed).toBeGreaterThan(timely.flawed + 0.08)
    const withEngineer = share('timely', (h) => (h.staff.chiefEngineer = B.chiefEngineerProjectThreshold + 1))
    expect(withEngineer.flawed).toBeLessThan(timely.flawed - 0.02)
    const experienced = share('timely', (h) => {
      h.designs = [designWith({ id: 'd1' }), designWith({ id: 'd2' }), designWith({ id: 'd3' })]
    })
    expect(experienced.flawed).toBeLessThan(timely.flawed - 0.04)
  })
})

describe('kvalitetsklassen och intervallet (P109, §5.3 — skyddsräcke 5)', () => {
  it('qualityClassOf följer tröskelvärdena', () => {
    expect(qualityClassOf(B.qualityClassThresholds.A)).toBe('A')
    expect(qualityClassOf(B.qualityClassThresholds.A - 1)).toBe('B')
    expect(qualityClassOf(B.qualityClassThresholds.B)).toBe('B')
    expect(qualityClassOf(B.qualityClassThresholds.C)).toBe('C')
    expect(qualityClassOf(B.qualityClassThresholds.C - 1)).toBe('D')
  })

  it('designDisplay visar aldrig trueQuality eller latentFlaw, och den verkliga klassen ligger alltid i intervallet', () => {
    const state = fresh()
    const order = ['A', 'B', 'C', 'D'] as const
    for (let q = 0; q <= 100; q += 5) {
      const design = designWith({ id: `d-${q}`, trueQuality: q, uncertainty: 1, latentFlaw: { environment: 'jungle', severity: 2 } })
      const shown = designDisplay(state, design)
      expect(JSON.stringify(shown)).not.toContain('latentFlaw')
      expect(Object.keys(shown)).not.toContain('trueQuality')
      expect(shown.flaw).toBeNull() // bristen är dold tills den avslöjats
      const trueIdx = order.indexOf(qualityClassOf(q))
      const centerIdx = order.indexOf(shown.qualityClass.center)
      expect(Math.abs(centerIdx - trueIdx)).toBeLessThanOrEqual(shown.qualityClass.plusMinus)
    }
  })

  it('designDisplay är stabil mellan anrop (hash-seedad, drar inte ur spelets Rng)', () => {
    const state = fresh()
    const design = designWith({ trueQuality: 55, uncertainty: 2 })
    const cursor = state.meta.rngCursor
    const first = designDisplay(state, design)
    for (let i = 0; i < 5; i++) expect(designDisplay(state, design)).toEqual(first)
    expect(state.meta.rngCursor).toBe(cursor)
  })
})

describe('bud med en konstruktion — en formel, en källa (P109, skyddsräcke 3)', () => {
  function withDesign(state: GameState, design: Design): GameState {
    state.house.designs = [design]
    return state
  }

  it('designTrueValues förskjuter nominella värden med utfallet (trueQuality minus nominellt medelvärde)', () => {
    const d = designWith({ performance: 60, reliability: 50, trueQuality: 65 })
    expect(designTrueValues(d)).toEqual({ performance: 70, reliability: 60 })
  })

  it('termen (P111: köparviktad och relativ) är 0 för en konstruktion på riktmärket, positiv över och negativ under, begränsad till ±designBidWeight', () => {
    // introducedTurn -100: nyhetsvärdet (P117) har avtagit, så termen är den rena köparviktade jämförelsen.
    const strong = designWith({ performance: 90, reliability: 90, trueQuality: 90, introducedTurn: -100 })
    const weak = designWith({ performance: 10, reliability: 10, trueQuality: 10, unitCostFactor: 1, introducedTurn: -100 })
    const neutral = designWith({ performance: B.designBenchmarkBase, reliability: B.designBenchmarkBase, trueQuality: B.designBenchmarkBase, introducedTurn: -100 })
    const state = fresh()
    const order = orderFor(state)
    expect(designBidTerm(state, neutral, order)).toBeCloseTo(0, 9)
    expect(designBidTerm(state, strong, order)).toBeGreaterThan(0)
    expect(designBidTerm(state, strong, order)).toBeLessThanOrEqual(B.designBidWeight)
    expect(designBidTerm(state, weak, order)).toBeLessThan(0)
    expect(designBidTerm(state, weak, order)).toBeGreaterThanOrEqual(-B.designBidWeight)
  })

  it('bidding.ts avvisar okänd konstruktion, en för en annan basprodukt och en tillbakadragen', () => {
    const run = (design: Design | null, designId: string): TurnSubmission['bids'] => {
      const state = fresh()
      if (design) state.house.designs = [design]
      const order: Order = { ...orderFor(state), expiresTurn: 0 }
      state.market.openOrders = [order]
      state.meta.turn = 0
      const rejected: { action: unknown; reason: string }[] = []
      bidding({
        state,
        draft: state,
        submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId }], actions: [] },
        rng: createRng('rej', 0),
        emit: () => 't',
        rejected: rejected as never,
      })
      return rejected as never
    }
    expect(run(null, 'nope')).toEqual([expect.objectContaining({ reason: 'unknown design' })])
    expect(run(designWith({ baseProductId: 'm1_rifle', category: 'infantry' }), 'design-1')).toEqual([expect.objectContaining({ reason: 'design does not fit this order' })])
    expect(run(designWith({ status: 'withdrawn' }), 'design-1')).toEqual([expect.objectContaining({ reason: 'design is withdrawn' })])
  })

  it('ett vunnet bud med konstruktion ger ett Contract med designId och styckkostnad × unitCostFactor', () => {
    const state = withDesign(fresh(), designWith({ unitCostFactor: 0.85 }))
    const order: Order = { ...orderFor(state), expiresTurn: 0, competingRivals: [] }
    state.market.openOrders = [order]
    state.meta.turn = 0
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }], actions: [] },
      rng: createRng('win', 0),
      emit: () => 't',
      rejected: [],
    })
    const contract = state.market.contracts[0]!
    expect(contract.designId).toBe('design-1')
    const base = computeUnitCostNow(getProduct('105mm_field_gun'), 'A', state.market.commodities)
    expect(contract.unitCostAtSigning).toBe(Math.round(base * 0.85))
  })

  it('ett bud utan designId ger ett Contract utan designId (beter sig exakt som förut)', () => {
    const state = fresh()
    const order: Order = { ...orderFor(state), expiresTurn: 0, competingRivals: [] }
    state.market.openOrders = [order]
    state.meta.turn = 0
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0 }], actions: [] },
      rng: createRng('win2', 0),
      emit: () => 't',
      rejected: [],
    })
    expect(state.market.contracts[0]!.designId).toBeUndefined()
  })

  it('playerWinCurve och bidEstimate ser konstruktionen: en stark höjer kurvan, en svag sänker den, utan designId oförändrat', () => {
    const base = fresh()
    const order = orderFor(base)
    const sum = (c: { confidence: number }[]): number => c.reduce((s, p) => s + p.confidence, 0)
    const plain = playerWinCurve(base, order, 'A')
    const strongState = withDesign(fresh(), designWith({ id: 's', performance: 95, reliability: 95, trueQuality: 95 }))
    const weakState = withDesign(fresh(), designWith({ id: 'w', performance: 5, reliability: 5, trueQuality: 5 }))
    expect(playerWinCurve(base, order, 'A', undefined)).toEqual(plain)
    expect(sum(playerWinCurve(strongState, order, 'A', 's'))).toBeGreaterThan(sum(plain))
    expect(sum(playerWinCurve(weakState, order, 'A', 'w'))).toBeLessThan(sum(plain))
    expect(sum(bidEstimate(strongState, order, 'A', 's').winBand)).toBeGreaterThanOrEqual(sum(bidEstimate(base, order, 'A').winBand))
  })

  it('bidding.ts avgör med samma term som playerWinCurve lovar: frekvens och kurva stämmer inom ±15 pp med en stark konstruktion', () => {
    const design = designWith({ id: 's', performance: 95, reliability: 95, trueQuality: 95 })
    const probe = withDesign(fresh(), design)
    const curve = playerWinCurve(probe, orderFor(probe), 'A', 's')
    const point = curve.reduce((best, p) => (Math.abs(p.confidence - 50) < Math.abs(best.confidence - 50) ? p : best))
    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const s = createInitialState('indochina-slice', `design-parity-${i}`)
      s.house.designs = [design]
      const order: Order = { ...orderFor(s), expiresTurn: 0 }
      s.market.openOrders = [order]
      s.meta.turn = 0
      bidding({
        state: s,
        draft: s,
        submission: { standingOrders: [], bids: [{ orderId: order.id, price: point.price, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 's' }], actions: [] },
        rng: createRng(`design-parity-${i}`, 0),
        emit: () => 't',
        rejected: [],
      })
      if (s.market.contracts.length > 0) wins++
    }
    expect(Math.abs((wins / SEEDS) * 100 - point.confidence)).toBeLessThanOrEqual(15)
  })
})
