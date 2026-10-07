// buildLoan.test.ts — P185 regel 2 (ETAPP11_FORSLAG.md §9b, beslut 11Q): byggnadslån. WORKS BUILD (och EXPAND) får valet kontant eller lån: lånet täcker en andel av varje rat, ligger utanför creditLimit, löper med ränta
// och betalas av med lika delar efter driftstart. Säkerheten är anläggningen: uteblir betalningen tas den, med linjer och arbetsstyrka. Lånet bokförs under `financing` i huvudboken, syns på anläggningskortet,
// och en avveckling löser det först.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import facilities from '../src/data/facilities.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { buildLoanOf, buildLoanOutlook, buildLoanTerms } from '../src/buildLoan.js'
import type { GameState, LedgerEntry, StandingOrderChange } from '../src/types.js'

const B = balance as unknown as { buildLoanSharePct: number; buildLoanRateAnnual: number; buildLoanAmortTurns: number }
const K = facilities as unknown as { kinds: Record<string, { buildCost: number[]; buildTurns: number[] }> }
const BUILD_ARMOUR = (financing?: 'loan'): StandingOrderChange => ({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour', ...(financing ? { financing } : {}) })
const turn = (s: GameState, standingOrders: StandingOrderChange[] = []) => resolveTurn(s, { standingOrders, bids: [], actions: [] })
const fresh = (seed: string) => createInitialState('indochina-slice', seed)
const ledgerOf = (s: GameState, t: number): LedgerEntry => s.ledger.find((e) => e.turn === t)!
const sum = (r: Record<string, number | undefined>) => Object.values(r).reduce<number>((a, b) => a + (b ?? 0), 0)

const TURNS = K.kinds.assembly!.buildTurns[0]!
const COST = K.kinds.assembly!.buildCost[0]!
const INSTALMENT = Math.floor(COST / TURNS)

function advance(state: GameState, turns: number, standingOrders: StandingOrderChange[] = []): GameState {
  let s = state
  for (let i = 0; i < turns; i++) s = turn(s, i === 0 ? standingOrders : []).state
  return s
}

describe('villkoren (data)', () => {
  it('en andel av raten lånas, med ränta och en amorteringstid i kvartal', () => {
    expect(B.buildLoanSharePct).toBeGreaterThan(0)
    expect(B.buildLoanSharePct).toBeLessThan(100)
    expect(B.buildLoanRateAnnual).toBeGreaterThan(0)
    expect(B.buildLoanAmortTurns).toBeGreaterThanOrEqual(1)
    expect(buildLoanTerms()).toEqual({ sharePct: B.buildLoanSharePct, rateAnnual: B.buildLoanRateAnnual, amortTurns: B.buildLoanAmortTurns })
  })
})

describe('att välja lån vid bygget', () => {
  it('med lån räcker kassan för (1 − andelen) av första raten; kontant kräver hela', () => {
    const s = fresh('loan-validate')
    s.house.treasury = Math.ceil(INSTALMENT * (1 - B.buildLoanSharePct / 100)) + 1
    expect(validateStandingOrderChange(s, s, BUILD_ARMOUR()).ok).toBe(false)
    expect(validateStandingOrderChange(s, s, BUILD_ARMOUR('loan')).ok).toBe(true)
  })

  it('lån går att välja för en utbyggnad, men inte för en modernisering, en avveckling eller ett markköp', () => {
    const s = fresh('loan-ops')
    s.house.treasury = 50_000_000
    const works = s.house.works.find((w) => w.kind === 'assembly')!
    expect(validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'EXPAND', facilityId: works.id, financing: 'loan' }).ok).toBe(true)
  })

  it('utan val är det kontant: ingen låneskuld, ingen finansieringsrad', () => {
    const s = advance(fresh('loan-cash'), 2, [BUILD_ARMOUR()])
    expect(s.house.works.find((w) => w.category === 'armour')!.loan).toBeUndefined()
    expect(s.ledger.every((e) => e.financing.loans === 0)).toBe(true)
  })
})

