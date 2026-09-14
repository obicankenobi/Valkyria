// playScript — golden-testets drivare. Spelar N turer av ett scenario från en
// seed mot en given botpolicy, och samlar ALLA wire-händelser turn för turn
// (inte bara den slutliga, beskurna state.wire-rullan) så
// golden.test.ts kan pröva "headlines > 12" mot partiets HELA historik. Se
// ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3.
//
// "en inskickad balansfil" (avsnitt 11.3:s egen formulering) beskriver en
// injektion resolveTurn aldrig fått — varje resolve-steg importerar
// src/data/balance.json statiskt (`with { type: 'json' }`), inte via ett
// injicerat konfigobjekt, och det gäller i alla steg sedan P2/P3 (innan den
// här golden-testfilen någonsin byggdes). Att bygga om det vore ett stort
// ingrepp i redan committad, testad pipelinekod — utanför P22:s mandat och
// dessutom emot CLAUDE.md hård regel 7 (pipelinens stegordning/kontrakt
// ändras inte i förbigående). Den skyddseffekten README.md/avsnitt 11.3
// beskriver ("ett brutet snapshot ska alltid betyda en regel ändrades")
// uppnås i stället i golden.test.ts: det testet jämför
// fixtures/balance.frozen.json BITVIS mot src/data/balance.json innan det
// ens spelar ett parti, och failar tydligt om de skiljer sig åt — så
// spelet, som körs mot src/data/balance.json (den enda balansfil som
// FAKTISKT existerar i pipelinen), garanterat körs mot samma tal som
// snapshotet frystes mot. Se docs/ANDRINGSLOGG.md.
import { createInitialState } from '../../src/state.js'
import { resolveTurn } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

export type Policy = (state: GameState) => TurnSubmission

export interface PlayScriptResult {
  finalState: GameState
  wireLog: WireEvent[]
}

export function playScript(scenarioId: string, seed: string, policy: Policy, turns: number): PlayScriptResult {
  let state: GameState = createInitialState(scenarioId, seed)
  const wireLog: WireEvent[] = []

  for (let t = 0; t < turns; t++) {
    if (state.status.kind === 'ended') break
    const result = resolveTurn(state, policy(state))
    wireLog.push(...result.wire)
    state = result.state
  }

  return { finalState: state, wireLog }
}
