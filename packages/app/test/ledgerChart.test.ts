// ledgerChart.test.ts — P97: diagramdatan. Staplar/kassa ur huvudboken, målkurvan ur
// EXAKT samma kravformel som granskningen (boardReviewRequirement), inget omräknat i appen.
import { describe, expect, it } from 'vitest'
import { boardReviewRequirement, createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState, LedgerEntry } from '@seventh-front/core'
import { deriveLedgerChart, niceTicks, turnAtRatio } from '../src/ledgerChart'

function entry(turn: number, income: number, expenses: number, treasuryEnd: number): LedgerEntry {
  return {
    turn,
    income: { contracts: income, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 },
    expenses: {
      fixedCosts: expenses,
      production: 0,
      interest: 0,
      political: 0,
      intel: 0,
      commodityPurchase: 0,
      hiring: 0,
      lines: 0,
      clawback: 0,
    },
    financing: { loans: 0, repayments: 0 },
    treasuryEnd,
    debtEnd: 0,
    creditLimitEnd: 0,
  }
}

function stateWith(ledger: LedgerEntry[], turn: number): GameState {
  const state = createInitialState('indochina-slice', 'chart-seed')
  state.ledger = ledger
  state.meta.turn = turn
  return state
}

describe('niceTicks', () => {
  it('ger runda tal med 1–2–5-steg', () => {
    expect(niceTicks(0, 4_200_000, 4)).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000])
    expect(niceTicks(-700_000, 4_000_000, 4)).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000].filter((v) => v >= -700_000))
  })
  it('en tom eller degenererad axel kraschar inte', () => {
    expect(niceTicks(5, 5)).toEqual([5])
  })
})

describe('deriveLedgerChart', () => {
  it('ger null för en tom huvudbok (ett parti utan avslutat kvartal)', () => {
    expect(deriveLedgerChart(stateWith([], 0))).toBeNull()
  })

  it('staplar och kassa läses rakt ur huvudboken, en per rad', () => {
    const state = stateWith([entry(0, 0, 429000, 3571000), entry(1, 125000, 429000, 3267000)], 2)
    const data = deriveLedgerChart(state)!
    expect(data.bars).toEqual([
      { turn: 0, income: 0, expenses: 429000 },
      { turn: 1, income: 125000, expenses: 429000 },
    ])
    expect(data.cash).toEqual([
      { turn: 0, value: 3571000 },
      { turn: 1, value: 3267000 },
    ])
  })

  it('målkurvan är boardReviewRequirement × foundingCapital, och sträcker sig till nästa granskning', () => {
    const state = stateWith([entry(0, 0, 1, 1), entry(1, 0, 1, 1)], 2)
    const data = deriveLedgerChart(state)!
    const target = state.house.boardTarget
    expect(data.xMax).toBe(6) // första granskningen i indochina-slice
    expect(data.target).toHaveLength(7)
    for (const point of data.target) {
      expect(point.value).toBe(Math.round(boardReviewRequirement(target, point.turn) * state.house.foundingCapital))
    }
    expect(data.reviewMarks).toEqual([{ turn: 6, value: data.target[6]!.value }])
  })

  it('BOOK NOW är progressSnapshot × foundingCapital vid sista bokförda turen', () => {
    const state = stateWith([entry(0, 0, 1, 1), entry(1, 0, 1, 1), entry(2, 0, 1, 1)], 3)
    state.house.boardTarget.progressSnapshot = 0.25
    expect(deriveLedgerChart(state)!.bookNow).toEqual({ turn: 2, value: Math.round(0.25 * state.house.foundingCapital) })
  })

  it('efter sista granskningen slutar målkurvan vid sista bokförda turen', () => {
    const ledger = Array.from({ length: 20 }, (_, t) => entry(t, 0, 1, 1))
    const data = deriveLedgerChart(stateWith(ledger, 20))!
    expect(data.xMax).toBe(19)
  })

  it('en migrerad huvudbok som börjar mitt i partiet ritas ändå (xMin förblir 0)', () => {
    const data = deriveLedgerChart(stateWith([entry(5, 100, 50, 900)], 6))!
    expect(data.xMin).toBe(0)
    expect(data.bars).toHaveLength(1)
    expect(data.xMax).toBe(6) // nästa granskning efter sista bokförda turen (5)
  })

  it('y-axeln rymmer allt ritat: kostnader under noll, kassa, mål och bok', () => {
    const state = stateWith([entry(0, 0, 429000, 3571000), entry(1, 0, 429000, 3142000)], 2)
    const data = deriveLedgerChart(state)!
    const all = [
      ...data.bars.flatMap((b) => [b.income, -b.expenses]),
      ...data.cash.map((c) => c.value),
      ...data.target.map((p) => p.value),
      data.bookNow!.value,
    ]
    expect(data.yMin).toBeLessThanOrEqual(Math.min(...all))
    expect(data.yMax).toBeGreaterThanOrEqual(Math.max(...all))
    expect(data.yMin).toBeLessThan(0) // kostnadsstaplarna hänger under nolllinjen
  })

  it('en riktig spelad tur ger en rad och en giltig diagramdata', () => {
    let state = createInitialState('indochina-slice', 'chart-real')
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state
    const data = deriveLedgerChart(state)!
    expect(data.bars).toHaveLength(1)
    expect(data.cash[0]!.value).toBe(state.house.treasury)
  })
})

describe('turnAtRatio', () => {
  it('avbildar ett tryck på närmaste bokförda tur, klampat i båda ändar', () => {
    const state = stateWith([entry(0, 0, 1, 1), entry(1, 0, 1, 1), entry(2, 0, 1, 1)], 3)
    const data = deriveLedgerChart(state)! // xMax = 6
    expect(turnAtRatio(data, 0)).toBe(0)
    expect(turnAtRatio(data, 1)).toBe(2) // längst till höger: sista bokförda turen, inte en framtida
    expect(turnAtRatio(data, 1 / 6)).toBe(1)
    expect(turnAtRatio(data, -3)).toBe(0)
  })
})
