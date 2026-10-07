// race.generations.test.ts — P118 (ETAPP9_FORSLAG.md §7.1, beslut 9H, skyddsräcke 4 och 5). Blockens generationer, kravkort och
// köpare som följer sitt block.
//
// Varje block (väst/öst) har en DOLD generation per kategori som stiger enligt ett historiskt grundschema (balance.
// blocGenerationSchedule) och påskyndas av händelser. Nästa kvartals kravkort — ministeriernas kommande krav per kategori — ligger
// synliga (men utan generationsnumret; bedömningarna är P120). När ett block går upp en generation fasas den äldsta ut för
// köparna i blocket, automatiskt, och köparnas techLevel följer: det är fältets första skrivare. Ett nytt pipeline-steg, `race`,
// körs direkt före `orders` så att nya krav gäller samma tur.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designBenchmark, designBidTerm } from '../src/design.js'
import { awardFieldOccasions } from '../src/fieldQuality.js'
import {
  BLOCS,
  accelerateBlocStep,
  advanceRace,
  blocGeneration,
  designPhasedOutForBloc,
  frontierGeneration,
  requirementCards,
  scheduledGeneration,
} from '../src/race.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, GameState, Order, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as {
  blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>
  blocTechLevelStep: number
  raceAccelerationTurns: number
  raceAccelerationCap: number
  requirementCardHorizon: number
  designPhaseOutKeep: number
  designBenchmarkBase: number
  benchmarkPerGeneration: number
  provenOccasions: number
}
const SCHEDULE = B.blocGenerationSchedule

// P141 steg 2a: datan har blocTechLevelStep 1 (var 0 till P141; se balance.json _p118_note och _p141_note). Mekanismens olika steg testas med ett uttryckligt värde i just de testerna — balansobjektet är samma
// objekt race.ts läser.
function withTechStep<T>(step: number, run: () => T): T {
  const before = B.blocTechLevelStep
  B.blocTechLevelStep = step
  try {
    return run()
  } finally {
    B.blocTechLevelStep = before
  }
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed = 'race-gen'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 APC',
    category: 'armour',
    baseProductId: 'm3_apc',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 60,
    reliability: 60,
    unitCostFactor: 1,
    trueQuality: 60,
    uncertainty: 1,
    latentFlaw: null,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: -100,
    status: 'active',
    ...over,
  }
}

function orderFor(buyerId = 'rvn', productId = 'm3_apc'): Order {
  return {
    id: 'order-test-0',
    buyerId,
    productId,
    quantity: 50,
    statedBudget: 5_000_000,
    trueBudget: 7_000_000,
    referencePrice: 6_000_000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: `official-${buyerId}-procurement`,
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: buyerId === 'rvn' ? 'front-1' : 'front-laos',
    advancePct: 0,
  }
}

describe('grundschemat (P118, §7.1)', () => {
  it('har en stigande lista steg per block och kategori, alla sex kategorier, båda blocken', () => {
    expect(Object.keys(SCHEDULE).sort()).toEqual(['aviation', 'armour', 'artillery', 'electronics', 'infantry', 'naval'].sort())
    for (const category of Object.keys(SCHEDULE) as TechCategory[]) {
      for (const bloc of BLOCS) {
        const turns = SCHEDULE[category][bloc]
        expect(turns.length).toBeGreaterThan(0)
        expect([...turns].sort((a, b) => a - b)).toEqual(turns)
      }
    }
  })

  it('blocken kliver vid olika turer i varje kategori (annars finns inget gap att jaga)', () => {
    for (const category of Object.keys(SCHEDULE) as TechCategory[]) {
      expect(SCHEDULE[category].west[0], category).not.toBe(SCHEDULE[category].east[0])
    }
  })

  it('de ledande stegen ligger på tur 4, 8 och 12, två kategorier per steg (ägarbeslut 2026-09-30); det andra blocket följer efter fyra turer', () => {
    const leaders = Object.values(SCHEDULE).map((c) => Math.min(c.west[0]!, c.east[0]!))
    expect([...leaders].sort((a, b) => a - b)).toEqual([4, 4, 8, 8, 12, 12])
    for (const c of Object.values(SCHEDULE)) expect(Math.abs(c.west[0]! - c.east[0]!)).toBe(4)
  })

  it('en ny partistart har generation 1 överallt och ingen framflyttning', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    for (const bloc of BLOCS) {
      for (const category of Object.keys(SCHEDULE) as TechCategory[]) {
        expect(blocGeneration(state, bloc, category)).toBe(1)
        expect(state.race.pulled[bloc][category] ?? 0).toBe(0)
      }
    }
  })

  it('scheduledGeneration (för sparade partier) räknar de steg som hunnit ske före en tur', () => {
    const first = SCHEDULE.artillery.east[0]!
    expect(scheduledGeneration(first - 1, 'east', 'artillery')).toBe(1)
    expect(scheduledGeneration(first, 'east', 'artillery')).toBe(1) // steget sker i den turens resolve
    expect(scheduledGeneration(first + 1, 'east', 'artillery')).toBe(2)
    expect(scheduledGeneration(99, 'east', 'artillery')).toBe(1 + SCHEDULE.artillery.east.length)
  })
})

