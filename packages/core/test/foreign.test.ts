// foreign.test.ts — P177 (ETAPP11_FORSLAG.md §7, beslut 11G): verk i köparland — bygge, fördelar, motköpet som blir verkligt, och riskerna (kriget, regimskifte, kunskapsspridning).
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import facilitiesData from '../src/data/facilities.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { createRng } from '../src/rng.js'
import { resolveTurn } from '../src/resolve/index.js'
import { production } from '../src/resolve/steps/production.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { advanceForeignWorks, foreignDeliveryTurnsSaved, foreignSite, foreignWorksIn, localWorksBidTerm } from '../src/foreign.js'
import { freePlotSlots } from '../src/construction.js'
import { facilityWage, totalWages } from '../src/workforce.js'
import { licenceRivalId } from '../src/licence.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Facility, GameState, StandingOrderChange, WireEvent } from '../src/types.js'

const FACILITIES = facilitiesData as unknown as { kinds: { assembly: { buildCost: number[] } } }
const B = balance as unknown as Record<
  | 'foreignMinRelation' | 'foreignWorksMax' | 'foreignBuildCostFactor' | 'foreignBuildExtraTurns' | 'foreignWageFactor' | 'foreignDeliveryTurnsSaved' | 'localWorksBidBonusPct'
  | 'localWorksNonAlignedFactor' | 'scoreBase' | 'foreignKnowledgePerTurn' | 'foreignKnowledgeThreshold' | 'foreignKnowledgeAfterSpawn' | 'foreignCoupIntegrityPenalty'
  | 'foreignCounterPurchaseTurns' | 'foreignCounterPurchaseRelationBonus' | 'foreignCounterPurchaseRelationPenalty' | 'foreignCounterPurchaseFine',
  number
>
const build = (abroad: string, category: Facility['category'] = 'infantry'): StandingOrderChange => ({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: category ?? undefined, abroad })
const v = (s: GameState, c: StandingOrderChange) => validateStandingOrderChange(s, s, c)
const fresh = (seed: string) => {
  const s = createInitialState('indochina-slice', seed)
  s.house.treasury = 50_000_000
  s.factions.rvn!.relationToPlayer = 60
  return s
}

function ctxFor(state: GameState, seed = 'foreign'): { ctx: ResolveContext; emitted: WireEvent[] } {
  const emitted: WireEvent[] = []
  let seq = 0
  return {
    emitted,
    ctx: {
      state,
      draft: state,
      submission: { standingOrders: [], bids: [], actions: [] },
      rng: createRng(seed, 0),
      emit: (e) => {
        emitted.push(e as WireEvent)
        return `t-${seq++}`
      },
      rejected: [],
    },
  }
}

// Ett färdigt verk i Vietnam (rvn) med två linjer.
function withBuiltWorks(seed: string): GameState {
  const s = fresh(seed)
  s.house.works.push({
    id: 'works-9', kind: 'assembly', level: 1, category: 'infantry', condition: 100, staffing: 100, skill: 50, status: 'operating', invested: 1_000_000, location: 'rvn', hostAlignment: s.factions.rvn!.alignment, localKnowledge: 0,
    lines: [{ id: 'line-9', productId: null, grade: 'A', unitsPerTurnAtFull: s.house.unitsPerLineTurnDefault, capacityPct: 100, assignedContractId: null, status: 'idle', blockedReason: null, retoolingUntilTurn: null }],
  })
  return s
}

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-test-0', buyerId: 'rvn', productId: 'm1_rifle', quantity: 100000, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 100, grade: 'A', dueTurn: 30, status: 'active',
  lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
})

