// Shell — appskalet för etapp 7 (P74, ETAPP7_TEKNISK_SPEC.md §5/§10/§13).
// Fast viewport (100dvh, ingen sidscroll), instrumentpanel-HUD med räknande
// tal (regel 4), This Quarter-bandet, telexremsan, handlingsdockan och
// flikraden (nya namn, §2G — botten på telefon, vänstermeny på skrivbord).
// Komponentfilerna för de fyra befintliga vyerna (TheFloor.tsx m.fl.) rörs
// INTE av namnbytet, bara det som visas här i skalet runt dem (§2G:s egen
// mening, ordagrant).
import { useEffect, useMemo, useRef, useState } from 'react'
import { boardReviewOutlook, DISPLAY_THRESHOLDS, previewAction } from '@seventh-front/core'
import type { GameState, PlayerAction } from '@seventh-front/core'
import { formatMoney } from './ui.js'
import { ActionSlot, InfoTooltip } from './designSystem.js'
import type { RejectedEntry } from '../useGame.js'
import { deriveQuarterlyNotice, deriveThisQuarter } from '../thisQuarter.js'
import type { ThisQuarterTarget } from '../thisQuarter.js'
import { HANDBOOK, hudNumberTopic } from '../handbook.js'
import type { HandbookTopicId } from '../handbook.js'

// P91b (§9/§13, P81-20): en HUD-summering läst direkt ur HANDBOOK — en
// enda källa, aldrig en handkopierad textsträng vid sidan av handbook.ts.
function hudSummary(id: Parameters<typeof hudNumberTopic>[0]): string {
  const topic = hudNumberTopic(id)
  return HANDBOOK.find((entry) => entry.id === topic)?.summary ?? ''
}

// P79 (ETAPP7_TEKNISK_SPEC.md §7.2, "Handlingsplatserna"): varje köat kort
// visar ett riktigt ikon/mål/kostnad, inte en generisk "Action N" — samma
// referensskiss som CountryFile.tsx bygger mot (operations-2-country-
// selected.html:s bottendocka: "RECRUIT LAOS £300K"). Kostnaden läses via
// previewAction (P78) — en delad sanningskälla, aldrig en egen gissning.
// Målnamnen slås upp direkt ur state (aldrig gated — en handling i KÖN är
// redan spelarens eget val, ingen dold information att läcka).
export const VERB_ICON: Record<string, string> = {
  EXPAND: '⬈',
  WITHDRAW: '⬋',
  LEAK: '✉',
  SABOTAGE: '⚡',
  TURN: '↻',
  RECRUIT: '✛',
  INFLUENCE: '⇄',
  STAGE_INCIDENT: '✷',
  BACK_CHANNEL: '☏',
  BRIBE: '✎',
  FUND_CAMPAIGN: '✎',
  FAVOUR: '✎',
  FUND_COUP: '☠',
  ASSASSINATE: '☠',
  BROKER: '⇄',
  BUY_FORWARD: '⇩',
  RELEASE: '⇧',
  TAKE_LOAN: '£',
  REPAY: '£',
  BUILD_LINE: '⚒',
  HIRE: '⚒',
  REPRIORITISE_RND: '⚙',
}

function targetLabel(state: GameState, action: PlayerAction): string {
  switch (action.type) {
    case 'INTEL': {
      const station = state.house.stations.find((s) => s.id === action.stationId)
      if (action.op === 'RECRUIT') return state.factions[action.targetId ?? '']?.name ?? action.targetId ?? ''
      if (action.op === 'TURN') return state.officials[action.targetId ?? '']?.name ?? station?.city ?? ''
      if (action.op === 'LEAK' || action.op === 'SABOTAGE') return state.rivals[action.targetId ?? '']?.name ?? station?.city ?? ''
      return station?.city ?? ''
    }
    case 'POLITICAL':
      if ('officialId' in action) return state.officials[action.officialId]?.name ?? action.officialId
      return state.factions[action.targetFactionId]?.name ?? action.targetFactionId
    case 'BROKER':
      return state.factions[action.buyerId]?.name ?? action.buyerId
    case 'MARKET':
      return action.commodity.toUpperCase()
    case 'CRISIS':
      return action.choice
    default:
      return ''
  }
}

