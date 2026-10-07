// standingOrders.test.ts — P100 (ETAPP8_FORSLAG.md §5.1). Stående order i tre slag: linjeuppdrag,
// leverantörsavtal och stationsläge. En ändring kostar ingen handling, gäller från NÄSTA tur och ligger
// kvar. Tre larm emittar en WireEvent med causeId. Befintliga botar skickar inga stående order, så
// deras beteende ska vara oförändrat (verifieras av golden-omfrysningen, se ANDRINGSLOGG).
import { describe, expect, it } from 'vitest'
import { applyActions } from '../src/resolve/steps/applyActions.js'
import { production } from '../src/resolve/steps/production.js'
import { economy } from '../src/resolve/steps/economy.js'
import { resolveTurn } from '../src/resolve/index.js'
import { validateStandingOrderChange, standingStationMode, standingLineOrder } from '../src/standingOrders.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import { getProduct, computeUnitCostNow } from '../src/pricing.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, PlayerAction, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'
import { allLines } from '../src/works.js'

const B = balance as unknown as {
  overtimeCapacityPct: number
  overtimeUnitCostFactor: number
  supplyAgreementMinTurns: number
  supplyAgreementMaxTurns: number
  supplyLossStreakTurns: number
  stationQuietUpkeepFactor: number
  stationActiveUpkeepFactor: number
  stationActiveExposurePerTurn: number
  stationQuietExposureDecay: number
  stationActiveDepthTurns: number
  exposureBurnThreshold: number
  fixedCosts: { stationUpkeep: number }
}

type Emitted = Omit<WireEvent, 'id' | 'turn'> & { id: string }

function makeCtx(
  state: GameState,
  submission: Partial<TurnSubmission> = {},
  seed = 'so-seed',
): { ctx: ResolveContext; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: { standingOrders: [], bids: [], actions: [], ...submission },
    rng: createRng(seed, 0),
    emit: (e) => {
      const id = `w-${seq++}`
      emitted.push({ ...e, id })
      return id
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'so-state')
  state.meta.turn = 5
  return state
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-so-0',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 1000,
    unitsDelivered: 0,
    price: 400_000,
    unitCostAtSigning: 200,
    grade: 'A',
    dueTurn: 15,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 0,
    advancePaid: 0,
    ...overrides,
  }
}

const LINE: StandingOrderChange = { kind: 'LINE', lineId: 'line-1', category: 'artillery', shift: 'overtime' }
const SUPPLY: StandingOrderChange = { kind: 'SUPPLY', op: 'SET', commodity: 'steel', volumePerTurn: 40_000, durationTurns: 5 }
const STATION: StandingOrderChange = { kind: 'STATION', stationId: 'station-1', mode: 'active' }

describe('validering', () => {
  it('godkänner de tre slagen med giltiga värden', () => {
    const state = fresh()
    for (const change of [LINE, SUPPLY, STATION]) expect(validateStandingOrderChange(state, state, change)).toEqual({ ok: true })
  })

  it('LINE: okänd linje, ogiltig kategori och ogiltigt skift avvisas', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, { ...LINE, lineId: 'line-99' } as StandingOrderChange)).toMatchObject({ ok: false, reason: 'unknown line' })
    expect(validateStandingOrderChange(state, state, { ...LINE, category: 'magic' } as unknown as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...LINE, shift: 'triple' } as unknown as StandingOrderChange)).toMatchObject({ ok: false })
    // "fritt" (category null) är giltigt
    expect(validateStandingOrderChange(state, state, { ...LINE, category: null })).toEqual({ ok: true })
  })

  it('SUPPLY: råvara, volym och löptid (4–8) valideras, och ett andra avtal för samma råvara avvisas', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, commodity: 'gold' } as unknown as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, volumePerTurn: 0 } as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, volumePerTurn: Number.NaN } as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, durationTurns: B.supplyAgreementMinTurns - 1 } as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, durationTurns: B.supplyAgreementMaxTurns + 1 } as StandingOrderChange)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...SUPPLY, durationTurns: 4.5 } as StandingOrderChange)).toMatchObject({ ok: false })

    applyActions(makeCtx(state, { standingOrders: [SUPPLY] }).ctx)
    expect(validateStandingOrderChange(state, state, SUPPLY)).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { kind: 'SUPPLY', op: 'CANCEL', commodity: 'steel' })).toEqual({ ok: true })
    expect(validateStandingOrderChange(state, state, { kind: 'SUPPLY', op: 'CANCEL', commodity: 'oil' })).toMatchObject({ ok: false })
  })

  it('STATION: okänd eller bränd station och ogiltigt läge avvisas', () => {
    const state = fresh()
    expect(validateStandingOrderChange(state, state, { ...STATION, stationId: 'station-9' })).toMatchObject({ ok: false })
    expect(validateStandingOrderChange(state, state, { ...STATION, mode: 'loud' } as unknown as StandingOrderChange)).toMatchObject({ ok: false })
    state.house.stations[0]!.status = 'burned'
    expect(validateStandingOrderChange(state, state, STATION)).toMatchObject({ ok: false })
  })
})

