// ProgrammeFolder — P128 (ETAPP9_FORSLAG.md §8.1, §8.2, §9). Upphandlingsmappen på CONTRACTS: en manillamapp per utvecklingsupphandling med
// kravbladet (stämplat och daterat), en tidslinje för faserna, konkurrenterna med underrättelsens prickar, knepen som registerkort (varje kort
// markerar med prickar vilka mätare det rör, aldrig ett tal) och — när provet är gjort — utvärderingsprotokollet, skrivet på skrivmaskin med en rad
// per krav och ett underkänt ska-krav överstruket med rött.
//
// Allt går genom core: anmälan/prototyp/utträde/anmälan av en rival är stående order (ingen handling, validateStandingOrderChange), knepen är
// PROCUREMENT-handlingar (en handling var, validateAction), protokollet är programmeProtocol (bara för deltagare, först när provet är gjort).
// Vad en rival kommit fram till visas bara med underrättelse i köparens land (effectiveDepth); utan den visas "?".
import { useState } from 'react'
import { effectiveDepth, programmeBloc, programmeEligible, programmeProtocol, validateAction, validateStandingOrderChange } from '@seventh-front/core'
import type { GameState, PlayerAction, Programme, ProgrammePhase, RequirementKind, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { Button, DsToggle, Segmented } from './designSystem.js'
import { DecisionDots } from './DecisionDots.js'
import type { DecisionGauge } from './DecisionDots.js'
import { Panel, Tag } from './ui.js'
import { CATEGORY_NAME } from '../designSheet.js'
import { wearClass } from '../stampWear.js'

const PHASES: readonly ProgrammePhase[] = ['announced', 'specLocked', 'development', 'trial', 'awarded']
const PHASE_LABEL: Record<ProgrammePhase, string> = {
  announced: 'CALL FOR TENDERS',
  specLocked: 'REQUIREMENTS LOCKED',
  development: 'DEVELOPMENT',
  trial: 'COMPARATIVE TRIAL',
  awarded: 'AWARDED',
  cancelled: 'CANCELLED',
}
const KIND_LABEL: Record<RequirementKind, string> = {
  performance: 'PERFORMANCE',
  reliability: 'RELIABILITY',
  unitCost: 'UNIT COST',
  delivery: 'DELIVERY',
}

// "Q2 1965" för en given tur, räknat bakåt från innevarande tur (state.meta har bara det aktuella datumet).
export function turnDateLabel(state: GameState, turn: number): string {
  const index = state.meta.year * 4 + (state.meta.quarter - 1) - (state.meta.turn - turn)
  return `Q${(((index % 4) + 4) % 4) + 1} ${Math.floor(index / 4)}`
}

function requirementText(kind: RequirementKind, threshold: number): string {
  if (kind === 'unitCost') return `≤ ×${threshold.toFixed(2)}`
  if (kind === 'delivery') return `≤ ${threshold} quarters`
  return `≥ ${threshold.toFixed(0)}`
}

function houseLabel(state: GameState, id: string): string {
  return id === 'player' ? state.house.name : (state.rivals[id]?.name ?? id)
}

// Vilka mätare ett knep rör (prickar, inga tal) och om det är lagligt, en gråzon eller lämnar ett pappersspår.
const TRICKS: {
  op: 'COUNTERPURCHASE' | 'WRITE_SPEC' | 'HANDBUILT' | 'BRIBE_BOARD' | 'FALSIFY' | 'LOWBALL'
  title: string
  kind: 'LEGAL' | 'GREY ZONE' | 'PAPER TRAIL'
  text: string
  gauges: readonly DecisionGauge[]
}[] = [
  { op: 'COUNTERPURCHASE', title: 'Counter-purchase', kind: 'LEGAL', text: 'Promise local production: better marks, thinner margin on the series.', gauges: ['relations', 'cash'] },
  { op: 'WRITE_SPEC', title: 'Write the requirements', kind: 'PAPER TRAIL', text: 'Tilt a requirement towards your design. Needs a good relation, or a bribe. A clean official may refuse and report.', gauges: ['relations', 'reputation'] },
  { op: 'HANDBUILT', title: 'Hand-built test article', kind: 'PAPER TRAIL', text: 'A better prototype than you can build in series. It shows in the field later.', gauges: ['reputation', 'time'] },
  { op: 'BRIBE_BOARD', title: 'Bribe the test board', kind: 'PAPER TRAIL', text: 'A kinder protocol. Discovery disqualifies, even afterwards.', gauges: ['cash', 'reputation'] },
  { op: 'FALSIFY', title: 'Falsify the protocol', kind: 'PAPER TRAIL', text: 'A failed must-have counts as passed. A large paper trail — when the fault shows in the field the contract can be voided.', gauges: ['cash', 'reputation', 'relations'] },
  { op: 'LOWBALL', title: 'Low-ball bid', kind: 'GREY ZONE', text: 'Win on price, then recoup with supplementary orders. Overruns can bring a hearing and a halved order.', gauges: ['cash', 'relations'] },
]

function ProgrammeCard({
  state,
  programme,
  onSet,
  onAddAction,
}: {
  state: GameState
  programme: Programme
  onSet: (change: StandingOrderChange) => void
  onAddAction: (action: PlayerAction) => void
}) {
  const house = state.house
  const buyer = state.factions[programme.buyerId]?.name ?? programme.buyerId
  const entered = programme.entrants.find((e) => e.houseId === 'player')
  const depth = effectiveDepth(state, programme.buyerId)
  const eligible = programmeEligible(house.homeState, programmeBloc(state, programme))
  const open = programme.phase !== 'awarded' && programme.phase !== 'cancelled'
  const fitting = (house.designs ?? []).filter((d) => d.status === 'active' && d.category === programme.category && d.baseProductId === programme.baseProductId)
  const [designId, setDesignId] = useState<string>(entered?.designId ?? fitting[0]?.id ?? '')
  const rivals = programme.entrants.filter((e) => e.houseId !== 'player')
  const [rivalId, setRivalId] = useState<string>(rivals[0]?.houseId ?? '')
  const [specKind, setSpecKind] = useState<'performance' | 'reliability' | 'unitCost'>('performance')
  const [specBribe, setSpecBribe] = useState(false)
  const [showTricks, setShowTricks] = useState(false)
  const protocol = programmeProtocol(state, programme)

  const result = (v: { ok: true } | { ok: false; reason: string }) => (v.ok ? null : v.reason)
  const enter: StandingOrderChange = { kind: 'PROGRAMME', op: 'ENTER', programmeId: programme.id }
  const submit: StandingOrderChange = { kind: 'PROGRAMME', op: 'SUBMIT', programmeId: programme.id, designId }
  const withdraw: StandingOrderChange = { kind: 'PROGRAMME', op: 'WITHDRAW', programmeId: programme.id }
  const report: StandingOrderChange = { kind: 'PROGRAMME', op: 'REPORT', programmeId: programme.id, rivalId }
  const enterV = validateStandingOrderChange(state, state, enter)
  const submitV = validateStandingOrderChange(state, state, submit)
  const withdrawV = validateStandingOrderChange(state, state, withdraw)
  const reportV = rivalId ? validateStandingOrderChange(state, state, report) : ({ ok: false, reason: 'no rival to report' } as const)

  const trickAction = (op: (typeof TRICKS)[number]['op']): PlayerAction =>
    op === 'WRITE_SPEC'
      ? { type: 'PROCUREMENT', op: 'WRITE_SPEC', programmeId: programme.id, requirementKind: specKind, ...(specBribe ? { bribe: true } : {}) }
      : { type: 'PROCUREMENT', op, programmeId: programme.id }

  const phaseIndex = PHASES.indexOf(programme.phase)
  return (
    <article className="programme-folder" data-testid={`programme-${programme.id}`}>
      <header className="programme-head">
        <span className="type-sheet-kicker">
          DEVELOPMENT PROCUREMENT · {CATEGORY_NAME[programme.category]} · {buyer.toUpperCase()}
        </span>
        <span className={`type-stamp ${programme.phase === 'cancelled' ? 'is-red' : open ? 'is-amber' : 'is-green'} ${wearClass(`${programme.id}-${programme.phase}`)}`} data-testid={`programme-phase-${programme.id}`}>
          {PHASE_LABEL[programme.phase]}
        </span>
      </header>

      <ol className="programme-timeline" aria-label="Phases">
        {PHASES.map((p, i) => (
          <li key={p} className={i < phaseIndex ? 'is-done' : i === phaseIndex ? 'is-now' : ''}>
            <i aria-hidden="true" />
            <span>{PHASE_LABEL[p]}</span>
          </li>
        ))}
      </ol>

      <section className="programme-sheet" data-testid={`programme-sheet-${programme.id}`}>
        <h4 className="drawing-section">REQUIREMENT SHEET · ISSUED {turnDateLabel(state, programme.announcedTurn)}</h4>
        <table className="programme-reqs">
          <tbody>
            {programme.requirements.map((r) => (
              <tr key={r.kind}>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>{requirementText(r.kind, r.threshold)}</td>
                <td>
                  <span className={r.mandatory ? 'programme-must' : 'programme-should'}>{r.mandatory ? 'MUST' : 'SHOULD'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cf-hint">
          Tested in {programme.testEnvironment.toUpperCase()} conditions. Prize: {programme.prize.quantity} units over {programme.prize.deliveryTurns} quarters
          {programme.grant ? `, ${programme.grant.kind === 'costPlus' ? 'cost-plus' : 'fixed-price'} development grant` : ''}.
        </p>
      </section>

      <section>
        <h4 className="drawing-section">ENTRANTS</h4>
        <ul className="programme-entrants" data-testid={`programme-entrants-${programme.id}`}>
          {programme.entrants.map((e) => {
            const mine = e.houseId === 'player'
            return (
              <li key={e.houseId}>
                <span>{houseLabel(state, e.houseId)}{mine ? ' (you)' : ''}</span>
                <span className="programme-intel" role="img" aria-label={`Intelligence depth ${depth} of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < depth ? 'is-lit' : ''} />
                  ))}
                </span>
                <span className="cf-hint">
                  {mine
                    ? e.designId ? 'prototype submitted' : 'no prototype yet'
                    : depth === 0 ? 'progress unknown' : e.barred ? e.barred : e.designId ? 'prototype submitted' : 'still developing'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {open && (
        <section className="programme-orders">
          {!entered ? (
            <>
              <p className="cf-hint">{eligible ? 'Entering costs no action.' : 'Your home state bars you from this ministry.'}</p>
              <Button variant="primary" disabled={!enterV.ok} onClick={() => onSet(enter)} testId={`programme-enter-${programme.id}`}>
                ENTER
              </Button>
              {result(enterV) && <p className="cf-hint is-warning">{result(enterV)}</p>}
            </>
          ) : (
            <>
              {fitting.length > 0 && (
                <div className="cf-field">
                  <span className="cf-field-label">PROTOTYPE</span>
                  <Segmented
                    options={fitting.map((d, i) => ({ value: d.id, label: `#${i + 1}` }))}
                    value={designId}
                    onChange={setDesignId}
                    testId={`programme-design-${programme.id}`}
                  />
                  <p className="cf-hint">{fitting.find((d) => d.id === designId)?.name}</p>
                </div>
              )}
              <div className="type-order-row">
                <Button variant="primary" disabled={!submitV.ok || !designId} onClick={() => onSet(submit)} testId={`programme-submit-${programme.id}`}>
                  SUBMIT PROTOTYPE
                </Button>
                <Button variant="secondary" disabled={!withdrawV.ok} onClick={() => onSet(withdraw)} testId={`programme-withdraw-${programme.id}`}>
                  WITHDRAW
                </Button>
              </div>
              {result(submitV) && designId && <p className="cf-hint is-warning">{result(submitV)}</p>}

              {rivals.length > 0 && (
                <div className="cf-field">
                  <span className="cf-field-label">REPORT A RIVAL (NEEDS INTELLIGENCE HERE)</span>
                  <Segmented
                    options={rivals.map((r) => ({ value: r.houseId, label: houseLabel(state, r.houseId).toUpperCase().slice(0, 8) }))}
                    value={rivalId}
                    onChange={setRivalId}
                    testId={`programme-report-rival-${programme.id}`}
                  />
                  <Button variant="secondary" disabled={!reportV.ok} onClick={() => onSet(report)} testId={`programme-report-${programme.id}`}>
                    REPORT
                  </Button>
                  <DecisionDots gauges={['relations', 'rivals']} />
                  {result(reportV) && <p className="cf-hint is-warning">{result(reportV)}</p>}
                  <span className="cf-field-label">COVERT MOVES AGAINST THIS RIVAL (1 ACTION EACH)</span>
                  {(['SABOTAGE', 'LEAK'] as const).map((op) => {
                    const station = house.stations.find((st) => st.nation === programme.buyerId && st.status === 'active')
                    const action: PlayerAction | null = station && rivalId ? { type: 'INTEL', op, stationId: station.id, targetId: `programme:${programme.id}:${rivalId}` } : null
                    const v = action ? validateAction(state, state, action) : ({ ok: false, reason: 'needs an active station in this country' } as const)
                    return (
                      <div className="programme-trick" key={op} data-testid={`intel-${op}-${programme.id}`}>
                        <p className="cf-hint">{op === 'SABOTAGE' ? 'Sabotage the rival prototype: a worse mark at the trial.' : 'Leak damaging files: a small penalty for the rival at the trial.'}</p>
                        <Button variant="secondary" disabled={!v.ok} onClick={() => action && onAddAction(action)} testId={`intel-go-${op}-${programme.id}`}>
                          {op}
                        </Button>
                        <DecisionDots gauges={['rivals', 'cash']} />
                        {!v.ok && <p className="cf-hint is-warning">{v.reason}</p>}
                      </div>
                    )
                  })}
                </div>
              )}

              <Button variant="secondary" onClick={() => setShowTricks((v) => !v)} testId={`programme-tricks-toggle-${programme.id}`}>
                {showTricks ? 'CLOSE THE FILE DRAWER' : 'MOVES (1 ACTION EACH)'}
              </Button>
              {showTricks && (
                <div className="programme-tricks" data-testid={`programme-tricks-${programme.id}`}>
                  {TRICKS.map((t) => {
                    const action = trickAction(t.op)
                    const v = validateAction(state, state, action)
                    return (
                      <div className="programme-trick" key={t.op} data-testid={`trick-${t.op}-${programme.id}`}>
                        <div className="programme-trick-head">
                          <span className="programme-trick-title">{t.title}</span>
                          <Tag tone={t.kind === 'LEGAL' ? 'green' : t.kind === 'GREY ZONE' ? 'amber' : 'red'}>{t.kind}</Tag>
                        </div>
                        <p className="cf-hint">{t.text}</p>
                        {t.op === 'WRITE_SPEC' && (
                          <>
                            <Segmented
                              options={[
                                { value: 'performance' as const, label: 'PERF' },
                                { value: 'reliability' as const, label: 'RELIAB' },
                                { value: 'unitCost' as const, label: 'COST' },
                              ]}
                              value={specKind}
                              onChange={setSpecKind}
                              testId={`trick-spec-kind-${programme.id}`}
                            />
                            <DsToggle label="Pay a bribe instead of leaning on the relation" checked={specBribe} onChange={setSpecBribe} testId={`trick-spec-bribe-${programme.id}`} />
                          </>
                        )}
                        <DecisionDots gauges={t.gauges} testId={`trick-dots-${t.op}-${programme.id}`} />
                        <Button variant="secondary" disabled={!v.ok} onClick={() => onAddAction(action)} testId={`trick-go-${t.op}-${programme.id}`}>
                          DO IT
                        </Button>
                        {!v.ok && <p className="cf-hint is-warning">{v.reason}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {protocol && (
        <section className="programme-protocol" data-testid={`protocol-${programme.id}`}>
          <h4 className="drawing-section">EVALUATION PROTOCOL</h4>
          {protocol.entries.map((entry) => (
            <div className="protocol-entry" key={entry.houseId} data-testid={`protocol-entry-${entry.houseId}`}>
              <div className="protocol-name">
                {entry.name}
                {protocol.winner === entry.houseId ? ' — AWARDED' : ''}
              </div>
              {entry.disqualified && <div className="protocol-dq">DISQUALIFIED: {entry.disqualified}</div>}
              <table className="protocol-rows">
                <tbody>
                  {entry.rows.map((row) => (
                    <tr key={row.kind} className={!row.pass && row.mandatory ? 'is-struck' : !row.pass ? 'is-miss' : ''}>
                      <td>{KIND_LABEL[row.kind]}</td>
                      <td>{row.measured.toFixed(row.kind === 'unitCost' ? 2 : 0)}</td>
                      <td>{requirementText(row.kind, row.threshold)}</td>
                      <td>{row.pass ? 'PASS' : row.mandatory ? 'FAIL' : 'MISS'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {programme.result?.split && <p className="cf-hint">The ministry splits the series {100 - programme.result.split.sharePct}/{programme.result.split.sharePct}.</p>}
        </section>
      )}
    </article>
  )
}

export function ProgrammeFolders({
  state,
  draft: _draft,
  onSet,
  onAddAction,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
  onAddAction: (action: PlayerAction) => void
}) {
  const all = (state.programmes ?? []).filter((p) => p.phase !== 'cancelled')
  const shown = [...all].reverse().slice(0, 4)
  return (
    <Panel title="Development procurements" right={<Tag>{all.length} on file</Tag>}>
      {shown.length === 0 ? (
        <p className="empty" data-testid="programmes-empty">
          No development procurement is open. A ministry puts one out when its requirements rise, a gap opens or a front loses materiel.
        </p>
      ) : (
        <div className="programme-list" data-testid="programmes">
          {shown.map((p) => (
            <ProgrammeCard key={p.id} state={state} programme={p} onSet={onSet} onAddAction={onAddAction} />
          ))}
        </div>
      )}
    </Panel>
  )
}
