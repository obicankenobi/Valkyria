// worksPolicy.test.ts — P182 (ETAPP11_FORSLAG.md §9): hur `human` sköter verken, och de fem varianterna. Reglerna är enkla och ska vara läsbara: grindade bud, driftsorder, bygge och plan.
import { describe, expect, it } from 'vitest'
import { allLines, assemblyWorks, createInitialState, getProduct, officialId, resolveTurn } from '@seventh-front/core'
import type { Contract, GameState, Order } from '@seventh-front/core'
import { POLICIES, human } from '../src/policies.js'
import { DEFAULT_WORKS, buildLineAction, fitsCapacity, withPendingBids, worksStandingOrders } from '../src/worksPolicy.js'
import { runGame } from '../src/runGame.js'

const fresh = (seed = 'works-policy'): GameState => {
  const state = createInitialState('indochina-slice', seed)
  state.market.openOrders = []
  return state
}

function order(state: GameState, over: Partial<Order> = {}): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-1', buyerId, productId: '105mm_field_gun', quantity: 40, statedBudget: 5_000_000, trueBudget: 8_000_000, referencePrice: 4_000_000, requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 1, competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0, ...over,
  }
}

const bid = (o: Order) => ({ orderId: o.id, price: 3_000_000, deliveryTurns: o.requiredDeliveryTurns, grade: 'A' as const, bribe: 0 })

describe('bud grindade av "ready by"', () => {
  it('en order som hinner med dagens plan släpps igenom, en som inte hinner gör det inte', () => {
    const state = fresh()
    const ok = order(state)
    const tooBig = order(state, { id: 'order-2', quantity: 9000, requiredDeliveryTurns: 2 })
    state.market.openOrders = [ok, tooBig]
    expect(fitsCapacity(state, [], bid(ok))).toBe(true)
    expect(fitsCapacity(state, [], bid(tooBig))).toBe(false)
  })

  it('buden som redan lagts den här turen räknas in: kön växer, och till slut hinner en order inte längre', () => {
    const state = fresh()
    const perLine = getProduct('105mm_field_gun').unitsPerLineTurn * 2
    const orders = Array.from({ length: 10 }, (_, i) => order(state, { id: `order-${i}`, quantity: perLine }))
    state.market.openOrders = orders
    const accepted: ReturnType<typeof bid>[] = []
    for (const o of orders) {
      const b = bid(o)
      if (fitsCapacity(state, accepted, b)) accepted.push(b)
    }
    expect(accepted.length).toBeGreaterThanOrEqual(1)
    expect(accepted.length).toBeLessThan(orders.length)
    // utan hänsyn till redan lagda bud hade varje order för sig fått plats
    expect(orders.every((o) => fitsCapacity(state, [], bid(o)))).toBe(true)
  })

  it('withPendingBids lägger buden som väntande kontrakt utan att röra originalet', () => {
    const state = fresh()
    const o = order(state)
    state.market.openOrders = [o]
    const before = state.market.contracts.length
    const next = withPendingBids(state, [bid(o)])
    expect(next.market.contracts).toHaveLength(before + 1)
    expect(state.market.contracts).toHaveLength(before)
    expect(withPendingBids(state, [])).toBe(state)
  })
})

describe('drift', () => {
  it('underhållet höjs när skicket sjunker under 70 och går tillbaka till normalt från 90', () => {
    const state = fresh()
    const works = assemblyWorks(state.house)[0]!
    works.condition = 60
    expect(worksStandingOrders(state, DEFAULT_WORKS)).toContainEqual({ kind: 'MAINTENANCE', facilityId: works.id, level: 'high' })
    state.house.standingOrders.maintenance = { [works.id]: { level: 'high', sinceTurn: 0 } }
    works.condition = 95
    expect(worksStandingOrders(state, DEFAULT_WORKS)).toContainEqual({ kind: 'MAINTENANCE', facilityId: works.id, level: 'normal' })
    works.condition = 80 // däremellan: ingen ändring
    expect(worksStandingOrders(state, DEFAULT_WORKS).some((c) => c.kind === 'MAINTENANCE')).toBe(false)
  })

  it('en strejk besvaras: ge med sig när kassan tål det, annars bryt den', () => {
    const rich = fresh()
    const w1 = assemblyWorks(rich.house)[0]!
    w1.status = 'strike'
    w1.strike = { sinceTurn: 0 }
    expect(worksStandingOrders(rich, DEFAULT_WORKS)).toContainEqual({ kind: 'WORKFORCE', op: 'STRIKE', facilityId: w1.id, response: 'concede' })
    const poor = fresh()
    const w2 = assemblyWorks(poor.house)[0]!
    w2.status = 'strike'
    w2.strike = { sinceTurn: 0 }
    poor.house.treasury = 500_000
    expect(worksStandingOrders(poor, DEFAULT_WORKS)).toContainEqual({ kind: 'WORKFORCE', op: 'STRIKE', facilityId: w2.id, response: 'break' })
  })
})

