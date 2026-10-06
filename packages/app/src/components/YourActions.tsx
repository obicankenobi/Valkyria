// YourActions — P164 (ETAPP10_FORSLAG.md §3b, S3): resultatrapporten efter varje kvartal. En rad per handling du lade in — vad den hette, vad som hände, och vad som följde av
// det — och de avvisade i samma lista med orsaken. Raderna byggs av actionReport.ts; här finns bara presentationen.
import { useMemo } from 'react'
import { buildActionReport } from '../actionReport.js'
import type { ActionReportInput, ActionReportRow } from '../actionReport.js'
import { DsPanel } from './designSystem.js'
import { Tag } from './ui.js'
import { VerbIcon } from './VerbIcon.js'

const STATUS_LABEL: Record<ActionReportRow['status'], string> = { done: 'DONE', failed: 'FAILED', rejected: 'REJECTED' }
const STATUS_TONE: Record<ActionReportRow['status'], 'green' | 'red'> = { done: 'green', failed: 'red', rejected: 'red' }

export function YourActionsRows({ rows }: { rows: readonly ActionReportRow[] }) {
  return (
    <ol className="your-actions" data-testid="your-actions-list">
      {rows.map((row) => (
        <li key={row.key} className={`your-action is-${row.status}`} data-testid={`your-action-${row.key}`}>
          <div className="your-action-head">
            {row.verb && (
              <span className="your-action-icon" aria-hidden="true">
                <VerbIcon verb={row.verb} />
              </span>
            )}
            <span className="your-action-label">
              {row.label}
              {row.detail && <span className="your-action-detail"> · {row.detail}</span>}
            </span>
            <Tag tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Tag>
          </div>
          <p className="your-action-outcome" data-testid="your-action-outcome">
            {row.status === 'rejected' ? `Not carried out: ${row.outcome}` : row.outcome}
          </p>
          {row.chain.length > 0 && (
            <ul className="your-action-chain" data-testid="your-action-chain">
              {row.chain.map((step) => (
                <li key={step.id} className={`your-action-step is-${step.severity}`} style={{ paddingLeft: `${Math.min(step.depth, 3) * 12}px` }}>
                  <span aria-hidden="true">→ </span>
                  {step.headline}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

export function YourActions({ input }: { input: ActionReportInput | null }) {
  const rows = useMemo(() => (input ? buildActionReport(input) : []), [input])
  if (rows.length === 0) return null
  return (
    <DsPanel
      title="Your actions"
      info="What each action you filed last quarter did, and what followed from it. An action that was not carried out shows why."
    >
      <YourActionsRows rows={rows} />
    </DsPanel>
  )
}
