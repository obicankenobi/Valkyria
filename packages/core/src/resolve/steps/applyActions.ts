// applyActions — spelarens handlingar och bud, i inskickad ordning (spec 3.1).
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10.
//
// Fortfarande en no-op för fyra av fem PlayerAction-typer (BROKER, INTEL, POLITICAL,
// MARKET) och fyra av fem INTERNAL-op (BUILD_LINE, HIRE, REPRIORITISE_RND, REPAY) —
// ingen prompt i avsnitt 10 äger dem (loggat sedan P2), oförändrat av den här
// kompletteringen. Se ANDRINGSLOGG.md.
//
// TAKE_LOAN är UNDANTAGET: byggt här i P8, inte för att P8:s instruktionstext nämner
// applyActions.ts (den gör inte det) utan för att P8:s eget klart när-villkor ("ett
// passivt parti förlorar på BUYOUT, inte INSOLVENCY") visade sig omöjligt att
// uppfylla utan den — se ANDRINGSLOGG.md för den fulla utredningen (flera testade
// budstrategier gick alla i INSOLVENCY: TAKE_LOAN var dittills verkningslös, och
// fasta kostnader ensamma dränerar snabbare än någon budgivning-bara-strategi kan
// hänga med). Formeln för avvisning ("TAKE_LOAN över creditLimit avvisas ... med
// reason: 'credit limit exceeded'") står redan ordagrant i spec avsnitt 5,
// "Ekonomi" — det här är alltså den delen av en redan skriven regel som aldrig
// kopplades in, inte en ny, påhittad regel.
//
// payload-formen ({ amount: Money }) är PROVISORISK, samma sorts platshållare som
// StandingOrderChange (se ANDRINGSLOGG.md 2026-09-13 "StandingOrderChange saknar
// definition") — ingen PlayerAction-payload har någon frusen form någonstans i
// specen.
import { round } from '../../money.js'
import type { ResolveStep } from '../index.js'

function isTakeLoanPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

export const applyActions: ResolveStep = (ctx) => {
  const { draft, submission, emit, rejected } = ctx
  const house = draft.house
  // house.creditLimit uppdateras inte förrän economy.ts (senare i samma pipeline-
  // passage) — så flera TAKE_LOAN i samma inskickning måste bokföras mot en lokal,
  // krympande kopia, annars kunde spelaren stapla lån långt över den faktiska
  // gränsen genom att bara skicka in många handlingar samma tur.
  let remainingCredit = house.creditLimit

  for (const action of submission.actions) {
    if (action.type !== 'INTERNAL' || action.op !== 'TAKE_LOAN') continue // allt annat: se filens huvudkommentar, oförändrat no-op

    if (!isTakeLoanPayload(action.payload)) {
      rejected.push({ action, reason: 'invalid loan amount' })
      continue
    }

    const amount = round(action.payload.amount)
    if (amount > remainingCredit) {
      rejected.push({ action, reason: 'credit limit exceeded' })
      continue
    }

    house.debt += amount
    house.treasury += amount
    remainingCredit -= amount

    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()} TAKES OUT A LOAN OF £${amount.toLocaleString('en-GB')}`,
      causeId: null,
      delta: { treasury: amount, debt: amount },
      actorIsPlayer: true,
      subjectId: null,
    })
  }
}
