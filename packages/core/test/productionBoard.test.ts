// productionBoard.test.ts — P180 (ETAPP11_FORSLAG.md §8 punkt 3 och 5): produktionstavlan och verkslarmen läser samma projektion som budmappens "ready by".
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/state.js'
import { capacityOutlook, productionBoard } from '../src/capacity.js'
import { worksAlarms } from '../src/worksAlarms.js'
import { allLines } from '../src/works.js'
import type { Contract, GameState } from '../src/types.js'

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}
const fresh = (seed: string): GameState => createInitialState('indochina-slice', seed)

describe('productionBoard (P180)', () => {
  it('ett spår per linje, en tom linje är en enda ledig remsa över hela horisonten', () => {
    const s = fresh('board-1')
    const board = productionBoard(s)
    expect(board.lines.map((l) => l.lineId)).toEqual(allLines(s.house).map((l) => l.id))
    for (const line of board.lines) expect(line.segments).toEqual([{ kind: 'idle', contractId: null, productId: null, start: s.meta.turn, end: s.meta.turn + board.horizon, late: false }])
    expect(board.contracts).toEqual([])
  })

  it('ett kontrakt på en linje blir ett segment som slutar när budmappen säger att det är klart; ett väntande står bakom på den linje som blir fri', () => {
    const s = fresh('board-2')
    const [l1, l2] = allLines(s.house)
    s.market.contracts = [contract({ id: 'x', quantity: 400 }), contract({ id: 'y', quantity: 80 }), contract({ id: 'w', quantity: 60 })]
    for (const [line, id] of [[l1!, 'x'], [l2!, 'y']] as const) {
      line.assignedContractId = id
      line.productId = '105mm_field_gun'
      line.tooling = { productId: '105mm_field_gun' as never, designId: null }
      line.status = 'running'
    }
    const board = productionBoard(s)
    const row = (id: string) => board.lines.find((l) => l.lineId === id)!
    expect(row('line-1').segments[0]).toMatchObject({ kind: 'contract', contractId: 'x', start: s.meta.turn })
    // w ställs på linjen som blir fri först (y:s) och börjar där y slutar — samma som budmappens utlåtande
    const outlook = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 60 })
    const w = row(outlook.line!).segments.find((seg) => seg.contractId === 'w')!
    expect(w.start).toBeGreaterThanOrEqual(row(outlook.line!).segments[0]!.end)
    expect(board.contracts.find((c) => c.contractId === 'w')).toMatchObject({ onLine: false, line: outlook.line, subcontracted: false })
    expect(board.contracts.find((c) => c.contractId === 'x')).toMatchObject({ onLine: true, line: 'line-1' })
  })

  it('en produktionsplan binder kontraktet till sin linje och går före övriga väntande', () => {
    const s = fresh('board-3')
    s.market.contracts = [contract({ id: 'a', quantity: 50 }), contract({ id: 'b', quantity: 50 })]
    s.house.standingOrders.plan = { 'line-2': { contractIds: ['b'], sinceTurn: s.meta.turn } }
    const board = productionBoard(s)
    expect(board.contracts.find((c) => c.contractId === 'b')).toMatchObject({ line: 'line-2', plannedOn: 'line-2' })
    expect(board.lines.find((l) => l.lineId === 'line-2')!.plan).toEqual(['b'])
    expect(board.lines.find((l) => l.lineId === 'line-2')!.segments[0]).toMatchObject({ kind: 'contract', contractId: 'b' })
  })

  it('en omställning visas som ett eget segment före kontraktet', () => {
    const s = fresh('board-4')
    const [l1, l2] = allLines(s.house)
    for (const l of [l1!, l2!]) l.tooling = { productId: '105mm_field_gun' as never, designId: null }
    s.market.contracts = [contract({ id: 'k', productId: 'mk9_longhand_shell', quantity: 5 })]
    const board = productionBoard(s)
    const line = board.lines.find((l) => l.segments.some((seg) => seg.contractId === 'k'))!
    expect(line.segments.some((seg) => seg.kind === 'setup')).toBe(true)
  })

  it('ett kontrakt som inte hinner märks som sent', () => {
    const s = fresh('board-5')
    s.market.contracts = [contract({ id: 'big', quantity: 9000, dueTurn: s.meta.turn + 2 })]
    expect(productionBoard(s).contracts[0]!.late).toBe(true)
  })

  it('utlagda kontrakt visar sin andel och är inte på någon linje', () => {
    const s = fresh('board-6')
    s.market.contracts = [contract({ id: 'o', productId: 'm3_apc', quantity: 20, outsource: { sharePct: 100, auto: true, sinceTurn: 0, built: 0 } })]
    const c = productionBoard(s).contracts[0]!
    expect(c.sharePct).toBe(100)
    expect(c.line).toBeNull()
  })
})

describe('worksAlarms (P180)', () => {
  it('startläget larmar inte', () => {
    expect(worksAlarms(fresh('alarm-0'))).toEqual([])
  })

  it('tom linje: efter en tur utan något att bygga larmar de lediga linjerna, i en enda rad', () => {
    const s = fresh('alarm-1')
    s.meta.turn = 3
    const alarms = worksAlarms(s).filter((a) => a.kind === 'empty-line')
    expect(alarms).toHaveLength(1)
    expect(alarms[0]!.text).toBe(`${allLines(s.house).length} production lines have nothing to build`)
    expect(alarms[0]!.lineId).toBe(allLines(s.house)[0]!.id)
  })

  it('kontrakt som blir sent, dåligt skick, underbemanning, strejk och strejkrisk larmar', () => {
    const s = fresh('alarm-2')
    s.market.contracts = [contract({ id: 'big', quantity: 9000, dueTurn: s.meta.turn + 2 })]
    const works = s.house.works.find((w) => w.kind === 'assembly')!
    works.condition = 20
    works.staffing = 25
    works.morale = 40
    const kinds = worksAlarms(s).map((a) => a.kind)
    expect(kinds).toContain('late-contract')
    expect(kinds).toContain('poor-condition')
    expect(kinds).toContain('understaffed')
    expect(kinds).toContain('strike-risk')
    works.status = 'strike'
    expect(worksAlarms(s).find((a) => a.kind === 'strike-risk')!.text).toMatch(/on strike/)
  })

  it('ett färdigt bygge från senaste turen larmar med anläggningens id', () => {
    const s = fresh('alarm-3')
    s.meta.turn = 4
    const lab = s.house.works.find((w) => w.kind === 'laboratory')!
    s.wire = [{ id: 'w1', turn: 3, severity: 'headline', scope: 'house', headline: `LABORATORY ${lab.id.toUpperCase()} IS READY (FINAL INSTALMENT £1)`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: lab.id } as never]
    const alarm = worksAlarms(s).find((a) => a.kind === 'build-done')!
    expect(alarm.facilityId).toBe(lab.id)
  })
})
