// endings — kontrollerar alla fem EndingCode i fastställd ordning: NUCLEAR_EXCHANGE,
// EXPOSURE, INSOLVENCY, BUYOUT, SCENARIO_COMPLETE. Se ETAPP1_TEKNISK_SPEC.md avsnitt 5
// ("Endings", "Board") och 7.2.
//
// SCENARIO_COMPLETE behöver scenariots turCount, som är statisk referensdata (precis
// som balance.json/products.json) — inte ett GameState-fält (avsnitt 2.2 ger inget
// sådant fält, och specen ska följas ordagrant). Läses därför direkt här, på samma
// sätt som state.ts redan läser scenariofilen för att bygga initialstate.
import balance from '../../data/balance.json' with { type: 'json' }
import indochinaSlice from '../../data/scenarios/indochina-slice.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'
import type { EndingCode, GameState } from '../../types.js'

interface Balance {
  insolvencyTurns: number
  exposureEventsForEnding: number
  exposureWindowTurns: number
}
const BALANCE = balance as unknown as Balance

interface ScenarioTurnCount {
  id: string
  turnCount: number
}
// Bara ett scenario finns i etapp 1. Fler läggs till i samma register när de finns
// (samma mönster som state.ts:s SCENARIOS-katalog).
const SCENARIO_TURN_COUNTS: Record<string, ScenarioTurnCount> = {
  'indochina-slice': indochinaSlice as unknown as ScenarioTurnCount,
}

// progressSnapshot är normaliserat av board.ts (P8) så att `>= threshold` alltid
// betyder "målet nått", oavsett vilken metric (revenue/buyers/techParity/debtRatio)
// styrelsemålet faktiskt mäter — den metrikspecifika riktningen (t.ex. att en LÄGRE
// debtRatio är bättre) är board.ts:s ansvar att räkna om till den gemensamma
// riktningen. endings.ts behöver därför aldrig veta vilken metric det är.
function isBoardTargetMet(target: GameState['house']['boardTarget']): boolean {
  return target.progressSnapshot >= target.threshold
}

function decideEnding(draft: GameState): EndingCode | null {
  if (draft.doomsday >= 95) return 'NUCLEAR_EXCHANGE'

  const recentExposures = draft.house.exposureEvents.filter(
    (t) => t > draft.meta.turn - BALANCE.exposureWindowTurns,
  ).length
  if (recentExposures >= BALANCE.exposureEventsForEnding) return 'EXPOSURE'

  if (draft.house.insolventTurns >= BALANCE.insolvencyTurns) return 'INSOLVENCY'

  const target = draft.house.boardTarget
  if (target.reviewsFailed >= 2) return 'BUYOUT'
  if (draft.meta.turn >= target.dueTurn && !isBoardTargetMet(target)) return 'BUYOUT'

  const scenario = SCENARIO_TURN_COUNTS[draft.meta.scenarioId]
  if (scenario && draft.meta.turn >= scenario.turnCount) return 'SCENARIO_COMPLETE'

  return null
}

function endingHeadline(ending: EndingCode, draft: GameState): string {
  const name = draft.house.name.toUpperCase()
  switch (ending) {
    case 'NUCLEAR_EXCHANGE':
      return 'NUCLEAR EXCHANGE'
    case 'EXPOSURE':
      return `${name} EXPOSED — LICENCE REVOKED`
    case 'INSOLVENCY':
      return `${name} LIQUIDATED — INSOLVENT`
    case 'BUYOUT':
      return `${name} SOLD — BOARD TARGET MISSED`
    case 'SCENARIO_COMPLETE':
      return `${name}: SCENARIO COMPLETE`
  }
}

export const endings: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  // Redan avgjort — rör det inte. Ett scenario kan bara sluta en gång.
  if (draft.status.kind === 'ended') return

  const ending = decideEnding(draft)
  if (!ending) return

  draft.status = { kind: 'ended', ending, turn: draft.meta.turn }
  emit({
    severity: 'headline',
    scope: 'global',
    headline: endingHeadline(ending, draft),
    // Ett slutvillkor är en tröskel- eller kumulativ kontroll (tre insolventa turer i
    // rad, tre exponerade stationer inom sex turer, …) — inte orsakat av EN enskild
    // WireEvent den här kontrollen kan peka tillbaka på. WireEvent.causeId är singular
    // ("id på DEN WireEvent som orsakade denna"), så null är ärligt här, inte en genväg.
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  })
}
