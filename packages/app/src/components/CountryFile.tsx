// CountryFile — P79 (ETAPP7_TEKNISK_SPEC.md §7.1/§13): "landets bottenark",
// öppnad genom att trycka på en landmassa eller huvudstadsmarkör på kartan
// (TheatreMap.tsx). Bygger mot den godkända referensskissen
// docs/ui/reference/operations-2-country-selected.html (översikten) och
// operations-3-configure-action.html (INFLUENCE, det enda POLITICAL-verbet
// den här prompten kopplar in — se nedan).
//
// Skyddsräcke 3 (§12): "Ingen handling förbi applyActions. UI:t anropar
// samma validateAction." Varje knapp här kör candidateAction genom
// validateAction(state, state, action) INNAN den erbjuds/köas — samma
// funktion applyActions.ts faktiskt avgör turen med (P78). `state` används
// som BÅDA argumenten: den här skärmen bygger inte en egen lokal draft-
// simulering av redan köade kort (det är en framtida förfining, inte ett
// krav den här prompten ställer) — se docs/ANDRINGSLOGG.md.
//
// SCOPE-BESLUT (dokumenterat, inte tyst): §7.1:s tabell listar INFLUENCE,
// STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP och BROKER som nåbara från en
// faktion/huvudstad. "Alla 22 verb nåbara är 7C:s viktigaste klart-villkor"
// (§7.1, ordagrant) — INTE P79:s. Den här prompten bygger COVERT-sektionen
// (alla sex underrättelseverb, P79:s egen klart-när) fullt ut, plus EN
// POLITICAL-exempel (INFLUENCE) eftersom det är den handling den tredje
// godkända referensskissen faktiskt visar konfigurationsflödet för — att
// gissa ihop TierPicker-nivåer för STAGE_INCIDENT/BACK_CHANNEL/FUND_COUP
// (vars spend-belopp, till skillnad från INFLUENCE/BRIBE, INTE skalar någon
// effekt alls i political.ts — se den filens applyFactionTargetedPolitical/
// applyFundCoup) utan en godkänd skiss eller ett balanstal att utgå från
// hade varit att uppfinna en detalj i blindo. 7C bygger resten.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { INFLUENCE_BALANCE, previewAction, validateAction } from '@seventh-front/core'
import type { FactionId, GameState, Official, PlayerAction, RivalId } from '@seventh-front/core'
import { BottomSheet, Button, Card, Segmented, TierPicker } from './designSystem.js'
import type { Tier } from './designSystem.js'
import { ActionCard } from './ActionCard.js'
import { StationCard } from './StationCard.js'
import { formatMoney } from './ui.js'
import { VerbIcon } from './VerbIcon.js'
import { useArmedVerb } from '../uiContext.js'

type DirectVerb = 'EXPAND' | 'WITHDRAW' | 'RECRUIT' | 'REOPEN'
// P163: EXPAND/WITHDRAW/RECRUIT köades förut direkt vid ett tryck. De går nu via ett kort som säger vad verbet gör, kostar och riskerar, och köas först med FILE.
type SubView = { kind: 'overview' } | { kind: 'confirm'; verb: DirectVerb } | { kind: 'target'; op: 'LEAK' | 'SABOTAGE' | 'TURN' } | { kind: 'influence' }

// Verbet spelaren valde i Actions-menyn avgör vilken del av landsakten som öppnas först — men bara om verbet går att använda mot just det här landet.
function initialView(armed: string | undefined, hasStation: boolean, hasDormant: boolean): SubView {
  switch (armed) {
    case 'EXPAND':
    case 'WITHDRAW':
      return hasStation ? { kind: 'confirm', verb: armed } : { kind: 'overview' }
    case 'RECRUIT':
      return hasStation || hasDormant ? { kind: 'overview' } : { kind: 'confirm', verb: 'RECRUIT' }
    case 'REOPEN':
      return hasDormant ? { kind: 'confirm', verb: 'REOPEN' } : { kind: 'overview' }
    case 'LEAK':
    case 'SABOTAGE':
    case 'TURN':
      return hasStation ? { kind: 'target', op: armed } : { kind: 'overview' }
    case 'INFLUENCE':
      return { kind: 'influence' }
    default:
      return { kind: 'overview' }
  }
}

