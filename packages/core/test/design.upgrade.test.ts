// design.upgrade.test.ts — P112 (ETAPP9_FORSLAG.md §5.5, skyddsräcke 1, 3 och 5).
//
// Uppgradera eller börja om: en uppgradering (A1) är billigare och snabbare och ärver föregångarens fältrykte — både gott
// och dåligt (dold brist, dolt utfall, osäkerhet) — men har ett lägre tak; en ny konstruktion är dyrare, nollställer
// ryktet och har högre tak. Uppgraderingssatser (`Bid.kit`) till köparens befintliga materiel ger lägre marginal men
// snabbare affärer (L7-kanonen i Centurions torn).
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designCostPerTurn, designDuration, kitBidRejection, kitBidTerm } from '../src/design.js'
import { bidEstimate, playerWinCurve } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { computeUnitCostNow, getProduct } from '../src/pricing.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { Contract, Design, GameState, Order, StandingOrderChange, TurnSubmission } from '../src/types.js'

const B = balance as unknown as {
  rndProjectTurns: number
  upgradeTurnsFactor: number
  upgradeCostFactor: number
  upgradeMaxPerformanceGain: number
  kitUnitCostFactor: number
  kitPriceCapFactor: number
  kitScoreBonus: number
  designSpread: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const UPGRADE = (upgradeOf: string, over: object = {}): StandingOrderChange =>
  ({ kind: 'DESIGN', op: 'START', category: 'artillery', focus: 'advanced', ambition: 'forward', upgradeOf, ...over }) as StandingOrderChange
const NEW = (): StandingOrderChange => ({ kind: 'DESIGN', op: 'START', category: 'artillery', focus: 'advanced', ambition: 'forward' })

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
    unitCostFactor: 0.9,
    trueQuality: 52, // nominellt medelvärde 58 → dolt utfall −6
    uncertainty: 1,
    latentFlaw: { environment: 'mine', severity: 2 },
    flawRevealed: true,
    testedIn: ['jungle'],
    fieldRecord: { occasions: 3, proven: true },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
    ...over,
  }
}

function fresh(d: Design = design()): GameState {
  const state = createInitialState('indochina-slice', 'upgrade-seed')
  state.house.treasury = 50_000_000
  state.house.designs = [d]
  return state
}