describe('en ändring kostar ingen handling och gäller från nästa tur', () => {
  it('handlingstaket rörs inte: tre handlingar går igenom även med tre stående order i samma inskickning', () => {
    const state = fresh()
    const actions: PlayerAction[] = [
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
    ]
    state.house.creditLimit = 1_000_000
    const { ctx } = makeCtx(state, { standingOrders: [LINE, SUPPLY, STATION], actions })
    applyActions(ctx)
    expect(ctx.rejected).toEqual([])
    expect(state.house.debt).toBe(3000)
  })

  it('en accepterad ändring emitteras (hård regel 4) och stämplas med sinceTurn = tur + 1', () => {
    const state = fresh()
    const { ctx, emitted } = makeCtx(state, { standingOrders: [LINE, STATION] })
    applyActions(ctx)
    expect(state.house.standingOrders.lines['line-1']).toMatchObject({ category: 'artillery', shift: 'overtime', sinceTurn: 6 })
    expect(state.house.standingOrders.stations['station-1']).toMatchObject({ mode: 'active', sinceTurn: 6 })
    expect(emitted.filter((e) => e.headline.includes('STANDING ORDER'))).toHaveLength(2)
  })

  it('en ogiltig ändring hamnar i rejected och rör ingenting', () => {
    const state = fresh()
    const { ctx } = makeCtx(state, { standingOrders: [{ ...LINE, lineId: 'line-99' } as StandingOrderChange] })
    applyActions(ctx)
    expect(ctx.rejected).toHaveLength(1)
    expect(ctx.rejected[0]!.reason).toBe('unknown line')
    expect(state.house.standingOrders.lines).toEqual({})
  })

  it('läget ligger kvar tills det ändras, och effekten börjar först turen efter (standingLineOrder/standingStationMode)', () => {
    const state = fresh()
    applyActions(makeCtx(state, { standingOrders: [LINE, STATION] }).ctx)
    expect(standingLineOrder(state.house, 'line-1', 5)).toBeNull()
    expect(standingLineOrder(state.house, 'line-1', 6)).toMatchObject({ shift: 'overtime' })
    expect(standingLineOrder(state.house, 'line-1', 19)).toMatchObject({ shift: 'overtime' })
    expect(standingStationMode(state.house, 'station-1', 5)).toBe('normal')
    expect(standingStationMode(state.house, 'station-1', 6)).toBe('active')
  })

  it('ett sparat parti utan standingOrders räknas som tomt, kraschar inte', () => {
    const state = fresh()
    delete (state.house as unknown as { standingOrders?: unknown }).standingOrders
    expect(() => applyActions(makeCtx(state, { standingOrders: [] }).ctx)).not.toThrow()
    expect(standingLineOrder(state.house, 'line-1', 9)).toBeNull()
    expect(standingStationMode(state.house, 'station-1', 9)).toBe('normal')
    expect(() => applyActions(makeCtx(state, { standingOrders: [LINE] }).ctx)).not.toThrow()
    expect(state.house.standingOrders.lines['line-1']).toBeDefined()
  })
})

