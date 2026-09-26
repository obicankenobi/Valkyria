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
  'rivalWinPct',
  'disqualifiedRivalBidPct',
  'grossMarginPct',
  'heatOver40SharePct',
  'rivalContractsWon',
  'rivalAttributionShare',
  'voidedContracts',
  'retoolingTurns',
  'stationsBurned',
  'sectorsChangedSide',
  'frontMovementTotal',
  'formationsChangedStatus',
  'factionsChangedAlignment',
  'officialsReplaced',
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
