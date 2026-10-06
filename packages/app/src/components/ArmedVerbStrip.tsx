// ArmedVerbStrip — P163 (ETAPP10_FORSLAG.md §3b, S3): "ett tryck öppnar rätt mapp med verbet förvalt". Remsan visar vilket verb som är valt i Actions-menyn och var
// nästa tryck går (armedHint), tills verbet är utfört eller spelaren avbryter. Själva formuläret eller knappen som utför verbet markeras i sin mapp (data-verb → data-armed,
// se useArmedVerbHighlight i App.tsx) och handlingskortet står i den mappen, med kostnad och chans för det verkliga målet.
import { ACTION_CATALOG, armedHint } from '../actionCatalog.js'
import { VerbIcon } from './VerbIcon.js'

export function ArmedVerbStrip({ verb, onClear }: { verb: string; onClear: () => void }) {
  const entry = ACTION_CATALOG.find((e) => e.verb === verb)
  if (!entry) return null
  return (
    <div className="armed-verb" data-testid="armed-verb">
      <span className="armed-verb-icon" aria-hidden="true">
        <VerbIcon verb={verb} />
      </span>
      <span className="armed-verb-text">
        <span className="armed-verb-label" data-testid="armed-verb-label">
          {entry.label}
        </span>
        <span className="armed-verb-hint" data-testid="armed-verb-hint">
          {armedHint(entry)}
        </span>
      </span>
      <button type="button" className="armed-verb-clear" onClick={onClear} data-testid="armed-verb-clear">
        Cancel
      </button>
    </div>
  )
}
