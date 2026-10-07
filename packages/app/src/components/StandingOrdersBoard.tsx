// StandingOrdersBoard — P101 (ETAPP8_FORSLAG.md §5.2). Anslagstavlan i THE COMPANY: stående order som
// registerkort under tumstift, ett per produktionslinje, leverantörsavtal och station. Ett tryck vänder
// kortet; ändringar görs med Segmented och Stepper (regel 2) och köas i draften — de gäller från nästa
// kvartal och kostar ingen handling (skyddsräcke 6). Ett kort med larm får ett rött fettkritsstreck, och
// This Quarter (thisQuarter.ts) har en rad som hoppar hit med kortet öppet.
//
// Linjekorten visar SAMMA ProductionLineBand som P85 (en linje, en sanning). Validering går genom
// validateStandingOrderChange (samma funktion som applyActions), så SET är avstängd med orsaken i klartext
// i stället för att en avvisning dyker upp först efter End Quarter.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { COMMODITIES, DISPLAY_THRESHOLDS, TECH_CATEGORIES, allLines, kindLabel, standingStationMode, validateStandingOrderChange } from '@seventh-front/core'
import type { Commodity, GameState, LineShift, StandingOrderChange, StationMode, TechCategory, TurnSubmission } from '@seventh-front/core'
import { Button, Segmented, Stepper } from './designSystem.js'
import { ProductionLineBand } from './ProductionLineBand.js'
import { Panel, Tag, formatMoney } from './ui.js'
import { standingOrderAlarms, standingOrderKey } from '../standingOrderBoard.js'

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
  uranium: 'URAN',
  titanium: 'TITAN',
  rare_earths: 'RARE',
}

const MODE_HINT: Record<StationMode, string> = {
  quiet: 'Cheaper to keep, exposure falls, no new depth.',
  normal: 'Ordinary upkeep. Only your own operations move it.',
  active: 'Dearer to keep, builds depth — and exposure. Watch the burn threshold.',
}

const SUPPLY_VOLUME_MIN = 10_000
const SUPPLY_VOLUME_MAX = 200_000
const SUPPLY_VOLUME_STEP = 10_000
const SUPPLY_VOLUME_DEFAULT = 40_000

