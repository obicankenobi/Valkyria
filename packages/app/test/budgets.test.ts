// budgets.test.ts — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5): "Geografidata under
// 300 kB." De delar av prestandabudgeten som är filstorlekar går att binda i ett
// test; bildtakten och inläsningstiden är tidsmått och mäts i scripts/perf.mjs.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const GEO_DIR = join(import.meta.dirname, '../public/geo')

describe('geografidata (§12 punkt 5: under 300 kB)', () => {
  const files = readdirSync(GEO_DIR).filter((name) => name.endsWith('.json'))

  it('det finns geodata att mäta', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('varje geodatafil är under 300 kB, och alla tillsammans också', () => {
    let total = 0
    for (const name of files) {
      const size = statSync(join(GEO_DIR, name)).size
      expect(size, name).toBeLessThan(300 * 1024)
      total += size
    }
    expect(total).toBeLessThan(300 * 1024)
  })
})
