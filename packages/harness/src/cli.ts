// cli — argumenttolkning och orkestrering. Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.3:
//   npm run harness -- --scenario indochina-slice --runs 500 --policy aggressive,passive,balanced
//
// CSV:n skrivs till en RIKTIG FIL (--out, default harness-results.csv i den
// katalog kommandot körs från), inte till stdout. PROVISORISKT vägval, ingen
// designfråga — se ANDRINGSLOGG.md: `npm run <script>` skriver sina egna
// livscykelbanderoller ("> paket@version script", nästlade "npm run build"-rader)
// till stdout, så en `npm run harness -- ... > out.csv`-omdirigering enligt
// specens exempelkommando (ordagrant, utan omdirigering) hade fått en fil med
// npm:s egna byggrader inklistrade FÖRE CSV-headern — oanvändbar för en CSV-
// parser. En riktig fil på disk är robust mot det oavsett hur npm dekorerar sin
// egen utskrift.
//
// --runs N tolkas som N partier PER policy, inte N totalt fördelat på policies —
// annars blir jämförelsen mellan policies ojämn i litet stickprov. Se
// ANDRINGSLOGG.md.
import { writeFileSync } from 'node:fs'
import { POLICIES } from './policies.js'
import { runGame } from './runGame.js'
import { toCsv } from './csv.js'
import type { GameMetrics } from './runGame.js'

interface Args {
  scenario: string
  runs: number
  policyNames: string[]
  outPath: string
}

const DEFAULT_SCENARIO = 'indochina-slice'
const DEFAULT_RUNS = 100
const DEFAULT_OUT_PATH = 'harness-results.csv'

export function parseArgs(argv: readonly string[]): Args {
  let scenario = DEFAULT_SCENARIO
  let runs = DEFAULT_RUNS
  let policyNames = Object.keys(POLICIES)
  let outPath = DEFAULT_OUT_PATH

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--scenario' && value !== undefined) {
      scenario = value
      i++
    } else if (arg === '--runs' && value !== undefined) {
      runs = Number.parseInt(value, 10)
      i++
    } else if (arg === '--policy' && value !== undefined) {
      policyNames = value
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
      i++
    } else if (arg === '--out' && value !== undefined) {
      outPath = value
      i++
    }
  }

  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error(`--runs måste vara ett positivt heltal, fick "${runs}"`)
  }
  if (policyNames.length === 0) {
    throw new Error('--policy gav ingen giltig policy')
  }
  for (const name of policyNames) {
    if (!(name in POLICIES)) {
      throw new Error(`okänd policy "${name}" — giltiga: ${Object.keys(POLICIES).join(', ')}`)
    }
  }

  return { scenario, runs, policyNames, outPath }
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv)
  const rows: GameMetrics[] = []

  for (const policyName of args.policyNames) {
    const policy = POLICIES[policyName]!
    for (let i = 0; i < args.runs; i++) {
      const seed = `${args.scenario}:${policyName}:${i}`
      rows.push(runGame(args.scenario, seed, policyName, policy))
    }
  }

  writeFileSync(args.outPath, toCsv(rows))
  console.log(
    `${rows.length} parti(er) körda (${args.policyNames.join(', ')} × ${args.runs} styck) för scenario ` +
      `"${args.scenario}" — skrivna till ${args.outPath}`,
  )
}
