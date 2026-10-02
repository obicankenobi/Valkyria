// PaperTrail — P128 (ETAPP9_FORSLAG.md §8.3, §8.4, §9). Utredningskortet, uppbyggt som kriskortet: ett pappersspår har kommit fram och huset har
// tre dåliga vägar — FÖRNEKA (ingen kostnad nu, risk att det blir större), OFFRA NÅGON (en direktör avskedas, en personalroll sjunker) eller
// FÖRLIKAS (du betalar, och det syns i huvudboken). Varje väg markerar med prickar vilka mätare den rör, aldrig ett tal. Panelen visar också
// husets rena rykte (probity), pågående avstängningar och juridisk rådgivning (en stående order som sänker chansen att spår kommer fram).
//
// Allt valideras av validateStandingOrderChange (samma regler som applyActions). Spåren som ännu inte kommit fram visas bara som ett antal —
// husets egna handlingar är kända för huset, men inte vilka som kommer att komma fram och när (skyddsräcke 5).
import { useState } from 'react'
import { validateStandingOrderChange } from '@seventh-front/core'
import type { GameState, PaperTrace, StandingOrderChange, TraceChoice, TurnSubmission } from '@seventh-front/core'
import { Button, DsToggle, Segmented } from './designSystem.js'
import { DecisionDots } from './DecisionDots.js'
import type { DecisionGauge } from './DecisionDots.js'
import { Meter, Panel, Tag } from './ui.js'
import { standingOrderKey } from '../standingOrderBoard.js'

const KIND_TEXT: Record<PaperTrace['kind'], string> = {
  writeSpec: 'shaping the requirements',
  handbuilt: 'a hand-built test article',
  bribeBoard: 'payments to the test board',
  falsify: 'a forged test protocol',
  bidBribe: 'a bribe in a bid',
  bribe: 'a payment to an official',
  broker: 'a brokered deal',
  favour: 'a favour called in',
  legal: 'advice on the files',
}

const SEVERITY_TEXT = ['MINOR', 'SERIOUS', 'GRAVE'] as const

const CHOICE_GAUGES: Record<TraceChoice, readonly DecisionGauge[]> = {
  DENY: ['reputation'],
  SACRIFICE: ['time', 'reputation'],
  SETTLE: ['cash'],
}

const ROLES = [
  { value: 'chiefEngineer' as const, label: 'ENGINEER' },
  { value: 'chiefSalesman' as const, label: 'SALESMAN' },
  { value: 'chiefOfStaff' as const, label: 'STAFF' },
]

function InquiryCard({
  state,
  trace,
  queued,
  onSet,
}: {
  state: GameState
  trace: PaperTrace
  queued: StandingOrderChange | undefined
  onSet: (change: StandingOrderChange) => void
}) {
  const [role, setRole] = useState<'chiefEngineer' | 'chiefSalesman' | 'chiefOfStaff'>('chiefSalesman')
  const buyer = trace.buyerId ? (state.factions[trace.buyerId]?.name ?? trace.buyerId) : 'a ministry'
  const left = (trace.deadlineTurn ?? state.meta.turn) - state.meta.turn
  const change = (choice: TraceChoice): StandingOrderChange =>
    choice === 'SACRIFICE' ? { kind: 'TRACE', op: 'RESPOND', traceId: trace.id, choice, role } : { kind: 'TRACE', op: 'RESPOND', traceId: trace.id, choice }
  const labels: Record<TraceChoice, string> = { DENY: 'DENY IT', SACRIFICE: 'SACRIFICE A DIRECTOR', SETTLE: 'SETTLE QUIETLY' }
  const hints: Record<TraceChoice, string> = {
    DENY: 'Nothing to pay now — but it can grow if the truth comes out.',
    SACRIFICE: 'A director is dismissed and a staff role falls. The matter is smaller afterwards.',
    SETTLE: 'You pay, and it shows in the ledger. The matter is smaller afterwards.',
  }
  return (
    <div className="inquiry-card" data-testid={`inquiry-${trace.id}`}>
      <div className="inquiry-head">
        <span className="type-sheet-kicker">INQUIRY · {buyer.toUpperCase()}</span>
        <Tag tone="red">{SEVERITY_TEXT[trace.severity - 1]}</Tag>
      </div>
      <p className="inquiry-text">
        The file on {KIND_TEXT[trace.kind]} has come to light.{' '}
        {left > 0 ? `Answer within ${left} quarter${left === 1 ? '' : 's'}` : 'Answer now'} — silence counts as a denial.
      </p>
      {(['DENY', 'SACRIFICE', 'SETTLE'] as TraceChoice[]).map((choice) => {
        const v = validateStandingOrderChange(state, state, change(choice))
        const isQueued = queued !== undefined && queued.kind === 'TRACE' && queued.choice === choice
        return (
          <div className="inquiry-choice" key={choice}>
            {choice === 'SACRIFICE' && (
              <Segmented options={ROLES} value={role} onChange={setRole} testId={`inquiry-role-${trace.id}`} />
            )}
            <Button variant={isQueued ? 'primary' : 'secondary'} disabled={!v.ok} onClick={() => onSet(change(choice))} testId={`inquiry-${choice}-${trace.id}`}>
              {labels[choice]}
            </Button>
            <p className="cf-hint">{hints[choice]}</p>
            <DecisionDots gauges={CHOICE_GAUGES[choice]} testId={`inquiry-dots-${choice}-${trace.id}`} />
            {!v.ok && <p className="cf-hint is-warning">{v.reason}</p>}
          </div>
        )
      })}
      {queued && <p className="cf-hint">Queued: {queued.kind === 'TRACE' ? queued.choice : ''} — answered at End Quarter.</p>}
    </div>
  )
}

