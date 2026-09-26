// validateAction.test.ts — P78 (ETAPP7_TEKNISK_SPEC.md §7.4), ordagrant klart-
// när: "golden bitvis identisk; varje avvisningsorsak har ett test som visar
// samma svar från båda [validateAction och den fulla applyActions/resolveTurn-
// vägen]." Golden-parityn verifieras av det redan befintliga
// test/golden/golden.test.ts (oförändrat, se ANDRINGSLOGG.md) — den här filen
// täcker den andra halvan: EN test per avvisningsorsak, som visar att
// validateAction() och resolveTurn() ger EXAKT samma svar för samma indata.
import { describe, expect, it } from 'vitest'
import { validateAction } from '../src/validateAction.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState, cloneState } from '../src/state.js'
import { officialId } from '../src/officials.js'
import type { GameState, PlayerAction, TurnSubmission } from '../src/types.js'

function submissionOf(action: PlayerAction): TurnSubmission {
  return { standingOrders: [], bids: [], actions: [action] }
}

// Den gemensamma parity-kontrollen — P78:s eget klart-när, ordagrant: samma
// action mot samma (state, draft)-par ska ge SAMMA avvisningsorsak från
// validateAction() direkt och från den fulla resolveTurn()-vägen.
function expectSameRejection(state: GameState, action: PlayerAction, reason: string): void {
  const direct = validateAction(state, state, action)
  expect(direct).toEqual({ ok: false, reason })

  const result = resolveTurn(state, submissionOf(action))
  expect(result.rejected).toHaveLength(1)
  expect(result.rejected[0]).toEqual({ action, reason })
}

// Samma kontroll åt andra hållet: en giltig action ska INTE avvisas av någon
// av de två vägarna.
function expectBothAccept(state: GameState, action: PlayerAction): void {
  const direct = validateAction(state, state, action)
  expect(direct).toEqual({ ok: true })

  const result = resolveTurn(state, submissionOf(action))
  expect(result.rejected).toHaveLength(0)
}

describe('validateAction — INTERNAL', () => {
  it('TAKE_LOAN: ogiltigt belopp avvisas med "invalid loan amount" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 'a lot' } }, 'invalid loan amount')
  })

  it('TAKE_LOAN: belopp över creditLimit avvisas med "credit limit exceeded" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.creditLimit = 1000
    expectSameRejection(state, { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 5000 } }, 'credit limit exceeded')
  })

  it('TAKE_LOAN: giltigt lån inom creditLimit accepteras av båda', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.creditLimit = 1000000
    expectBothAccept(state, { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 500000 } })
  })

  it('TAKE_LOAN: flera lån i SAMMA inskickning bokförs mot en krympande kreditrest — validateAction() ger samma svar som resolveTurn() för det ANDRA lånet, prövat mot draften EFTER det första', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.creditLimit = 100000
    const first: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }
    const second: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }

    // Prövat direkt mot startläget: andra lånet ENSAMT vore giltigt.
    expect(validateAction(state, state, second)).toEqual({ ok: true })

    // Men i EN inskickning med båda (samma ordning) avvisas det andra —
    // draften vid den tidpunkten har redan bokfört det första lånets skuld.
    const result = resolveTurn(state, { standingOrders: [], bids: [], actions: [first, second] })
    expect(result.rejected).toEqual([{ action: second, reason: 'credit limit exceeded' }])

    // validateAction() ger SAMMA svar när den prövas mot en draft som redan
    // reflekterar det första lånet — exakt den situationen applyActions.ts:s
    // egen loop ger den, se validateAction.ts:s huvudkommentar.
    const draftAfterFirst = cloneState(state)
    draftAfterFirst.house.debt += 60000
    draftAfterFirst.house.treasury += 60000
    expect(validateAction(state, draftAfterFirst, second)).toEqual({ ok: false, reason: 'credit limit exceeded' })
  })

  it('TAKE_LOAN: en REPAY tidigare i SAMMA inskickning ger inte extra kreditutrymme (dokumenterat beteende, se validateAction.ts)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.creditLimit = 100000
    state.house.debt = 50000
    state.house.treasury = 200000
    const repay: PlayerAction = { type: 'INTERNAL', op: 'REPAY', payload: { amount: 20000 } }
    const loan: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 100000 } }

    // REPAY(20000) sänker debt, men remainingCredit för ett EFTERFÖLJANDE
    // TAKE_LOAN ska ändå vara den fulla creditLimit (100000) — inte
    // creditLimit + den nyss återbetalda summan. 100000 > 100000 är falskt,
    // så lånet accepteras exakt vid gränsen, oavsett REPAY-ordningen.
    const result = resolveTurn(state, { standingOrders: [], bids: [], actions: [repay, loan] })
    expect(result.rejected).toHaveLength(0)
  })

  it('REPAY: ogiltigt belopp avvisas med "invalid repayment amount" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTERNAL', op: 'REPAY', payload: { amount: -500 } }, 'invalid repayment amount')
  })

  it('REPAY: belopp över min(treasury, debt) avvisas med "repayment exceeds treasury or debt" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.debt = 1000
    state.house.treasury = 5000000
    expectSameRejection(state, { type: 'INTERNAL', op: 'REPAY', payload: { amount: 200000 } }, 'repayment exceeds treasury or debt')
  })

  it('BUILD_LINE: maxProductionLines nått avvisas med "maximum production lines reached" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    while (state.house.lines.length < 9) {
      state.house.lines.push({
        id: `line-${state.house.lines.length + 1}`,
        productId: null,
        grade: 'A',
        unitsPerTurnAtFull: 40,
        capacityPct: 100,
        assignedContractId: null,
        status: 'idle',
        blockedReason: null,
        retoolingUntilTurn: null,
      })
    }
    expectSameRejection(state, { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }, 'maximum production lines reached')
  })

  it('HIRE: ogiltig roll avvisas med "invalid hire role" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTERNAL', op: 'HIRE', payload: { role: 'admiral' } }, 'invalid hire role')
  })

  it('REPRIORITISE_RND: ogiltig kategori avvisas med "invalid R&D category" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'cyber' } },
      'invalid R&D category',
    )
  })
})

