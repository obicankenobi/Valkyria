import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import type { Doctrine, Formation, TechCategory, TurnSubmission } from '../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function zeroEquipment(): Record<TechCategory, number> {
  const record = {} as Record<TechCategory, number>
  for (const category of ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics'] as const) record[category] = 0
  return record
}

function makeFormation(overrides: Partial<Formation> & { id: string; side: 'a' | 'b' }): Formation {
  return {
    name: overrides.id,
    factionId: overrides.side === 'a' ? 'rvn' : 'nlf',
    frontId: 'front-1',
    sectorId: 'test-sector',
    doctrine: 'infantry' as Doctrine,
    strength: 100,
    strengthAtFull: 100,
    equipment: zeroEquipment(),
    readiness: 100,
    status: 'active',
    engagedWith: null,
    turnsMauled: 0,
    ...overrides,
  }
}

// Rigg som garanterar att sida b:s förband blir MAULED redan i turens första
// (och enda) drabbning: attacker helt dominant (pairAdvantage klampad till 1,
// defenderLossPct = engagementAttritionPct × 2 = 12 %), försvararen startar på
// readiness strax över maulThreshold (35) — samma uträkning som
// engagement.test.ts:s "destroyed"-test, fast siktar på mauled i stället.
function riggedState(seed: string) {
  const state = createInitialState('indochina-slice', seed)
  const front = state.fronts['front-1']!
  front.terrainBonus = 0
  front.supplyStress = { a: 0, b: 0 }
  front.attacker = 'a'
  const attacker = makeFormation({
    id: 'test-attacker',
    side: 'a',
    strength: 300,
    strengthAtFull: 300,
    equipment: { ...zeroEquipment(), artillery: 2000 },
  })
  const target = makeFormation({
    id: 'test-target',
    side: 'b',
    strength: 200,
    strengthAtFull: 200,
    readiness: 40, // 40 - 12×1.8 = 18.4, under maulThreshold (35)
    equipment: { ...zeroEquipment(), infantry: 300 },
  })
  front.formations = [attacker, target]
  // fronts.ts:s stagnationsgrind läser front.equipment DIREKT (inte
  // formationerna) för att avgöra om det finns strid att lösa den här turen —
  // måste alltså synkas manuellt, samma mönster som fronts.test.ts:s
  // giveEquipment (se ANDRINGSLOGG.md, P49).
  front.equipment = {
    a: { ...attacker.equipment },
    b: { ...target.equipment },
  }
  front.strength = { a: attacker.strength, b: target.strength }
  return { state, target }
}

describe('namngiven efterfrågan (P50, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.4)', () => {
  it('(P50 klart-når) kedjan strid → mauled → order syns i tre led genom causeId', () => {
    const { state, target } = riggedState('formation-replacement-seed')

    const result = resolveTurn(state, EMPTY_SUBMISSION)

    const attackEvent = result.wire.find((e) => e.headline.includes('ATTACKS'))
    const mauledEvent = result.wire.find((e) => e.headline.includes('MAULED'))
    const orderEvent = result.wire.find((e) => e.headline.includes('REPLACING'))

    expect(attackEvent).toBeDefined()
    expect(mauledEvent).toBeDefined()
    expect(orderEvent).toBeDefined()

    // Led 1 → 2: MAULED:s causeId är drabbningens (ATTACKS) eget id.
    expect(mauledEvent!.causeId).toBe(attackEvent!.id)
    // Led 2 → 3: order-tickerns causeId är MAULED-händelsens eget id — inte
    // drabbningens direkt (samma "peka på OMEDELBAR orsak"-konvention som
    // resten av motorn, t.ex. attrition.ts:s causeId mot fronts.ts:s ticker).
    expect(orderEvent!.causeId).toBe(mauledEvent!.id)

    const namedOrder = result.state.market.openOrders.find(
      (o) => o.reason.kind === 'REPLACE_FORMATION_LOSSES' && o.reason.formationId === target.id,
    )
    expect(namedOrder).toBeDefined()
    if (namedOrder!.reason.kind === 'REPLACE_FORMATION_LOSSES') {
      expect(namedOrder!.reason.formationName).toBe(target.name)
      // reason.engagementWireId pekar på STRIDEN (led 1), inte på MAULED (led 2)
      // — en separat referens från wire-kedjans egna causeId-hopp, till nytta
      // för UI som vill visa "varför" utan att gå via wire.
      expect(namedOrder!.reason.engagementWireId).toBe(attackEvent!.id)
    }
  })

  it('(P50 klart-når) kedjan överlever pruneWire över 8 turer', () => {
    const { state } = riggedState('formation-replacement-prune-seed')

    let result = resolveTurn(state, EMPTY_SUBMISSION)
    const attackEvent = result.wire.find((e) => e.headline.includes('ATTACKS'))
    const mauledEvent = result.wire.find((e) => e.headline.includes('MAULED'))
    const orderEvent = result.wire.find((e) => e.headline.includes('REPLACING'))
    expect(attackEvent && mauledEvent && orderEvent).toBeTruthy()
    const ids = [attackEvent!.id, mauledEvent!.id, orderEvent!.id]

    // Sju turer till (WIRE_WINDOW_TURNS = 8) — kedjan skapades vid tur 0, så den
    // ska finnas kvar i state.wire (redan pruneWire:ad av resolveTurn självt)
    // så länge draft.meta.turn <= 7.
    let currentState = result.state
    for (let turn = 0; turn < 7; turn++) {
      const byId = new Set(currentState.wire.map((e) => e.id))
      for (const id of ids) expect(byId.has(id)).toBe(true)

      result = resolveTurn(currentState, EMPTY_SUBMISSION)
      currentState = result.state
    }
  })
})
