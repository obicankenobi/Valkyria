// design.field.test.ts — P114 (ETAPP9_FORSLAG.md §6.1–6.2, beslut 9E, skyddsräcke 1, 3 och 5).
//
// Kvalitet i striden: materiel från en konstruktion får en multiplikator på högst ±25 % (9E) — antalet räknas
// fortfarande, men tio bra kanoner väger mer än tio dåliga. Fältrykte: förband med husets materiel som vinner ett
// genombrott eller håller under press ger konstruktionen ett fälttillfälle; efter tillräckligt många blir den
// stridsbeprövad (rubrik, budbonus hos alla köpare). Familjerykte sänker tröskeln, flaggskeppet ger en liten
// ryktesbonus i alla kategorier, och en olycksfågel vid ett nederlag ger omvänd rubrik (köparen skyller på huset).
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { categoryReputation } from '../src/bidTerms.js'
import { designBidTerm } from '../src/design.js'
import {
  awardFieldOccasions,
  classifyFrontOutcome,
  designFieldFactor,
  flagshipDesign,
  provenThreshold,
  recordFrontDelivery,
  sideQuality,
} from '../src/fieldQuality.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { fronts } from '../src/resolve/steps/fronts.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Design, Front, GameState, Shipment, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  fieldQualityRange: number
  flawBattlePenaltyPerSeverity: number
  provenOccasions: number
  provenMinOccasions: number
  provenFamilyStep: number
  provenBidBonus: number
  flagshipQualityBonus: number
  frontHoldFraction: number
  frontBreakthroughThreshold: number
  blameRelationPenalty: number
  blameProvenLoss: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
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
  const state = createInitialState('indochina-slice', 'field-seed')
  state.house.designs = [d]
  return state
}

function makeCtx(state: GameState, seed = 'field'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
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

function contractFor(designId: string | undefined, over: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: 'front-1',
    advancePct: 0,
    advancePaid: 0,
    ...(designId ? { designId } : {}),
    ...over,
  }
}

function deliver(state: GameState, designId: string | undefined, units = 10): void {
  state.meta.turn = 3
  state.market.contracts = [contractFor(designId)]
  const shipment: Shipment = { id: 'shipment-0', contractId: 'contract-test-0', units, arrivalTurn: 3 }
  state.market.shipments = [shipment]
  deliveries(makeCtx(state, 'deliver').ctx)
}


// Jämnar ut en front: lika artilleri, styrka och beredskap per sida, ingen terräng- eller försörjningsfördel.
function levelFront(front: Front): void {
  front.status = 'war'
  front.terrainBonus = 0
  front.supplyStress = { a: 0, b: 0 }
  for (const side of ['a', 'b'] as const) {
    const formations = front.formations.filter((f) => f.side === side)
    for (const f of formations) {
      for (const c of Object.keys(f.equipment) as (keyof typeof f.equipment)[]) f.equipment[c] = 0
      f.equipment.artillery = 100 / formations.length
      f.strength = 1000 / formations.length
      f.strengthAtFull = f.strength
      f.readiness = 100
      f.status = 'active'
    }
    front.equipment[side].artillery = 100
    front.strength[side] = 1000
  }
}

function scaleArtillery(front: Front, side: 'a' | 'b', factor: number): void {
  for (const f of front.formations.filter((x) => x.side === side)) f.equipment.artillery *= factor
  front.equipment[side].artillery *= factor
}

