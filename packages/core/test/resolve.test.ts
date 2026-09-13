import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import type { GameState, TurnSubmission } from '../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

describe('resolveTurn — P2: pipeline och wire', () => {
  it('20 turer kan köras utan handlingar utan att kasta', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    expect(() => {
      for (let i = 0; i < 20; i++) {
        state = resolveTurn(state, EMPTY_SUBMISSION).state
      }
    }).not.toThrow()
  })

  it('turräknaren och datumet stämmer efter 20 turer', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    const startYear = state.meta.year
    const startQuarter = state.meta.quarter

    for (let i = 0; i < 20; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.meta.turn).toBe(20)
    // 20 kvartal = 5 hela år framåt, tillbaka på samma kvartal.
    expect(state.meta.year).toBe(startYear + 5)
    expect(state.meta.quarter).toBe(startQuarter)
  })

  it('kvartalet rullar över och året ökar vid varje fjärde tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    expect(state.meta.quarter).toBe(1)

    const seen: { turn: number; year: number; quarter: number }[] = []
    for (let i = 0; i < 8; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      seen.push({ turn: state.meta.turn, year: state.meta.year, quarter: state.meta.quarter })
    }

    expect(seen.map((s) => s.quarter)).toEqual([2, 3, 4, 1, 2, 3, 4, 1])
    expect(seen[3]!.year).toBe(state.meta.year - 1) // året höjs mellan tur 4 (Q4) och tur 5 (Q1)
    expect(seen[7]!.year).toBe(seen[3]!.year + 1)
  })

  it('rngCursor ökar för varje tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    const cursors: number[] = [state.meta.rngCursor]

    for (let i = 0; i < 5; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      cursors.push(state.meta.rngCursor)
    }

    for (let i = 1; i < cursors.length; i++) {
      expect(cursors[i]!).toBeGreaterThan(cursors[i - 1]!)
    }
  })

  it('är rent: muterar aldrig indata-state', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    const before = JSON.parse(JSON.stringify(state))

    resolveTurn(state, EMPTY_SUBMISSION)

    expect(state).toEqual(before)
  })

  it('är deterministiskt: samma state + samma submission ger bitvis identiskt resultat', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    const resultA = resolveTurn(state, EMPTY_SUBMISSION)
    const resultB = resolveTurn(state, EMPTY_SUBMISSION)

    expect(resultB.state).toEqual(resultA.state)
    expect(resultB.wire).toEqual(resultA.wire)
    expect(resultB.rejected).toEqual(resultA.rejected)
  })

  it('rejected-hanteringen är trådad: result.rejected finns och är tom (inget steg avvisar något i P2 än)', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      expect(result.rejected).toEqual([])
      state = result.state
    }
  })

  it('kastar aldrig i normal drift, även med tomma listor i submission', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    expect(() => resolveTurn(state, { standingOrders: [], bids: [], actions: [] })).not.toThrow()
  })

  it('result.wire innehåller bara den här turens händelser (tomt i P2, eftersom inget steg emittar än)', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    const result = resolveTurn(state, EMPTY_SUBMISSION)
    expect(result.wire).toEqual([])
  })
})
