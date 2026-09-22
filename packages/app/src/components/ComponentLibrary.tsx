// ComponentLibrary — designsystemets egen sida (P73, ETAPP7_TEKNISK_SPEC.md §11.3:
// "Designsystemet först... Byggs och fotograferas på en egen komponentsida innan
// någon skärm sätts ihop av dem"). Varje komponent visas i samtliga tillstånd
// (idle/pressed/selected/disabled) den har. Nås via ?screen=components (App.tsx)
// — aldrig en del av det riktiga spelflödet, bara `npm run shots` och manuell
// granskning. Ingen GameState läses här; alla värden är exempeldata (samma
// princip som referensskisserna, docs/ui/reference/README.md: "Alla värden är
// exempel").
import { useState } from 'react'
import {
  ActionSlot,
  BottomSheet,
  Button,
  Card,
  DsPanel,
  DsSlider,
  DsTab,
  DsToggle,
  FormationToken,
  IconButton,
  InfoTooltip,
  Segmented,
  Stepper,
  TierPicker,
} from './designSystem.js'
import type { Tier } from './designSystem.js'

const TIERS: Tier[] = [
  { key: 'modest', label: 'Modest', amount: '£15K', effect: '~ +5' },
  { key: 'serious', label: 'Serious', amount: '£45K', effect: '~ +15' },
  { key: 'lavish', label: 'Lavish', amount: '£90K', effect: '~ +30' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ds-library-section">
      <h2 className="ds-library-section-title">{title}</h2>
      {children}
    </div>
  )
}

