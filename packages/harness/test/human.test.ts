// human.test.ts — P103 (ETAPP8_FORSLAG.md §7.1, beslut 8F): den spelarlika boten `human` och de fem nya
// mätkolumnerna. Ingen core-ändring, `balanced` rörs inte (golden läser den).
import { describe, expect, it } from 'vitest'
import { createInitialState, playerWinCurve, resolveTurn } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { balanced, balancedPwc, capacity, capacityPwc, human, POLICIES } from '../src/policies.js'
import { runGame } from '../src/runGame.js'

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'human-seed')
  state.market.openOrders = []
  return state
}

// En genuin order ur ett riktigt parti: spela tomma turer tills marknaden har öppna ordrar, så att
// alla fält (konkurrerande rivaler, vikter, förskott) är verkliga och vinstkurvan inte är platt noll.
function stateWithOrders(): GameState {
  let state = createInitialState('indochina-slice', 'human-seed')
  for (let i = 0; i < 12 && state.market.openOrders.length < 2; i++) {
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state
  }
  return state
}

function sampleOrder(state: GameState, over: Partial<Order> = {}): Order {
  // Bara en order med en genomförbar bjudpunkt (confidence ≥ 25 vid ≥ 5 % marginal) — en del ordrar
  // har en helt platt noll-kurva, och humans korrekta svar på dem är att inte bjuda alls.
  const source = state.market.openOrders.find((o) => {
    const curve = playerWinCurve(state, o, 'A')
    return curve.some((p) => p.confidence >= 25 && (p.price - curve[0]!.price) / p.price >= 0.05)
  })
  if (!source) throw new Error('ingen order med en genomförbar bjudpunkt i testläget')
  return { ...source, ...over }
}

describe('human — registrering', () => {
  it('finns i POLICIES och balanced är kvar (golden läser den)', () => {
    expect(POLICIES['human']).toBe(human)
    expect(Object.keys(POLICIES)).toEqual(expect.arrayContaining(['passive', 'aggressive', 'balanced', 'capacity', 'human']))
  })
})

describe('balanced-pwc / capacity-pwc', () => {
  it('är registrerade och originalen är kvar', () => {
    expect(POLICIES['balanced-pwc']).toBe(balancedPwc)
    expect(POLICIES['capacity-pwc']).toBe(capacityPwc)
    expect(POLICIES['balanced']).toBe(balanced)
    expect(POLICIES['capacity']).toBe(capacity)
  })

  it('har samma handlingar som originalen — bara budkurvan skiljer', () => {
    const state = stateWithOrders()
    expect(balancedPwc(state).actions).toEqual(balanced(state).actions)
    expect(capacityPwc(state).actions).toEqual(capacity(state).actions)
  })

  it('bjuder ur playerWinCurve: varje bud ligger inom kurvans prisspann', () => {
    const state = stateWithOrders()
    for (const policy of [balancedPwc, capacityPwc]) {
      for (const bid of policy(state).bids) {
        const order = state.market.openOrders.find((o) => o.id === bid.orderId)!
        const curve = playerWinCurve(state, order, bid.grade)
        expect(bid.price).toBeGreaterThanOrEqual(curve[0]!.price)
        expect(bid.price).toBeLessThanOrEqual(curve[curve.length - 1]!.price)
        expect(curve.some((p) => p.price === bid.price)).toBe(true)
      }
    }
  })

  it('kör ett helt parti med båda utan att kasta', () => {
    for (const name of ['balanced-pwc', 'capacity-pwc']) {
      const m = runGame('indochina-slice', `p103-pwc-${name}`, name, POLICIES[name]!)
      expect(m.finalTurn).toBeGreaterThan(0)
    }
  })
})

