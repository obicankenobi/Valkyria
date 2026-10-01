// traces.test.ts — P125 (ETAPP9_FORSLAG.md §8.3 och §8.4, beslut 9N, skyddsräcke 7). Pappersspåret för ALL korruption, utredningskortet,
// regimskiften som öppnar arkiven, replaceOfficial när en tjänsteman faller och rent rykte.
//
// Varje korrupt handling ger ett spår (knepen i §8.2, BRIBE, BROKER, FAVOUR och — beslut 9N — mutan i vanliga bud). Varje tur kan ett
// öppet spår komma fram (chansen stiger med tjänstemannens scandalRisk, landets motspionage och tiden); ett regimskifte öppnar arkiven.
// Ett avslöjat spår blir ett utredningskort med tre dåliga vägar (förneka / offra någon / förlikas); följderna beror på allvaret.
// Spåren kan sopas mot betalning (stående order, juridisk rådgivning). reputation.integrity stiger långsamt och sjunker kraftigt.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { bidEstimate } from '../src/queries.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { scenarioVerdict } from '../src/scenarioVerdict.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import {
  advanceTraces,
  cleanHouse,
  integrityBidTerm,
  openArchives,
  recordTrace,
  traceSurfaceChancePct,
} from '../src/traces.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, Order, PaperTrace, PlayerAction, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  traceBaseChancePct: number
  traceAgeChancePerTurn: number
  traceScandalRiskWeight: number
  traceCounterIntelWeight: number
  traceSeverityFactor: number[]
  traceChanceCap: number
  traceLegalFactor: number
  legalCounselCostPerTurn: number
  legalTraceEveryTurns: number
  traceDeadlineTurns: number
  traceSettleCost: number
  traceSacrificeStaffLoss: number
  traceDenyIntegrity: number
  traceDenyExposeChancePct: number
  traceDenyLifeTurns: number
  traceIntegrityLoss: number[]
  traceSuspendTurns: number
  traceOfficialStandingLoss: number
  traceBoardDeduction: number[]
  traceQualityLoss: number
  integrityStart: number
  traceCleanTurns: number
  traceIntegrityGain: number
  traceIntegrityBidWeight: number
  traceCleanHouseIntegrity: number
  traceArchivesChancePct: number
  traceRivalQualityLoss: number
  traceRivalRelationLoss: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const ALWAYS = { int: () => 0, chance: () => true, next: () => 0, pick: <T,>(a: readonly T[]) => a[0]!, cursor: () => 0 } as unknown as ResolveContext['rng']
const NEVER = { int: () => 0, chance: () => false, next: () => 0, pick: <T,>(a: readonly T[]) => a[0]!, cursor: () => 0 } as unknown as ResolveContext['rng']

function makeCtx(state: GameState, rng: ResolveContext['rng'] = NEVER): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng,
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

const fresh = (): GameState => {
  const state = createInitialState('indochina-slice', 'trace-seed')
  state.house.treasury = 20_000_000
  state.meta.turn = 6
  return state
}

function addTrace(state: GameState, over: Partial<PaperTrace> = {}): PaperTrace {
  const trace: PaperTrace = {
    id: `trace-${(state.traces?.length ?? 0) + 1}`,
    houseId: 'player',
    officialId: 'official-rvn-procurement',
    buyerId: 'rvn',
    kind: 'bribeBoard',
    severity: 2,
    turn: 2,
    status: 'open',
    ...over,
  }
  ;(state.traces ??= []).push(trace)
  return trace
}

const respond = (traceId: string, choice: 'DENY' | 'SACRIFICE' | 'SETTLE', role?: string): StandingOrderChange =>
  ({ kind: 'TRACE', op: 'RESPOND', traceId, choice, ...(role ? { role } : {}) }) as StandingOrderChange

function surfaced(state: GameState, over: Partial<PaperTrace> = {}): PaperTrace {
  return addTrace(state, { status: 'surfaced', surfacedTurn: state.meta.turn, deadlineTurn: state.meta.turn + B.traceDeadlineTurns, ...over })
}

