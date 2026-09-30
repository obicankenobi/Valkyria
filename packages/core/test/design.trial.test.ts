// design.trial.test.ts — P115 (ETAPP9_FORSLAG.md §6.4, beslut 9G, skyddsräcke 3 och 5). FIELD_TRIAL, det första av två nya verb.
//
// Huset lånar ut en mindre sats av en konstruktion till en köpare för prov i fält, till självkostnad. Det ger: intervallet
// smalnar av snabbt, fältrykte börjar byggas, en miljöbrist visar sig om köparens front har miljön, och huset får en bonus i
// köparens nästa upphandling. Det kostar: satsen, en handling, och resultatet blir känt för alla — rivalerna ser din
// konstruktions verkliga kvalitet (Design.exposedToRivals, P116 läser den). Kräver en tjänsteman med relation över ett golv.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designBidTerm, fieldTrialBatch } from '../src/design.js'
import { previewAction } from '../src/previewAction.js'
import { resolveTurn } from '../src/resolve/index.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { validateAction } from '../src/validateAction.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { Design, GameState, Order, PlayerAction, TurnSubmission } from '../src/types.js'

const B = balance as unknown as {
  fieldTrialRelationFloor: number
  fieldTrialUncertaintySteps: number
  fieldTrialOccasions: number
  fieldTrialBidBonus: number
  provenOccasions: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const TRIAL = (over: object = {}): PlayerAction =>
  ({ type: 'POLITICAL', op: 'FIELD_TRIAL', officialId: 'official-rvn-procurement', designId: 'design-1', ...over }) as PlayerAction

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
  const state = createInitialState('indochina-slice', 'trial-seed')
  state.house.treasury = 50_000_000
  state.house.designs = [d]
  state.officials['official-rvn-procurement']!.relationToPlayer = B.fieldTrialRelationFloor + 10
  return state
}

describe('validering (P115)', () => {
  it('godtas med en tjänsteman över relationsgolvet och en egen, aktiv konstruktion', () => {
    const state = fresh()
    expect(validateAction(state, state, TRIAL())).toEqual({ ok: true })
  })

  it('avvisas: okänd tjänsteman/konstruktion, tillbakadragen, för låg relation, redan provad av köparen, för lite kassa', () => {
    const state = fresh()
    expect(validateAction(state, state, TRIAL({ officialId: 'nobody' }))).toEqual({ ok: false, reason: 'unknown official' })
    expect(validateAction(state, state, TRIAL({ designId: 'design-9' }))).toEqual({ ok: false, reason: 'unknown design' })
    const withdrawn = fresh(design({ status: 'withdrawn' }))
    expect(validateAction(withdrawn, withdrawn, TRIAL())).toEqual({ ok: false, reason: 'design is withdrawn' })
    const cold = fresh()
    cold.officials['official-rvn-procurement']!.relationToPlayer = B.fieldTrialRelationFloor - 1
    expect(validateAction(cold, cold, TRIAL())).toEqual({ ok: false, reason: 'relation too low for a field trial' })
    const done = fresh(design({ trials: { rvn: { turn: 1, bonusActive: false } } }))
    expect(validateAction(done, done, TRIAL())).toEqual({ ok: false, reason: 'that buyer has already tested this design' })
    const poor = fresh()
    poor.house.treasury = fieldTrialBatch(poor, poor.house.designs[0]!).cost - 1
    expect(validateAction(poor, poor, TRIAL())).toEqual({ ok: false, reason: 'not enough cash for the trial batch' })
  })

  it('previewAction visar satsens kostnad och intervallets före → efter', () => {
    const state = fresh()
    const preview = previewAction(state, TRIAL())
    expect(preview.cost).toBe(fieldTrialBatch(state, state.house.designs[0]!).cost)
    expect(preview.effect).toEqual({ label: 'CLASS UNCERTAINTY', before: 2, after: 2 - B.fieldTrialUncertaintySteps })
  })
})

