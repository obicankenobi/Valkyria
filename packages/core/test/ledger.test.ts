// ledger.test.ts — P96 (ETAPP8_FORSLAG.md §3.1/§9): GameState.ledger, huvudboken.
// En enhetstest per penningflyttande steg/gren: varje flöde ska skriva PRECIS sin
// rad, och kvartalets rader ska förklara kassaförändringen exakt (till kronan).
// Den heltäckande kontrollen över 500 hela partier ligger i
// invariants/ledger-balance.test.ts; det här är den riktade, en-gren-i-taget-delen
// som pekar ut VILKET flöde som går förbi huvudboken om något gör det.
import { describe, expect, it } from 'vitest'
import { applyActions } from '../src/resolve/steps/applyActions.js'
import { production } from '../src/resolve/steps/production.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { economy } from '../src/resolve/steps/economy.js'
import { recordExpense, recordFinancing, recordIncome, sealLedger } from '../src/ledger.js'
import { createRng } from '../src/rng.js'
import { cloneState, createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, LedgerEntry, PlayerAction, TurnSubmission, WireEvent } from '../src/types.js'

function makeCtx(state: GameState, actions: PlayerAction[] = [], seed = 'ledger-test'): ResolveContext {
  let seq = 0
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  const submission: TurnSubmission = { standingOrders: [], bids: [], actions }
  return {
    state: cloneState(state),
    draft: state,
    submission,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => total + value, 0)
}

// Kassaförändringen huvudboken förklarar: intäkter − kostnader + lån − återbetalningar.
function ledgerNet(entry: LedgerEntry): number {
  return sum(entry.income) - sum(entry.expenses) + entry.financing.loans - entry.financing.repayments
}

function entryFor(state: GameState, turn = state.meta.turn): LedgerEntry {
  const entry = state.ledger.find((e) => e.turn === turn)
  expect(entry, `ingen huvudboksrad för tur ${turn}`).toBeDefined()
  return entry!
}

// Varje test slutar med samma två påståenden: rätt rad, och exakt balans.
function expectBooked(state: GameState, treasuryBefore: number, check: (entry: LedgerEntry) => void): void {
  const entry = entryFor(state)
  check(entry)
  expect(state.house.treasury - treasuryBefore).toBe(ledgerNet(entry))
}

function activeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 0, advancePaid: 0,
    ...overrides,
  }
}

describe('ledger — form och hjälpare (ETAPP8_FORSLAG.md §3.1)', () => {
  it('ett nytt parti börjar med en tom huvudbok', () => {
    expect(createInitialState('indochina-slice', 'seed').ledger).toEqual([])
  })

  it('första skrivningen en tur skapar en nollställd rad för just den turen (med de tre tillagda raderna)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 4
    recordIncome(state, 'contracts', 1000)

    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toEqual({
      turn: 4,
      income: { contracts: 1000, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 },
      expenses: {
        fixedCosts: 0,
        production: 0,
        interest: 0,
        political: 0,
        intel: 0,
        commodityPurchase: 0,
        hiring: 0,
        lines: 0,
        clawback: 0,
      },
      financing: { loans: 0, repayments: 0 },
      treasuryEnd: 0,
      debtEnd: 0,
      creditLimitEnd: 0,
    })
  })

  it('flera skrivningar samma tur summeras i SAMMA rad; en ny tur ger en ny rad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    recordExpense(state, 'intel', 100)
    recordExpense(state, 'intel', 250)
    state.meta.turn = 1
    recordExpense(state, 'intel', 7)

    expect(state.ledger.map((e) => e.turn)).toEqual([0, 1])
    expect(state.ledger[0]!.expenses.intel).toBe(350)
    expect(state.ledger[1]!.expenses.intel).toBe(7)
  })

  it('alla belopp går genom money.ts:s round (hård regel 8) — inga decimaler i huvudboken', () => {
    const state = createInitialState('indochina-slice', 'seed')
    recordIncome(state, 'broker', 10.4)
    recordFinancing(state, 'loans', 20.6)
    expect(state.ledger[0]!.income.broker).toBe(10)
    expect(state.ledger[0]!.financing.loans).toBe(21)
  })

  it('sealLedger skriver kassa, skuld och kreditgräns vid turens slut — och skapar raden om inget flyttade pengar', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.treasury = 123456
    state.house.debt = 5000
    state.house.creditLimit = 999
    sealLedger(state)

    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]!.treasuryEnd).toBe(123456)
    expect(state.ledger[0]!.debtEnd).toBe(5000)
    expect(state.ledger[0]!.creditLimitEnd).toBe(999)
  })
})

