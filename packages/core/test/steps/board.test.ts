import { describe, expect, it } from 'vitest'
import { board, computeExpectedProgress } from '../../src/resolve/steps/board.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Contract, GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng('board-test', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('board (isolerat steg, spec avsnitt 5 "Board")', () => {
  it('progressSnapshot räknas om varje tur som kumulativ intäkt / foundingCapital (metric "revenue")', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.revenueByTurn = [1000000, 1000000] // 2 000 000 / 4 000 000 = 0.5
    state.meta.turn = 3 // ingen granskningstur — bara progressSnapshot ska uppdateras

    board(makeCtx(state).ctx)

    expect(state.house.boardTarget.progressSnapshot).toBeCloseTo(0.5, 6)
  })

  it('en metric som inte är "revenue" lämnas orörd (oimplementerad, oanvänd i etapp 1, se ANDRINGSLOGG.md)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.boardTarget.metric = 'buyers'
    state.house.boardTarget.progressSnapshot = 0.42
    state.house.revenueByTurn = [9999999]

    board(makeCtx(state).ctx)

    expect(state.house.boardTarget.progressSnapshot).toBe(0.42)
  })

  it('ingen granskning på en tur som inte finns i reviewTurns — ingen emit, ingen ändring', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 5
    const before = { ...state.house.boardTarget }

    const { ctx, emitted } = makeCtx(state)
    board(ctx)

    expect(state.house.boardTarget.reviewsFailed).toBe(before.reviewsFailed)
    expect(state.house.boardTarget.lastReviewTurn).toBe(before.lastReviewTurn)
    expect(emitted).toEqual([])
  })

  it('godkänd kontroll (progress över den kvadratiska banan minus tolerans): ticker, ingen reviewsFailed-ökning, ingen kreditstraff', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 6 // reviewTurns[0] (P30: [6, 10, 14, 18])
    // P53b: passmark = threshold(2) * (6/20)² * (1 - 0.15) = 0.153. Ge gott om marginal.
    state.house.revenueByTurn = Array(7).fill(0)
    state.house.revenueByTurn[6] = 4000000 // progress = 4 000 000/4 000 000 = 1.0, väl över 0.153

    const { ctx, emitted } = makeCtx(state)
    board(ctx)

    expect(state.house.boardTarget.reviewsFailed).toBe(0)
    expect(state.house.creditPenaltyMultiplier).toBe(1)
    expect(state.house.boardTarget.lastReviewTurn).toBe(6)
    expect(emitted.some((e) => e.headline.includes('ON TRACK'))).toBe(true)
  })

  it('(P30 klart-når) godkänd kontroll nollställer reviewsFailed — underkänd → godkänd → underkänd ger INTE BUYOUT', () => {
    const state = createInitialState('indochina-slice', 'seed')

    state.meta.turn = 6 // underkänd — progress 0
    board(makeCtx(state).ctx)
    expect(state.house.boardTarget.reviewsFailed).toBe(1)

    // P53b: passmark(10) = 2 * (10/20)² * 0,85 = 0,425 → 1 700 000 kr. 2 000 000
    // kr räcker gott för godkänt vid tur 10, men ligger under passmark(14) =
    // 2 * (14/20)² * 0,85 = 0,833 → 3 332 000 kr — cumulativ intäkt växer aldrig
    // bakåt, så samma 2 000 000 kr måste både klara tur 10 och underkännas igen
    // vid tur 14 utan ytterligare intäkt.
    state.meta.turn = 10 // godkänd — gott om progress mot passmark(10)
    state.house.revenueByTurn = Array(11).fill(0)
    state.house.revenueByTurn[10] = 2000000
    board(makeCtx(state).ctx)
    expect(state.house.boardTarget.reviewsFailed).toBe(0) // nollställd, inte kvar på 1

    state.meta.turn = 14 // underkänd igen — men INTE i rad efter en godkänd
    state.house.revenueByTurn[14] = 0
    board(makeCtx(state).ctx)
    expect(state.house.boardTarget.reviewsFailed).toBe(1) // bara EN i rad, inte två
  })

  it('underkänd kontroll: reviewsFailed ökar, creditPenaltyMultiplier sänks, headline emitteras (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 6
    // progress 0 — långt under passmark(6) 0,153 (P53b: kvadratisk bana).

    const { ctx, emitted } = makeCtx(state)
    board(ctx)

    expect(state.house.boardTarget.reviewsFailed).toBe(1)
    expect(state.house.creditPenaltyMultiplier).toBeCloseTo(balance.boardReviewCreditPenalty, 6)
    expect(emitted.some((e) => e.headline.includes('BOARD REVIEW FAILED'))).toBe(true)
    expect(emitted.some((e) => e.headline.includes('TIGHTENED'))).toBe(true)
  })

  it('(P30 klart-når) två underkända kontroller I RAD halverar creditPenaltyMultiplier två gånger (kumulativt) och ger BUYOUT', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 6
    board(makeCtx(state).ctx)
    state.meta.turn = 10 // reviewTurns[1] (P30: [6, 10, 14, 18])
    board(makeCtx(state).ctx)

    expect(state.house.boardTarget.reviewsFailed).toBe(2)
    expect(state.house.creditPenaltyMultiplier).toBeCloseTo(balance.boardReviewCreditPenalty ** 2, 6)
  })

  it('en granskningstur avgörs bara en gång — ett andra anrop samma tur ändrar inget (lastReviewTurn-skyddet)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 6
    board(makeCtx(state).ctx)
    const afterFirst = { ...state.house.boardTarget }

    const { ctx, emitted } = makeCtx(state)
    board(ctx)

    expect(state.house.boardTarget.reviewsFailed).toBe(afterFirst.reviewsFailed)
    expect(emitted).toEqual([])
  })

  it('"skärpta lånevillkor" har en verklig effekt: economy.ts:s creditLimit blir lägre efter en underkänd kontroll', async () => {
    const { economy } = await import('../../src/resolve/steps/economy.js')
    const state = createInitialState('indochina-slice', 'seed')
    // economy.ts:s trailingRevenue tittar på de 4 SENASTE turerna relativt currentTurn
    // (index 3..6 vid tur 6, P30) — måste ligga där för att ge ett positivt creditLimit
    // att jämföra. Litet nog totalt (500 000) för att progress (500 000/4 000 000 =
    // 0,125) ska ligga under passmark(6) 0,153 (P53b: kvadratisk bana), så
    // granskningen faktiskt underkänns.
    state.house.revenueByTurn = [0, 0, 0, 0, 0, 0, 500000]
    state.meta.turn = 6

    const before = makeCtx(state)
    economy(before.ctx)
    const creditLimitBeforePenalty = state.house.creditLimit

    board(makeCtx(state).ctx) // underkänd (progress fortfarande 0 relativt threshold) — sätter creditPenaltyMultiplier
    const after = makeCtx(state)
    economy(after.ctx)

    expect(state.house.creditLimit).toBeLessThan(creditLimitBeforePenalty)
  })

  function fillerContract(overrides: Partial<Contract> & Pick<Contract, 'id'>): Contract {
    return {
      buyerId: 'rvn',
      productId: 'm1_rifle',
      quantity: 100,
      unitsDelivered: 0,
      price: 1000000,
      unitCostAtSigning: 100,
      grade: 'A',
      dueTurn: 10,
      status: 'active',
      lateEventId: null,
      frontId: null,
      ...overrides,
    }
  }

  it('(P53b klart-når) progressSnapshot inkluderar aktiva/sena kontrakts obetalda andel, inte bara bokförd intäkt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 3 // ingen granskningstur — bara progressSnapshot ska uppdateras
    state.house.revenueByTurn = [500000]

    // Aktivt kontrakt, 40 % levererat: obetald andel = 1 000 000 × (1 − 40/100) = 600 000.
    state.market.contracts.push(fillerContract({ id: 'c-active', quantity: 100, unitsDelivered: 40, price: 1000000, status: 'active' }))
    // Sent kontrakt räknas likadant som aktivt (fortfarande obetalt): 500 000 × (1 − 0) = 500 000.
    state.market.contracts.push(fillerContract({ id: 'c-late', quantity: 50, unitsDelivered: 0, price: 500000, status: 'late' }))
    // Fullbordat kontrakt: redan i revenueByTurn, ska INTE räknas två gånger.
    state.market.contracts.push(fillerContract({ id: 'c-fulfilled', quantity: 50, unitsDelivered: 50, price: 500000, status: 'fulfilled' }))
    // Annullerat kontrakt: aldrig betalt och aldrig levererat, ska INTE räknas.
    state.market.contracts.push(fillerContract({ id: 'c-voided', quantity: 50, unitsDelivered: 0, price: 500000, status: 'voided' }))

    board(makeCtx(state).ctx)

    // (500 000 + 600 000 + 500 000) / 4 000 000 = 0,4
    expect(state.house.boardTarget.progressSnapshot).toBeCloseTo(0.4, 6)
  })

  it('(P53b klart-når) computeExpectedProgress vid turn = dueTurn/2 är en fjärdedel av threshold, inte hälften', () => {
    const threshold = 2
    const dueTurn = 20

    expect(computeExpectedProgress(threshold, dueTurn / 2, dueTurn)).toBeCloseTo(threshold / 4, 6)
    // Vid dueTurn självt är banan fortfarande hela threshold — samma slutpunkt som förut.
    expect(computeExpectedProgress(threshold, dueTurn, dueTurn)).toBeCloseTo(threshold, 6)
  })
})
