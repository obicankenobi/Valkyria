// traces — P124/P125 (ETAPP9_FORSLAG.md §8.3 och §8.4, beslut 9N). Pappersspåret: varje korrupt handling ger ett spår (vem, vilken
// tjänsteman, vilken sorts handling, hur allvarlig, vilken tur). P124 skrev spåren (knepen i upphandlingarna); P125 låter dem komma
// fram, ger utredningskortet (förneka / offra någon / förlikas), följderna, arkiven efter ett regimskifte, juridisk rådgivning och
// "rent rykte" (House.reputation.integrity).
//
// Varje ändring emitterar en WireEvent (hård regel 4). Husets eget spår säger vad det är; en rivals spår får en neutral rad som inte
// avslöjar vem eller vad (annars vore spåret inte dolt) — tills det kommer fram. All slump via ctx.rng (hård regel 2) och bara när ett
// öppet spår faktiskt finns: ett parti utan spår drar aldrig härifrån.
import balanceData from './data/balance.json' with { type: 'json' }
import successorsData from './data/successors.json' with { type: 'json' }
import { recordExpense } from './ledger.js'
import { findOfficial, replaceOfficial } from './officials.js'
import { refundAdvance } from './resolve/steps/deliveries.js'
import type { ResolveContext } from './resolve/index.js'
import type {
  ActionValidation,
  Agenda,
  FactionId,
  GameState,
  House,
  Official,
  Order,
  PaperTrace,
  StandingOrderChange,
  TraceChoice,
  TraceKind,
} from './types.js'

interface Balance {
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
  successorIntegrityMin: number
  successorIntegrityMax: number
  successorStandingMin: number
  successorStandingMax: number
}
const BALANCE = balanceData as unknown as Balance
const SUCCESSOR_NAMES = successorsData as unknown as Record<FactionId, string[]>
const AGENDAS: readonly Agenda[] = ['REARM', 'AUSTERITY', 'MODERNISE', 'NON_ALIGNMENT', 'SELF_ENRICHMENT']

// P125: startvärdet för husets integritet — appens migrering av ett sparat parti från före P125 läser det härifrån.
export const INTEGRITY_START = BALANCE.integrityStart

export interface NewTrace {
  houseId: 'player' | string
  officialId: string | null
  buyerId: FactionId | null
  kind: TraceKind
  severity: 1 | 2 | 3
  programmeId?: string
  contractId?: string
}

const KIND_TEXT: Record<TraceKind, string> = {
  writeSpec: 'SHAPING THE REQUIREMENTS',
  handbuilt: 'A HAND-BUILT TEST ARTICLE',
  bribeBoard: 'PAYMENTS TO THE TEST BOARD',
  falsify: 'A FORGED TEST PROTOCOL',
  bidBribe: 'A BRIBE IN A BID',
  bribe: 'A PAYMENT TO AN OFFICIAL',
  broker: 'A BROKERED DEAL',
  favour: 'A FAVOUR CALLED IN',
  legal: 'LEGAL ADVICE ON THE FILES',
  illegalExport: 'AN EXPORT-CONTROLLED SALE ACROSS THE BLOC LINE',
}

const ROLE_TEXT: Record<keyof House['staff'], string> = {
  chiefEngineer: 'CHIEF ENGINEER',
  chiefSalesman: 'CHIEF SALESMAN',
  chiefOfStaff: 'CHIEF OF STAFF',
}

