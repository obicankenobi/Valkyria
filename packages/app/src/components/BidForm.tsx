// BidForm — budformuläret för en order. Visar winBand störst (som ett
// sannolikhetsdiagram, inte en tabellrad), yourUnitCost, och BERÄKNAD
// BRUTTOMARGINAL vid det valda priset och den valda graden — spelaren kan inte
// fatta prisbeslut utan att se sin kostnad. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8.
import { useMemo, useState } from 'react'
import { bidEstimate } from '@seventh-front/core'
import type { Bid, GameState, Grade, Order } from '@seventh-front/core'
import { formatMoney } from './ui.js'

const GRADES: Grade[] = ['A', 'B', 'C']

function marginClass(marginPct: number | null): string {
  if (marginPct === null) return 'margin-readout'
  if (marginPct <= 0) return 'margin-readout is-loss'
  if (marginPct < 20) return 'margin-readout is-thin'
  return 'margin-readout is-good'
}

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
  const [price, setPrice] = useState<number>(existingBid?.price ?? 0)
  const [deliveryTurns, setDeliveryTurns] = useState<number>(existingBid?.deliveryTurns ?? order.requiredDeliveryTurns)
  const [grade, setGrade] = useState<Grade>(existingBid?.grade ?? 'A')
  const [bribe, setBribe] = useState<number>(existingBid?.bribe ?? 0)

  // bidEstimate drar aldrig ur huvud-Rng:n (hash-seedad, se queries.ts) — säkert
  // att räkna om vid varje grade-byte utan att röra rngCursor.
  const estimate = useMemo(() => bidEstimate(state, order, grade), [state, order, grade])

  // price är HELA kontraktets pris, yourUnitCost är kostnaden för EN enhet
  // (spec 4.1, CLAUDE.md hård regel 10) — kostnadssidan måste därför skalas med
  // orderns kvantitet. Utan multiplikationen visade formuläret ~100 % marginal
  // på i stort sett varje bud.
  const totalCost = estimate.yourUnitCost * order.quantity
  const grossProfit = price > 0 ? price - totalCost : null
  const marginPct = price > 0 ? ((price - totalCost) / price) * 100 : null

  return (
    <div className="bid-panel">
      <div>
        <p className="subhead">Underrättelse</p>
        <dl className="kv">
          <dt>Din styckkostnad (grade {grade})</dt>
          <dd>{formatMoney(estimate.yourUnitCost)}</dd>
          <dt>Rivalpris, uppskattat</dt>
          <dd>
            {formatMoney(estimate.rivalPriceLow)} – {formatMoney(estimate.rivalPriceHigh)}
          </dd>
          {estimate.lowestRivalHouse && (
            <>
              <dt>Lägst bud väntas från</dt>
              <dd>{state.rivals[estimate.lowestRivalHouse]?.name ?? estimate.lowestRivalHouse}</dd>
            </>
          )}
        </dl>

        <p className="subhead">Vinstchans per pris</p>
        <div className="winband">
          {estimate.winBand.map((point) => (
            <div key={point.price} className="winband-row">
              <span>{formatMoney(point.price)}</span>
              <span className="winband-bar">
                <span style={{ width: `${point.confidence}%` }} />
              </span>
              <span className="winband-pct">{point.confidence}%</span>
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({ orderId: order.id, price, deliveryTurns, grade, bribe })
        }}
      >
        <p className="subhead">Ditt anbud</p>

        <label className="field">
          Pris
          <input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} required />
        </label>
        <label className="field">
          Leveranstid
          <input
            type="number"
            min={1}
            value={deliveryTurns}
            onChange={(e) => setDeliveryTurns(Number(e.target.value))}
            required
          />
        </label>
        <label className="field">
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Muta
          <input type="number" min={0} value={bribe} onChange={(e) => setBribe(Number(e.target.value))} />
        </label>

        {price > estimate.rivalPriceHigh && (
          // Rena avläsningen av spelarens EGEN uppskattning — ingen dold
          // information röjs (trueBudget visas aldrig). Utan den kan
          // formuläret visa en lockande marginal på ett bud som enligt
          // winBand har noll vinstchans.
          <p className="hint is-warn">
            Priset ligger över hela det uppskattade rivalintervallet. Vinstchansen bedöms som noll.
          </p>
        )}

        <div className={marginClass(marginPct)}>
          <div>
            <div className="margin-label">Bruttomarginal</div>
            {grossProfit !== null && (
              <div className="meter-label" style={{ marginTop: 2 }}>
                {formatMoney(grossProfit)} efter {formatMoney(totalCost)} i styckkostnad ({order.quantity} enheter)
              </div>
            )}
          </div>
          <div className="margin-value">{marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}</div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {existingBid ? 'Uppdatera bud' : 'Lägg bud'}
          </button>
          {existingBid && (
            <button type="button" className="btn" onClick={onRemove}>
              Ta bort bud
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
