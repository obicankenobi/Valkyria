import { describe, expect, it } from 'vitest'
import { production } from '../../src/resolve/steps/production.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import { computeUnitCostNow, getProduct } from '../../src/pricing.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Contract, GameState, TurnSubmission, WireEvent } from '../../src/types.js'

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
    lateEventId: null,
    ...overrides,
  }
}

describe('production (isolerat steg, spec avsnitt 5 "Produktion")', () => {
  it('en ledig linje tilldelas ett obemannat kontrakt och ärver dess productId/grade', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ grade: 'B' })
    state.market.contracts = [contract]

    production(makeCtx(state, 'prod-seed').ctx)

    const line = state.house.lines.find((l) => l.assignedContractId === contract.id)
    expect(line).toBeDefined()
    expect(line!.productId).toBe(contract.productId)
    expect(line!.grade).toBe('B')
    expect(line!.status).not.toBe('idle')
  })

  it('bara en linje tilldelas per kontrakt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract()
    state.market.contracts = [contract]

    production(makeCtx(state, 'prod-seed').ctx)

    const assigned = state.house.lines.filter((l) => l.assignedContractId === contract.id)
    expect(assigned).toHaveLength(1)
  })

  it('en löpande linje drar unitCostNow × producerade enheter ur treasury i samma steg', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 1000 }) // gott om kvar att producera
    state.market.contracts = [contract]
    state.house.lines[0]!.assignedContractId = contract.id
    state.house.lines[0]!.productId = contract.productId
    state.house.lines[0]!.grade = contract.grade
    state.house.lines[0]!.status = 'running'
    const before = state.house.treasury

    production(makeCtx(state, 'prod-seed').ctx)

    const product = getProduct(contract.productId)
    const line = state.house.lines[0]!
    const expectedUnits = Math.floor(line.unitsPerTurnAtFull * (line.capacityPct / 100))
    const unitCost = computeUnitCostNow(product, contract.grade, state.market.supplyCostIndex)
    expect(before - state.house.treasury).toBe(unitCost * expectedUnits)
  })

  it('(P5 klart-när) en linje utan kassatäckning blockeras och producerar bara vad kassan räcker till — aldrig gratis', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 1000 })
    state.market.contracts = [contract]
    const line = state.house.lines[0]!
    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.grade = contract.grade
    line.status = 'running'

    const product = getProduct(contract.productId)
    const unitCost = computeUnitCostNow(product, contract.grade, state.market.supplyCostIndex)
    const affordableUnits = 5
    state.house.treasury = unitCost * affordableUnits // räcker till exakt 5 enheter, inte en fullständig omgång

    const before = state.house.treasury
    const { ctx, emitted } = makeCtx(state, 'prod-seed')
    production(ctx)

    expect(line.status).toBe('blocked')
    expect(line.blockedReason).toBe('insufficient cash')
    expect(state.house.treasury).toBe(before - unitCost * affordableUnits) // exakt kostnaden för det som producerades
    expect(state.house.treasury).toBeGreaterThanOrEqual(0) // aldrig negativ av produktion ensam
    const shipment = state.market.shipments.find((s) => s.contractId === contract.id)
    expect(shipment?.units).toBe(affordableUnits) // producerade precis så mycket kassan räckte till, inte 0 och inte fullt
    expect(emitted.some((e) => e.headline.includes('BLOCKED'))).toBe(true)
  })

  it('emittar minst en händelse när treasury faktiskt ändras (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 1000 })
    state.market.contracts = [contract]
    const line = state.house.lines[0]!
    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.status = 'running'

    const { ctx, emitted } = makeCtx(state, 'prod-seed')
    production(ctx)

    expect(emitted.some((e) => e.headline.includes('PRODUCES'))).toBe(true)
  })

  it('skapar en Shipment med arrivalTurn inom [deliveryDelayMinTurns, deliveryDelayMaxTurns] från produktionsturen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 5
    const contract = activeContract({ quantity: 1000 })
    state.market.contracts = [contract]
    const line = state.house.lines[0]!
    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.status = 'running'

    production(makeCtx(state, 'prod-seed').ctx)

    const shipment = state.market.shipments.find((s) => s.contractId === contract.id)
    expect(shipment).toBeDefined()
    expect(shipment!.arrivalTurn).toBeGreaterThanOrEqual(6) // turn + minst 1
    expect(shipment!.arrivalTurn).toBeLessThanOrEqual(8) // turn + högst 3
  })

  it('en linje frigörs (idle, inget kontrakt) när dess kontrakt är fulfilled', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 10, unitsDelivered: 10, status: 'fulfilled' })
    state.market.contracts = [contract]
    const line = state.house.lines[0]!
    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.status = 'running'

    production(makeCtx(state, 'prod-seed').ctx)

    expect(line.assignedContractId).toBeNull()
    expect(line.status).toBe('idle')
  })

  it('(P5 klart-när) bruttomarginalen för samma order skiljer sig mellan grade A/B/C åt det håll spec 4.1 anger: högre i procent för C, lägre i kronor per enhet', () => {
    // "Samma order" = samma referenspris, ett pris satt i linje med varje grades
    // egen prisfaktor (så att alla tre är lika konkurrenskraftiga bud på samma
    // affär) — annars jämförs inte "samma order", bara tre godtyckliga kontrakt.
    const referencePricePerUnit = 20000 // 105mm_field_gun baseCost
    const gradePriceFactor = { A: 1.0, B: 0.86, C: 0.72 }

    const state = createInitialState('indochina-slice', 'seed')
    const product = getProduct('105mm_field_gun')

    const marginByGrade: Record<'A' | 'B' | 'C', { absolute: number; percent: number }> = {} as never
    for (const grade of ['A', 'B', 'C'] as const) {
      const pricePerUnit = referencePricePerUnit * gradePriceFactor[grade]
      const unitCost = computeUnitCostNow(product, grade, state.market.supplyCostIndex)
      const absolute = pricePerUnit - unitCost
      marginByGrade[grade] = { absolute, percent: absolute / pricePerUnit }
    }

    // Marginalen i PROCENT är högre för C än A.
    expect(marginByGrade.C.percent).toBeGreaterThan(marginByGrade.A.percent)
    expect(marginByGrade.B.percent).toBeGreaterThan(marginByGrade.A.percent)
    // Marginalen i KRONOR PER ENHET är lägre för C än A.
    expect(marginByGrade.C.absolute).toBeLessThan(marginByGrade.A.absolute)
  })

  it('(P16 klart-när) en linje producerar exakt product.unitsPerLineTurn enheter per tur, för tre olika produkter', () => {
    // Tre produkter med tydligt olika unitsPerLineTurn (2, 3, 4000) — bevisar att
    // takten faktiskt kommer från PRODUKTEN (avsnitt 4.1), inte längre en platt
    // line.unitsPerTurnAtFull som var lika för alla. capacityPct 100 och gott om
    // kvar att producera/kassa, så inget annat än unitsPerLineTurn kan begränsa.
    for (const productId of ['mk9_longhand_shell', 'ch3_transport_helicopter', 'm1_rifle'] as const) {
      const state = createInitialState('indochina-slice', 'units-per-line-turn-seed')
      const product = getProduct(productId)
      const contract = activeContract({
        id: `contract-${productId}`,
        productId,
        quantity: product.unitsPerLineTurn * 10, // gott om kvar, oavsett produkt
        grade: 'A',
      })
      state.market.contracts = [contract]
      const line = state.house.lines[0]!
      line.assignedContractId = contract.id
      line.productId = contract.productId
      line.grade = contract.grade
      line.status = 'running'
      line.capacityPct = 100
      // lineEfficiency = line.unitsPerTurnAtFull / house.unitsPerLineTurnDefault ska
      // vara 1,0 för scenariots default-linjer — premissen testet vilar på.
      expect(line.unitsPerTurnAtFull).toBe(state.house.unitsPerLineTurnDefault)

      production(makeCtx(state, 'prod-seed').ctx)

      const shipment = state.market.shipments.find((s) => s.contractId === contract.id)
      expect(shipment?.units).toBe(product.unitsPerLineTurn)
    }
  })

  describe('P27: linjeomställning kostar (avsnitt 3.2)', () => {
    it('(P27 klart-når) en linje som byter productId producerar INGET under omställningsturen, och återupptas exakt en tur senare', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.meta.turn = 3
      const line = state.house.lines[0]!
      // Linjen är redan igång mot ett kontrakt (105mm_field_gun) som blir
      // fulfilled DEN HÄR turen — frigörs i steg 1, tilldelas sedan i steg 2 ett
      // NYTT kontrakt för en ANNAN produkt (ch3_transport_helicopter).
      const oldContract = activeContract({ id: 'old', productId: '105mm_field_gun', quantity: 10, unitsDelivered: 10, status: 'fulfilled' })
      const newContract = activeContract({ id: 'new', productId: 'ch3_transport_helicopter', quantity: 1000 })
      state.market.contracts = [oldContract, newContract]
      line.assignedContractId = oldContract.id
      line.productId = oldContract.productId
      line.status = 'running'

      const { ctx, emitted } = makeCtx(state, 'retool-seed')
      production(ctx)

      expect(line.assignedContractId).toBe(newContract.id) // tog det enda tillgängliga kontraktet
      expect(line.productId).toBe('ch3_transport_helicopter')
      expect(line.status).toBe('retooling')
      expect(line.retoolingUntilTurn).toBe(3 + 1) // retoolingTurns (balance.json) = 1
      expect(state.market.shipments.find((s) => s.contractId === newContract.id)).toBeUndefined() // inget producerat
      expect(emitted.some((e) => e.headline.includes('RETOOLS'))).toBe(true)

      // Nästa tur: omställningen är klar, linjen producerar normalt.
      state.meta.turn = 4
      production(makeCtx(state, 'retool-seed-2').ctx)

      expect(line.status).toBe('running')
      expect(line.retoolingUntilTurn).toBeNull()
      expect(state.market.shipments.find((s) => s.contractId === newContract.id)).toBeDefined()
    })

    it('en helt ny/tidigare tom linje som får sitt FÖRSTA kontrakt ställer INTE om — den startar bara', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const contract = activeContract({ quantity: 1000 })
      state.market.contracts = [contract]
      // Alla fyra default-linjer har productId: null från start (createInitialState) — se state.ts.
      expect(state.house.lines[0]!.productId).toBeNull()

      production(makeCtx(state, 'prod-seed').ctx)

      const line = state.house.lines.find((l) => l.assignedContractId === contract.id)!
      expect(line.status).toBe('running') // inte 'retooling'
      expect(line.retoolingUntilTurn).toBeNull()
      expect(state.market.shipments.find((s) => s.contractId === contract.id)).toBeDefined() // producerar direkt
    })

    it('en linje som byter till SAMMA productId (två separata kontrakt för samma produkt) ställer inte om', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.meta.turn = 0
      const line = state.house.lines[0]!
      const oldContract = activeContract({ id: 'old', productId: '105mm_field_gun', quantity: 10, unitsDelivered: 10, status: 'fulfilled' })
      const newContract = activeContract({ id: 'new', productId: '105mm_field_gun', quantity: 1000 }) // SAMMA produkt
      state.market.contracts = [oldContract, newContract]
      line.assignedContractId = oldContract.id
      line.productId = oldContract.productId
      line.status = 'running'

      production(makeCtx(state, 'retool-same-seed').ctx)

      expect(line.assignedContractId).toBe(newContract.id)
      expect(line.status).toBe('running') // ingen omställning — samma produkt
      expect(state.market.shipments.find((s) => s.contractId === newContract.id)).toBeDefined()
    })
  })
})
