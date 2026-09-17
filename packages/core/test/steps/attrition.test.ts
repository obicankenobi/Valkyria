import { describe, expect, it } from 'vitest'
import { attrition } from '../../src/resolve/steps/attrition.js'
import { fronts } from '../../src/resolve/steps/fronts.js'
import { factions } from '../../src/resolve/steps/factions.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Front, GameState, TechCategory, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// P39 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1): fronts() anropar
// numera engagement() internt, som skriver om front.equipment/strength UR
// FÖRBANDEN (steg 5, invarianten) — den här filens mönster sedan P33 (sätta
// front.equipment direkt, innan förbanden fanns) skulle annars tyst nollställas
// av det första fronts()-anropet. Sätt därför alltid på BÅDA ställena.
function seedEquipment(front: Front, side: 'a' | 'b', record: Record<TechCategory, number>): void {
  front.equipment[side] = record
  const formation = front.formations.find((f) => f.side === side)
  if (formation) formation.equipment = { ...record }
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

describe('attrition (isolerat steg, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 3)', () => {
  it('(P33 klart-när) front.equipment minskar efter en stridstur och går aldrig under noll', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    seedEquipment(front, 'a', { infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    seedEquipment(front, 'b', { infantry: 500, artillery: 10, armour: 0, aviation: 0, naval: 0, electronics: 0 })

    const { ctx } = makeCtx(state, 'attrition-seed')
    fronts(ctx)
    attrition(ctx)

    expect(front.equipment.a.infantry).toBeLessThan(500)
    expect(front.equipment.a.artillery).toBeLessThan(300)
    expect(front.equipment.b.infantry).toBeLessThan(500)
    for (const side of ['a', 'b'] as const) {
      for (const value of Object.values(front.equipment[side])) {
        expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.2 klart-när): "alltså inget
  // materielbehov" — attrition.ts:s egen gate, oberoende av fronts.ts:s (filens
  // huvudkommentar: stagnationskontrollen upprepas medvetet).
  it('(P59 klart-när) en front i ceasefire genererar inget materielbehov — equipment och materielNeed orörda trots gott om materiel', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.status = 'ceasefire'
    seedEquipment(front, 'a', { infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    seedEquipment(front, 'b', { infantry: 500, artillery: 10, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    const needBefore = { ...state.factions['rvn']!.materielNeed }

    const { ctx, emitted } = makeCtx(state, 'attrition-seed')
    fronts(ctx)
    attrition(ctx)

    expect(front.equipment.a).toEqual({ infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    expect(state.factions['rvn']!.materielNeed).toEqual(needBefore)
    expect(emitted).toEqual([])
  })

  it('(P33 klart-när) förlorande sida förbrukar mer än vinnande, mätt på en kategori båda sidor startar lika i', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    // front-1: attacker 'b', strengthA 100/strengthB 80, terrainBonus 5 (gynnar
    // försvararen 'a') — b är alltså redan missgynnad innan materielskillnaden
    // räknas in. Ge båda sidor IDENTISK infanteristyrka så att en skillnad i
    // förstörd infanteri isolerat mäter loser-multiplikatorns effekt, inte olika
    // startlager.
    seedEquipment(front, 'a', { infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    seedEquipment(front, 'b', { infantry: 500, artillery: 10, armour: 0, aviation: 0, naval: 0, electronics: 0 })

    const { ctx } = makeCtx(state, 'attrition-seed')
    fronts(ctx)
    expect(front.lastClampedAdvantage).toBeLessThan(0) // b (attacker) missgynnad — premissen testet vilar på

    attrition(ctx)

    const infantryDestroyedA = 500 - front.equipment.a.infantry
    const infantryDestroyedB = 500 - front.equipment.b.infantry
    expect(infantryDestroyedB).toBeGreaterThan(infantryDestroyedA)
  })

  it('(P33 klart-når) en front utan strid förbrukar ingenting', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    // Ingen materiel levererad än — samma stagnationsvillkor som fronts.ts.
    const before = JSON.parse(JSON.stringify(front))

    const { ctx, emitted } = makeCtx(state, 'attrition-seed')
    attrition(ctx)

    expect(front).toEqual(before)
    expect(emitted).toEqual([])
  })

  it('emittar en ticker per sida som faktiskt förlorade materiel, kedjad till turens förlust-ticker (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    seedEquipment(front, 'a', { infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    seedEquipment(front, 'b', { infantry: 500, artillery: 10, armour: 0, aviation: 0, naval: 0, electronics: 0 })

    const { ctx, emitted } = makeCtx(state, 'attrition-seed')
    fronts(ctx)
    const casualtyEventId = front.lastCasualtyEventId
    expect(casualtyEventId).not.toBeNull()

    attrition(ctx)

    const attritionTickers = emitted.filter((e) => e.headline.includes('ATTRITION'))
    expect(attritionTickers.length).toBeGreaterThan(0)
    for (const ticker of attritionTickers) {
      expect(ticker.causeId).toBe(casualtyEventId)
      expect(ticker.severity).toBe('ticker')
    }
  })

  it('flera fronter löses oberoende av varandra', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front1 = state.fronts['front-1']!
    seedEquipment(front1, 'a', { infantry: 500, artillery: 300, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    seedEquipment(front1, 'b', { infantry: 500, artillery: 10, armour: 0, aviation: 0, naval: 0, electronics: 0 })
    state.fronts['front-2'] = { ...JSON.parse(JSON.stringify(front1)), id: 'front-2' }
    state.fronts['front-2']!.equipment = { a: { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 }, b: { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 } }

    const { ctx } = makeCtx(state, 'attrition-seed')
    fronts(ctx)
    attrition(ctx)

    expect(front1.equipment.a.infantry).toBeLessThan(500) // front-1 hade strid
    expect(state.fronts['front-2']!.equipment.a.infantry).toBe(0) // front-2 stagnerade
  })

  describe('materielNeed (P34 klart-när, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.1)', () => {
    it('behovet växer med förlusterna och överstiger aldrig needCeiling', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      // Extremt övertag åt A — garanterar tunga, upprepade förluster för B
      // (front.sideB) varje tur, över tillräckligt många turer för att
      // materielNeed ska hinna nå taket om det INTE klampades.
      seedEquipment(front, 'a', { infantry: 2000, artillery: 2000, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
      seedEquipment(front, 'b', { infantry: 2000, artillery: 50, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
      const sideBFaction = state.factions[front.sideB]!

      for (let turn = 0; turn < 40; turn++) {
        const { ctx } = makeCtx(state, `materiel-need-seed-${turn}`)
        fronts(ctx)
        attrition(ctx)
        factions(ctx) // klampar mot needCeiling i samma tur, se factions.ts

        for (const category of Object.keys(sideBFaction.materielNeed) as (keyof typeof sideBFaction.materielNeed)[]) {
          expect(sideBFaction.materielNeed[category]).toBeLessThanOrEqual(balance.needCeiling)
        }
      }

      expect(sideBFaction.materielNeed.infantry).toBeGreaterThan(0)
      expect(sideBFaction.materielNeed.infantry).toBe(balance.needCeiling) // 40 tunga stridsturer räcker gott för att nå taket
    })

    it('(P45 klart-når, ETAPP4_TEKNISK_SPEC.md avsnitt 3.4) nlf:s materielNeed växer av förluster på BÅDA fronterna — samma delade behov, inte två separata', () => {
      // Faction.materielNeed är per FAKTION, inte per front (avsnitt 3.4: "Ett
      // försvarsdepartement har en budget och ett lager, inte två"). Två körningar
      // med samma frö och samma nederlag på front-1 — den ENDA skillnaden är om
      // front-laos OCKSÅ ger nlf stryk samma tur. Skillnaden i materielNeed-ökning
      // bevisar att front-laos faktiskt bidrar till samma, delade pool.
      function run(alsoLosingOnLaos: boolean): number {
        const state = createInitialState('indochina-slice', 'materiel-need-two-fronts-seed')
        seedEquipment(state.fronts['front-1']!, 'a', { infantry: 2000, artillery: 2000, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
        seedEquipment(state.fronts['front-1']!, 'b', { infantry: 2000, artillery: 50, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
        if (alsoLosingOnLaos) {
          seedEquipment(state.fronts['front-laos']!, 'a', { infantry: 2000, artillery: 2000, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
          seedEquipment(state.fronts['front-laos']!, 'b', { infantry: 2000, artillery: 50, armour: 2000, aviation: 2000, naval: 2000, electronics: 2000 })
        }
        const nlf = state.factions['nlf']!
        const before = nlf.materielNeed.infantry

        const { ctx } = makeCtx(state, 'materiel-need-two-fronts-turn')
        fronts(ctx)
        attrition(ctx)
        factions(ctx)

        return nlf.materielNeed.infantry - before
      }

      const growthFromFront1Alone = run(false)
      const growthFromBothFronts = run(true)

      expect(growthFromFront1Alone).toBeGreaterThan(0)
      expect(growthFromBothFronts).toBeGreaterThan(growthFromFront1Alone)
    })
  })
})
