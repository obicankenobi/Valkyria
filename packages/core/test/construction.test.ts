// construction.test.ts — P170 (ETAPP11_FORSLAG.md §4.1, §4.3, §4.4, §3 11B/11C): tomten, byggen med byggtid och rater, utbyggnad, forcering,
// avveckling, markköp och startpaketet. Alla ändringar är stående order (`WORKS`), kostar ingen handling och gäller från nästa tur.
import { describe, expect, it } from 'vitest'
import facilities from '../src/data/facilities.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { allLines, assemblyWorks } from '../src/works.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { computeLineThroughput } from '../src/resolve/steps/production.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import type { Facility, FacilityKind, GameState, StandingOrderChange } from '../src/types.js'

const F = facilities as unknown as {
  plot: { slots: number; landSlots: number; landCost: number }
  forceTimeFactor: number
  forceCostFactor: number
  expansionSpeedPct: number
  sellValuePct: number
  newAssemblyLines: number
  startingInvested: Record<string, number>
  kinds: Record<FacilityKind, { label: string; buildCost: number[]; buildTurns: number[]; fixedCostPerQuarter: number[]; maxCount: number }>
}
const turn = (s: GameState, standingOrders: StandingOrderChange[] = []) => resolveTurn(s, { standingOrders, bids: [], actions: [] })
const ledgerWorks = (s: GameState) => s.ledger.reduce((sum, e) => sum + (e.expenses.works ?? 0), 0)
const fresh = (seed: string) => createInitialState('indochina-slice', seed)

describe('facilities.json (P170) — tomt, byggtid, kostnad och fasta kostnader per slag och nivå', () => {
  it('åtta platser, fyra till att köpa en gång; varje slag har tre nivåer av kostnad, byggtid (2–4 kvartal) och fast kostnad', () => {
    expect(F.plot.slots).toBe(8)
    expect(F.plot.landSlots).toBe(4)
    for (const [kind, k] of Object.entries(F.kinds)) {
      for (const arr of [k.buildCost, k.buildTurns, k.fixedCostPerQuarter]) expect(arr, kind).toHaveLength(3)
      for (const t of k.buildTurns) expect(t, kind).toBeGreaterThanOrEqual(2)
      for (const t of k.buildTurns) expect(t, kind).toBeLessThanOrEqual(4)
      expect(k.maxCount, kind).toBeGreaterThanOrEqual(1)
    }
    expect(F.forceTimeFactor).toBe(0.5)
    expect(F.forceCostFactor).toBe(2)
  })

  it('markköpet är dyrt: mer än halva grundkapitalet', () => {
    expect(F.plot.landCost).toBeGreaterThan(fresh('x').house.foundingCapital / 2)
  })
})

describe('startpaketet (§4.4, 11B)', () => {
  const state = fresh('start-package')
  const house = state.house

  it('ett monteringsverk på nivå 1 med två linjer i den valda kategorin, ett gratis labb i samma kategori och ett ritkontor', () => {
    expect(house.works.map((w) => w.kind)).toEqual(['assembly', 'laboratory', 'design'])
    expect(house.works.every((w) => w.level === 1 && w.status === 'operating')).toBe(true)
    const [assembly, lab, design] = house.works as [Facility, Facility, Facility]
    expect(assembly.lines).toHaveLength(2)
    expect(assembly.category).toBe(house.specialisation)
    expect(lab.category).toBe(house.specialisation)
    expect(design.category).toBeNull()
    expect(lab.invested).toBe(0) // ägarens önskemål: utan byggkostnad
    expect(lab.build).toBeUndefined()
  })

  it('åtta platser på tomten, fem tomma; ingen provplats och ingen depå', () => {
    expect(house.plot).toEqual({ slots: 8, landBought: false })
    expect(house.works.length).toBe(3)
    expect(house.plot.slots - house.works.length).toBe(5)
    expect(house.works.some((w) => w.kind === 'proving' || w.kind === 'depot')).toBe(false)
  })

  it('en vald specialisering styr kategorin', () => {
    const naval = createInitialState('indochina-slice', 'start-naval', { specialisation: 'naval' })
    expect(naval.house.works[0]!.category).toBe('naval')
    expect(naval.house.works[1]!.category).toBe('naval')
  })

  it('anläggningarnas fasta kostnad läggs till lönen och linjernas upphåll', () => {
    const b = computeFixedCostsBreakdown(house)
    const expected = F.kinds.assembly.fixedCostPerQuarter[0]! + F.kinds.laboratory.fixedCostPerQuarter[0]! + F.kinds.design.fixedCostPerQuarter[0]!
    expect(b.facilityUpkeep).toBe(expected)
  })
})

