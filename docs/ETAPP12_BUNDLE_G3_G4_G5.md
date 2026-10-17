# ETAPP 12 — GEMINI BUNDLE G3, G4 & G5 (P194–P198)

> **DIREKTIV TILL CLAUDE CODE:**
> Detta dokument innehåller de avslutande tre leveranspaketen från Gemini (**Paket G3, G4 och G5** — totalt 6 filer under `packages/app/src/`) samt instruktionerna för **P194–P198**.
>
> **Hårda regler:**
> 1. Packa upp samtliga 6 filer längst ner i detta dokument (`=== BEGIN FILE: <sökväg> ===` till `=== END FILE ===`) **ordagrant** till deras angivna sökvägar[cite: 1].
> 2. Du får **INTE** förenkla, stryka eller rita om SVG-geometrin, 3D-brickorna, fettkritslinjerna eller CSS-stilarna.
> 3. Alla UI-strängar och JSX-texter i de inbäddade filerna är på engelska så att `packages/app/test/uiLanguage.test.ts` (S1) går grönt[cite: 1].
> 4. Rör ALDRIG `packages/core/src/resolve/`, `balance.json` eller golden-snapshoten[cite: 1].
> *(Notis från P193: kontrollera att rad 65 i `packages/app/src/deskYarnContext.ts` lyder `const station = state.house.stations.find((s) => s.id === action.stationId)`).*

---

## Promptsekvens P194–P198 för Claude Code

### P194 — Militärkartan 1965, Fettkrits-frontlinjer och 3D-Chits (Paket G4 del A)
1. Skriv ut `packages/app/src/mapMilitaryOverlay.ts`, `packages/app/src/components/RichTheatreMap.tsx` och `packages/app/src/styles/desk-map-and-tools.css` ur detta dokument.
2. Importera `./styles/desk-map-and-tools.css` i `packages/app/src/main.tsx` (direkt efter `./styles/desk-war-room.css`)[cite: 1].
3. Koppla in `<MilitaryBaseMapLayer project={project} />` i `packages/app/src/components/TheatreMap.tsx` direkt ovanpå `.map-countries` (och under `.map-sectors`), så att höjdkurvor, Mekongfloden, Route 1/9/13, flygbaser, flottbaser och kartusch ritas ut i kartans koordinatsystem[cite: 1].
4. I `TheatreMap.tsx`: ersätt den gamla inre `FormationToken`-komponenten med `<WargameChit>` från `RichTheatreMap.tsx`[cite: 1].
   - Behåll exakt samma `data-testid="map-formation-${display.id}"` och lägg till `data-map-node={display.id}`[cite: 1].
   - Rendera `<WargameChit>` redan från `zoomLevel >= 1` så att pappbrickorna alltid syns på PC-skrivbordet[cite: 1].
   - All data MÅSTE fortsätta gå via `formationDisplay(state, formation)` (Skyddsräcke 3)[cite: 1].
5. I `TheatreMap.tsx`: lägg in `<FrontlineGreasePolyline>` inuti `.map-frontlines` för varje front (tillsammans med befintliga `data-testid="map-frontline-marker-${front.id}"` och spårpunkter så att samtliga befintliga tester i `TheatreMap.test.tsx` förblir gröna)[cite: 1].
6. **Klart när:** `TheatreMap.test.tsx`, `uiLanguage.test.ts` och `e2e/text-overflow.spec.ts` är gröna[cite: 1].

---

### P195 — Dynamiska världsspår på kartan (Paket G4 del B)
1. I `TheatreMap.tsx`: rendera `<DynamicWorldOverlays state={state} project={project} playerLines={playerLines} rivalLines={rivalLines} onSelectCountry={onSelectCountry} onSelectNode={setSelection} />` (från `RichTheatreMap.tsx`) inuti kartans `<g transform={transform.toString()}>`[cite: 1].
2. Detta lager ritar deterministiskt ut ur `GameState`:
   - **Fartygsbrickor till havs (`ShipConvoyLayer`):** Fraktfartyg längs sjörutterna mot Da Nang/Vientiane för aktiva `playerLines` och `rivalLines`, med kärnvapenmärkning (`☢ MK-9`) om någon aktiv leverans i `state.market.shipments` avser `mk9_longhand_shell`[cite: 1].
   - **Stridsärr & 7th Fleet (`HeatScarsLayer`):** Artillerikors vid drabbade sektorer när `theatre.heat >= 30` och 7th Fleet-hangarfartyg i Tonkinbukten när `theatre.heat >= 55`[cite: 1].
   - **Embargostämplar (`EmbargoStampLayer`):** En röd stämpel (`PORT CLOSED — EMBARGO`) över huvudstaden om `state.factions[id].embargoed === true`[cite: 1].
   - **Fastnålade Historiska Polaroidkort (`PinnedHistoryLayer`):** Miniatyrkort på kartan för inträffade historiska händelser i `state.history`[cite: 1].
   - **Dynamisk Redeploy-pil (`ActiveRedeployArrowLayer`):** Om senaste turen i `state.wire` innehåller en `REDEPLOY`-händelse ritas en fettkritspil mellan från- och till-sektorn på kartan[cite: 1].
