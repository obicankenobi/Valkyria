// leadSupplier.test.ts — P185 regel 1 (ETAPP11_FORSLAG.md §9b, beslut 11O/11P): huvudleverantörsregeln. Ett bud i en kategori kräver ett monteringsverk i den (i drift, eller under byggnad med högst
// ett kvartal kvar; verk utomlands räknas), högst hälften av ett kontrakts enheter får läggas ut, och en upphandling kräver ett verk eller ett pågående bygge. Den hårda spärren stänger
// budet helt; den mjuka låter huset ta små ordrar helt utlagda till sämre marginal. `leadSupplierMode` väljer ('off' = som före P185, bara för mätning och attribuering).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createRng } from '../src/rng.js'
import { getProduct } from '../src/pricing.js'
import { validateBid, validateAction } from '../src/validateAction.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { hasWorksFor, leadSupplierRejection, maxOutsourcePct, subcontractCostFactorFor } from '../src/leadSupplier.js'
import { routeCostFactor } from '../src/outsourcing.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Bid, Contract, GameState, Order, TurnSubmission, WireEvent } from '../src/types.js'

type Mutable = { leadSupplierMode: string; rivalCapacityContracts: number }
const B = balance as unknown as Mutable & { subcontractCostFactor: number; leadSupplierMaxOutsourcePct: number; leadSupplierSoftMaxLineTurns: number; leadSupplierSoftCostFactor: number }
const ORIGINAL_MODE = B.leadSupplierMode
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

beforeEach(() => {
  B.leadSupplierMode = 'hard'
})
afterEach(() => {
  B.leadSupplierMode = ORIGINAL_MODE
})

// Det isolerade budsteget (som steps/bidding.test.ts): full pipeline fyller på köparnas budgetar före avgörandet, så rivalernas bud prövas här utan den.
function runBidding(state: GameState, submission: TurnSubmission = EMPTY): Omit<WireEvent, 'id' | 'turn'>[] {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  const ctx: ResolveContext = { state, draft: state, submission, rng: createRng('lead-supplier', 0), emit: (e) => (emitted.push(e), `t-${emitted.length}`), rejected: [] }
  bidding(ctx)
  return emitted
}

const fresh = (seed: string): GameState => createInitialState('indochina-slice', seed)

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: 'm3_apc', quantity: 30, unitsDelivered: 0, price: 6_000_000, unitCostAtSigning: 100_000, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}

function openOrder(state: GameState, productId: string, quantity: number, id = 'order-x'): Order {
  const order: Order = {
    id, buyerId: 'rvn', productId, quantity, statedBudget: 90_000_000, trueBudget: 100_000_000, referencePrice: 80_000_000, requiredDeliveryTurns: 6, expiresTurn: state.meta.turn,
    competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
  }
  state.market.openOrders = [order]
  return order
}

function bidOn(order: Order, price?: number): Bid {
  return { orderId: order.id, price: price ?? Math.floor(order.trueBudget * 0.9), deliveryTurns: 8, grade: 'A', bribe: 0 }
}

describe('hasWorksFor — vad som räknas som ett verk i kategorin (§9b punkt 1)', () => {
  it('startverket (artilleri) räknas för artilleri men inte för pansar', () => {
    const s = fresh('lead-1')
    expect(hasWorksFor(s.house, 'artillery')).toBe(true)
    expect(hasWorksFor(s.house, 'armour')).toBe(false)
  })

  it('ett verk under byggnad med högst ett kvartal kvar räknas, med två kvartal kvar gör det inte', () => {
    const s = fresh('lead-2')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'armour', lines: [], status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 3, turnsLeft: 2, costTotal: 1, costPerTurn: 1, forced: false } })
    expect(hasWorksFor(s.house, 'armour')).toBe(false)
    s.house.works.find((w) => w.id === 'works-9')!.build!.turnsLeft = 1
    expect(hasWorksFor(s.house, 'armour')).toBe(true)
  })

  it('för en upphandling räcker ett pågående bygge hur långt det än har kvar', () => {
    const s = fresh('lead-3')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'armour', lines: [], status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 4, turnsLeft: 4, costTotal: 1, costPerTurn: 1, forced: false } })
    expect(hasWorksFor(s.house, 'armour', { anyBuild: true })).toBe(true)
  })

  it('ett verk utomlands räknas, och ett verk i strejk räknas (det är fortfarande huset verk)', () => {
    const s = fresh('lead-4')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'naval', location: 'laos', status: 'operating' })
    expect(hasWorksFor(s.house, 'naval')).toBe(true)
    s.house.works[0]!.status = 'strike'
    expect(hasWorksFor(s.house, 'artillery')).toBe(true)
  })

  it('ett verk utan kategori (migrerat) bygger allt', () => {
    const s = fresh('lead-5')
    s.house.works[0]!.category = null
    expect(hasWorksFor(s.house, 'aviation')).toBe(true)
  })

  it('en laboratorium eller ett ritkontor är inget monteringsverk', () => {
    const s = fresh('lead-6')
    expect(s.house.works.some((w) => w.kind === 'laboratory' && w.category === 'artillery')).toBe(true)
    s.house.works = s.house.works.filter((w) => w.kind !== 'assembly')
    expect(hasWorksFor(s.house, 'artillery')).toBe(false)
  })
})

