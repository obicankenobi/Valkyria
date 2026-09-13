// csv — minimal CSV-serialisering. Ingen extern dependency för en enda tabell.
import type { GameMetrics } from './runGame.js'

const COLUMNS = [
  'policy',
  'seed',
  'ending',
  'finalTurn',
  'treasury',
  'doomsdayPeak',
  'contracts',
  'marketSharePct',
  'grossMarginPct',
  'heatOver40SharePct',
] as const satisfies readonly (keyof GameMetrics)[]

function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: readonly GameMetrics[]): string {
  const header = COLUMNS.join(',')
  const lines = rows.map((row) => COLUMNS.map((col) => csvField(row[col])).join(','))
  return [header, ...lines].join('\n') + '\n'
}