// Referensskissens exakta nivåer (operations-3-configure-action.html,
// INFLUENCE): £15K/45K/90K vid influencePublicSupportCostPerPoint (3000) är
// EXAKT 5/15/30 poäng — tre runda, läsbara poängnivåer, inte tre gissade
// kronbelopp. Samma poängnivåer används för relations-läget (då till ett
// annat pris, influenceRelationsCostPerPoint) — presentationsval i appen,
// inte ett nytt balanstal (formeln som räknar om poäng → kronor ligger i
// och läses uteslutande ur core, se computeInfluenceAfter/previewAction).
const INFLUENCE_TIER_POINTS: Record<Tier['key'], number> = { modest: 5, serious: 15, lavish: 30 }

function costLabel(cost: number | null): string {
  if (cost === null) return 'FREE'
  return formatMoney(cost)
}

// Verbet spelaren valde i menyn passar inte det här landet: säg varför, så att ett tomt arkivblad inte ser ut som ett fel.
function armedMismatch(verb: string | undefined, hasStation: boolean, hasDormant: boolean): string | null {
  if (!verb) return null
  if (verb === 'REOPEN' && !hasDormant) return 'REOPEN needs a dormant station of yours in the country. You have none here.'
  if (verb === 'RECRUIT' && hasDormant) return 'You have a dormant station here. REOPEN wakes it; RECRUIT opens a station in a country that has none.'
  if (['EXPAND', 'WITHDRAW', 'LEAK', 'SABOTAGE', 'TURN'].includes(verb) && !hasStation) {
    return `${verb} needs one of your stations in the country. You have none here — RECRUIT opens one.`
  }
  if (verb === 'RECRUIT' && hasStation) return 'You already have a station here. RECRUIT opens a station in a country that has none.'
  return null
}

