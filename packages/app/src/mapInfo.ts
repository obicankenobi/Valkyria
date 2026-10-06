// mapInfo — P165 (ETAPP10_FORSLAG.md §3b, S6): informationskortet i kartans nederkant. Ett tryck på något på kartan väljer det, och det valda föremålet får ett kort som
// säger vad det är, hur det står till och vad som går att göra åt det — utan att kartan lämnas. Ren härledning ur tillståndet och kärnans egna frågor (deriveSectorControl,
// formationDisplay, effectiveDepth, stationOutlook); ingenting hittas på här, och ett föremål som inte finns längre (ett förstört förband) ger inget kort.
//
// Alla landmassor går att välja. Bara de som har en spelbar faktion får en väg in i landsakten (`openFile`); övriga är sammanhangsländer och säger det.
import { DISPLAY_THRESHOLDS, deriveSectorControl, formationDisplay } from '@seventh-front/core'
import type { Faction, FactionId, Front, GameState } from '@seventh-front/core'
import { findHandbookEntry } from './handbook.js'
import type { HandbookTopicId } from './handbook.js'
import { SECTOR_REGIONS } from './sectorRegions.js'
import { stationOutlook } from './stationOutlook.js'
import { THEATRE_ENTRY_POINTS } from './supplyLines.js'

// §6.5: bara de två länder som kan ha en station i det här scenariot har en FactionId; de fyra övriga (north-vietnam, kambodja, thailand, kina) är sammanhang.
export const COUNTRY_TO_FACTION: Record<string, FactionId> = {
  'south-vietnam': 'rvn',
  laos: 'laos',
}

// Samma namn som kartfilens egna egenskaper (public/geo/indochina.topo.json) — mapInfo.test.ts binder dem mot filen.
export const COUNTRY_LABEL: Record<string, string> = {
  'north-vietnam': 'North Vietnam',
  'south-vietnam': 'South Vietnam',
  laos: 'Laos',
  cambodia: 'Cambodia',
  thailand: 'Thailand',
  china: 'China',
}

export type MapSelection =
  | { kind: 'country'; countryId: string }
  | { kind: 'faction'; factionId: FactionId } // en faktion utan egen landmassa (NLF) — kortet är detsamma som ett lands, utan kartkontur
  | { kind: 'sector'; sectorId: string }
  | { kind: 'formation'; formationId: string }
  | { kind: 'frontline'; frontId: string }
  | { kind: 'station'; factionId: FactionId }
  | { kind: 'supply'; lineId: string }
  | { kind: 'heat'; theatreId: string }

export interface MapInfoRow {
  label: string
  value: string
}

export interface MapInfo {
  kicker: string
  title: string
  rows: MapInfoRow[]
  note: string | null
  openFile: FactionId | null // en väg in i landsakten, när föremålet hör till ett land du kan agera mot
  topic: HandbookTopicId | null
}

const SIDE_LABEL = { a: 'Friendly', b: 'Hostile', contested: 'Contested', empty: 'No forces' } as const
const BAND_WORD = { svag: 'weak', medel: 'medium', stark: 'strong' } as const

function factionName(state: GameState, id: string): string {
  return state.factions[id]?.name ?? id
}

export function alignmentLabel(faction: Pick<Faction, 'alignment'>): string {
  if (faction.alignment > 15) return 'WEST-ALIGNED'
  if (faction.alignment < -15) return 'EAST-ALIGNED'
  return 'NEUTRAL'
}

function frontsOf(state: GameState, factionId: string): Front[] {
  return Object.values(state.fronts).filter((f) => f.sideA === factionId || f.sideB === factionId)
}

function theatreName(state: GameState, theatreId: string): string {
  return state.theatres[theatreId]?.name ?? theatreId
}

function strengthText(forces: { known: boolean; strength: number | null }[]): string {
  if (forces.some((f) => !f.known)) return `${forces.length} · strength unknown`
  return `${forces.length} · strength ${forces.reduce((sum, f) => sum + (f.strength ?? 0), 0)}`
}