// Skriver ett spår i staten och returnerar det. `causeId` är den handling eller händelse som orsakade det.
export function recordTrace(ctx: ResolveContext, input: NewTrace, causeId: string | null): PaperTrace {
  const { draft, emit } = ctx
  const traces = (draft.traces ??= [])
  const trace: PaperTrace = {
    id: `trace-${traces.length + 1}`,
    houseId: input.houseId,
    officialId: input.officialId,
    buyerId: input.buyerId,
    kind: input.kind,
    severity: input.severity,
    turn: draft.meta.turn,
    ...(input.programmeId !== undefined ? { programmeId: input.programmeId } : {}),
    ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
    status: 'open',
  }
  traces.push(trace)
  if (input.programmeId !== undefined) {
    const programme = draft.programmes?.find((p) => p.id === input.programmeId)
    if (programme) programme.traces.push(trace.id)
  }
  const mine = input.houseId === 'player'
  const buyer = input.buyerId ? (draft.factions[input.buyerId]?.name.toUpperCase() ?? input.buyerId.toUpperCase()) : 'A MINISTRY'
  emit({
    severity: 'ticker',
    scope: mine ? 'house' : 'market',
    headline: mine
      ? `A PAPER TRAIL IS LEFT: ${KIND_TEXT[input.kind]} (${buyer})`
      : `THE ${buyer} MINISTRY ADDS TO ITS FILES`,
    causeId,
    delta: { [`traces.${trace.id}`]: input.severity },
    actorIsPlayer: mine,
    subjectId: input.buyerId,
  })
  return trace
}

// ── P125: att ett spår kommer fram ────────────────────────────────────────────

const houseUpper = (state: GameState): string => state.house.name.toUpperCase()
const buyerUpper = (state: GameState, buyerId: FactionId | null): string =>
  buyerId ? (state.factions[buyerId]?.name.toUpperCase() ?? buyerId.toUpperCase()) : 'A MINISTRY'
const clampPct = (v: number): number => Math.max(0, Math.min(100, v))

function officialOfTrace(state: GameState, trace: PaperTrace): Official | undefined {
  if (trace.officialId) return state.officials[trace.officialId]
  return trace.buyerId ? findOfficial(state, trace.buyerId, 'procurement') : undefined
}

// Sannolikheten (i procent) att ett öppet spår kommer fram den här turen: en bas, tiden, tjänstemannens scandalRisk och landets
// motspionage — allt skalat med spårets allvar, sänkt av juridisk rådgivning (bara husets egna spår), med tak.
export function traceSurfaceChancePct(state: Readonly<GameState>, trace: PaperTrace): number {
  const official = officialOfTrace(state as GameState, trace)
  const counter = trace.buyerId ? (state.factions[trace.buyerId]?.counterIntelligence ?? 0) : 0
  const age = Math.max(0, state.meta.turn - trace.turn)
  const factor = BALANCE.traceSeverityFactor[trace.severity - 1] ?? 1
  let chance =
    (BALANCE.traceBaseChancePct +
      age * BALANCE.traceAgeChancePerTurn +
      (official?.scandalRisk ?? 0) * BALANCE.traceScandalRiskWeight +
      counter * BALANCE.traceCounterIntelWeight) *
    factor
  if (trace.houseId === 'player' && state.house.standingOrders?.legal) chance *= BALANCE.traceLegalFactor
  return Math.min(BALANCE.traceChanceCap, chance)
}

// En tjänsteman som faller ersätts (replaceOfficial får sin andra live-utlösare efter ASSASSINATE): nytt namn ur
// successors.json, ny integritet/ställning/agenda via ctx.rng, relationen nollställd.
function fallOfficial(ctx: ResolveContext, official: Official, causeId: string | null): void {
  const { draft, rng, emit } = ctx
  const names = SUCCESSOR_NAMES[official.factionId] ?? []
  const name = names.length > 0 ? rng.pick(names) : official.name
  const replacement = replaceOfficial(official, {
    name,
    integrity: rng.int(BALANCE.successorIntegrityMin, BALANCE.successorIntegrityMax),
    standing: rng.int(BALANCE.successorStandingMin, BALANCE.successorStandingMax),
    agenda: rng.pick(AGENDAS),
  })
  draft.officials[official.id] = replacement
  emit({
    severity: 'headline',
    scope: 'faction',
    headline: `${official.name.toUpperCase()} FALLS — THE FILES END A CAREER IN ${buyerUpper(draft, official.factionId)}, SUCCEEDED BY ${replacement.name.toUpperCase()}`,
    causeId,
    delta: { relationToPlayer: -official.relationToPlayer },
    actorIsPlayer: false,
    subjectId: official.factionId,
  })
}

