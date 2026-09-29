// advance.test.ts — P98 (ETAPP8_FORSLAG.md §4.1): betalningsvillkor per order. Klart-när:
// "varje utfall i §4.1 har ett test". Utfallen: advancePct härleds ur brådska, betalningsförmåga
// och relation och fryses på ordern; vid tilldelning betalas förskottet in (och bokförs i
// huvudboken); vid leverans betalas resten proportionellt; köparen går i konkurs → förskottet
// behålls; spelaren levererar inte i tid → förskottet betalas tillbaka, och det kassan inte
// räcker till blir skuld. Plus det specen inte nämner: regimskifte (behålls) och att förskottet
// aldrig ändrar styrelsens progressSnapshot.
import { describe, expect, it } from 'vitest'
import { advanceFactors, computeAdvancePct, deliveryPayment } from '../src/resolve/advance.js'
import { applyActions } from '../src/resolve/steps/applyActions.js'
import { bidding } from '../src/resolve/steps/bidding.js'
import { board } from '../src/resolve/steps/board.js'
import { deliveries } from '../src/resolve/steps/deliveries.js'
import { factions } from '../src/resolve/steps/factions.js'
import { orders } from '../src/resolve/steps/orders.js'
import { projectedQuarter } from '../src/queries.js'
import { createRng } from '../src/rng.js'
import { cloneState, createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, GameState, LedgerEntry, Order, PlayerAction, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  advancePctMin: number
  advancePctMax: number
  advanceUrgencyWeight: number
  advanceAbilityWeight: number
  advanceRelationWeight: number
  advanceUrgencyFullAt: number
  advanceCoverageFull: number
  contractGracePeriodTurns: number
  orderTriggerThreshold: Record<string, number>
  factionBankruptcyTurns: number
}

function makeCtx(state: GameState, submission: TurnSubmission = { standingOrders: [], bids: [], actions: [] }, seed = 'advance-test') {
  const emitted: (Omit<WireEvent, 'id' | 'turn'> & { id: string })[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state: cloneState(state),
    draft: state,
    submission,
    rng: createRng(seed, 0),
    emit: (e) => {
      const id = `ev-${seq++}`
      emitted.push({ ...e, id })
      return id
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => total + value, 0)
}
function ledgerNet(entry: LedgerEntry): number {
  return sum(entry.income) - sum(entry.expenses) + entry.financing.loans - entry.financing.repayments
}
function entryFor(state: GameState): LedgerEntry {
  const entry = state.ledger.find((e) => e.turn === state.meta.turn)
  expect(entry, 'ingen huvudboksrad för innevarande tur').toBeDefined()
  return entry!
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    price: 2_000_000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: null,
    advancePct: 30,
    advancePaid: 600_000,
    ...overrides,
  }
}

function dueOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-0-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 3000000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: ['brandt', 'costigan', 'meridian'],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    advancePct: 30,
    ...overrides,
  }
}

