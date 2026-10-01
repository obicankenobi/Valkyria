// race.lifecycle.test.ts — P117 (ETAPP9_FORSLAG.md §6.3 och §6.6, skyddsräcke 1, 3, 4 och 5). Motmedelskedjor, livscykel och
// automatisk utfasning.
//
// Motmedel: en stark (stridsbeprövad) konstruktion skapar efterfrågan på dess motmedel hos andra sidan — pansar → pansarvärn
// (infanteri), flyg → luftvärn (artilleri), luftvärn → störsändare (elektronik) — och ett forskningsprojekt kan riktas mot ett
// namngivet, studerat fiendesystem. Livscykel: en ny konstruktion har ett nyhetsvärde som avtar, rivalernas konstruktioner (9F)
// kommer enligt schema och syns bara med underrättelse, och när en generation fasas ut förlorar äldre konstruktioner
// behörighet automatiskt (spelaren pensionerar aldrig något för hand).
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { bidEstimate } from '../src/queries.js'
import { designBidTerm, bidDesignRejection } from '../src/design.js'
import { awardFieldOccasions } from '../src/fieldQuality.js'
import {
  advanceDesignLifecycle,
  counterBidTerm,
  designPhasedOutForBuyer,
  effectiveRivalReputation,
  noveltyFactor,
  processRivalDesigns,
  rivalDesignDisplay,
} from '../src/race.js'
import { advanceRndQueue } from '../src/resolve/upkeep.js'
import { startTrackedResearch } from '../src/research.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, Front, GameState, Order, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  counterCategory: Partial<Record<TechCategory, TechCategory>>
  counterDemandOrders: number
  orderTriggerThreshold: Record<TechCategory, number>
  counterResearchTurnsSaved: number
  counterBidBonus: number
  noveltyBidBonus: number
  noveltyLifeTurns: number
  rivalDesignSchedule: Record<string, number[]>
  rivalDesignQualityBonus: number
  rivalDesignLifeTurns: number
  designPhaseOutKeep: number
  needCeiling: number
  provenOccasions: number
}

// En orders värde i motmedelskategorin (counterDemandOrders × orderTriggerThreshold).
const demand = (category: TechCategory): number => B.orderTriggerThreshold[category] * B.counterDemandOrders

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 APC',
    category: 'armour',
    baseProductId: 'm3_apc',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 50,
    reliability: 50,
    unitCostFactor: 1,
    trueQuality: 50,
    uncertainty: 1,
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
  const state = createInitialState('indochina-slice', 'race-seed')
  state.house.designs = [d]
  return state
}

function makeCtx(state: GameState, seed = 'race'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
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

function onFront(state: GameState, designId = 'design-1'): { front: Front; side: 'a' | 'b'; opponent: string } {
  const front = state.fronts['front-1']!
  const side = front.sideA === 'rvn' ? 'a' : 'b'
  front.designUnits = { a: {}, b: {} }
  front.designUnits[side][designId] = 10
  return { front, side, opponent: side === 'a' ? front.sideB : front.sideA }
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
    competingRivals: ['brandt', 'costigan', 'meridian'],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: `official-${buyerId}-procurement`,
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: buyerId === 'rvn' ? 'front-1' : 'front-laos',
    advancePct: 0,
  }
}