function complete(state: GameState, change: StandingOrderChange): GameState {
  let s = resolveTurn(state, { ...EMPTY, standingOrders: [change] }).state
  for (let i = 0; i < 40 && s.house.rnd.length > 0; i++) s = resolveTurn(s, EMPTY).state
  return s
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

function fulfilledFor(designId: string | undefined, buyerId = 'rvn'): Contract {
  return {
    id: `contract-old-${designId ?? 'plain'}`,
    buyerId,
    productId: '105mm_field_gun',
    quantity: 10,
    unitsDelivered: 10,
    price: 100000,
    unitCostAtSigning: 10000,
    grade: 'A',
    dueTurn: 2,
    status: 'fulfilled',
    lateEventId: null,
    frontId: null,
    advancePct: 0,
    advancePaid: 0,
    ...(designId ? { designId } : {}),
  }
}

describe('uppgradering vs ny konstruktion (P112, §5.5)', () => {
  it('START med upgradeOf: okänd, annan kategori och tillbakadragen föregångare avvisas; en egen aktiv godtas', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, UPGRADE('design-1')).ok).toBe(true)
    expect(validateStandingOrderChange(state, state, UPGRADE('design-9'))).toEqual({ ok: false, reason: 'unknown design to upgrade' })
    const other = fresh(design({ category: 'naval', baseProductId: 'coastal_patrol_boat' }))
    expect(validateStandingOrderChange(other, other, UPGRADE('design-1'))).toEqual({ ok: false, reason: 'the design to upgrade is in another category' })
    const withdrawn = fresh(design({ status: 'withdrawn' }))
    expect(validateStandingOrderChange(withdrawn, withdrawn, UPGRADE('design-1'))).toEqual({ ok: false, reason: 'the design to upgrade is withdrawn' })
  })

  it('en uppgradering är billigare och snabbare än en ny konstruktion med samma ambition', () => {
    const house = fresh().house
    expect(designDuration(house, 'forward', true)).toBeLessThan(designDuration(house, 'forward'))
    expect(designCostPerTurn('forward', true)).toBeLessThan(designCostPerTurn('forward'))
    expect(designDuration(house, 'forward', true)).toBe(Math.max(1, Math.round(B.rndProjectTurns * 1.5 * B.upgradeTurnsFactor)))

    const state = fresh()
    const up = resolveTurn(state, { ...EMPTY, standingOrders: [UPGRADE('design-1')] }).state.house.rnd[0]!
    const nu = resolveTurn(fresh(), { ...EMPTY, standingOrders: [NEW()] }).state.house.rnd[0]!
    expect(up.turnsTotal).toBeLessThan(nu.turnsTotal)
    expect(up.costFactor!).toBeLessThan(nu.costFactor!)
    expect(up.design!.upgradeOf).toBe('design-1')
    expect(nu.design!.upgradeOf).toBeNull()
  })

  it('uppgraderingen ärver föregångarens fältrykte, dolda brist, osäkerhet och dolda utfall — och tar sitt lägre tak', () => {
    const state = complete(fresh(), UPGRADE('design-1'))
    expect(state.house.designs).toHaveLength(2)
    const pred = state.house.designs[0]!
    const up = state.house.designs[1]!
    expect(up.lineage).toBe('design-1')
    expect(up.latentFlaw).toEqual(pred.latentFlaw)
    expect(up.flawRevealed).toBe(true)
    expect(up.uncertainty).toBe(pred.uncertainty)
    expect(up.testedIn).toEqual(pred.testedIn)
    expect(up.fieldRecord).toEqual(pred.fieldRecord)
    expect(up.unitCostFactor).toBe(pred.unitCostFactor)
    // taket: prestandan stiger högst upgradeMaxPerformanceGain över föregångarens, och sjunker aldrig
    expect(up.performance).toBeGreaterThanOrEqual(pred.performance)
    expect(up.performance).toBeLessThanOrEqual(pred.performance + B.upgradeMaxPerformanceGain)
    // det dolda utfallet ärvs: trueQuality ligger nära nominellt medelvärde + föregångarens utfall (−6) ± spridningen
    const expected = (up.performance + up.reliability) / 2 + (pred.trueQuality - (pred.performance + pred.reliability) / 2)
    expect(Math.abs(up.trueQuality - expected)).toBeLessThanOrEqual(B.designSpread + 1)
    // föregångaren finns kvar och kan bjudas med
    expect(pred.status).toBe('active')
  })

  it('en ny konstruktion nollställer ryktet, rullar om bristen och kan nå ett högre tak än en uppgradering', () => {
    const state = complete(fresh(), NEW())
    const fresher = state.house.designs[1]!
    expect(fresher.lineage).toBeNull()
    expect(fresher.fieldRecord).toEqual({ occasions: 0, proven: false })
    expect(fresher.testedIn).toEqual([])
    expect(fresher.flawRevealed).toBe(false)
    expect(fresher.uncertainty).toBe(2)
    const pred = state.house.designs[0]!
    // 'advanced'/'forward' → nominell prestanda 82, långt över uppgraderingstaket 60 + 8
    expect(fresher.performance).toBeGreaterThan(pred.performance + B.upgradeMaxPerformanceGain)
  })
})

