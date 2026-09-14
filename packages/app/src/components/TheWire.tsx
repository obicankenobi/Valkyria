// THE WIRE — startvyn varje tur. Telexflöde med utfällbar kausalkedja, max tre
// led bakåt via causeId. Spelarens egna spår markeras. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8.
import { useState } from 'react'
import type { WireEvent } from '@seventh-front/core'
import { causeChain } from '../wireChain.js'
import { Panel, Tag } from './ui.js'

// delta bär modelländringar (spec 2.6). Pengar visas som pengar, allt annat som
// råa tal — nyckelnamnet avgör, inte en gissning på storleken.
const MONEY_KEYS = new Set(['treasury', 'debt', 'price', 'capital', 'creditLimit'])

function formatDelta(key: string, value: number): string {
  const sign = value >= 0 ? '+' : '−'
  const magnitude = Math.abs(value)
  if (MONEY_KEYS.has(key)) {
    return `${key} ${sign}£${Math.round(magnitude).toLocaleString('sv-SE')}`
  }
  const rounded = Number.isInteger(magnitude) ? magnitude : Number(magnitude.toFixed(1))
  return `${key} ${sign}${rounded}`
}

function EventRow({ event, wire }: { event: WireEvent; wire: readonly WireEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const chain = causeChain(wire, event)
  const deltas = Object.entries(event.delta)

  const classes = ['wire-item']
  if (event.actorIsPlayer) classes.push('is-player')
  if (event.severity === 'headline') classes.push('is-headline')

  return (
    <li className={classes.join(' ')}>
      <div className="wire-row">
        <span className="wire-stamp">T{String(event.turn).padStart(2, '0')}</span>
        <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
        <span className="wire-text">{event.headline}</span>
        {event.actorIsPlayer && <Tag tone="amber">Du</Tag>}
        {chain.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'dölj orsak' : `orsak ${chain.length}`}
          </button>
        )}
      </div>

      {deltas.length > 0 && (
        <div className="wire-deltas">
          {deltas.map(([key, value]) => (
            <span key={key} className={value >= 0 ? 'delta is-up' : 'delta is-down'}>
              {formatDelta(key, value)}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <ol className="wire-chain">
          {chain.map((cause) => (
            <li key={cause.id}>
              <span className="mono">T{String(cause.turn).padStart(2, '0')}</span> — {cause.headline}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

export function TheWire({ wire }: { wire: readonly WireEvent[] }) {
  const sorted = [...wire].sort((a, b) => b.turn - a.turn)
  const headlines = sorted.filter((e) => e.severity === 'headline').length

  return (
    <>
      <h2 className="view-title">The Wire</h2>
      <Panel
        title="Telex"
        flush
        right={
          <span className="meter-label">
            {sorted.length} händelser · {headlines} rubriker
          </span>
        }
      >
        {sorted.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            Tyst på linjen. Avsluta turen för att sätta världen i rörelse.
          </p>
        ) : (
          <ul className="wire" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sorted.map((event) => (
              <EventRow key={event.id} event={event} wire={wire} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
