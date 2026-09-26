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
import { MapPlaceholder } from './Shell.js'

// §6.5, ordagrant: "Sektorer i länder utan aktiv station." Ett lands
// "aktiv station"-koppling är samma effectiveDepth(state, buyerId) som
// formationDisplay/officialDisplay redan grindar mot — men den tar en
// FactionId, inte ett geografiskt land. Bara de två länder som faktiskt kan
// ha en station i det här scenariot (indochina-slice.json) mappas; de fyra
// rena sammanhangsländerna (north-vietnam, kambodja, thailand, kina — §6.1:
// "sammanhang", aldrig spelbara) saknar en motsvarande FactionId helt och
// får därför aldrig dimma — inget att grinda MOT, inte en lucka.
const COUNTRY_TO_FACTION: Record<string, FactionId> = {
  'south-vietnam': 'rvn',
  laos: 'laos',
}

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
function FormationToken({ display, x, y }: { display: FormationDisplay; x: number; y: number }) {
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
    <g transform={`translate(${x},${y})`} data-testid={`map-formation-${display.id}`} className={`map-formation-${display.side}`}>
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

export function TheatreMap({ state }: { state: GameState }) {
  const geo = useGeoData()
  const svgRef = useRef<SVGSVGElement>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const labelRefs = useRef<Map<string, SVGTextElement>>(new Map())

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
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Theatre map"
        data-testid="theatre-map-svg"
        data-zoom-level={zoomLevel}
      >
        <g transform={transform.toString()}>
          <g className="map-countries">
            {geo.countries.features.map((feature) => (
              <path
                key={String(feature.id)}
                d={path(feature as GeoPermissibleObjects) ?? ''}
                className="map-country"
                data-testid={`map-country-${feature.id}`}
              />
            ))}
          </g>

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
            {allRegions.map((region) => (
              <path
                key={region.sectorId}
                d={regionPathD(region, project)}
                className={`map-sector-fill ${sectorFillClass(sectorControlBySector.get(region.sectorId))}`}
                data-testid={`map-sector-${region.sectorId}`}
              />
            ))}
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
                    <circle
                      cx={currentXY[0]}
                      cy={currentXY[1]}
                      r={4}
                      className="map-frontline-marker"
                      data-testid={`map-frontline-marker-${front.id}`}
                    />
                  )}
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
                  return <FormationToken key={display.id} display={display} x={x + dx} y={y + dy} />
                }),
              )}
            </g>
          )}

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
                <circle
                  key={theatreId}
                  cx={x}
                  cy={y}
                  r={40 + heat * 0.6}
                  className={`map-heat-glow-circle ${hot ? 'is-hot' : ''}`}
                  style={{ opacity: Math.min(0.35, heat / 300) }}
                  data-testid={`map-heat-glow-${theatreId}`}
                />
              )
            })}
          </g>

          {/* P76/P77 (§6.3 lager 11): etiketter, sist av alla lager —
              sektornamn (P76, zoomnivå 2+) och förbandsnamn (P77, zoomnivå
              3+, se FormationToken) delar samma kollisionsdöljning
              (useLabelCollisionHiding). */}
          {zoomLevel >= 2 && (
            <g className="map-sector-labels">
              {allRegions.map((region) => {
                const [x, y] = project([region.anchor[1], region.anchor[0]]) ?? [0, 0]
                if (hiddenLabels.has(region.sectorId)) return null
                return (
                  <text
                    key={region.sectorId}
                    ref={(el) => {
                      if (el) labelRefs.current.set(region.sectorId, el)
                      else labelRefs.current.delete(region.sectorId)
                    }}
                    x={x}
                    y={y - 8}
                    className="map-sector-label"
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
                  if (hiddenLabels.has(labelId)) return null
                  return (
                    <text
                      key={display.id}
                      ref={(el) => {
                        if (el) labelRefs.current.set(labelId, el)
                        else labelRefs.current.delete(labelId)
                      }}
                      x={x + dx}
                      y={y + dy - 9}
                      className="map-formation-label"
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
        </g>
      </svg>
    </div>
  )
}
