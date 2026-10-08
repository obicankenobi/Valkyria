// balanceClasses.test.ts — P147 (ETAPP10_FORSLAG.md §5 punkt 5, §12 måltabell 10A). Varje balanstal är sorterat: fastställt (rör och är avvägt), öppet (rör, inte avvägt) eller okänsligt
// (rör inte mätbart, fryses). Målet i 10A är färre än 30 öppna tal. Ett nytt tal som ingen sorterat fäller testet — "skriv hellre en assertion än en ny regel".
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import classes from './fixtures/balanceClasses.json'

const KEYS = Object.keys(balance).filter((k) => !k.startsWith('_') && ['number', 'object'].includes(typeof (balance as Record<string, unknown>)[k]))

describe('balanstalen sorterade (P147)', () => {
  it('varje tal finns i precis en grupp, och inga okända tal står i grupperna', () => {
    const groups = { established: classes.established, open: classes.open, insensitive: classes.insensitive } as Record<string, string[]>
    const seen = new Map<string, string>()
    for (const [group, list] of Object.entries(groups)) {
      for (const key of list) {
        expect(seen.has(key), `${key} står i både ${seen.get(key)} och ${group}`).toBe(false)
        seen.set(key, group)
      }
    }
    const missing = KEYS.filter((k) => !seen.has(k))
    expect(missing, `osorterade balanstal: ${missing.join(', ')}`).toEqual([])
    const unknown = [...seen.keys()].filter((k) => !KEYS.includes(k))
    expect(unknown, `sorterade tal som inte finns: ${unknown.join(', ')}`).toEqual([])
  })

  it('färre än 30 öppna tal (10A:s fetstilta mål)', () => {
    expect(classes.open.length).toBeLessThan(30)
  })

  it('de tal som rör mest är fastställda eller öppna, aldrig okänsliga', () => {
    for (const key of ['blocTechLevelStep', 'militaryBudgetQuarterlyShare', 'orderTriggerThreshold', 'fixedCosts']) {
      expect(classes.insensitive, key).not.toContain(key)
    }
  })
})