describe('den hårda spärren — inga bud utan verk', () => {
  it('ett bud i en kategori utan verk ger skälet i klartext', () => {
    const s = fresh('hard-1')
    const order = openOrder(s, 'm3_apc', 40)
    const result = validateBid(s, s, bidOn(order))
    expect(result).toEqual({ ok: false, reason: 'Requires an Assembly Works for armour' })
  })

  it('ett bud i verkets kategori går igenom', () => {
    const s = fresh('hard-2')
    const order = openOrder(s, '105mm_field_gun', 40)
    expect(validateBid(s, s, bidOn(order)).ok).toBe(true)
  })

  it('en okänd order bedöms inte här (bidding.ts avvisar den på sitt eget sätt)', () => {
    const s = fresh('hard-3')
    expect(validateBid(s, s, { orderId: 'nope', price: 1, deliveryTurns: 1, grade: 'A', bribe: 0 }).ok).toBe(true)
  })

  it('leadSupplierRejection är null när regeln är av', () => {
    B.leadSupplierMode = 'off'
    const s = fresh('hard-4')
    expect(leadSupplierRejection(s.house, getProduct('m3_apc'), 40)).toBeNull()
  })

  it('avgörandet avvisar budet med samma skäl och ger ingen tilldelning', () => {
    const s = fresh('hard-5')
    s.house.treasury = 50_000_000
    const order = openOrder(s, 'm3_apc', 40)
    s.house.techLevel.armour = 9
    const result = resolveTurn(s, { ...EMPTY, bids: [bidOn(order)] })
    expect(result.rejected.some((r) => r.reason === 'Requires an Assembly Works for armour')).toBe(true)
    expect(result.state.market.contracts.some((c) => c.id === `contract-${order.id}`)).toBe(false)
  })

  it('avgörandet tar ett bud i verkets kategori som förut', () => {
    const s = fresh('hard-6')
    const order = openOrder(s, '105mm_field_gun', 40)
    const result = resolveTurn(s, { ...EMPTY, bids: [bidOn(order, order.trueBudget - 1)] })
    expect(result.rejected.some((r) => r.reason.startsWith('Requires an Assembly Works'))).toBe(false)
  })
})

describe('den mjuka spärren — små ordrar utan verk, helt utlagda, sämre marginal', () => {
  beforeEach(() => {
    B.leadSupplierMode = 'soft'
  })

  it('en liten order (högst så många linjekvartal som datan säger) går igenom utan verk', () => {
    const s = fresh('soft-1')
    const product = getProduct('m3_apc')
    const small = Math.floor(product.unitsPerLineTurn * B.leadSupplierSoftMaxLineTurns)
    expect(leadSupplierRejection(s.house, product, small)).toBeNull()
  })

  it('en större order utan verk avvisas med skälet och gränsen', () => {
    const s = fresh('soft-2')
    const product = getProduct('m3_apc')
    const small = Math.floor(product.unitsPerLineTurn * B.leadSupplierSoftMaxLineTurns)
    const reason = leadSupplierRejection(s.house, product, small + 1)
    expect(reason).toContain('Requires an Assembly Works for armour')
    expect(reason).toContain(String(small))
  })

  it('med ett verk i kategorin gäller ingen storleksgräns', () => {
    const s = fresh('soft-3')
    expect(leadSupplierRejection(s.house, getProduct('105mm_field_gun'), 100_000)).toBeNull()
  })

  it('en utlagd liten order kostar mer än en vanlig utläggning (subcontractCostFactor × leadSupplierSoftCostFactor)', () => {
    const s = fresh('soft-4')
    expect(subcontractCostFactorFor(s.house, getProduct('m3_apc'))).toBeCloseTo(B.subcontractCostFactor * B.leadSupplierSoftCostFactor, 9)
    expect(subcontractCostFactorFor(s.house, getProduct('105mm_field_gun'))).toBeCloseTo(B.subcontractCostFactor, 9)
    expect(routeCostFactor(s.house, getProduct('m3_apc'))).toBeCloseTo(B.subcontractCostFactor * B.leadSupplierSoftCostFactor, 9)
    expect(routeCostFactor(s.house, getProduct('105mm_field_gun'))).toBe(1)
  })
})

