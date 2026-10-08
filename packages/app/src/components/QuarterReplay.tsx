// QuarterReplay — kvartalsuppspelningen (P80, ETAPP7_TEKNISK_SPEC.md §8):
// "Varje WireEvent får ett ankare... Standardläge: bara rubrikhändelser, i
// hög takt. Full uppspelning av alla händelser är ett val i
// inställningarna... Hoppa över med en knapp. Omedelbar vid
// prefers-reduced-motion." Körs som ett fullskärmsöverlager mellan End
// Quarter och NEWS DESK (App.tsx:s handleEndTurn).
//
// SCOPE-BESLUT, dokumenterat: "ett val i inställningarna" förutsätter en
// inställningsskärm som inte finns än (P90, obyggd) — samma lucka P72 redan
// löste för mute-togglen genom att lägga den där den faktiskt gick att nå
// (MainMenu.tsx). Här: samma mönster, togglen bor i själva
// uppspelningsöverlaget (synlig varje kvartal, inte gömd bakom en skärm som
// inte finns), sparad med samma nyckel-i-IndexedDB-teknik som mute
// (persistence.ts, P72).
//
// "Leveranser längs linjer, strider som blixtar i sektorer, frontlinjen som
// flyttar sig" (§8, ordagrant) beskriver en fullt animerad uppspelning ovanpå
// TeaterMap — utanför P80:s mandat (TheatreMap visar bara NULÄGET, ingen
// mekanik för att rita en HISTORISK händelse på kartan finns, och att bygga
// den är en betydligt större insats än denna prompt). Löst i stället med en
// läsbar, textbaserad sekvens: rubrik + var (`wireAnchor`/`anchorLabel`, P80s
// egen leverans) + vem (spelarmarkering) — samma information, utan att
// uppfinna en kartanimationsmotor P82+ inte bett om.
import { useEffect, useState } from 'react'
import type { BoardMemo as BoardMemoData, GameState, WireEvent } from '@seventh-front/core'
import { anchorLabel, wireAnchor } from '../wireAnchor.js'
import { historyFrontPage, isFlashEvent } from '../newsClassification.js'
import { FrontPageCard } from './FrontPageCard.js'
import { BoardMemo } from './BoardMemo.js'
import { DsToggle } from './designSystem.js'
import { Tag } from './ui.js'

export const REPLAY_INTERVAL_MS = 700

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function QuarterReplay({
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
  // P97 (ETAPP8_FORSLAG.md §3.2): styrelsens PM vid en granskningstur. Ett PM stänger
  // ALDRIG uppspelningen av sig självt och överlever både prefers-reduced-motion och ett
  // tyst kvartal — det ska visas vid varje granskningstur, så spelaren kvitterar det med
  // "Continue" i stället för att det försvinner med tidsgränsen.
  memo?: BoardMemoData | null
  // P158: händelsen som visas just nu (null när uppspelningen är slut eller inget visas) — kartan ritar en ring där den hör hemma.
  onFocus?: (event: WireEvent | null) => void
  onDone: () => void
}) {
  const events = fullReplay ? wire : wire.filter((e) => e.severity === 'headline')
  // P149: kvartalets förstasida ur historien (om den inträffade) visas som en tidningssida överst i uppspelningen.
  const frontPage = wire.map(historyFrontPage).find((e) => e !== null) ?? null
  const reduced = prefersReducedMotion()
  const hasMemo = memo !== null
  const nothingToAnimate = reduced || events.length === 0
  const [shown, setShown] = useState(0)
  const [memoVisible, setMemoVisible] = useState(hasMemo && nothingToAnimate)

  // "Omedelbar vid prefers-reduced-motion" (§8, ordagrant) — inget att titta
  // igenom, inget att vänta på. Samma princip för ett kvartal utan
  // rubrikhändelser alls (t.ex. ett tyst kvartal utan strid eller leverans).
  // Med ett PM avslutas inget: överlagret visas med PM:et i stället.
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
        setMemoVisible(true) // listan är slut: PM:et kommer fram och stannar tills spelaren kvitterar
        return
      }
      const timer = setTimeout(onDone, REPLAY_INTERVAL_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setShown((n) => n + 1), REPLAY_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [shown])

  if (nothingToAnimate && !hasMemo) return null

  // Reducerad rörelse (eller ett tyst kvartal): hela listan direkt, ingen sekvens.
  const visible = nothingToAnimate ? events : events.slice(0, shown)

  function handleSkip() {
    // Skip hoppar först till PM:et (om det finns och inte syns än), stänger sedan.
    if (hasMemo && !memoVisible) {
      setShown(events.length)
      setMemoVisible(true)
      return
    }
    onDone()
  }

  return (
    <div className={memo && memoVisible ? 'modal-overlay' : 'modal-overlay is-map-replay'} data-testid="quarter-replay">
      <div className="modal-panel replay-panel">
        <div className="replay-head">
          <h2 className="view-title">Quarter Replay</h2>
          <DsToggle
            label="Full playback"
            checked={fullReplay}
            onChange={onToggleFullReplay}
            testId="replay-full-toggle"
          />
        </div>
        {frontPage && <FrontPageCard event={frontPage} testId="replay-front-page" />}
        <ol className="replay-list" data-testid="replay-list" tabIndex={0} aria-label="Quarter events">
          {visible.map((event) => {
            const anchor = wireAnchor(state, event)
            const label = anchorLabel(state, anchor)
            // P81d (§13, P81-blockquoten): "ett helskärmstelex för de fåtal
            // händelsetyper som ändrar läget" — samma stämplade register som
            // TheWire.tsx:s .is-flash-rader, inte en ny helskärmsmekanism
            // (overlayet ÄR redan fullskärm; blixt-händelser tar bara mer
            // visuell plats i samma lista, se newsClassification.ts).
            const flash = isFlashEvent(event)
            return (
              <li key={event.id} className={flash ? 'replay-item is-flash' : 'replay-item'} data-testid={flash ? 'replay-item-flash' : undefined}>
                <span className={`wire-glyph is-${event.severity}`} aria-hidden="true" />
                <span className="replay-text">{event.headline}</span>
                {label && <span className="replay-anchor">{label}</span>}
                {event.actorIsPlayer && <Tag tone="amber">YOU</Tag>}
              </li>
            )
          })}
        </ol>
        {memo && memoVisible && <BoardMemo memo={memo} />}
        <button type="button" className="ds-button is-secondary replay-skip" onClick={handleSkip} data-testid="replay-skip">
          {memo && memoVisible ? 'Continue' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