export function actionSummary(state: GameState, action: PlayerAction): { icon: string; label: string; cost: string | undefined } {
  const op = action.type === 'INTERNAL' || action.type === 'INTEL' || action.type === 'POLITICAL' || action.type === 'MARKET' ? action.op : action.type
  const preview = previewAction(state, action)
  const cost = preview.cost === null ? undefined : formatMoney(preview.cost)
  const target = targetLabel(state, action)
  return { icon: VERB_ICON[op] ?? '⌁', label: target ? `${op} ${target}` : op, cost }
}

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

// P81b (§13, P81-blockquoten, P81-4): "Doomsday-siffran ... bör vara
// tydligare, mer som en skala tex termometer/tryckmätare." doomsdayGate.ts
// klampar fältet 0–100 (§resolve/doomsdayGate.ts, ordagrant), samma skala
// gaugen ritas mot. En halvcirkel, tre färgzoner efter EXAKT
// DISPLAY_THRESHOLDS.doomsdayCrisisWatch/doomsdayCrisisEvent (inga nya
// balanstal), en visare som roterar från vänster (0) via toppen (50) till
// höger (100) — samma "visarinstrument"-register regel 8 kräver.
const GAUGE_R = 26
const GAUGE_CX = 32
const GAUGE_CY = 32

function gaugePoint(fraction: number): [number, number] {
  const angle = fraction * Math.PI // 0 → vänster, 1 → höger, via toppen
  return [GAUGE_CX - GAUGE_R * Math.cos(angle), GAUGE_CY - GAUGE_R * Math.sin(angle)]
}

