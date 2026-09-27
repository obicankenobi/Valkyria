// supplyLines — P82 (ETAPP7_TEKNISK_SPEC.md §6.3 lager 6, §6.7): "Spelarens
// leveranser under transport, ur Shipment (arrivalTurn) och Contract.frontId,
// som streckad linje i telexgult från ingångshamn till sektor. Rivalernas
// härleds ur hur Front.attribution förändrats mellan två turer och ritas i
// rivalens färg. Ingångshamnar per teater är presentationsdata."
//
// Ren, testbar — precis som wireAnchor.ts/newsClassification.ts, rör aldrig
// packages/core.
//
// AVSTEG, dokumenterat (samma "stanna, beskriv, föreslå"-princip som
// resten av projektet): §6.7 säger "till sektor", men varken Contract eller
// Shipment har ett sectorId-fält (bara Contract.frontId, en HEL front, som
// kan ha flera sektorer, se Formation.sectorId/SECTOR_REGIONS) — det finns
// ingen datamodell att härleda EN specifik sektor ur. Löst genom att rita
// linjen till frontens EGEN ankarpunkt (medelvärdet av dess teaters
// SECTOR_REGIONS-ankare, samma beräkning TheatreMap.tsx redan använder för
// heat-glödens position) i stället — samma princip som redan gällde för
// SUPPLY_ARRIVAL/REDEPLOY i P41/ANDRINGSLOGG.md: hellre en dokumenterad
// approximation än att uppfinna ett nytt core-fält för en ren
// presentationsdetalj.
import type { GameState } from '@seventh-front/core'
import { PLAYER_ATTRIBUTION_KEY } from '@seventh-front/core'
import type { SectorRegion } from './sectorRegions.js'

// Verkliga, historiska ingångspunkter för materiel in i teatrarna — samma
// "riktigt, inte påhittat"-princip som SECTOR_REGIONS/capitals.ts. Da Nang
// (§6.2:s egen sektorankare, en av krigets största amerikanska
// logistikhamnar) för Indokina; Vientiane (capitals.ts:s ankare, Laos enda
// egna internationella inkörsport i den här skalan — landlåst, inte en hamn
// i bokstavlig mening, men samma roll: den punkt materiel når landet genom)
// för Laos.
export const THEATRE_ENTRY_POINTS: Record<string, { label: string; anchor: [number, number] }> = {
  indochina: { label: 'DA NANG', anchor: [16.05, 108.21] },
  laos: { label: 'VIENTIANE', anchor: [17.97, 102.6] },
}

export interface SupplyLine {
  id: string
  kind: 'player' | 'rival'
  frontId: string
  fromAnchor: [number, number] // [lat, lng]
  toAnchor: [number, number]
}

function frontAnchor(theatreId: string, regionsByTheatre: Record<string, SectorRegion[]>): [number, number] | null {
  const regions = regionsByTheatre[theatreId]
  if (!regions || regions.length === 0) return null
  const avgLat = regions.reduce((sum, r) => sum + r.anchor[0], 0) / regions.length
  const avgLng = regions.reduce((sum, r) => sum + r.anchor[1], 0) / regions.length
  return [avgLat, avgLng]
}

// Varje Shipment KVARSTÅR i state.market.shipments ända till den anländer
// (deliveries.ts tar bort den då, types.ts:s egen kommentar) — närvaro i
// listan ÄR alltså "under transport", inget ytterligare arrivalTurn-filter
// behövs. En linje per FRONT (inte per shipment) — flera samtidiga
// leveranser till samma front hade annars ritat identiskt överlappande
// linjer, ren visuell brus utan extra information.
export function playerSupplyLines(state: GameState, regionsByTheatre: Record<string, SectorRegion[]>): SupplyLine[] {
  const frontIdsInTransit = new Set<string>()
  for (const shipment of state.market.shipments) {
    const contract = state.market.contracts.find((c) => c.id === shipment.contractId)
    if (contract?.frontId) frontIdsInTransit.add(contract.frontId)
  }

  const lines: SupplyLine[] = []
  for (const frontId of frontIdsInTransit) {
    const front = state.fronts[frontId]
    if (!front) continue
    const port = THEATRE_ENTRY_POINTS[front.theatreId]
    const anchor = frontAnchor(front.theatreId, regionsByTheatre)
    if (!port || !anchor) continue
    lines.push({ id: `player-${frontId}`, kind: 'player', frontId, fromAnchor: port.anchor, toAnchor: anchor })
  }
  return lines
}

// Front.attribution['spelaren'] hanteras ALDRIG här (PLAYER_ATTRIBUTION_KEY
// utesluts uttryckligen) — spelarens egna leveranser har redan sin egen,
// mer exakta Shipment-baserade linje ovan.
export function rivalSupplyLines(
  state: GameState,
  prevAttribution: Record<string, Record<string, number>>,
  regionsByTheatre: Record<string, SectorRegion[]>,
): SupplyLine[] {
  const lines: SupplyLine[] = []
  for (const front of Object.values(state.fronts)) {
    const prev = prevAttribution[front.id] ?? {}
    for (const [key, value] of Object.entries(front.attribution)) {
      if (key === PLAYER_ATTRIBUTION_KEY) continue
      const prevValue = prev[key] ?? 0
      if (value <= prevValue) continue
      const port = THEATRE_ENTRY_POINTS[front.theatreId]
      const anchor = frontAnchor(front.theatreId, regionsByTheatre)
      if (!port || !anchor) continue
      lines.push({ id: `rival-${front.id}-${key}`, kind: 'rival', frontId: front.id, fromAnchor: port.anchor, toAnchor: anchor })
    }
  }
  return lines
}

// Ett litet, rent hjälpobjekt att spara i en useRef mellan renderingar
// (rivalSupplyLines egen jämförelsepunkt) — bara Front.attribution, inga
// andra fält.
export function snapshotAttribution(state: GameState): Record<string, Record<string, number>> {
  const snapshot: Record<string, Record<string, number>> = {}
  for (const front of Object.values(state.fronts)) {
    snapshot[front.id] = { ...front.attribution }
  }
  return snapshot
}