describe('linjeuppdrag', () => {
  it('en linje med en kategori tar bara kontrakt i den kategorin; "fritt" behåller den automatiska tilldelningen', () => {
    const state = fresh()
    state.market.contracts = [contract({ productId: 'm1_rifle' })] // infantry
    for (const line of allLines(state.house)) {
      state.house.standingOrders.lines[line.id] = { category: 'artillery', shift: 'normal', sinceTurn: 1 }
    }
    production(makeCtx(state).ctx)
    expect(allLines(state.house).every((l) => l.assignedContractId === null)).toBe(true)

    state.house.standingOrders.lines['line-1'] = { category: 'infantry', shift: 'normal', sinceTurn: 1 }
    production(makeCtx(state).ctx)
    expect(allLines(state.house).find((l) => l.id === 'line-1')!.assignedContractId).toBe('contract-so-0')

    const freeState = fresh()
    freeState.market.contracts = [contract()]
    freeState.house.standingOrders.lines['line-1'] = { category: null, shift: 'normal', sinceTurn: 1 }
    production(makeCtx(freeState).ctx)
    expect(allLines(freeState.house).some((l) => l.assignedContractId === 'contract-so-0')).toBe(true)
  })

  it('övertid ger capacityPct 125 (linjens första skrivare) och en högre styckkostnad; normalt skift återställer 100', () => {
    const normal = fresh()
    normal.market.contracts = [contract({ quantity: 1_000_000 })]
    const overtime = fresh()
    overtime.market.contracts = [contract({ quantity: 1_000_000 })]
    overtime.house.standingOrders.lines['line-1'] = { category: null, shift: 'overtime', sinceTurn: 1 }

    const t0 = normal.house.treasury
    const t1 = overtime.house.treasury
    production(makeCtx(normal).ctx)
    production(makeCtx(overtime, {}, 'overtime-no-breakdown-seed').ctx)

    const lineN = allLines(normal.house).find((l) => l.id === 'line-1')!
    const lineO = allLines(overtime.house).find((l) => l.id === 'line-1')!
    expect(lineN.capacityPct).toBe(100)
    expect(lineO.capacityPct).toBe(B.overtimeCapacityPct)
    const perUnit = computeUnitCostNow(getProduct('m1_rifle'), 'A', normal.market.commodities)
    const producedN = normal.market.shipments.filter((s) => s.contractId === 'contract-so-0').reduce((n, s) => n + s.units, 0)
    const producedO = overtime.market.shipments.filter((s) => s.contractId === 'contract-so-0').reduce((n, s) => n + s.units, 0)
    if (lineO.status !== 'blocked') {
      expect(producedO).toBeGreaterThan(producedN)
      const spentN = t0 - normal.house.treasury
      const spentO = t1 - overtime.house.treasury
      expect(spentO / producedO).toBeCloseTo(perUnit * B.overtimeUnitCostFactor, 0)
      expect(spentN / producedN).toBeCloseTo(perUnit, 0)
    }

    // Tillbaka till normalt skift: capacityPct 100 igen.
    overtime.house.standingOrders.lines['line-1'] = { category: null, shift: 'normal', sinceTurn: 1 }
    production(makeCtx(overtime).ctx)
    expect(allLines(overtime.house).find((l) => l.id === 'line-1')!.capacityPct).toBe(100)
  })

  it('övertid kan ge ett haveri (liten risk, via rng): en linje står stilla en tur och det syns i wire — men aldrig utan övertid', () => {
    let breakdowns = 0
    for (let i = 0; i < 300; i++) {
      const state = fresh()
      state.market.contracts = [contract()]
      state.house.standingOrders.lines['line-1'] = { category: null, shift: 'overtime', sinceTurn: 1 }
      const { ctx, emitted } = makeCtx(state, {}, `breakdown-${i}`)
      production(ctx)
      if (emitted.some((e) => e.headline.includes('BREAKS DOWN'))) {
        breakdowns++
        expect(state.market.shipments.filter((s) => s.contractId === 'contract-so-0')).toHaveLength(0)
      }
    }
    expect(breakdowns).toBeGreaterThan(0)
    expect(breakdowns).toBeLessThan(300 * 0.3) // "liten"

    for (let i = 0; i < 100; i++) {
      const state = fresh()
      state.market.contracts = [contract()]
      const { ctx, emitted } = makeCtx(state, {}, `breakdown-${i}`)
      production(ctx)
      expect(emitted.some((e) => e.headline.includes('BREAKS DOWN'))).toBe(false)
    }
  })

  it('en order som ännu inte gäller (sinceTurn i framtiden) påverkar inte produktionen', () => {
    const state = fresh()
    state.market.contracts = [contract()]
    state.house.standingOrders.lines['line-1'] = { category: 'artillery', shift: 'overtime', sinceTurn: 6 }
    production(makeCtx(state).ctx)
    expect(allLines(state.house).find((l) => l.id === 'line-1')!.capacityPct).toBe(100)
    expect(allLines(state.house).some((l) => l.assignedContractId === 'contract-so-0')).toBe(true)
  })

  it('LARM 1: en linje med ett stående uppdrag som tillverkade mot ett annullerat kontrakt varnar, med causeId', () => {
    const state = fresh()
    const voided = contract({ status: 'voided', lateEventId: 'evt-late-1' })
    state.market.contracts = [voided]
    const line = allLines(state.house).find((l) => l.id === 'line-1')!
    line.assignedContractId = voided.id
    line.productId = voided.productId
    line.status = 'running'
    state.house.standingOrders.lines['line-1'] = { category: null, shift: 'normal', sinceTurn: 1 }

    const { ctx, emitted } = makeCtx(state)
    production(ctx)

    const alarm = emitted.find((e) => e.headline.includes('VOIDED CONTRACT'))
    expect(alarm).toBeDefined()
    expect(alarm!.severity).toBe('headline')
    expect(alarm!.causeId).toBe('evt-late-1')
    expect(line.assignedContractId).toBeNull()

    // Ingen larm för en linje utan stående order.
    const plain = fresh()
    plain.market.contracts = [voided]
    const plainLine = allLines(plain.house).find((l) => l.id === 'line-1')!
    plainLine.assignedContractId = voided.id
    plainLine.status = 'running'
    const second = makeCtx(plain)
    production(second.ctx)
    expect(second.emitted.some((e) => e.headline.includes('VOIDED CONTRACT'))).toBe(false)
  })
})