export function ComponentLibrary() {
  const [sliderValue, setSliderValue] = useState(45)
  const [stepperValue, setStepperValue] = useState(3)
  const [segmentedValue, setSegmentedValue] = useState<'support' | 'relations'>('support')
  const [tierValue, setTierValue] = useState<Tier['key']>('serious')
  const [toggleOn, setToggleOn] = useState(true)
  const [toggleOff, setToggleOff] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="ds-library" data-testid="component-library">
      <h1 className="ds-library-title">Design System</h1>
      <p className="ds-library-subtitle">
        THE SEVENTH FRONT — etapp 7, P73. Var komponent i alla tillstånd den har. Facit för
        utseendet: docs/ui/reference/.
      </p>

      <Section title="Panel">
        <DsPanel title="Station file" right={<span className="ds-library-caption">right slot</span>}>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Rubrikband, hörnmarkeringar och papperskornstextur — samma ram för alla paneler
            (regel 6).
          </p>
        </DsPanel>
      </Section>

      <Section title="Button — idle / hover / pressed / selected / disabled">
        <div className="ds-library-row">
          <Button variant="primary" testId="btn-primary-idle">
            Primary
          </Button>
          <Button variant="primary" selected testId="btn-primary-selected">
            Primary · selected
          </Button>
          <Button variant="primary" disabled testId="btn-primary-disabled">
            Primary · disabled
          </Button>
        </div>
        <div className="ds-library-row">
          <Button variant="secondary" testId="btn-secondary-idle">
            Secondary
          </Button>
          <Button variant="secondary" selected testId="btn-secondary-selected">
            Secondary · selected
          </Button>
          <Button variant="secondary" disabled testId="btn-secondary-disabled">
            Secondary · disabled
          </Button>
        </div>
        <div className="ds-library-row">
          <Button variant="ghost" testId="btn-ghost-idle">
            Ghost
          </Button>
          <Button variant="ghost" selected testId="btn-ghost-selected">
            Ghost · selected
          </Button>
          <Button variant="ghost" disabled testId="btn-ghost-disabled">
            Ghost · disabled
          </Button>
        </div>
      </Section>

      <Section title="Icon button">
        <div className="ds-library-row">
          <IconButton icon="⌖" label="Operations" testId="icon-btn-idle" />
          <IconButton icon="⌖" label="Operations, selected" selected testId="icon-btn-selected" />
          <IconButton icon="⌖" label="Operations, disabled" disabled testId="icon-btn-disabled" />
        </div>
      </Section>

      <Section title="Tabs (flikrad)">
        <div className="ds-library-row" style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--line)' }}>
          {['Operations', 'Contracts', 'Company', 'Contacts', 'News'].map((label, i) => (
            <DsTab
              key={label}
              icon="⌖"
              label={label}
              active={activeTab === i}
              count={i === 1 ? 2 : undefined}
              onClick={() => setActiveTab(i)}
              testId={`tab-${i}`}
            />
          ))}
        </div>
      </Section>

      <Section title="Card (registerkort)">
        <div className="ds-library-row">
          <Card testId="card-idle">
            <span style={{ fontWeight: 700 }}>REPUBLIC OF VIETNAM</span>
            <br />
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>West-aligned · Buyer</span>
          </Card>
          <Card selected testId="card-selected">
            <span style={{ fontWeight: 700 }}>KINGDOM OF LAOS</span>
            <br />
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Selected</span>
          </Card>
          <Card onClick={() => {}} testId="card-clickable">
            <span style={{ fontWeight: 700 }}>Clickable card</span>
          </Card>
        </div>
      </Section>

      <Section title="Action slot (bottendockan)">
        <div className="ds-library-row">
          <ActionSlot icon="⌁" label="RECRUIT · LAOS" cost="£300K" onRemove={() => {}} testId="slot-filled" />
          <ActionSlot icon="✉" label="BRIBE · MINH" cost="£60K" onRemove={() => {}} testId="slot-filled-2" />
          <ActionSlot empty testId="slot-empty" />
        </div>
      </Section>

      <Section title="Bottom sheet">
        <Button variant="secondary" onClick={() => setSheetOpen(true)} testId="open-sheet">
          Open bottom sheet
        </Button>
        <BottomSheet
          open={sheetOpen}
          title="Republic of Vietnam"
          subtitle="Covert — Saigon station"
          onClose={() => setSheetOpen(false)}
          testId="bottom-sheet"
        >
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Ett tryck på greppet expanderar arket. Ett tryck utanför, eller på ×, stänger det.
          </p>
        </BottomSheet>
      </Section>

      <Section title="Slider">
        <DsSlider
          label="Spend"
          value={sliderValue}
          min={0}
          max={100}
          onChange={setSliderValue}
          format={(v) => `£${v}K`}
          testId="slider"
        />
      </Section>

      <Section title="Stepper">
        <Stepper label="Quantity" value={stepperValue} min={0} max={10} onChange={setStepperValue} testId="stepper" />
      </Section>

      <Section title="Segmented">
        <Segmented
          options={[
            { value: 'support', label: 'Public support' },
            { value: 'relations', label: 'Relations' },
          ]}
          value={segmentedValue}
          onChange={setSegmentedValue}
          testId="segmented"
        />
      </Section>

      <Section title="TierPicker (§7.3)">
        <TierPicker tiers={TIERS} value={tierValue} onChange={setTierValue} testId="tierpicker" />
      </Section>

      <Section title="Toggle">
        <div className="ds-library-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <DsToggle label="Sound" checked={toggleOn} onChange={setToggleOn} testId="toggle-on" />
          <DsToggle label="Full quarter replay" checked={toggleOff} onChange={setToggleOff} testId="toggle-off" />
        </div>
      </Section>

      <Section title="Tooltip">
        <div className="ds-library-row">
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>Board target</span>
          <InfoTooltip text="Styrelsens intäktsmål, prövat vid tur 8 och 14. Två underkända kontroller i rad ger BUYOUT." />
        </div>
      </Section>

      <Section title="Formation token (§6.4)">
        <div className="ds-library-row">
          <FormationToken side="a" doctrine="infantry" strengthDots={3} testId="token-a" />
          <FormationToken side="b" doctrine="armour" strengthDots={2} status="mauled" testId="token-b-mauled" />
          <FormationToken side="neutral" doctrine="artillery" strengthDots={1} status="refitting" testId="token-neutral" />
          <FormationToken side="a" unknown testId="token-unknown" />
        </div>
      </Section>
    </div>
  )
}
