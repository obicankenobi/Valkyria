// ui — de små byggstenar alla fyra vyerna delar: panel, mätare, stapel, tagg.
// Ingen spellogik, bara presentation. Se docs/ANDRINGSLOGG.md för ägarbeslutet
// om att göra om estetiken (spec avsnitt 8).
import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'amber' | 'red' | 'green' | 'blue'

export function formatMoney(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '−' : ''
  return `${sign}£${Math.abs(rounded).toLocaleString('sv-SE')}`
}

export function formatSignedMoney(amount: number): string {
  return `${amount >= 0 ? '+' : '−'}£${Math.abs(Math.round(amount)).toLocaleString('sv-SE')}`
}

export function Panel({
  title,
  right,
  flush,
  children,
}: {
  title: string
  right?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3 className="panel-title">{title}</h3>
        {right}
      </div>
      <div className={flush ? 'panel-body is-flush' : 'panel-body'}>{children}</div>
    </section>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={tone === 'neutral' ? 'tag' : `tag is-${tone}`}>{children}</span>
}

export interface MeterMark {
  at: number
  label?: string
}

export function Meter({
  label,
  value,
  max = 100,
  display,
  tone = 'amber',
  marks = [],
}: {
  label: string
  value: number
  max?: number
  display?: string
  tone?: Exclude<Tone, 'neutral'>
  marks?: MeterMark[]
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={marks.length > 0 ? 'meter has-marks' : 'meter'}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{display ?? Math.round(value)}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill is-${tone}`} style={{ width: `${pct}%` }} />
        {marks.map((mark) => (
          <div key={mark.at} className="meter-mark" style={{ left: `${(mark.at / max) * 100}%` }} />
        ))}
      </div>
      {marks.length > 0 && (
        // Etiketterna ligger UTANFÖR spåret: .meter-track klipper (overflow:
        // hidden) för att hålla fyllnaden innanför rundade hörn, och klippte
        // därmed även bort etiketterna när de satt i markeringen själv.
        <div className="meter-scale">
          {marks.map((mark) => (
            <span key={mark.at} className="meter-scale-label" style={{ left: `${(mark.at / max) * 100}%` }}>
              {mark.label ?? mark.at}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function Bar({ ratio, tone = 'neutral' }: { ratio: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div className="bar">
      <div className={tone === 'neutral' ? 'bar-fill' : `bar-fill is-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