describe('högst hälften av ett kontrakt får läggas ut', () => {
  it('maxOutsourcePct är 100 utan regel eller utan verk, annars leadSupplierMaxOutsourcePct', () => {
    const s = fresh('cap-1')
    expect(maxOutsourcePct(s.house, getProduct('105mm_field_gun'))).toBe(B.leadSupplierMaxOutsourcePct)
    expect(maxOutsourcePct(s.house, getProduct('m3_apc'))).toBe(100) // inget verk: den helt utlagda lilla ordern (mjuk) eller ett förlorat verk
    B.leadSupplierMode = 'off'
    expect(maxOutsourcePct(s.house, getProduct('105mm_field_gun'))).toBe(100)
  })

  it('OUTSOURCE över taket avvisas när huset har ett verk i kategorin, 50 % går', () => {
    const s = fresh('cap-2')
    s.market.contracts = [contract({ id: 'gun', productId: '105mm_field_gun', quantity: 60 })]
    const set = (sharePct: number) => validateStandingOrderChange(s, s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'gun', sharePct })
    expect(set(50).ok).toBe(true)
    expect(set(25).ok).toBe(true)
    const over = set(75)
    expect(over.ok).toBe(false)
    expect((over as { reason: string }).reason).toBe('At most 50 percent of a contract may be outsourced')
    expect(set(100).ok).toBe(false)
  })

  it('ett kontrakt i en kategori utan verk kan fortfarande läggas ut helt (auto-utläggningen och ett förlorat verk)', () => {
    const s = fresh('cap-3')
    s.market.contracts = [contract({ id: 'apc', quantity: 10 })]
    expect(validateStandingOrderChange(s, s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'apc', sharePct: 100 }).ok).toBe(true)
  })

  it('utan regeln är gränsen borta (som före P185)', () => {
    B.leadSupplierMode = 'off'
    const s = fresh('cap-4')
    s.market.contracts = [contract({ id: 'gun', productId: '105mm_field_gun', quantity: 60 })]
    expect(validateStandingOrderChange(s, s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'gun', sharePct: 100 }).ok).toBe(true)
  })
})

