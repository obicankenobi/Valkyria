import { describe, expect, it } from 'vitest'
import { bidEstimate } from '../src/queries.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { createInitialState } from '../src/state.js'
import { createRng } from '../src/rng.js'
import type { GameState, Order, RivalHouse, Station, TurnSubmission } from '../src/types.js'

function orderFor(state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    inspectorIntegrity: 50,
  }
}

function withStationDepth(state: GameState, depth: Station['depth']): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  clone.house.stations = [{ id: 'station-1', city: 'SAIGON', nation: 'rvn', depth, exposure: 0, coverage: ['procurement'], status: 'active' }]
  clone.house.staff.chiefSalesman = 50 // under 75, ingen bonus — isolerar depth-effekten
  return clone
}

describe('bidEstimate (spec avsnitt 4.3)', () => {
  it('(a) intervallbredden krymper monotont med effectiveDepth 0 → 5', () => {
    const base = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(base)

    const widths = ([0, 1, 2, 3, 4, 5] as const).map((depth) => {
      const state = withStationDepth(base, depth)
      const est = bidEstimate(state, order, 'A')
      return est.rivalPriceHigh - est.rivalPriceLow
    })

    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThan(widths[i - 1]!)
    }
    expect(widths[5]).toBe(0) // depth 5: exakt siffra
  })

  it('lowestRivalHouse är null under depth 4, satt vid depth >= 4', () => {
    const base = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(base)

    for (const depth of [0, 1, 2, 3] as const) {
      const est = bidEstimate(withStationDepth(base, depth), order, 'A')
      expect(est.lowestRivalHouse).toBeNull()
    }
    for (const depth of [4, 5] as const) {
      const est = bidEstimate(withStationDepth(base, depth), order, 'A')
      expect(est.lowestRivalHouse).not.toBeNull()
      expect(Object.keys(base.rivals)).toContain(est.lowestRivalHouse)
    }
  })

  it('(b) bidEstimate och winBand är bitvis identiska vid 100 upprepade anrop inom samma tur, huvud-Rng:ns cursor rör sig aldrig', () => {
    const state = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(state)
    const cursorBefore = state.meta.rngCursor

    const first = bidEstimate(state, order, 'A')
    for (let i = 0; i < 100; i++) {
      const repeat = bidEstimate(state, order, 'A')
      expect(repeat).toEqual(first)
    }

    expect(state.meta.rngCursor).toBe(cursorBefore)
  })

  it('olika grade ger olika (eller åtminstone inte nödvändigtvis samma) yourUnitCost, men stabilt per grade', () => {
    const state = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(state)

    const gradeA = bidEstimate(state, order, 'A')
    const gradeC = bidEstimate(state, order, 'C')
    expect(gradeC.yourUnitCost).toBeLessThan(gradeA.yourUnitCost) // C är billigare att bygga

    expect(bidEstimate(state, order, 'C')).toEqual(gradeC)
  })

  it('winBand har mellan tre och fem punkter och priserna ligger inom [rivalPriceLow, rivalPriceHigh]', () => {
    const state = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(state)
    const est = bidEstimate(state, order, 'A')

    expect(est.winBand.length).toBeGreaterThanOrEqual(3)
    expect(est.winBand.length).toBeLessThanOrEqual(5)
    for (const point of est.winBand) {
      expect(point.price).toBeGreaterThanOrEqual(est.rivalPriceLow)
      expect(point.price).toBeLessThanOrEqual(est.rivalPriceHigh)
      expect(point.confidence).toBeGreaterThanOrEqual(0)
      expect(point.confidence).toBeLessThanOrEqual(100)
    }
  })

  it('winBand-konfidensen avtar (eller står still) med stigande pris — lägre pris ska aldrig vinna mer sällan än ett högre', () => {
    const state = createInitialState('indochina-slice', 'query-seed')
    const order = orderFor(state)
    const est = bidEstimate(state, order, 'A')

    for (let i = 1; i < est.winBand.length; i++) {
      expect(est.winBand[i]!.confidence).toBeLessThanOrEqual(est.winBand[i - 1]!.confidence)
    }
  })

  it('två olika ordrar (olika seed-input via orderId) ger olika hash-strömmar, inte identiska skattningar', () => {
    const state = createInitialState('indochina-slice', 'query-seed')
    const orderA = orderFor(state)
    const orderB = { ...orderFor(state), id: 'order-test-1' }

    const estA = bidEstimate(state, orderA, 'A')
    const estB = bidEstimate(state, orderB, 'A')

    expect(estA).not.toEqual(estB)
  })
})