export function describeChange(change: StandingOrderChange): string {
  switch (change.kind) {
    case 'LINE':
      return `${change.category ? change.category.toUpperCase() : 'ANY PRODUCT'} · ${change.shift.toUpperCase()}`
    case 'SUPPLY':
      return change.op === 'CANCEL'
        ? `CANCEL ${COMMODITY_LABEL[change.commodity]} AGREEMENT`
        : `${COMMODITY_LABEL[change.commodity]} ${formatMoney(change.volumePerTurn)} × ${change.durationTurns}`
    case 'STATION':
      return change.mode.toUpperCase()
    case 'INVESTIGATION':
      return `${change.choice} · ${change.investigationId}`
    case 'TESTING':
      return change.op === 'CANCEL' ? `STOP TESTING ${change.designId}` : `TEST ${change.designId} · ${change.environment.toUpperCase()}`
    case 'DESIGN':
      return change.op === 'CANCEL'
        ? `CANCEL ${change.category.toUpperCase()} DESIGN`
        : `${change.category.toUpperCase()} DESIGN · ${change.focus.toUpperCase()} · ${change.ambition.toUpperCase()}${change.skunk ? ' · SKUNK WORKS' : ''}`
    case 'PROGRAMME':
      return change.op === 'SUBMIT' ? `SUBMIT ${change.designId} TO ${change.programmeId}` : `${change.op} ${change.programmeId}`
    case 'RESEARCH':
      return change.op === 'CANCEL' ? `CANCEL ${change.category.toUpperCase()} RESEARCH` : `${change.category.toUpperCase()} RESEARCH · ${change.pace.toUpperCase()}`
    case 'TRACE':
      return `${change.choice} · ${change.traceId}`
    case 'LEGAL':
      return change.op === 'CANCEL' ? 'DISMISS LEGAL COUNSEL' : 'RETAIN LEGAL COUNSEL'
    case 'CIVIL':
      return change.op === 'CANCEL' ? `CLOSE THE CIVIL ${change.category.toUpperCase()} LINE` : `OPEN A CIVIL ${change.category.toUpperCase()} LINE`
    case 'DESIGNER':
      return change.op === 'RELEASE' ? 'RELEASE THE CHIEF DESIGNER' : `HIRE ${change.designerId.toUpperCase()}`
    case 'LICENCE':
      return change.op === 'REVOKE' ? `REVOKE ${change.licenceId}` : `LICENCE ${change.designId} TO ${change.factionId.toUpperCase()}`
    case 'WORKS':
      // P170: bygge, utbyggnad, avveckling, markköp. Kort för tomten byggs i P179.
      if (change.op === 'BUILD') return `BUILD ${kindLabel(change.facilityKind).toUpperCase()}${change.category ? ` · ${change.category.toUpperCase()}` : ''}${change.forced ? ' · FORCED' : ''}`
      if (change.op === 'EXPAND') return `EXPAND ${change.facilityId.toUpperCase()}${change.forced ? ' · FORCED' : ''}`
      return change.op === 'SELL' ? `SELL ${change.facilityId.toUpperCase()}` : 'BUY MORE LAND'
    case 'PLAN':
      // P171: produktionsplanen. Planeringstavlan byggs i P180.
      return change.op === 'CLEAR' ? `${change.lineId.toUpperCase()} · AUTOMATIC ASSIGNMENT` : `${change.lineId.toUpperCase()} · ${change.contractIds.length === 0 ? 'AUTOMATIC ASSIGNMENT' : change.contractIds.join(' → ')}`
  }
}

export function BoardCard({
  className,
  id,
  title,
  alarm,
  open,
  onToggle,
  front,
  back,
  pending,
  onUndo,
  registerRef,
}: {
  className?: string
  id: string
  title: string
  alarm: string | null
  open: boolean
  onToggle: () => void
  front: ReactNode
  back: ReactNode
  pending: { key: string; text: string; undoId: string }[]
  onUndo: (key: string) => void
  registerRef: (id: string, el: HTMLDivElement | null) => void
}) {
  const classes = ['standing-card']
  if (className) classes.push(className)
  if (alarm) classes.push('has-alarm')
  if (open) classes.push('is-open')
  return (
    <div className={classes.join(' ')} data-testid={`standing-card-${id}`} ref={(el) => registerRef(id, el)}>
      <span className="standing-pin" aria-hidden="true" />
      <button
        type="button"
        className="standing-flip"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`standing-flip-${id}`}
      >
        <span className="standing-title">{title}</span>
        <span className="standing-flip-hint" aria-hidden="true">
          {open ? 'DONE' : 'FLIP'}
        </span>
      </button>
      {alarm && (
        <div className="standing-alarm" data-testid={`standing-alarm-${id}`}>
          <span aria-hidden="true">⚠</span> {alarm}
        </div>
      )}
      {pending.map((p) => (
        <div className="standing-pending" key={p.key}>
          <Tag tone="amber">PENDING</Tag>
          <span className="standing-pending-text">{p.text}</span>
          <button type="button" className="btn btn-ghost standing-undo" onClick={() => onUndo(p.key)} data-testid={`standing-undo-${p.undoId}`}>
            undo
          </button>
        </div>
      ))}
      {open ? <div className="standing-back" data-testid={`standing-back-${id}`}>{back}</div> : <div className="standing-front">{front}</div>}
    </div>
  )
}

