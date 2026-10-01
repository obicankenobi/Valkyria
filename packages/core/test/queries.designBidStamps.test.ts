// queries.designBidStamps.test.ts — P127 (ETAPP9_FORSLAG.md §9, budmappen). Stämplarna STRIDSBEPRÖVAD (BATTLE-PROVEN) och KRAVNIVÅ
// (REQUIRED LEVEL) vid en konstruktion i budmappen. Kravnivån är en jämförelse mot köparens blocks dolda generation, så den visas bara
// med underrättelse i köparens land (annars null → "?"), samma grind som kreditstämpeln (skyddsräcke 4 och 5).
import { describe, expect, it } from 'vitest'
import { designBidStamps } from '../src/queries.js'
import { createInitialState } from '../src/state.js'
import type { Design, Order } from '../src/types.js'

const design = (over: Partial<Design> = {}): Design =>
  ({
    id: 'design-1', name: 'H&V M64 Field Gun', category: 'artillery', baseProductId: '105mm_field_gun', generation: 1, focus: 'balanced', ambition: 'timely',
    performance: 60, reliability: 60, unitCostFactor: 1, trueQuality: 60, uncertainty: 1, latentFlaw: null, flawRevealed: false, testedIn: [],
    fieldRecord: { occasions: 0, proven: false }, lineage: null, introducedTurn: 1, status: 'active', ...over,
  }) as Design

const order = (): Order =>
  ({ id: 'o', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, statedBudget: 1, trueBudget: 1, referencePrice: 1, requiredDeliveryTurns: 2, expiresTurn: 9, competingRivals: [], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 }, officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 10 }) as Order

describe('designBidStamps (P127)', () => {
  it('STRIDSBEPRÖVAD följer fältryktet', () => {
    const state = createInitialState('indochina-slice', 'stamps')
    expect(designBidStamps(state, design(), order()).battleProven).toBe(false)
    expect(designBidStamps(state, design({ fieldRecord: { occasions: 3, proven: true } }), order()).battleProven).toBe(true)
  })

  it('KRAVNIVÅ är null utan underrättelse i köparens land, och annars en jämförelse mot blockets generation', () => {
    const state = createInitialState('indochina-slice', 'stamps')
    state.house.stations = [] // ingen underrättelse
    expect(designBidStamps(state, design(), order()).requiredLevel).toBeNull()

    const watched = createInitialState('indochina-slice', 'stamps')
    watched.house.stations = [{ id: 's', city: 'Saigon', nation: 'rvn', depth: 2, exposure: 0, coverage: ['procurement'], status: 'active' }]
    const bloc = watched.factions['rvn']!.alignment > 0 ? 'west' : 'east'
    watched.race.generation[bloc].artillery = 3
    expect(designBidStamps(watched, design({ generation: 3 }), order()).requiredLevel).toBe(true)
    expect(designBidStamps(watched, design({ generation: 2 }), order()).requiredLevel).toBe(false)
  })

  it('fältprovad hos just den här köparen visas separat (bonusen är kvar tills den förbrukas)', () => {
    const state = createInitialState('indochina-slice', 'stamps')
    expect(designBidStamps(state, design(), order()).fieldTrialled).toBe(false)
    expect(designBidStamps(state, design({ trials: { rvn: { turn: 2, bonusActive: true } } }), order()).fieldTrialled).toBe(true)
    expect(designBidStamps(state, design({ trials: { rvn: { turn: 2, bonusActive: false } } }), order()).fieldTrialled).toBe(false)
  })
})