export function CountryFile({
  state,
  factionId,
  onAddAction,
  onClose,
  onOpenContacts,
  testId = 'country-file',
}: {
  state: GameState
  factionId: FactionId
  onAddAction: (action: PlayerAction) => void
  onClose: () => void
  onOpenContacts: () => void
  testId?: string
}) {
  const faction = state.factions[factionId]
  const station = state.house.stations.find((s) => s.nation === factionId && s.status === 'active')
  // P167: en vilande station (WITHDRAW) kan väckas igen — då är REOPEN vägen, inte RECRUIT (som skulle öppna en andra station i samma land).
  const dormant = station ? undefined : state.house.stations.find((s) => s.nation === factionId && s.status === 'dormant')
  const armed = useArmedVerb()
  const [view, setView] = useState<SubView>(() => initialView(armed?.verb, station !== undefined, dormant !== undefined))
  // Ett nytt delläge (kort, målväljare, formulär) börjar överst — annars ärver det rullningen från knappen som öppnade det.
  useEffect(() => {
    document.querySelector('[data-testid="country-file"] .ds-sheet-body')?.scrollTo?.(0, 0)
  }, [view.kind])
  const front = Object.values(state.fronts).find((f) => f.sideA === factionId || f.sideB === factionId)
  const officials = Object.values(state.officials).filter((o) => o.factionId === factionId && o.status === 'active')
  const rivals = Object.values(state.rivals)

  if (!faction) return null

  function queue(action: PlayerAction) {
    const result = validateAction(state, state, action)
    if (!result.ok) return
    onAddAction(action)
    setView({ kind: 'overview' })
    onClose()
  }

  function alignmentTag(): string {
    if (faction!.alignment > 15) return 'WEST-ALIGNED'
    if (faction!.alignment < -15) return 'EAST-ALIGNED'
    return 'NEUTRAL'
  }

  function warTag(): string | null {
    if (!front) return null
    if (front.status === 'war') return 'AT WAR'
    if (front.status === 'ceasefire') return 'CEASEFIRE'
    return null
  }

  const title = `COUNTRY FILE · ${factionId.toUpperCase()}`

  return (
    <BottomSheet open title={faction.name} subtitle={title} onClose={onClose} testId={testId}>
      {view.kind === 'overview' && (
        <div className="cf-body">
          <div className="cf-tags">
            <span className="cf-tag is-blue">{alignmentTag()}</span>
            <span className="cf-tag is-amber">BUYER</span>
            {warTag() && <span className="cf-tag is-red">{warTag()}</span>}
          </div>

          <div className="cf-meters">
            <div className="cf-meter">
              <span className="cf-meter-label">RELATION</span>
              <span className="cf-meter-value" data-testid="cf-relation">
                {Math.round(faction.relationToPlayer)} / 100
              </span>
            </div>
            <div className="cf-meter">
              <span className="cf-meter-label">STATION</span>
              <span className="cf-meter-value" data-testid="cf-station">
                {station ? `${station.city} D${station.depth}` : 'NO COVERAGE'}
              </span>
            </div>
            {station && (
              <div className="cf-meter">
                <span className="cf-meter-label">EXPOSURE</span>
                <span className="cf-meter-value" data-testid="cf-exposure">
                  {Math.round(station.exposure)}%
                </span>
              </div>
            )}
          </div>

          {armedMismatch(armed?.verb, station !== undefined, dormant !== undefined) && (
            <p className="cf-hint is-warning" data-testid="cf-armed-mismatch">
              {armedMismatch(armed?.verb, station !== undefined, dormant !== undefined)}
            </p>
          )}

          <StationCard state={state} factionId={factionId} />

          {station ? (
            <CovertSection state={state} station={station} setView={setView} />
          ) : dormant ? (
            <DormantSection state={state} station={dormant} setView={setView} />
          ) : (
            <RecruitSection state={state} factionId={factionId} setView={setView} />
          )}

          <button type="button" className="cf-officials" onClick={onOpenContacts} data-testid="cf-officials-link">
            <span className="cf-officials-text">
              <span className="cf-officials-title">OFFICIALS</span>
              <span className="cf-officials-count">{officials.length} ON FILE</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>

          <div className="cf-section-head">
            <span>POLITICAL</span>
            <span className="cf-section-rule" />
          </div>
          <div className="cf-grid">
            <VerbButton
              icon={<VerbIcon verb="INFLUENCE" />}
              label="INFLUENCE"
              cost="£15K+"
              onClick={() => setView({ kind: 'influence' })}
              testId="cf-verb-INFLUENCE"
              verb="INFLUENCE"
            />
          </div>
        </div>
      )}

      {view.kind === 'confirm' && (
        <ConfirmVerb
          state={state}
          verb={view.verb}
          station={view.verb === 'REOPEN' ? dormant : station}
          factionId={factionId}
          onBack={() => setView({ kind: 'overview' })}
          onFile={queue}
        />
      )}

      {view.kind === 'target' && (
        <TargetPicker
          state={state}
          op={view.op}
          station={station!}
          officials={officials}
          rivals={rivals}
          onBack={() => setView({ kind: 'overview' })}
          onPick={(targetId) => queue({ type: 'INTEL', op: view.op, stationId: station!.id, targetId })}
        />
      )}

      {view.kind === 'influence' && (
        <InfluenceForm
          state={state}
          factionId={factionId}
          onBack={() => setView({ kind: 'overview' })}
          onFile={queue}
        />
      )}
    </BottomSheet>
  )
}

function VerbButton({
  icon,
  label,
  cost,
  onClick,
  disabled,
  testId,
  verb,
}: {
  icon: ReactNode
  label: string
  cost: string
  onClick: () => void
  disabled?: boolean
  testId?: string
  verb?: string
}) {
  return (
    <button type="button" className="cf-verb" onClick={onClick} disabled={disabled} data-testid={testId} data-verb={verb}>
      <span className="cf-verb-head">
        <span className="cf-verb-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="cf-verb-cost">{cost}</span>
      </span>
      <span className="cf-verb-label">{label}</span>
    </button>
  )
}

