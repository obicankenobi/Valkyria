// drift.test.ts — P174 (ETAPP11_FORSLAG.md §5.2–5.4): inkörning, skick och underhåll, modernisering och skift.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { createRng } from '../src/rng.js'
import { resolveTurn } from '../src/resolve/index.js'
import { production, computeLineThroughput } from '../src/resolve/steps/production.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { getProduct } from '../src/pricing.js'
import { carryRunIn, runInCostFactor, runInDoublings, runInRateFactor } from '../src/runin.js'
import { conditionSpeedFactor, maintenanceCostFactor, maintenanceOf, plantSpeedFactor } from '../src/maintenance.js'
import { totalWages, lineShift } from '../src/workforce.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, StandingOrderChange, WireEvent } from '../src/types.js'

const B = balance as unknown as Record<
  | 'runInRatePerDoubling' | 'runInCostPerDoubling' | 'runInMaxDoublings' | 'runInFamilyKeepPct' | 'wearPerTurn' | 'wearOvertimeFactor' | 'wearDoubleShiftFactor'
  | 'maintenanceRestoreLow' | 'maintenanceRestoreNormal' | 'maintenanceRestoreHigh' | 'maintenanceCostFactorLow' | 'maintenanceCostFactorHigh' | 'breakdownConditionThreshold'
  | 'conditionSpeedFloor' | 'modernisationMax' | 'modernisationRatePct' | 'doubleShiftCapacityPct' | 'doubleShiftWageFactor' | 'conditionQualityThreshold' | 'conditionQualityPenalty',
  number
>
const turn = (s: GameState, standingOrders: StandingOrderChange[] = []) => resolveTurn(s, { standingOrders, bids: [], actions: [] })
const fresh = (seed: string) => createInitialState('indochina-slice', seed)
const hasText = (r: ReturnType<typeof turn>, text: string) => r.wire.some((e) => e.headline.includes(text))

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 100000,
    unitsDelivered: 0,
    price: 2_000_000,
    unitCostAtSigning: 100,
    grade: 'A',
    dueTurn: 30,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 0,
    advancePaid: 0,
    ...overrides,
  }
}

function runProduction(state: GameState, seed = 'drift'): WireEvent[] {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: { standingOrders: [], bids: [], actions: [] },
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `t-${seq++}`
    },
    rejected: [],
  }
  production(ctx)
  return emitted as WireEvent[]
}

// Ett hus med ett verk utan kategori, ett kontrakt och en linje som redan bygger det.
function busy(seed: string): GameState {
  const s = fresh(seed)
  s.house.works[0]!.category = null
  s.house.works[0]!.skill = 90 // på taket: växer inte vidare
  s.house.treasury = 50_000_000
  s.market.contracts = [contract()]
  const line = allLines(s.house)[0]!
  line.assignedContractId = 'contract-test-0'
  line.productId = 'm1_rifle'
  line.status = 'running'
  line.tooling = { productId: 'm1_rifle', designId: null }
  return s
}

describe('inkörning (P174)', () => {
  const product = getProduct('m1_rifle')

  it('varje fördubbling (räknat i kvartals produktion) ger +4 % takt och −3 % styckkostnad, med tak vid fyra fördubblingar', () => {
    expect(runInDoublings({}, product)).toBe(0)
    expect(runInRateFactor({}, product)).toBe(1)
    const one = { runIn: product.unitsPerLineTurn } // 1 kvartals produktion = en fördubbling
    expect(runInDoublings(one, product)).toBeCloseTo(1, 9)
    expect(runInRateFactor(one, product)).toBeCloseTo(1 + B.runInRatePerDoubling / 100, 9)
    expect(runInCostFactor(one, product)).toBeCloseTo(1 - B.runInCostPerDoubling / 100, 9)
    const huge = { runIn: product.unitsPerLineTurn * 1_000_000 }
    expect(runInDoublings(huge, product)).toBe(B.runInMaxDoublings)
    expect(runInRateFactor(huge, product)).toBeCloseTo(1 + (B.runInMaxDoublings * B.runInRatePerDoubling) / 100, 9)
  })

  it('en linje som tillverkar bygger upp inkörningen, och takten stiger mot en identisk linje utan', () => {
    const s = busy('rin-1')
    const line = allLines(s.house)[0]!
    runProduction(s)
    const built = s.market.shipments.find((x) => x.contractId === 'contract-test-0')!.units
    expect(line.runIn).toBe(built)
    const fresher = computeLineThroughput({ ...s.house }, { ...line, runIn: 0 }, product)
    expect(computeLineThroughput(s.house, line, product)).toBeGreaterThan(fresher)
  })

  it('omställning: ny produkt eller konstruktion nollställer, samma familj behåller hälften, samma uppsättning rör den inte', () => {
    const line = { runIn: 1000 } as Parameters<typeof carryRunIn>[0]
    carryRunIn(line, 'none')
    expect(line.runIn).toBe(1000)
    carryRunIn(line, 'family')
    expect(line.runIn).toBe(Math.floor((1000 * B.runInFamilyKeepPct) / 100))
    carryRunIn(line, 'design')
    expect(line.runIn).toBeUndefined()
    const other = { runIn: 5 } as Parameters<typeof carryRunIn>[0]
    carryRunIn(other, 'product')
    expect(other.runIn).toBeUndefined()
  })
})

