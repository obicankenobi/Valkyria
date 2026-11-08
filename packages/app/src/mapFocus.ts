// mapFocus.ts — etapp 14, P204 (förslaget §6.2–6.3): kopplingen mellan kartan och mapparna, åt båda hållen. Ren och testbar.
// - Var på kartan ett valt föremål ligger (kartan panorerar dit när mappen ber om det).
// - Vilka öppna ordrar ett förband eller ett köparland står bakom (kartan öppnar CONTRACTS filtrerat på dem).
import { foreignSite } from '@seventh-front/core'
import type { FactionId, GameState, Order } from '@seventh-front/core'
import { CAPITALS } from './capitals.js'
import type { MapSelection } from './mapInfo.js'
import { SECTOR_REGIONS } from './sectorRegions.js'
import { COUNTRY_TO_FACTION } from './mapInfo.js'

function sectorAnchor(sectorId: string): [number, number] | null {
  for (const regions of Object.values(SECTOR_REGIONS)) {
    const region = regions.find((r) => r.sectorId === sectorId)
    if (region) return region.anchor
  }
  return null
}

// [lat, lng] för ett föremål på kartan, eller null om det inte har någon plats.
export function selectionGeoAnchor(state: GameState, selection: MapSelection): [number, number] | null {
  switch (selection.kind) {
    case 'works': {
      const works = state.house.works.find((w) => w.id === selection.facilityId)
      const site = works?.location ? foreignSite(works.location) : null
      return site ? sectorAnchor(site.sectorId) : null
    }
    case 'formation': {
      const formation = Object.values(state.fronts)
        .flatMap((f) => f.formations)
        .find((f) => f.id === selection.formationId)
      return formation ? sectorAnchor(formation.sectorId) : null
    }
    case 'sector':
      return sectorAnchor(selection.sectorId)
    case 'country': {
      const factionId = COUNTRY_TO_FACTION[selection.countryId]
      return CAPITALS.find((c) => c.factionId === factionId)?.anchor ?? null
    }
    case 'station':
    case 'faction': {
      return CAPITALS.find((c) => c.factionId === selection.factionId)?.anchor ?? null
    }
    default:
      return null
  }
}

// Filtret CONTRACTS öppnas med från kartan: en köpares ordrar (orderbrickan vid huvudstaden) eller ett förbands ersättningsordrar.
export type OrdersFilter = { kind: 'buyer'; factionId: FactionId } | { kind: 'formation'; formationId: string; formationName: string }

export function ordersMatching(state: GameState, filter: OrdersFilter | null): Order[] {
  const orders = state.market.openOrders
  if (!filter) return orders
  if (filter.kind === 'buyer') return orders.filter((o) => o.buyerId === filter.factionId)
  return orders.filter((o) => o.reason.kind === 'REPLACE_FORMATION_LOSSES' && o.reason.formationId === filter.formationId)
}

export function ordersFilterLabel(state: GameState, filter: OrdersFilter): string {
  if (filter.kind === 'buyer') return `Orders from ${state.factions[filter.factionId]?.name ?? 'this buyer'}`
  return `Replacement orders for the ${filter.formationName}`
}
