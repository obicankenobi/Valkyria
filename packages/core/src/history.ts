// history — P149 (ETAPP10_FORSLAG.md §9, beslut 10E, 10I, 10J). Verkliga, daterade händelser som kommer in i partiet kvartal för kvartal.
//
// DATA, INTE KOD. Händelserna ligger i `data/history/indochina.json` (id, date, quarter, kind, headline, body, source, condition, effects). Det här
// steget slår upp kvartalets händelser, prövar villkoren och tillämpar effekterna, så att de verkar på samma kvartals fronter, heat och ordrar
// (steget ligger direkt efter `applyActions`, beslut 10E — den enda ändringen av stegordningen, och den som ägaren bad om).
//
// Tre slag finns i datan nu: `frontPage` (en liten, fast effekt), `telex` (ingen effekt) — och prolog/efterord (visas före och efter partiet, ligger
// inte i tidsschemat). Besluten (P150) kommer med en egen `HISTORY`-stående order.
//
// Varje händelse ger en `WireEvent` med `scope: 'global'` och `causeId: 'history:<id>'`, och varje effekt ännu en med samma causeId — NEWS DESK och
// krönikan känner igen händelsen på det prefixet. `WireEvent` får inget nytt fält. Alla tal ligger i `balance.json` (`historyEffects`); datafilen
// bär bara NAMNET på talet. Brytaren `historyEnabled` stänger av hela steget (härnessen mäter varje händelses effekt mot ett parti utan den).
//
// Ett kvartal har högst en förstasida och tre telexrader (10O) — datatestet (`history.data.test.ts`) vaktar det, liksom äktheten (10J): varje
// händelse har datum och källa, kvartalet stämmer med datumet, och inga påhittade citat finns. Inga verkliga vapenhus (10I).
import historyData from './data/history/indochina.json' with { type: 'json' }
import balanceData from './data/balance.json' with { type: 'json' }
import { addDoomsday } from './resolve/doomsdayGate.js'
import { blocOfFaction } from './race.js'
import { effectiveDepth } from './queries.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { ResolveContext } from './resolve/index.js'
import type { GameState, TechCategory } from './types.js'

export type HistoryKind = 'frontPage' | 'telex' | 'prologue' | 'afterword'

export type HistoryEffect =
  | { kind: 'doomsday'; key: string }
  | { kind: 'need'; key: string; factions: string[] }
  | { kind: 'holdOrders'; factions: string[] }
  | { kind: 'heat'; key: string; theatre: string }
  | { kind: 'support'; key: string; bloc?: 'west' | 'east'; factions?: string[] }
  | { kind: 'commodities'; key: string }
  | { kind: 'delayShipments'; factions: string[] }
  | { kind: 'officialsRelation'; key: string; factionId: string }

export interface HistoryEvent {
  id: string
  kind: HistoryKind
  date: string // ÅÅÅÅ-MM-DD, eller ÅÅÅÅ-MM när dagen inte är belagd
  quarter?: string // ÅÅÅÅ-Qn — saknas för prolog och efterord
  headline: string
  body: string
  source: string
  condition?: string
  effects?: HistoryEffect[]
}

interface HistoryFile {
  scenario: string
  events: HistoryEvent[]
  prologue: HistoryEvent[]
  afterword: HistoryEvent[]
}

const DATA = historyData as unknown as HistoryFile
const BALANCE = balanceData as unknown as {
  historyEnabled: number
  historyEffects: Record<string, number>
  historyThieuKyCourtedTurns: number
}

export const HISTORY_EVENTS: readonly HistoryEvent[] = DATA.events
export const HISTORY_PROLOGUE: readonly HistoryEvent[] = DATA.prologue
export const HISTORY_AFTERWORD: readonly HistoryEvent[] = DATA.afterword

export const HISTORY_CAUSE_PREFIX = 'history:'

export const quarterKey = (year: number, quarter: number): string => `${year}-Q${quarter}`