describe('human — bud', () => {
  it('bjuder ur playerWinCurve och aldrig under egen självkostnad', () => {
    const state = stateWithOrders()
    const order = sampleOrder(state)
    state.market.openOrders = [order]
    const submission = human(state)
    expect(submission.bids.length).toBeLessThanOrEqual(1)
    for (const bid of submission.bids) {
      const curve = playerWinCurve(state, order, bid.grade)
      expect(bid.price).toBeGreaterThanOrEqual(curve[0]!.price)
      expect(bid.price).toBeLessThanOrEqual(curve[curve.length - 1]!.price)
    }
  })

  it('bjuder inte på fler ordrar än husets lediga linjer räcker till (ingen förfalskad kapacitet)', () => {
    const state = stateWithOrders()
    const order = sampleOrder(state)
    state.market.openOrders = Array.from({ length: 12 }, (_, i) => ({ ...order, id: `order-${i}` }))
    const submission = human(state)
    const idle = state.house.lines.filter((l) => l.status === 'idle').length
    expect(submission.bids.length).toBeLessThanOrEqual(Math.max(idle, 1) * 4)
  })

  it('med låg kassa väljs ordern med högst förskott före ordern med bäst marginal', () => {
    const state = stateWithOrders()
    state.house.treasury = 100_000
    const low = sampleOrder(state, { id: 'order-low', advancePct: 10 })
    const high = sampleOrder(state, { id: 'order-high', advancePct: 40 })
    state.market.openOrders = [low, high]
    // Bara en ledig linje → bara EN order får plats.
    state.house.lines = state.house.lines.slice(0, 1)
    const submission = human(state)
    expect(submission.bids.map((b) => b.orderId)).toEqual(['order-high'])
  })
})

describe('human — stående order', () => {
  it('sluter ett leverantörsavtal när en råvara ligger lågt, och inte när den ligger högt', () => {
    const cheap = fresh()
    cheap.market.commodities.steel = 88
    const cheapChanges = human(cheap).standingOrders
    expect(cheapChanges.some((c) => c.kind === 'SUPPLY' && c.op === 'SET' && c.commodity === 'steel')).toBe(true)

    const dear = fresh()
    for (const key of Object.keys(dear.market.commodities) as (keyof typeof dear.market.commodities)[]) dear.market.commodities[key] = 120
    expect(human(dear).standingOrders.filter((c) => c.kind === 'SUPPLY')).toEqual([])
  })

  it('sluter inget nytt avtal för en råvara som redan har ett', () => {
    const state = fresh()
    state.market.commodities.steel = 88
    state.house.standingOrders = {
      lines: {},
      supply: [{ id: 's1', commodity: 'steel', volumePerTurn: 10_000, lockedIndex: 90, startTurn: 1, endTurn: 6, lossStreak: 0 }],
      stations: {},
    }
    expect(human(state).standingOrders.filter((c) => c.kind === 'SUPPLY' && c.commodity === 'steel')).toEqual([])
  })

  it('lägger aldrig fler handlingar än handlingspoängen räcker till', () => {
    const state = fresh()
    const submission = human(state)
    expect(submission.actions.length).toBeLessThanOrEqual(state.house.actionPoints)
  })
})

describe('human — BACK_CHANNEL mot en front som ger dålig intäkt', () => {
  it('skickar BACK_CHANNEL mot en krigsfront där huset saknar kontrakt efter tur 3, aldrig före', () => {
    const state = fresh()
    state.meta.turn = 5
    state.market.contracts = []
    state.house.treasury = state.house.foundingCapital
    const actions = human(state).actions
    expect(actions.some((a) => a.type === 'POLITICAL' && a.op === 'BACK_CHANNEL')).toBe(true)

    const early = fresh()
    early.meta.turn = 2
    early.market.contracts = []
    expect(human(early).actions.some((a) => a.type === 'POLITICAL' && a.op === 'BACK_CHANNEL')).toBe(false)
  })
})

