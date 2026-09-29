// soundCues — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 3). En ren diff mellan två ögonblicksbilder av det spelaren ser och
// gör → vilka effekter som ska spelas. Samlar alla tillståndsdrivna ljud på en
// plats i stället för att sprida playSound()-anrop över varje komponent;
// komponentnära ljud (tier-select, sheet-open/close, typewriter, hover) ligger
// kvar där interaktionen sker.
import { isInGameView } from './musicDirector.js'
import type { SoundEffect } from './sound.js'

export interface SoundSnapshot {
  view: string
  actionTypes: readonly string[]
  bidCount: number
  openOrderCount: number
  pendingCrisis: boolean
  selectedFactionId: string | null
  replaying: boolean
  turn: number
  wireHeadlines: readonly string[]
}

export type AmbienceLayer = 'room-tone' | 'telex-loop'

// Mönstren är hämtade ordagrant ur de faktiska emit()-anropen (upkeep.ts och
// crisis.ts för bränd station, bidding.ts/orders.ts för vunnet kontrakt) — samma
// arbetssätt som newsClassification.ts:s FLASH_PATTERNS.
const STATION_BURNED = /^STATION .+ BURNED/
const CONTRACT_WON = /WINS THE CONTRACT/

export function soundCuesFor(prev: SoundSnapshot, next: SoundSnapshot): SoundEffect[] {
  // Bara förändringar MELLAN två spelskärmar är händelser. Kommer spelaren från
  // titelskärmen med ett laddat parti, eller laddar en sparplats mitt i spelet
  // (turen hoppar), är skillnaden ett tillståndsbyte, inte något som hänt.
  if (!isInGameView(prev.view) || !isInGameView(next.view)) return []
  if (next.turn < prev.turn || next.turn > prev.turn + 1) return []

  const cues: SoundEffect[] = []
  const add = (cue: SoundEffect) => {
    if (!cues.includes(cue)) cues.push(cue)
  }

  if (prev.view !== next.view && isInGameView(prev.view) && isInGameView(next.view)) {
    add(next.view === 'news' ? 'newsreel-sting' : 'tab-switch')
  }

  if (next.actionTypes.length > prev.actionTypes.length) {
    const added = next.actionTypes[next.actionTypes.length - 1]
    add(added === 'BACK_CHANNEL' ? 'backchannel' : 'card-place')
  } else if (next.actionTypes.length < prev.actionTypes.length) {
    add('card-remove')
  }

  if (next.bidCount > prev.bidCount) add('stamp')
  else if (next.bidCount < prev.bidCount) add('card-remove')

  if (next.selectedFactionId !== null && next.selectedFactionId !== prev.selectedFactionId) add('map-select')

  if (next.openOrderCount > prev.openOrderCount) add('order-new')

  if (next.pendingCrisis && !prev.pendingCrisis) add('crisis-phone')

  if (next.turn > prev.turn) {
    if (next.wireHeadlines.some((h) => STATION_BURNED.test(h))) add('static-burst')
    if (next.wireHeadlines.some((h) => CONTRACT_WON.test(h))) add('stamp')
  }

  return cues
}

export function ambienceLayers(snapshot: Pick<SoundSnapshot, 'view' | 'replaying'>): AmbienceLayer[] {
  if (!isInGameView(snapshot.view)) return []
  return snapshot.replaying ? ['room-tone', 'telex-loop'] : ['room-tone']
}
