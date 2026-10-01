// programme.tricks.test.ts — P124 (ETAPP9_FORSLAG.md §8.2, beslut 9M och 9O, skyddsräcke 7). De sex knepen, rivalernas fusk och anmälan.
//
// Dragen görs i upphandlingsmappen och kostar en handling var (PROCUREMENT, en op per knep): motköp (P123), skriva kravet, handbyggt
// provexemplar, muta provnämnden, förfalska protokollet och underbud; SABOTAGE och LEAK får upphandlingen som mål. Varje korrupt drag
// ger ett pappersspår (traces.ts; P125 låter det komma fram). Rivalerna fuskar efter temperament, och en rival som fuskat kan anmälas
// (ingen handling) med underrättelse i köparens land: rätt → diskvalificerad, fel → relationen till tjänstemannen sjunker.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { advanceProgrammes, applyProcurement, measureEntrant, programmeProtocol, programmeRequirements } from '../src/programme.js'
import { previewAction } from '../src/previewAction.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { validateAction } from '../src/validateAction.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, GameState, PlayerAction, Programme, Station, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  programmeWriteSpecRelationFloor: number
  programmeWriteSpecBribeCost: number
  programmeSpecTiltPoints: number
  programmeSpecTiltWeight: number
  programmeRefuseIntegrityFloor: number
  programmeRefusePctPerPoint: number
  programmeRefuseRelationPenalty: number
  programmeHandbuiltBonus: number
  programmeBoardBribeCost: number
  programmeBoardBribeBonus: number
  programmeFalsifyCost: number
  programmeLowballDiscountPct: number
  programmeLowballScore: number
  programmeLowballOverrunTurns: number
  programmeLowballRecoupFactor: number
  programmeLowballHearingPct: number
  programmeLowballHearingRelationPenalty: number
  programmeRivalCheatPct: Record<string, number>
  programmeReportRelationPenalty: number
  programmeSabotagePenalty: number
  programmeLeakPenalty: number
  programmeDevelopmentTurns: number
  intelCovertOpCost: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const NO_NOISE = { int: () => 0, chance: () => false, next: () => 0, pick: <T,>(a: readonly T[]) => a[0]!, cursor: () => 0 } as unknown as ResolveContext['rng']

function makeCtx(state: GameState, rng?: ResolveContext['rng']): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: rng ?? createRng('tricks', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function seedWhere(pct: number, hit: boolean): string {
  for (let i = 0; i < 500; i++) if (createRng(`t${i}`, 0).chance(pct) === hit) return `t${i}`
  throw new Error('no seed')
}

function tuned(performance: number, reliability: number, unitCostFactor = 1): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance,
    reliability,
    unitCostFactor,
    trueQuality: (performance + reliability) / 2,
    uncertainty: 2,
    latentFlaw: null,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
  }
}

function fresh(phase: Programme['phase'], d: Design | null = tuned(70, 70), over: Partial<Programme> = {}): GameState {
  const state = createInitialState('indochina-slice', 'tricks-seed')
  state.house.designs = d ? [d] : []
  state.house.treasury = 20_000_000
  state.meta.turn = 5
  state.programmes = [
    {
      id: 'programme-1',
      buyerId: 'rvn',
      category: 'artillery',
      baseProductId: '105mm_field_gun',
      trigger: 'requirementCard',
      requirements: programmeRequirements(state, 'rvn', 'artillery'),
      testEnvironment: 'jungle',
      grant: null,
      prize: { quantity: 60, deliveryTurns: 5, unitPrice: 19_000, advancePct: 10 },
      phase,
      phaseSinceTurn: 4,
      announcedTurn: 0,
      entrants: [{ houseId: 'player', enteredTurn: 0, ...(d ? { designId: d.id } : {}) }, { houseId: 'brandt', enteredTurn: 0 }],
      traces: [],
      ...over,
    },
  ]
  return state
}

const PROC = (op: string, extra: object = {}): PlayerAction => ({ type: 'PROCUREMENT', op, programmeId: 'programme-1', ...extra }) as PlayerAction
const station = (nation: string, depth: Station['depth']): Station => ({ id: `st-${nation}`, city: nation, nation, depth, exposure: 0, coverage: ['procurement'], status: 'active' })
const player = (s: GameState) => s.programmes![0]!.entrants.find((e) => e.houseId === 'player')!