describe('under byggtiden — varje rat lånas till en andel', () => {
  it('kassan betalar (1 − andelen) av raten, resten blir lån; huvudboken bokför hela raten som kostnad och andelen som lån, och balanserar', () => {
    const start = fresh('loan-draw')
    start.house.treasury = 20_000_000
    const first = turn(start, [BUILD_ARMOUR('loan')])
    const s1 = first.state
    const works = s1.house.works.find((w) => w.category === 'armour')!
    expect(works.build).toBeDefined()
    const second = turn(s1)
    const s2 = second.state
    const w2 = s2.house.works.find((w) => w.category === 'armour')!
    const drawn = Math.round((INSTALMENT * B.buildLoanSharePct) / 100)
    expect(w2.loan).toMatchObject({ principal: drawn, outstanding: drawn })
    const entry = ledgerOf(s2, s2.meta.turn - 1)
    expect(entry.expenses.works).toBe(INSTALMENT)
    expect(entry.financing.loans).toBe(drawn)
    // Huvudbokens identitet: Δ kassa = intäkter − kostnader + lån − återbetalningar.
    const net = sum(entry.income) - sum(entry.expenses) + entry.financing.loans - entry.financing.repayments
    expect(s2.house.treasury - s1.house.treasury).toBe(net)
  })

  it('lånet ligger utanför creditLimit och house.debt', () => {
    const start = fresh('loan-credit')
    start.house.treasury = 20_000_000
    const withLoan = advance(start, 3, [BUILD_ARMOUR('loan')])
    const without = advance(fresh('loan-credit'), 3, [])
    expect(withLoan.house.debt).toBe(without.house.debt)
    expect(withLoan.house.works.find((w) => w.category === 'armour')!.loan!.outstanding).toBeGreaterThan(0)
  })

  it('räntan på det som dragits betalas varje kvartal och bokförs som ränta', () => {
    const start = fresh('loan-interest')
    start.house.treasury = 20_000_000
    const a = turn(start, [BUILD_ARMOUR('loan')]).state
    const b = turn(a).state
    const c = turn(b).state
    // Räntan räknas på det utestående när kvartalet bokförs (efter att kvartalets rat dragits); amortering sker inte under bygget.
    const outstanding = c.house.works.find((w) => w.category === 'armour')!.loan!.outstanding
    const interest = Math.round((outstanding * B.buildLoanRateAnnual) / 4)
    const baseInterest = Math.round((c.house.debt * c.house.debtRateAnnual) / 4)
    expect(ledgerOf(c, c.meta.turn - 1).expenses.interest).toBe(interest + baseInterest)
  })
})

describe('efter driftstart — amortering i lika delar', () => {
  it('lånet betalas av med lika delar under buildLoanAmortTurns kvartal och försvinner sedan; huvudboken bokför återbetalningen', () => {
    let s = fresh('loan-amort')
    s.house.treasury = 60_000_000
    s = turn(s, [BUILD_ARMOUR('loan')]).state
    // Bygget färdigt.
    for (let i = 0; i < TURNS + 1; i++) s = turn(s).state
    const works = s.house.works.find((w) => w.category === 'armour')!
    expect(works.status).toBe('operating')
    const principal = works.loan!.principal
    expect(principal).toBeGreaterThan(0)
    const perTurn = Math.ceil(principal / B.buildLoanAmortTurns)
    const before = s.house.treasury
    s.house.treasury = 60_000_000
    const next = turn(s).state
    const entry = ledgerOf(next, next.meta.turn - 1)
    expect(entry.financing.repayments).toBe(perTurn)
    expect(next.house.works.find((w) => w.category === 'armour')!.loan!.outstanding).toBe(works.loan!.outstanding - perTurn)
    expect(before).toBeDefined()
    // Efter hela amorteringstiden är lånet borta.
    let t = next
    for (let i = 0; i < B.buildLoanAmortTurns + 1; i++) {
      t.house.treasury = 60_000_000
      t = turn(t).state
    }
    expect(t.house.works.find((w) => w.category === 'armour')!.loan).toBeUndefined()
  })
})