// ── 1. Härledningen ────────────────────────────────────────────────────────
describe('computeAdvancePct — brådska, betalningsförmåga, relation (§4.1)', () => {
  const threshold = B.orderTriggerThreshold.infantry!
  function inputs(patch: { need?: number; budget?: number; treasury?: number; relation?: number; referencePrice?: number }) {
    return {
      faction: {
        materielNeed: { infantry: patch.need ?? threshold, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 },
        militaryBudget: patch.budget ?? 0,
        treasury: patch.treasury ?? 0,
      },
      official: { relationToPlayer: patch.relation ?? 0 },
      category: 'infantry' as const,
      referencePrice: patch.referencePrice ?? 1_000_000,
    }
  }

  it('ligger alltid inom [advancePctMin, advancePctMax] (10–40 %, beslut 8D), och når båda ändarna', () => {
    expect(computeAdvancePct(inputs({}))).toBe(B.advancePctMin)
    const max = computeAdvancePct(
      inputs({ need: threshold * B.advanceUrgencyFullAt * 5, budget: 1e12, treasury: 1e12, relation: 100 }),
    )
    expect(max).toBe(B.advancePctMax)
    for (const need of [0, threshold, threshold * 2, threshold * 10]) {
      for (const budget of [0, 3e6, 1e9]) {
        const pct = computeAdvancePct(inputs({ need, budget, treasury: 1e9, relation: 40 }))
        expect(pct).toBeGreaterThanOrEqual(B.advancePctMin)
        expect(pct).toBeLessThanOrEqual(B.advancePctMax)
        expect(Number.isInteger(pct)).toBe(true)
      }
    }
  })

  it('BRÅDSKA: en köpare i nöd (materielNeed långt över utlysningströskeln) betalar mer i förskott', () => {
    const calm = computeAdvancePct(inputs({ need: threshold, budget: 5e6, treasury: 5e6 }))
    const urgent = computeAdvancePct(inputs({ need: threshold * B.advanceUrgencyFullAt, budget: 5e6, treasury: 5e6 }))
    expect(urgent).toBeGreaterThan(calm)
    expect(advanceFactors(inputs({ need: threshold })).urgency).toBe(0)
    expect(advanceFactors(inputs({ need: threshold * B.advanceUrgencyFullAt })).urgency).toBe(1)
  })

  it('BETALNINGSFÖRMÅGA: en köpare med ont om pengar betalar mindre — både militaryBudget och treasury sätter taket', () => {
    const rich = computeAdvancePct(inputs({ budget: 1e9, treasury: 1e9 }))
    const poorBudget = computeAdvancePct(inputs({ budget: 100_000, treasury: 1e9 }))
    const poorTreasury = computeAdvancePct(inputs({ budget: 1e9, treasury: 100_000 }))
    expect(rich).toBeGreaterThan(poorBudget)
    expect(rich).toBeGreaterThan(poorTreasury)
    expect(poorBudget).toBe(poorTreasury) // min(budget, treasury) — samma tak från vilket håll det än kommer
    // Ett dyrare köp mot samma kassa är en större belastning för köparen.
    expect(computeAdvancePct(inputs({ budget: 3e6, treasury: 3e6, referencePrice: 500_000 }))).toBeGreaterThan(
      computeAdvancePct(inputs({ budget: 3e6, treasury: 3e6, referencePrice: 5_000_000 })),
    )
    // Ett underskott räknas som noll, inte som ett negativt tal.
    expect(computeAdvancePct(inputs({ budget: 1e9, treasury: -5e6 }))).toBe(B.advancePctMin)
  })

  it('RELATION: procurement-tjänstemannens relationToPlayer ger en liten bonus — och den är den minsta av de tre', () => {
    const cold = computeAdvancePct(inputs({ relation: 0 }))
    const warm = computeAdvancePct(inputs({ relation: 100 }))
    expect(warm).toBeGreaterThan(cold)
    expect(B.advanceRelationWeight).toBeLessThan(B.advanceUrgencyWeight)
    expect(B.advanceRelationWeight).toBeLessThan(B.advanceAbilityWeight)
    expect(B.advanceUrgencyWeight + B.advanceAbilityWeight + B.advanceRelationWeight).toBeCloseTo(1, 10)
  })
})

// ── 2. Fryst på ordern ─────────────────────────────────────────────────────
describe('advancePct sätts vid utlysning och fryses (som referencePrice)', () => {
  it('varje utlyst order får den procent computeAdvancePct ger för köparens läge VID utlysningen', () => {
    const state = createInitialState('indochina-slice', 'advance-orders-seed')
    // Sätt köparna i olika lägen så procenten skiljer sig åt.
    state.factions['rvn']!.materielNeed.infantry = B.orderTriggerThreshold.infantry! * 3
    state.officials['official-rvn-procurement']!.relationToPlayer = 80
    const before = cloneState(state)

    const { ctx } = makeCtx(state, undefined, 'advance-orders')
    orders(ctx)

    expect(state.market.openOrders.length).toBeGreaterThan(0)
    for (const order of state.market.openOrders) {
      const faction = before.factions[order.buyerId]!
      const official = before.officials[order.officialId]!
      const product = order.productId
      const category = allCategory(product)
      const need = faction.materielNeed
      const expected = computeAdvancePct({
        faction: { materielNeed: need, militaryBudget: faction.militaryBudget, treasury: faction.treasury },
        official,
        category,
        referencePrice: order.referencePrice,
      })
      expect(order.advancePct, `${order.id} (${order.buyerId})`).toBe(expected)
      expect(order.advancePct).toBeGreaterThanOrEqual(B.advancePctMin)
      expect(order.advancePct).toBeLessThanOrEqual(B.advancePctMax)
    }
  })

  it('en redan utlyst order räknas aldrig om — köparens läge ändras men ordern behåller sin procent', () => {
    const state = createInitialState('indochina-slice', 'advance-frozen-seed')
    orders(makeCtx(state, undefined, 'advance-frozen-1').ctx)
    const first = state.market.openOrders.map((o) => ({ id: o.id, pct: o.advancePct }))
    expect(first.length).toBeGreaterThan(0)

    // Köparna blir rika och brådskande, tjänstemännen kära — en omräkning skulle ge en annan procent.
    for (const faction of Object.values(state.factions)) {
      faction.militaryBudget = 1e12
      faction.treasury = 1e12
      for (const key of Object.keys(faction.materielNeed) as (keyof typeof faction.materielNeed)[]) faction.materielNeed[key] = 1e6
    }
    for (const official of Object.values(state.officials)) official.relationToPlayer = 100
    state.meta.turn += 1
    orders(makeCtx(state, undefined, 'advance-frozen-2').ctx)

    for (const { id, pct } of first) {
      expect(state.market.openOrders.find((o) => o.id === id)!.advancePct).toBe(pct)
    }
  })

  it('även en scriptad restricted-order får en advancePct', () => {
    const state = createInitialState('indochina-slice', 'advance-scripted-seed')
    const scenario = balanceScriptedTurn()
    state.meta.turn = scenario.turn
    orders(makeCtx(state, undefined, 'advance-scripted').ctx)
    const scripted = state.market.openOrders.find((o) => o.reason.kind === 'SCRIPTED')
    expect(scripted).toBeDefined()
    expect(scripted!.advancePct).toBeGreaterThanOrEqual(B.advancePctMin)
    expect(scripted!.advancePct).toBeLessThanOrEqual(B.advancePctMax)
  })
})