describe('skriva kravet (WRITE_SPEC) (P124, §8.2)', () => {
  const write = (kind = 'performance', bribe = false): PlayerAction => PROC('WRITE_SPEC', { requirementKind: kind, ...(bribe ? { bribe: true } : {}) })

  it('valideras: bara i anbudsinfordran, med relation över golvet eller muta, mot en egen konstruktion i kategorin', () => {
    const state = fresh('announced')
    state.officials['official-rvn-procurement']!.relationToPlayer = B.programmeWriteSpecRelationFloor
    expect(validateAction(state, state, write())).toEqual({ ok: true })
    state.officials['official-rvn-procurement']!.relationToPlayer = B.programmeWriteSpecRelationFloor - 1
    expect(validateAction(state, state, write())).toEqual({ ok: false, reason: 'relation too low to influence the requirements' })
    expect(validateAction(state, state, write('performance', true))).toEqual({ ok: true })
    state.house.treasury = B.programmeWriteSpecBribeCost - 1
    expect(validateAction(state, state, write('performance', true))).toEqual({ ok: false, reason: 'not enough cash for the bribe' })
    const locked = fresh('specLocked')
    expect(validateAction(locked, locked, write('performance', true))).toEqual({ ok: false, reason: 'the requirements are locked' })
    const none = fresh('announced', null)
    expect(validateAction(none, none, write('performance', true))).toEqual({ ok: false, reason: 'no design to tilt the requirements towards' })
    expect(validateAction(state, state, write('delivery', true))).toEqual({ ok: false, reason: 'that requirement cannot be influenced' })
  })

  it('lutar en kravrad mot husets konstruktion: kravet stiger mot dess värde (aldrig över det) och raden väger tyngre; ger ett litet spår och en rubrik', () => {
    const state = fresh('announced', tuned(80, 70))
    state.officials['official-rvn-procurement']!.relationToPlayer = 80
    state.officials['official-rvn-procurement']!.integrity = 10
    const before = state.programmes![0]!.requirements.find((r) => r.kind === 'performance')!
    const result = resolveTurn(state, { ...EMPTY, actions: [write()] })
    expect(result.rejected).toEqual([])
    const after = result.state.programmes![0]!.requirements.find((r) => r.kind === 'performance')!
    expect(after.threshold).toBe(Math.min(80, before.threshold + B.programmeSpecTiltPoints))
    expect(after.weight).toBe(before.weight + B.programmeSpecTiltWeight)
    expect(result.state.traces!.some((t) => t.houseId === 'player' && t.kind === 'writeSpec' && t.programmeId === 'programme-1')).toBe(true)
    expect(result.wire.some((e) => e.actorIsPlayer && e.headline.includes('REQUIREMENT'))).toBe(true)
    expect(result.state.programmes![0]!.traces).toHaveLength(1)
  })

  it('en bribe kostar pengar (huvudbokens political) och ersätter relationskravet', () => {
    const state = fresh('announced')
    state.officials['official-rvn-procurement']!.relationToPlayer = 0
    state.officials['official-rvn-procurement']!.integrity = 0
    const treasury = state.house.treasury
    const result = resolveTurn(state, { ...EMPTY, actions: [write('performance', true)] })
    expect(result.rejected).toEqual([])
    expect(treasury - result.state.house.treasury).toBeGreaterThanOrEqual(B.programmeWriteSpecBribeCost)
    expect(result.state.ledger[result.state.ledger.length - 1]!.expenses.political).toBeGreaterThanOrEqual(B.programmeWriteSpecBribeCost)
  })

  it('en tjänsteman med hög integritet kan vägra och rapportera: relationen sjunker, kravet rörs inte, inget spår', () => {
    const state = fresh('announced')
    const official = state.officials['official-rvn-procurement']!
    official.integrity = 100
    official.relationToPlayer = 80
    const pct = (100 - B.programmeRefuseIntegrityFloor) * B.programmeRefusePctPerPoint
    const before = JSON.stringify(state.programmes![0]!.requirements)
    const { ctx, emitted } = makeCtx(state, createRng(seedWhere(pct, true), 0))
    // Direkt via tillämparen (en handling genom resolveTurn skulle dra andra slumptal först).
    applyProcurement(ctx, write() as Extract<PlayerAction, { type: 'PROCUREMENT' }>)
    expect(JSON.stringify(state.programmes![0]!.requirements)).toBe(before)
    expect(state.officials['official-rvn-procurement']!.relationToPlayer).toBe(80 - B.programmeRefuseRelationPenalty)
    expect(state.traces ?? []).toEqual([])
    expect(emitted.some((e) => e.headline.includes('REFUSES') || e.headline.includes('REPORTS'))).toBe(true)
  })
})

