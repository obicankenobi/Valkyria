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
import { DoomsdayGauge } from './Shell.js'
import {
  groupTickers,
  isFlashEvent,
  newsDepartment,
  NEWS_DEPARTMENTS,
} from '../newsClassification.js'
import type { NewsDepartment, TickerGroup } from '../newsClassification.js'
import { Tag } from './ui.js'
import { DsPanel, DsToggle, Segmented } from './designSystem.js'

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
  // P81d (§13, P81-blockquoten): blixt-tier händelser får mer visuell vikt
  // (samma register som QuarterReplay.tsx:s egen blixt-rad — en riktig
  // telexoperatör slår en stämpel på de brådskande meddelandena).
  if (isFlashEvent(event)) classes.push('is-flash')

  return (
    <li className={classes.join(' ')}>
      <div className="wire-row">
        <span className="wire-stamp">T{String(event.turn).padStart(2, '0')}</span>
        <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
        <span className="wire-text">{event.headline}</span>
        {anchor && <span className="wire-anchor">{anchor}</span>}
        {event.actorIsPlayer && <Tag tone="amber">YOU</Tag>}
        {chain.length > 0 && (
          <button type="button" className="btn btn-ghost wire-cause-toggle" onClick={() => setExpanded((v) => !v)}>
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

// P81d (§13, P81-blockquoten): "Rutinhändelser (ränta, underhåll,
// avsvalning) slås ihop till en sammanfattningsrad per typ" — arkivets
// motsvarighet till EventRow för en grupp ticker-händelser med samma
// normaliserade mall (newsClassification.ts). Visar den SENASTE instansen
// som huvudtext, ett tryck fäller ut alla, nyast överst.
function TickerGroupRow({ group, state }: { group: TickerGroup; state: GameState }) {
  const [expanded, setExpanded] = useState(false)
  const latest = group.events[group.events.length - 1]!
  const anchor = anchorLabel(state, wireAnchor(state, latest))

  return (
    <li className="wire-item is-ticker-group" data-testid="ticker-group-row">
      <div className="wire-row">
        <span className="wire-stamp">×{group.events.length}</span>
        <span className="wire-glyph is-ticker" aria-hidden="true" />
        <span className="wire-text">{latest.headline}</span>
        {anchor && <span className="wire-anchor">{anchor}</span>}
        <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'hide' : `all ${group.events.length}`}
        </button>
      </div>
      {expanded && (
        <ol className="wire-chain">
          {[...group.events].reverse().map((event) => (
            <li key={event.id}>
              <span className="mono">T{String(event.turn).padStart(2, '0')}</span> — {event.headline}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

// P81d: förstasidans avdelningssektion — högst fem rader (blixt-händelser
// prioriterade, aldrig bortklippta av femtaket), resten bakom en länk till
// arkivet, redan filtrerat på samma avdelning (regel 7, "Resten bakom
// 'More'").
function DepartmentSection({
  department,
  events,
  wire,
  state,
  onMore,
}: {
  department: { id: NewsDepartment; label: string }
  events: WireEvent[]
  wire: readonly WireEvent[]
  state: GameState
  onMore: () => void
}) {
  if (events.length === 0) return null
  const flash = events.filter(isFlashEvent)
  const rest = events.filter((e) => !isFlashEvent(e))
  const shown = [...flash, ...rest].slice(0, 5)
  const hiddenCount = events.length - shown.length

  return (
    <div data-testid={`news-department-${department.id}`}>
      <DsPanel title={department.label}>
        <ul className="wire" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((event) => (
            <EventRow key={event.id} event={event} wire={wire} state={state} />
          ))}
        </ul>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost news-more"
            onClick={onMore}
            data-testid={`news-more-${department.id}`}
          >
            {hiddenCount} more in {department.label} →
          </button>
        )}
      </DsPanel>
    </div>
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

// P87 (ETAPP7_TEKNISK_SPEC.md §7.6/§13): "Helskärmskort med illustration, de
// tre valen och PUSH:s 30 % utskrivet. Kan inte stängas utan val." Byggd om
// från den gamla, pre-regel-8-modalen (en centrerad panel över en halvt
// synlig bakgrund) till ett OPAKT helskärmskort — regel 8:s "manillamapp" i
// sin fysiskt yttersta form, ett aktakort som slås ned över hela bordet.
// Illustrationen är EXAKT samma DoomsdayGauge som HUD:en redan ritar (P81b),
// bara större och med kortets EGNA doomsday-värde — "en formel, en källa" i
// stället för en uppfunnen krisgrafik ingen annan skärm delar. Ingen stäng-/
// X-knapp (se filens huvudkommentar) — .crisis-fullscreen har medvetet ingen
// onClick/Esc-hantering.
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
    <div className="crisis-fullscreen" data-testid="crisis-modal">
      <div className="crisis-card">
        <span className="order-stamp is-urgent crisis-eyes-only">EYES ONLY</span>
        <DoomsdayGauge value={state.doomsday} className="crisis-illustration" />
        <h2 className="crisis-title" data-testid="crisis-doomsday">
          CRISIS — DOOMSDAY AT {state.doomsday.toFixed(0)}
        </h2>
        <p className="crisis-sub">
          {theatre ? theatre.name.toUpperCase() : pending.theatreId.toUpperCase()} is at the centre of it. You are
          never a bystander. Choose.
        </p>
        <div className="crisis-choices">
          {CRISIS_CHOICES.map((c) => (
            <button
              key={c.choice}
              type="button"
              className="crisis-choice"
              onClick={() => onChoose(c.choice)}
              data-testid={`crisis-choice-${c.choice}`}
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

// P81d (§13, P81-blockquoten): förstasidan + arkivet — två nivåer ovanpå
// hjälterubriken. "Front Page" är standardvyn (samma landningsupplevelse
// som innan); "Archive" är en explicit flik, filtrerbar per avdelning och
// på "bara mina".
type NewsView = 'front' | 'archive'

// P81d, ordagrant: "Telexarkivet: alla händelser, filtrerbara per avdelning
// och på 'bara mina'." Ticker-händelser (rutin) grupperas separat, se
// TickerGroupRow ovan.
function ArchiveList({
  wire,
  state,
  department,
  onlyMine,
}: {
  wire: readonly WireEvent[]
  state: GameState
  department: NewsDepartment | 'all'
  onlyMine: boolean
}) {
  const filtered = wire.filter((event) => {
    if (onlyMine && !event.actorIsPlayer) return false
    if (department !== 'all' && newsDepartment(state, event) !== department) return false
    return true
  })

  if (filtered.length === 0) {
    return <p className="empty">No events match this filter.</p>
  }

  const individual = filtered.filter((e) => e.severity !== 'ticker').sort((a, b) => b.turn - a.turn)
  const tickerGroups = groupTickers(filtered.filter((e) => e.severity === 'ticker'))

  return (
    <ul className="wire" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="archive-list">
      {individual.map((event) => (
        <EventRow key={event.id} event={event} wire={wire} state={state} />
      ))}
      {tickerGroups.length > 0 && (
        <>
          <li className="wire-section-label">Routine</li>
          {tickerGroups.map((group) => (
            <TickerGroupRow key={group.template} group={group} state={state} />
          ))}
        </>
      )}
    </ul>
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
  const [newsView, setNewsView] = useState<NewsView>('front')
  const [department, setDepartment] = useState<NewsDepartment | 'all'>('all')
  const [onlyMine, setOnlyMine] = useState(false)

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

  // P81d: "Förstasidan: kvartalets rubriker" — bara den SENASTE turens
  // rubrikhändelser, inte hela det rullande wire-fönstret (flera turer bak).
  // Det senare är arkivets jobb. `latestTurn` läses ur den faktiska datan,
  // inte state.meta.turn (som redan hunnit räknas upp när NEWS DESK visas).
  const latestTurn = wire.length > 0 ? Math.max(...wire.map((e) => e.turn)) : null
  // heroEvent utesluts — den redan visas stort i news-hero ovan, en dubblett
  // i avdelningslistan direkt under vore bara brus (genuint fynd, fångat av
  // TheWire.reveal.test.tsx när fixturerna blev rubrikhändelser).
  const thisQuarterHeadlines = visible.filter(
    (e) => e.severity === 'headline' && e.turn === latestTurn && e.id !== heroEvent?.id,
  )

  function openDepartment(dept: NewsDepartment) {
    setDepartment(dept)
    setNewsView('archive')
  }

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

      <Segmented
        options={[
          { value: 'front', label: 'Front Page' },
          { value: 'archive', label: `Archive · ${sorted.length}` },
        ]}
        value={newsView}
        onChange={setNewsView}
        testId="news-view-tabs"
      />

      {newsView === 'front' ? (
        <div data-testid="news-front-page">
          {sorted.length === 0 ? (
            <p className="empty">Quiet on the line. End the turn to set the world in motion.</p>
          ) : (
            NEWS_DEPARTMENTS.map((dept) => (
              <DepartmentSection
                key={dept.id}
                department={dept}
                events={thisQuarterHeadlines.filter((e) => newsDepartment(state, e) === dept.id)}
                wire={wire}
                state={state}
                onMore={() => openDepartment(dept.id)}
              />
            ))
          )}
        </div>
      ) : (
        <DsPanel
          title="Archive"
          right={
            <span className="meter-label">
              {sorted.length} events · {headlines} headlines
            </span>
          }
        >
          <div className="news-filters">
            <Segmented
              options={[{ value: 'all', label: 'All' }, ...NEWS_DEPARTMENTS.map((d) => ({ value: d.id, label: d.label }))]}
              value={department}
              onChange={setDepartment}
              testId="news-department-filter"
            />
            <DsToggle label="Only mine" checked={onlyMine} onChange={setOnlyMine} testId="news-only-mine-toggle" />
          </div>
          <ArchiveList wire={visible} state={state} department={department} onlyMine={onlyMine} />
        </DsPanel>
      )}
    </>
  )
}