// COVERT — EXPAND/WITHDRAW köas direkt (inget mål att välja); LEAK/SABOTAGE/
// TURN öppnar en målväljare (§7.1: "Mål väljs ur" rivalhus resp. tjänstemän
// i landet).
function CovertSection({
  state,
  station,
  setView,
}: {
  state: GameState
  station: NonNullable<GameState['house']['stations'][number]>
  setView: (v: SubView) => void
}) {
  const expand: PlayerAction = { type: 'INTEL', op: 'EXPAND', stationId: station.id }
  const withdraw: PlayerAction = { type: 'INTEL', op: 'WITHDRAW', stationId: station.id }
  const leakPreview = previewAction(state, { type: 'INTEL', op: 'LEAK', stationId: station.id })
  const sabotagePreview = previewAction(state, { type: 'INTEL', op: 'SABOTAGE', stationId: station.id })
  const turnPreview = previewAction(state, { type: 'INTEL', op: 'TURN', stationId: station.id })

  return (
    <>
      <div className="cf-section-head">
        <span>COVERT — {station.city} STATION</span>
        <span className="cf-section-rule" />
      </div>
      <div className="cf-grid">
        <VerbButton
          icon={<VerbIcon verb="EXPAND" />}
          label="EXPAND"
          cost={costLabel(previewAction(state, expand).cost)}
          onClick={() => setView({ kind: 'confirm', verb: 'EXPAND' })}
          disabled={!validateAction(state, state, expand).ok}
          testId="cf-verb-EXPAND"
          verb="EXPAND"
        />
        <VerbButton
          icon={<VerbIcon verb="WITHDRAW" />}
          label="WITHDRAW"
          cost={costLabel(previewAction(state, withdraw).cost)}
          onClick={() => setView({ kind: 'confirm', verb: 'WITHDRAW' })}
          disabled={!validateAction(state, state, withdraw).ok}
          testId="cf-verb-WITHDRAW"
          verb="WITHDRAW"
        />
        <VerbButton
          icon={<VerbIcon verb="LEAK" />}
          label="LEAK"
          cost={costLabel(leakPreview.cost)}
          onClick={() => setView({ kind: 'target', op: 'LEAK' })}
          testId="cf-verb-LEAK"
          verb="LEAK"
        />
        <VerbButton
          icon={<VerbIcon verb="SABOTAGE" />}
          label="SABOTAGE"
          cost={costLabel(sabotagePreview.cost)}
          onClick={() => setView({ kind: 'target', op: 'SABOTAGE' })}
          testId="cf-verb-SABOTAGE"
          verb="SABOTAGE"
        />
        <VerbButton
          icon={<VerbIcon verb="TURN" />}
          label="TURN"
          cost={costLabel(turnPreview.cost)}
          onClick={() => setView({ kind: 'target', op: 'TURN' })}
          testId="cf-verb-TURN"
          verb="TURN"
        />
      </div>
    </>
  )
}

// P167: en vilande station — den enda handlingen är att öppna den igen (REOPEN). Djup och täckning finns kvar.
function DormantSection({
  state,
  station,
  setView,
}: {
  state: GameState
  station: NonNullable<GameState['house']['stations'][number]>
  setView: (v: SubView) => void
}) {
  const reopen: PlayerAction = { type: 'INTEL', op: 'REOPEN', stationId: station.id }
  return (
    <>
      <div className="cf-section-head">
        <span>DORMANT — {station.city} STATION</span>
        <span className="cf-section-rule" />
      </div>
      <div className="cf-grid">
        <VerbButton
          icon={<VerbIcon verb="REOPEN" />}
          label="REOPEN"
          cost={costLabel(previewAction(state, reopen).cost)}
          onClick={() => setView({ kind: 'confirm', verb: 'REOPEN' })}
          disabled={!validateAction(state, state, reopen).ok}
          testId="cf-verb-REOPEN"
          verb="REOPEN"
        />
      </div>
    </>
  )
}

