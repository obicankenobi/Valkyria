// orderSizes.test.ts — P185 regel 3 (ETAPP11_FORSLAG.md §9b, beslut 11R): orderstorlekar som fyller en linje. Ett typiskt kontrakt tar en produktionslinje i två till fyra kvartal; ett kontrakt som en linje
// gör på ett kvartal gör kapaciteten ointressant. Den scriptade Mk-9-granaten (restricted, bara scriptade ordrar) ingår inte.
import { describe, expect, it } from 'vitest'
import { allProducts } from '../src/pricing.js'

const ordinary = allProducts().filter((p) => !p.restricted)

describe('orderstorlekar mot linjernas takt (11R)', () => {
  it('det finns ordinarie produkter att pröva', () => {
    expect(ordinary.length).toBeGreaterThanOrEqual(6)
  })

  it.each(ordinary.map((p) => [p.id, p] as const))('%s: minsta order är minst två och största högst fyra linjekvartal', (_id, p) => {
    expect(p.orderQuantityMin).toBeDefined()
    expect(p.orderQuantityMax).toBeDefined()
    expect(p.orderQuantityMin! / p.unitsPerLineTurn).toBeGreaterThanOrEqual(2)
    expect(p.orderQuantityMax! / p.unitsPerLineTurn).toBeLessThanOrEqual(4)
  })

  it.each(ordinary.map((p) => [p.id, p] as const))('%s: ett typiskt kontrakt (mitten av intervallet) tar en linje 2–4 kvartal', (_id, p) => {
    const typical = (p.orderQuantityMin! + p.orderQuantityMax!) / 2
    const quarters = typical / p.unitsPerLineTurn
    expect(quarters).toBeGreaterThanOrEqual(2)
    expect(quarters).toBeLessThanOrEqual(4)
  })
})