describe('runGame — P103:s mätkolumner', () => {
  it('ger de nya kolumnerna inom giltiga intervall', () => {
    const m = runGame('indochina-slice', 'p103-metrics', 'human', human)
    expect(m.advanceSharePct).toBeGreaterThanOrEqual(0)
    expect(m.advanceSharePct).toBeLessThanOrEqual(100)
    expect(Number.isFinite(m.minTreasuryTurns1to6)).toBe(true)
    expect(Number.isInteger(m.ceasefires)).toBe(true)
    expect(m.ceasefires).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(m.standingOrderAlarms)).toBe(true)
    expect(m.buyoutReview).toBeGreaterThanOrEqual(0)
    expect(m.submittedItems).toBeGreaterThanOrEqual(0)
    expect(m.rejectedItems).toBeLessThanOrEqual(m.submittedItems)
  })

  it('buyoutReview är 0 om partiet inte slutar i BUYOUT och annars ett granskningsnummer ≥ 1', () => {
    for (let i = 0; i < 6; i++) {
      const m = runGame('indochina-slice', `p103-buyout-${i}`, 'passive', POLICIES['passive']!)
      if (m.ending === 'BUYOUT') expect(m.buyoutReview).toBeGreaterThanOrEqual(1)
      else expect(m.buyoutReview).toBe(0)
    }
  })

  it('är deterministiskt', () => {
    const a = runGame('indochina-slice', 'p103-determinism', 'human', human)
    const b = runGame('indochina-slice', 'p103-determinism', 'human', human)
    expect(a).toEqual(b)
  })
})

describe('human — mätt uppförande (P103:s klart-när, mindre stickprov än CLI-mätningen)', () => {
  it('avvisade handlingar utgör högst 5 % av alla inskickade över 40 partier', () => {
    let submitted = 0
    let rejected = 0
    for (let i = 0; i < 40; i++) {
      const m = runGame('indochina-slice', `p103-rejected-${i}`, 'human', human)
      submitted += m.submittedItems
      rejected += m.rejectedItems
    }
    expect(submitted).toBeGreaterThan(0)
    expect(rejected / submitted).toBeLessThanOrEqual(0.05)
  }, 60_000)
})

// P129 (ETAPP9_FORSLAG.md §10): spelstilsvarianterna och de nya mätkolumnerna.
describe('human — P129:s varianter', () => {
  it('är registrerade och human-classic är den gamla boten utan konstruktioner', () => {
    for (const name of ['human-classic', 'human-robust', 'human-advanced', 'human-noresearch', 'human-bothsides', 'human-clean', 'human-dirty']) {
      expect(POLICIES[name], name).toBeTypeOf('function')
    }
    const state = stateWithOrders()
    const classic = POLICIES['human-classic']!(state)
    expect(classic.standingOrders.some((o) => o.kind === 'DESIGN')).toBe(false)
  })

  it('human-clean skickar aldrig ett PROCUREMENT-knep; human-dirty kan göra det', () => {
    let clean = 0
    for (const seed of ['p129-a', 'p129-b', 'p129-c']) {
      const m = runGame('indochina-slice', seed, 'human-clean', POLICIES['human-clean']!)
      clean += m.traces
    }
    // Rent hus: inga egna spår från knep (mutor i vanliga bud kan ge spår — den bot som aldrig fuskar bjuder inte med muta heller).
    expect(clean).toBe(0)
  })

  it('en körning ger alla nya kolumner som ändliga, icke-negativa tal', () => {
    const m = runGame('indochina-slice', 'p129-metrics', 'human', human)
    for (const key of [
      'designs', 'designBreakthroughs', 'casualties', 'battleProven', 'gapShocks', 'firstInPlace', 'falseGapsCreated',
      'youngDesignRevenuePct', 'programmes', 'programmesEntered', 'programmesWon', 'programmesSplit', 'programmesLost',
      'traces', 'tracesSurfaced', 'voidedByScandal', 'suspensions', 'contractsWonViaProgramme',
    ] as const) {
      expect(Number.isFinite(m[key]), key).toBe(true)
      expect(m[key], key).toBeGreaterThanOrEqual(0)
    }
    expect(m.programmesEntered).toBeLessThanOrEqual(m.programmes)
    expect(m.tracesSurfaced).toBeLessThanOrEqual(m.traces)
  })
})
