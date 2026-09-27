// MapLegend.tsx — P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten). En
// BottomSheet som förklarar varje symbol på TheatreMap.tsx i två led: vad
// den är, och vad den betyder för spelaren (regel 13: ingen information bara
// vid hovring). Ikonerna återanvänder EXAKT samma CSS-klasser som kartan
// själv (.map-sector-fill.is-a, .map-token-frame osv.) i stället för att
// uppfinna egna färger — så teckenförklaringen aldrig kan glida isär från
// hur kartan faktiskt ser ut.
import { useEffect, useRef } from 'react'
import { BottomSheet } from './designSystem.js'
import { MAP_LEGEND, type MapLegendEntry, type MapLegendIconKind } from '../mapLegend.js'

function LegendIcon({ kind }: { kind: MapLegendIconKind }) {
  switch (kind) {
    case 'sector-a':
    case 'sector-b':
    case 'sector-contested':
    case 'sector-empty':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <rect x={2} y={2} width={24} height={24} rx={3} className={`map-sector-fill is-${kind.slice(7)}`} />
        </svg>
      )
    case 'fog':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <rect x={2} y={2} width={24} height={24} rx={3} className="map-sector-fill is-empty" />
          <rect x={2} y={2} width={24} height={24} rx={3} className="map-fog-overlay" />
        </svg>
      )
    case 'dmz':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <line x1={2} y1={14} x2={26} y2={14} className="map-dmz-line" />
        </svg>
      )
    case 'frontline':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <circle cx={9} cy={19} r={3} className="map-frontline-marker-trace" style={{ opacity: 0.35 }} />
          <circle cx={19} cy={9} r={4} className="map-frontline-marker" />
        </svg>
      )
    case 'heat':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <circle cx={14} cy={14} r={11} className="map-heat-glow-circle is-hot" style={{ opacity: 0.6 }} />
        </svg>
      )
    case 'formation-known':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <g transform="translate(14,14)" className="map-formation-a">
            <rect x={-8} y={-8} width={16} height={16} className="map-token-frame" />
          </g>
        </svg>
      )
    case 'formation-mauled':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <g transform="translate(14,14)" className="map-formation-a">
            <rect x={-8} y={-8} width={16} height={16} className="map-token-frame is-mauled" />
            <path d="M-6,-8L0,0L-3,8M6,-8L0,0L3,8" className="map-token-crack" />
          </g>
        </svg>
      )
    case 'formation-unknown':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <g transform="translate(14,14)" className="map-formation-a">
            <rect x={-8} y={-8} width={16} height={16} className="map-token-frame is-unknown" />
          </g>
        </svg>
      )
    case 'capital':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <circle cx={14} cy={14} r={8} className="map-capital-marker" />
        </svg>
      )
    case 'capital-orders':
      return (
        <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
          <circle cx={11} cy={17} r={7} className="map-capital-marker" />
          <g transform="translate(20,8)">
            <circle r={6} className="map-capital-badge" />
            <text className="map-capital-badge-text" textAnchor="middle" dominantBaseline="central">
              2
            </text>
          </g>
        </svg>
      )
  }
}

function LegendRow({ entry, focused }: { entry: MapLegendEntry; focused: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // scrollIntoView saknas i jsdom (samma miljölucka som getBBox/matchMedia
    // på andra ställen i den här appen) — utan skyddet krascharen testerna,
    // aldrig i en riktig webbläsare.
    if (focused && typeof ref.current?.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'center' })
    }
  }, [focused])
  return (
    <div ref={ref} className={focused ? 'map-legend-row is-focused' : 'map-legend-row'} data-testid={`map-legend-row-${entry.id}`}>
      <div className="map-legend-icon">
        <LegendIcon kind={entry.icon} />
      </div>
      <div className="map-legend-text">
        <h3 className="map-legend-title">{entry.title}</h3>
        <p className="map-legend-line">{entry.whatItIs}</p>
        <p className="map-legend-line map-legend-meaning">{entry.whatItMeans}</p>
      </div>
    </div>
  )
}

// `focusId` (P81a: "Ett tryck på en symbol ... öppnar samma förklaring för
// just den symbolen", regel 13) — utan den visas hela listan, med den
// scrollas och markeras just den symbolens rad.
export function MapLegend({ open, focusId, onClose }: { open: boolean; focusId: string | null; onClose: () => void }) {
  return (
    <BottomSheet
      open={open}
      title="Teckenförklaring"
      subtitle="Vad symbolerna på kartan betyder"
      onClose={onClose}
      testId="map-legend"
    >
      <div className="map-legend-list">
        {MAP_LEGEND.map((entry) => (
          <LegendRow key={entry.id} entry={entry} focused={entry.id === focusId} />
        ))}
      </div>
    </BottomSheet>
  )
}
