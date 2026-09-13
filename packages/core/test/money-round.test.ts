import { describe, expect, it } from 'vitest'
import { round } from '../src/money.js'

// Direkt test av round() själv. Den bredare invarianten — att inget Money-fält i
// state har decimaler — testas i test/invariants/money.test.ts per spec avsnitt 7.4.
describe('round', () => {
  it('avrundar till närmaste heltal', () => {
    expect(round(2.4)).toBe(2)
    expect(round(2.6)).toBe(3)
    expect(round(2.5)).toBe(3)
  })

  it('lämnar heltal oförändrade', () => {
    expect(round(1000)).toBe(1000)
    expect(round(0)).toBe(0)
  })

  it('hanterar negativa belopp', () => {
    expect(round(-2.4)).toBe(-2)
    expect(round(-2.6)).toBe(-3)
  })
})
