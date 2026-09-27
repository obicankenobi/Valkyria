// queries.researchOutlook.test.ts — P85 (ETAPP7_TEKNISK_SPEC.md §13, P81-17):
// "R&D:s nuläge visas ärligt, med vad varje område låser upp och när." Ingen
// ny mekanik — bara en sanningsenlig läsning av techLevel mot allProducts(),
// samma techRequired-grind bidding.ts redan avgör bud mot.
import { describe, expect, it } from 'vitest'
import { allProducts, createInitialState, researchOutlook } from '../src/index.js'

describe('researchOutlook (P85)', () => {
  it('returnerar en rad per techkategori', () => {
    const state = createInitialState('indochina-slice', 'research-count-seed')
    const outlook = researchOutlook(state)
    expect(outlook.map((o) => o.category).sort()).toEqual(
      ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'].sort(),
    )
  })

  it('techLevel läses direkt av state.house.techLevel', () => {
    const state = createInitialState('indochina-slice', 'research-level-seed')
    state.house.techLevel.infantry = 3
    const outlook = researchOutlook(state)
    expect(outlook.find((o) => o.category === 'infantry')!.techLevel).toBe(3)
  })

  it('nextUnlock pekar på den låsta produkten med LÄGST techRequired i kategorin', () => {
    const state = createInitialState('indochina-slice', 'research-unlock-seed')
    state.house.techLevel.infantry = 0
    const outlook = researchOutlook(state)
    const infantry = outlook.find((o) => o.category === 'infantry')!

    const lockedInfantry = allProducts()
      .filter((p) => p.category === 'infantry' && p.techRequired > 0)
      .sort((a, b) => a.techRequired - b.techRequired)

    expect(infantry.nextUnlock).not.toBeNull()
    expect(infantry.nextUnlock!.techRequired).toBe(lockedInfantry[0]!.techRequired)
    expect(infantry.nextUnlock!.productName).toBe(lockedInfantry[0]!.name)
  })

  it('nextUnlock är null när techLevel redan täcker allt i kategorin', () => {
    const state = createInitialState('indochina-slice', 'research-maxed-seed')
    for (const category of ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'] as const) {
      state.house.techLevel[category] = 999
    }
    const outlook = researchOutlook(state)
    expect(outlook.every((o) => o.nextUnlock === null)).toBe(true)
  })
})