describe('handbyggt provexemplar (HANDBUILT) (P124, §8.2)', () => {
  it('bara under utveckling och prov; ger högre prototypfaktor i provet och ett tekniskt spår; kostar en handling', () => {
    const state = fresh('development')
    expect(validateAction(state, state, PROC('HANDBUILT'))).toEqual({ ok: true })
    const early = fresh('announced')
    expect(validateAction(early, early, PROC('HANDBUILT'))).toEqual({ ok: false, reason: 'prototypes are built later in the programme' })
    const result = resolveTurn(state, { ...EMPTY, actions: [PROC('HANDBUILT')] })
    expect(player(result.state).handbuilt).toBe(true)
    expect(result.state.traces!.some((t) => t.kind === 'handbuilt' && t.houseId === 'player')).toBe(true)

    const plain = fresh('trial')
    const built = fresh('trial')
    player(built).handbuilt = true
    const m = (s: GameState) => measureEntrant(s, s.programmes![0]!, player(s), NO_NOISE)
    expect(m(built).performance - m(plain).performance).toBe(B.programmeHandbuiltBonus)
    expect(m(built).reliability - m(plain).reliability).toBe(B.programmeHandbuiltBonus)
  })
})

describe('muta provnämnden (BRIBE_BOARD) (P124, §8.2)', () => {
  it('kostar pengar och en handling, ger ett bättre protokoll (båda mätvärdena) och ett medelstort spår', () => {
    const state = fresh('trial')
    const treasury = state.house.treasury
    const result = resolveTurn(state, { ...EMPTY, actions: [PROC('BRIBE_BOARD')] })
    expect(result.rejected).toEqual([])
    expect(player(result.state).boardBribed).toBe(true)
    expect(result.state.traces!.some((t) => t.kind === 'bribeBoard' && t.severity === 2)).toBe(true)
    expect(treasury - result.state.house.treasury).toBeGreaterThanOrEqual(B.programmeBoardBribeCost)
    const plain = fresh('trial')
    const bribed = fresh('trial')
    player(bribed).boardBribed = true
    const m = (s: GameState) => measureEntrant(s, s.programmes![0]!, player(s), NO_NOISE)
    expect(m(bribed).performance - m(plain).performance).toBe(B.programmeBoardBribeBonus)
  })

  it('valideras: kassa räcker och en gång per infordran', () => {
    const state = fresh('development')
    state.house.treasury = B.programmeBoardBribeCost - 1
    expect(validateAction(state, state, PROC('BRIBE_BOARD'))).toEqual({ ok: false, reason: 'not enough cash for the bribe' })
    const done = fresh('development')
    player(done).boardBribed = true
    expect(validateAction(done, done, PROC('BRIBE_BOARD'))).toEqual({ ok: false, reason: 'already offered' })
  })
})

describe('förfalska protokoll (FALSIFY) (P124, §8.2)', () => {
  it('ett underkänt ska-krav räknas som godkänt (ingen diskvalificering), protokollet visar godkänt, och ett stort spår lämnas', () => {
    const weak = fresh('trial', tuned(30, 70))
    const honest = weak
    advanceProgrammes(makeCtx(honest, NO_NOISE).ctx)
    expect(honest.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!.disqualified).toContain('PERFORMANCE')

    const forged = fresh('trial', tuned(30, 70))
    const r = resolveTurn(forged, { ...EMPTY, actions: [PROC('FALSIFY')] })
    expect(r.rejected).toEqual([])
    expect(r.state.traces!.some((t) => t.kind === 'falsify' && t.severity === 3)).toBe(true)
    const treasury = forged.house.treasury
    expect(treasury - r.state.house.treasury).toBeGreaterThanOrEqual(B.programmeFalsifyCost)

    const direct = fresh('trial', tuned(30, 70))
    player(direct).falsified = true
    advanceProgrammes(makeCtx(direct, NO_NOISE).ctx)
    const score = direct.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!
    expect(score.disqualified).toBeNull()
    expect(score.rows.find((row) => row.kind === 'performance')!.pass).toBe(true) // protokollet visar förfalskningen
    expect(programmeProtocol(direct, direct.programmes![0]!)!.entries.find((e) => e.houseId === 'player')!.disqualified).toBeNull()
  })
})