// Husets följder efter EFFEKTIVT allvar (0 = inga). Allvar 1: rykteshit. Från 2: sämre kvalitetsrykte, kontraktet hävs, huset
// stängs av hos köparen, tjänstemannen tappar anseende och styrelsen drar av. Allvar 3: tjänstemannen faller.
function applyHouseConsequences(ctx: ResolveContext, trace: PaperTrace, severity: number, causeId: string | null): void {
  if (severity <= 0) return
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  const eff = Math.min(3, severity)

  const integrityBefore = house.reputation.integrity
  house.reputation.integrity = clampPct(integrityBefore - (BALANCE.traceIntegrityLoss[eff - 1] ?? 0))
  const delta: Record<string, number> = { 'reputation.integrity': house.reputation.integrity - integrityBefore }
  if (eff >= 2) {
    const qualityBefore = house.reputation.quality
    house.reputation.quality = clampPct(qualityBefore - BALANCE.traceQualityLoss)
    delta['reputation.quality'] = house.reputation.quality - qualityBefore
  }
  const standingId = emit({
    severity: 'report',
    scope: 'house',
    headline: `${houseUpper(draft)}'S NAME FOR PROBITY FALLS — ${integrityBefore.toFixed(0)} → ${house.reputation.integrity.toFixed(0)}`,
    causeId,
    delta,
    actorIsPlayer: true,
    subjectId: trace.buyerId,
  })
  if (eff < 2) return

  const buyer = buyerUpper(draft, trace.buyerId)
  const contract = trace.contractId ? draft.market.contracts.find((c) => c.id === trace.contractId) : undefined
  if (contract && contract.status !== 'voided' && contract.status !== 'fulfilled') {
    contract.status = 'voided'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `CONTRACT ${contract.id} VOIDED — ${buyer} CANCELS AFTER THE SCANDAL`,
      causeId: standingId,
      delta: {},
      actorIsPlayer: false,
      subjectId: contract.buyerId,
    })
    refundAdvance(ctx, contract, buyer, standingId)
  }

  if (trace.buyerId) {
    const until = turn + BALANCE.traceSuspendTurns
    ;(house.suspendedFrom ??= {})[trace.buyerId] = until
    emit({
      severity: 'report',
      scope: 'house',
      headline: `${houseUpper(draft)} IS SUSPENDED FROM TENDERING TO ${buyer} UNTIL TURN ${until}`,
      causeId: standingId,
      delta: { [`suspendedFrom.${trace.buyerId}`]: until },
      actorIsPlayer: true,
      subjectId: trace.buyerId,
    })
  }

  const official = officialOfTrace(draft, trace)
  if (official) {
    const before = official.standing
    official.standing = Math.max(0, before - BALANCE.traceOfficialStandingLoss)
    emit({
      severity: 'ticker',
      scope: 'faction',
      headline: `${official.name.toUpperCase()} LOSES STANDING IN ${buyer} — ${before.toFixed(0)} → ${official.standing.toFixed(0)}`,
      causeId: standingId,
      delta: { standing: official.standing - before },
      actorIsPlayer: false,
      subjectId: official.factionId,
    })
  }

  const deduction = BALANCE.traceBoardDeduction[eff] ?? 0
  if (deduction > 0) {
    house.boardDeduction = (house.boardDeduction ?? 0) + deduction
    emit({
      severity: 'report',
      scope: 'house',
      headline: `THE BOARD NOTES THE SCANDAL — A DEDUCTION OF ${deduction} IS HELD AGAINST THE NEXT REVIEW`,
      causeId: standingId,
      delta: { boardDeduction: deduction },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  if (eff >= 3 && official) fallOfficial(ctx, draft.officials[official.id] ?? official, standingId)
}

// En rivals avslöjade spår: kvalitetsrykte, relation, diskvalificering i en öppen infordran, ett hävt kontrakt — och vid allvar 3
// faller tjänstemannen. Inget kort åt spelaren.
function applyRivalConsequences(ctx: ResolveContext, trace: PaperTrace, causeId: string | null): void {
  const { draft, emit } = ctx
  const rival = draft.rivals[trace.houseId]
  if (!rival) return
  const buyer = buyerUpper(draft, trace.buyerId)

  const qualityBefore = rival.reputation.quality
  rival.reputation.quality = clampPct(qualityBefore - BALANCE.traceRivalQualityLoss)
  let relationDelta = 0
  if (trace.buyerId) {
    const before = rival.relations[trace.buyerId] ?? 0
    const after = clampPct(before - BALANCE.traceRivalRelationLoss)
    rival.relations[trace.buyerId] = after
    relationDelta = after - before
  }
  const scandalId = emit({
    severity: 'headline',
    scope: 'market',
    headline: `SCANDAL: ${rival.name.toUpperCase()} CAUGHT IN IRREGULARITIES AT THE ${buyer} MINISTRY (${KIND_TEXT[trace.kind]})`,
    causeId,
    delta: { 'reputation.quality': rival.reputation.quality - qualityBefore, ...(relationDelta !== 0 ? { relation: relationDelta } : {}) },
    actorIsPlayer: false,
    subjectId: trace.buyerId,
  })

  const programme = trace.programmeId ? draft.programmes?.find((p) => p.id === trace.programmeId) : undefined
  const entrant = programme?.entrants.find((e) => e.houseId === trace.houseId)
  if (programme && entrant && !entrant.barred && programme.phase !== 'awarded' && programme.phase !== 'cancelled') {
    entrant.barred = 'DISQUALIFIED FOR IRREGULARITIES'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `${rival.name.toUpperCase()} IS DISQUALIFIED FROM THE ${programme.category.toUpperCase()} PROGRAMME — IRREGULARITIES`,
      causeId: scandalId,
      delta: {},
      actorIsPlayer: false,
      subjectId: trace.buyerId,
    })
  }

  const contract = trace.contractId ? rival.contracts.find((c) => c.id === trace.contractId) : undefined
  if (contract && contract.status !== 'voided' && contract.status !== 'fulfilled') {
    contract.status = 'voided'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `${rival.name.toUpperCase()}'S CONTRACT ${contract.id} VOIDED — ${buyer} CANCELS AFTER THE SCANDAL`,
      causeId: scandalId,
      delta: {},
      actorIsPlayer: false,
      subjectId: trace.buyerId,
    })
  }

  if (trace.severity >= 3) {
    const official = officialOfTrace(draft, trace)
    if (official) fallOfficial(ctx, official, scandalId)
  }
}

