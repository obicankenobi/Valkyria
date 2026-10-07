// replayFocus — P158 (ETAPP10_FORSLAG.md §11 punkt 1): kvartalsuppspelningen pekar ut var på kartan varje händelse hör hemma. Ren och testbar. `replayGeoAnchor` översätter ett
// WireAnchor (wireAnchor.ts, P80) till en [lat, lng] ur samma geometri kartan ritar: frontlinjens markör (interpolateFrontGeoPosition), huvudstäderna (CAPITALS) och NLF:s
// förbandsmedelpunkt (landlessFactions). En händelse utan plats på kartan (HUD) ger null. Ingen ny kartmotor: kartan ritar en ring på punkten (TheatreMap.tsx).
import type { GameState, WireEvent } from '@seventh-front/core'
import { CAPITALS } from './capitals.js'
import { interpolateFrontGeoPosition } from './geoMath.js'
import { landlessFactions } from './mapLayers.js'
import { isFlashEvent } from './newsClassification.js'
import { SECTOR_REGIONS } from './sectorRegions.js'
import type { WireAnchor } from './wireAnchor.js'

function frontPoint(state: GameState, frontId: string): [number, number] | null {
  const front = state.fronts[frontId]
  const regions = front ? SECTOR_REGIONS[front.theatreId] : undefined
  return front && regions && regions.length > 0 ? interpolateFrontGeoPosition(regions, front.position) : null
}

export function replayGeoAnchor(state: GameState, anchor: WireAnchor): [number, number] | null {
  switch (anchor.kind) {
    case 'hud':
      return null
    case 'sector': {
      if (state.fronts[anchor.id]) return frontPoint(state, anchor.id)
      // ett teater-id: teaterns första front
      const front = Object.values(state.fronts).find((f) => f.theatreId === anchor.id)
      return front ? frontPoint(state, front.id) : null
    }
    case 'country':
      return capitalOrLandless(state, anchor.id)
    case 'station': {
      const station = state.house.stations.find((s) => s.id === anchor.id)
      return station ? capitalOrLandless(state, station.nation) : null
    }
  }
}

function capitalOrLandless(state: GameState, factionId: string): [number, number] | null {
  const capital = CAPITALS.find((c) => c.factionId === factionId)
  if (capital) return capital.anchor
  return landlessFactions(state).find((l) => l.factionId === factionId)?.anchor ?? null
}

// Hur ringen ritas: en blixt (genombrott, kris, slut) är stor och röd, en vanlig rubrik en ring, en ticker en liten.
export type ReplayKind = 'flash' | 'headline' | 'minor'
export function replayKind(event: WireEvent): ReplayKind {
  if (isFlashEvent(event)) return 'flash'
  return event.severity === 'headline' ? 'headline' : 'minor'
}
