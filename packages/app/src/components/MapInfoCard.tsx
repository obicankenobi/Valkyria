// MapInfoCard — P165 (ETAPP10_FORSLAG.md §3b, S6): kartans informationskort. Ligger i kartans nederkant och visar det valda föremålets rader (mapInfo.ts). Texten och talen
// kommer färdiga därifrån; här finns bara presentationen, en stängknapp, en väg in i landsakten och en länk till handboken.
import type { MapInfo } from '../mapInfo.js'
import { useOpenHandbook } from '../uiContext.js'

export function MapInfoCard({ info, onClose, onOpenFile }: { info: MapInfo; onClose: () => void; onOpenFile?: () => void }) {
  const openHandbook = useOpenHandbook()
  return (
    <aside className="map-info-card" data-testid="map-info-card" aria-label={`${info.kicker}: ${info.title}`}>
      <div className="map-info-head">
        <div className="map-info-heading">
          <span className="map-info-kicker" data-testid="map-info-kicker">
            {info.kicker}
          </span>
          <h3 className="map-info-title" data-testid="map-info-title">
            {info.title}
          </h3>
        </div>
        <button type="button" className="map-info-close" onClick={onClose} aria-label="Close" data-testid="map-info-close">
          ×
        </button>
      </div>
      {onOpenFile && (
        <button type="button" className="ds-button is-primary map-info-open" onClick={onOpenFile} data-testid="map-info-open-file">
          Open country file
        </button>
      )}
      <dl className="map-info-rows">
        {info.rows.map((row) => (
          <div key={row.label} className="map-info-row" data-testid={`map-info-row-${row.label}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {info.note && (
        <p className="map-info-note" data-testid="map-info-note">
          {info.note}
        </p>
      )}
      {info.topic && openHandbook && (
        <button type="button" className="action-card-more" onClick={() => openHandbook(info.topic!)} data-testid="map-info-handbook">
          Read more in the Handbook →
        </button>
      )}
    </aside>
  )
}
