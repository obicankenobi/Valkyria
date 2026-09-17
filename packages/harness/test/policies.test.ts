import { describe, expect, it } from 'vitest'
import { BOT_BALANCE, createInitialState, getProduct } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { aggressive, balanced, capacity, passive, POLICIES } from '../src/policies.js'

// En handbyggd order med ett SATT referencePrice, så marginalen kan styras
// exakt. Allt annat kommer ur ett riktigt initialstate.
function buildOrder(state: GameState, overrides: Partial<Order>): Order {
  return {
    id: 'order-test',
    buyerId: 'rvn',
    productId: 'm1_rifle',
    quantity: 100,
    statedBudget: 20000,
    trueBudget: 40000,
    referencePrice: 15000,
    requiredDeliveryTurns: 4,
    expiresTurn: state.meta.turn,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): buyerId ovan är 'rvn' — samma
    // faktions procurement-tjänsteman finns garanterat i state byggd av
    // createInitialState. Ingen testkörning i den här filen ändrar buyerId.
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
    ...overrides,
  }
}

function withOrder(state: GameState, overrides: Partial<Order>): GameState {
  state.market.openOrders = [buildOrder(state, overrides)]
  return state
}

function withOrders(state: GameState, overridesList: readonly Partial<Order>[]): GameState {
  state.market.openOrders = overridesList.map((overrides) => buildOrder(state, overrides))
  return state
}

describe('passive (marginalfiltret, spec avsnitt 7.3, ETAPP1_5_TEKNISK_SPEC.md 10.2)', () => {
  it('bjuder INTE när hela kontraktspriset ligger under styckkostnaden × kvantiteten + 20 %', () => {
    // m1_rifle: unitCost 210 grade A. 100 enheter ⇒ 21 000 i verklig kostnad.
    // Ett referencePrice på 15 000 lägger hela winBandet under den nivån, så
    // ingen prispunkt kan ge 20 % marginal.
    const state = withOrder(createInitialState('indochina-slice', 'passive-margin-seed'), {
      quantity: 100,
      referencePrice: 15000,
    })
    const product = getProduct('m1_rifle')
    expect(product.unitCost * 100).toBeGreaterThan(15000) // premissen testet vilar på

    expect(passive(state).bids).toEqual([])
  })

  it('bjuder när marginalen mot HELA kontraktets kostnad faktiskt räcker', () => {
    // Samma order, men ett referencePrice som lägger winBandet klart över
    // 21 000 + 20 %.
    const state = withOrder(createInitialState('indochina-slice', 'passive-margin-seed'), {
      quantity: 100,
      referencePrice: 90000,
    })

    const bids = passive(state).bids
    expect(bids.length).toBe(1)
    expect(bids[0]!.grade).toBe('A')
  })

  it('tackar alltid nej till restricted, oavsett marginal', () => {
    const state = withOrder(createInitialState('indochina-slice', 'passive-restricted-seed'), {
      productId: 'mk9_longhand_shell',
      quantity: 2,
      referencePrice: 90000000,
      trueBudget: 200000000,
    })

    expect(passive(state).bids).toEqual([])
  })

  it('bjuder på högst BOT_BALANCE.passiveMaxConcurrentBids ordrar per tur, även när fler kvalificerar (10.2)', () => {
    const orders = Array.from({ length: 10 }, (_, i) => ({
      id: `order-${i}`,
      referencePrice: 500000, // långt över 20 %-marginalen mot m1_rifles 21 000 i kostnad
    }))
    const state = withOrders(createInitialState('indochina-slice', 'passive-capacity-seed'), orders)

    const bids = passive(state).bids
    expect(bids.length).toBe(BOT_BALANCE.passiveMaxConcurrentBids)
    expect(new Set(bids.map((b) => b.orderId)).size).toBe(bids.length) // inga dubbletter
  })

  it('lånar bara när treasury < 0, och bara för att täcka underskottet (10.2)', () => {
    const negative = createInitialState('indochina-slice', 'passive-loan-seed')
    negative.market.openOrders = []
    negative.house.treasury = -50000
    negative.house.creditLimit = 200000
    expect(passive(negative).actions).toEqual([{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 50000 } }])

    const positive = createInitialState('indochina-slice', 'passive-loan-seed')
    positive.market.openOrders = []
    positive.house.treasury = 50000
    positive.house.creditLimit = 200000
    expect(passive(positive).actions).toEqual([])
  })

  it('(P28) investerar ALDRIG i R&D — det är balanced/capacitys jobb, se ANDRINGSLOGG.md', () => {
    const state = createInitialState('indochina-slice', 'passive-no-rnd-seed')
    state.market.openOrders = []
    expect(state.house.techLevel.artillery).toBe(7) // under mk9:s 8 — hade annars kunnat investera
    expect(passive(state).actions.some((a) => a.type === 'INTERNAL' && a.op === 'REPRIORITISE_RND')).toBe(false)
  })
})