describe('sannolikheten att ett spår kommer fram (P125, §8.3)', () => {
  it('stiger med tjänstemannens scandalRisk, landets motspionage, tiden och spårets allvar, och sänks av juridisk rådgivning — med tak', () => {
    const state = fresh()
    const trace = addTrace(state, { severity: 1, turn: 6 })
    const official = state.officials['official-rvn-procurement']!
    official.scandalRisk = 0
    state.factions['rvn']!.counterIntelligence = 0
    expect(traceSurfaceChancePct(state, trace)).toBeCloseTo(B.traceBaseChancePct * B.traceSeverityFactor[0]!, 9)
    state.meta.turn = 10 // ålder 4
    expect(traceSurfaceChancePct(state, trace)).toBeCloseTo((B.traceBaseChancePct + 4 * B.traceAgeChancePerTurn) * B.traceSeverityFactor[0]!, 9)
    const aged = traceSurfaceChancePct(state, trace)
    official.scandalRisk = 50
    expect(traceSurfaceChancePct(state, trace)).toBeCloseTo(aged + 50 * B.traceScandalRiskWeight * B.traceSeverityFactor[0]!, 9)
    state.factions['rvn']!.counterIntelligence = 80
    const cs = traceSurfaceChancePct(state, trace)
    expect(cs).toBeGreaterThan(aged)
    trace.severity = 3
    expect(traceSurfaceChancePct(state, trace)).toBeGreaterThan(cs)
    trace.severity = 1
    state.house.standingOrders!.legal = { sinceTurn: 0 }
    expect(traceSurfaceChancePct(state, trace)).toBeCloseTo(cs * B.traceLegalFactor, 9)
    delete state.house.standingOrders!.legal
    official.scandalRisk = 100
    state.meta.turn = 2000
    expect(traceSurfaceChancePct(state, trace)).toBe(B.traceChanceCap)
  })
})

describe('att ett spår kommer fram (P125, §8.3)', () => {
  it('drar ctx.rng per öppet spår: träff ger ett utredningskort (status surfaced, frist, rubrik), miss låter spåret ligga kvar', () => {
    const hit = fresh()
    const trace = addTrace(hit)
    const { ctx, emitted } = makeCtx(hit, ALWAYS)
    advanceTraces(ctx)
    expect(trace.status).toBe('surfaced')
    expect(trace.surfacedTurn).toBe(6)
    expect(trace.deadlineTurn).toBe(6 + B.traceDeadlineTurns)
    const row = emitted.find((e) => e.severity === 'headline' && e.headline.startsWith('SCANDAL:'))!
    expect(row.actorIsPlayer).toBe(true)
    expect(row.headline).toContain('REPUBLIC OF VIETNAM')

    const miss = fresh()
    const t2 = addTrace(miss)
    advanceTraces(makeCtx(miss, NEVER).ctx)
    expect(t2.status).toBe('open')
  })

  it('utan öppna spår drar steget aldrig ur slumpen', () => {
    const state = fresh()
    const { ctx } = makeCtx(state, createRng('untouched', 0))
    const before = ctx.rng.cursor()
    advanceTraces(ctx)
    expect(ctx.rng.cursor()).toBe(before)
  })

  it('ett regimskifte öppnar arkiven: varje öppet spår hos den faktionen (husets och rivalernas) får en engångschans', () => {
    const state = fresh()
    const mine = addTrace(state, { buyerId: 'rvn' })
    const rival = addTrace(state, { houseId: 'brandt', buyerId: 'rvn', severity: 1 })
    const elsewhere = addTrace(state, { buyerId: 'nlf', officialId: 'official-nlf-procurement' })
    const { ctx, emitted } = makeCtx(state, ALWAYS)
    openArchives(ctx, 'rvn', 'coup-1')
    expect(mine.status).toBe('surfaced')
    expect(rival.status).toBe('surfaced')
    expect(elsewhere.status).toBe('open')
    expect(emitted.some((e) => e.headline.includes('ARCHIVES') && e.causeId === 'coup-1')).toBe(true)
    // Utan träff händer inget.
    const calm = fresh()
    const t = addTrace(calm)
    openArchives(makeCtx(calm, NEVER).ctx, 'rvn', 'coup-1')
    expect(t.status).toBe('open')
    expect(B.traceArchivesChancePct).toBeGreaterThan(0)
  })
})