// Ett spår kommer fram. Husets blir ett utredningskort med frist; en rivals får följderna direkt och stängs.
function surfaceTrace(ctx: ResolveContext, trace: PaperTrace, causeId: string | null): void {
  const { draft, emit } = ctx
  if (trace.houseId !== 'player') {
    // En rivals spår får följderna i advanceTraces steg 3 (samma tur) — där hamnar också spår som P124:s anmälan redan märkt.
    trace.status = 'surfaced'
    trace.surfacedTurn = draft.meta.turn
    return
  }
  trace.status = 'surfaced'
  trace.surfacedTurn = draft.meta.turn
  trace.deadlineTurn = draft.meta.turn + BALANCE.traceDeadlineTurns
  emit({
    severity: 'headline',
    scope: 'house',
    headline: `SCANDAL: ${KIND_TEXT[trace.kind]} COMES TO LIGHT IN ${buyerUpper(draft, trace.buyerId)} — ${houseUpper(draft)} MUST ANSWER WITHIN ${BALANCE.traceDeadlineTurns} TURNS`,
    causeId,
    delta: { [`traces.${trace.id}`]: trace.severity },
    actorIsPlayer: true,
    subjectId: trace.buyerId,
  })
}

// Ett regimskifte öppnar arkiven: varje öppet spår hos den faktionen (husets och rivalernas) får en engångschans att komma fram.
export function openArchives(ctx: ResolveContext, factionId: FactionId, causeId: string | null): void {
  const { draft, rng, emit } = ctx
  const open = (draft.traces ?? []).filter((t) => t.status === 'open' && t.buyerId === factionId)
  if (open.length === 0) return
  const archivesId = emit({
    severity: 'report',
    scope: 'faction',
    headline: `THE NEW REGIME OPENS THE ARCHIVES IN ${buyerUpper(draft, factionId)}`,
    causeId,
    delta: {},
    actorIsPlayer: false,
    subjectId: factionId,
  })
  for (const trace of open) {
    if (rng.chance(BALANCE.traceArchivesChancePct)) surfaceTrace(ctx, trace, archivesId)
  }
}

