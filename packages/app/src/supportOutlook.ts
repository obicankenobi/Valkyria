// supportOutlook — etapp 13, P200 (förslag 13-5, speltest 2026-10-17 punkt 17): vad ett lands folkliga stöd betyder för huset, i en ren fråga som CONTACTS,
// kartans POL-lager och This Quarter delar. Bunden till factions.ts:s processLowSupport: varje kvartal under `lowSupportThreshold` räknas, och vid
// `lowSupportTurns` i rad tvingas landet söka fred — dess front går till vapenvila och dess materielbehov (och därmed dess ordrar) upphör.
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { FactionId, GameState } from '@seventh-front/core'

// PROVISORISK, appens egen: hur nära gränsen ett land får komma innan This Quarter varnar (samma anda som thisQuarter.ts:s egna trösklar).
export const SUPPORT_NEAR_MARGIN = 5

export interface SupportOutlook {
  factionId: FactionId
  support: number
  threshold: number
  turnsBelow: number // kvartal i rad under gränsen hittills
  turnsNeeded: number // så många i rad tvingar fram fred
  atWar: boolean // landet är sida i en front som är i krig — bara då betyder fred att ordrar upphör
  below: boolean
  near: boolean // över gränsen men inom SUPPORT_NEAR_MARGIN
  quartersToPeace: number | null // under gränsen och ännu inte tvingad: så många kvartal till (om stödet inte stiger)
}

export function supportOutlook(state: GameState, factionId: FactionId): SupportOutlook | null {
  const faction = state.factions[factionId]
  if (!faction) return null
  const threshold = DISPLAY_THRESHOLDS.lowSupportThreshold
  const turnsNeeded = DISPLAY_THRESHOLDS.lowSupportTurns
  const support = faction.publicSupport
  const below = support < threshold
  const turnsBelow = faction.lowSupportTurns ?? 0
  const atWar = Object.values(state.fronts).some((f) => f.status === 'war' && (f.sideA === factionId || f.sideB === factionId))
  return {
    factionId,
    support,
    threshold,
    turnsBelow,
    turnsNeeded,
    atWar,
    below,
    near: !below && support < threshold + SUPPORT_NEAR_MARGIN,
    quartersToPeace: below && turnsBelow < turnsNeeded ? turnsNeeded - turnsBelow : null,
  }
}

// En mening om läget, för CONTACTS och This Quarter.
export function supportSentence(o: SupportOutlook): string {
  if (o.quartersToPeace !== null) {
    return `Below ${o.threshold} for ${o.turnsBelow} of ${o.turnsNeeded} quarters. ${o.quartersToPeace === 1 ? 'Next quarter' : `In ${o.quartersToPeace} quarters`} it must sue for peace${o.atWar ? ' and its orders stop' : ''}, unless support rises.`
  }
  if (o.below) return `Below ${o.threshold}: the country has already been forced to sue for peace.`
  if (o.near) return `Close to ${o.threshold}. ${o.turnsNeeded} quarters below it force the country to sue for peace${o.atWar ? ' and its orders stop' : ''}.`
  return `Public backing for the government and its war. ${o.turnsNeeded} quarters below ${o.threshold} force it to sue for peace${o.atWar ? ' and its orders stop' : ''}.`
}
