// design.casualty.test.ts — P113 (ETAPP9_FORSLAG.md §5.6, skyddsräcke 4 och 5, krönikan).
//
// Olycksfåglar och utredningar: en konstruktion med en dold miljöbrist som levereras till en front med rätt miljö kan ge en
// rapport från fältet (dragen med ctx.rng), som avslöjar bristen och öppnar en utredning. Spelaren väljer (en stående
// order, ingen handling): ÅTGÄRDA I FÄLT (pengar + omställning, liten risk), FÖRNEKA (ingen kostnad nu, ryktet sjunker
// per leverans, en tjänsteman tappar anseende, större skandal om det kommer ut) eller KONSTRUERA OM (nytt projekt med
// kortare tid, tid utan produkt). Utan svar inom fristen räknas det som förnekande.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { classifyChronicleEntries } from '../src/chronicle.js'
import { designBidRejection, designDuration, frontEnvironments } from '../src/design.js'
import { resolveTurn } from '../src/resolve/index.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Design, GameState, InvestigationChoice, Shipment, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'
import { allLines } from '../src/works.js'

const B = balance as unknown as {
  casualtyChancePctPerSeverity: number
  investigationDeadlineTurns: number
  casualtyFixCost: number
  casualtyFixFailPct: number
  casualtyFixFailQualityPenalty: number
  denyStandingPenalty: number
  denyQualityPenaltyPerDelivery: number
  denyExposureChancePct: number
  denyExposedStandingPenalty: number
  redesignTurnsFactor: number
  qualityScandalPenalty: number
  qualityScandalTurns: number
  qualityCategoryCap: number
  retoolingTurns: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const CHOOSE = (investigationId: string, choice: InvestigationChoice): StandingOrderChange => ({ kind: 'INVESTIGATION', investigationId, choice })

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
    trueQuality: 50,
    uncertainty: 1,
    latentFlaw: { environment: 'jungle', severity: 3 },
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
    ...over,
  }
}

function fresh(d: Design = design(), seed = 'casualty-seed'): GameState {
  const state = createInitialState('indochina-slice', seed)
  state.house.treasury = 50_000_000
  state.house.designs = [d]
  return state
}

function contractFor(designId: string | undefined): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 20,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: 'front-1',
    advancePct: 0,
    advancePaid: 0,
    ...(designId ? { designId } : {}),
  }
}

function deliver(state: GameState, designId: string | undefined, seed: string): Omit<WireEvent, 'id' | 'turn'>[] {
  state.meta.turn = 3
  state.market.contracts = [contractFor(designId)]
  const shipment: Shipment = { id: 'shipment-0', contractId: 'contract-test-0', units: 5, arrivalTurn: 3 }
  state.market.shipments = [shipment]
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  deliveries(ctx)
  return emitted
}

function casualtyRate(make: () => GameState, designId: string | undefined, runs = 400): number {
  let hits = 0
  for (let i = 0; i < runs; i++) {
    const state = make()
    deliver(state, designId, `rate-${i}`)
    if (state.house.investigations.length > 0) hits++
  }
  return hits / runs
}

function openInvestigation(seed = 'open'): GameState {
  for (let i = 0; i < 400; i++) {
    const state = fresh(design(), `${seed}-${i}`)
    // Annan Rng-sträng än spelets egen: samma sträng ger samma första dragning och korrelerar olycksfallet med senare tärningskast.
    deliver(state, 'design-1', `${seed}-${i}-delivery`)
    if (state.house.investigations.length > 0) return state
  }
  throw new Error('ingen olycksfågel på 400 försök')
}

function run(state: GameState, turns: number, submission: TurnSubmission = EMPTY): GameState {
  let s = state
  for (let i = 0; i < turns; i++) s = resolveTurn(s, i === 0 ? submission : EMPTY).state
  return s
}

