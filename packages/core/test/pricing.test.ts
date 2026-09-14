import { describe, expect, it } from 'vitest'
import { computeScore, rivalBlocTerm } from '../src/pricing.js'
import type { RivalHouse } from '../src/types.js'

function makeRival(overrides: Partial<RivalHouse> = {}): RivalHouse {
  return {
    id: 'brandt',
    name: 'Brandt',
    specialisation: 'artillery',
    aggression: 55,
    temperament: 'opportunist',
    capital: 5000000,
    marketShare: 30,
    sabotagedUntilTurn: null,
    homeState: 'neutral',
    relations: {},
    reputation: { quality: 50, reliability: 50 },
    contracts: [],
    ...overrides,
  }
}

// P24 klart när (ETAPP2_TEKNISK_SPEC.md avsnitt 2.2/9): "ett test visar att
// rivalBlocTerm för en homeState-matchad respektive -omatchad rival mot samma
// blockgränsande faktion".
describe('rivalBlocTerm (P24, avsnitt 2.2 — RivalHouse-motsvarigheten till alignmentPenalty)', () => {
  const WEST_ALIGNED_FACTION = 70 // t.ex. rvn

  it('en homeState-matchad rival (west mot en västvänlig faktion) får en POSITIV term', () => {
    const rival = makeRival({ homeState: 'west' })
    expect(rivalBlocTerm(rival, WEST_ALIGNED_FACTION)).toBeGreaterThan(0)
  })

  it('en homeState-omatchad rival (east mot samma västvänliga faktion) får en NEGATIV term av samma storlek', () => {
    const west = makeRival({ homeState: 'west' })
    const east = makeRival({ homeState: 'east' })
    const westTerm = rivalBlocTerm(west, WEST_ALIGNED_FACTION)
    const eastTerm = rivalBlocTerm(east, WEST_ALIGNED_FACTION)
    expect(eastTerm).toBeLessThan(0)
    expect(eastTerm).toBe(-westTerm) // symmetriskt runt 0 — se pricing.ts:s egen motivering
  })

  it('en neutral rival får alltid term 0, oavsett hur blockgränsande faktionen är', () => {
    const neutral = makeRival({ homeState: 'neutral' })
    expect(rivalBlocTerm(neutral, WEST_ALIGNED_FACTION)).toBe(0)
    expect(rivalBlocTerm(neutral, -WEST_ALIGNED_FACTION)).toBe(0)
  })

  it('en helt blockneutral faktion (alignment 0) ger term 0 oavsett rivalens homeState', () => {
    expect(rivalBlocTerm(makeRival({ homeState: 'west' }), 0)).toBe(0)
    expect(rivalBlocTerm(makeRival({ homeState: 'east' }), 0)).toBe(0)
  })

  it('termen skalar med faktionens blockstyrka (|alignment|), inte bara dess tecken', () => {
    const rival = makeRival({ homeState: 'west' })
    const weak = rivalBlocTerm(rival, 20)
    const strong = rivalBlocTerm(rival, 90)
    expect(strong).toBeGreaterThan(weak)
  })
})

// P24 klart när: "ett test visar att två rivaler med olika relations[buyerId]
// får olika poäng på samma bud".
describe('computeScore — rivaler med olika relations[buyerId] (P24, avsnitt 2.2)', () => {
  it('en rival med hög relations[buyerId] får ett högre score än en annars identisk rival med låg', () => {
    const baseInput = {
      bidPrice: 2000000,
      bidDeliveryTurns: 3,
      bidGrade: 'A' as const,
      bidBribe: 0,
      referencePrice: 2000000,
      requiredDeliveryTurns: 3,
      weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
      inspectorIntegrity: 50,
      reputation: { quality: 50, reliability: 50 },
      blocTerm: 0,
    }

    const lowRelationScore = computeScore({ ...baseInput, relationToPlayer: 10 })
    const highRelationScore = computeScore({ ...baseInput, relationToPlayer: 90 })

    expect(highRelationScore).toBeGreaterThan(lowRelationScore)
  })
})
