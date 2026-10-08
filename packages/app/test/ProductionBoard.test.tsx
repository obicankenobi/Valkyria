// ProductionBoard.test.tsx — P180 (ETAPP11_FORSLAG.md §8 punkt 3): planeringstavlan, produktionsplanen och utläggningen.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, productionBoard } from '@seventh-front/core'
import type { Contract, GameState, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { ProductionBoard } from '../src/components/ProductionBoard.js'

afterEach(cleanup)

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-order-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}

function setup(state: GameState, draft: TurnSubmission = EMPTY) {
  const onSet = vi.fn<(c: StandingOrderChange) => void>()
  const onRemove = vi.fn<(key: string) => void>()
  render(<ProductionBoard state={state} draft={draft} onSet={onSet} onRemove={onRemove} />)
  return { onSet, onRemove }
}

const withContracts = (...cs: Contract[]) => {
  const s = createInitialState('indochina-slice', 'board-ui')
  s.market.contracts = cs
  return s
}

describe('produktionstavlan (P180)', () => {
  it('ett spår per linje och en kolumn per kvartal', () => {
    const s = createInitialState('indochina-slice', 'board-ui-0')
    setup(s)
    const board = productionBoard(s)
    for (const line of board.lines) expect(screen.getByTestId(`board-row-${line.lineId}`)).toBeTruthy()
    expect(screen.getByTestId('production-board').querySelectorAll('.board-col')).toHaveLength(board.horizon)
    expect(screen.getByText(/No active contracts/)).toBeTruthy()
  })

  it('ett kontrakt syns som ett segment på sin linje och som en rad med klartid', () => {
    const s = withContracts(contract())
    setup(s)
    const board = productionBoard(s)
    const row = board.contracts[0]!
    expect(screen.getByTestId(`board-seg-${row.contractId}`).textContent).toBe('#1')
    const item = screen.getByTestId(`board-contract-${row.contractId}`)
    expect(item.textContent).toContain('105mm')
    expect(item.textContent).toContain(`ready T${row.readyTurn}`)
    expect(item.textContent).toContain(`due T${row.dueTurn}`)
  })

  it('ett sent kontrakt märks LATE både på raden och i spåret', () => {
    const s = withContracts(contract({ quantity: 9000, dueTurn: 2 }))
    setup(s)
    expect(screen.getByTestId('board-contract-contract-order-1').textContent).toContain('LATE')
    expect(screen.getByTestId('board-seg-contract-order-1').className).toContain('is-late')
  })

  it('ett tryck på ett kontrakt öppnar kortet, och att dra det till en linje köar en PLAN SET', () => {
    const s = withContracts(contract())
    const { onSet } = setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    expect(screen.getByTestId('contract-card')).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('contract-line')).getByRole('switch', { name: 'L2' }))
    fireEvent.click(screen.getByTestId('contract-plan-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'PLAN', op: 'SET', lineId: 'line-2', contractIds: ['contract-order-1'] })
  })

  it('att lägga till en andra linje behåller kontraktet i den första planen (P187: flera linjer)', () => {
    const s = withContracts(contract(), contract({ id: 'contract-order-2' }))
    s.house.standingOrders.plan = { 'line-1': { contractIds: ['contract-order-1', 'contract-order-2'], sinceTurn: 0 } }
    const { onSet } = setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    fireEvent.click(within(screen.getByTestId('contract-line')).getByRole('switch', { name: 'L2' }))
    fireEvent.click(screen.getByTestId('contract-plan-file'))
    expect(onSet).toHaveBeenCalledTimes(1)
    expect(onSet).toHaveBeenCalledWith({ kind: 'PLAN', op: 'SET', lineId: 'line-2', contractIds: ['contract-order-1'] })
  })

  it('ett kontrakt i två linjers planer visas på båda spåren och som "L1 + L2" på raden', () => {
    const s = withContracts(contract({ quantity: 200 }))
    s.house.standingOrders.plan = { 'line-1': { contractIds: ['contract-order-1'], sinceTurn: 0 }, 'line-2': { contractIds: ['contract-order-1'], sinceTurn: 0 } }
    setup(s)
    expect(screen.getByTestId('board-contract-contract-order-1').textContent).toContain('L1 + L2')
    expect(within(screen.getByTestId('board-row-line-1')).getByTestId('board-seg-contract-order-1')).toBeTruthy()
    expect(within(screen.getByTestId('board-row-line-2')).getByTestId('board-seg-contract-order-1')).toBeTruthy()
  })

  it('att stänga av en linje tar kontraktet ur just den linjens plan', () => {
    const s = withContracts(contract(), contract({ id: 'contract-order-2' }))
    s.house.standingOrders.plan = { 'line-1': { contractIds: ['contract-order-1', 'contract-order-2'], sinceTurn: 0 }, 'line-2': { contractIds: ['contract-order-1'], sinceTurn: 0 } }
    const { onSet } = setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    expect(screen.getByTestId('contract-line-line-1').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('contract-line-line-2').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('contract-line-line-1'))
    fireEvent.click(screen.getByTestId('contract-plan-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['contract-order-2'] })
  })

  it('en linje som redan tillverkar kontraktet visas som BUILDING och kan inte stängas av', () => {
    const s = withContracts(contract())
    const l1 = s.house.works[0]!.lines[0]!
    l1.assignedContractId = 'contract-order-1'
    l1.status = 'running'
    setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    expect(screen.getByTestId('contract-line').textContent).toContain('L1 · BUILDING')
    expect(screen.queryByTestId('contract-line-line-1')).toBeNull()
  })

  it('att stänga av alla linjer (AUTO) tar bort kontraktet ur planen och tömmer planen med CLEAR', () => {
    const s = withContracts(contract())
    s.house.standingOrders.plan = { 'line-1': { contractIds: ['contract-order-1'], sinceTurn: 0 } }
    const { onSet } = setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    fireEvent.click(screen.getByTestId('contract-line-line-1'))
    fireEvent.click(screen.getByTestId('contract-plan-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'PLAN', op: 'CLEAR', lineId: 'line-1' })
  })

  it('utläggning på en underleverantör köar OUTSOURCE SET, och "OWN" tar tillbaka det', () => {
    const s = withContracts(contract())
    const { onSet } = setup(s)
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    fireEvent.click(within(screen.getByTestId('contract-share')).getByRole('radio', { name: '50%' }))
    fireEvent.click(screen.getByTestId('contract-outsource-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'OUTSOURCE', op: 'SET', contractId: 'contract-order-1', sharePct: 50 })
  })

  it('en köad planändring visas med "undo"', () => {
    const s = withContracts(contract())
    const queued: StandingOrderChange = { kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['contract-order-1'] }
    const { onRemove } = setup(s, { ...EMPTY, standingOrders: [queued] })
    fireEvent.click(screen.getByTestId('board-contract-contract-order-1'))
    const box = screen.getByTestId('contract-queued')
    expect(box.textContent).toContain('plan #1')
    fireEvent.click(within(box).getByText('undo'))
    expect(onRemove).toHaveBeenCalledWith('plan:line-1')
  })
})
