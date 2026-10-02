// measurement.test.ts — P140 (ETAPP10_FORSLAG.md §5): `suspensions` räknar bara traces.ts rubrik, fältrykteskvartilen, de nya botvarianterna
// och känslighetsverktygets rena delar. Ingen core-ändring; golden orörd.
import { describe, expect, it } from 'vitest'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import { POLICIES } from '../src/policies.js'
import { isSuspensionHeadline, runGame } from '../src/runGame.js'
import { fieldQuartiles, formatFieldQuartiles } from '../src/summary.js'
import {
  appliedChangePct, buildRow, listBalanceNumbers, pairedDelta, rankSensitivity, scaleBalanceKey, scaleNumber, sensitivityCsv,
} from '../src/sensitivity.js'
import { parseSensitivityArgs } from '../src/sensitivityRun.js'
import type { GameMetrics } from '../src/runGame.js'
import type { VariantOutcome } from '../src/sensitivity.js'
import balance from '../../core/src/data/balance.json'

describe('suspensions (premiss 0.14)', () => {
  it('räknar rubriken från traces.ts men inte det avvisade budets rubrik från bidding.ts', () => {
    expect(isSuspensionHeadline('HALVORSEN & VOSS IS SUSPENDED FROM TENDERING TO THE REPUBLIC OF VIETNAM UNTIL TURN 9')).toBe(true)
    expect(isSuspensionHeadline('BID ON order-3-0 DISQUALIFIED: HALVORSEN & VOSS IS SUSPENDED FROM TENDERING TO THE REPUBLIC OF VIETNAM')).toBe(false)
    expect(isSuspensionHeadline('HALVORSEN & VOSS WINS CONTRACT')).toBe(false)
  })

  it('är bunden till de riktiga rubrikerna: båda finns kvar i core-källan med de ord mönstret förutsätter', async () => {
    const { readFileSync } = await import('node:fs')
    const traces = readFileSync(new URL('../../core/src/traces.ts', import.meta.url), 'utf-8')
    const bidding = readFileSync(new URL('../../core/src/resolve/steps/bidding.ts', import.meta.url), 'utf-8')
    expect(traces).toContain('IS SUSPENDED FROM TENDERING TO ${buyer} UNTIL TURN ${until}')
    expect(bidding).toContain('DISQUALIFIED: ${draft.house.name.toUpperCase()} IS SUSPENDED FROM TENDERING TO ${buyerName}')
  })
})

function row(over: Partial<GameMetrics>): GameMetrics {
  return { policy: 'human', seed: 's', ending: 'BUYOUT', designs: 1, fieldOccasions: 0, finalTurn: 20, ...over } as GameMetrics
}