describe('motmedel (P117, §6.6)', () => {
  it('kedjan är pansar → infanteri, flyg → artilleri, luftvärn → elektronik', () => {
    expect(B.counterCategory).toEqual({ armour: 'infantry', aviation: 'artillery', artillery: 'electronics' })
  })

  it('en konstruktion som blir stridsbeprövad skapar efterfrågan på motmedlet hos motsidan, med rubrik och orsak', () => {
    const state = fresh()
    const { front, side, opponent } = onFront(state)
    const { ctx, emitted } = makeCtx(state)
    const before = state.factions[opponent]!.materielNeed.infantry
    const ownSide = state.factions[side === 'a' ? front.sideA : front.sideB]!.materielNeed.infantry
    for (let i = 0; i < B.provenOccasions; i++) awardFieldOccasions(ctx, front, side, 'hold', 'cause-1')
    expect(state.house.designs[0]!.fieldRecord.proven).toBe(true)
    expect(state.factions[opponent]!.materielNeed.infantry).toBe(Math.min(B.needCeiling, before + demand('infantry')))
    expect(state.factions[side === 'a' ? front.sideA : front.sideB]!.materielNeed.infantry).toBe(ownSide)
    const headline = emitted.find((e) => e.headline.includes('COUNTER'))!
    expect(headline.headline).toContain('H&V M64 APC')
    const provenIndex = emitted.findIndex((e) => e.headline.includes('BATTLE-PROVEN'))
    expect(headline.causeId).toBe(`test-${provenIndex}`) // BATTLE-PROVEN-raden är orsaken
    expect(headline.subjectId).toBe(opponent)
  })

  it('efterfrågan skapas en gång per konstruktion (vid stämpeln), inte vid varje fälttillfälle', () => {
    const state = fresh()
    const { front, side, opponent } = onFront(state)
    const { ctx } = makeCtx(state)
    for (let i = 0; i < B.provenOccasions + 3; i++) awardFieldOccasions(ctx, front, side, 'hold', 'c')
    const once = Math.min(B.needCeiling, createInitialState('indochina-slice', 'race-seed').factions[opponent]!.materielNeed.infantry + demand('infantry'))
    expect(state.factions[opponent]!.materielNeed.infantry).toBe(once)
  })

  it('en kategori utan motmedel (marin) skapar ingen efterfrågan', () => {
    const state = fresh(design({ category: 'naval', baseProductId: 'coastal_patrol_boat' }))
    const { front, side } = onFront(state)
    const { ctx, emitted } = makeCtx(state)
    for (let i = 0; i < B.provenOccasions; i++) awardFieldOccasions(ctx, front, side, 'hold', 'c')
    expect(emitted.some((e) => e.headline.includes('COUNTER'))).toBe(false)
  })

  it('efterfrågan klampas vid needCeiling', () => {
    const state = fresh()
    const { front, side, opponent } = onFront(state)
    state.factions[opponent]!.materielNeed.infantry = B.needCeiling - 1
    const { ctx } = makeCtx(state)
    for (let i = 0; i < B.provenOccasions; i++) awardFieldOccasions(ctx, front, side, 'hold', 'c')
    expect(state.factions[opponent]!.materielNeed.infantry).toBe(B.needCeiling)
  })
})

