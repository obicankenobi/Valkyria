// THE WIRE — startvyn varje tur. Telexflöde med utfällbar kausalkedja, max tre
// led bakåt via causeId. Spelarens egna spår markeras. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8.
//
// P21 (spec 9.4): krismodalen bor här, eftersom THE WIRE redan är den vy
// handleEndTurn (App.tsx) alltid navigerar till efter en avslutad tur — samma
// tur doomsday.ts (om den flaggar en kris) precis hann skriva pendingCrisis.
// Modalen har medvetet ingen stäng-/X-knapp: "inte går att stänga utan att
// välja" (9.4). Den blockerar INTE att spelaren byter flik eller avslutar
// turen ändå — 9.3 dokumenterar uttryckligen att en utebliven CRISIS-handling
// bara ger automatiskt BACK_DOWN, inte ett fel.
import { useState } from 'react'
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
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
        {event.actorIsPlayer && <Tag tone="amber">YOU</Tag>}
        {chain.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'hide cause' : `cause ×${chain.length}`}
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

const CRISIS_CHOICES: { choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE'; label: string; consequence: string }[] = [
  {
    choice: 'PUSH',
    label: 'PUSH',
    consequence: `${DISPLAY_THRESHOLDS.crisisPushExchangePct}% chance of a nuclear exchange (the scenario ends). Otherwise: stand-down, and a five-year contract emerges from the chaos.`,
  },
  {
    choice: 'BACK_DOWN',
    label: 'BACK DOWN',
    consequence: "Stand down. You forfeit this quarter's restricted revenue, and one station is burned in the fallout.",
  },
  {
    choice: 'SELL_THE_FILE',
    label: 'SELL THE FILE',
    consequence: 'Sell what you know to both sides — a large one-off payout, but your standing with both blocs collapses, permanently.',
  },
]

function CrisisModal({
  state,
  onChoose,
}: {
  state: GameState
  onChoose: (choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE') => void
}) {
  const pending = state.pendingCrisis
  if (!pending) return null
  const theatre = state.theatres[pending.theatreId]

  return (
    <div className="modal-overlay" data-testid="crisis-modal">
      <div className="modal-panel">
        <h2 className="view-title">CRISIS — DOOMSDAY AT {state.doomsday.toFixed(0)}</h2>
        <p className="banner-sub">
          {theatre ? theatre.name.toUpperCase() : pending.theatreId.toUpperCase()} is at the centre of it. You are
          never a bystander. Choose.
        </p>
        <div className="crisis-choices">
          {CRISIS_CHOICES.map((c) => (
            <button
              key={c.choice}
              type="button"
              className="btn btn-primary crisis-choice"
              onClick={() => onChoose(c.choice)}
            >
              <span className="crisis-choice-label">{c.label}</span>
              <span className="crisis-choice-consequence">{c.consequence}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TheWire({
  wire,
  state,
  draft,
  onChooseCrisis,
}: {
  wire: readonly WireEvent[]
  state: GameState
  draft: TurnSubmission
  onChooseCrisis: (choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE') => void
}) {
  const sorted = [...wire].sort((a, b) => b.turn - a.turn)
  const headlines = sorted.filter((e) => e.severity === 'headline').length
  const crisisChosen = draft.actions.some((a) => a.type === 'CRISIS')

  return (
    <>
      <h2 className="view-title">The Wire</h2>
      {state.pendingCrisis && !crisisChosen && <CrisisModal state={state} onChoose={onChooseCrisis} />}
      <Panel
        title="Telex"
        flush
        right={
          <span className="meter-label">
            {sorted.length} events · {headlines} headlines
          </span>
        }
      >
        {sorted.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            Quiet on the line. End the turn to set the world in motion.
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
