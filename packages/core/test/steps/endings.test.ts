import { describe, expect, it } from 'vitest'
import { endings } from '../../src/resolve/steps/endings.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng('endings-test', 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('endings (isolerat steg, spec avsnitt 5 + 7.2)', () => {
  it('ingen ending innan något villkor är sant', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx, emitted } = makeCtx(state)

    endings(ctx)

    expect(state.status).toEqual({ kind: 'active' })
    expect(emitted).toEqual([])
  })

  it('NUCLEAR_EXCHANGE när doomsday >= 95', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = 95
    const { ctx, emitted } = makeCtx(state)

    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'NUCLEAR_EXCHANGE', turn: state.meta.turn })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.severity).toBe('headline')
  })

  it('EXPOSURE när minst exposureEventsForEnding stationer exponerats inom exposureWindowTurns', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 10
    state.house.exposureEvents = [6, 8, 9] // alla > 10 - 6, tre stycken

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'EXPOSURE', turn: 10 })
  })

  it('ingen EXPOSURE när exponeringarna ligger utanför fönstret eller är för få', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 10
    state.house.exposureEvents = [1, 2, 3] // alla <= 10 - 6, räknas inte

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'active' })
  })

  it('INSOLVENCY när insolventTurns når balance.insolvencyTurns', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.insolventTurns = 3

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: state.meta.turn })
  })

  it('ingen INSOLVENCY under tröskeln', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.insolventTurns = 2

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'active' })
  })

  it('BUYOUT omedelbart när reviewsFailed når två, oavsett tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.boardTarget.reviewsFailed = 2

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'BUYOUT', turn: state.meta.turn })
  })

  it('BUYOUT vid dueTurn om målet inte är nått', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = state.house.boardTarget.dueTurn
    state.house.boardTarget.progressSnapshot = 0 // under threshold

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'BUYOUT', turn: state.meta.turn })
  })

  it('ingen BUYOUT vid dueTurn om målet ÄR nått — faller istället igenom till SCENARIO_COMPLETE', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = state.house.boardTarget.dueTurn
    state.house.boardTarget.progressSnapshot = state.house.boardTarget.threshold

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: state.meta.turn })
  })

  it('SCENARIO_COMPLETE vid scenariots turnCount när inget annat slutvillkor slagit till', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 20 // indochina-slice.json: turnCount
    state.house.boardTarget.progressSnapshot = state.house.boardTarget.threshold

    const { ctx, emitted } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'SCENARIO_COMPLETE', turn: 20 })
    expect(emitted[0]?.headline).toContain('SCENARIO COMPLETE')
  })

  it('rör aldrig ett redan avgjort parti', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.status = { kind: 'ended', ending: 'INSOLVENCY', turn: 3 }
    state.doomsday = 100 // skulle annars ge NUCLEAR_EXCHANGE

    const { ctx, emitted } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: 3 })
    expect(emitted).toEqual([])
  })

  it('ordningen NUCLEAR_EXCHANGE > EXPOSURE > INSOLVENCY > BUYOUT > SCENARIO_COMPLETE respekteras när flera villkor är sanna samtidigt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 20
    state.doomsday = 95
    state.house.exposureEvents = [16, 18, 19]
    state.house.insolventTurns = 3
    state.house.boardTarget.reviewsFailed = 2

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'NUCLEAR_EXCHANGE', turn: 20 })
  })

  it('EXPOSURE vinner över INSOLVENCY/BUYOUT när båda är sanna (ordning, andra länken)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 20
    state.house.exposureEvents = [16, 18, 19]
    state.house.insolventTurns = 3
    state.house.boardTarget.reviewsFailed = 2

    const { ctx } = makeCtx(state)
    endings(ctx)

    expect(state.status).toEqual({ kind: 'ended', ending: 'EXPOSURE', turn: 20 })
  })
})