describe('utredningskortets tre vägar (P125, §8.3)', () => {
  it('valideras: okänt spår, spår som inte kommit fram, saknad roll vid OFFRA, för lite kassa vid FÖRLIKAS', () => {
    const state = fresh()
    const open = addTrace(state)
    const card = surfaced(state)
    expect(validateStandingOrderChange(state, state, respond('nope', 'DENY'))).toEqual({ ok: false, reason: 'unknown trace' })
    expect(validateStandingOrderChange(state, state, respond(open.id, 'DENY'))).toEqual({ ok: false, reason: 'that trace has not surfaced' })
    expect(validateStandingOrderChange(state, state, respond(card.id, 'DENY'))).toEqual({ ok: true })
    expect(validateStandingOrderChange(state, state, respond(card.id, 'SACRIFICE'))).toEqual({ ok: false, reason: 'choose which director to dismiss' })
    expect(validateStandingOrderChange(state, state, respond(card.id, 'SACRIFICE', 'chiefSalesman'))).toEqual({ ok: true })
    state.house.treasury = B.traceSettleCost * card.severity - 1
    expect(validateStandingOrderChange(state, state, respond(card.id, 'SETTLE'))).toEqual({ ok: false, reason: 'not enough cash to settle' })
    const other = fresh()
    const rival = surfaced(other, { houseId: 'brandt' })
    expect(validateStandingOrderChange(other, other, respond(rival.id, 'DENY'))).toEqual({ ok: false, reason: 'unknown trace' }) // en rivals spår har inget kort
  })

  it('FÖRLIKAS kostar traceSettleCost × allvaret (huvudboken: political) och sänker följdens allvar ett steg', () => {
    const state = fresh()
    const card = surfaced(state, { severity: 2 })
    const treasury = state.house.treasury
    const integrity = state.house.reputation.integrity
    const r = resolveTurn(state, { ...EMPTY, standingOrders: [respond(card.id, 'SETTLE')] })
    expect(r.rejected).toEqual([])
    expect(treasury - r.state.house.treasury).toBeGreaterThanOrEqual(B.traceSettleCost * 2)
    expect(r.state.ledger[r.state.ledger.length - 1]!.expenses.political).toBeGreaterThanOrEqual(B.traceSettleCost * 2)
    const closed = r.state.traces!.find((t) => t.id === card.id)!
    expect(closed.status).toBe('closed')
    expect(closed.resolution).toBe('settled')
    // allvar 2 − 1 = 1: bara rykteskostnaden, inget häva/avstängning.
    expect(integrity - r.state.house.reputation.integrity).toBe(B.traceIntegrityLoss[0])
    expect(r.state.house.suspendedFrom?.['rvn']).toBeUndefined()
  })

  it('OFFRA sänker en direktör (personalrollen) traceSacrificeStaffLoss och sänker följdens allvar ett steg', () => {
    const state = fresh()
    const card = surfaced(state, { severity: 2 })
    const before = state.house.staff.chiefSalesman
    const r = resolveTurn(state, { ...EMPTY, standingOrders: [respond(card.id, 'SACRIFICE', 'chiefSalesman')] })
    expect(r.rejected).toEqual([])
    expect(r.state.house.staff.chiefSalesman).toBe(Math.max(0, before - B.traceSacrificeStaffLoss))
    expect(r.state.traces!.find((t) => t.id === card.id)!.resolution).toBe('sacrificed')
    expect(r.wire.some((e) => e.actorIsPlayer && e.headline.includes('DISMISSES'))).toBe(true)
  })

  it('FÖRNEKA kostar inget nu men ger en liten ryktesförlust; spåret förblir öppet för avslöjande, och kan avslöjas senare med större följder', () => {
    const state = fresh()
    const card = surfaced(state, { severity: 2, contractId: 'contract-x' })
    state.market.contracts.push({ id: 'contract-x', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, unitsDelivered: 0, price: 1, unitCostAtSigning: 1, grade: 'A', dueTurn: 20, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0 })
    const integrity = state.house.reputation.integrity
    const treasury = state.house.treasury
    const r = resolveTurn(state, { ...EMPTY, standingOrders: [respond(card.id, 'DENY')] })
    const denied = r.state.traces!.find((t) => t.id === card.id)!
    expect(denied.status).toBe('surfaced')
    expect(denied.choice).toBe('DENY')
    expect(integrity - r.state.house.reputation.integrity).toBeGreaterThanOrEqual(B.traceDenyIntegrity)
    expect(r.state.house.treasury).toBeGreaterThanOrEqual(treasury - 2_000_000) // ingen betalning för kortet självt
    expect(r.state.market.contracts[0]!.status).toBe('active')

    // Senare turer: träff → avslöjat, allvaret +1 (högst 3): kontraktet hävs, huset stängs av.
    const later = fresh()
    const c2 = surfaced(later, { severity: 2, contractId: 'contract-x', choice: 'DENY' })
    later.market.contracts.push({ ...state.market.contracts[0]! })
    const { ctx, emitted } = makeCtx(later, ALWAYS)
    advanceTraces(ctx)
    expect(c2.status).toBe('closed')
    expect(c2.resolution).toBe('exposed')
    expect(later.market.contracts[0]!.status).toBe('voided')
    expect(later.house.suspendedFrom?.['rvn']).toBe(later.meta.turn + B.traceSuspendTurns)
    expect(emitted.some((e) => e.headline.includes('COVER-UP') || e.headline.includes('EXPOSED'))).toBe(true)
  })

  it('utan svar inom fristen räknas kortet som ett förnekande (som utredningar efter olycksfåglar)', () => {
    const state = fresh()
    const card = surfaced(state, { severity: 1 })
    state.meta.turn = card.deadlineTurn!
    advanceTraces(makeCtx(state, NEVER).ctx)
    expect(card.choice).toBe('DENY')
    expect(card.status).toBe('surfaced')
  })

  it('ett nekat kort som aldrig avslöjas stängs efter traceDenyLifeTurns utan följder', () => {
    const state = fresh()
    const card = surfaced(state, { severity: 2, choice: 'DENY' })
    state.meta.turn = card.surfacedTurn! + B.traceDenyLifeTurns
    advanceTraces(makeCtx(state, NEVER).ctx)
    expect(card.status).toBe('closed')
    expect(card.resolution).toBe('denied')
    expect(state.house.suspendedFrom?.['rvn']).toBeUndefined()
  })
})

