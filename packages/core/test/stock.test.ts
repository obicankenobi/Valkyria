// stock.test.ts — P175 (ETAPP11_FORSLAG.md §5.6, beslut 11F): depån och tillverkning på lager.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import facilities from '../src/data/facilities.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { createRng } from '../src/rng.js'
import { production } from '../src/resolve/steps/production.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { computeUnitCostNow, getProduct } from '../src/pricing.js'
import { deliverFromStock, stockCapacity, stockHolding, stockUnitsOf, stockValue, advanceStock } from '../src/stock.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, WireEvent } from '../src/types.js'

const B = balance as unknown as Record<'stockHoldingPctPerQuarter' | 'stockAgingPerGeneration' | 'stockDeliveryTurns', number>
const CAP = (facilities as unknown as { kinds: { depot: { stockCapacity: number[] } } }).kinds.depot.stockCapacity

function ctxFor(state: GameState, seed = 'stock'): { ctx: ResolveContext; emitted: WireEvent[] } {
  const emitted: WireEvent[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: { standingOrders: [], bids: [], actions: [] },
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e as WireEvent)
      return `t-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function withDepot(seed: string): GameState {
  const s = createInitialState('indochina-slice', seed)
  s.house.works[0]!.category = null
  s.house.treasury = 100_000_000
  s.house.works.push({ id: 'works-9', kind: 'depot', level: 1, category: null, condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0 })
  s.house.standingOrders.stock = { m1_rifle: { targetUnits: 500, sinceTurn: 0 } }
  return s
}

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-test-0',
  buyerId: 'rvn',
  productId: 'm1_rifle',
  quantity: 300,
  unitsDelivered: 0,
  price: 2_000_000,
  unitCostAtSigning: 100,
  grade: 'A',
  dueTurn: 10,
  status: 'active',
  lateEventId: null,
  frontId: null,
  advancePct: 0,
  advancePaid: 0,
  ...overrides,
})

describe('depån och lagerordern (P175)', () => {
  it('lagerordern kräver en depå i drift och en känd produkt; ett mål 1 till stockMaxTargetUnits; CANCEL kräver en order', () => {
    const s = createInitialState('indochina-slice', 'stock-validate')
    const v = (c: Parameters<typeof validateStandingOrderChange>[2]) => validateStandingOrderChange(s, s, c)
    expect(v({ kind: 'STOCK', op: 'SET', productId: 'm1_rifle', targetUnits: 100 })).toMatchObject({ ok: false, reason: expect.stringContaining('depot') })
    const d = withDepot('stock-validate-2')
    const w = (c: Parameters<typeof validateStandingOrderChange>[2]) => validateStandingOrderChange(d, d, c)
    expect(w({ kind: 'STOCK', op: 'SET', productId: 'm1_rifle', targetUnits: 100 })).toEqual({ ok: true })
    expect(w({ kind: 'STOCK', op: 'SET', productId: 'nope', targetUnits: 100 })).toMatchObject({ ok: false, reason: 'unknown product' })
    expect(w({ kind: 'STOCK', op: 'SET', productId: 'm1_rifle', targetUnits: 0 })).toMatchObject({ ok: false })
    expect(w({ kind: 'STOCK', op: 'CANCEL', productId: 'm1_rifle' })).toEqual({ ok: true })
    expect(w({ kind: 'STOCK', op: 'CANCEL', productId: 'm1_mortar' })).toMatchObject({ ok: false })
    d.house.works[3]!.status = 'under_construction'
    expect(w({ kind: 'STOCK', op: 'SET', productId: 'm1_rifle', targetUnits: 100 })).toMatchObject({ ok: false })
  })

  it('en ledig linje bygger till lager tills målet nås, betalar via huvudboken och tas i bruk igen nästa tur', () => {
    const s = withDepot('stock-build')
    s.house.standingOrders.stock!.m1_rifle!.targetUnits = 30_000
    const treasury = s.house.treasury
    const { ctx, emitted } = ctxFor(s)
    production(ctx)
    const have = stockUnitsOf(s.house, 'm1_rifle')
    expect(have).toBeGreaterThan(0)
    expect(have).toBeLessThan(30_000)
    expect(s.house.treasury).toBe(treasury - stockValue(s.house))
    expect(s.house.stock![0]).toMatchObject({ productId: 'm1_rifle', designId: null, builtTurn: 0 })
    expect(emitted.some((e) => e.headline.includes('TO STOCK'))).toBe(true)
    expect(allLines(s.house)[0]!.status).toBe('running')
    // nästa tur är linjen ledig igen och bygger vidare tills målet nåtts
    s.meta.turn += 1
    production(ctxFor(s, 'stock2').ctx)
    expect(stockUnitsOf(s.house, 'm1_rifle')).toBeGreaterThan(have)
  })

  it('en linje som skulle behöva ställas om bygger inte till lager, och en linje med ett kontrakt gör det inte heller', () => {
    const s = withDepot('stock-tooling')
    for (const l of allLines(s.house)) l.tooling = { productId: 'm1_mortar', designId: null }
    production(ctxFor(s).ctx)
    expect(stockUnitsOf(s.house, 'm1_rifle')).toBe(0)
    const t = withDepot('stock-contract')
    t.market.contracts = [contract({ quantity: 1_000_000 })]
    for (const l of allLines(t.house)) {
      l.assignedContractId = null
    }
    production(ctxFor(t).ctx)
    // båda linjerna tilldelades kontraktet (en kontraktsrad kan bara ha en linje: den ena bygger kontraktet, den andra är fri och bygger lager)
    expect(allLines(t.house).filter((l) => l.assignedContractId !== null)).toHaveLength(1)
  })

  it('depåns plats begränsar lagret (bokfört värde) och en depå på nivå 2 rymmer mer', () => {
    const s = withDepot('stock-cap')
    s.house.standingOrders.stock!.m1_rifle!.targetUnits = 100_000
    expect(stockCapacity(s.house)).toBe(CAP[0])
    for (let i = 0; i < 12; i++) {
      s.meta.turn += 1
      production(ctxFor(s, `cap-${i}`).ctx)
    }
    expect(stockValue(s.house)).toBeLessThanOrEqual(CAP[0]!)
    s.house.works[3]!.level = 2
    expect(stockCapacity(s.house)).toBe(CAP[1])
    const none = createInitialState('indochina-slice', 'no-depot')
    expect(stockCapacity(none.house)).toBe(0)
  })
})

describe('ur lagret och lagrets pris (P175)', () => {
  it('ett nyvunnet kontrakt fylls ur depån: en leverans anländer nästa kvartal, lagret och dess bokförda värde minskar i proportion', () => {
    const s = withDepot('stock-deliver')
    s.house.stock = [{ productId: 'm1_rifle', designId: null, units: 200, bookValue: 20_000, generation: 0, builtTurn: 0 }]
    const { ctx, emitted } = ctxFor(s)
    const c = contract({ quantity: 120 })
    s.market.contracts.push(c)
    deliverFromStock(ctx, c)
    expect(s.market.shipments).toEqual([{ id: 'shipment-contract-test-0-stock', contractId: c.id, units: 120, arrivalTurn: s.meta.turn + B.stockDeliveryTurns }])
    expect(s.house.stock![0]).toMatchObject({ units: 80, bookValue: 8_000 })
    expect(emitted.some((e) => e.headline.includes('THE WHOLE ORDER FROM STOCK'))).toBe(true)
    // ett kontrakt större än lagret får det som finns; resten tillverkas
    const big = contract({ id: 'contract-test-1', quantity: 500 })
    deliverFromStock(ctxFor(s).ctx, big)
    expect(s.market.shipments.at(-1)).toMatchObject({ contractId: 'contract-test-1', units: 80 })
    expect(s.house.stock).toBeUndefined()
  })

  it('en annan konstruktion eller produkt tas inte ur lagret', () => {
    const s = withDepot('stock-other')
    s.house.stock = [{ productId: 'm1_rifle', designId: null, units: 50, bookValue: 5_000, generation: 0, builtTurn: 0 }]
    deliverFromStock(ctxFor(s).ctx, contract({ productId: 'm1_mortar' }))
    deliverFromStock(ctxFor(s).ctx, contract({ designId: 'design-x' }))
    expect(s.market.shipments).toHaveLength(0)
    expect(stockUnitsOf(s.house, 'm1_rifle')).toBe(50)
  })

  it('lagret kostar en andel av bokfört värde per kvartal i de fasta kostnaderna', () => {
    const s = withDepot('stock-holding')
    const before = computeFixedCostsBreakdown(s.house, 0)
    expect(before.stockHolding).toBe(0)
    s.house.stock = [{ productId: 'm1_rifle', designId: null, units: 50, bookValue: 1_000_000, generation: 0, builtTurn: 0 }]
    expect(stockHolding(s.house)).toBe((1_000_000 * B.stockHoldingPctPerQuarter) / 100)
    expect(computeFixedCostsBreakdown(s.house, 0).stockHolding).toBe(20_000)
  })

  it('lagret åldras när blockets generation stiger: bokfört värde faller stockAgingPerGeneration per steg', () => {
    const s = withDepot('stock-aging')
    const category = getProduct('m1_rifle').category
    s.house.stock = [{ productId: 'm1_rifle', designId: null, units: 50, bookValue: 1_000_000, generation: s.race.generation.west[category], builtTurn: 0 }]
    const { ctx, emitted } = ctxFor(s)
    advanceStock(ctx)
    expect(stockValue(s.house)).toBe(1_000_000) // ingen ny generation än
    s.race.generation.west[category] += 2
    advanceStock(ctx)
    expect(stockValue(s.house)).toBe(Math.round(1_000_000 * Math.pow(1 - B.stockAgingPerGeneration / 100, 2)))
    expect(emitted.some((e) => e.headline.includes('AGE'))).toBe(true)
    advanceStock(ctx) // en gång värderat är det värderat
    expect(stockValue(s.house)).toBe(Math.round(1_000_000 * Math.pow(1 - B.stockAgingPerGeneration / 100, 2)))
  })

  it('en depå som håller lager kan inte säljas', () => {
    const s = withDepot('stock-sell')
    s.house.stock = [{ productId: 'm1_rifle', designId: null, units: 5, bookValue: 500, generation: 0, builtTurn: 0 }]
    expect(validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'SELL', facilityId: 'works-9' })).toMatchObject({ ok: false, reason: expect.stringContaining('holds stock') })
    delete s.house.stock
    expect(validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'SELL', facilityId: 'works-9' })).toEqual({ ok: true })
  })

  it('kostnaden per enhet i lagret är produktens styckkostnad', () => {
    const s = withDepot('stock-cost')
    production(ctxFor(s).ctx)
    const item = s.house.stock![0]!
    const unit = computeUnitCostNow(getProduct('m1_rifle'), 'A', s.market.commodities)
    expect(item.bookValue / item.units).toBeCloseTo(unit, 0)
  })
})