function countryInfo(state: GameState, countryId: string): MapInfo | null {
  const label = COUNTRY_LABEL[countryId]
  if (!label) return null
  const factionId = COUNTRY_TO_FACTION[countryId]
  const faction = factionId ? state.factions[factionId] : undefined
  if (!factionId || !faction) {
    return {
      kicker: 'COUNTRY',
      title: label,
      rows: [{ label: 'Role', value: 'Context country' }],
      note: `${label} is not a buyer. You cannot station anyone here, and the model tracks no orders or officials in it.`,
      openFile: null,
      topic: null,
    }
  }
  return factionCard(state, factionId, label, 'COUNTRY')
}

// Kortet för en faktion: ett land du kan agera mot (med en landsakt), eller en faktion utan egen mark (NLF) — då utan landsakt, men med samma siffror.
function factionCard(state: GameState, factionId: FactionId, label: string, kicker: string): MapInfo | null {
  const faction = state.factions[factionId]
  if (!faction) return null
  const hasLandmass = Object.values(COUNTRY_TO_FACTION).includes(factionId)

  const fronts = frontsOf(state, factionId)
  const fighting = fronts.length
    ? fronts
        .map((f) => {
          const opponent = factionName(state, f.sideA === factionId ? f.sideB : f.sideA)
          return f.status === 'war' ? `At war with ${opponent}` : f.status === 'ceasefire' ? `Ceasefire with ${opponent}` : `No fighting with ${opponent}`
        })
        .join('; ')
    : 'No front'
  const station = state.house.stations.find((s) => s.nation === factionId && s.status === 'active')
  const outlook = stationOutlook(state, factionId)

  // En motpart utan egen landmassa (NLF) bor i någon annans land — säg var, i stället för att låta den saknas på kartan.
  const landless = fronts
    .map((f) => (f.sideA === factionId ? f.sideB : f.sideA))
    .filter((id) => !Object.values(COUNTRY_TO_FACTION).includes(id))
  const note = landless.length
    ? `${[...new Set(landless)].map((id) => factionName(state, id)).join(' and ')} has no territory of its own on this map; its forces hold sectors inside ${label}.`
    : null

  const yours = state.market.contracts.filter((c) => c.buyerId === factionId && (c.status === 'active' || c.status === 'late')).length
  const rivals = Object.values(state.rivals).reduce(
    (sum, r) => sum + r.contracts.filter((c) => c.buyerId === factionId && (c.status === 'active' || c.status === 'late')).length,
    0,
  )
  return {
    kicker,
    title: faction.name,
    rows: [
      { label: 'Alignment', value: alignmentLabel(faction) },
      { label: 'Relation to you', value: `${Math.round(faction.relationToPlayer)} / 100` },
      { label: 'Fighting', value: fighting },
      {
        label: 'Station',
        value: station
          ? `${station.city}, depth ${station.depth}`
          : outlook.dormant
            ? `${outlook.dormant.city}, dormant (depth ${outlook.dormant.depth}) — REOPEN wakes it`
            : 'None — you have no station here',
      },
      { label: 'Open orders', value: String(state.market.openOrders.filter((o) => o.buyerId === factionId).length) },
      { label: 'Contracts', value: `${yours} yours, ${rivals} rivals${faction.embargoed ? ' · embargoed' : ''}` },
      {
        label: 'Formations',
        value: outlook.formationCount === 0 ? 'None here' : outlook.formationsKnown ? `${outlook.formationCount} here, exact strength shown` : `${outlook.formationCount} here, strength unknown`,
      },
    ],
    note: hasLandmass ? note : [`${faction.name} holds no land of its own on this map.`, note].filter(Boolean).join(' '),
    openFile: hasLandmass ? factionId : null,
    topic: 'politics',
  }
}

