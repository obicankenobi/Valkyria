// WorksPlan — P179 (ETAPP11_FORSLAG.md §8 punkt 1–2): THE WORKS. En ritad situationsplan över hemmatomten (tillgångsfabrikens markplan och byggnader, P178) med en knapp
// över varje plats. Byggnaden visar med en lampa om den går, står eller bygger; ett tryck öppnar anläggningens kort, ett tryck på en tom plats öppnar byggmenyn. Alla tal kommer
// ur `facilityCard`/`worksBuildOptions` (kärnan) — inget räknas om här. Ändringar är stående order: de köas i draften, gäller från nästa kvartal och kostar ingen handling.
// Lampor, namn och nivå är riktig text och form ovanpå ritningen (ingen text i konsten).
import { useEffect, useState } from 'react'
import {
  MAINTENANCE_LEVELS,
  STAFFING_STEPS,
  facilityCard,
  getProduct,
  validateStandingOrderChange,
  worksAbroadOptions,
  worksBuildOptions,
  worksSite,
  allLines,
  buildLoanTerms,
  cashPartOf,
} from '@seventh-front/core'
import type { BuildOption, FacilityCardData, FacilityKind, GameState, MaintenanceLevel, StandingOrderChange, TechCategory, TurnSubmission } from '@seventh-front/core'
import { standingOrderKey } from '../standingOrderBoard.js'
import { SLOT_GEOMETRY, groundAsset, groundHeight, slotRect } from '../worksLayout.js'
import { BottomSheet, Button, Segmented, Stepper } from './designSystem.js'
import { Panel, Tag, formatMoney } from './ui.js'

const SHORT: Record<FacilityKind, string> = {
  assembly: 'ASSEMBLY',
  component: 'COMPONENT',
  laboratory: 'LAB',
  design: 'DESIGN',
  proving: 'PROVING',
  depot: 'DEPOT',
  civil: 'CIVIL',
}

const CATEGORY_SHORT: Record<TechCategory, string> = {
  infantry: 'INF',
  artillery: 'ART',
  armour: 'ARM',
  aviation: 'AVI',
  naval: 'NAV',
  electronics: 'ELE',
}
const CATEGORIES: TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

const LAMP_TEXT = {
  running: 'Running',
  standing: 'Standing',
  building: 'Building',
} as const

const STOCK_STEP = 5
const STOCK_MAX = 60

type WorksChange = Extract<StandingOrderChange, { kind: 'WORKS' }>
type Sheet = { type: 'facility'; id: string } | { type: 'build' } | null

const reasonOf = (v: { ok: true } | { ok: false; reason: string }): string | null => (v.ok ? null : v.reason)

// Köade ändringar som gäller en anläggning (för att visa dem och låta spelaren ångra).
function changesFor(draft: TurnSubmission, facilityId: string): StandingOrderChange[] {
  return draft.standingOrders.filter((c) => {
    if (c.kind === 'WORKS') return c.op !== 'BUILD' && c.op !== 'BUY_LAND' && c.facilityId === facilityId
    if (c.kind === 'WORKFORCE' || c.kind === 'MAINTENANCE') return c.facilityId === facilityId
    return false
  })
}

function describeQueued(change: StandingOrderChange): string {
  switch (change.kind) {
    case 'WORKS':
      if (change.op === 'BUILD')
        return `Build ${change.facilityKind}${change.category ? ` (${change.category})` : ''}${change.abroad ? ` in ${change.abroad.toUpperCase()}` : ''}${change.forced ? ', forced' : ''}${change.financing === 'loan' ? ', on a building loan' : ''}`
      if (change.op === 'BUY_LAND') return 'Buy more land'
      return `${change.op === 'EXPAND' ? 'Expand' : change.op === 'MODERNISE' ? 'Modernise' : 'Sell'}${'forced' in change && change.forced ? ', forced' : ''}${'financing' in change && change.financing === 'loan' ? ', on a building loan' : ''}`
    case 'WORKFORCE':
      return change.op === 'SET' ? `Staffing to ${change.staffing}%` : `Strike: ${change.response === 'concede' ? 'give in' : 'break it'}`
    case 'MAINTENANCE':
      return `Maintenance ${change.level}`
    default:
      return 'Queued'
  }
}

