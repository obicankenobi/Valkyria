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
import {
  DISPLAY_THRESHOLDS,
  computeUnitCostNow,
  estimateLineCompletionTurn,
  getProduct,
  projectedQuarter,
  researchOutlook,
} from '@seventh-front/core'
import type { Commodity, Contract, GameState, PlayerAction, ProductionLine, TurnSubmission } from '@seventh-front/core'
import { InternalActionsForm, RawMaterialsPanel } from './CompanyActions.js'
import { LedgerChart } from './LedgerChart.js'
import { Bar, Meter, Panel, Tag, formatMoney } from './ui.js'

function contractMargin(contract: Contract, commodities: Record<Commodity, number>): { marginPct: number | null; unitCostNow: number } {
  const unitCostNow = computeUnitCostNow(getProduct(contract.productId), contract.grade, commodities)
  if (contract.price <= 0) return { marginPct: null, unitCostNow }
  const cost = unitCostNow * contract.quantity
  return { marginPct: ((contract.price - cost) / contract.price) * 100, unitCostNow }
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
      return `Reprioritise R&D — ${String(action.payload.category ?? '')}`
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
    .filter((entry): entry is { action: Extract<PlayerAction, { type: 'INTERNAL' }>; index: number } => entry.action.type === 'INTERNAL')

  return (
    <Panel
      title="Executive actions"
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

// P85 (ETAPP7_TEKNISK_SPEC.md §13, P81-16): "produktionslinjer som visuella
// band... per linje vilka produkter den kan tillverka, takt per kvartal,
// beläggning mot kapacitet och när pågående kontrakt blir klara." GENUINT
// FYND: en linje kan tillverka VILKEN produkt som helst — den ärver bara
// productId/grade från vilket kontrakt production.ts (steg 2) råkar tilldela
// den (ingen kod begränsar en linje till en fast produktlista, se
// docs/ANDRINGSLOGG.md) — visas därför ärligt som "Any product" i idle-läge,
// i stället för att hitta på en linje-specifik produktlista som inte finns i
// datamodellen. capacityPct är i dagens balans alltid 100 (ingen mekanik
// någonsin ändrar den, se production.ts/applyActions.ts BUILD_LINE) — bandet
// visar den ändå, ärligt statisk, snarare än att fejka en variation som inte
// finns.
function ProductionLineBand({ state, line }: { state: GameState; line: ProductionLine }) {
  const product = line.productId ? getProduct(line.productId) : null
  const completionTurn = estimateLineCompletionTurn(state, line)
  const running = line.status === 'running'

  return (
    <div className="line-band" data-testid="production-line-band">
      <div className="line-band-head">
        <span className="line-band-id">{line.id.toUpperCase()}</span>
        <span className="line-band-product">{product ? product.name : 'Any product — idle'}</span>
        {line.status === 'running' && <Tag tone="green">Running</Tag>}
        {line.status === 'idle' && <Tag>Idle</Tag>}
        {line.status === 'retooling' && <Tag tone="amber">Retooling</Tag>}
        {line.status === 'blocked' && <Tag tone="red">{line.blockedReason ?? 'Blocked'}</Tag>}
      </div>
      <Bar ratio={running ? line.capacityPct / 100 : 0} tone={running ? 'green' : line.status === 'blocked' ? 'red' : 'neutral'} />
      <div className="line-band-meta">
        <span>{product ? `${product.unitsPerLineTurn.toLocaleString('en-GB')} units/quarter at full capacity` : `${line.capacityPct}% capacity, unassigned`}</span>
        {completionTurn !== null && <span>Completes contract T{completionTurn}</span>}
      </div>
    </div>
  )
}

// P85 (P81-14/15): "innevarande kvartals intäkter och kostnader per post, en
// prognos för nästa kvartal ur accepterade kontrakt och fasta kostnader."
// projectedQuarter (queries.ts) är den enda källan för alla fem talen nedan —
// inget här räknas om lokalt.
function NextQuarterPanel({ state }: { state: GameState }) {
  const q = projectedQuarter(state)
  const totalFixed = q.fixedCosts.payroll + q.fixedCosts.lineUpkeep + q.fixedCosts.stationUpkeep + q.fixedCosts.rndOverhead

  return (
    <Panel title="Next quarter" right={<Tag tone={q.netChange >= 0 ? 'green' : 'red'}>{formatMoney(q.netChange)} net</Tag>}>
      <dl className="kv">
        <dt>Expected revenue (scheduled deliveries)</dt>
        <dd>{formatMoney(q.expectedRevenueNextTurn)}</dd>
        <dt>Payroll</dt>
        <dd>−{formatMoney(q.fixedCosts.payroll)}</dd>
        <dt>Line upkeep</dt>
        <dd>−{formatMoney(q.fixedCosts.lineUpkeep)}</dd>
        <dt>Station upkeep</dt>
        <dd>−{formatMoney(q.fixedCosts.stationUpkeep)}</dd>
        <dt>R&amp;D overhead</dt>
        <dd>−{formatMoney(q.fixedCosts.rndOverhead)}</dd>
        {q.interest > 0 && (
          <>
            <dt>Debt interest</dt>
            <dd>−{formatMoney(q.interest)}</dd>
          </>
        )}
        <dt>Fixed costs total</dt>
        <dd>−{formatMoney(totalFixed)}</dd>
      </dl>
      <p className="cf-hint" style={{ marginTop: 10 }}>
        Revenue counts only shipments already scheduled to arrive next quarter — deliveries further out in the pipeline
        (delay up to three quarters) aren't guessed at.
      </p>
    </Panel>
  )
}

export function TheHouse({
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
  const house = state.house
  const target = house.boardTarget
  const nextReview = target.reviewTurns.find((t) => t > state.meta.turn) ?? null
  const activeContracts = state.market.contracts.filter((c) => c.status === 'active' || c.status === 'late')
  const totalRevenue = house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const supplyIndex = state.market.supplyCostIndex

  return (
    <>
      <h2 className="view-title">The Company</h2>

      <div className="grid-2">
        <Panel title="Balance sheet">
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
            <Meter
              label="Quality reputation"
              value={house.reputation.quality}
              display={house.reputation.quality.toFixed(0)}
              tone="blue"
            />
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
          right={
            target.reviewsFailed > 0 ? (
              <Tag tone="red">{target.reviewsFailed}/2 failed</Tag>
            ) : (
              <Tag tone="green">No remarks</Tag>
            )
          }
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

      <NextQuarterPanel state={state} />

      <ExecutiveActions state={state} draft={draft} onAddAction={onAddAction} onRemoveAction={onRemoveAction} />

      <RawMaterialsPanel state={state} onAddAction={onAddAction} />

      <Panel title="Margin per active contract">
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 52, color: marginPct !== null && marginPct < 0 ? 'var(--red)' : undefined }}>
                          {marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}
                        </span>
                        <Bar
                          ratio={marginPct === null ? 0 : Math.max(0, marginPct) / 100}
                          tone={marginPct !== null && marginPct >= 20 ? 'green' : 'amber'}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Production lines">
        {house.lines.length === 0 ? (
          <p className="empty">No production lines yet.</p>
        ) : (
          house.lines.map((line) => <ProductionLineBand key={line.id} state={state} line={line} />)
        )}
      </Panel>

      <Panel title="R&D and staff">
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
  )
}