// ── 3. Vid tilldelning ─────────────────────────────────────────────────────
describe('vid tilldelning betalas förskottet in', () => {
  function winOrder(state: GameState, order: Order): ReturnType<typeof makeCtx> {
    state.market.openOrders = [order]
    state.meta.turn = 0
    return makeCtx(
      state,
      { standingOrders: [], bids: [{ orderId: order.id, price: 1_500_000, deliveryTurns: 2, grade: 'A', bribe: 0 }], actions: [] },
      'bidding-seed-win',
    )
  }

  it('advancePct × kontraktsvärde går till kassan, bokförs som bokförd intäkt och som income.advances', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = state.house.treasury
    const { ctx, emitted } = winOrder(state, dueOrder({ advancePct: 30 }))
    bidding(ctx)

    const won = state.market.contracts[0]!
    expect(won.price).toBe(1_500_000)
    expect(won.advancePct).toBe(30)
    expect(won.advancePaid).toBe(450_000)
    expect(state.house.treasury).toBe(before + 450_000)
    expect(state.house.revenueByTurn[0]).toBe(450_000)
    const entry = entryFor(state)
    expect(entry.income.advances).toBe(450_000)
    expect(state.house.treasury - before).toBe(ledgerNet(entry))

    const winEvent = emitted.find((e) => e.headline.includes('WINS CONTRACT'))!
    const advanceEvent = emitted.find((e) => e.headline.includes('ADVANCE'))!
    expect(advanceEvent.delta).toEqual({ treasury: 450_000 })
    expect(advanceEvent.causeId).toBe(winEvent.id)
    expect(advanceEvent.actorIsPlayer).toBe(true)
  })

  it('förskottet avrundas via money.ts: inga decimaler i kassan', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx } = winOrder(state, dueOrder({ advancePct: 13 }))
    bidding(ctx)
    expect(Number.isInteger(state.market.contracts[0]!.advancePaid)).toBe(true)
    expect(state.market.contracts[0]!.advancePaid).toBe(Math.round(1_500_000 * 0.13))
  })

  it('en order utan förskott (advancePct 0) ger ingen betalning och ingen händelse', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const before = state.house.treasury
    const { ctx, emitted } = winOrder(state, dueOrder({ advancePct: 0 }))
    bidding(ctx)
    expect(state.house.treasury).toBe(before)
    expect(state.market.contracts[0]!.advancePaid).toBe(0)
    expect(emitted.some((e) => e.headline.includes('ADVANCE'))).toBe(false)
  })

  it('BROKER-kontrakt går inte via en Order och får inget förskott', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 2
    state.officials['official-rvn-procurement']!.relationToPlayer = 60
    const action: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 }
    const { ctx } = makeCtx(state, { standingOrders: [], bids: [], actions: [action] })
    applyActions(ctx)
    expect(state.market.contracts[0]!.advancePct).toBe(0)
    expect(state.market.contracts[0]!.advancePaid).toBe(0)
  })
})

