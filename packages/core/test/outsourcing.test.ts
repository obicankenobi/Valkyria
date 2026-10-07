// outsourcing.test.ts — P172 (ETAPP11_FORSLAG.md §4.2, §5.5, beslut 11E/11L): underleverantörer, verkens kategori och rivalernas kapacitet. Ett kontrakt (eller en del av det) kan läggas
// ut: dyrare per enhet, ingen inkörning, kvalitet i underkant, kan bli sen, och den som lägger ut för mycket föder en konkurrent. Ett verk med en kategori bygger bara den kategorin —
// ett kontrakt inget verk kan bygga läggs ut av huset självt, så att det inte blir liggande.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { production } from '../src/resolve/steps/production.js'
import { createRng } from '../src/rng.js'
import { computeUnitCostNow, getProduct } from '../src/pricing.js'
import { OUTSOURCE_SHARES, canBuildHere, outsourceTarget, ownRemaining, rivalLoadMarkup, runSubcontractors, subcontractorRivalId } from '../src/outsourcing.js'
import { subcontractCostFactorFor } from '../src/leadSupplier.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  subcontractUnitsFactor: number
  subcontractCostFactor: number
  subcontractDelayChancePct: number
  subcontractQualityPenalty: number
  subcontractRivalThreshold: number
  rivalCapacityContracts: number
  rivalFullPriceMarkupPct: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function ctxFor(state: GameState, seed = 'outsource'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  return { ctx: { state, draft: state, submission: EMPTY, rng: createRng(seed, 0), emit: (e) => (emitted.push(e), `o-${seq++}`), rejected: [] }, emitted }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: 'm3_apc', quantity: 30, unitsDelivered: 0, price: 6_000_000, unitCostAtSigning: 100_000, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}
const fresh = (seed: string) => createInitialState('indochina-slice', seed)

describe('verkets kategori (§4.2)', () => {
  it('startverket bygger artilleri: det kan bygga en kanon men inte en pansarvagn', () => {
    const s = fresh('cat-1')
    expect(canBuildHere(s.house, getProduct('105mm_field_gun'))).toBe(true)
    expect(canBuildHere(s.house, getProduct('m3_apc'))).toBe(false)
  })

  it('ett verk utan kategori (migrerat) bygger allt', () => {
    const s = fresh('cat-2')
    s.house.works[0]!.category = null
    expect(canBuildHere(s.house, getProduct('m3_apc'))).toBe(true)
  })

  it('en linje tar bara kontrakt i verkets kategori — en kanon går till linjen, en pansarvagn blir liggande tills den läggs ut', () => {
    const s = fresh('cat-3')
    s.market.contracts = [contract({ id: 'apc', productId: 'm3_apc' }), contract({ id: 'gun', productId: '105mm_field_gun', quantity: 100 })]
    production(ctxFor(s).ctx)
    const assigned = allLines(s.house).map((l) => l.assignedContractId)
    expect(assigned).toContain('gun')
    expect(assigned).not.toContain('apc')
  })

  it('ett nybyggt monteringsverk i en annan kategori kan bygga den (och verkets linjer tar den)', () => {
    const s = fresh('cat-4')
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'armour', lines: [{ ...allLines(s.house)[0]!, id: 'line-9' }] })
    expect(canBuildHere(s.house, getProduct('m3_apc'))).toBe(true)
    s.market.contracts = [contract({ id: 'apc', productId: 'm3_apc' })]
    production(ctxFor(s).ctx)
    expect(allLines(s.house).find((l) => l.id === 'line-9')!.assignedContractId).toBe('apc')
    expect(s.market.contracts[0]!.outsource).toBeUndefined()
  })
})

describe('utläggning — automatisk när inget verk kan bygga kategorin', () => {
  it('ett kontrakt i en kategori utan verk läggs ut helt av huset, med en rubrik, och blir inte liggande', () => {
    const s = fresh('auto-1')
    s.market.contracts = [contract()]
    const { ctx, emitted } = ctxFor(s)
    production(ctx)
    expect(s.market.contracts[0]!.outsource).toMatchObject({ sharePct: 100, auto: true, built: expect.any(Number) })
    expect(emitted.some((e) => e.headline.includes('NO WORKS CAN BUILD') && e.headline.includes('GOES TO A SUBCONTRACTOR'))).toBe(true)
    expect(allLines(s.house).every((l) => l.assignedContractId === null)).toBe(true)
  })
})

