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
