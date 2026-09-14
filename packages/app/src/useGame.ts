// useGame — det enda stället som håller GameState/TurnSubmission-paret,
// anropar resolveTurn, och driver IndexedDB-persistensen (P12). Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8 (useState-exemplet). Ingen state-
// hanteringsbibliotek — bara useState, exakt som specen ber om.
import { useCallback, useEffect, useState } from 'react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { Bid, GameState, PlayerAction, TurnSubmission } from '@seventh-front/core'
import { SCENARIO_ID, emptySubmission, newSeed } from './game.js'
import { loadGame, saveGame } from './persistence.js'

const SAVE_SLOT = 'default'

export interface RejectedEntry {
  action: PlayerAction | Bid
  reason: string
}

export interface UseGameResult {
  state: GameState
  draft: TurnSubmission
  lastRejected: RejectedEntry[]
  hydrated: boolean
  setBid: (bid: Bid) => void
  removeBid: (orderId: string) => void
  addAction: (action: PlayerAction) => void
  removeAction: (index: number) => void
  setCrisisChoice: (choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE') => void
  endTurn: () => void
  restart: () => void
}

export function useGame(): UseGameResult {
  const [state, setState] = useState<GameState>(() => createInitialState(SCENARIO_ID, newSeed()))
  const [draft, setDraft] = useState<TurnSubmission>(emptySubmission)
  const [lastRejected, setLastRejected] = useState<RejectedEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Läs ett sparat parti vid mount, en gång. Autosparningen nedan får INTE
  // köra förrän det här är klart — annars skriver det nya, tomma partiet
  // (redan i state ovan) över ett riktigt sparat parti innan det hinner läsas.
  useEffect(() => {
    let cancelled = false
    loadGame(SAVE_SLOT)
      .then((saved) => {
        if (cancelled || !saved) return
        setState(saved.state)
        setDraft(saved.draft)
      })
      .catch(() => {
        // Inget sparat parti, eller IndexedDB otillgängligt (t.ex. privat
        // läge) — fortsätter med det redan skapade nya partiet.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Autospara efter varje resolveTurn (spec avsnitt 8) — och efter varje
  // draft-ändring, så ett parti kan återupptas MITT I en tur (P12 klart-när)
  // utan att ett halvifyllt bud går förlorat.
  useEffect(() => {
    if (!hydrated) return
    saveGame(SAVE_SLOT, { state, draft }).catch(() => {
      // Persistens är best-effort — ett misslyckat sparförsök ska aldrig
      // krascha spelet eller synas som ett konsolfel.
    })
  }, [hydrated, state, draft])

  const setBid = useCallback((bid: Bid) => {
    setDraft((prev) => ({
      ...prev,
      bids: [...prev.bids.filter((b) => b.orderId !== bid.orderId), bid],
    }))
  }, [])

  const removeBid = useCallback((orderId: string) => {
    setDraft((prev) => ({ ...prev, bids: prev.bids.filter((b) => b.orderId !== orderId) }))
  }, [])

  // INTERNAL/POLITICAL executive actions (spec avsnitt 8, P21:s handlings-UI) —
  // bara köade här, den faktiska handlingstaks-/avvisningskontrollen sker i
  // applyActions.ts vid endTurn (samma mönster som setBid: draften är bara ett
  // förslag tills resolveTurn körs).
  const addAction = useCallback((action: PlayerAction) => {
    setDraft((prev) => ({ ...prev, actions: [...prev.actions, action] }))
  }, [])

  const removeAction = useCallback((index: number) => {
    setDraft((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }))
  }, [])

  // CRISIS (avsnitt 9.2/9.4) — kostar ingen actionPoint och ska bara finnas EN
  // gång i draften (resolvePendingCrisis, applyActions.ts, letar upp den FÖRSTA
  // CRISIS-handlingen); ett omval ersätter alltså det tidigare valet i stället
  // för att lägga till ett andra.
  const setCrisisChoice = useCallback((choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE') => {
    setDraft((prev) => ({
      ...prev,
      actions: [...prev.actions.filter((a) => a.type !== 'CRISIS'), { type: 'CRISIS', choice }],
    }))
  }, [])

  const endTurn = useCallback(() => {
    if (state.status.kind === 'ended') return
    const result = resolveTurn(state, draft)
    setState(result.state)
    setDraft(emptySubmission())
    setLastRejected(result.rejected)
  }, [state, draft])

  const restart = useCallback(() => {
    setState(createInitialState(SCENARIO_ID, newSeed()))
    setDraft(emptySubmission())
    setLastRejected([])
  }, [])

  return { state, draft, lastRejected, hydrated, setBid, removeBid, addAction, removeAction, setCrisisChoice, endTurn, restart }
}
