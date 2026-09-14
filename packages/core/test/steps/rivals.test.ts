import { describe, expect, it } from 'vitest'
import { rivals } from '../../src/resolve/steps/rivals.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

function makeCtx(
  state: GameState,
  submission: TurnSubmission,
  seed = 'rivals-test',
): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('rivals (isolerat steg, DESIGN.md avsnitt 12 "Rivalhus")', () => {
  it('(P8) en spelare som varken lägger bud eller använder handlingar räknas som passiv — varje rivalhus växer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    // Under rivalSupplyPlayCapitalFloor — isolerar P8:s passiva tillväxt från
    // P26:s NYA, oberoende opportunist-beteende (avsnitt 2.4, eget testblock
    // nedan), som annars också skulle röra capital i samma anrop.
    rival.capital = 1000000
    const capitalBefore = rival.capital
    const marketShareBefore = rival.marketShare

    const { ctx, emitted } = makeCtx(state, { standingOrders: [], bids: [], actions: [] })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore + balance.rivalPassiveGrowthCapital)
    expect(rival.marketShare).toBe(marketShareBefore + balance.rivalPassiveGrowthMarketShare)
    expect(emitted.some((e) => e.subjectId === 'brandt' && e.headline.includes('EXPANDS'))).toBe(true)
  })

  it('alla rivalhus växer samtidigt när spelaren är passiv, inte bara ett', () => {
    const state = createInitialState('indochina-slice', 'seed')
    // Isolerar passiv tillväxt från P26:s NYA, oberoende opportunist-/patriot-
    // beteenden (avsnitt 2.4, eget testblock nedan) — se motiveringen i testet
    // ovan.
    for (const r of Object.values(state.rivals)) r.sabotagedUntilTurn = 999
    const before = Object.fromEntries(Object.entries(state.rivals).map(([id, r]) => [id, r.capital]))

    rivals(makeCtx(state, { standingOrders: [], bids: [], actions: [] }).ctx)

    for (const [id, rival] of Object.entries(state.rivals)) {
      expect(rival.capital).toBe(before[id]! + balance.rivalPassiveGrowthCapital)
    }
  })

  it('en spelare som lägger minst ett bud räknas INTE som passiv — ingen tillväxt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital
    // P26:s NYA rivalbeteenden (avsnitt 2.4) körs OBEROENDE av spelarens
    // passivitet, till skillnad från den här (P8) passiva tillväxten — sabotera
    // varje rival här för att isolera just P8:s gamla passivitetsgrind, som är
    // det det här testet faktiskt handlar om.
    for (const r of Object.values(state.rivals)) r.sabotagedUntilTurn = 999

    const { ctx, emitted } = makeCtx(state, {
      standingOrders: [],
      bids: [{ orderId: 'does-not-matter', price: 1000, deliveryTurns: 1, grade: 'A', bribe: 0 }],
      actions: [],
    })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore)
    expect(emitted).toEqual([])
  })

  it('en spelare som använder minst en handling räknas INTE som passiv — ingen tillväxt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital
    for (const r of Object.values(state.rivals)) r.sabotagedUntilTurn = 999 // se motivering ovan

    const { ctx } = makeCtx(state, {
      standingOrders: [],
      bids: [],
      actions: [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1 } }],
    })
    rivals(ctx)

    expect(rival.capital).toBe(capitalBefore)
  })

  it('marketShare klamras aldrig över 100', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.marketShare = 100

    rivals(makeCtx(state, { standingOrders: [], bids: [], actions: [] }).ctx)

    expect(rival.marketShare).toBe(100)
  })
})

// P26 (ETAPP2_TEKNISK_SPEC.md avsnitt 2.4/2.5) — de två tidigare uttryckligen
// obyggda rivalbeteendena: leverantörskapacitet (opportunist) och egna
// incidenter (patriot), plus sabotagedUntilTurn kopplad till en misslyckad
// egen incident (avsnitt 2.5).
// Icke-passiv (minst en handling) — isolerar P26:s NYA, passivitetsoberoende
// beteenden från P8:s gamla passiva tillväxt (som annars ALLTID skulle röra
// capital i samma anrop och göra de exakta beloppen nedan meningslösa).
const NON_PASSIVE: TurnSubmission = {
  standingOrders: [],
  bids: [],
  actions: [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1 } }],
}