describe('forskning mot ett namngivet fiendesystem (P117, §6.6)', () => {
  function withStudied(): GameState {
    const state = createInitialState('indochina-slice', 'counter-seed')
    state.house.studiedSystems = { 'nlf-artillery': 40 }
    return state
  }

  it('valideras: ett studerat system i samma kategori godtas, ett okänt eller en annan kategori avvisas', () => {
    const state = withStudied()
    const set = (over: object) => ({ kind: 'RESEARCH', op: 'SET', category: 'artillery', pace: 'normal', counterTo: 'nlf-artillery', ...over }) as never
    expect(validateStandingOrderChange(state, state, set({}))).toEqual({ ok: true })
    expect(validateStandingOrderChange(state, state, set({ counterTo: 'nlf-armour' }))).toEqual({ ok: false, reason: 'that enemy system has not been studied' })
    expect(validateStandingOrderChange(state, state, set({ category: 'armour' }))).toEqual({ ok: false, reason: 'that system is in another category' })
  })

  it('projektet blir kortare och bär målet; när det blir klart skrivs ett motmedel och en rubrik', () => {
    const state = withStudied()
    state.meta.turn = 3
    state.house.standingOrders!.research = { artillery: { pace: 'normal', sinceTurn: 0, counterTo: 'nlf-artillery' } }
    const { ctx } = makeCtx(state)
    const plain = createInitialState('indochina-slice', 'counter-seed')
    plain.meta.turn = 3
    plain.house.standingOrders!.research = { artillery: { pace: 'normal', sinceTurn: 0 } }
    startTrackedResearch(makeCtx(plain).ctx)
    startTrackedResearch(ctx)
    const targeted = state.house.rnd.find((p) => p.category === 'artillery')!
    const base = plain.house.rnd.find((p) => p.category === 'artillery')!
    expect(targeted.counterTo).toBe('nlf-artillery')
    expect(targeted.turnsTotal).toBe(Math.max(1, base.turnsTotal - B.counterResearchTurnsSaved))

    targeted.turnsRemaining = 1
    const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
    advanceRndQueue(state.house, (e) => (emitted.push(e), 'x'))
    expect(state.house.counters?.['nlf-artillery']).toMatchObject({ factionId: 'nlf', category: 'artillery' })
    expect(emitted.some((e) => e.headline.includes('COUNTER') && e.headline.includes('MODEL 54 FIELD GUN'))).toBe(true)
  })

  it('motmedlet ger budbonus mot just den faktions köpare (frontens motpart), i den kategorin, och bara då', () => {
    const state = fresh()
    state.house.counters = { 'nlf-armour': { factionId: 'nlf', category: 'armour', turn: 1 } }
    const rvn = orderFor('rvn', 'm3_apc') // rvn möter nlf på front-1
    expect(counterBidTerm(state, rvn)).toBe(B.counterBidBonus)
    expect(counterBidTerm(state, orderFor('rvn', '105mm_field_gun'))).toBe(0) // annan kategori
    expect(counterBidTerm(state, orderFor('laos', 'm3_apc'))).toBe(B.counterBidBonus) // front-laos: laos möter nlf
    const none = fresh()
    expect(counterBidTerm(none, rvn)).toBe(0)
  })
})

describe('nyhetsvärde (P117, §6.3)', () => {
  it('är 1 vid introduktionen, avtar linjärt och är 0 efter noveltyLifeTurns', () => {
    const d = design({ introducedTurn: 5 })
    expect(noveltyFactor(d, 5)).toBe(1)
    expect(noveltyFactor(d, 5 + B.noveltyLifeTurns / 2)).toBeCloseTo(0.5, 9)
    expect(noveltyFactor(d, 5 + B.noveltyLifeTurns)).toBe(0)
    expect(noveltyFactor(d, 5 + B.noveltyLifeTurns + 9)).toBe(0)
  })

  it('läggs in i designBidTerm (en formel, en källa): samma konstruktion, samma tur — den nya får exakt noveltyBidBonus mer', () => {
    const state = fresh(design({ introducedTurn: 0 }))
    const order = orderFor()
    state.meta.turn = 0
    const young = designBidTerm(state, state.house.designs[0]!, order)
    const old = designBidTerm(state, { ...state.house.designs[0]!, introducedTurn: -B.noveltyLifeTurns }, order)
    expect(young - old).toBeCloseTo(B.noveltyBidBonus, 9)
  })
})

