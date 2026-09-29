// summary — slutfördelningen per bot (RAPPORT3_GRANSKNING.md §4, "varje balansmätning redovisar
// också slutfördelningen"). Ren och testbar; cli.ts skriver ut den efter varje körning så att
// ingen mätning längre kan missa det enda tal som säger om spelet fungerar: hur partierna slutar.
import type { GameMetrics } from './runGame.js'

export interface PolicySummary {
  policy: string
  games: number
  wins: number // SCENARIO_COMPLETE
  winPct: number
  endings: Record<string, number>
  medianFinalTurn: number
  medianContracts: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function summarise(rows: readonly GameMetrics[]): PolicySummary[] {
  const byPolicy = new Map<string, GameMetrics[]>()
  for (const row of rows) {
    const list = byPolicy.get(row.policy) ?? []
    list.push(row)
    byPolicy.set(row.policy, list)
  }
  return [...byPolicy.entries()].map(([policy, games]) => {
    const endings: Record<string, number> = {}
    for (const game of games) endings[game.ending] = (endings[game.ending] ?? 0) + 1
    const wins = endings['SCENARIO_COMPLETE'] ?? 0
    return {
      policy,
      games: games.length,
      wins,
      winPct: (100 * wins) / games.length,
      endings,
      medianFinalTurn: median(games.map((g) => g.finalTurn)),
      medianContracts: median(games.map((g) => g.contracts)),
    }
  })
}

export function formatSummary(rows: readonly GameMetrics[]): string {
  const lines = ['policy      games  wins  win%   median-end  median-contracts  endings']
  for (const s of summarise(rows)) {
    const endings = Object.entries(s.endings)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name} ${n}`)
      .join(', ')
    lines.push(
      `${s.policy.padEnd(11)} ${String(s.games).padStart(5)}  ${String(s.wins).padStart(4)}  ${s.winPct.toFixed(1).padStart(4)}  ` +
        `${String(s.medianFinalTurn).padStart(10)}  ${String(s.medianContracts).padStart(16)}  ${endings}`,
    )
  }
  return lines.join('\n')
}
