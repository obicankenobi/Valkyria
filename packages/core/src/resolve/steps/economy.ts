// economy — husets fasta kostnader, ränta, creditLimit, kassaflöde. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Ekonomi") och avsnitt 6 (balance.json).
//
// balance.json ger bara de fem fasta kostnadsposterna som platta tal — vilken
// delmängd av linjer/stationer varje post räknas mot är inte utskrivet i den frysta
// specen (bara i DESIGN.md:s prosa, som inte är den här promptens auktoritet). Två
// tolkningar görs här, dokumenterade lokalt eftersom de är implementationsdetaljer
// för en formel specen bara ger på en rad ("Fasta kostnader dras varje tur"), inte
// en motsägelse eller lucka i den — se ANDRINGSLOGG.md-tröskeln i CLAUDE.md:
//  - lineUpkeep räknas på ALLA ägda linjer, inte bara `running`. Annars vore att stå
//    still gratis, vilket motverkar designpelare 1 ("du kan inte sitta still").
//  - stationUpkeep räknas på alla stationer utom `burned` (en bränd station kostar
//    inget, den är inte längre i drift).
import balance from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import type { ResolveStep } from '../index.js'
import type { House, Money } from '../../types.js'

interface FixedCosts {
  payrollBase: number
  payrollPerExtraLine: number
  lineUpkeep: number
  stationUpkeep: number
  rndOverhead: number
}

interface Balance {
  fixedCosts: FixedCosts
  creditMultiple: number
  chiefOfStaffActionBonusThreshold: number
}

const BALANCE = balance as unknown as Balance

const HOME_STATE_CREDIT_MULT: Record<House['homeState'], number> = {
  neutral: 1.0,
  west: 1.15,
  east: 0.9,
}

const BASE_LINES_INCLUDED_IN_PAYROLL = 4
const TRAILING_REVENUE_TURNS = 4
const ACTION_POINTS_BASE = 3
const ACTION_POINTS_WITH_BONUS = 4

// ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.1: härlett, skrivs bara här. Räknas för NÄSTA
// tur (applyActions, som läser house.actionPoints, kör FÖRST i pipelinen — se
// resolve/index.ts) mot chiefOfStaff:s värde EFTER den här turens egna HIRE-
// handlingar (economy.ts kör sist), inte det värde turen började med.
function computeActionPoints(house: House): number {
  return house.staff.chiefOfStaff > BALANCE.chiefOfStaffActionBonusThreshold ? ACTION_POINTS_WITH_BONUS : ACTION_POINTS_BASE
}

function computeFixedCosts(house: House): Money {
  const extraLines = Math.max(0, house.lines.length - BASE_LINES_INCLUDED_IN_PAYROLL)
  const payroll = BALANCE.fixedCosts.payrollBase + BALANCE.fixedCosts.payrollPerExtraLine * extraLines
  const lineUpkeep = BALANCE.fixedCosts.lineUpkeep * house.lines.length
  const stationUpkeep = BALANCE.fixedCosts.stationUpkeep * house.stations.filter((s) => s.status !== 'burned').length
  const rndOverhead = BALANCE.fixedCosts.rndOverhead * house.rnd.length
  return payroll + lineUpkeep + stationUpkeep + rndOverhead
}

function computeTrailingRevenue(house: House, currentTurn: number): Money {
  let sum = 0
  for (let t = Math.max(0, currentTurn - (TRAILING_REVENUE_TURNS - 1)); t <= currentTurn; t++) {
    sum += house.revenueByTurn[t] ?? 0
  }
  return sum
}

function computeCreditLimit(house: House, currentTurn: number): Money {
  const trailingRevenue = computeTrailingRevenue(house, currentTurn)
  const reliabilityMult = 0.5 + (house.reputation.reliability / 100) * 1.0
  const homeStateMult = HOME_STATE_CREDIT_MULT[house.homeState]
  // P8-tillägg: house.creditPenaltyMultiplier (default 1, sänks av board.ts vid en
  // underkänd styrelsekontroll) — "skärpta lånevillkor" (spec 5, "Board") behöver en
  // faktisk effekt på just den här formeln, inte bara en headline. Se ANDRINGSLOGG.md.
  return Math.max(
    0,
    round(trailingRevenue * BALANCE.creditMultiple * reliabilityMult * homeStateMult * house.creditPenaltyMultiplier) -
      house.debt,
  )
}

export const economy: ResolveStep = (ctx) => {
  const { draft, emit } = ctx
  const house = draft.house

  const fixedCosts = computeFixedCosts(house)
  house.treasury -= fixedCosts
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `${house.name.toUpperCase()} QUARTERLY FIXED COSTS: -£${fixedCosts.toLocaleString('en-GB')}`,
    causeId: null,
    delta: { treasury: -fixedCosts },
    actorIsPlayer: false,
    subjectId: null,
  })

  const interest = round((house.debt * house.debtRateAnnual) / 4)
  if (interest > 0) {
    house.treasury -= interest
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()} DEBT INTEREST: -£${interest.toLocaleString('en-GB')}`,
      causeId: null,
      delta: { treasury: -interest },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  const previousInsolventTurns = house.insolventTurns
  house.insolventTurns = house.treasury < 0 ? house.insolventTurns + 1 : 0
  if (house.insolventTurns !== previousInsolventTurns) {
    emit({
      severity: house.insolventTurns > 0 ? 'report' : 'ticker',
      scope: 'house',
      headline:
        house.insolventTurns > 0
          ? `${house.name.toUpperCase()} RUNS A DEFICIT (${house.insolventTurns} QUARTER${house.insolventTurns > 1 ? 'S' : ''} IN A ROW)`
          : `${house.name.toUpperCase()} RETURNS TO SOLVENCY`,
      causeId: null,
      delta: { insolventTurns: house.insolventTurns - previousInsolventTurns },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  const previousCreditLimit = house.creditLimit
  house.creditLimit = computeCreditLimit(house, draft.meta.turn)
  if (house.creditLimit !== previousCreditLimit) {
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()} CREDIT LINE: £${house.creditLimit.toLocaleString('en-GB')}`,
      causeId: null,
      delta: { creditLimit: house.creditLimit - previousCreditLimit },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  const previousActionPoints = house.actionPoints
  house.actionPoints = computeActionPoints(house)
  if (house.actionPoints !== previousActionPoints) {
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()} EXECUTIVE ACTIONS NEXT QUARTER: ${house.actionPoints}`,
      causeId: null,
      delta: { actionPoints: house.actionPoints - previousActionPoints },
      actorIsPlayer: false,
      subjectId: null,
    })
  }
}
