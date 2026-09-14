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

  it('(P31, avsnitt 6.2) de fem nya kolumnerna är välformade tal inom rimliga gränser', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      const metrics = runGame('indochina-slice', `p31-columns-seed-${name}`, name, policy)
      expect(metrics.rivalContractsWon).toBeGreaterThanOrEqual(0)
      expect(metrics.rivalAttributionShare).toBeGreaterThanOrEqual(0)
      expect(metrics.rivalAttributionShare).toBeLessThanOrEqual(100)
      expect(metrics.voidedContracts).toBeGreaterThanOrEqual(0)
      expect(metrics.retoolingTurns).toBeGreaterThanOrEqual(0)
      expect(metrics.stationsBurned).toBeGreaterThanOrEqual(0)
    }
  })

  it('(P31, avsnitt 6.2) rivalContractsWon och rivalAttributionShare rör sig över noll över flera partier', () => {
    // Inte bara att formeln inte kastar — att rivalerna faktiskt VINNER och
    // LEVERERAR i ett stickprov, samma sorts "faktiskt uppmätt, inte antaget"
    // som P26/P27:s härnessklart-när-rader (se ANDRINGSLOGG.md).
    let anyContractsWon = false
    let anyAttributionShare = false
    for (let i = 0; i < 30; i++) {
      const metrics = runGame('indochina-slice', `p31-exercised-seed-${i}`, 'balanced', balanced)
      if (metrics.rivalContractsWon > 0) anyContractsWon = true
      if (metrics.rivalAttributionShare > 0) anyAttributionShare = true
    }
    expect(anyContractsWon).toBe(true)
    expect(anyAttributionShare).toBe(true)
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