describe('följderna efter allvar (P125, §8.3)', () => {
  const settle = (severity: 1 | 2 | 3, over: Partial<PaperTrace> = {}) => {
    // Effektivt allvar = allvar − 1 vid förlikning; för att prova varje nivå direkt används ett nekat kort som avslöjas (allvar + 1, max 3).
    const state = fresh()
    state.market.contracts.push({ id: 'contract-x', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, unitsDelivered: 0, price: 1, unitCostAtSigning: 1, grade: 'A', dueTurn: 20, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0 })
    const card = surfaced(state, { severity, contractId: 'contract-x', choice: 'DENY', ...over })
    const { ctx, emitted } = makeCtx(state, ALWAYS)
    advanceTraces(ctx)
    return { state, card, emitted }
  }

  it('allvar 1 (→ 2 vid avslöjande): sämre rykte och en krönikarad, kontraktet hävs, huset stängs av, tjänsteman tappar anseende, avdrag vid styrelsens nästa granskning', () => {
    const { state, card, emitted } = settle(1)
    const integrity = createInitialState('indochina-slice', 'trace-seed').house.reputation.integrity
    expect(integrity - state.house.reputation.integrity).toBe(B.traceIntegrityLoss[1])
    expect(card.resolution).toBe('exposed')
    expect(state.market.contracts[0]!.status).toBe('voided')
    expect(state.house.suspendedFrom?.['rvn']).toBe(state.meta.turn + B.traceSuspendTurns)
    expect(state.officials['official-rvn-procurement']!.standing).toBe(Math.max(0, createInitialState('indochina-slice', 'trace-seed').officials['official-rvn-procurement']!.standing - B.traceOfficialStandingLoss))
    expect(state.house.boardDeduction).toBe(B.traceBoardDeduction[2])
    expect(state.house.reputation.quality).toBe(createInitialState('indochina-slice', 'trace-seed').house.reputation.quality - B.traceQualityLoss)
    expect(emitted.some((e) => e.headline.includes('VOIDED') && e.actorIsPlayer === false)).toBe(true)
  })

  it('allvar 2 (→ 3 vid avslöjande): tjänstemannen faller och ersätts (replaceOfficial får sin första "fallen"-utlösare), relationen nollställs', () => {
    const { state, emitted } = settle(2)
    const official = state.officials['official-rvn-procurement']!
    const original = createInitialState('indochina-slice', 'trace-seed').officials['official-rvn-procurement']!
    expect(official.name).not.toBe(original.name)
    expect(official.relationToPlayer).toBe(0)
    expect(official.scandalRisk).toBe(0)
    expect(official.status).toBe('active')
    expect(emitted.some((e) => e.headline.includes('FALLS') && e.headline.includes(original.name.toUpperCase()))).toBe(true)
    expect(state.house.boardDeduction).toBe(B.traceBoardDeduction[3])
  })

  it('en avslöjad förnekelse räknas till rubriken, och rykteshiten är större ju grövre följden', () => {
    const light = settle(1)
    const heavy = settle(2)
    expect(heavy.state.house.reputation.integrity).toBeLessThan(light.state.house.reputation.integrity)
  })
})