describe('kvalitet i striden (P114, §6.1, beslut 9E)', () => {
  it('fältfaktorn är 1 ± fieldQualityRange efter konstruktionens sanna värden, och aldrig utanför', () => {
    const top = design({ performance: 100, reliability: 100, trueQuality: 100 })
    const bottom = design({ performance: 0, reliability: 0, trueQuality: 0 })
    expect(designFieldFactor(top, 'front-1')).toBeCloseTo(1 + B.fieldQualityRange, 9)
    expect(designFieldFactor(bottom, 'front-1')).toBeCloseTo(1 - B.fieldQualityRange, 9)
    expect(designFieldFactor(design(), 'front-1')).toBeCloseTo(1, 9)
    const over = design({ performance: 100, reliability: 100, trueQuality: 100, unitCostFactor: 1 })
    expect(designFieldFactor(over, 'front-1')).toBeLessThanOrEqual(1 + B.fieldQualityRange + 1e-9)
  })

  it('en brist i frontens miljö drar ned faktorn med flawBattlePenaltyPerSeverity × allvar; en brist i en annan miljö gör inte det', () => {
    const base = designFieldFactor(design(), 'front-1')
    const flawed = designFieldFactor(design({ latentFlaw: { environment: 'jungle', severity: 2 } }), 'front-1')
    expect(base - flawed).toBeCloseTo(B.flawBattlePenaltyPerSeverity * 2, 9)
    expect(designFieldFactor(design({ latentFlaw: { environment: 'mine', severity: 3 } }), 'front-1')).toBeCloseTo(base, 9)
    const floor = designFieldFactor(design({ trueQuality: 0, performance: 0, reliability: 0, latentFlaw: { environment: 'jungle', severity: 3 } }), 'front-1')
    expect(floor).toBeGreaterThanOrEqual(1 - B.fieldQualityRange - 1e-9)
  })

  it('en leverans med konstruktion sätter sidans kvalitet; mer materiel av annat slag späder ut den viktat efter enheter', () => {
    const state = fresh(design({ performance: 100, reliability: 100, trueQuality: 100 }))
    deliver(state, 'design-1', 10)
    const front = state.fronts['front-1']!
    const side = front.sideA === 'rvn' ? 'a' : 'b'
    expect(sideQuality(front, side, 'artillery')).toBeCloseTo(1 + B.fieldQualityRange, 9)
    expect(front.designUnits?.[side]?.['design-1']).toBe(10)
    // tio vanliga enheter: medelvärdet av 1,25 (10 enheter) och 1,0 (10 enheter)
    recordFrontDelivery(front, side, 'artillery', 10, 1, undefined)
    front.equipment[side].artillery += 10
    expect(sideQuality(front, side, 'artillery')).toBeCloseTo((1 + B.fieldQualityRange + 1) / 2, 9)
    expect(sideQuality(front, side, 'naval')).toBe(1)
  })

  it('utan konstruktion skrivs inget kvalitetsfält alls (ett vanligt parti är bitvis oförändrat)', () => {
    const state = fresh()
    deliver(state, undefined, 10)
    const front = state.fronts['front-1']!
    expect(front.equipmentQuality).toBeUndefined()
    expect(front.designUnits).toBeUndefined()
  })

  it('bra materiel väger mer i striden: samma antal, högre kvalitet → större fördel för sidan (fronts-steget)', () => {
    const advantage = (quality: number): number => {
      const state = fresh()
      const front = state.fronts['front-1']!
      levelFront(front)
      front.equipmentQuality = { a: {}, b: {} }
      front.equipmentQuality[front.attacker].artillery = quality
      fronts(makeCtx(state, 'fight').ctx)
      return front.lastClampedAdvantage
    }
    expect(advantage(1.25)).toBeGreaterThan(advantage(1))
    expect(advantage(1)).toBeGreaterThan(advantage(0.75))
  })
})

