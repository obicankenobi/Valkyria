// race.gap.test.ts — P119 (ETAPP9_FORSLAG.md §7.2, beslut 9H, princip 5, skyddsräcke 1, 3 och 5). Gap-chocker, först på plats och
// efterföljarrabatt.
//
// Gap-chock: när ett block tar ett steg som det andra inte matchar blir det en rubrik, och under några kvartal betalar köparna på
// den eftersläpande sidan överpris och högre förskott i kategorin. Först på plats: det första hus som levererar en konstruktion
// på blockets nya nivå får en varaktig bonus hos det blocket, och dess specifikationer blir måttstocken andra bedöms mot.
// Efterföljare betalar mindre: ett designprojekt mot en nivå som redan fältats är billigare.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designBenchmark, designBidTerm } from '../src/design.js'
import {
  advanceRace,
  claimFirstInPlace,
  effectiveRivalReputation,
  firstInPlaceBidTerm,
  fieldedGeneration,
  gapPremium,
  gapShock,
  isFollowerTarget,
  processRivalDesigns,
  rivalDesignSpec,
} from '../src/race.js'
import { resolveTurn } from '../src/resolve/index.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { createRng } from '../src/rng.js'
import { applyStandingOrders } from '../src/standingOrders.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Design, GameState, Order, Shipment, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as {
  blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>
  gapShockTurns: number
  gapOverpricePct: number
  gapAdvanceBonusPts: number
  firstInPlaceBidBonus: number
  firstInPlaceLifeTurns: number
  rivalFirstInPlaceQualityBonus: number
  rivalDesignSpecEdge: number
  rivalDesignQualityBonus: number
  yardstickScale: number
  followerCostFactor: number
  followerTurnsSaved: number
  designBenchmarkBase: number
  benchmarkPerGeneration: number
}
const SCHEDULE = B.blocGenerationSchedule
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const EAST_ART = SCHEDULE.artillery.east[0]! // tur 4: öst går före i artilleri/luftvärn