// ── P125: utredningskortet ────────────────────────────────────────────────────

function denyTrace(ctx: ResolveContext, trace: PaperTrace, headline: string): void {
  const { draft, emit } = ctx
  const house = draft.house
  trace.choice = 'DENY'
  trace.choiceTurn = draft.meta.turn
  const before = house.reputation.integrity
  house.reputation.integrity = clampPct(before - BALANCE.traceDenyIntegrity)
  emit({
    severity: 'report',
    scope: 'house',
    headline,
    causeId: null,
    delta: { 'reputation.integrity': house.reputation.integrity - before },
    actorIsPlayer: true,
    subjectId: trace.buyerId,
  })
}

function exposeDenial(ctx: ResolveContext, trace: PaperTrace): void {
  const { draft, emit } = ctx
  trace.status = 'closed'
  trace.resolution = 'exposed'
  const exposedId = emit({
    severity: 'headline',
    scope: 'house',
    headline: `SCANDAL: COVER-UP EXPOSED — THE ${KIND_TEXT[trace.kind]} IN ${buyerUpper(draft, trace.buyerId)} WAS DENIED, ${houseUpper(draft)}'S REPUTATION TAKES A HIT`,
    causeId: null,
    delta: { [`traces.${trace.id}`]: 0 },
    actorIsPlayer: true,
    subjectId: trace.buyerId,
  })
  applyHouseConsequences(ctx, trace, trace.severity + 1, exposedId)
}

export function validateTraceChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'TRACE' }>): ActionValidation {
  const fail = (reason: string): ActionValidation => ({ ok: false, reason })
  const trace = draft.traces?.find((t) => t.id === change.traceId)
  if (!trace || trace.houseId !== 'player') return fail('unknown trace')
  if (trace.status !== 'surfaced') return fail('that trace has not surfaced')
  if (trace.choice !== undefined) return fail('that trace has already been answered')
  switch (change.choice) {
    case 'DENY':
      return { ok: true }
    case 'SACRIFICE':
      if (!change.role || !(change.role in draft.house.staff)) return fail('choose which director to dismiss')
      return { ok: true }
    case 'SETTLE':
      if (draft.house.treasury < BALANCE.traceSettleCost * trace.severity) return fail('not enough cash to settle')
      return { ok: true }
    default:
      return fail('unknown trace choice')
  }
}

