// THE POLITICS — CONTACTS. Läsvyn (P63, ETAPP5_TEKNISK_SPEC.md avsnitt 8) +
// politikverben (P86, ETAPP7_TEKNISK_SPEC.md §7.1/§13): personakter,
// faktionernas akter och rivalhusens akter, samlade på en skärm.
//
// §7.1:s tabell: "Tjänsteman (i CONTACTS eller landets bottenark) | BRIBE,
// FUND_CAMPAIGN, FAVOUR, ASSASSINATE" och "Faktion / huvudstad | INFLUENCE,
// STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP, BROKER". INFLUENCE är redan byggd
// i CountryFile.tsx (P79) — den här prompten kopplar in de sju återstående:
// BRIBE, FUND_CAMPAIGN, FAVOUR, ASSASSINATE (officialId) och STAGE_INCIDENT,
// BACK_CHANNEL, FUND_COUP, BROKER (targetFactionId/buyerId). "Rivalhus har en
// egen akt i CONTACTS, men inga verb där" — RivalDossier nedan är rent läsvy.
//
// Skyddsräcke 3 (§12): samma disciplin som CountryFile.tsx/CompanyActions.tsx
// — varje kandidathandling körs genom validateAction(state, state, action)
// innan den erbjuds/köas.
//
// P81-18: POLITICAL-sektionen i THE COMPANY (TheHouse.tsx:s gamla
// ExecutiveActions, <select>/<input type="number">) flyttas hit och tas bort
// där — se TheHouse.tsx:s egen kommentar.
//
// GENUINT FYND, dokumenterat i docs/ANDRINGSLOGG.md: av POLITICAL:s åtta op
// skalar bara BRIBE/FUND_CAMPAIGN/FAVOUR/INFLUENCE sitt spend/marginCost mot
// en faktisk effekt (political.ts:s cost-per-point-formler). STAGE_INCIDENT/
// BACK_CHANNEL/FUND_COUP/ASSASSINATE debiterar treasury men beloppet skalar
// INGENTING i utfallet (fast sannolikhet respektive fast rng-intervall,
// oberoende av spend) — CountryFile.tsx (P79) dokumenterade redan detta för
// STAGE_INCIDENT/BACK_CHANNEL; den här prompten bekräftar att det gäller
// FUND_COUP och ASSASSINATE också. UI:t är ärligt om det (en hint under
// reglaget) i stället för att låtsas att mer pengar ger bättre odds.
import { useState } from 'react'
import {
  allProducts,
  findOfficial,
  getProduct,
  officialDisplay,
  validateAction,
} from '@seventh-front/core'
import type { FactionId, GameState, Official, OfficialId, PlayerAction, Product, RivalHouse } from '@seventh-front/core'
import { Button, Card, DsSlider, Stepper, TierPicker } from './designSystem.js'
import type { Tier } from './designSystem.js'
import { Meter, Panel, Tag, formatMoney } from './ui.js'

// Poängbaserade nivåer (samma mönster som INFLUENCE, CountryFile.tsx P79) för
// de tre officials-verb vars spend/marginCost FAKTISKT skalar en effekt —
// poäng, inte gissade kronbelopp. bribeRelationMaxPerTurn (15) är taket per
// tjänsteman och tur (political.ts) — LAVISH landar exakt där.
const BRIBE_TIER_POINTS: Record<Tier['key'], number> = { modest: 3, serious: 8, lavish: 15 }
const FUND_CAMPAIGN_TIER_POINTS: Record<Tier['key'], number> = { modest: 5, serious: 15, lavish: 30 }
const FAVOUR_TIER_POINTS: Record<Tier['key'], number> = { modest: 3, serious: 8, lavish: 15 }

