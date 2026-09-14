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
//
// ?seed=... i URL:en åsidosätter det slumpade fröet. Enda konsumenten är P21:s
// e2e-test (play-20-turns.spec.ts): en kris (avsnitt 9) är ett sannolikhetsstyrt
// spelhändelse (doomsday måste korsa 75 inom 20 turer), och testet skickar in
// EXAKT samma handlingssekvens varje körning — med ett fast frö blir hela
// partiet deterministiskt reproducerbart, i stället för att förlita sig på att
// slumpen råkar samarbeta (flackigt, se docs/ANDRINGSLOGG.md). Ingen spellogik
// i packages/core rörs — fröet är fortfarande bara en sträng som går in i
// createRng, precis som ett vanligt parti.
export function newSeed(): string {
  const override = new URLSearchParams(window.location.search).get('seed')
  if (override) return override
  return `session-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}