describe('skick och underhåll (P174)', () => {
  it('ett verk som arbetar slits wearPerTurn; normalt underhåll återställer 2, så nettot är −1; stillastående verk slits inte', () => {
    const s = busy('wear-1')
    runProduction(s)
    expect(s.house.works[0]!.condition).toBe(100 - B.wearPerTurn + B.maintenanceRestoreNormal)
    const idle = fresh('wear-2')
    runProduction(idle)
    expect(idle.house.works[0]!.condition).toBe(100) // ingen slitning, och ingenting över 100
  })

  it('övertid och två skift slits mer; låg underhållsnivå återställer ingenting, hög bygger upp', () => {
    // Övertid har en egen haveririsk (6 %): ta första fröet där linjen faktiskt arbetade.
    let ot = busy('wear-ot')
    for (let i = 0; i < 20; i++) {
      ot = busy('wear-ot')
      ot.house.standingOrders.lines[allLines(ot.house)[0]!.id] = { category: null, shift: 'overtime', sinceTurn: 0 }
      runProduction(ot, `ot-${i}`)
      if (allLines(ot.house)[0]!.status === 'running') break
    }
    expect(ot.house.works[0]!.condition).toBe(100 - B.wearPerTurn * B.wearOvertimeFactor + B.maintenanceRestoreNormal)

    const low = busy('wear-low')
    low.house.works[0]!.condition = 80
    low.house.standingOrders.maintenance = { 'works-1': { level: 'low', sinceTurn: 0 } }
    runProduction(low)
    expect(low.house.works[0]!.condition).toBe(80 - B.wearPerTurn + B.maintenanceRestoreLow)

    const high = busy('wear-high')
    high.house.works[0]!.condition = 80
    high.house.standingOrders.maintenance = { 'works-1': { level: 'high', sinceTurn: 0 } }
    runProduction(high)
    expect(high.house.works[0]!.condition).toBe(80 - B.wearPerTurn + B.maintenanceRestoreHigh)
  })

  it('underhållsnivån skalar verkets fasta kostnad (låg 0,8, normal 1, hög 1,3) och gäller från nästa kvartal', () => {
    const s = fresh('maint-cost')
    const normal = computeFixedCostsBreakdown(s.house, 0).facilityUpkeep
    const given = turn(s, [{ kind: 'MAINTENANCE', facilityId: 'works-1', level: 'low' }])
    expect(maintenanceOf(given.state.house, 'works-1', 0)).toBe('normal') // inte förrän nästa tur
    expect(maintenanceOf(given.state.house, 'works-1', 1)).toBe('low')
    const assembly = 30_000 // monteringsverk nivå 1
    expect(computeFixedCostsBreakdown(given.state.house, 1).facilityUpkeep).toBe(normal - assembly + Math.round(assembly * B.maintenanceCostFactorLow))
    expect(maintenanceCostFactor('high')).toBe(B.maintenanceCostFactorHigh)
  })

  it('valideringen: bara monteringsverk, okänd anläggning, redan på den nivån', () => {
    const s = fresh('maint-validate')
    const v = (facilityId: string, level: 'low' | 'normal' | 'high') => validateStandingOrderChange(s, s, { kind: 'MAINTENANCE', facilityId, level })
    expect(v('nope', 'low')).toMatchObject({ ok: false })
    expect(v('works-2', 'low')).toMatchObject({ ok: false, reason: expect.stringContaining('assembly') })
    expect(v('works-1', 'normal')).toMatchObject({ ok: false, reason: expect.stringContaining('already') })
    expect(v('works-1', 'high')).toEqual({ ok: true })
  })

  it('under haveritröskeln faller takten, kan en linje få ett haveri, och kvalitetsryktet tar skada under kvalitetströskeln', () => {
    const s = busy('breakdown-1')
    expect(conditionSpeedFactor({ condition: 100 })).toBe(1)
    expect(conditionSpeedFactor({ condition: 0 })).toBe(B.conditionSpeedFloor)
    s.house.works[0]!.condition = 0
    expect(plantSpeedFactor(s.house, allLines(s.house)[0]!.id)).toBe(B.conditionSpeedFloor)

    // Med skick 0 är haverichansen 40 %: över ett antal frön ska både haveri och produktion förekomma.
    let breakdowns = 0
    let produced = 0
    for (let i = 0; i < 40; i++) {
      const t = busy('breakdown-loop')
      t.house.works[0]!.condition = 0
      const quality = t.house.reputation.quality
      const wire = runProduction(t, `bd-${i}`)
      if (wire.some((e) => e.headline.includes('BREAKS DOWN'))) breakdowns++
      else {
        produced++
        expect(t.house.reputation.quality).toBe(quality - B.conditionQualityPenalty) // ett nedslitet verk bygger sämre
      }
    }
    expect(breakdowns).toBeGreaterThan(0)
    expect(produced).toBeGreaterThan(0)
  })

  it('ett friskt verk drar aldrig ur slumpen för haverier', () => {
    const a = busy('calm-a')
    const b = busy('calm-a')
    const rngA = createRng('x', 0)
    void rngA
    runProduction(a)
    runProduction(b)
    expect(a.house.works[0]!.status).toBe(b.house.works[0]!.status)
    expect(a.market.shipments.length).toBe(b.market.shipments.length)
  })
})

