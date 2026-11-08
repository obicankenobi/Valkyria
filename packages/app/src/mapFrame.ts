// mapFrame.ts — etapp 14, P201 (speltest 2026-11-04, förslaget "Krigsrumsbordet" §5.1): kartans ram på en bred skärm.
// Förr var vyboxen fast 600×800 (stående telefon, P76) och projektionen anpassad till HELA kartfilen, så kartan fick tomt hav på
// sidorna i krigsbordets breda kartyta. Nu följer vyboxens bredd kartytans proportion (höjden står kvar på 800 enheter, så text och
// markörer behåller sin storlek), och projektionen anpassas till Indokina (FOCUS_BOUNDS) i stället för till hela filen.
// Rena funktioner, testade i test/mapFrame.test.ts.

export const VIEW_HEIGHT = 800
const MIN_VIEW_WIDTH = 600 // den gamla stående vyn; smalare än så blir det aldrig
const MAX_VIEW_WIDTH = 2000

// [lng, lat] — Indokina från Ca Mau-udden till Hanoi/Tonkinbukten, Laos och Kambodja i bredd. Kartfilen (public/geo) är bredare
// (91–118°E, 3–26°N), så att det som syns utanför fokus på en bred skärm är land eller hav, aldrig tomt papper.
export const FOCUS_BOUNDS: readonly [[number, number], [number, number]] = [
  [100.0, 8.4],
  [109.6, 22.6],
]
export const FOCUS_PADDING = 24

// Vyboxens bredd för en kartyta i px. Okänd storlek (jsdom, första varvet) ger den gamla stående vyn.
export function viewWidthFor(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return MIN_VIEW_WIDTH
  const width = Math.round((VIEW_HEIGHT * widthPx) / heightPx)
  return Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, width))
}

// Skalstocken: ett jämnt avstånd i km som ger en stock på ungefär 60–150 vyboxenheter vid aktuell zoom. `projectionScale` är
// d3-geoMercators scale() (enheter per radian vid ekvatorn); Mercator sträcker med 1/cos(lat), så stocken räknas vid kartans mitt.
const EARTH_RADIUS_KM = 6371
const NICE_KM = [25, 50, 100, 200, 250, 500, 1000]
export function scaleBarFor(projectionScale: number, latitude: number, zoom: number): { km: number; nauticalMiles: number; length: number } {
  const unitsPerKm = (projectionScale * zoom) / EARTH_RADIUS_KM / Math.cos((latitude * Math.PI) / 180)
  const km = NICE_KM.find((candidate) => candidate * unitsPerKm >= 60) ?? NICE_KM[NICE_KM.length - 1]!
  return { km, nauticalMiles: Math.round(km / 1.852), length: km * unitsPerKm }
}

// Tryckta namn på kartpapperet: länder och hav. Placerade för hand på land respektive vatten och borta från huvudstäderna; ett namn som
// ändå skulle krocka med en annan etikett döljs av kartans kollisionsdöljning (regel 18), det krymps aldrig.
export interface PrintLabel {
  id: string
  text: string
  lngLat: [number, number]
  kind: 'country' | 'sea'
  // Var stämpeln NO RECONNAISSANCE står när landet är ett köparland utan underrättelse (bara köparländer har en).
  stampLngLat?: [number, number]
}
export const PRINT_LABELS: readonly PrintLabel[] = [
  { id: 'north-vietnam', text: 'NORTH VIETNAM', lngLat: [104.7, 21.7], kind: 'country' },
  { id: 'south-vietnam', text: 'SOUTH VIETNAM', lngLat: [106.1, 9.5], kind: 'country', stampLngLat: [107.6, 12.6] },
  { id: 'laos', text: 'LAOS', lngLat: [101.6, 20.7], kind: 'country', stampLngLat: [100.9, 19.3] },
  { id: 'cambodia', text: 'CAMBODIA', lngLat: [104.6, 13.2], kind: 'country' },
  { id: 'thailand', text: 'THAILAND', lngLat: [100.6, 16.2], kind: 'country' },
  { id: 'china', text: 'CHINA', lngLat: [104.2, 24.2], kind: 'country' },
  { id: 'burma', text: 'BURMA', lngLat: [98.4, 19.8], kind: 'country' },
  { id: 'sea-south-china', text: 'SOUTH CHINA SEA', lngLat: [112.2, 14.6], kind: 'sea' },
  { id: 'sea-tonkin', text: 'GULF OF TONKIN', lngLat: [107.7, 19.7], kind: 'sea' },
  { id: 'sea-siam', text: 'GULF OF SIAM', lngLat: [101.7, 10.1], kind: 'sea' },
]

// Gradnätet: var annan grad, över hela kartfilens utbredning.
export const GRATICULE_EXTENT: [[number, number], [number, number]] = [
  [90, 2],
  [120, 28],
]
export const GRATICULE_STEP: [number, number] = [2, 2]