function makeCtx(state: GameState, seed = 'race-gap'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
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
    generation: 2,
    focus: 'balanced',
    ambition: 'timely',
    performance: 70,
    reliability: 60,
    unitCostFactor: 1,
    trueQuality: 65,
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

describe('gap-chocken (P119, §7.2)', () => {
  it('uppstår när ett block tar ett steg det andra inte matchar: lagring, rubrik med orsak, en gång', () => {
    const state = createInitialState('indochina-slice', 'gap-seed')
    state.meta.turn = EAST_ART
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.race.gap?.artillery).toEqual({ leader: 'east', sinceTurn: EAST_ART })
    const step = emitted.findIndex((e) => e.severity === 'headline' && e.headline.includes('EAST') && e.headline.includes('ARTILLERY') && e.headline.includes('REQUIREMENTS'))
    const shock = emitted.find((e) => e.headline.includes('GAP SHOCK') && e.headline.includes('ARTILLERY'))!
    expect(shock.severity).toBe('headline')
    expect(shock.headline).toContain('EAST')
    expect(shock.causeId).toBe(`test-${step}`)
    advanceRace(ctx)
    expect(emitted.filter((e) => e.headline.includes('GAP SHOCK') && e.headline.includes('ARTILLERY'))).toHaveLength(1)
  })

  it('uppstår inte när det andra blocket redan är på samma nivå', () => {
    const state = createInitialState('indochina-slice', 'gap-seed')
    state.race.generation.west.artillery = 2
    state.meta.turn = EAST_ART
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.race.generation.east.artillery).toBe(2)
    expect(state.race.gap?.artillery).toBeUndefined()
    expect(emitted.some((e) => e.headline.includes('GAP SHOCK') && e.headline.includes('ARTILLERY'))).toBe(false)
  })

  it('stängs när det andra blocket matchar, med en rad', () => {
    const state = createInitialState('indochina-slice', 'gap-seed')
    state.meta.turn = EAST_ART
    advanceRace(makeCtx(state).ctx)
    state.meta.turn = SCHEDULE.artillery.west[0]!
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.race.generation.west.artillery).toBe(2)
    expect(state.race.gap?.artillery).toBeUndefined()
    expect(emitted.some((e) => e.headline.includes('GAP CLOSES') && e.headline.includes('ARTILLERY'))).toBe(true)
  })

  it('gapShock är aktiv i gapShockTurns turer, sedan inte', () => {
    const state = createInitialState('indochina-slice', 'gap-seed')
    state.meta.turn = EAST_ART
    advanceRace(makeCtx(state).ctx)
    expect(gapShock(state, 'artillery')).toEqual({ leader: 'east', sinceTurn: EAST_ART })
    state.meta.turn = EAST_ART + B.gapShockTurns - 1
    expect(gapShock(state, 'artillery')).not.toBeNull()
    state.meta.turn = EAST_ART + B.gapShockTurns
    expect(gapShock(state, 'artillery')).toBeNull()
  })

  it('premien gäller bara köpare på den eftersläpande sidan, i just den kategorin', () => {
    const state = createInitialState('indochina-slice', 'gap-seed')
    state.meta.turn = EAST_ART
    advanceRace(makeCtx(state).ctx)
    expect(gapPremium(state, 'rvn', 'artillery')).toEqual({ pricePct: B.gapOverpricePct, advancePts: B.gapAdvanceBonusPts }) // väst släpar
    expect(gapPremium(state, 'nlf', 'artillery')).toEqual({ pricePct: 0, advancePts: 0 }) // öst leder
    expect(gapPremium(state, 'rvn', 'infantry')).toEqual({ pricePct: 0, advancePts: 0 })
    state.meta.turn = EAST_ART + B.gapShockTurns
    expect(gapPremium(state, 'rvn', 'artillery')).toEqual({ pricePct: 0, advancePts: 0 })
  })

  it('en order i den eftersläpande sidans kategori under gapet får överpris och högre förskott (samma seed, utan gap som kontroll)', () => {
    const run = (preMatched: boolean): Order => {
      const state = createInitialState('indochina-slice', 'gap-orders')
      state.meta.turn = EAST_ART
      if (preMatched) state.race.generation.west.artillery = 2 // inget gap: väst är redan på samma nivå
      state.factions['rvn']!.materielNeed.artillery = 80
      const order = resolveTurn(state, EMPTY).state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')
      expect(order).toBeDefined()
      return order!
    }
    const gap = run(false)
    const control = run(true)
    expect(gap.referencePrice).toBe(Math.round(control.referencePrice * (1 + B.gapOverpricePct / 100)))
    expect(gap.advancePct).toBe(control.advancePct + B.gapAdvanceBonusPts)
    expect(gap.trueBudget).toBeGreaterThan(control.trueBudget)
  })
})

