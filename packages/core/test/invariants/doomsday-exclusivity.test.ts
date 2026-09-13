import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Invariant: state.doomsday/doomsdayPeak skrivs bara av doomsdayGate.ts (CLAUDE.md
// hård regel 9, spec avsnitt 5 "Doomsday"). fs är tillåtet här (testfil, inte
// packages/core/src — CLAUDE.md hård regel 1 gäller bara källkoden).
//
// Källskanning, inte bara beteendetest: ett beteendetest kan råka missa en direkt
// skrivning som händer att ge samma slutresultat som addDoomsday i just det
// scenario testet råkar köra. Att läsa källkoden och leta efter tilldelningar
// bevisar frånvaron, inte bara att den inte observerades den här gången.
const __dirname = dirname(fileURLToPath(import.meta.url))
const stepsDir = join(__dirname, '../../src/resolve/steps')
const resolveIndexFile = join(__dirname, '../../src/resolve/index.ts')

// Matchar en TILLDELNING till .doomsday eller .doomsdayPeak (t.ex. "draft.doomsday
// = ...") men inte en jämförelse (">=", "==", "===") eller ett anrop till
// addDoomsday(...) (som bara råkar innehålla substrängen "doomsday").
const ASSIGNMENT_PATTERN = /\.doomsday(Peak)?\s*=(?!=)/

function sourceFiles(): { path: string; content: string }[] {
  const files = readdirSync(stepsDir)
    .filter((f) => f.endsWith('.ts') && f !== 'doomsdayGate.ts')
    .map((f) => join(stepsDir, f))
  files.push(resolveIndexFile)

  return files.map((path) => ({ path, content: readFileSync(path, 'utf-8') }))
}

describe('doomsday-exklusivitet (CLAUDE.md hård regel 9)', () => {
  it('(P7 klart-när) inget steg utom doomsdayGate.ts tilldelar state.doomsday eller doomsdayPeak direkt', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(5) // skanningen ska faktiskt täcka pipelinens steg

    for (const { path, content } of files) {
      const match = ASSIGNMENT_PATTERN.exec(content)
      expect(match, `${path} innehåller en direkt tilldelning till doomsday: "${match?.[0]}"`).toBeNull()
    }
  })

  it('doomsday.ts självt skriver aldrig direkt — allt går via addDoomsday', () => {
    const doomsdayStepFile = join(stepsDir, 'doomsday.ts')
    const content = readFileSync(doomsdayStepFile, 'utf-8')

    expect(ASSIGNMENT_PATTERN.test(content)).toBe(false)
    expect(content).toContain('addDoomsday(')
  })

  it('doomsdayGate.ts är den enda filen som faktiskt gör tilldelningen (sanity check på regexet självt)', () => {
    const gateFile = join(__dirname, '../../src/resolve/doomsdayGate.ts')
    const content = readFileSync(gateFile, 'utf-8')

    expect(ASSIGNMENT_PATTERN.test(content)).toBe(true)
  })
})