// ── 4. Vid leverans ────────────────────────────────────────────────────────
describe('vid leverans betalas resten, proportionellt', () => {
  it('varje leverans betalar (pris − förskott) × levererad andel', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.contracts = [contract()]
    state.market.shipments = [{ id: 's1', contractId: 'contract-test-0', units: 20, arrivalTurn: 3 }]
    state.meta.turn = 3
    const before = state.house.treasury

    const { ctx } = makeCtx(state)
    deliveries(ctx)

    // (2 000 000 − 600 000) × 20/100
    expect(state.house.treasury - before).toBe(280_000)
    expect(entryFor(state).income.contracts).toBe(280_000)
    expect(state.house.revenueByTurn[3]).toBe(280_000)
  })

  it('förskott + alla leveranser = kontraktsvärdet, exakt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract()
    state.market.contracts = [c]
    let received = c.advancePaid
    for (let i = 0; i < 5; i++) {
      state.market.shipments = [{ id: `s${i}`, contractId: c.id, units: 20, arrivalTurn: i }]
      state.meta.turn = i
      const before = state.house.treasury
      deliveries(makeCtx(state).ctx)
      received += state.house.treasury - before
    }
    expect(c.unitsDelivered).toBe(100)
    expect(received).toBe(c.price)
  })

  it('utan förskott är leveransbetalningen bitvis den gamla price × units / quantity', () => {
    const c = contract({ advancePct: 0, advancePaid: 0 })
    expect(deliveryPayment(c, 37)).toBe(Math.round(2_000_000 * (37 / 100)))
  })

  it('prognosen (projectedQuarter) läser samma formel: bara resten räknas som väntad leverans-intäkt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.contracts = [contract()]
    state.meta.turn = 4
    state.market.shipments = [{ id: 's1', contractId: 'contract-test-0', units: 20, arrivalTurn: 5 }]
    expect(projectedQuarter(state).expectedRevenueNextTurn).toBe(280_000)
  })
})

// ── 5. Styrelsens progressSnapshot påverkas inte av förskottet ────────────
describe('förskottet ändrar aldrig bokvärdet (progressSnapshot): det flyttar bara kassan tidigare', () => {
  it('samma kontrakt med och utan förskott ger samma progressSnapshot, före och efter en leverans', () => {
    function snapshot(withAdvance: boolean, delivered: number): number {
      const state = createInitialState('indochina-slice', 'seed')
      const c = withAdvance ? contract({ unitsDelivered: delivered }) : contract({ advancePct: 0, advancePaid: 0, unitsDelivered: delivered })
      state.market.contracts = [c]
      const paidForDelivered = Math.round((c.price - c.advancePaid) * (delivered / c.quantity))
      state.house.revenueByTurn = [c.advancePaid + paidForDelivered]
      board(makeCtx(state).ctx)
      return state.house.boardTarget.progressSnapshot
    }
    for (const delivered of [0, 30, 100]) {
      // (100 levererade = fullt levererat; ett fulfilled-kontrakt räknas bort ur backloggen i båda fallen)
      expect(snapshot(true, delivered)).toBeCloseTo(snapshot(false, delivered), 9)
    }
  })
})

// ── 6. Utfall vid annullering ──────────────────────────────────────────────
describe('köparen går i konkurs → förskottet behålls', () => {
  it('kontraktet annulleras men ingenting betalas tillbaka; en händelse visar att förskottet behölls', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.embargoed = true // embargots dränering knuffar en redan skuldsatt köpare över gränsen
    faction.treasury = 100
    faction.negativeTreasuryTurns = B.factionBankruptcyTurns - 1
    state.market.contracts = [contract()]
    const treasuryBefore = state.house.treasury
    const debtBefore = state.house.debt

    const { ctx, emitted } = makeCtx(state, undefined, 'faction-seed')
    factions(ctx)

    expect(faction.bankrupt).toBe(true)
    expect(state.market.contracts[0]!.status).toBe('voided')
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(state.house.debt).toBe(debtBefore)
    expect(state.ledger.length === 0 || entryFor(state).expenses.clawback === 0).toBe(true)
    const retained = emitted.find((e) => e.headline.includes('RETAINED'))
    expect(retained?.headline).toContain('600,000')
    expect(retained?.delta).toEqual({})
  })
})