describe('underleverantörens tillverkning', () => {
  function outsourced(share: number, extra: Partial<Contract> = {}) {
    const s = fresh('sub-1')
    s.house.treasury = 50_000_000
    s.market.contracts = [contract({ id: 'c', outsource: { sharePct: share, auto: false, sinceTurn: 0, built: 0 }, ...extra })]
    return s
  }

  it('hjälpfunktionerna: målet följer andelen, det egna som återstår räknar bort den utlagda delen och underleverantörens leveranser', () => {
    const c = contract({ quantity: 40, outsource: { sharePct: 50, auto: false, sinceTurn: 0, built: 0 } })
    expect(outsourceTarget(c)).toBe(20)
    expect(ownRemaining(c, [])).toBe(20)
    // Underleverantören har byggt 8 (på väg), huset 5 (levererade): det egna som återstår är 20 − 5 = 15
    const c2 = { ...c, unitsDelivered: 5, outsource: { ...c.outsource!, built: 8 } }
    expect(ownRemaining(c2, [{ id: 's', contractId: c.id, units: 8, arrivalTurn: 5 }])).toBe(15)
    expect(ownRemaining(contract({ quantity: 40 }), [])).toBe(40) // ingen utläggning: som förut
  })

  it('en leverans per tur i takten subcontractUnitsFactor × linjens takt, till subcontractCostFactor × styckkostnaden, och kvalitetsryktet sjunker', () => {
    const s = outsourced(100)
    const product = getProduct('m3_apc')
    const rate = Math.max(1, Math.floor(product.unitsPerLineTurn * B.subcontractUnitsFactor))
    const q0 = s.house.reputation.quality
    const t0 = s.house.treasury
    // Slumpen: en seed där underleverantören inte är sen (annars testas fördröjningen nedan).
    let seed = 0
    let ctx: ResolveContext
    let emitted: Omit<WireEvent, 'id' | 'turn'>[]
    do {
      s.market.shipments = []
      s.house.treasury = t0
      s.house.reputation.quality = q0
      s.market.contracts[0]!.outsource!.built = 0
      ;({ ctx, emitted } = ctxFor(s, `sub-seed-${seed++}`))
      runSubcontractors(ctx)
    } while (emitted.some((e) => e.headline.includes('IS DELAYED')) && seed < 50)
    const shipment = s.market.shipments.find((x) => x.contractId === 'c')!
    expect(shipment.units).toBe(Math.min(30, rate))
    expect(s.market.contracts[0]!.outsource!.built).toBe(shipment.units)
    // P185: i den mjuka spärren kostar en utlagd order huset saknar verk för ett påslag till (subcontractCostFactorFor); utan regel är det bara subcontractCostFactor.
    const unitCost = computeUnitCostNow(product, 'A', s.market.commodities) * subcontractCostFactorFor(s.house, product)
    expect(t0 - s.house.treasury).toBe(Math.round(unitCost * shipment.units))
    expect(s.house.reputation.quality).toBe(q0 - B.subcontractQualityPenalty)
    expect(s.ledger.at(-1)!.expenses.production).toBe(Math.round(unitCost * shipment.units))
  })

  it('en delvis utläggning: underleverantören bygger bara sin andel, resten är husets linjers', () => {
    const s = outsourced(50, { productId: '105mm_field_gun', quantity: 100 })
    for (let t = 0; t < 12; t++) {
      s.meta.turn = t
      production(ctxFor(s, `part-${t}`).ctx)
    }
    const c = s.market.contracts[0]!
    expect(c.outsource!.built).toBeLessThanOrEqual(50)
    expect(c.outsource!.built).toBeGreaterThan(0)
    const produced = s.market.shipments.reduce((sum, x) => sum + x.units, 0)
    expect(produced).toBeLessThanOrEqual(100)
    expect(produced - c.outsource!.built).toBeGreaterThan(0) // husets egna linjer bidrog också
  })

  it('en sen underleverantör: ingen leverans den turen, med en rubrik som nämner husets namn på kontraktet', () => {
    const s = outsourced(100)
    let found = false
    for (let seed = 0; seed < 200 && !found; seed++) {
      s.market.shipments = []
      s.market.contracts[0]!.outsource!.built = 0
      const { ctx, emitted } = ctxFor(s, `late-${seed}`)
      runSubcontractors(ctx)
      if (emitted.some((e) => e.headline.includes('IS DELAYED'))) {
        found = true
        expect(s.market.shipments).toEqual([])
        expect(emitted.find((e) => e.headline.includes('IS DELAYED'))!.headline).toContain("THE HOUSE'S NAME")
      }
    }
    expect(found).toBe(true)
  })

  it('utan kassa bygger underleverantören bara det huset har råd med', () => {
    const s = outsourced(100)
    s.house.treasury = 0
    runSubcontractors(ctxFor(s, 'broke').ctx)
    expect(s.market.shipments).toEqual([])
  })
})

