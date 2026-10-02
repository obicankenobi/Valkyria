// sensitivity — känslighetsverktyget (ETAPP10_FORSLAG.md §5 punkt 4, P140). Ändrar ETT balanstal i taget med ±25 % och mäter hur mycket
// en bots (normalt `human`) vinstandel rör sig, på samma frön som utgångsläget (parade jämförelser — slumpen är densamma, så skillnaden
// är talets verkan, inte brus). Resultatet är en rangordnad lista över vilka tal som spelar roll; sorteringen i fastställda/okänsliga/
// öppna tal är P147:s uppgift, inte den här filens.
//
// Den här filen är ren (inga processer, ingen disk): talval, skalning, rangordning och utskrift. Orkestreringen (barnprocesser) ligger i
// sensitivityRun.ts, och själva ändringen av balans-datan sker i en laddningskrok (sensitivityHook.ts) så att `packages/core` aldrig
// behöver röras — core läser balance.json vid import, och kroken byter innehållet i just den processens kopia.

export type BalanceData = Record<string, unknown>

export interface BalanceNumber {
  key: string
  kind: 'scalar' | 'group' // group = en tabell/lista där ALLA taltal skalas tillsammans
}

// Noter (`_p…_note`, strängar) är inga tal. Ett tal som är exakt 0 kan inte skalas och listas separat.
export function listBalanceNumbers(balance: BalanceData): { numbers: BalanceNumber[]; zeroValued: string[] } {
  const numbers: BalanceNumber[] = []
  const zeroValued: string[] = []
  for (const [key, value] of Object.entries(balance)) {
    if (key.startsWith('_')) continue
    if (typeof value === 'number') {
      if (value === 0) zeroValued.push(key)
      else numbers.push({ key, kind: 'scalar' })
    } else if (value !== null && typeof value === 'object' && hasNonZeroNumber(value)) {
      numbers.push({ key, kind: 'group' })
    }
  }
  return { numbers, zeroValued }
}

function hasNonZeroNumber(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0
  if (Array.isArray(value)) return value.some(hasNonZeroNumber)
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasNonZeroNumber)
  return false
}

// JSON skiljer inte 1 från 1,0, så ett litet heltal (|v| < 4) är oftast en faktor eller vikt och skalas fritt. Ett större heltal (turer, antal,
// belopp) avrundas men flyttas minst ett steg, annars skulle ±25 % av 5 bli 5. Ett tal vars namn slutar på Pct klampas till 0–100. Talet som
// faktiskt används returneras, så att rapporten kan visa den verkliga förändringen i procent.
export function scaleNumber(value: number, factor: number, key: string): number {
  let scaled = value * factor
  if (Number.isInteger(value) && Math.abs(value) >= INTEGER_STEP_FROM) {
    scaled = Math.round(scaled)
    if (scaled === value) scaled = factor > 1 ? value + 1 : value - 1
  }
  if (/Pct$/.test(key)) scaled = Math.min(100, Math.max(0, scaled))
  return scaled
}
const INTEGER_STEP_FROM = 4

function scaleDeep(value: unknown, factor: number, key: string): unknown {
  if (typeof value === 'number') return value === 0 ? 0 : scaleNumber(value, factor, key)
  if (Array.isArray(value)) return value.map((v) => scaleDeep(v, factor, key))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scaleDeep(v, factor, key)]))
  }
  return value
}

// Returnerar en NY balans-data där `key` är skalat med `factor`; ingången muteras aldrig.
export function scaleBalanceKey(balance: BalanceData, key: string, factor: number): BalanceData {
  if (!(key in balance)) throw new Error(`okänt balanstal "${key}"`)
  return { ...balance, [key]: scaleDeep(balance[key], factor, key) }
}

// Den faktiska relativa ändringen (procent) för ett skalärt tal — ett heltal som flyttats ett steg kan ha ändrats mer än 25 %.
export function appliedChangePct(balance: BalanceData, key: string, factor: number): number | null {
  const value = balance[key]
  if (typeof value !== 'number' || value === 0) return null
  return ((scaleNumber(value, factor, key) - value) / value) * 100
}

export interface VariantOutcome {
  key: string
  factor: number
  games: number
  winFlags: string // '1' = SCENARIO_COMPLETE, i frösordning
  meanTreasury: number
  error?: string
}

export interface SensitivityRow {
  key: string
  kind: 'scalar' | 'group'
  runs: number // partier per riktning
  refined: boolean
  baseWinPct: number
  upWinPct: number // vinstandel vid +faktor
  downWinPct: number
  upDeltaPp: number
  downDeltaPp: number
  upAppliedPct: number | null // verklig förändring av talet (heltalssteg kan överstiga faktorn)
  downAppliedPct: number | null
  maxAbsDeltaPp: number
  seMaxPp: number // paret med störst rörelse: parad standardfel i procentenheter
  significant: boolean // |Δ| > 2 × standardfelet
  treasuryChangePct: number // största absoluta relativa ändring av medelkassan (särskiljare vid lika vinstandel)
  error?: string
}

function winPct(flags: string): number {
  return flags.length === 0 ? 0 : (100 * [...flags].filter((f) => f === '1').length) / flags.length
}

