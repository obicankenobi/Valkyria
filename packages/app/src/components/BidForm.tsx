// BidForm — budformuläret för en order (P84, ETAPP7_TEKNISK_SPEC.md §7.5,
// §13). "Ett prisreglage över winBand som kurva, med marginal och
// vinstchans som följer reglaget över spelarens hela prisintervall"
// (P81-7). Order.trueBudget/inspectorIntegrity/weights visas ALDRIG — de är
// spelarens dolda information, hela poängen med bidEstimate/winBand
// (avsnitt 4.3). Regel 2: aldrig <select>/input[type=number] — Segmented/
// DsSlider/Stepper genomgående, samma mönster som CountryFile.tsx (P79).
import { useEffect, useMemo, useState } from 'react'
import {
  BOT_BALANCE,
  CUSTOMISE_TERMS,
  deliveryPromiseTerm,
  advanceAmount,
  bidDesignRejection,
  bidEstimate,
  capacityOutlook,
  designBidStamps,
  isExportViolation,
  orderTerms,
  playerWinCurve,
  getProduct,
  leadSupplierRejection,
} from '@seventh-front/core'
import type { DriverLevel } from '@seventh-front/core'
import type { Bid, GameState, Grade, Order, PlayerWinCurvePoint } from '@seventh-front/core'
import { formatMoney } from './ui.js'
import { Button, DsSlider, DsToggle, Segmented, Stepper } from './designSystem.js'
import { playSound } from '../sound.js'

const GRADES: Grade[] = ['A', 'B', 'C']

// P81c (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten, P81-7): winBand samplar
// bara FEM diskreta punkter mellan rivalPriceLow/rivalPriceHigh — spelarens
// faktiskt inmatade pris ligger nästan aldrig exakt på en av dem. Linjär
// interpolation mellan de två närmaste punkterna i playerWinCurve (som redan
// TÄCKER hela intervallet ner till självkostnaden, se queries.ts) i stället
// för att bara läsa av den närmaste punkten.
export function interpolateConfidence(curve: PlayerWinCurvePoint[], price: number): number {
  if (curve.length === 0) return 0
  if (price <= curve[0]!.price) return curve[0]!.confidence
  const last = curve[curve.length - 1]!
  if (price >= last.price) return last.confidence
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!
    const b = curve[i]!
    if (price <= b.price) {
      const t = b.price === a.price ? 0 : (price - a.price) / (b.price - a.price)
      return Math.round(a.confidence + (b.confidence - a.confidence) * t)
    }
  }
  return last.confidence
}

function levelWord(level: DriverLevel): string {
  return level === 'high' ? 'HIGH' : level === 'mid' ? 'MID' : 'LOW'
}

function marginTone(marginPct: number | null): string {
  if (marginPct === null) return ''
  if (marginPct <= 0) return 'is-loss'
  if (marginPct < 20) return 'is-thin'
  return 'is-good'
}

function marginClass(marginPct: number | null): string {
  if (marginPct === null) return 'margin-readout'
  if (marginPct <= 0) return 'margin-readout is-loss'
  if (marginPct < 20) return 'margin-readout is-thin'
  return 'margin-readout is-good'
}

// PROVISORISKA reglageintervall — §7.3/§7.5 ger ingen exakt gräns för
// leveranstid eller muta (till skillnad från priset, vars intervall ÄR
// playerWinCurve:s eget span, en delad källa). Dokumenterat, kalibrerbart.
const DELIVERY_SLACK_TURNS = 6 // hur många turer över köparens krav reglaget tillåter
const BRIBE_MAX_PCT_OF_REFERENCE = 0.2 // muta, som andel av referencePrice