describe('underbud (LOWBALL) (P124, §8.2)', () => {
  it('ger extra provpoäng och en lägre serieprisnivå; ingen spårpost (gråzon)', () => {
    const state = fresh('trial', tuned(70, 70))
    const result = resolveTurn(state, { ...EMPTY, actions: [PROC('LOWBALL')] })
    expect(player(result.state).lowball).toBe(true)
    expect(result.state.traces ?? []).toEqual([])
    const plain = fresh('trial', tuned(70, 70))
    const low = fresh('trial', tuned(70, 70))
    player(low).lowball = true
    advanceProgrammes(makeCtx(plain, NO_NOISE).ctx)
    advanceProgrammes(makeCtx(low, NO_NOISE).ctx)
    const sp = plain.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!.score
    const sl = low.programmes![0]!.result!.scores.find((s) => s.houseId === 'player')!.score
    expect(sl - sp).toBeCloseTo(B.programmeLowballScore, 9)
  })

  it('vinner huset sänks serieprisets nivå, och efter programmeLowballOverrunTurns kommer en tilläggsbeställning (intäkt) — eventuellt en utfrågning som halverar resten', () => {
    const make = (): GameState => {
      const s = fresh('trial', tuned(95, 95, 0.6))
      player(s).lowball = true
      s.programmes![0]!.entrants = s.programmes![0]!.entrants.filter((e) => e.houseId === 'player')
      return s
    }
    const state = make()
    advanceProgrammes(makeCtx(state, NO_NOISE).ctx)
    const p = state.programmes![0]!
    expect(p.result!.winner).toBe('player')
    const contract = state.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!
    expect(contract.price).toBe(Math.round(p.prize.quantity * p.prize.unitPrice * (1 - B.programmeLowballDiscountPct / 100)))
    expect(p.lowball).toMatchObject({ houseId: 'player' })

    // Före tiden händer inget.
    state.meta.turn += B.programmeLowballOverrunTurns - 1
    const t0 = state.house.treasury
    advanceProgrammes(makeCtx(state, NO_NOISE).ctx)
    expect(state.house.treasury).toBe(t0)
    // Vid tiden: en tilläggsbeställning ger intäkt (ingen utfrågning med brusfri rng där chance() alltid är falsk).
    state.meta.turn += 1
    const quantity = contract.quantity
    const { ctx, emitted } = makeCtx(state, NO_NOISE)
    advanceProgrammes(ctx)
    expect(state.house.treasury).toBeGreaterThan(t0)
    expect(emitted.some((e) => e.actorIsPlayer && e.headline.includes('SUPPLEMENTARY'))).toBe(true)
    expect(contract.quantity).toBe(quantity)
    expect(p.lowball).toBeUndefined()

    // Med en utfrågning (chance träffar) halveras kontraktets återstående serie och relationen sjunker.
    const heard = make()
    advanceProgrammes(makeCtx(heard, NO_NOISE).ctx)
    heard.meta.turn += B.programmeLowballOverrunTurns
    const relation = heard.officials['official-rvn-procurement']!.relationToPlayer
    const hit = { ...NO_NOISE, chance: () => true } as unknown as ResolveContext['rng']
    advanceProgrammes(makeCtx(heard, hit).ctx)
    const c2 = heard.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!
    expect(c2.quantity).toBeLessThan(heard.programmes![0]!.prize.quantity)
    expect(heard.officials['official-rvn-procurement']!.relationToPlayer).toBe(relation - B.programmeLowballHearingRelationPenalty)
  })
})