describe('först på plats (P119, §7.2)', () => {
  const claim = (state: GameState, over: { holder?: string; buyer?: string; category?: TechCategory; generation?: number; spec?: number } = {}) => {
    const { ctx, emitted } = makeCtx(state)
    const ok = claimFirstInPlace(ctx, over.holder ?? 'player', over.buyer ?? 'rvn', over.category ?? 'armour', over.generation ?? 2, over.spec ?? 65, 'cause-1')
    return { ok, emitted }
  }

  it('kräver att blocket har stigit (generation 2+) och att konstruktionen når blockets nivå', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    expect(claim(state).ok).toBe(false) // ingen ny nivå ännu
    state.race.generation.west.armour = 2
    expect(claim(state, { generation: 1 }).ok).toBe(false) // under nivån
    expect(claim(state, { buyer: 'laos', generation: 2 }).ok).toBe(true) // laos är väst
    expect(claim(state, { buyer: 'nlf', generation: 5 }).ok).toBe(false) // öst är på generation 1
  })

  it('går till det första huset och ingen annan på samma nivå; rubrik med orsak', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    state.race.generation.west.armour = 2
    state.meta.turn = 9
    const first = claim(state)
    expect(first.ok).toBe(true)
    expect(state.race.firstInPlace?.west.armour).toEqual({ generation: 2, holder: 'player', turn: 9, spec: 65 })
    const headline = first.emitted.find((e) => e.headline.includes('FIRST IN PLACE'))!
    expect(headline.severity).toBe('headline')
    expect(headline.headline).toContain('WEST')
    expect(headline.headline).toContain('ARMOUR')
    expect(headline.causeId).toBe('cause-1')
    expect(headline.actorIsPlayer).toBe(true)
    const second = claim(state, { holder: 'brandt' })
    expect(second.ok).toBe(false)
    expect(second.emitted).toEqual([])
    expect(state.race.firstInPlace?.west.armour!.holder).toBe('player')
  })

  it('en ny nivå (nästa steg) öppnar för en ny claim', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    state.race.generation.west.armour = 2
    claim(state)
    state.race.generation.west.armour = 3
    const next = claim(state, { holder: 'brandt', generation: 3, spec: 70 })
    expect(next.ok).toBe(true)
    expect(state.race.firstInPlace?.west.armour).toMatchObject({ generation: 3, holder: 'brandt' })
  })

  it('husets bonus: firstInPlaceBidTerm ger bonusen hos det blocket i kategorin, avtar över firstInPlaceLifeTurns och är borta när blocket kliver igen', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    state.race.generation.west.armour = 2
    state.meta.turn = 9
    claim(state)
    const rvn = orderFor('rvn', 'm3_apc')
    expect(firstInPlaceBidTerm(state, rvn)).toBeCloseTo(B.firstInPlaceBidBonus, 9)
    expect(firstInPlaceBidTerm(state, orderFor('nlf', 'm3_apc'))).toBe(0) // annat block
    expect(firstInPlaceBidTerm(state, orderFor('rvn', '105mm_field_gun'))).toBe(0) // annan kategori
    state.meta.turn = 9 + B.firstInPlaceLifeTurns / 2
    expect(firstInPlaceBidTerm(state, rvn)).toBeCloseTo(B.firstInPlaceBidBonus / 2, 9)
    state.meta.turn = 9 + B.firstInPlaceLifeTurns
    expect(firstInPlaceBidTerm(state, rvn)).toBe(0)
    state.meta.turn = 10
    state.race.generation.west.armour = 3 // blocket kliver igen: nivån är en annan
    expect(firstInPlaceBidTerm(state, rvn)).toBe(0)
  })

  it('en rival som är först på plats får rykte (kvalitet) hos det blocket i kategorin, och bara då', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    state.race.generation.west.artillery = 2
    state.meta.turn = 9
    claim(state, { holder: 'brandt', category: 'artillery', spec: 60 })
    const brandt = state.rivals['brandt']!
    const west = effectiveRivalReputation(brandt, 'artillery', 9, { state, buyerId: 'rvn' })
    expect(west.quality).toBeCloseTo(brandt.reputation.quality + B.rivalFirstInPlaceQualityBonus, 9)
    expect(effectiveRivalReputation(brandt, 'artillery', 9, { state, buyerId: 'nlf' }).quality).toBe(brandt.reputation.quality)
    expect(effectiveRivalReputation(state.rivals['meridian']!, 'artillery', 9, { state, buyerId: 'rvn' }).quality).toBe(state.rivals['meridian']!.reputation.quality)
  })

  it('husets första leverans av en konstruktion på blockets nya nivå (deliveries) gör huset först på plats, med deliveryns rubrik som orsak', () => {
    const state = createInitialState('indochina-slice', 'fip-seed')
    state.race.generation.west.armour = 2
    state.house.designs = [design({ category: 'armour', baseProductId: 'm3_apc', generation: 2 })]
    state.meta.turn = 3
    const contract: Contract = {
      id: 'contract-test-0',
      buyerId: 'rvn',
      productId: 'm3_apc',
      quantity: 100,
      unitsDelivered: 0,
      price: 2_000_000,
      unitCostAtSigning: 11_500,
      grade: 'A',
      dueTurn: 10,
      status: 'active',
      lateEventId: null,
      frontId: 'front-1',
      advancePct: 0,
      advancePaid: 0,
      designId: 'design-1',
    }
    state.market.contracts = [contract]
    const shipment: Shipment = { id: 'shipment-0', contractId: 'contract-test-0', units: 10, arrivalTurn: 3 }
    state.market.shipments = [shipment]
    const { ctx, emitted } = makeCtx(state, 'deliver')
    deliveries(ctx)
    expect(state.race.firstInPlace?.west.armour).toMatchObject({ holder: 'player', generation: 2, spec: 65 })
    expect(emitted.some((e) => e.headline.includes('FIRST IN PLACE'))).toBe(true)

    // Utan konstruktion (eller med en för gammal) blir det ingen claim.
    const plain = createInitialState('indochina-slice', 'fip-seed')
    plain.race.generation.west.armour = 2
    plain.meta.turn = 3
    plain.market.contracts = [{ ...contract, designId: undefined }]
    plain.market.shipments = [shipment]
    deliveries(makeCtx(plain, 'deliver').ctx)
    expect(plain.race.firstInPlace?.west.armour).toBeUndefined()
  })
})