describe('fältrykte och stridsbeprövad (P114, §6.2)', () => {
  function withDesignOnFront(d: Design = design()): { state: GameState; front: Front; side: 'a' | 'b' } {
    const state = fresh(d)
    const front = state.fronts['front-1']!
    const side = front.sideA === 'rvn' ? 'a' : 'b'
    front.designUnits = { a: {}, b: {} }
    front.designUnits[side]['design-1'] = 10
    return { state, front, side }
  }

  it('ett fälttillfälle ökar occasions med ett och emitterar en rad; tröskeln gör konstruktionen stridsbeprövad med en rubrik', () => {
    const { state, front, side } = withDesignOnFront()
    const { ctx, emitted } = makeCtx(state)
    for (let i = 0; i < B.provenOccasions - 1; i++) awardFieldOccasions(ctx, front, side, 'hold', 'cause-1')
    expect(state.house.designs[0]!.fieldRecord).toEqual({ occasions: B.provenOccasions - 1, proven: false })
    expect(emitted.filter((e) => e.headline.includes('BATTLE-PROVEN'))).toEqual([])
    awardFieldOccasions(ctx, front, side, 'hold', 'cause-1')
    expect(state.house.designs[0]!.fieldRecord.proven).toBe(true)
    const headline = emitted.find((e) => e.headline.includes('BATTLE-PROVEN'))!
    expect(headline.headline).toContain('THE H&V M64 FIELD GUN HELD')
    expect(headline.severity).toBe('headline')
    expect(headline.causeId).toBe('cause-1')
  })

  it('ett genombrott ger "WON"-rubriken; en design som inte finns på sidan får inget tillfälle', () => {
    const { state, front, side } = withDesignOnFront(design({ fieldRecord: { occasions: B.provenOccasions - 1, proven: false } }))
    const other = side === 'a' ? 'b' : 'a'
    const { ctx, emitted } = makeCtx(state)
    awardFieldOccasions(ctx, front, other, 'breakthrough', 'c')
    expect(state.house.designs[0]!.fieldRecord.occasions).toBe(B.provenOccasions - 1)
    awardFieldOccasions(ctx, front, side, 'breakthrough', 'c')
    expect(emitted.some((e) => e.headline.includes('BATTLE-PROVEN') && e.headline.includes('BROKE'))).toBe(true)
  })

  it('classifyFrontOutcome: genombrott över tröskeln (vinnaren), att hålla under press mellan frontHoldFraction × tröskeln och tröskeln (den pressade sidan), annars inget', () => {
    const t = B.frontBreakthroughThreshold
    expect(classifyFrontOutcome(t + 0.01, 'a', 'b')).toEqual({ kind: 'breakthrough', side: 'a' })
    expect(classifyFrontOutcome(-(t + 0.01), 'a', 'b')).toEqual({ kind: 'breakthrough', side: 'b' })
    expect(classifyFrontOutcome(t * B.frontHoldFraction + 0.01, 'a', 'b')).toEqual({ kind: 'hold', side: 'b' }) // anfallaren pressar, försvararen håller
    expect(classifyFrontOutcome(-(t * B.frontHoldFraction + 0.01), 'a', 'b')).toEqual({ kind: 'hold', side: 'a' })
    expect(classifyFrontOutcome(t * B.frontHoldFraction - 0.01, 'a', 'b')).toBeNull()
    expect(classifyFrontOutcome(0, 'a', 'b')).toBeNull()
  })

  it('fronts-steget: ett förkrossande övertag för spelarens sida ger ett fälttillfälle (genombrott); en jämn front ger inget', () => {
    const run = (factor: number): Design['fieldRecord'] => {
      const { state, front, side } = withDesignOnFront()
      levelFront(front)
      front.attacker = side
      scaleArtillery(front, side, factor)
      fronts(makeCtx(state, 'occasion').ctx)
      return state.house.designs[0]!.fieldRecord
    }
    expect(run(1000).occasions).toBe(1)
    expect(run(1).occasions).toBe(0)
  })

  it('familjerykte: tröskeln sänks med varje ytterligare köpare av konstruktionsfamiljen, men aldrig under provenMinOccasions', () => {
    const state = fresh(design())
    expect(provenThreshold(state, state.house.designs[0]!)).toBe(B.provenOccasions)
    state.house.designs.push(design({ id: 'design-2', lineage: 'design-1' }))
    const buyer = (id: string, designId: string): Contract => contractFor(designId, { id: `c-${id}`, buyerId: id })
    state.market.contracts = [buyer('rvn', 'design-1')]
    expect(provenThreshold(state, state.house.designs[0]!)).toBe(B.provenOccasions)
    state.market.contracts = [buyer('rvn', 'design-1'), buyer('laos', 'design-2')]
    expect(provenThreshold(state, state.house.designs[0]!)).toBe(Math.max(B.provenMinOccasions, B.provenOccasions - B.provenFamilyStep))
    state.market.contracts = [buyer('rvn', 'design-1'), buyer('laos', 'design-2'), buyer('nlf', 'design-2'), buyer('x', 'design-2'), buyer('y', 'design-2')]
    expect(provenThreshold(state, state.house.designs[1]!)).toBe(B.provenMinOccasions)
    // en annullerad affär räknas inte
    state.market.contracts = [buyer('rvn', 'design-1'), { ...buyer('laos', 'design-2'), status: 'voided' }]
    expect(provenThreshold(state, state.house.designs[0]!)).toBe(B.provenOccasions)
  })

  it('stridsbeprövad ger en budbonus (provenBidBonus) i designBidTerm — synlig hos alla köpare', () => {
    const plain = fresh(design())
    const proven = fresh(design({ fieldRecord: { occasions: 3, proven: true } }))
    const order = { buyerId: 'rvn', officialId: 'official-rvn-procurement', frontId: 'front-1' }
    const a = designBidTerm(plain, plain.house.designs[0]!, order)
    const b = designBidTerm(proven, proven.house.designs[0]!, order)
    expect(b - a).toBeCloseTo(B.provenBidBonus, 9)
  })

  it('flaggskeppet: den bäst ansedda stridsbeprövade konstruktionen ger en ryktesbonus i ALLA kategorier', () => {
    const state = fresh(design())
    expect(flagshipDesign(state.house)).toBeNull()
    const none = categoryReputation(state.house, 'naval').quality
    state.house.designs = [
      design({ id: 'd1', fieldRecord: { occasions: 4, proven: true }, trueQuality: 40 }),
      design({ id: 'd2', fieldRecord: { occasions: 6, proven: true }, trueQuality: 60 }),
      design({ id: 'd3', fieldRecord: { occasions: 9, proven: false } }),
    ]
    expect(flagshipDesign(state.house)!.id).toBe('d2') // bara stridsbeprövade räknas, flest tillfällen vinner
    for (const category of ['naval', 'infantry', 'artillery'] as const) {
      expect(categoryReputation(state.house, category).quality).toBeCloseTo(Math.min(100, none + B.flagshipQualityBonus), 9)
    }
    const withdrawn = structuredClone(state.house)
    withdrawn.designs[1]!.status = 'withdrawn'
    expect(flagshipDesign(withdrawn)!.id).toBe('d1')
  })
})