describe('uppgraderingssatser (P112, §5.5)', () => {
  const kitBid = (over: object = {}): TurnSubmission['bids'][number] =>
    ({ orderId: 'order-test-0', price: 1_300_000, deliveryTurns: 3, grade: 'A', bribe: 0, designId: 'design-2', kit: true, ...over }) as never

  // design-2 är en uppgradering av design-1; köparen har fått design-1 levererad.
  function kitState(): GameState {
    const state = fresh()
    state.house.designs.push(design({ id: 'design-2', name: 'H&V M65 Field Gun', lineage: 'design-1', trueQuality: 58, latentFlaw: null, flawRevealed: false }))
    state.market.contracts = [fulfilledFor('design-1')]
    return state
  }

  function runBid(state: GameState, bid: TurnSubmission['bids'][number], seed = 'kit'): { state: GameState; rejected: { reason: string }[] } {
    const order: Order = { ...orderFor(state), expiresTurn: 0, competingRivals: [] }
    state.market.openOrders = [order]
    state.meta.turn = 0
    const rejected: { reason: string }[] = []
    bidding({
      state,
      draft: state,
      submission: { standingOrders: [], bids: [bid], actions: [] },
      rng: createRng(seed, 0),
      emit: () => 't',
      rejected: rejected as never,
    })
    return { state, rejected }
  }

  it('kräver en uppgraderad konstruktion, köparens befintliga materiel av föregångaren och ett pris under taket', () => {
    const state = kitState()
    const order = orderFor(state)
    const cap = Math.round(B.kitPriceCapFactor * order.referencePrice)
    const d2 = state.house.designs[1]!
    expect(kitBidRejection(state, d2, order, cap)).toBeNull()
    expect(kitBidRejection(state, d2, order, cap + 1)).toBe('kit price above the cap')
    expect(kitBidRejection(state, state.house.designs[0]!, order, cap)).toBe('an upgrade kit needs an upgraded design')
    const noMateriel = kitState()
    noMateriel.market.contracts = []
    expect(kitBidRejection(noMateriel, noMateriel.house.designs[1]!, order, cap)).toBe('the buyer has no materiel of the predecessor')
    const otherBuyer = kitState()
    otherBuyer.market.contracts = [fulfilledFor('design-1', 'laos')]
    expect(kitBidRejection(otherBuyer, otherBuyer.house.designs[1]!, order, cap)).toBe('the buyer has no materiel of the predecessor')
    const active = kitState()
    active.market.contracts = [{ ...fulfilledFor('design-1'), status: 'active' }]
    expect(kitBidRejection(active, active.house.designs[1]!, order, cap)).toBe('the buyer has no materiel of the predecessor')
  })

  it('bidding.ts avvisar en satsbud utan uppgraderad konstruktion, utan materiel och över taket', () => {
    expect(runBid(kitState(), kitBid({ designId: undefined })).rejected.map((r) => r.reason)).toEqual(['an upgrade kit needs an upgraded design'])
    const noMateriel = kitState()
    noMateriel.market.contracts = []
    expect(runBid(noMateriel, kitBid()).rejected.map((r) => r.reason)).toEqual(['the buyer has no materiel of the predecessor'])
    expect(runBid(kitState(), kitBid({ price: 1_900_000 })).rejected.map((r) => r.reason)).toEqual(['kit price above the cap'])
  })

  it('ett vunnet satsbud ger ett Contract med kit och styrelsekostnad × kitUnitCostFactor × konstruktionens faktor', () => {
    const { state, rejected } = runBid(kitState(), kitBid())
    expect(rejected).toEqual([])
    const contract = state.market.contracts.find((c) => c.id === 'contract-order-test-0')!
    expect(contract.kit).toBe(true)
    expect(contract.designId).toBe('design-2')
    const base = computeUnitCostNow(getProduct('105mm_field_gun'), 'A', state.market.commodities)
    expect(contract.unitCostAtSigning).toBe(Math.round(base * 0.9 * B.kitUnitCostFactor))
  })

  it('satsen ger en poängbonus (kitBidTerm) som playerWinCurve och bidEstimate ser, och prisintervallet kapas vid taket', () => {
    expect(kitBidTerm()).toBe(B.kitScoreBonus)
    const state = kitState()
    const order = orderFor(state)
    const sum = (c: { confidence: number }[]): number => c.reduce((s, p) => s + p.confidence, 0)
    const plain = playerWinCurve(state, order, 'A', 'design-2')
    const kit = playerWinCurve(state, order, 'A', 'design-2', true)
    const cap = Math.round(B.kitPriceCapFactor * order.referencePrice)
    expect(Math.max(...kit.map((p) => p.price))).toBeLessThanOrEqual(cap)
    // samma prispunkt vinner minst lika ofta med satsen (bonus) — jämför vid kurvans första, gemensamma punkt
    expect(kit[0]!.confidence).toBeGreaterThanOrEqual(plain[0]!.confidence)
    expect(sum(bidEstimate(state, order, 'A', 'design-2', true).winBand)).toBeGreaterThanOrEqual(sum(bidEstimate(state, order, 'A', 'design-2').winBand))
    // utan uppfyllda villkor ignoreras satsen i skattningen (samma prövning som bidding.ts)
    const noMateriel = kitState()
    noMateriel.market.contracts = []
    expect(playerWinCurve(noMateriel, order, 'A', 'design-2', true)).toEqual(playerWinCurve(noMateriel, order, 'A', 'design-2'))
  })

  it('bidding.ts avgör med samma bonus som kurvan lovar: frekvens och kurva stämmer inom ±15 pp', () => {
    const probe = kitState()
    const curve = playerWinCurve(probe, orderFor(probe), 'A', 'design-2', true)
    const point = curve.reduce((best, p) => (Math.abs(p.confidence - 50) < Math.abs(best.confidence - 50) ? p : best))
    const SEEDS = 150
    let wins = 0
    for (let i = 0; i < SEEDS; i++) {
      const s = kitState()
      // annan seed för spelets egna rivalbud
      const fresh2 = createInitialState('indochina-slice', `kit-parity-${i}`)
      fresh2.house.designs = s.house.designs
      fresh2.market.contracts = s.market.contracts
      const { state } = runBid(fresh2, kitBid({ price: point.price }), `kit-parity-${i}`)
      if (state.market.contracts.some((c) => c.id === 'contract-order-test-0')) wins++
    }
    expect(Math.abs((wins / SEEDS) * 100 - point.confidence)).toBeLessThanOrEqual(15)
  })
})
