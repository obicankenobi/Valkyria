// TheatreMap — P76/P77 (ETAPP7_TEKNISK_SPEC.md §6/§13): den riktiga geografiska
// teaterkartan som ersätter Shell.tsx:s MapPlaceholder på OPERATIONS.
// Ägarbeslut A (§2): "Kartan blir geografisk... inget taktiskt lager,
// spelaren flyttar inga förband, kartan visar aldrig mer än modellen håller
// reda på." Läser bara via queries.ts:s redan existerande deriveSectorControl/
// formationDisplay/effectiveDepth — precis som den gamla schematiska
// SectorBoard.tsx gjorde (P66/P68), bara projicerat på riktig geografi
// (SECTOR_REGIONS, sectorRegions.ts) i stället för fasta 0–100-
// skärmkoordinater. `SectorBoard.tsx`/`sectorLayout.ts` (den schematiska
// tavlan A retirerar) rörs inte — utanför scope, se sectorRegions.ts:s egen
// kommentar.
//
// P76 byggde: geografiskriptet, TopoJSON, projektion, pan/zoom,
// SECTOR_REGIONS-kontrollfärgning, frontlinje med spår.
// P77 lägger till (§13:s P77-rad, ordagrant "APP-6-brickor, underrättelsedimma,
// allt i §6.6 under omgivningsrörelse"): förbandsbrickor (§6.3 lager 7),
// underrättelsedimma (lager 3, per LAND — kontrollfärgningen i lager 4 är
// ALLTID synlig oavsett dimma, se deriveSectorControl.ts:s egen kommentar:
// "kontrollstatus är grov/synlig oavsett underrättelsedjup"), heat-glöd
// (lager 9) och två omgivningsrörelser vars mål nu finns: heat-glöden andas,
// frontlinjen skimrar. UTANFÖR scope (§6.3:s egna lagernummer, ingen
// producent än): försörjningslinjer (lager 6, P82), huvudstäder/stationer/
// hamnar/ordermarkörer (lager 8, P79), markering av valt föremål (lager 10,
// P79) — samma "bygg inte runt en lucka" som P76 höll fast vid.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import type { GeoPermissibleObjects } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomTransform } from 'd3-zoom'
import * as topojsonClient from 'topojson-client'
import { DISPLAY_THRESHOLDS, deriveSectorControl, effectiveDepth, formationDisplay } from '@seventh-front/core'
import type { Doctrine, FactionId, FormationDisplay, GameState } from '@seventh-front/core'
import { interpolateFrontGeoPosition, tokenOffset } from '../geoMath.js'
import { SECTOR_REGIONS } from '../sectorRegions.js'
import type { SectorRegion } from '../sectorRegions.js'
import { CAPITALS } from '../capitals.js'
import { playerSupplyLines, rivalSupplyLines, snapshotAttribution } from '../supplyLines.js'
import { ACTION_CATALOG } from '../actionCatalog.js'
import { COUNTRY_TO_FACTION, deriveMapInfo } from '../mapInfo.js'
import type { MapSelection } from '../mapInfo.js'
import { useArmedVerb, useReplayFocus } from '../uiContext.js'
import { replayGeoAnchor } from '../replayFocus.js'
import { MapPlaceholder } from './Shell.js'
import { MapLegend } from './MapLegend.js'
import { MapInfoCard } from './MapInfoCard.js'
import { MapLayerBar } from './MapLayerBar.js'
import { landlessFactions, layerTags } from '../mapLayers.js'
import type { MapLayerId } from '../mapLayers.js'

// §6.5: ett lands koppling till en FactionId (COUNTRY_TO_FACTION) bor i mapInfo.ts, som kartans informationskort delar den med.

// §5:s mockup är stående, kartan fyller höjden — designrymden matchar
// Indokinas verkliga proportion (region-bboxen i build-geo.mjs, 15° bred,
// 15° hög, men Mercator sträcker höjden vid dessa breddgrader).
const VIEW_WIDTH = 600
const VIEW_HEIGHT = 800
const GEO_URL = '/geo/indochina.topo.json'

// §6.9: tre zoomnivåer, avgjorda av d3-zoom:s skala k. k=1 är den
// fitSize:ade startvyn, alltså PRECIS "2 · Teater (startläget)" — ordagrant
// vad specen kräver. Trösklarna är PROVISORISKA balanstal (samma "provisoriskt
// tal, kalibreras senare"-mönster som resten av projektet) tills en riktig
// enhet kan bekräfta känslan.
const ZOOM_LEVEL_1_MAX = 0.8 // Region
const ZOOM_LEVEL_3_MIN = 2.5 // Sektor
const ZOOM_MIN = 0.5
const ZOOM_MAX = 6

type ZoomLevel = 1 | 2 | 3

// P94: prickens färdvektor (--dx/--dy, läses av @keyframes map-supply-flow) och en
// hastighet som är ungefär konstant över kartan: ~45 kartenheter per sekund, aldrig
// snabbare än 1,6 s eller långsammare än 4 s per överfart.
export function supplyDotStyle(dx: number, dy: number): CSSProperties {
  const seconds = Math.min(4, Math.max(1.6, Math.hypot(dx, dy) / 45))
  return { '--dx': `${dx}px`, '--dy': `${dy}px`, animationDuration: `${seconds}s` } as CSSProperties
}

// P94: skärmläsarnamn för en huvudstadsmarkör — namnet, plus antalet öppna
// ordrar som badgen på kartan annars bara visar visuellt.
export function capitalLabel(name: string, openOrders: number): string {
  return openOrders > 0 ? `${name}, ${openOrders} open ${openOrders === 1 ? 'order' : 'orders'}` : name
}

function zoomLevelFor(k: number): ZoomLevel {
  if (k < ZOOM_LEVEL_1_MAX) return 1
  if (k >= ZOOM_LEVEL_3_MIN) return 3
  return 2
}

interface GeoData {
  countries: GeoJSON.FeatureCollection
  dmz: GeoJSON.FeatureCollection
}