describe('generationsskiftet (P118, §7.1)', () => {
  const category: TechCategory = 'naval'
  const westTurn = SCHEDULE.naval.west[0]!

  it('sker vid blockets schemalagda tur, bara i det blocket, med en rubrik utan generationsnummer', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.meta.turn = westTurn - 1
    const before = makeCtx(state)
    advanceRace(before.ctx)
    expect(blocGeneration(state, 'west', category)).toBe(1)
    expect(before.emitted.some((e) => e.headline.includes('NAVAL'))).toBe(false)

    state.meta.turn = westTurn
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(blocGeneration(state, 'west', category)).toBe(2)
    expect(blocGeneration(state, 'east', category)).toBe(1)
    const headline = emitted.find((e) => e.severity === 'headline' && e.headline.includes('WEST') && e.headline.includes('NAVAL'))!
    expect(headline).toBeDefined()
    expect(headline.headline).not.toMatch(/GENERATION \d/) // hidden: no number
    expect(headline.actorIsPlayer).toBe(false)
  })

  it('sker en gång: ett andra anrop samma tur ändrar inget', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.meta.turn = westTurn
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    const rows = emitted.length
    advanceRace(ctx)
    expect(blocGeneration(state, 'west', category)).toBe(2)
    expect(emitted.length).toBe(rows)
  })

  it('köparnas techLevel följer (steget påslaget): varje faktion i blocket får +1 i kategorin med en rad kopplad till steget, de i det andra blocket inte', () => {
    withTechStep(1, () => {
      const state = createInitialState('indochina-slice', 'gen-seed')
      state.meta.turn = westTurn
      const westFactions = Object.values(state.factions).filter((f) => f.alignment > 0)
      const eastFactions = Object.values(state.factions).filter((f) => f.alignment < 0)
      const before = Object.fromEntries(Object.values(state.factions).map((f) => [f.id, f.techLevel[category]]))
      const { ctx, emitted } = makeCtx(state)
      advanceRace(ctx)
      for (const f of westFactions) expect(state.factions[f.id]!.techLevel[category], f.id).toBe(before[f.id]! + 1)
      for (const f of eastFactions) expect(state.factions[f.id]!.techLevel[category], f.id).toBe(before[f.id]!)
      const stepIndex = emitted.findIndex((e) => e.severity === 'headline' && e.headline.includes('NAVAL'))
      const rows = emitted.filter((e) => e.headline.includes('NAVAL TECH LEVEL RISES'))
      expect(rows).toHaveLength(westFactions.length)
      for (const r of rows) expect(r.causeId).toBe(`test-${stepIndex}`)
    })
  })

  it('med steget 0 rör ett generationsskifte inte köparnas techLevel — och emitterar inga techLevel-rader', () => {
    withTechStep(0, () => {
      const state = createInitialState('indochina-slice', 'gen-seed')
      state.meta.turn = westTurn
      const before = JSON.stringify(Object.values(state.factions).map((f) => f.techLevel))
      const { ctx, emitted } = makeCtx(state)
      advanceRace(ctx)
      expect(JSON.stringify(Object.values(state.factions).map((f) => f.techLevel))).toBe(before)
      expect(emitted.some((e) => e.headline.includes('TECH LEVEL RISES'))).toBe(false)
      expect(blocGeneration(state, 'west', category)).toBe(2) // generationen steg ändå
    })
  })

  it('med datans värde (P141 steg 2a: minst 1) höjer ett generationsskifte köparnas techLevel i blocket — med en rad per köpare', () => {
    expect(B.blocTechLevelStep).toBeGreaterThanOrEqual(1)
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.meta.turn = westTurn
    const before = Object.fromEntries(Object.values(state.factions).map((f) => [f.id, f.techLevel[category]]))
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    const rows = emitted.filter((e) => e.headline.includes('TECH LEVEL RISES'))
    expect(rows.length).toBeGreaterThan(0)
    for (const f of Object.values(state.factions)) {
      const rose = state.factions[f.id]!.techLevel[category] - before[f.id]!
      expect(rose === 0 || rose === B.blocTechLevelStep).toBe(true)
    }
  })

  it('går vidare till nästa steg i listan (tvåstegskategori) och stannar efter det sista', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    const [first, second] = SCHEDULE.naval.west
    expect(second).toBeDefined()
    state.meta.turn = first!
    advanceRace(makeCtx(state).ctx)
    expect(blocGeneration(state, 'west', 'naval')).toBe(2)
    state.meta.turn = second! - 1
    advanceRace(makeCtx(state).ctx)
    expect(blocGeneration(state, 'west', 'naval')).toBe(2)
    state.meta.turn = second!
    advanceRace(makeCtx(state).ctx)
    expect(blocGeneration(state, 'west', 'naval')).toBe(3)
    state.meta.turn = 99
    advanceRace(makeCtx(state).ctx)
    expect(blocGeneration(state, 'west', 'naval')).toBe(3)
  })

  it('frontierGeneration är det ledande blockets generation i kategorin', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.race.generation.east.artillery = 3
    state.race.generation.west.artillery = 2
    expect(frontierGeneration(state, 'artillery')).toBe(3)
  })
})

