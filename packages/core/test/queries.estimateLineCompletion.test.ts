// queries.estimateLineCompletion.test.ts — P85 (ETAPP7_TEKNISK_SPEC.md §13,
// P81-16): "när pågående kontrakt blir klara." Läser samma takt-formel som
// production.ts:s steg 3 (computeLineThroughput, utbruten i samma commit) —
// inte en handkopierad approximation.
import { describe, expect, it } from 'vitest'
import { createInitialState, estimateLineCompletionTurn } from '../src/index.js'
import type { ProductionLine } from '../src/types.js'

function idleLine(): ProductionLine {
  return {
    id: 'line-test',
    productId: null,
    grade: 'A',
    unitsPerTurnAtFull: 40,
    capacityPct: 100,
    assignedContractId: null,
    status: 'idle',
    blockedReason: null,
    retoolingUntilTurn: null,
  }
}

describe('estimateLineCompletionTurn (P85)', () => {
  it('null för en ledig linje (inget tilldelat kontrakt)', () => {
    const state = createInitialState('indochina-slice', 'eta-idle-seed')
    expect(estimateLineCompletionTurn(state, idleLine())).toBeNull()
  })

  it('räknar rätt tur ur remaining/rate (m1_rifle: unitsPerLineTurn 4000, unitsPerLineTurnDefault 40)', () => {
    const state = createInitialState('indochina-slice', 'eta-running-seed')
    const buyerId = Object.keys(state.factions)[0]!
    state.market.contracts = [
      {
        id: 'contract-eta',
        buyerId,
        productId: 'm1_rifle',
        quantity: 9000,
        unitsDelivered: 0,
        price: 900_000,
        unitCostAtSigning: 290,
        grade: 'A',
        dueTurn: state.meta.turn + 10,
        status: 'active',
        lateEventId: null,
        frontId: null,
      },
    ]
    const line: ProductionLine = { ...idleLine(), productId: 'm1_rifle', assignedContractId: 'contract-eta', status: 'running' }

    // rate = 4000 * (100/100) * (40/40) = 4000/turn. remaining = 9000 -> ceil(9000/4000) = 3 turer.
    expect(estimateLineCompletionTurn(state, line)).toBe(state.meta.turn + 3)
  })

  it('returnerar innevarande tur om kontraktet redan är fullt producerat/i transit (remaining <= 0)', () => {
    const state = createInitialState('indochina-slice', 'eta-done-seed')
    const buyerId = Object.keys(state.factions)[0]!
    state.market.contracts = [
      {
        id: 'contract-done',
        buyerId,
        productId: 'm1_rifle',
        quantity: 500,
        unitsDelivered: 500,
        price: 200_000,
        unitCostAtSigning: 290,
        grade: 'A',
        dueTurn: state.meta.turn + 10,
        status: 'active',
        lateEventId: null,
        frontId: null,
      },
    ]
    const line: ProductionLine = { ...idleLine(), productId: 'm1_rifle', assignedContractId: 'contract-done', status: 'running' }
    expect(estimateLineCompletionTurn(state, line)).toBe(state.meta.turn)
  })

  it('null om det tilldelade kontraktet inte längre finns i state.market.contracts', () => {
    const state = createInitialState('indochina-slice', 'eta-missing-seed')
    const line: ProductionLine = { ...idleLine(), productId: 'm1_rifle', assignedContractId: 'ghost-contract', status: 'running' }
    expect(estimateLineCompletionTurn(state, line)).toBeNull()
  })
})
