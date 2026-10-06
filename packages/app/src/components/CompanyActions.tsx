// CompanyActions — P85 (ETAPP7_TEKNISK_SPEC.md §13): INTERNAL-handlingarna
// (TAKE_LOAN/REPAY/BUILD_LINE/HIRE/REPRIORITISE_RND) och råvarupanelen
// (MARKET: BUY_FORWARD/RELEASE), regel 2-omskrivna — TheHouse.tsx:s gamla
// ExecutiveActions använde <input type="number">/<select> för alla fem.
// Skyddsräcke 3 (§12, samma disciplin som CountryFile.tsx): varje kandidat-
// handling körs genom validateAction(state, state, action) innan den
// erbjuds/köas — samma funktion applyActions.ts faktiskt avgör turen med.
//
// SCOPE-BESLUT (dokumenterat, inte tyst): POLITICAL-sektionen (BRIBE/
// STAGE_INCIDENT/BACK_CHANNEL) rörs INTE här. Två skäl, båda redan skriftliga:
// (1) P83 dokumenterade redan att den hör hemma i CONTACTS och "flyttas i
// P86" — TheHouse.tsx:s nuvarande plats är en hårdkodad genväg, inte den
// avsedda platsen att investera en ny UI i. (2) CountryFile.tsx:s egen
// SCOPE-BESLUT (P79) vägrade uttryckligen gissa ihop TierPicker-nivåer för
// just STAGE_INCIDENT/BACK_CHANNEL "utan en godkänd skiss eller ett
// balanstal att utgå från" — deras spend skalar ingen effekt alls i
// political.ts, till skillnad från INFLUENCE/TAKE_LOAN/REPAY/BUY_FORWARD/
// RELEASE nedan, vars belopp ALLA är brøkdelar av en redan känd, verklig
// gräns (creditLimit, debt, treasury, ett innehav) — inte en gissad effekt-
// skala. Samma disciplin, samma slutsats: BRIBE/STAGE_INCIDENT/BACK_CHANNEL
// väntar på P86.
import { useState } from 'react'
import {
  COMMODITIES,
  HIRABLE_ROLES,
  TECH_CATEGORIES,
  previewAction,
  validateAction,
} from '@seventh-front/core'
import { HIRE_GAIN, STAFF_ROLES, hireOutlook } from '../staffRoles.js'
import type { Commodity, GameState, HirableRole, PlayerAction, TechCategory } from '@seventh-front/core'
import { Button, Segmented, TierPicker } from './designSystem.js'
import type { Tier } from './designSystem.js'
import { Panel, formatMoney } from './ui.js'

const ROLE_LABEL: Record<HirableRole, string> = {
  chiefEngineer: 'ENGINEER',
  chiefSalesman: 'SALESMAN',
  chiefOfStaff: 'CHIEF OF STAFF',
}

const CATEGORY_LABEL: Record<TechCategory, string> = {
  infantry: 'INF',
  artillery: 'ART',
  armour: 'ARM',
  aviation: 'AVI',
  naval: 'NAV',
  electronics: 'ELE',
}

const COMMODITY_LABEL: Record<Commodity, string> = {
  oil: 'OIL',
  steel: 'STEEL',
  uranium: 'URANIUM',
  titanium: 'TITANIUM',
  rare_earths: 'RARE EARTHS',
}

// PROVISORISKA fraktioner (§7.3: "TierPicker med tre nivåer... De flesta
// spelare kommer aldrig att röra reglaget") — inga egna balanstal, bara
// brøkdelar av en redan känd gräns (creditLimit/debt/treasury/innehav), se
// filens huvudkommentar för varför det INTE är samma sak som att gissa en
// effektskala.
const TIER_FRACTIONS: Record<Tier['key'], number> = { modest: 0.25, serious: 0.5, lavish: 1 }
// Råvaruinköp låser kassa defensivt (§4.5) snarare än att spendera en given
// summa — mindre brøkdelar av treasury än lån/återbetalning, dokumenterat.
const BUY_FORWARD_TIER_FRACTIONS: Record<Tier['key'], number> = { modest: 0.1, serious: 0.2, lavish: 0.35 }

function reasonHint(validation: { ok: true } | { ok: false; reason: string }): string | null {
  return validation.ok ? null : validation.reason
}