export function applyTraceChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'TRACE' }>): void {
  const { draft, emit } = ctx
  const house = draft.house
  const trace = draft.traces!.find((t) => t.id === change.traceId)!
  const buyer = buyerUpper(draft, trace.buyerId)

  switch (change.choice as TraceChoice) {
    case 'DENY':
      denyTrace(ctx, trace, `${houseUpper(draft)} DENIES THE ${KIND_TEXT[trace.kind]} — THE ${buyer} FILES STAY OPEN`)
      return
    case 'SACRIFICE': {
      const role = change.role!
      const before = house.staff[role]
      house.staff[role] = Math.max(0, before - BALANCE.traceSacrificeStaffLoss)
      trace.choice = 'SACRIFICE'
      trace.choiceTurn = draft.meta.turn
      trace.status = 'closed'
      trace.resolution = 'sacrificed'
      const id = emit({
        severity: 'report',
        scope: 'house',
        headline: `${houseUpper(draft)} DISMISSES ITS ${ROLE_TEXT[role]} — A HEAD ROLLS IN THE ${buyer} INQUIRY`,
        causeId: null,
        delta: { [`staff.${role}`]: house.staff[role] - before },
        actorIsPlayer: true,
        subjectId: trace.buyerId,
      })
      applyHouseConsequences(ctx, trace, trace.severity - 1, id)
      return
    }
    case 'SETTLE': {
      const cost = BALANCE.traceSettleCost * trace.severity
      house.treasury -= cost
      recordExpense(draft, 'political', cost)
      trace.choice = 'SETTLE'
      trace.choiceTurn = draft.meta.turn
      trace.status = 'closed'
      trace.resolution = 'settled'
      const id = emit({
        severity: 'report',
        scope: 'house',
        headline: `${houseUpper(draft)} SETTLES WITH ${buyer} QUIETLY (−£${cost.toLocaleString('en-GB')})`,
        causeId: null,
        delta: { treasury: -cost },
        actorIsPlayer: true,
        subjectId: trace.buyerId,
      })
      applyHouseConsequences(ctx, trace, trace.severity - 1, id)
      return
    }
  }
}

// ── P125: juridisk rådgivning ─────────────────────────────────────────────────

export function validateLegalChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'LEGAL' }>): ActionValidation {
  const has = draft.house.standingOrders?.legal !== undefined
  if (change.op === 'CANCEL') return has ? { ok: true } : { ok: false, reason: 'no legal counsel retained' }
  return has ? { ok: false, reason: 'legal counsel already retained' } : { ok: true }
}

