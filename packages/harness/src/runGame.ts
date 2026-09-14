// runGame — kör ett parti headless med en given policy till slut (ended-status
// eller scenariots turnCount) och samlar metrikerna avsnitt 7.3 kräver: ending,
// sluttur, kassa, doomsdayPeak, antal kontrakt, marknadsandel, bruttomarginal,
// andel turer med heat > 40. Plus de fem kolumnerna avsnitt 6.2 (P31) lägger
// till: rivalContractsWon, rivalAttributionShare, voidedContracts,
// retoolingTurns, stationsBurned — alla lästa direkt ur redan bokförda fält,
// ingen ny räknare i core.
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
//
// rivalWinPct/disqualifiedRivalBidPct (ETAPP1_5_TEKNISK_SPEC.md avsnitt 2.2, P14)
// samma "läs av wire, uppfinn ingen ny räknare i core"-princip. rivalWinPct är
// rivalWins mot samma nämnare som marketSharePct (inte bara 100−marketSharePct:
// en order utan vinnare räknas i ingetdera). disqualifiedRivalBidPct nämnare är
// summan av order.competingRivals.length för varje order som avgörs en given
// tur (order.expiresTurn <= state.meta.turn INNAN resolveTurn anropas — samma
// villkor bidding.ts självt använder, se resolve/steps/bidding.ts) — det är
// exakt så många rivalbud bidding.ts försöker pröva den turen. En rival som
// saknas ur draft.rivals (finns inte i etapp 1,5) skulle göra denna nämnare en
// aning för hög; ingen sådan borttagning existerar ännu.
import { createInitialState, PLAYER_ATTRIBUTION_KEY, resolveTurn } from '@seventh-front/core'
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
  rivalWinPct: number
  disqualifiedRivalBidPct: number
  grossMarginPct: number
  heatOver40SharePct: number
  // P31 (ETAPP2_TEKNISK_SPEC.md avsnitt 6.2) — de fem kolumnerna som mäter det
  // etapp 2 faktiskt byggde (rivalkontrakt, kapacitetsstraff, EXPOSURE).
  rivalContractsWon: number
  rivalAttributionShare: number
  voidedContracts: number
  retoolingTurns: number
  stationsBurned: number
}

const MAX_TURNS = 21

export function runGame(scenarioId: string, seed: string, policyName: string, policy: Policy): GameMetrics {
  let state: GameState = createInitialState(scenarioId, seed)
  let playerWins = 0
  let rivalWins = 0
  let rivalBidsAttempted = 0
  let rivalBidsDisqualified = 0
  let turnsWithHighHeat = 0
  let turnsPlayed = 0
  let retoolingLineTurns = 0

  for (let t = 0; t < MAX_TURNS; t++) {
    const decidingThisTurn = state.market.openOrders.filter((o) => o.expiresTurn <= state.meta.turn)
    for (const order of decidingThisTurn) rivalBidsAttempted += order.competingRivals.length

    const result: TurnResult = resolveTurn(state, policy(state))
    state = result.state
    turnsPlayed++

    for (const event of result.wire) {
      if (event.headline.includes('WINS CONTRACT')) {
        if (event.actorIsPlayer) playerWins++
        else rivalWins++
      } else if (event.headline.includes('DISQUALIFIED') && !event.actorIsPlayer) {
        rivalBidsDisqualified++
      }
    }
    if (Object.values(state.theatres).some((theatre) => theatre.heat > 40)) turnsWithHighHeat++
    // P31 (avsnitt 6.2, retoolingTurns): "antal turer linjer stod i omställning"
    // — en löpande summa, inte ett slutläge (en linje är 'retooling' bara i
    // retoolingTurns(1) balanstur innan den går tillbaka till 'idle').
    retoolingLineTurns += state.house.lines.filter((l) => l.status === 'retooling').length

    if (state.status.kind === 'ended') break
  }

  const totalRevenue = state.house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const totalCost = state.market.contracts.reduce((sum, c) => sum + c.unitCostAtSigning * c.unitsDelivered, 0)
  const totalDecidedOrders = playerWins + rivalWins

  // P31 (avsnitt 6.2): de fem nya kolumnerna, alla lästa ur slutläget utom
  // retoolingTurns ovan (en löpande summa, se kommentaren i turloopen).
  const allRivalContracts = Object.values(state.rivals).flatMap((r) => r.contracts)
  const rivalContractsWon = allRivalContracts.filter((c) => c.status === 'fulfilled').length
  let attributedUnits = 0
  let rivalAttributedUnits = 0
  for (const front of Object.values(state.fronts)) {
    for (const [key, units] of Object.entries(front.attribution)) {
      attributedUnits += units
      if (key !== PLAYER_ATTRIBUTION_KEY) rivalAttributedUnits += units
    }
  }
  const voidedContracts =
    state.market.contracts.filter((c) => c.status === 'voided').length +
    allRivalContracts.filter((c) => c.status === 'voided').length
  const stationsBurned = state.house.stations.filter((s) => s.status === 'burned').length

  return {
    policy: policyName,
    seed,
    ending: state.status.kind === 'ended' ? state.status.ending : 'ACTIVE',
    finalTurn: state.status.kind === 'ended' ? state.status.turn : state.meta.turn,
    treasury: state.house.treasury,
    doomsdayPeak: state.doomsdayPeak,
    contracts: state.market.contracts.length,
    marketSharePct: totalDecidedOrders > 0 ? (playerWins / totalDecidedOrders) * 100 : 0,
    rivalWinPct: totalDecidedOrders > 0 ? (rivalWins / totalDecidedOrders) * 100 : 0,
    disqualifiedRivalBidPct: rivalBidsAttempted > 0 ? (rivalBidsDisqualified / rivalBidsAttempted) * 100 : 0,
    grossMarginPct: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    heatOver40SharePct: turnsPlayed > 0 ? (turnsWithHighHeat / turnsPlayed) * 100 : 0,
    rivalContractsWon,
    rivalAttributionShare: attributedUnits > 0 ? (rivalAttributedUnits / attributedUnits) * 100 : 0,
    voidedContracts,
    retoolingTurns: retoolingLineTurns,
    stationsBurned,
  }
}
