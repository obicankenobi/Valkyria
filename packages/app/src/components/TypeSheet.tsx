// TypeSheet — P126 (ETAPP9_FORSLAG.md §5.1/§9). Typbladet: en skrivmaskinsskriven sida per konstruktion. Prestanda och
// tillförlitlighet visas som visarinstrument, den verkliga kvaliteten som en klass med osäkerhet ("B ±1"), och en stämpel
// anger läget (UNTESTED, PROVEN IN THE FIELD, UNDER REVIEW, RECALLED). Under sidan ligger konstruktionens order:
// provning i egen regi (stående order), fältprov (FIELD_TRIAL, kostar en handling) och utredningskortets tre svar.
//
// Allt som visas går genom designDisplay (core): trueQuality och latentFlaw lämnar aldrig core före avslöjandet
// (skyddsräcke 5). Order valideras med validateStandingOrderChange / validateAction — samma funktioner som
// applyActions kör — så en spärrad knapp visar orsaken i klartext.
import { useState } from 'react'
import { DESIGN_ENVIRONMENTS, designDisplay, officialId, previewAction, validateAction, validateStandingOrderChange } from '@seventh-front/core'
import type { Design, DesignEnvironment, GameState, InvestigationChoice, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { Button, Segmented } from './designSystem.js'
import { Panel, Tag, formatMoney } from './ui.js'
import { wearClass } from '../stampWear.js'
import { AMBITION_LABEL, CATEGORY_NAME, ENVIRONMENT_LABEL, FOCUS_LABEL, designStamp, openInvestigationsFor, qualityLabel } from '../designSheet.js'
import type { DesignStampKind } from '../designSheet.js'
import { standingOrderKey } from '../standingOrderBoard.js'

// Visarinstrument: en halvcirkelskala 0–100 med en tunn nål. Talet står i DOM (regel 18), aldrig bara i grafiken.
export function Dial({ value, label, testId }: { value: number; label: string; testId?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const angle = -90 + (v / 100) * 180
  const rad = (angle * Math.PI) / 180
  const nx = 50 + 34 * Math.sin(rad)
  const ny = 52 - 34 * Math.cos(rad)
  return (
    <div className="type-dial" data-testid={testId}>
      <svg viewBox="0 0 100 58" aria-hidden="true" className="type-dial-svg">
        <path d="M8 52 A42 42 0 0 1 92 52" fill="none" strokeWidth="2" className="type-dial-arc" />
        {[0, 25, 50, 75, 100].map((t) => {
          const a = ((-90 + (t / 100) * 180) * Math.PI) / 180
          return <line key={t} x1={50 + 38 * Math.sin(a)} y1={52 - 38 * Math.cos(a)} x2={50 + 46 * Math.sin(a)} y2={52 - 46 * Math.cos(a)} className="type-dial-tick" />
        })}
        <line x1="50" y1="52" x2={nx} y2={ny} className="type-dial-needle" />
        <circle cx="50" cy="52" r="3" className="type-dial-hub" />
      </svg>
      <span className="type-dial-value">{v.toFixed(0)}</span>
      <span className="type-dial-label">{label}</span>
    </div>
  )
}

const STAMP_TONE: Record<DesignStampKind, string> = {
  RECALLED: 'is-red',
  'UNDER REVIEW': 'is-amber',
  'PROVEN IN THE FIELD': 'is-green',
  UNTESTED: 'is-faint',
}

function reason(v: { ok: true } | { ok: false; reason: string }): string | null {
  return v.ok ? null : v.reason
}

function SheetOrders({
  state,
  draft,
  design,
  onAddAction,
  onSet,
}: {
  state: GameState
  draft: TurnSubmission
  design: Design
  onAddAction: (action: PlayerAction) => void
  onSet: (change: StandingOrderChange) => void
}) {
  const house = state.house
  const testing = house.standingOrders?.testing?.[design.id]
  const [environment, setEnvironment] = useState<DesignEnvironment>(testing?.environment ?? 'jungle')
  const buyers = Object.values(state.officials).filter((o) => o.post === 'procurement' && o.status === 'active')
  const [buyerId, setBuyerId] = useState<string>(buyers[0]?.factionId ?? '')
  const inquiries = openInvestigationsFor(design.id, house.investigations)

  const setTest: StandingOrderChange = { kind: 'TESTING', op: 'SET', designId: design.id, environment }
  const testValidation = validateStandingOrderChange(state, state, setTest)
  const trialAction: PlayerAction | null = buyerId
    ? { type: 'POLITICAL', op: 'FIELD_TRIAL', officialId: officialId(buyerId, 'procurement'), designId: design.id }
    : null
  const trialValidation = trialAction ? validateAction(state, state, trialAction) : null
  const trialPreview = trialAction ? previewAction(state, trialAction) : null

  return (
    <div className="type-orders" data-testid={`type-orders-${design.id}`}>
      {inquiries.map((inq) => {
        const queued = draft.standingOrders.find((c) => c.kind === 'INVESTIGATION' && c.investigationId === inq.id)
        return (
          <div className="type-inquiry" key={inq.id} data-testid={`type-inquiry-${inq.id}`}>
            <h4 className="drawing-section">INQUIRY — {ENVIRONMENT_LABEL[inq.environment]} FAULT</h4>
            <p className="cf-hint">
              {inq.status === 'denied'
                ? 'You denied the fault. It can still be fixed or redesigned — or the truth can come out.'
                : `A field report from the ${inq.frontId.toUpperCase()} front. Answer by quarter ${inq.deadlineTurn}, or silence counts as a denial.`}
            </p>
            <div className="type-inquiry-choices">
              {(['FIX', 'DENY', 'REDESIGN'] as InvestigationChoice[]).map((choice) => {
                const change: StandingOrderChange = { kind: 'INVESTIGATION', investigationId: inq.id, choice }
                const validation = validateStandingOrderChange(state, state, change)
                return (
                  <div key={choice}>
                    <Button variant={queued && queued.kind === 'INVESTIGATION' && queued.choice === choice ? 'primary' : 'secondary'} disabled={!validation.ok} onClick={() => onSet(change)} testId={`type-inquiry-${inq.id}-${choice}`}>
                      {choice === 'FIX' ? 'FIX IN THE FIELD' : choice === 'DENY' ? 'DENY' : 'REDESIGN'}
                    </Button>
                    {reason(validation) && <p className="cf-hint is-warning">{reason(validation)}</p>}
                  </div>
                )
              })}
            </div>
            {queued && <p className="cf-hint">Queued: {standingOrderKey(queued)} — answered at End Quarter.</p>}
          </div>
        )
      })}

      <h4 className="drawing-section">TESTING IN YOUR OWN SHOP</h4>
      <p className="cf-hint">
        {testing
          ? `Testing in ${ENVIRONMENT_LABEL[testing.environment]} conditions since quarter ${testing.sinceTurn} (${testing.turnsRun} run). It costs money every quarter.`
          : 'Narrows the class margin. A fault that belongs to one environment only shows when you test in that one.'}
      </p>
      <div className="cf-field">
        <Segmented
          options={DESIGN_ENVIRONMENTS.map((e) => ({ value: e, label: ENVIRONMENT_LABEL[e] }))}
          value={environment}
          onChange={setEnvironment}
          testId={`type-env-${design.id}`}
        />
      </div>
      <div className="type-order-row">
        <Button variant="primary" disabled={!testValidation.ok} onClick={() => onSet(setTest)} testId={`type-test-set-${design.id}`}>
          {testing ? 'CHANGE ENVIRONMENT' : 'START TESTING'}
        </Button>
        {testing && (
          <Button variant="secondary" onClick={() => onSet({ kind: 'TESTING', op: 'CANCEL', designId: design.id })} testId={`type-test-stop-${design.id}`}>
            STOP TESTING
          </Button>
        )}
      </div>
      {reason(testValidation) && <p className="cf-hint is-warning">{reason(testValidation)}</p>}

      {buyers.length > 0 && design.status === 'active' && (
        <>
          <h4 className="drawing-section">FIELD TRIAL WITH A BUYER</h4>
          <div className="cf-field">
            <Segmented
              options={buyers.map((o) => ({ value: o.factionId, label: o.factionId.toUpperCase() }))}
              value={buyerId}
              onChange={setBuyerId}
              testId={`type-trial-buyer-${design.id}`}
            />
          </div>
          <p className="cf-hint">
            {trialPreview?.cost != null ? `The batch costs ${formatMoney(trialPreview.cost)}. ` : ''}
            The class margin narrows, a fault may surface, the buyer favours the design next time — and every rival learns the result.
          </p>
          <Button variant="primary" disabled={!trialValidation?.ok} onClick={() => trialAction && onAddAction(trialAction)} testId={`type-trial-${design.id}`}>
            FIELD TRIAL (1 action)
          </Button>
          {trialValidation && reason(trialValidation) && <p className="cf-hint is-warning">{reason(trialValidation)}</p>}
        </>
      )}
    </div>
  )
}

export function TypeSheet({
  state,
  draft,
  design,
  onAddAction,
  onSet,
}: {
  state: GameState
  draft: TurnSubmission
  design: Design
  onAddAction: (action: PlayerAction) => void
  onSet: (change: StandingOrderChange) => void
}) {
  const [open, setOpen] = useState(false)
  const view = designDisplay(state, design)
  const stamp = designStamp(view, state.house.investigations)
  return (
    <article className="type-sheet" data-testid={`type-sheet-${design.id}`}>
      <header className="type-sheet-head">
        <span className="type-sheet-kicker">TYPE SHEET · {CATEGORY_NAME[view.category]}</span>
        <h3 className="type-sheet-name">{view.name}</h3>
        <span className={`type-stamp ${STAMP_TONE[stamp]} ${wearClass(`${design.id}-${stamp}`)}`} data-testid={`type-stamp-${design.id}`}>
          {stamp}
        </span>
      </header>
      <div className="type-dials">
        <Dial value={view.performance} label="PERFORMANCE" testId={`type-perf-${design.id}`} />
        <Dial value={view.reliability} label="RELIABILITY" testId={`type-rel-${design.id}`} />
      </div>
      <dl className="type-fields">
        <dt>Class</dt>
        <dd data-testid={`type-class-${design.id}`}>{qualityLabel(view.qualityClass)}</dd>
        <dt>Generation</dt>
        <dd>
          {view.generation} · {FOCUS_LABEL[view.focus]} · {AMBITION_LABEL[view.ambition]}
        </dd>
        <dt>Unit cost</dt>
        <dd>×{view.unitCostFactor.toFixed(2)}</dd>
        <dt>Tested in</dt>
        <dd>{view.testedIn.length > 0 ? view.testedIn.map((e) => ENVIRONMENT_LABEL[e]).join(', ') : 'nowhere yet'}</dd>
        <dt>Field record</dt>
        <dd>
          {view.fieldRecord.occasions} {view.fieldRecord.occasions === 1 ? 'occasion' : 'occasions'}
        </dd>
        <dt>Known fault</dt>
        <dd className={view.flaw ? 'is-red' : undefined} data-testid={`type-flaw-${design.id}`}>
          {view.flaw ? `${ENVIRONMENT_LABEL[view.flaw.environment]} (severity ${view.flaw.severity})` : 'none known'}
        </dd>
      </dl>
      {view.phasedOutFor.length > 0 && <Tag tone="amber">PHASED OUT FOR {view.phasedOutFor.map((b) => b.toUpperCase()).join(' & ')}</Tag>}
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} testId={`type-orders-toggle-${design.id}`}>
        {open ? 'CLOSE ORDERS' : 'ORDERS'}
      </Button>
      {open && <SheetOrders state={state} draft={draft} design={design} onAddAction={onAddAction} onSet={onSet} />}
    </article>
  )
}

export function TypeSheets({
  state,
  draft,
  onAddAction,
  onSet,
}: {
  state: GameState
  draft: TurnSubmission
  onAddAction: (action: PlayerAction) => void
  onSet: (change: StandingOrderChange) => void
}) {
  const designs = state.house.designs ?? []
  return (
    <Panel title="Type sheets" right={<Tag>{designs.length} on file</Tag>}>
      {designs.length === 0 ? (
        <p className="empty">No designs yet. Start a drawing on the drawing board above — it appears here when it is finished.</p>
      ) : (
        <div className="type-grid" data-testid="type-sheets">
          {designs.map((design) => (
            <TypeSheet key={design.id} state={state} draft={draft} design={design} onAddAction={onAddAction} onSet={onSet} />
          ))}
        </div>
      )}
    </Panel>
  )
}