describe('SABOTAGE och LEAK mot en upphandling (P124, §8.2)', () => {
  const op = (kind: 'SABOTAGE' | 'LEAK'): PlayerAction => ({ type: 'INTEL', op: kind, stationId: 'st-rvn', targetId: 'programme:programme-1:brandt' }) as PlayerAction
  const ready = (): GameState => {
    const s = fresh('development')
    s.house.stations = [station('rvn', 2)]
    return s
  }

  it('valideras: infordran och rival måste finnas och rivalen vara deltagare', () => {
    const s = ready()
    expect(validateAction(s, s, op('SABOTAGE'))).toEqual({ ok: true })
    expect(validateAction(s, s, { ...op('LEAK'), targetId: 'programme:nope:brandt' } as PlayerAction)).toEqual({ ok: false, reason: 'unknown programme target' })
    expect(validateAction(s, s, { ...op('LEAK'), targetId: 'programme:programme-1:meridian' } as PlayerAction)).toEqual({ ok: false, reason: 'unknown programme target' })
    expect(previewAction(s, op('SABOTAGE')).cost).toBe(B.intelCovertOpCost)
  })

  it('lyckad SABOTAGE sänker rivalens uppmätta värden i provet, lyckad LEAK dess provpoäng; misslyckad gör inget av det', () => {
    let sab: GameState | null = null
    let leak: GameState | null = null
    for (let i = 0; i < 60 && (!sab || !leak); i++) {
      const s = ready()
      s.meta.seed = `sab-${i}`
      const r = resolveTurn(s, { ...EMPTY, actions: [op('SABOTAGE')] }).state
      if (r.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!.sabotaged) sab = r
      const t = ready()
      t.meta.seed = `leak-${i}`
      const l = resolveTurn(t, { ...EMPTY, actions: [op('LEAK')] }).state
      if (l.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!.leaked) leak = l
    }
    expect(sab).not.toBeNull()
    expect(leak).not.toBeNull()
    const plain = ready()
    const brandt = (s: GameState) => s.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!
    const base = measureEntrant(plain, plain.programmes![0]!, brandt(plain), NO_NOISE)
    const hit = measureEntrant(sab!, sab!.programmes![0]!, brandt(sab!), NO_NOISE)
    expect(base.performance - hit.performance).toBe(B.programmeSabotagePenalty)
    expect(base.reliability - hit.reliability).toBe(B.programmeSabotagePenalty)
    const leakM = measureEntrant(leak!, leak!.programmes![0]!, brandt(leak!), NO_NOISE)
    expect(leakM.scoreAdjust).toBe(-B.programmeLeakPenalty)
  })
})

describe('rivalernas fusk efter temperament (P124, §8.2)', () => {
  const toTrial = (): GameState => {
    const s = fresh('development', tuned(70, 70), { phaseSinceTurn: 0 })
    s.meta.turn = B.programmeDevelopmentTurns
    return s
  }

  it('när provet börjar kan en rival med hårt temperament muta nämnden (ctx.rng): ett spår för rivalen, och ett bättre mätvärde', () => {
    const cheat = toTrial()
    const pct = B.programmeRivalCheatPct[cheat.rivals['brandt']!.temperament]!
    advanceProgrammes(makeCtx(cheat, createRng(seedWhere(pct, true), 0)).ctx)
    const brandt = cheat.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!
    expect(brandt.boardBribed).toBe(true)
    expect(cheat.traces!.some((t) => t.houseId === 'brandt' && t.kind === 'bribeBoard')).toBe(true)
    expect(cheat.programmes![0]!.phase).toBe('trial')

    const clean = toTrial()
    advanceProgrammes(makeCtx(clean, createRng(seedWhere(pct, false), 0)).ctx)
    expect(clean.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!.boardBribed).toBeUndefined()
    expect(clean.traces ?? []).toEqual([])
  })

  it('en försiktig rival fuskar mer sällan än en opportunist, och temperamenten finns i datan', () => {
    expect(B.programmeRivalCheatPct['opportunist']).toBeGreaterThan(B.programmeRivalCheatPct['cautious']!)
    expect(Object.keys(B.programmeRivalCheatPct).sort()).toEqual(['cautious', 'opportunist', 'patriot'])
  })
})

