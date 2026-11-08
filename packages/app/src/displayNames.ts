// displayNames.ts — etapp 14, P202 (förslaget "Krigsrumsbordet" §7.2–7.3, speltest 2026-11-04): spelarens vy visar namn, aldrig
// interna ID:n. Fronter heter efter sin teater, sektorer efter kartan, en order säger varför den lagts och vem som handlägger den,
// och telexets modelländringar (WireEvent.delta) visas bara när de betyder något för spelaren, med ord i stället för fältnamn.
// Rena funktioner; test/displayNames.test.ts fäller ett internt ID i någon av dem.
import type { Agenda, FactionId, Front, GameState, Official, Order } from '@seventh-front/core'
import { SECTOR_REGIONS } from './sectorRegions.js'

export function quarterOfTurn(turn: number): string {
  return `Q${(turn % 4) + 1} ${1964 + Math.floor(turn / 4)}`
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function frontName(state: GameState, frontId: string | null | undefined): string {
  if (!frontId) return 'No front'
  const front: Front | undefined = state.fronts[frontId]
  const theatre = front ? state.theatres[front.theatreId] : undefined
  return theatre ? `${titleCase(theatre.name)} front` : 'Front'
}

export function sectorName(sectorId: string): string | null {
  for (const regions of Object.values(SECTOR_REGIONS)) {
    const region = regions.find((r) => r.sectorId === sectorId)
    if (region) return region.label
  }
  return null
}

// Var ordern hör hemma: frontens namn, och sektorn när ordern ersätter ett förbands förluster.
export function orderPlace(state: GameState, order: Order): string {
  const front = frontName(state, order.frontId)
  if (order.reason.kind !== 'REPLACE_FORMATION_LOSSES') return front
  const formationId = order.reason.formationId
  const formation = Object.values(state.fronts)
    .flatMap((f) => f.formations)
    .find((f) => f.id === formationId)
  const sector = formation ? sectorName(formation.sectorId) : null
  return sector ? `${front} · ${titleCase(sector)}` : front
}

// Varför ordern lagts — ur Order.reason (P40), inget påhittat: förbandets namn och drabbningens kvartal läses ur state.
export function orderCause(state: GameState, order: Order): string {
  switch (order.reason.kind) {
    case 'REPLACE_FORMATION_LOSSES': {
      const reason = order.reason
      const engagement = state.wire.find((e) => e.id === reason.engagementWireId)
      const when = engagement ? ` (${quarterOfTurn(engagement.turn)})` : ''
      return `Replacement for losses of the ${reason.formationName} in battle${when}.`
    }
    case 'PEACETIME_REPLACEMENT':
      return 'Routine replacement of worn and ageing stock.'
    case 'SCRIPTED':
      return 'A standing requirement in the national procurement plan.'
  }
}

const POST_TITLE: Record<Official['post'], string> = {
  procurement: 'Procurement chief',
  defence: 'Defence minister',
  finance: 'Finance minister',
  interior: 'Interior minister',
}

export function officialLine(state: GameState, officialId: string): { name: string; title: string; relation: number } | null {
  const official = state.officials[officialId]
  if (!official) return null
  return { name: official.name, title: POST_TITLE[official.post], relation: Math.round(official.relationToPlayer) }
}

// ── Telexets deltarader ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// WireEvent.delta bär modelländringar (spec 2.6), många rent interna (materielbehov, utrustning per sida, kapplöpningens räknare).
// Spelaren ser bara de som säger något om läget, med ord; resten döljs (null). Pengar visas som pengar.
const MONEY_LABEL: Record<string, string> = {
  treasury: 'Treasury',
  debt: 'Debt',
  price: 'Price',
  capital: 'Capital',
  creditLimit: 'Credit limit',
  militaryBudget: 'Military budget',
  boardDeduction: 'Board deduction',
  favourMarginOwed: 'Favours owed',
}
const PLAIN_LABEL: Record<string, string> = {
  doomsday: 'Doomsday',
  heat: 'Heat',
  publicSupport: 'Public support',
  exposure: 'Station exposure',
  counterIntelligence: 'Counter-intelligence',
  'reputation.integrity': 'Integrity',
  'reputation.quality': 'Quality reputation',
  reliability: 'Reliability',
  quality: 'Quality',
  position: 'Front line',
  unitsDelivered: 'Units delivered',
  standing: 'Standing',
  relationToPlayer: 'Relation to you',
  marketShare: 'Market share',
  morale: 'Morale',
}

function formatMoney(value: number): string {
  return `£${Math.round(Math.abs(value)).toLocaleString('en-GB')}`
}
function formatNumber(value: number): string {
  const magnitude = Math.abs(value)
  return String(Number.isInteger(magnitude) ? magnitude : Number(magnitude.toFixed(1)))
}

export function deltaLabel(state: GameState, key: string, value: number): string | null {
  const sign = value >= 0 ? '+' : '−'
  if (key in MONEY_LABEL) return `${MONEY_LABEL[key]} ${sign}${formatMoney(value)}`
  if (key in PLAIN_LABEL) return `${PLAIN_LABEL[key]} ${sign}${formatNumber(value)}`
  const relation = /^relations\.(.+)$/.exec(key)
  if (relation) {
    const faction = state.factions[relation[1] as FactionId]
    return faction ? `Relations with ${faction.name} ${sign}${formatNumber(value)}` : null
  }
  const official = /^(.+)\.relationToPlayer$/.exec(key)
  if (official) {
    const person = state.officials[official[1]!]
    return person ? `${person.name}: relation ${sign}${formatNumber(value)}` : null
  }
  const strength = /^(.+)\.strength$/.exec(key)
  if (strength) {
    const formation = Object.values(state.fronts)
      .flatMap((f) => f.formations)
      .find((f) => f.id === strength[1])
    return formation ? `${formation.name}: strength ${sign}${formatNumber(value)}` : null
  }
  return null
}

// Knappen som fäller ut orsakskedjan (förr "cause ×N").
export function causeToggleLabel(count: number, expanded: boolean): string {
  if (expanded) return 'Hide background'
  return count === 1 ? 'Background: 1 report' : `Background: ${count} reports`
}

// En tjänstemans agenda i ord (förr enum-namnet, t.ex. "SELF_ENRICHMENT").
const AGENDA_LABEL: Record<Agenda, string> = {
  REARM: 'Rearmament',
  AUSTERITY: 'Austerity',
  MODERNISE: 'Modernisation',
  NON_ALIGNMENT: 'Non-alignment',
  SELF_ENRICHMENT: 'Self-enrichment',
}
export function agendaLabel(agenda: Agenda | null): string {
  return agenda === null ? 'Unknown' : AGENDA_LABEL[agenda]
}
