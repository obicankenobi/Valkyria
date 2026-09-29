// useGame — det enda stället som håller GameState/TurnSubmission-paret,
// anropar resolveTurn, och driver IndexedDB-persistensen (P12). Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8 (useState-exemplet). Ingen state-
// hanteringsbibliotek — bara useState, exakt som specen ber om.
import { useCallback, useEffect, useState } from 'react'
import { DISPLAY_THRESHOLDS, createInitialState, resolveTurn } from '@seventh-front/core'
import type { Bid, GameState, PlayerAction, StandingOrderChange, StartChoices, TurnSubmission, WireEvent } from '@seventh-front/core'
import { SAVE_SLOT, SCENARIO_ID, emptySubmission, newSeed } from './game.js'
import { loadGame, saveGame } from './persistence.js'
import { crossedDoomsdayThreshold, playSound } from './sound.js'
import { standingOrderKey } from './standingOrderBoard.js'

// P72 (ETAPP6_TEKNISK_SPEC.md §5): "doomsday-tröskelpassage" läst som en av
// de tre nivåer THE WORLD redan visar spelaren (Meter-märkena i TheWorld.tsx)
// — inget nytt balanstal, bara samma tre DISPLAY_THRESHOLDS-fält återanvända
// som en lista.
const DOOMSDAY_SOUND_THRESHOLDS = [
  DISPLAY_THRESHOLDS.doomsdayCrisisWatch,
  DISPLAY_THRESHOLDS.doomsdayCrisisEvent,
  DISPLAY_THRESHOLDS.doomsdayNuclearExchange,
]

export interface RejectedEntry {
  action: PlayerAction | Bid | StandingOrderChange
  reason: string
}

export interface UseGameResult {
  state: GameState
  draft: TurnSubmission
  lastRejected: RejectedEntry[]
  // P80 (ETAPP7_TEKNISK_SPEC.md §8): "händelserna i en 20-turers golden-
  // körning" — kvartalsuppspelningen behöver DENNA turs färska händelser i
  // PIPELINE-ordning, inte state.wire (det rullande fönstret, kan sträcka
  // sig över flera turer och är redan omsorterat på andra ställen). Samma
  // "senaste turens ORÖRDA resultat"-princip som lastRejected redan har.
  lastTurnWire: WireEvent[]
  hydrated: boolean
  setBid: (bid: Bid) => void
  removeBid: (orderId: string) => void
  addAction: (action: PlayerAction) => void
  removeAction: (index: number) => void
  setStandingOrder: (change: StandingOrderChange) => void
  removeStandingOrder: (key: string) => void
  setCrisisChoice: (choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE') => void
  endTurn: () => void
  restart: (startChoices?: StartChoices) => void
  // P90 (ETAPP7_TEKNISK_SPEC.md §9/§13): "sparplatser." Läser en manuell
  // kontrollpunkt (persistence.ts) och gör den till det LEVANDE partiet —
  // useGame.ts:s egen autospar-effekt (ovan) skriver den sedan vidare till
  // SAVE_SLOT som vanligt, precis som efter varje endTurn. Returnerar false
  // om fliken var tom, så anropsplatsen kan visa ett resultat utan att
  // behöva duplicera loadGame-anropet.
  loadFromSlot: (slot: string) => Promise<boolean>
}

export function useGame(): UseGameResult {
  const [state, setState] = useState<GameState>(() => createInitialState(SCENARIO_ID, newSeed()))
  const [draft, setDraft] = useState<TurnSubmission>(emptySubmission)
  const [lastRejected, setLastRejected] = useState<RejectedEntry[]>([])
  const [lastTurnWire, setLastTurnWire] = useState<WireEvent[]>([])
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

  // P101 (ETAPP8_FORSLAG.md §5.2): stående order kostar ingen handling — de köas i draften och gäller från
  // nästa tur. En ny ändring för samma linje/station/råvara ersätter en tidigare köad (samma nyckel).
  const setStandingOrder = useCallback((change: StandingOrderChange) => {
    const key = standingOrderKey(change)
    setDraft((prev) => ({
      ...prev,
      standingOrders: [...prev.standingOrders.filter((c) => standingOrderKey(c) !== key), change],
    }))
  }, [])

  const removeStandingOrder = useCallback((key: string) => {
    setDraft((prev) => ({ ...prev, standingOrders: prev.standingOrders.filter((c) => standingOrderKey(c) !== key) }))
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
    // P72 (ETAPP6_TEKNISK_SPEC.md §5): "turavslut" och "doomsday-
    // tröskelpassage" delar den enda plats som synkront har BÅDE state
    // (före) och result.state (efter) — App.tsx:s egen handleEndTurn har
    // bara det React redan hunnit rendera, inte det färska before/after-
    // paret. playSound() sväljer alla fel själv (se sound.ts), så inget
    // try/catch behövs här.
    void playSound('turn-end')
    if (crossedDoomsdayThreshold(state.doomsday, result.state.doomsday, DOOMSDAY_SOUND_THRESHOLDS)) {
      void playSound('doomsday-threshold')
    }
    setState(result.state)
    setDraft(emptySubmission())
    setLastRejected(result.rejected)
    setLastTurnWire(result.wire)
  }, [state, draft])

  // P88 (ETAPP7_TEKNISK_SPEC.md §9/§13): startChoices valfri — App.tsx:s
  // "New Game" via Briefing skickar in spelarens val (husnamn/hemstat/
  // specialisation), medan en direkt omstart (t.ex. den avslutade
  // partiets "New Game"-genväg) fortfarande kan anropa restart() utan
  // argument och få scenariots defaultval, precis som innan.
  const restart = useCallback((startChoices?: StartChoices) => {
    setState(createInitialState(SCENARIO_ID, newSeed(), startChoices))
    setDraft(emptySubmission())
    setLastRejected([])
    setLastTurnWire([])
  }, [])

  const loadFromSlot = useCallback(async (slot: string): Promise<boolean> => {
    const saved = await loadGame(slot)
    if (!saved) return false
    setState(saved.state)
    setDraft(saved.draft)
    setLastRejected([])
    setLastTurnWire([])
    return true
  }, [])

  return {
    state,
    draft,
    lastRejected,
    lastTurnWire,
    hydrated,
    setBid,
    removeBid,
    addAction,
    removeAction,
    setStandingOrder,
    removeStandingOrder,
    setCrisisChoice,
    endTurn,
    restart,
    loadFromSlot,
  }
}
