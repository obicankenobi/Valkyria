// supplyLines — P82 (ETAPP7_TEKNISK_SPEC.md §6.3 lager 6, §6.7): "Spelarens
// leveranser under transport, ur Shipment (arrivalTurn) och Contract.frontId,
// som streckad linje i telexgult från ingångshamn till sektor. Rivalernas
// härleds ur hur Front.attribution förändrats mellan två turer och ritas i
// rivalens färg. Ingångshamnar per teater är presentationsdata."
//
// Ren, testbar — precis som wireAnchor.ts/newsClassification.ts, rör aldrig
// packages/core.
//
// Etapp 14 (ägarbeslut 2026-11-09): avsteget nedan gäller inte längre för kontrakt som ersätter ett förbands förluster — de bär
// Contract.formationId, och linjen går till förbandets sektor (playerSupplyLines). För övriga kontrakt gäller det fortfarande.
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
import { PLAYER_ATTRIBUTION_KEY, getProduct } from '@seventh-front/core'
import { quarterOfTurn } from './displayNames.js'
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
  // Etapp 14: förbandet linjen går till (spelarens kontrakt som ersätter förluster); utelämnat = frontens ankare.
  formationId?: string
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
// behövs. En linje per front OCH förband: flera samtidiga leveranser till samma
// mål hade annars ritat identiskt överlappande linjer.
// Etapp 14 (ägarbeslut 2026-11-09): ett kontrakt som ersätter ett förbands förluster bär förbandets id (Contract.formationId, core) —
// dess linje går till sektorn där förbandet står NU (följer en omgruppering), inte till frontens ankare. Övriga kontrakt som förut.
const FORMATION_SEPARATOR = '--'

function formationSector(state: GameState, formationId: string): string | null {
  for (const front of Object.values(state.fronts)) {
    const formation = front.formations.find((f) => f.id === formationId)
    if (formation) return formation.sectorId
  }
  return null
}

export function playerSupplyLines(state: GameState, regionsByTheatre: Record<string, SectorRegion[]>): SupplyLine[] {
  const targets = new Map<string, { frontId: string; formationId: string | null }>()
  for (const shipment of state.market.shipments) {
    const contract = state.market.contracts.find((c) => c.id === shipment.contractId)
    if (!contract?.frontId) continue
    const formationId = contract.formationId && formationSector(state, contract.formationId) ? contract.formationId : null
    const id = formationId ? `player-${contract.frontId}${FORMATION_SEPARATOR}${formationId}` : `player-${contract.frontId}`
    targets.set(id, { frontId: contract.frontId, formationId })
  }

  const lines: SupplyLine[] = []
  for (const [id, { frontId, formationId }] of targets) {
    const front = state.fronts[frontId]
    if (!front) continue
    const port = THEATRE_ENTRY_POINTS[front.theatreId]
    const sectorId = formationId ? formationSector(state, formationId) : null
    const region = sectorId ? regionsByTheatre[front.theatreId]?.find((r) => r.sectorId === sectorId) : undefined
    const anchor = region ? region.anchor : frontAnchor(front.theatreId, regionsByTheatre)
    if (!port || !anchor) continue
    lines.push({ id, kind: 'player', frontId, ...(formationId ? { formationId } : {}), fromAnchor: port.anchor, toAnchor: anchor })
  }
  return lines
}

// Försändelserna på en av spelarens linjer (samma gruppering som playerSupplyLines).
export function playerLineShipments(state: GameState, lineId: string): GameState['market']['shipments'] {
  return state.market.shipments.filter((shipment) => {
    const contract = state.market.contracts.find((c) => c.id === shipment.contractId)
    if (!contract?.frontId) return false
    const formationId = contract.formationId && formationSector(state, contract.formationId) ? contract.formationId : null
    const id = formationId ? `player-${contract.frontId}${FORMATION_SEPARATOR}${formationId}` : `player-${contract.frontId}`
    return id === lineId
  })
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

// ── Etapp 14, P206 (förslaget §6.1) ─────────────────────────────────────────────────────────────────────────────────────────────
// Konvojlinjer för ÖPPNA ersättningsordrar: från teaterns ingångspunkt till sektorn där förbandet som förlorat materielen står
// (Order.reason.formationId → Formation.sectorId). Ett vunnet kontrakt har inget sectorId (se avsteget överst), så dess linje går
// fortfarande till frontens ankare; den linjen får i stället en etikett med antal och ankomstkvartal ur Shipment.arrivalTurn.
export interface OrderConvoy {
  id: string
  orderId: string
  formationId: string
  formationName: string
  fromAnchor: [number, number] // [lat, lng]
  toAnchor: [number, number]
  label: string
}

function productShortName(name: string): string {
  return name.split(',')[0]!.trim()
}

export function orderConvoys(state: GameState, regionsByTheatre: Record<string, SectorRegion[]>): OrderConvoy[] {
  const convoys: OrderConvoy[] = []
  for (const order of state.market.openOrders) {
    if (order.reason.kind !== 'REPLACE_FORMATION_LOSSES') continue
    const formationId = order.reason.formationId
    const front = Object.values(state.fronts).find((f) => f.formations.some((fm) => fm.id === formationId))
    const formation = front?.formations.find((fm) => fm.id === formationId)
    if (!front || !formation) continue
    const port = THEATRE_ENTRY_POINTS[front.theatreId]
    const region = regionsByTheatre[front.theatreId]?.find((r) => r.sectorId === formation.sectorId)
    if (!port || !region) continue
    convoys.push({
      id: `order-${order.id}`,
      orderId: order.id,
      formationId,
      formationName: formation.name,
      fromAnchor: port.anchor,
      toAnchor: region.anchor,
      label: `WANTED · ${order.quantity}× ${productShortName(getProduct(order.productId).name).toUpperCase()}`,
    })
  }
  return convoys
}

// Etiketten på spelarens leveranslinje: hur mycket som är på väg och när det första anländer.
export function playerSupplyLabel(state: GameState, lineId: string): string | null {
  const shipments = playerLineShipments(state, lineId)
  const units = shipments.reduce((sum, s) => sum + s.units, 0)
  if (units === 0) return null
  const firstArrival = Math.min(...shipments.map((s) => s.arrivalTurn))
  return `YOU · ${units} UNITS · ARRIVES ${quarterOfTurn(firstArrival).toUpperCase()}`
}