describe('rivals — P26: leverantörskapacitet (opportunist, avsnitt 2.4)', () => {
  it('(P26 klart-når) en opportunist-rival med kapital över floor höjer market.supplyCostIndex, tappar capital, och kedjan går att läsa i wire', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'brandt') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['brandt']! // opportunist, kapital 5 000 000 > floor
    const indexBefore = state.market.supplyCostIndex
    const capitalBefore = rival.capital

    const { ctx, emitted } = makeCtx(state, NON_PASSIVE)
    rivals(ctx)

    expect(state.market.supplyCostIndex).toBe(indexBefore + balance.rivalSupplyPlayIndexPenalty)
    expect(rival.capital).toBe(capitalBefore - balance.rivalSupplyPlayCost)
    expect(rival.supplyPlayCooldownUntilTurn).toBe(state.meta.turn + balance.rivalSupplyPlayCooldownTurns)
    const playEvent = emitted.find((e) => e.subjectId === 'brandt' && e.headline.includes('SUPPLY MARKET'))
    expect(playEvent).toBeDefined()
    expect(playEvent!.delta.supplyCostIndex).toBe(balance.rivalSupplyPlayIndexPenalty)
  })

  it('en opportunist-rival med kapital UNDER floor spelar inte alls', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'brandt') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['brandt']!
    rival.capital = 1000000 // klart under rivalSupplyPlayCapitalFloor (2 000 000)
    const indexBefore = state.market.supplyCostIndex

    rivals(makeCtx(state, NON_PASSIVE).ctx)

    expect(state.market.supplyCostIndex).toBe(indexBefore)
  })

  it('kapital exakt på floor spelar INTE — gränsen är strikt "över", inte "över eller lika med"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'brandt') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['brandt']!
    rival.capital = balance.rivalSupplyPlayCapitalFloor
    const indexBefore = state.market.supplyCostIndex

    rivals(makeCtx(state, NON_PASSIVE).ctx)

    expect(state.market.supplyCostIndex).toBe(indexBefore)
  })

  it('en rival som redan är i cooldown spelar inte igen förrän cooldownen passerat', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'brandt') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['brandt']!
    state.meta.turn = 3
    rival.supplyPlayCooldownUntilTurn = 5 // > aktuell tur — fortfarande i cooldown

    const indexBefore = state.market.supplyCostIndex
    rivals(makeCtx(state, NON_PASSIVE).ctx)

    expect(state.market.supplyCostIndex).toBe(indexBefore)
    expect(rival.capital).toBe(5000000) // orört

    // Turen efter att cooldownen passerat: spelar igen.
    state.meta.turn = 5
    rivals(makeCtx(state, NON_PASSIVE, 'rivals-test-2').ctx)
    expect(state.market.supplyCostIndex).toBe(indexBefore + balance.rivalSupplyPlayIndexPenalty)
  })

  it('market.supplyCostIndex klamras aldrig över supplyIndexMax', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'brandt') state.rivals[id]!.sabotagedUntilTurn = 999
    state.market.supplyCostIndex = balance.supplyIndexMax // redan vid taket

    rivals(makeCtx(state, NON_PASSIVE).ctx)

    expect(state.market.supplyCostIndex).toBe(balance.supplyIndexMax)
  })
})

describe('rivals — P26: egna incidenter (patriot, avsnitt 2.4/2.5)', () => {
  it('(P26/P29 klart-når) en misslyckad rivalincident kan höja en aktiv stations exposure via felattribution mot spelaren — INTE house.exposureEvents direkt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'meridian') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['meridian']! // patriot
    const station = state.house.stations[0]!
    expect(station.status).toBe('active')
    const exposureBefore = station.exposure
    expect(state.house.exposureEvents).toHaveLength(0)

    // incident-probe-51: attempt lyckas, incidenten misslyckas, felattribution
    // pekar på spelaren — hittad genom seed-sökning (samma metod som andra
    // seed-beroende tester i den här kodbasen, se ANDRINGSLOGG.md).
    const { ctx, emitted } = makeCtx(state, { standingOrders: [], bids: [], actions: [] }, 'incident-probe-51')
    rivals(ctx)

    expect(emitted.some((e) => e.headline.includes('ATTRIBUTION FAILED'))).toBe(true)
    expect(emitted.some((e) => e.headline.includes('EXPOSURE RISES'))).toBe(true)
    // Avsnitt 4.1 (P29): misslyckad attribution höjer exposure — bränner INTE
    // en station direkt och pushar INTE house.exposureEvents.
    expect(station.exposure).toBe(exposureBefore + balance.misattributionExposurePenalty)
    expect(state.house.exposureEvents).toHaveLength(0)
    // Avsnitt 2.5: en misslyckad egen incident sabotagerar rivalen SJÄLV också.
    expect(rival.sabotagedUntilTurn).toBe(state.meta.turn + balance.rivalSabotageCooldownTurns)
  })

  it('en saboterad rival lägger inga nya incidentförsök (och inga bud, testat i bidding.test.ts)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const id of Object.keys(state.rivals)) if (id !== 'meridian') state.rivals[id]!.sabotagedUntilTurn = 999
    const rival = state.rivals['meridian']!
    rival.sabotagedUntilTurn = 999 // redan saboterad

    const { ctx } = makeCtx(state, { standingOrders: [], bids: [], actions: [] }, 'incident-probe-51')
    rivals(ctx)

    expect(state.house.exposureEvents).toHaveLength(0) // inget nytt incidentförsök alls
  })
})