describe('bygge', () => {
  const trangt = (state: GameState) => {
    for (const l of allLines(state.house)) l.status = 'running'
  }

  it('static bygger aldrig, och ger inga linjer', () => {
    const state = fresh()
    state.house.treasury = 20_000_000
    trangt(state)
    const staticWorks = { ...DEFAULT_WORKS, style: 'static' as const }
    expect(worksStandingOrders(state, staticWorks).filter((c) => c.kind === 'WORKS')).toEqual([])
    expect(buildLineAction(state, staticWorks)).toEqual([])
  })

  it('steady bygger ut verket när det är trångt och kassan tål det — och inte annars', () => {
    const state = fresh()
    state.house.treasury = 20_000_000
    expect(worksStandingOrders(state, DEFAULT_WORKS).filter((c) => c.kind === 'WORKS')).toEqual([]) // inte trångt
    trangt(state)
    const works = assemblyWorks(state.house)[0]!
    expect(worksStandingOrders(state, DEFAULT_WORKS)).toContainEqual({ kind: 'WORKS', op: 'EXPAND', facilityId: works.id })
    state.house.treasury = 600_000 // under reserven och under husets fasta kostnader för två kvartal: inte ens med lån
    expect(worksStandingOrders(state, DEFAULT_WORKS).filter((c) => c.kind === 'WORKS')).toEqual([])
  })

  it('ett bygge i taget', () => {
    const state = fresh()
    state.house.treasury = 20_000_000
    trangt(state)
    const works = assemblyWorks(state.house)[0]!
    works.build = { toLevel: 2, startTurn: 0, turnsTotal: 3, turnsLeft: 2, costTotal: 1_100_000, costPerTurn: 366_666, forced: false }
    expect(worksStandingOrders(state, DEFAULT_WORKS).filter((c) => c.kind === 'WORKS')).toEqual([])
  })

  it('den breda varianten bygger ett monteringsverk i en saknad kategori så fort en order visar den och kassan tål det, trångt eller inte', () => {
    const state = fresh()
    state.house.treasury = 20_000_000
    state.market.openOrders = [order(state, { productId: 'm3_apc', quantity: 10 })] // liten: den mjuka spärren låser den inte, så steady-varianten har ingen anledning att bygga
    state.house.techLevel.armour = 9
    const broad = { ...DEFAULT_WORKS, categories: 'broad' as const }
    expect(worksStandingOrders(state, broad)).toContainEqual({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour' })
    expect(worksStandingOrders(state, DEFAULT_WORKS).some((c) => c.kind === 'WORKS' && c.op === 'BUILD')).toBe(false)
  })
})

describe('plan och utläggning', () => {
  const contract = (over: Partial<Contract> = {}): Contract => ({
    id: 'contract-order-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...over,
  })

  it('ett väntande kontrakt läggs på en ledig linje som redan är uppsatt för produkten', () => {
    const state = fresh()
    const [l1] = allLines(state.house)
    l1!.tooling = { productId: '105mm_field_gun' as never, designId: null }
    // linje 2 upptagen så att kontraktet inte redan står på en linje
    state.market.contracts = [contract()]
    const orders = worksStandingOrders(state, DEFAULT_WORKS)
    expect(orders).toContainEqual({ kind: 'PLAN', op: 'SET', lineId: l1!.id, contractIds: ['contract-order-1'] })
  })

  it('utan en matchande uppsättning planeras inget', () => {
    const state = fresh()
    state.market.contracts = [contract()]
    expect(worksStandingOrders(state, DEFAULT_WORKS).filter((c) => c.kind === 'PLAN')).toEqual([])
  })

  it('outsource-varianten lägger ut 50 % av ett väntande kontrakt i stället för att planera', () => {
    const state = fresh()
    state.market.contracts = [contract()]
    const orders = worksStandingOrders(state, { ...DEFAULT_WORKS, style: 'static', gate: 'none', outsource: true })
    expect(orders).toContainEqual({ kind: 'OUTSOURCE', op: 'SET', contractId: 'contract-order-1', sharePct: 50 })
    expect(orders.some((c) => c.kind === 'PLAN')).toBe(false)
  })
})

describe('varianterna och kolumnerna', () => {
  it('alla fem varianter finns och skickar ett giltigt inlägg mot ett nytt parti', () => {
    for (const name of ['human-static', 'human-builder', 'human-outsource', 'human-specialist', 'human-broad']) {
      const state = createInitialState('indochina-slice', `variant-${name}`)
      const result = resolveTurn(state, POLICIES[name]!(state))
      expect(result.rejected, name).toEqual([])
    }
  })

  it('human-classic och human-plain har ingen verksskötsel (som före etapp 11)', () => {
    const state = fresh()
    expect(POLICIES['human-classic']!(state).standingOrders.some((c) => c.kind === 'WORKS' || c.kind === 'MAINTENANCE' || c.kind === 'PLAN')).toBe(false)
    expect(human(state)).toBeTruthy()
  })

  it('runGame ger verkskolumnerna: en bot som aldrig bygger har inga byggen, en som bygger har dem, och talen hänger ihop', () => {
    const none = runGame('indochina-slice', 'cols-static', 'human-static', POLICIES['human-static']!)
    expect(none.worksBuilt).toBe(0)
    expect(none.worksBuiltKinds).toBe('')
    expect(none.worksExpansions).toBe(0)
    expect(none.outsourcedSharePct).toBeGreaterThanOrEqual(0)
    expect(none.outsourcedSharePct).toBeLessThanOrEqual(100)
    expect(none.operatingDecisionPct).toBeGreaterThanOrEqual(0)
    expect(none.operatingDecisionPct).toBeLessThanOrEqual(100)
    const again = runGame('indochina-slice', 'cols-static', 'human-static', POLICIES['human-static']!)
    expect(again).toEqual(none)
    // en bot som bygger: över några frön bygger minst ett parti något (utbyggnad eller nytt verk)
    const builds = Array.from({ length: 6 }, (_, i) => runGame('indochina-slice', `cols-builder-${i}`, 'human-builder', POLICIES['human-builder']!))
    expect(builds.some((g) => g.worksExpansions > 0 || g.worksBuilt > 0)).toBe(true)
    for (const g of builds) expect(g.worksBuiltKinds === '' || /^[a-z]+:\d+(\|[a-z]+:\d+)*$/.test(g.worksBuiltKinds)).toBe(true)
  })
})

describe('huvudleverantörsregeln (P185, 11O)', () => {
  it('human lägger inget bud där huset saknar ett monteringsverk och ordern är för stor för den mjuka spärren', () => {
    const state = fresh('lead-bot-1')
    const product = getProduct('m3_apc')
    const big = order(state, { id: 'order-big', productId: 'm3_apc', quantity: product.unitsPerLineTurn * 10, referencePrice: 8_000_000, trueBudget: 12_000_000 })
    const mine = order(state, { id: 'order-gun' })
    state.market.openOrders = [big, mine]
    state.house.techLevel.armour = 9
    const bids = human(state).bids
    expect(bids.some((b) => b.orderId === 'order-big')).toBe(false)
  })

  it('en bot bygger ett monteringsverk där flest ordrar går den förbi (störst sammanlagt referenspris), inte där det redan finns ett verk', () => {
    const state = fresh('lead-bot-2')
    state.house.treasury = 40_000_000
    state.house.techLevel.armour = 9
    state.house.techLevel.naval = 9
    const product = getProduct('m3_apc')
    const big = order(state, { id: 'order-apc', productId: 'm3_apc', quantity: product.unitsPerLineTurn * 10, referencePrice: 9_000_000, trueBudget: 12_000_000 })
    const gun = order(state, { id: 'order-gun2', productId: '105mm_field_gun', quantity: 400, referencePrice: 20_000_000, trueBudget: 30_000_000 })
    state.market.openOrders = [big, gun]
    const orders = worksStandingOrders(state, DEFAULT_WORKS)
    const build = orders.find((o) => o.kind === 'WORKS' && o.op === 'BUILD')
    expect(build).toMatchObject({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour' })
  })
})

describe('byggnadslån (P185, 11Q)', () => {
  it('räcker kassan inte för bygget kontant men för en kontant del av första raten tar boten byggnadslån, annars kontant', () => {
    const rich = fresh('loan-bot-rich')
    rich.house.treasury = 40_000_000
    rich.house.techLevel.armour = 9
    const product = getProduct('m3_apc')
    rich.market.openOrders = [order(rich, { id: 'order-apc', productId: 'm3_apc', quantity: product.unitsPerLineTurn * 10, referencePrice: 9_000_000, trueBudget: 12_000_000 })]
    const cash = worksStandingOrders(rich, DEFAULT_WORKS).find((o) => o.kind === 'WORKS' && o.op === 'BUILD')
    expect(cash).toMatchObject({ kind: 'WORKS', op: 'BUILD', category: 'armour' })
    expect((cash as { financing?: string }).financing).toBeUndefined()

    const tight = fresh('loan-bot-tight')
    tight.house.treasury = 1_500_000 // under reserven (25 % av grundkapitalet + två kvartals fasta kostnader) men över de fasta kostnaderna efter den kontanta delen
    tight.house.techLevel.armour = 9
    tight.market.openOrders = [order(tight, { id: 'order-apc', productId: 'm3_apc', quantity: product.unitsPerLineTurn * 10, referencePrice: 9_000_000, trueBudget: 12_000_000 })]
    const loan = worksStandingOrders(tight, DEFAULT_WORKS).find((o) => o.kind === 'WORKS' && o.op === 'BUILD')
    expect(loan).toMatchObject({ kind: 'WORKS', op: 'BUILD', category: 'armour', financing: 'loan' })
  })
})