function gaugeArc(fromFraction: number, toFraction: number): string {
  const [x1, y1] = gaugePoint(fromFraction)
  const [x2, y2] = gaugePoint(toFraction)
  // large-arc-flag avgör bara vid spann > 180°; en halvcirkel (fraction 0..1)
  // sträcker sig aldrig längre än exakt 180° — flaggan är alltså ALLTID 0,
  // aldrig villkorad på spannets storlek.
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${GAUGE_R},${GAUGE_R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
}

// P87 (ETAPP7_TEKNISK_SPEC.md §7.6/§13): exporterad så TheWire.tsx:s
// krisöverlag kan återanvända EXAKT samma instrument, bara större — "en
// formel, en källa" i stället för en egen krisillustration uppfunnen vid
// sidan av HUD:ens redan byggda visarinstrument (P81b).
export function DoomsdayGauge({ value, className }: { value: number; className?: string }) {
  const fraction = Math.max(0, Math.min(100, value)) / 100
  const watchFraction = DISPLAY_THRESHOLDS.doomsdayCrisisWatch / 100
  const eventFraction = DISPLAY_THRESHOLDS.doomsdayCrisisEvent / 100
  const [needleX, needleY] = gaugePoint(fraction)

  return (
    <svg className={className ? `ds-hud-gauge ${className}` : 'ds-hud-gauge'} viewBox="0 0 64 36" aria-hidden="true">
      <path d={gaugeArc(0, watchFraction)} className="ds-hud-gauge-zone is-safe" />
      <path d={gaugeArc(watchFraction, eventFraction)} className="ds-hud-gauge-zone is-amber" />
      <path d={gaugeArc(eventFraction, 1)} className="ds-hud-gauge-zone is-danger" />
      <line x1={GAUGE_CX} y1={GAUGE_CY} x2={needleX} y2={needleY} className="ds-hud-gauge-needle" />
      <circle cx={GAUGE_CX} cy={GAUGE_CY} r={2.5} className="ds-hud-gauge-pivot" />
    </svg>
  )
}

// ── HUD — lackerad stålpanel med räknande tal (regel 8, regel 4). Ett tryck
// visar den fulla statusraden (skuld, kredit m.m.) — §5:s egen anteckning
// "(tryck för full HUD)". Full-HUD-innehållet är samma platshållarnivå som
// resten av P74: de faktiska fälten finns redan i state, bara den utfällda
// vyn är ny här. ──
export function HudBar({
  state,
  testId = 'hud',
  onOpenMenu,
  onOpenHandbook,
}: {
  state: GameState
  testId?: string
  onOpenMenu?: () => void
  // P91b (§9/§13, P81-20): "nåbar ... från varje info-ikon." Nästlade
  // knappar är ogiltig HTML — .ds-hud-row ÄR redan en <button> (växlar
  // expanded) — så InfoTooltip:s egna knappar bor i den UTFÄLLDA panelen
  // (en <div>, inte en <button>) i stället för i den kompakta raden.
  onOpenHandbook?: (topic: HandbookTopicId) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const doomsday = useCountUp(state.doomsday)
  const treasury = useCountUp(state.house.treasury)
  const target = state.house.boardTarget
  const progressPct = target.threshold > 0 ? (target.progressSnapshot / target.threshold) * 100 : 0
  const progress = useCountUp(progressPct)
  // P81c (§13, P81-blockquoten, P81-8): "utkastad tur 10 utan tydlig
  // förvarning" — Board-cellen visade bara procent mot det SLUTLIGA målet,
  // aldrig när nästa granskning är eller om spelaren ligger under kravet dit.
  const outlook = boardReviewOutlook(state)

  return (
    <div className="ds-hud" data-testid={testId}>
      <div className="ds-hud-top">
      <button
        type="button"
        className="ds-hud-row"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label="Show full status"
      >
        {/* P81b (§13, P81-4/P81-5): doomsday som ett visarinstrument i
            stället för bara en siffra, och en synlig cellram (ds-hud-cell,
            border-left nedan) mellan den och Treasury — de två lästes
            tidigare som ETT värde ("Doomsday Treasury") utan en avgränsning. */}
        <span className="ds-hud-cell ds-hud-cell-doomsday">
          <DoomsdayGauge value={state.doomsday} />
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
          {/* P81c (§13, P81-8): "Board" kortades till "Bd" — den fulla
              etiketten pluss "· Nt" klipptes (regel 18) sedan menyknappen
              (P81b) tog utrymme från raden. */}
          <span className={outlook.isLastTurnBeforeReview ? 'ds-hud-label is-danger' : 'ds-hud-label'} data-testid="hud-board-outlook">
            Bd {progress.toFixed(0)}% {outlook.turnsUntil !== null ? `· ${outlook.turnsUntil}t` : ''}
          </span>
        </span>
        <span className="ds-hud-cell ds-hud-cell-date">
          <span className="ds-hud-value" data-testid="datestamp">
            {state.meta.year} · Q{state.meta.quarter}
          </span>
          <span className="ds-hud-label">Turn {state.meta.turn}</span>
        </span>
      </button>

      {/* P81b (§13, P81-6): menyknappen, utanför ds-hud-row eftersom en
          <button> inte kan nästlas i en annan — en flexsyskon i stället för
          en kolumn i den inre grid:en, se .ds-hud-top. */}
      {onOpenMenu && (
        <button type="button" className="ds-hud-menu-button" onClick={onOpenMenu} aria-label="Menu" data-testid="hud-menu-button">
          ☰
        </button>
      )}
      </div>

      {expanded && (
        <div className="ds-hud-expanded" data-testid="hud-expanded">
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Doomsday
              {onOpenHandbook && (
                <InfoTooltip text={hudSummary('doomsday')} onReadMore={() => onOpenHandbook(hudNumberTopic('doomsday'))} testId="hud-info-doomsday" />
              )}
            </span>
            <span className="ds-hud-value">{state.doomsday.toFixed(0)}</span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Treasury
              {onOpenHandbook && (
                <InfoTooltip text={hudSummary('treasury')} onReadMore={() => onOpenHandbook(hudNumberTopic('treasury'))} testId="hud-info-treasury" />
              )}
            </span>
            <span className="ds-hud-value">{formatMoney(state.house.treasury)}</span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Board target
              {onOpenHandbook && (
                <InfoTooltip text={hudSummary('board')} onReadMore={() => onOpenHandbook(hudNumberTopic('board'))} testId="hud-info-board" />
              )}
            </span>
            <span className="ds-hud-value">{progress.toFixed(0)}%</span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Debt
              {onOpenHandbook && (
                <InfoTooltip text={hudSummary('debt')} onReadMore={() => onOpenHandbook(hudNumberTopic('debt'))} testId="hud-info-debt" />
              )}
            </span>
            <span className="ds-hud-value">{formatMoney(state.house.debt)}</span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Credit limit
              {onOpenHandbook && (
                <InfoTooltip text={hudSummary('creditLimit')} onReadMore={() => onOpenHandbook(hudNumberTopic('creditLimit'))} testId="hud-info-credit-limit" />
              )}
            </span>
            <span className="ds-hud-value" data-testid="credit-limit">
              {formatMoney(state.house.creditLimit)}
            </span>
          </span>
          <span className="ds-hud-expanded-cell">
            <span className="ds-hud-label">
              Action points
              {onOpenHandbook && (
                <InfoTooltip
                  text={hudSummary('actionPoints')}
                  onReadMore={() => onOpenHandbook(hudNumberTopic('actionPoints'))}
                  testId="hud-info-action-points"
                />
              )}
            </span>
            <span className="ds-hud-value">{state.house.actionPoints}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── This Quarter-bandet (§7.7). "Listan är en vägvisare, inte ett
// formulär": ett alltid synligt, utfällbart band vars rader hoppar till
// föremålet (P83). Kvartalsbeskedet (P81-11) ligger överst, statiskt. ──
export function QuarterBand({ state, onNavigate }: { state: GameState; onNavigate: (target: ThisQuarterTarget) => void }) {
  const [expanded, setExpanded] = useState(false)
  // P81c (§13, P81-blockquoten, P81-8): "en varning i kvartalsbandet" turen
  // före en granskning spelaren ligger under kravet inför — samma
  // boardReviewOutlook HUD:ens Board-cell redan läser.
  const outlook = boardReviewOutlook(state)
  const boardWarning = outlook.isLastTurnBeforeReview
  const target = state.house.boardTarget
  const requiredPct = target.threshold > 0 ? (outlook.required / target.threshold) * 100 : 0
  const currentPct = target.threshold > 0 ? (outlook.current / target.threshold) * 100 : 0
  const items = useMemo(() => deriveThisQuarter(state), [state])
  const notice = useMemo(() => deriveQuarterlyNotice(state), [state])
  const count = items.length + (boardWarning ? 1 : 0)

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
        {boardWarning && (
          <span className="ds-quarterband-warning" aria-hidden="true" data-testid="quarterband-board-warning">
            ⚠
          </span>
        )}
        <span className="ds-quarterband-spacer" />
        <span className="ds-quarterband-chevron" aria-hidden="true">
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div className="ds-quarterband-body" data-testid="quarterband-body">
          {notice.length > 0 && (
            <div className="ds-quarterband-notice" data-testid="quarterband-notice">
              {notice.map((n) => (
                <p key={n.id} className="ds-quarterband-item" data-testid={`quarterband-notice-${n.id}`}>
                  <span aria-hidden="true">{n.icon}</span> {n.text}
                </p>
              ))}
            </div>
          )}
          {boardWarning && (
            <p className="ds-quarterband-item is-warn" data-testid="quarterband-board-warning-item">
              Board review next turn — at {currentPct.toFixed(0)}%, need {requiredPct.toFixed(0)}% to stay on track.
            </p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ds-quarterband-item-button"
              onClick={() => onNavigate(item.target)}
              data-testid={`quarterband-item-${item.id}`}
            >
              <span className="ds-quarterband-item-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
          {count === 0 && notice.length === 0 && <p className="ds-quarterband-item is-quiet">Nothing needs your attention.</p>}
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
  actions,
  onRemoveAction,
  onEndTurn,
  onOpenCatalog,
  ended,
  testId = 'action-dock',
}: {
  state: GameState
  actions: PlayerAction[]
  onRemoveAction: (index: number) => void
  onEndTurn: () => void
  onOpenCatalog?: () => void
  ended: boolean
  testId?: string
}) {
  const slots = Math.max(state.house.actionPoints, actions.length)
  return (
    <div className="ds-actiondock" data-testid={testId}>
      <div className="ds-actiondock-slots">
        {Array.from({ length: slots }, (_, i) => {
          const action = actions[i]
          if (!action) return <ActionSlot key={i} empty onOpen={onOpenCatalog} testId={`action-slot-${i}-empty`} />
          const { icon, label, cost } = actionSummary(state, action)
          return (
            <ActionSlot key={i} icon={icon} label={label} cost={cost} onRemove={() => onRemoveAction(i)} testId={`action-slot-${i}`} />
          )
        })}
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
