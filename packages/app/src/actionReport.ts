// actionReport — P164 (ETAPP10_FORSLAG.md §3b, S3): "Your actions" efter varje kvartal. En rad per handling med utfallet och orsakskedjan (causeId), även när utfallet bara är en
// ticker-rad, och de avvisade handlingarna i samma lista.
//
// VARFÖR ETT OMKÖR: ett WireEvent bär inget handlings-id, och kärnan sätter inte alltid causeId på följderna av en handling (ett misslyckat LEAK ger "counter-intelligence sharpens"
// och "exposure rises" utan causeId; se ANDRINGSLOGG). Handlingarna avgörs dock i inskickad ordning och slumpen är en ren funktion av (seed, markör), så hur en handlings
// händelser ser ut beror bara på handlingarna före den. Appen kan alltså fråga kärnan — resolveTurn är ren — vad kvartalet hade gett med bara de första j handlingarna, och
// jämföra: det som tillkommer när handling j läggs till är handling j:s egna händelser. Ingen rubriktext tolkas för att para ihop händelse och handling.
//
// Faller något av antagandena (omkörningen ger inte exakt samma händelser som det riktiga kvartalet) visas raderna utan utfall i stället för ett gissat utfall.
import { resolveTurn } from '@seventh-front/core'
import type { Bid, GameState, PlayerAction, StandingOrderChange, TurnSubmission, WireEvent } from '@seventh-front/core'
import { ACTION_CATALOG } from './actionCatalog.js'
import { actionVerb } from './actionInfo.js'
import { standingOrderKey } from './standingOrderBoard.js'
import { formatMoney } from './components/ui.js'

export interface RejectedItem {
  action: PlayerAction | Bid | StandingOrderChange
  reason: string
}

export interface ActionReportInput {
  before: GameState // tillståndet kvartalet avgjordes från
  submission: TurnSubmission // det som skickades in
  wire: readonly WireEvent[] // kvartalets riktiga händelser
  rejected: readonly RejectedItem[]
}

export interface ReportChainStep {
  id: string
  headline: string
  severity: WireEvent['severity']
  depth: number // 1 = direkt följd av handlingen, 2 = följd av en följd, …
  byCause: boolean // true = hör till handlingen genom ett causeId, inte genom att avgöras i samma steg
}

export interface ActionReportRow {
  key: string
  verb: string | null
  label: string
  detail: string | null
  status: 'done' | 'failed' | 'rejected'
  outcome: string // utfallets rubrik, eller avvisningsorsaken
  chain: ReportChainStep[]
}

// Misslyckanden är de rubriker kärnan själv skriver när ett slumpavgjort verb inte lyckas. test/actionReport.test.ts binder mönstret till riktiga utfall.
const FAILURE = /\b(TRACED BACK|FAILS|FAILED)\b/

function isPlayerAction(a: RejectedItem['action']): a is PlayerAction {
  return 'type' in a
}

function isBid(a: RejectedItem['action']): a is Bid {
  return 'orderId' in a
}

const verbLabel = (verb: string): string => ACTION_CATALOG.find((e) => e.verb === verb)?.label ?? verb

function nameOf(state: GameState, id: string | undefined): string | null {
  if (!id) return null
  return state.factions[id]?.name ?? state.rivals[id]?.name ?? state.officials[id]?.name ?? null
}