export function PaperTrail({
  state,
  draft,
  onSet,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
}) {
  const house = state.house
  const traces = (state.traces ?? []).filter((t) => t.houseId === 'player')
  const cards = traces.filter((t) => t.status === 'surfaced' && t.choice === undefined)
  const denied = traces.filter((t) => t.status === 'surfaced' && t.choice === 'DENY')
  const open = traces.filter((t) => t.status === 'open').length
  const suspensions = Object.entries(house.suspendedFrom ?? {}).filter(([, until]) => until > state.meta.turn)
  const legal = house.standingOrders?.legal
  const queuedLegal = draft.standingOrders.find((c) => c.kind === 'LEGAL')
  const legalChange: StandingOrderChange = { kind: 'LEGAL', op: legal ? 'CANCEL' : 'SET' }
  const legalValid = validateStandingOrderChange(state, state, legalChange)
  const legalOn = queuedLegal && queuedLegal.kind === 'LEGAL' ? queuedLegal.op === 'SET' : legal !== undefined

  return (
    <Panel
      title="Paper trail"
      right={cards.length > 0 ? <Tag tone="red">{cards.length} inquiry awaiting an answer</Tag> : <Tag>{open} files on record</Tag>}
    >
      <div className="paper-trail" data-testid="paper-trail">
        <Meter label="Probity (a clean name)" value={house.reputation.integrity} display={house.reputation.integrity.toFixed(0)} tone={house.reputation.integrity < 40 ? 'red' : 'green'} />
        {suspensions.map(([buyerId, until]) => (
          <p className="cf-hint is-warning" key={buyerId} data-testid={`suspension-${buyerId}`}>
            Suspended from tendering to {state.factions[buyerId]?.name ?? buyerId} until quarter {until}.
          </p>
        ))}
        {cards.map((trace) => (
          <InquiryCard
            key={trace.id}
            state={state}
            trace={trace}
            queued={draft.standingOrders.find((c) => c.kind === 'TRACE' && c.traceId === trace.id)}
            onSet={onSet}
          />
        ))}
        {denied.length > 0 && (
          <p className="cf-hint" data-testid="paper-trail-denied">
            {denied.length} denied {denied.length === 1 ? 'matter' : 'matters'} could still be exposed.
          </p>
        )}
        <div className="inquiry-legal">
          <DsToggle
            label="Legal counsel retained"
            checked={legalOn}
            onChange={() => onSet(legalChange)}
            testId="legal-toggle"
          />
          <p className="cf-hint">
            Lowers the chance that a file comes to light — and leaves a small file of its own. Costs money every quarter, from next quarter. Key: {standingOrderKey(legalChange)}.
          </p>
          <DecisionDots gauges={['cash', 'reputation']} />
          {!legalValid.ok && <p className="cf-hint is-warning">{legalValid.reason}</p>}
        </div>
      </div>
    </Panel>
  )
}