describe('rapporter från fältet (P113, §5.6)', () => {
  it('startläget: inga utredningar', () => {
    expect(fresh().house.investigations).toEqual([])
  })

  it('en brist i en miljö fronten har ger en olycksfågel med frekvens ≈ casualtyChancePctPerSeverity × allvar', () => {
    expect(frontEnvironments('front-1')).toContain('jungle')
    const expected = (B.casualtyChancePctPerSeverity * 3) / 100
    const rate = casualtyRate(() => fresh(), 'design-1')
    expect(rate).toBeGreaterThan(expected - 0.1)
    expect(rate).toBeLessThan(expected + 0.1)
  })

  it('ingen olycksfågel: fel miljö (fronten saknar minor), felfri konstruktion, ett kontrakt utan konstruktion', () => {
    expect(frontEnvironments('front-1')).not.toContain('mine')
    expect(casualtyRate(() => fresh(design({ latentFlaw: { environment: 'mine', severity: 3 } })), 'design-1', 200)).toBe(0)
    expect(casualtyRate(() => fresh(design({ latentFlaw: null })), 'design-1', 200)).toBe(0)
    expect(casualtyRate(() => fresh(), undefined, 200)).toBe(0)
  })

  it('olycksfallet avslöjar bristen, öppnar EN utredning med frist, och rubriken har causeId från leveransen', () => {
    const state = openInvestigation()
    const inv = state.house.investigations[0]!
    expect(inv).toMatchObject({ designId: 'design-1', environment: 'jungle', severity: 3, frontId: 'front-1', buyerId: 'rvn', status: 'open' })
    expect(inv.deadlineTurn).toBe(inv.openedTurn + B.investigationDeadlineTurns)
    expect(state.house.designs[0]!.flawRevealed).toBe(true)
    // ingen andra utredning öppnas medan en är öppen
    deliver(state, 'design-1', 'again')
    expect(state.house.investigations).toHaveLength(1)
  })

  it('rapporten kommer i krönikan som "casualty" (klassificeringen läser rubriken)', () => {
    let headline = ''
    for (let i = 0; i < 400 && headline === ''; i++) {
      const state = fresh(design(), `chron-${i}`)
      const events = deliver(state, 'design-1', `chron-${i}`)
      headline = events.find((e) => e.headline.startsWith('FIELD REPORT'))?.headline ?? ''
    }
    expect(headline).toContain('H&V M64 FIELD GUN')
    const entries = classifyChronicleEntries([{ id: 'e1', turn: 3, severity: 'headline', scope: 'house', headline, causeId: null, delta: {}, actorIsPlayer: true, subjectId: null }])
    expect(entries.map((e) => e.kind)).toEqual(['casualty'])
  })
})