describe('måttstocken (P119, §7.2)', () => {
  it('en rivals specifikationer höjer riktmärket för husets konstruktioner hos det blocket; husets egen måttstock gör det inte', () => {
    const state = createInitialState('indochina-slice', 'yard-seed')
    state.race.generation.west.armour = 2
    const d = design({ performance: 70, reliability: 70, trueQuality: 70, generation: 2 })
    const order = orderFor('rvn', 'm3_apc')
    const base = designBidTerm(state, d, order)
    // En rival är först på plats med specifikationer över generationens riktmärke.
    const { ctx } = makeCtx(state)
    claimFirstInPlace(ctx, 'meridian', 'rvn', 'armour', 2, designBenchmark(2) + 20, null)
    const against = designBidTerm(state, d, order)
    expect(against).toBeLessThan(base)
    // Samma sak men husets egen claim: husets konstruktioner bedöms inte mot husets egen måttstock.
    const own = createInitialState('indochina-slice', 'yard-seed')
    own.race.generation.west.armour = 2
    claimFirstInPlace(makeCtx(own).ctx, 'player', 'rvn', 'armour', 2, designBenchmark(2) + 20, null)
    expect(designBidTerm(own, d, order)).toBeCloseTo(base, 9) // husets bonus ligger i firstInPlaceBidTerm, inte i designBidTerm
    // Det andra blocket påverkas inte av claimen.
    expect(designBidTerm(state, d, orderFor('nlf', 'm3_apc'))).toBeCloseTo(designBidTerm(createInitialState('indochina-slice', 'yard-seed'), d, orderFor('nlf', 'm3_apc')), 9)
  })

  it('husets måttstock skalar ned en rivalkonstruktions bonus: en svagare rival bedöms mot den (golvat 0, högst 1)', () => {
    const make = (houseSpec: number | null): GameState => {
      const state = createInitialState('indochina-slice', 'yard-seed')
      state.meta.turn = 4 // meridians första schemalagda konstruktion (rivalDesignSchedule)
      processRivalDesigns(makeCtx(state).ctx)
      if (houseSpec !== null) {
        state.race.generation.east.aviation = 2
        claimFirstInPlace(makeCtx(state).ctx, 'player', 'nlf', 'aviation', 2, houseSpec, null)
      }
      return state
    }
    const noClaim = make(null)
    const rival = noClaim.rivals['meridian']!
    expect(rival.designs).toHaveLength(1)
    const rivalSpec = rivalDesignSpec(rival.designs![0]!)
    expect(rivalSpec).toBe(designBenchmark(rival.designs![0]!.generation) + B.rivalDesignSpecEdge)
    const plain = effectiveRivalReputation(rival, 'aviation', 4, { state: noClaim, buyerId: 'nlf' }).quality
    expect(plain).toBeCloseTo(rival.reputation.quality + B.rivalDesignQualityBonus, 9)
    // Husets måttstock långt över rivalens spec: bonusen golvas mot 0.
    const strong = make(rivalSpec + 2 * B.yardstickScale)
    expect(effectiveRivalReputation(strong.rivals['meridian']!, 'aviation', 4, { state: strong, buyerId: 'nlf' }).quality).toBeCloseTo(rival.reputation.quality, 9)
    // Måttstock halvvägs (skillnad = −yardstickScale/2): hälften.
    const mid = make(rivalSpec + B.yardstickScale / 2)
    expect(effectiveRivalReputation(mid.rivals['meridian']!, 'aviation', 4, { state: mid, buyerId: 'nlf' }).quality).toBeCloseTo(
      rival.reputation.quality + B.rivalDesignQualityBonus * 0.5,
      9,
    )
    // Måttstock under rivalens spec: bonusen är oförändrad (aldrig över 1×).
    const weak = make(rivalSpec - 30)
    expect(effectiveRivalReputation(weak.rivals['meridian']!, 'aviation', 4, { state: weak, buyerId: 'nlf' }).quality).toBeCloseTo(plain, 9)
  })
})