describe('underleverantören lär sig (§5.5): för mycket utlagt för länge föder en konkurrent', () => {
  it('när den utlagda kostnaden i en kategori passerat tröskeln blir den en rival, en gång', () => {
    const s = fresh('learn-1')
    s.house.treasury = 100_000_000
    s.house.outsourcedCost = { armour: B.subcontractRivalThreshold - 1 }
    s.market.contracts = [contract({ id: 'c', outsource: { sharePct: 100, auto: false, sinceTurn: 0, built: 0 } })]
    expect(s.rivals[subcontractorRivalId('armour')]).toBeUndefined()
    let seed = 0
    let spawned = false
    while (!spawned && seed < 50) {
      const { ctx, emitted } = ctxFor(s, `learn-${seed++}`)
      runSubcontractors(ctx)
      spawned = emitted.some((e) => e.headline.includes('HAVE LEARNED THE TRADE'))
    }
    expect(spawned).toBe(true)
    expect(s.rivals[subcontractorRivalId('armour')]).toMatchObject({ specialisation: 'armour', temperament: 'opportunist' })
    const before = Object.keys(s.rivals).length
    for (let i = 0; i < 5; i++) runSubcontractors(ctxFor(s, `again-${i}`).ctx)
    expect(Object.keys(s.rivals).length).toBe(before) // inte en andra gång
  })
})

describe('OUTSOURCE — stående order (§5.5)', () => {
  const v = (s: GameState, c: StandingOrderChange) => validateStandingOrderChange(s, s, c)

  it('validering: okänt kontrakt, ogiltig andel, avslutat kontrakt och att återta något som inte är utlagt', () => {
    const s = fresh('os-1')
    s.market.contracts = [contract({ id: 'c' }), contract({ id: 'done', status: 'fulfilled', unitsDelivered: 30 })]
    expect(v(s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'zzz', sharePct: 50 })).toEqual({ ok: false, reason: 'unknown contract' })
    expect(v(s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'c', sharePct: 33 })).toEqual({ ok: false, reason: `outsource ${OUTSOURCE_SHARES.join(', ')} percent` })
    expect(v(s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'done', sharePct: 50 })).toEqual({ ok: false, reason: 'that contract needs no more production' })
    expect(v(s, { kind: 'OUTSOURCE', op: 'CANCEL', contractId: 'c' })).toEqual({ ok: false, reason: 'that contract is not outsourced' })
    expect(v(s, { kind: 'OUTSOURCE', op: 'SET', contractId: 'c', sharePct: 50 })).toEqual({ ok: true })
  })

  it('SET gäller från nästa tur; CANCEL tar tillbaka kontraktet', () => {
    let s = fresh('os-2')
    s.market.contracts = [contract({ id: 'g', productId: '105mm_field_gun', quantity: 100 })]
    const r = resolveTurn(s, { standingOrders: [{ kind: 'OUTSOURCE', op: 'SET', contractId: 'g', sharePct: 50 }], bids: [], actions: [] })
    s = r.state
    expect(s.market.contracts[0]!.outsource).toMatchObject({ sharePct: 50, auto: false, sinceTurn: 1 })
    s = resolveTurn(s, { standingOrders: [{ kind: 'OUTSOURCE', op: 'CANCEL', contractId: 'g' }], bids: [], actions: [] }).state
    const out = s.market.contracts[0]!.outsource
    expect(out === undefined || out.sharePct === 0).toBe(true)
  })
})

describe('rivalernas kapacitet (11L)', () => {
  it('en rival under sin kapacitet bjuder som vanligt; en fullbelagd rival bjuder rivalFullPriceMarkupPct % dyrare', () => {
    expect(rivalLoadMarkup(B.rivalCapacityContracts - 1, B.rivalCapacityContracts, B.rivalFullPriceMarkupPct)).toBe(1)
    expect(rivalLoadMarkup(B.rivalCapacityContracts, B.rivalCapacityContracts, B.rivalFullPriceMarkupPct)).toBeCloseTo(1 + B.rivalFullPriceMarkupPct / 100, 9)
  })
})