describe('nytt pipeline-steg `race`, direkt före orders (P118)', () => {
  it('ett steg som sker en tur gäller redan samma tur: köparen kan beställa den nya kategorin i samma resolve (steget påslaget)', () => {
    withTechStep(1, () => {
      const state = createInitialState('indochina-slice', 'gen-seed')
      state.meta.turn = SCHEDULE.naval.west[0]! // rvn (väst): naval 2 -> 3 = coastal_patrol_boat (techRequired 3)
      expect(state.factions['rvn']!.techLevel.naval).toBe(2)
      state.factions['rvn']!.materielNeed.naval = 50
      const result = resolveTurn(state, EMPTY)
      expect(result.state.factions['rvn']!.techLevel.naval).toBe(3)
      expect(result.wire.some((e) => e.headline.includes('WEST') && e.headline.includes('NAVAL'))).toBe(true)
      expect(result.state.market.openOrders.some((o) => o.buyerId === 'rvn' && o.productId === 'coastal_patrol_boat')).toBe(true)
      // Kontroll: turen före (inget steg ännu) kunde köparen inte beställa den.
      const early = createInitialState('indochina-slice', 'gen-seed')
      early.meta.turn = SCHEDULE.naval.west[0]! - 1
      early.factions['rvn']!.materielNeed.naval = 50
      expect(resolveTurn(early, EMPTY).state.market.openOrders.some((o) => o.productId === 'coastal_patrol_boat')).toBe(false)
    })
  })

  it('utfasningen gäller också samma tur: ett bud med en konstruktion vars generation steget just fasat ut avvisas i samma resolve', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    const secondStep = SCHEDULE.artillery.west[1]! // andra steget: väst går från generation 2 till 3 = keep + 1
    state.meta.turn = secondStep
    state.race.generation.west.artillery = 2
    state.house.designs = [design({ category: 'artillery', baseProductId: '105mm_field_gun', generation: 1 })]
    const order = { ...orderFor('rvn', '105mm_field_gun'), expiresTurn: secondStep }
    state.market.openOrders = [order]
    const result = resolveTurn(state, { ...EMPTY, bids: [{ orderId: order.id, price: 5_500_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }] })
    expect(result.rejected.map((r) => r.reason)).toContain('design phased out for this buyer')
    // Kontroll: utan det steget (turen före) godtas samma bud.
    const early = createInitialState('indochina-slice', 'gen-seed')
    early.meta.turn = secondStep - 1
    early.race.generation.west.artillery = 2
    early.house.designs = [design({ category: 'artillery', baseProductId: '105mm_field_gun', generation: 1 })]
    early.market.openOrders = [{ ...order, expiresTurn: secondStep - 1 }]
    const ok = resolveTurn(early, { ...EMPTY, bids: [{ orderId: order.id, price: 5_500_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }] })
    expect(ok.rejected.map((r) => r.reason)).not.toContain('design phased out for this buyer')
  })
})

