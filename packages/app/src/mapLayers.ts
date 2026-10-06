// mapLayers — P166 (ETAPP10_FORSLAG.md §3b): växlingsbara kartlager med tal, inte bara färg. Ett lager lägger en liten tagg med siffror vid varje köpare (eller front) på kartan.
// Allt är härlett ur tillståndet — inget tal hittas på här. Ett lager åt gången, så att siffrorna inte tävlar om samma plats.
//
// NLF har ingen egen landmassa (se mapInfo.ts), men är en av köparna: dess tagg och markering sitter mitt bland dess förband (landlessFactions).
import { PLAYER_ATTRIBUTION_KEY, effectiveDepth } from '@seventh-front/core'
import type { FactionId, GameState } from '@seventh-front/core'
import { CAPITALS } from './capitals.js'
import { COUNTRY_TO_FACTION } from './mapInfo.js'
import type { MapSelection } from './mapInfo.js'
import { SECTOR_REGIONS } from './sectorRegions.js'
import { STATION_BAND_PCT } from './stationOutlook.js'

export type MapLayerId = 'orders' | 'supply' | 'rivals' | 'intelligence' | 'politics'

export const MAP_LAYERS: readonly { id: MapLayerId; label: string; short: string }[] = [
  { id: 'orders', label: 'Orders', short: 'ORD' },
  { id: 'supply', label: 'Supply', short: 'SUP' },
  { id: 'rivals', label: 'Rivals', short: 'RIV' },
  { id: 'intelligence', label: 'Intelligence', short: 'INT' },
  { id: 'politics', label: 'Politics', short: 'POL' },
]

export interface LayerTag {
  id: string
  anchor: [number, number] // [lat, lng]
  side: 'left' | 'right' // vilken sida av ankarpunkten taggen står på
  lines: string[]
  selection: MapSelection | null
}

export interface LandlessFaction {
  factionId: FactionId
  anchor: [number, number] | null // medelvärdet av ankarna för sektorerna där dess förband står
}

// En faktion som är sida i en front men saknar egen landmassa (inget land i COUNTRY_TO_FACTION).
export function landlessFactions(state: GameState): LandlessFaction[] {
  const mapped = new Set<string>(Object.values(COUNTRY_TO_FACTION))
  const ids = new Set<FactionId>()
  for (const front of Object.values(state.fronts)) for (const id of [front.sideA, front.sideB]) if (!mapped.has(id)) ids.add(id)
  return [...ids].map((factionId) => {
    const sectors = new Set(
      Object.values(state.fronts)
        .flatMap((f) => f.formations)
        .filter((f) => f.factionId === factionId && f.status !== 'destroyed')
        .map((f) => f.sectorId),
    )
    const anchors = Object.values(SECTOR_REGIONS)
      .flat()
      .filter((r) => sectors.has(r.sectorId))
      .map((r) => r.anchor)
    if (anchors.length === 0) return { factionId, anchor: null }
    return {
      factionId,
      anchor: [anchors.reduce((a, p) => a + p[0], 0) / anchors.length, anchors.reduce((a, p) => a + p[1], 0) / anchors.length] as [number, number],
    }
  })
}

interface Buyer {
  factionId: FactionId
  anchor: [number, number]
  side: 'left' | 'right'
  selection: MapSelection
}

function buyers(state: GameState): Buyer[] {
  const out: Buyer[] = []
  for (const capital of CAPITALS) {
    const countryId = Object.entries(COUNTRY_TO_FACTION).find(([, id]) => id === capital.factionId)?.[0] ?? capital.factionId
    out.push({ factionId: capital.factionId, anchor: capital.anchor, side: 'left', selection: { kind: 'country', countryId } })
  }
  for (const l of landlessFactions(state)) {
    if (l.anchor) out.push({ factionId: l.factionId, anchor: l.anchor, side: 'right', selection: { kind: 'faction', factionId: l.factionId } })
  }
  return out
}

