// THE COMPANY — läsvy: produktionslinjer, R&D, kassa, kredit, styrelsemål,
// personal, samt (P21) executive actions. Visar uttryckligen MARGINAL PER
// AKTIVT KONTRAKT, inte bara kassa (DESIGN.md avsnitt 18: "Spelaren kan inte
// fatta prisbeslut på en siffra som bara rör sig"). Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 8. Filnamnet (TheHouse.tsx) och komponentnamnet (TheHouse) är
// oförändrade sedan P21 — bara den synliga rubriken bytt namn till "The
// Company" (P85), samma minimal-diff-princip TheFloor.tsx följde i P84 när
// skärmen döptes om till Contracts utan att filen/importen ändrades.
//
// P21 (spec 3.4): marginalen räknas mot unitCostNow (dagens kostnad, rör sig
// med supplyCostIndex), inte mot Contract.unitCostAtSigning — men BÅDA talen
// visas, för samma skäl etapp 1-specens avsnitt 4.1 alltid krävt.
//
// P85 (ETAPP7_TEKNISK_SPEC.md §13, regel 2): INTERNAL-formulären (lån,
// återbetalning, ny linje, anställning, R&D-omprioritering) och den nya
// råvarupanelen (BUY_FORWARD/RELEASE) bröts ut till CompanyActions.tsx —
// TierPicker/Segmented i stället för <input type="number">/<select>.
//
// P86 (§13, P81-18): POLITICAL-formuläret (BRIBE/STAGE_INCIDENT/BACK_CHANNEL,
// <select>/<input type="number">) flyttat till ThePolitics.tsx (CONTACTS) och
// borttaget härifrån — den hårdkodade genvägen den här filens kommentar
// tidigare beskrev är nu den avsedda platsen. "Executive actions"-panelen
// visar bara INTERNAL-formuläret och dess köade kort.
import { DISPLAY_THRESHOLDS, computeUnitCostNow, getProduct, projectedQuarter, researchOutlook } from '@seventh-front/core'
import { totalFixedCosts } from '@seventh-front/core'
import type { Commodity, Contract, GameState, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { Fragment, useEffect, useState } from 'react'
import { InternalActionsForm, RawMaterialsPanel } from './CompanyActions.js'
import { DrawingBoard } from './DrawingBoard.js'
import { LedgerChart } from './LedgerChart.js'
import { PaperTrail } from './PaperTrail.js'
import { ProductionBoard } from './ProductionBoard.js'
import { StandingOrdersBoard } from './StandingOrdersBoard.js'
import { TypeSheets } from './TypeSheet.js'
import { WorksPlan } from './WorksPlan.js'
import { Bar, Meter, Panel, Tag, formatMoney } from './ui.js'

export type CompanyDrawer = 'works' | 'drawing' | 'books' | 'legal'

const DRAWERS: { id: CompanyDrawer; label: string }[] = [
  { id: 'works', label: 'Works' },
  { id: 'drawing', label: 'Drawing office' },
  { id: 'books', label: 'Books' },
  { id: 'legal', label: 'Legal' },
]

// This Quarter hoppar hit med ett kort-id: pappersspåret ligger i Legal, resten (linjer, avtal, stationer) i Works.
function drawerForFocus(focus: string | null): CompanyDrawer {
  return focus === 'paper-trail' ? 'legal' : 'works'
}

function contractMargin(contract: Contract, commodities: Record<Commodity, number>): { marginPct: number | null; unitCostNow: number } {
  const unitCostNow = computeUnitCostNow(getProduct(contract.productId), contract.grade, commodities)
  if (contract.price <= 0) return { marginPct: null, unitCostNow }
  const cost = unitCostNow * contract.quantity
  return {
    marginPct: ((contract.price - cost) / contract.price) * 100,
    unitCostNow,
  }
}

function describeAction(action: Extract<PlayerAction, { type: 'INTERNAL' }>): string {
  switch (action.op) {
    case 'TAKE_LOAN':
      return `Take loan — ${formatMoney(Number(action.payload.amount ?? 0))}`
    case 'REPAY':
      return `Repay debt — ${formatMoney(Number(action.payload.amount ?? 0))}`
    case 'BUILD_LINE':
      return 'Build production line'
    case 'HIRE':
      return `Hire — ${String(action.payload.role ?? '')}`
    case 'REPRIORITISE_RND':
      return `Crash R&D programme — ${String(action.payload.category ?? '')}`
    case 'REVERSE_ENGINEER':
      return `Reverse-engineer — ${String(action.payload.systemId ?? '')}`
  }
}

function ExecutiveActions({
  state,
  draft,
  onAddAction,
  onRemoveAction,
}: {
  state: GameState
  draft: TurnSubmission
  onAddAction: (action: PlayerAction) => void
  onRemoveAction: (index: number) => void
}) {
  const queued = draft.actions
    .map((action, index) => ({ action, index }))
    .filter(
      (
        entry,
      ): entry is {
        action: Extract<PlayerAction, { type: 'INTERNAL' }>
        index: number
      } => entry.action.type === 'INTERNAL',
    )

  return (
    <Panel
      title="Executive actions"
      info="Actions that cost an action point each quarter: loans, lines, hires and crash research."
      infoTopic="production"
      right={<Tag tone="amber">{state.house.actionPoints} action points</Tag>}
    >
      <InternalActionsForm state={state} onAddAction={onAddAction} />

      {queued.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span className="action-form-title">Queued this turn</span>
          {queued.map(({ action, index }) => (
            <div className="queued-action" key={index}>
              <span>{describeAction(action)}</span>
              <button type="button" className="btn btn-ghost" onClick={() => onRemoveAction(index)}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// P85 (P81-14/15): "innevarande kvartals intäkter och kostnader per post, en
// prognos för nästa kvartal ur accepterade kontrakt och fasta kostnader."
// projectedQuarter (queries.ts) är den enda källan för alla fem talen nedan —
// inget här räknas om lokalt.
// P185 (11Q): byggnadslånen i Books — vad som är utestående per anläggning, och kvartalets betalning. Lånen ligger utanför kreditgränsen; dragen bokförs under "Loans taken" och
// återbetalningarna under "Repayments" i huvudboken ovan. Läser projectedQuarter (en källa).
function BuildLoansPanel({ state }: { state: GameState }) {
  const outlook = projectedQuarter(state).buildLoans
  if (outlook.loans.length === 0) return null
  return (
    <Panel
      title="Building loans"
      info="Money the bank lent for building, outside your credit limit. The works is the security: miss a payment and the bank takes it."
      infoTopic="works"
      right={<Tag tone="amber">{formatMoney(outlook.outstanding)} owed</Tag>}
    >
      <dl className="kv" data-testid="build-loans">
        {outlook.loans.map((row) => {
          const works = state.house.works.find((w) => w.id === row.facilityId)
          return (
            <Fragment key={row.facilityId}>
              <dt>{works ? `${works.kind} ${works.id}${works.category ? ` (${works.category})` : ''}` : row.facilityId}</dt>
              <dd>
                {formatMoney(row.outstanding)} owed · {formatMoney(row.interest + row.amortisation)} next quarter
              </dd>
            </Fragment>
          )
        })}
      </dl>
    </Panel>
  )
}

function NextQuarterPanel({ state }: { state: GameState }) {
  const q = projectedQuarter(state)
  const totalFixed = totalFixedCosts(q.fixedCosts)

  return (
    <Panel
      info="What your books will most likely show next quarter, from deliveries already scheduled."
      infoTopic="board"
      title="Next quarter"
      right={<Tag tone={q.netChange >= 0 ? 'green' : 'red'}>{formatMoney(q.netChange)} net</Tag>}
    >
      <dl className="kv">
        <dt>Expected revenue (scheduled deliveries)</dt>
        <dd>{formatMoney(q.expectedRevenueNextTurn)}</dd>
        <dt>Payroll</dt>
        <dd>−{formatMoney(q.fixedCosts.payroll)}</dd>
        <dt>Line upkeep</dt>
        <dd>−{formatMoney(q.fixedCosts.lineUpkeep)}</dd>
        <dt>Station upkeep</dt>
        <dd>−{formatMoney(q.fixedCosts.stationUpkeep)}</dd>
        <dt>Facility upkeep</dt>
        <dd>−{formatMoney(q.fixedCosts.facilityUpkeep)}</dd>
        {q.fixedCosts.stockHolding > 0 && (
          <>
            <dt>Depot holding cost</dt>
            <dd>−{formatMoney(q.fixedCosts.stockHolding)}</dd>
          </>
        )}
        <dt>Workforce wages</dt>
        <dd>−{formatMoney(q.fixedCosts.wages)}</dd>
        <dt>R&amp;D overhead</dt>
        <dd>−{formatMoney(q.fixedCosts.rndOverhead)}</dd>
        {q.interest > 0 && (
          <>
            <dt>Debt interest</dt>
            <dd>−{formatMoney(q.interest)}</dd>
          </>
        )}
        {q.buildLoans.total > 0 && (
          <>
            <dt>Building loans (interest and repayment)</dt>
            <dd data-testid="next-quarter-build-loans">−{formatMoney(q.buildLoans.total)}</dd>
          </>
        )}
        <dt>Fixed costs total</dt>
        <dd>−{formatMoney(totalFixed)}</dd>
      </dl>
      <p className="cf-hint" style={{ marginTop: 10 }}>
        Revenue counts only shipments already scheduled to arrive next quarter — deliveries further out in the pipeline (delay up to three quarters) aren't guessed at.
      </p>
    </Panel>
  )
}

export function TheHouse({
  state,
  draft,
  onAddAction,
  onRemoveAction,
  onSetStandingOrder = () => {},
  onRemoveStandingOrder = () => {},
  focusCard = null,
  initialDrawer = null,
}: {
  state: GameState
  draft: TurnSubmission
  onAddAction: (action: PlayerAction) => void
  onRemoveAction: (index: number) => void
  // P101: anslagstavlan. Valfria så att en rendering utan tavla (äldre tester) fortsätter fungera.
  onSetStandingOrder?: (change: StandingOrderChange) => void
  onRemoveStandingOrder?: (key: string) => void
  focusCard?: string | null
  initialDrawer?: CompanyDrawer | null
}) {
  const [drawer, setDrawer] = useState<CompanyDrawer>(initialDrawer ?? drawerForFocus(focusCard))
  useEffect(() => {
    if (focusCard) setDrawer(drawerForFocus(focusCard))
  }, [focusCard])
  const house = state.house
  const target = house.boardTarget
  const nextReview = target.reviewTurns.find((t) => t > state.meta.turn) ?? null
  const activeContracts = state.market.contracts.filter((c) => c.status === 'active' || c.status === 'late')
  const totalRevenue = house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const supplyIndex = state.market.supplyCostIndex

  return (
    <>
      <h2 className="view-title">The Company</h2>

      <div className="drawer-tabs" role="tablist" aria-label="The Company drawers" data-testid="company-drawers">
        {DRAWERS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={drawer === d.id}
            className={drawer === d.id ? 'drawer-tab is-active' : 'drawer-tab'}
            onClick={() => setDrawer(d.id)}
            data-testid={`company-drawer-${d.id}`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {drawer === 'works' && (
        <>
          {/* P179 (ETAPP11 §8): tomtplanen, produktionslinjerna och driften. */}
          <WorksPlan state={state} draft={draft} onSet={onSetStandingOrder} onRemove={onRemoveStandingOrder} focusId={focusCard} />
          <ProductionBoard state={state} draft={draft} onSet={onSetStandingOrder} onRemove={onRemoveStandingOrder} focus={focusCard === 'production-board'} />

          {/* P101: produktionslinjerna bor nu på anslagstavlan — linjekorten visar SAMMA ProductionLineBand
              (en linje, en sanning), plus det stående uppdraget. */}
          <StandingOrdersBoard state={state} draft={draft} onSet={onSetStandingOrder} onRemove={onRemoveStandingOrder} focusCard={focusCard} />

          <ExecutiveActions state={state} draft={draft} onAddAction={onAddAction} onRemoveAction={onRemoveAction} />

          <RawMaterialsPanel state={state} onAddAction={onAddAction} />
        </>
      )}

      {drawer === 'drawing' && (
        <>
          {/* P126 (ETAPP9 §9): ritbordet (en blåkopia per kategori) och typbladen för husets färdiga konstruktioner. */}
          <DrawingBoard state={state} draft={draft} onSet={onSetStandingOrder} onRemove={onRemoveStandingOrder} onAddAction={onAddAction} />
          <TypeSheets state={state} draft={draft} onAddAction={onAddAction} onSet={onSetStandingOrder} />

          <Panel info="Research projects and the staff roles that speed them up." infoTopic="production" title="R&D and staff">
            {researchOutlook(state).map((r) => (
              <div className="research-row" key={r.category} data-testid="research-row">
                <span className="research-category">{r.category.toUpperCase()}</span>
                <span className="research-level">Level {r.techLevel}</span>
                <span className="research-next">
                  {r.nextUnlock ? `Unlocks ${r.nextUnlock.productName} at level ${r.nextUnlock.techRequired}` : 'Everything in this field is unlocked'}
                </span>
              </div>
            ))}

            {house.rnd.length === 0 ? (
              <p className="empty" style={{ marginTop: 10 }}>
                No ongoing research projects.
              </p>
            ) : (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {house.rnd.map((project) => (
                    <tr key={project.id}>
                      <td className="is-key">{project.category}</td>
                      <td>
                        {project.turnsRemaining}/{project.turnsTotal} turns
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <Meter label="Chief Engineer" value={house.staff.chiefEngineer} tone="blue" />
              <Meter label="Chief Salesman" value={house.staff.chiefSalesman} tone="blue" />
              <Meter label="Chief of Staff" value={house.staff.chiefOfStaff} tone="blue" />
            </div>
          </Panel>
        </>
      )}

      {drawer === 'books' && (
        <>
          <div className="grid-2">
            <Panel info="Your cash, debt and the credit you still have." infoTopic="board" title="Balance sheet">
              <dl className="kv">
                <dt>Treasury</dt>
                <dd>{formatMoney(house.treasury)}</dd>
                <dt>Debt</dt>
                <dd>{formatMoney(house.debt)}</dd>
                <dt>Credit limit</dt>
                <dd data-testid="credit-limit">{formatMoney(house.creditLimit)}</dd>
                <dt>Total revenue</dt>
                <dd>{formatMoney(totalRevenue)}</dd>
                <dt>Interest (annual)</dt>
                <dd>{(house.debtRateAnnual * 100).toFixed(1)}%</dd>
              </dl>

              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                <Meter label="Quality reputation" value={house.reputation.quality} display={house.reputation.quality.toFixed(0)} tone="blue" />
                <Meter
                  label="Reliability"
                  value={house.reputation.reliability}
                  display={house.reputation.reliability.toFixed(0)}
                  tone={house.reputation.reliability < 40 ? 'red' : 'blue'}
                />
                <Meter
                  label="Supply cost index"
                  value={supplyIndex}
                  max={DISPLAY_THRESHOLDS.supplyIndexMax}
                  display={supplyIndex.toFixed(0)}
                  tone={supplyIndex > 100 ? 'red' : 'blue'}
                  marks={[{ at: 100, label: 'baseline' }]}
                />
              </div>
            </Panel>

            <Panel
              title={`Board target: ${target.label}`}
              info="What the board demands, and when it checks. Two failed reviews in a row end your game."
              infoTopic="board"
              right={target.reviewsFailed > 0 ? <Tag tone="red">{target.reviewsFailed}/2 failed</Tag> : <Tag tone="green">No remarks</Tag>}
            >
              <Meter
                label={`Progress toward target (due T${target.dueTurn})`}
                value={target.progressSnapshot}
                max={target.threshold}
                display={`${target.progressSnapshot.toFixed(2)} / ${target.threshold}`}
                tone={target.progressSnapshot >= target.threshold ? 'green' : 'amber'}
                marks={target.reviewTurns.map((reviewTurn) => ({
                  at: (reviewTurn / target.dueTurn) * target.threshold,
                  label: `T${reviewTurn}`,
                }))}
              />
              <p className="banner-sub" style={{ marginTop: 16 }}>
                {nextReview !== null
                  ? `Next forecast review turn ${nextReview} — the board compares against the linear path, with tolerance.`
                  : 'No more forecast reviews. The target is judged outright at maturity.'}
              </p>
            </Panel>
          </div>

          <LedgerChart state={state} />

          <BuildLoansPanel state={state} />

          <NextQuarterPanel state={state} />

          <Panel
            info="What each contract earns after your unit cost. A low margin means price or material cost is eating the deal."
            infoTopic="production"
            title="Margin per active contract"
          >
            {activeContracts.length === 0 ? (
              <p className="empty">No active contracts.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Product</th>
                    <th>Grade</th>
                    <th>Contract value</th>
                    <th>Delivered</th>
                    <th>Unit cost (signing)</th>
                    <th>Unit cost (now)</th>
                    <th style={{ width: 160 }}>Gross margin</th>
                  </tr>
                </thead>
                <tbody>
                  {activeContracts.map((contract) => {
                    const { marginPct, unitCostNow } = contractMargin(contract, state.market.commodities)
                    return (
                      <tr key={contract.id}>
                        <td className="is-key">{contract.id}</td>
                        <td>{getProduct(contract.productId).name}</td>
                        <td>{contract.grade}</td>
                        <td>{formatMoney(contract.price)}</td>
                        <td>
                          {contract.unitsDelivered}/{contract.quantity}
                        </td>
                        <td>{formatMoney(contract.unitCostAtSigning)}</td>
                        <td>{formatMoney(unitCostNow)}</td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                width: 52,
                                color: marginPct !== null && marginPct < 0 ? 'var(--red)' : undefined,
                              }}
                            >
                              {marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}
                            </span>
                            <Bar ratio={marginPct === null ? 0 : Math.max(0, marginPct) / 100} tone={marginPct !== null && marginPct >= 20 ? 'green' : 'amber'} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {drawer === 'legal' && (
        <>
          <p className="cf-hint drawer-intro">Paper trails, inquiries and the legal counsel you keep on retainer.</p>
          {/* P128 (ETAPP9 §8.3): pappersspåret — utredningskort, rent rykte, juridisk rådgivning. */}
          <PaperTrail state={state} draft={draft} onSet={onSetStandingOrder} />
        </>
      )}
    </>
  )
}
