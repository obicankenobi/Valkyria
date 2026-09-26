// Shell — appskalet för etapp 7 (P74, ETAPP7_TEKNISK_SPEC.md §5/§10/§13).
// Fast viewport (100dvh, ingen sidscroll), instrumentpanel-HUD med räknande
// tal (regel 4), This Quarter-bandet, telexremsan, handlingsdockan och
// flikraden (nya namn, §2G — botten på telefon, vänstermeny på skrivbord).
// Komponentfilerna för de fyra befintliga vyerna (TheFloor.tsx m.fl.) rörs
// INTE av namnbytet, bara det som visas här i skalet runt dem (§2G:s egen
// mening, ordagrant).
import { useEffect, useRef, useState } from 'react'
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { formatMoney } from './ui.js'
import { ActionSlot } from './designSystem.js'
import type { RejectedEntry } from '../useGame.js'

export type ShellView = 'operations' | 'contracts' | 'company' | 'contacts' | 'news'

const TABS: { view: ShellView; label: string; icon: string }[] = [
  { view: 'operations', label: 'Operations', icon: '⌖' },
  { view: 'contracts', label: 'Contracts', icon: '▤' },
  { view: 'company', label: 'Company', icon: '⚙' },
  { view: 'contacts', label: 'Contacts', icon: '☷' },
  { view: 'news', label: 'News Desk', icon: '≋' },
]

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Regel 4: "Tal som ändras räknar till sitt nya värde." En liten, delad
// räknehook i stället för att upprepa requestAnimationFrame-logiken i varje
// HUD-cell.
function useCountUp(value: number, durationMs = 500): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    if (prefersReducedMotion()) {
      setDisplay(to)
      fromRef.current = to
      return
    }
    let raf = 0
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs)
      setDisplay(from + (to - from) * t)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return display
}

function doomsdayTone(value: number): string {
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'is-danger'
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'is-amber'
  return ''
}