describe('rivalernas konstruktioner (P117, 9F)', () => {
  it('kommer enligt schema per rival, i rivalens specialisering, med rubrik — och inte någon annan tur', () => {
    const state = createInitialState('indochina-slice', 'rival-seed')
    const turn = B.rivalDesignSchedule['meridian']![0]!
    state.meta.turn = turn - 1
    expect(processRivalDesigns(makeCtx(state).ctx)).toBeUndefined()
    expect(state.rivals['meridian']!.designs ?? []).toEqual([])
    state.meta.turn = turn
    const { ctx, emitted } = makeCtx(state)
    processRivalDesigns(ctx)
    const designs = state.rivals['meridian']!.designs!
    expect(designs).toHaveLength(1)
    expect(designs[0]).toMatchObject({ category: 'aviation', introducedTurn: turn })
    expect(emitted.some((e) => e.headline.includes('MERIDIAN') && e.headline.includes('AVIATION') && e.actorIsPlayer === false)).toBe(true)
    // Samma tur igen: ingen dubblett.
    processRivalDesigns(makeCtx(state).ctx)
    expect(state.rivals['meridian']!.designs).toHaveLength(1)
  })

  it('en rivals nya konstruktion skapar motmedelsefterfrågan hos motsatta blockets köpare (flyg → artilleri hos väst), inte hos dess eget', () => {
    const state = createInitialState('indochina-slice', 'rival-seed')
    state.meta.turn = B.rivalDesignSchedule['meridian']![0]!
    const west = state.factions['rvn']!.materielNeed.artillery
    const east = state.factions['nlf']!.materielNeed.artillery
    processRivalDesigns(makeCtx(state).ctx)
    expect(state.factions['rvn']!.materielNeed.artillery).toBe(Math.min(B.needCeiling, west + demand('artillery')))
    expect(state.factions['nlf']!.materielNeed.artillery).toBe(east)
  })

  it('den neutrala rivalen skapar ingen motmedelsefterfrågan', () => {
    const state = createInitialState('indochina-slice', 'rival-seed')
    state.meta.turn = B.rivalDesignSchedule['costigan']![0]!
    const before = JSON.stringify(Object.values(state.factions).map((f) => f.materielNeed))
    const { ctx, emitted } = makeCtx(state)
    processRivalDesigns(ctx)
    expect(state.rivals['costigan']!.designs).toHaveLength(1)
    expect(JSON.stringify(Object.values(state.factions).map((f) => f.materielNeed))).toBe(before)
    expect(emitted.some((e) => e.headline.includes('COUNTER'))).toBe(false)
  })

  it('ger rivalen en kvalitetsbonus i sin egen kategori som avtar med nyhetsvärdet — och i ingen annan', () => {
    const state = createInitialState('indochina-slice', 'rival-seed')
    const turn = B.rivalDesignSchedule['meridian']![0]!
    state.meta.turn = turn
    processRivalDesigns(makeCtx(state).ctx)
    const rival = state.rivals['meridian']!
    expect(effectiveRivalReputation(rival, 'aviation', turn).quality).toBeCloseTo(rival.reputation.quality + B.rivalDesignQualityBonus, 9)
    expect(effectiveRivalReputation(rival, 'aviation', turn + B.rivalDesignLifeTurns / 2).quality).toBeCloseTo(
      rival.reputation.quality + B.rivalDesignQualityBonus / 2,
      9,
    )
    expect(effectiveRivalReputation(rival, 'aviation', turn + B.rivalDesignLifeTurns).quality).toBe(rival.reputation.quality)
    expect(effectiveRivalReputation(rival, 'infantry', turn)).toEqual(rival.reputation)
    expect(effectiveRivalReputation(rival, 'aviation', turn).reliability).toBe(rival.reputation.reliability)
  })

  it('sänker spelarens vinstchans (bidEstimate läser samma rivalreputation som bidding.ts)', () => {
    const base = createInitialState('indochina-slice', 'rival-seed')
    const withDesign = createInitialState('indochina-slice', 'rival-seed')
    const turn = B.rivalDesignSchedule['brandt']![0]!
    base.meta.turn = withDesign.meta.turn = turn
    processRivalDesigns(makeCtx(withDesign).ctx)
    const order = orderFor('rvn', '105mm_field_gun')
    const a = bidEstimate(base, order, 'A').winBand.map((p) => p.confidence)
    const b = bidEstimate(withDesign, order, 'A').winBand.map((p) => p.confidence)
    expect(b.reduce((s, x) => s + x, 0)).toBeLessThan(a.reduce((s, x) => s + x, 0))
  })

  it('syns bara med underrättelse: utan station i rivalens block är namnet okänt, med en station syns det', () => {
    const state = createInitialState('indochina-slice', 'rival-seed')
    const turn = B.rivalDesignSchedule['meridian']![0]!
    state.meta.turn = turn
    processRivalDesigns(makeCtx(state).ctx)
    state.house.stations = []
    expect(rivalDesignDisplay(state, 'meridian')).toEqual({ known: false, category: 'aviation', introducedTurn: turn, novelty: 100, name: null })
    state.house.stations = [{ id: 'st-1', city: 'Hanoi', nation: 'nlf', depth: 2, exposure: 0, coverage: ['procurement'], status: 'active' }]
    expect(rivalDesignDisplay(state, 'meridian')).toMatchObject({ known: true, category: 'aviation' })
    expect(rivalDesignDisplay(state, 'meridian')!.name).toContain('Helicopter')
    // En station i väst ser inte östblockets rival.
    state.house.stations = [{ id: 'st-2', city: 'Saigon', nation: 'rvn', depth: 2, exposure: 0, coverage: ['procurement'], status: 'active' }]
    expect(rivalDesignDisplay(state, 'meridian')!.known).toBe(false)
    expect(rivalDesignDisplay(state, 'nobody')).toBeNull()
  })
})