export function BidForm({
  state,
  order,
  existingBid,
  onSubmit,
  onRemove,
}: {
  state: GameState
  order: Order
  existingBid: Bid | undefined
  onSubmit: (bid: Bid) => void
  onRemove: () => void
}) {
  // P93: "3–4 snabba skrivmaskinsslag" när ett formulär öppnas.
  useEffect(() => {
    void playSound('typewriter')
  }, [])
  const [grade, setGrade] = useState<Grade>(existingBid?.grade ?? 'A')

  // P127 (ETAPP9 §9, budmappen): ett Segmented-val bland husets konstruktioner (plus STANDARD = basprodukten). Bara konstruktioner som går att
  // bjuda på visas (samma prövning som bidding.ts, bidDesignRejection). Vinstchansen räknas om direkt eftersom bidEstimate/playerWinCurve tar
  // designId (en formel, en källa).
  const eligibleDesigns = useMemo(() => (state.house.designs ?? []).filter((d) => bidDesignRejection(state, { designId: d.id, price: 0 }, order) === null), [state, order])
  // P188 (10X): köparens tekniska golv — standardprodukten kan vara en generation för gammal. Då är STANDARD inte ett val; finns ingen konstruktion som passar är ordern låst.
  const stockReason = useMemo(() => bidDesignRejection(state, { price: 0 }, order), [state, order])
  const [designChoice, setDesignChoice] = useState<string>(
    existingBid?.designId && eligibleDesigns.some((d) => d.id === existingBid.designId) ? existingBid.designId : stockReason !== null && eligibleDesigns[0] ? eligibleDesigns[0].id : 'standard',
  )
  const designId = designChoice === 'standard' ? undefined : designChoice
  const chosenDesign = designId ? eligibleDesigns.find((d) => d.id === designId) : undefined
  const [kit, setKit] = useState<boolean>(existingBid?.kit ?? false)
  const useKit = kit && chosenDesign !== undefined && chosenDesign.lineage !== null
  const [customise, setCustomise] = useState<boolean>(existingBid?.customise ?? false)

  const [deliveryTurns, setDeliveryTurns] = useState<number>(existingBid?.deliveryTurns ?? order.requiredDeliveryTurns)

  // bidEstimate/playerWinCurve drar aldrig ur huvud-Rng:n (hash-seedade, se
  // queries.ts) — säkert att räkna om vid varje grade-byte utan att röra
  // rngCursor.
  const estimate = useMemo(() => bidEstimate(state, order, grade, designId, useKit, customise, deliveryTurns), [state, order, grade, designId, useKit, customise, deliveryTurns])
  const winCurve = useMemo(() => playerWinCurve(state, order, grade, designId, useKit, customise, deliveryTurns), [state, order, grade, designId, useKit, customise, deliveryTurns])
  const priceMin = winCurve[0]?.price ?? 0
  const priceMax = winCurve[winCurve.length - 1]?.price ?? priceMin

  const [price, setPrice] = useState<number>(existingBid?.price ?? priceMin)
  // En annan konstruktion (eller sats) flyttar prisintervallet (självkostnaden ändras) — håll priset inom det.
  useEffect(() => {
    setPrice((p) => Math.min(Math.max(p, priceMin), priceMax))
  }, [priceMin, priceMax])
  const [bribe, setBribe] = useState<number>(existingBid?.bribe ?? 0)

  const stamps = chosenDesign ? designBidStamps(state, chosenDesign, order) : null
  const kitReason = chosenDesign && chosenDesign.lineage !== null ? bidDesignRejection(state, { designId: chosenDesign.id, kit: true, price }, order) : null
  const yourWinChance = interpolateConfidence(winCurve, price)
  const terms = useMemo(() => orderTerms(state, order), [state, order])
  // P180 (ETAPP11 §8 punkt 4): när ordern kan vara klar med dagens plan, på vilken linje, och vad den tränger undan — samma projektion som produktionstavlan.
  const capacity = useMemo(
    () => capacityOutlook(state, { productId: order.productId, quantity: order.quantity, designId: designId ?? null, deliveryTurns }),
    [state, order, designId, deliveryTurns],
  )
  const advanceCash = advanceAmount(price, order.advancePct)
  const promiseEarly = Math.min(BOT_BALANCE.deliveryPromiseCapTurns, Math.max(0, order.requiredDeliveryTurns - deliveryTurns))
  const promiseBonus = deliveryPromiseTerm(order.weights, deliveryTurns, order.requiredDeliveryTurns)
  // P185 (11O): huvudleverantörsregeln — samma prövning som avgörandet (validateBid), skälet i klartext.
  const product = getProduct(order.productId)
  const supplierLock = leadSupplierRejection(state.house, product, order.quantity)
  const lockReason = supplierLock ?? (stockReason !== null && eligibleDesigns.length === 0 ? stockReason : null)

  // price är HELA kontraktets pris, yourUnitCost är kostnaden för EN enhet
  // (spec 4.1, CLAUDE.md hård regel 10) — kostnadssidan måste därför skalas med
  // orderns kvantitet. Utan multiplikationen visade formuläret ~100 % marginal
  // på i stort sett varje bud.
  const totalCost = estimate.yourUnitCost * order.quantity
  const grossProfit = price - totalCost
  const marginPct = price > 0 ? (grossProfit / price) * 100 : null

  const bribeMax = Math.max(1, Math.round(order.referencePrice * BRIBE_MAX_PCT_OF_REFERENCE))
  const bribeStep = Math.max(1, Math.round(bribeMax / 20))

  return (
    <div className="bid-panel" data-testid="bid-form">
      {lockReason !== null && (
        <div className="bid-locked" role="alert" data-testid="bid-locked">
          <span className="bid-locked-stamp">LOCKED</span>
          <p className="bid-locked-reason" data-testid="bid-locked-reason">
            {lockReason}
          </p>
          <p className="bid-locked-hint">
            {supplierLock !== null ? 'Build one in The Company, under Works. A works that is ready within a quarter counts.' : 'Set a research track in this category in The Company, or draw a design in it.'}
          </p>
        </div>
      )}
      <div className="cf-field">
        <span className="cf-field-label">GRADE</span>
        <Segmented options={GRADES.map((g) => ({ value: g, label: g }))} value={grade} onChange={setGrade} testId="bid-grade" />
      </div>

      {eligibleDesigns.length > 0 && (
        <div className="cf-field" data-testid="bid-design-field">
          <span className="cf-field-label">OFFER</span>
          <Segmented
            options={[...(stockReason === null ? [{ value: 'standard', label: 'STANDARD' }] : []), ...eligibleDesigns.map((d, i) => ({ value: d.id, label: `#${i + 1}` }))]}
            value={designChoice}
            onChange={(v) => {
              setDesignChoice(v)
              setKit(false)
            }}
            testId="bid-design"
          />
          {chosenDesign ? (
            <>
              <p className="cf-hint" data-testid="bid-design-name">
                {chosenDesign.name} · generation {chosenDesign.generation}
              </p>
              <div className="bid-design-stamps" data-testid="bid-design-stamps">
                {stamps?.battleProven && (
                  <span className="bid-design-stamp is-green" data-testid="stamp-battle-proven">
                    BATTLE-PROVEN
                  </span>
                )}
                {isExportViolation(state, chosenDesign, order.buyerId) && (
                  <span className="bid-design-stamp is-red" data-testid="stamp-export-breach">
                    EXPORT BREACH
                  </span>
                )}
                {chosenDesign.exclusiveTo && (
                  <span className="bid-design-stamp" data-testid="stamp-bound">
                    BOUND TO THE {chosenDesign.exclusiveTo.toUpperCase()}
                  </span>
                )}
                {stamps?.fieldTrialled && (
                  <span className="bid-design-stamp is-green" data-testid="stamp-field-trialled">
                    FIELD-TRIALLED HERE
                  </span>
                )}
                <span className={`bid-design-stamp ${stamps?.requiredLevel === false ? 'is-red' : stamps?.requiredLevel ? 'is-green' : ''}`} data-testid="stamp-required-level">
                  {stamps?.requiredLevel === null || stamps === null ? 'REQUIRED LEVEL ?' : stamps.requiredLevel ? 'REQUIRED LEVEL MET' : 'BELOW REQUIRED LEVEL'}
                </span>
              </div>
              {chosenDesign.lineage !== null && <DsToggle label="Upgrade kit (quicker, thinner margin)" checked={kit} onChange={setKit} testId="bid-kit" />}
              {kit && kitReason && <p className="cf-hint is-warning">{kitReason}</p>}
            </>
          ) : (
            <p className="cf-hint">The base product — no design of your own.</p>
          )}
        </div>
      )}

      <div className="cf-field">
        <DsToggle label="Customise to the buyer (dearer, but a better mark)" checked={customise} onChange={setCustomise} testId="bid-customise" />
        {customise && (
          <p className="cf-hint" data-testid="bid-customise-hint">
            Costs {Math.round((CUSTOMISE_TERMS.costFactor - 1) * 100)}% more to build. If it wins there is a {CUSTOMISE_TERMS.scandalPct}% risk of a scandal at the buyer that
            halves the order.
          </p>
        )}
      </div>

      <div className="cf-field">
        <DsSlider
          label="Price"
          value={price}
          min={priceMin}
          max={priceMax}
          step={Math.max(1, Math.round((priceMax - priceMin) / 100))}
          onChange={setPrice}
          format={formatMoney}
          testId="bid-price"
        />
        {/* P99 (ETAPP8_FORSLAG.md §4.2): tre tal vid prisreglaget — vinstchans, marginal och
            pengar i kassan nästa kvartal (förskottet) — så avvägningen syns i ett enda ögonkast
            utan att formuläret scrollas. Förskottet är advanceAmount(pris, orderns fasta
            advancePct): exakt den formel bidding.ts betalar ut med; det betalas bara om budet
            vinner, därav "if won". */}
        <div className="bid-readouts" data-testid="bid-readouts">
          <div className="bid-readout" data-testid="your-win-chance">
            <span className="bid-readout-label">Win chance</span>
            <span className="bid-readout-value">{yourWinChance}%</span>
          </div>
          <div className="bid-readout" data-testid="readout-margin">
            <span className="bid-readout-label">Margin</span>
            <span className={`bid-readout-value ${marginTone(marginPct)}`}>{marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}</span>
          </div>
          <div className="bid-readout" data-testid="readout-cash">
            <span className="bid-readout-label">Cash next quarter</span>
            <span className="bid-readout-value">{`+${formatMoney(advanceCash)}`}</span>
            <span className="bid-readout-sub">{order.advancePct}% advance, if won</span>
          </div>
        </div>
        <p className="cf-hint" data-testid="advance-drivers">
          {terms.drivers
            ? `Buyer now: need ${levelWord(terms.drivers.urgency)} · funds ${levelWord(terms.drivers.funds)} · relationship ${levelWord(terms.drivers.relationship)}`
            : 'What drives the advance is unknown — no intelligence on this buyer.'}
        </p>
      </div>

      <div className="cf-field">
        <Stepper
          label="Delivery time"
          value={deliveryTurns}
          min={1}
          max={order.requiredDeliveryTurns + DELIVERY_SLACK_TURNS}
          onChange={setDeliveryTurns}
          format={(v) => `${v}t`}
          testId="bid-delivery"
        />
        <p className="cf-hint" data-testid="bid-promise-term">
          {promiseEarly > 0
            ? `Promising ${promiseEarly} quarter${promiseEarly === 1 ? '' : 's'} early adds ${promiseBonus.toFixed(1)} points to the bid (it counts up to ${BOT_BALANCE.deliveryPromiseCapTurns} quarters). A promise the works misses is a late delivery.`
            : `Promise less than the buyer's ${order.requiredDeliveryTurns} quarters to earn points — up to ${BOT_BALANCE.deliveryPromiseCapTurns} quarters count. Only if the works can deliver it.`}
        </p>
      </div>

      {product.restricted && product.doomsdayOnDelivery && (
        <p className="bid-doomsday" role="note" data-testid="bid-doomsday">
          Each delivery adds {product.doomsdayOnDelivery[0]}–{product.doomsdayOnDelivery[1]} to doomsday (now {Math.round(state.doomsday)}). At 100 the world ends.
        </p>
      )}

      <CapacityNote outlook={capacity} deliveryTurns={deliveryTurns} turn={state.meta.turn} />

      <div className="cf-field">
        <DsSlider label="Bribe" value={bribe} min={0} max={bribeMax} step={bribeStep} onChange={setBribe} format={formatMoney} testId="bid-bribe" />
      </div>

      <div className="cf-preview" data-testid="bid-preview">
        <div className="cf-preview-row">
          <span>Your unit cost (grade {grade})</span>
          <span data-testid="your-unit-cost">{formatMoney(estimate.yourUnitCost)}</span>
        </div>
        <div className="cf-preview-row">
          <span>Estimated rival price</span>
          <span>
            {formatMoney(estimate.rivalPriceLow)} – {formatMoney(estimate.rivalPriceHigh)}
          </span>
        </div>
        <div className={marginClass(marginPct)}>
          <div>
            <div className="margin-label">Gross margin</div>
            <div className="meter-label" style={{ marginTop: 2 }}>
              {formatMoney(grossProfit)} after {formatMoney(totalCost)} in unit cost ({order.quantity} units)
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <Button
          variant="primary"
          disabled={lockReason !== null || (useKit && kitReason !== null)}
          onClick={() =>
            onSubmit({
              orderId: order.id,
              price,
              deliveryTurns,
              grade,
              bribe,
              ...(designId ? { designId } : {}),
              ...(useKit ? { kit: true } : {}),
              ...(customise ? { customise: true } : {}),
            })
          }
          testId="bid-submit"
        >
          {existingBid ? 'Update Bid' : 'Place Bid'}
        </Button>
        {existingBid && (
          <Button variant="secondary" onClick={onRemove} testId="bid-remove">
            Remove Bid
          </Button>
        )}
      </div>
    </div>
  )
}

