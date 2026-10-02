// DrawingBoard — P126 (ETAPP9_FORSLAG.md §9). Ritbordet i THE COMPANY: ett lutande bord med en blåkopia per
// kategori. Ett pågående designprojekt syns som en ritning som växer fram i blyerts; inriktning och ambition väljs
// med Segmented på blåkopians baksida (regel 2), forskningsspåret likaså. Allt är stående order — kostar ingen
// handling, gäller från nästa kvartal och köas i draften (samma plumbing som anslagstavlan, BoardCard).
//
// Förhandsvisningen (längd, kostnad per kvartal, målgeneration, avvisningsorsak) läser designStartPreview /
// researchTrackPreview i core — exakt de funktioner ordern tillämpar med (en formel, en källa). Validering går
// genom validateStandingOrderChange, så en spärrad order visar orsaken i klartext i stället för att avvisas först
// efter End Quarter. trueQuality och latentFlaw lämnar aldrig core (skyddsräcke 5).
import { useState } from 'react'
import {
  DESIGN_AMBITIONS,
  CIVIL_PRODUCT_NAME,
  DESIGNERS,
  DESIGNER_TRAIT_TEXT,
  designerEmployer,
  hireCostFor,
  hiredDesigner,
  DESIGN_FOCUSES,
  TECH_CATEGORIES,
  civilRevenueFor,
  isCivilCategory,
  designStartPreview,
  frontierGeneration,
  previewAction,
  researchTrackPreview,
  validateAction,
  validateStandingOrderChange,
} from '@seventh-front/core'
import type { DesignAmbition, DesignFocus, GameState, PlayerAction, ResearchPace, StandingOrderChange, TechCategory, TurnSubmission } from '@seventh-front/core'
import { Button, DsToggle, Segmented } from './designSystem.js'
import { BoardCard, describeChange } from './StandingOrdersBoard.js'
import { Panel, Tag, formatMoney } from './ui.js'
import { AMBITION_HINT, AMBITION_LABEL, CATEGORY_NAME, FOCUS_HINT, FOCUS_LABEL, projectProgress } from '../designSheet.js'
import { standingOrderKey } from '../standingOrderBoard.js'

// Blåkopiesiluetter, ritade som några separata streck så att ritningen kan växa fram streck för streck.
// viewBox 0 0 120 60. Rena former — ingen text, ingen glöd (art-director: papper, blyerts, fettkrita).
const SILHOUETTE: Record<TechCategory, string[]> = {
  infantry: ['M8 38 L78 38 L84 34 L112 34', 'M8 38 L14 48 L30 48 L34 38', 'M44 38 L46 30 L62 30 L62 38', 'M62 38 L58 50 L68 50 L70 38'],
  artillery: ['M14 30 L86 20 L110 18', 'M14 30 L30 36 L50 30', 'M32 44 A12 12 0 1 0 56 44 A12 12 0 1 0 32 44', 'M20 32 L8 52 L26 52'],
  armour: ['M10 44 L108 44 L100 54 L18 54 Z', 'M24 44 L30 32 L84 32 L92 44', 'M50 32 L54 22 L74 22 L78 32', 'M74 27 L116 24'],
  aviation: ['M6 30 Q30 24 70 26 L112 30 L70 34 Q30 36 6 30', 'M56 28 L36 6 L48 6 L76 28', 'M56 32 L36 54 L48 54 L76 32', 'M12 28 L6 16 L16 16 L24 27'],
  naval: ['M6 38 L18 52 L100 52 L114 38 Z', 'M30 38 L34 26 L84 26 L88 38', 'M54 26 L56 12 L66 12 L68 26', 'M92 38 L106 24'],
  electronics: ['M24 18 Q52 56 80 18', 'M52 38 L52 52 M36 54 L68 54', 'M80 18 L100 10 M86 24 L106 20', 'M92 10 L96 16'],
}

// Streck i ordning: streck i tecknas när framsteget passerat i/n. pathLength=100 gör streckets längd oberoende av formen.
export function DrawingSilhouette({ category, progress, className, testId }: { category: TechCategory; progress: number; className?: string; testId?: string }) {
  const strokes = SILHOUETTE[category]
  const n = strokes.length
  return (
    <svg className={className ? `drawing-svg ${className}` : 'drawing-svg'} viewBox="0 0 120 60" role="img" aria-label={`${CATEGORY_NAME[category]} blueprint, ${Math.round(progress * 100)} per cent drawn`} data-testid={testId ?? `drawing-${category}`} data-progress={progress.toFixed(2)}>
      <g className="drawing-faint" fill="none">
        {strokes.map((d, i) => (
          <path key={i} d={d} pathLength={100} />
        ))}
      </g>
      <g className="drawing-pencil" fill="none">
        {strokes.map((d, i) => {
          const local = Math.max(0, Math.min(1, progress * n - i))
          return <path key={i} d={d} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - local)} />
        })}
      </g>
    </svg>
  )
}