describe('automatisk utfasning (P117, §6.3; källan är blockens generation sedan P118)', () => {
  // En konstruktion i generation g är utfasad för en köpare när blockets generation > g + (designPhaseOutKeep − 1).
  const phaseOut = (state: GameState, bloc: 'west' | 'east', generation: number): void => {
    state.race.generation[bloc].armour = generation + B.designPhaseOutKeep
  }

  it('en konstruktion är behörig tills generationen fasas ut, sedan inte — utan att spelaren gör något', () => {
    const state = fresh(design({ generation: 1 }))
    const d = state.house.designs[0]!
    state.race.generation.west.armour = B.designPhaseOutKeep // ännu kvar
    expect(designPhasedOutForBuyer(state, d, 'rvn')).toBe(false)
    expect(bidDesignRejection(state, { designId: 'design-1', price: 1 }, orderFor())).toBeNull()
    phaseOut(state, 'west', 1)
    expect(designPhasedOutForBuyer(state, d, 'rvn')).toBe(true)
    expect(bidDesignRejection(state, { designId: 'design-1', price: 1 }, orderFor())).toBe('design phased out for this buyer')
    // Det andra blocket (nlf, öst) har inte kommit längre: samma konstruktion är fortfarande behörig där.
    expect(designPhasedOutForBuyer(state, d, 'nlf')).toBe(false)
  })

  it('en konstruktion i en senare generation är kvar när den äldre redan fasats ut', () => {
    const state = fresh(design({ generation: 3 }))
    phaseOut(state, 'west', 1)
    expect(designPhasedOutForBuyer(state, state.house.designs[0]!, 'rvn')).toBe(false)
  })

  it('advanceDesignLifecycle märker utfasningen en gång per block, med en rubrik som namnger konstruktionen', () => {
    const state = fresh(design({ generation: 1 }))
    phaseOut(state, 'west', 1)
    const { ctx, emitted } = makeCtx(state)
    advanceDesignLifecycle(ctx)
    expect(state.house.designs[0]!.phasedOut).toEqual({ west: state.meta.turn })
    const rows = emitted.filter((e) => e.headline.includes('PHASED OUT'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.headline).toContain('H&V M64 APC')
    expect(rows[0]!.headline).toContain('WEST')
    advanceDesignLifecycle(ctx)
    expect(emitted.filter((e) => e.headline.includes('PHASED OUT'))).toHaveLength(1)
    // När också det andra blocket kommit längre märks det separat.
    phaseOut(state, 'east', 1)
    advanceDesignLifecycle(ctx)
    expect(emitted.filter((e) => e.headline.includes('PHASED OUT') && e.headline.includes('EAST'))).toHaveLength(1)
  })

  it('en konstruktion som ännu är behörig märks inte', () => {
    const state = fresh(design({ generation: 1 }))
    const { ctx, emitted } = makeCtx(state)
    advanceDesignLifecycle(ctx)
    expect(state.house.designs[0]!.phasedOut).toBeUndefined()
    expect(emitted).toEqual([])
  })
})
