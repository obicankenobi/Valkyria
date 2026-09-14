// THE HOUSE — läsvy: produktionslinjer, R&D, kassa, kredit, styrelsemål,
// personal, samt (P21) executive actions. Visar uttryckligen MARGINAL PER
// AKTIVT KONTRAKT, inte bara kassa (DESIGN.md avsnitt 18: "Spelaren kan inte
// fatta prisbeslut på en siffra som bara rör sig"). Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 8.
//
// P21 (spec 3.4): marginalen räknas mot unitCostNow (dagens kostnad, rör sig
// med supplyCostIndex), inte mot Contract.unitCostAtSigning — men BÅDA talen
// visas, för samma skäl etapp 1-specens avsnitt 4.1 alltid krävt.
//
// P21 (spec avsnitt 8): en enkel handlings-UI för INTERNAL och POLITICAL, med
// kvarvarande actionPoints synligt. Formulären lägger bara till en PlayerAction
// i draften (App.tsx/useGame.ts) — den faktiska prövningen (kredit, tak,
// giltighet) sker i applyActions.ts vid endTurn, precis som BidForm redan gör
// för bud.
import { useState } from 'react'
import { DISPLAY_THRESHOLDS, computeUnitCostNow, getProduct } from '@seventh-front/core'
import type { Contract, GameState, PlayerAction, TechCategory, TurnSubmission } from '@seventh-front/core'
import { Bar, Meter, Panel, Tag, formatMoney } from './ui.js'

const TECH_CATEGORIES: TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']
const HIRABLE_ROLES: { role: 'chiefEngineer' | 'chiefSalesman' | 'chiefOfStaff'; label: string }[] = [
  { role: 'chiefEngineer', label: 'Chief Engineer' },
  { role: 'chiefSalesman', label: 'Chief Salesman' },
  { role: 'chiefOfStaff', label: 'Chief of Staff' },
]

function contractMargin(contract: Contract, supplyCostIndex: number): { marginPct: number | null; unitCostNow: number } {
  const unitCostNow = computeUnitCostNow(getProduct(contract.productId), contract.grade, supplyCostIndex)
  if (contract.price <= 0) return { marginPct: null, unitCostNow }
  const cost = unitCostNow * contract.quantity
  return { marginPct: ((contract.price - cost) / contract.price) * 100, unitCostNow }
}

function describeAction(action: PlayerAction): string {
  switch (action.type) {
    case 'INTERNAL':
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
      break
    case 'POLITICAL':
      return `${action.op.replace('_', ' ')} — ${action.targetFactionId} (${formatMoney(action.spend)})`
    case 'CRISIS':
      return `Crisis choice — ${action.choice}`
    default:
      return action.type
  }
  return 'action'
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
  const [loanAmount, setLoanAmount] = useState(0)
  const [repayAmount, setRepayAmount] = useState(0)
  const [hireRole, setHireRole] = useState<'chiefEngineer' | 'chiefSalesman' | 'chiefOfStaff'>('chiefEngineer')
  const [rndCategory, setRndCategory] = useState<TechCategory>(TECH_CATEGORIES[0]!)
  const [targetFactionId, setTargetFactionId] = useState(Object.keys(state.factions)[0] ?? '')
  const [spend, setSpend] = useState(0)

  const queued = draft.actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.type === 'INTERNAL' || action.type === 'POLITICAL')

  return (
    <Panel
      title="Executive actions"
      right={<Tag tone="amber">{state.house.actionPoints} action points</Tag>}
    >
      <div className="action-form">
        <span className="action-form-title">Internal</span>
        <label className="field">
          Loan amount
          <input type="number" min={0} value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => onAddAction({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: loanAmount } })}
        >
          Take Loan
        </button>

        <label className="field">
          Repay amount
          <input type="number" min={0} value={repayAmount} onChange={(e) => setRepayAmount(Number(e.target.value))} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => onAddAction({ type: 'INTERNAL', op: 'REPAY', payload: { amount: repayAmount } })}
        >
          Repay Debt
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => onAddAction({ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} })}
        >
          Build Production Line
        </button>

        <label className="field">
          Role
          <select value={hireRole} onChange={(e) => setHireRole(e.target.value as typeof hireRole)}>
            {HIRABLE_ROLES.map((r) => (
              <option key={r.role} value={r.role}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => onAddAction({ type: 'INTERNAL', op: 'HIRE', payload: { role: hireRole } })}
        >
          Hire
        </button>

        <label className="field">
          R&D category
          <select value={rndCategory} onChange={(e) => setRndCategory(e.target.value as TechCategory)}>
            {TECH_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => onAddAction({ type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: rndCategory } })}
        >
          Reprioritise R&D
        </button>
      </div>

      <div className="action-form">
        <span className="action-form-title">Political</span>
        <label className="field">
          Target faction
          <select value={targetFactionId} onChange={(e) => setTargetFactionId(e.target.value)}>
            {Object.values(state.factions).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Spend
          <input type="number" min={0} value={spend} onChange={(e) => setSpend(Number(e.target.value))} />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!targetFactionId}
          onClick={() => onAddAction({ type: 'POLITICAL', op: 'BRIBE', targetFactionId, spend })}
        >
          Bribe
        </button>
        <button
          type="button"
          className="btn"
          disabled={!targetFactionId}
          onClick={() => onAddAction({ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId, spend })}
        >
          Stage Incident
        </button>
        <button
          type="button"
          className="btn"
          disabled={!targetFactionId}
          onClick={() => onAddAction({ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId, spend })}
        >
          Back Channel
        </button>
      </div>

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
      <h2 className="view-title">The House</h2>

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

      <ExecutiveActions state={state} draft={draft} onAddAction={onAddAction} onRemoveAction={onRemoveAction} />

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
                const { marginPct, unitCostNow } = contractMargin(contract, supplyIndex)
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

      <div className="grid-2">
        <Panel title="Production lines">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Product</th>
                <th>Grade</th>
                <th>Capacity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {house.lines.map((line) => (
                <tr key={line.id}>
                  <td className="is-key">{line.id}</td>
                  <td>{line.productId ? getProduct(line.productId).name : '—'}</td>
                  <td>{line.grade}</td>
                  <td>{line.capacityPct}%</td>
                  <td>
                    {line.status === 'running' && <Tag tone="green">Running</Tag>}
                    {line.status === 'idle' && <Tag>Idle</Tag>}
                    {line.status === 'blocked' && <Tag tone="red">{line.blockedReason ?? 'Blocked'}</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="R&D and staff">
          {house.rnd.length === 0 ? (
            <p className="empty">No ongoing research projects.</p>
          ) : (
            <table>
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
      </div>
    </>
  )
}