describe('bygget (P177)', () => {
  it('ett verk i ett köparland kräver relation, solvens, inget embargo, ett verk per land och högst foreignWorksMax; kostar mer och tar längre tid; tar ingen hemmaplats', () => {
    const s = fresh('fw-build')
    expect(foreignSite('rvn')).toMatchObject({ sectorId: 'hue', side: 'a' })
    expect(foreignSite('nlf')).toBeNull()
    expect(v(s, build('rvn'))).toEqual({ ok: true })
    expect(v(s, build('nlf'))).toMatchObject({ ok: false, reason: 'no works can be built in that country' })
    expect(v(s, { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot', abroad: 'rvn' })).toMatchObject({ ok: false, reason: expect.stringContaining('assembly') })
    s.factions.rvn!.relationToPlayer = B.foreignMinRelation - 1
    expect(v(s, build('rvn'))).toMatchObject({ ok: false, reason: expect.stringContaining('relation') })
    s.factions.rvn!.relationToPlayer = 60
    s.factions.rvn!.embargoed = true
    expect(v(s, build('rvn'))).toMatchObject({ ok: false, reason: expect.stringContaining('embargo') })
    s.factions.rvn!.embargoed = false
    s.factions.rvn!.bankrupt = true
    expect(v(s, build('rvn'))).toMatchObject({ ok: false, reason: expect.stringContaining('bankrupt') })

    const t = fresh('fw-build-2')
    const slotsBefore = freePlotSlots(t.house)
    const given = resolveTurn(t, { standingOrders: [build('rvn')], bids: [], actions: [] })
    const works = foreignWorksIn(given.state.house, 'rvn')!
    expect(works).toMatchObject({ kind: 'assembly', status: 'under_construction', location: 'rvn', category: 'infantry' })
    expect(freePlotSlots(given.state.house)).toBe(slotsBefore) // ingen plats på hemmatomten
    expect(works.build!.costTotal).toBe(Math.round(FACILITIES.kinds.assembly.buildCost[0]! * B.foreignBuildCostFactor))
    expect(works.build!.turnsTotal).toBe(3 + B.foreignBuildExtraTurns)
    expect(given.wire.some((e) => e.headline.includes('BREAKS GROUND') && e.headline.includes('REPUBLIC OF VIETNAM'))).toBe(true)
    // ett andra verk i samma land
    expect(v(given.state, build('rvn'))).toMatchObject({ ok: false, reason: 'the house already has works in that country' })
  })

  it('exportreglerna: ett västhus bygger inte i ett östland, ett neutralt hus får', () => {
    const s = fresh('fw-bloc')
    s.house.homeState = 'east'
    expect(v(s, build('rvn'))).toMatchObject({ ok: false, reason: expect.stringContaining('export rules') })
    s.house.homeState = 'neutral'
    expect(v(s, build('rvn'))).toEqual({ ok: true })
    s.house.homeState = 'west'
    expect(v(s, build('rvn'))).toEqual({ ok: true })
  })

  it('högst foreignWorksMax verk utomlands', () => {
    const s = fresh('fw-max')
    s.factions.laos!.relationToPlayer = 60
    s.house.works.push({ id: 'works-8', kind: 'assembly', level: 1, category: 'infantry', condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0, location: 'rvn' })
    expect(B.foreignWorksMax).toBe(2)
    expect(v(s, build('laos'))).toEqual({ ok: true })
    s.house.works.push({ id: 'works-7', kind: 'assembly', level: 1, category: 'infantry', condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0, location: 'nlf' })
    expect(v(s, build('laos'))).toMatchObject({ ok: false, reason: expect.stringContaining('at most') })
  })
})

describe('fördelarna (P177)', () => {
  it('lönerna är lägre utomlands', () => {
    const s = withBuiltWorks('fw-wage')
    const abroad = foreignWorksIn(s.house, 'rvn')!
    const home = { ...abroad, location: undefined }
    expect(facilityWage(abroad, 1)).toBe(Math.round(facilityWage(home, 1) * B.foreignWageFactor))
    expect(totalWages(s.house)).toBeLessThan(totalWages({ ...s.house, works: s.house.works.map((w) => ({ ...w, location: undefined })) }))
    expect(computeFixedCostsBreakdown(s.house, 0).wages).toBe(totalWages(s.house))
  })

  it('leveranser från ett verk i köparens land anländer fortare — men inte till ett annat lands kontrakt', () => {
    const s = withBuiltWorks('fw-deliver')
    expect(foreignDeliveryTurnsSaved(s.house, 'line-9', contract({ buyerId: 'rvn' }))).toBe(B.foreignDeliveryTurnsSaved)
    expect(foreignDeliveryTurnsSaved(s.house, 'line-9', contract({ buyerId: 'laos' }))).toBe(0)
    expect(foreignDeliveryTurnsSaved(s.house, 'line-1', contract({ buyerId: 'rvn' }))).toBe(0) // hemmalinje
    // och i produktionen: en sändning från linje 9 anländer minst en tur efter, aldrig samma tur
    s.market.contracts = [contract()]
    for (const w of s.house.works) if (w.kind === 'assembly') w.category = null
    const { ctx } = ctxFor(s)
    production(ctx)
    const shipment = s.market.shipments.find((x) => x.contractId === 'contract-test-0')
    expect(shipment).toBeDefined()
    expect(shipment!.arrivalTurn).toBeGreaterThanOrEqual(s.meta.turn + 1)
  })

  it('budtermen: poäng i landets ordrar, mer hos en NON_ALIGNMENT-tjänsteman, ingenting utan verk i landet', () => {
    const s = withBuiltWorks('fw-bid')
    const official = Object.values(s.officials).find((o) => o.factionId === 'rvn')!
    const order = { buyerId: 'rvn', officialId: official.id }
    official.agenda = 'REARM'
    const base = (B.scoreBase * B.localWorksBidBonusPct) / 100
    expect(localWorksBidTerm(s, order)).toBe(base)
    official.agenda = 'NON_ALIGNMENT'
    expect(localWorksBidTerm(s, order)).toBe(base * B.localWorksNonAlignedFactor)
    expect(localWorksBidTerm(s, { buyerId: 'laos', officialId: official.id })).toBe(0)
    foreignWorksIn(s.house, 'rvn')!.status = 'under_construction'
    expect(localWorksBidTerm(s, order)).toBe(0)
  })
})

describe('motköpet (P177)', () => {
  it('ett löfte uppfyllt av ett verk i drift i tid ger relation; ett brutet ger vite och sänkt relation, en gång', () => {
    const met = withBuiltWorks('fw-cp-met')
    met.market.contracts = [contract({ counterPurchase: { dueTurn: 8, status: 'open' } })]
    const relation = met.factions.rvn!.relationToPlayer
    const { ctx, emitted } = ctxFor(met)
    advanceForeignWorks(ctx)
    expect(met.market.contracts[0]!.counterPurchase!.status).toBe('met')
    expect(met.factions.rvn!.relationToPlayer).toBe(relation + B.foreignCounterPurchaseRelationBonus)
    expect(emitted.some((e) => e.headline.includes('IS KEPT'))).toBe(true)

    const broken = fresh('fw-cp-broken')
    broken.market.contracts = [contract({ counterPurchase: { dueTurn: 2, status: 'open' } })]
    broken.meta.turn = 2
    advanceForeignWorks(ctxFor(broken).ctx)
    expect(broken.market.contracts[0]!.counterPurchase!.status).toBe('open') // fristen går ut efter turn 2
    const treasury = broken.house.treasury
    broken.meta.turn = 3
    const second = ctxFor(broken)
    advanceForeignWorks(second.ctx)
    expect(broken.market.contracts[0]!.counterPurchase!.status).toBe('breached')
    expect(broken.house.treasury).toBe(treasury - B.foreignCounterPurchaseFine)
    expect(broken.factions.rvn!.relationToPlayer).toBe(60 - B.foreignCounterPurchaseRelationPenalty)
    advanceForeignWorks(second.ctx) // bara en gång
    expect(broken.house.treasury).toBe(treasury - B.foreignCounterPurchaseFine)
  })

  it('ett motköp i en upphandling ger kontraktet ett löfte med fristen foreignCounterPurchaseTurns', async () => {
    const { counterPurchasePledge } = await import('../src/foreign.js')
    expect(counterPurchasePledge(5)).toEqual({ dueTurn: 5 + B.foreignCounterPurchaseTurns, status: 'open' })
  })
})

describe('riskerna (P177)', () => {
  it('kriget: ett verk i en sektor som motsidan håller är förlorat med allt i det, och dess stående order försvinner', () => {
    const s = withBuiltWorks('fw-war')
    s.house.standingOrders.lines['line-9'] = { category: null, shift: 'normal', sinceTurn: 0 }
    const front = s.fronts['front-1']!
    // sektorn 'hue' hålls av motsidan (b): alla förband där är b
    for (const f of front.formations) if (f.sectorId === 'hue') f.side = 'b'
    const { ctx, emitted } = ctxFor(s)
    advanceForeignWorks(ctx)
    expect(foreignWorksIn(s.house, 'rvn')).toBeUndefined()
    expect(s.house.standingOrders.lines['line-9']).toBeUndefined()
    expect(emitted.some((e) => e.headline.includes('IS LOST'))).toBe(true)
  })

  it('kriget: en sektor som landet håller eller är omstridd förlorar inte verket', () => {
    const s = withBuiltWorks('fw-war-safe')
    advanceForeignWorks(ctxFor(s).ctx)
    expect(foreignWorksIn(s.house, 'rvn')).toBeDefined()
  })

  it('regimskifte: byter alignment tecken kan fabriken förstatligas (slumpdragning bara då), och en egen kupp kostar redbarhet', () => {
    // inget regimskifte → ingen slumpdragning
    const calm = withBuiltWorks('fw-regime-calm')
    const rng = createRng('x', 0)
    void rng
    const c = ctxFor(calm)
    const before = calm.meta.rngCursor
    advanceForeignWorks(c.ctx)
    expect(calm.meta.rngCursor).toBe(before)

    let seized = 0
    let kept = 0
    for (let i = 0; i < 60; i++) {
      const s = withBuiltWorks(`fw-regime-${i}`)
      s.factions.rvn!.alignment = -40 // var +70 vid bygget
      s.factions.rvn!.relationToPlayer = 0
      const { ctx } = ctxFor(s, `regime-${i}`)
      advanceForeignWorks(ctx)
      if (foreignWorksIn(s.house, 'rvn')) kept++
      else seized++
    }
    expect(seized).toBeGreaterThan(0)
    expect(kept).toBeGreaterThan(0)

    // hållhake: med full relation förstatligas den aldrig
    for (let i = 0; i < 30; i++) {
      const s = withBuiltWorks(`fw-shield-${i}`)
      s.factions.rvn!.alignment = -40
      s.factions.rvn!.relationToPlayer = 100
      advanceForeignWorks(ctxFor(s, `shield-${i}`).ctx)
      expect(foreignWorksIn(s.house, 'rvn')).toBeDefined()
    }

    const coup = withBuiltWorks('fw-coup')
    coup.factions.rvn!.alignment = -40
    coup.factions.rvn!.relationToPlayer = 100
    coup.factions.rvn!.coupAttempted = true
    const integrity = coup.house.reputation.integrity
    advanceForeignWorks(ctxFor(coup).ctx)
    expect(coup.house.reputation.integrity).toBe(integrity - B.foreignCoupIntegrityPenalty)
  })

  it('kunskapsspridning: kunskapen växer per tur i drift och vid tröskeln blir landet en rival', () => {
    const s = withBuiltWorks('fw-knowledge')
    const works = foreignWorksIn(s.house, 'rvn')!
    advanceForeignWorks(ctxFor(s).ctx)
    expect(works.localKnowledge).toBe(B.foreignKnowledgePerTurn)
    works.localKnowledge = B.foreignKnowledgeThreshold - B.foreignKnowledgePerTurn
    const { ctx, emitted } = ctxFor(s)
    advanceForeignWorks(ctx)
    expect(s.rivals[licenceRivalId('rvn')]).toBeDefined()
    expect(works.localKnowledge).toBe(B.foreignKnowledgeAfterSpawn)
    expect(emitted.some((e) => e.headline.includes('HAS LEARNED THE TRADE'))).toBe(true)
    // en rival finns redan: ingen ny
    works.localKnowledge = B.foreignKnowledgeThreshold
    advanceForeignWorks(ctxFor(s).ctx)
    expect(Object.keys(s.rivals).filter((id) => id === licenceRivalId('rvn'))).toHaveLength(1)
  })

  it('ett verk under bygge rörs inte av riskerna', () => {
    const s = withBuiltWorks('fw-ub')
    foreignWorksIn(s.house, 'rvn')!.status = 'under_construction'
    s.factions.rvn!.alignment = -40
    advanceForeignWorks(ctxFor(s).ctx)
    expect(foreignWorksIn(s.house, 'rvn')).toBeDefined()
    expect(foreignWorksIn(s.house, 'rvn')!.localKnowledge).toBe(0)
  })
})
