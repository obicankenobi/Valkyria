import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../../src/resolve/index.js'
import { createInitialState } from '../../src/state.js'
import { pruneWire } from '../../src/wire.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function assertNoDanglingCauseId(wire: readonly WireEvent[]): void {
  const ids = new Set(wire.map((e) => e.id))
  for (const event of wire) {
    if (event.causeId !== null) {
      expect(ids.has(event.causeId)).toBe(true)
    }
  }
}

describe('wire-chains invariant', () => {
  it('20 turer via resolveTurn: inget causeId i state.wire pekar på en saknad händelse', () => {
    let state: GameState = createInitialState('indochina-slice', 'wire-chains-seed')

    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      assertNoDanglingCauseId(result.state.wire)
      state = result.state
    }

    // P2:s pipeline är no-ops rakt igenom, så wire är tom hela vägen — invarianten
    // är sann men provocerad, inte prövad. Se den syntetiska, flerturers historiken
    // nedan för den delen som faktiskt utmanar pruneWire. Från och med den prompt
    // som låter ett steg emitta på riktigt (P3+) blir det här ett skarpt test.
    expect(state.wire).toEqual([])
  })

  it('en syntetisk historik som spänner över långt fler än 8 turer, med grenande orsakskedjor: pruneWire lämnar aldrig en hängande referens', () => {
    // Bygger en bredare historik än vad P2:s egna no-op-pipeline kan producera:
    // flera oberoende kedjor, olika djup, och grenar (två händelser som delar
    // samma orsak). Det här är testet som faktiskt skulle fånga en regression i
    // beskärningslogiken.
    const wire: WireEvent[] = []
    function push(id: string, turn: number, causeId: string | null): void {
      wire.push({
        id,
        turn,
        severity: 'ticker',
        scope: 'global',
        headline: id,
        causeId,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
    }

    // Kedja A: en lång, oavbruten kedja över 25 turer.
    push('a-0', 0, null)
    for (let turn = 1; turn <= 25; turn++) {
      push(`a-${turn}`, turn, `a-${turn - 1}`)
    }

    // Kedja B: två händelser på samma tur som grenar ut från samma orsak.
    push('b-root', 10, null)
    push('b-left', 24, 'b-root')
    push('b-right', 24, 'b-root')

    for (let currentTurn = 0; currentTurn <= 30; currentTurn++) {
      const pruned = pruneWire(wire, currentTurn)
      assertNoDanglingCauseId(pruned)
    }
  })
})
