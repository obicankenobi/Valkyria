// ProductionBoard — P180 (ETAPP11_FORSLAG.md §8 punkt 3): planeringstavlan. Ett spår per produktionslinje med kvartalen som kolumner: vad som tillverkas, när det är klart, vad som
// står i kö och var omställningarna ligger. Ett tryck på ett kontrakt öppnar ett kort där det dras till en linje (produktionsplanen, PLAN) eller läggs ut på en underleverantör
// (OUTSOURCE). Allt kommer ur `productionBoard` (kärnan) — samma projektion som budmappens "ready by" — och ändringar är stående order: de köas i draften, gäller från nästa
// kvartal och kostar ingen handling.
import { useEffect, useRef, useState } from 'react'
import { OUTSOURCE_SHARES, getProduct, productionBoard, validateStandingOrderChange } from '@seventh-front/core'
import type { BoardContract, BoardLine, BoardSegment, GameState, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { standingOrderKey } from '../standingOrderBoard.js'
import { BottomSheet, Button, Segmented } from './designSystem.js'
import { Panel, Tag } from './ui.js'

const CATEGORY_SHORT: Record<string, string> = { infantry: 'INF', artillery: 'ART', armour: 'ARM', aviation: 'AVI', naval: 'NAV', electronics: 'ELE' }

const shortId = (id: string): string => `#${id.match(/(\d+)$/)?.[1] ?? id}`
const reasonOf = (v: { ok: true } | { ok: false; reason: string }): string | null => (v.ok ? null : v.reason)

// Linjens gällande plan, med en köad ändring (PLAN i draften) före det som gäller nu.
function effectivePlan(state: GameState, draft: TurnSubmission, lineId: string): string[] {
  const queued = draft.standingOrders.find((c) => c.kind === 'PLAN' && c.lineId === lineId)
  if (queued && queued.kind === 'PLAN') return queued.op === 'CLEAR' ? [] : queued.contractIds
  return state.house.standingOrders?.plan?.[lineId]?.contractIds ?? []
}

function Segment({ seg, turn, horizon }: { seg: BoardSegment; turn: number; horizon: number }) {
  const start = Math.max(0, seg.start - turn)
  const end = Math.min(horizon, seg.end - turn)
  if (end <= start) return null
  const style = { left: `${(start / horizon) * 100}%`, width: `${((end - start) / horizon) * 100}%` }
  const cls = seg.kind === 'contract' ? `board-seg is-contract${seg.late ? ' is-late' : ''}` : seg.kind === 'setup' ? 'board-seg is-setup' : 'board-seg is-idle'
  const width = end - start
  return (
    <span
      className={cls}
      style={style}
      data-testid={seg.contractId ? `board-seg-${seg.contractId}` : undefined}
      {...(seg.kind === 'idle'
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': seg.kind === 'contract' ? `Contract ${shortId(seg.contractId ?? '')}${seg.late ? ', late' : ''}` : 'Retooling' })}
    >
      {seg.kind === 'contract' && <span className="board-seg-text">{shortId(seg.contractId ?? '')}</span>}
      {seg.kind === 'setup' && width >= 2 && <span className="board-seg-text">SETUP</span>}
    </span>
  )
}

function Track({ line, turn, horizon }: { line: BoardLine; turn: number; horizon: number }) {
  return (
    <div className="board-row" data-testid={`board-row-${line.lineId}`}>
      <span className="board-row-label">
        {line.lineId.replace('line-', 'L')}
        {line.category ? <span className="board-row-sub"> · {CATEGORY_SHORT[line.category]}</span> : null}
      </span>
      <span className="board-track">
        {line.segments.map((seg, i) => (
          <Segment key={`${seg.kind}-${seg.contractId ?? 'x'}-${i}`} seg={seg} turn={turn} horizon={horizon} />
        ))}
      </span>
    </div>
  )
}

export function ProductionBoard({
  state,
  draft,
  onSet,
  onRemove,
  focus = false,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
  onRemove: (key: string) => void
  focus?: boolean
}) {
  const board = productionBoard(state)
  const [open, setOpen] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus) boardRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [focus])
  const openContract = board.contracts.find((c) => c.contractId === open) ?? null
  const columns = Array.from({ length: board.horizon }, (_, i) => board.turn + i)

  return (
    <Panel
      title="Production board"
      info="One track per production line, the next six quarters across. Tap a contract to put it on a line or give part of it to a subcontractor."
      infoTopic="works"
      right={<Tag tone="neutral">next quarter</Tag>}
    >
      <div className={`board${focus ? ' is-focus' : ''}`} data-testid="production-board" ref={boardRef}>
        <div className="board-row board-head" aria-hidden="true">
          <span className="board-row-label" />
          <span className="board-track board-cols">
            {columns.map((t) => (
              <span className="board-col" key={t}>
                T{t}
              </span>
            ))}
          </span>
        </div>
        {board.lines.map((line) => (
          <Track key={line.lineId} line={line} turn={board.turn} horizon={board.horizon} />
        ))}
        {board.lines.length === 0 && <p className="empty">No production lines in operation.</p>}
      </div>

      <div className="board-contracts" data-testid="board-contracts">
        <span className="action-form-title">Contracts</span>
        {board.contracts.length === 0 ? (
          <p className="empty">No active contracts. Win a bid on CONTRACTS and it appears here.</p>
        ) : (
          board.contracts.map((c) => <ContractRow key={c.contractId} contract={c} onOpen={() => setOpen(c.contractId)} />)
        )}
      </div>

      <BottomSheet
        open={openContract !== null}
        title={openContract ? `Contract ${shortId(openContract.contractId)}` : ''}
        subtitle={openContract ? getProduct(openContract.productId).name : undefined}
        onClose={() => setOpen(null)}
        testId="contract-sheet"
      >
        {openContract && <ContractSheet state={state} draft={draft} board={board.lines} contract={openContract} onSet={onSet} onRemove={onRemove} onDone={() => setOpen(null)} />}
      </BottomSheet>
    </Panel>
  )
}

function whereText(c: BoardContract): string {
  if (c.subcontracted && c.sharePct >= 100) return 'All with a subcontractor'
  if (c.onLine) return `On ${c.line?.toUpperCase()}${c.sharePct > 0 ? `, ${c.sharePct}% outsourced` : ''}`
  if (c.line) return `Queued for ${c.line.toUpperCase()}${c.plannedOn ? ' (planned)' : ''}`
  return 'Waiting for a line'
}

function ContractRow({ contract: c, onOpen }: { contract: BoardContract; onOpen: () => void }) {
  return (
    <button type="button" className={`board-contract${c.late ? ' is-late' : ''}`} onClick={onOpen} data-testid={`board-contract-${c.contractId}`}>
      <span className="board-contract-head">
        <span className="board-contract-id">{shortId(c.contractId)}</span>
        <span className="board-contract-product">{getProduct(c.productId).name}</span>
        {c.late && <Tag tone="red">LATE</Tag>}
      </span>
      <span className="board-contract-meta">
        {c.remaining.toLocaleString('en-GB')} to build · due T{c.dueTurn} · {c.readyTurn !== null ? `ready T${c.readyTurn}` : 'no date'}
      </span>
      <span className="board-contract-meta">{whereText(c)}</span>
    </button>
  )
}

function ContractSheet({
  state,
  draft,
  board,
  contract,
  onSet,
  onRemove,
  onDone,
}: {
  state: GameState
  draft: TurnSubmission
  board: BoardLine[]
  contract: BoardContract
  onSet: (change: StandingOrderChange) => void
  onRemove: (key: string) => void
  onDone: () => void
}) {
  const id = contract.contractId
  const currentLine = board.find((l) => effectivePlan(state, draft, l.lineId).includes(id))?.lineId ?? 'auto'
  const [lineChoice, setLineChoice] = useState<string>(currentLine)
  const [share, setShare] = useState<string>(String(contract.sharePct))
  const pending = draft.standingOrders.filter(
    (c) =>
      (c.kind === 'PLAN' && (c.op === 'CLEAR' || c.contractIds.includes(id) || board.some((l) => l.lineId === c.lineId && l.plan.includes(id)))) ||
      (c.kind === 'OUTSOURCE' && c.contractId === id),
  )

  // Kontraktet dras till en linje: det tas ur andra linjers planer och läggs sist i den valda linjens plan. "Auto" tar bort det ur alla planer.
  const planChanges = (): StandingOrderChange[] => {
    const removals: StandingOrderChange[] = []
    const additions: StandingOrderChange[] = []
    for (const l of board) {
      const plan = effectivePlan(state, draft, l.lineId)
      const without = plan.filter((x) => x !== id)
      if (l.lineId === lineChoice) {
        if (!plan.includes(id)) additions.push({ kind: 'PLAN', op: 'SET', lineId: l.lineId, contractIds: [...without, id] })
      } else if (plan.includes(id)) {
        removals.push(without.length === 0 ? { kind: 'PLAN', op: 'CLEAR', lineId: l.lineId } : { kind: 'PLAN', op: 'SET', lineId: l.lineId, contractIds: without })
      }
    }
    // Borttagningarna först: ett kontrakt kan bara ligga i en plan, så den nya linjens SET godkänns först när det lämnat den gamla.
    return [...removals, ...additions]
  }
  const planList = planChanges()
  // Ändringarna avgörs i ordning (flytten tar först bort kontraktet ur den gamla planen): kontrollera dem i samma ordning mot ett läge där de föregående redan gäller.
  let sim = state
  let planReason: string | null = null
  for (const c of planList) {
    const reason = reasonOf(validateStandingOrderChange(sim, sim, c))
    if (reason !== null) {
      planReason = reason
      break
    }
    if (c.kind !== 'PLAN') continue
    const plan = { ...(sim.house.standingOrders?.plan ?? {}) }
    if (c.op === 'CLEAR') delete plan[c.lineId]
    else plan[c.lineId] = { contractIds: c.contractIds, sinceTurn: sim.meta.turn }
    sim = { ...sim, house: { ...sim.house, standingOrders: { ...sim.house.standingOrders, plan } } }
  }
  const planChanged = planList.length > 0

  const outChange: StandingOrderChange =
    Number(share) === 0 ? { kind: 'OUTSOURCE', op: 'CANCEL', contractId: id } : { kind: 'OUTSOURCE', op: 'SET', contractId: id, sharePct: Number(share) }
  const outValidation = validateStandingOrderChange(state, state, outChange)
  const outChanged = Number(share) !== contract.sharePct

  return (
    <div className="cf-body" data-testid="contract-card">
      <div className="action-card">
        <dl className="action-card-rows">
          <div className="action-card-row">
            <dt>To build</dt>
            <dd>
              {contract.remaining.toLocaleString('en-GB')} of {contract.quantity.toLocaleString('en-GB')} units
            </dd>
          </div>
          <div className="action-card-row">
            <dt>Due</dt>
            <dd className={contract.late ? 'is-red' : undefined}>
              T{contract.dueTurn}
              {contract.readyTurn !== null ? ` · ready T${contract.readyTurn}, delivered by T${contract.deliveredBy}` : ' · no ready date'}
              {contract.late ? ' — will be late' : ''}
            </dd>
          </div>
          <div className="action-card-row">
            <dt>Where</dt>
            <dd>{whereText(contract)}</dd>
          </div>
        </dl>
      </div>

      {pending.length > 0 && (
        <div data-testid="contract-queued">
          {pending.map((c) => (
            <div className="standing-pending" key={standingOrderKey(c)}>
              <Tag tone="amber">PENDING</Tag>
              <span className="standing-pending-text">
                {c.kind === 'PLAN'
                  ? c.op === 'CLEAR'
                    ? `${c.lineId.toUpperCase()} · plan cleared`
                    : `${c.lineId.toUpperCase()} · plan ${c.contractIds.map(shortId).join(' → ')}`
                  : c.kind === 'OUTSOURCE'
                    ? c.op === 'CANCEL'
                      ? 'Back to own lines'
                      : `${c.sharePct}% to a subcontractor`
                    : 'Queued'}
              </span>
              <button type="button" className="btn btn-ghost standing-undo" onClick={() => onRemove(standingOrderKey(c))}>
                undo
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="cf-field">
        <span className="cf-field-label">BUILD ON</span>
        <Segmented
          options={[{ value: 'auto', label: 'AUTO' }, ...board.map((l) => ({ value: l.lineId, label: l.lineId.replace('line-', 'L').toUpperCase() }))]}
          value={lineChoice}
          onChange={setLineChoice}
          testId="contract-line"
        />
        <p className="cf-hint">AUTO lets the house choose. A planned contract is built first on its line, in the order of the plan.</p>
        <Button
          variant="primary"
          disabled={!planChanged || planReason !== null}
          onClick={() => {
            for (const c of planList) onSet(c)
            onDone()
          }}
          testId="contract-plan-file"
        >
          SET PLAN
        </Button>
        {planReason && <p className="cf-hint is-warning">{planReason}</p>}
      </div>

      <div className="cf-field">
        <span className="cf-field-label">SUBCONTRACTOR</span>
        <Segmented
          options={[{ value: '0', label: 'OWN' }, ...OUTSOURCE_SHARES.map((s) => ({ value: String(s), label: `${s}%` }))]}
          value={share}
          onChange={setShare}
          testId="contract-share"
        />
        <p className="cf-hint">A subcontractor builds its share at a price and may be late. Your own lines build the rest.</p>
        <Button
          variant="secondary"
          disabled={!outChanged || !outValidation.ok}
          onClick={() => {
            onSet(outChange)
            onDone()
          }}
          testId="contract-outsource-file"
        >
          {Number(share) === 0 ? 'TAKE IT BACK' : 'OUTSOURCE'}
        </Button>
        {reasonOf(outValidation) && outChanged && <p className="cf-hint is-warning">{reasonOf(outValidation)}</p>}
      </div>
    </div>
  )
}
