// board — styrelsemål, progressSnapshot, prognoskontroller vid tur 8/14, BUYOUT vid
// två underkända kontroller i rad. Se ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Board").
//
// progressSnapshot saknar formel i specen ("räknas om varje tur", inget mer). Bara
// metric: 'revenue' används av något scenario i etapp 1 (indochina-slice: label
// "Doubling", threshold 2). PROVISORISK formel: progressSnapshot = kumulativ
// house.revenueByTurn / house.foundingCapital — dvs. "dubbla grundkapitalet i
// intäkter till dueTurn". house.foundingCapital är ett nytt fält (se types.ts,
// ANDRINGSLOGG.md) eftersom House annars aldrig behåller startkapitalet efter att
// treasury börjat röra sig från och med P3. De tre andra metric-varianterna
// ('buyers', 'techParity', 'debtRatio') är medvetna no-ops här — ingen formel finns
// för dem heller, och inget scenario i etapp 1 använder dem. Se ANDRINGSLOGG.md.
//
// "Skärpta lånevillkor" vid en underkänd kontroll (spec 5) implementeras som ett
// nytt, kumulativt house.creditPenaltyMultiplier (nytt fält, default 1) som
// economy.ts (P3, patchad) multiplicerar creditLimit med — en minimal, nödvändig
// komplettering av redan committad kod för att en explicit spec-mening ska ha en
// faktisk effekt, inte en ny uppgift.
//
// P53b (ETAPP5_TEKNISK_SPEC.md avsnitt 8, "styrelsen mäter orderboken, inte bara
// kassan"): progressSnapshot räknade tidigare bara bokförd intäkt — en siffra som
// per konstruktion är noll de första turerna (leveranser tar flera turer), oavsett
// hur mycket spelaren redan sålt. progressSnapshot inkluderar nu även den obetalda
// andelen av spelarens egna aktiva/sena kontrakt (`draft.market.contracts` —
// innehåller bara spelarens kontrakt, se bidding.ts:s `winner.source === 'player'`-
// gren; rivalernas kontrakt lever separat i `state.rivals[...].contracts` och ska
// inte räknas mot spelarens egen styrelsegranskning). `expectedProgress`-banan
// byttes samtidigt från linjär till kvadratisk (samma `threshold` vid `dueTurn`,
// lägre krav tidigt) — se docs/ANDRINGSLOGG.md, 2026-09-17, för den fulla mätningen
// bakom båda ändringarna.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Contract, House } from '../../types.js'

interface Balance {
  boardReviewTolerance: number
  boardReviewCreditPenalty: number
}
const BALANCE = balanceData as unknown as Balance

function updateProgressSnapshot(house: House, contracts: Contract[]): void {
  const target = house.boardTarget
  if (target.metric !== 'revenue') return // se filens huvudkommentar — oimplementerat, oanvänt i etapp 1

  const cumulativeRevenue = house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const backlog = contracts
    .filter((c) => c.status === 'active' || c.status === 'late')
    .reduce((sum, c) => sum + c.price * (1 - c.unitsDelivered / c.quantity), 0)
  target.progressSnapshot = house.foundingCapital > 0 ? (cumulativeRevenue + backlog) / house.foundingCapital : 0
}

// P53b: exporterad rent för egen testbarhet, samma "en delad, ren funktion i
// stället för att pinna en privat formel indirekt"-mönster som P50:s
// deriveSupplyCostIndex.
export function computeExpectedProgress(threshold: number, turn: number, dueTurn: number): number {
  return threshold * (turn / dueTurn) ** 2
}

export const board: ResolveStep = (ctx) => {
  const { draft } = ctx
  const house = draft.house
  const target = house.boardTarget

  updateProgressSnapshot(house, draft.market.contracts)

  if (!target.reviewTurns.includes(draft.meta.turn)) return
  if (target.lastReviewTurn === draft.meta.turn) return // redan avgjord den här turen (skydd mot dubbelkörning)

  runReview(ctx)
}

function runReview(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const target = house.boardTarget
  const turn = draft.meta.turn

  target.lastReviewTurn = turn

  // P53b: kvadratisk bana, inte linjär — samma threshold vid dueTurn, lägre krav
  // tidigt (se filens huvudkommentar).
  const expectedProgress = computeExpectedProgress(target.threshold, turn, target.dueTurn)
  const passMark = expectedProgress * (1 - BALANCE.boardReviewTolerance)
  const passed = target.progressSnapshot >= passMark

  if (passed) {
    // P30 (ETAPP2_TEKNISK_SPEC.md avsnitt 5.1): reviewsFailed räknade tidigare
    // KUMULATIVT över hela partiet — spec avsnitt 5, DESIGN.md §7.3 och
    // CLAUDE.md säger alla "två underkända kontroller I RAD". En godkänd
    // kontroll nollställer räknaren, annars syns skillnaden aldrig (med bara
    // två granskningsturer, som innan P30, gick det inte att se; med fyra gör
    // det det).
    target.reviewsFailed = 0
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()} BOARD REVIEW (TURN ${turn}): ON TRACK FOR "${target.label.toUpperCase()}"`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: null,
    })
    return
  }

  target.reviewsFailed += 1
  const previousCreditPenalty = house.creditPenaltyMultiplier
  house.creditPenaltyMultiplier *= BALANCE.boardReviewCreditPenalty

  emit({
    severity: 'headline',
    scope: 'house',
    headline: `${house.name.toUpperCase()} BOARD REVIEW FAILED (TURN ${turn}) — "${target.label.toUpperCase()}" BEHIND SCHEDULE (${target.reviewsFailed}/2), LOAN TERMS TIGHTENED`,
    causeId: null,
    delta: { reviewsFailed: 1, creditPenaltyMultiplier: house.creditPenaltyMultiplier - previousCreditPenalty },
    actorIsPlayer: false,
    subjectId: null,
  })
}