describe('rivalernas spår (P125, §8.3)', () => {
  it('ett avslöjat rivalspår diskvalificerar rivalen i en öppen infordran, sänker dess rykte och relation, utan kort åt spelaren', () => {
    const state = fresh()
    state.programmes = [
      {
        id: 'programme-1', buyerId: 'rvn', category: 'artillery', baseProductId: '105mm_field_gun', trigger: 'requirementCard', requirements: [], testEnvironment: 'jungle',
        grant: null, prize: { quantity: 10, deliveryTurns: 3, unitPrice: 1, advancePct: 0 }, phase: 'development', phaseSinceTurn: 3, announcedTurn: 0,
        entrants: [{ houseId: 'player', enteredTurn: 0 }, { houseId: 'brandt', enteredTurn: 0, boardBribed: true }], traces: ['trace-1'],
      },
    ]
    const trace = addTrace(state, { houseId: 'brandt', programmeId: 'programme-1', severity: 2 })
    const quality = state.rivals['brandt']!.reputation.quality
    const relation = state.rivals['brandt']!.relations['rvn'] ?? 0
    const { ctx, emitted } = makeCtx(state, ALWAYS)
    advanceTraces(ctx)
    expect(trace.status).toBe('closed')
    expect(state.programmes[0]!.entrants.find((e) => e.houseId === 'brandt')!.barred).toContain('IRREGULARITIES')
    expect(state.rivals['brandt']!.reputation.quality).toBe(quality - B.traceRivalQualityLoss)
    expect(state.rivals['brandt']!.relations['rvn']).toBe(Math.max(0, relation - B.traceRivalRelationLoss))
    expect(emitted.some((e) => e.headline.startsWith('SCANDAL:') && e.actorIsPlayer === false && e.headline.includes('BRANDT'))).toBe(true)
    expect(state.house.reputation.integrity).toBe(createInitialState('indochina-slice', 'trace-seed').house.reputation.integrity)
  })

  it('en anmäld rival (P124: spåret är surfaced) får följderna direkt', () => {
    const state = fresh()
    const trace = addTrace(state, { houseId: 'brandt', status: 'surfaced', severity: 1 })
    const quality = state.rivals['brandt']!.reputation.quality
    advanceTraces(makeCtx(state, NEVER).ctx)
    expect(trace.status).toBe('closed')
    expect(state.rivals['brandt']!.reputation.quality).toBe(quality - B.traceRivalQualityLoss)
  })
})

