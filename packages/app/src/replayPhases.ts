// replayPhases.ts — etapp 14, P207 (förslaget §8.2): kvartalsuppspelningen i tre faser på kartbordet, byggd på P196:s uppspelning.
// 1. Konvojerna anländer (leveranser), 2. kanonerna (fronten och förlusterna), 3. telegrammen (politik, marknad och världen).
// Ren: fasen avgörs av rubrikens leveransord och av newsDepartment (P81d), aldrig av en ny klassning i core.
import type { GameState, WireEvent } from '@seventh-front/core'
import { newsDepartment } from './newsClassification.js'

export type ReplayPhase = 'convoys' | 'guns' | 'telegrams'

export const REPLAY_PHASES: { id: ReplayPhase; label: string }[] = [
  { id: 'convoys', label: '1 · Convoys arrive' },
  { id: 'guns', label: '2 · The guns' },
  { id: 'telegrams', label: '3 · Telegrams' },
]

// Leveransrubrikerna i deliveries.ts: "DELIVERED n× …", "n× … REACHES THE …", "CONTRACT … FULFILLED", "RIVAL DELIVERS n× …".
const DELIVERY = /^DELIVERED |REACHES THE |FULFILLED|\bDELIVERS \d/

export function replayPhase(state: GameState, event: WireEvent): ReplayPhase {
  if (DELIVERY.test(event.headline)) return 'convoys'
  if (newsDepartment(state, event) === 'front') return 'guns'
  return 'telegrams'
}

// Händelserna i fasordning; inom en fas i den ordning de hände.
export function orderByPhase(state: GameState, events: readonly WireEvent[]): { event: WireEvent; phase: ReplayPhase }[] {
  const rank: Record<ReplayPhase, number> = { convoys: 0, guns: 1, telegrams: 2 }
  return events
    .map((event, index) => ({ event, phase: replayPhase(state, event), index }))
    .sort((a, b) => rank[a.phase] - rank[b.phase] || a.index - b.index)
    .map(({ event, phase }) => ({ event, phase }))
}
