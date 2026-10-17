// mapMilitaryOverlay.ts — Paket G4 (ETAPP 12, 12D): geografisk och militär
// kartdata för Indokina 1965 (topografiska höjdkurvor, Mekongfloden och Röda
// floden, historiska militärvägar Route 1 / Route 9 / Route 13, flygbaser,
// flottbaser, sjörutter och historiska händelseankare).
// Alla koordinater anges som [lat, lng] (samma konvention som sectorRegions.ts)
// och projiceras med TheatreMap:s befintliga d3-geo-projektion.
import type { GameState, WireEvent } from '@seventh-front/core'
import { SECTOR_REGIONS } from './sectorRegions.js'

export type LatLng = [number, number]

export interface TopographicRidge {
  id: string
  label: string
  outerRing: LatLng[]
  innerRing: LatLng[]
}

export interface RiverPath {
  id: string
  name: string
  points: LatLng[]
  width: number
}

export interface MilitaryHighway {
  id: string
  code: string
  name: string
  points: LatLng[]
}

export interface MilitaryBaseMarker {
  id: string
  kind: 'airbase' | 'naval'
  label: string
  anchor: LatLng
}

// Topografiska höjdkurvor: Annamitiska bergskedjan (Truong Son), Laos högland
// kring Plain of Jars samt Centrala höglandet i Sydvietnam.
export const TOPOGRAPHIC_RIDGES: readonly TopographicRidge[] = [
  {
    id: 'annamite-north',
    label: 'ANNAMITE RANGE · ELEV 1800M',
    outerRing: [
      [19.9, 103.8],
      [18.8, 104.9],
      [17.5, 105.8],
      [16.2, 106.7],
      [15.1, 107.2],
      [14.8, 106.5],
      [16.0, 105.7],
      [17.3, 104.9],
      [18.6, 103.9],
    ],
    innerRing: [
      [19.3, 104.2],
      [18.2, 105.1],
      [16.9, 106.0],
      [15.6, 106.7],
      [15.4, 106.2],
      [16.7, 105.5],
      [18.0, 104.6],
    ],
  },
  {
    id: 'central-highlands',
    label: 'CENTRAL HIGHLANDS',
    outerRing: [
      [14.7, 107.4],
      [13.9, 108.3],
      [12.4, 108.4],
      [11.7, 107.6],
      [12.3, 106.9],
      [13.7, 107.0],
    ],
    innerRing: [
      [14.2, 107.6],
      [13.5, 108.0],
      [12.5, 108.0],
      [12.2, 107.4],
      [13.3, 107.3],
    ],
  },
  {
    id: 'laos-plateau',
    label: 'XIANGKHOUANG PLATEAU',
    outerRing: [
      [20.2, 102.4],
      [20.0, 103.8],
      [19.0, 103.9],
      [18.8, 102.6],
      [19.4, 102.1],
    ],
    innerRing: [
      [19.8, 102.7],
      [19.7, 103.5],
      [19.2, 103.5],
      [19.1, 102.7],
    ],
  },
]

// Huvudfloder: Mekongfloden (från norra Laos via Vientiane och Kambodja till
// Mekongdeltat) samt Röda floden i Tonkin.
export const INDOCHINA_RIVERS: readonly RiverPath[] = [
  {
    id: 'mekong-main',
    name: 'Mekong River',
    width: 1.9,
    points: [
      [20.4, 100.5],
      [19.8, 101.4],
      [18.5, 101.9],
      [17.95, 102.6],
      [17.4, 104.7],
      [16.5, 104.75],
      [15.1, 105.8],
      [13.9, 105.9],
      [12.5, 106.0],
      [11.55, 104.92],
      [10.7, 105.2],
      [10.1, 105.8],
      [9.6, 106.5],
    ],
  },
  {
    id: 'bassac-delta',
    name: 'Bassac Branch',
    width: 1.2,
    points: [
      [11.55, 104.92],
      [10.5, 105.0],
      [9.8, 105.7],
      [9.4, 106.2],
    ],
  },
  {
    id: 'red-river',
    name: 'Red River',
    width: 1.5,
    points: [
      [22.4, 103.9],
      [21.5, 104.9],
      [21.02, 105.85],
      [20.6, 106.3],
      [20.25, 106.6],
    ],
  },
]

// Militära huvudvägar: Route 1 (kustvägen), Route 9 (kusten till Laos) och Route 13 (Saigon–An Loc–Laos).
export const MILITARY_HIGHWAYS: readonly MilitaryHighway[] = [
  {
    id: 'route-1',
    code: 'HWY 1',
    name: 'Route Coloniale 1',
    points: [
      [17.0, 107.05],
      [16.46, 107.59],
      [16.05, 108.21],
      [15.12, 108.8],
      [13.77, 109.22],
      [12.24, 109.19],
      [10.93, 108.1],
      [10.78, 106.7],
    ],
  },
  {
    id: 'route-9',
    code: 'RTE 9',
    name: 'Route 9 Corridor',
    points: [
      [16.8, 107.18],
      [16.65, 106.4],
      [16.58, 105.5],
      [16.55, 104.75],
    ],
  },
  {
    id: 'route-13',
    code: 'RTE 13',
    name: 'Route 13 North',
    points: [
      [10.78, 106.7],
      [11.15, 106.63],
      [11.65, 106.6],
      [12.8, 106.0],
      [15.1, 105.8],
    ],
  },
]