// ── HUD — lackerad stålpanel med räknande tal (regel 8, regel 4). Ett tryck
// visar den fulla statusraden (skuld, kredit m.m.) — §5:s egen anteckning
// "(tryck för full HUD)". Full-HUD-innehållet är samma platshållarnivå som
// resten av P74: de faktiska fälten finns redan i state, bara den utfällda
// vyn är ny här. ──
export function HudBar({ state, testId = 'hud' }: { state: GameState; testId?: string }) {
  const [expanded, setExpanded] = useState(false)
  const doomsday = useCountUp(state.doomsday)
  const treasury = useCountUp(state.house.treasury)
  const target = state.house.boardTarget
  const progressPct = target.threshold > 0 ? (target.progressSnapshot / target.threshold) * 100 : 0
  const progress = useCountUp(progressPct)

  return (
    <div className="ds-hud" data-testid={testId}>
      <button
        type="button"
        className="ds-hud-row"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label="Show full status"
      >
        <span className="ds-hud-cell">
          <span className={`ds-hud-value ${doomsdayTone(state.doomsday)}`} data-testid="hud-doomsday">
            {doomsday.toFixed(0)}
          </span>
          <span className="ds-hud-label">Doomsday</span>
        </span>
        <span className="ds-hud-cell">
          <span
            className={state.house.treasury < 0 ? 'ds-hud-value is-danger' : 'ds-hud-value'}
            data-testid="hud-treasury"
          >
            {formatMoney(treasury)}
          </span>
          <span className="ds-hud-label">Treasury</span>
        </span>
        <span className="ds-hud-cell ds-hud-cell-board">
          <span className="ds-hud-bar">
            <span className="ds-hud-bar-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </span>
          <span className="ds-hud-label">Board {progress.toFixed(0)}%</span>
        </span>
        <span className="ds-hud-cell ds-hud-cell-date">
          <span className="ds-hud-value" data-testid="datestamp">
            {state.meta.year} · Q{state.meta.quarter}
          </span>
          <span className="ds-hud-label">Turn {state.meta.turn}</span>
        </span>
      </button>

      {expanded && (
        <div className="ds-hud-expanded" data-testid="hud-expanded">
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">Debt</span>
            <span className="ds-hud-value">{formatMoney(state.house.debt)}</span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">Credit limit</span>
            <span className="ds-hud-value" data-testid="credit-limit">
              {formatMoney(state.house.creditLimit)}
            </span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">Action points</span>
            <span className="ds-hud-value">{state.house.actionPoints}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── This Quarter-bandet (§7.7). Fullständig härledning (nya ordrar,
// exponerade stationer, kontrakt som riskerar bli sena osv.) är P83:s egna
// klart-när — här byggs bara CHROMET: ett alltid synligt, utfällbart band.
// Räknar det enda fält som redan finns billigt tillgängligt utan att
// föregripa P83:s härledningsfunktion: öppna ordrar + en aktiv kris. ──
export function QuarterBand({ state }: { state: GameState }) {
  const [expanded, setExpanded] = useState(false)
  const count = state.market.openOrders.length + (state.pendingCrisis ? 1 : 0)

  return (
    <div className="ds-quarterband">
      <button
        type="button"
        className="ds-quarterband-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="quarterband-toggle"
      >
        <span className="ds-quarterband-icon" aria-hidden="true">
          ◆
        </span>
        <span className="ds-quarterband-label">This Quarter</span>
        <span className="ds-quarterband-count">{count}</span>
        <span className="ds-quarterband-spacer" />
        <span className="ds-quarterband-chevron" aria-hidden="true">
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div className="ds-quarterband-body" data-testid="quarterband-body">
          {state.pendingCrisis && <p className="ds-quarterband-item">A crisis awaits a decision.</p>}
          {state.market.openOrders.length > 0 && (
            <p className="ds-quarterband-item">{state.market.openOrders.length} open order(s) on CONTRACTS.</p>
          )}
          {count === 0 && <p className="ds-quarterband-item is-quiet">Nothing needs your attention.</p>}
        </div>
      )}
    </div>
  )
}

// ── Telexremsan — löpande omgivningsrörelse (§6.6), avstängd vid
// prefers-reduced-motion (CSS-nivå, samma globala regel som resten av appen).
// Läser de senaste rubrikhändelserna ur state.wire — riktig data, inte en
// platshållartext. ──
export function TelexTicker({ state }: { state: GameState }) {
  const headlines = [...state.wire]
    .sort((a, b) => b.turn - a.turn)
    .slice(0, 8)
    .map((e) => e.headline)

  if (headlines.length === 0) {
    return (
      <div className="ds-telex" data-testid="telex-ticker">
        <span className="ds-telex-glyph" aria-hidden="true">
          ▸
        </span>
        <span className="ds-telex-text">Quiet on the line.</span>
      </div>
    )
  }

  const text = headlines.join('  ·  ')
  return (
    <div className="ds-telex" data-testid="telex-ticker">
      <span className="ds-telex-glyph" aria-hidden="true">
        ▸
      </span>
      <div className="ds-telex-track">
        <span className="ds-telex-text">{text}</span>
      </div>
    </div>
  )
}

// ── Handlingsdockan — handlingsplatserna (§7.2) + End Quarter, i tumzonen
// (regel 11). Antal platser är house.actionPoints; köade handlingar visas
// som riktiga ActionSlot-kort (redan riktig data — draft.actions). ──
export function ActionDock({
  state,
  queuedCount,
  onRemoveAction,
  onEndTurn,
  ended,
  testId = 'action-dock',
}: {
  state: GameState
  queuedCount: number
  onRemoveAction: (index: number) => void
  onEndTurn: () => void
  ended: boolean
  testId?: string
}) {
  const slots = Math.max(state.house.actionPoints, queuedCount)
  return (
    <div className="ds-actiondock" data-testid={testId}>
      <div className="ds-actiondock-slots">
        {Array.from({ length: slots }, (_, i) =>
          i < queuedCount ? (
            <ActionSlot key={i} icon="⌁" label={`Action ${i + 1}`} onRemove={() => onRemoveAction(i)} testId={`action-slot-${i}`} />
          ) : (
            <ActionSlot key={i} empty testId={`action-slot-${i}-empty`} />
          ),
        )}
      </div>
      <button
        type="button"
        className="ds-button is-primary ds-actiondock-end"
        onClick={onEndTurn}
        disabled={ended}
        data-testid="end-quarter-button"
      >
        End Quarter
      </button>
    </div>
  )
}

// ── Flikraden — botten på telefon, vänstermeny på skrivbord (ren CSS, samma
// DOM). Nya namn och ikoner (§2G). ──
export function TabBar({
  active,
  onSelect,
  contractsCount,
  newsCount,
}: {
  active: ShellView
  onSelect: (view: ShellView) => void
  contractsCount?: number
  newsCount?: number
}) {
  return (
    <nav className="ds-tabbar" data-testid="tabbar">
      {TABS.map((tab) => {
        const count = tab.view === 'contracts' ? contractsCount : tab.view === 'news' ? newsCount : undefined
        return (
          <button
            key={tab.view}
            type="button"
            className={active === tab.view ? 'ds-tabbar-item is-active' : 'ds-tabbar-item'}
            onClick={() => onSelect(tab.view)}
            aria-current={active === tab.view ? 'page' : undefined}
            data-testid={`tab-${tab.view}`}
          >
            <span className="ds-tabbar-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="ds-tabbar-label">{tab.label}</span>
            {count !== undefined && count > 0 && <span className="ds-tabbar-count">{count}</span>}
          </button>
        )
      })}
    </nav>
  )
}

// ── OPERATIONS-kartans platshållare. Den riktiga kartan (Natural Earth,
// SECTOR_REGIONS, d3-geo/d3-zoom) är P76 — P74 bygger bara skalet runt den
// (§13:s egen "OPERATIONS-layouten för telefon ur §5 MED PLATSHÅLLARE"). ──
export function MapPlaceholder({ theatreName }: { theatreName: string }) {
  return (
    <div className="ds-map-placeholder" data-testid="map-placeholder">
      <span className="ds-map-placeholder-glyph" aria-hidden="true">
        ⌖
      </span>
      <span className="ds-map-placeholder-text">{theatreName}</span>
      <span className="ds-map-placeholder-note">The theatre map arrives in a later build.</span>
    </div>
  )
}

// ── Rejected-bannern, oförändrad logik, ny plats (inuti innehållsytan, inte
// sidans egen scroll). ──
export function RejectedBanner({ rejected }: { rejected: RejectedEntry[] }) {
  if (rejected.length === 0) return null
  return (
    <div className="banner" data-testid="rejected-banner">
      <div>
        <div className="banner-title">Rejected last turn</div>
        <ul>
          {rejected.map((entry, i) => (
            <li key={i}>{entry.reason}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