function sectorInfo(state: GameState, sectorId: string): MapInfo | null {
  for (const [theatreId, regions] of Object.entries(SECTOR_REGIONS)) {
    const region = regions.find((r) => r.sectorId === sectorId)
    if (!region) continue
    const front = Object.values(state.fronts).find((f) => f.theatreId === theatreId)
    const control = front ? deriveSectorControl(state, front).find((c) => c.sectorId === sectorId) : undefined
    const rows: MapInfoRow[] = [
      { label: 'Held by', value: SIDE_LABEL[control?.side ?? 'empty'] },
      { label: 'Theatre', value: theatreName(state, theatreId) },
    ]
    const forces = control?.formations ?? []
    const friendly = forces.filter((f) => f.side === 'a')
    const hostile = forces.filter((f) => f.side === 'b')
    if (friendly.length) rows.push({ label: 'Friendly forces', value: strengthText(friendly) })
    if (hostile.length) rows.push({ label: 'Hostile forces', value: strengthText(hostile) })
    if (!forces.length) rows.push({ label: 'Forces', value: 'None' })
    return {
      kicker: region.route ? 'ROUTE' : 'SECTOR',
      title: region.label,
      rows,
      note: region.route ? 'A transport route, not a place: its colour shows who controls the supply path.' : null,
      openFile: null,
      topic: 'fronts',
    }
  }
  return null
}

function formationInfo(state: GameState, formationId: string): MapInfo | null {
  for (const front of Object.values(state.fronts)) {
    const formation = front.formations.find((f) => f.id === formationId)
    if (!formation || formation.status === 'destroyed') continue
    const d = formationDisplay(state, formation)
    const region = (SECTOR_REGIONS[front.theatreId] ?? []).find((r) => r.sectorId === d.sectorId)
    const rows: MapInfoRow[] = [
      { label: 'Side', value: d.side === 'a' ? 'Friendly' : 'Hostile' },
      { label: 'Country', value: factionName(state, d.factionId) },
      { label: 'Sector', value: region?.label ?? d.sectorId },
      { label: 'Doctrine', value: d.doctrine },
      { label: 'Status', value: d.status },
      { label: 'Strength', value: d.known ? `${d.strength} (${BAND_WORD[d.strengthBand]})` : `Unknown — looks ${BAND_WORD[d.strengthBand]}` },
      { label: 'Readiness', value: d.known ? `${Math.round(d.readiness ?? 0)}%` : 'Unknown' },
    ]
    return {
      kicker: 'FORMATION',
      title: d.known ? d.name : 'Unknown formation',
      rows,
      note: d.known
        ? null
        : `You have no intelligence depth in ${factionName(state, d.factionId)}. A station there, at depth 1 or more, names and counts its formations.`,
      openFile: null,
      topic: 'fronts',
    }
  }
  return null
}

function frontlineInfo(state: GameState, frontId: string): MapInfo | null {
  const front = state.fronts[frontId]
  if (!front) return null
  const a = factionName(state, front.sideA)
  const b = factionName(state, front.sideB)
  const p = Math.round(front.position)
  const ahead = Math.abs(p) < 5 ? 'Neither side — even' : p < 0 ? `Friendly side (${a}) by ${-p}` : `Hostile side (${b}) by ${p}`
  const ceasefire = front.status !== 'war'
  return {
    kicker: 'FRONT LINE',
    title: `${theatreName(state, front.theatreId)} front`,
    rows: [
      { label: 'Status', value: front.status === 'war' ? 'War' : front.status === 'ceasefire' ? 'Ceasefire' : 'Dormant' },
      { label: 'Sides', value: `${a} vs ${b}` },
      { label: 'Ahead', value: ahead },
      { label: 'Last quarters', value: front.trace.slice(-3).map((n) => String(Math.round(n))).join(' → ') },
      { label: 'Heat', value: `${Math.round(state.theatres[front.theatreId]?.heat ?? 0)} / 100` },
    ],
    note: ceasefire ? 'There is no fighting and no materiel need on this front while it stays quiet.' : null,
    openFile: null,
    topic: 'fronts',
  }
}