describe('källorna till spår (P125, beslut 9N)', () => {
  it('mutan i ett vanligt bud ger ett spår (kind bidBribe), med muta noll inget', () => {
    const state = fresh()
    const order: Order = {
      id: 'order-9', buyerId: 'rvn', productId: 'm1_rifle', quantity: 500, statedBudget: 400000, trueBudget: 500000, referencePrice: 380000, requiredDeliveryTurns: 2, expiresTurn: 6,
      competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
    }
    state.market.openOrders = [order]
    const bid = (bribe: number) => ({ orderId: 'order-9', price: 380000, deliveryTurns: 2, grade: 'A' as const, bribe, })
    const withBribe = resolveTurn(state, { ...EMPTY, bids: [bid(50_000)] }).state
    expect(withBribe.traces!.filter((t) => t.kind === 'bidBribe' && t.houseId === 'player')).toHaveLength(1)
    const state2 = fresh()
    state2.market.openOrders = [{ ...order }]
    const clean = resolveTurn(state2, { ...EMPTY, bids: [bid(0)] }).state
    expect((clean.traces ?? []).filter((t) => t.kind === 'bidBribe')).toEqual([])
  })

  it('BRIBE, FAVOUR och BROKER ger var sitt spår hos tjänstemannens land', () => {
    const state = fresh()
    state.officials['official-rvn-procurement']!.relationToPlayer = 80
    const actions: PlayerAction[] = [
      { type: 'POLITICAL', op: 'BRIBE', officialId: 'official-rvn-procurement', spend: 50_000 },
      { type: 'POLITICAL', op: 'FAVOUR', officialId: 'official-rvn-procurement', marginCost: 10 },
      { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 500, price: 380000 },
    ] as PlayerAction[]
    const r = resolveTurn(state, { ...EMPTY, actions })
    const kinds = (r.state.traces ?? []).filter((t) => t.houseId === 'player').map((t) => t.kind)
    expect(kinds).toContain('bribe')
    expect(kinds).toContain('favour')
    expect(kinds).toContain('broker')
    for (const t of r.state.traces!) expect(t.buyerId).toBe('rvn')
  })

  it('recordTrace ger varje spår ett eget löpnummer och en rad', () => {
    const state = fresh()
    const { ctx, emitted } = makeCtx(state)
    const a = recordTrace(ctx, { houseId: 'player', officialId: null, buyerId: 'rvn', kind: 'bribe', severity: 1 }, null)
    const b = recordTrace(ctx, { houseId: 'player', officialId: null, buyerId: 'rvn', kind: 'bribe', severity: 1 }, null)
    expect(a.id).not.toBe(b.id)
    expect(emitted).toHaveLength(2)
  })
})