describe('spelaren levererar inte i tid → kontraktet annulleras och förskottet betalas tillbaka', () => {
  function lateBeyondGrace(state: GameState, c: Contract): void {
    c.status = 'late'
    c.lateEventId = 'late-event-1'
    state.market.contracts = [c]
    state.meta.turn = c.dueTurn + B.contractGracePeriodTurns + 1
  }

  it('kassan räcker: hela förskottet går ur kassan, bokförs som clawback, och revenueByTurn minskas', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract()
    lateBeyondGrace(state, c)
    state.house.treasury = 5_000_000
    state.house.revenueByTurn[state.meta.turn] = 700_000
    const before = state.house.treasury

    const { ctx, emitted } = makeCtx(state)
    deliveries(ctx)

    expect(c.status).toBe('voided')
    expect(state.house.treasury).toBe(before - 600_000)
    expect(state.house.debt).toBe(0)
    expect(state.house.revenueByTurn[state.meta.turn]).toBe(100_000)
    const entry = entryFor(state)
    expect(entry.expenses.clawback).toBe(600_000)
    expect(entry.financing.loans).toBe(0)
    expect(state.house.treasury - before).toBe(ledgerNet(entry))

    const voided = emitted.find((e) => e.headline.includes('VOIDED'))!
    const refund = emitted.find((e) => e.headline.includes('REFUNDS'))!
    expect(refund.causeId).toBe(voided.id)
    expect(refund.delta).toEqual({ treasury: -600_000 })
  })

  it('kassan räcker inte: kassan tas till noll och resten blir skuld (en ny väg in i INSOLVENCY)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract()
    lateBeyondGrace(state, c)
    state.house.treasury = 250_000
    const before = state.house.treasury

    const { ctx, emitted } = makeCtx(state)
    deliveries(ctx)

    expect(state.house.treasury).toBe(0)
    expect(state.house.debt).toBe(350_000)
    const entry = entryFor(state)
    expect(entry.expenses.clawback).toBe(600_000)
    expect(entry.financing.loans).toBe(350_000) // det kassan inte räckte till, finansierat med skuld
    expect(state.house.treasury - before).toBe(ledgerNet(entry))
    expect(state.house.debt).toBe(entry.financing.loans - entry.financing.repayments)
    const refund = emitted.find((e) => e.headline.includes('MUST REFUND'))!
    expect(refund.delta).toEqual({ treasury: -250_000, debt: 350_000 })
  })

  it('kassan redan under noll: hela förskottet blir skuld, kassan rörs inte', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract()
    lateBeyondGrace(state, c)
    state.house.treasury = -80_000
    deliveries(makeCtx(state).ctx)
    expect(state.house.treasury).toBe(-80_000)
    expect(state.house.debt).toBe(600_000)
  })

  it('ett kontrakt utan förskott annulleras som förut: ingen återbetalning, ingen huvudboksrad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract({ advancePct: 0, advancePaid: 0 })
    lateBeyondGrace(state, c)
    const before = state.house.treasury
    deliveries(makeCtx(state).ctx)
    expect(c.status).toBe('voided')
    expect(state.house.treasury).toBe(before)
    expect(state.ledger.every((e) => e.expenses.clawback === 0)).toBe(true)
  })

  it('en försenad men ännu inte annullerad leverans betalar inget tillbaka', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const c = contract({ status: 'active', dueTurn: 5 })
    state.market.contracts = [c]
    state.meta.turn = 6 // sen, men inom nådaperioden
    const before = state.house.treasury
    deliveries(makeCtx(state).ctx)
    expect(c.status).toBe('late')
    expect(state.house.treasury).toBe(before)
  })
})

describe('regimskifte (FUND_COUP) — specen nämner inte utfallet; förskottet behålls som vid konkurs', () => {
  it('det gamla regimens kontrakt annulleras utan återbetalning; bara kuppens egen kostnad rör kassan', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.contracts = [contract()]
    const before = state.house.treasury
    const action: PlayerAction = { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend: 1_000_000 }
    const { ctx, emitted } = makeCtx(state, { standingOrders: [], bids: [], actions: [action] }, 'coup-seed-5')
    applyActions(ctx)

    expect(state.market.contracts[0]!.status).toBe('voided')
    expect(state.house.treasury).toBe(before - 1_000_000)
    expect(state.house.debt).toBe(0)
    expect(emitted.some((e) => e.headline.includes('RETAINED') && e.headline.includes('NEW REGIME'))).toBe(true)
    expect(entryFor(state).expenses.clawback).toBe(0)
  })
})

// ── hjälpare ───────────────────────────────────────────────────────────────
import { getProduct } from '../src/pricing.js'
import indochina from '../src/data/scenarios/indochina-slice.json' with { type: 'json' }

function allCategory(productId: string) {
  return getProduct(productId).category
}
function balanceScriptedTurn(): { turn: number } {
  const events = (indochina as unknown as { scriptedEvents: { turn: number; type: string }[] }).scriptedEvents
  return events.find((e) => e.type === 'RESTRICTED_ORDER')!
}
