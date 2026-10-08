// capacity.test.ts — P172 (ETAPP11_FORSLAG.md §4.6): "ready by" och undanträngning. Budmappen ska kunna visa när en order kan vara klar med dagens plan och vad den tränger
// undan. Frågan är ren (ingen slump): samma giriga fördelning som `production` gör — första kontraktet till den linje som blir fri först — och en uppskattning, inte ett löfte
// (leveransen tar `deliveryDelay` kvartal till).
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { capacityOutlook, productionBoard } from '../src/capacity.js'
import { getProduct } from '../src/pricing.js'
import { allLines } from '../src/works.js'
import { computeLineThroughput } from '../src/resolve/steps/production.js'
import type { Contract, GameState } from '../src/types.js'

const B_JOIN_LAG = (balance as unknown as { multiLineJoinLagTurns: number }).multiLineJoinLagTurns
const B = balance as unknown as { retoolingTurnsProduct: number; retoolingTurnsDesign: number; deliveryDelayMinTurns: number; deliveryDelayMaxTurns: number; subcontractUnitsFactor: number }

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}

const fresh = (seed: string): GameState => createInitialState('indochina-slice', seed)
const rate = (s: GameState, productId = '105mm_field_gun') => computeLineThroughput(s.house, allLines(s.house)[0]!, getProduct(productId as never))

describe('capacityOutlook — när en order kan vara klar', () => {
  it('med en ledig linje i rätt kategori: starten är nu och tiden är kvantitet ÷ takt', () => {
    const s = fresh('cap-1')
    const o = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 100, spread: false })
    expect(o.route).toBe('own')
    expect(o.setupTurns).toBe(0) // en ny linje startar utan omställning
    expect(o.readyTurn).toBe(s.meta.turn + Math.ceil(100 / rate(s)))
    expect(o.deliveredBetween).toEqual([o.readyTurn! + B.deliveryDelayMinTurns, o.readyTurn! + B.deliveryDelayMaxTurns])
  })

  it('P187: med flera lediga linjer räknar "ready by" med dem alla (de övriga går med en tur senare)', () => {
    const s = fresh('cap-1b')
    const one = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 100, spread: false })
    const many = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 100 })
    expect(many.lines).toHaveLength(2)
    expect(many.readyTurn!).toBeLessThan(one.readyTurn!)
    // linje 1 från start, linje 2 en tur senare: summan av tillverkade enheter hinner upp kvantiteten vid readyTurn
    const r = rate(s)
    const t = many.readyTurn! - s.meta.turn
    expect(r * t + r * (t - B_JOIN_LAG)).toBeGreaterThanOrEqual(100)
    expect(r * (t - 1) + r * (t - 1 - B_JOIN_LAG)).toBeLessThan(100)
  })

  it('P187: ett litet kontrakt som en linje hinner med går inte på flera linjer', () => {
    const s = fresh('cap-1c')
    const o = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 5 })
    expect(o.lines).toHaveLength(1)
  })

  it('P187: ett väntande kontrakt som ligger i två linjers planer räknas på båda', () => {
    const s = fresh('cap-1d')
    s.market.contracts = [contract({ id: 'w', quantity: 100 })]
    s.house.standingOrders = { ...(s.house.standingOrders ?? { lines: {}, supply: {}, stations: {} }), plan: { 'line-1': { contractIds: ['w'], sinceTurn: 1 }, 'line-2': { contractIds: ['w'], sinceTurn: 1 } } } as never
    const board = productionBoard(s)
    const c = board.contracts.find((x) => x.contractId === 'w')!
    expect(c.lines).toEqual(['line-1', 'line-2'])
    expect(c.readyTurn).toBe(s.meta.turn + Math.ceil(100 / (2 * rate(s))))
    expect(board.lines.every((l) => l.segments.some((seg) => seg.contractId === 'w'))).toBe(true)
  })

  it('upptagna linjer: ordern ställs sist i kön och blir klar när en linje blivit fri, plus eventuell omställning', () => {
    const s = fresh('cap-2')
    const [l1, l2] = allLines(s.house)
    s.market.contracts = [contract({ id: 'x', quantity: 400 }), contract({ id: 'y', quantity: 80 })]
    for (const [line, id] of [[l1!, 'x'], [l2!, 'y']] as const) {
      line.assignedContractId = id
      line.productId = '105mm_field_gun'
      line.tooling = { productId: '105mm_field_gun' as never, designId: null }
      line.status = 'running'
    }
    const o = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 100 })
    const freesFirst = s.meta.turn + Math.ceil(80 / rate(s)) // y blir klar före x
    expect(o.line).toBe('line-2')
    expect(o.readyTurn).toBe(freesFirst + Math.ceil(100 / rate(s)))
    const other = capacityOutlook(s, { productId: 'mk9_longhand_shell', quantity: 5 }) // en annan produkt i samma kategori: omställning
    expect(other.setupTurns).toBe(B.retoolingTurnsProduct)
  })

  it('en väntande order före den: den nya ställs bakom, och `waitingAhead` säger vilka', () => {
    const s = fresh('cap-3')
    const [l1, l2] = allLines(s.house)
    s.market.contracts = [contract({ id: 'x', quantity: 400 }), contract({ id: 'y', quantity: 400 }), contract({ id: 'w', quantity: 50 })]
    l1!.assignedContractId = 'x'; l1!.status = 'running'; l1!.productId = '105mm_field_gun'
    l2!.assignedContractId = 'y'; l2!.status = 'running'; l2!.productId = '105mm_field_gun'
    const o = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 50 })
    expect(o.waitingAhead).toEqual(['w'])
  })

  it('en kategori inget verk kan bygga går via en underleverantör: takten är den utlagda, och ingen linje används', () => {
    const s = fresh('cap-4') // startverket bygger artilleri
    const o = capacityOutlook(s, { productId: 'm3_apc', quantity: 15 })
    expect(o.route).toBe('subcontractor')
    expect(o.line).toBeNull()
    expect(o.setupTurns).toBe(0)
    const apc = getProduct('m3_apc')
    expect(o.readyTurn).toBe(s.meta.turn + Math.ceil(15 / Math.max(1, Math.floor(apc.unitsPerLineTurn * B.subcontractUnitsFactor))))
  })

  it('mot en förfallodag: late säger om ordern hinner, och `slack` hur många kvartal som är kvar', () => {
    const s = fresh('cap-5')
    const quick = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 40, deliveryTurns: 8 })
    expect(quick.late).toBe(false)
    expect(quick.slack).toBeGreaterThanOrEqual(0)
    const slow = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 4000, deliveryTurns: 2 })
    expect(slow.late).toBe(true)
    expect(slow.slack).toBeLessThan(0)
  })
})