function LoanRepaySection({ state, onFile }: { state: GameState; onFile: (action: PlayerAction) => void }) {
  const [mode, setMode] = useState<'loan' | 'repay'>('loan')
  const [tier, setTier] = useState<Tier['key']>('modest')

  const cap = mode === 'loan' ? state.house.creditLimit : Math.min(state.house.debt, state.house.treasury)
  const amount = Math.round(cap * TIER_FRACTIONS[tier])
  const action: PlayerAction =
    mode === 'loan'
      ? { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount } }
      : { type: 'INTERNAL', op: 'REPAY', payload: { amount } }
  const validation = validateAction(state, state, action)
  const tiers: Tier[] = (['modest', 'serious', 'lavish'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    amount: formatMoney(Math.round(cap * TIER_FRACTIONS[key])),
  }))

  return (
    <div className="cf-field">
      <span className="cf-field-label">CREDIT</span>
      <Segmented
        options={[
          { value: 'loan', label: 'TAKE LOAN' },
          { value: 'repay', label: 'REPAY' },
        ]}
        value={mode}
        onChange={setMode}
        testId="company-credit-mode"
      />
      <p className="cf-hint">
        {mode === 'loan'
          ? `Credit limit ${formatMoney(state.house.creditLimit)}`
          : `Owed ${formatMoney(state.house.debt)}, available cash ${formatMoney(state.house.treasury)}`}
      </p>
      <TierPicker tiers={tiers} value={tier} onChange={setTier} testId="company-credit-tier" />
      <Button
        variant="secondary"
        disabled={amount <= 0 || !validation.ok}
        onClick={() => onFile(action)}
        testId="company-credit-file"
      >
        {mode === 'loan' ? 'Take Loan' : 'Repay Debt'} — {formatMoney(amount)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

function BuildLineSection({ state, onFile }: { state: GameState; onFile: (action: PlayerAction) => void }) {
  const action: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }
  const validation = validateAction(state, state, action)
  const preview = previewAction(state, action)

  return (
    <div className="cf-field">
      <span className="cf-field-label">PRODUCTION</span>
      <p className="cf-hint">{state.house.lines.length} lines owned. A new line accepts any product, on any won contract.</p>
      <Button variant="secondary" disabled={!validation.ok} onClick={() => onFile(action)} testId="company-build-line">
        Build Production Line — {formatMoney(preview.cost ?? 0)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

// P162 (§3b): en anställning höjer rollen med HIRE_GAIN men gör ingenting förrän värdet PASSERAR tröskeln. Kortet säger tröskeln, nuläget, vad
// den här anställningen ger och vad som händer när tröskeln är passerad.
function HireOutlookCard({ role, current }: { role: HirableRole; current: number }) {
  const info = STAFF_ROLES[role]
  const o = hireOutlook(role, current)
  const status = o.activeNow
    ? 'Active now.'
    : o.activeAfter
      ? `This hire takes it past the threshold: the effect starts next quarter.`
      : `No effect yet — ${o.hiresToActivate} more hire${o.hiresToActivate === 1 ? '' : 's'} needed to pass ${o.threshold}.`
  return (
    <div className="cf-hint" data-testid="company-hire-outlook">
      <p>
        {info.label}: {o.current}/100 → {o.after} after this hire (+{HIRE_GAIN}). The effect needs more than {o.threshold}.
      </p>
      <p className={o.activeNow || o.activeAfter ? '' : 'is-warning'}>{status}</p>
      <p>Above {o.threshold}: {info.effect}</p>
    </div>
  )
}

function HireSection({ state, onFile }: { state: GameState; onFile: (action: PlayerAction) => void }) {
  const [role, setRole] = useState<HirableRole>(HIRABLE_ROLES[0]!)
  const action: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role } }
  const validation = validateAction(state, state, action)
  const preview = previewAction(state, action)

  return (
    <div className="cf-field">
      <span className="cf-field-label">STAFF</span>
      <Segmented
        options={HIRABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        value={role}
        onChange={setRole}
        testId="company-hire-role"
      />
      <HireOutlookCard role={role} current={state.house.staff[role]} />
      <Button variant="secondary" disabled={!validation.ok} onClick={() => onFile(action)} testId="company-hire-file">
        Hire — {formatMoney(preview.cost ?? 0)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

function RndSection({ state, onFile }: { state: GameState; onFile: (action: PlayerAction) => void }) {
  const [category, setCategory] = useState<TechCategory>(TECH_CATEGORIES[0]!)
  const action: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category } }
  const validation = validateAction(state, state, action)
  const preview = previewAction(state, action)

  return (
    <div className="cf-field">
      <span className="cf-field-label">R&amp;D</span>
      <Segmented
        options={TECH_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
        value={category}
        onChange={setCategory}
        testId="company-rnd-category"
      />
      <p className="cf-hint">
        Tech level {state.house.techLevel[category]}. Crash programme: half the time, double the cost, and no bids in this
        category next quarter. Costs an executive action.
      </p>
      <Button variant="secondary" disabled={!validation.ok} onClick={() => onFile(action)} testId="company-rnd-file">
        Crash R&amp;D — {formatMoney(preview.cost ?? 0)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

// Råvarupanelen (§7.1: "Råvarupanel i THE COMPANY | BUY_FORWARD, RELEASE |
// råvara") — helt ny, ingen tidigare UI kopplade in MARKET-handlingarna alls.
function CommoditySection({ state, onFile }: { state: GameState; onFile: (action: PlayerAction) => void }) {
  const [commodity, setCommodity] = useState<Commodity>(COMMODITIES[0]!)
  const [op, setOp] = useState<'BUY_FORWARD' | 'RELEASE'>('BUY_FORWARD')
  const [tier, setTier] = useState<Tier['key']>('modest')

  const holding = state.house.commodityHoldings[commodity]
  const priceIndex = state.market.commodities[commodity]
  const cap = op === 'BUY_FORWARD' ? state.house.treasury : holding
  const fractions = op === 'BUY_FORWARD' ? BUY_FORWARD_TIER_FRACTIONS : TIER_FRACTIONS
  const spend = Math.round(cap * fractions[tier])

  const action: PlayerAction = { type: 'MARKET', op, commodity, spend }
  const validation = validateAction(state, state, action)
  const tiers: Tier[] = (['modest', 'serious', 'lavish'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    amount: formatMoney(Math.round(cap * fractions[key])),
  }))

  return (
    <Panel title="Raw materials">
      <div className="cf-field">
        <span className="cf-field-label">COMMODITY</span>
        <Segmented
          options={COMMODITIES.map((c) => ({ value: c, label: COMMODITY_LABEL[c] }))}
          value={commodity}
          onChange={setCommodity}
          testId="company-commodity"
        />
        <p className="cf-hint">
          Price index {priceIndex.toFixed(0)} (100 = baseline). Held: {formatMoney(holding)}
        </p>
      </div>

      <div className="cf-field">
        <span className="cf-field-label">ACTION</span>
        <Segmented
          options={[
            { value: 'BUY_FORWARD', label: 'RESERVE' },
            { value: 'RELEASE', label: 'RELEASE' },
          ]}
          value={op}
          onChange={(v) => {
            setOp(v)
            setTier('modest')
          }}
          testId="company-commodity-op"
        />
      </div>

      <div className="cf-field">
        <span className="cf-field-label">AMOUNT</span>
        <TierPicker tiers={tiers} value={tier} onChange={setTier} testId="company-commodity-tier" />
      </div>

      <Button
        variant="secondary"
        disabled={spend <= 0 || !validation.ok}
        onClick={() => onFile(action)}
        testId="company-commodity-file"
      >
        {op === 'BUY_FORWARD' ? 'Reserve' : 'Release'} — {formatMoney(spend)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </Panel>
  )
}

// De fyra INTERNAL-formulären, ORAMADE (TheHouse.tsx äger den delade
// "Executive actions"-panelen tillsammans med POLITICAL-sektionen och den
// köade listan — se filens SCOPE-BESLUT för varför POLITICAL inte är med här).
export function InternalActionsForm({ state, onAddAction }: { state: GameState; onAddAction: (action: PlayerAction) => void }) {
  return (
    <>
      <LoanRepaySection state={state} onFile={onAddAction} />
      <BuildLineSection state={state} onFile={onAddAction} />
      <HireSection state={state} onFile={onAddAction} />
      <RndSection state={state} onFile={onAddAction} />
    </>
  )
}

// Råvarupanelen — egen Panel, egen skärmsektion (§7.1: "Råvarupanel i THE
// COMPANY | BUY_FORWARD, RELEASE | råvara").
export function RawMaterialsPanel({ state, onAddAction }: { state: GameState; onAddAction: (action: PlayerAction) => void }) {
  return <CommoditySection state={state} onFile={onAddAction} />
}