describe('WORKS BUILD — validering (§4.1, §4.2)', () => {
  const ok = (s: GameState, c: StandingOrderChange) => validateStandingOrderChange(s, s, c)

  it('okänt slag, saknad kategori och en kategori där ingen ska vara avvisas', () => {
    const s = fresh('bv-1')
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'castle' as FacilityKind })).toEqual({ ok: false, reason: 'unknown facility kind' })
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly' })).toEqual({ ok: false, reason: 'an assembly works needs a category' })
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot', category: 'armour' })).toEqual({ ok: false, reason: 'a depot has no category' })
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot' })).toEqual({ ok: true })
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour' })).toEqual({ ok: true })
  })

  it('ett laboratorium per kategori, och högsta antal per slag', () => {
    const s = fresh('bv-2')
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'laboratory', category: s.house.specialisation })).toEqual({ ok: false, reason: 'the house already has a laboratory in that category' })
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'design' })).toEqual({ ok: false, reason: 'the house already has the most design offices it may have' })
  })

  it('tomten full avvisar, och den första raten måste finnas i kassan', () => {
    const s = fresh('bv-3')
    s.house.treasury = 10
    expect(ok(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot' })).toEqual({ ok: false, reason: 'cannot afford the first instalment' })
    const full = fresh('bv-4')
    while (full.house.works.length < full.house.plot.slots) {
      full.house.works.push({ ...full.house.works[0]!, id: `works-fill-${full.house.works.length}`, kind: 'component', lines: [], category: null })
    }
    expect(ok(full, { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot' })).toEqual({ ok: false, reason: 'the plot is full' })
  })
})

describe('WORKS BUILD — bygget, raterna och färdigställandet (§4.3)', () => {
  const kind = 'depot' as const
  const k = F.kinds[kind]
  const total = k.buildCost[0]!
  const turns = k.buildTurns[0]!

  it('anläggningen tar en plats direkt, står under byggnad och betalar första raten NÄSTA tur (ingen handling går åt)', () => {
    const s = fresh('b-1')
    const t0 = s.house.treasury
    const r = resolveTurn(s, { standingOrders: [{ kind: 'WORKS', op: 'BUILD', facilityKind: kind }], bids: [], actions: [] })
    expect(r.rejected).toEqual([])
    const depot = r.state.house.works.find((w) => w.kind === kind)!
    expect(depot.status).toBe('under_construction')
    expect(depot.level).toBe(1)
    expect(depot.build).toMatchObject({ toLevel: 1, turnsTotal: turns, turnsLeft: turns, forced: false })
    expect(depot.invested).toBe(0)
    expect(r.state.house.works.length).toBe(4)
    // inget betalades den här turen utöver vanliga kostnader: ingen byggkostnad bokförd ännu
    expect(ledgerWorks(r.state)).toBe(0)
    expect(r.state.house.treasury).toBeGreaterThan(t0 - total)
    expect(r.wire.some((e) => e.headline.includes('BREAKS GROUND') && e.headline.includes(k.label.toUpperCase()))).toBe(true)
  })

  it('betalar lika rater varje kvartal, hela byggkostnaden på slutet, och blir klar efter exakt byggtiden', () => {
    let s = fresh('b-2')
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: kind }]).state
    const paid: number[] = []
    for (let i = 0; i < turns; i++) {
      const before = ledgerWorks(s)
      const r = turn(s)
      s = r.state
      paid.push(ledgerWorks(s) - before)
      const depot = s.house.works.find((w) => w.kind === kind)!
      if (i < turns - 1) {
        expect(depot.status).toBe('under_construction')
        expect(depot.build!.turnsLeft).toBe(turns - 1 - i)
      }
    }
    expect(paid.reduce((a, b) => a + b, 0)).toBe(total)
    expect(Math.max(...paid) - Math.min(...paid)).toBeLessThanOrEqual(turns) // lika rater, resten i den sista
    const depot = s.house.works.find((w) => w.kind === kind)!
    expect(depot.status).toBe('operating')
    expect(depot.build).toBeUndefined()
    expect(depot.invested).toBe(total)
  })

  it('en anläggning under byggnad har ingen fast kostnad; den färdiga har', () => {
    let s = fresh('b-3')
    const baseline = computeFixedCostsBreakdown(s.house).facilityUpkeep
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: kind }]).state
    expect(computeFixedCostsBreakdown(s.house).facilityUpkeep).toBe(baseline)
    for (let i = 0; i < turns; i++) s = turn(s).state
    expect(computeFixedCostsBreakdown(s.house).facilityUpkeep).toBe(baseline + k.fixedCostPerQuarter[0]!)
  })

  it('forcerat bygge: halva tiden mot dubbla priset', () => {
    let s = fresh('b-4')
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: kind, forced: true }]).state
    const forcedTurns = Math.max(1, Math.ceil(turns * F.forceTimeFactor))
    const depot = s.house.works.find((w) => w.kind === kind)!
    expect(depot.build).toMatchObject({ turnsTotal: forcedTurns, costTotal: total * F.forceCostFactor, forced: true })
    for (let i = 0; i < forcedTurns; i++) s = turn(s).state
    expect(s.house.works.find((w) => w.kind === kind)!.status).toBe('operating')
    expect(ledgerWorks(s)).toBe(total * F.forceCostFactor)
  })

  it('ett färdigt monteringsverk levereras med sina linjer, och linjernas id fortsätter räkna', () => {
    let s = fresh('b-5')
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour' }]).state
    for (let i = 0; i < F.kinds.assembly.buildTurns[0]!; i++) s = turn(s).state
    const works = assemblyWorks(s.house)
    expect(works).toHaveLength(2)
    expect(works[1]!.category).toBe('armour')
    expect(works[1]!.lines).toHaveLength(F.newAssemblyLines)
    expect(allLines(s.house).map((l) => l.id)).toEqual(['line-1', 'line-2', 'line-3', 'line-4'])
  })

  it('byggkostnaden bokförs på huvudbokens rad `works` och inget annat, och kassan minskar lika mycket', () => {
    let s = fresh('b-6')
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: kind }]).state
    const before = s.house.treasury
    const r = turn(s)
    const row = r.state.ledger.at(-1)!.expenses.works ?? 0
    expect(row).toBeGreaterThan(0)
    expect(r.state.ledger.at(-1)!.expenses.lines).toBe(0)
    const other = r.state.ledger.at(-1)!
    expect(other.treasuryEnd).toBeLessThanOrEqual(before - row)
  })
})

