// EPILOGUE — P89 (ETAPP7_TEKNISK_SPEC.md §9/§13, DESIGN.md §17/§6.3): "En
// enda krönika ger SHADOW ... RESTRAINT ... kärnvapenepilogens utlösande
// handling ... en sida med partiets tre vändpunkter, och en historikskärm."
// Sista skärmen i §5:s arkitektur (`Front Page ──(slut)──► Epilogue ─►
// Title Screen`) — samma "helskärmsformulär", `.setup-screen`/`.setup-panel`,
// som BriefingScreen (P88) redan etablerade, inte en modal ovanpå OPERATIONS.
// Läser bara scenarioVerdict(state) — ren härledning, ingen egen state.
import { useState } from 'react'
import { HISTORY_AFTERWORD, HISTORY_EVENTS, scenarioVerdict, type GameState } from '@seventh-front/core'
import { historyDateLabel, quarterLabelOfTurn } from '../historyText.js'
import { formatMoney } from './ui.js'
import { wearClass } from '../stampWear.js'
import { Button, BottomSheet, DsPanel } from './designSystem.js'

export const ENDING_LABEL: Record<string, string> = {
  INSOLVENCY: 'Insolvent — the house is liquidated',
  BUYOUT: 'Bought out — the board target was missed',
  EXPOSURE: 'Exposed — licence revoked',
  NUCLEAR_EXCHANGE: 'Nuclear exchange',
  SCENARIO_COMPLETE: 'Scenario complete',
}