// Historiska flyg- och flottbaser på 1965 års krigskarta.
export const MILITARY_BASES: readonly MilitaryBaseMarker[] = [
  { id: 'tan-son-nhut', kind: 'airbase', label: 'TAN SON NHUT AB', anchor: [10.82, 106.65] },
  { id: 'da-nang-ab', kind: 'airbase', label: 'DA NANG AB', anchor: [16.04, 108.2] },
  { id: 'udorn-rtaf', kind: 'airbase', label: 'UDORN RTAFB', anchor: [17.38, 102.78] },
  { id: 'cam-ranh-nav', kind: 'naval', label: 'CAM RANH BAY', anchor: [11.9, 109.2] },
  { id: 'haiphong-port', kind: 'naval', label: 'HAIPHONG PORT', anchor: [20.86, 106.68] },
]

// Beräknar en taggig, handritad fettkrits-frontlinje tvärs över frontens
// aktuella lat/lng-punkt, så att frontlinjen ser ut som en riktig militär
// frontlinje istället för en 4px-prick.
export function buildJaggedFrontlinePoints(
  centerXY: [number, number],
  theatreId: string,
  segments = 7,
): string {
  const [cx, cy] = centerXY
  const spanX = theatreId === 'laos' ? 28 : 34
  const slopeY = theatreId === 'laos' ? -8 : 11
  const pts: string[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments - 0.5
    const x = cx + t * spanX * 2
    const sawtooth = i % 2 === 0 ? -3.2 : 3.2
    const y = cy + t * slopeY * 2 + sawtooth
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

export interface ParsedRedeployMovement {
  id: string
  formationName: string
  fromSectorId: string
  toSectorId: string
  fromAnchor: LatLng
  toAnchor: LatLng
}

const REDEPLOY_RE = /^(.+?) REDEPLOYS ([A-Z0-9-]+) → ([A-Z0-9-]+) AFTER THE BREAKTHROUGH$/i

function findSectorAnchor(sectorId: string): LatLng | null {
  const lower = sectorId.toLowerCase()
  for (const regions of Object.values(SECTOR_REGIONS)) {
    const match = regions.find((r) => r.sectorId.toLowerCase() === lower)
    if (match) return match.anchor
  }
  return null
}

// Extraherar faktiska truppförflyttningar (REDEPLOY) ur WireEvent-listan
// så att både kartan och QuarterReplay kan rita ut MovementArrow.
export function extractRedeployMovements(wire: readonly WireEvent[], onlyTurn?: number): ParsedRedeployMovement[] {
  const results: ParsedRedeployMovement[] = []
  for (const ev of wire) {
    if (onlyTurn !== undefined && ev.turn !== onlyTurn) continue
    const m = REDEPLOY_RE.exec(ev.headline.trim())
    if (!m) continue
    const formationName = m[1]!
    const fromSectorId = m[2]!.toLowerCase()
    const toSectorId = m[3]!.toLowerCase()
    const fromAnchor = findSectorAnchor(fromSectorId)
    const toAnchor = findSectorAnchor(toSectorId)
    if (!fromAnchor || !toAnchor) continue
    results.push({
      id: ev.id,
      formationName,
      fromSectorId,
      toSectorId,
      fromAnchor,
      toAnchor,
    })
  }
  return results
}

export interface PinnedHistoryNote {
  id: string
  turn: number
  title: string
  anchor: LatLng
}

// Geografiska nålplatser för historiska händelser (Tonkinbukten, Da Nang,
// Saigon, Vientiane, Hue) som inträffat under partiet.
export function derivePinnedHistoryNotes(state: GameState): PinnedHistoryNote[] {
  const notes: PinnedHistoryNote[] = []
  const headlines = state.wire.filter((e) => e.severity === 'headline' && Object.keys(e.delta).some((k) => k.startsWith('history.')))

  for (const ev of headlines.slice(-4)) {
    const upper = ev.headline.toUpperCase()
    let anchor: LatLng = [10.82, 106.0] // Saigon default
    if (upper.includes('TONKIN') || upper.includes('MADDOX')) anchor = [19.4, 107.6]
    else if (upper.includes('DA NANG') || upper.includes('ROLLING THUNDER')) anchor = [16.2, 108.6]
    else if (upper.includes('LAOS') || upper.includes('VIENTIANE')) anchor = [18.3, 102.9]
    else if (upper.includes('BUDDHIST') || upper.includes('HUE')) anchor = [16.6, 107.3]
    else if (upper.includes('TET')) anchor = [11.2, 106.3]

    notes.push({
      id: ev.id,
      turn: ev.turn,
      title: ev.headline.slice(0, 32) + (ev.headline.length > 32 ? '…' : ''),
      anchor,
    })
  }
  return notes
}
