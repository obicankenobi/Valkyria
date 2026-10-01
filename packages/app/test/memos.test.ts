// memos.test.ts — P127 (ETAPP9 §9, "Daterade PM"). Fyra PM, ett per system, aktuella först när systemet blir relevant.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import { MEMOS, dueMemos, findMemo } from '../src/memos.js'

describe('daterade PM (P127)', () => {
  it('fyra PM i den ordning systemen införs, alla med ett fast datum, en avsändare och minst ett stycke', () => {
    expect(MEMOS.map((m) => m.id)).toEqual(['drawing-board', 'requirement-cards', 'arms-race', 'procurement'])
    for (const m of MEMOS) {
      expect(m.date).toMatch(/^\d{1,2} [A-Z]+ 19\d\d$/)
      expect(m.from.length).toBeGreaterThan(0)
      expect(m.body.length).toBeGreaterThan(0)
    }
  })

  it('ritbordets PM är aktuellt från start; de andra väntar på sitt system', () => {
    const state = createInitialState('indochina-slice', 'memo-seed')
    state.race.generation.west.artillery = 1
    expect(dueMemos(state, []).map((m) => m.id)).toContain('drawing-board')
    expect(dueMemos(state, []).map((m) => m.id)).not.toContain('arms-race')
    expect(dueMemos(state, []).map((m) => m.id)).not.toContain('procurement')
  })

  it('kapplöpnings-PM:et kommer när ett block gått upp en generation', () => {
    const state = createInitialState('indochina-slice', 'memo-seed')
    state.race.generation.east.armour = 2
    expect(dueMemos(state, []).map((m) => m.id)).toContain('arms-race')
  })

  it('kravkorts-PM:et kommer när ett kravkort finns, och upphandlings-PM:et efter en gap-chock eller en infordran', () => {
    const state = createInitialState('indochina-slice', 'memo-seed')
    state.race.gap = { artillery: { leader: 'west', sinceTurn: 3 } }
    expect(dueMemos(state, []).map((m) => m.id)).toContain('procurement')
    const state2 = createInitialState('indochina-slice', 'memo-seed')
    expect(dueMemos(state2, []).map((m) => m.id)).not.toContain('procurement')
  })

  it('ett läst PM visas aldrig igen', () => {
    const state = createInitialState('indochina-slice', 'memo-seed')
    expect(dueMemos(state, ['drawing-board']).map((m) => m.id)).not.toContain('drawing-board')
  })

  it('findMemo slår upp ett PM, okänt id ger undefined', () => {
    expect(findMemo('arms-race')?.subject).toBe('THE ARMS RACE BOARD')
    expect(findMemo('nope')).toBeUndefined()
  })
})