describe('leverantörsavtal', () => {
  function withAgreement(state: GameState, over: Partial<{ locked: number; start: number; end: number; losses: number }> = {}): void {
    state.house.standingOrders.supply = [
      {
        id: 'supply-steel',
        commodity: 'steel',
        volumePerTurn: 40_000,
        lockedIndex: over.locked ?? 100,
        startTurn: over.start ?? 5,
        endTurn: over.end ?? 9,
        lossStreak: over.losses ?? 0,
      },
    ]
  }

  it('SET lägger avtalet med dagens index som lås och start nästa tur', () => {
    const state = fresh()
    state.market.commodities.steel = 130
    applyActions(makeCtx(state, { standingOrders: [SUPPLY] }).ctx)
    expect(state.house.standingOrders.supply).toEqual([
      expect.objectContaining({ commodity: 'steel', volumePerTurn: 40_000, lockedIndex: 130, startTurn: 6, endTurn: 10, lossStreak: 0 }),
    ])
  })

  it('varje tur betalas volymen i kassan (huvudboken: commodityPurchase) och innehavet krediteras volym × index/lås', () => {
    const state = fresh()
    withAgreement(state, { locked: 100 })
    state.market.commodities.steel = 125
    const treasury = state.house.treasury
    const holdings = state.house.commodityHoldings.steel

    const { ctx, emitted } = makeCtx(state)
    production(ctx)

    expect(state.house.treasury).toBe(treasury - 40_000)
    expect(state.house.commodityHoldings.steel).toBe(holdings + 50_000) // 40 000 × 125/100
    expect(state.ledger[state.ledger.length - 1]!.expenses.commodityPurchase).toBe(40_000)
    expect(emitted.some((e) => e.headline.includes('SUPPLY AGREEMENT') && e.delta.treasury === -40_000)).toBe(true)
  })

  it('stiger indexet tjänar spelaren, sjunker det förlorar spelaren — och förlusttrean räknas i följd', () => {
    const state = fresh()
    withAgreement(state, { locked: 100, start: 1, end: 20 })
    state.market.commodities.steel = 80
    for (let turn = 5; turn <= 7; turn++) {
      state.meta.turn = turn
      production(makeCtx(state).ctx)
    }
    expect(state.house.standingOrders.supply[0]!.lossStreak).toBe(3)
    state.market.commodities.steel = 110
    state.meta.turn = 8
    production(makeCtx(state).ctx)
    expect(state.house.standingOrders.supply[0]!.lossStreak).toBe(0) // vinstturen bryter följden
  })

  it('LARM 2: tredje förlustturen i rad ger en rubrik med causeId = avräkningshändelsen', () => {
    const state = fresh()
    withAgreement(state, { locked: 100, start: 1, end: 20, losses: B.supplyLossStreakTurns - 1 })
    state.market.commodities.steel = 70
    const { ctx, emitted } = makeCtx(state)
    production(ctx)
    const settlement = emitted.find((e) => e.headline.includes('SUPPLY AGREEMENT') && e.severity === 'ticker')
    const alarm = emitted.find((e) => e.headline.includes('LOSING'))
    expect(settlement).toBeDefined()
    expect(alarm).toBeDefined()
    expect(alarm!.severity).toBe('headline')
    expect(alarm!.causeId).toBe(settlement!.id)
  })

  it('ingen larm före den tredje förlustturen', () => {
    const state = fresh()
    withAgreement(state, { locked: 100, start: 1, end: 20, losses: 0 })
    state.market.commodities.steel = 70
    const { ctx, emitted } = makeCtx(state)
    production(ctx)
    expect(emitted.some((e) => e.headline.includes('LOSING'))).toBe(false)
  })

  it('avtalet betalar inte före startTurn, och löper ut efter endTurn med en synlig händelse', () => {
    const state = fresh()
    withAgreement(state, { start: 7, end: 8 })
    const treasury = state.house.treasury
    production(makeCtx(state).ctx) // tur 5 < start
    expect(state.house.treasury).toBe(treasury)

    state.meta.turn = 8
    production(makeCtx(state).ctx)
    expect(state.house.treasury).toBe(treasury - 40_000)

    state.meta.turn = 9
    const { ctx, emitted } = makeCtx(state)
    production(ctx)
    expect(state.house.standingOrders.supply).toEqual([])
    expect(emitted.some((e) => e.headline.includes('EXPIRES'))).toBe(true)
  })

  it('CANCEL avslutar avtalet från nästa tur (dagens betalning görs, sedan är det borta)', () => {
    const state = fresh()
    withAgreement(state, { start: 1, end: 20 })
    applyActions(makeCtx(state, { standingOrders: [{ kind: 'SUPPLY', op: 'CANCEL', commodity: 'steel' }] }).ctx)
    expect(state.house.standingOrders.supply[0]!.endTurn).toBe(5)
    production(makeCtx(state).ctx)
    state.meta.turn = 6
    const treasury = state.house.treasury
    production(makeCtx(state).ctx)
    expect(state.house.standingOrders.supply).toEqual([])
    expect(state.house.treasury).toBe(treasury)
  })

  it('ett avtal som ännu inte börjat kan avbrytas och försvinner direkt', () => {
    const state = fresh()
    applyActions(makeCtx(state, { standingOrders: [SUPPLY] }).ctx)
    applyActions(makeCtx(state, { standingOrders: [{ kind: 'SUPPLY', op: 'CANCEL', commodity: 'steel' }] }).ctx)
    expect(state.house.standingOrders.supply).toEqual([])
  })

  it('innehavet från avtalet sänker produktionskostnaden (samma mekanism som BUY_FORWARD)', () => {
    const state = fresh()
    withAgreement(state, { locked: 100 })
    state.market.commodities.steel = 100
    state.market.contracts = [contract({ productId: '105mm_field_gun', quantity: 50, unitCostAtSigning: 11500 })]
    production(makeCtx(state).ctx)
    expect(state.ledger[state.ledger.length - 1]!.expenses.production).toBeGreaterThan(0)
    expect(state.house.commodityHoldings.steel).toBeLessThan(40_000) // förbrukat av produktionen
  })
})

