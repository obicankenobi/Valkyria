// EPILOGUE — P89 (ETAPP7_TEKNISK_SPEC.md §9/§13, DESIGN.md §17/§6.3): "En
// enda krönika ger SHADOW ... RESTRAINT ... kärnvapenepilogens utlösande
// handling ... en sida med partiets tre vändpunkter, och en historikskärm."
// Sista skärmen i §5:s arkitektur (`Front Page ──(slut)──► Epilogue ─►
// Title Screen`) — samma "helskärmsformulär", `.setup-screen`/`.setup-panel`,
// som BriefingScreen (P88) redan etablerade, inte en modal ovanpå OPERATIONS.
// Läser bara scenarioVerdict(state) — ren härledning, ingen egen state.
import { useState } from 'react'
import { scenarioVerdict, type GameState } from '@seventh-front/core'
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

  return (
    <div className="setup-screen" data-testid="epilogue-screen">
      <div className="setup-panel">
        <DsPanel
          title={`${state.house.name} — Epilogue`}
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