export function StandingOrdersBoard({
  state,
  draft,
  onSet,
  onRemove,
  focusCard,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
  onRemove: (key: string) => void
  focusCard: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(focusCard)
  const refs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!focusCard) return
    setOpenId(focusCard)
    const el = refs.current.get(focusCard)
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [focusCard])

  const registerRef = (id: string, el: HTMLDivElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }

  const orders = state.house.standingOrders ?? { lines: {}, supply: [], stations: {} }
  const alarms = new Map(standingOrderAlarms(state).map((a) => [a.cardId, a.text]))
  const queued = draft.standingOrders
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id))
  const file = (change: StandingOrderChange) => {
    onSet(change)
    setOpenId(null)
  }
  const pendingFor = (match: (c: StandingOrderChange) => boolean, undoId: (c: StandingOrderChange) => string) =>
    queued.filter(match).map((c) => ({ key: standingOrderKey(c), text: describeChange(c), undoId: undoId(c) }))

  return (
    <Panel info="Orders that keep running every quarter: production lines, supplier contracts and station mode. They cost no action point." infoTopic="production" title="Standing orders" right={<Tag>from next quarter · no action point</Tag>}>
      <div className="standing-board" data-testid="standing-orders-board">
        <h3 className="standing-group">Lines</h3>
        <div className="standing-grid">
          {allLines(state.house).map((line) => {
            const current = orders.lines[line.id]
            const pending = pendingFor((c) => c.kind === 'LINE' && c.lineId === line.id, () => line.id)
            return (
              <BoardCard
                key={line.id}
                id={line.id}
                title={line.id.toUpperCase()}
                alarm={alarms.get(line.id) ?? null}
                open={openId === line.id}
                onToggle={() => toggle(line.id)}
                registerRef={registerRef}
                pending={pending}
                onUndo={onRemove}
                front={
                  <>
                    <ProductionLineBand state={state} line={line} />
                    <div className="standing-current">
                      {current ? (
                        <>
                          <span>{current.category ? current.category.toUpperCase() : 'ANY PRODUCT'}</span>
                          <span>{current.shift.toUpperCase()}</span>
                          {current.sinceTurn > state.meta.turn && <span>from T{current.sinceTurn}</span>}
                        </>
                      ) : (
                        <span>No standing order — automatic assignment</span>
                      )}
                    </div>
                  </>
                }
                back={<LineEditor state={state} lineId={line.id} onFile={file} initial={queued.find((c) => c.kind === 'LINE' && c.lineId === line.id) ?? null} />}
              />
            )
          })}
        </div>

        <h3 className="standing-group">Supply agreements</h3>
        <div className="standing-grid">
          {orders.supply.map((agreement) => {
            const id = `supply-${agreement.commodity}`
            const index = state.market.commodities[agreement.commodity]
            const pending = pendingFor((c) => c.kind === 'SUPPLY' && c.commodity === agreement.commodity, (c) => (c.kind === 'SUPPLY' ? c.commodity : ''))
            const gain = index >= agreement.lockedIndex
            return (
              <BoardCard
                key={id}
                id={id}
                title={`${COMMODITY_LABEL[agreement.commodity]} SUPPLY`}
                alarm={alarms.get(id) ?? null}
                open={openId === id}
                onToggle={() => toggle(id)}
                registerRef={registerRef}
                pending={pending}
                onUndo={onRemove}
                front={
                  <dl className="kv standing-kv">
                    <dt>Paid each quarter</dt>
                    <dd>{formatMoney(agreement.volumePerTurn)}</dd>
                    <dt>Locked / now</dt>
                    <dd className={gain ? 'is-green' : 'is-red'}>
                      {agreement.lockedIndex.toFixed(0)} / {index.toFixed(0)}
                    </dd>
                    <dt>Runs</dt>
                    <dd>
                      T{agreement.startTurn}–T{agreement.endTurn}
                    </dd>
                  </dl>
                }
                back={
                  <div className="cf-body">
                    <p className="cf-hint">Cancelling takes effect from next quarter; this quarter&apos;s payment is still made.</p>
                    <Button
                      variant="secondary"
                      onClick={() => file({ kind: 'SUPPLY', op: 'CANCEL', commodity: agreement.commodity })}
                      testId={`standing-cancel-${id}`}
                    >
                      Cancel agreement
                    </Button>
                  </div>
                }
              />
            )
          })}
          <BoardCard
            id="supply-new"
            title="+ NEW AGREEMENT"
            alarm={null}
            open={openId === 'supply-new'}
            onToggle={() => toggle('supply-new')}
            registerRef={registerRef}
            pending={pendingFor((c) => c.kind === 'SUPPLY' && c.op === 'SET', (c) => (c.kind === 'SUPPLY' ? c.commodity : ''))}
            onUndo={onRemove}
            front={<p className="cf-hint">Lock a raw-material price for 4–8 quarters. If the index rises you gain, if it falls you lose.</p>}
            back={<SupplyEditor state={state} onFile={file} />}
          />
        </div>

        <h3 className="standing-group">Stations</h3>
        <div className="standing-grid">
          {state.house.stations.map((station) => {
            const mode = standingStationMode(state.house, station.id, state.meta.turn)
            const pending = pendingFor((c) => c.kind === 'STATION' && c.stationId === station.id, () => station.id)
            return (
              <BoardCard
                key={station.id}
                id={station.id}
                title={`${station.city.toUpperCase()} STATION`}
                alarm={alarms.get(station.id) ?? null}
                open={openId === station.id}
                onToggle={() => toggle(station.id)}
                registerRef={registerRef}
                pending={pending}
                onUndo={onRemove}
                front={
                  <dl className="kv standing-kv">
                    <dt>Mode</dt>
                    <dd>{mode.toUpperCase()}</dd>
                    <dt>Depth / exposure</dt>
                    <dd>
                      {station.depth} / {station.exposure.toFixed(0)}
                    </dd>
                    <dt>Status</dt>
                    <dd>{station.status.toUpperCase()}</dd>
                  </dl>
                }
                back={<StationEditor state={state} stationId={station.id} onFile={file} initial={queued.find((c) => c.kind === 'STATION' && c.stationId === station.id) ?? null} />}
              />
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function reason(validation: { ok: true } | { ok: false; reason: string }): string | null {
  return validation.ok ? null : validation.reason
}

function LineEditor({
  state,
  lineId,
  onFile,
  initial,
}: {
  state: GameState
  lineId: string
  onFile: (change: StandingOrderChange) => void
  initial: StandingOrderChange | null
}) {
  const current = state.house.standingOrders?.lines[lineId]
  const seed = initial && initial.kind === 'LINE' ? initial : null
  const [category, setCategory] = useState<TechCategory | 'any'>(seed ? (seed.category ?? 'any') : (current?.category ?? 'any'))
  const [shift, setShift] = useState<LineShift>(seed ? seed.shift : (current?.shift ?? 'normal'))
  const change: StandingOrderChange = { kind: 'LINE', lineId, category: category === 'any' ? null : category, shift }
  const validation = validateStandingOrderChange(state, state, change)

  return (
    <div className="cf-body">
      <div className="cf-field">
        <span className="cf-field-label">CATEGORY</span>
        <Segmented
          options={[
            { value: 'any' as const, label: 'ANY' },
            ...TECH_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
          ]}
          value={category}
          onChange={setCategory}
          testId={`standing-category-${lineId}`}
        />
      </div>
      <div className="cf-field">
        <span className="cf-field-label">SHIFT</span>
        <Segmented
          options={[
            { value: 'normal' as const, label: 'NORMAL' },
            { value: 'overtime' as const, label: 'OVERTIME' },
          ]}
          value={shift}
          onChange={setShift}
          testId={`standing-shift-${lineId}`}
        />
      </div>
      <p className="cf-hint">
        {shift === 'overtime'
          ? `Overtime runs the line at ${DISPLAY_THRESHOLDS.overtimeCapacityPct} % capacity at a higher unit cost, with a small risk of breakdown.`
          : 'Normal shift: full capacity at ordinary cost.'}
      </p>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onFile(change)} testId={`standing-set-${lineId}`}>
        SET
      </Button>
      {reason(validation) && <p className="cf-hint is-warning">{reason(validation)}</p>}
    </div>
  )
}

function SupplyEditor({ state, onFile }: { state: GameState; onFile: (change: StandingOrderChange) => void }) {
  const [commodity, setCommodity] = useState<Commodity>('oil')
  const [volume, setVolume] = useState(SUPPLY_VOLUME_DEFAULT)
  const [duration, setDuration] = useState(Math.round((DISPLAY_THRESHOLDS.supplyAgreementMinTurns + DISPLAY_THRESHOLDS.supplyAgreementMaxTurns) / 2))
  const change: StandingOrderChange = { kind: 'SUPPLY', op: 'SET', commodity, volumePerTurn: volume, durationTurns: duration }
  const validation = validateStandingOrderChange(state, state, change)
  const index = state.market.commodities[commodity]

  return (
    <div className="cf-body">
      <div className="cf-field">
        <span className="cf-field-label">COMMODITY</span>
        <Segmented
          options={COMMODITIES.map((c) => ({ value: c, label: COMMODITY_LABEL[c] }))}
          value={commodity}
          onChange={setCommodity}
          testId="standing-commodity"
        />
      </div>
      <Stepper
        label="Volume per quarter"
        value={volume}
        min={SUPPLY_VOLUME_MIN}
        max={SUPPLY_VOLUME_MAX}
        step={SUPPLY_VOLUME_STEP}
        onChange={setVolume}
        format={formatMoney}
        testId="standing-volume"
      />
      <Stepper
        label="Duration"
        value={duration}
        min={DISPLAY_THRESHOLDS.supplyAgreementMinTurns}
        max={DISPLAY_THRESHOLDS.supplyAgreementMaxTurns}
        onChange={setDuration}
        format={(v) => `${v} quarters`}
        testId="standing-duration"
      />
      <p className="cf-hint">
        Locks {COMMODITY_LABEL[commodity]} at index {index.toFixed(0)}. You pay {formatMoney(volume)} every quarter for {duration}{' '}
        quarters and receive materials worth that × (index now ÷ locked).
      </p>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onFile(change)} testId="standing-set-supply-new">
        SET
      </Button>
      {reason(validation) && <p className="cf-hint is-warning">{reason(validation)}</p>}
    </div>
  )
}

function StationEditor({
  state,
  stationId,
  onFile,
  initial,
}: {
  state: GameState
  stationId: string
  onFile: (change: StandingOrderChange) => void
  initial: StandingOrderChange | null
}) {
  const seed = initial && initial.kind === 'STATION' ? initial.mode : null
  const [mode, setMode] = useState<StationMode>(seed ?? standingStationMode(state.house, stationId, state.meta.turn))
  const change: StandingOrderChange = { kind: 'STATION', stationId, mode }
  const validation = validateStandingOrderChange(state, state, change)

  return (
    <div className="cf-body">
      <div className="cf-field">
        <span className="cf-field-label">MODE</span>
        <Segmented
          options={[
            { value: 'quiet' as const, label: 'QUIET' },
            { value: 'normal' as const, label: 'NORMAL' },
            { value: 'active' as const, label: 'ACTIVE' },
          ]}
          value={mode}
          onChange={setMode}
          testId={`standing-mode-${stationId}`}
        />
      </div>
      <p className="cf-hint">{MODE_HINT[mode]}</p>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onFile(change)} testId={`standing-set-${stationId}`}>
        SET
      </Button>
      {reason(validation) && <p className="cf-hint is-warning">{reason(validation)}</p>}
    </div>
  )
}