describe('aggressive (spec avsnitt 7.3, ETAPP1_5_TEKNISK_SPEC.md 10.2)', () => {
  it('bjuder på varje order, även restricted, underbjuder rivalerna', () => {
    const state = withOrder(createInitialState('indochina-slice', 'aggressive-seed'), {
      productId: 'mk9_longhand_shell',
      quantity: 2,
      referencePrice: 1800000,
      trueBudget: 4000000,
    })

    const bids = aggressive(state).bids
    expect(bids.length).toBe(1)
    expect(bids[0]!.price).toBeLessThan(state.market.openOrders[0]!.referencePrice)
  })

  it('(P31) väljer grade dynamiskt (avsnitt 6.1) — inte längre hårdkodat C', () => {
    const flush = withOrder(createInitialState('indochina-slice', 'aggressive-grade-seed'), { referencePrice: 90000 })
    flush.house.treasury = BOT_BALANCE.gradeCashPressureThreshold + 1
    expect(aggressive(flush).bids[0]!.grade).toBe('A')

    const pressured = withOrder(createInitialState('indochina-slice', 'aggressive-grade-seed'), { referencePrice: 90000 })
    pressured.house.treasury = BOT_BALANCE.gradeCashPressureThreshold - 1
    expect(aggressive(pressured).bids[0]!.grade).toBe('C')
  })

  it('lånar maximalt varje tur (hela creditLimit)', () => {
    const state = createInitialState('indochina-slice', 'aggressive-loan-seed')
    state.market.openOrders = []
    state.house.creditLimit = 300000

    expect(aggressive(state).actions).toContainEqual({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 300000 } })
  })
})