describe('nederlag: köparen skyller på huset (P114, §6.2)', () => {
  it('en olycksfågel vid ett nederlag ger omvänd rubrik, sänkt relation och tappad stridsbeprövad-stämpel', () => {
    let found = false
    for (let i = 0; i < 400 && !found; i++) {
      const d = design({ latentFlaw: { environment: 'jungle', severity: 3 }, fieldRecord: { occasions: 5, proven: true } })
      const state = fresh(d)
      state.house.treasury = 50_000_000
      state.meta.seed = `blame-${i}`
      const front = state.fronts['front-1']!
      front.position = front.sideA === 'rvn' ? 80 : -80 // rvn förlorar
      const relationBefore = state.factions['rvn']!.relationToPlayer
      state.meta.turn = 3
      state.market.contracts = [contractFor('design-1')]
      state.market.shipments = [{ id: 'shipment-0', contractId: 'contract-test-0', units: 5, arrivalTurn: 3 }]
      const { ctx, emitted } = makeCtx(state, `blame-delivery-${i}`)
      deliveries(ctx)
      if (state.house.investigations.length === 0) continue
      found = true
      expect(emitted.some((e) => e.headline.includes('BLAMES'))).toBe(true)
      expect(state.factions['rvn']!.relationToPlayer).toBe(Math.max(0, relationBefore - B.blameRelationPenalty))
      expect(state.house.designs[0]!.fieldRecord).toEqual({ occasions: Math.max(0, 5 - B.blameProvenLoss), proven: false })
    }
    expect(found).toBe(true)
  })

  it('en olycksfågel vid en vinnande front ger ingen skuldbeläggning', () => {
    for (let i = 0; i < 400; i++) {
      const d = design({ latentFlaw: { environment: 'jungle', severity: 3 }, fieldRecord: { occasions: 5, proven: true } })
      const state = fresh(d)
      const front = state.fronts['front-1']!
      front.position = front.sideA === 'rvn' ? -80 : 80 // rvn vinner
      state.meta.turn = 3
      state.market.contracts = [contractFor('design-1')]
      state.market.shipments = [{ id: 'shipment-0', contractId: 'contract-test-0', units: 5, arrivalTurn: 3 }]
      const { ctx, emitted } = makeCtx(state, `noblame-${i}`)
      deliveries(ctx)
      if (state.house.investigations.length === 0) continue
      expect(emitted.some((e) => e.headline.includes('BLAMES'))).toBe(false)
      expect(state.house.designs[0]!.fieldRecord.proven).toBe(true)
      return
    }
    throw new Error('ingen olycksfågel på 400 försök')
  })
})