describe('fältrykteskvartilen', () => {
  const rows = Array.from({ length: 8 }, (_, i) => row({ seed: `s${i}`, fieldOccasions: i, ending: i >= 4 ? 'SCENARIO_COMPLETE' : 'BUYOUT' }))

  it('sorterar partierna efter fälttillfällen och delar dem i fyra lika grupper', () => {
    const [s] = fieldQuartiles(rows)
    expect(s!.quartiles.map((q) => q.games)).toEqual([2, 2, 2, 2])
    expect(s!.quartiles.map((q) => [q.minOccasions, q.maxOccasions])).toEqual([[0, 1], [2, 3], [4, 5], [6, 7]])
    expect(s!.quartiles.map((q) => q.winPct)).toEqual([0, 0, 100, 100])
    expect(s!.bestMinusWorstPp).toBe(100)
    expect(s!.zeroSharePct).toBe(12.5)
  })

  it('en bot utan konstruktioner hoppas över, och för få partier ger ingen tabell', () => {
    expect(fieldQuartiles(rows.map((r) => ({ ...r, designs: 0 })))).toEqual([])
    expect(fieldQuartiles(rows.slice(0, 3))).toEqual([])
    expect(formatFieldQuartiles([])).toBe('')
  })

  it('fullLengthOnly tar bort partier som tog slut tidigt, så att längden inte förväxlas med rykte', () => {
    const mixed = [
      ...Array.from({ length: 8 }, (_, i) => row({ seed: `a${i}`, fieldOccasions: i + 10, finalTurn: 20, ending: i % 2 === 0 ? 'SCENARIO_COMPLETE' : 'BUYOUT' })),
      ...Array.from({ length: 8 }, (_, i) => row({ seed: `b${i}`, fieldOccasions: i, finalTurn: 8, ending: 'BUYOUT' })),
    ]
    expect(fieldQuartiles(mixed)[0]!.games).toBe(16)
    const [full] = fieldQuartiles(mixed, { fullLengthOnly: true })
    expect(full!.games).toBe(8)
    expect(full!.quartiles.every((q) => q.minOccasions >= 10)).toBe(true)
    expect(formatFieldQuartiles(mixed)).toContain('sista turen')
  })

  it('lika tal bryts i frösordning, så resultatet är deterministiskt', () => {
    const ties = Array.from({ length: 8 }, (_, i) => row({ seed: `t${7 - i}`, fieldOccasions: 0, ending: i < 4 ? 'SCENARIO_COMPLETE' : 'BUYOUT' }))
    expect(fieldQuartiles(ties)).toEqual(fieldQuartiles([...ties].reverse()))
  })
})

describe('nya botvarianter (premiss 0.13)', () => {
  it('human-engineer och human-plain finns; human-plain är den oförändrade P129-spelaren', () => {
    expect(POLICIES['human-engineer']).toBeTypeOf('function')
    expect(POLICIES['human-plain']).toBeTypeOf('function')
  })

  it('en variant körs till slut utan att resolveTurn kastar, och de nya kolumnerna är tal', () => {
    for (const name of ['human', 'human-clean', 'human-dirty', 'human-engineer', 'human-plain']) {
      const m = runGame('indochina-slice', `p140:${name}`, name, POLICIES[name]!)
      for (const k of ['fieldOccasions', 'fieldTrials', 'upgradedDesigns', 'kitContracts', 'studiedSystems', 'lowballs', 'programmeSabotages', 'rivalReports', 'suspensions'] as const) {
        expect(Number.isFinite(m[k]), `${name}.${k}`).toBe(true)
      }
    }
  })

  it('en variant som inte väljer något nytt skickar samma inlämning som förut: human-plain ger aldrig fältprov, uppgradering eller satser', () => {
    let state = createInitialState('indochina-slice', 'p140-plain')
    for (let t = 0; t < 12 && state.status.kind !== 'ended'; t++) {
      const submission = POLICIES['human-plain']!(state)
      expect(submission.actions.some((a) => a.type === 'POLITICAL' && a.op === 'FIELD_TRIAL')).toBe(false)
      expect(submission.standingOrders.some((o) => o.kind === 'DESIGN' && o.op === 'START' && o.upgradeOf !== undefined)).toBe(false)
      expect(submission.bids.some((b) => b.kit)).toBe(false)
      state = resolveTurn(state, submission).state
    }
  })
})

