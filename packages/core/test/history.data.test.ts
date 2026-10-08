// history.data.test.ts — P149 (ETAPP10_FORSLAG.md §9.7, beslut 10I, 10J, 10O). Äkthetskravet: varje händelse har datum och källa, kvartalet stämmer med datumet,
// texterna säger vad som hände utan påhittade citat, inga verkliga vapenhus nämns, och ett kvartal har högst en förstasida och tre telexrader.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { HISTORY_AFTERWORD, HISTORY_EVENTS, HISTORY_PROLOGUE, quarterOfDate } from '../src/history.js'
import type { HistoryEvent } from '../src/history.js'

const ALL: HistoryEvent[] = [...HISTORY_EVENTS, ...HISTORY_PROLOGUE, ...HISTORY_AFTERWORD]
const EFFECTS = (balance as unknown as { historyEffects: Record<string, number> }).historyEffects
// Verkliga vapenhus och tillverkare (10I): inga namn i händelsetexterna.
const REAL_ARMS_HOUSES = /\b(Lockheed|Boeing|Northrop|Grumman|Raytheon|McDonnell|Douglas|General Dynamics|Colt|Winchester|Vickers|Hawker|Dassault|Messerschmitt|Bofors|Saab|Colt's|Remington)\b/i

describe('händelsernas äkthet (P149, §9.7)', () => {
  it('antalen: elva förstasidor, omkring tjugo telexrader, fem prologsidor och två efterord', () => {
    expect(HISTORY_EVENTS.filter((e) => e.kind === 'frontPage')).toHaveLength(11)
    expect(HISTORY_EVENTS.filter((e) => e.kind === 'telex').length).toBeGreaterThanOrEqual(20)
    expect(HISTORY_PROLOGUE).toHaveLength(5)
    expect(HISTORY_AFTERWORD).toHaveLength(2)
  })

  it('varje händelse har id, datum, källa, rubrik och text — och id:n är unika', () => {
    const ids = new Set<string>()
    for (const e of ALL) {
      expect(e.id, 'id').toBeTruthy()
      expect(ids.has(e.id), `dubblett ${e.id}`).toBe(false)
      ids.add(e.id)
      expect(e.date, `${e.id} datum`).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
      expect(e.source.length, `${e.id} källa`).toBeGreaterThan(3)
      expect(e.headline.length, `${e.id} rubrik`).toBeGreaterThan(0)
      expect(e.body.length, `${e.id} text`).toBeGreaterThan(0)
    }
  })

  it('kvartalet stämmer med datumet för varje schemalagd händelse', () => {
    for (const e of HISTORY_EVENTS) expect(e.quarter, `${e.id}`).toBe(quarterOfDate(e.date))
  })

  it('händelserna ligger inom partiets år (1964 Q2 – 1968 Q4); prologen före, efterordet efter', () => {
    for (const e of HISTORY_EVENTS) expect(e.quarter! >= '1964-Q1' && e.quarter! <= '1968-Q4', e.id).toBe(true)
    for (const e of HISTORY_PROLOGUE) expect(e.date < '1964', e.id).toBe(true)
    for (const e of HISTORY_AFTERWORD) expect(['my-lai', 'ussuri-clashes']).toContain(e.id)
  })

  it('ett kvartal har högst en förstasida och tre telexrader (10O)', () => {
    const perQuarter = new Map<string, { frontPage: number; telex: number }>()
    for (const e of HISTORY_EVENTS) {
      const row = perQuarter.get(e.quarter!) ?? { frontPage: 0, telex: 0 }
      if (e.kind === 'frontPage') row.frontPage++
      else row.telex++
      perQuarter.set(e.quarter!, row)
    }
    for (const [quarter, row] of perQuarter) {
      expect(row.frontPage, quarter).toBeLessThanOrEqual(1)
      expect(row.telex, quarter).toBeLessThanOrEqual(3)
    }
  })

  it('inga påhittade citat (10J) och inga verkliga vapenhus (10I): inga citattecken i rubrik eller text', () => {
    for (const e of ALL) {
      for (const text of [e.headline, e.body]) {
        expect(text, `${e.id}`).not.toMatch(/["“”«»]/)
        expect(text, `${e.id}`).not.toMatch(REAL_ARMS_HOUSES)
      }
    }
  })

  it('texterna är en eller två meningar', () => {
    for (const e of ALL) {
      const sentences = e.body.split(/(?<=[.!?])\s+/).filter(Boolean)
      expect(sentences.length, e.id).toBeGreaterThanOrEqual(1)
      expect(sentences.length, e.id).toBeLessThanOrEqual(3)
    }
  })

  it('varje effekt pekar på ett tal som finns i balance.json (historyEffects)', () => {
    for (const e of HISTORY_EVENTS) {
      for (const effect of e.effects ?? []) {
        if ('key' in effect) expect(EFFECTS[effect.key], `${e.id}: ${effect.key}`).not.toBeUndefined()
      }
    }
  })

  it('bara förstasidor bär effekter — telexraderna är ren text', () => {
    for (const e of HISTORY_EVENTS.filter((x) => x.kind === 'telex')) expect(e.effects ?? [], e.id).toEqual([])
  })
})
