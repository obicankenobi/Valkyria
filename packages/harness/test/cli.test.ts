import { readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { main, parseArgs } from '../src/cli.js'

describe('parseArgs (packages/harness)', () => {
  it('ger rimliga standardvärden utan några argument', () => {
    const args = parseArgs([])
    expect(args.scenario).toBe('indochina-slice')
    expect(args.runs).toBe(100)
    expect(args.policyNames.sort()).toEqual(['aggressive', 'balanced', 'capacity', 'passive'])
    expect(args.outPath).toBe('harness-results.csv')
  })

  it('läser --scenario, --runs, --policy, --out', () => {
    const args = parseArgs(['--scenario', 'x', '--runs', '7', '--policy', 'passive,aggressive', '--out', 'foo.csv'])
    expect(args.scenario).toBe('x')
    expect(args.runs).toBe(7)
    expect(args.policyNames).toEqual(['passive', 'aggressive'])
    expect(args.outPath).toBe('foo.csv')
  })

  it('kastar på ett icke-positivt --runs', () => {
    expect(() => parseArgs(['--runs', '0'])).toThrow()
    expect(() => parseArgs(['--runs', '-3'])).toThrow()
    expect(() => parseArgs(['--runs', 'inte-ett-tal'])).toThrow()
  })

  it('kastar på en okänd policy', () => {
    expect(() => parseArgs(['--policy', 'ondskefull'])).toThrow(/okänd policy/)
  })

  it('trimmar mellanslag och hoppar över tomma poster i --policy', () => {
    const args = parseArgs(['--policy', ' passive , , balanced '])
    expect(args.policyNames).toEqual(['passive', 'balanced'])
  })
})

describe('main (packages/harness) — end till slut', () => {
  it('(P9 klart-när) skriver en CSV-fil med en rad per parti, ingen npm-utskrift ivägen', () => {
    const outPath = 'test-tmp-harness-output.csv'
    try {
      main(['--runs', '2', '--policy', 'passive,aggressive', '--out', outPath])

      const content = readFileSync(outPath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines[0]).toBe(
        'policy,seed,ending,finalTurn,treasury,doomsdayPeak,contracts,marketSharePct,rivalWinPct,disqualifiedRivalBidPct,grossMarginPct,heatOver40SharePct',
      )
      expect(lines.length).toBe(1 + 2 * 2) // header + (2 policies × 2 runs)
    } finally {
      rmSync(outPath, { force: true })
    }
  })
})
