// queries.boardMemo.test.ts — P97 (ETAPP8_FORSLAG.md §3.2): styrelsens kvartalsrapport.
// "Det innehåller prognos mot mål, de tre största posterna ... bygger på
// boardReviewOutlook (P81c), inte på någon ny formel." Kravet ska alltså vara
// EXAKT det board.ts:s runReview() dömer efter — bevisat här mot faktiska partier.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@seventh-front/harness/dist/policies.js'
import type { Policy } from '@seventh-front/harness/dist/policies.js'
import { boardMemo, boardReviewOutlook, boardReviewRequirement, createInitialState, resolveTurn } from '../src/index.js'
import type { GameState, LedgerEntry } from '../src/index.js'

function entry(turn: number, patch: { income?: Partial<LedgerEntry['income']>; expenses?: Partial<LedgerEntry['expenses']>; financing?: Partial<LedgerEntry['financing']> }): LedgerEntry {
  return {
    turn,
    income: { contracts: 0, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0, ...patch.income },
    expenses: {
      fixedCosts: 0,
      production: 0,
      interest: 0,
      political: 0,
      intel: 0,
      commodityPurchase: 0,
      hiring: 0,
      lines: 0,
      clawback: 0,
      ...patch.expenses,
    },
    financing: { loans: 0, repayments: 0, ...patch.financing },
    treasuryEnd: 0,
    debtEnd: 0,
    creditLimitEnd: 0,
  }
}

describe('boardReviewRequirement (delad kravformel)', () => {
  it('är exakt det boardReviewOutlook redan räknade (refaktoreringen ändrade ingenting)', () => {
    const state = createInitialState('indochina-slice', 'req-seed')
    for (const turn of [0, 3, 5, 8, 12, 16]) {
      state.meta.turn = turn
      const outlook = boardReviewOutlook(state)
      if (outlook.nextReviewTurn === null) continue
      expect(outlook.required).toBe(boardReviewRequirement(state.house.boardTarget, outlook.nextReviewTurn))
    }
  })
})

describe('boardMemo (P97)', () => {
  it('ger null för en tur som inte är en granskningstur', () => {
    const state = createInitialState('indochina-slice', 'memo-seed')
    state.meta.turn = 5
    expect(boardMemo(state, 4)).toBeNull()
    expect(boardMemo(state, 5)).toBeNull()
  })

  it('tre största posterna: bara intäkter och kostnader, störst först, högst tre, nollposter utelämnas', () => {
    const state = createInitialState('indochina-slice', 'memo-items-seed')
    state.meta.turn = 7
    state.ledger = [
      entry(6, {
        income: { contracts: 125000, commodityRelease: 5000 },
        expenses: { fixedCosts: 429000, intel: 200000, political: 15000, production: 145000 },
        financing: { loans: 900000 }, // ett lån är ingen post: varken intäkt eller kostnad
      }),
    ]
    const memo = boardMemo(state, 6)!
    expect(memo.topItems).toEqual([
      { kind: 'expense', row: 'fixedCosts', amount: 429000 },
      { kind: 'expense', row: 'intel', amount: 200000 },
      { kind: 'expense', row: 'production', amount: 145000 },
    ])
  })

  it('en tur utan huvudboksrad (migrerat parti) ger inga poster men fortfarande ett PM', () => {
    const state = createInitialState('indochina-slice', 'memo-empty-seed')
    state.meta.turn = 7
    const memo = boardMemo(state, 6)!
    expect(memo.topItems).toEqual([])
    expect(memo.reviewTurn).toBe(6)
  })

  it('kravet i PM:et är pass mark för just den granskningsturen, i kronor och på progressSnapshot-skalan', () => {
    const state = createInitialState('indochina-slice', 'memo-money-seed')
    state.meta.turn = 11
    state.house.boardTarget.progressSnapshot = 0.5
    const memo = boardMemo(state, 10)!
    const target = state.house.boardTarget
    expect(memo.required).toBe(boardReviewRequirement(target, 10))
    expect(memo.requiredMoney).toBe(Math.round(memo.required * state.house.foundingCapital))
    expect(memo.current).toBe(0.5)
    expect(memo.bookMoney).toBe(Math.round(0.5 * state.house.foundingCapital))
    expect(memo.passed).toBe(0.5 >= memo.required)
  })

  it('nästa granskning kommer ur boardReviewOutlook; efter den sista är den null', () => {
    const state = createInitialState('indochina-slice', 'memo-next-seed')
    state.meta.turn = 7
    expect(boardMemo(state, 6)!.next).toEqual({
      turn: 10,
      required: boardReviewOutlook(state).required,
      requiredMoney: Math.round(boardReviewOutlook(state).required * state.house.foundingCapital),
    })
    state.meta.turn = 19
    expect(boardMemo(state, 18)!.next).toBeNull()
  })

  it('godkänd/underkänd i PM:et stämmer med händelsen board.ts faktiskt emittade — varje granskningstur, alla policyer och flera frön', () => {
    let reviewsChecked = 0
    for (const name of ['aggressive', 'balanced', 'passive', 'capacity'] as const) {
      const policy = POLICIES[name] as Policy
      for (let i = 0; i < 12; i++) {
        let state: GameState = createInitialState('indochina-slice', `memo-real:${name}:${i}`)
        for (let t = 0; t < 21 && state.status.kind !== 'ended'; t++) {
          const result = resolveTurn(state, policy(state))
          const reviewedTurn = state.meta.turn
          state = result.state
          const memo = boardMemo(state, reviewedTurn)
          if (!state.house.boardTarget.reviewTurns.includes(reviewedTurn)) {
            expect(memo).toBeNull()
            continue
          }
          const passed = result.wire.some((e) => e.headline.includes('BOARD REVIEW') && e.headline.includes('ON TRACK'))
          const failed = result.wire.some((e) => e.headline.includes('BOARD REVIEW FAILED'))
          expect(passed !== failed, `${name} ${i} tur ${reviewedTurn}: exakt en granskningshändelse väntades`).toBe(true)
          expect(memo!.passed, `${name} ${i} tur ${reviewedTurn}`).toBe(passed)
          reviewsChecked++
        }
      }
    }
    expect(reviewsChecked).toBeGreaterThan(20)
  })
})
