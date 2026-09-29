import { describe, expect, it } from 'vitest'
import { scenarioVerdict } from '../src/scenarioVerdict.js'
import { createInitialState } from '../src/state.js'
import type { ChronicleEntry, Contract, WireEvent } from '../src/types.js'

function baseContract(overrides: Partial<Contract> & Pick<Contract, 'id' | 'buyerId' | 'status'>): Contract {
  return {
    productId: 'rifles',
    quantity: 10,
    unitsDelivered: 10,
    price: 1000,
    unitCostAtSigning: 500,
    grade: 'B',
    dueTurn: 5,
    lateEventId: null,
    frontId: null,
    advancePct: 0, advancePaid: 0,
    ...overrides,
  }
}

function chronicleEntry(overrides: Partial<ChronicleEntry> & Pick<ChronicleEntry, 'turn'>): ChronicleEntry {
  return {
    kind: 'ceasefire',
    headline: `event ${overrides.turn}`,
    actorIsPlayer: false,
    causeHeadlines: [],
    doomsdayDelta: 0,
    ...overrides,
  }
}

function wireEvent(overrides: Partial<WireEvent> & Pick<WireEvent, 'id' | 'turn' | 'headline'>): WireEvent {
  return {
    severity: 'report',
    scope: 'market',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...overrides,
  }
}

describe('scenarioVerdict', () => {
  it('CAPITAL: treasury plus summan av commodityHoldings', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.house.treasury = 1_000_000
    state.house.commodityHoldings = { oil: 100, steel: 200, uranium: 0, titanium: 0, rare_earths: 50 }
    expect(scenarioVerdict(state).capital).toBe(1_000_000 + 100 + 200 + 50)
  })

  it('REACH.buyers räknar bara distinkta köpare bland UPPFYLLDA kontrakt', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.market.contracts = [
      baseContract({ id: 'c1', buyerId: 'rvn', status: 'fulfilled' }),
      baseContract({ id: 'c2', buyerId: 'rvn', status: 'fulfilled' }), // samma köpare igen
      baseContract({ id: 'c3', buyerId: 'nlf', status: 'fulfilled' }),
      baseContract({ id: 'c4', buyerId: 'laos', status: 'active' }), // inte uppfyllt — räknas inte
    ]
    expect(scenarioVerdict(state).reach.buyers).toBe(2)
  })

  it('REACH.continents härleds från scenariots teatrar (indochina-slice: bara Asien)', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(scenarioVerdict(state).reach.continents).toBe(1)
  })

  it('SHADOW räknar krönikeposter där actorIsPlayer är sant', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.chronicle = [
      chronicleEntry({ turn: 1, actorIsPlayer: true }),
      chronicleEntry({ turn: 2, actorIsPlayer: false }),
      chronicleEntry({ turn: 3, actorIsPlayer: true }),
    ]
    expect(scenarioVerdict(state).shadow).toBe(2)
  })

  it('RESTRAINT är doomsdayPeak', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.doomsdayPeak = 42
    expect(scenarioVerdict(state).restraint).toBe(42)
  })

  it('ending är null medan scenariot pågår', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    expect(scenarioVerdict(state).ending).toBeNull()
    expect(scenarioVerdict(state).nuclearEpilogue).toBeNull()
  })

  it('ending fylls i med kod, rubrik och tur när scenariot är slut', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.status = { kind: 'ended', ending: 'BUYOUT', turn: 11 }
    const ending = scenarioVerdict(state).ending
    expect(ending).not.toBeNull()
    expect(ending!.code).toBe('BUYOUT')
    expect(ending!.turn).toBe(11)
    expect(ending!.headline).toContain('SOLD')
  })

  it('turningPoints rankar krönikan efter |doomsdayDelta| fallande, högst tre', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.chronicle = [
      chronicleEntry({ turn: 1, doomsdayDelta: 1 }),
      chronicleEntry({ turn: 2, doomsdayDelta: -9 }),
      chronicleEntry({ turn: 3, doomsdayDelta: 5 }),
      chronicleEntry({ turn: 4, doomsdayDelta: 0 }),
      chronicleEntry({ turn: 5, doomsdayDelta: 3 }),
    ]
    const points = scenarioVerdict(state).turningPoints
    expect(points).toHaveLength(3)
    expect(points.map((p) => p.turn)).toEqual([2, 3, 5])
  })

  it('nuclearEpilogue är null om scenariot slutade av en annan anledning än NUCLEAR_EXCHANGE', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.status = { kind: 'ended', ending: 'INSOLVENCY', turn: 20 }
    expect(scenarioVerdict(state).nuclearEpilogue).toBeNull()
  })

  it('nuclearEpilogue byggs vid NUCLEAR_EXCHANGE: leveranser, frontnamn, utlösande handling, dödsruna', () => {
    const state = createInitialState('indochina-slice', 'test-seed')
    state.meta.turn = 20
    state.doomsday = 100
    state.status = { kind: 'ended', ending: 'NUCLEAR_EXCHANGE', turn: 20 }
    state.wire = [
      wireEvent({ id: '18-0', turn: 18, headline: 'DELIVERED 5× NAPALM TO RVN (+£500)', actorIsPlayer: true }),
      wireEvent({ id: '5-0', turn: 5, headline: 'DELIVERED 1× RIFLES TO RVN (+£10)', actorIsPlayer: true }), // för gammal (>12 turer bakåt)
      wireEvent({ id: '19-0', turn: 19, headline: 'RIVAL DELIVERS TO NLF', actorIsPlayer: false }), // inte spelarens
    ]
    state.chronicle = [
      chronicleEntry({ turn: 10, actorIsPlayer: true, doomsdayDelta: 2, headline: 'EARLIER TRIGGER' }),
      chronicleEntry({ turn: 19, actorIsPlayer: true, doomsdayDelta: 8, headline: 'FINAL TRIGGER' }),
      chronicleEntry({ turn: 19, actorIsPlayer: false, doomsdayDelta: 20, headline: 'NOT THE PLAYERS DOING' }),
    ]

    const epilogue = scenarioVerdict(state).nuclearEpilogue
    expect(epilogue).not.toBeNull()
    expect(epilogue!.deliveriesLastTwelveTurns).toEqual(['DELIVERED 5× NAPALM TO RVN (+£500)'])
    expect(epilogue!.frontNames.sort()).toEqual(['INDOCHINA', 'LAOS'])
    expect(epilogue!.triggeringEntry?.headline).toBe('FINAL TRIGGER')
    expect(epilogue!.obituary).toContain('FINAL TRIGGER')
  })
})
