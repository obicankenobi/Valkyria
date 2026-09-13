import { describe, expect, it } from 'vitest'
import { heat } from '../../src/resolve/steps/heat.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('heat (isolerat steg, spec avsnitt 5 "Heat")', () => {
  it('(P7 klart-när) 4 turer i rad med fullinjeleverans (100 enheter/tur) driver heat över 40', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.heat = 0

    for (let turn = 0; turn < 4; turn++) {
      theatre.deliveriesIntoActiveWarThisTurn = 100 // "denna turs leverans", satt av deliveries.ts i en riktig pipelinepassage
      heat(makeCtx(state, `heat-seed-${turn}`).ctx)
    }

    expect(theatre.heat).toBeGreaterThan(40)
  })

  it('(P7 klart-när) heat faller mot 0 under turer utan leverans', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.heat = 60

    const readings: number[] = [theatre.heat]
    for (let turn = 0; turn < 8; turn++) {
      theatre.deliveriesIntoActiveWarThisTurn = 0
      heat(makeCtx(state, `heat-idle-seed-${turn}`).ctx)
      readings.push(theatre.heat)
    }

    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]!).toBeLessThanOrEqual(readings[i - 1]!)
    }
    expect(theatre.heat).toBe(0)
  })

  it('nollställer deliveriesIntoActiveWarThisTurn varje passage (självnollställande räknare)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.deliveriesIntoActiveWarThisTurn = 50

    heat(makeCtx(state, 'heat-seed').ctx)

    expect(theatre.deliveriesIntoActiveWarThisTurn).toBe(0)
  })

  it('heat klamras aldrig utanför [0, 100]', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.heat = 95
    theatre.deliveriesIntoActiveWarThisTurn = 1000

    heat(makeCtx(state, 'heat-seed').ctx)

    expect(theatre.heat).toBeLessThanOrEqual(100)
    expect(theatre.heat).toBeGreaterThanOrEqual(0)
  })

  it('emittar ingen händelse när heat faktiskt inte ändras (redan botten, ingen leverans)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.heat = 0
    theatre.deliveriesIntoActiveWarThisTurn = 0

    const { emitted } = makeCtx(state, 'heat-seed')
    heat(makeCtx(state, 'heat-seed').ctx)

    expect(emitted).toEqual([])
  })

  it('emittar en händelse (CLAUDE.md hård regel 4) när heat faktiskt ändras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const theatre = state.theatres['indochina']!
    theatre.heat = 50
    theatre.deliveriesIntoActiveWarThisTurn = 0

    const { ctx, emitted } = makeCtx(state, 'heat-seed')
    heat(ctx)

    expect(emitted.length).toBeGreaterThan(0)
  })
})