// STAGE_INCIDENT/BACK_CHANNEL/FUND_COUP/ASSASSINATE skalar ingen effekt mot
// spend (se filens huvudkommentar) — inget "känt tak" att ta en bråkdel av,
// samma situation CompanyActions.tsx aldrig har. Tre runda, PROVISORISKA
// kronbelopp. FUND_COUP/ASSASSINATE:s SERIOUS-nivå återanvänder härnessens
// egna bot-konstanter (packages/harness/src/policies.ts:s
// BOT_BALANCE.fundCoupCost / ASSASSINATE_SPEND) i stället för att gissa en
// helt ny siffra.
const STAGE_INCIDENT_TIERS: Record<Tier['key'], number> = { modest: 10_000, serious: 25_000, lavish: 50_000 }
const BACK_CHANNEL_TIERS: Record<Tier['key'], number> = { modest: 10_000, serious: 25_000, lavish: 50_000 }
const FUND_COUP_TIERS: Record<Tier['key'], number> = { modest: 500_000, serious: 1_000_000, lavish: 1_500_000 }
const ASSASSINATE_TIERS: Record<Tier['key'], number> = { modest: 250_000, serious: 500_000, lavish: 750_000 }

function reasonHint(validation: { ok: true } | { ok: false; reason: string }): string | null {
  return validation.ok ? null : validation.reason
}

function moneyTiers(amounts: Record<Tier['key'], number>): Tier[] {
  return (['modest', 'serious', 'lavish'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    amount: formatMoney(amounts[key]),
  }))
}

function statusTone(status: Official['status']): 'green' | 'amber' | 'red' {
  if (status === 'dead') return 'red'
  if (status === 'fallen') return 'amber'
  return 'green'
}

function groupByFaction(state: GameState): Map<FactionId, Official[]> {
  const byFaction = new Map<FactionId, Official[]>()
  for (const official of Object.values(state.officials)) {
    const group = byFaction.get(official.factionId)
    if (group) group.push(official)
    else byFaction.set(official.factionId, [official])
  }
  return byFaction
}

