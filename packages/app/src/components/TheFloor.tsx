// THE FLOOR — listar openOrders med bidEstimate och ett budformulär. Mest tid
// spenderas här (spec avsnitt 8). Order.trueBudget/inspectorIntegrity/weights
// visas ALDRIG — de är spelarens dolda information, hela poängen med
// bidEstimate/winBand (avsnitt 4.3).
import { useState } from 'react'
import { getProduct } from '@seventh-front/core'
import type { Bid, GameState, Order, TurnSubmission } from '@seventh-front/core'
import { BidForm } from './BidForm.js'

function formatMoney(amount: number): string {
  return `£${Math.round(amount).toLocaleString('sv-SE')}`
}

function OrderRow({
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
  const [open, setOpen] = useState(false)
  const product = getProduct(order.productId)
  const buyer = state.factions[order.buyerId]

  return (
    <li style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span>{buyer ? buyer.name : order.buyerId}</span>
        <span>söker</span>
        <strong>
          {product.name} × {order.quantity}
        </strong>
        <span style={{ opacity: 0.7 }}>(uppgiven budget {formatMoney(order.statedBudget)})</span>
        <span style={{ opacity: 0.7 }}>utgår T{order.expiresTurn}</span>
        {existingBid && <span title="Bud lagt">✓ bud lagt</span>}
        <button type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'stäng' : 'bjud'}
        </button>
      </div>
      {open && (
        <BidForm state={state} order={order} existingBid={existingBid} onSubmit={onSubmit} onRemove={onRemove} />
      )}
    </li>
  )
}

export function TheFloor({
  state,
  draft,
  onSubmitBid,
  onRemoveBid,
}: {
  state: GameState
  draft: TurnSubmission
  onSubmitBid: (bid: Bid) => void
  onRemoveBid: (orderId: string) => void
}) {
  return (
    <section>
      <h2>THE FLOOR</h2>
      {state.market.openOrders.length === 0 ? (
        <p>Inga öppna ordrar just nu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {state.market.openOrders.map((order) => (
            <OrderRow
              key={order.id}
              state={state}
              order={order}
              existingBid={draft.bids.find((b) => b.orderId === order.id)}
              onSubmit={onSubmitBid}
              onRemove={() => onRemoveBid(order.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