export function describeAction(state: GameState, action: PlayerAction): { verb: string | null; label: string; detail: string | null } {
  const verb = actionVerb(action)
  if (!verb) return { verb: null, label: action.type === 'CRISIS' ? 'Crisis response' : action.type, detail: action.type === 'CRISIS' ? action.choice : null }
  let detail: string | null = null
  switch (action.type) {
    case 'INTEL': {
      const station = state.house.stations.find((s) => s.id === action.stationId)
      const where = station ? station.city : action.op === 'RECRUIT' ? (nameOf(state, action.targetId) ?? null) : null
      const target = nameOf(state, action.targetId)
      detail = [where, target && action.op !== 'RECRUIT' ? `→ ${target}` : null].filter(Boolean).join(' ') || null
      break
    }
    case 'POLITICAL': {
      if ('officialId' in action) detail = nameOf(state, action.officialId)
      else if ('targetFactionId' in action) detail = nameOf(state, action.targetFactionId)
      if ('spend' in action) detail = [detail, formatMoney(action.spend)].filter(Boolean).join(' · ')
      break
    }
    case 'INTERNAL': {
      const payload = action.payload as Record<string, unknown>
      if (typeof payload.amount === 'number') detail = formatMoney(payload.amount)
      else if (typeof payload.role === 'string') detail = payload.role
      else if (typeof payload.category === 'string') detail = payload.category
      break
    }
    case 'MARKET':
      detail = `${action.commodity} · ${formatMoney(action.spend)}`
      break
    case 'BROKER':
      detail = `${nameOf(state, action.buyerId) ?? action.buyerId} · ${action.productId} × ${action.quantity}`
      break
    case 'PROCUREMENT':
      detail = action.op
      break
  }
  return { verb, label: verbLabel(verb), detail }
}

function describeOther(item: RejectedItem): { label: string; detail: string | null } {
  if (isBid(item.action)) return { label: 'Bid', detail: item.action.orderId }
  if (isPlayerAction(item.action)) return { label: item.action.type, detail: null }
  return { label: 'Standing order', detail: standingOrderKey(item.action) }
}

function sameEvent(a: WireEvent, b: WireEvent): boolean {
  return (
    a.severity === b.severity &&
    a.scope === b.scope &&
    a.headline === b.headline &&
    a.causeId === b.causeId &&
    a.actorIsPlayer === b.actorIsPlayer &&
    a.subjectId === b.subjectId &&
    JSON.stringify(a.delta) === JSON.stringify(b.delta)
  )
}

// Samma händelse oavsett vilka tal som ändrats av en tidigare handling (kvartalets fasta kostnad står med en annan siffra, osv.).
const shape = (e: WireEvent): string => `${e.severity}|${e.scope}|${e.subjectId}|${e.headline.replace(/[0-9£,.\-−+→×]/g, '')}`

function firstDifference(a: readonly WireEvent[], b: readonly WireEvent[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (!sameEvent(a[i]!, b[i]!)) return i
  return n
}

function lcsLength(a: readonly string[], b: readonly string[]): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }
  return dp[a.length]![cols - 1]!
}

// Handling j:s egna händelser: det som tillkommer i `withJ` jämfört med `without`, från den första skillnaden. Resten av `withJ` är samma efterföljande händelser som i
// `without` (andra steg i kvartalet), möjligen med någon enstaka som tillkommit eller försvunnit av handlingens följder — därför mäts gränsen med längsta gemensamma
// delföljd, inte med antal: handlingens block är det L där resten av `withJ` liknar resten av `without` mest, och vid lika mycket det längsta L (extra block-händelser
// i resten kostar inget, men en händelse som skärs av ur resten gör det).
function blockOf(withJ: readonly WireEvent[], without: readonly WireEvent[]): { start: number; length: number } | null {
  const d = firstDifference(withJ, without)
  if (d >= withJ.length) return null
  const rest = withJ.slice(d).map(shape)
  const baseline = without.slice(d).map(shape)
  let best = { length: 1, score: -1 }
  for (let length = 1; length <= rest.length; length++) {
    const score = lcsLength(rest.slice(length), baseline)
    if (score >= best.score) best = { length, score }
  }
  return { start: d, length: best.length }
}

