import { describe, expect, it } from 'vitest'
import { runGame } from '../src/runGame.js'
import { aggressive, balanced, passive, POLICIES } from '../src/policies.js'

const ENDING_CODES = new Set(['INSOLVENCY', 'BUYOUT', 'EXPOSURE', 'NUCLEAR_EXCHANGE', 'SCENARIO_COMPLETE', 'ACTIVE'])

describe('runGame (packages/harness)', () => {
  for (const [name, policy] of Object.entries(POLICIES)) {
    it(`kör ett fullständigt parti med "${name}" och ger en giltig ending-kod`, () => {
      const metrics = runGame('indochina-slice', `runGame-test-${name}`, name, policy)

      expect(ENDING_CODES.has(metrics.ending)).toBe(true)
      expect(metrics.policy).toBe(name)
      expect(metrics.finalTurn).toBeGreaterThanOrEqual(0)
      expect(metrics.finalTurn).toBeLessThanOrEqual(20)
      expect(metrics.contracts).toBeGreaterThanOrEqual(0)
    })
  }

  it('är deterministiskt: samma scenario/seed/policy ger bitvis identisk metrik (CLAUDE.md hård regel 3)', () => {
    const a = runGame('indochina-slice', 'determinism-seed', 'balanced', balanced)
    const b = runGame('indochina-slice', 'determinism-seed', 'balanced', balanced)

    expect(a).toEqual(b)
  })

  it('marketSharePct ligger inom [0, 100]', () => {
    for (let i = 0; i < 5; i++) {
      const metrics = runGame('indochina-slice', `market-share-seed-${i}`, 'aggressive', aggressive)
      expect(metrics.marketSharePct).toBeGreaterThanOrEqual(0)
      expect(metrics.marketSharePct).toBeLessThanOrEqual(100)
    }
  })

  it('heatOver40SharePct ligger inom [0, 100]', () => {
    for (let i = 0; i < 5; i++) {
      const metrics = runGame('indochina-slice', `heat-share-seed-${i}`, 'passive', passive)
      expect(metrics.heatOver40SharePct).toBeGreaterThanOrEqual(0)
      expect(metrics.heatOver40SharePct).toBeLessThanOrEqual(100)
    }
  })

  it('grossMarginPct är 0 (inte NaN) när inget någonsin levererats', () => {
    // passive tackar nej till restricted och kräver >20 % marginal i winBand — ett
    // parti kan sluta helt utan intäkt om inget bud någonsin röjer den tröskeln.
    // Testar bara att formeln inte delar med noll, inte att det FAKTISKT inträffar.
    for (let i = 0; i < 20; i++) {
      const metrics = runGame('indochina-slice', `no-nan-seed-${i}`, 'passive', passive)
      expect(Number.isNaN(metrics.grossMarginPct)).toBe(false)
      expect(Number.isFinite(metrics.grossMarginPct)).toBe(true)
    }
  })
})
