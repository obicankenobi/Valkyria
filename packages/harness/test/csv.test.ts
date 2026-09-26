import { describe, expect, it } from 'vitest'
import { toCsv } from '../src/csv.js'
import type { GameMetrics } from '../src/runGame.js'

function row(overrides: Partial<GameMetrics> = {}): GameMetrics {
  return {
    policy: 'passive',
    seed: 'seed-1',
    ending: 'INSOLVENCY',
    finalTurn: 9,
    treasury: -123,
    doomsdayPeak: 0,
    contracts: 3,
    marketSharePct: 50,
    rivalWinPct: 45,
    disqualifiedRivalBidPct: 8,
    grossMarginPct: 12.5,
    heatOver40SharePct: 20,
    rivalContractsWon: 1,
    rivalAttributionShare: 15,
    voidedContracts: 0,
    retoolingTurns: 2,
    stationsBurned: 0,
    // P75 (ETAPP7_TEKNISK_SPEC.md §2F/§13): stillhetsmåtten.
    sectorsChangedSide: 4,
    frontMovementTotal: 37.5,
    formationsChangedStatus: 6,
    factionsChangedAlignment: 1,
    officialsReplaced: 0,
    ...overrides,
  }
}

describe('csv (packages/harness)', () => {
  it('skriver en header-rad följt av en rad per parti, i deklarerad kolumnordning', () => {
    const csv = toCsv([row(), row({ policy: 'aggressive', seed: 'seed-2' })])
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe(
      'policy,seed,ending,finalTurn,treasury,doomsdayPeak,contracts,marketSharePct,rivalWinPct,disqualifiedRivalBidPct,grossMarginPct,heatOver40SharePct,rivalContractsWon,rivalAttributionShare,voidedContracts,retoolingTurns,stationsBurned,sectorsChangedSide,frontMovementTotal,formationsChangedStatus,factionsChangedAlignment,officialsReplaced',
    )
    expect(lines.length).toBe(3) // header + 2 partier
    expect(lines[1]).toContain('passive,seed-1,INSOLVENCY,9,-123,0,3,50,45,8,12.5,20,1,15,0,2,0,4,37.5,6,1,0')
    expect(lines[2]).toContain('aggressive,seed-2')
  })

  it('en tom lista ger bara headerraden', () => {
    const csv = toCsv([])
    expect(csv.trim().split('\n')).toEqual([
      'policy,seed,ending,finalTurn,treasury,doomsdayPeak,contracts,marketSharePct,rivalWinPct,disqualifiedRivalBidPct,grossMarginPct,heatOver40SharePct,rivalContractsWon,rivalAttributionShare,voidedContracts,retoolingTurns,stationsBurned,sectorsChangedSide,frontMovementTotal,formationsChangedStatus,factionsChangedAlignment,officialsReplaced',
    ])
  })

  it('citerar fält som innehåller komma, citattecken eller radbrytning', () => {
    // split('\n') delar även INUTI det citerade fältet här — jämför mot hela
    // strängen i stället för att förutsätta en rad per parti.
    const csv = toCsv([row({ ending: 'FOO, "BAR"\nBAZ' })])
    expect(csv).toContain('"FOO, ""BAR""\nBAZ"')
  })

  it('slutar med en radbrytning (en väldefinierad textfil)', () => {
    const csv = toCsv([row()])
    expect(csv.endsWith('\n')).toBe(true)
  })
})
