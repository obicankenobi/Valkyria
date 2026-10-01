// design.mix.test.ts — P111 (ETAPP9_FORSLAG.md §5.4, delfråga 2, skyddsräcke 3 och 5).
//
// Varje köpare har en dold preferensmix (prestanda / tillförlitlighet / kostnad), härledd ur det som redan finns:
// tjänstemannens agenda (MODERNISE väger prestanda, AUSTERITY kostnad), en front som förlorar (prestanda väger högre)
// och förbandens doktrin (vilka kategorier som väger tyngst). Bedömningen är RELATIV: en konstruktion jämförs med ett
// riktmärke som stiger med generationen, inte mot en fast skala — när rivalerna hinner ikapp krymper försprånget av
// sig självt. Underrättelse (en station i landet) avslöjar mixen; utan station är den okänd.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { buyerPreferenceMix, currentGeneration, designBenchmark, designBidTerm } from '../src/design.js'
import { buyerPreferenceDisplay, playerWinCurve } from '../src/queries.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { Agenda, Design, GameState, Order } from '../src/types.js'

const B = balance as unknown as {
  preferenceMixFloor: number
  benchmarkPerGeneration: number
  designBenchmarkBase: number
  generationStepTurns: number
  designBidWeight: number
}

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

// Hög prestanda, låg tillförlitlighet, dyr (inriktning "advanced") respektive billig och robust.
const ADVANCED = design({ id: 'adv', focus: 'advanced', performance: 88, reliability: 40, unitCostFactor: 1.25, trueQuality: 64 })
const ROBUST = design({ id: 'rob', focus: 'robust', performance: 48, reliability: 76, unitCostFactor: 0.8, trueQuality: 62 })

function orderFor(state: GameState, over: Partial<Order> = {}): Order {
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
    ...over,
  }
}

function withAgenda(agenda: Agenda): GameState {
  const state = createInitialState('indochina-slice', 'mix-seed')
  state.officials['official-rvn-procurement']!.agenda = agenda
  return state
}

describe('köparens preferensmix (P111, §5.4)', () => {
  it('summerar till 1 och varje vikt ligger över golvet', () => {
    for (const agenda of ['REARM', 'AUSTERITY', 'MODERNISE', 'NON_ALIGNMENT', 'SELF_ENRICHMENT'] as const) {
      const state = withAgenda(agenda)
      const mix = buyerPreferenceMix(state, orderFor(state), 'artillery')
      expect(mix.performance + mix.reliability + mix.cost).toBeCloseTo(1, 9)
      for (const w of Object.values(mix)) expect(w).toBeGreaterThanOrEqual(B.preferenceMixFloor / 1.5)
    }
  })

  it('MODERNISE väger prestanda tyngre än AUSTERITY, som väger kostnad tyngre', () => {
    const modern = withAgenda('MODERNISE')
    const austere = withAgenda('AUSTERITY')
    const m = buyerPreferenceMix(modern, orderFor(modern), 'artillery')
    const a = buyerPreferenceMix(austere, orderFor(austere), 'artillery')
    expect(m.performance).toBeGreaterThan(a.performance)
    expect(a.cost).toBeGreaterThan(m.cost)
  })

  it('en front som förlorar väger prestanda högre än en som vinner', () => {
    const losing = withAgenda('NON_ALIGNMENT')
    const winning = withAgenda('NON_ALIGNMENT')
    const front = losing.fronts['front-1']!
    // position −100 = A vunnit, +100 = B vunnit; rvn är sida A eller B — sätt den ena sidans seger åt vardera hållet.
    const buyerIsA = front.sideA === 'rvn'
    losing.fronts['front-1']!.position = buyerIsA ? 60 : -60
    winning.fronts['front-1']!.position = buyerIsA ? -60 : 60
    const l = buyerPreferenceMix(losing, orderFor(losing), 'artillery')
    const w = buyerPreferenceMix(winning, orderFor(winning), 'artillery')
    expect(l.performance).toBeGreaterThan(w.performance)
  })

  it('förbandens doktrin avgör vilka kategorier som väger tyngst: prestanda väger mer i en kategori doktrinen bryr sig om', () => {
    const state = withAgenda('NON_ALIGNMENT')
    const front = state.fronts['front-1']!
    for (const f of front.formations ?? []) if (f.factionId === 'rvn') f.doctrine = 'irregular' // infanteri 0,95, artilleri 0,05
    const infantry = buyerPreferenceMix(state, orderFor(state), 'infantry')
    const aviation = buyerPreferenceMix(state, orderFor(state), 'aviation') // ingen vikt alls
    expect(infantry.performance).toBeGreaterThan(aviation.performance)
  })

  it('är ren och deterministisk, och utan front faller den tillbaka på grundmixen', () => {
    const state = withAgenda('NON_ALIGNMENT')
    const order = orderFor(state, { frontId: null })
    state.fronts = {}
    const first = buyerPreferenceMix(state, order, 'artillery')
    expect(buyerPreferenceMix(state, order, 'artillery')).toEqual(first)
    expect(first.performance + first.reliability + first.cost).toBeCloseTo(1, 9)
  })
})