describe('ledger — ett test per penningflyttande steg (varje flöde skriver sin rad)', () => {
  describe('economy.ts', () => {
    it('fasta kostnader → expenses.fixedCosts', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      economy(makeCtx(state))
      expectBooked(state, before, (e) => expect(e.expenses.fixedCosts).toBe(309000))
    })

    it('ränta → expenses.interest', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.house.debt = 1000000
      const before = state.house.treasury
      economy(makeCtx(state))
      expectBooked(state, before, (e) => {
        expect(e.expenses.interest).toBe(Math.round((1000000 * state.house.debtRateAnnual) / 4))
        expect(e.expenses.interest).toBeGreaterThan(0)
      })
    })
  })

  describe('production.ts', () => {
    it('styckkostnad för producerade enheter → expenses.production', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const contract = activeContract({ quantity: 1000 })
      state.market.contracts = [contract]
      const line = state.house.lines[0]!
      line.assignedContractId = contract.id
      line.productId = contract.productId
      line.grade = contract.grade
      line.status = 'running'
      const before = state.house.treasury

      production(makeCtx(state))

      expectBooked(state, before, (e) => {
        expect(e.expenses.production).toBeGreaterThan(0)
        expect(e.expenses.production).toBe(before - state.house.treasury)
      })
    })

    it('forward-innehav täcker en del av kostnaden: bara KASSAN bokförs (innehavet är ingen kassarörelse)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const contract = activeContract({ quantity: 1000 })
      state.market.contracts = [contract]
      const line = state.house.lines[0]!
      line.assignedContractId = contract.id
      line.productId = contract.productId
      line.grade = contract.grade
      line.status = 'running'
      state.house.commodityHoldings.steel = 100000
      const before = state.house.treasury

      production(makeCtx(state))

      expectBooked(state, before, (e) => expect(e.expenses.production).toBe(before - state.house.treasury))
    })
  })

  describe('deliveries.ts', () => {
    it('leveransintäkt för ett vanligt kontrakt → income.contracts', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.market.contracts = [activeContract({ quantity: 100, price: 2000000 })]
      state.market.shipments = [{ id: 'shipment-test-0', contractId: 'contract-test-0', units: 20, arrivalTurn: 3 }]
      state.meta.turn = 3
      const before = state.house.treasury

      deliveries(makeCtx(state))

      expectBooked(state, before, (e) => {
        expect(e.income.contracts).toBe(400000)
        expect(e.income.broker).toBe(0)
      })
    })

    it('leveransintäkt för ett BROKER-kontrakt (contract-broker-*) → income.broker, inte income.contracts', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.market.contracts = [activeContract({ id: 'contract-broker-rvn-3-0', quantity: 100, price: 1000000 })]
      state.market.shipments = [{ id: 'shipment-b', contractId: 'contract-broker-rvn-3-0', units: 50, arrivalTurn: 3 }]
      state.meta.turn = 3
      const before = state.house.treasury

      deliveries(makeCtx(state))

      expectBooked(state, before, (e) => {
        expect(e.income.broker).toBe(500000)
        expect(e.income.contracts).toBe(0)
      })
    })

    it('två leveranser samma tur summeras i samma rad', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.market.contracts = [activeContract({ quantity: 100, price: 1000000 })]
      state.market.shipments = [
        { id: 's1', contractId: 'contract-test-0', units: 10, arrivalTurn: 2 },
        { id: 's2', contractId: 'contract-test-0', units: 30, arrivalTurn: 2 },
      ]
      state.meta.turn = 2
      const before = state.house.treasury

      deliveries(makeCtx(state))

      expectBooked(state, before, (e) => expect(e.income.contracts).toBe(400000))
    })
  })

  describe('applyActions.ts — INTERNAL', () => {
    it('TAKE_LOAN → financing.loans (varken intäkt eller kostnad)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.house.creditLimit = 1000000
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 500000 } }]))
      expectBooked(state, before, (e) => {
        expect(e.financing.loans).toBe(500000)
        expect(sum(e.income)).toBe(0)
        expect(sum(e.expenses)).toBe(0)
      })
    })

    it('REPAY → financing.repayments', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.house.debt = 400000
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTERNAL', op: 'REPAY', payload: { amount: 150000 } }]))
      expectBooked(state, before, (e) => expect(e.financing.repayments).toBe(150000))
    })

    it('BUILD_LINE → expenses.lines', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }]))
      expectBooked(state, before, (e) => expect(e.expenses.lines).toBe(balance.buildLineCost))
    })

    it('HIRE → expenses.hiring', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }]))
      expectBooked(state, before, (e) => expect(e.expenses.hiring).toBe(balance.hireCost))
    })
  })

  describe('applyActions.ts — INTEL', () => {
    it('EXPAND → expenses.intel', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTEL', op: 'EXPAND', stationId: 'station-1' }]))
      expectBooked(state, before, (e) => expect(e.expenses.intel).toBe(balance.intelExpandCost))
    })

    it('RECRUIT → expenses.intel', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTEL', op: 'RECRUIT', stationId: 'station-1', targetId: 'laos' }]))
      expectBooked(state, before, (e) => expect(e.expenses.intel).toBe(balance.intelRecruitCost))
    })

    for (const op of ['LEAK', 'SABOTAGE'] as const) {
      it(`${op} → expenses.intel (intelCovertOpCost, lyckad eller ej)`, () => {
        const state = createInitialState('indochina-slice', 'seed')
        const before = state.house.treasury
        applyActions(makeCtx(state, [{ type: 'INTEL', op, stationId: 'station-1', targetId: 'brandt' }]))
        expectBooked(state, before, (e) => expect(e.expenses.intel).toBe(balance.intelCovertOpCost))
      })
    }

    it('TURN → expenses.intel', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const official = state.officials['official-rvn-procurement']!
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: official.id }]))
      expectBooked(state, before, (e) => expect(e.expenses.intel).toBe(balance.intelCovertOpCost))
    })
  })

  describe('applyActions.ts — MARKET', () => {
    it('BUY_FORWARD → expenses.commodityPurchase', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: 500000 }]))
      expectBooked(state, before, (e) => expect(e.expenses.commodityPurchase).toBe(500000))
    })

    it('RELEASE → income.commodityRelease', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.house.commodityHoldings.steel = 500000
      const before = state.house.treasury
      applyActions(makeCtx(state, [{ type: 'MARKET', op: 'RELEASE', commodity: 'steel', spend: 300000 }]))
      expectBooked(state, before, (e) => expect(e.income.commodityRelease).toBe(300000))
    })
  })

  describe('political.ts — alla åtta operationer → expenses.political', () => {
    const cases: { name: string; action: PlayerAction; seed?: string; prepare?: (state: GameState) => void }[] = [
      { name: 'BRIBE', action: { type: 'POLITICAL', op: 'BRIBE', officialId: 'official-rvn-procurement', spend: 10000 } },
      {
        name: 'FUND_CAMPAIGN',
        action: { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: 'official-rvn-procurement', spend: 20000 },
      },
      {
        name: 'STAGE_INCIDENT',
        action: { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50000 },
        seed: 'stage-incident-seed-2',
      },
      { name: 'BACK_CHANNEL', action: { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 30000 } },
      {
        name: 'INFLUENCE (publicSupport)',
        action: {
          type: 'POLITICAL',
          op: 'INFLUENCE',
          targetFactionId: 'rvn',
          spend: 30000,
          direction: 'up',
          effect: { kind: 'publicSupport' },
        },
        prepare: (state) => {
          state.factions['rvn']!.publicSupport = 40 // utrymme uppåt, så verbet faktiskt rör något
        },
      },
      {
        name: 'FUND_COUP',
        action: { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend: 1000000 },
        seed: 'coup-seed-5',
      },
      {
        name: 'ASSASSINATE',
        action: { type: 'POLITICAL', op: 'ASSASSINATE', officialId: 'official-rvn-procurement', spend: 500000 },
        seed: 'assassinate-seed',
      },
    ]

    for (const { name, action, seed, prepare } of cases) {
      it(`${name} → expenses.political`, () => {
        const state = createInitialState('indochina-slice', 'seed')
        prepare?.(state)
        const before = state.house.treasury
        const ctx = makeCtx(state, [action], seed)
        applyActions(ctx)
        expect(ctx.rejected).toEqual([])
        const spend = (action as { spend: number }).spend
        expectBooked(state, before, (e) => expect(e.expenses.political).toBe(spend))
      })
    }

    it('INFLUENCE (relations) → expenses.political', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      const ctx = makeCtx(state, [
        {
          type: 'POLITICAL',
          op: 'INFLUENCE',
          targetFactionId: 'rvn',
          spend: 30000,
          direction: 'up',
          effect: { kind: 'relations', towardFactionId: 'nlf' },
        },
      ])
      applyActions(ctx)
      expect(ctx.rejected).toEqual([])
      expectBooked(state, before, (e) => expect(e.expenses.political).toBe(30000))
    })

    // Fynd P96, åtgärdat efteråt: applyInfluence drog kassa och return:ade utan att emitta när
    // effekten var noll (hård regel 4 brutet sedan P60). Nu emittas en händelse, och
    // huvudboken balanserar som förut.
    for (const [label, effect, prepare] of [
      ['publicSupport redan på taket', { kind: 'publicSupport' } as const, (st: GameState) => { st.factions['rvn']!.publicSupport = 100 }],
      [
        'relationen redan på taket',
        { kind: 'relations', towardFactionId: 'nlf' } as const,
        (st: GameState) => { st.factions['rvn']!.relations['nlf'] = 100 },
      ],
    ] as const) {
      it(`INFLUENCE utan effekt (${label}) drar kassa OCH emittar en händelse med treasury-delta (hård regel 4)`, () => {
        const state = createInitialState('indochina-slice', 'seed')
        prepare(state)
        const before = state.house.treasury
        const ctx = makeCtx(state, [
          { type: 'POLITICAL', op: 'INFLUENCE', targetFactionId: 'rvn', spend: 30000, direction: 'up', effect },
        ])
        const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
        const inner = ctx.emit
        ctx.emit = (e) => {
          emitted.push(e)
          return inner(e)
        }
        applyActions(ctx)
        expect(ctx.rejected).toEqual([])
        expect(state.house.treasury).toBe(before - 30000)
        const event = emitted.find((e) => e.headline.includes('NO EFFECT'))
        expect(event, 'ingen händelse för den verkningslösa kampanjen').toBeDefined()
        expect(event!.delta).toEqual({ treasury: -30000 })
        expectBooked(state, before, (e) => expect(e.expenses.political).toBe(30000))
      })
    }

    it('FAVOUR kostar marginal, inte kassa — ingen huvudboksrad alls', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const before = state.house.treasury
      applyActions(
        makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: 'official-rvn-procurement', marginCost: 1000 }]),
      )
      expect(state.house.treasury).toBe(before)
      expect(state.ledger.length === 0 || ledgerNet(entryFor(state)) === 0).toBe(true)
    })
  })

  describe('crisis.ts', () => {
    it('BACK_DOWN återtar kvartalets restricted-intäkt → expenses.clawback', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.meta.turn = 5
      state.pendingCrisis = { turn: 3, theatreId: 'indochina', restrictedRevenueThisTurn: 400000 }
      state.house.revenueByTurn[3] = 900000
      const before = state.house.treasury

      applyActions(makeCtx(state, [{ type: 'CRISIS', choice: 'BACK_DOWN' }], 'back-down-clawback-seed'))

      expectBooked(state, before, (e) => expect(e.expenses.clawback).toBe(400000))
    })

    it('SELL_THE_FILE → income.fileSale', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
      const before = state.house.treasury

      applyActions(makeCtx(state, [{ type: 'CRISIS', choice: 'SELL_THE_FILE' }], 'sell-the-file-seed'))

      expectBooked(state, before, (e) => expect(e.income.fileSale).toBe(balance.crisisSellFileRevenue))
    })
  })
})