describe('påskyndas av händelser (P118, §7.1)', () => {
  it('accelerateBlocStep flyttar blockets nästa steg raceAccelerationTurns tidigare, med tak raceAccelerationCap, och en rubrik', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    const { ctx, emitted } = makeCtx(state)
    const eastFirst = SCHEDULE.infantry.east[0]!
    expect(accelerateBlocStep(ctx, 'east', 'infantry', 'cause-1')).toBe(true)
    expect(state.race.pulled.east.infantry).toBe(B.raceAccelerationTurns)
    expect(emitted.some((e) => e.headline.includes('EAST') && e.headline.includes('INFANTRY') && e.causeId === 'cause-1')).toBe(true)
    for (let i = 0; i < 10; i++) accelerateBlocStep(ctx, 'east', 'infantry', 'cause-1')
    expect(state.race.pulled.east.infantry).toBe(B.raceAccelerationCap)
    state.meta.turn = eastFirst - B.raceAccelerationCap
    advanceRace(makeCtx(state).ctx)
    expect(blocGeneration(state, 'east', 'infantry')).toBe(2)
    expect(state.race.pulled.east.infantry ?? 0).toBe(0) // framflyttningen gäller bara det steget
  })

  it('är en no-op (falskt, ingen rubrik) när blocket inte har fler steg i kategorin', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.race.generation.west.infantry = 1 + SCHEDULE.infantry.west.length
    const { ctx, emitted } = makeCtx(state)
    expect(accelerateBlocStep(ctx, 'west', 'infantry', null)).toBe(false)
    expect(emitted).toEqual([])
  })

  it('en stridsbeprövad konstruktion påskyndar motsidans motmedelskategori (pansar → infanteri hos motsatta blocket)', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.house.designs = [design({ category: 'armour', baseProductId: 'm3_apc' })]
    const front = state.fronts['front-1']!
    const side = front.sideA === 'rvn' ? 'a' : 'b' // huset levererar till rvn (väst); motsidan nlf är öst
    front.designUnits = { a: {}, b: {} }
    front.designUnits[side]['design-1'] = 10
    const { ctx } = makeCtx(state)
    for (let i = 0; i < B.provenOccasions; i++) awardFieldOccasions(ctx, front, side, 'hold', 'c')
    expect(state.race.pulled.east.infantry).toBe(B.raceAccelerationTurns)
    expect(state.race.pulled.west.infantry ?? 0).toBe(0)
  })
})

describe('kravkort (P118, §7.1)', () => {
  const first = SCHEDULE.artillery.east[0]! // tur 4

  it('visar nästa kvartals krav per block och kategori — utan generationsnumret', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.meta.turn = first - B.requirementCardHorizon
    const cards = requirementCards(state)
    const card = cards.find((c) => c.bloc === 'east' && c.category === 'artillery')!
    expect(card).toEqual({ bloc: 'east', category: 'artillery', inTurns: B.requirementCardHorizon })
    // Inget annat steg ligger så nära (steg på tur 4: artillery öst och naval väst).
    expect(cards.map((c) => `${c.bloc}-${c.category}`).sort()).toEqual(['east-artillery', 'west-naval'])
    for (const c of cards) expect(Object.keys(c).sort()).toEqual(['bloc', 'category', 'inTurns'])
  })

  it('är tomt när inget steg är nära, och försvinner när steget skett', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.meta.turn = 0
    expect(requirementCards(state)).toEqual([])
    state.meta.turn = first
    expect(requirementCards(state).find((c) => c.category === 'artillery' && c.bloc === 'east')).toMatchObject({ inTurns: 0 })
    advanceRace(makeCtx(state).ctx)
    expect(requirementCards(state).find((c) => c.category === 'artillery' && c.bloc === 'east')).toBeUndefined()
  })

  it('visar ett påskyndat steg tidigare (kravkortet följer den verkliga tidtabellen)', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    state.race.pulled.east.artillery = B.raceAccelerationTurns
    state.meta.turn = first - B.raceAccelerationTurns - B.requirementCardHorizon
    expect(requirementCards(state).some((c) => c.bloc === 'east' && c.category === 'artillery')).toBe(true)
  })
})

describe('utfasning och riktmärke följer blockets generation (P118)', () => {
  it('keep = 2: vid generation 3 i blocket är generation 1 utfasad där men inte i det andra blocket', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    const d = design({ generation: 1 })
    state.race.generation.west.armour = 2
    expect(designPhasedOutForBloc(state, d, 'west')).toBe(false)
    state.race.generation.west.armour = 1 + B.designPhaseOutKeep
    expect(designPhasedOutForBloc(state, d, 'west')).toBe(true)
    expect(designPhasedOutForBloc(state, d, 'east')).toBe(false)
  })

  it('riktmärket stiger med KÖPARENS blocks generation: samma konstruktion får en lägre term hos ett block som kommit längre, och det andra blocket påverkas inte', () => {
    const state = createInitialState('indochina-slice', 'gen-seed')
    const d = design({ performance: 70, reliability: 70, trueQuality: 70 })
    const rvn = orderFor('rvn')
    const nlf = orderFor('nlf')
    const rvnBefore = designBidTerm(state, d, rvn)
    const nlfBefore = designBidTerm(state, d, nlf)
    state.race.generation.west.armour = 3
    expect(designBidTerm(state, d, rvn)).toBeLessThan(rvnBefore)
    expect(designBidTerm(state, d, nlf)).toBe(nlfBefore)
    expect(designBenchmark(3)).toBe(B.designBenchmarkBase + 2 * B.benchmarkPerGeneration)
  })
})
