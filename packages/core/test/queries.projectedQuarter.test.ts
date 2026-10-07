// queries.projectedQuarter.test.ts — P85 (ETAPP7_TEKNISK_SPEC.md §13,
// P81-14/15): "en prognos för nästa kvartal ur accepterade kontrakt och
// fasta kostnader". Verifierar att projectedQuarter läser EXAKT samma
// formler som economy.ts (computeFixedCostsBreakdown/computeQuarterlyInterest)
// och deliveries.ts (betalning proportionell mot levererad andel) — inte en
// egen, handkopierad approximation.
import { describe, expect, it } from 'vitest'
import { createInitialState, projectedQuarter } from '../src/index.js'
import { computeFixedCostsBreakdown, computeQuarterlyInterest } from '../src/resolve/steps/economy.js'
import { round } from '../src/money.js'

describe('projectedQuarter (P85)', () => {
  it('fixedCosts/interest matchar ordagrant economy.ts:s egna formler', () => {
    const state = createInitialState('indochina-slice', 'projected-baseline-seed')
    const result = projectedQuarter(state)

    expect(result.fixedCosts).toEqual(computeFixedCostsBreakdown(state.house))
    expect(result.interest).toBe(computeQuarterlyInterest(state.house))
  })

  it('expectedRevenueNextTurn räknar bara skeppningar som anländer EXAKT nästa tur, proportionellt mot kontraktets pris', () => {
    const state = createInitialState('indochina-slice', 'projected-revenue-seed')
    const buyerId = Object.keys(state.factions)[0]!
    state.market.contracts = [
      {
        id: 'contract-next-turn',
        buyerId,
        productId: 'm1_rifle',
        quantity: 1000,
        unitsDelivered: 0,
        price: 500_000,
        unitCostAtSigning: 290,
        grade: 'A',
        dueTurn: state.meta.turn + 5,
        status: 'active',
        lateEventId: null,
        frontId: null, advancePct: 0, advancePaid: 0,
      },
      {
        id: 'contract-later',
        buyerId,
        productId: 'm1_rifle',
        quantity: 1000,
        unitsDelivered: 0,
        price: 900_000,
        unitCostAtSigning: 290,
        grade: 'A',
        dueTurn: state.meta.turn + 5,
        status: 'active',
        lateEventId: null,
        frontId: null, advancePct: 0, advancePaid: 0,
      },
    ]
    state.market.shipments = [
      // Anländer nästa tur — ska räknas.
      { id: 'ship-a', contractId: 'contract-next-turn', units: 250, arrivalTurn: state.meta.turn + 1 },
      // Anländer turen DÄREFTER — ska INTE räknas (bara "nästa kvartal").
      { id: 'ship-b', contractId: 'contract-later', units: 400, arrivalTurn: state.meta.turn + 2 },
    ]

    const result = projectedQuarter(state)
    const expected = round(500_000 * (250 / 1000))
    expect(result.expectedRevenueNextTurn).toBe(expected)
  })

  it('netChange = expectedRevenueNextTurn − (summan av fixedCosts) − interest', () => {
    const state = createInitialState('indochina-slice', 'projected-net-seed')
    const result = projectedQuarter(state)
    const totalFixed = result.fixedCosts.payroll + result.fixedCosts.lineUpkeep + result.fixedCosts.stationUpkeep + result.fixedCosts.rndOverhead + result.fixedCosts.facilityUpkeep + result.fixedCosts.wages
    expect(result.netChange).toBe(result.expectedRevenueNextTurn - totalFixed - result.interest)
  })
})