describe('efterföljare betalar mindre (P119, §7.2, princip 5)', () => {
  const startProject = (state: GameState, category: TechCategory = 'artillery'): { costFactor: number; turnsTotal: number; targetGeneration: number } => {
    const { ctx } = makeCtx(state)
    ctx.submission = { ...EMPTY, standingOrders: [{ kind: 'DESIGN', op: 'START', category, focus: 'balanced', ambition: 'timely' }] }
    applyStandingOrders(ctx)
    const project = state.house.rnd.find((p) => p.design && p.category === category)!
    return { costFactor: project.costFactor!, turnsTotal: project.turnsTotal, targetGeneration: project.design!.targetGeneration }
  }

  it('fieldedGeneration är den högsta nivå något block fått fältad (0 utan claim) och isFollowerTarget är sann för mål på eller under den', () => {
    const state = createInitialState('indochina-slice', 'follow-seed')
    expect(fieldedGeneration(state, 'artillery')).toBe(0)
    expect(isFollowerTarget(state, 'artillery', 2)).toBe(false)
    state.race.generation.east.artillery = 2
    claimFirstInPlace(makeCtx(state).ctx, 'meridian', 'nlf', 'artillery', 2, 60, null)
    expect(fieldedGeneration(state, 'artillery')).toBe(2)
    expect(isFollowerTarget(state, 'artillery', 2)).toBe(true)
    expect(isFollowerTarget(state, 'artillery', 3)).toBe(false)
    expect(isFollowerTarget(state, 'infantry', 2)).toBe(false)
  })

  it('ett designprojekt mot en redan fältad nivå kostar followerCostFactor × per tur och är followerTurnsSaved kortare; ett mot en ofältad nivå är oförändrat', () => {
    const leader = createInitialState('indochina-slice', 'follow-seed')
    leader.race.generation.east.artillery = 2
    leader.race.generation.west.artillery = 1
    const base = startProject(leader) // frontier = 2 (öst), ingen claim än → ledarprojekt
    expect(base.targetGeneration).toBe(2)

    const follower = createInitialState('indochina-slice', 'follow-seed')
    follower.race.generation.east.artillery = 2
    claimFirstInPlace(makeCtx(follower).ctx, 'meridian', 'nlf', 'artillery', 2, 60, null)
    const cheap = startProject(follower)
    expect(cheap.targetGeneration).toBe(2)
    expect(cheap.costFactor).toBeCloseTo(base.costFactor * B.followerCostFactor, 9)
    expect(cheap.turnsTotal).toBe(Math.max(1, base.turnsTotal - B.followerTurnsSaved))
  })
})
