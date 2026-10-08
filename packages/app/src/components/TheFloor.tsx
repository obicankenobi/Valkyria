// THE FLOOR — CONTRACTS (P84, ETAPP7_TEKNISK_SPEC.md §7.5): "En stämplad
// mapp per order: köpare, produkt, kvantitet, frist, och ett prisreglage
// över winBand som kurva, med marginal och vinstchans som följer reglaget.
// Inga dolda fält (trueBudget, weights, integrity)." Order.trueBudget/
// inspectorIntegrity/weights visas ALDRIG (avsnitt 4.3) — BidForm.tsx äger
// själva reglaget, den här filen äger bara mappen den öppnas ur.
import { ProgrammeFolders } from './ProgrammeFolder.js'
import { RaceBoard } from './RaceBoard.js'
import { useState } from 'react'
import { buyerPreferenceDisplay, getProduct, orderTerms, validateBid } from '@seventh-front/core'
import type { Bid, GameState, Order, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { BidForm } from './BidForm.js'
import { Button } from './designSystem.js'
import { Panel, Tag, formatMoney } from './ui.js'
import { wearClass } from '../stampWear.js'

function OrderFolder({
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
  // P99: villkoren — förskottet är ett villkor i affären (alltid synligt), köparens kreditstämpel
  // grindas genom underrättelse (skyddsräcke 4): utan station "?".
  const terms = orderTerms(state, order)
  const turnsLeft = order.expiresTurn - state.meta.turn
  // P46 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2/8): "en order utan frontId ska
  // inte krascha vyn" — SCRIPTED-ordrar och krisköp har frontId: null.
  const frontLabel = order.frontId ?? 'No front'
  const deadlineLabel = turnsLeft <= 0 ? 'Decided this turn' : `${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`
  // P185 (11O): en order huset inte får bjuda på (inget monteringsverk i kategorin) har en LOCKED-stämpel; skälet står i mappen.
  // P188 (10X): också en standardprodukt som ligger en generation för långt efter köparens block (validateBid är den enda källan).
  const lockValidation = validateBid(state, state, { orderId: order.id })
  const lockReason = lockValidation.ok ? null : lockValidation.reason

  return (
    <div className="order-folder" data-testid="order-folder">
      <div className="order-folder-tab">
        <span>{buyer ? buyer.name : order.buyerId}</span>
        <span className="credit-stamp-group">
          <span className="credit-stamp-label">Credit</span>
          <span
            className={`credit-stamp is-${terms.credit ?? 'unknown'}`}
            data-testid="credit-stamp"
            role="img"
            aria-label={terms.credit ? `Buyer credit rating ${terms.credit}` : 'Buyer credit rating unknown: no intelligence on this buyer'}
          >
            {terms.credit ?? '?'}
          </span>
        </span>
      </div>

      <div className="order-head">
        <span className="order-product">{product.name}</span>
        <span className="order-qty" data-testid="order-quantity">
          × {order.quantity}
        </span>
        {product.restricted && <Tag tone="red">Restricted</Tag>}

        <span className="order-meta">
          <span className="meter-label">Stated budget {formatMoney(order.statedBudget)}</span>
          <Tag>{frontLabel}</Tag>
          <span className={`order-stamp${turnsLeft <= 1 ? ' is-urgent' : ''} ${wearClass(`${order.id}-deadline`)}`} data-testid="order-deadline-stamp">
            {deadlineLabel}
          </span>
          {lockReason !== null && (
            <span className={`order-stamp is-urgent is-locked ${wearClass(`${order.id}-locked`)}`} data-testid="order-locked-stamp" title={lockReason}>
              Locked
            </span>
          )}
          <span className={`order-stamp is-advance ${wearClass(`${order.id}-advance`)}`} data-testid="order-advance-stamp">
            {terms.advancePct > 0 ? `Advance ${terms.advancePct} %` : 'No advance'}
          </span>
          {existingBid && <Tag tone="green">Bid {formatMoney(existingBid.price)}</Tag>}
          {/* "quote"/"close", not "bid" — "bid" is a substring of "Place Bid"/"Update Bid"/
              "Remove Bid" below, which broke e2e locators scoped to an exact 'bid' name
              (Playwright's role-name match is case-insensitive substring by default).
              DS Button (regel 11: min-height 44px baked into .ds-button) instead of the
              old bespoke <button className="btn">, which never met the 44×44 px floor. */}
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'close' : 'quote'}
          </Button>
        </span>
      </div>

      <PreferenceMix state={state} order={order} />

      {open && (
        <BidForm state={state} order={order} existingBid={existingBid} onSubmit={onSubmit} onRemove={onRemove} />
      )}
    </div>
  )
}

// P146 (ETAPP10 §8 punkt 2, P111): vad köparen väger i en konstruktion — prestanda, tillförlitlighet, pris. Bara med en station i landet (skyddsräcke 5): utan den "?".
function PreferenceMix({ state, order }: { state: GameState; order: Order }) {
  const mix = buyerPreferenceDisplay(state, order, getProduct(order.productId).category)
  const pct = (v: number) => `${Math.round(v * 100)} %`
  return (
    <div className="order-mix" data-testid="order-preference-mix">
      <span className="meter-label">Buyer weighs</span>
      {mix === null ? (
        <span className="order-mix-unknown" title="You need a station in the buyer's country to see what it weighs.">
          ? — no intelligence
        </span>
      ) : (
        <span>
          Performance {pct(mix.performance)} · Reliability {pct(mix.reliability)} · Cost {pct(mix.cost)}
        </span>
      )}
    </div>
  )
}

export function TheFloor({
  state,
  draft,
  onSubmitBid,
  onRemoveBid,
  onAddAction = () => {},
  onSetStandingOrder = () => {},
}: {
  state: GameState
  draft: TurnSubmission
  onSubmitBid: (bid: Bid) => void
  onRemoveBid: (orderId: string) => void
  // P128: upphandlingsmappen köar stående order (anmälan, prototyp) och handlingar (knepen). Valfria så att äldre renderingar fungerar.
  onAddAction?: (action: PlayerAction) => void
  onSetStandingOrder?: (change: StandingOrderChange) => void
}) {
  const activeContracts = state.market.contracts.filter((c) => c.status === 'active' || c.status === 'late')
  const inTransit = state.market.shipments.reduce((sum, s) => sum + s.units, 0)

  return (
    <>
      <h2 className="view-title">Contracts</h2>

      {/* P127 (ETAPP9 §7.1/§9): kapplöpningstavlan och kravkorten. */}
      <RaceBoard state={state} />

      {/* P128 (ETAPP9 §8.1/§8.2/§9): upphandlingsmappen, knepen och utvärderingsprotokollet. */}
      <ProgrammeFolders state={state} draft={draft} onSet={onSetStandingOrder} onAddAction={onAddAction} />

      <Panel
        title="Open Orders"
        info="Contracts buyers want filled. Open a folder and place a bid; the best score wins, not only the lowest price." infoTopic="procurement"
        flush
        right={<span className="meter-label">{draft.bids.length} bids placed this turn</span>}
      >
        {state.market.openOrders.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            No open orders. Buyers will return.
          </p>
        ) : (
          state.market.openOrders.map((order) => (
            <OrderFolder
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

      <Panel info="Contracts you have won and are delivering, and what is still in transit." infoTopic="procurement" title="Active Contracts" right={<span className="meter-label">{inTransit} units in transit</span>}>
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