function useGeoData(): GeoData | 'loading' | 'error' {
  const [data, setData] = useState<GeoData | 'loading' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch(GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`geo fetch ${res.status}`)
        return res.json()
      })
      .then((topology) => {
        if (cancelled) return
        setData({
          countries: topojsonClient.feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection,
          dmz: topojsonClient.feature(topology, topology.objects.dmz) as unknown as GeoJSON.FeatureCollection,
        })
      })
      .catch(() => {
        if (!cancelled) setData('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return data
}

function sectorFillClass(side: 'a' | 'b' | 'contested' | 'empty' | undefined): string {
  if (side === 'a') return 'is-a'
  if (side === 'b') return 'is-b'
  if (side === 'contested') return 'is-contested'
  return 'is-empty'
}

// Sektorpolygonens ring som en sluten SVG-path — [lat,lng] → projicerat
// [x,y], samma punktordning som SECTOR_REGIONS.polygon.
function regionPathD(region: SectorRegion, project: (lngLat: [number, number]) => [number, number] | null): string {
  const points = region.polygon
    .map(([lat, lng]) => project([lng, lat]))
    .filter((p): p is [number, number] => p !== null)
  if (points.length === 0) return ''
  return `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`
}

// P162: en transportleds linje som en öppen SVG-path, [lat,lng] → projicerat [x,y].
function routePathD(route: [number, number][], project: (lngLat: [number, number]) => [number, number] | null): string {
  const points = route.map(([lat, lng]) => project([lng, lat])).filter((p): p is [number, number] => p !== null)
  if (points.length === 0) return ''
  return `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}`
}

// Vem som håller en led, i ord som står PÅ leden (S2). Sida a är husets egen sida, b motståndarens.
export function routeHolderLabel(side: 'a' | 'b' | 'contested' | 'empty' | undefined): string {
  switch (side) {
    case 'a':
      return 'FRIENDLY'
    case 'b':
      return 'HOSTILE'
    case 'contested':
      return 'CONTESTED'
    default:
      return 'NO FORCES'
  }
}

// P77 (§6.4, ordagrant): "Inre tecken per doktrin." Ritat i kod (ingen
// bildtillgång), enkla APP-6-inspirerade glyfer — kors för infanteri, oval
// (öppen/fylld) för mekaniserat/pansar, prick för artilleri, sicksack för
// irreguljärt (ingen officiell APP-6-motsvarighet för gerillaförband, en
// egen, tydligt skild markering).
function DoctrineGlyph({ doctrine }: { doctrine: Doctrine }) {
  switch (doctrine) {
    case 'infantry':
      return <path d="M-3,-3L3,3M3,-3L-3,3" className="map-token-glyph" />
    case 'mechanised':
      return <ellipse cx={0} cy={0} rx={3.2} ry={2} className="map-token-glyph map-token-glyph-outline" />
    case 'armoured':
      return <ellipse cx={0} cy={0} rx={3.2} ry={2} className="map-token-glyph map-token-glyph-filled" />
    case 'artillery':
      return <circle cx={0} cy={0} r={1.8} className="map-token-glyph map-token-glyph-filled" />
    case 'irregular':
      return <path d="M-3,2L-1,-2L1,2L3,-2" className="map-token-glyph" />
  }
}

// P77 (§6.4, ordagrant): "ramens form visar sida (rektangel för vänligt
// sinnad, romb för fientlig, kvadrat för neutral), inte bara färgen, så
// kartan fungerar för färgblinda." Formation.side är binärt ('a'|'b') i hela
// datamodellen — 'a' är alltid den lokala regeringssidan i det här
// scenariot (rvn/laos, samma "vänligt sinnad"-linje front-sides-CSS:en redan
// drar), 'b' alltid motståndaren. "Neutral" (kvadrat) har ingen
// motsvarighet i Formation['side']s typ — strukturellt onåbar med dagens
// datamodell, samma "skyddsräcke utan nuvarande källa"-linje som
// OldFrontCard/UnlayoutedSectors, inte en lucka att bygga runt.
//
// P77 (§6.4, ordagrant): "utan station är ramen streckad med frågetecken och
// inget namn" (formationDisplay.known === false) · "mauled som sprucken
// ram" · "refitting som dämpad" · "styrka som prickar" (strengthBand:
// svag=1, medel=2, stark=3). Renderar BARA brickans form/glyf/prickar —
// namnetiketten renderas separat, i huvudkomponentens samlade etikettlager
// (§6.3 lager 11), med ABSOLUTA koordinater i stället för en position
// relativ till den här grupperingens `transform`. getBBox() (regel 18:s
// kollisionsdöljning) mäter i elementets EGEN lokala koordinatrymd, oberoende
// av förälderns transform — en etikett nästlad HÄR hade mätts i fel rymd
// jämfört med sektoretiketterna, som redan är absolutpositionerade direkt
// under den delade <g transform>. Genuint fynd, hittat under granskning
// innan koden ens kördes — inte en bugg som smög sig in i produktion.
// P81a (§13, P81-blockquoten): "Tryck på en symbol utan egna verb (heat-glöd,
// frontlinje, förbandsbricka) öppnar samma förklaring för just den symbolen"
// (regel 13). `onExplain` väljer legend-entryn utifrån brickans faktiska
// tillstånd — okänd/sargad/känd, samma tre lägen §7.2:s teckenförklaring
// beskriver.
function FormationToken({
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
      className={selected ? `map-formation-${display.side} is-selected` : `map-formation-${display.side}`}
      onClick={onExplain}
    >
      {/* Ett tryckmål som är större än brickan själv (regel 11), och en ring när brickan är vald (regel 9). */}
      <circle r={12} className="map-token-tap" />
      {selected && <circle r={11} className="map-selected-ring" />}
      {display.side === 'a' ? (
        <rect x={-5} y={-5} width={10} height={10} className={frameClass} />
      ) : (
        <polygon points="0,-6.5 6.5,0 0,6.5 -6.5,0" className={frameClass} />
      )}
      {display.status === 'mauled' && <path d="M-4,-5L0,0L-2,5M4,-5L0,0L2,5" className="map-token-crack" />}
      {display.known ? (
        <DoctrineGlyph doctrine={display.doctrine} />
      ) : (
        // Frågetecknet ritas som en bana, inte ett <text>-element: SVG:s
        // scrollWidth/clientWidth för ett enda, oplacerat textAnchor="middle"-
        // tecken visade sig ge olika avrundning på skrivbordsformatet (4 vs 2)
        // och trippade regel 18:s klippningstest, trots att inget faktiskt
        // klipps visuellt — samma "ren form, ingen textmätning"-princip som
        // DoctrineGlyph redan använder för alla kända doktriner.
        <g className="map-token-unknown-mark">
          <path d="M-1.6,-2.4C-1.6,-3.6,1.8,-3.6,1.8,-2.1C1.8,-0.7,0,-0.6,0,0.8" className="map-token-glyph" />
          <circle cx={0} cy={3} r={0.7} className="map-token-glyph map-token-glyph-filled" />
        </g>
      )}
      <g className="map-token-dots">
        {Array.from({ length: dotCount }, (_, i) => (
          <circle key={i} cx={-3 + i * 3} cy={7.5} r={0.8} className="map-token-dot" />
        ))}
      </g>
    </g>
  )
}

// Regel 18: etiketter som kolliderar döljs (efter prioritet — ursprunglig
// listordning), krymps aldrig. getBBox saknas i jsdom (samma miljölucka som
// matchMedia/indexedDB på andra ställen i den här appen) — utan den visas
// alla etiketter, aldrig en krasch.
//
// P81a, genuint fynd, hittat av kollisionstestets egna zoomnivå 3-fall
// (e2e/text-overflow.spec.ts): renderarna nedan döljer tidigare en
// kolliderande etikett genom att låta den `return null` — elementet
// avmonteras då helt och tar bort sin egen ref ur labelRefs. Nästa
// deps-ändring (en ny zoomnivå) ser då INTE den dolda etiketten alls, kan
// alltså aldrig avgöra om den fortfarande kolliderar, och den återkommer
// odetekterad så fort dess ID saknas i nästa nextHidden-beräkning — precis
// det som hände: ho-chi-minh-trail-etiketten återuppstod vid zoomnivå 3 och
// kolliderade både med da-nang och ett förbandsnamn, utan att någonsin
// prövas mot dem. Fixat genom att ALDRIG avmontera en etikett — döljningen
// är nu en ren CSS-klass (.map-label-hidden, visibility: hidden, geometrin
// kvar för getBBox), så varje deps-ändring alltid mäter HELA den aktuella
// kandidatmängden, aldrig en krympt delmängd av den föregående gissningen.
function useLabelCollisionHiding(labelRefs: React.RefObject<Map<string, SVGTextElement>>, deps: readonly unknown[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useLayoutEffect(() => {
    const map = labelRefs.current
    if (!map) return
    const entries = [...map.entries()]
    if (entries.length === 0 || typeof entries[0]![1].getBBox !== 'function') return

    const placed: DOMRect[] = []
    const nextHidden = new Set<string>()
    for (const [id, el] of entries) {
      const box = el.getBBox()
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height } as DOMRect
      const overlaps = placed.some(
        (p) => rect.x < p.x + p.width && rect.x + rect.width > p.x && rect.y < p.y + p.height && rect.y + rect.height > p.y,
      )
      if (overlaps) {
        nextHidden.add(id)
      } else {
        placed.push(rect)
      }
    }
    setHidden(nextHidden)
    // deps styr uttryckligen NÄR omätningen körs om (zoomnivå/skala,
    // regionslistans längd) — inte varje beroende useLayoutEffect annars
    // skulle kräva, samma avsiktliga mönster som labelRefs (en ref, stabil
    // identitet, aldrig en egen deps-post).
  }, deps)

  return hidden
}

export function TheatreMap({
  state,
  selectedFactionId = null,
  onSelectCountry,
}: {
  state: GameState
  selectedFactionId?: FactionId | null
  onSelectCountry?: (factionId: FactionId) => void
}) {
  const geo = useGeoData()
  const svgRef = useRef<SVGSVGElement>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map())

  // P81a: teckenförklaringen. `focusId` styr vilken rad MapLegend scrollar
  // till och markerar — null öppnar hela listan (legend-knappen), en id
  // öppnar direkt på just den symbolens förklaring (tryck på kartan).
  const [legend, setLegend] = useState<{ open: boolean; focusId: string | null }>({ open: false, focusId: null })
  const openLegend = (focusId: string | null) => setLegend({ open: true, focusId })
  const closeLegend = () => setLegend({ open: false, focusId: null })

  // P165 (ETAPP10 §3b, S6): ett tryck på något på kartan VÄLJER det, och det valda föremålet får ett informationskort i kartans nederkant. Teckenförklaringen öppnas bara
  // från sin egen knapp. `onSelectCountry` är "öppna landsakten" — kortet har en knapp för det, och ett verb valt i Actions-menyn (som ska till ett land) går direkt dit.
  const [selection, setSelection] = useState<MapSelection | null>(null)
  // P166: ett kartlager åt gången, med tal vid varje köpare (eller front). null = inget lager.
  const [layer, setLayer] = useState<MapLayerId | null>(null)
  const armed = useArmedVerb()
  // P158: händelsen kvartalsuppspelningen visar just nu — kartan ritar en ring där den hör hemma (replayFocus.ts).
  const replayFocus = useReplayFocus()
  const armedGoesToCountry = armed !== null && ACTION_CATALOG.some((e) => e.verb === armed.verb && e.target === 'operations')
  const tags = useMemo(() => (layer ? layerTags(state, layer) : []), [state, layer])
  const landless = useMemo(() => landlessFactions(state), [state])
  const mapInfo = useMemo(() => (selection ? deriveMapInfo(state, selection) : null), [state, selection])
  const isSelected = (candidate: MapSelection): boolean =>
    selection !== null && selection.kind === candidate.kind && JSON.stringify(selection) === JSON.stringify(candidate)
  const selectFaction = (factionId: FactionId, fallback: MapSelection) => {
    if (armedGoesToCountry && onSelectCountry) onSelectCountry(factionId)
    else setSelection(fallback)
  }
  const countryIdOfFaction = (factionId: FactionId): string | undefined =>
    Object.entries(COUNTRY_TO_FACTION).find(([, id]) => id === factionId)?.[0]
  const selectCapital = (factionId: FactionId) => selectFaction(factionId, { kind: 'country', countryId: countryIdOfFaction(factionId) ?? factionId })
  const capitalSelected = (factionId: FactionId): boolean => selection?.kind === 'country' && selection.countryId === countryIdOfFaction(factionId)

  // Fångar övergången "geodatan hämtad, <svg ref={svgRef}> finns äntligen i
  // DOM:en" (fetch är async — det FÖRSTA render-varvet visar MapPlaceholder,
  // ingen <svg> alls, se de tidiga returnerna nedan). Utan den i
  // effekternas deps körde både d3-zoom-kopplingen och etikettkollisionen
  // (useLabelCollisionHiding) bara EN gång, på det där första laddar-varvet
  // — svgRef.current/labelRefs.current var tomma då, effekterna gav upp
  // direkt, och kördes ALDRIG om när elementen väl fanns, eftersom inget
  // annat i deps-listorna ändrades mellan de två varven. Genuint fynd,
  // hittat manuellt (pan/zoom svarade inte på musen) efter att samma
  // klass av bugg redan bitit etikett-kollisionen — mönstret upprepar
  // sig, se den kommentaren nedan för den första incidensen.
  const geoLoaded = geo !== 'loading' && geo !== 'error'

  const projection = useMemo(() => {
    if (geo === 'loading' || geo === 'error') return null
    return geoMercator().fitSize([VIEW_WIDTH, VIEW_HEIGHT], geo.countries)
  }, [geo])

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection])

  const project = useMemo(() => {
    if (!projection) return null
    return (lngLat: [number, number]) => projection(lngLat)
  }, [projection])

  // d3-zoom kopplas till SVG-elementet, oberoende av Reacts eget render-varv
  // — samma "riktig DOM-hook, inte reaktivt state hela vägen ner"-mönster
  // d3 alltid kräver i React. geoLoaded i deps (se kommentaren ovan) — annars
  // kopplas den mot ett svgRef.current som ännu är null.
  useEffect(() => {
    if (!svgRef.current) return
    const selection = select(svgRef.current)
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', (event) => setTransform(event.transform))
    selection.call(behaviour)
    return () => {
      selection.on('.zoom', null)
    }
  }, [geoLoaded])

  const zoomLevel = zoomLevelFor(transform.k)

  // Regel 9: det valda landet har en tydlig kontur — antingen för att landsakten är öppen eller för att dess kort (eller en station i det) är valt.
  const contourCountryIds = new Set<string>()
  if (selectedFactionId) for (const [id, f] of Object.entries(COUNTRY_TO_FACTION)) if (f === selectedFactionId) contourCountryIds.add(id)
  if (selection?.kind === 'country') contourCountryIds.add(selection.countryId)
  if (selection?.kind === 'station') {
    const id = Object.entries(COUNTRY_TO_FACTION).find(([, f]) => f === selection.factionId)?.[0]
    if (id) contourCountryIds.add(id)
  }

  const sectorControlBySector = useMemo(() => {
    const map = new Map<string, 'a' | 'b' | 'contested' | 'empty'>()
    for (const front of Object.values(state.fronts)) {
      for (const control of deriveSectorControl(state, front)) {
        map.set(control.sectorId, control.side)
      }
    }
    return map
  }, [state])

  const allRegions = useMemo(() => Object.entries(SECTOR_REGIONS).flatMap(([theatreId, regions]) => regions.map((r) => ({ ...r, theatreId }))), [])

  // P82 (§6.3 lager 8): stationsmarkören — grupperad per NATION (huvudstadens
  // FactionId), inte per station, eftersom flera stationer i samma land
  // (inget mekanik-hinder i RECRUIT mot det) ska visas som EN markör med
  // den högsta exponeringen bland dem, inte en per station.
  const stationsByFaction = useMemo(() => {
    const map = new Map<FactionId, typeof state.house.stations>()
    for (const station of state.house.stations) {
      if (station.status !== 'active') continue
      const list = map.get(station.nation)
      if (list) list.push(station)
      else map.set(station.nation, [station])
    }
    return map
  }, [state])

  // P77 (§6.4): förbandsbrickor grupperade per sektor (flera Formation kan
  // dela samma sectorId, tokenOffset ovan sprider dem). status==='destroyed'
  // filtreras bort — inget kvar att visa, samma linje som P76:s beslut att
  // filtrera bort en spårprick utan rörelse i stället för att rita en tom
  // markör. formationDisplay (samma grind som §6.4 kräver, "Allt läses via
  // formationDisplay") körs en gång här, inte per rendering-pass.
  const formationGroups = useMemo(() => {
    const groups = new Map<string, { region: SectorRegion; formations: FormationDisplay[] }>()
    for (const front of Object.values(state.fronts)) {
      const regions = SECTOR_REGIONS[front.theatreId]
      if (!regions) continue
      const regionById = new Map(regions.map((r) => [r.sectorId, r]))
      for (const formation of front.formations) {
        if (formation.status === 'destroyed') continue
        const region = regionById.get(formation.sectorId)
        if (!region) continue
        const display = formationDisplay(state, formation)
        const group = groups.get(region.sectorId)
        if (group) group.formations.push(display)
        else groups.set(region.sectorId, { region, formations: [display] })
      }
    }
    return groups
  }, [state])

  const totalFormationTokens = useMemo(
    () => [...formationGroups.values()].reduce((sum, g) => sum + g.formations.length, 0),
    [formationGroups],
  )

  // P77 (§6.3 lager 9): heat-glöd per teater, centrerad på medelvärdet av
  // teaterns sektorankare (SECTOR_REGIONS har ingen egen teater-yta att
  // utgå från — samma "härled en rimlig plats, uppfinn ingen ny geometri"-
  // princip som resten av filen).
  const heatGlowByTheatre = useMemo(() => {
    return Object.entries(SECTOR_REGIONS)
      .map(([theatreId, regions]) => {
        if (regions.length === 0) return null
        const avgLat = regions.reduce((sum, r) => sum + r.anchor[0], 0) / regions.length
        const avgLng = regions.reduce((sum, r) => sum + r.anchor[1], 0) / regions.length
        return { theatreId, anchor: [avgLat, avgLng] as [number, number], heat: state.theatres[theatreId]?.heat ?? 0 }
      })
      .filter((t): t is { theatreId: string; anchor: [number, number]; heat: number } => t !== null)
  }, [state])

  // P82 (§6.3 lager 6, §6.7): försörjningslinjer. Rivalernas linjer läses ur
  // Front.attribution:s FÖRÄNDRING mellan två renderingar — sparad i en ref
  // (inte state, ingen ny rendering ska triggas av att spara den) och
  // uppdaterad i ett useEffect EFTER varje render, så nästa jämförelse alltid
  // sker mot FÖREGÅENDE tursögonblicksbild, aldrig den nuvarande turens
  // egna, redan uppdaterade tal (supplyLines.ts:s egen kommentar för hela
  // resonemanget).
  const prevAttributionRef = useRef(snapshotAttribution(state))
  const playerLines = useMemo(() => playerSupplyLines(state, SECTOR_REGIONS), [state])
  const rivalLines = useMemo(() => rivalSupplyLines(state, prevAttributionRef.current, SECTOR_REGIONS), [state])
  useEffect(() => {
    prevAttributionRef.current = snapshotAttribution(state)
  }, [state])

  // geoLoaded i deps (se kommentaren vid dess definition ovan) — annars
  // körde effekten bara på det första, tomma laddar-varvet och aldrig om
  // när <text>-elementen väl fanns. Genuint fynd, hittat visuellt i
  // npm run shots (två etiketter som löpte ihop) — inte av jsdom-testerna,
  // som mockar fetch och därför aldrig såg ett "laddar"-varv alls.
  // totalFormationTokens med — P77 lägger förbandsnamn till SAMMA
  // labelRefs/hiddenLabels-mekanism, se FormationToken.
  const hiddenLabels = useLabelCollisionHiding(labelRefs, [
    transform.k,
    allRegions.length,
    totalFormationTokens,
    zoomLevel,
    geoLoaded,
    tags.length,
    layer,
  ])

  if (geo === 'error') {
    return <MapPlaceholder theatreName={Object.values(state.theatres)[0]?.name ?? 'Indochina'} />
  }
  if (geo === 'loading' || !project || !path) {
    return (
      <div className="map-container" data-testid="theatre-map-loading">
        <MapPlaceholder theatreName={Object.values(state.theatres)[0]?.name ?? 'Indochina'} />
      </div>
    )
  }

  return (
    <div className="map-container" data-testid="theatre-map">
      <div className="map-stage">
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        // P94 (axe, nested-interactive): role="img" förbjuder fokuserbara barn,
        // men kartans huvudstadsmarkörer är nu knappar (tangentbord/skärmläsare).
        // "group" är en behållare som får ha interaktiva barn.
        role="group"
        aria-label="Theatre map"
        data-testid="theatre-map-svg"
        data-zoom-level={zoomLevel}
      >
        <g transform={transform.toString()}>
          {/* P79 (§6.3 lager 8, §7.1): en landmassa med en FactionId i
              COUNTRY_TO_FACTION öppnar landets bottenark (CountryFile.tsx) —
              samma tap-mål som huvudstadsmarkören nedan. Övriga länder
              (sammanhang: north-vietnam, kambodja, thailand, kina) förblir
              oklickbara, exakt som dimlagrets egen filtrering ovan. */}
          <g className="map-countries">
            {geo.countries.features.map((feature) => {
              const countryId = String(feature.id)
              const factionId = COUNTRY_TO_FACTION[countryId]
              return (
                <path
                  key={countryId}
                  d={path(feature as GeoPermissibleObjects) ?? ''}
                  className="map-country is-selectable"
                  data-testid={`map-country-${feature.id}`}
                  onClick={() => (factionId ? selectFaction(factionId, { kind: 'country', countryId }) : setSelection({ kind: 'country', countryId }))}
                />
              )
            })}
          </g>

          {/* P79 (§6.3 lager 10): valt föremål på kartan har en tydlig
              kontur (regel 9) — samma landpath, ritad en gång till ovanpå
              allt annat land-/gräns-innehåll men UNDER sektorfyllning/
              förbandslager, en ren outline utan egen fyllning. */}
          {(selectedFactionId || contourCountryIds.size > 0) && (
            <g className="map-selection">
              {geo.countries.features
                .filter((feature) => contourCountryIds.has(String(feature.id)))
                .map((feature) => (
                  <path
                    key={`sel-${String(feature.id)}`}
                    d={path(feature as GeoPermissibleObjects) ?? ''}
                    className="map-country-selected"
                    data-testid={`map-country-selected-${feature.id}`}
                  />
                ))}
            </g>
          )}

          <g className="map-dmz">
            {geo.dmz.features.map((feature) => (
              <path key={String(feature.id)} d={path(feature as GeoPermissibleObjects) ?? ''} className="map-dmz-line" />
            ))}
          </g>

          {/* P77 (§6.3 lager 3, §6.5): underrättelsedimma — ETT LAND i taget,
              inte per sektor. Sektorkontrollen (nästa lager) är ALLTID
              synlig oavsett dimma (deriveSectorControl.ts:s egen kommentar:
              "kontrollstatus är grov/synlig oavsett underrättelsedjup") —
              dimman gäller bara TERRÄNGEN, samma effectiveDepth-grind som
              formationDisplay/officialDisplay. */}
          <defs>
            <pattern id="map-fog-hatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={6} className="map-fog-hatch-line" />
            </pattern>
          </defs>
          <g className="map-fog">
            {geo.countries.features
              .filter((feature) => {
                const factionId = COUNTRY_TO_FACTION[String(feature.id)]
                return factionId !== undefined && effectiveDepth(state, factionId) === 0
              })
              .map((feature) => (
                <path
                  key={`fog-${String(feature.id)}`}
                  d={path(feature as GeoPermissibleObjects) ?? ''}
                  className="map-fog-overlay"
                  data-testid={`map-fog-${feature.id}`}
                />
              ))}
          </g>

          <g className="map-sectors">
            {allRegions.map((region) => {
              const side = sectorControlBySector.get(region.sectorId)
              // P162 (S2): en transportled ritas som en streckad linje längs `route` — aldrig som en fylld yta. En bredare, osynlig
              // tryckyta ligger under så att leden går att trycka på (regel 11) utan att linjen själv blir tjock.
              if (region.route) {
                const d = routePathD(region.route, project)
                return (
                  <g key={region.sectorId}>
                    <path
                      d={d}
                      className={`map-route ${sectorFillClass(side)}${isSelected({ kind: 'sector', sectorId: region.sectorId }) ? ' is-selected' : ''}`}
                      data-testid={`map-sector-${region.sectorId}`}
                    />
                    <path
                      d={d}
                      className="map-route-tap"
                      onClick={() => setSelection({ kind: 'sector', sectorId: region.sectorId })}
                      data-testid={`map-route-tap-${region.sectorId}`}
                    />
                  </g>
                )
              }
              return (
                <path
                  key={region.sectorId}
                  d={regionPathD(region, project)}
                  className={`map-sector-fill ${sectorFillClass(side)}${isSelected({ kind: 'sector', sectorId: region.sectorId }) ? ' is-selected' : ''}`}
                  data-testid={`map-sector-${region.sectorId}`}
                  // P81a: sektorfyllningen ligger ovanpå landmassan i
                  // ritordning och har ingen pointer-events:none — ett tryck
                  // här nådde tidigare varken landklicket eller något annat
                  // (en tyst dödzon). Öppnar nu samma förklaring som
                  // teckenförklaringens sektor-rader i stället för att
                  // fortsätta vara ett dött tryck.
                  onClick={() => setSelection({ kind: 'sector', sectorId: region.sectorId })}
                />
              )
            })}
          </g>

          <g className="map-frontlines">
            {Object.values(state.fronts).map((front) => {
              const regions = SECTOR_REGIONS[front.theatreId]
              if (!regions || regions.length === 0) return null

              // state.ts seedar front.trace = [f.position] vid partistart —
              // vid tur 0 är den enda spårpunkten alltså LITERALT samma
              // värde som front.position självt (ingen rörelse har hänt
              // än). En spårprick ovanpå den nuvarande markören, exakt på
              // samma koordinat, tillför ingen information och kolliderar
              // med sig själv per definition — regel 18:s eget CI-test
              // (kartkollisionsdelen, denna prompt) fångade det. Filtreras
              // bort i stället för att tona ned den — "ingen rörelse ännu"
              // ska se ut som EN markör, inte två omärkbart överlappande.
              const tracePositions = front.trace.slice(-3).reverse().filter((p) => p !== front.position)
              const currentPoint = interpolateFrontGeoPosition(regions, front.position)
              const currentXY = project([currentPoint[1], currentPoint[0]])

              return (
                <g key={front.id} data-testid={`map-frontline-${front.id}`}>
                  {tracePositions.map((tracePosition, i) => {
                    const [lat, lng] = interpolateFrontGeoPosition(regions, tracePosition)
                    const xy = project([lng, lat])
                    if (!xy) return null
                    return (
                      <circle
                        key={`trace-${i}`}
                        cx={xy[0]}
                        cy={xy[1]}
                        r={3}
                        className="map-frontline-marker-trace"
                        style={{ opacity: 0.5 - i * 0.15 }}
                        data-testid={`map-frontline-marker-trace-${front.id}-${i}`}
                      />
                    )
                  })}
                  {currentXY && (
                    <>
                      <circle
                        cx={currentXY[0]}
                        cy={currentXY[1]}
                        r={4}
                        className={`map-frontline-marker${front.status === 'war' ? '' : ' is-quiet'}${isSelected({ kind: 'frontline', frontId: front.id }) ? ' is-selected' : ''}`}
                        data-testid={`map-frontline-marker-${front.id}`}
                      />
                      {isSelected({ kind: 'frontline', frontId: front.id }) && <circle cx={currentXY[0]} cy={currentXY[1]} r={9} className="map-selected-ring" />}
                      {/* P81a: markören själv har pointer-events: none (den
                          animerade shimmer-cirkeln, orörd) — en egen,
                          osynlig tryckyta ovanpå ger regel 11:s 44 px utan
                          att röra markörens egen storlek eller stil. */}
                      <circle
                        cx={currentXY[0]}
                        cy={currentXY[1]}
                        r={14}
                        fill="transparent"
                        onClick={() => setSelection({ kind: 'frontline', frontId: front.id })}
                        data-testid={`map-frontline-tap-${front.id}`}
                      />
                    </>
                  )}
                </g>
              )
            })}
          </g>

          {/* P82 (§6.3 lager 6, §6.7): försörjningslinjer — spelarens från
              Shipment/Contract.frontId, rivalernas härledda ur
              Front.attribution:s ändring sedan förra renderingen
              (supplyLines.ts). Synliga från zoomnivå 1 (§6.9:s tabell), ingen
              zoomgrind som förbandsbrickorna nedan. */}
          <g className="map-supply-lines">
            {[...playerLines, ...rivalLines].map((line) => {
              const from = project([line.fromAnchor[1], line.fromAnchor[0]])
              const to = project([line.toAnchor[1], line.toAnchor[0]])
              if (!from || !to) return null
              const kindClass = line.kind === 'player' ? 'is-player' : 'is-rival'
              const dx = to[0] - from[0]
              const dy = to[1] - from[1]
              return (
                <g key={line.id}>
                  <line
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    className={`map-supply-line ${kindClass}${isSelected({ kind: 'supply', lineId: line.id }) ? ' is-selected' : ''}`}
                    data-testid={`map-supply-line-${line.id}`}
                  />
                  {/* P165: en bredare, osynlig tryckyta — själva linjen är bara ett par pixlar tjock. */}
                  <line
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    className="map-supply-tap"
                    onClick={() => setSelection({ kind: 'supply', lineId: line.id })}
                    data-testid={`map-supply-tap-${line.id}`}
                  />
                  {/* P94: flödet är en prick som färdas längs linjen med
                      transform (§12 punkt 5), inte ett animerat streck. */}
                  <circle
                    cx={from[0]}
                    cy={from[1]}
                    r={2.6}
                    className={`map-supply-dot ${kindClass}`}
                    style={supplyDotStyle(dx, dy)}
                    data-testid={`map-supply-dot-${line.id}`}
                  />
                </g>
              )
            })}
          </g>

          {/* P77 (§6.3 lager 7, §6.9): förbandsbrickor — synliga från
              zoomnivå 2 (§6.9:s tabell: "2 · Teater ... plus förbandsbrickor"),
              namn+styrka i klartext bara från nivå 3 ("Sektor ... plus
              förbandsnamn och styrka i klartext"). */}
          {zoomLevel >= 2 && (
            <g className="map-formations">
              {[...formationGroups.values()].map(({ region, formations }) =>
                formations.map((display, i) => {
                  const [x, y] = project([region.anchor[1], region.anchor[0]]) ?? [0, 0]
                  const [dx, dy] = tokenOffset(i, formations.length)
                  const sel: MapSelection = { kind: 'formation', formationId: display.id }
                  return (
                    <FormationToken
                      key={display.id}
                      display={display}
                      x={x + dx}
                      y={y + dy}
                      onExplain={() => setSelection(sel)}
                      selected={isSelected(sel)}
                    />
                  )
                }),
              )}
            </g>
          )}

          {/* P79 (§6.3 lager 8, §7.1): huvudstadsmarkörer — ett andra tapp-
              mål in i landets bottenark (samma onSelectCountry som
              landmassan ovan), plus en badge med antal öppna ordrar hos den
              köparen ("Order (markör vid köparen) | lägg bud" — §7.1:s
              tabell; badgen ÄR ordermarkören, ett bud läggs fortfarande på
              CONTRACTS, App.tsx byter flik dit vid tryck). */}
          {/* P166: NLF har ingen egen landmassa — dess markering är en fientlig romb mitt bland dess förband, och ett tryck på den ger NLF:s kort. */}
          <g className="map-landless">
            {landless.map((l) => {
              if (!l.anchor) return null
              const [x, y] = project([l.anchor[1], l.anchor[0]]) ?? [0, 0]
              return (
                <g
                  key={l.factionId}
                  transform={`translate(${x},${y + 12})`}
                  className={selection?.kind === 'faction' && selection.factionId === l.factionId ? 'map-landless-marker is-selected' : 'map-landless-marker'}
                  onClick={() => setSelection({ kind: 'faction', factionId: l.factionId })}
                  data-testid={`map-landless-${l.factionId}`}
                >
                  <circle r={12} className="map-token-tap" />
                  <polygon points="0,-7 7,0 0,7 -7,0" className="map-landless-diamond" />
                  <path d="M-3,-3L3,3M3,-3L-3,3" className="map-token-glyph" />
                </g>
              )
            })}
          </g>

          <g className="map-capitals">
            {CAPITALS.map((capital) => {
              const [x, y] = project([capital.anchor[1], capital.anchor[0]]) ?? [0, 0]
              const openOrders = state.market.openOrders.filter((o) => o.buyerId === capital.factionId).length
              const labelId = `capital-${capital.factionId}`
              const stations = stationsByFaction.get(capital.factionId) ?? []
              const maxExposure = stations.reduce((max, s) => Math.max(max, s.exposure), 0)
              return (
                <g key={capital.factionId} data-testid={`map-capital-${capital.factionId}`}>
                  {/* P165: stationens tryckyta ritas FÖRE huvudstadsmarkören, så markören alltid ligger överst där de två möts. */}
                  {stations.length > 0 && (
                    <g transform={`translate(${x - 8},${y + 8})`} data-testid={`map-capital-station-${capital.factionId}`}>
                      {maxExposure >= DISPLAY_THRESHOLDS.exposureBurnThreshold && (
                        <circle r={7} className="map-station-exposure-ring" />
                      )}
                      <rect x={-4} y={-4} width={8} height={8} className="map-station-badge" />
                      {isSelected({ kind: 'station', factionId: capital.factionId }) && <circle r={9} className="map-selected-ring" />}
                      <circle
                        r={9}
                        className="map-station-tap"
                        onClick={() => setSelection({ kind: 'station', factionId: capital.factionId })}
                        data-testid={`map-station-tap-${capital.factionId}`}
                      />
                    </g>
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={6}
                    className={capital.factionId === selectedFactionId || capitalSelected(capital.factionId) ? 'map-capital-marker is-selected' : 'map-capital-marker'}
                    onClick={onSelectCountry ? () => selectCapital(capital.factionId) : undefined}
                    // P94 (tillgänglighet): markören är kartflödets huvudingång
                    // (§7.1) men var varken fokuserbar eller tillgänglig för
                    // tangentbord och skärmläsare — bara ett klickbart <circle>.
                    {...(onSelectCountry
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': capitalLabel(capital.name, openOrders),
                          'aria-pressed': capital.factionId === selectedFactionId || capitalSelected(capital.factionId),
                          onKeyDown: (event: KeyboardEvent<SVGCircleElement>) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              selectCapital(capital.factionId)
                            }
                          },
                        }
                      : {})}
                  />
                  {openOrders > 0 && (
                    <g transform={`translate(${x + 7},${y - 7})`} data-testid={`map-capital-orders-${capital.factionId}`}>
                      <circle r={5} className="map-capital-badge" />
                      <text className="map-capital-badge-text" textAnchor="middle" dominantBaseline="central">
                        {openOrders}
                      </text>
                    </g>
                  )}
                  {zoomLevel >= 2 && (
                    <text
                      ref={(el) => {
                        if (el) labelRefs.current.set(labelId, el)
                        else labelRefs.current.delete(labelId)
                      }}
                      x={x}
                      y={y + 14}
                      className={hiddenLabels.has(labelId) ? 'map-capital-label map-label-hidden' : 'map-capital-label'}
                      textAnchor="middle"
                      data-testid={`map-capital-label-${capital.factionId}`}
                    >
                      {capital.name}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* P77 (§6.3 lager 9, §6.6): heat-glöd — andas långsamt
              (omgivningsrörelse, CSS-animation, avstängd av
              prefers-reduced-motion via den globala regeln i styles.css).
              Intensitet/färg efter DISPLAY_THRESHOLDS.heatEscalation, samma
              tröskel TheWorld.tsx:s Theatres-panel redan läser. */}
          <g className="map-heat-glow">
            {heatGlowByTheatre.map(({ theatreId, anchor, heat }) => {
              const [x, y] = project([anchor[1], anchor[0]]) ?? [0, 0]
              const hot = heat >= DISPLAY_THRESHOLDS.heatEscalation
              return (
                <g key={theatreId}>
                  <circle
                    cx={x}
                    cy={y}
                    r={40 + heat * 0.6}
                    className={`map-heat-glow-circle ${hot ? 'is-hot' : ''}`}
                    style={{ opacity: Math.min(0.35, heat / 300) }}
                    data-testid={`map-heat-glow-${theatreId}`}
                  />
                  {/* P81a: den blurrade glödcirkeln har pointer-events: none
                      sedan P77 (rent dekorativ, ska inte stjäla tryck från
                      sektorer/förband under den brett spridda blur-radien).
                      En egen, mindre tryckyta i stället för att öppna
                      pointer-events på hela glöden — samma mönster som
                      map-frontline-tap ovan. */}
                  {isSelected({ kind: 'heat', theatreId }) && <circle cx={x} cy={y} r={18} className="map-selected-ring" />}
                  <circle
                    cx={x}
                    cy={y}
                    r={16}
                    fill="transparent"
                    onClick={() => setSelection({ kind: 'heat', theatreId })}
                    data-testid={`map-heat-glow-tap-${theatreId}`}
                  />
                </g>
              )
            })}
          </g>

          {/* P76/P77 (§6.3 lager 11): etiketter, sist av alla lager —
              sektornamn (P76, zoomnivå 2+) och förbandsnamn (P77, zoomnivå
              3+, se FormationToken) delar samma kollisionsdöljning
              (useLabelCollisionHiding). */}
          {/* P162 (S2): ledens etikett syns redan på startzoomen (nivå 1) och bär namn och hållare. Den ligger före sektoretiketterna i
              ritordningen, så kollisionsdöljningen prioriterar den. */}
          {/* P166: kartlagrets tal och NLF:s markering ligger FÖRST bland etiketterna, så kollisionsdöljningen prioriterar dem framför sektornamnen. */}
          <g className="map-layer-tags">
            {tags.map((tag) => {
              const [x, y] = project([tag.anchor[1], tag.anchor[0]]) ?? [0, 0]
              const id = `layer-${tag.id}`
              const left = tag.side === 'left'
              const tx = x + (left ? -12 : 12)
              const top = y - 10 - (tag.lines.length - 1) * 11
              return (
                <text
                  key={id}
                  ref={(el) => {
                    if (el) labelRefs.current.set(id, el)
                    else labelRefs.current.delete(id)
                  }}
                  x={tx}
                  y={top}
                  textAnchor={left ? 'end' : 'start'}
                  className={hiddenLabels.has(id) ? 'map-layer-tag map-label-hidden' : 'map-layer-tag'}
                  onClick={tag.selection ? () => setSelection(tag.selection!) : undefined}
                  data-testid={`map-layer-tag-${tag.id}`}
                >
                  {tag.lines.map((line, i) => (
                    <tspan key={line} x={tx} dy={i === 0 ? 0 : 11}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )
            })}
          </g>

          <g className="map-landless-labels">
            {landless.map((l) => {
              if (!l.anchor) return null
              const [x, y] = project([l.anchor[1], l.anchor[0]]) ?? [0, 0]
              const id = `landless-${l.factionId}`
              return (
                <text
                  key={id}
                  ref={(el) => {
                    if (el) labelRefs.current.set(id, el)
                    else labelRefs.current.delete(id)
                  }}
                  x={x}
                  y={y + 22}
                  textAnchor="middle"
                  className={hiddenLabels.has(id) ? 'map-capital-label map-landless-label map-label-hidden' : 'map-capital-label map-landless-label'}
                  data-testid={`map-landless-label-${l.factionId}`}
                >
                  {l.factionId.toUpperCase()}
                </text>
              )
            })}
          </g>

          <g className="map-route-labels">
            {allRegions
              .filter((region) => region.route)
              .map((region) => {
                const mid = region.route![Math.floor(region.route!.length / 2)]!
                const [x, y] = project([mid[1], mid[0]]) ?? [0, 0]
                const id = `route-${region.sectorId}`
                return (
                  <text
                    key={id}
                    ref={(el) => {
                      if (el) labelRefs.current.set(id, el)
                      else labelRefs.current.delete(id)
                    }}
                    x={x - 10}
                    y={y}
                    className={hiddenLabels.has(id) ? 'map-sector-label map-route-label map-label-hidden' : 'map-sector-label map-route-label'}
                    textAnchor="end"
                    data-testid={`map-route-label-${region.sectorId}`}
                  >
                    {`${region.label} · ${routeHolderLabel(sectorControlBySector.get(region.sectorId))}`}
                  </text>
                )
              })}
          </g>

          {zoomLevel >= 2 && (
            <g className="map-sector-labels">
              {allRegions.filter((region) => !region.route).map((region) => {
                const [x, y] = project([region.anchor[1], region.anchor[0]]) ?? [0, 0]
                return (
                  <text
                    key={region.sectorId}
                    ref={(el) => {
                      if (el) labelRefs.current.set(region.sectorId, el)
                      else labelRefs.current.delete(region.sectorId)
                    }}
                    x={x}
                    y={y - 8}
                    className={hiddenLabels.has(region.sectorId) ? 'map-sector-label map-label-hidden' : 'map-sector-label'}
                    textAnchor="middle"
                    data-testid={`map-sector-label-${region.sectorId}`}
                  >
                    {region.label}
                  </text>
                )
              })}
            </g>
          )}

          {/* P77 (§6.9): förbandsnamn "i klartext" bara från zoomnivå 3
              ("Sektor"), absolutpositionerade (samma kommentar som
              FormationToken:s egen om getBBox och transform-rymder). */}
          {zoomLevel >= 3 && (
            <g className="map-formation-labels">
              {[...formationGroups.values()].map(({ region, formations }) =>
                formations.map((display, i) => {
                  const [x, y] = project([region.anchor[1], region.anchor[0]]) ?? [0, 0]
                  const [dx, dy] = tokenOffset(i, formations.length)
                  const labelId = `formation-${display.id}`
                  return (
                    <text
                      key={display.id}
                      ref={(el) => {
                        if (el) labelRefs.current.set(labelId, el)
                        else labelRefs.current.delete(labelId)
                      }}
                      x={x + dx}
                      y={y + dy - 9}
                      className={hiddenLabels.has(labelId) ? 'map-formation-label map-label-hidden' : 'map-formation-label'}
                      textAnchor="middle"
                      data-testid={`map-formation-label-${display.id}`}
                    >
                      {display.known ? `${display.name} (${display.strength})` : 'UNKNOWN FORMATION'}
                    </text>
                  )
                }),
              )}
            </g>
          )}
          {/* P166: krig eller vapenvila skrivs vid frontlinjen — sist bland etiketterna, så den viker för allt annat. */}
          <g className="map-front-status-labels">
            {Object.values(state.fronts).map((front) => {
              const regions = SECTOR_REGIONS[front.theatreId]
              if (!regions || regions.length === 0) return null
              const [lat, lng] = interpolateFrontGeoPosition(regions, front.position)
              const xy = project([lng, lat])
              if (!xy) return null
              const id = `front-status-${front.id}`
              return (
                <text
                  key={id}
                  ref={(el) => {
                    if (el) labelRefs.current.set(id, el)
                    else labelRefs.current.delete(id)
                  }}
                  x={xy[0] + 9}
                  y={xy[1] + 14}
                  className={hiddenLabels.has(id) ? `map-front-status-label is-${front.status} map-label-hidden` : `map-front-status-label is-${front.status}`}
                  data-testid={`map-front-status-${front.id}`}
                >
                  {front.status === 'war' ? 'WAR' : front.status === 'ceasefire' ? 'CEASEFIRE' : 'QUIET'}
                </text>
              )
            })}
          </g>
          {/* P158: kvartalsuppspelningen pekar ut var händelsen hör hemma — en ring som växer och bleknar (bara transform och opacity). Ingen tryckyta, ingen etikett. */}
          {replayFocus &&
            (() => {
              const geo = replayGeoAnchor(state, replayFocus.anchor)
              const xy = geo ? project([geo[1], geo[0]]) : null
              if (!xy) return null
              return (
                <g
                  key={replayFocus.eventId}
                  className={`map-replay-focus is-${replayFocus.kind}`}
                  transform={`translate(${xy[0]},${xy[1]})`}
                  data-testid="map-replay-focus"
                  aria-hidden="true"
                >
                  <circle r={9} className="map-replay-ring" />
                  <circle r={3} className="map-replay-core" />
                </g>
              )
            })()}
        </g>
      </svg>
      <MapLayerBar active={layer} onChange={setLayer} />

      {/* P81a (§13, P81-2/P81-3): en ikonknapp, alltid nåbar, öppnar hela
          teckenförklaringen — samma tryck-i-stället-för-hovring-princip
          (regel 13) som varje enskild symbols eget onExplain ovan. */}
      <button
        type="button"
        className="map-legend-button"
        onClick={() => openLegend(null)}
        aria-label="Map key"
        data-testid="map-legend-button"
      >
        ?
      </button>
      </div>

      {/* P165: informationskortet för det valda föremålet. Kartan krymper för det i stället för att täckas — det valda föremålet ska synas medan kortet läses. */}
      {mapInfo && (
        <MapInfoCard
          info={mapInfo}
          onClose={() => setSelection(null)}
          onOpenFile={mapInfo.openFile && onSelectCountry ? () => onSelectCountry(mapInfo.openFile!) : undefined}
        />
      )}

      <MapLegend open={legend.open} focusId={legend.focusId} onClose={closeLegend} />
    </div>
  )
}
