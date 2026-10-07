// buildLoan — P185 regel 2 (ETAPP11_FORSLAG.md §9b, beslut 11Q): byggnadslån. Ett bygge eller en utbyggnad kan lånefinansieras: lånet täcker en andel av varje rat under byggtiden, ligger utanför husets vanliga
// skuld (house.debt) och kreditgräns, löper med ränta och betalas av i lika delar efter driftstart. Säkerheten är anläggningen — uteblir betalningen tas den, med linjer och arbetsstyrka. Lånet bokförs under
// `financing` i huvudboken (draget = lån, avbetalat = återbetalning); räntan är en vanlig räntekostnad. Räntan och amorteringen räknas i `economy` (11H), dragen i `production` när raten betalas.
import balanceData from './data/balance.json' with { type: 'json' }
import { recordExpense, recordFinancing } from './ledger.js'
import { round } from './money.js'
import type { ResolveContext } from './resolve/index.js'
import type { BuildLoan, Facility, House, Money } from './types.js'

interface Balance {
  buildLoanSharePct: number
  buildLoanRateAnnual: number
  buildLoanAmortTurns: number
}
const B = balanceData as unknown as Balance

export const buildLoanTerms = (): { sharePct: number; rateAnnual: number; amortTurns: number } => ({ sharePct: B.buildLoanSharePct, rateAnnual: B.buildLoanRateAnnual, amortTurns: B.buildLoanAmortTurns })

export const buildLoanOf = (facility: Pick<Facility, 'loan'>): BuildLoan | undefined => facility.loan

// Andelen av en rat som lånas, och det kassan själv betalar.
export const loanPartOf = (instalment: Money): Money => round((instalment * B.buildLoanSharePct) / 100)
export const cashPartOf = (instalment: Money, financing: 'cash' | 'loan' | undefined): Money => (financing === 'loan' ? instalment - loanPartOf(instalment) : instalment)

export const loanInterest = (loan: Pick<BuildLoan, 'outstanding'>): Money => round((loan.outstanding * B.buildLoanRateAnnual) / 4)

// Amorteringen nästa kvartal: lika delar av det som lånats, aldrig mer än det som återstår; noll under bygget och innan första amorteringskvartalet.
export function loanAmortisation(loan: BuildLoan, turn: number, building: boolean): Money {
  if (building || loan.amortPerTurn === null || loan.amortFromTurn === null || turn < loan.amortFromTurn) return 0
  return Math.min(loan.outstanding, loan.amortPerTurn)
}

// En rat som lånefinansieras: andelen dras (kassan får den, huvudboken bokför ett lån) och läggs på anläggningens lån.
export function drawOnInstalment(ctx: ResolveContext, facility: Facility, instalment: Money): void {
  const draw = loanPartOf(instalment)
  if (draw <= 0) return
  const loan: BuildLoan = facility.loan ?? { principal: 0, outstanding: 0, amortPerTurn: null, amortFromTurn: null }
  loan.principal += draw
  loan.outstanding += draw
  facility.loan = loan
  ctx.draft.house.treasury += draw
  recordFinancing(ctx.draft, 'loans', draw)
}

// Bygget (eller utbyggnaden) är klart: amorteringen börjar kvartalet efter, i lika delar av det utestående.
export function startAmortisation(facility: Facility, turn: number): void {
  const loan = facility.loan
  if (!loan || loan.outstanding <= 0) return
  loan.amortPerTurn = Math.ceil(loan.outstanding / B.buildLoanAmortTurns)
  loan.amortFromTurn = turn + 1
}

export interface BuildLoanRow {
  facilityId: string
  outstanding: Money
  interest: Money
  amortisation: Money
}
export interface BuildLoanOutlook {
  loans: BuildLoanRow[]
  total: Money // ränta + amortering nästa kvartal
  outstanding: Money
}

// Kvartalets betalning på husets byggnadslån (ren fråga — gränssnittet och projectedQuarter läser den).
export function buildLoanOutlook(house: Pick<House, 'works'>, turn: number): BuildLoanOutlook {
  const loans: BuildLoanRow[] = []
  for (const w of house.works) {
    const loan = w.loan
    if (!loan) continue
    const interest = loanInterest(loan)
    const amortisation = loanAmortisation(loan, turn, w.build !== undefined)
    loans.push({ facilityId: w.id, outstanding: loan.outstanding, interest, amortisation })
  }
  return { loans, total: loans.reduce((sum, l) => sum + l.interest + l.amortisation, 0), outstanding: loans.reduce((sum, l) => sum + l.outstanding, 0) }
}

// Avvecklingen löser lånet först: det utestående dras av försäljningsvärdet. Ett värde som inte täcker lånet kan inte säljas.
export const loanBlocksSale = (facility: Pick<Facility, 'loan'>, saleValue: Money): boolean => !!facility.loan && facility.loan.outstanding > saleValue

// Varje tur (i economy): ränta på det utestående, sedan amortering. Kan kassan inte bära kvartalets betalning tas anläggningen — med linjer och arbetsstyrka.
export function serviceBuildLoans(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  for (const facility of [...house.works]) {
    const loan = facility.loan
    if (!loan) continue
    const interest = loanInterest(loan)
    const amortisation = loanAmortisation(loan, turn, facility.build !== undefined)
    const due = interest + amortisation
    if (due > 0 && house.treasury < due) {
      house.works = house.works.filter((w) => w !== facility)
      const lineOrders = house.standingOrders?.lines
      if (lineOrders) for (const line of facility.lines) delete lineOrders[line.id]
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `${house.name.toUpperCase()} MISSES A PAYMENT ON ITS BUILDING LOAN — THE BANK SEIZES ${facility.kind.toUpperCase()} ${facility.id.toUpperCase()} (£${loan.outstanding.toLocaleString('en-GB')} OUTSTANDING), LINES AND WORKFORCE WITH IT`,
        causeId: null,
        delta: { outstandingLoan: -loan.outstanding },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
      continue
    }
    if (interest > 0) {
      house.treasury -= interest
      recordExpense(draft, 'interest', interest)
    }
    if (amortisation > 0) {
      house.treasury -= amortisation
      recordFinancing(draft, 'repayments', amortisation)
      loan.outstanding -= amortisation
    }
    if (due > 0) {
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${facility.kind.toUpperCase()} ${facility.id.toUpperCase()} BUILDING LOAN: INTEREST £${interest.toLocaleString('en-GB')}${amortisation > 0 ? `, REPAYMENT £${amortisation.toLocaleString('en-GB')}` : ''} (£${loan.outstanding.toLocaleString('en-GB')} LEFT)`,
        causeId: null,
        delta: { treasury: -due, outstandingLoan: -amortisation },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
    }
    if (loan.outstanding <= 0 && facility.build === undefined) delete facility.loan
  }
}