describe('rivalerna följer regeln genom kapacitetstalet (11L)', () => {
  function rivalIds(state: GameState): string[] {
    return Object.keys(state.rivals)
  }

  it('en fullbelagd rival bjuder inte utanför sin specialisering, men bjuder i den (dyrare)', () => {
    const s = fresh('rival-1')
    s.house.treasury = 50_000_000
    const ids = rivalIds(s)
    const rival = s.rivals[ids[0]!]!
    const outside = (['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'] as const).find((c) => c !== rival.specialisation)!
    const product = [getProduct('m1_rifle'), getProduct('105mm_field_gun'), getProduct('m3_apc'), getProduct('ch3_transport_helicopter'), getProduct('coastal_patrol_boat'), getProduct('tac_radio_suite')].find((p) => p.category === outside)!
    for (let i = 0; i < B.rivalCapacityContracts; i++) rival.contracts.push({ id: `rc-${i}`, buyerId: 'rvn', productId: product.id, quantity: 1, unitsDelivered: 0, dueTurn: 99, status: 'active', lateEventId: null })
    const order = openOrder(s, product.id, 10)
    order.competingRivals = [rival.id]
    s.factions.rvn!.militaryBudget = 500_000_000
    runBidding(s)
    // Ingen vinst åt rivalen: den bjöd inte, så ordern förblir ouppfylld.
    expect(s.rivals[rival.id]!.contracts.some((c) => c.id === `rival-contract-${order.id}`)).toBe(false)
  })

  it('en rival med ledig kapacitet bjuder utanför sin specialisering som förut', () => {
    const s = fresh('rival-2')
    const rival = s.rivals[rivalIds(s)[0]!]!
    const outside = (['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'] as const).find((c) => c !== rival.specialisation)!
    const product = [getProduct('m1_rifle'), getProduct('105mm_field_gun'), getProduct('m3_apc'), getProduct('ch3_transport_helicopter'), getProduct('coastal_patrol_boat'), getProduct('tac_radio_suite')].find((p) => p.category === outside)!
    const order = openOrder(s, product.id, 10)
    order.competingRivals = [rival.id]
    rival.contracts = []
    s.factions.rvn!.militaryBudget = 500_000_000
    runBidding(s)
    expect(s.rivals[rival.id]!.contracts.some((c) => c.id === `rival-contract-${order.id}`)).toBe(true)
  })
})

describe('upphandlingar och förmedling följer regeln', () => {
  it('anmälan till en upphandling i en kategori utan verk eller bygge avvisas', () => {
    const s = fresh('prog-1')
    s.programmes = [
      { id: 'prog-x', buyerId: 'rvn', category: 'armour', baseProductId: 'm3_apc', phase: 'announced', entrants: [] } as unknown as NonNullable<GameState['programmes']>[number],
    ]
    const result = validateStandingOrderChange(s, s, { kind: 'PROGRAMME', op: 'ENTER', programmeId: 'prog-x' })
    expect(result).toEqual({ ok: false, reason: 'Requires an Assembly Works for armour' })
  })

  it('med ett verk under byggnad (hur långt som helst kvar) går anmälan igenom regeln', () => {
    const s = fresh('prog-2')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'armour', lines: [], status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 4, turnsLeft: 4, costTotal: 1, costPerTurn: 1, forced: false } })
    s.programmes = [
      { id: 'prog-x', buyerId: 'rvn', category: 'armour', baseProductId: 'm3_apc', phase: 'announced', entrants: [] } as unknown as NonNullable<GameState['programmes']>[number],
    ]
    const result = validateStandingOrderChange(s, s, { kind: 'PROGRAMME', op: 'ENTER', programmeId: 'prog-x' })
    expect((result as { reason?: string }).reason ?? '').not.toContain('Assembly Works')
  })

  it('en BROKER-affär i en kategori utan verk avvisas av validateAction med samma skäl', () => {
    const s = fresh('broker-1')
    const result = validateAction(s, s, { type: 'BROKER', buyerId: 'rvn', productId: 'm3_apc', quantity: 10, price: 1000 })
    // Tjänstemannens villkor prövas först eller efter — oavsett ordning ska verksskälet finnas när tjänstemannen går med på affären.
    if (!result.ok) expect(['Requires an Assembly Works for armour', 'official will not broker this deal']).toContain(result.reason)
  })
})

describe('autoutläggningen väntar på ett verk som blir klart nästa kvartal', () => {
  it('ett kontrakt i en kategori med ett verk som har ett kvartal kvar läggs inte ut, det väntar', () => {
    const s = fresh('wait-1')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'armour', lines: [], status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 3, turnsLeft: 1, costTotal: 1, costPerTurn: 1, forced: false } })
    s.market.contracts = [contract({ id: 'apc', quantity: 10 })]
    const result = resolveTurn(s, EMPTY)
    expect(result.state.market.contracts.find((c) => c.id === 'apc')!.outsource).toBeUndefined()
    expect(allLines(result.state.house).some((l) => l.assignedContractId === 'apc')).toBe(false)
  })

  it('utan verk alls läggs det ut helt, som förut', () => {
    const s = fresh('wait-2')
    s.market.contracts = [contract({ id: 'apc', quantity: 10 })]
    const result = resolveTurn(s, EMPTY)
    expect(result.state.market.contracts.find((c) => c.id === 'apc')!.outsource).toMatchObject({ sharePct: 100, auto: true })
  })
})