describe('juridisk rådgivning (stående order) (P125, §8.3)', () => {
  const LEGAL = (op: 'SET' | 'CANCEL'): StandingOrderChange => ({ kind: 'LEGAL', op }) as StandingOrderChange

  it('valideras: kan sägas upp bara om den finns, och sättas om den inte redan gäller', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, LEGAL('SET'))).toEqual({ ok: true })
    expect(validateStandingOrderChange(state, state, LEGAL('CANCEL'))).toEqual({ ok: false, reason: 'no legal counsel retained' })
    state.house.standingOrders!.legal = { sinceTurn: 0 }
    expect(validateStandingOrderChange(state, state, LEGAL('SET'))).toEqual({ ok: false, reason: 'legal counsel already retained' })
    expect(validateStandingOrderChange(state, state, LEGAL('CANCEL'))).toEqual({ ok: true })
  })

  it('kostar legalCounselCostPerTurn varje tur (huvudboken: political), från nästa tur; kostar ingen handling', () => {
    const state = fresh()
    const ap = state.house.actionPoints
    const r1 = resolveTurn(state, { ...EMPTY, standingOrders: [LEGAL('SET')] })
    expect(r1.rejected).toEqual([])
    expect(r1.state.house.standingOrders!.legal).toEqual({ sinceTurn: 7 })
    expect(r1.state.house.actionPoints).toBe(ap)
    const r2 = resolveTurn(r1.state, EMPTY)
    expect(r2.state.ledger[r2.state.ledger.length - 1]!.expenses.political).toBeGreaterThanOrEqual(B.legalCounselCostPerTurn)
  })

  it('lämnar ett eget litet spår var legalTraceEveryTurns:e tur, och lapsar med en rad när kassan inte räcker', () => {
    const state = fresh()
    state.house.standingOrders!.legal = { sinceTurn: 0 }
    state.meta.turn = B.legalTraceEveryTurns * 3
    const { ctx } = makeCtx(state)
    advanceTraces(ctx)
    expect(state.traces!.some((t) => t.kind === 'legal' && t.severity === 1)).toBe(true)

    const poor = fresh()
    poor.house.standingOrders!.legal = { sinceTurn: 0 }
    poor.house.treasury = 0
    const { ctx: pctx, emitted } = makeCtx(poor)
    advanceTraces(pctx)
    expect(poor.house.standingOrders!.legal).toBeUndefined()
    expect(emitted.some((e) => e.headline.includes('LEGAL COUNSEL') && e.headline.includes('LAPSES'))).toBe(true)
  })
})

