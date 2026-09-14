// BidForm — budformuläret för en order. Visar winBand störst, yourUnitCost och
// BERÄKNAD BRUTTOMARGINAL vid det valda priset och den valda graden — spelaren
// kan inte fatta prisbeslut utan att se sin kostnad. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 8.
import { useMemo, useState } from 'react'
import { bidEstimate } from '@seventh-front/core'
import type { Bid, GameState, Grade, Order } from '@seventh-front/core'

const GRADES: Grade[] = ['A', 'B', 'C']

function formatMoney(amount: number): string {
  return `£${Math.round(amount).toLocaleString('sv-SE')}`
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

  const marginPct = price > 0 ? ((price - estimate.yourUnitCost) / price) * 100 : null

  return (
    <div style={{ borderLeft: '2px solid currentColor', paddingLeft: '0.75rem', marginTop: '0.5rem' }}>
      <table>
        <tbody>
          <tr>
            <td>yourUnitCost (grade {grade})</td>
            <td>{formatMoney(estimate.yourUnitCost)}</td>
          </tr>
          <tr>
            <td>rivalpris, uppskattat</td>
            <td>
              {formatMoney(estimate.rivalPriceLow)} – {formatMoney(estimate.rivalPriceHigh)}
              {estimate.lowestRivalHouse && ` (lägst: ${estimate.lowestRivalHouse})`}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginBottom: '0.25rem' }}>winBand:</p>
      <table>
        <thead>
          <tr>
            <th>pris</th>
            <th>vinstchans</th>
          </tr>
        </thead>
        <tbody>
          {estimate.winBand.map((point) => (
            <tr key={point.price}>
              <td>{formatMoney(point.price)}</td>
              <td>{point.confidence}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({ orderId: order.id, price, deliveryTurns, grade, bribe })
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '20rem' }}
      >
        <label style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          Pris
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            required
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          Leveranstid (turer)
          <input
            type="number"
            min={1}
            value={deliveryTurns}
            onChange={(e) => setDeliveryTurns(Number(e.target.value))}
            required
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          Muta
          <input type="number" min={0} value={bribe} onChange={(e) => setBribe(Number(e.target.value))} />
        </label>

        <p>
          <strong>Beräknad bruttomarginal: {marginPct === null ? '—' : `${marginPct.toFixed(1)}%`}</strong>
        </p>

        <button type="submit">{existingBid ? 'Uppdatera bud' : 'Lägg bud'}</button>
        {existingBid && (
          <button type="button" onClick={onRemove}>
            Ta bort bud
          </button>
        )}
      </form>
    </div>
  )
}