describe('effekten (P115, §6.4)', () => {
  it('kostar satsen (huvudboken: political), en handling, smalnar av intervallet, ger ett fälttillfälle och gör kvaliteten känd för rivalerna', () => {
    const state = fresh()
    const batch = fieldTrialBatch(state, state.house.designs[0]!)
    const treasury = state.house.treasury
    const result = resolveTurn(state, { ...EMPTY, actions: [TRIAL()] })
    expect(result.rejected).toEqual([])
    const s = result.state
    const d = s.house.designs[0]!
    expect(d.uncertainty).toBe(2 - B.fieldTrialUncertaintySteps)
    expect(d.fieldRecord.occasions).toBe(B.fieldTrialOccasions)
    expect(d.exposedToRivals).toBe(true)
    expect(d.trials?.['rvn']).toMatchObject({ bonusActive: true })
    expect(s.ledger[s.ledger.length - 1]!.expenses.political).toBeGreaterThanOrEqual(batch.cost)
    expect(treasury - s.house.treasury).toBeGreaterThanOrEqual(batch.cost)
    const headline = result.wire.find((e) => e.headline.includes('FIELD TRIAL'))!
    expect(headline.headline).toContain('H&V M64 FIELD GUN')
    expect(headline.headline).toContain('KNOWN TO ALL')
    expect(headline.actorIsPlayer).toBe(true)
    expect(headline.delta.treasury).toBe(-batch.cost)
  })

  it('intervallet stannar vid 0 och bonusen ges ändå', () => {
    const state = fresh(design({ uncertainty: 0 }))
    const s = resolveTurn(state, { ...EMPTY, actions: [TRIAL()] }).state
    expect(s.house.designs[0]!.uncertainty).toBe(0)
    expect(s.house.designs[0]!.trials?.['rvn']?.bonusActive).toBe(true)
  })

  it('ett fälttillfälle via provet kan göra konstruktionen stridsbeprövad, med rubrik', () => {
    const state = fresh(design({ fieldRecord: { occasions: B.provenOccasions - B.fieldTrialOccasions, proven: false } }))
    const r = resolveTurn(state, { ...EMPTY, actions: [TRIAL()] })
    expect(r.state.house.designs[0]!.fieldRecord.proven).toBe(true)
    expect(r.wire.some((e) => e.headline.includes('BATTLE-PROVEN'))).toBe(true)
  })

  it('en miljöbrist som hör till köparens front avslöjas av provet; en i en annan miljö gör det inte', () => {
    const jungle = fresh(design({ latentFlaw: { environment: 'jungle', severity: 2 } }))
    const r = resolveTurn(jungle, { ...EMPTY, actions: [TRIAL()] })
    expect(r.state.house.designs[0]!.flawRevealed).toBe(true)
    expect(r.wire.some((e) => e.headline.includes('FIELD TRIAL') && e.headline.includes('FLAW') && e.headline.includes('JUNGLE'))).toBe(true)
    const mine = fresh(design({ latentFlaw: { environment: 'mine', severity: 2 } })) // front-1 saknar minor
    expect(resolveTurn(mine, { ...EMPTY, actions: [TRIAL()] }).state.house.designs[0]!.flawRevealed).toBe(false)
  })

  it('kostar en handling: med alla handlingspoäng använda avvisas provet, med en ledig godtas det', () => {
    const state = fresh()
    const hire: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } }
    const full = Array.from({ length: state.house.actionPoints }, () => hire)
    const blocked = resolveTurn(state, { ...EMPTY, actions: [...full, TRIAL()] })
    expect(blocked.rejected.some((x) => x.reason === 'no executive actions remaining')).toBe(true)
    expect(blocked.state.house.designs[0]!.trials).toBeUndefined()
    const allowed = resolveTurn(state, { ...EMPTY, actions: [...full.slice(1), TRIAL()] })
    expect(allowed.rejected).toEqual([])
    expect(allowed.state.house.designs[0]!.trials?.['rvn']).toBeDefined()
  })
})

describe('bonusen i köparens nästa upphandling (P115, en formel, en källa)', () => {
  const orderFor = (buyerId = 'rvn'): Order => ({
    id: 'order-test-0',
    buyerId,
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: `official-${buyerId}-procurement`,
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: buyerId === 'rvn' ? 'front-1' : 'front-laos',
    advancePct: 0,
  })

  it('designBidTerm ger fieldTrialBidBonus hos den köpare som provat konstruktionen — och bara den', () => {
    const plain = fresh()
    const trialled = fresh(design({ trials: { rvn: { turn: 1, bonusActive: true } } }))
    const rvn = orderFor()
    const laos = orderFor('laos')
    const base = designBidTerm(plain, plain.house.designs[0]!, rvn)
    expect(designBidTerm(trialled, trialled.house.designs[0]!, rvn) - base).toBeCloseTo(B.fieldTrialBidBonus, 9)
    expect(designBidTerm(trialled, trialled.house.designs[0]!, laos)).toBeCloseTo(designBidTerm(plain, plain.house.designs[0]!, laos), 9)
    const spent = fresh(design({ trials: { rvn: { turn: 1, bonusActive: false } } }))
    expect(designBidTerm(spent, spent.house.designs[0]!, rvn)).toBeCloseTo(base, 9)
  })

  it('bonusen förbrukas när konstruktionen vinner ett kontrakt hos köparen ("nästa upphandling")', () => {
    const state = fresh(design({ trials: { rvn: { turn: 1, bonusActive: true } } }))
    const order = orderFor()
    state.market.openOrders = [order]
    state.meta.turn = 0
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [{ orderId: order.id, price: 1_900_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-1' }], actions: [] },
      rng: createRng('trial-win', 0),
      emit: () => 't',
      rejected: [],
    })
    expect(state.market.contracts).toHaveLength(1)
    expect(state.house.designs[0]!.trials?.['rvn']?.bonusActive).toBe(false)
  })
})

describe('sparade partier (P115)', () => {
  it('en konstruktion utan trials/exposedToRivals läses som ej provad', () => {
    const state = fresh()
    expect('trials' in state.house.designs[0]!).toBe(false)
    expect(validateAction(state, state, TRIAL()).ok).toBe(true)
  })
})
