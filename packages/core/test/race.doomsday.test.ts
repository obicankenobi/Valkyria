// race.doomsday.test.ts — P121 (ETAPP9_FORSLAG.md §7.4, beslut 9H, pelare 1, hård regel 9). Kapplöpningen och doomsday.
//
// Varje generationsskifte och varje gap-chock lägger lite på doomsday (via addDoomsday). Att sälja till båda sidorna påskyndar
// kapplöpningen (motmedelskedjan går fortare) och lägger på doomsday; rubriken namnger huset. En vapenvila (etapp 5) bromsar
// kapplöpningen, och gap-premierna försvinner. Huset tjänar på att kapplöpningen går fort, och det är samma fart som drar
// doomsday uppåt.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import {
  advanceRace,
  bothSidesSelling,
  checkBothSides,
  gapPremium,
  requirementCards,
} from '../src/race.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as {
  blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>
  raceStepDoomsday: number
  gapShockDoomsday: number
  bothSidesDoomsday: number
  raceAccelerationTurns: number
  gapOverpricePct: number
  falseGapChancePct: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const EAST_ART = B.blocGenerationSchedule.artillery.east[0]! // tur 4: öst tar ett steg, väst släpar → gap-chock

function makeCtx(state: GameState, seed?: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  // Ett frö vars två första chance(falseGapChancePct)-drag inte slår — rykteslotteriet (P120) ska inte störa de här testerna.
  const safe =
    seed ??
    (() => {
      for (let i = 0; i < 500; i++) {
        const r = createRng(`d${i}`, 0)
        if (!r.chance(B.falseGapChancePct) && !r.chance(B.falseGapChancePct)) return `d${i}`
      }
      throw new Error('no seed')
    })()
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(safe, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function contract(id: string, buyerId: string, productId: string, over: Partial<Contract> = {}): Contract {
  return {
    id,
    buyerId,
    productId,
    quantity: 100,
    unitsDelivered: 0,
    price: 1_000_000,
    unitCostAtSigning: 5_000,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 0,
    advancePaid: 0,
    ...over,
  }
}

describe('doomsday-koppling (P121, §7.4)', () => {
  it('ett generationsskifte lägger raceStepDoomsday på doomsday, via addDoomsday, med steg-rubriken som orsak', () => {
    const state = createInitialState('indochina-slice', 'dd-seed')
    state.meta.turn = EAST_ART
    state.race.generation.west.artillery = 2 // inget gap: ett rent steg (öst 1 -> 2 möter väst)
    const before = state.doomsday
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    // Tur 4 har tre steg (P142): artilleri öst (inget gap här — väst har redan matchat) och marin i båda blocken (parat, inget gap).
    const stepRows = emitted.filter((e) => e.severity === 'headline' && e.headline.includes('REQUIREMENTS'))
    expect(stepRows).toHaveLength(3)
    const doomsdayRows = emitted.filter((e) => e.headline.startsWith('DOOMSDAY'))
    expect(doomsdayRows.length).toBeGreaterThanOrEqual(3)
    const stepIndex = emitted.findIndex((e) => e.severity === 'headline' && e.headline.includes('ARTILLERY REQUIREMENTS'))
    expect(doomsdayRows.some((e) => e.causeId === `test-${stepIndex}`)).toBe(true)
    // 3 steg, ingen gap-chock (de två blocken är jämnstora i båda kategorierna) = 3·raceStepDoomsday
    expect(state.doomsday).toBeCloseTo(before + 3 * B.raceStepDoomsday, 9)
  })

  it('en gap-chock lägger gapShockDoomsday, med gap-rubriken som orsak', () => {
    const state = createInitialState('indochina-slice', 'dd-seed')
    state.meta.turn = EAST_ART
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    const gapIndex = emitted.findIndex((e) => e.headline.includes('GAP SHOCK') && e.headline.includes('ARTILLERY'))
    expect(gapIndex).toBeGreaterThanOrEqual(0)
    expect(emitted.some((e) => e.headline.startsWith('DOOMSDAY') && e.causeId === `test-${gapIndex}`)).toBe(true)
  })

  it('ett steg som inte sker lägger ingenting', () => {
    const state = createInitialState('indochina-slice', 'dd-seed')
    state.meta.turn = EAST_ART - 1
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.doomsday).toBe(0)
    expect(emitted).toEqual([])
  })
})

describe('att sälja till båda sidorna (P121, §7.4)', () => {
  const both = (state: GameState): void => {
    state.market.contracts = [contract('c-west', 'rvn', 'm1_rifle'), contract('c-east', 'nlf', 'm1_rifle')]
  }

  it('bothSidesSelling: sant bara när huset har ett giltigt kontrakt i kategorin med köpare i VARDERA blocket', () => {
    const state = createInitialState('indochina-slice', 'both-seed')
    expect(bothSidesSelling(state, 'infantry')).toBe(false)
    state.market.contracts = [contract('c-west', 'rvn', 'm1_rifle')]
    expect(bothSidesSelling(state, 'infantry')).toBe(false)
    both(state)
    expect(bothSidesSelling(state, 'infantry')).toBe(true)
    expect(bothSidesSelling(state, 'artillery')).toBe(false)
    state.market.contracts[1]!.status = 'voided'
    expect(bothSidesSelling(state, 'infantry')).toBe(false)
  })

  it('påskyndar kapplöpningen (båda blockens nästa steg i motmedelskategorin, eller kategorin själv om den saknar motmedel), lägger doomsday och rubriken namnger huset — en gång', () => {
    const state = createInitialState('indochina-slice', 'both-seed')
    both(state) // infanteri har inget motmedel i kedjan: kategorin själv påskyndas
    const before = state.doomsday
    const { ctx, emitted } = makeCtx(state)
    checkBothSides(ctx)
    const headline = emitted.find((e) => e.headline.includes('BOTH SIDES'))!
    expect(headline.severity).toBe('headline')
    expect(headline.headline).toContain(state.house.name.toUpperCase())
    expect(headline.headline).toContain('INFANTRY')
    expect(headline.actorIsPlayer).toBe(true)
    expect(state.race.pulled.west.infantry).toBe(B.raceAccelerationTurns)
    expect(state.race.pulled.east.infantry).toBe(B.raceAccelerationTurns)
    expect(state.doomsday).toBeCloseTo(before + B.bothSidesDoomsday, 9)
    expect(state.race.bothSides?.infantry).toBeDefined()
    const rows = emitted.length
    checkBothSides(ctx)
    expect(emitted.length).toBe(rows) // ingen upprepning
    expect(state.doomsday).toBeCloseTo(before + B.bothSidesDoomsday, 9)
  })

  it('använder motmedelskedjan när kategorin har en länk (pansar -> infanteri)', () => {
    const state = createInitialState('indochina-slice', 'both-seed')
    state.market.contracts = [contract('c-west', 'rvn', 'm3_apc'), contract('c-east', 'nlf', 'm3_apc')]
    checkBothSides(makeCtx(state).ctx)
    expect(state.race.pulled.west.infantry).toBe(B.raceAccelerationTurns)
    expect(state.race.pulled.east.infantry).toBe(B.raceAccelerationTurns)
    expect(state.race.pulled.west.armour ?? 0).toBe(0)
  })

  it('en kategori utan fler steg kan inte påskyndas, men doomsday och rubriken kommer ändå', () => {
    const state = createInitialState('indochina-slice', 'both-seed')
    both(state)
    state.race.generation.west.infantry = 1 + B.blocGenerationSchedule.infantry.west.length
    state.race.generation.east.infantry = 1 + B.blocGenerationSchedule.infantry.east.length
    const { ctx, emitted } = makeCtx(state)
    checkBothSides(ctx)
    expect(emitted.some((e) => e.headline.includes('BOTH SIDES'))).toBe(true)
    expect(state.race.pulled.west.infantry ?? 0).toBe(0)
  })
})

describe('vapenvila (P121, §7.4)', () => {
  const ceasefire = (state: GameState, frontIds: string[]): void => {
    for (const id of frontIds) state.fronts[id]!.status = 'ceasefire'
  }

  it('en vapenvila bromsar kapplöpningen: ett steg som skulle ske skjuts upp en tur per vapenviletur, med en rad', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    ceasefire(state, ['front-1'])
    state.meta.turn = EAST_ART
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.race.generation.east.artillery).toBe(1)
    expect(state.race.ceasefireTurns).toBe(1)
    expect(emitted.some((e) => e.headline.includes('CEASEFIRE') && e.headline.includes('ARMS RACE'))).toBe(true)
    // Vapenvilan upphör: steget skjuts en tur (kravkortet följer den verkliga tidtabellen).
    state.fronts['front-1']!.status = 'war'
    state.meta.turn = EAST_ART + 1
    expect(requirementCards(state).find((c) => c.bloc === 'east' && c.category === 'artillery')).toMatchObject({ inTurns: 0 }) // förfaller nu, en tur senare än schemat
    advanceRace(makeCtx(state).ctx)
    expect(state.race.generation.east.artillery).toBe(2)
    expect(state.race.ceasefireTurns).toBe(1)
  })

  it('utan vapenvila rör inget fältet och inget emitteras', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    state.meta.turn = EAST_ART - 1
    const { ctx, emitted } = makeCtx(state)
    advanceRace(ctx)
    expect(state.race.ceasefireTurns).toBeUndefined()
    expect(emitted).toEqual([])
  })

  it('gap-premierna försvinner för köpare vars fronter inte längre är i krig; andra köpare behåller dem', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    state.meta.turn = EAST_ART
    advanceRace(makeCtx(state).ctx) // öst leder i artilleri: väst (rvn, laos) betalar premie
    expect(gapPremium(state, 'rvn', 'artillery').pricePct).toBe(B.gapOverpricePct)
    expect(gapPremium(state, 'laos', 'artillery').pricePct).toBe(B.gapOverpricePct)
    ceasefire(state, ['front-1']) // rvn:s enda front
    expect(gapPremium(state, 'rvn', 'artillery')).toEqual({ pricePct: 0, advancePts: 0 })
    expect(gapPremium(state, 'laos', 'artillery').pricePct).toBe(B.gapOverpricePct) // laos har front-laos i krig
    ceasefire(state, ['front-laos'])
    expect(gapPremium(state, 'laos', 'artillery')).toEqual({ pricePct: 0, advancePts: 0 })
  })
})
