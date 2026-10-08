// BRIEFING — P88 (ETAPP7_TEKNISK_SPEC.md §9/§13): "Läget 1964, styrelsens
// mål, en karta med teatern markerad. Stämplad som CLASSIFIED." Sista
// skärmen innan OPERATIONS (§5:s skärmarkitektur: "New Game ─► Briefing ─►
// OPERATIONS"). Kartan är EXAKT TheatreMap — samma komponent OPERATIONS
// självt visar, bara utan land-klick inkopplat (onSelectCountry utelämnad,
// redan säkert no-op, se TheatreMap.tsx) — "en karta", inte en egen,
// förenklad kopia.
import { useState } from 'react'
import { formatMoney } from './ui.js'
import { wearClass } from '../stampWear.js'
import { Button, DsPanel } from './designSystem.js'
import { TheatreMap } from './TheatreMap.js'
import { HISTORY_PROLOGUE } from '@seventh-front/core'
import { historyDateLabel } from '../historyText.js'
import type { GameState } from '@seventh-front/core'

const HOME_STATE_LABEL: Record<GameState['house']['homeState'], string> = {
  neutral: 'a neutral house',
  west: 'a Western-aligned house',
  east: 'an Eastern-aligned house',
}

export function BriefingScreen({ state, onBegin, onBack }: { state: GameState; onBegin: () => void; onBack: () => void }) {
  const house = state.house
  const target = house.boardTarget
  // P149: prologen ligger bakom en knapp (regel 7: det som inte är ett par rader hör hemma bakom "More") så att BEGIN OPERATIONS syns utan att bläddra.
  const [prologueOpen, setPrologueOpen] = useState(false)

  return (
    <div className="setup-screen" data-testid="briefing-screen">
      <div className="setup-panel">
        <DsPanel
          title={`${house.name} — Briefing`}
          info="Your situation before the first quarter: what the board expects, and the map you will play on." infoTopic="board"
          right={
            <span className={`order-stamp is-urgent ${wearClass('briefing-classified')}`} data-testid="briefing-classified">
              CLASSIFIED
            </span>
          }
        >
          <p className="cf-hint">
            {state.meta.year} · Q{state.meta.quarter}. You are {HOME_STATE_LABEL[house.homeState]}, specialised in{' '}
            {house.specialisation}.
          </p>

          <div className="cf-preview" data-testid="briefing-target">
            <div className="cf-preview-row">
              <span>BOARD TARGET</span>
              <span>{target.label}</span>
            </div>
            <div className="cf-preview-row">
              <span>DUE</span>
              <span>Turn {target.dueTurn}</span>
            </div>
            <div className="cf-preview-row">
              <span>TREASURY</span>
              <span className="is-amber">{formatMoney(house.treasury)}</span>
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-field-label">THEATRE</span>
            <div className="briefing-map">
              <TheatreMap state={state} />
            </div>
          </div>

          {/* P149 (ETAPP10 §9.6): prologen — fem förstasidor som ger läget när huset öppnar. */}
          <div className="cf-field" data-testid="briefing-prologue">
            <Button variant="secondary" onClick={() => setPrologueOpen((o) => !o)} testId="briefing-prologue-toggle">
              {prologueOpen ? 'HIDE THE WORLD SO FAR' : 'THE WORLD SO FAR — 5 FRONT PAGES'}
            </Button>
            {prologueOpen && (
              <ul className="prologue-list">
                {HISTORY_PROLOGUE.map((page) => (
                  <li key={page.id} className="prologue-item" data-testid={`prologue-${page.id}`}>
                    <span className="prologue-date">{historyDateLabel(page.date)}</span>
                    <span className="prologue-headline">{page.headline}</span>
                    <span className="prologue-body">{page.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="setup-actions">
            <Button variant="ghost" onClick={onBack} testId="briefing-back">
              BACK
            </Button>
            <Button variant="primary" onClick={onBegin} testId="briefing-begin">
              BEGIN OPERATIONS
            </Button>
          </div>
        </DsPanel>
      </div>
    </div>
  )
}
