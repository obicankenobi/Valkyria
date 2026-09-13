import { describe, expect, it } from 'vitest'
import { deliveries } from '../../src/resolve/steps/deliveries.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Contract, GameState, Shipment, TurnSubmission, WireEvent } from '../../src/types.js'

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

function activeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    ...overrides,
  }
}

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return { id: 'shipment-test-0', contractId: 'contract-test-0', units: 20, arrivalTurn: 0, ...overrides }
}

describe('deliveries (isolerat steg, spec avsnitt 5 "Leverans")', () => {
  it('en skeppning som inte anlänt än rörs inte', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.contracts = [activeContract()]
    state.market.shipments = [shipment({ arrivalTurn: 5 })]
    state.meta.turn = 2

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(state.market.shipments).toHaveLength(1)
    expect(state.market.contracts[0]!.unitsDelivered).toBe(0)
  })

  it('en anländ skeppning ökar unitsDelivered och bokför betalning proportionellt i revenueByTurn', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 100, price: 2000000 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 3 })]
    state.meta.turn = 3
    const treasuryBefore = state.house.treasury

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(20)
    const expectedRevenue = Math.round(2000000 * (20 / 100))
    expect(state.house.treasury).toBe(treasuryBefore + expectedRevenue)
    expect(state.house.revenueByTurn[3]).toBe(expectedRevenue)
    expect(state.market.shipments).toHaveLength(0)
  })

  it('flera skeppningar till samma kontrakt samma tur summeras i revenueByTurn', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 100, price: 1000000 })
    state.market.contracts = [contract]
    state.market.shipments = [
      shipment({ id: 's1', units: 10, arrivalTurn: 2 }),
      shipment({ id: 's2', units: 15, arrivalTurn: 2 }),
    ]
    state.meta.turn = 2

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(25)
    const expected = Math.round(1000000 * (10 / 100)) + Math.round(1000000 * (15 / 100))
    expect(state.house.revenueByTurn[2]).toBe(expected)
  })

  it('kontraktet blir fulfilled när unitsDelivered når quantity', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 20, unitsDelivered: 0 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 1 })]
    state.meta.turn = 1

    const { ctx, emitted } = makeCtx(state, 'del-seed')
    deliveries(ctx)

    expect(contract.status).toBe('fulfilled')
    expect(emitted.some((e) => e.headline.includes('FULFILLED'))).toBe(true)
  })

  it('ett kontrakt som passerar dueTurn utan att vara klart sätts late och reliability faller — en gång, inte varje tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ dueTurn: 5, quantity: 100, unitsDelivered: 10 })
    state.market.contracts = [contract]
    state.meta.turn = 6 // > dueTurn
    const reliabilityBefore = state.house.reputation.reliability

    deliveries(makeCtx(state, 'del-seed').ctx)
    expect(contract.status).toBe('late')
    expect(state.house.reputation.reliability).toBeLessThan(reliabilityBefore)
    const afterFirst = state.house.reputation.reliability

    state.meta.turn = 7
    deliveries(makeCtx(state, 'del-seed-2').ctx)
    expect(state.house.reputation.reliability).toBe(afterFirst) // ingen ny smäll
  })

  it('en restricted-leverans anropar doomsdayGate med produktens doomsdayOnDelivery-intervall, kedjad via causeId till leveranshändelsen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ productId: 'mk9_longhand_shell', quantity: 8, price: 7200000 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 8, arrivalTurn: 4 })]
    state.meta.turn = 4
    const doomsdayBefore = state.doomsday

    const { ctx, emitted } = makeCtx(state, 'del-seed')
    deliveries(ctx)

    expect(state.doomsday).toBeGreaterThan(doomsdayBefore)
    expect(state.doomsday - doomsdayBefore).toBeGreaterThanOrEqual(14) // mk9_longhand_shell: [14,25]
    expect(state.doomsday - doomsdayBefore).toBeLessThanOrEqual(25)

    const deliveryIndex = emitted.findIndex((e) => e.headline.includes('DELIVERED'))
    const doomsdayEvent = emitted.find((e) => e.headline.includes('DOOMSDAY'))
    expect(deliveryIndex).toBeGreaterThanOrEqual(0)
    expect(doomsdayEvent).toBeDefined()
    // makeCtx:s emit-mock ger id:n som "test-${ordningsnummer}" — deliveryId är alltså
    // exakt "test-${deliveryIndex}", vilket är precis det doomsdayEvent.causeId ska
    // vara satt till (deliveries.ts skickar emit()-returvärdet vidare till addDoomsday).
    expect(doomsdayEvent!.causeId).toBe(`test-${deliveryIndex}`)
  })

  it('en icke-restricted leverans rör aldrig doomsday', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ productId: '105mm_field_gun' })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 2 })]
    state.meta.turn = 2
    const before = state.doomsday

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(state.doomsday).toBe(before)
  })

  it('rör inte ett voided eller redan fulfilled kontrakts skeppningar', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ status: 'voided', unitsDelivered: 5 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 10, arrivalTurn: 1 })]
    state.meta.turn = 1

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(5) // orört
    expect(state.market.shipments).toHaveLength(0) // skeppningen konsumeras ändå (inget mer att göra med den)
  })
})
