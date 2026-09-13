import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import type { GameState, TurnSubmission } from '../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// TAKE_LOAN görs inte om till pengar av applyActions än (den är fortfarande no-op —
// se ANDRINGSLOGG.md, ingen prompt äger den). Bud in i submission ändrar alltså inte
// resultatet idag. Den skickas ändå med, varje tur, för att spegla P3:s klart-när-
// villkor ordagrant ("även när boten försöker låna varje tur") och för att testet
// ska fortsätta vara sant den dagen TAKE_LOAN faktiskt processas — se
// "creditLimit är 0 för ett hus utan intäktshistorik" i test/steps/economy.test.ts,
// som bevisar ATT en riktig implementation aldrig kan bevilja lånet ändå.
const SUBMISSION_WITH_LOAN_ATTEMPT: TurnSubmission = {
  standingOrders: [],
  bids: [],
  actions: [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 5000000 } }],
}

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

  it('result.wire innehåller bara den här turens händelser, inte tidigare turers', () => {
    // Från och med P3 emittar economy.ts på riktigt varje tur (fasta kostnader,
    // eventuell ränta), så wire är inte längre tomt. Det som faktiskt ska hålla är
    // att result.wire bara innehåller DENNA turs händelser (turn === den tur som
    // löstes), inte ackumulerad historik från tidigare turer.
    const state = createInitialState('indochina-slice', 'p2-seed')
    const result = resolveTurn(state, EMPTY_SUBMISSION)

    expect(result.wire.length).toBeGreaterThan(0)
    for (const event of result.wire) {
      expect(event.turn).toBe(state.meta.turn)
    }

    const secondResult = resolveTurn(result.state, EMPTY_SUBMISSION)
    expect(secondResult.wire.length).toBeGreaterThan(0)
    for (const event of secondResult.wire) {
      expect(event.turn).toBe(result.state.meta.turn)
    }
  })
})

describe('resolveTurn — P3: ekonomi och slut', () => {
  it('ett hus utan intäkter går i INSOLVENCY på en förutsägbar tur, även när boten försöker låna varje tur', () => {
    // indochina-slice: founding capital 4 000 000, fasta kostnader 510 000/tur,
    // ingen skuld → ingen ränta. Ingen leverans sker (production/deliveries är
    // fortfarande no-ops, P5), så det finns aldrig någon intäkt att låna mot —
    // creditLimit blir därför alltid 0 (bevisat separat i economy.test.ts), vilket
    // är VARFÖR lånförsöket inte hjälper, inte bara för att TAKE_LOAN råkar vara
    // otrådad än.
    //
    // 4 000 000 / 510 000 ≈ 7,84 → treasury blir negativt första gången i den 8:e
    // resolveTurn-anropet (kumulativ dragning 8×510 000 = 4 080 000 > 4 000 000).
    // Tre negativa turer i rad (insolvencyTurns = 3) ger INSOLVENCY i det 10:e
    // anropet — förutsägbart, inte bara "inom 20 turer".
    let state: GameState = createInitialState('indochina-slice', 'insolvency-seed')
    expect(state.house.treasury).toBe(4000000)

    let callsUntilEnded = 0
    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, SUBMISSION_WITH_LOAN_ATTEMPT)
      state = result.state
      callsUntilEnded++
      if (state.status.kind === 'ended') break
    }

    expect(callsUntilEnded).toBe(10)
    expect(state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: 9 })
    expect(state.house.insolventTurns).toBe(3)
    expect(state.house.creditLimit).toBe(0)
  })

  it('endings.ts kör efter economy.ts i samma tur: INSOLVENCY syns direkt den tur insolventTurns når tröskeln, utan en extra resolveTurn-omgång', () => {
    let state: GameState = createInitialState('indochina-slice', 'insolvency-seed-2')
    for (let i = 0; i < 9; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      expect(state.status.kind).toBe('active')
    }
    // Nionde anropet (i=8, 0-indexerat) lämnade insolventTurns på 2. Det tionde
    // (denna) för den till 3 och ska avgöra partiet i SAMMA pipelinepassage.
    const finalResult = resolveTurn(state, EMPTY_SUBMISSION)
    expect(finalResult.state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: 9 })
  })
})