const PACES: readonly (ResearchPace | 'off')[] = ['off', 'low', 'normal', 'high']

function reason(v: { ok: true } | { ok: false; reason: string }): string | null {
  return v.ok ? null : v.reason
}

function CategoryEditor({
  state,
  category,
  onFile,
}: {
  state: GameState
  category: TechCategory
  onFile: (change: StandingOrderChange) => void
}) {
  const house = state.house
  const track = house.standingOrders?.research?.[category]
  const running = house.rnd.find((p) => p.category === category && p.design)
  const designs = (house.designs ?? []).filter((d) => d.category === category && d.status === 'active')
  const [focus, setFocus] = useState<DesignFocus>('balanced')
  const [ambition, setAmbition] = useState<DesignAmbition>('timely')
  const [upgrade, setUpgrade] = useState<string>('new')
  const [skunk, setSkunk] = useState(false)
  const [pace, setPace] = useState<ResearchPace | 'off'>(track?.pace ?? 'off')

  const upgradeOf = upgrade === 'new' ? undefined : upgrade
  const useSkunk = skunk && !upgradeOf
  const start: StandingOrderChange = { kind: 'DESIGN', op: 'START', category, focus, ambition, ...(upgradeOf ? { upgradeOf } : {}), ...(useSkunk ? { skunk: true } : {}) }
  const startValidation = validateStandingOrderChange(state, state, start)
  const preview = designStartPreview(state, { category, focus, ambition, ...(upgradeOf ? { upgradeOf } : {}), ...(useSkunk ? { skunk: true } : {}) })
  const civilLine = isCivilCategory(category) ? house.standingOrders?.civil?.[category] : undefined
  const civilChange: StandingOrderChange | null = isCivilCategory(category) ? { kind: 'CIVIL', op: civilLine ? 'CANCEL' : 'SET', category } : null
  const civilValidation = civilChange ? validateStandingOrderChange(state, state, civilChange) : null

  const trackChange: StandingOrderChange | null =
    pace === 'off' ? (track ? { kind: 'RESEARCH', op: 'CANCEL', category } : null) : { kind: 'RESEARCH', op: 'SET', category, pace }
  const trackValidation = trackChange ? validateStandingOrderChange(state, state, trackChange) : null
  const trackPreview = pace === 'off' ? null : researchTrackPreview(state, category, pace)

  return (
    <div className="cf-body">
      <h4 className="drawing-section">DESIGN PROJECT</h4>
      {running ? (
        <>
          <p className="cf-hint">
            A {FOCUS_LABEL[running.design!.focus]} · {AMBITION_LABEL[running.design!.ambition]} design is on the board — {running.turnsRemaining} of {running.turnsTotal} quarters left.
          </p>
          <Button
            variant="secondary"
            onClick={() => onFile({ kind: 'DESIGN', op: 'CANCEL', category })}
            testId={`drawing-cancel-${category}`}
          >
            Scrap the drawing
          </Button>
        </>
      ) : (
        <>
          <div className="cf-field">
            <span className="cf-field-label">FOCUS</span>
            <Segmented
              options={DESIGN_FOCUSES.map((f) => ({ value: f, label: FOCUS_LABEL[f] }))}
              value={focus}
              onChange={setFocus}
              testId={`drawing-focus-${category}`}
            />
          </div>
          <p className="cf-hint">{FOCUS_HINT[focus]}</p>
          <div className="cf-field">
            <span className="cf-field-label">AMBITION</span>
            <Segmented
              options={DESIGN_AMBITIONS.map((a) => ({ value: a, label: AMBITION_LABEL[a] }))}
              value={ambition}
              onChange={setAmbition}
              testId={`drawing-ambition-${category}`}
            />
          </div>
          <p className="cf-hint">{AMBITION_HINT[ambition]}</p>
          {designs.length > 0 && (
            <div className="cf-field">
              <span className="cf-field-label">STARTING POINT</span>
              <Segmented
                options={[{ value: 'new', label: 'NEW' }, ...designs.map((d, i) => ({ value: d.id, label: `UPG #${i + 1}` }))]}
                value={upgrade}
                onChange={setUpgrade}
                testId={`drawing-upgrade-${category}`}
              />
              {upgrade !== 'new' && <p className="cf-hint">Upgrades {designs.find((d) => d.id === upgrade)?.name} — cheaper and quicker, with a lower ceiling, and it inherits the reputation.</p>}
            </div>
          )}
          {!upgradeOf && (
            <DsToggle
              label="Special project (skunk works): faster and dearer, less oversight — a higher risk of a hidden flaw"
              checked={skunk}
              onChange={setSkunk}
              testId={`drawing-skunk-${category}`}
            />
          )}
          <p className="cf-hint" data-testid={`drawing-preview-${category}`}>
            {preview.turns} quarters · {formatMoney(preview.costPerTurn)} a quarter · aims at generation {preview.targetGeneration}
            {preview.follower ? ' (a follower — cheaper)' : ''}.
          </p>
          <Button variant="primary" disabled={!startValidation.ok} onClick={() => onFile(start)} testId={`drawing-start-${category}`}>
            START DRAWING
          </Button>
          {reason(startValidation) && <p className="cf-hint is-warning">{reason(startValidation)}</p>}
        </>
      )}

      {civilChange && isCivilCategory(category) && (
        <>
          <h4 className="drawing-section">CIVIL LINE</h4>
          <p className="cf-hint" data-testid={`drawing-civil-hint-${category}`}>
            {CIVIL_PRODUCT_NAME[category]}: small, steady orders that do not depend on the war — {formatMoney(civilRevenueFor(house, category))} a quarter at tech level {house.techLevel[category]}, and a head start back into research.
          </p>
          <Button variant="secondary" disabled={!civilValidation?.ok} onClick={() => onFile(civilChange)} testId={`drawing-civil-${category}`}>
            {civilLine ? 'CLOSE THE CIVIL LINE' : 'OPEN A CIVIL LINE'}
          </Button>
          {civilValidation && reason(civilValidation) && <p className="cf-hint is-warning">{reason(civilValidation)}</p>}
        </>
      )}

      <h4 className="drawing-section">RESEARCH TRACK</h4>
      <div className="cf-field">
        <Segmented
          options={PACES.map((p) => ({ value: p, label: p.toUpperCase() }))}
          value={pace}
          onChange={setPace}
          testId={`drawing-pace-${category}`}
        />
      </div>
      <p className="cf-hint">
        {trackPreview
          ? `Each project takes ${trackPreview.turns} quarters at ${formatMoney(trackPreview.costPerTurn)} a quarter, and a new one starts when the last is done.`
          : track
            ? 'Switch the track off — a running project still finishes.'
            : 'No standing research. Tech level only rises through projects you start here or by a crash programme.'}
      </p>
      <Button
        variant="primary"
        disabled={!trackChange || !trackValidation?.ok || (!!track && pace === track.pace)}
        onClick={() => trackChange && onFile(trackChange)}
        testId={`drawing-track-set-${category}`}
      >
        {pace === 'off' ? 'STOP TRACK' : 'SET TRACK'}
      </Button>
      {trackValidation && reason(trackValidation) && <p className="cf-hint is-warning">{reason(trackValidation)}</p>}
    </div>
  )
}

