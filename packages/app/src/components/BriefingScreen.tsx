// BRIEFING — P88 (ETAPP7_TEKNISK_SPEC.md §9/§13): "Läget 1964, styrelsens
// mål, en karta med teatern markerad. Stämplad som CLASSIFIED." Sista
// skärmen innan OPERATIONS (§5:s skärmarkitektur: "New Game ─► Briefing ─►
// OPERATIONS"). Kartan är EXAKT TheatreMap — samma komponent OPERATIONS
// självt visar, bara utan land-klick inkopplat (onSelectCountry utelämnad,
// redan säkert no-op, se TheatreMap.tsx) — "en karta", inte en egen,
// förenklad kopia.
import { formatMoney } from './ui.js'
import { wearClass } from '../stampWear.js'
import { Button, DsPanel } from './designSystem.js'
import { TheatreMap } from './TheatreMap.js'
import type { GameState } from '@seventh-front/core'

const HOME_STATE_LABEL: Record<GameState['house']['homeState'], string> = {
  neutral: 'a neutral house',
  west: 'a Western-aligned house',
  east: 'an Eastern-aligned house',
}

export function BriefingScreen({ state, onBegin, onBack }: { state: GameState; onBegin: () => void; onBack: () => void }) {
  const house = state.house
  const target = house.boardTarget

  return (
    <div className="setup-screen" data-testid="briefing-screen">
      <div className="setup-panel">
        <DsPanel
          title={`${house.name} — Briefing`}
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