describe('capacityOutlook — vad en prioriterad order tränger undan', () => {
  it('ställs ordern FÖRST i planen blir de väntande kontrakt som då passerar förfallodagen utpekade; ställs den sist trängs ingen undan', () => {
    const s = fresh('cap-6')
    const [l1, l2] = allLines(s.house)
    const turn = s.meta.turn
    // Båda linjerna upptagna i en tur till; ett väntande kontrakt har en snäv förfallodag precis där en linje blir fri.
    s.market.contracts = [contract({ id: 'x', quantity: 4000 }), contract({ id: 'y', quantity: 40 }), contract({ id: 'w', quantity: 40, dueTurn: turn + 6 })]
    for (const [line, id] of [[l1!, 'x'], [l2!, 'y']] as const) {
      line.assignedContractId = id
      line.productId = '105mm_field_gun'
      line.tooling = { productId: '105mm_field_gun' as never, designId: null }
      line.status = 'running'
    }
    const big = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 4000 })
    expect(big.displacesIfFirst.map((d) => d.contractId)).toEqual(['w'])
    expect(big.displacesIfFirst[0]!.delayTurns).toBeGreaterThan(0)
    const small = capacityOutlook(s, { productId: '105mm_field_gun', quantity: 1 })
    expect(small.displacesIfFirst).toEqual([])
  })
})