export function applyLegalChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'LEGAL' }>): void {
  const { draft, emit } = ctx
  const orders = draft.house.standingOrders!
  if (change.op === 'CANCEL') {
    delete orders.legal
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: 'STANDING ORDER: LEGAL COUNSEL DISMISSED',
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
    return
  }
  orders.legal = { sinceTurn: draft.meta.turn + 1 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STANDING ORDER: LEGAL COUNSEL RETAINED — £${BALANCE.legalCounselCostPerTurn.toLocaleString('en-GB')} A TURN (FROM NEXT QUARTER)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
}

// ── P125: rent rykte ──────────────────────────────────────────────────────────

// Termen läggs på spelarens poäng EFTER computeScore (en formel, en källa: bidding.ts och bidEstimate/playerWinCurve läser den).
// En tjänsteman med hög integritet belönar ett rent hus och straffar ett smutsigt; en korrupt tjänsteman bryr sig inte.
export function integrityBidTerm(state: Readonly<Pick<GameState, 'officials' | 'house'>>, order: Pick<Order, 'officialId'>): number {
  const official = state.officials[order.officialId]
  if (!official) return 0
  const reference = BALANCE.integrityStart
  const standing = (state.house.reputation.integrity - reference) / reference
  return BALANCE.traceIntegrityBidWeight * (official.integrity / 100) * Math.max(-1, Math.min(1, standing))
}

// Ett rent hus: hög integritet och inget avslöjat spår i partiet.
export function cleanHouse(state: Readonly<GameState>): boolean {
  if (state.house.reputation.integrity < BALANCE.traceCleanHouseIntegrity) return false
  return !(state.traces ?? []).some((t) => t.houseId === 'player' && t.surfacedTurn !== undefined)
}

// Anbud hos en köpare som stängt huset ute (suspendedFrom) avvisas tills fristen gått ut.
export function isSuspendedFrom(house: Readonly<House>, buyerId: FactionId, turn: number): boolean {
  return (house.suspendedFrom?.[buyerId] ?? 0) > turn
}

// ── P125: varje tur ───────────────────────────────────────────────────────────

export function advanceTraces(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn

  // 1. Juridisk rådgivning: betalas varje tur från sinceTurn (huvudboken: political), lämnar ett eget litet spår var
  //    legalTraceEveryTurns:e tur, och lapsar med en rad när kassan inte räcker.
  const legal = house.standingOrders?.legal
  if (legal && turn >= legal.sinceTurn) {
    const cost = BALANCE.legalCounselCostPerTurn
    if (house.treasury < cost) {
      delete house.standingOrders!.legal
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${houseUpper(draft)}'S LEGAL COUNSEL LAPSES — THE RETAINER CANNOT BE PAID`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
    } else {
      house.treasury -= cost
      recordExpense(draft, 'political', cost)
      const paidId = emit({
        severity: 'ticker',
        scope: 'house',
        headline: `LEGAL COUNSEL RETAINER PAID (−£${cost.toLocaleString('en-GB')})`,
        causeId: null,
        delta: { treasury: -cost },
        actorIsPlayer: true,
        subjectId: null,
      })
      if (turn > 0 && turn % BALANCE.legalTraceEveryTurns === 0) {
        recordTrace(ctx, { houseId: 'player', officialId: null, buyerId: null, kind: 'legal', severity: 1 }, paidId)
      }
    }
  }

  // 2. Öppna spår (äldre än en tur) kan komma fram. En dragning per spår, i listans ordning — inga spår, inga drag.
  for (const trace of [...(draft.traces ?? [])]) {
    if (trace.status !== 'open' || trace.turn >= turn) continue
    if (rng.chance(traceSurfaceChancePct(draft, trace))) surfaceTrace(ctx, trace, null)
  }

  // 3a. En rivals avslöjade spår (kommit fram ovan, via arkiven eller en anmälan) får följderna direkt och stängs.
  for (const trace of draft.traces ?? []) {
    if (trace.houseId === 'player' || trace.status !== 'surfaced') continue
    trace.status = 'closed'
    trace.resolution = 'exposed'
    applyRivalConsequences(ctx, trace, null)
  }

  // 3. Husets kort: utan svar inom fristen = förnekande; ett förnekande kan avslöjas, annars stängs det efter en tid.
  for (const trace of draft.traces ?? []) {
    if (trace.houseId !== 'player' || trace.status !== 'surfaced') continue
    if (trace.choice === undefined) {
      if (turn >= (trace.deadlineTurn ?? Number.POSITIVE_INFINITY)) {
        denyTrace(ctx, trace, `NO ANSWER TO THE ${KIND_TEXT[trace.kind]} IN ${buyerUpper(draft, trace.buyerId)} — TREATED AS A DENIAL`)
      }
      continue
    }
    if (trace.choice !== 'DENY' || trace.choiceTurn === turn) continue
    if (rng.chance(BALANCE.traceDenyExposeChancePct)) {
      exposeDenial(ctx, trace)
    } else if (turn - (trace.surfacedTurn ?? turn) >= BALANCE.traceDenyLifeTurns) {
      trace.status = 'closed'
      trace.resolution = 'denied'
    }
  }

  // 4. Rent rykte: stiger långsamt var traceCleanTurns:e tur utan ett nyligen avslöjat spår.
  if (turn > 0 && turn % BALANCE.traceCleanTurns === 0 && house.reputation.integrity < 100) {
    const recent = (draft.traces ?? []).some(
      (t) => t.houseId === 'player' && t.surfacedTurn !== undefined && turn - t.surfacedTurn < BALANCE.traceCleanTurns,
    )
    if (!recent) {
      const before = house.reputation.integrity
      house.reputation.integrity = clampPct(before + BALANCE.traceIntegrityGain)
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${houseUpper(draft)} KEEPS A CLEAN NAME — PROBITY ${before.toFixed(0)} → ${house.reputation.integrity.toFixed(0)}`,
        causeId: null,
        delta: { 'reputation.integrity': house.reputation.integrity - before },
        actorIsPlayer: true,
        subjectId: null,
      })
    }
  }
}
