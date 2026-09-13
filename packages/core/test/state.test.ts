import { describe, expect, it } from 'vitest'
import { cloneState, createInitialState } from '../src/state.js'

describe('createInitialState', () => {
  it('JSON-serialiserar och deserialiserar bitvis identiskt', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const roundTripped = JSON.parse(JSON.stringify(state))
    expect(roundTripped).toEqual(state)
  })

  it('är deterministisk för samma scenario och seed', () => {
    const a = createInitialState('indochina-slice', 'test-seed')
    const b = createInitialState('indochina-slice', 'test-seed')
    expect(b).toEqual(a)
  })

  it('startar på tur 0 med rngCursor 0 och sparar seeden', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.meta.turn).toBe(0)
    expect(state.meta.rngCursor).toBe(0)
    expect(state.meta.seed).toBe('test-seed')
    expect(state.meta.scenarioId).toBe('indochina-slice')
    expect(state.status).toEqual({ kind: 'active' })
  })

  it('bygger etapp 1:s omfång: en front, en teater, tre faktioner, tre rivaler, fyra linjer, en station', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(Object.keys(state.fronts)).toHaveLength(1)
    expect(Object.keys(state.theatres)).toHaveLength(1)
    expect(Object.keys(state.factions)).toHaveLength(3)
    expect(Object.keys(state.rivals)).toHaveLength(3)
    expect(state.house.lines).toHaveLength(4)
    expect(state.house.stations).toHaveLength(1)
  })

  it('inga öppna ordrar eller kontrakt vid start', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.market.openOrders).toEqual([])
    expect(state.market.contracts).toEqual([])
    expect(state.market.supplyCostIndex).toBe(100)
  })

  it('doomsday och wire startar tomma', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.doomsday).toBe(0)
    expect(state.doomsdayPeak).toBe(0)
    expect(state.wire).toEqual([])
  })

  it('styrelsemålets prognoskontroller ligger på tur 8 och 14', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.house.boardTarget.reviewTurns).toEqual([8, 14])
    expect(state.house.boardTarget.dueTurn).toBe(20)
    expect(state.house.boardTarget.reviewsFailed).toBe(0)
    expect(state.house.boardTarget.lastReviewTurn).toBeNull()
  })

  it('frontens sidor pekar på faktioner som faktiskt finns', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const front = Object.values(state.fronts)[0]
    expect(front).toBeDefined()
    expect(state.factions[front!.sideA]).toBeDefined()
    expect(state.factions[front!.sideB]).toBeDefined()
  })

  it('kastar på okänt scenarioId', () => {
    expect(() => createInitialState('does-not-exist', 'test-seed')).toThrow()
  })
})

describe('cloneState', () => {
  it('ger en värdemässigt identisk men oberoende djup kopia', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const clone = cloneState(state)

    expect(clone).toEqual(state)
    expect(clone).not.toBe(state)
    expect(clone.house).not.toBe(state.house)
    expect(clone.house.lines).not.toBe(state.house.lines)
    expect(clone.factions).not.toBe(state.factions)

    clone.house.treasury = 0
    expect(state.house.treasury).not.toBe(0)
  })
})
