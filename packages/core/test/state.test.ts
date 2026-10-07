import { describe, expect, it } from 'vitest'
import { cloneState, createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import { allLines } from '../src/works.js'

describe('createInitialState', () => {
  it('JSON-serialiserar och deserialiserar bitvis identiskt', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const roundTripped = JSON.parse(JSON.stringify(state))
    expect(roundTripped).toEqual(state)
  })

  it('är deterministisk för samma scenario och seed', () => {
    const a = createInitialState('indochina-slice', 'test-seed')
    const b = createInitialState('indochina-slice', 'test-seed')
    expect(b).toEqual(a)
  })

  // P88 (ETAPP7_TEKNISK_SPEC.md §9/§13): "createInitialState tar valfria
  // startval; standardvalen ger bitvis identisk golden." De två testen
  // nedan verifierar båda hälfterna av det påståendet ordagrant.
  it('utan startChoices ger exakt samma tillstånd som innan parametern fanns (golden-säkerheten)', () => {
    const withoutArg = createInitialState('indochina-slice', 'test-seed')
    const withUndefined = createInitialState('indochina-slice', 'test-seed', undefined)
    const withEmptyObject = createInitialState('indochina-slice', 'test-seed', {})
    expect(withUndefined).toEqual(withoutArg)
    expect(withEmptyObject).toEqual(withoutArg)
  })

  it('startChoices skriver över husets namn, hemstat och specialisering, resten oförändrat', () => {
    const defaultState = createInitialState('indochina-slice', 'test-seed')
    const chosen = createInitialState('indochina-slice', 'test-seed', {
      houseName: 'Meridian Arms',
      homeState: 'east',
      specialisation: 'naval',
    })

    expect(chosen.house.name).toBe('Meridian Arms')
    expect(chosen.house.homeState).toBe('east')
    expect(chosen.house.specialisation).toBe('naval')
    // techLevel-bonusen följer den VALDA specialiseringen, inte scenariots
    // default (artillery) — samma techLevelWithSpecialisationBonus-formel,
    // bara given ett annat argument.
    expect(chosen.house.techLevel.naval).toBeGreaterThan(defaultState.house.techLevel.naval)
    // artillery är scenariots DEFAULT-specialisering (indochina-slice.json) —
    // defaultState:s artillery är alltså BOOSTAD, medan chosen:s (naval
    // vald i stället) bara har grundnivån. Samma tal chosen:s egen
    // grundnivå-kategori (t.ex. infantry, som ingen av de två boostar) delar.
    expect(chosen.house.techLevel.artillery).toBe(chosen.house.techLevel.infantry)
    expect(chosen.house.techLevel.artillery).toBeLessThan(defaultState.house.techLevel.artillery)
    // Allt annat (kassa, linjer, station, styrelsemål) är opåverkat.
    expect(chosen.house.treasury).toBe(defaultState.house.treasury)
    expect(allLines(chosen.house)).toEqual(allLines(defaultState.house))
    expect(chosen.house.stations).toEqual(defaultState.house.stations)
    expect(chosen.house.boardTarget).toEqual(defaultState.house.boardTarget)
  })

  it('en delvis ifylld startChoices faller tillbaka på scenariots default för de utelämnade fälten', () => {
    const defaultState = createInitialState('indochina-slice', 'test-seed')
    const chosen = createInitialState('indochina-slice', 'test-seed', { houseName: 'Only The Name' })

    expect(chosen.house.name).toBe('Only The Name')
    expect(chosen.house.homeState).toBe(defaultState.house.homeState)
    expect(chosen.house.specialisation).toBe(defaultState.house.specialisation)
  })

  it('startar på tur 0 med rngCursor 0 och sparar seeden', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.meta.turn).toBe(0)
    expect(state.meta.rngCursor).toBe(0)
    expect(state.meta.seed).toBe('test-seed')
    expect(state.meta.scenarioId).toBe('indochina-slice')
    expect(state.status).toEqual({ kind: 'active' })
  })

  it('bygger etapp 4:s omfång: två fronter, två teatrar, tre faktioner, tre rivaler, två linjer (startpaketet, P170), en station', () => {
    // P45 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.4): front-1 (rvn/nlf, INDOCHINA) +
    // front-laos (laos/nlf, LAOS, egen hetkurva) — var "en front, en teater" i
    // etapp 1-3, se docs/DESIGN.md avsnitt 16 för ändringen.
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(Object.keys(state.fronts)).toHaveLength(2)
    expect(Object.keys(state.theatres)).toHaveLength(2)
    expect(Object.keys(state.factions)).toHaveLength(3)
    expect(Object.keys(state.rivals)).toHaveLength(3)
    expect(allLines(state.house)).toHaveLength(2)
    expect(state.house.works.map((w) => w.kind)).toEqual(['assembly', 'laboratory', 'design'])
    expect(state.house.stations).toHaveLength(1)
  })

  it('inga öppna ordrar eller kontrakt vid start', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.market.openOrders).toEqual([])
    expect(state.market.contracts).toEqual([])
    expect(state.market.supplyCostIndex).toBe(100)
  })

  it('doomsday och wire startar tomma', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.doomsday).toBe(0)
    expect(state.doomsdayPeak).toBe(0)
    expect(state.wire).toEqual([])
  })

  it('(P30) styrelsemålets prognoskontroller ligger på tur 6, 10, 14 och 18', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(state.house.boardTarget.reviewTurns).toEqual([6, 10, 14, 18])
    expect(state.house.boardTarget.dueTurn).toBe(20)
    expect(state.house.boardTarget.reviewsFailed).toBe(0)
    expect(state.house.boardTarget.lastReviewTurn).toBeNull()
  })

  it('frontens sidor pekar på faktioner som faktiskt finns', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const front = Object.values(state.fronts)[0]
    expect(front).toBeDefined()
    expect(state.factions[front!.sideA]).toBeDefined()
    expect(state.factions[front!.sideB]).toBeDefined()
  })

  it('(P38) förbandens styrka summerar till frontens startstyrkor per sida, och invarianten i 5.1 håller (0 = 0) vid start', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const front = Object.values(state.fronts)[0]!
    expect(front.formations.length).toBeGreaterThanOrEqual(6)
    expect(front.formations.length).toBeLessThanOrEqual(10)

    const strengthA = front.formations.filter((f) => f.side === 'a').reduce((sum, f) => sum + f.strength, 0)
    const strengthB = front.formations.filter((f) => f.side === 'b').reduce((sum, f) => sum + f.strength, 0)
    expect(strengthA).toBe(front.strength.a)
    expect(strengthB).toBe(front.strength.b)

    for (const side of ['a', 'b'] as const) {
      const sideFormations = front.formations.filter((f) => f.side === side)
      for (const category of Object.keys(front.equipment[side]) as (keyof typeof front.equipment.a)[]) {
        const summed = sideFormations.reduce((sum, f) => sum + f.equipment[category], 0)
        expect(summed).toBe(front.equipment[side][category])
      }
      for (const formation of sideFormations) {
        expect(formation.readiness).toBe(100)
        expect(formation.status).toBe('active')
        expect(formation.engagedWith).toBeNull()
        expect(formation.frontId).toBe(front.id)
      }
    }
  })

  it('kastar på okänt scenarioId', () => {
    expect(() => createInitialState('does-not-exist', 'test-seed')).toThrow()
  })

  // P53a (ETAPP5_TEKNISK_SPEC.md avsnitt 2.1/8, klart-når): krigförande arméer
  // har redan ett stående upphandlingsbehov vid partistart, inte tomma förråd
  // — annars genererar orders.ts inga ordrar alls turerna 1-4 (mätt: se
  // docs/ANDRINGSLOGG.md, 2026-09-17), medan husets fasta kostnader redan
  // löper från tur 1.
  it('(P53a klart-når) varje faktions materielNeed seedas till orderTriggerThreshold, inte 0', () => {
    const state = createInitialState('indochina-slice', 'test-seed')

    for (const faction of Object.values(state.factions)) {
      expect(faction.materielNeed).toEqual(balance.orderTriggerThreshold)
    }
  })

  it('varje faktions materielNeed är ett eget objekt — mutation hos en läcker inte till en annan', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const factions = Object.values(state.factions)
    expect(factions.length).toBeGreaterThan(1)

    factions[0]!.materielNeed.artillery = 999
    for (const faction of factions.slice(1)) {
      expect(faction.materielNeed.artillery).not.toBe(999)
    }
  })
})

describe('cloneState', () => {
  it('ger en värdemässigt identisk men oberoende djup kopia', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    const clone = cloneState(state)

    expect(clone).toEqual(state)
    expect(clone).not.toBe(state)
    expect(clone.house).not.toBe(state.house)
    expect(clone.house.works).not.toBe(state.house.works)
    expect(clone.house.works[0]!.lines).not.toBe(state.house.works[0]!.lines)
    expect(clone.factions).not.toBe(state.factions)

    clone.house.treasury = 0
    expect(state.house.treasury).not.toBe(0)
  })
})