export function WorksPlan({
  state,
  draft,
  onSet,
  onRemove,
  focusId = null,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
  onRemove: (key: string) => void
  // P180: ett larm i This Quarter hoppar hit med anläggningens id — kortet öppnas.
  focusId?: string | null
}) {
  const [sheet, setSheet] = useState<Sheet>(focusId && state.house.works.some((w) => w.id === focusId) ? { type: 'facility', id: focusId } : null)
  useEffect(() => {
    if (focusId && state.house.works.some((w) => w.id === focusId)) setSheet({ type: 'facility', id: focusId })
  }, [focusId])
  const site = worksSite(state)
  const queuedBuilds = draft.standingOrders.filter((c): c is WorksChange & { op: 'BUILD' } => c.kind === 'WORKS' && c.op === 'BUILD' && !c.abroad)
  const landQueued = draft.standingOrders.some((c) => c.kind === 'WORKS' && c.op === 'BUY_LAND')
  const slots = site.slots
  const height = groundHeight(slots)
  const used = site.homeWorks.length + queuedBuilds.length
  const file = (change: StandingOrderChange) => {
    onSet(change)
    setSheet(null)
  }
  const pct = (n: number, of: number) => `${(n / of) * 100}%`

  const slotStyle = (i: number) => {
    const r = slotRect(i)
    return {
      left: pct(r.x, SLOT_GEOMETRY.plotWidth),
      top: pct(r.y, height),
      width: pct(r.width, SLOT_GEOMETRY.plotWidth),
      height: pct(r.height, height),
    }
  }

  const alarmed = (c: FacilityCardData): boolean => c.status === 'strike' || c.conditionLow || (c.staffing?.strikeRisk ?? false)

  return (
    <Panel
      title="The Works"
      info="Your plot: every building you own, with a lamp for whether it runs, stands or is being built. Tap a building for its card, tap an empty plot to build."
      infoTopic="works"
      right={<Tag tone={used >= slots ? 'amber' : 'neutral'}>{`${used}/${slots} plots`}</Tag>}
    >
      <div className="works-plan" style={{ aspectRatio: `${SLOT_GEOMETRY.plotWidth} / ${height}` }} data-testid="works-plan">
        <img className="works-ground" src={groundAsset(slots)} alt="" aria-hidden="true" draggable={false} />
        {Array.from({ length: slots }, (_, i) => {
          const facility = site.homeWorks[i]
          if (facility) {
            const card = facilityCard(state, facility.id)!
            const sprite = facility.status === 'under_construction' ? 'site' : facility.kind
            return (
              <button
                key={facility.id}
                type="button"
                className={`works-slot is-built${alarmed(card) ? ' has-alarm' : ''}`}
                style={slotStyle(i)}
                onClick={() => setSheet({ type: 'facility', id: facility.id })}
                aria-label={`${card.label}${card.category ? `, ${card.category}` : ''}, level ${card.level}, ${LAMP_TEXT[card.lamp].toLowerCase()}`}
                data-testid={`works-slot-${facility.id}`}
              >
                <img className="works-sprite" src={`/art/works/${sprite}.svg`} alt="" aria-hidden="true" draggable={false} />
                <span className={`works-lamp is-${card.lamp}`} aria-hidden="true" />
                <span className="works-slot-label">
                  <span className="works-slot-name">{SHORT[facility.kind]}</span>
                  <span className="works-slot-sub">
                    L{card.level}
                    {card.category ? ` · ${CATEGORY_SHORT[card.category]}` : ''}
                  </span>
                </span>
              </button>
            )
          }
          const queued = queuedBuilds[i - site.homeWorks.length]
          if (queued) {
            return (
              <button
                key={`queued-${i}`}
                type="button"
                className="works-slot is-queued"
                style={slotStyle(i)}
                onClick={() => onRemove(standingOrderKey(queued))}
                aria-label={`Queued: build ${queued.facilityKind}. Tap to undo.`}
                data-testid={`works-slot-queued-${i}`}
              >
                <img className="works-sprite" src="/art/works/site.svg" alt="" aria-hidden="true" draggable={false} />
                <span className="works-slot-label">
                  <span className="works-slot-name">{SHORT[queued.facilityKind]}</span>
                  <span className="works-slot-sub">QUEUED · UNDO</span>
                </span>
              </button>
            )
          }
          return (
            <button
              key={`free-${i}`}
              type="button"
              className="works-slot is-free"
              style={slotStyle(i)}
              onClick={() => setSheet({ type: 'build' })}
              aria-label="Empty plot. Tap to build."
              data-testid={`works-slot-free-${i}`}
            >
              <img className="works-sprite" src="/art/works/empty.svg" alt="" aria-hidden="true" draggable={false} />
              <span className="works-slot-label">
                <span className="works-slot-name">FREE</span>
                <span className="works-slot-sub">+ BUILD</span>
              </span>
            </button>
          )
        })}
      </div>

      <ul className="works-legend" aria-label="Lamp key">
        {(['running', 'standing', 'building'] as const).map((lamp) => (
          <li key={lamp}>
            <span className={`works-lamp is-${lamp}`} aria-hidden="true" /> {LAMP_TEXT[lamp]}
          </li>
        ))}
      </ul>

      {site.abroad.length > 0 && (
        <div className="works-abroad" data-testid="works-abroad">
          <span className="action-form-title">Abroad</span>
          {site.abroad.map((f) => {
            const card = facilityCard(state, f.id)!
            return (
              <button key={f.id} type="button" className="works-abroad-row" onClick={() => setSheet({ type: 'facility', id: f.id })} data-testid={`works-slot-${f.id}`}>
                <span className={`works-lamp is-${card.lamp}`} aria-hidden="true" />
                <span>
                  {card.label} · {(f.location ?? '').toUpperCase()} · L{card.level}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!site.landBought && <LandBuy state={state} queued={landQueued} landCost={site.landCost} landSlots={site.landSlots} onFile={onSet} onUndo={() => onRemove('works-land')} />}

      <BottomSheet
        open={sheet?.type === 'facility'}
        title={sheet?.type === 'facility' ? (facilityCard(state, sheet.id)?.label ?? 'Facility') : ''}
        subtitle={sheet?.type === 'facility' ? facilitySubtitle(facilityCard(state, sheet.id)) : undefined}
        onClose={() => setSheet(null)}
        testId="facility-sheet"
      >
        {sheet?.type === 'facility' && <FacilitySheet state={state} draft={draft} facilityId={sheet.id} onFile={file} onUndo={onRemove} />}
      </BottomSheet>

      <BottomSheet open={sheet?.type === 'build'} title="Build" subtitle={`${slots - used} free plots`} onClose={() => setSheet(null)} testId="build-sheet">
        {sheet?.type === 'build' && <BuildMenu state={state} onFile={file} />}
      </BottomSheet>
    </Panel>
  )
}

function facilitySubtitle(card: FacilityCardData | null): string | undefined {
  if (!card) return undefined
  return `${card.category ? `${card.category.toUpperCase()} · ` : ''}${card.location ? `${card.location.toUpperCase()} · ` : ''}Level ${card.level} of ${card.maxLevel}`
}

function LandBuy({
  state,
  queued,
  landCost,
  landSlots,
  onFile,
  onUndo,
}: {
  state: GameState
  queued: boolean
  landCost: number
  landSlots: number
  onFile: (c: StandingOrderChange) => void
  onUndo: () => void
}) {
  const change: StandingOrderChange = { kind: 'WORKS', op: 'BUY_LAND' }
  const validation = validateStandingOrderChange(state, state, change)
  return (
    <div className="works-land" data-testid="works-land">
      <p className="cf-hint">
        The plot holds eight buildings. More land costs {formatMoney(landCost)} once and adds {landSlots} plots.
      </p>
      {queued ? (
        <Button variant="secondary" onClick={onUndo} testId="works-land-undo">
          UNDO LAND PURCHASE
        </Button>
      ) : (
        <Button variant="secondary" disabled={!validation.ok} onClick={() => onFile(change)} testId="works-land-buy">
          BUY MORE LAND
        </Button>
      )}
      {reasonOf(validation) && !queued && <p className="cf-hint is-warning">{reasonOf(validation)}</p>}
    </div>
  )
}

// ── Anläggningskortet (samma mall som handlingskortet i P163: en mening, rader, och vad man kan göra) ──
function FacilitySheet({
  state,
  draft,
  facilityId,
  onFile,
  onUndo,
}: {
  state: GameState
  draft: TurnSubmission
  facilityId: string
  onFile: (c: StandingOrderChange) => void
  onUndo: (key: string) => void
}) {
  const card = facilityCard(state, facilityId)
  if (!card) return <p className="empty">This building is gone.</p>
  const queued = changesFor(draft, facilityId)
  return (
    <div className="facility-card" data-testid="facility-card">
      <div className="action-card">
        <div className="action-card-head">
          <span className="action-card-icon" aria-hidden="true">
            <img src={`/art/works/${card.kind}.svg`} alt="" />
          </span>
          <p className="action-card-does" data-testid="facility-does">
            {card.does}
          </p>
        </div>
        <dl className="action-card-rows">
          <div className="action-card-row">
            <dt>Status</dt>
            <dd data-testid="facility-status">
              <span className={`works-lamp is-${card.lamp}`} aria-hidden="true" /> {LAMP_TEXT[card.lamp]} — {card.activity}
            </dd>
          </div>
          {card.build && (
            <div className="action-card-row">
              <dt>Building</dt>
              <dd>
                {card.build.modernise ? 'Modernisation' : `To level ${card.build.toLevel}`} · {card.build.turnsLeft} of {card.build.turnsTotal} quarters left ·{' '}
                {formatMoney(card.build.costPerTurn)} a quarter
              </dd>
            </div>
          )}
          {card.condition !== null && (
            <div className="action-card-row">
              <dt>Condition</dt>
              <dd className={card.conditionLow ? 'is-red' : undefined} data-testid="facility-condition">
                {Math.round(card.condition)} / 100 · maintenance {card.maintenance}
                {card.machineLevel > 0 ? ` · modernised ×${card.machineLevel}` : ''}
              </dd>
            </div>
          )}
          {card.staffing && (
            <div className="action-card-row">
              <dt>Staff</dt>
              <dd data-testid="facility-staffing">
                {card.staffing.current}% of full strength
                {card.staffing.target !== null ? ` → ${card.staffing.target}%` : ''} · skill {Math.round(card.staffing.skill)} · morale {Math.round(card.staffing.morale)}
                {card.staffing.strikeRisk ? ' — strike risk' : ''}
              </dd>
            </div>
          )}
          <div className="action-card-row">
            <dt>Cost</dt>
            <dd data-testid="facility-cost">
              {formatMoney(card.fixedCost)} a quarter fixed
              {card.wage > 0 ? `, ${formatMoney(card.wage)} wages` : ''}
            </dd>
          </div>
          <div className="action-card-row">
            <dt>Next level</dt>
            <dd data-testid="facility-next">
              {card.next
                ? `Level ${card.next.level}: ${card.next.gives}. ${formatMoney(card.next.cost)} over ${card.next.turns} quarters, then ${formatMoney(card.next.fixedCost)} a quarter fixed.`
                : card.build
                  ? 'Being built now.'
                  : 'This is the highest level.'}
            </dd>
          </div>
        </dl>
      </div>

      {card.loan && (
        <div className="loan-card" data-testid="facility-loan">
          <span className="loan-card-title">Building loan</span>
          <p className="loan-card-line" data-testid="facility-loan-outstanding">
            {formatMoney(card.loan.outstanding)} outstanding of {formatMoney(card.loan.principal)} drawn. The works is the security.
          </p>
          <p className="loan-card-line" data-testid="facility-loan-payment">
            {card.loan.amortFromTurn === null || card.loan.amortFromTurn > state.meta.turn
              ? `Interest ${formatMoney(card.loan.interest)} a quarter; repayments start the quarter after it opens.`
              : `Interest ${formatMoney(card.loan.interest)} and repayment ${formatMoney(card.loan.amortisation)} a quarter${card.loan.turnsLeft !== null ? `, ${card.loan.turnsLeft} left` : ''}.`}
          </p>
          <p className="loan-card-line is-warning">Miss a payment and the bank seizes the works, its lines and its workforce.</p>
        </div>
      )}

      {queued.length > 0 && (
        <div className="facility-queued" data-testid="facility-queued">
          {queued.map((c) => (
            <div className="standing-pending" key={standingOrderKey(c)}>
              <Tag tone="amber">PENDING</Tag>
              <span className="standing-pending-text">{describeQueued(c)}</span>
              <button type="button" className="btn btn-ghost standing-undo" onClick={() => onUndo(standingOrderKey(c))}>
                undo
              </button>
            </div>
          ))}
        </div>
      )}

      <FacilityActions state={state} card={card} onFile={onFile} />
    </div>
  )
}

function FacilityActions({ state, card, onFile }: { state: GameState; card: FacilityCardData; onFile: (c: StandingOrderChange) => void }) {
  const [forced, setForced] = useState<'normal' | 'forced'>('normal')
  const [financing, setFinancing] = useState<'cash' | 'loan'>('cash')
  const [staffing, setStaffing] = useState<string>(String(card.staffing?.target ?? card.staffing?.current ?? 100))
  const [level, setLevel] = useState<MaintenanceLevel>(card.maintenance ?? 'normal')
  const id = card.id
  const isForced = forced === 'forced'
  const expand: StandingOrderChange = {
    kind: 'WORKS',
    op: 'EXPAND',
    facilityId: id,
    ...(isForced ? { forced: true } : {}),
    ...(financing === 'loan' ? { financing: 'loan' as const } : {}),
  }
  const modernise: StandingOrderChange = {
    kind: 'WORKS',
    op: 'MODERNISE',
    facilityId: id,
    ...(isForced ? { forced: true } : {}),
  }
  const sell: StandingOrderChange = {
    kind: 'WORKS',
    op: 'SELL',
    facilityId: id,
  }
  const setStaffingChange: StandingOrderChange = {
    kind: 'WORKFORCE',
    op: 'SET',
    facilityId: id,
    staffing: Number(staffing),
  }
  const setMaintenance: StandingOrderChange = {
    kind: 'MAINTENANCE',
    facilityId: id,
    level,
  }
  const v = (c: StandingOrderChange) => validateStandingOrderChange(state, state, c)

  return (
    <div className="cf-body facility-actions">
      {(card.next || card.canModernise) && (
        <div className="cf-field">
          <span className="cf-field-label">BUILD PACE</span>
          <Segmented
            options={[
              { value: 'normal' as const, label: 'NORMAL' },
              {
                value: 'forced' as const,
                label: 'FORCED · HALF TIME, DOUBLE COST',
              },
            ]}
            value={forced}
            onChange={setForced}
            testId="facility-pace"
          />
        </div>
      )}
      {card.next && (
        <div className="cf-field">
          <span className="cf-field-label">PAID FOR</span>
          <FinancingPicker value={financing} onChange={setFinancing} testId="facility-financing" />
          {financing === 'loan' && <p className="cf-hint">{loanHint(card.next.firstInstalment)}</p>}
        </div>
      )}
      {card.next && (
        <>
          <Button variant="primary" disabled={!v(expand).ok} onClick={() => onFile(expand)} testId="facility-expand">
            EXPAND TO LEVEL {card.next.level}
          </Button>
          {reasonOf(v(expand)) && <p className="cf-hint is-warning">{reasonOf(v(expand))}</p>}
        </>
      )}
      {card.canModernise && (
        <>
          <Button variant="secondary" disabled={!v(modernise).ok} onClick={() => onFile(modernise)} testId="facility-modernise">
            MODERNISE THE MACHINES
          </Button>
          {reasonOf(v(modernise)) && <p className="cf-hint is-warning">{reasonOf(v(modernise))}</p>}
        </>
      )}

      {card.staffing && card.status === 'strike' && (
        <div className="cf-field">
          <span className="cf-field-label">STRIKE</span>
          <div className="facility-strike">
            <Button
              variant="secondary"
              onClick={() =>
                onFile({
                  kind: 'WORKFORCE',
                  op: 'STRIKE',
                  facilityId: id,
                  response: 'concede',
                })
              }
              testId="facility-strike-concede"
            >
              GIVE IN
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                onFile({
                  kind: 'WORKFORCE',
                  op: 'STRIKE',
                  facilityId: id,
                  response: 'break',
                })
              }
              testId="facility-strike-break"
            >
              BREAK IT
            </Button>
          </div>
          <p className="cf-hint">Giving in costs money now and a higher wage for good. Breaking it costs morale across the works and your good name.</p>
        </div>
      )}
      {card.staffing && card.status !== 'strike' && card.status !== 'under_construction' && (
        <div className="cf-field">
          <span className="cf-field-label">STAFFING</span>
          <Segmented
            options={STAFFING_STEPS.map((s) => ({
              value: String(s),
              label: `${s}%`,
            }))}
            value={staffing}
            onChange={setStaffing}
            testId="facility-staffing-set"
          />
          <p className="cf-hint">Hiring takes a quarter and dilutes skill. Laying off saves wages but takes skill and morale with it.</p>
          <Button
            variant="secondary"
            disabled={!v(setStaffingChange).ok || Number(staffing) === (card.staffing.target ?? card.staffing.current)}
            onClick={() => onFile(setStaffingChange)}
            testId="facility-staffing-file"
          >
            SET STAFFING
          </Button>
          {reasonOf(v(setStaffingChange)) && <p className="cf-hint is-warning">{reasonOf(v(setStaffingChange))}</p>}
        </div>
      )}
      {card.maintenance && card.status !== 'under_construction' && (
        <div className="cf-field">
          <span className="cf-field-label">MAINTENANCE</span>
          <Segmented
            options={MAINTENANCE_LEVELS.map((l) => ({
              value: l,
              label: l.toUpperCase(),
            }))}
            value={level}
            onChange={setLevel}
            testId="facility-maintenance-set"
          />
          <p className="cf-hint">Low saves money now and wears the machines. High builds the condition back up at a higher fixed cost.</p>
          <Button variant="secondary" disabled={!v(setMaintenance).ok || level === card.maintenance} onClick={() => onFile(setMaintenance)} testId="facility-maintenance-file">
            SET MAINTENANCE
          </Button>
        </div>
      )}

      {card.kind === 'depot' && card.status === 'operating' && <DepotEditor state={state} onFile={onFile} />}

      {card.status !== 'under_construction' && (
        <div className="cf-field">
          <Button variant="ghost" disabled={!v(sell).ok} onClick={() => onFile(sell)} testId="facility-sell">
            SELL FOR {formatMoney(card.sellValue)}
          </Button>
          {reasonOf(v(sell)) && <p className="cf-hint is-warning">{reasonOf(v(sell))}</p>}
        </div>
      )}
    </div>
  )
}

// Depåns lagermål: en produkt, ett mål i enheter. Produkterna är de en linje redan är uppsatt för (lager ger ingen omställning, P175).
function DepotEditor({ state, onFile }: { state: GameState; onFile: (c: StandingOrderChange) => void }) {
  const products = Array.from(new Set(allLines(state.house).flatMap((l) => (l.tooling ? [l.tooling.productId] : []))))
  const [productId, setProductId] = useState<string>(products[0] ?? '')
  const current = state.house.standingOrders?.stock?.[productId]
  const [target, setTarget] = useState(current?.targetUnits ?? 10)
  if (products.length === 0) return <p className="cf-hint">Set a production line up for a product, and it can build to stock here.</p>
  const set: StandingOrderChange = {
    kind: 'STOCK',
    op: 'SET',
    productId,
    targetUnits: target,
  }
  const cancel: StandingOrderChange = {
    kind: 'STOCK',
    op: 'CANCEL',
    productId,
  }
  const validation = validateStandingOrderChange(state, state, set)
  return (
    <div className="cf-field" data-testid="depot-editor">
      <span className="cf-field-label">BUILD TO STOCK</span>
      <Segmented
        options={products.map((p) => ({
          value: p,
          label: getProduct(p).name.toUpperCase(),
        }))}
        value={productId}
        onChange={setProductId}
        testId="depot-product"
      />
      <Stepper label="Target" value={target} min={STOCK_STEP} max={STOCK_MAX} step={STOCK_STEP} onChange={setTarget} format={(n) => `${n} units`} testId="depot-target" />
      <p className="cf-hint">Idle lines build this for the shelf. Stock costs a share of its value to keep and ages when the blocs move on.</p>
      <Button variant="secondary" disabled={!validation.ok} onClick={() => onFile(set)} testId="depot-set">
        BUILD TO STOCK
      </Button>
      {current && (
        <Button variant="ghost" onClick={() => onFile(cancel)} testId="depot-cancel">
          STOP BUILDING TO STOCK
        </Button>
      )}
      {reasonOf(validation) && <p className="cf-hint is-warning">{reasonOf(validation)}</p>}
    </div>
  )
}

// ── Byggmenyn: ett val per slag, sedan kategori, byggtakt och bekräftelse ──
// P185 (11Q): kontant eller byggnadslån. Villkoren kommer ur kärnan (buildLoanTerms, cashPartOf) — inget räknas om här.
function FinancingPicker({ value, onChange, testId }: { value: 'cash' | 'loan'; onChange: (v: 'cash' | 'loan') => void; testId: string }) {
  return (
    <Segmented
      options={[
        { value: 'cash' as const, label: 'CASH' },
        { value: 'loan' as const, label: 'BUILDING LOAN' },
      ]}
      value={value}
      onChange={onChange}
      testId={testId}
    />
  )
}

function loanHint(firstInstalment: number): string {
  const terms = buildLoanTerms()
  const cash = cashPartOf(firstInstalment, 'loan')
  return `The bank lends ${terms.sharePct}% of each instalment (cash now ${formatMoney(cash)} of the first ${formatMoney(firstInstalment)}), outside your credit limit. Interest ${Math.round(terms.rateAnnual * 100)}% a year; repaid in ${terms.amortTurns} equal quarters once the works opens. The works is the security.`
}

function BuildMenu({ state, onFile }: { state: GameState; onFile: (c: StandingOrderChange) => void }) {
  const options = worksBuildOptions(state)
  const abroad = worksAbroadOptions(state)
  const [kind, setKind] = useState<FacilityKind | 'abroad' | null>(null)
  if (kind === null) {
    return (
      <div className="build-menu" data-testid="build-menu">
        <p className="cf-hint">Choose a building. It takes a few quarters, paid in instalments, and takes one plot.</p>
        {options.map((o) => (
          <button key={o.kind} type="button" className="build-menu-row" onClick={() => setKind(o.kind)} data-testid={`build-option-${o.kind}`}>
            <img className="build-menu-sprite" src={`/art/works/${o.kind}.svg`} alt="" aria-hidden="true" />
            <span className="build-menu-text">
              <span className="build-menu-name">{o.label}</span>
              <span className="build-menu-does">{o.does}</span>
              <span className="build-menu-cost">
                {formatMoney(o.cost)} · {o.turns} quarters
                {o.blockedReason ? ` · ${o.blockedReason}` : ''}
              </span>
            </span>
          </button>
        ))}
        {abroad.length > 0 && (
          <button type="button" className="build-menu-row" onClick={() => setKind('abroad')} data-testid="build-option-abroad">
            <img className="build-menu-sprite" src="/art/works/assembly.svg" alt="" aria-hidden="true" />
            <span className="build-menu-text">
              <span className="build-menu-name">Assembly works abroad</span>
              <span className="build-menu-does">Build in a buyer&apos;s country: lower wages and quicker deliveries, at the risk of war and nationalisation.</span>
            </span>
          </button>
        )}
      </div>
    )
  }
  if (kind === 'abroad') return <AbroadMenu state={state} onBack={() => setKind(null)} onFile={onFile} />
  const option = options.find((o) => o.kind === kind)!
  return <BuildDetail state={state} option={option} onBack={() => setKind(null)} onFile={onFile} />
}

function BuildDetail({ state, option, onBack, onFile }: { state: GameState; option: BuildOption; onBack: () => void; onFile: (c: StandingOrderChange) => void }) {
  const firstFree = option.categories.find((c) => c.blockedReason === null)?.category ?? CATEGORIES[0]!
  const [category, setCategory] = useState<TechCategory>(firstFree)
  const [pace, setPace] = useState<'normal' | 'forced'>('normal')
  const [financing, setFinancing] = useState<'cash' | 'loan'>('cash')
  const forced = pace === 'forced'
  const change: StandingOrderChange = {
    kind: 'WORKS',
    op: 'BUILD',
    facilityKind: option.kind,
    ...(option.needsCategory ? { category } : {}),
    ...(forced ? { forced: true } : {}),
    ...(financing === 'loan' ? { financing: 'loan' as const } : {}),
  }
  const validation = validateStandingOrderChange(state, state, change)
  return (
    <div className="build-detail" data-testid="build-detail">
      <Button variant="ghost" onClick={onBack} testId="build-back">
        ← ALL BUILDINGS
      </Button>
      <div className="action-card">
        <div className="action-card-head">
          <span className="action-card-icon" aria-hidden="true">
            <img src={`/art/works/${option.kind}.svg`} alt="" />
          </span>
          <p className="action-card-does">{option.does}</p>
        </div>
        <dl className="action-card-rows">
          <div className="action-card-row">
            <dt>Level 1</dt>
            <dd>{option.gives}</dd>
          </div>
          <div className="action-card-row">
            <dt>Cost</dt>
            <dd>
              {forced ? formatMoney(option.forcedCost) : formatMoney(option.cost)} over {forced ? option.forcedTurns : option.turns} quarters
            </dd>
          </div>
          <div className="action-card-row">
            <dt>Running</dt>
            <dd>
              {formatMoney(option.fixedCost)} a quarter fixed
              {option.wage > 0 ? `, ${formatMoney(option.wage)} wages when fully staffed` : ''}
            </dd>
          </div>
        </dl>
      </div>
      {option.needsCategory && (
        <div className="cf-field">
          <span className="cf-field-label">CATEGORY</span>
          <Segmented
            options={CATEGORIES.map((c) => ({
              value: c,
              label: CATEGORY_SHORT[c],
            }))}
            value={category}
            onChange={setCategory}
            testId="build-category"
          />
        </div>
      )}
      <div className="cf-field">
        <span className="cf-field-label">PACE</span>
        <Segmented
          options={[
            { value: 'normal' as const, label: 'NORMAL' },
            {
              value: 'forced' as const,
              label: 'FORCED · HALF TIME, DOUBLE COST',
            },
          ]}
          value={pace}
          onChange={setPace}
          testId="build-pace"
        />
      </div>
      <div className="cf-field">
        <span className="cf-field-label">PAID FOR</span>
        <FinancingPicker value={financing} onChange={setFinancing} testId="build-financing" />
        {financing === 'loan' && (
          <p className="cf-hint" data-testid="build-loan-hint">
            {loanHint(forced ? option.forcedFirstInstalment : option.firstInstalment)}
          </p>
        )}
      </div>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onFile(change)} testId="build-file">
        BUILD
      </Button>
      {reasonOf(validation) && (
        <p className="cf-hint is-warning" data-testid="build-reason">
          {reasonOf(validation)}
        </p>
      )}
    </div>
  )
}

function AbroadMenu({ state, onBack, onFile }: { state: GameState; onBack: () => void; onFile: (c: StandingOrderChange) => void }) {
  const options = worksAbroadOptions(state)
  const [country, setCountry] = useState<string>(options[0]?.factionId ?? '')
  const [category, setCategory] = useState<TechCategory>('infantry')
  const [pace, setPace] = useState<'normal' | 'forced'>('normal')
  const picked = options.find((o) => o.factionId === country)
  const change: StandingOrderChange = {
    kind: 'WORKS',
    op: 'BUILD',
    facilityKind: 'assembly',
    category,
    abroad: country,
    ...(pace === 'forced' ? { forced: true } : {}),
  }
  const validation = validateStandingOrderChange(state, state, change)
  return (
    <div className="build-detail" data-testid="abroad-detail">
      <Button variant="ghost" onClick={onBack} testId="build-back">
        ← ALL BUILDINGS
      </Button>
      <p className="cf-hint">
        An assembly works in a buyer&apos;s country. Lower wages, quicker deliveries and a better score with that buyer — but the war can take it, a coup can nationalise it, and
        the country learns what you know.
      </p>
      <div className="cf-field">
        <span className="cf-field-label">COUNTRY</span>
        <Segmented
          options={options.map((o) => ({
            value: o.factionId,
            label: `${o.factionId.toUpperCase()} · ${o.city.toUpperCase()}`,
          }))}
          value={country}
          onChange={setCountry}
          testId="abroad-country"
        />
      </div>
      <div className="cf-field">
        <span className="cf-field-label">CATEGORY</span>
        <Segmented
          options={CATEGORIES.map((c) => ({
            value: c,
            label: CATEGORY_SHORT[c],
          }))}
          value={category}
          onChange={setCategory}
          testId="abroad-category"
        />
      </div>
      <div className="cf-field">
        <span className="cf-field-label">PACE</span>
        <Segmented
          options={[
            { value: 'normal' as const, label: 'NORMAL' },
            { value: 'forced' as const, label: 'FORCED' },
          ]}
          value={pace}
          onChange={setPace}
        />
      </div>
      <Button variant="primary" disabled={!validation.ok || !picked} onClick={() => onFile(change)} testId="abroad-file">
        BUILD ABROAD
      </Button>
      {(reasonOf(validation) ?? picked?.blockedReason) && <p className="cf-hint is-warning">{reasonOf(validation) ?? picked?.blockedReason}</p>}
    </div>
  )
}