export function EpilogueScreen({ state, onTitleScreen }: { state: GameState; onTitleScreen: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const verdict = scenarioVerdict(state)
  const ending = verdict.ending
  // P149: tidslinjen — partiets krönika bredvid historiens, kvartal för kvartal. Bara det som faktiskt inträffade (GameState.history) och husets egna krönikeposter.
  const timeline = buildTimeline(state)

  return (
    <div className="setup-screen" data-testid="epilogue-screen">
      <div className="setup-panel">
        <DsPanel
          title={`${state.house.name} — Epilogue`}
          info="How your game ended: the ending, the four axes your house was judged on and the turning points."
          right={
            <span className={`order-stamp is-urgent ${wearClass('epilogue-closed')}`} data-testid="epilogue-stamp">
              CLOSED
            </span>
          }
        >
          {/* "Slutkort per slutorsak" — ending kan bara vara null om skärmen
              nås innan status.kind faktiskt är 'ended' (bör inte hända, App.tsx
              öppnar den bara från den bannern), men en ärlig fallback är
              billigare än att anta. */}
          {ending ? (
            <div className="cf-preview" data-testid="epilogue-ending">
              <div className="cf-preview-row">
                <span>{ENDING_LABEL[ending.code] ?? ending.code}</span>
                <span className="is-amber">Turn {ending.turn}</span>
              </div>
            </div>
          ) : (
            <p className="cf-hint">The scenario has not ended yet.</p>
          )}

          <div className="cf-field">
            <span className="cf-field-label">THE FOUR AXES</span>
            <div className="cf-preview" data-testid="epilogue-axes">
              <div className="cf-preview-row">
                <span>CAPITAL</span>
                <span className="is-amber">{formatMoney(verdict.capital)}</span>
              </div>
              <div className="cf-preview-row">
                <span>REACH</span>
                <span>
                  {verdict.reach.buyers} buyer{verdict.reach.buyers === 1 ? '' : 's'} · {verdict.reach.continents}{' '}
                  continent{verdict.reach.continents === 1 ? '' : 's'}
                </span>
              </div>
              <div className="cf-preview-row">
                <span>SHADOW</span>
                <span>{verdict.shadow} deed{verdict.shadow === 1 ? '' : 's'} on the record</span>
              </div>
              <div className="cf-preview-row">
                <span>RESTRAINT</span>
                <span>Doomsday peaked at {verdict.restraint.toFixed(0)}%</span>
              </div>
              {verdict.civilSharePct > 0 && (
                <div className="cf-preview-row" data-testid="epilogue-civil">
                  <span>PEACETIME TRADE</span>
                  <span>{verdict.civilSharePct.toFixed(0)}% of the house&apos;s income came from civil lines</span>
                </div>
              )}
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-field-label">TURNING POINTS</span>
            {verdict.turningPoints.length === 0 ? (
              <p className="cf-hint">No turning points recorded.</p>
            ) : (
              <ul className="replay-list" data-testid="epilogue-turning-points">
                {verdict.turningPoints.map((entry, i) => (
                  <li key={i} className="replay-item">
                    <span className="replay-anchor">TURN {entry.turn}</span>
                    <span className="replay-text">{entry.headline}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Kärnvapenepilog — bara satt av scenarioVerdict när ending.code
              === 'NUCLEAR_EXCHANGE' (se scenarioVerdict.ts). */}
          {verdict.nuclearEpilogue && (
            <div className="cf-field" data-testid="epilogue-nuclear">
              <span className="cf-field-label">OBITUARY</span>
              <p className="cf-hint is-warning">{verdict.nuclearEpilogue.obituary}</p>
              {verdict.nuclearEpilogue.frontNames.length > 0 && (
                <p className="cf-hint">Fronts at the end: {verdict.nuclearEpilogue.frontNames.join(', ')}.</p>
              )}
              {verdict.nuclearEpilogue.deliveriesLastTwelveTurns.length > 0 && (
                <ul className="replay-list">
                  {verdict.nuclearEpilogue.deliveriesLastTwelveTurns.map((headline, i) => (
                    <li key={i} className="replay-item">
                      <span className="replay-text">{headline}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* P149 (ETAPP10 §9.6): efterordet — det som hände under partiet och det som kom efter. Texten säger det rakt ut. */}
          <div className="cf-field" data-testid="epilogue-afterword">
            <span className="cf-field-label">AFTERWORD</span>
            <ul className="prologue-list">
              {HISTORY_AFTERWORD.map((page) => (
                <li key={page.id} className="prologue-item" data-testid={`afterword-${page.id}`}>
                  <span className="prologue-date">{historyDateLabel(page.date)}</span>
                  <span className="prologue-headline">{page.headline}</span>
                  <span className="prologue-body">{page.body}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="setup-actions">
            <Button variant="ghost" onClick={() => setHistoryOpen(true)} testId="epilogue-history-button">
              FULL CHRONICLE
            </Button>
            <Button variant="primary" onClick={onTitleScreen} testId="epilogue-title-button">
              TITLE SCREEN
            </Button>
          </div>
        </DsPanel>
      </div>

      <BottomSheet
        open={historyOpen}
        title="Chronicle"
        subtitle={`${state.chronicle.length} entr${state.chronicle.length === 1 ? 'y' : 'ies'}`}
        onClose={() => setHistoryOpen(false)}
        testId="epilogue-history-sheet"
      >
        {timeline.length > 0 && (
          <div data-testid="epilogue-timeline">
            <span className="cf-field-label">TIMELINE — THE HOUSE BESIDE HISTORY</span>
            <ul className="replay-list">
              {timeline.map((row) => (
                <li key={row.quarter} className="replay-item" data-testid={`timeline-${row.quarter}`}>
                  <span className="replay-anchor">{row.quarter}</span>
                  <span className="replay-text">
                    {row.history.map((h) => `${historyDateLabel(h.date)}: ${h.headline}`).join(' · ')}
                    {row.house.length > 0 && ` — YOU: ${row.house.join(' · ')}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {state.chronicle.length === 0 ? (
          <p className="cf-hint">Nothing notable happened.</p>
        ) : (
          <ul className="replay-list">
            {state.chronicle.map((entry, i) => (
              <li key={i} className={entry.actorIsPlayer ? 'replay-item is-flash' : 'replay-item'}>
                <span className="replay-anchor">TURN {entry.turn}</span>
                <span className="replay-text">{entry.headline}</span>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </div>
  )
}


interface TimelineRow {
  quarter: string
  history: { date: string; headline: string }[]
  house: string[]
}

// Historiens händelser (de som inträffade) och husets egna krönikeposter, grupperade per kvartal i tidsordning. Ren; exporteras för test.
export function buildTimeline(state: Pick<GameState, 'history' | 'chronicle'>): TimelineRow[] {
  const rows = new Map<string, TimelineRow>()
  const row = (quarter: string): TimelineRow => {
    const existing = rows.get(quarter)
    if (existing) return existing
    const created: TimelineRow = { quarter, history: [], house: [] }
    rows.set(quarter, created)
    return created
  }
  for (const event of HISTORY_EVENTS) {
    if (event.kind !== 'frontPage' || !state.history?.occurred[event.id]) continue
    row(event.quarter!.replace('-', ' ')).history.push({ date: event.date, headline: event.headline })
  }
  for (const entry of state.chronicle) {
    if (!entry.actorIsPlayer) continue
    row(quarterLabelOfTurn(entry.turn)).house.push(entry.headline)
  }
  return [...rows.values()].sort((a, b) => a.quarter.localeCompare(b.quarter))
}
