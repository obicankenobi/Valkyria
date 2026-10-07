// orderLocks — P185 (ETAPP11_FORSLAG.md §9b, 11O): vilka öppna ordrar huvudleverantörsregeln låser för huset, och varför. Ren läsning ur validateBid (kärnan, samma prövning som avgörandet och budmappen)
// — en källa. Läses av budmappen (TheFloor), kartans orderlager och informationskort (mapLayers, mapInfo) och This Quarter (thisQuarter).
import { validateBid } from '@seventh-front/core'
import type { FactionId, GameState, Order } from '@seventh-front/core'

export interface LockedOrder {
  order: Order
  reason: string
}

export function lockedOrders(state: GameState, buyerId?: FactionId): LockedOrder[] {
  const out: LockedOrder[] = []
  for (const order of state.market.openOrders) {
    if (buyerId !== undefined && order.buyerId !== buyerId) continue
    const v = validateBid(state, state, { orderId: order.id })
    if (!v.ok) out.push({ order, reason: v.reason })
  }
  return out
}
