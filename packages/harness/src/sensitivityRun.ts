// sensitivityRun — orkestreringen av känslighetsmätningen (P140). `--sensitivity` startar en barnprocess per (tal, riktning) med
// laddningskroken registrerad (sensitivityRegister.ts); varje barn kör N partier för en bot på fasta frön och skriver ett JSON-utfall.
// Ett förfiningssteg kör de tal som rört sig mest om med fler partier (`--refine-top`, `--refine-runs`).
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICIES } from './policies.js'
import { runGame } from './runGame.js'
import { buildRow, formatSensitivity, listBalanceNumbers, rankSensitivity, sensitivityCsv } from './sensitivity.js'
import type { BalanceData, SensitivityRow, VariantOutcome } from './sensitivity.js'

export interface SensitivityArgs {
  scenario: string
  policy: string
  runs: number
  factor: number // 0,25 = ±25 %
  numbers: string[] | null // null = alla
  jobs: number
  refineTop: number
  refineRuns: number
  outPath: string
}

export function parseSensitivityArgs(argv: readonly string[]): SensitivityArgs {
  const args: SensitivityArgs = {
    scenario: 'indochina-slice', policy: 'human', runs: 40, factor: 0.25, numbers: null, jobs: Math.max(1, cpus().length), refineTop: 0, refineRuns: 150,
    outPath: 'sensitivity-results.csv',
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (value === undefined) continue
    if (arg === '--scenario') { args.scenario = value; i++ }
    else if (arg === '--policy') { args.policy = value; i++ }
    else if (arg === '--runs') { args.runs = Number.parseInt(value, 10); i++ }
    else if (arg === '--factor') { args.factor = Number.parseFloat(value); i++ }
    else if (arg === '--numbers') { args.numbers = value.split(',').map((s) => s.trim()).filter(Boolean); i++ }
    else if (arg === '--jobs') { args.jobs = Number.parseInt(value, 10); i++ }
    else if (arg === '--refine-top') { args.refineTop = Number.parseInt(value, 10); i++ }
    else if (arg === '--refine-runs') { args.refineRuns = Number.parseInt(value, 10); i++ }
    else if (arg === '--out') { args.outPath = value; i++ }
  }
  if (!(args.policy in POLICIES)) throw new Error(`okänd policy "${args.policy}"`)
  if (!Number.isInteger(args.runs) || args.runs <= 0) throw new Error('--runs måste vara ett positivt heltal')
  if (!(args.factor > 0 && args.factor < 1)) throw new Error('--factor måste ligga mellan 0 och 1 (0,25 = ±25 %)')
  if (!Number.isInteger(args.jobs) || args.jobs <= 0) throw new Error('--jobs måste vara ett positivt heltal')
  return args
}

// ── Barnprocessen: kör partierna med den registrerade krokens balans ────────────────────────────────────────────────────────────────
export function sensitivityChild(argv: readonly string[]): void {
  const get = (name: string): string => argv[argv.indexOf(name) + 1] ?? ''
  const scenario = get('--scenario')
  const policyName = get('--policy')
  const runs = Number.parseInt(get('--runs'), 10)
  const key = get('--key')
  const factor = Number.parseFloat(get('--scale'))
  let outcome: VariantOutcome
  try {
    const policy = POLICIES[policyName]!
    let flags = ''
    let treasury = 0
    for (let i = 0; i < runs; i++) {
      const row = runGame(scenario, `sens:${i}`, policyName, policy)
      flags += row.ending === 'SCENARIO_COMPLETE' ? '1' : '0'
      treasury += row.treasury
    }
    outcome = { key, factor, games: runs, winFlags: flags, meanTreasury: treasury / runs }
  } catch (error) {
    outcome = { key, factor, games: 0, winFlags: '', meanTreasury: 0, error: error instanceof Error ? error.message : String(error) }
  }
  process.stdout.write(`SENS_RESULT ${JSON.stringify(outcome)}\n`)
}

