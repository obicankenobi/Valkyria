// summary.test.ts — slutfördelningen per bot (RAPPORT3 §4).
import { describe, expect, it } from 'vitest'
import { formatSummary, summarise } from '../src/summary.js'
import type { GameMetrics } from '../src/runGame.js'

function row(policy: string, ending: string, finalTurn: number, contracts: number): GameMetrics {
  return { policy, ending, finalTurn, contracts } as GameMetrics
}

describe('summarise', () => {
  const rows = [
    row('a', 'SCENARIO_COMPLETE', 20, 30),
    row('a', 'BUYOUT', 10, 2),
    row('a', 'BUYOUT', 10, 3),
    row('a', 'INSOLVENCY', 12, 4),
    row('b', 'SCENARIO_COMPLETE', 20, 10),
  ]

  it('räknar vinster (SCENARIO_COMPLETE), procent, utgångar och medianer per policy', () => {
    const [a, b] = summarise(rows)
    expect(a).toMatchObject({ policy: 'a', games: 4, wins: 1, winPct: 25, medianFinalTurn: 11, medianContracts: 3.5 })
    expect(a!.endings).toEqual({ SCENARIO_COMPLETE: 1, BUYOUT: 2, INSOLVENCY: 1 })
    expect(b).toMatchObject({ policy: 'b', games: 1, wins: 1, winPct: 100 })
  })

  it('en policy utan en enda vinst visar 0 %, inte NaN', () => {
    expect(summarise([row('x', 'BUYOUT', 10, 2)])[0]!.winPct).toBe(0)
  })

  it('formatSummary ger en rad per policy med vinstprocent och utgångar', () => {
    const text = formatSummary(rows)
    expect(text.split('\n')).toHaveLength(3)
    expect(text).toContain('BUYOUT 2')
    expect(text).toContain('25.0')
  })
})