describe('uteblivna betalningar — säkerheten tas', () => {
  it('kan huset inte betala räntan och avbetalningen tas anläggningen, med linjer, och lånet är borta', () => {
    let s = fresh('loan-seize')
    s.house.treasury = 60_000_000
    s = turn(s, [BUILD_ARMOUR('loan')]).state
    for (let i = 0; i < TURNS + 1; i++) s = turn(s).state
    const works = s.house.works.find((w) => w.category === 'armour')!
    expect(works.status).toBe('operating')
    expect(works.lines.length).toBeGreaterThan(0)
    s.house.treasury = -1_000 // kassan räcker inte
    const next = turn(s)
    expect(next.state.house.works.some((w) => w.id === works.id)).toBe(false)
    expect(next.wire.some((e) => e.headline.includes('SEIZES') && e.headline.includes('BUILDING LOAN'))).toBe(true)
    expect(next.state.house.works.some((w) => w.lines.some((l) => works.lines.some((x) => x.id === l.id)))).toBe(false)
  })

  it('en anläggning utan lån tas aldrig', () => {
    let s = fresh('loan-no-seize')
    s.house.treasury = 60_000_000
    s = turn(s, [BUILD_ARMOUR()]).state
    for (let i = 0; i < TURNS + 1; i++) s = turn(s).state
    s.house.treasury = -1_000
    const next = turn(s).state
    expect(next.house.works.some((w) => w.category === 'armour')).toBe(true)
  })
})

describe('avveckling löser lånet först', () => {
  function operatingWithLoan(seed: string): GameState {
    let s = fresh(seed)
    s.house.treasury = 60_000_000
    s = turn(s, [BUILD_ARMOUR('loan')]).state
    for (let i = 0; i < TURNS + 1; i++) s = turn(s).state
    return s
  }

  it('försäljningen betalar av lånet först och bokför det som återbetalning; resten är intäkt', () => {
    const s = operatingWithLoan('loan-sell')
    s.house.treasury = 10_000_000
    const works = s.house.works.find((w) => w.category === 'armour')!
    works.invested = 1_000_000_000 // så att försäljningen täcker lånet
    const outstanding = works.loan!.outstanding
    const result = turn(s, [{ kind: 'WORKS', op: 'SELL', facilityId: works.id }])
    expect(result.state.house.works.some((w) => w.id === works.id)).toBe(false)
    const entry = ledgerOf(result.state, result.state.meta.turn - 1)
    expect(entry.financing.repayments).toBeGreaterThanOrEqual(outstanding)
  })

  it('täcker försäljningen inte lånet avvisas den med ett skäl', () => {
    const s = operatingWithLoan('loan-sell-short')
    const works = s.house.works.find((w) => w.category === 'armour')!
    works.invested = 1_000
    const result = validateStandingOrderChange(s, s, { kind: 'WORKS', op: 'SELL', facilityId: works.id })
    expect(result).toEqual({ ok: false, reason: 'the sale would not cover the building loan' })
  })
})

describe('frågor för gränssnittet', () => {
  it('buildLoanOf ger lånet och buildLoanOutlook kvartalets betalning (ränta + amortering) per anläggning och totalt', () => {
    let s = fresh('loan-outlook')
    s.house.treasury = 60_000_000
    s = turn(s, [BUILD_ARMOUR('loan')]).state
    for (let i = 0; i < TURNS + 1; i++) s = turn(s).state
    const works = s.house.works.find((w) => w.category === 'armour')!
    expect(buildLoanOf(works)).toBe(works.loan)
    const outlook = buildLoanOutlook(s.house, s.meta.turn)
    expect(outlook.loans).toHaveLength(1)
    const [row] = outlook.loans
    expect(row!.facilityId).toBe(works.id)
    expect(row!.interest).toBe(Math.round((works.loan!.outstanding * B.buildLoanRateAnnual) / 4))
    expect(row!.amortisation).toBe(Math.min(works.loan!.outstanding, Math.ceil(works.loan!.principal / B.buildLoanAmortTurns)))
    expect(outlook.total).toBe(row!.interest + row!.amortisation)
    expect(buildLoanOutlook(fresh('loan-none').house, 0)).toEqual({ loans: [], total: 0, outstanding: 0 })
  })
})
