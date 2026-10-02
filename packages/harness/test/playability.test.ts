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
// P99c (ägarbeslut 2026-09-29): 'passive' gör ingenting alls och vann 90 % när ingenting kunde straffa den.
// Efter att tjänstemännens relation förfaller ska en AKTIV bot klara sig — annars är spelet bara vinnbart
// genom att inte spela.
const MIN_ACTIVE_WIN_PCT = 20
// Tak (RAPPORT4 §3 punkt 2, ägarbeslut 2026-09-30): golvet fångar "går inte att vinna", taket fångar det
// motsatta — "en enkel bot vinner nästan allt". Underkänn om någon bot vinner över MAX_WIN_PCT.
const MAX_WIN_PCT = 90
// Undantag, dokumenterat och ägarbeslutat: `balanced-pwc` vinner 99–100 % (30/30 här). Orsaken är strukturell —
// en bot som bjuder vid 60 % konfidens på `playerWinCurve` vinner nästan alltid, och styrelsetröskeln är inget
// spak mot den (vid boardTarget.threshold 2,5 vinner den fortfarande 96 % medan `human` faller till 21 %). Se
// ANDRINGSLOGG.md, raden om taket i spelbarhetstestet. Undantaget vaktas nedan: ligger boten under taket har
// orsaken åtgärdats och boten ska strykas härifrån.
const KNOWN_ABOVE_CEILING: readonly string[] = ['balanced-pwc']

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

      const bestActive = Math.max(...summaries.filter((s) => s.policy !== 'passive').map((s) => s.winPct))
      expect(bestActive, `ingen AKTIV bot vinner ≥ ${MIN_ACTIVE_WIN_PCT} %: ${detail}`).toBeGreaterThanOrEqual(MIN_ACTIVE_WIN_PCT)

      // Taket: alla botar utom de dokumenterade undantagen.
      for (const summary of summaries.filter((s) => !KNOWN_ABOVE_CEILING.includes(s.policy))) {
        expect(summary.winPct, `${summary.policy} vinner över taket ${MAX_WIN_PCT} % (spelet är för lätt för den): ${detail}`).toBeLessThanOrEqual(MAX_WIN_PCT)
      }
      // Vakten: ett undantag ska vara ett verkligt undantag. Ligger boten under taket är orsaken åtgärdad.
      for (const name of KNOWN_ABOVE_CEILING) {
        const summary = summaries.find((s) => s.policy === name)
        expect(summary, `${name} finns inte bland botarna — stryk den ur KNOWN_ABOVE_CEILING`).toBeDefined()
        expect(summary!.winPct, `${name} ligger inte längre över taket ${MAX_WIN_PCT} % — stryk den ur KNOWN_ABOVE_CEILING: ${detail}`).toBeGreaterThan(MAX_WIN_PCT)
      }
    },
    180_000, // P140: 21 botar × 30 partier; 60 s räckte inte när sviten kör parallellt
  )
})