// P134 (§8b.3): chefskonstruktören — en namngiven person med en egenskap och en egen inriktning. Stående order (ingen handling).
function ChiefDesigner({ state, onSet }: { state: GameState; onSet: (change: StandingOrderChange) => void }) {
  const hired = hiredDesigner(state.house)
  return (
    <div className="chief-designer" data-testid="chief-designer">
      <h4 className="drawing-section">CHIEF DESIGNER</h4>
      {hired ? (
        <>
          <p className="cf-hint" data-testid="chief-designer-hired">
            {hired.name} · {DESIGNER_TRAIT_TEXT[hired.trait]} · draws {FOCUS_LABEL[hired.focus]} {CATEGORY_NAME[hired.category]}.
          </p>
          <Button variant="secondary" onClick={() => onSet({ kind: 'DESIGNER', op: 'RELEASE' })} testId="chief-designer-release">
            RELEASE
          </Button>
        </>
      ) : (
        Object.values(DESIGNERS).map((d) => {
          const hire: StandingOrderChange = { kind: 'DESIGNER', op: 'HIRE', designerId: d.id }
          const v = validateStandingOrderChange(state, state, hire)
          const employer = designerEmployer(state, d.id)
          const rival = employer && employer !== 'player' ? (state.rivals[employer]?.name ?? employer) : null
          return (
            <div className="chief-designer-row" key={d.id} data-testid={`designer-${d.id}`}>
              <span className="chief-designer-name">{d.name}</span>
              <Tag tone={rival ? 'amber' : 'green'}>{rival ? `AT ${rival.toUpperCase()}` : 'FREE'}</Tag>
              <p className="cf-hint">
                {DESIGNER_TRAIT_TEXT[d.trait]} · draws {FOCUS_LABEL[d.focus]} {CATEGORY_NAME[d.category]}
              </p>
              <Button variant="secondary" disabled={!v.ok} onClick={() => onSet(hire)} testId={`designer-hire-${d.id}`}>
                {rival ? 'POACH' : 'HIRE'} · {formatMoney(hireCostFor(state, d.id))}
              </Button>
              {!v.ok && <p className="cf-hint is-warning">{v.reason}</p>}
            </div>
          )
        })
      )}
    </div>
  )
}

