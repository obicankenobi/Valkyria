// TheatreMap — P76 (ETAPP7_TEKNISK_SPEC.md §6/§13): den riktiga geografiska
// teaterkartan som ersätter Shell.tsx:s MapPlaceholder på OPERATIONS.
// Ägarbeslut A (§2): "Kartan blir geografisk... inget taktiskt lager,
// spelaren flyttar inga förband, kartan visar aldrig mer än modellen håller
// reda på." Läser bara via queries.ts:s redan existerande deriveSectorControl
// — precis som den gamla schematiska SectorBoard.tsx gjorde (P66/P68), bara
// projicerat på riktig geografi (SECTOR_REGIONS, sectorRegions.ts) i stället
// för fasta 0–100-skärmkoordinater. `SectorBoard.tsx`/`sectorLayout.ts`
// (den schematiska tavlan A retirerar) rörs inte — utanför denna prompts
// scope, se sectorRegions.ts:s egen kommentar.
//
// Byggd i denna prompt (§13:s P76-rad, ordagrant): geografiskriptet
// (scripts/build-geo.mjs), TopoJSON, projektion (d3-geo), panorering och
// zoom (d3-zoom), SECTOR_REGIONS-kontrollfärgning, frontlinje med spår.
// UTANFÖR scope (senare prompter, §6.3:s egna lagernummer): underrättelsedimma
// (P77, lager 3), försörjningslinjer (P77, lager 6), förbandsbrickor (P77,
// lager 7), huvudstäder/stationer/hamnar/ordermarkörer (P79, lager 8),
// heat-glöd (P77, lager 9), markering av valt föremål (P79, lager 10) —
// inget av det finns som data att rita ännu i det här skedet.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import type { GeoPermissibleObjects } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomTransform } from 'd3-zoom'
import * as topojsonClient from 'topojson-client'
import { deriveSectorControl } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { interpolateFrontGeoPosition } from '../geoMath.js'
import { SECTOR_REGIONS } from '../sectorRegions.js'
import type { SectorRegion } from '../sectorRegions.js'
import { MapPlaceholder } from './Shell.js'

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

  // geoLoaded i deps (se kommentaren vid dess definition ovan) — annars
  // körde effekten bara på det första, tomma laddar-varvet och aldrig om
  // när <text>-elementen väl fanns. Genuint fynd, hittat visuellt i
  // npm run shots (två etiketter som löpte ihop) — inte av jsdom-testerna,
  // som mockar fetch och därför aldrig såg ett "laddar"-varv alls.
  const hiddenLabels = useLabelCollisionHiding(labelRefs, [transform.k, allRegions.length, zoomLevel, geoLoaded])

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
        </g>
      </svg>
    </div>
  )
}