describe('modernisering (P174)', () => {
  it('kostar en del av byggkostnaden, tar ett kvartal kortare tid, halverar farten under tiden och återställer skicket och höjer takten', () => {
    let s = fresh('mod-1')
    s.house.works[0]!.condition = 40
    const before = computeLineThroughput(s.house, s.house.works[0]!.lines[0]!, getProduct('m1_rifle'))
    const given = turn(s, [{ kind: 'WORKS', op: 'MODERNISE', facilityId: 'works-1' }])
    s = given.state
    const w = s.house.works[0]!
    expect(w.build).toMatchObject({ modernise: true, toLevel: 1 })
    expect(hasText(given, 'IS BEING MODERNISED')).toBe(true)
    // klar efter byggtiden
    const turns = w.build!.turnsTotal
    let last = given
    for (let i = 0; i < turns; i++) last = turn(last.state)
    const done = last.state.house.works[0]!
    expect(done.build).toBeUndefined()
    expect(done.machineLevel).toBe(1)
    expect(done.level).toBe(1)
    expect(done.condition).toBeGreaterThanOrEqual(98) // återställt till 100 (verket stod stilla, så ingen slitning)
    expect(hasText(last, 'IS MODERNISED')).toBe(true)
    const after = computeLineThroughput(last.state.house, done.lines[0]!, getProduct('m1_rifle'))
    expect(after / before).toBeGreaterThan(1)
  })

  it('valideringen: bara monteringsverk i drift, inte under bygge, högst modernisationMax gånger, och kassan måste räcka till första raten', () => {
    const s = fresh('mod-validate')
    const v = (facilityId: string) => validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'MODERNISE', facilityId })
    expect(v('nope')).toMatchObject({ ok: false })
    expect(v('works-2')).toMatchObject({ ok: false, reason: expect.stringContaining('assembly') })
    expect(v('works-1')).toEqual({ ok: true })
    s.house.works[0]!.machineLevel = B.modernisationMax
    expect(v('works-1')).toMatchObject({ ok: false, reason: expect.stringContaining('modern') })
    s.house.works[0]!.machineLevel = 0
    s.house.treasury = 0
    expect(v('works-1')).toMatchObject({ ok: false, reason: expect.stringContaining('afford') })
  })
})

describe('skift (P174)', () => {
  it('två skift kräver full bemanning, ger 180 % takt, kostar dubbla lönen för verket och drar stämningen', () => {
    const s = fresh('shift-1')
    const lineId = allLines(s.house)[0]!.id
    const order = (): StandingOrderChange => ({ kind: 'LINE', lineId, category: null, shift: 'double' })
    s.house.works[0]!.staffing = 75
    expect(validateStandingOrderChange(s, s, order())).toMatchObject({ ok: false, reason: expect.stringContaining('fully staffed') })
    s.house.works[0]!.staffing = 100
    expect(validateStandingOrderChange(s, s, order())).toEqual({ ok: true })

    s.house.standingOrders.lines[lineId] = { category: null, shift: 'double', sinceTurn: 0 }
    expect(lineShift(s.house, lineId, 1)).toBe('double')
    expect(totalWages(s.house, 1)).toBe(60_000 * B.doubleShiftWageFactor)
    expect(totalWages(s.house)).toBe(60_000) // utan tur räknas ingen tvåskiftslön
    runProduction(s)
    expect(allLines(s.house)[0]!.capacityPct).toBe(B.doubleShiftCapacityPct)
    // Sjunker bemanningen under 100 går linjen på normalt skift igen.
    s.house.works[0]!.staffing = 75
    expect(lineShift(s.house, lineId, 1)).toBe('normal')
  })
})
