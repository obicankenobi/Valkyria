// queries.boardReviewOutlook.test.ts — P81c (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten, P81-8): "utkastad tur 10 utan tydlig förvarning".
// boardReviewOutlook måste räkna EXAKT samma pass mark som board.ts:s egen
// runReview() — annars visar HUD:en en varning som inte matchar det som
// faktiskt avgör BUYOUT.
import { describe, expect, it } from 'vitest'
import { boardReviewOutlook, createInitialState } from '../src/index.js'
import { computeExpectedProgress } from '../src/resolve/steps/board.js'
import balance from '../src/data/balance.json' with { type: 'json' }

describe('boardReviewOutlook (P81c)', () => {
  it('pekar på nästa granskningstur (indochina-slice: [6, 10, 14, 18]) och räknar turer dit', () => {
    const state = createInitialState('indochina-slice', 'outlook-seed')
    state.meta.turn = 4
    const outlook = boardReviewOutlook(state)

    expect(outlook.nextReviewTurn).toBe(6)
    expect(outlook.turnsUntil).toBe(2)
  })

  it('required matchar ORDAGRANT board.ts:s egen pass mark-formel (computeExpectedProgress × (1 − boardReviewTolerance))', () => {
    const state = createInitialState('indochina-slice', 'outlook-parity-seed')
    state.meta.turn = 8
    const outlook = boardReviewOutlook(state)
    const target = state.house.boardTarget

    const expected = computeExpectedProgress(target.threshold, 10, target.dueTurn) * (1 - (balance as { boardReviewTolerance: number }).boardReviewTolerance)
    expect(outlook.required).toBeCloseTo(expected, 6)
  })

  it('onTrack är false och isLastTurnBeforeReview är true när spelaren ligger under kravet turen innan en granskning', () => {
    const state = createInitialState('indochina-slice', 'outlook-behind-seed')
    state.meta.turn = 5 // en tur före granskningen vid 6
    state.house.boardTarget.progressSnapshot = 0

    const outlook = boardReviewOutlook(state)
    expect(outlook.turnsUntil).toBe(1)
    expect(outlook.onTrack).toBe(false)
    expect(outlook.isLastTurnBeforeReview).toBe(true)
  })

  it('isLastTurnBeforeReview är false om spelaren redan ligger över kravet, trots samma en-tur-kvar-läge', () => {
    const state = createInitialState('indochina-slice', 'outlook-ahead-seed')
    state.meta.turn = 5
    state.house.boardTarget.progressSnapshot = state.house.boardTarget.threshold // gott om marginal

    const outlook = boardReviewOutlook(state)
    expect(outlook.turnsUntil).toBe(1)
    expect(outlook.onTrack).toBe(true)
    expect(outlook.isLastTurnBeforeReview).toBe(false)
  })

  it('isLastTurnBeforeReview är false när det är MER än en tur kvar, även om spelaren ligger under kravet', () => {
    const state = createInitialState('indochina-slice', 'outlook-early-seed')
    state.meta.turn = 2
    state.house.boardTarget.progressSnapshot = 0

    const outlook = boardReviewOutlook(state)
    expect(outlook.turnsUntil).toBeGreaterThan(1)
    expect(outlook.isLastTurnBeforeReview).toBe(false)
  })

  it('efter den sista granskningsturen: nextReviewTurn/turnsUntil är null, onTrack alltid true (ingen granskning kvar att förbereda för)', () => {
    const state = createInitialState('indochina-slice', 'outlook-done-seed')
    state.meta.turn = 19 // efter reviewTurns[18]

    const outlook = boardReviewOutlook(state)
    expect(outlook.nextReviewTurn).toBeNull()
    expect(outlook.turnsUntil).toBeNull()
    expect(outlook.onTrack).toBe(true)
    expect(outlook.isLastTurnBeforeReview).toBe(false)
  })
})
