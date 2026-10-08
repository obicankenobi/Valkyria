// multiLine.test.ts — P187 (ETAPP11_FORSLAG.md §9b, beslut 11AA): ett kontrakt kan tillverkas på flera linjer samtidigt. Det gäller när kontraktet ligger i flera linjers planer;
// varje linje ställs om för sig (P171), inkörningen räknas per linje, och en linje går bara med när kontraktet har mer kvar än de linjer som redan har det hinner med.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/state.js'
import { production, computeLineThroughput } from '../src/resolve/steps/production.js'
import { createRng } from '../src/rng.js'
import { getProduct } from '../src/pricing.js'
import { estimateLineCompletionTurn } from '../src/queries.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, TurnSubmission, WireEvent } from '../src/types.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function runProduction(state: GameState): { emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = { state, draft: state, submission: EMPTY, rng: createRng('multi', 0), emit: (e) => (emitted.push(e), `t-${seq++}`), rejected: [] }
  production(ctx)
  return { emitted }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}

function setup(seed: string, quantity: number, planOn: string[]): { state: GameState; rate: number } {
  const state = createInitialState('indochina-slice', seed)
  state.house.works[0]!.category = null
  state.house.treasury = 50_000_000
  state.market.contracts = [contract({ quantity })]
  const plan: Record<string, { contractIds: string[]; sinceTurn: number }> = {}
  for (const id of planOn) plan[id] = { contractIds: ['c-1'], sinceTurn: state.meta.turn }
  state.house.standingOrders = { ...(state.house.standingOrders ?? { lines: {}, supply: {}, stations: {} }), plan } as GameState['house']['standingOrders']
  const rate = Math.floor(computeLineThroughput(state.house, allLines(state.house)[0]!, getProduct('105mm_field_gun')))
  return { state, rate }
}

describe('ett kontrakt på flera linjer (P187)', () => {
  it('ligger kontraktet i två linjers planer tillverkas det på båda samma tur, och enheterna delas', () => {
    const { state, rate } = setup('ml-1', 100, ['line-1', 'line-2'])
    runProduction(state)
    const lines = allLines(state.house)
    expect(lines.filter((l) => l.assignedContractId === 'c-1').map((l) => l.id)).toEqual(['line-1', 'line-2'])
    const units = state.market.shipments.filter((s) => s.contractId === 'c-1').map((s) => s.units)
    expect(units).toEqual([rate, rate])
    expect(new Set(state.market.shipments.map((s) => s.id)).size).toBe(2) // unika id även samma tur
  })

  it('utan plan på fler än en linje går kontraktet på en linje, som förut', () => {
    const { state, rate } = setup('ml-2', 100, ['line-1'])
    runProduction(state)
    expect(allLines(state.house).filter((l) => l.assignedContractId === 'c-1')).toHaveLength(1)
    expect(state.market.shipments.map((s) => s.units)).toEqual([rate])
    const none = setup('ml-2b', 100, [])
    runProduction(none.state)
    expect(allLines(none.state.house).filter((l) => l.assignedContractId === 'c-1')).toHaveLength(1)
  })

  it('en linje går inte med när de linjer som redan har kontraktet hinner med resten (ingen omställning i onödan)', () => {
    const probe = setup('ml-3', 100, [])
    const small = probe.rate // exakt en linjes takt
    const { state } = setup('ml-3', small, ['line-1', 'line-2'])
    runProduction(state)
    expect(allLines(state.house).filter((l) => l.assignedContractId === 'c-1').map((l) => l.id)).toEqual(['line-1'])
    expect(state.market.shipments.map((s) => s.units)).toEqual([small])
  })

  it('antalet enheter överstiger aldrig det som återstår', () => {
    const { state, rate } = setup('ml-4', 100, ['line-1', 'line-2'])
    state.market.contracts[0]!.quantity = rate + 3
    runProduction(state)
    expect(state.market.shipments.reduce((sum, s) => sum + s.units, 0)).toBe(rate + 3)
  })

  it('varje linje ställs om för sig: en linje som står uppsatt för en annan produkt är kvar i omställning', () => {
    const { state, rate } = setup('ml-5', 100, ['line-1', 'line-2'])
    const [l1, l2] = allLines(state.house)
    l1!.tooling = { productId: '105mm_field_gun' as never, designId: null }
    l2!.tooling = { productId: 'mk9_longhand_shell' as never, designId: null }
    runProduction(state)
    expect(l1!.status).toBe('running')
    expect(l2!.status).toBe('retooling')
    expect(l2!.retoolingUntilTurn).toBeGreaterThan(state.meta.turn)
    expect(state.market.shipments.map((s) => s.units)).toEqual([rate]) // bara linje 1 tillverkar den här turen
  })

  it('en plan får peka på ett kontrakt som redan ligger i en annan linjes plan', () => {
    const { state } = setup('ml-6', 100, ['line-1'])
    const v = validateStandingOrderChange(state, state, { kind: 'PLAN', op: 'SET', lineId: 'line-2', contractIds: ['c-1'] })
    expect(v).toEqual({ ok: true })
  })

  it('"klar när" räknar med alla linjer som har kontraktet', () => {
    const { state, rate } = setup('ml-7', 100, ['line-1', 'line-2'])
    runProduction(state)
    const [l1] = allLines(state.house)
    const remaining = 100 - 2 * rate
    const together = estimateLineCompletionTurn(state, l1!)
    expect(together).toBe(state.meta.turn + Math.ceil(remaining / (2 * computeLineThroughput(state.house, l1!, getProduct('105mm_field_gun')))))
  })
})