// Datumet som kvartal: ÅÅÅÅ-MM eller ÅÅÅÅ-MM-DD → ÅÅÅÅ-Qn. Används av datatestet och av tidslinjen.
export function quarterOfDate(date: string): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(date)
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return quarterKey(Number(m[1]), Math.ceil(month / 3))
}

function conditionHolds(state: GameState, condition: string | undefined): boolean {
  if (!condition || condition === 'always') return true
  const [name, arg = ''] = condition.split(':')
  switch (name) {
    case 'station':
      return effectiveDepth(state, arg) > 0
    case 'front-war':
      return Object.values(state.fronts).some((f) => f.status === 'war')
    case 'no-player-coup':
      return state.factions[arg]?.coupAttempted !== true
    case 'faction-stands':
      return state.factions[arg] !== undefined && !state.factions[arg]!.bankrupt
    default:
      return false
  }
}

// Händelserna för ett kvartal, i datans ordning. Prolog och efterord ligger utanför schemat.
export function eventsForQuarter(year: number, quarter: number): HistoryEvent[] {
  const key = quarterKey(year, quarter)
  return HISTORY_EVENTS.filter((e) => e.quarter === key)
}

const value = (key: string): number => BALANCE.historyEffects[key] ?? 0

function applyEffect(ctx: ResolveContext, event: HistoryEvent, effect: HistoryEffect): void {
  const { draft, emit } = ctx
  const causeId = `${HISTORY_CAUSE_PREFIX}${event.id}`
  switch (effect.kind) {
    case 'doomsday':
      addDoomsday(ctx, value(effect.key), causeId)
      return
    case 'need': {
      const orders = value(effect.key)
      for (const id of effect.factions) {
        const faction = draft.factions[id]
        if (!faction) continue
        for (const category of TECH_CATEGORIES as readonly TechCategory[]) {
          const before = faction.materielNeed[category]
          const after = Math.min(balanceNeedCeiling(), before + orders * threshold(category))
          faction.materielNeed[category] = after
        }
        emit({ severity: 'ticker', scope: 'global', headline: `${faction.name.toUpperCase()} MINISTRIES SEEK MORE MATERIEL — ${event.headline}`, causeId, delta: { [`materielNeed.${id}`]: orders }, actorIsPlayer: false, subjectId: id })
      }
      return
    }
    case 'holdOrders':
      for (const id of effect.factions) {
        const faction = draft.factions[id]
        if (!faction) continue
        for (const category of TECH_CATEGORIES as readonly TechCategory[]) faction.materielNeed[category] = 0
        emit({ severity: 'ticker', scope: 'global', headline: `${faction.name.toUpperCase()} PLACES NO NEW ORDERS THIS QUARTER`, causeId, delta: { [`materielNeed.${id}`]: 0 }, actorIsPlayer: false, subjectId: id })
      }
      return
    case 'heat': {
      const theatre = draft.theatres[effect.theatre]
      if (!theatre) return
      const before = theatre.heat
      theatre.heat = Math.max(0, Math.min(100, before + value(effect.key)))
      emit({ severity: 'ticker', scope: 'global', headline: `HEAT IN ${theatre.name.toUpperCase()} ${theatre.heat >= before ? 'RISES' : 'FALLS'}`, causeId, delta: { heat: theatre.heat - before }, actorIsPlayer: false, subjectId: theatre.id })
      return
    }
    case 'support': {
      const ids = effect.factions ?? Object.keys(draft.factions).filter((id) => effect.bloc !== undefined && blocOfFaction(draft, id) === effect.bloc)
      for (const id of ids) {
        const faction = draft.factions[id]
        if (!faction) continue
        const before = faction.publicSupport
        faction.publicSupport = Math.max(0, Math.min(100, before + value(effect.key)))
        emit({ severity: 'ticker', scope: 'global', headline: `PUBLIC SUPPORT IN ${faction.name.toUpperCase()} ${faction.publicSupport >= before ? 'RISES' : 'FALLS'}`, causeId, delta: { publicSupport: faction.publicSupport - before }, actorIsPlayer: false, subjectId: id })
      }
      return
    }
    case 'commodities': {
      const pct = value(effect.key)
      const commodities = draft.market.commodities
      for (const name of Object.keys(commodities) as (keyof typeof commodities)[]) commodities[name] = commodities[name] * (1 + pct / 100)
      emit({ severity: 'ticker', scope: 'global', headline: `IMPORTED RAW MATERIALS GROW DEARER (${pct >= 0 ? '+' : ''}${pct} %)`, causeId, delta: { commodityIndexPct: pct }, actorIsPlayer: false, subjectId: null })
      return
    }
    case 'delayShipments': {
      let delayed = 0
      for (const shipment of draft.market.shipments) {
        const contract = draft.market.contracts.find((c) => c.id === shipment.contractId)
        if (contract && effect.factions.includes(contract.buyerId)) {
          shipment.arrivalTurn += 1
          delayed++
        }
      }
      if (delayed > 0) emit({ severity: 'ticker', scope: 'global', headline: `${delayed} SHIPMENT${delayed === 1 ? '' : 'S'} DELAYED A QUARTER`, causeId, delta: { shipmentsDelayed: delayed }, actorIsPlayer: false, subjectId: effect.factions[0] ?? null })
      return
    }
    case 'officialsRelation': {
      const loss = value(effect.key)
      for (const official of Object.values(draft.officials)) {
        if (official.factionId !== effect.factionId || official.status !== 'active') continue
        if (draft.meta.turn - official.lastCourtedTurn <= BALANCE.historyThieuKyCourtedTurns) continue // uppvaktad nyligen: ingen förlust
        const before = official.relationToPlayer
        official.relationToPlayer = Math.max(0, before - loss)
        if (official.relationToPlayer !== before) emit({ severity: 'ticker', scope: 'global', headline: `${official.name.toUpperCase()} COOLS TOWARDS THE HOUSE`, causeId, delta: { relationToPlayer: official.relationToPlayer - before }, actorIsPlayer: false, subjectId: official.factionId })
      }
      return
    }
  }
}