3. Lägg till `data-map-node={capital.factionId}` på huvudstadsgruppen i `TheatreMap.tsx` och `data-map-node={region.sectorId}` på sektorgruppen så att `DeskYarn` alltid hittar dem[cite: 1].
4. **Klart när:** Nya och befintliga tester i `TheatreMap.test.tsx` verifierar de dynamiska lagren utan konsol- eller typfel[cite: 1].

---

### P196 — Koreograferad kvartalsuppspelning på kartan & `MovementArrow` (Paket G5)
1. Skriv ut `packages/app/src/components/MapQuarterReplay.tsx` ur detta dokument.
2. Uppdatera `packages/app/src/components/QuarterReplay.tsx` så att den delegerar till (eller exporterar) `MapQuarterReplay` med exakt samma prop-signatur (`wire`, `state`, `fullReplay`, `onToggleFullReplay`, `memo`, `onFocus`, `onDone`) och samma `REPLAY_INTERVAL_MS`[cite: 1].
3. `MapQuarterReplay` behåller alla `data-testid` som `QuarterReplay.test.tsx` och `QuarterReplay.memo.test.tsx` kontrollerar (`quarter-replay`, `replay-full-toggle`, `replay-list`, `replay-item-flash`, `replay-front-page`, `replay-skip`), men placerar kortet som en kompakt kommandodispatch längs kartans kant så att kartan under syns fritt, samtidigt som den extraherar `REDEPLOY` och `SUPPLY_ARRIVAL` ur `wire` och renderar `<MovementArrow>` (från `MovementArrow.tsx`)[cite: 1]!
4. **Klart när:** `QuarterReplay.test.tsx`, `QuarterReplay.memo.test.tsx` och `MovementArrow.test.tsx` är 100 % gröna[cite: 1].

---

### P197 — Fysiskt stämpelverktyg (`RubberStampTool`) och fastgemade porträtt (Paket G3)
1. Skriv ut `packages/app/src/components/RubberStampTool.tsx` och `packages/app/src/components/PaperclipPhoto.tsx` ur detta dokument.
2. I `packages/app/src/components/BidForm.tsx`:
   - Behåll alla befintliga reglage och beräkningar, men byt ut `Place Bid` / `Update Bid`-knappen mot `<RubberStampTool label={existingBid ? 'Update Bid' : 'Place Bid'} stampText={existingBid ? 'UPDATED BID' : 'SEALED BID'} stampId={order.id} onStamp={() => onSubmit({ orderId: order.id, price, grade, promisedDeliveryTurns, ...(designId ? { designId } : {}) })} />`[cite: 1].
   - Eftersom `<RubberStampTool>` renderar en riktig `<button type="button">` med `children={label}` fungerar samtliga befintliga tester (`getByRole('button', { name: /place bid/i })`) utan att gå sönder, samtidigt som en musspelare på PC får den fysiska trästämpeln som följer muspekaren och slår ner med bläckmask (`wearClass`) och stämpelljud[cite: 1]!
3. I `packages/app/src/components/CountryFile.tsx` och `packages/app/src/components/ThePolitics.tsx`:
   - Montera `<PaperclipPhoto kind="official" factionId={official.factionId} post={official.post} name={display.name} />` i huvudet på varje tjänstemannakort i `ThePolitics.tsx`[cite: 1].
   - Montera `<PaperclipPhoto kind="rival" rivalId={rival.id} name={rival.name} />` i `RivalDossier` i `ThePolitics.tsx`[cite: 1].
   - Byt ut `FILE`-knapparna i `CountryFile.tsx` och `ThePolitics.tsx` mot `<RubberStampTool label="FILE" stampText="AUTHORISED" stampId={...} disabled={!validation.ok} onStamp={...} testId={...} />`[cite: 1].
4. **Klart när:** Samtliga `BidForm.*.test.tsx`, `CountryFile.test.tsx` och `ThePolitics.*.test.tsx` är gröna[cite: 1].

---

### P198 — Slutligt testsvep, `npm run shots` och verifiering (Claude Code)
1. Kör `npm test`, `npm run lint`, `npm run build` och `npm run test:e2e`[cite: 1].
2. Kör `npm run shots` och verifiera skärmbilderna i `1440×900`[cite: 1].
3. Bekräfta att `packages/core/test/golden/golden.test.ts` är helt orörd[cite: 1].

---

# INBÄDDADE FILER FÖR PAKET G3, G4 & G5

=== BEGIN FILE: packages/app/src/mapMilitaryOverlay.ts ===
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
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/RichTheatreMap.tsx ===
// RichTheatreMap.tsx — Paket G4 (ETAPP 12, 12D): komponenter för den rika
// militärkartan 1965 (topografiska höjdkurvor, floder, vägar, flyg-/flottbaser,
// kartusch), taggiga fettkrits-frontlinjer, 3D-pappbrickor (WargameChit) och
// dynamiska världsspår (fraktfartyg till havs, stridsärr vid hög heat,
// embargostämplar, fastnålade historiska händelsekort och redeploy-pilar).
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { Doctrine, FactionId, FormationDisplay, Front, GameState } from '@seventh-front/core'
import { interpolateFrontGeoPosition } from '../geoMath.js'
import type { MapSelection } from '../mapInfo.js'
import type { SectorRegion } from '../sectorRegions.js'
import type { SupplyLine } from '../supplyLines.js'
import {
  buildJaggedFrontlinePoints,
  derivePinnedHistoryNotes,
  extractRedeployMovements,
  INDOCHINA_RIVERS,
  MILITARY_BASES,
  MILITARY_HIGHWAYS,
  TOPOGRAPHIC_RIDGES,
} from '../mapMilitaryOverlay.js'
import type { LatLng } from '../mapMilitaryOverlay.js'