// Parad skillnad mot utgångsläget över de första n fröna: (delta i procentenheter, standardfel i procentenheter).
export function pairedDelta(baseFlags: string, variantFlags: string): { deltaPp: number; sePp: number } {
  const n = Math.min(baseFlags.length, variantFlags.length)
  if (n === 0) return { deltaPp: 0, sePp: 0 }
  const diffs: number[] = []
  for (let i = 0; i < n; i++) diffs.push(Number(variantFlags[i] === '1') - Number(baseFlags[i] === '1'))
  const mean = diffs.reduce((a, b) => a + b, 0) / n
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0
  return { deltaPp: mean * 100, sePp: (Math.sqrt(variance / n)) * 100 }
}

interface Pair {
  base: VariantOutcome
  up?: VariantOutcome
  down?: VariantOutcome
  kind: 'scalar' | 'group'
  refined: boolean
}

export function buildRow(balance: BalanceData, key: string, factorUp: number, pair: Pair): SensitivityRow {
  const { base, up, down, kind, refined } = pair
  const error = up?.error ?? down?.error
  if (error || !up || !down) {
    return {
      key, kind, runs: 0, refined, baseWinPct: winPct(base.winFlags), upWinPct: 0, downWinPct: 0, upDeltaPp: 0, downDeltaPp: 0,
      upAppliedPct: null, downAppliedPct: null, maxAbsDeltaPp: 0, seMaxPp: 0, significant: false, treasuryChangePct: 0, error: error ?? 'saknar utfall',
    }
  }
  const dUp = pairedDelta(base.winFlags, up.winFlags)
  const dDown = pairedDelta(base.winFlags, down.winFlags)
  const upBigger = Math.abs(dUp.deltaPp) >= Math.abs(dDown.deltaPp)
  const maxAbs = upBigger ? Math.abs(dUp.deltaPp) : Math.abs(dDown.deltaPp)
  const seMax = upBigger ? dUp.sePp : dDown.sePp
  const baseTreasury = base.meanTreasury
  const treasuryChange = (v: VariantOutcome): number => (baseTreasury !== 0 ? Math.abs((v.meanTreasury - baseTreasury) / Math.abs(baseTreasury)) * 100 : 0)
  return {
    key,
    kind,
    runs: Math.min(up.games, down.games),
    refined,
    baseWinPct: winPct(base.winFlags),
    upWinPct: winPct(up.winFlags),
    downWinPct: winPct(down.winFlags),
    upDeltaPp: dUp.deltaPp,
    downDeltaPp: dDown.deltaPp,
    upAppliedPct: appliedChangePct(balance, key, factorUp),
    downAppliedPct: appliedChangePct(balance, key, 2 - factorUp),
    maxAbsDeltaPp: maxAbs,
    seMaxPp: seMax,
    significant: maxAbs > 2 * seMax && maxAbs > 0,
    treasuryChangePct: Math.max(treasuryChange(up), treasuryChange(down)),
  }
}

// Största vinstandelsrörelse först; vid lika rörelse störst kassarörelse; sist nyckelns namn (deterministisk ordning).
export function rankSensitivity(rows: readonly SensitivityRow[]): SensitivityRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(Boolean(a.error)) - Number(Boolean(b.error)) ||
      b.maxAbsDeltaPp - a.maxAbsDeltaPp ||
      b.treasuryChangePct - a.treasuryChangePct ||
      a.key.localeCompare(b.key),
  )
}

export function formatSensitivity(rows: readonly SensitivityRow[], limit = 40): string {
  const ranked = rankSensitivity(rows)
  const lines = ['rank  balanstal                                  Δ+25%   Δ-25%   maxΔ pp  se    sig  kassa%  partier']
  ranked.slice(0, limit).forEach((r, i) => {
    lines.push(
      `${String(i + 1).padStart(4)}  ${r.key.padEnd(40).slice(0, 40)}  ${r.upDeltaPp.toFixed(1).padStart(6)}  ${r.downDeltaPp.toFixed(1).padStart(6)}  ` +
        `${r.maxAbsDeltaPp.toFixed(1).padStart(7)}  ${r.seMaxPp.toFixed(1).padStart(4)}  ${r.significant ? 'ja ' : 'nej'}  ${r.treasuryChangePct.toFixed(1).padStart(6)}  ${r.runs}${r.refined ? ' (förfinad)' : ''}`,
    )
  })
  const significant = ranked.filter((r) => r.significant && !r.error).length
  const failed = ranked.filter((r) => r.error).length
  lines.push(`${ranked.length} tal mätta, ${significant} med en rörelse över 2 standardfel, ${failed} som gav fel.`)
  return lines.join('\n')
}

export const SENSITIVITY_COLUMNS = [
  'rank', 'key', 'kind', 'runs', 'refined', 'baseWinPct', 'upWinPct', 'downWinPct', 'upDeltaPp', 'downDeltaPp',
  'upAppliedPct', 'downAppliedPct', 'maxAbsDeltaPp', 'seMaxPp', 'significant', 'treasuryChangePct', 'error',
] as const

export function sensitivityCsv(rows: readonly SensitivityRow[]): string {
  const ranked = rankSensitivity(rows)
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
    const text = String(v)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [SENSITIVITY_COLUMNS.join(',')]
  ranked.forEach((r, i) => {
    const record: Record<string, unknown> = { ...r, rank: i + 1 }
    lines.push(SENSITIVITY_COLUMNS.map((c) => cell(record[c])).join(','))
  })
  return lines.join('\n') + '\n'
}
