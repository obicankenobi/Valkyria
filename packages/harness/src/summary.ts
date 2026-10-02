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

// ── P140 (ETAPP10_FORSLAG.md §5 punkt 2): fältrykteskvartilen ──────────────────────────────────────────────────────────────────────
// Etapp 9:s fetstilta rad: "`human`, bästa mot sämsta kvartilen i fältrykte, vinst — ≥ 25 procentenheter skillnad". Fältrykte per parti är summan
// av fälttillfällen över husets konstruktioner (GameMetrics.fieldOccasions, Design.fieldRecord.occasions). Partierna sorteras efter den
// (lika tal i frösordning, så resultatet är deterministiskt) och delas i fyra lika stora grupper; en grupp som består av nollor är ett
// resultat i sig — det betyder att ryktet inte hann byggas upp.
export interface FieldQuartile {
  quartile: 1 | 2 | 3 | 4 // 1 = sämsta fältrykte, 4 = bästa
  games: number
  minOccasions: number
  maxOccasions: number
  winPct: number
}

export interface FieldQuartileSummary {
  policy: string
  games: number
  zeroSharePct: number // andel partier utan ett enda fälttillfälle
  quartiles: FieldQuartile[]
  bestMinusWorstPp: number // vinstandel i kvartil 4 minus kvartil 1
}

// `fullLengthOnly`: ett parti som tar slut tidigt (BUYOUT vid tur 10) hinner ha färre fälttillfällen än ett som spelas ut — kvartilerna
// blandar då ihop "bra rykte" med "partiet varade längre". Med `fullLengthOnly` räknas bara partier som nått partiets sista tur (den
// största sluttur policyn har), där alla haft lika många turer på sig att bygga rykte.
export function fieldQuartiles(rows: readonly GameMetrics[], options: { fullLengthOnly?: boolean } = {}): FieldQuartileSummary[] {
  const byPolicy = new Map<string, GameMetrics[]>()
  for (const row of rows) {
    if (row.designs === 0 && !byPolicy.has(row.policy)) continue
    const list = byPolicy.get(row.policy) ?? []
    list.push(row)
    byPolicy.set(row.policy, list)
  }
  const out: FieldQuartileSummary[] = []
  for (const [policy, allGames] of byPolicy) {
    const lastTurn = Math.max(...allGames.map((g) => g.finalTurn))
    const games = options.fullLengthOnly ? allGames.filter((g) => g.finalTurn === lastTurn) : allGames
    if (games.length < 4) continue
    const sorted = [...games].sort((a, b) => a.fieldOccasions - b.fieldOccasions || a.seed.localeCompare(b.seed))
    const groups: GameMetrics[][] = [[], [], [], []]
    sorted.forEach((game, i) => groups[Math.min(3, Math.floor((i * 4) / sorted.length))]!.push(game))
    const quartiles = groups.map((group, i): FieldQuartile => ({
      quartile: (i + 1) as 1 | 2 | 3 | 4,
      games: group.length,
      minOccasions: group[0]!.fieldOccasions,
      maxOccasions: group[group.length - 1]!.fieldOccasions,
      winPct: (100 * group.filter((g) => g.ending === 'SCENARIO_COMPLETE').length) / group.length,
    }))
    out.push({
      policy,
      games: games.length,
      zeroSharePct: (100 * games.filter((g) => g.fieldOccasions === 0).length) / games.length,
      quartiles,
      bestMinusWorstPp: quartiles[3]!.winPct - quartiles[0]!.winPct,
    })
  }
  return out
}

function formatQuartileTable(title: string, summaries: readonly FieldQuartileSummary[]): string[] {
  const lines = [title, 'policy            partier  utan%  kv1 vinst%  kv2  kv3  kv4 vinst%  bäst−sämst pp  intervall per kvartil']
  for (const s of summaries) {
    const win = s.quartiles.map((q) => q.winPct.toFixed(0).padStart(4)).join(' ')
    const ranges = s.quartiles.map((q) => `${q.minOccasions}–${q.maxOccasions}`).join(' | ')
    lines.push(`${s.policy.padEnd(16)} ${String(s.games).padStart(7)}  ${s.zeroSharePct.toFixed(0).padStart(4)}  ${win}  ${s.bestMinusWorstPp.toFixed(1).padStart(13)}  ${ranges}`)
  }
  return lines
}

export function formatFieldQuartiles(rows: readonly GameMetrics[]): string {
  const all = fieldQuartiles(rows)
  if (all.length === 0) return ''
  const lines = formatQuartileTable('fältrykteskvartiler, alla partier (fälttillfällen per parti; kvartil 1 = sämst, 4 = bäst)', all)
  const full = fieldQuartiles(rows, { fullLengthOnly: true })
  if (full.length > 0) lines.push('', ...formatQuartileTable('… bara partier som spelats till sista turen (lika många turer att bygga rykte på)', full))
  return lines.join('\n')
}