const balanceNeedCeiling = (): number => (balanceData as unknown as { needCeiling: number }).needCeiling
const threshold = (category: TechCategory): number => (balanceData as unknown as { orderTriggerThreshold: Record<TechCategory, number> }).orderTriggerThreshold[category]

// Pipeline-steget: kvartalets händelser, villkor, effekter, rubriker, och en post i GameState.history.
export function advanceHistory(ctx: ResolveContext): void {
  if (BALANCE.historyEnabled !== 1) return
  const { draft, emit } = ctx
  const events = eventsForQuarter(draft.meta.year, draft.meta.quarter)
  for (const event of events) {
    if (draft.history?.occurred[event.id]) continue
    if (!conditionHolds(draft, event.condition)) continue
    ;(draft.history ??= { occurred: {} }).occurred[event.id] = { turn: draft.meta.turn }
    emit({
      severity: event.kind === 'frontPage' ? 'headline' : 'ticker',
      scope: 'global',
      headline: event.headline,
      causeId: `${HISTORY_CAUSE_PREFIX}${event.id}`,
      delta: { [`history.${event.id}`]: 1 },
      actorIsPlayer: false,
      subjectId: null,
    })
    for (const effect of event.effects ?? []) applyEffect(ctx, event, effect)
  }
}

// Rubrikens händelse ur en WireEvent (null om den inte är en historisk). Krönikan och NEWS DESK använder den.
export function historyEventOf(causeId: string | null, delta: Record<string, number>): HistoryEvent | null {
  const key = Object.keys(delta).find((k) => k.startsWith('history.'))
  const id = key ? key.slice('history.'.length) : causeId?.startsWith(HISTORY_CAUSE_PREFIX) ? causeId.slice(HISTORY_CAUSE_PREFIX.length) : null
  return id ? (HISTORY_EVENTS.find((e) => e.id === id) ?? null) : null
}