describe('stationsläge', () => {
  it('upphållskostnaden: tyst är billigare och aktiv dyrare än normal, bara från och med sinceTurn', () => {
    const state = fresh()
    const base = computeFixedCostsBreakdown(state.house, 5).stationUpkeep
    expect(base).toBe(B.fixedCosts.stationUpkeep)
    state.house.standingOrders.stations['station-1'] = { mode: 'quiet', sinceTurn: 6, activeTurns: 0 }
    expect(computeFixedCostsBreakdown(state.house, 5).stationUpkeep).toBe(base)
    expect(computeFixedCostsBreakdown(state.house, 6).stationUpkeep).toBe(Math.round(base * B.stationQuietUpkeepFactor))
    state.house.standingOrders.stations['station-1'] = { mode: 'active', sinceTurn: 6, activeTurns: 0 }
    expect(computeFixedCostsBreakdown(state.house, 6).stationUpkeep).toBe(Math.round(base * B.stationActiveUpkeepFactor))
  })

  it('economy-steget bokför den ändrade kostnaden', () => {
    const quiet = fresh()
    const normal = fresh()
    quiet.house.standingOrders.stations['station-1'] = { mode: 'quiet', sinceTurn: 1, activeTurns: 0 }
    economy(makeCtx(quiet).ctx)
    economy(makeCtx(normal).ctx)
    expect(quiet.house.treasury).toBeGreaterThan(normal.house.treasury)
  })

  it('aktiv: exponeringen stiger varje tur och djupet växer vart stationActiveDepthTurns:e tur; tyst: exponeringen sjunker', () => {
    const state = fresh()
    state.house.stations[0]!.exposure = 10
    state.house.standingOrders.stations['station-1'] = { mode: 'active', sinceTurn: 1, activeTurns: 0 }
    const depth = state.house.stations[0]!.depth
    for (let i = 0; i < B.stationActiveDepthTurns; i++) {
      state.meta.turn = 5 + i
      applyActions(makeCtx(state).ctx)
    }
    expect(state.house.stations[0]!.exposure).toBe(10 + B.stationActiveExposurePerTurn * B.stationActiveDepthTurns)
    expect(state.house.stations[0]!.depth).toBe(depth + 1)

    const quiet = fresh()
    quiet.house.stations[0]!.exposure = 30
    quiet.house.standingOrders.stations['station-1'] = { mode: 'quiet', sinceTurn: 1, activeTurns: 0 }
    applyActions(makeCtx(quiet).ctx)
    expect(quiet.house.stations[0]!.exposure).toBe(30 - B.stationQuietExposureDecay)
    expect(quiet.house.stations[0]!.depth).toBe(depth) // tyst växer inte
  })

  it('djupet överstiger aldrig 5, och normalt läge rör varken exponering eller djup av sig självt', () => {
    const state = fresh()
    state.house.stations[0]!.depth = 5
    state.house.standingOrders.stations['station-1'] = { mode: 'active', sinceTurn: 1, activeTurns: B.stationActiveDepthTurns - 1 }
    applyActions(makeCtx(state).ctx)
    expect(state.house.stations[0]!.depth).toBe(5)

    const normal = fresh()
    const before = { depth: normal.house.stations[0]!.depth, exposure: normal.house.stations[0]!.exposure }
    applyActions(makeCtx(normal).ctx)
    expect(normal.house.stations[0]).toMatchObject(before)
  })

  it('LARM 3: en station på aktiv vars exponering passerar exposureBurnThreshold ger en rubrik med causeId', () => {
    const state = fresh()
    state.house.stations[0]!.exposure = B.exposureBurnThreshold - 1
    state.house.standingOrders.stations['station-1'] = { mode: 'active', sinceTurn: 1, activeTurns: 0 }
    const { ctx, emitted } = makeCtx(state)
    applyActions(ctx)
    const rise = emitted.find((e) => e.headline.includes('ACTIVE') && e.delta.exposure !== undefined)
    const alarm = emitted.find((e) => e.headline.includes('BURN THRESHOLD'))
    expect(rise).toBeDefined()
    expect(alarm).toBeDefined()
    expect(alarm!.severity).toBe('headline')
    expect(alarm!.causeId).toBe(rise!.id)
  })

  it('inget larm för en station på normal/tyst som redan ligger över tröskeln, eller för en som inte korsar den', () => {
    const state = fresh()
    state.house.stations[0]!.exposure = B.exposureBurnThreshold + 5
    state.house.standingOrders.stations['station-1'] = { mode: 'quiet', sinceTurn: 1, activeTurns: 0 }
    const { ctx, emitted } = makeCtx(state)
    applyActions(ctx)
    expect(emitted.some((e) => e.headline.includes('BURN THRESHOLD'))).toBe(false)
  })
})

describe('resolveTurn: allt hänger ihop', () => {
  it('hela resolveTurn med de tre slagen kraschar inte, är deterministisk och håller huvudboken i balans', () => {
    const run = () => {
      const state = fresh()
      state.house.treasury = 5_000_000
      const first = resolveTurn(state, { standingOrders: [LINE, SUPPLY, STATION], bids: [], actions: [] })
      let s = first.state
      for (let i = 0; i < 6; i++) s = resolveTurn(s, { standingOrders: [], bids: [], actions: [] }).state
      return s
    }
    const a = run()
    const b = run()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const row of a.ledger) {
      const income = Object.values(row.income).reduce((n, v) => n + v, 0)
      const expenses = Object.values(row.expenses).reduce((n, v) => n + v, 0)
      const financing = row.financing.loans - row.financing.repayments
      expect(Number.isInteger(income - expenses + financing)).toBe(true)
    }
  })

  it('utan stående order är ett parti oförändrat: standingOrders förblir tomt hela vägen', () => {
    let state = fresh()
    for (let i = 0; i < 8; i++) state = resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state
    expect(state.house.standingOrders).toEqual({ lines: {}, supply: [], stations: {} })
  })
})