describe('validateAction — POLITICAL', () => {
  it('STAGE_INCIDENT: okänd faktion avvisas med "unknown target faction" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'atlantis', spend: 10000 },
      'unknown target faction',
    )
  })

  it('BACK_CHANNEL: ogiltigt spend-belopp avvisas med "invalid spend amount" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: -1 },
      'invalid spend amount',
    )
  })

  it('BRIBE: okänd tjänsteman avvisas med "unknown official" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'POLITICAL', op: 'BRIBE', officialId: 'official-atlantis-procurement', spend: 10000 }, 'unknown official')
  })

  it('FUND_CAMPAIGN: ogiltigt spend-belopp avvisas med "invalid spend amount" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: officialId('rvn', 'procurement'), spend: Number.NaN },
      'invalid spend amount',
    )
  })

  it('FAVOUR: ogiltig marginCost avvisas med "invalid margin cost" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'FAVOUR', officialId: officialId('rvn', 'procurement'), marginCost: -1 },
      'invalid margin cost',
    )
  })

  it('INFLUENCE: okänd målfaktion avvisas med "unknown target faction" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'INFLUENCE', targetFactionId: 'atlantis', spend: 1000, direction: 'up', effect: { kind: 'publicSupport' } },
      'unknown target faction',
    )
  })

  it('INFLUENCE (relations): ogiltigt mål (samma faktion som targetFactionId) avvisas med "invalid influence target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 1000,
        direction: 'up',
        effect: { kind: 'relations', towardFactionId: 'rvn' },
      },
      'invalid influence target',
    )
  })

  it('FUND_COUP: okänd faktion avvisas med "unknown target faction" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'atlantis', spend: 100000 }, 'unknown target faction')
  })

  it('FUND_COUP: en andra kupp mot samma faktion avvisas med "coup already attempted against this faction" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.factions.rvn!.coupAttempted = true
    expectSameRejection(state, { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend: 100000 }, 'coup already attempted against this faction')
  })

  it('ASSASSINATE: en redan död tjänsteman avvisas med "unknown official target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.officials[officialId('rvn', 'procurement')]!.status = 'dead'
    expectSameRejection(
      state,
      { type: 'POLITICAL', op: 'ASSASSINATE', officialId: officialId('rvn', 'procurement'), spend: 50000 },
      'unknown official target',
    )
  })
})