describe('WORKS EXPAND — utbyggnad (§4.3)', () => {
  it('höjer nivån när byggtiden gått; under bygget går monteringsverket på halv fart och är i drift', () => {
    let s = fresh('e-1')
    const turns = F.kinds.assembly.buildTurns[1]!
    s = turn(s, [{ kind: 'WORKS', op: 'EXPAND', facilityId: 'works-1' }]).state
    const works = s.house.works[0]!
    expect(works.status).toBe('operating')
    expect(works.level).toBe(1)
    expect(works.build).toMatchObject({ toLevel: 2, turnsTotal: turns })
    const product = { unitsPerLineTurn: 100 } as Parameters<typeof computeLineThroughput>[2]
    const full = computeLineThroughput({ ...s.house, works: [{ ...works, build: undefined }] }, works.lines[0]!, product)
    const half = computeLineThroughput(s.house, works.lines[0]!, product)
    expect(half).toBeCloseTo((full * F.expansionSpeedPct) / 100, 9)
    for (let i = 0; i < turns; i++) s = turn(s).state
    expect(s.house.works[0]!.level).toBe(2)
    expect(s.house.works[0]!.build).toBeUndefined()
    expect(s.house.works[0]!.invested).toBe(F.startingInvested.assembly! + F.kinds.assembly.buildCost[1]!)
    expect(computeLineThroughput(s.house, s.house.works[0]!.lines[0]!, product)).toBeCloseTo(full, 9)
  })

  it('nivå 2 ger plats för fler linjer, så att BUILD_LINE går igen', () => {
    let s = fresh('e-2')
    const build = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} } as const
    expect(turn(s).state && resolveTurn(s, { standingOrders: [], bids: [], actions: [build] }).rejected.map((x) => x.reason)).toEqual(['no assembly works has a free line slot'])
    s = turn(s, [{ kind: 'WORKS', op: 'EXPAND', facilityId: 'works-1', forced: true }]).state
    for (let i = 0; i < Math.ceil(F.kinds.assembly.buildTurns[1]! * F.forceTimeFactor); i++) s = turn(s).state
    s.house.treasury = 9_000_000
    const r = resolveTurn(s, { standingOrders: [], bids: [], actions: [build] })
    expect(r.rejected).toEqual([])
    expect(allLines(r.state.house)).toHaveLength(3)
  })

  it('avvisas på högsta nivån, mitt i ett bygge och för okänd anläggning', () => {
    const s = fresh('e-3')
    const v = (c: StandingOrderChange) => validateStandingOrderChange(s, s, c)
    expect(v({ kind: 'WORKS', op: 'EXPAND', facilityId: 'nope' })).toEqual({ ok: false, reason: 'unknown facility' })
    s.house.works[0]!.level = 3
    expect(v({ kind: 'WORKS', op: 'EXPAND', facilityId: 'works-1' })).toEqual({ ok: false, reason: 'already at the highest level' })
    s.house.works[0]!.level = 1
    s.house.works[0]!.build = { toLevel: 2, startTurn: 1, turnsTotal: 3, turnsLeft: 3, costTotal: 1, costPerTurn: 1, forced: false }
    expect(v({ kind: 'WORKS', op: 'EXPAND', facilityId: 'works-1' })).toEqual({ ok: false, reason: 'already being built' })
  })
})