describe('balanced (spec avsnitt 7.3, ETAPP1_5_TEKNISK_SPEC.md 10.2)', () => {
  it('bjuder på varje order', () => {
    const state = withOrder(createInitialState('indochina-slice', 'balanced-seed'), { referencePrice: 90000 })

    expect(balanced(state).bids.length).toBe(1)
  })

  it('(P31, avsnitt 6.1) väljer grade A över gradeCashPressureThreshold, grade C när kassan är trängd', () => {
    const flush = withOrder(createInitialState('indochina-slice', 'balanced-grade-seed'), { referencePrice: 90000 })
    flush.house.treasury = BOT_BALANCE.gradeCashPressureThreshold + 1
    expect(balanced(flush).bids[0]!.grade).toBe('A')

    const pressured = withOrder(createInitialState('indochina-slice', 'balanced-grade-seed'), { referencePrice: 90000 })
    pressured.house.treasury = BOT_BALANCE.gradeCashPressureThreshold - 1
    expect(balanced(pressured).bids[0]!.grade).toBe('C')
  })

  it('(P31, avsnitt 6.1) väljer grade B under en pågående skandal — oavsett kassaläge', () => {
    const state = withOrder(createInitialState('indochina-slice', 'balanced-scandal-seed'), { referencePrice: 90000 })
    state.house.scandalUntilTurn = state.meta.turn + 3
    state.house.treasury = BOT_BALANCE.gradeCashPressureThreshold - 1 // skulle annars gett C
    expect(balanced(state).bids[0]!.grade).toBe('B')
  })

  it('(P31, avsnitt 6.1) väljer grade A igen sedan skandalen gått ut (scandalUntilTurn nådd)', () => {
    const state = withOrder(createInitialState('indochina-slice', 'balanced-scandal-over-seed'), { referencePrice: 90000 })
    state.house.scandalUntilTurn = state.meta.turn // redan nådd, inte längre pågående
    expect(balanced(state).bids[0]!.grade).toBe('A')
  })

  it('(P31, avsnitt 6.1) väljer grade C när ordern viktar pris över gradePriceWeightThreshold, även vid gott om kassa', () => {
    const state = withOrder(createInitialState('indochina-slice', 'balanced-priceweight-seed'), {
      referencePrice: 90000,
      weights: { price: BOT_BALANCE.gradePriceWeightThreshold + 0.01, delivery: 0.2, relationship: 0.1 },
    })
    state.house.treasury = BOT_BALANCE.gradeCashPressureThreshold + 1
    expect(balanced(state).bids[0]!.grade).toBe('C')
  })

  it('lånar till halva creditLimit varje tur', () => {
    const state = createInitialState('indochina-slice', 'balanced-loan-seed')
    state.market.openOrders = []
    state.house.creditLimit = 300000

    expect(balanced(state).actions).toContainEqual({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 150000 } })
  })

  it('(P28 klart-når) investerar i REPRIORITISE_RND(artillery) en gång, så länge tekniknivån inte redan räcker till mk9', () => {
    const state = createInitialState('indochina-slice', 'balanced-rnd-seed')
    state.market.openOrders = []
    expect(state.house.techLevel.artillery).toBe(7) // under mk9:s 8

    expect(balanced(state).actions).toContainEqual({
      type: 'INTERNAL',
      op: 'REPRIORITISE_RND',
      payload: { category: 'artillery' },
    })

    // Redan en pågående artillery-satsning — inget nytt försök samma parti.
    state.house.rnd = [{ id: 'rnd-1', category: 'artillery', turnsRemaining: 3, turnsTotal: 6 }]
    expect(balanced(state).actions.some((a) => a.type === 'INTERNAL' && a.op === 'REPRIORITISE_RND')).toBe(false)

    // Tekniknivån redan tillräcklig — inget försök alls.
    state.house.rnd = []
    state.house.techLevel.artillery = 8
    expect(balanced(state).actions.some((a) => a.type === 'INTERNAL' && a.op === 'REPRIORITISE_RND')).toBe(false)
  })
})

describe('capacity (referensboten, ETAPP1_5_TEKNISK_SPEC.md 10.2)', () => {
  it('bjuder bara på ordrar som ryms inom lediga linjer och product.unitsPerLineTurn', () => {
    // ch3_transport_helicopter: unitsPerLineTurn 3. Över 4 leveransturer ⇒ högst
    // 12 enheter per linje. 4 lediga linjer i indochina-slice ⇒ högst 48 enheter
    // levererbart totalt inom fristen.
    const state = withOrders(createInitialState('indochina-slice', 'capacity-seed'), [
      { id: 'order-deliverable', productId: 'ch3_transport_helicopter', quantity: 10, requiredDeliveryTurns: 4, referencePrice: 400000 },
      { id: 'order-too-big', productId: 'ch3_transport_helicopter', quantity: 500, requiredDeliveryTurns: 4, referencePrice: 20000000 },
    ])

    const bids = capacity(state).bids
    expect(bids.map((b) => b.orderId)).toEqual(['order-deliverable'])
  })

  it('gör ingen politik och tar inga lån (men investerar en gång i R&D, P28)', () => {
    const state = createInitialState('indochina-slice', 'capacity-no-actions-seed')
    state.house.treasury = -1
    state.house.creditLimit = 999999
    // "Ingen politik, inga lån" (spec 10.2) gäller fortfarande — bara R&D-
    // engångsförsöket (P28) finns kvar, se motsvarande passive-test.
    expect(capacity(state).actions).toEqual([
      { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'artillery' } },
    ])

    state.house.techLevel.artillery = 8
    expect(capacity(state).actions).toEqual([])
  })
})

