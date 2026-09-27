// BidForm — budformuläret för en order (P84, ETAPP7_TEKNISK_SPEC.md §7.5,
// §13). "Ett prisreglage över winBand som kurva, med marginal och
// vinstchans som följer reglaget över spelarens hela prisintervall"
// (P81-7). Order.trueBudget/inspectorIntegrity/weights visas ALDRIG — de är
// spelarens dolda information, hela poängen med bidEstimate/winBand
// (avsnitt 4.3). Regel 2: aldrig <select>/input[type=number] — Segmented/
// DsSlider/Stepper genomgående, samma mönster som CountryFile.tsx (P79).
import { useMemo, useState } from 'react'
import { bidEstimate, playerWinCurve } from '@seventh-front/core'
import type { Bid, GameState, Grade, Order, PlayerWinCurvePoint } from '@seventh-front/core'
import { formatMoney } from './ui.js'
import { Button, DsSlider, Segmented, Stepper } from './designSystem.js'

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
  const [grade, setGrade] = useState<Grade>(existingBid?.grade ?? 'A')

  // bidEstimate/playerWinCurve drar aldrig ur huvud-Rng:n (hash-seedade, se
  // queries.ts) — säkert att räkna om vid varje grade-byte utan att röra
  // rngCursor.
  const estimate = useMemo(() => bidEstimate(state, order, grade), [state, order, grade])
  const winCurve = useMemo(() => playerWinCurve(state, order, grade), [state, order, grade])
  const priceMin = winCurve[0]?.price ?? 0
  const priceMax = winCurve[winCurve.length - 1]?.price ?? priceMin

  const [price, setPrice] = useState<number>(existingBid?.price ?? priceMin)
  const [deliveryTurns, setDeliveryTurns] = useState<number>(existingBid?.deliveryTurns ?? order.requiredDeliveryTurns)
  const [bribe, setBribe] = useState<number>(existingBid?.bribe ?? 0)

  const yourWinChance = interpolateConfidence(winCurve, price)

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
      <div className="cf-field">
        <span className="cf-field-label">GRADE</span>
        <Segmented options={GRADES.map((g) => ({ value: g, label: g }))} value={grade} onChange={setGrade} testId="bid-grade" />
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
        <p className="cf-hint" data-testid="your-win-chance">
          Win chance at this price: <strong>{yourWinChance}%</strong>
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
      </div>

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
          <div className="margin-value">{marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}</div>
        </div>
      </div>

      <div className="form-actions">
        <Button variant="primary" onClick={() => onSubmit({ orderId: order.id, price, deliveryTurns, grade, bribe })} testId="bid-submit">
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