describe('rent rykte (P125, §8.4)', () => {
  it('reputation.integrity startar på integrityStart', () => {
    expect(fresh().house.reputation.integrity).toBe(B.integrityStart)
  })

  it('stiger traceIntegrityGain var traceCleanTurns:e tur när inget spår kommit fram, med en rad; stannar vid 100', () => {
    const state = fresh()
    state.meta.turn = B.traceCleanTurns * 2
    const { ctx, emitted } = makeCtx(state)
    advanceTraces(ctx)
    expect(state.house.reputation.integrity).toBe(B.integrityStart + B.traceIntegrityGain)
    expect(emitted.some((e) => e.headline.includes('PROBITY'))).toBe(true)
    state.house.reputation.integrity = 99
    advanceTraces(makeCtx(state).ctx)
    expect(state.house.reputation.integrity).toBe(100)
    const off = fresh()
    off.meta.turn = B.traceCleanTurns * 2 + 1
    advanceTraces(makeCtx(off).ctx)
    expect(off.house.reputation.integrity).toBe(B.integrityStart)
  })

  it('stiger inte när ett spår kommit fram nyligen', () => {
    const state = fresh()
    state.meta.turn = B.traceCleanTurns * 2
    surfaced(state, { surfacedTurn: state.meta.turn - 1, choice: 'DENY' })
    advanceTraces(makeCtx(state).ctx)
    expect(state.house.reputation.integrity).toBe(B.integrityStart)
  })

  it('integrityBidTerm: ett rent hus får en bonus hos en tjänsteman med hög integritet, ett smutsigt en avdrag, och en korrupt tjänsteman bryr sig inte', () => {
    const state = fresh()
    const order = { buyerId: 'rvn', officialId: 'official-rvn-procurement' } as Order
    const official = state.officials['official-rvn-procurement']!
    official.integrity = 100
    state.house.reputation.integrity = 100
    expect(integrityBidTerm(state, order)).toBeCloseTo(B.traceIntegrityBidWeight, 9)
    state.house.reputation.integrity = 0
    expect(integrityBidTerm(state, order)).toBeCloseTo(-B.traceIntegrityBidWeight, 9)
    state.house.reputation.integrity = B.integrityStart
    expect(integrityBidTerm(state, order)).toBeCloseTo(0, 9)
    state.house.reputation.integrity = 100
    official.integrity = 0
    expect(integrityBidTerm(state, order)).toBeCloseTo(0, 9)
  })

  it('bidEstimate läser samma term (en formel, en källa): vinstchansen är högre för ett rent hus än för ett smutsigt hos samma tjänsteman', () => {
    const base = fresh()
    base.officials['official-rvn-procurement']!.integrity = 100
    const order: Order = {
      id: 'o', buyerId: 'rvn', productId: 'm1_rifle', quantity: 500, statedBudget: 450000, trueBudget: 500000, referencePrice: 380000, requiredDeliveryTurns: 2, expiresTurn: 9,
      competingRivals: ['brandt', 'costigan', 'meridian'], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
    }
    const clean = JSON.parse(JSON.stringify(base)) as GameState
    clean.house.reputation.integrity = 100
    const dirty = JSON.parse(JSON.stringify(base)) as GameState
    dirty.house.reputation.integrity = 0
    const sum = (s: GameState) => bidEstimate(s, order, 'A').winBand.reduce((a, p) => a + p.confidence, 0)
    expect(sum(clean)).toBeGreaterThan(sum(dirty))
  })

  it('en avstängd köpare avvisar bud: suspendedFrom stoppar anbud hos den köparen tills fristen gått ut', () => {
    const state = fresh()
    state.house.suspendedFrom = { rvn: 12 }
    const order: Order = {
      id: 'order-9', buyerId: 'rvn', productId: 'm1_rifle', quantity: 500, statedBudget: 400000, trueBudget: 500000, referencePrice: 380000, requiredDeliveryTurns: 2, expiresTurn: 6,
      competingRivals: [], weights: { price: 0.55, delivery: 0.3, relationship: 0.15 }, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 0,
    }
    state.market.openOrders = [order]
    const r = resolveTurn(state, { ...EMPTY, bids: [{ orderId: 'order-9', price: 380000, deliveryTurns: 2, grade: 'A', bribe: 0 }] })
    expect(r.rejected.map((x) => x.reason)).toContain('suspended from this buyer')
    expect(r.state.market.contracts).toHaveLength(0)
    // Efter fristen går budet igenom.
    const later = fresh()
    later.house.suspendedFrom = { rvn: 5 }
    later.market.openOrders = [{ ...order }]
    const ok = resolveTurn(later, { ...EMPTY, bids: [{ orderId: 'order-9', price: 380000, deliveryTurns: 2, grade: 'A', bribe: 0 }] })
    expect(ok.rejected.map((x) => x.reason)).not.toContain('suspended from this buyer')
  })

  it('styrelsens granskning drar av boardDeduction (en gång) från framstegen; avdraget nollställs med en rad', () => {
    const run = (deduction: number) => {
      const state = fresh()
      state.meta.turn = state.house.boardTarget.reviewTurns[0]!
      state.house.boardDeduction = deduction
      state.house.boardTarget.progressSnapshot = 0
      const r = resolveTurn(state, EMPTY)
      return r
    }
    const none = run(0)
    expect(none.state.house.boardDeduction ?? 0).toBe(0)
    const ded = run(5)
    expect(ded.state.house.boardDeduction ?? 0).toBe(0)
    expect(ded.wire.some((e) => e.headline.includes('DEDUCTION'))).toBe(true)
  })

  it('epilogen: cleanHouse är sant för ett hus med hög integritet och inget avslöjat spår, annars falskt; verdict bär fältet', () => {
    const state = fresh()
    state.house.reputation.integrity = B.traceCleanHouseIntegrity
    expect(cleanHouse(state)).toBe(true)
    expect(scenarioVerdict(state).cleanHouse).toBe(true)
    surfaced(state)
    expect(cleanHouse(state)).toBe(false)
    const low = fresh()
    low.house.reputation.integrity = B.traceCleanHouseIntegrity - 1
    expect(cleanHouse(low)).toBe(false)
  })
})
