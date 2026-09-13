import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../src/state.js'
import type { GameState, Money } from '../../src/types.js'

// Invariant: inget Money-fält har decimaler. Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.4 och
// CLAUDE.md hård regel 8. Fälten listas explicit efter typen i types.ts, inte via en
// blind genomvandring av alla tal i state — en Pct- eller ränta-fält får gärna ha
// decimaler, bara Money får inte det.
//
// P1 kontrollerar bara initialstate (ingen resolveTurn finns än). Testet utökas till
// att köra 20 turer när en riktig pipeline kan mutera pengar (från P3/P5) — se
// spec avsnitt 7.4: "efter 20 turer har inget Money-fält i state decimaler".
function collectMoneyFields(state: GameState): Money[] {
  const fields: Money[] = [state.house.treasury, state.house.debt, state.house.creditLimit, ...state.house.revenueByTurn]

  for (const faction of Object.values(state.factions)) {
    fields.push(faction.treasury, faction.militaryBudget)
  }
  for (const rival of Object.values(state.rivals)) {
    fields.push(rival.capital)
  }
  for (const order of state.market.openOrders) {
    fields.push(order.statedBudget, order.trueBudget, order.referencePrice)
  }
  for (const contract of state.market.contracts) {
    fields.push(contract.price, contract.unitCostAtSigning)
  }

  return fields
}

describe('penninginvariant', () => {
  it('inget Money-fält i initialstate har decimaler', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const fields = collectMoneyFields(state)

    // Om listan är tom testar vi ingenting — ett tecken på att schemat glidit och
    // funktionen ovan inte längre hittar fälten den ska.
    expect(fields.length).toBeGreaterThan(0)

    for (const value of fields) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})
