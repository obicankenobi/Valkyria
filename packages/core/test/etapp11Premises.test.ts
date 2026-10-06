// etapp11Premises.test.ts — P168 (ETAPP11_FORSLAG.md §0): premisserna som etapp 11 bygger på, bundna till koden. Skrevs när omkontrollen 2026-10-07
// visade att tre radhänvisningar i specen hade glidit (economy.ts → balance.json:s fixedCosts). Ett test som fäller i P169 när linjerna får en typ
// är meningen: då ska §0 skrivas om i samma commit.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import products from '../src/data/products.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'

const B = balance as unknown as {
  buildLineCost: number
  maxProductionLines: number
  fixedCosts: { lineUpkeep: number; payrollPerExtraLine: number }
}

describe('etapp 11, §0 — premisserna stämmer med koden', () => {
  it('0.1 huset börjar med fyra identiska linjer utan typ, plats eller nivå', () => {
    const lines = createInitialState('indochina-slice', 'p168').house.lines
    expect(lines).toHaveLength(4)
    const [first, ...rest] = lines
    for (const l of rest) expect({ ...l, id: '' }).toEqual({ ...first, id: '' })
    expect(Object.keys(first!).sort()).toEqual(
      ['assignedContractId', 'blockedReason', 'capacityPct', 'grade', 'id', 'productId', 'retoolingUntilTurn', 'status', 'unitsPerTurnAtFull'],
    )
  })

  it('0.2 BUILD_LINE kostar £1 200 000 och taket är nio linjer', () => {
    expect(B.buildLineCost).toBe(1_200_000)
    expect(B.maxProductionLines).toBe(9)
  })

  it('0.7 det finns sju produkter', () => {
    expect(products).toHaveLength(7)
  })

  it('0.9 personalen är tre tal', () => {
    const staff = createInitialState('indochina-slice', 'p168').house.staff
    expect(Object.keys(staff)).toHaveLength(3)
    expect(Object.values(staff)).toEqual([45, 45, 45])
  })

  it('0.12 fasta kostnader: £18 000 per linje och tur, £45 000 i lön per linje utöver de fyra första', () => {
    expect(B.fixedCosts.lineUpkeep).toBe(18_000)
    expect(B.fixedCosts.payrollPerExtraLine).toBe(45_000)
  })
})