// P24 klart när (ETAPP2_TEKNISK_SPEC.md avsnitt 2.2/9): "ett test visar att
// bidEstimate's winBand och bidding.ts's avgörande fortfarande använder
// identiska termer för en rival." bidEstimate hash-seedar sin egen Rng-ström
// (aldrig huvud-Rng:n, se filens huvudkommentar) medan bidding.ts drar ur
// huvud-Rng:n — de två strömmarna ger ALDRIG bitvis identiska bud, så det
// ärliga sättet att bevisa "identiska termer" är att visa att BÅDA
// mekanismerna svarar i SAMMA RIKTNING på samma ändring av rivalens egna
// relations/reputation/homeState (rival.relations[buyerId], rival.reputation,
// rivalBlocTerm) — om den ena läste gamla, statiska nollor och den andra
// läste de nya fälten hade de divergerat i stället.
describe('rivalscoring — bidEstimate och bidding.ts använder identiska rivaltermer (P24)', () => {
  function strongRival(): RivalHouse {
    return {
      id: 'brandt',
      name: 'Brandt',
      specialisation: 'infantry',
      aggression: 55,
      temperament: 'opportunist',
      capital: 9999999,
      marketShare: 30,
      sabotagedUntilTurn: null,
      homeState: 'west', // rvn har alignment +70 — matchad, ger POSITIV blocTerm
      relations: { rvn: 100 },
      reputation: { quality: 100, reliability: 100 },
      contracts: [],
      supplyPlayCooldownUntilTurn: null,
    }
  }

  function weakRival(): RivalHouse {
    return {
      id: 'brandt',
      name: 'Brandt',
      specialisation: 'infantry',
      aggression: 55,
      temperament: 'opportunist',
      capital: 9999999,
      marketShare: 30,
      sabotagedUntilTurn: null,
      homeState: 'east', // omatchad mot rvn (+70) — ger NEGATIV blocTerm
      relations: { rvn: 0 },
      reputation: { quality: 0, reliability: 0 },
      contracts: [],
      supplyPlayCooldownUntilTurn: null,
    }
  }

  it('en förstärkt rival (hög relation/rykte, blockmatchad) sänker BÅDE bidEstimates mittpunktskonfidens OCH spelarens faktiska vinstfrekvens i bidding.ts, jämfört med en försvagad rival', () => {
    const base = createInitialState('indochina-slice', 'query-seed')
    base.house.stations = [{ id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 0, exposure: 0, coverage: ['procurement'], status: 'active' }]
    base.house.staff.chiefSalesman = 50 // under 75 — inget depth-bonus, bredaste bandet (pct 0,35)
    const order = { ...orderFor(base), competingRivals: ['brandt'] }

    function midpointConfidence(rival: RivalHouse): number {
      const state: GameState = { ...base, rivals: { brandt: rival } }
      const est = bidEstimate(state, order, 'A')
      const mid = est.winBand[Math.floor(est.winBand.length / 2)]!
      return mid.confidence
    }

    const strongConfidence = midpointConfidence(strongRival())
    const weakConfidence = midpointConfidence(weakRival())
    expect(strongConfidence).toBeLessThan(weakConfidence)

    function actualWinRate(rival: RivalHouse): number {
      const SEEDS = 150
      let wins = 0
      for (let i = 0; i < SEEDS; i++) {
        const state = createInitialState('indochina-slice', `consistency-${i}`)
        state.rivals = { brandt: rival }
        const testOrder: Order = { ...orderFor(state), competingRivals: ['brandt'], expiresTurn: 0 }
        state.market.openOrders = [testOrder]
        state.meta.turn = 0

        const submission: TurnSubmission = {
          standingOrders: [],
          bids: [{ orderId: testOrder.id, price: testOrder.referencePrice, deliveryTurns: testOrder.requiredDeliveryTurns, grade: 'A', bribe: 0 }],
          actions: [],
        }
        const emitted: { headline: string }[] = []
        let seq = 0
        bidding({
          draft: state,
          submission,
          rng: createRng(`consistency-${i}`, 0),
          emit: (e) => {
            emitted.push(e)
            return `t-${seq++}`
          },
          rejected: [],
        })

        if (state.market.contracts.length > 0) wins++
      }
      return wins / SEEDS
    }

    const strongWinRate = actualWinRate(strongRival())
    const weakWinRate = actualWinRate(weakRival())
    expect(strongWinRate).toBeLessThan(weakWinRate)
  })
})