describe('relativ bedömning (P111, §5.4)', () => {
  it('riktmärket stiger med generationen och konstruktionens försprång krymper av sig självt', () => {
    expect(designBenchmark(0)).toBe(B.designBenchmarkBase)
    expect(designBenchmark(B.generationStepTurns)).toBe(B.designBenchmarkBase + B.benchmarkPerGeneration)
    expect(designBenchmark(B.generationStepTurns * 2)).toBe(B.designBenchmarkBase + 2 * B.benchmarkPerGeneration)
    expect(currentGeneration(B.generationStepTurns * 2)).toBe(3)

    const early = withAgenda('MODERNISE')
    const late = withAgenda('MODERNISE')
    late.meta.turn = B.generationStepTurns * 3
    const order = orderFor(early)
    expect(designBidTerm(late, ADVANCED, order)).toBeLessThan(designBidTerm(early, ADVANCED, order))
  })

  it('termen är begränsad till ±designBidWeight', () => {
    const state = withAgenda('MODERNISE')
    const order = orderFor(state)
    // introducedTurn -100: nyhetsvärdet (P117) har avtagit.
    const huge = design({ performance: 100, reliability: 100, trueQuality: 100, unitCostFactor: 0.5, introducedTurn: -100 })
    const awful = design({ performance: 0, reliability: 0, trueQuality: 0, unitCostFactor: 2, introducedTurn: -100 })
    expect(designBidTerm(state, huge, order)).toBeLessThanOrEqual(B.designBidWeight)
    expect(designBidTerm(state, awful, order)).toBeGreaterThanOrEqual(-B.designBidWeight)
  })
})

describe('ingen konstruktion är bäst för alla (P111, delfråga 2)', () => {
  it('en avancerad konstruktion slår en robust hos en MODERNISE-köpare, och tvärtom hos en AUSTERITY-köpare', () => {
    const modern = withAgenda('MODERNISE')
    const austere = withAgenda('AUSTERITY')
    const om = orderFor(modern)
    const oa = orderFor(austere)
    expect(designBidTerm(modern, ADVANCED, om)).toBeGreaterThan(designBidTerm(modern, ROBUST, om))
    expect(designBidTerm(austere, ROBUST, oa)).toBeGreaterThan(designBidTerm(austere, ADVANCED, oa))
  })
})

describe('mixen via underrättelse (P111, skyddsräcke 5)', () => {
  it('med en station i landet visas mixen, utan station är den okänd (null)', () => {
    const state = withAgenda('MODERNISE')
    const withStation = buyerPreferenceDisplay(state, orderFor(state), 'artillery') // Saigon-stationen, rvn
    expect(withStation).not.toBeNull()
    expect(withStation!.performance + withStation!.reliability + withStation!.cost).toBeCloseTo(1, 9)
    // laos saknar station i startläget
    const laos = orderFor(state, { buyerId: 'laos', officialId: 'official-laos-procurement', frontId: 'front-laos' })
    expect(buyerPreferenceDisplay(state, laos, 'artillery')).toBeNull()
  })
})

describe('en formel, en källa med mixen (P111, skyddsräcke 3)', () => {
  it('bidding.ts avgör med samma term som playerWinCurve lovar (±15 pp) för en köpare som värderar prestanda', () => {
    const probe = withAgenda('MODERNISE')
    probe.house.designs = [ADVANCED]
    const curve = playerWinCurve(probe, orderFor(probe), 'A', 'adv')
    const point = curve.reduce((best, p) => (Math.abs(p.confidence - 50) < Math.abs(best.confidence - 50) ? p : best))
    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const s = createInitialState('indochina-slice', `mix-parity-${i}`)
      s.officials['official-rvn-procurement']!.agenda = 'MODERNISE'
      s.house.designs = [ADVANCED]
      const order: Order = { ...orderFor(s), expiresTurn: 0 }
      s.market.openOrders = [order]
      s.meta.turn = 0
      bidding({
        state: s,
        draft: s,
        submission: { standingOrders: [], bids: [{ orderId: order.id, price: point.price, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'adv' }], actions: [] },
        rng: createRng(`mix-parity-${i}`, 0),
        emit: () => 't',
        rejected: [],
      })
      if (s.market.contracts.length > 0) wins++
    }
    expect(Math.abs((wins / SEEDS) * 100 - point.confidence)).toBeLessThanOrEqual(15)
  })
})
