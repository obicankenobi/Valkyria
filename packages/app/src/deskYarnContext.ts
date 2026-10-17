// deskYarnContext.ts — Paket G2 (ETAPP 12, 12C): datamodell och React-context
// för den fysiska röda karttråden (DeskYarn) som spänns över skrivbordet vid
// hovring på ordermappar, larmrader på skrivblocket, tjänstemän eller
// köade handlingskort i Outbox-korgen.
import { createContext, useContext } from 'react'
import type { GameState, Order, PlayerAction } from '@seventh-front/core'
import type { ThisQuarterItem } from './thisQuarter.js'

export interface DeskYarnConnection {
  sourceEl: HTMLElement
  targetId: string
  tone?: 'red' | 'amber' | 'blue'
}

export interface DeskYarnContextValue {
  connection: DeskYarnConnection | null
  connectYarn: (sourceEl: HTMLElement, targetId: string, tone?: 'red' | 'amber' | 'blue') => void
  clearYarn: () => void
}

export const DeskYarnContext = createContext<DeskYarnContextValue>({
  connection: null,
  connectYarn: () => {},
  clearYarn: () => {},
})

export function useDeskYarn(): DeskYarnContextValue {
  return useContext(DeskYarnContext)
}

export function yarnTargetForThisQuarter(item: ThisQuarterItem, state: GameState): string | null {
  if (item.id.startsWith('order-')) {
    const orderId = item.id.slice('order-'.length)
    const order = state.market.openOrders.find((o) => o.id === orderId)
    if (order) return yarnTargetForOrder(order, state)
  }
  if (item.id.startsWith('station-')) {
    const stationId = item.id.slice('station-'.length)
    const station = state.house.stations.find((s) => s.id === stationId)
    if (station) return station.nation
  }
  if (item.id.startsWith('official-')) {
    const officialId = item.id.slice('official-'.length)
    const official = state.officials[officialId]
    if (official) return official.factionId
  }
  if (item.id.startsWith('contract-')) {
    const contractId = item.id.slice('contract-'.length)
    const contract = state.market.contracts.find((c) => c.id === contractId)
    if (contract) return contract.frontId ?? contract.buyerId
  }
  if (item.target.view === 'operations') {
    return item.target.factionId
  }
  return null
}

export function yarnTargetForOrder(order: Order, state?: GameState): string {
  if (state && order.frontId) {
    const front = state.fronts[order.frontId]
    const buyerSide = front?.sideA === order.buyerId ? 'a' : front?.sideB === order.buyerId ? 'b' : null
    const mauled = front?.formations.find((f) => f.side === buyerSide && f.status === 'mauled')
    if (mauled) return mauled.id
  }
  return order.frontId ?? order.buyerId
}

export function yarnTargetForAction(action: PlayerAction, state: GameState): string | null {
  switch (action.type) {
    case 'INTEL': {
      if (action.op === 'RECRUIT' && action.targetId) return action.targetId
      const station = state.house.stations.find((s) => s.id === action.stationId)
      return station?.nation ?? null
    }
    case 'POLITICAL': {
      if ('officialId' in action) {
        return state.officials[action.officialId]?.factionId ?? null
      }
      return action.targetFactionId
    }
    case 'BROKER':
      return action.buyerId
    default:
      return null
  }
}
