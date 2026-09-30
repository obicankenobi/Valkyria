// capacityReference.test.ts — ägarbeslut 2026-09-30 (capacity-frågan efter P104, ANDRINGSLOGG).
//
// `capacity` är spec 10.2:s referensbot ("ingen politik, inga lån", bjuder bara på ordrar med en ledig linje
// nu) och förväntas INTE vinna eller slå någon annan bot. Den är i stället en MÄTARE: dess slutfördelning är
// ett referensvärde, och om den flyttar sig har en regel någonstans ändrats på ett sätt som slår igenom
// även på en bot som medvetet inte gör något smart.
//
// Referensen är mätt över 300 partier (`capacity-reference:<i>` mot indochina-slice) efter P104:
//   SCENARIO_COMPLETE 2 (0,7 %), BUYOUT 290 (96,7 %), INSOLVENCY 7 (2,3 %), NUCLEAR_EXCHANGE 1 (0,3 %).
// Testet underkänner om vinst- eller BUYOUT-andelen flyttat sig mer än ±10 procentenheter.
//
// RÖTT BETYDER: prompten som orsakade förskjutningen ska redovisa VARFÖR i ANDRINGSLOGG.md och uppdatera
// referensen här OCH i ETAPP8_FORSLAG.md (P104-blockquoten) som ett ägarbeslut. Skruva aldrig bara på
// konstanterna för att få grönt.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '../src/policies.js'
import { runGame } from '../src/runGame.js'

const SCENARIO = 'indochina-slice'
const GAMES = 300
const TOLERANCE_PP = 10

// Referensvärdena i procent (av 300 partier). INSOLVENCY och NUCLEAR_EXCHANGE sparas för läsbarhetens
// skull men testas inte — beslutet gäller vinst och BUYOUT.
const REFERENCE = { winPct: 0.7, buyoutPct: 96.7, insolvencyPct: 2.3, nuclearPct: 0.3 }

describe('capacity som referensmätare (ägarbeslut 2026-09-30)', () => {
  it(
    `vinst- och BUYOUT-andelen ligger inom ±${TOLERANCE_PP} procentenheter av referensen över ${GAMES} partier`,
    () => {
      const capacity = POLICIES['capacity']!
      const endings: Record<string, number> = {}
      for (let i = 0; i < GAMES; i++) {
        const m = runGame(SCENARIO, `capacity-reference:${i}`, 'capacity', capacity)
        endings[m.ending] = (endings[m.ending] ?? 0) + 1
      }
      const pct = (code: string): number => (100 * (endings[code] ?? 0)) / GAMES
      const detail = `SCENARIO_COMPLETE ${pct('SCENARIO_COMPLETE').toFixed(1)} %, BUYOUT ${pct('BUYOUT').toFixed(1)} %, ` +
        `INSOLVENCY ${pct('INSOLVENCY').toFixed(1)} %, NUCLEAR_EXCHANGE ${pct('NUCLEAR_EXCHANGE').toFixed(1)} % ` +
        `(referens ${REFERENCE.winPct} / ${REFERENCE.buyoutPct} / ${REFERENCE.insolvencyPct} / ${REFERENCE.nuclearPct})`

      expect(Math.abs(pct('SCENARIO_COMPLETE') - REFERENCE.winPct), `capacitys vinstandel har flyttat sig: ${detail}`).toBeLessThanOrEqual(TOLERANCE_PP)
      expect(Math.abs(pct('BUYOUT') - REFERENCE.buyoutPct), `capacitys BUYOUT-andel har flyttat sig: ${detail}`).toBeLessThanOrEqual(TOLERANCE_PP)
    },
    60_000,
  )
})
