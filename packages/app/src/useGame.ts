// useGame — det enda stället som håller GameState/TurnSubmission-paret och
// anropar resolveTurn. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8 (useState-exemplet).
// Ingen state-hanteringsbibliotek — bara useState, exakt som specen ber om.
import { useCallback, useState } from 'react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { Bid, GameState, PlayerAction, TurnSubmission } from '@seventh-front/core'
import { SCENARIO_ID, emptySubmission, newSeed } from './game.js'

export interface RejectedEntry {
  action: PlayerAction | Bid
  reason: string
}

export interface UseGameResult {
  state: GameState
  draft: TurnSubmission
  lastRejected: RejectedEntry[]
  setBid: (bid: Bid) => void
  removeBid: (orderId: string) => void
  endTurn: () => void
  restart: () => void
}

export function useGame(): UseGameResult {
  const [seed, setSeed] = useState(newSeed)
  const [state, setState] = useState<GameState>(() => createInitialState(SCENARIO_ID, seed))
  const [draft, setDraft] = useState<TurnSubmission>(emptySubmission)
  const [lastRejected, setLastRejected] = useState<RejectedEntry[]>([])

  const setBid = useCallback((bid: Bid) => {
    setDraft((prev) => ({
      ...prev,
      bids: [...prev.bids.filter((b) => b.orderId !== bid.orderId), bid],
    }))
  }, [])

  const removeBid = useCallback((orderId: string) => {
    setDraft((prev) => ({ ...prev, bids: prev.bids.filter((b) => b.orderId !== orderId) }))
  }, [])

  const endTurn = useCallback(() => {
    if (state.status.kind === 'ended') return
    const result = resolveTurn(state, draft)
    setState(result.state)
    setDraft(emptySubmission())
    setLastRejected(result.rejected)
  }, [state, draft])

  const restart = useCallback(() => {
    const nextSeed = newSeed()
    setSeed(nextSeed)
    setState(createInitialState(SCENARIO_ID, nextSeed))
    setDraft(emptySubmission())
    setLastRejected([])
  }, [])

  return { state, draft, lastRejected, setBid, removeBid, endTurn, restart }
}
