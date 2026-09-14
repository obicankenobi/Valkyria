// THE WIRE — startvyn varje tur. Headlines med utfällbar kausalkedja, max tre
// led bakåt via causeId. Spelarens egna spår markeras. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 8.
import { useState } from 'react'
import type { WireEvent } from '@seventh-front/core'
import { causeChain } from '../wireChain.js'

const SEVERITY_LABEL: Record<WireEvent['severity'], string> = {
  headline: '■',
  report: '▪',
  ticker: '·',
}

function EventRow({ event, wire }: { event: WireEvent; wire: readonly WireEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const chain = causeChain(wire, event)
  const canExpand = chain.length > 0

  return (
    <li style={{ marginBottom: '0.4rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span aria-hidden="true">{SEVERITY_LABEL[event.severity]}</span>
        <span style={{ opacity: 0.6 }}>T{event.turn}</span>
        {event.actorIsPlayer && <strong title="Ditt spår">DU</strong>}
        <span style={{ fontWeight: event.severity === 'headline' ? 'bold' : 'normal' }}>{event.headline}</span>
        {canExpand && (
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'dölj orsak' : `orsak (${chain.length})`}
          </button>
        )}
      </div>
      {expanded && (
        <ol style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
          {chain.map((cause) => (
            <li key={cause.id}>
              T{cause.turn} — {cause.headline}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

export function TheWire({ wire }: { wire: readonly WireEvent[] }) {
  const sorted = [...wire].sort((a, b) => b.turn - a.turn)

  return (
    <section>
      <h2>THE WIRE</h2>
      {sorted.length === 0 ? (
        <p>Inga händelser än.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {sorted.map((event) => (
            <EventRow key={event.id} event={event} wire={wire} />
          ))}
        </ul>
      )}
    </section>
  )
}