describe('validateAction — INTEL', () => {
  it('EXPAND: okänd station avvisas med "unknown station" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'EXPAND', stationId: 'station-999' }, 'unknown station')
  })

  it('RECRUIT: okänt mål avvisas med "invalid recruit target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'atlantis' }, 'invalid recruit target')
  })

  it('RECRUIT: maxStations nått avvisas med "maximum stations reached" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    while (state.house.stations.length < 5) {
      state.house.stations.push({
        id: `station-${state.house.stations.length + 1}`,
        city: 'TEST',
        nation: 'rvn',
        depth: 0,
        exposure: 0,
        coverage: ['procurement'],
        status: 'active',
      })
    }
    expectSameRejection(state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'nlf' }, 'maximum stations reached')
  })

  it('WITHDRAW: okänd station avvisas med "unknown station" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'WITHDRAW', stationId: 'station-999' }, 'unknown station')
  })

  it('LEAK: okänd rival avvisas med "unknown rival target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'nobody' }, 'unknown rival target')
  })

  it('SABOTAGE: okänd station avvisas med "unknown station" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'SABOTAGE', stationId: 'station-999', targetId: 'brandt' }, 'unknown station')
  })

  it('TURN: okänd tjänsteman avvisas med "unknown official target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: 'nobody' }, 'unknown official target')
  })

  it('TURN: en tjänsteman i FEL land (inte stationens nation) avvisas med "unknown official target" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    // station-1 sitter i rvn — en nlf-tjänsteman är utom räckhåll för den.
    expectSameRejection(
      state,
      { type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: officialId('nlf', 'procurement') },
      'unknown official target',
    )
  })
})

describe('validateAction — MARKET', () => {
  it('okänd råvara avvisas med "unknown commodity" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'unobtainium' as never, spend: 1000 },
      'unknown commodity',
    )
  })

  it('ogiltigt spend-belopp avvisas med "invalid market spend amount" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'oil', spend: 0 }, 'invalid market spend amount')
  })

  it('BUY_FORWARD: spend över treasury avvisas med "insufficient treasury" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.treasury = 100
    expectSameRejection(state, { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'oil', spend: 100000 }, 'insufficient treasury')
  })

  it('RELEASE: spend över innehavet avvisas med "release exceeds holding" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.commodityHoldings.oil = 100
    expectSameRejection(state, { type: 'MARKET', op: 'RELEASE', commodity: 'oil', spend: 100000 }, 'release exceeds holding')
  })
})

describe('validateAction — BROKER', () => {
  it('okänd köparfaktion avvisas med "unknown buyer faction" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'BROKER', buyerId: 'atlantis', productId: 'm1_rifle', quantity: 10, price: 1000 },
      'unknown buyer faction',
    )
  })

  it('ogiltig kvantitet avvisas med "invalid quantity" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 0, price: 1000 }, 'invalid quantity')
  })

  it('ogiltigt pris avvisas med "invalid price" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(state, { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, price: -5 }, 'invalid price')
  })

  it('okänd produkt avvisas med "unknown product" (av båda)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'BROKER', buyerId: 'rvn', productId: 'death_star' as never, quantity: 10, price: 1000 },
      'unknown product',
    )
  })

  it('tjänstemannens relation/integritet under tröskeln avvisas med "official will not broker this deal" (av båda) — sant redan vid partistart (relationToPlayer 0)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expectSameRejection(
      state,
      { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, price: 1000 },
      'official will not broker this deal',
    )
  })

  it('ett kvalificerat mäklat avtal accepteras av båda', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    const official = state.officials[officialId('rvn', 'procurement')]!
    official.relationToPlayer = 90
    official.integrity = 90
    expectBothAccept(state, { type: 'BROKER', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, price: 1000 })
  })
})

describe('validateAction — CRISIS och handlingstaket', () => {
  it('CRISIS avvisas aldrig av validateAction (hanteras separat, kostar ingen actionPoint)', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    expect(validateAction(state, state, { type: 'CRISIS', choice: 'BACK_DOWN' })).toEqual({ ok: true })
  })

  it('"no executive actions remaining" är INTE en validateAction-kontroll (könskapacitet, inte handlingens giltighet) — men resolveTurn avvisar ändå en handling utöver taket', () => {
    const state = createInitialState('indochina-slice', 'va-seed')
    state.house.actionPoints = 1
    const first: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'infantry' } }
    const second: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'artillery' } }

    // Var för sig är båda giltiga enligt validateAction — den kontrollen ser
    // bara EN handling i taget, aldrig hela listans ordning/längd.
    expect(validateAction(state, state, first)).toEqual({ ok: true })
    expect(validateAction(state, state, second)).toEqual({ ok: true })

    const result = resolveTurn(state, { standingOrders: [], bids: [], actions: [first, second] })
    expect(result.rejected).toEqual([{ action: second, reason: 'no executive actions remaining' }])
  })
})
