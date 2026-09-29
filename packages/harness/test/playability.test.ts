// playability.test.ts — spelbarhetstestet (RAPPORT3_GRANSKNING.md §4, ägarbeslut 2026-09-29): golden-
// testets motsvarighet för "går spelet att vinna?". Kör harnessens kärna (runGame, ingen CSV) med 30
// partier per bot mot indochina-slice och underkänner om INGEN bot når SCENARIO_COMPLETE i minst 30 %
// av partierna. P57 (EMBARGO på tur 4 i varje parti) hade stoppats samma dag av det här testet: efter
// P57 vann 0 av 30 för varje bot, i tolv dagar och ett fyrtiotal prompter utan att någon märkte det.
//
// Tröskeln (30 %) och stickprovet (30 per bot) är ägarens beslut. Testet kräver att NÅGON bot klarar
// den, inte alla — DESIGN.md §4 förväntar sig att en genomtänkt strategi ska kunna vinna, inte att
// varje enkel bot ska göra det (RAPPORT3 §2). Frön är fasta (`playability:<bot>:<i>`), så testet är
// deterministiskt: ett rött resultat betyder alltid att en regel ändrats.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '../src/policies.js'
import { runGame } from '../src/runGame.js'
import { summarise } from '../src/summary.js'
import type { GameMetrics } from '../src/runGame.js'

const SCENARIO = 'indochina-slice'
const GAMES_PER_BOT = 30
const MIN_WIN_PCT = 30

describe('spelbarhet (RAPPORT3 §4)', () => {
  it(
    `minst en bot når SCENARIO_COMPLETE i ≥ ${MIN_WIN_PCT} % av ${GAMES_PER_BOT} partier mot ${SCENARIO}`,
    () => {
      const rows: GameMetrics[] = []
      for (const [name, policy] of Object.entries(POLICIES)) {
        for (let i = 0; i < GAMES_PER_BOT; i++) {
          rows.push(runGame(SCENARIO, `playability:${name}:${i}`, name, policy))
        }
      }

      const summaries = summarise(rows)
      expect(summaries).toHaveLength(Object.keys(POLICIES).length)
      const detail = summaries.map((s) => `${s.policy} ${s.wins}/${s.games} (${s.winPct.toFixed(0)} %)`).join(', ')
      const best = Math.max(...summaries.map((s) => s.winPct))
      expect(best, `ingen bot vinner ≥ ${MIN_WIN_PCT} %: ${detail}`).toBeGreaterThanOrEqual(MIN_WIN_PCT)
    },
    60_000,
  )
})