const LIVE = new Set(['active', 'late'])

function contractsOf(state: GameState, buyerId: FactionId): { yours: number; rivals: number } {
  return {
    yours: state.market.contracts.filter((c) => c.buyerId === buyerId && LIVE.has(c.status)).length,
    rivals: Object.values(state.rivals).reduce((sum, r) => sum + r.contracts.filter((c) => c.buyerId === buyerId && LIVE.has(c.status)).length, 0),
  }
}

function linesFor(state: GameState, layer: MapLayerId, buyer: Buyer): string[] {
  const id = buyer.factionId
  const faction = state.factions[id]
  switch (layer) {
    case 'orders': {
      const open = state.market.openOrders.filter((o) => o.buyerId === id).length
      const need = faction ? Math.round(Object.values(faction.materielNeed).reduce((a, b) => a + b, 0)) : 0
      return [`${open} open`, `${contractsOf(state, id).yours} yours`, `need ${need}`]
    }
    case 'rivals': {
      const { yours, rivals } = contractsOf(state, id)
      const total = yours + rivals
      return [`${yours} : ${rivals} contracts`, `you ${total === 0 ? '—' : `${Math.round((yours / total) * 100)}%`}`]
    }
    case 'intelligence': {
      const station = state.house.stations.find((s) => s.nation === id && s.status === 'active')
      return [station ? `depth ${station.depth} · exp ${Math.round(station.exposure)}%` : 'no station', `bands ±${STATION_BAND_PCT[effectiveDepth(state, id)]}%`]
    }
    case 'politics': {
      const lines = [`relation ${Math.round(faction?.relationToPlayer ?? 0)}`, `support ${Math.round(faction?.publicSupport ?? 0)}%`]
      if (faction?.embargoed) lines.push('EMBARGO')
      const tenders = (state.programmes ?? []).filter((p) => p.buyerId === id && p.phase !== 'cancelled' && p.phase !== 'awarded').length
      if (tenders > 0) lines.push(`${tenders} ${tenders === 1 ? 'tender' : 'tenders'}`)
      return lines
    }
    case 'supply':
      return []
  }
}

function supplyTags(state: GameState): LayerTag[] {
  const tags: LayerTag[] = []
  for (const front of Object.values(state.fronts)) {
    const regions = SECTOR_REGIONS[front.theatreId]
    if (!regions || regions.length === 0) continue
    const contractIds = new Set(state.market.contracts.filter((c) => c.frontId === front.id).map((c) => c.id))
    const inTransit = state.market.shipments.filter((s) => contractIds.has(s.contractId)).reduce((sum, s) => sum + s.units, 0)
    const rivals = Object.entries(front.attribution)
      .filter(([key]) => key !== PLAYER_ATTRIBUTION_KEY && state.rivals[key] !== undefined)
      .reduce((sum, [, units]) => sum + units, 0)
    tags.push({
      id: front.id,
      anchor: [regions.reduce((a, r) => a + r.anchor[0], 0) / regions.length, regions.reduce((a, r) => a + r.anchor[1], 0) / regions.length],
      side: 'right',
      lines: [`you ${inTransit} in transit`, `rivals ${Math.round(rivals)} delivered`],
      selection: { kind: 'frontline', frontId: front.id },
    })
  }
  return tags
}

export function layerTags(state: GameState, layer: MapLayerId): LayerTag[] {
  if (layer === 'supply') return supplyTags(state)
  return buyers(state).map((buyer) => {
    // Underrättelselagret pekar på stationen när det finns en — det är den som har en rad i kartans kort.
    const hasStation = state.house.stations.some((s) => s.nation === buyer.factionId && s.status === 'active')
    return {
      id: buyer.factionId,
      anchor: buyer.anchor,
      side: buyer.side,
      lines: linesFor(state, layer, buyer),
      selection: layer === 'intelligence' && hasStation ? ({ kind: 'station', factionId: buyer.factionId } as MapSelection) : buyer.selection,
    }
  })
}