// ── Orkestratorn ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function spawnVariant(args: SensitivityArgs, key: string, scale: number, runs: number): Promise<VariantOutcome> {
  const here = dirname(fileURLToPath(import.meta.url))
  const childArgs = [
    '--import', join(here, 'sensitivityRegister.js'), join(here, 'index.js'),
    '--sens-child', '--scenario', args.scenario, '--policy', args.policy, '--runs', String(runs), '--key', key, '--scale', String(scale),
  ]
  return new Promise((resolve) => {
    const child = spawn(process.execPath, childArgs, {
      env: { ...process.env, HARNESS_BALANCE_KEY: key, HARNESS_BALANCE_FACTOR: String(scale) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.on('close', () => {
      const line = out.split('\n').find((l) => l.startsWith('SENS_RESULT '))
      if (line) resolve(JSON.parse(line.slice('SENS_RESULT '.length)) as VariantOutcome)
      else resolve({ key, factor: scale, games: 0, winFlags: '', meanTreasury: 0, error: (err || 'barnprocessen gav inget utfall').trim().slice(0, 200) })
    })
  })
}

async function pool<T>(tasks: (() => Promise<T>)[], jobs: number, onDone?: (done: number, total: number) => void): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  let done = 0
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= tasks.length) return
      results[index] = await tasks[index]!()
      done++
      onDone?.(done, tasks.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker))
  return results
}

function readBalance(): BalanceData {
  const require = createRequire(import.meta.url)
  const coreEntry = require.resolve('@seventh-front/core')
  return JSON.parse(readFileSync(join(dirname(coreEntry), 'data', 'balance.json'), 'utf-8')) as BalanceData
}

export async function runSensitivity(argv: readonly string[]): Promise<void> {
  const args = parseSensitivityArgs(argv)
  const balance = readBalance()
  const { numbers, zeroValued } = listBalanceNumbers(balance)
  const chosen = args.numbers ? numbers.filter((n) => args.numbers!.includes(n.key)) : numbers
  if (chosen.length === 0) throw new Error('inga balanstal att mäta (kontrollera --numbers)')
  const up = 1 + args.factor
  const down = 1 - args.factor
  const log = (text: string): void => console.log(text)
  log(`Känslighet för ${args.policy}: ${chosen.length} tal × 2 riktningar × ${args.runs} partier, ${args.jobs} processer. Tal lika med 0 (hoppas över): ${zeroValued.join(', ') || 'inga'}`)

  const measure = async (keys: typeof chosen, runs: number): Promise<{ base: VariantOutcome; byKey: Map<string, { up: VariantOutcome; down: VariantOutcome }> }> => {
    const tasks: (() => Promise<VariantOutcome>)[] = [() => spawnVariant(args, '', 1, runs)]
    for (const n of keys) {
      tasks.push(() => spawnVariant(args, n.key, up, runs))
      tasks.push(() => spawnVariant(args, n.key, down, runs))
    }
    const results = await pool(tasks, args.jobs, (done, total) => {
      if (done % 50 === 0 || done === total) log(`  ${done}/${total} körningar klara`)
    })
    const byKey = new Map<string, { up: VariantOutcome; down: VariantOutcome }>()
    keys.forEach((n, i) => byKey.set(n.key, { up: results[1 + 2 * i]!, down: results[2 + 2 * i]! }))
    return { base: results[0]!, byKey }
  }

  const stage1 = await measure(chosen, args.runs)
  let rows: SensitivityRow[] = chosen.map((n) => buildRow(balance, n.key, up, { base: stage1.base, ...stage1.byKey.get(n.key)!, kind: n.kind, refined: false }))

  if (args.refineTop > 0) {
    const top = rankSensitivity(rows).filter((r) => !r.error).slice(0, args.refineTop)
    const topKeys = chosen.filter((n) => top.some((t) => t.key === n.key))
    log(`Förfinar de ${topKeys.length} talen som rört sig mest med ${args.refineRuns} partier per riktning.`)
    const stage2 = await measure(topKeys, args.refineRuns)
    const refined = new Map(topKeys.map((n) => [n.key, buildRow(balance, n.key, up, { base: stage2.base, ...stage2.byKey.get(n.key)!, kind: n.kind, refined: true })]))
    rows = rows.map((r) => refined.get(r.key) ?? r)
  }

  writeFileSync(args.outPath, sensitivityCsv(rows))
  log(`Utgångsläge (${args.runs} partier): ${args.policy} vinner ${(([...stage1.base.winFlags].filter((f) => f === '1').length / args.runs) * 100).toFixed(1)} %`)
  log(formatSensitivity(rows, 60))
  log(`Alla ${rows.length} rader skrivna till ${args.outPath}`)
}
