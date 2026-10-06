// NEW GAME — P88 (ETAPP7_TEKNISK_SPEC.md §9/§13): "Husets namn,
// specialisering och hemstat enligt DESIGN.md §3." Tre val, alla optional i
// createInitialState (P88s klart-när: standardvalen ger bitvis identisk
// golden — se packages/core/src/state.ts:s StartChoices). Namn väljs ur en
// handhållen lista med förslag ("förslag genereras", DESIGN.md §3) i stället
// för ett fritextfält — regel 2:s anda (aldrig en webbläsarkontroll) gäller
// även ett namn spelaren annars skulle skrivit i ett `<input type="text">`.
// founding_capital är INTE ett val (DESIGN.md §3: en fast £4 000 000).
import { useState } from 'react'
import type { House, StartChoices, TechCategory } from '@seventh-front/core'
import { Button, Card, DsPanel, Segmented } from './designSystem.js'

const HOUSE_NAME_SUGGESTIONS = [
  'Meridian Arms',
  'Halcyon Ordnance',
  'Vantage Defence',
  'Concordat Systems',
  'Northwind Armaments',
  'Ashford & Vale',
]

const HOME_STATE_OPTIONS: { value: House['homeState']; label: string }[] = [
  { value: 'neutral', label: 'NEUTRAL' },
  { value: 'west', label: 'WEST' },
  { value: 'east', label: 'EAST' },
]

// P162 (ETAPP10 §3b): infantry är den sjätte specialiseringen (DESIGN.md §3 sade fem val; ägaren speltestade 2026-10-06 och saknade den).
// Samma korta koder som
// CompanyActions.tsx:s CATEGORY_LABEL (R&D-panelen) — fem ord i en
// Segmented rad klipps annars av på telefonbredd (regel 18), upptäckt i
// npm run shots.
const SPECIALISATION_OPTIONS: { value: TechCategory; label: string }[] = [
  { value: 'artillery', label: 'ART' },
  { value: 'armour', label: 'ARM' },
  { value: 'aviation', label: 'AVI' },
  { value: 'naval', label: 'NAV' },
  { value: 'electronics', label: 'ELE' },
  { value: 'infantry', label: 'INF' },
]

export function NewGameScreen({
  onSubmit,
  onBack,
}: {
  onSubmit: (choices: StartChoices) => void
  onBack: () => void
}) {
  const [houseName, setHouseName] = useState(HOUSE_NAME_SUGGESTIONS[0]!)
  const [homeState, setHomeState] = useState<House['homeState']>('neutral')
  const [specialisation, setSpecialisation] = useState<TechCategory>('artillery')

  return (
    <div className="setup-screen" data-testid="new-game-screen">
      <div className="setup-panel">
        <DsPanel title="Found Your House">
          <p className="cf-hint">1964. Four production lines, one station, a founding capital of £4,000,000.</p>

          <div className="cf-field">
            <span className="cf-field-label">HOUSE NAME</span>
            <div className="cf-target-list">
              {HOUSE_NAME_SUGGESTIONS.map((name) => (
                <Card key={name} selected={name === houseName} onClick={() => setHouseName(name)} testId={`newgame-name-${name}`}>
                  {name}
                </Card>
              ))}
            </div>
          </div>

          <div className="cf-field">
            <span className="cf-field-label">HOME STATE</span>
            <Segmented options={HOME_STATE_OPTIONS} value={homeState} onChange={setHomeState} testId="newgame-homestate" />
            <p className="cf-hint">Sets which bloc's export licences and suspicion apply to you, and your starting credit line.</p>
          </div>

          <div className="cf-field">
            <span className="cf-field-label">SPECIALISATION</span>
            <Segmented
              options={SPECIALISATION_OPTIONS}
              value={specialisation}
              onChange={setSpecialisation}
              testId="newgame-specialisation"
            />
            <p className="cf-hint">A head start in this field's R&amp;D.</p>
          </div>

          <div className="setup-actions">
            <Button variant="ghost" onClick={onBack} testId="newgame-back">
              BACK
            </Button>
            <Button variant="primary" onClick={() => onSubmit({ houseName, homeState, specialisation })} testId="newgame-submit">
              FOUND THE HOUSE
            </Button>
          </div>
        </DsPanel>
      </div>
    </div>
  )
}