// "Ready by": tidigast färdigtillverkad och leveransfönstret, linjen eller underleverantören, omställningen, kön framför, och vilka väntande kontrakt ordern skulle skjuta förbi sin
// förfallodag om den ställdes först. Det är en uppskattning av tillverkningen, inte ett löfte — leveransen tar några kvartal till och slumpen (haveri, sen underleverantör) ingår inte.
function CapacityNote({ outlook, deliveryTurns, turn }: { outlook: ReturnType<typeof capacityOutlook>; deliveryTurns: number; turn: number }) {
  const many = outlook.lines.length > 1 // P187: de lediga linjerna tillsammans
  const where =
    outlook.route === 'subcontractor'
      ? 'with a subcontractor'
      : many
        ? `on ${outlook.lines.map((l) => l.replace('line-', 'L').toUpperCase()).join(' + ')} together`
        : outlook.line
          ? `on ${outlook.line.toUpperCase()}`
          : 'on no line'
  return (
    <div className={`bid-capacity${outlook.late ? ' is-late' : ''}`} data-testid="bid-capacity">
      <span className="bid-capacity-title">Ready by</span>
      <p className="bid-capacity-line" data-testid="bid-ready">
        {outlook.readyTurn === null
          ? 'No line can build this.'
          : `Built by T${outlook.readyTurn} ${where}${outlook.setupTurns > 0 ? `, after ${outlook.setupTurns} quarter${outlook.setupTurns === 1 ? '' : 's'} of retooling` : ''}.`}
      </p>
      {many && (
        <p className="bid-capacity-line" data-testid="bid-many-lines">
          Put the contract on each line in the production plan once you win it; the extra lines start a quarter later.
        </p>
      )}
      {outlook.deliveredBetween && (
        <p className="bid-capacity-line" data-testid="bid-delivered">
          Delivered T{outlook.deliveredBetween[0]}–T{outlook.deliveredBetween[1]}; the buyer wants it by T{turn + deliveryTurns}.
        </p>
      )}
      {outlook.late && (
        <p className="bid-capacity-line is-warning" data-testid="bid-late">
          Too late at {deliveryTurns} quarters — short by {Math.abs(outlook.slack ?? 0)} quarter{Math.abs(outlook.slack ?? 0) === 1 ? '' : 's'}. Allow more time, or add capacity.
        </p>
      )}
      {outlook.waitingAhead.length > 0 && (
        <p className="bid-capacity-line" data-testid="bid-queue">
          Behind {outlook.waitingAhead.length} waiting contract{outlook.waitingAhead.length === 1 ? '' : 's'}.
        </p>
      )}
      {outlook.displacesIfFirst.length > 0 && (
        <p className="bid-capacity-line is-warning" data-testid="bid-displaces">
          Built first, it would make {outlook.displacesIfFirst.map((d) => `${d.contractId.replace(/^contract-/, '')} (+${d.delayTurns})`).join(', ')} late.
        </p>
      )}
    </div>
  )
}