// §7.1: "Land utan station | RECRUIT | —" — inget mål att välja (targetId
// ÄR landet, se applyActions.ts:s huvudkommentar om varför RECRUIT
// återanvänder targetId som nationen).
function RecruitSection({
  state,
  factionId,
  setView,
}: {
  state: GameState
  factionId: FactionId
  setView: (v: SubView) => void
}) {
  const recruit: PlayerAction = { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: factionId }
  return (
    <>
      <div className="cf-section-head">
        <span>NO COVERAGE</span>
        <span className="cf-section-rule" />
      </div>
      <div className="cf-grid">
        <VerbButton
          icon={<VerbIcon verb="RECRUIT" />}
          label="RECRUIT"
          cost={costLabel(previewAction(state, recruit).cost)}
          onClick={() => setView({ kind: 'confirm', verb: 'RECRUIT' })}
          disabled={!validateAction(state, state, recruit).ok}
          testId="cf-verb-RECRUIT"
          verb="RECRUIT"
        />
      </div>
    </>
  )
}

// EXPAND / WITHDRAW / RECRUIT: kortet först, FILE sedan. En handling som validateAction avvisar visar sin orsak och kan inte köas.
function ConfirmVerb({
  state,
  verb,
  station,
  factionId,
  onBack,
  onFile,
}: {
  state: GameState
  verb: DirectVerb
  station: { id: string } | undefined
  factionId: FactionId
  onBack: () => void
  onFile: (action: PlayerAction) => void
}) {
  const action: PlayerAction =
    verb === 'RECRUIT'
      ? { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: factionId }
      : { type: 'INTEL', op: verb, stationId: station?.id ?? '' }
  const validation = validateAction(state, state, action)
  return (
    <div className="cf-body" data-testid={`cf-confirm-${verb}`}>
      <button type="button" className="cf-back" onClick={onBack} data-testid="cf-confirm-back">
        ‹ BACK
      </button>
      <h3 className="cf-form-title">{verb}</h3>
      <ActionCard state={state} verb={verb} action={action} />
      <Button variant="primary" disabled={!validation.ok} onClick={() => onFile(action)} testId={`cf-file-${verb}`}>
        FILE
      </Button>
      {!validation.ok && <p className="cf-hint is-warning">{validation.reason}</p>}
    </div>
  )
}

function TargetPicker({
  state,
  op,
  station,
  officials,
  rivals,
  onBack,
  onPick,
}: {
  state: GameState
  op: 'LEAK' | 'SABOTAGE' | 'TURN'
  station: { id: string }
  officials: Official[]
  rivals: { id: RivalId; name: string }[]
  onBack: () => void
  onPick: (targetId: string) => void
}) {
  const targets = op === 'TURN' ? officials.map((o) => ({ id: o.id, label: o.name })) : rivals.map((r) => ({ id: r.id, label: r.name }))
  return (
    <div className="cf-body" data-testid={`cf-target-picker-${op}`}>
      <button type="button" className="cf-back" onClick={onBack}>
        ‹ BACK
      </button>
      <ActionCard
        state={state}
        verb={op}
        action={{ type: 'INTEL', op, stationId: station.id, ...(targets[0] ? { targetId: targets[0].id } : {}) }}
      />
      <p className="cf-hint">{op === 'TURN' ? 'Choose an official to turn.' : 'Choose a rival house.'}</p>
      <div className="cf-target-list">
        {targets.map((t) => (
          <Card key={t.id} onClick={() => onPick(t.id)} testId={`cf-target-${t.id}`}>
            {t.label}
          </Card>
        ))}
      </div>
    </div>
  )
}

