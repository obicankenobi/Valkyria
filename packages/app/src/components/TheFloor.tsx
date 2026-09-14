// THE FLOOR — listar openOrders med bidEstimate och ett budformulär. Mest tid
// spenderas här (spec avsnitt 8). Order.trueBudget/inspectorIntegrity/weights
// visas ALDRIG — de är spelarens dolda information, hela poängen med
// bidEstimate/winBand (avsnitt 4.3).
import { useState } from 'react'
import { getProduct } from '@seventh-front/core'
import type { Bid, GameState, Order, TurnSubmission } from '@seventh-front/core'
import { BidForm } from './BidForm.js'
import { Panel, Tag, formatMoney } from './ui.js'

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
  const turnsLeft = order.expiresTurn - state.meta.turn

  return (
    <div className="order">
      <div className="order-head">
        <span className="order-buyer">{buyer ? buyer.name : order.buyerId}</span>
        <span className="order-product">{product.name}</span>
        <span className="order-qty">× {order.quantity}</span>
        {product.restricted && <Tag tone="red">Restricted</Tag>}

        <span className="order-meta">
          <span className="meter-label">Uppgiven budget {formatMoney(order.statedBudget)}</span>
          <Tag tone={turnsLeft <= 0 ? 'red' : 'neutral'}>
            {turnsLeft <= 0 ? 'Avgörs denna tur' : `${turnsLeft} tur kvar`}
          </Tag>
          {existingBid && <Tag tone="green">Bud {formatMoney(existingBid.price)}</Tag>}
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'stäng' : 'bjud'}
          </button>
        </span>
      </div>

      {open && (
        <BidForm state={state} order={order} existingBid={existingBid} onSubmit={onSubmit} onRemove={onRemove} />
      )}
    </div>
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
  const activeContracts = state.market.contracts.filter((c) => c.status === 'active' || c.status === 'late')
  const inTransit = state.market.shipments.reduce((sum, s) => sum + s.units, 0)

  return (
    <>
      <h2 className="view-title">The Floor</h2>

      <Panel
        title="Öppna utlysningar"
        flush
        right={<span className="meter-label">{draft.bids.length} bud lagda denna tur</span>}
      >
        {state.market.openOrders.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            Inga öppna utlysningar. Köparna återkommer.
          </p>
        ) : (
          state.market.openOrders.map((order) => (
            <OrderRow
              key={order.id}
              state={state}
              order={order}
              existingBid={draft.bids.find((b) => b.orderId === order.id)}
              onSubmit={onSubmitBid}
              onRemove={() => onRemoveBid(order.id)}
            />
          ))
        )}
      </Panel>

      <Panel title="Aktiva kontrakt" right={<span className="meter-label">{inTransit} enheter i transit</span>}>
        {activeContracts.length === 0 ? (
          <p className="empty">Inga aktiva kontrakt.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kontrakt</th>
                <th>Köpare</th>
                <th>Produkt</th>
                <th>Levererat</th>
                <th>Deadline</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.map((contract) => {
                const buyer = state.factions[contract.buyerId]
                return (
                  <tr key={contract.id}>
                    <td className="is-key">{contract.id}</td>
                    <td>{buyer ? buyer.name : contract.buyerId}</td>
                    <td>{getProduct(contract.productId).name}</td>
                    <td>
                      {contract.unitsDelivered}/{contract.quantity}
                    </td>
                    <td>T{contract.dueTurn}</td>
                    <td>
                      {contract.status === 'late' ? <Tag tone="red">Försenat</Tag> : <Tag tone="green">Aktivt</Tag>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