export type ProjectFn = (lngLat: [number, number]) => [number, number] | null

function polyPathFromLatLng(points: readonly LatLng[], project: ProjectFn, closed = false): string {
  const projected = points.map(([lat, lng]) => project([lng, lat])).filter((p): p is [number, number] => p !== null)
  if (projected.length === 0) return ''
  const body = projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')
  return `M${body}${closed ? 'Z' : ''}`
}

// 1. MILITÄR BAS-KARTA (Topografi, Mekongfloden, Huvudvägar, Baser & Kartusch)
export function MilitaryBaseMapLayer({ project }: { project: ProjectFn }) {
  return (
    <g className="map-military-base" data-testid="map-military-base" pointerEvents="none">
      {/* Topografiska höjdkurvor */}
      <g className="map-topo-ridges">
        {TOPOGRAPHIC_RIDGES.map((ridge) => {
          const outerD = polyPathFromLatLng(ridge.outerRing, project, true)
          const innerD = polyPathFromLatLng(ridge.innerRing, project, true)
          const labelPt = ridge.innerRing[0] ? project([ridge.innerRing[0][1], ridge.innerRing[0][0]]) : null
          return (
            <g key={ridge.id}>
              <path d={outerD} className="map-topo-outer" />
              <path d={innerD} className="map-topo-inner" />
              {labelPt && (
                <text x={labelPt[0]} y={labelPt[1]} className="map-topo-label">
                  {ridge.label}
                </text>
              )}
            </g>
          )
        })}
      </g>

      {/* Flodsystem (Mekong, Bassac, Röda floden) */}
      <g className="map-rivers">
        {INDOCHINA_RIVERS.map((river) => (
          <path
            key={river.id}
            d={polyPathFromLatLng(river.points, project, false)}
            className="map-river-path"
            style={{ strokeWidth: river.width }}
          />
        ))}
      </g>

      {/* Militära huvudvägar (Route 1, Route 9, Route 13) */}
      <g className="map-highways">
        {MILITARY_HIGHWAYS.map((hwy) => {
          const d = polyPathFromLatLng(hwy.points, project, false)
          const mid = hwy.points[Math.floor(hwy.points.length / 2)]
          const midXY = mid ? project([mid[1], mid[0]]) : null
          return (
            <g key={hwy.id}>
              <path d={d} className="map-highway-line" />
              {midXY && (
                <g transform={`translate(${midXY[0].toFixed(1)},${midXY[1].toFixed(1)})`}>
                  <rect x={-16} y={-6} width={32} height={11} rx={1.5} className="map-highway-shield" />
                  <text y={2.5} textAnchor="middle" className="map-highway-code">
                    {hwy.code}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </g>

      {/* Historiska flyg- och flottbaser */}
      <g className="map-bases">
        {MILITARY_BASES.map((base) => {
          const xy = project([base.anchor[1], base.anchor[0]])
          if (!xy) return null
          return (
            <g key={base.id} transform={`translate(${xy[0].toFixed(1)},${xy[1].toFixed(1)})`}>
              {base.kind === 'airbase' ? (
                <path d="M-4,0L4,0M0,-4L0,4M-2.5,-2.5L2.5,2.5" className="map-base-glyph" />
              ) : (
                <circle r={3} className="map-base-glyph-naval" />
              )}
              <text x={6} y={3} className="map-base-label">
                {base.label}
              </text>
            </g>
          )
        })}
      </g>

      {/* Militär Kartusch (US Army Map Service 1965-stil) i Sydkinesiska sjön */}
      <g transform="translate(475, 690)" className="map-cartouche">
        <rect x={-96} y={-28} width={192} height={54} className="map-cartouche-box" />
        <rect x={-93} y={-25} width={186} height={48} className="map-cartouche-inner" />
        <text y={-11} textAnchor="middle" className="map-cartouche-title">
          INDOCHINA THEATRE
        </text>
        <text y={2} textAnchor="middle" className="map-cartouche-sub">
          SCALE 1:2,000,000 · MERCATOR PROJECTION
        </text>
        <text y={14} textAnchor="middle" className="map-cartouche-sub">
          TOPOGRAPHIC &amp; LOGISTICS COMPILATION · 1965
        </text>
      </g>
    </g>
  )
}

// 2. TAGGIG FETTKRITS-FRONTLINJE MED SPÖKSPÅR BAKÅT
export function FrontlineGreasePolyline({
  front,
  regions,
  project,
}: {
  front: Front
  regions: SectorRegion[]
  project: ProjectFn
}) {
  const tracePositions = front.trace.slice(-3).reverse().filter((p) => p !== front.position)
  const currentLatLng = interpolateFrontGeoPosition(regions, front.position)
  const currentXY = project([currentLatLng[1], currentLatLng[0]])
  if (!currentXY) return null

  return (
    <g className="map-grease-frontline" pointerEvents="none">
      {tracePositions.map((pos, idx) => {
        const pt = interpolateFrontGeoPosition(regions, pos)
        const xy = project([pt[1], pt[0]])
        if (!xy) return null
        return (
          <polyline
            key={`grease-trace-${idx}`}
            points={buildJaggedFrontlinePoints(xy, front.theatreId)}
            className="map-grease-trace-line"
            style={{ opacity: 0.35 - idx * 0.1 }}
          />
        )
      })}
      <polyline
        points={buildJaggedFrontlinePoints(currentXY, front.theatreId)}
        className={front.status === 'war' ? 'map-grease-active-line is-war' : 'map-grease-active-line is-quiet'}
        data-testid={`map-grease-line-${front.id}`}
      />
    </g>
  )
}

function ChitDoctrineGlyph({ doctrine }: { doctrine: Doctrine }) {
  switch (doctrine) {
    case 'infantry':
      return <path d="M-7,-5L7,5M7,-5L-7,5" className="map-token-glyph" />
    case 'mechanised':
      return <ellipse cx={0} cy={0} rx={5.5} ry={3.2} className="map-token-glyph map-token-glyph-outline" />
    case 'armoured':
      return <ellipse cx={0} cy={0} rx={5.5} ry={3.2} className="map-token-glyph map-token-glyph-filled" />
    case 'artillery':
      return <circle cx={0} cy={0} r={2.8} className="map-token-glyph map-token-glyph-filled" />
    case 'irregular':
      return <path d="M-6,3L-2,-3L2,3L6,-3" className="map-token-glyph" />
  }
}

// 3. FYSISKA 3D-PAPPBRICKOR (Wargame Chits, Skyddsräcke 3-säkrade via FormationDisplay)
export function WargameChit({
  display,
  x,
  y,
  onExplain,
  selected = false,
}: {
  display: FormationDisplay
  x: number
  y: number
  onExplain?: () => void
  selected?: boolean
}) {
  const dotCount = display.strengthBand === 'stark' ? 3 : display.strengthBand === 'medel' ? 2 : 1
  const frameClass = [
    'map-token-frame',
    display.status === 'mauled' ? 'is-mauled' : '',
    display.status === 'refitting' ? 'is-refitting' : '',
    !display.known ? 'is-unknown' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g
      transform={`translate(${x},${y})`}
      data-testid={`map-formation-${display.id}`}
      data-map-node={display.id}
      className={selected ? `map-formation-${display.side} map-wargame-chit is-selected` : `map-formation-${display.side} map-wargame-chit`}
      onClick={onExplain}
    >
      <circle r={15} className="map-token-tap" />
      {selected && <circle r={16} className="map-selected-ring" />}

      {display.side === 'a' ? (
        <>
          {/* 3D pappkant under brickan */}
          <rect x={-11.5} y={-5.5} width={25} height={17} rx={1.5} className="map-chit-depth" />
          <rect x={-13} y={-8} width={25} height={17} rx={1.5} className={frameClass} />
        </>
      ) : (
        <>
          <polygon points="1.5,-10 14,1.5 1.5,13 -11,1.5" className="map-chit-depth" />
          <polygon points="0,-12 12.5,0 0,12 -12.5,0" className={frameClass} />
        </>
      )}

      {display.status === 'mauled' && (
        <>
          <path d="M-5,-7L0,0L-2,7M5,-7L0,0L2,7" className="map-token-crack" />
          <rect x={-13} y={-15} width={26} height={7} rx={1} className="map-chit-mauled-tag" />
        </>
      )}

      {display.known ? (
        <ChitDoctrineGlyph doctrine={display.doctrine} />
      ) : (
        <g className="map-token-unknown-mark">
          <path d="M-1.6,-2.4C-1.6,-3.6,1.8,-3.6,1.8,-2.1C1.8,-0.7,0,-0.6,0,0.8" className="map-token-glyph" />
          <circle cx={0} cy={3} r={0.7} className="map-token-glyph map-token-glyph-filled" />
        </g>
      )}

      <g className="map-token-dots">
        {Array.from({ length: dotCount }, (_, i) => (
          <circle key={i} cx={-4 + i * 4} cy={12} r={1.2} className="map-token-dot" />
        ))}
      </g>
    </g>
  )
}

// 4. DYNAMISKA VÄRLDSSPÅR PÅ KARTAN (Fartyg till havs, Heat-stridsärr, Embargostämplar, Historiekort & Redeploy-pil)
export function DynamicWorldOverlays({
  state,
  project,
  playerLines,
  rivalLines,
  onSelectCountry,
  onSelectNode,
}: {
  state: GameState
  project: ProjectFn
  playerLines: readonly SupplyLine[]
  rivalLines: readonly SupplyLine[]
  onSelectCountry?: (factionId: FactionId) => void
  onSelectNode?: (sel: MapSelection) => void
}) {
  const hasNuclearShipment = state.market.shipments.some((s) => {
    const c = state.market.contracts.find((ct) => ct.id === s.contractId)
    return c?.productId === 'mk9_longhand_shell'
  })

  const latestTurn = state.wire.length > 0 ? Math.max(...state.wire.map((e) => e.turn)) : state.meta.turn - 1
  const recentRedeploys = extractRedeployMovements(state.wire, latestTurn)
  const historyNotes = derivePinnedHistoryNotes(state)

  return (
    <g className="map-dynamic-world" data-testid="map-dynamic-world">
      {/* A. Fraktfartyg till havs för aktiva leveranser */}
      <g className="map-sea-convoys">
        {playerLines.map((line, idx) => {
          const seaPt = project([109.1, 15.2 - idx * 1.6])
          if (!seaPt) return null
          return (
            <g
              key={`ship-${line.id}`}
              transform={`translate(${seaPt[0].toFixed(1)},${seaPt[1].toFixed(1)})`}
              className="map-ship-chit is-player"
              data-testid={`map-ship-${line.id}`}
              onClick={() => onSelectNode?.({ kind: 'supply', lineId: line.id })}
            >
              <path d="M-12,2L-9,6L9,6L12,2L7,2L5,-3L-4,-3L-6,2Z" className="map-ship-hull" />
              <rect x={-16} y={8} width={32} height={9} rx={1} className="map-ship-tag" />
              <text y={14.5} textAnchor="middle" className="map-ship-tag-text">
                {hasNuclearShipment ? '☢ MK-9' : 'H&V SHIP'}
              </text>
            </g>
          )
        })}

        {rivalLines.map((line, idx) => {
          const seaPt = project([109.3, 17.0 - idx * 1.4])
          if (!seaPt) return null
          return (
            <g
              key={`rival-ship-${line.id}`}
              transform={`translate(${seaPt[0].toFixed(1)},${seaPt[1].toFixed(1)})`}
              className="map-ship-chit is-rival"
              data-testid={`map-ship-${line.id}`}
              onClick={() => onSelectNode?.({ kind: 'supply', lineId: line.id })}
            >
              <path d="M-10,2L-7,5L7,5L10,2L4,-2L-4,-2Z" className="map-ship-hull is-rival" />
            </g>
          )
        })}
      </g>

      {/* B. Krigets ärr & 7th Fleet skalade efter Theatre.heat */}
      <g className="map-heat-scars" pointerEvents="none">
        {Object.values(state.theatres).map((theatre) => {
          if (theatre.heat < 30) return null
          const escalated = theatre.heat >= DISPLAY_THRESHOLDS.heatEscalation
          const carrierXY = theatre.id === 'indochina' ? project([108.4, 18.2]) : null
          return (
            <g key={`scars-${theatre.id}`} data-testid={`map-heat-scars-${theatre.id}`}>
              {escalated && carrierXY && (
                <g transform={`translate(${carrierXY[0].toFixed(1)},${carrierXY[1].toFixed(1)})`}>
                  <path d="M-15,0L-11,5L11,5L15,0L10,-3L-10,-3Z" className="map-carrier-silhouette" />
                  <text y={13} textAnchor="middle" className="map-carrier-label">
                    TF-77 CARRIER GROUP
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </g>

      {/* C. Röda Embargostämplar över stängda köparländer */}
      <g className="map-embargo-stamps">
        {Object.values(state.factions)
          .filter((f) => f.embargoed)
          .map((faction) => {
            const coords: LatLng =
              faction.id === 'rvn' ? [11.2, 106.8] : faction.id === 'laos' ? [18.2, 103.0] : [13.5, 106.2]
            const xy = project([coords[1], coords[0]])
            if (!xy) return null
            return (
              <g
                key={`embargo-${faction.id}`}
                transform={`translate(${xy[0].toFixed(1)},${xy[1].toFixed(1)}) rotate(-11)`}
                className="map-embargo-stamp"
                data-testid={`map-embargo-${faction.id}`}
                onClick={() => onSelectCountry?.(faction.id)}
              >
                <rect x={-52} y={-11} width={104} height={20} className="map-embargo-box" />
                <text y={3.5} textAnchor="middle" className="map-embargo-text">
                  EMBARGOED
                </text>
              </g>
            )
          })}
      </g>

      {/* D. Truppförflyttningspilar (REDEPLOY ur senaste turens Wire) */}
      <g className="map-redeploy-vectors" pointerEvents="none">
        {recentRedeploys.map((move) => {
          const fromXY = project([move.fromAnchor[1], move.fromAnchor[0]])
          const toXY = project([move.toAnchor[1], move.toAnchor[0]])
          if (!fromXY || !toXY) return null
          return (
            <g key={move.id} data-testid={`map-redeploy-arrow-${move.id}`}>
              <line
                x1={fromXY[0]}
                y1={fromXY[1]}
                x2={toXY[0]}
                y2={toXY[1]}
                className="map-redeploy-line"
              />
              <circle cx={toXY[0]} cy={toXY[1]} r={5} className="map-redeploy-head" />
            </g>
          )
        })}
      </g>

      {/* E. Fastnålade Historiska Händelsekort */}
      <g className="map-pinned-history" pointerEvents="none">
        {historyNotes.map((note) => {
          const xy = project([note.anchor[1], note.anchor[0]])
          if (!xy) return null
          return (
            <g
              key={note.id}
              transform={`translate(${xy[0].toFixed(1)},${xy[1].toFixed(1)}) rotate(-2)`}
              data-testid={`map-history-pin-${note.id}`}
            >
              <rect x={-38} y={-10} width={76} height={18} rx={1} className="map-history-card" />
              <circle cx={0} cy={-9} r={2.4} className="map-history-pinhead" />
              <text y={2.5} textAnchor="middle" className="map-history-text">
                T{note.turn} · DISPATCH
              </text>
            </g>
          )
        })}
      </g>
    </g>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/MapQuarterReplay.tsx ===
// MapQuarterReplay.tsx — Paket G5 (ETAPP 12, 12E): koreograferad kvartalsuppspelning
// direkt ovanpå den synliga kartan, inklusive inkoppling av MovementArrow.tsx
// för förbandsförflyttningar (REDEPLOY) och leveranser (SUPPLY_ARRIVAL).
// Bevarar samtliga data-testid och props från QuarterReplay.tsx.
import { useEffect, useState } from 'react'
import type { BoardMemo as BoardMemoData, GameState, WireEvent } from '@seventh-front/core'
import { anchorLabel, wireAnchor } from '../wireAnchor.js'
import { historyFrontPage, isFlashEvent } from '../newsClassification.js'
import { extractRedeployMovements } from '../mapMilitaryOverlay.js'
import { FrontPageCard } from './FrontPageCard.js'
import { BoardMemo } from './BoardMemo.js'
import { MovementArrow } from './MovementArrow.js'
import { DsToggle } from './designSystem.js'
import { Tag } from './ui.js'

export const REPLAY_INTERVAL_MS = 700

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function MapQuarterReplay({
  wire,
  state,
  fullReplay,
  onToggleFullReplay,
  memo = null,
  onFocus,
  onDone,
}: {
  wire: readonly WireEvent[]
  state: GameState
  fullReplay: boolean
  onToggleFullReplay: (value: boolean) => void
  memo?: BoardMemoData | null
  onFocus?: (event: WireEvent | null) => void
  onDone: () => void
}) {
  const events = fullReplay ? wire : wire.filter((e) => e.severity === 'headline')
  const frontPage = wire.map(historyFrontPage).find((e) => e !== null) ?? null
  const reduced = prefersReducedMotion()
  const hasMemo = memo !== null
  const nothingToAnimate = reduced || events.length === 0
  const [shown, setShown] = useState(0)
  const [memoVisible, setMemoVisible] = useState(hasMemo && nothingToAnimate)

  const redeployMoves = extractRedeployMovements(wire)

  useEffect(() => {
    if (nothingToAnimate && !hasMemo) {
      onDone()
    }
  }, [])

  useEffect(() => {
    onFocus?.(nothingToAnimate || shown === 0 ? null : (events[Math.min(shown, events.length) - 1] ?? null))
  }, [shown])

  useEffect(() => () => onFocus?.(null), [])

  useEffect(() => {
    if (nothingToAnimate) return
    if (shown >= events.length) {
      if (hasMemo) {
        setMemoVisible(true)
        return
      }
      const timer = setTimeout(onDone, REPLAY_INTERVAL_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setShown((n) => n + 1), REPLAY_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [shown])

  if (nothingToAnimate && !hasMemo) return null

  const visible = nothingToAnimate ? events : events.slice(0, shown)

  function handleSkip() {
    if (hasMemo && !memoVisible) {
      setShown(events.length)
      setMemoVisible(true)
      return
    }
    onDone()
  }

  return (
    <div
      className={memo && memoVisible ? 'modal-overlay' : 'modal-overlay is-map-replay desk-map-replay-dock'}
      data-testid="quarter-replay"
    >
      <div className="modal-panel replay-panel desk-replay-card">
        <div className="replay-head">
          <div>
            <span className="desk-kicker">LIVE TELEX &amp; MAP RESOLUTION</span>
            <h2 className="view-title">Quarter Replay</h2>
          </div>
          <DsToggle
            label="Full playback"
            checked={fullReplay}
            onChange={onToggleFullReplay}
            testId="replay-full-toggle"
          />
        </div>

        {frontPage && <FrontPageCard event={frontPage} testId="replay-front-page" />}

        {redeployMoves.length > 0 && (
          <div className="desk-replay-movements" data-testid="replay-movements">
            {redeployMoves.map((mv) => (
              <MovementArrow
                key={mv.id}
                kind="REDEPLOY"
                formationName={mv.formationName}
                fromSectorId={mv.fromSectorId}
                toSectorId={mv.toSectorId}
              />
            ))}
          </div>
        )}

        <ol className="replay-list" data-testid="replay-list" tabIndex={0} aria-label="Quarter events">
          {visible.map((event) => {
            const anchor = wireAnchor(state, event)
            const label = anchorLabel(state, anchor)
            const flash = isFlashEvent(event)
            return (
              <li
                key={event.id}
                className={flash ? 'replay-item is-flash' : 'replay-item'}
                data-testid={flash ? 'replay-item-flash' : undefined}
              >
                <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
                <span className="replay-text">{event.headline}</span>
                {label && <span className="replay-anchor">{label}</span>}
                {event.actorIsPlayer && <Tag tone="amber">YOU</Tag>}
              </li>
            )
          })}
        </ol>

        {memo && memoVisible && <BoardMemo memo={memo} />}

        <button
          type="button"
          className="ds-button is-secondary replay-skip"
          onClick={handleSkip}
          data-testid="replay-skip"
        >
          {memo && memoVisible ? 'Continue' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/RubberStampTool.tsx ===
// RubberStampTool.tsx — Paket G3 (ETAPP 12, 12F): fysiskt trästämpelverktyg.
// När spelaren för muspekaren över signaturfältet följer trästämpelns
// fysiska skugga muspekaren; vid klick slår stämpeln ner i papperet med
// stämpelljud (playSound('stamp')), kompressionsanimation och bläckslitage
// (wearClass ur stampWear.ts). Renderar en riktig <button> så att
// tangentbordsnavigation och alla befintliga tester fungerar rakt av.
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { playSound } from '../sound.js'
import { wearClass } from '../stampWear.js'

export interface RubberStampToolProps {
  label: ReactNode
  stampText?: string
  stampId?: string
  tone?: 'red' | 'green' | 'amber'
  disabled?: boolean
  onStamp: () => void
  testId?: string
}

export function RubberStampTool({
  label,
  stampText = 'SEALED & FILED',
  stampId = 'default-stamp',
  tone = 'red',
  disabled = false,
  onStamp,
  testId,
}: RubberStampToolProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [slammedAt, setSlammedAt] = useState<{ x: number; y: number } | null>(null)

  function handleMouseMove(e: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX ? e.clientX - rect.left : rect.width / 2
    const clickY = e.clientY ? e.clientY - rect.top : rect.height / 2
    setSlammedAt({ x: clickX, y: clickY })
    void playSound('stamp')
    onStamp()
  }

  return (
    <button
      type="button"
      className={`ds-button is-primary desk-stamp-pad is-${tone}${slammedAt ? ' is-stamped' : ''}`}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCursorPos(null)}
      onClick={handleClick}
      data-testid={testId}
    >
      <span className="desk-stamp-pad-frame" aria-hidden="true">
        <span className="desk-stamp-sig-line">SIGNATURE &amp; SEAL</span>
      </span>

      <span className="desk-stamp-btn-label">{label}</span>

      {slammedAt && (
        <span
          className={`desk-stamp-impression is-${tone}${wearClass(stampId)}`}
          style={{ left: `${slammedAt.x}px`, top: `${slammedAt.y}px` }}
          aria-hidden="true"
        >
          {stampText}
        </span>
      )}

      {cursorPos && !disabled && (
        <span
          className="desk-wooden-stamp-cursor"
          style={{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }}
          aria-hidden="true"
        >
          <span className="desk-wooden-handle" />
          <span className="desk-wooden-base">{stampText}</span>
        </span>
      )}
    </button>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/PaperclipPhoto.tsx ===
// PaperclipPhoto.tsx — Paket G3 (ETAPP 12, 12F): fastgemade övervakningsfoton
// och vapenhussigill på person- och rivalakter i CONTACTS och CountryFile.
// Använder de befintliga SVG-tillgångarna i public/art/portraits/ och public/art/seals/.
import type { FactionId, Post, RivalId } from '@seventh-front/core'

export type PaperclipPhotoProps =
  | {
      kind: 'official'
      factionId: FactionId
      post: Post
      name: string
    }
  | {
      kind: 'rival'
      rivalId: RivalId
      name: string
    }

export function PaperclipPhoto(props: PaperclipPhotoProps) {
  const portraitSrc =
    props.kind === 'official'
      ? `/art/portraits/official-${props.factionId}-${props.post}.svg`
      : `/art/portraits/chairman-${props.rivalId}.svg`

  const sealSrc = props.kind === 'rival' ? `/art/seals/${props.rivalId}.svg` : null

  return (
    <span className="desk-mugshot-wrap" aria-hidden="true" data-testid="paperclip-photo">
      <span className="desk-metal-paperclip" />
      <span className="desk-mugshot-polaroid">
        <img src={portraitSrc} alt="" className="desk-mugshot-img" />
        {sealSrc && <img src={sealSrc} alt="" className="desk-mugshot-seal" />}
      </span>
    </span>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/styles/desk-map-and-tools.css ===
/* desk-map-and-tools.css — Paket G3, G4 & G5 (ETAPP 12):
 * Militärkarta 1965, topografiska höjdkurvor, floder, vägar, 3D-pappbrickor
 * (Wargame Chits), fettkrits-frontlinjer, fartygsbrickor, stridsärr,
 * trästämpelverktyg och fastgemade porträttfoton.
 */

/* ── MILITÄR BAS-KARTA 1965 ── */
.map-topo-outer {
  fill: rgba(138, 114, 76, 0.11);
  stroke: #8c7653;
  stroke-width: 0.7;
  stroke-dasharray: 4 2;
}

.map-topo-inner {
  fill: rgba(120, 96, 60, 0.14);
  stroke: #7a6442;
  stroke-width: 0.6;
}

.map-topo-label {
  font-family: var(--font-mono);
  font-size: 7.5px;
  fill: #6e5b3e;
  letter-spacing: 0.1em;
  opacity: 0.8;
}

.map-river-path {
  fill: none;
  stroke: #7fa09a;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
}

.map-highway-line {
  fill: none;
  stroke: #9c5930;
  stroke-width: 1.2;
  stroke-dasharray: 6 2;
  opacity: 0.75;
}

.map-highway-shield {
  fill: #f6f1e3;
  stroke: #5d4b35;
  stroke-width: 0.8;
}

.map-highway-code {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 700;
  fill: #5d4b35;
}

.map-base-glyph {
  stroke: #4d4335;
  stroke-width: 1.2;
}

.map-base-glyph-naval {
  fill: none;
  stroke: #2d5a8c;
  stroke-width: 1.3;
}

.map-base-label {
  font-family: var(--font-ui);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  fill: #4d4335;
  stroke: #ebe1c7;
  stroke-width: 2.2;
  paint-order: stroke;
}

.map-cartouche-box {
  fill: rgba(246, 241, 227, 0.88);
  stroke: #3b3226;
  stroke-width: 1.5;
}

.map-cartouche-inner {
  fill: none;
  stroke: #5d4b35;
  stroke-width: 0.6;
}

.map-cartouche-title {
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.14em;
  fill: #241f18;
}

.map-cartouche-sub {
  font-family: var(--font-mono);
  font-size: 7.5px;
  fill: #51483b;
}

/* ── FETTKRITS-FRONTLINJER & 3D-CHITS ── */
.map-grease-trace-line {
  fill: none;
  stroke: #241f18;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-grease-active-line {
  fill: none;
  stroke: #241f18;
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-grease-active-line.is-war {
  stroke: #8f1d18;
}

.map-chit-depth {
  fill: #1b1610;
  opacity: 0.82;
}

.map-chit-mauled-tag {
  fill: var(--red, #b3302a);
}

/* ── DYNAMISKA VÄRLDSSPÅR PÅ KARTAN ── */
.map-ship-chit {
  cursor: pointer;
}

.map-ship-hull {
  fill: var(--amber, #b0700f);
  stroke: #241f18;
  stroke-width: 1;
}

.map-ship-hull.is-rival {
  fill: var(--rival, #6b4f9e);
}

.map-ship-tag {
  fill: #f6f1e3;
  stroke: #241f18;
  stroke-width: 0.8;
}

.map-ship-tag-text {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 700;
  fill: #241f18;
}

.map-carrier-silhouette {
  fill: #353b33;
  stroke: #11140e;
  stroke-width: 1;
}

.map-carrier-label {
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 700;
  fill: #241f18;
}

.map-embargo-box {
  fill: rgba(246, 241, 227, 0.85);
  stroke: var(--red, #b3302a);
  stroke-width: 2;
}

.map-embargo-text {
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.14em;
  fill: var(--red, #b3302a);
}

.map-redeploy-line {
  stroke: var(--red, #b3302a);
  stroke-width: 2.8;
  stroke-dasharray: 5 3;
}

.map-redeploy-head {
  fill: var(--red, #b3302a);
}

.map-history-card {
  fill: #fbf6e8;
  stroke: #51483b;
  stroke-width: 1;
}

.map-history-pinhead {
  fill: var(--red, #b3302a);
}

.map-history-text {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 700;
  fill: #241f18;
}

/* ── FYSISKT STÄMPELVERKTYG (RubberStampTool) ── */
.desk-stamp-pad {
  position: relative;
  min-height: 54px;
  width: 100%;
  background: #fbf7ec;
  color: var(--ink, #241f18);
  border: 1.5px dashed #7a6b53;
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  cursor: crosshair;
  display: flex;
  align-items: center;
  justify-content: center;
}

.desk-stamp-pad:hover:not(:disabled) {
  background: #fffdf6;
  border-color: var(--red, #b3302a);
}

.desk-stamp-pad-frame {
  position: absolute;
  left: 8px;
  top: 4px;
  pointer-events: none;
}

.desk-stamp-sig-line {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--ink-dim, #51483b);
}

.desk-stamp-btn-label {
  font-family: var(--font-display);
  font-size: 16px;
  letter-spacing: 0.08em;
  color: var(--ink, #241f18);
  z-index: 2;
}

.desk-stamp-impression {
  position: absolute;
  transform: translate(-50%, -50%) rotate(-6deg);
  padding: 2px 10px;
  border: 2.5px solid var(--red, #b3302a);
  color: var(--red, #b3302a);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  pointer-events: none;
  z-index: 4;
  background: rgba(246, 241, 227, 0.78);
}

.desk-stamp-impression.is-green {
  border-color: var(--green, #4d7a3e);
  color: var(--green, #4d7a3e);
}

.desk-wooden-stamp-cursor {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.desk-wooden-handle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #8c532b, #3d1f0a);
  border: 1.5px solid #1c0d04;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
}

.desk-wooden-base {
  margin-top: -4px;
  padding: 1px 8px;
  background: rgba(42, 34, 26, 0.88);
  border: 1px solid #000;
  color: #f6ead4;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.45);
}

/* ── FASTGEMADE PORTRÄTTFOTON (PaperclipPhoto) ── */
.desk-mugshot-wrap {
  position: relative;
  display: inline-flex;
  margin-right: 10px;
  flex-shrink: 0;
}

.desk-metal-paperclip {
  position: absolute;
  top: -6px;
  left: 8px;
  width: 10px;
  height: 20px;
  border: 2px solid #5a6058;
  border-radius: 5px;
  z-index: 3;
}

.desk-mugshot-polaroid {
  position: relative;
  width: 46px;
  height: 54px;
  background: #e8dec6;
  border: 2px solid #fff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
  transform: rotate(-2deg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.desk-mugshot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.desk-mugshot-seal {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 18px;
  height: 18px;
}

/* ── KOMPAKT KARTUPPSPELNING (MapQuarterReplay) ── */
.desk-replay-movements {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0;
  padding: 6px 8px;
  background: rgba(179, 48, 42, 0.1);
  border-left: 3px solid var(--red, #b3302a);
}
=== END FILE ===