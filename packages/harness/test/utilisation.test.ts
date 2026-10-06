// utilisation.test.ts — P168 (ETAPP11_FORSLAG.md §9, "Grund"): fyra nya kolumner som mäter nollläget före etapp 11 — linjernas utnyttjande
// (medel och topp), byggda linjer och sena kontrakt. Rena mätkolumner: ingen core-ändring, golden orörd. Varje kolumn kontrolleras mot en
// oberoende omspelning av samma parti (policyerna är rena funktioner av tillståndet) och mot partier där svaret är känt på förhand.
import { describe, expect, it } from 'vitest'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState, TurnSubmission } from '@seventh-front/core'
import { POLICIES } from '../src/policies.js'
import { runGame } from '../src/runGame.js'

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const MAX_TURNS = 21

// Omspelning med den enkla definitionen: andel linjer med status 'running' efter varje turs avgörande, medel över spelade turer.
function replay(seed: string, policy: (s: GameState) => TurnSubmission) {
  let state = createInitialState('indochina-slice', seed)
  const initialLines = state.house.lines.length
  const perTurn: number[] = []
  const late = new Set<string>()
  for (let t = 0; t < MAX_TURNS; t++) {
    state = resolveTurn(state, policy(state)).state
    const lines = state.house.lines
    perTurn.push(lines.length === 0 ? 0 : (100 * lines.filter((l) => l.status === 'running').length) / lines.length)
    for (const c of state.market.contracts) if (c.status === 'late') late.add(c.id)
    if (state.status.kind === 'ended') break
  }
  return {
    mean: perTurn.reduce((a, b) => a + b, 0) / perTurn.length,
    peak: Math.max(...perTurn),
    linesBuilt: state.house.lines.length - initialLines,
    late: late.size,
    contracts: state.market.contracts.length,
  }
}

describe('nollläges-kolumnerna (P168)', () => {
  it.each(['human', 'aggressive', 'balanced', 'passive'])('%s: kolumnerna stämmer med en oberoende omspelning', (name) => {
    const seed = `p168:${name}`
    const m = runGame('indochina-slice', seed, name, POLICIES[name]!)
    const r = replay(seed, POLICIES[name]!)
    expect(m.lineUtilizationPct).toBeCloseTo(r.mean, 9)
    expect(m.peakLineUtilizationPct).toBeCloseTo(r.peak, 9)
    expect(m.linesBuilt).toBe(r.linesBuilt)
    expect(m.lateContracts).toBe(r.late)
    expect(m.lineUtilizationPct).toBeGreaterThanOrEqual(0)
    expect(m.peakLineUtilizationPct).toBeLessThanOrEqual(100)
    expect(m.peakLineUtilizationPct).toBeGreaterThanOrEqual(m.lineUtilizationPct)
    expect(m.lateContracts).toBeLessThanOrEqual(r.contracts)
  })

  it('ett hus som inte gör något: noll utnyttjande, inga byggda linjer, inga sena kontrakt', () => {
    const m = runGame('indochina-slice', 'p168:idle', 'idle', () => EMPTY)
    expect(m.lineUtilizationPct).toBe(0)
    expect(m.peakLineUtilizationPct).toBe(0)
    expect(m.linesBuilt).toBe(0)
    expect(m.lateContracts).toBe(0)
  })

  it('en policy som bygger två linjer första turen ger linesBuilt = 2', () => {
    let built = false
    const m = runGame('indochina-slice', 'p168:builder', 'builder', () => {
      if (built) return EMPTY
      built = true
      return {
        standingOrders: [],
        bids: [],
        actions: [
          { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} },
          { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} },
        ],
      }
    })
    expect(m.linesBuilt).toBe(2)
  })
})