describe('WORKS SELL — avveckling (§4.3)', () => {
  it('säljs för en del av det investerade; platsen blir ledig; linjerna och deras stående order försvinner', () => {
    let s = fresh('s-1')
    s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: 'depot', forced: true }]).state
    for (let i = 0; i < 3; i++) s = turn(s).state
    const depot = s.house.works.find((w) => w.kind === 'depot')!
    expect(depot.status).toBe('operating')
    const t0 = s.house.treasury
    const r = turn(s, [{ kind: 'WORKS', op: 'SELL', facilityId: depot.id }])
    expect(r.rejected).toEqual([])
    expect(r.state.house.works.some((w) => w.id === depot.id)).toBe(false)
    const gain = Math.round((F.sellValuePct / 100) * depot.invested)
    expect(r.state.ledger.at(-1)!.income.facilitySale).toBe(gain)
    expect(r.state.house.treasury).toBeGreaterThan(t0 + gain - 1_000_000) // kassan fick intäkten (netto efter kvartalets övriga rörelser)
    expect(r.state.house.plot.slots - r.state.house.works.length).toBe(5)
  })

  it('det sista monteringsverket, ett verk med en linje i arbete och en anläggning under byggnad får inte säljas', () => {
    const s = fresh('s-2')
    const v = (id: string) => validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'SELL', facilityId: id })
    expect(v('works-1')).toEqual({ ok: false, reason: 'the house needs at least one assembly works' })
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', lines: [{ ...s.house.works[0]!.lines[0]!, id: 'line-9', assignedContractId: 'c-1', status: 'running' }] })
    expect(v('works-9')).toEqual({ ok: false, reason: 'a line in it is working on a contract' })
    s.house.works.push({ ...s.house.works[1]!, id: 'works-10', kind: 'depot', category: null, status: 'under_construction', build: { toLevel: 1, startTurn: 1, turnsTotal: 2, turnsLeft: 2, costTotal: 1, costPerTurn: 1, forced: false } })
    expect(v('works-10')).toEqual({ ok: false, reason: 'cannot sell a facility under construction' })
    expect(v('nope')).toEqual({ ok: false, reason: 'unknown facility' })
  })

  it('startpaketets gratis labb är värt noll: att sälja det ger ingen vinst', () => {
    const s = fresh('s-3')
    const r = turn(s, [{ kind: 'WORKS', op: 'SELL', facilityId: 'works-2' }])
    expect(r.state.ledger.at(-1)!.income.facilitySale ?? 0).toBe(0)
  })
})

describe('WORKS BUY_LAND — mer mark (§4.1)', () => {
  it('fyra platser till för ett högt pris, en gång', () => {
    let s = fresh('l-1')
    s.house.treasury = 6_000_000
    const t0 = s.house.treasury
    const r = turn(s, [{ kind: 'WORKS', op: 'BUY_LAND' }])
    expect(r.rejected).toEqual([])
    s = r.state
    expect(s.house.plot).toEqual({ slots: F.plot.slots + F.plot.landSlots, landBought: true })
    expect(t0 - s.house.treasury).toBeGreaterThanOrEqual(F.plot.landCost)
    expect(ledgerWorks(s)).toBe(F.plot.landCost)
    expect(validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'BUY_LAND' })).toEqual({ ok: false, reason: 'the house has already bought more land' })
  })

  it('utan pengar avvisas köpet', () => {
    const s = fresh('l-2')
    s.house.treasury = 1000
    expect(validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'BUY_LAND' })).toEqual({ ok: false, reason: 'cannot afford the land' })
  })
})

describe('två partier med samma beslut ger samma utfall (ren, deterministisk)', () => {
  it('bygge → rater → färdigt är bitvis lika vid omspelning', () => {
    const run = () => {
      let s = fresh('det')
      s = turn(s, [{ kind: 'WORKS', op: 'BUILD', facilityKind: 'proving' }]).state
      for (let i = 0; i < 4; i++) s = turn(s).state
      return JSON.stringify(s.house.works)
    }
    expect(run()).toBe(run())
  })
})

