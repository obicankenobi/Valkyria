// NEWS DESK (f.d. THE WIRE, §2G) — startvyn varje tur, telexremsan och
// tidningens förstasida (P80, ETAPP7_TEKNISK_SPEC.md §8). Telexflöde med
// utfällbar kausalkedja, max tre led bakåt via causeId. Spelarens egna spår
// markeras. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8 för den ursprungliga
// arkitekturen.
//
// P80: "Efteråt: NEWS DESK:s förstasida med rubriker och kausalkedjor,
// spelarens egna spår i telexgult" — den delen fanns redan (chain-expansion,
// .is-player). Nytt här: en hero-ruta för den SENASTE avslöjade
// rubrikhändelsen (en riktig förstasida har EN stor rubrik, inte bara en
// lista) och en `wireAnchor`/`anchorLabel`-badge per rad (P80s egen
// leverans) som visar VAR händelsen hör hemma — samma information
// QuarterReplay.tsx redan visar under själva uppspelningen, kvar synlig här
// efteråt.
//
// P21 (spec 9.4): krismodalen bor här, eftersom NEWS DESK redan är den vy
// handleEndTurn (App.tsx) alltid navigerar till efter en avslutad tur (nu
// via QuarterReplay.tsx, P80) — samma tur doomsday.ts (om den flaggar en
// kris) precis hann skriva pendingCrisis. Modalen har medvetet ingen stäng-/
// X-knapp: "inte går att stänga utan att välja" (9.4). Den blockerar INTE
// att spelaren byter flik eller avslutar turen ändå — 9.3 dokumenterar
// uttryckligen att en utebliven CRISIS-handling bara ger automatiskt
// BACK_DOWN, inte ett fel.
import { useEffect, useState } from 'react'
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
import { causeChain } from '../wireChain.js'
import { anchorLabel, wireAnchor } from '../wireAnchor.js'
import { Tag } from './ui.js'
import { DsPanel } from './designSystem.js'

// P70 (ETAPP6_TEKNISK_SPEC.md §5): "Ny sekvens: WireEvent-listan avslöjas en
// händelse i taget med kort fördröjning, avstängd vid prefers-reduced-
// motion." jsdom saknar `window.matchMedia` helt
// (verifierat, samma sorts lucka som `indexedDB` — se persistence.ts/P65) —
// vakten nedan gör hooken ofarlig i test/SSR i stället för att kasta.
export const REVEAL_INTERVAL_MS = 180

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useRevealedCount(itemCount: number, resetKey: unknown): number {
  const reduced = prefersReducedMotion()
  const [revealed, setRevealed] = useState(reduced ? itemCount : 0)

  useEffect(() => {
    if (reduced) {
      setRevealed(itemCount)
      return
    }
    setRevealed(0)
    if (itemCount === 0) return
    let shown = 0
    const timer = setInterval(() => {
      shown += 1
      setRevealed(shown)
      if (shown >= itemCount) clearInterval(timer)
    }, REVEAL_INTERVAL_MS)
    return () => clearInterval(timer)
    // resetKey (wire-referensen) styr avsiktligt NÄR sekvensen spelas om — inte
    // itemCount, som bara läses vid varje tick och inte ska trigga en omstart.
  }, [resetKey, reduced])

  return revealed
}

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

function EventRow({ event, wire, state }: { event: WireEvent; wire: readonly WireEvent[]; state: GameState }) {
  const [expanded, setExpanded] = useState(false)
  const chain = causeChain(wire, event)
  const deltas = Object.entries(event.delta)
  const anchor = anchorLabel(state, wireAnchor(state, event))

  const classes = ['wire-item']
  if (event.actorIsPlayer) classes.push('is-player')
  if (event.severity === 'headline') classes.push('is-headline')

  return (
    <li className={classes.join(' ')}>
      <div className="wire-row">
        <span className="wire-stamp">T{String(event.turn).padStart(2, '0')}</span>
        <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
        <span className="wire-text">{event.headline}</span>
        {anchor && <span className="wire-anchor">{anchor}</span>}
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
  // P70 (ETAPP6_TEKNISK_SPEC.md §5): telexet avslöjas en händelse i taget —
  // `wire` (propen, inte `sorted`, som är en NY array varje render) styr NÄR
  // sekvensen spelas om, så den bara startar när partiets tillstånd faktiskt
  // ändrats (en ny tur), inte vid varje omrendering.
  const revealedCount = useRevealedCount(sorted.length, wire)
  const visible = sorted.slice(0, revealedCount)
  // Förstasidan (P80, §8): den SENASTE avslöjade rubrikhändelsen får en egen,
  // stor ruta ovanför telexlistan — en riktig förstasida har en huvudrubrik,
  // inte bara en löpande lista. `visible` (inte `sorted`) så hjälten aldrig
  // spoilar en händelse som reveal-sekvensen inte hunnit visa än.
  const heroEvent = visible.find((e) => e.severity === 'headline') ?? null
  const heroAnchor = heroEvent ? anchorLabel(state, wireAnchor(state, heroEvent)) : null

  return (
    <>
      <h2 className="view-title">News Desk</h2>
      {state.pendingCrisis && !crisisChosen && <CrisisModal state={state} onChoose={onChooseCrisis} />}
      {heroEvent && (
        <div className="news-hero" data-testid="news-hero">
          <span className="news-hero-kicker">Today&apos;s Headline · T{String(heroEvent.turn).padStart(2, '0')}</span>
          <p className="news-hero-text">{heroEvent.headline}</p>
          {heroAnchor && <span className="wire-anchor">{heroAnchor}</span>}
        </div>
      )}
      <DsPanel
        title="Telex"
        right={
          <span className="meter-label">
            {sorted.length} events · {headlines} headlines
          </span>
        }
      >
        {sorted.length === 0 ? (
          <p className="empty">Quiet on the line. End the turn to set the world in motion.</p>
        ) : (
          <ul className="wire" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="wire-list">
            {visible.map((event) => (
              <EventRow key={event.id} event={event} wire={wire} state={state} />
            ))}
          </ul>
        )}
      </DsPanel>
    </>
  )
}