function VerbButton({
  icon,
  label,
  cost,
  onClick,
  disabled,
  testId,
}: {
  icon: string
  label: string
  cost: string
  onClick: () => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <button type="button" className="cf-verb" onClick={onClick} disabled={disabled} data-testid={testId}>
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

type OfficialOp = 'BRIBE' | 'FUND_CAMPAIGN' | 'FAVOUR' | 'ASSASSINATE'
type FactionOp = 'STAGE_INCIDENT' | 'BACK_CHANNEL' | 'FUND_COUP' | 'BROKER'
type OpenForm = { kind: 'official'; officialId: OfficialId; op: OfficialOp } | { kind: 'faction'; factionId: FactionId; op: FactionOp } | null

export function ThePolitics({ state, onAddAction }: { state: GameState; onAddAction: (action: PlayerAction) => void }) {
  const [openForm, setOpenForm] = useState<OpenForm>(null)

  function queue(action: PlayerAction) {
    const result = validateAction(state, state, action)
    if (!result.ok) return
    onAddAction(action)
    setOpenForm(null)
  }

  function toggleOfficial(id: OfficialId, op: OfficialOp) {
    setOpenForm((current) => (current?.kind === 'official' && current.officialId === id && current.op === op ? null : { kind: 'official', officialId: id, op }))
  }

  function toggleFaction(id: FactionId, op: FactionOp) {
    setOpenForm((current) => (current?.kind === 'faction' && current.factionId === id && current.op === op ? null : { kind: 'faction', factionId: id, op }))
  }

  return (
    <>
      <h2 className="view-title">The Politics</h2>

      {[...groupByFaction(state).entries()].map(([factionId, officials]) => {
        const faction = state.factions[factionId]
        return (
          <Panel title={faction ? faction.name : factionId} key={factionId} flush>
            {officials.map((official) => {
              const display = officialDisplay(state, official)
              const active = official.status === 'active'
              return (
                <div className="faction-card" key={display.id}>
                  <div className="faction-head">
                    <span className="faction-name">
                      {display.name} · {display.post}
                    </span>
                    <Tag tone={statusTone(official.status)}>{official.status}</Tag>
                    {!display.cabinetCoverage && <Tag>No cabinet coverage</Tag>}
                  </div>

                  <div className="faction-meters">
                    <Meter label="Standing" value={display.standing} display={display.standing.toFixed(0)} tone="blue" />
                    <Meter
                      label="Relation to you"
                      value={display.relationToPlayer}
                      display={display.relationToPlayer.toFixed(0)}
                      tone={display.relationToPlayer >= 50 ? 'green' : 'amber'}
                    />
                    <Meter
                      label="Integrity"
                      value={display.integrity ?? 0}
                      display={display.integrity === null ? 'UNKNOWN' : display.integrity.toFixed(0)}
                      tone="amber"
                    />
                  </div>

                  <p className="banner-sub">Agenda: {display.agenda ?? 'UNKNOWN'}</p>
                  <p className="cf-hint">
                    Relation lifts your score on her bids and keeps her off her own agenda (low standing + low relation
                    triggers a PolicyDecision against you). Low integrity means BRIBE buys more relation per pound.
                  </p>

                  {active && (
                    <>
                      <div className="cf-grid">
                        <VerbButton
                          icon="✎"
                          label="BRIBE"
                          cost={`${formatMoney(BRIBE_TIER_POINTS.modest * 5000)}+`}
                          onClick={() => toggleOfficial(official.id, 'BRIBE')}
                          testId={`contacts-verb-BRIBE-${official.id}`}
                        />
                        <VerbButton
                          icon="✎"
                          label="FUND CAMPAIGN"
                          cost={`${formatMoney(FUND_CAMPAIGN_TIER_POINTS.modest * 2000)}+`}
                          onClick={() => toggleOfficial(official.id, 'FUND_CAMPAIGN')}
                          testId={`contacts-verb-FUND_CAMPAIGN-${official.id}`}
                        />
                        <VerbButton
                          icon="✎"
                          label="FAVOUR"
                          cost="MARGIN"
                          onClick={() => toggleOfficial(official.id, 'FAVOUR')}
                          testId={`contacts-verb-FAVOUR-${official.id}`}
                        />
                        <VerbButton
                          icon="☠"
                          label="ASSASSINATE"
                          cost={`${formatMoney(ASSASSINATE_TIERS.modest)}+`}
                          onClick={() => toggleOfficial(official.id, 'ASSASSINATE')}
                          testId={`contacts-verb-ASSASSINATE-${official.id}`}
                        />
                      </div>

                      {openForm?.kind === 'official' && openForm.officialId === official.id && openForm.op === 'BRIBE' && (
                        <OfficialPointSpendForm
                          official={official}
                          op="BRIBE"
                          title="BRIBE"
                          hint="Buys relation to you directly. Lower integrity means more relation per pound — and raises her scandal risk."
                          points={BRIBE_TIER_POINTS}
                          costPerPoint={5000}
                          effectLabel="RELATION TO YOU"
                          before={official.relationToPlayer}
                          onQueue={queue}
                        />
                      )}
                      {openForm?.kind === 'official' && openForm.officialId === official.id && openForm.op === 'FUND_CAMPAIGN' && (
                        <OfficialPointSpendForm
                          official={official}
                          op="FUND_CAMPAIGN"
                          title="FUND CAMPAIGN"
                          hint="Buys standing — how secure her position is. Doesn't touch relation to you."
                          points={FUND_CAMPAIGN_TIER_POINTS}
                          costPerPoint={2000}
                          effectLabel="STANDING"
                          before={official.standing}
                          onQueue={queue}
                        />
                      )}
                      {openForm?.kind === 'official' && openForm.officialId === official.id && openForm.op === 'FAVOUR' && (
                        <FavourForm state={state} official={official} onQueue={queue} />
                      )}
                      {openForm?.kind === 'official' && openForm.officialId === official.id && openForm.op === 'ASSASSINATE' && (
                        <AssassinateForm state={state} official={official} onQueue={queue} />
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {faction && (
              <div className="faction-card">
                <div className="cf-section-head">
                  <span>FACTION ACTIONS — {faction.name.toUpperCase()}</span>
                  <span className="cf-section-rule" />
                </div>
                <div className="cf-grid">
                  <VerbButton
                    icon="✷"
                    label="STAGE INCIDENT"
                    cost={`${formatMoney(STAGE_INCIDENT_TIERS.modest)}+`}
                    onClick={() => toggleFaction(faction.id, 'STAGE_INCIDENT')}
                    testId={`contacts-verb-STAGE_INCIDENT-${faction.id}`}
                  />
                  <VerbButton
                    icon="☏"
                    label="BACK CHANNEL"
                    cost={`${formatMoney(BACK_CHANNEL_TIERS.modest)}+`}
                    onClick={() => toggleFaction(faction.id, 'BACK_CHANNEL')}
                    testId={`contacts-verb-BACK_CHANNEL-${faction.id}`}
                  />
                  <VerbButton
                    icon="☠"
                    label="FUND COUP"
                    cost={`${formatMoney(FUND_COUP_TIERS.modest)}+`}
                    onClick={() => toggleFaction(faction.id, 'FUND_COUP')}
                    disabled={faction.coupAttempted === true}
                    testId={`contacts-verb-FUND_COUP-${faction.id}`}
                  />
                  <VerbButton
                    icon="⇄"
                    label="BROKER"
                    cost="NO UPFRONT"
                    onClick={() => toggleFaction(faction.id, 'BROKER')}
                    testId={`contacts-verb-BROKER-${faction.id}`}
                  />
                </div>

                {openForm?.kind === 'faction' && openForm.factionId === faction.id && openForm.op === 'STAGE_INCIDENT' && (
                  <FactionFlatSpendForm
                    faction={faction}
                    op="STAGE_INCIDENT"
                    title="STAGE INCIDENT"
                    hint={`Fixed 65% chance to raise heat where this country fights. Spend funds the cover story — it does not change the odds.`}
                    tiers={STAGE_INCIDENT_TIERS}
                    onQueue={queue}
                  />
                )}
                {openForm?.kind === 'faction' && openForm.factionId === faction.id && openForm.op === 'BACK_CHANNEL' && (
                  <FactionFlatSpendForm
                    faction={faction}
                    op="BACK_CHANNEL"
                    title="BACK CHANNEL"
                    hint="Always succeeds — eases doomsday and improves relations with this country's front opponent. Spend does not change how much."
                    tiers={BACK_CHANNEL_TIERS}
                    onQueue={queue}
                  />
                )}
                {openForm?.kind === 'faction' && openForm.factionId === faction.id && openForm.op === 'FUND_COUP' && (
                  <FactionFlatSpendForm
                    faction={faction}
                    op="FUND_COUP"
                    title="FUND COUP"
                    hint="Big, rare, expensive (DESIGN.md §13). One attempt ever per faction. Success chance falls with this country's counter-intelligence — spend does not change it."
                    tiers={FUND_COUP_TIERS}
                    onQueue={queue}
                  />
                )}
                {openForm?.kind === 'faction' && openForm.factionId === faction.id && openForm.op === 'BROKER' && (
                  <BrokerForm state={state} faction={faction} onQueue={queue} />
                )}
              </div>
            )}
          </Panel>
        )
      })}

      <Panel title="Rival houses" flush>
        {Object.values(state.rivals).map((rival) => (
          <RivalDossier key={rival.id} rival={rival} />
        ))}
      </Panel>
    </>
  )
}

// BRIBE/FUND_CAMPAIGN — samma form, bara vilket fält (relationToPlayer/
// standing) som förhandsvisas skiljer. En ren poängskala (samma mönster som
// CountryFile.tsx:s INFLUENCE) i stället för ett gissat kronbelopp.
function OfficialPointSpendForm({
  official,
  op,
  title,
  hint,
  points,
  costPerPoint,
  effectLabel,
  before,
  onQueue,
}: {
  official: Official
  op: 'BRIBE' | 'FUND_CAMPAIGN'
  title: string
  hint: string
  points: Record<Tier['key'], number>
  costPerPoint: number
  effectLabel: string
  before: number
  onQueue: (action: PlayerAction) => void
}) {
  const [tier, setTier] = useState<Tier['key']>('modest')
  const spend = points[tier] * costPerPoint
  const action: PlayerAction = { type: 'POLITICAL', op, officialId: official.id, spend }
  const tiers: Tier[] = (['modest', 'serious', 'lavish'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    amount: formatMoney(points[key] * costPerPoint),
    effect: `~ +${points[key]}`,
  }))
  const after = Math.min(100, before + points[tier])

  return (
    <div className="cf-body" data-testid={`contacts-form-${op}-${official.id}`}>
      <h3 className="cf-form-title">{title}</h3>
      <p className="cf-hint">{hint}</p>
      <div className="cf-field">
        <span className="cf-field-label">SPEND</span>
        <TierPicker tiers={tiers} value={tier} onChange={setTier} testId={`contacts-${op}-tier-${official.id}`} />
      </div>
      <div className="cf-preview" data-testid={`contacts-${op}-preview-${official.id}`}>
        <div className="cf-preview-row">
          <span>{effectLabel}</span>
          <span>
            {Math.round(before)} → ~{Math.round(after)}
          </span>
        </div>
        <div className="cf-preview-row">
          <span>COST</span>
          <span className="is-amber">{formatMoney(spend)}</span>
        </div>
      </div>
      <Button variant="primary" onClick={() => onQueue(action)} testId={`contacts-${op}-file-${official.id}`}>
        FILE
      </Button>
    </div>
  )
}

// FAVOUR — kostar ingen kassa (political.ts, avsnitt 3.3) men en verklig MARGINAL (P99d): beloppet blir
// en skuld som dras från intäkten på nästa leveranser. marginCost, aldrig spend.
function FavourForm({ state, official, onQueue }: { state: GameState; official: Official; onQueue: (action: PlayerAction) => void }) {
  const [tier, setTier] = useState<Tier['key']>('modest')
  const marginCost = FAVOUR_TIER_POINTS[tier] * 5000
  const action: PlayerAction = { type: 'POLITICAL', op: 'FAVOUR', officialId: official.id, marginCost }
  const validation = validateAction(state, state, action)
  const tiers: Tier[] = (['modest', 'serious', 'lavish'] as const).map((key) => ({
    key,
    label: key.toUpperCase(),
    amount: formatMoney(FAVOUR_TIER_POINTS[key] * 5000),
    effect: `~ +${FAVOUR_TIER_POINTS[key]}`,
  }))
  const after = Math.min(100, official.relationToPlayer + FAVOUR_TIER_POINTS[tier])

  return (
    <div className="cf-body" data-testid={`contacts-form-FAVOUR-${official.id}`}>
      <h3 className="cf-form-title">FAVOUR</h3>
      <p className="cf-hint">
        Costs margin, not cash now: the amount is deducted from what your next deliveries pay, until it is settled.
      </p>
      <div className="cf-field">
        <span className="cf-field-label">MARGIN COST</span>
        <TierPicker tiers={tiers} value={tier} onChange={setTier} testId={`contacts-FAVOUR-tier-${official.id}`} />
      </div>
      <div className="cf-preview" data-testid={`contacts-FAVOUR-preview-${official.id}`}>
        <div className="cf-preview-row">
          <span>RELATION TO YOU</span>
          <span>
            {Math.round(official.relationToPlayer)} → ~{Math.round(after)}
          </span>
        </div>
        <div className="cf-preview-row">
          <span>MARGIN COST</span>
          <span className="is-amber">{formatMoney(marginCost)}</span>
        </div>
        <div className="cf-preview-row" data-testid={`contacts-FAVOUR-owed-${official.id}`}>
          <span>ALREADY OWED</span>
          <span className="is-amber">{formatMoney(state.house.favourMarginOwed ?? 0)}</span>
        </div>
      </div>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onQueue(action)} testId={`contacts-FAVOUR-file-${official.id}`}>
        FILE
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

// ASSASSINATE — "dödar alltid målet" (political.ts, avsnitt 4.5). Ingen
// lyckandechans att förhandsvisa; spend skalar ingen effekt (se filens
// huvudkommentar).
function AssassinateForm({ state, official, onQueue }: { state: GameState; official: Official; onQueue: (action: PlayerAction) => void }) {
  const [tier, setTier] = useState<Tier['key']>('modest')
  const spend = ASSASSINATE_TIERS[tier]
  const action: PlayerAction = { type: 'POLITICAL', op: 'ASSASSINATE', officialId: official.id, spend }
  const validation = validateAction(state, state, action)

  return (
    <div className="cf-body" data-testid={`contacts-form-ASSASSINATE-${official.id}`}>
      <h3 className="cf-form-title">ASSASSINATE</h3>
      <p className="cf-hint">
        Always kills the target — she is replaced next turn. Always raises this country's counter-intelligence, and risks
        doomsday if the country is strongly bloc-aligned. Spend does not change the outcome.
      </p>
      <div className="cf-field">
        <span className="cf-field-label">SPEND</span>
        <TierPicker tiers={moneyTiers(ASSASSINATE_TIERS)} value={tier} onChange={setTier} testId={`contacts-ASSASSINATE-tier-${official.id}`} />
      </div>
      <Button variant="primary" disabled={!validation.ok} onClick={() => onQueue(action)} testId={`contacts-ASSASSINATE-file-${official.id}`}>
        FILE — {formatMoney(spend)}
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

// STAGE_INCIDENT/BACK_CHANNEL/FUND_COUP — samma form (targetFactionId +
// spend, spend skalar ingen effekt), bara titel/hint/tiers skiljer.
function FactionFlatSpendForm({
  faction,
  op,
  title,
  hint,
  tiers,
  onQueue,
}: {
  faction: GameState['factions'][string]
  op: 'STAGE_INCIDENT' | 'BACK_CHANNEL' | 'FUND_COUP'
  title: string
  hint: string
  tiers: Record<Tier['key'], number>
  onQueue: (action: PlayerAction) => void
}) {
  const [tier, setTier] = useState<Tier['key']>('modest')
  const spend = tiers[tier]
  const action: PlayerAction = { type: 'POLITICAL', op, targetFactionId: faction.id, spend }

  return (
    <div className="cf-body" data-testid={`contacts-form-${op}-${faction.id}`}>
      <h3 className="cf-form-title">{title}</h3>
      <p className="cf-hint">{hint}</p>
      <div className="cf-field">
        <span className="cf-field-label">SPEND</span>
        <TierPicker tiers={moneyTiers(tiers)} value={tier} onChange={setTier} testId={`contacts-${op}-tier-${faction.id}`} />
      </div>
      <Button variant="primary" onClick={() => onQueue(action)} testId={`contacts-${op}-file-${faction.id}`}>
        FILE — {formatMoney(spend)}
      </Button>
    </div>
  )
}

// BROKER — "förbi computeScore helt" (political.ts, avsnitt 3.5): spelaren
// väljer produkt/kvantitet/pris direkt, avgjort av köparens
// procurement-tjänsteman (relationToPlayer + integrity), inte anbudsformeln.
// Inget upfront treasury-uttag (previewAction.ts) — kostnaden ligger i
// konsekvenserna (tjänstemannens standing/scandalRisk).
function BrokerForm({ state, faction, onQueue }: { state: GameState; faction: GameState['factions'][string]; onQueue: (action: PlayerAction) => void }) {
  const products = allProducts()
  const [productId, setProductId] = useState<string>(products[0]!.id)
  const product: Product = getProduct(productId)
  const qtyMin = product.orderQuantityMin ?? 20
  const qtyMax = product.orderQuantityMax ?? 185
  const [quantity, setQuantity] = useState<number>(qtyMin)
  const referencePrice = product.baseCost * quantity
  const [price, setPrice] = useState<number>(referencePrice)

  const official = findOfficial(state, faction.id, 'procurement')
  const action: PlayerAction = { type: 'BROKER', buyerId: faction.id, productId, quantity, price }
  const validation = validateAction(state, state, action)

  function pickProduct(id: string) {
    const next = getProduct(id)
    const nextQty = next.orderQuantityMin ?? 20
    setProductId(id)
    setQuantity(nextQty)
    setPrice(next.baseCost * nextQty)
  }

  return (
    <div className="cf-body" data-testid={`contacts-form-BROKER-${faction.id}`}>
      <h3 className="cf-form-title">BROKER</h3>
      <p className="cf-hint">
        A direct deal, no bidding — decided by {official ? official.name : 'the procurement official'}&rsquo;s relation to
        you and integrity, not by price or delivery. Costs her standing and raises scandal risk on both sides.
      </p>

      <div className="cf-field">
        <span className="cf-field-label">PRODUCT</span>
        <div className="cf-target-list">
          {products.map((p) => (
            <Card key={p.id} selected={p.id === productId} onClick={() => pickProduct(p.id)} testId={`contacts-broker-product-${p.id}`}>
              {p.name}
              {p.restricted && (
                <>
                  {' '}
                  <Tag tone="red">Restricted</Tag>
                </>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div className="cf-field">
        <Stepper
          label="QUANTITY"
          value={quantity}
          min={qtyMin}
          max={qtyMax}
          step={Math.max(1, Math.round((qtyMax - qtyMin) / 20))}
          onChange={setQuantity}
          testId={`contacts-broker-quantity-${faction.id}`}
        />
      </div>

      <div className="cf-field">
        <DsSlider
          label="PRICE"
          value={price}
          min={Math.round(referencePrice * 0.5)}
          max={Math.round(referencePrice * 1.5)}
          step={100}
          onChange={setPrice}
          format={(v) => formatMoney(v)}
          testId={`contacts-broker-price-${faction.id}`}
        />
      </div>

      <div className="cf-preview" data-testid={`contacts-broker-preview-${faction.id}`}>
        <div className="cf-preview-row">
          <span>OFFICIAL RELATION</span>
          <span>{official ? Math.round(official.relationToPlayer) : 'UNKNOWN'}</span>
        </div>
        <div className="cf-preview-row">
          <span>TOTAL</span>
          <span className="is-amber">{formatMoney(price)}</span>
        </div>
      </div>

      <Button variant="primary" disabled={!validation.ok} onClick={() => onQueue(action)} testId={`contacts-broker-file-${faction.id}`}>
        FILE
      </Button>
      {reasonHint(validation) && <p className="cf-hint is-warning">{reasonHint(validation)}</p>}
    </div>
  )
}

// Rivalhus — ren läsvy, inga verb ("Verben mot dem sitter i länderna där de
// konkurrerar", §7.1).
function RivalDossier({ rival }: { rival: RivalHouse }) {
  return (
    <div className="faction-card" data-testid={`contacts-rival-${rival.id}`}>
      <div className="faction-head">
        <span className="faction-name">{rival.name}</span>
        <Tag tone="blue">{rival.specialisation.toUpperCase()}</Tag>
        <Tag>{rival.temperament.toUpperCase()}</Tag>
        {rival.sabotagedUntilTurn !== null && <Tag tone="red">SABOTAGED</Tag>}
      </div>
      <div className="faction-meters">
        <Meter label="Market share" value={rival.marketShare} display={`${rival.marketShare.toFixed(0)}%`} tone="blue" />
        <Meter label="Quality" value={rival.reputation.quality} display={rival.reputation.quality.toFixed(0)} tone="blue" />
        <Meter label="Reliability" value={rival.reputation.reliability} display={rival.reputation.reliability.toFixed(0)} tone="blue" />
      </div>
      <p className="cf-hint">
        Home bloc: {rival.homeState.toUpperCase()}. {rival.contracts.length} active or past contract
        {rival.contracts.length === 1 ? '' : 's'}. Reached from the countries this house competes in (LEAK/SABOTAGE).
      </p>
    </div>
  )
}
