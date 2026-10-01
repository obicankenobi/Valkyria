// handbook.test.ts — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20). Klart-när,
// ordagrant: "ett test underkänner om ett verb eller ett HUD-tal saknar
// uppslag."
import { describe, expect, it } from 'vitest'
import { ACTION_CATALOG } from '../src/actionCatalog.js'
import { HANDBOOK, HUD_NUMBERS, findHandbookEntry, hudNumberTopic, verbTopic } from '../src/handbook.js'

describe('handbook — täckning (P91b klart-när)', () => {
  it('varje verb i ACTION_CATALOG har ett uppslag', () => {
    for (const action of ACTION_CATALOG) {
      const topicId = verbTopic(action.verb)
      expect(topicId, `${action.verb} saknar en topic`).not.toBeNull()
      expect(findHandbookEntry(topicId!), `${action.verb} pekar på en topic (${topicId}) utan HANDBOOK-post`).not.toBeNull()
    }
  })

  it('varje HUD-tal har ett uppslag', () => {
    for (const id of HUD_NUMBERS) {
      const topicId = hudNumberTopic(id)
      expect(topicId, `${id} saknar en topic`).toBeTruthy()
      expect(findHandbookEntry(topicId), `${id} pekar på en topic (${topicId}) utan HANDBOOK-post`).not.toBeNull()
    }
  })

  it('täcker samtliga åtta mekaniker specen namnger plus etapp 9:s ritbord (P126)', () => {
    const ids = HANDBOOK.map((entry) => entry.id).sort()
    expect(ids).toEqual(
      ['procurement', 'production', 'board', 'doomsday', 'heat', 'intelligence', 'politics', 'fronts', 'design'].sort(),
    )
  })

  it('varje post har en icke-tom summary och minst ett body-stycke', () => {
    for (const entry of HANDBOOK) {
      expect(entry.summary.length, entry.id).toBeGreaterThan(0)
      expect(entry.body.length, entry.id).toBeGreaterThan(0)
      for (const paragraph of entry.body) {
        expect(paragraph.length, entry.id).toBeGreaterThan(0)
      }
    }
  })

  it('Procurement (CONTRACTS) varnar för att ett kontrakt nära självkostnad inte täcker de fasta kostnaderna (ägarbeslut 2026-09-30)', () => {
    const body = findHandbookEntry('procurement')!.body.join(' ')
    expect(body).toMatch(/unit cost/i)
    expect(body).toMatch(/fixed costs/i)
  })

  it('findHandbookEntry returnerar null för en okänd topic', () => {
    expect(findHandbookEntry('okand' as never)).toBeNull()
  })
})
