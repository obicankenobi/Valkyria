import { describe, expect, it } from 'vitest'
import { supply } from '../../src/resolve/steps/supply.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, Theatre, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

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

function setHeat(state: GameState, heat: number): void {
  for (const theatre of Object.values(state.theatres)) theatre.heat = heat
}

describe('supply (isolerat steg, spec avsnitt 3 "supplyCostIndex")', () => {
  it('rör sig mot targetIndex (100 + globalHeat × supplyHeatCoupling) men klampas till max supplyIndexMaxStep per tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 100) // targetIndex = 100 + 100×0.45 = 145, långt över ett steg från 100
    state.market.supplyCostIndex = 100

    supply(makeCtx(state, 'supply-seed').ctx)

    // supplyIndexMaxStep = 6 (balance.json) — indexet får inte hoppa hela vägen till 145 på en tur.
    expect(state.market.supplyCostIndex).toBe(106)
  })

  it('följer targetIndex utan klampning när skillnaden är mindre än supplyIndexMaxStep', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 10) // targetIndex = 100 + 10×0.45 = 104.5
    state.market.supplyCostIndex = 103

    supply(makeCtx(state, 'supply-seed').ctx)

    expect(state.market.supplyCostIndex).toBeCloseTo(104.5, 5)
  })

  // De två klamptesterna nedan injicerar avsiktligt ETT VÄRDE UTANFÖR [85, 160] —
  // inte för att formeln (spec 3.2, ordagrant) naturligt kan producera ett sådant.
  // Med heat (Pct) alltid i [0, 100] och supplyHeatCoupling 0.45 ligger targetIndex
  // alltid i [100, 145], vilket i sin tur håller ett spel som börjar på 100 kvar
  // inom [100, 145] för alltid — snävare än det KONFIGURERADE intervallet [85, 160].
  // supplyIndexMin/Max är alltså headroom för framtida balanstal (en högre
  // supplyHeatCoupling, eller en mekanik som sänker heat under 0), inte gränser
  // dagens spel någonsin når — se ANDRINGSLOGG.md (P16). Klampningskoden testas
  // ändå defensivt här: om `market.supplyCostIndex` någonsin hamnar utanför
  // intervallet (en framtida balansändring, en migrerad spardata) ska formeln
  // fortfarande respektera taket/golvet, inte bara anta att indata redan är giltig.
  it('klampar next till supplyIndexMax (160) om ett injicerat startvärde annars skulle hamna över det', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 100) // targetIndex = 145
    state.market.supplyCostIndex = 200 // orealistiskt högt startvärde, avsiktligt injicerat

    supply(makeCtx(state, 'supply-seed').ctx)

    // steg = clamp(145 − 200, −6, 6) = −6 ⇒ 194 innan klampning, klampat till 160.
    expect(state.market.supplyCostIndex).toBe(160)
  })

  it('klampar next till supplyIndexMin (85) om ett injicerat startvärde annars skulle hamna under det', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 0) // targetIndex = 100
    state.market.supplyCostIndex = 50 // orealistiskt lågt startvärde, avsiktligt injicerat

    supply(makeCtx(state, 'supply-seed').ctx)

    // steg = clamp(100 − 50, −6, 6) = 6 ⇒ 56 innan klampning, klampat till 85.
    expect(state.market.supplyCostIndex).toBe(85)
  })

  it('rör sig nedåt (mot ett lägre, men aldrig under 100, kostnadsläge) när heat är noll och indexet startar över 100', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 0) // targetIndex = 100
    state.market.supplyCostIndex = 120

    supply(makeCtx(state, 'supply-seed').ctx)

    expect(state.market.supplyCostIndex).toBe(114) // 120 − 6 (maxstep), targetIndex 100 är längre bort än ett steg
  })

  it('globalHeat är medelvärdet över ALLA teatrar, inte bara den första', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const [onlyTheatreId] = Object.keys(state.theatres)
    state.theatres[onlyTheatreId!]!.heat = 0

    const secondTheatre: Theatre = {
      id: 'second-theatre',
      name: 'Second Theatre',
      heat: 100,
      frontIds: [],
      deliveriesIntoActiveWarThisTurn: 0,
    }
    state.theatres['second-theatre'] = secondTheatre
    state.market.supplyCostIndex = 100

    supply(makeCtx(state, 'supply-seed').ctx)

    // globalHeat = (0 + 100) / 2 = 50 ⇒ targetIndex = 100 + 50×0.45 = 122.5, klampat till +6.
    expect(state.market.supplyCostIndex).toBe(106)
  })

  it('emittar en ticker med korrekt delta när indexet rör sig, ingenting när det inte gör det', () => {
    const moving = createInitialState('indochina-slice', 'seed')
    setHeat(moving, 100)
    moving.market.supplyCostIndex = 100
    const { ctx: movingCtx, emitted: movingEmitted } = makeCtx(moving, 'supply-seed')
    supply(movingCtx)

    expect(movingEmitted.length).toBeGreaterThanOrEqual(1)
    const ticker = movingEmitted.find((e) => e.severity === 'ticker')
    expect(ticker).toBeDefined()
    expect(ticker!.delta.supplyCostIndex).toBe(6)

    const still = createInitialState('indochina-slice', 'seed')
    setHeat(still, 0) // targetIndex = 100, redan där
    still.market.supplyCostIndex = 100
    const { ctx: stillCtx, emitted: stillEmitted } = makeCtx(still, 'supply-seed')
    supply(stillCtx)

    expect(stillEmitted).toEqual([])
  })

  it('emittar en report när indexet korsar 120 uppåt, och en annan när det korsar 120 nedåt', () => {
    const rising = createInitialState('indochina-slice', 'seed')
    setHeat(rising, 100)
    rising.market.supplyCostIndex = 115 // + 6 ⇒ 121, korsar 120 uppåt
    const { ctx: risingCtx, emitted: risingEmitted } = makeCtx(rising, 'supply-seed')
    supply(risingCtx)

    expect(rising.market.supplyCostIndex).toBe(121)
    const risingReport = risingEmitted.find((e) => e.severity === 'report')
    expect(risingReport).toBeDefined()
    expect(risingReport!.headline).toContain('RISES TO 121')

    const falling = createInitialState('indochina-slice', 'seed')
    setHeat(falling, 0) // targetIndex = 100
    falling.market.supplyCostIndex = 124 // − 6 ⇒ 118, korsar 120 nedåt
    const { ctx: fallingCtx, emitted: fallingEmitted } = makeCtx(falling, 'supply-seed')
    supply(fallingCtx)

    expect(falling.market.supplyCostIndex).toBe(118)
    const fallingReport = fallingEmitted.find((e) => e.severity === 'report')
    expect(fallingReport).toBeDefined()
    expect(fallingReport!.headline).toContain('FALLS TO 118')
  })

  it('emittar en report när indexet korsar 140, med samma tröskellogik', () => {
    const state = createInitialState('indochina-slice', 'seed')
    setHeat(state, 100)
    state.market.supplyCostIndex = 136 // + 6 ⇒ 142, korsar både 140 (men inte 120, redan passerad)

    const { ctx, emitted } = makeCtx(state, 'supply-seed')
    supply(ctx)

    expect(state.market.supplyCostIndex).toBe(142)
    const reports = emitted.filter((e) => e.severity === 'report')
    expect(reports).toHaveLength(1)
    expect(reports[0]!.headline).toContain('142')
  })
})