describe('utredningskortet: valen (P113, §5.6)', () => {
  it('validering: okänd utredning, okänt val, redan avgjord', () => {
    const state = openInvestigation()
    const id = state.house.investigations[0]!.id
    expect(validateStandingOrderChange(state, state, CHOOSE(id, 'FIX')).ok).toBe(true)
    expect(validateStandingOrderChange(state, state, CHOOSE('inv-nope', 'FIX'))).toEqual({ ok: false, reason: 'unknown investigation' })
    expect(validateStandingOrderChange(state, state, { ...CHOOSE(id, 'FIX'), choice: 'IGNORE' } as unknown as StandingOrderChange)).toEqual({
      ok: false,
      reason: 'unknown investigation choice',
    })
    const poor = structuredClone(state)
    poor.house.treasury = B.casualtyFixCost - 1
    expect(validateStandingOrderChange(poor, poor, CHOOSE(id, 'FIX'))).toEqual({ ok: false, reason: 'not enough cash to fix the fault in the field' })
    const closed = structuredClone(state)
    closed.house.investigations[0]!.status = 'fixed'
    expect(validateStandingOrderChange(closed, closed, CHOOSE(id, 'DENY'))).toEqual({ ok: false, reason: 'the investigation is already closed' })
  })

  it('ÅTGÄRDA I FÄLT: kostar casualtyFixCost (huvudboken: lines), ställer om linjer, tar bort bristen — med en liten risk att åtgärden inte håller', () => {
    let held = 0
    let failed = 0
    for (let i = 0; i < 60; i++) {
      const base = openInvestigation(`fix-${i}`)
      allLines(base.house)[0]!.assignedContractId = 'contract-test-0'
      allLines(base.house)[0]!.productId = '105mm_field_gun'
      allLines(base.house)[0]!.status = 'running'
      const treasury = base.house.treasury
      const id = base.house.investigations[0]!.id
      const result = resolveTurn(base, { ...EMPTY, standingOrders: [CHOOSE(id, 'FIX')] })
      expect(result.rejected).toEqual([])
      const s = result.state
      const inv = s.house.investigations[0]!
      expect(inv.status).toBe('fixed')
      const ledger = s.ledger[s.ledger.length - 1]!
      expect(ledger.expenses.lines).toBeGreaterThanOrEqual(B.casualtyFixCost)
      expect(treasury - s.house.treasury).toBeGreaterThanOrEqual(B.casualtyFixCost)
      const line = allLines(s.house)[0]!
      expect(line.status === 'retooling' || line.status === 'running' || line.status === 'idle').toBe(true)
      if (s.house.designs[0]!.latentFlaw === null) held++
      else {
        failed++
        expect(result.wire.some((e) => e.headline.includes('DOES NOT HOLD'))).toBe(true)
        expect(s.house.categoryQuality.artillery).toBeLessThanOrEqual(-B.casualtyFixFailQualityPenalty + 1)
      }
    }
    expect(held).toBeGreaterThan(0)
    expect(held + failed).toBe(60)
    expect(failed / 60).toBeLessThan(B.casualtyFixFailPct / 100 + 0.2)
  })

  it('FÖRNEKA: ingen kostnad nu, tjänstemannen tappar anseende, ryktet sjunker per leverans, bristen finns kvar', () => {
    const base = openInvestigation()
    const id = base.house.investigations[0]!.id
    const standingBefore = base.officials['official-rvn-procurement']!.standing
    const treasury = base.house.treasury
    const s = resolveTurn(base, { ...EMPTY, standingOrders: [CHOOSE(id, 'DENY')] }).state
    expect(s.house.investigations[0]!.status).toBe('denied')
    expect(s.house.designs[0]!.denied).toBe(true)
    expect(s.officials['official-rvn-procurement']!.standing).toBe(Math.max(0, standingBefore - B.denyStandingPenalty))
    expect(s.house.treasury).toBeGreaterThanOrEqual(treasury - 2_000_000) // bara de vanliga löpande kostnaderna, inget åtgärdsbelopp
    expect(s.house.designs[0]!.latentFlaw).not.toBeNull()

    // varje leverans av den förnekade konstruktionen kostar kategoriryktet
    const d = structuredClone(s)
    deliver(d, 'design-1', 'deny-delivery')
    expect(d.house.categoryQuality.artillery).toBe(Math.max(-B.qualityCategoryCap, s.house.categoryQuality.artillery - B.denyQualityPenaltyPerDelivery))
  })

  it('FÖRNEKA: sanningen kan komma fram — skandal (kvaliteten sjunker, skandalfönster), tjänstemannen tappar mer, utredningen stängs', () => {
    let exposed = 0
    const RUNS = 200
    for (let i = 0; i < RUNS; i++) {
      const base = fresh(design({ denied: true, flawRevealed: true }), `expose-${i}`)
      base.house.investigations = [
        { id: 'inv-1', designId: 'design-1', environment: 'jungle', severity: 3, frontId: 'front-1', buyerId: 'rvn', openedTurn: 1, deadlineTurn: 3, status: 'denied', causeEventId: null },
      ]
      const qualityBefore = base.house.reputation.quality
      const standingBefore = base.officials['official-rvn-procurement']!.standing
      const r = resolveTurn(base, EMPTY)
      if (r.wire.some((e) => e.headline.includes('COVER-UP EXPOSED'))) {
        exposed++
        expect(r.state.house.reputation.quality).toBe(Math.max(0, qualityBefore - B.qualityScandalPenalty))
        expect(r.state.house.scandalUntilTurn).not.toBeNull()
        expect(r.state.officials['official-rvn-procurement']!.standing).toBeLessThanOrEqual(standingBefore - B.denyExposedStandingPenalty + 1)
        expect(r.state.house.investigations[0]!.status).toBe('exposed')
        expect(r.state.house.designs[0]!.denied).toBeFalsy()
      }
    }
    expect(exposed / RUNS).toBeGreaterThan(B.denyExposureChancePct / 100 - 0.08)
    expect(exposed / RUNS).toBeLessThan(B.denyExposureChancePct / 100 + 0.08)
  })

  it('KONSTRUERA OM: konstruktionen dras tillbaka, ett kortare omkonstruktionsprojekt startar, och resultatet är felfritt', () => {
    const base = openInvestigation()
    const id = base.house.investigations[0]!.id
    let s = resolveTurn(base, { ...EMPTY, standingOrders: [CHOOSE(id, 'REDESIGN')] }).state
    expect(s.house.investigations[0]!.status).toBe('redesigning')
    expect(s.house.designs[0]!.status).toBe('withdrawn')
    const project = s.house.rnd.find((p) => p.design)!
    expect(project.design).toMatchObject({ redesignOf: 'design-1', upgradeOf: 'design-1' })
    expect(project.turnsTotal).toBeLessThan(designDuration(s.house, 'timely', true) + 1)
    expect(project.turnsTotal).toBe(Math.max(1, Math.round(designDuration(s.house, 'timely', true) * B.redesignTurnsFactor)))
    // tid utan produkt: budet med den tillbakadragna konstruktionen avvisas
    expect(designBidRejection(s.house, 'design-1', '105mm_field_gun')).toBe('design is withdrawn')

    for (let i = 0; i < 20 && s.house.rnd.some((p) => p.design); i++) s = resolveTurn(s, EMPTY).state
    expect(s.house.designs).toHaveLength(2)
    const redesigned = s.house.designs[1]!
    expect(redesigned.latentFlaw).toBeNull()
    expect(redesigned.flawRevealed).toBe(false)
    expect(redesigned.lineage).toBe('design-1')
    expect(redesigned.status).toBe('active')
    expect(s.house.designs[0]!.status).toBe('withdrawn')
    expect(s.house.investigations[0]!.status).toBe('fixed')
  })

  it('utan svar inom fristen räknas det som förnekande, med en rubrik', () => {
    const base = openInvestigation()
    const inv = base.house.investigations[0]!
    let s = base
    const headlines: string[] = []
    for (let i = 0; i < B.investigationDeadlineTurns + 2; i++) {
      const r = resolveTurn(s, EMPTY)
      s = r.state
      headlines.push(...r.wire.map((e) => e.headline))
    }
    expect(['denied', 'exposed']).toContain(s.house.investigations.find((x) => x.id === inv.id)!.status)
    expect(headlines.some((h) => h.includes('NO ANSWER') || h.includes('COVER-UP EXPOSED'))).toBe(true)
  })

  it('ett svar före fristen vinner över standardförnekandet', () => {
    const base = openInvestigation()
    const id = base.house.investigations[0]!.id
    const s = run(base, 1, { ...EMPTY, standingOrders: [CHOOSE(id, 'REDESIGN')] })
    expect(s.house.investigations[0]!.status).toBe('redesigning')
  })
})

describe('sparade partier (P113)', () => {
  it('ett sparat parti utan investigations kraschar inte', () => {
    const state = fresh()
    delete (state.house as Partial<GameState['house']>).investigations
    expect(() => resolveTurn(state, EMPTY)).not.toThrow()
    expect(() => deliver(state, 'design-1', 'x')).not.toThrow()
  })
})