describe('anmälan av en rival (stående order, ingen handling) (P124, §8.2)', () => {
  const REPORT: StandingOrderChange = { kind: 'PROGRAMME', op: 'REPORT', programmeId: 'programme-1', rivalId: 'brandt' }
  const withIntel = (cheated: boolean): GameState => {
    const s = fresh('trial')
    s.house.stations = [station('rvn', 2)]
    const brandt = s.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!
    if (cheated) {
      brandt.boardBribed = true
      s.traces = [{ id: 'trace-1', houseId: 'brandt', officialId: 'official-rvn-procurement', buyerId: 'rvn', kind: 'bribeBoard', severity: 2, turn: 4, programmeId: 'programme-1', status: 'open' }]
      s.programmes![0]!.traces = ['trace-1']
    }
    return s
  }

  it('valideras: kräver underrättelse i köparens land, en deltagande rival och en öppen infordran', () => {
    const s = withIntel(true)
    expect(resolveTurn(s, { ...EMPTY, standingOrders: [REPORT] }).rejected).toEqual([])
    const blind = withIntel(true)
    blind.house.stations = []
    blind.house.staff.chiefSalesman = 0
    expect(resolveTurn(blind, { ...EMPTY, standingOrders: [REPORT] }).rejected.map((r) => r.reason)).toEqual(['you need intelligence in the buyer country to report a rival'])
    const unknown = withIntel(true)
    expect(resolveTurn(unknown, { ...EMPTY, standingOrders: [{ ...REPORT, rivalId: 'meridian' } as StandingOrderChange] }).rejected.map((r) => r.reason)).toEqual(['unknown entrant'])
  })

  it('har du rätt diskvalificeras rivalen (provet) och spåret går vidare; kostar ingen handling', () => {
    const s = withIntel(true)
    const actionPoints = s.house.actionPoints
    const r = resolveTurn(s, { ...EMPTY, standingOrders: [REPORT] })
    expect(r.state.house.actionPoints).toBe(actionPoints)
    const brandt = r.state.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!
    expect(brandt.barred).toContain('IRREGULARITIES')
    expect(r.wire.some((e) => e.actorIsPlayer && e.headline.includes('REPORTS'))).toBe(true)
    expect(r.state.traces!.find((t) => t.id === 'trace-1')!.status).toBe('surfaced')
    // Den diskvalificerade rivalen kan inte vinna provet.
    const score = r.state.programmes![0]!.result?.scores.find((x) => x.houseId === 'brandt')
    if (score) expect(score.disqualified).toContain('IRREGULARITIES')
  })

  it('har du fel (rivalen fuskade inte) sjunker relationen till upphandlingstjänstemannen', () => {
    const s = withIntel(false)
    const before = s.officials['official-rvn-procurement']!.relationToPlayer
    const r = resolveTurn(s, { ...EMPTY, standingOrders: [REPORT] })
    expect(r.state.officials['official-rvn-procurement']!.relationToPlayer).toBe(Math.max(0, before - B.programmeReportRelationPenalty))
    expect(r.state.programmes![0]!.entrants.find((e) => e.houseId === 'brandt')!.barred).toBeUndefined()
    expect(r.wire.some((e) => e.actorIsPlayer && e.headline.includes('FALSE'))).toBe(true)
  })

  it('en rival kan anmälas högst en gång per infordran', () => {
    const s = withIntel(true)
    s.programmes![0]!.phase = 'development' // (i provfasen avgörs infordran samma tur)
    s.programmes![0]!.phaseSinceTurn = 5
    const once = resolveTurn(s, { ...EMPTY, standingOrders: [REPORT] }).state
    expect(resolveTurn(once, { ...EMPTY, standingOrders: [REPORT] }).rejected.map((r) => r.reason)).toEqual(['that rival has already been reported'])
  })
})

describe('kostnad och spår (P124)', () => {
  it('knepen kostar en handling var: med alla handlingspoäng upptagna avvisas ett knep', () => {
    const state = fresh('trial')
    const hire: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } }
    const full = Array.from({ length: state.house.actionPoints }, () => hire)
    const r = resolveTurn(state, { ...EMPTY, actions: [...full, PROC('BRIBE_BOARD')] })
    expect(r.rejected.some((x) => x.reason === 'no executive actions remaining')).toBe(true)
    expect(r.state.traces ?? []).toEqual([])
  })

  it('previewAction: knepen har sina pengakostnader, motköp och underbud ingen', () => {
    const state = fresh('development')
    expect(previewAction(state, PROC('BRIBE_BOARD')).cost).toBe(B.programmeBoardBribeCost)
    expect(previewAction(state, PROC('FALSIFY')).cost).toBe(B.programmeFalsifyCost)
    expect(previewAction(state, PROC('WRITE_SPEC', { requirementKind: 'performance', bribe: true })).cost).toBe(B.programmeWriteSpecBribeCost)
    expect(previewAction(state, PROC('WRITE_SPEC', { requirementKind: 'performance' })).cost).toBeNull()
    expect(previewAction(state, PROC('LOWBALL')).cost).toBeNull()
    expect(previewAction(state, PROC('HANDBUILT')).cost).toBeNull()
  })
})
