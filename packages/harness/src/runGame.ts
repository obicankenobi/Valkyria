// runGame — kör ett parti headless med en given policy till slut (ended-status
// eller scenariots turnCount) och samlar metrikerna avsnitt 7.3 kräver: ending,
// sluttur, kassa, doomsdayPeak, antal kontrakt, marknadsandel, bruttomarginal,
// andel turer med heat > 40.
//
// MAX_TURNS = 21, inte 20 — se ANDRINGSLOGG.md (loggat under P8): scenariots
// dueTurn/turnCount är 20 (0-indexerat), och endings.ts:s strikta dueTurn-kontroll
// kräver att draft.meta.turn FAKTISKT når 20 vid stegets start. Det kräver 21
// resolveTurn-anrop (tur 0..20), inte 20 — annars avgörs aldrig BUYOUT/
// SCENARIO_COMPLETE vid scenariots sista tur, bara tidigare slutvillkor.
//
// "Marknadsandel" och "bruttomarginal" saknar formel i specen — se
// ANDRINGSLOGG.md. marketSharePct läses av genom att räkna "WINS CONTRACT"-
// händelser i wire per tur (actorIsPlayer skiljer spelarens vinster från
// rivalernas — bidding.ts emittar alltid en sådan händelse för varje avgjord
// order, vunnen eller ej). grossMarginPct räknas EXAKT ur redan bokförda fält
// (unitCostAtSigning × unitsDelivered per kontrakt, mot husets kumulativa
// revenueByTurn) i stället för att uppskattas — ingen ny formel, bara en
// sammanställning av data som redan finns.
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState, TurnResult } from '@seventh-front/core'
import type { Policy } from './policies.js'

export interface GameMetrics {
  policy: string
  seed: string
  ending: string
  finalTurn: number
  treasury: number
  doomsdayPeak: number
  contracts: number
  marketSharePct: number
  grossMarginPct: number
  heatOver40SharePct: number
}

const MAX_TURNS = 21

export function runGame(scenarioId: string, seed: string, policyName: string, policy: Policy): GameMetrics {
  let state: GameState = createInitialState(scenarioId, seed)
  let playerWins = 0
  let rivalWins = 0
  let turnsWithHighHeat = 0
  let turnsPlayed = 0

  for (let t = 0; t < MAX_TURNS; t++) {
    const result: TurnResult = resolveTurn(state, policy(state))
    state = result.state
    turnsPlayed++

    for (const event of result.wire) {
      if (!event.headline.includes('WINS CONTRACT')) continue
      if (event.actorIsPlayer) playerWins++
      else rivalWins++
    }
    if (Object.values(state.theatres).some((theatre) => theatre.heat > 40)) turnsWithHighHeat++

    if (state.status.kind === 'ended') break
  }

  const totalRevenue = state.house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const totalCost = state.market.contracts.reduce((sum, c) => sum + c.unitCostAtSigning * c.unitsDelivered, 0)
  const totalDecidedOrders = playerWins + rivalWins

  return {
    policy: policyName,
    seed,
    ending: state.status.kind === 'ended' ? state.status.ending : 'ACTIVE',
    finalTurn: state.status.kind === 'ended' ? state.status.turn : state.meta.turn,
    treasury: state.house.treasury,
    doomsdayPeak: state.doomsdayPeak,
    contracts: state.market.contracts.length,
    marketSharePct: totalDecidedOrders > 0 ? (playerWins / totalDecidedOrders) * 100 : 0,
    grossMarginPct: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    heatOver40SharePct: turnsPlayed > 0 ? (turnsWithHighHeat / turnsPlayed) * 100 : 0,
  }
}
