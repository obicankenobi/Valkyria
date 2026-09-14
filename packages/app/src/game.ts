// game — små, ostatliga hjälpare kring GameState/TurnSubmission. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8: "React, ingen state-hanteringsbibliotek
// behövs: GameState in, TurnSubmission ut."
import type { TurnSubmission } from '@seventh-front/core'

export const SCENARIO_ID = 'indochina-slice'

export function emptySubmission(): TurnSubmission {
  return { standingOrders: [], bids: [], actions: [] }
}

// Ett nytt parti behöver ett frö. Persistens (spara/återuppta samma parti)
// byggs i P12 — här räcker ett nytt, ospart frö per sidladdning.
export function newSeed(): string {
  return `session-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}