function chainFor(events: readonly WireEvent[], block: WireEvent[]): ReportChainStep[] {
  const inBlock = new Map(block.map((e) => [e.id, e]))
  const depthOf = new Map<string, number>()
  const steps: ReportChainStep[] = []
  const root = block[0]!
  depthOf.set(root.id, 0)
  const place = (e: WireEvent, byCause: boolean) => {
    const parent = e.causeId !== null ? depthOf.get(e.causeId) : undefined
    const depth = parent !== undefined ? parent + 1 : 1
    depthOf.set(e.id, depth)
    steps.push({ id: e.id, headline: e.headline, severity: e.severity, depth, byCause })
  }
  for (const e of block.slice(1)) place(e, false)
  // Händelser som avgjorts senare i kvartalet men pekar tillbaka på handlingen (eller på en av dess följder) genom causeId.
  for (const e of events) {
    if (inBlock.has(e.id) || e.causeId === null) continue
    if (depthOf.has(e.causeId)) {
      place(e, true)
      inBlock.set(e.id, e)
    }
  }
  return steps
}

export function buildActionReport(input: ActionReportInput): ActionReportRow[] {
  const { before, submission, wire, rejected } = input
  const rejectedActions = rejected.filter((r) => isPlayerAction(r.action))

  // Vilka handlingar som avgjordes och vilka som avvisades, i inskickad ordning. Identiska handlingar går inte att skilja åt på innehållet; då är det de SENARE som
  // avvisats (en första förbrukar poängen eller pengarna som den andra saknar).
  interface Slot {
    index: number
    action: PlayerAction
    reason: string | null
  }
  const reasonsByJson = new Map<string, string[]>()
  for (const r of rejectedActions) {
    const key = JSON.stringify(r.action)
    reasonsByJson.set(key, [...(reasonsByJson.get(key) ?? []), r.reason])
  }
  const slots: Slot[] = []
  submission.actions.forEach((action, index) => {
    if (action.type === 'CRISIS') return // ett svar på ett kort, inte ett verb ur menyn
    slots.push({ index, action, reason: null })
  })
  for (let i = slots.length - 1; i >= 0; i--) {
    const queue = reasonsByJson.get(JSON.stringify(slots[i]!.action))
    if (queue && queue.length > 0) slots[i]!.reason = queue.pop()!
  }

  // Omkörningarna: vad hade kvartalet gett med bara de första j handlingarna?
  const acceptedSlots = slots.filter((s) => s.reason === null)
  const prefixWire = (upToIndexExclusive: number): WireEvent[] =>
    resolveTurn(before, { ...submission, actions: submission.actions.slice(0, upToIndexExclusive) }).wire
  const replays: WireEvent[][] = []
  let replayOk = acceptedSlots.length > 0
  if (replayOk) {
    replays.push(prefixWire(acceptedSlots[0]!.index))
    for (const s of acceptedSlots) replays.push(prefixWire(s.index + 1))
    const last = replays[replays.length - 1]!
    replayOk = last.length === wire.length && last.every((e, i) => sameEvent(e, wire[i]!))
  }

  const rows: ActionReportRow[] = []
  let acceptedNo = 0
  for (const slot of slots) {
    const { verb, label, detail } = describeAction(before, slot.action)
    const key = `action-${slot.index}`
    if (slot.reason !== null) {
      rows.push({ key, verb, label, detail, status: 'rejected', outcome: slot.reason, chain: [] })
      continue
    }
    const j = acceptedNo++
    const block = replayOk ? blockOf(replays[j + 1]!, replays[j]!) : null
    if (!block) {
      rows.push({ key, verb, label, detail, status: 'done', outcome: 'Filed', chain: [] })
      continue
    }
    const events = wire.slice(block.start, block.start + block.length)
    const root = events[0]!
    rows.push({
      key,
      verb,
      label,
      detail,
      status: FAILURE.test(root.headline) ? 'failed' : 'done',
      outcome: root.headline,
      chain: chainFor(wire, events),
    })
  }

  // Avvisade bud och stående order står i samma lista, efter handlingarna.
  rejected.forEach((r, i) => {
    if (isPlayerAction(r.action)) return
    const { label, detail } = describeOther(r)
    rows.push({ key: `other-${i}`, verb: null, label, detail, status: 'rejected', outcome: r.reason, chain: [] })
  })
  return rows
}