export function DrawingBoard({
  state,
  draft,
  onSet,
  onRemove,
  onAddAction,
}: {
  state: GameState
  draft: TurnSubmission
  onSet: (change: StandingOrderChange) => void
  onRemove: (key: string) => void
  onAddAction: (action: PlayerAction) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const house = state.house
  const queued = draft.standingOrders
  const captured = (house.capturedMateriel ?? []).filter((m) => m.units > 0)

  const file = (change: StandingOrderChange) => {
    onSet(change)
    setOpenId(null)
  }

  return (
    <Panel title="Drawing board" right={<Tag>from next quarter · no action point</Tag>}>
      <div className="drawing-board" data-testid="drawing-board">
        <div className="drawing-grid">
          {TECH_CATEGORIES.map((category) => {
            const id = `drawing-${category}`
            const running = house.rnd.find((p) => p.category === category && p.design)
            const techProject = house.rnd.find((p) => p.category === category && !p.design)
            const track = house.standingOrders?.research?.[category]
            const designCount = (house.designs ?? []).filter((d) => d.category === category && d.status === 'active').length
            const progress = running ? projectProgress(running) : 0
            const pending = queued
              .filter((c) => (c.kind === 'DESIGN' || c.kind === 'RESEARCH' || c.kind === 'CIVIL') && c.category === category)
              .map((c) => ({ key: standingOrderKey(c), text: describeChange(c), undoId: `${category}-${c.kind.toLowerCase()}` }))
            return (
              <BoardCard
                key={category}
                className="drawing-card"
                id={id}
                title={CATEGORY_NAME[category]}
                alarm={null}
                open={openId === id}
                onToggle={() => setOpenId((prev) => (prev === id ? null : id))}
                registerRef={() => {}}
                pending={pending}
                onUndo={onRemove}
                front={
                  <>
                    <DrawingSilhouette category={category} progress={progress} />
                    <dl className="kv standing-kv">
                      <dt>Tech level / generation</dt>
                      <dd>
                        {house.techLevel[category]} / {frontierGeneration(state, category)}
                      </dd>
                      <dt>Design</dt>
                      <dd>
                        {running
                          ? `${FOCUS_LABEL[running.design!.focus]} · ${running.turnsTotal - running.turnsRemaining} of ${running.turnsTotal}`
                          : designCount > 0
                            ? `${designCount} on file`
                            : 'none yet'}
                      </dd>
                      <dt>Research</dt>
                      <dd>
                        {track ? `${track.pace.toUpperCase()} track` : 'no track'}
                        {techProject ? ` · ${techProject.turnsTotal - techProject.turnsRemaining}/${techProject.turnsTotal}` : ''}
                      </dd>
                    </dl>
                  </>
                }
                back={<CategoryEditor state={state} category={category} onFile={file} />}
              />
            )
          })}
        </div>

        <ChiefDesigner state={state} onSet={file} />

        {captured.length > 0 && (
          <div className="drawing-captured" data-testid="drawing-captured">
            <h4 className="drawing-section">CAPTURED MATERIEL</h4>
            {captured.map((m) => {
              const action: PlayerAction = { type: 'INTERNAL', op: 'REVERSE_ENGINEER', payload: { systemId: m.systemId } }
              const validation = validateAction(state, state, action)
              const preview = previewAction(state, action)
              return (
                <div className="drawing-captured-row" key={m.systemId}>
                  <span>
                    {m.name} × {m.units} ({CATEGORY_NAME[m.category]})
                  </span>
                  <span className="cf-hint">
                    {preview.cost !== null ? formatMoney(preview.cost) : ''}
                    {preview.effect ? ` · ${preview.effect.label.toLowerCase()} ${preview.effect.before.toFixed(1)} → ${preview.effect.after.toFixed(1)}` : ''}
                  </span>
                  <Button variant="secondary" disabled={!validation.ok} onClick={() => onAddAction(action)} testId={`drawing-study-${m.systemId}`}>
                    STUDY (1 action)
                  </Button>
                  {!validation.ok && <p className="cf-hint is-warning">{validation.reason}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}