describe('POLICIES (spec avsnitt 7.3, ETAPP1_5_TEKNISK_SPEC.md 10.2)', () => {
  it('innehåller alla fyra botarna', () => {
    expect(Object.keys(POLICIES).sort()).toEqual(['aggressive', 'balanced', 'capacity', 'passive'])
  })
})

// P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 6, skyddsräcke 4/GK-A): "Varje nytt verb
// har en bot. Ett test räknar att samtliga nya PlayerAction-op förekommer i
// minst en policies.ts-strategi." FUND_CAMPAIGN (aggressive) och FAVOUR
// (balanced) är de två NYA op:en denna prompt bygger — BRIBE fanns redan
// (P18), bara omriktad.
describe('skyddsräcke 4 (avsnitt 6, GK-A): FUND_CAMPAIGN och FAVOUR förekommer i minst en botpolicy', () => {
  it('minst en policy skickar en FUND_CAMPAIGN-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesFundCampaign = Object.values(POLICIES).some((policy) =>
      policy(state).actions.some((a) => a.type === 'POLITICAL' && a.op === 'FUND_CAMPAIGN'),
    )
    expect(usesFundCampaign).toBe(true)
  })

  it('minst en policy skickar en FAVOUR-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesFavour = Object.values(POLICIES).some((policy) =>
      policy(state).actions.some((a) => a.type === 'POLITICAL' && a.op === 'FAVOUR'),
    )
    expect(usesFavour).toBe(true)
  })
})

// P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 6, skyddsräcke 4/GK-A): BROKER var den
// sista tysta grenen (avsnitt 1.10/3.5) — samma krav, samma mönster som P56.
// relationToPlayer/integrity höjs uttryckligen (ett fräscht parti börjar under
// BOT_BALANCE.brokerRelationThreshold för alla, se politics.ts:s egen
// kommentar om varför relationToPlayer aldrig stiger av sig själv).
describe('skyddsräcke 4 (avsnitt 6, GK-A): BROKER förekommer i minst en botpolicy', () => {
  it('minst en policy skickar en BROKER-handling när en tjänsteman är gynnsam', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    for (const official of Object.values(state.officials)) {
      official.relationToPlayer = 100
      official.integrity = 100
    }
    const usesBroker = Object.values(POLICIES).some((policy) => policy(state).actions.some((a) => a.type === 'BROKER'))
    expect(usesBroker).toBe(true)
  })
})

// P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 6, skyddsräcke 4/GK-A): INFLUENCE är
// helt nytt; LEAK/SABOTAGE/TURN gick från "deklarerad, avvisad" till
// faktiskt byggda — samma GK-A-krav som en ny handling.
describe('skyddsräcke 4 (avsnitt 6, GK-A): INFLUENCE/LEAK/SABOTAGE/TURN förekommer i minst en botpolicy', () => {
  it('minst en policy skickar en INFLUENCE-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesInfluence = Object.values(POLICIES).some((policy) =>
      policy(state).actions.some((a) => a.type === 'POLITICAL' && a.op === 'INFLUENCE'),
    )
    expect(usesInfluence).toBe(true)
  })

  it('minst en policy skickar en LEAK-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesLeak = Object.values(POLICIES).some((policy) => policy(state).actions.some((a) => a.type === 'INTEL' && a.op === 'LEAK'))
    expect(usesLeak).toBe(true)
  })

  it('minst en policy skickar en SABOTAGE-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesSabotage = Object.values(POLICIES).some((policy) =>
      policy(state).actions.some((a) => a.type === 'INTEL' && a.op === 'SABOTAGE'),
    )
    expect(usesSabotage).toBe(true)
  })

  it('minst en policy skickar en TURN-handling på ett fräscht parti', () => {
    const state = createInitialState('indochina-slice', 'gk-a-seed')
    const usesTurn = Object.values(POLICIES).some((policy) => policy(state).actions.some((a) => a.type === 'INTEL' && a.op === 'TURN'))
    expect(usesTurn).toBe(true)
  })
})
