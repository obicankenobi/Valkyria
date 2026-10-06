// MapLayerBar — P166 (ETAPP10_FORSLAG.md §3b): knapparna som växlar kartans lager med tal. Ett lager åt gången; ett tryck på det aktiva lagret stänger det. Varje knapp har en ikon och en
// förkortad etikett (regel 5) och träffytan är 44 × 44 (regel 11).
import type { ReactNode } from 'react'
import { MAP_LAYERS } from '../mapLayers.js'
import type { MapLayerId } from '../mapLayers.js'

// Små, enkla former i `currentColor` — samma ritstil som kartans teckenförklaring: en pappersorder, en lastbil, ett par vågar, ett öga, en handtryckning.
const GLYPH: Record<MapLayerId, ReactNode> = {
  orders: <path d="M5,3h9l4,4v14H5zM14,3v4h4M8,11h7M8,15h7" />,
  supply: <path d="M2,7h12v9H2zM14,10h4l3,3v3h-7M6,18.5a1.5,1.5 0 1 0 0.01,0M17,18.5a1.5,1.5 0 1 0 0.01,0" />,
  rivals: <path d="M12,4v16M5,20h14M5,8h14M5,8l-2,6h4zM19,8l-2,6h4z" />,
  intelligence: <path d="M2,12C5,6,19,6,22,12C19,18,5,18,2,12zM12,9a3,3 0 1 0 0.01,0" />,
  politics: <path d="M3,20h18M5,20V10M9,20V10M15,20V10M19,20V10M3,10l9-6l9,6z" />,
}

export function MapLayerBar({ active, onChange }: { active: MapLayerId | null; onChange: (layer: MapLayerId | null) => void }) {
  return (
    <div className="map-layer-bar" role="group" aria-label="Map layers" data-testid="map-layer-bar">
      {MAP_LAYERS.map((layer) => {
        const on = layer.id === active
        return (
          <button
            key={layer.id}
            type="button"
            className={on ? 'map-layer-button is-on' : 'map-layer-button'}
            aria-pressed={on}
            aria-label={`${layer.label} layer`}
            onClick={() => onChange(on ? null : layer.id)}
            data-testid={`map-layer-${layer.id}`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="map-layer-glyph">
              {GLYPH[layer.id]}
            </svg>
            <span className="map-layer-short">{layer.short}</span>
          </button>
        )
      })}
    </div>
  )
}
