import { describe, expect, it } from 'vitest'
import { fronts } from '../../src/resolve/steps/fronts.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Front, GameState, TechCategory, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// P39 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1): fronts() anropar
// numera engagement() internt, som skriver om front.equipment/strength UR
// FÖRBANDEN varje gång (steg 5, invarianten). Ett test som bara sätter
// front.equipment direkt (den här filens mönster sedan P6, innan förbanden
// fanns) skulle annars tyst nollställas igen — sätt därför alltid på BÅDA
// ställena, i det första förbandet på sidan.
function giveEquipment(front: Front, side: 'a' | 'b', category: TechCategory, amount: number): void {
  front.equipment[side][category] = amount
  const formation = front.formations.find((f) => f.side === side)
  if (formation) formation.equipment[category] = amount
}

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('fronts (isolerat steg, spec avsnitt 5 "Front")', () => {
  it('(P6 klart-när) en front utan materiel på någon sida stagnerar helt — position, styrka, moral och förluster orörda', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    const before = JSON.parse(JSON.stringify(front))

    const { ctx, emitted } = makeCtx(state, 'front-seed')
    fronts(ctx)

    // P36 (avsnitt 4.3): trace skrivs VARJE tur, även en stagnerad front —
    // annars får "position senaste tre turerna" hål, se orders.ts:s
    // computePressureForBuyer. Samma position upprepad, inte "orört" i strikt
    // mening, men "stagnerar" gäller fortfarande allt ANNAT nedan.
    expect(front.trace).toEqual([...before.trace, before.position])
    expect({ ...front, trace: before.trace }).toEqual(before)
    expect(emitted).toEqual([]) // inget att emitta — fronten rördes aldrig
  })

  it('(P6 klart-när) materiel levererat till sida A flyttar position mot -100 (A vunnit)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    giveEquipment(front, 'a', 'artillery', 200) // gott om övertag, garanterar genombrott
    const positionBefore = front.position

    fronts(makeCtx(state, 'front-seed').ctx)

    expect(front.position).toBeLessThan(positionBefore)
  })

  it('(P6 klart-när) materiel levererat till sida B flyttar position mot +100 (B vunnit)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    giveEquipment(front, 'b', 'artillery', 200)
    const positionBefore = front.position

    fronts(makeCtx(state, 'front-seed').ctx)

    expect(front.position).toBeGreaterThan(positionBefore)
  })

  it('position rör sig aldrig utanför [-100, 100]', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.position = 98
    giveEquipment(front, 'b', 'artillery', 500) // extremt övertag åt B

    for (let i = 0; i < 5; i++) {
      fronts(makeCtx(state, `front-seed-${i}`).ctx)
    }

    expect(front.position).toBeLessThanOrEqual(100)
  })

  it('den missgynnade sidan tar fler förluster', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    giveEquipment(front, 'a', 'artillery', 300) // sida A kraftigt överlägsen

    fronts(makeCtx(state, 'front-seed').ctx)

    expect(front.casualtiesTotal.b).toBeGreaterThan(front.casualtiesTotal.a)
  })

  it('moralen stiger för den gynnade sidan och faller för den missgynnade, klampad till [0,100]', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    const moraleABefore = front.morale.a
    const moraleBBefore = front.morale.b
    giveEquipment(front, 'a', 'artillery', 300)

    fronts(makeCtx(state, 'front-seed').ctx)

    expect(front.morale.a).toBeGreaterThan(moraleABefore)
    expect(front.morale.b).toBeLessThan(moraleBBefore)
    expect(front.morale.a).toBeLessThanOrEqual(100)
    expect(front.morale.b).toBeGreaterThanOrEqual(0)
  })

  it('emittar minst en händelse när fronten faktiskt förändras (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    giveEquipment(state.fronts['front-1']!, 'a', 'artillery', 50)

    const { ctx, emitted } = makeCtx(state, 'front-seed')
    fronts(ctx)

    expect(emitted.length).toBeGreaterThan(0)
  })

  it('flera fronter löses oberoende av varandra', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front1 = state.fronts['front-1']!
    state.fronts['front-2'] = {
      ...JSON.parse(JSON.stringify(front1)),
      id: 'front-2',
      position: 0,
    }
    giveEquipment(front1, 'a', 'artillery', 200) // bara front-1 har materiel

    fronts(makeCtx(state, 'front-seed').ctx)

    expect(front1.position).not.toBe(5) // rörde sig
    expect(state.fronts['front-2']!.position).toBe(0) // stagnerade — ingen materiel där
  })

  describe('invarianten i 5.1 (P42, upptäckt under härnessmätningen — se ANDRINGSLOGG.md)', () => {
    it('resolveFronts egen styrkeförlust speglas i formationerna, inte bara i front.strength', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      giveEquipment(front, 'a', 'artillery', 300) // sida A kraftigt överlägsen — garanterar förluster för B

      fronts(makeCtx(state, 'front-seed').ctx)

      for (const side of ['a', 'b'] as const) {
        const sideFormations = front.formations.filter((f) => f.side === side)
        expect(sideFormations.reduce((sum, f) => sum + f.strength, 0)).toBe(front.strength[side])
      }
    })
  })

  describe('trace (P36, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.3)', () => {
    it('växer med ett värde per tur och hålls kort — de fyra senaste positionerna, äldst först', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      giveEquipment(front, 'a', 'artillery', 200) // materiel, så position faktiskt rör sig

      // fronts.ts skjuter på POSITIONEN SOM DEN ÄR VID TURENS BÖRJAN (innan
      // den här turens eventuella genombrott flyttar den) — så bygg samma
      // förväntade lista i samma ordning.
      const expectedTrace = [...front.trace]
      for (let turn = 0; turn < 6; turn++) {
        expectedTrace.push(front.position)
        fronts(makeCtx(state, `trace-seed-${turn}`).ctx)
      }

      expect(front.trace).toEqual(expectedTrace.slice(-4))
      expect(front.trace.length).toBe(4)
    })
  })
})
