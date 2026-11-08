// MapQuarterReplay.tsx — Paket G5 (ETAPP 12, 12E): koreograferad kvartalsuppspelning
// direkt ovanpå den synliga kartan, inklusive inkoppling av MovementArrow.tsx
// för förbandsförflyttningar (REDEPLOY) och leveranser (SUPPLY_ARRIVAL).
// Bevarar samtliga data-testid och props från QuarterReplay.tsx.
import { Fragment, useEffect, useState } from 'react'
import type { BoardMemo as BoardMemoData, GameState, WireEvent } from '@seventh-front/core'
import { anchorLabel, wireAnchor } from '../wireAnchor.js'
import { historyFrontPage, isFlashEvent } from '../newsClassification.js'
import { extractRedeployMovements } from '../mapMilitaryOverlay.js'
import { FrontPageCard } from './FrontPageCard.js'
import { BoardMemo } from './BoardMemo.js'
import { MovementArrow } from './MovementArrow.js'
import { DsToggle } from './designSystem.js'
import { Tag } from './ui.js'
import { REPLAY_PHASES, orderByPhase } from '../replayPhases.js'
import type { ReplayPhase } from '../replayPhases.js'
import { cleanHeadline } from '../displayNames.js'

export const REPLAY_INTERVAL_MS = 700

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function MapQuarterReplay({
  wire,
  state,
  fullReplay,
  onToggleFullReplay,
  memo = null,
  onFocus,
  onDone,
}: {
  wire: readonly WireEvent[]
  state: GameState
  fullReplay: boolean
  onToggleFullReplay: (value: boolean) => void
  memo?: BoardMemoData | null
  onFocus?: (event: WireEvent | null) => void
  onDone: () => void
}) {
  // Etapp 14, P207 (förslaget §8.2): händelserna spelas i tre faser — leveranser, fronten, telegrammen — och kartan pekar ut var och en.
  const phased = orderByPhase(state, fullReplay ? wire : wire.filter((e) => e.severity === 'headline'))
  const events = phased.map((p) => p.event)
  const phaseOf = new Map(phased.map((p) => [p.event.id, p.phase]))
  const frontPage = wire.map(historyFrontPage).find((e) => e !== null) ?? null
  const reduced = prefersReducedMotion()
  const hasMemo = memo !== null
  const nothingToAnimate = reduced || events.length === 0
  const [shown, setShown] = useState(0)
  const [memoVisible, setMemoVisible] = useState(hasMemo && nothingToAnimate)

  const redeployMoves = extractRedeployMovements(wire)

  useEffect(() => {
    if (nothingToAnimate && !hasMemo) {
      onDone()
    }
  }, [])

  useEffect(() => {
    onFocus?.(nothingToAnimate || shown === 0 ? null : (events[Math.min(shown, events.length) - 1] ?? null))
  }, [shown])

  useEffect(() => () => onFocus?.(null), [])

  useEffect(() => {
    if (nothingToAnimate) return
    if (shown >= events.length) {
      if (hasMemo) {
        setMemoVisible(true)
        return
      }
      const timer = setTimeout(onDone, REPLAY_INTERVAL_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setShown((n) => n + 1), REPLAY_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [shown])

  if (nothingToAnimate && !hasMemo) return null

  const visible = nothingToAnimate ? events : events.slice(0, shown)
  const lastShown = visible[visible.length - 1]
  const currentPhase: ReplayPhase | null = lastShown ? (phaseOf.get(lastShown.id) ?? null) : null
  const phasesPresent = new Set(phased.map((p) => p.phase))

  function handleSkip() {
    if (hasMemo && !memoVisible) {
      setShown(events.length)
      setMemoVisible(true)
      return
    }
    onDone()
  }

  return (
    <div
      className={memo && memoVisible ? 'modal-overlay' : 'modal-overlay is-map-replay desk-map-replay-dock'}
      data-testid="quarter-replay"
    >
      <div className="modal-panel replay-panel desk-replay-card">
        <div className="replay-head">
          <div>
            <span className="desk-kicker">LIVE TELEX &amp; MAP RESOLUTION</span>
            <h2 className="view-title">Quarter Replay</h2>
          </div>
          <DsToggle
            label="Full playback"
            checked={fullReplay}
            onChange={onToggleFullReplay}
            testId="replay-full-toggle"
          />
        </div>

        {/* P207: fasremsan — tre stämplar; den pågående fasen är ifylld, en fas utan händelser är överstruken. */}
        <ol className="replay-phases" data-testid="replay-phases" aria-label="Replay phases">
          {REPLAY_PHASES.map((phase) => (
            <li
              key={phase.id}
              className={[
                'replay-phase',
                currentPhase === phase.id || (nothingToAnimate && phasesPresent.has(phase.id)) ? 'is-active' : '',
                phasesPresent.has(phase.id) ? '' : 'is-empty',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid={`replay-phase-${phase.id}`}
              aria-current={currentPhase === phase.id ? 'step' : undefined}
            >
              {phase.label}
            </li>
          ))}
        </ol>

        {frontPage && <FrontPageCard event={frontPage} testId="replay-front-page" />}

        {redeployMoves.length > 0 && (
          <div className="desk-replay-movements" data-testid="replay-movements">
            {redeployMoves.map((mv) => (
              <MovementArrow
                key={mv.id}
                kind="REDEPLOY"
                formationName={mv.formationName}
                fromSectorId={mv.fromSectorId}
                toSectorId={mv.toSectorId}
              />
            ))}
          </div>
        )}

        <ol className="replay-list" data-testid="replay-list" tabIndex={0} aria-label="Quarter events">
          {visible.map((event, index) => {
            const anchor = wireAnchor(state, event)
            const label = anchorLabel(state, anchor)
            const flash = isFlashEvent(event)
            const phase = phaseOf.get(event.id)
            const startsPhase = index === 0 || phaseOf.get(visible[index - 1]!.id) !== phase
            const phaseLabel = REPLAY_PHASES.find((p) => p.id === phase)?.label
            return (
              <Fragment key={event.id}>
              {startsPhase && phaseLabel && (
                <li key={`phase-${phase}`} className="replay-phase-head" data-testid={`replay-phase-head-${phase}`}>
                  {phaseLabel}
                </li>
              )}
              <li
                key={event.id}
                className={flash ? 'replay-item is-flash' : 'replay-item'}
                data-testid={flash ? 'replay-item-flash' : undefined}
              >
                <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
                <span className="replay-text">{cleanHeadline(state, event.headline)}</span>
                {label && <span className="replay-anchor">{label}</span>}
                {event.actorIsPlayer && <Tag tone="amber">YOU</Tag>}
              </li>
              </Fragment>
            )
          })}
        </ol>

        {memo && memoVisible && <BoardMemo memo={memo} />}

        <button
          type="button"
          className="ds-button is-secondary replay-skip"
          onClick={handleSkip}
          data-testid="replay-skip"
        >
          {memo && memoVisible ? 'Continue' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