describe('känslighetsverktyget — rena delar', () => {
  const data = balance as unknown as Record<string, unknown>

  it('listar skalära tal och tabeller, hoppar över noter och nollor', () => {
    const { numbers, zeroValued } = listBalanceNumbers(data)
    expect(numbers.some((n) => n.key.startsWith('_'))).toBe(false)
    expect(numbers.find((n) => n.key === 'techMarginWeight')).toEqual({ key: 'techMarginWeight', kind: 'scalar' })
    expect(numbers.find((n) => n.key === 'gradePriceFactor')?.kind).toBe('group')
    expect(zeroValued).toContain('blocTechLevelStep')
    expect(numbers.length).toBeGreaterThan(400)
  })

  it('skalar ett tal och rör inget annat, och ingången muteras aldrig', () => {
    const before = JSON.stringify(data)
    const scaled = scaleBalanceKey(data, 'techMarginWeight', 1.25)
    expect(scaled['techMarginWeight']).toBeCloseTo(0.25 * 1.25)
    expect(scaled['specialisationBidBonusPct']).toBe(data['specialisationBidBonusPct'])
    expect(JSON.stringify(data)).toBe(before)
  })

  it('en tabell skalas som helhet och ett okänt tal kastar', () => {
    const scaled = scaleBalanceKey(data, 'gradePriceFactor', 0.75) as Record<string, Record<string, number>>
    const orig = data['gradePriceFactor'] as Record<string, number>
    for (const k of Object.keys(orig)) expect(scaled['gradePriceFactor']![k]).toBeCloseTo(orig[k]! * 0.75)
    expect(() => scaleBalanceKey(data, 'finnsInte', 1.25)).toThrow()
  })

  it('ett heltal flyttas minst ett steg och en Pct-nyckel klampas till 0–100', () => {
    expect(scaleNumber(1, 0.75, 'k')).toBe(0.75) // ett litet heltal är oftast en faktor och skalas fritt
    expect(scaleNumber(5, 0.75, 'k')).toBe(4)
    expect(scaleNumber(5, 1.1, 'k')).toBe(6) // 5,5 avrundas till 6
    expect(scaleNumber(4, 1.1, 'k')).toBe(5) // 4,4 avrundas till 4 = oförändrat, flyttas ett steg
    expect(scaleNumber(10, 1.25, 'k')).toBe(13)
    expect(scaleNumber(90, 1.25, 'somethingPct')).toBe(100)
    expect(appliedChangePct({ k: 4 }, 'k', 1.1)).toBeCloseTo(25)
    expect(appliedChangePct({ k: 0 }, 'k', 1.25)).toBeNull()
  })

  it('parad skillnad: samma frön ger noll, en ändrad utgång ger ett standardfel', () => {
    expect(pairedDelta('1010', '1010')).toEqual({ deltaPp: 0, sePp: 0 })
    const d = pairedDelta('0000', '1100')
    expect(d.deltaPp).toBe(50)
    expect(d.sePp).toBeGreaterThan(0)
  })

  it('rangordnar efter största vinstandelsrörelse, och en rad med fel hamnar sist', () => {
    const outcome = (key: string, flags: string, treasury = 100): VariantOutcome => ({ key, factor: 1, games: flags.length, winFlags: flags, meanTreasury: treasury })
    const base = outcome('', '0101')
    const rows = [
      buildRow({ a: 1, b: 1, c: 1 }, 'a', 1.25, { base, up: outcome('a', '0101'), down: outcome('a', '0101'), kind: 'scalar', refined: false }),
      buildRow({ a: 1, b: 1, c: 1 }, 'b', 1.25, { base, up: outcome('b', '1111'), down: outcome('b', '0101'), kind: 'scalar', refined: false }),
      buildRow({ a: 1, b: 1, c: 1 }, 'c', 1.25, { base, up: { ...outcome('c', ''), error: 'bad' }, down: outcome('c', '0101'), kind: 'scalar', refined: false }),
    ]
    const ranked = rankSensitivity(rows)
    expect(ranked.map((r) => r.key)).toEqual(['b', 'a', 'c'])
    expect(ranked[0]!.maxAbsDeltaPp).toBe(50)
    expect(ranked[2]!.error).toBe('bad')
    expect(sensitivityCsv(rows).split('\n')[0]).toContain('maxAbsDeltaPp')
  })

  it('parseSensitivityArgs har säkra standardvärden och avvisar orimliga', () => {
    const a = parseSensitivityArgs([])
    expect(a).toMatchObject({ policy: 'human', factor: 0.25, scenario: 'indochina-slice' })
    expect(() => parseSensitivityArgs(['--factor', '2'])).toThrow()
    expect(() => parseSensitivityArgs(['--policy', 'nope'])).toThrow()
  })
})
