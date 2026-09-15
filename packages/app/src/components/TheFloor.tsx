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
  // P46 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2/8): "en order utan frontId ska
  // inte krascha vyn" — SCRIPTED-ordrar och krisköp har frontId: null.
  const frontLabel = order.frontId ?? 'No front'

  return (
    <div className="order">
      <div className="order-head">
        <span className="order-buyer">{buyer ? buyer.name : order.buyerId}</span>
        <span className="order-product">{product.name}</span>
        <span className="order-qty" data-testid="order-quantity">
          × {order.quantity}
        </span>
        {product.restricted && <Tag tone="red">Restricted</Tag>}

        <span className="order-meta">
          <span className="meter-label">Stated budget {formatMoney(order.statedBudget)}</span>
          <Tag>{frontLabel}</Tag>
          <Tag tone={turnsLeft <= 0 ? 'red' : 'neutral'}>
            {turnsLeft <= 0 ? 'Decided this turn' : `${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`}
          </Tag>
          {existingBid && <Tag tone="green">Bid {formatMoney(existingBid.price)}</Tag>}
          {/* "quote"/"close", not "bid" — "bid" is a substring of "Place Bid"/"Update Bid"/
              "Remove Bid" below, which broke e2e locators scoped to an exact 'bid' name
              (Playwright's role-name match is case-insensitive substring by default). */}
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'close' : 'quote'}
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
        title="Open Orders"
        flush
        right={<span className="meter-label">{draft.bids.length} bids placed this turn</span>}
      >
        {state.market.openOrders.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            No open orders. Buyers will return.
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

      <Panel title="Active Contracts" right={<span className="meter-label">{inTransit} units in transit</span>}>
        {activeContracts.length === 0 ? (
          <p className="empty">No active contracts.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Buyer</th>
                <th>Product</th>
                <th>Front</th>
                <th>Delivered</th>
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
                    <td>{contract.frontId ?? '—'}</td>
                    <td>
                      {contract.unitsDelivered}/{contract.quantity}
                    </td>
                    <td>T{contract.dueTurn}</td>
                    <td>{contract.status === 'late' ? <Tag tone="red">Late</Tag> : <Tag tone="green">Active</Tag>}</td>
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