function stationInfo(state: GameState, factionId: FactionId): MapInfo | null {
  const station = state.house.stations.find((s) => s.nation === factionId && s.status === 'active')
  if (!station) return null
  const outlook = stationOutlook(state, factionId)
  return {
    kicker: 'STATION',
    title: /station/i.test(station.city) ? station.city : `${station.city} station`,
    rows: [
      { label: 'Country', value: factionName(state, factionId) },
      { label: 'Depth', value: `${station.depth} of 5${outlook.salesmanBonus ? ' (+1 from your chief salesman)' : ''}` },
      { label: 'Exposure', value: `${Math.round(station.exposure)}% (a station is burned above ${DISPLAY_THRESHOLDS.exposureBurnThreshold}%)` },
      { label: 'Covers', value: outlook.coverage.join(', ') },
      { label: 'Price bands', value: outlook.bandPct === 0 ? 'Exact' : `±${outlook.bandPct}% around the lowest rival bid` },
      { label: 'Buyer terms', value: outlook.buyerTermsVisible ? 'Credit and drivers shown on orders' : 'Hidden' },
    ],
    note: null,
    openFile: factionId,
    topic: 'intelligence',
  }
}

function supplyInfo(state: GameState, lineId: string): MapInfo | null {
  for (const front of Object.values(state.fronts)) {
    const to = theatreName(state, front.theatreId)
    const from = THEATRE_ENTRY_POINTS[front.theatreId]?.label ?? 'the entry port'
    if (lineId === `player-${front.id}`) {
      const contractIds = new Set(state.market.contracts.filter((c) => c.frontId === front.id).map((c) => c.id))
      const shipments = state.market.shipments.filter((s) => contractIds.has(s.contractId))
      if (shipments.length === 0) return null
      const units = shipments.reduce((sum, s) => sum + s.units, 0)
      const next = Math.max(0, Math.min(...shipments.map((s) => s.arrivalTurn)) - state.meta.turn)
      return {
        kicker: 'SUPPLY LINE',
        title: 'Your supply line',
        rows: [
          { label: 'From', value: from },
          { label: 'To', value: `${to} front` },
          { label: 'In transit', value: `${units} units in ${shipments.length} ${shipments.length === 1 ? 'shipment' : 'shipments'}` },
          { label: 'Next arrival', value: next === 0 ? 'At the end of this quarter' : `In ${next} ${next === 1 ? 'quarter' : 'quarters'}` },
        ],
        note: null,
        openFile: null,
        topic: 'fronts',
      }
    }
    const prefix = `rival-${front.id}-`
    if (lineId.startsWith(prefix)) {
      const key = lineId.slice(prefix.length)
      const delivered = front.attribution[key]
      if (delivered === undefined) return null
      const name = state.rivals[key]?.name ?? key
      return {
        kicker: 'SUPPLY LINE',
        title: `${name}'s supply line`,
        rows: [
          { label: 'From', value: from },
          { label: 'To', value: `${to} front` },
          { label: 'Delivered here', value: `${Math.round(delivered)} units in total` },
        ],
        note: "Drawn because this rival's deliveries to the front grew since last quarter.",
        openFile: null,
        topic: 'fronts',
      }
    }
  }
  return null
}

function heatInfo(state: GameState, theatreId: string): MapInfo | null {
  const theatre = state.theatres[theatreId]
  if (!theatre) return null
  return {
    kicker: 'THEATRE',
    title: `${theatre.name} heat`,
    rows: [
      { label: 'Heat', value: `${Math.round(theatre.heat)} / 100` },
      { label: 'Escalates at', value: String(DISPLAY_THRESHOLDS.heatEscalation) },
      { label: 'Fronts', value: String(theatre.frontIds.length) },
    ],
    note: findHandbookEntry('heat')?.summary ?? null,
    openFile: null,
    topic: 'heat',
  }
}

export function deriveMapInfo(state: GameState, selection: MapSelection): MapInfo | null {
  switch (selection.kind) {
    case 'country':
      return countryInfo(state, selection.countryId)
    case 'faction':
      return factionCard(state, selection.factionId, factionName(state, selection.factionId), 'FACTION')
    case 'sector':
      return sectorInfo(state, selection.sectorId)
    case 'formation':
      return formationInfo(state, selection.formationId)
    case 'frontline':
      return frontlineInfo(state, selection.frontId)
    case 'station':
      return stationInfo(state, selection.factionId)
    case 'supply':
      return supplyInfo(state, selection.lineId)
    case 'heat':
      return heatInfo(state, selection.theatreId)
  }
}