// INFLUENCE — det enda POLITICAL-verbet P79 kopplar in, byggt mot
// operations-3-configure-action.html: EFFECT/DIRECTION (Segmented),
// SPEND (TierPicker), en beräknad förhandsvisning (ActionPreview.effect,
// P79:s egen utökning av previewAction — se previewAction.ts:s
// huvudkommentar), och FILE.
function InfluenceForm({
  state,
  factionId,
  onBack,
  onFile,
}: {
  state: GameState
  factionId: FactionId
  onBack: () => void
  onFile: (action: PlayerAction) => void
}) {
  const [effectKind, setEffectKind] = useState<'publicSupport' | 'relations'>('publicSupport')
  const [direction, setDirection] = useState<'up' | 'down'>('up')
  const [tier, setTier] = useState<Tier['key']>('serious')
  const others = Object.values(state.factions).filter((f) => f.id !== factionId)
  const [towardFactionId, setTowardFactionId] = useState<FactionId>(others[0]?.id ?? factionId)

  const costPerPoint = effectKind === 'publicSupport' ? INFLUENCE_BALANCE.publicSupportCostPerPoint : INFLUENCE_BALANCE.relationsCostPerPoint

  const action: PlayerAction =
    effectKind === 'publicSupport'
      ? {
          type: 'POLITICAL',
          op: 'INFLUENCE',
          targetFactionId: factionId,
          spend: INFLUENCE_TIER_POINTS[tier] * costPerPoint,
          direction,
          effect: { kind: 'publicSupport' },
        }
      : {
          type: 'POLITICAL',
          op: 'INFLUENCE',
          targetFactionId: factionId,
          spend: INFLUENCE_TIER_POINTS[tier] * costPerPoint,
          direction,
          effect: { kind: 'relations', towardFactionId },
        }

  const preview = previewAction(state, action)
  const tiers: Tier[] = (['modest', 'serious', 'lavish'] as const).map((key) => {
    const points = INFLUENCE_TIER_POINTS[key]
    const cost = points * costPerPoint
    return { key, label: key.toUpperCase(), amount: formatMoney(cost), effect: `~ ${direction === 'up' ? '+' : '−'}${points}` }
  })

  return (
    <div className="cf-body">
      <button type="button" className="cf-back" onClick={onBack} data-testid="cf-influence-back">
        ‹ BACK
      </button>
      <h3 className="cf-form-title">INFLUENCE</h3>
      <ActionCard state={state} verb="INFLUENCE" action={action} />

      <div className="cf-field">
        <span className="cf-field-label">1. EFFECT</span>
        <Segmented
          options={[
            { value: 'publicSupport', label: 'PUBLIC SUPPORT' },
            { value: 'relations', label: 'RELATIONS' },
          ]}
          value={effectKind}
          onChange={setEffectKind}
          testId="cf-influence-effect"
        />
      </div>

      {effectKind === 'relations' && others.length > 0 && (
        <div className="cf-field">
          <span className="cf-field-label">TOWARD</span>
          <Segmented
            options={others.map((f) => ({ value: f.id, label: f.name.toUpperCase() }))}
            value={towardFactionId}
            onChange={setTowardFactionId}
            testId="cf-influence-toward"
          />
        </div>
      )}

      <div className="cf-field">
        <span className="cf-field-label">2. DIRECTION</span>
        <Segmented
          options={[
            { value: 'up', label: 'RAISE' },
            { value: 'down', label: 'LOWER' },
          ]}
          value={direction}
          onChange={setDirection}
          testId="cf-influence-direction"
        />
      </div>

      <div className="cf-field">
        <span className="cf-field-label">3. SPEND</span>
        <TierPicker tiers={tiers} value={tier} onChange={setTier} testId="cf-influence-spend" />
      </div>

      <div className="cf-preview" data-testid="cf-influence-preview">
        {preview.effect && (
          <div className="cf-preview-row">
            <span>{preview.effect.label}</span>
            <span>
              {Math.round(preview.effect.before)} → ~{Math.round(preview.effect.after)}
            </span>
          </div>
        )}
        <div className="cf-preview-row">
          <span>COST</span>
          <span className="is-amber">{formatMoney(preview.cost ?? 0)}</span>
        </div>
      </div>

      <Button variant="primary" onClick={() => onFile(action)} testId="cf-influence-file">
        FILE
      </Button>
    </div>
  )
}
