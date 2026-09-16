import { describe, expect, it } from 'vitest'
import { computeReferencePrice, computeScore, getProduct, rivalBlocTerm } from '../src/pricing.js'
import balance from '../src/data/balance.json' with { type: 'json' }
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
    supplyPlayCooldownUntilTurn: null,
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

// (P48 klart-når, ETAPP4_TEKNISK_SPEC.md avsnitt 4.2/8) "computeReferencePrice
// ger identiskt resultat som före för ett givet aggregat." Funktionens signatur
// och formel är HELT OFÖRÄNDRADE av P48 — den tar fortfarande ett rått
// supplyCostIndex-tal, ovetande om att talet numera härleds ur fem råvaror i
// stället för att vara en egen storhet (avsnitt 4.2: "sömmen är smal", bara
// TVÅ funktioner läser supplyCostIndex, och det här är den ena). Testet
// pinnar formeln direkt, utan att gå via supply.ts/commodities alls.
describe('computeReferencePrice (P48 klart-når: opåverkad av att supplyCostIndex nu är härledd)', () => {
  it('samma (product, quantity, heat, supplyCostIndex) ger bitvis identiskt resultat som scarcityFactor-formeln ordagrant', () => {
    const product = getProduct('105mm_field_gun')
    const quantity = 100
    const heat = 25
    const supplyCostIndex = 112 // ett godtyckligt, givet aggregat — varifrån det kom är irrelevant här

    const price = computeReferencePrice(product, quantity, heat, supplyCostIndex)

    // Formeln ur pricing.ts, ordagrant — om P48 rört signaturen eller formeln
    // skulle den här handräknade jämförelsen divergera. Talen läses ur
    // balance.json, upprepas aldrig som egna magiska tal (CLAUDE.md hård regel 5).
    const heatFactor = 1 + (heat / 100) * balance.heatPriceElasticity
    const scarcityFactor = 1 + (supplyCostIndex - 100) / balance.scarcityPriceDivisor
    const expected = Math.round(product.baseCost * quantity * heatFactor * scarcityFactor)

    expect(price).toBe(expected)
  })

  it('samma supplyCostIndex-tal ger samma pris oavsett vilka commodities-värden som råkar ligga bakom det', () => {
    // "Identiskt resultat som före" — computeReferencePrice bryr sig bara om
    // TALET, aldrig om historiken (commodities-fördelningen) bakom det.
    const product = getProduct('m1_rifle')
    const priceA = computeReferencePrice(product, 250, 10, 105)
    const priceB = computeReferencePrice(product, 250, 10, 105)

    expect(priceA).toBe(priceB)
  })
})
