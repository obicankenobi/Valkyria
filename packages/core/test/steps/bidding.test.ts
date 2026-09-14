import { describe, expect, it } from 'vitest'
import { bidding } from '../../src/resolve/steps/bidding.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, Order, TurnSubmission, WireEvent } from '../../src/types.js'

function makeCtx(
  state: GameState,
  submission: TurnSubmission,
  seed: string,
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

// En redan förfallen order (expiresTurn <= state.meta.turn), byggd för hand så
// testerna inte behöver gå via orders.ts för att sätta upp ett scenario.
function dueOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-0-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2200000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: 0,
    competingRivals: ['brandt', 'costigan', 'meridian'],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    inspectorIntegrity: 50,
    ...overrides,
  }
}

describe('bidding (isolerat steg, spec avsnitt 4.2, 4.4)', () => {
  it('en order vars expiresTurn inte nåtts än rör den inte', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.openOrders = [dueOrder({ expiresTurn: 5 })]
    state.meta.turn = 2

    const { ctx } = makeCtx(state, { standingOrders: [], bids: [], actions: [] }, 'bidding-seed')
    bidding(ctx)

    expect(state.market.openOrders).toHaveLength(1)
    expect(state.market.contracts).toHaveLength(0)
  })

  it('(d) ett bud över trueBudget förlorar mot ett lägre bud med sämre poäng på alla andra termer', () => {
    // Spelarens bud är prismässigt BÄST tänkbart (lågt pris, snabb leverans) men
    // över trueBudget — ska diskvalificeras och förlora mot en rival vars bud är
    // dyrare (sämre pris-score) men under taket.
    const state = createInitialState('indochina-slice', 'seed')
    // trueBudget måste vara högt nog för att RIVALENS bud (referencePrice × minst
    // ~1,07 givet aggression 90 och jitter) ska klara taket — annars diskvalificeras
    // båda och testet bevisar bara att en obesvarad order kan uppstå, inte att ett
    // sämre-men-under-taket bud slår ett bättre-men-över-taket.
    const order = dueOrder({ trueBudget: 2300000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0
    // En enda rival, med låg aggression (litet margin) så dess bud hamnar nära
    // referencePrice och under trueBudget även med jitter.
    state.rivals = {
      brandt: {
        id: 'brandt',
        name: 'Brandt',
        specialisation: 'infantry',
        aggression: 90,
        temperament: 'opportunist',
        capital: 9999999,
        marketShare: 30,
        sabotagedUntilTurn: null,
        homeState: 'neutral',
        relations: {},
        reputation: { quality: 50, reliability: 50 },
        contracts: [],
        supplyPlayCooldownUntilTurn: null,
      },
    }
    order.competingRivals = ['brandt']

    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order.id, price: 2500000, deliveryTurns: 1, grade: 'A', bribe: 999999 }], // över trueBudget
      actions: [],
    }
    const { ctx, emitted } = makeCtx(state, submission, 'bidding-seed')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(0) // spelaren vann inte — ingen Contract-post skapas för en rivalvinst
    expect(emitted.some((e) => e.headline.includes('DISQUALIFIED') && e.actorIsPlayer)).toBe(true)
    // Rivalen VANN (informativ wire-händelse), bara ingen Contract-datapost för den.
    expect(emitted.some((e) => e.headline.includes('WINS CONTRACT') && e.headline.includes('BRANDT'))).toBe(true)
    // Ordern ska ändå ha avgjorts (borttagen ur openOrders) med rivalen som vinnare,
    // inte "unfulfilled" — annars bevisar testet inget om diskvalificering vs vinst.
    expect(state.market.openOrders).toHaveLength(0)
    expect(emitted.some((e) => e.headline.includes('WINS CONTRACT'))).toBe(true)
  })

  it('skapar Contract med unitCostAtSigning när spelaren vinner, höjer relationToPlayer, minskar militaryBudget', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0
    const factionBefore = { ...state.factions['rvn']! }

    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order.id, price: 1500000, deliveryTurns: 2, grade: 'A', bribe: 0 }],
      actions: [],
    }
    const { ctx, emitted } = makeCtx(state, submission, 'bidding-seed-win')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(1)
    const contract = state.market.contracts[0]!
    expect(contract.price).toBe(1500000)
    expect(contract.grade).toBe('A')
    expect(contract.unitsDelivered).toBe(0)
    expect(contract.status).toBe('active')
    expect(contract.dueTurn).toBe(state.meta.turn + 2)
    expect(contract.unitCostAtSigning).toBeGreaterThan(0)

    const factionAfter = state.factions['rvn']!
    expect(factionAfter.relationToPlayer).toBeGreaterThan(factionBefore.relationToPlayer)
    expect(factionAfter.relationToPlayer - factionBefore.relationToPlayer).toBeGreaterThanOrEqual(4)
    expect(factionAfter.relationToPlayer - factionBefore.relationToPlayer).toBeLessThanOrEqual(8)
    expect(factionAfter.militaryBudget).toBe(factionBefore.militaryBudget - 1500000)

    expect(emitted.some((e) => e.severity === 'headline' && e.headline.includes('WINS CONTRACT'))).toBe(true)
  })

  it('en order utan bud och utan giltiga rivalbud förblir obesvarad — inget kontrakt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const order = dueOrder({ trueBudget: 1, referencePrice: 2000000, expiresTurn: 0 }) // omöjligt lågt tak
    state.market.openOrders = [order]
    state.meta.turn = 0

    const { ctx, emitted } = makeCtx(state, { standingOrders: [], bids: [], actions: [] }, 'bidding-seed')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(0)
    expect(state.market.openOrders).toHaveLength(0)
    expect(emitted.some((e) => e.headline.includes('UNFULFILLED'))).toBe(true)
  })

  it('avvisar ett bud mot en order som inte finns', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.openOrders = []
    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: 'does-not-exist', price: 100, deliveryTurns: 1, grade: 'A', bribe: 0 }],
      actions: [],
    }
    const { ctx } = makeCtx(state, submission, 'bidding-seed')
    bidding(ctx)
    expect(ctx.rejected).toHaveLength(1)
    expect(ctx.rejected[0]?.reason).toContain('unknown order')
  })

  it('avvisar ett dubblettbud på samma order och behåller bara det första', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0

    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [
        { orderId: order.id, price: 1000000, deliveryTurns: 2, grade: 'A', bribe: 0 },
        { orderId: order.id, price: 1200000, deliveryTurns: 2, grade: 'A', bribe: 0 },
      ],
      actions: [],
    }
    const { ctx } = makeCtx(state, submission, 'bidding-seed')
    bidding(ctx)

    expect(ctx.rejected).toHaveLength(1)
    expect(ctx.rejected[0]?.reason).toContain('duplicate bid')
    expect(state.market.contracts[0]?.price).toBe(1000000) // det första budet vann
  })

  it('rivalvinst skapar inget Contract men minskar militaryBudget', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0
    const before = state.factions['rvn']!.militaryBudget

    // Inget spelarbud alls — en rival vinner per definition om någon klarar taket.
    const { ctx } = makeCtx(state, { standingOrders: [], bids: [], actions: [] }, 'bidding-seed-rival')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(0)
    expect(state.factions['rvn']!.militaryBudget).toBeLessThan(before)
  })
})

describe('bidding — (c) rivaljitter ger osäkerhet i utfallet', () => {
  it('vinstfrekvensen vid ett fast pris ligger mellan 5% och 95% över 200 seeds', () => {
    const SEEDS = 200
    let wins = 0

    for (let i = 0; i < SEEDS; i++) {
      const state = createInitialState('indochina-slice', `variance-seed-${i}`)
      const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
      state.market.openOrders = [order]
      state.meta.turn = 0
      // En enda rival (Brandt: aggression 55, specialisation artillery — matchar
      // produktkategorin, specBonus −0,04). Förväntat bud utan jitter (P22-
      // balanspasset sänkte rivalMarginBase 0,3→0,1 för att få upp rivalWinPct, se
      // ANDRINGSLOGG.md): 2 000 000 × (1 − 0,021 − 0,04) ≈ 1 878 000, jitter ±60 000.
      state.rivals = {
        brandt: {
          id: 'brandt',
          name: 'Brandt',
          specialisation: 'artillery',
          aggression: 55,
          temperament: 'opportunist',
          capital: 5000000,
          marketShare: 30,
          sabotagedUntilTurn: null,
          homeState: 'neutral',
          relations: {},
          reputation: { quality: 50, reliability: 50 },
          contracts: [],
          supplyPlayCooldownUntilTurn: null,
        },
      }
      order.competingRivals = ['brandt']

      // Spelaren har fortfarande en strukturell fördel oavsett pris (rivalens
      // leveranstid missar kravet ~1 av 3 gånger, vilket kostar den poäng på
      // deliveryTerm) — ett pris rakt på rivalens förväntade bud hade därför vunnit
      // klart oftare än 50 %. 1 900 000 är empiriskt avvägt (se P22-balanspasset,
      // docs/ANDRINGSLOGG.md) till en vinstfrekvens runt 60 %, långt innanför
      // [5 %, 95 %] men fortfarande synligt påverkat av jittret åt båda hållen.
      const fixedPrice = 1900000
      const submission: TurnSubmission = {
        standingOrders: [],
        bids: [{ orderId: order.id, price: fixedPrice, deliveryTurns: 3, grade: 'A', bribe: 0 }],
        actions: [],
      }
      const { ctx } = makeCtx(state, submission, `variance-seed-${i}`)
      bidding(ctx)

      if (state.market.contracts.length > 0) wins++
    }

    const winRate = wins / SEEDS
    expect(winRate).toBeGreaterThan(0.05)
    expect(winRate).toBeLessThan(0.95)
  })

  it('(P19 klart-när) ett bud avvisas med "reputation below buyer threshold" när reliability < reliabilityBidFloor (15)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.reputation.reliability = 14 // under golvet 15
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0

    const bid = { orderId: order.id, price: 1500000, deliveryTurns: 2, grade: 'A' as const, bribe: 0 }
    const submission: TurnSubmission = { standingOrders: [], bids: [bid], actions: [] }
    const { ctx, emitted } = makeCtx(state, submission, 'bidding-seed')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(0)
    expect(ctx.rejected).toEqual([{ action: bid, reason: 'reputation below buyer threshold' }])
    expect(emitted.some((e) => e.headline.includes('RELIABILITY BELOW BUYER THRESHOLD'))).toBe(true)
  })

  it('reliability på exakt reliabilityBidFloor (15) diskvalificerar INTE — golvet är strikt "<"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.reputation.reliability = 15
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0

    const bid = { orderId: order.id, price: 1500000, deliveryTurns: 2, grade: 'A' as const, bribe: 0 }
    const submission: TurnSubmission = { standingOrders: [], bids: [bid], actions: [] }
    const { ctx } = makeCtx(state, submission, 'bidding-seed-win')
    bidding(ctx)

    expect(ctx.rejected).toEqual([])
  })

  it('(P19 klart-när) en order dras tillbaka med "WITHDRAWN — BUDGET EXHAUSTED" när vinnarens pris överstiger köparens militaryBudget', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const order = dueOrder({ trueBudget: 3000000, referencePrice: 2000000, expiresTurn: 0 })
    state.market.openOrders = [order]
    state.meta.turn = 0
    state.factions['rvn']!.militaryBudget = 1000000 // mindre än det bud som annars skulle vinna

    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order.id, price: 1500000, deliveryTurns: 2, grade: 'A', bribe: 0 }],
      actions: [],
    }
    const { ctx, emitted } = makeCtx(state, submission, 'bidding-seed-win')
    bidding(ctx)

    expect(state.market.contracts).toHaveLength(0)
    expect(state.market.openOrders).toHaveLength(0) // avgjord — inte kvar som öppen
    expect(emitted.some((e) => e.headline.includes('WITHDRAWN — BUDGET EXHAUSTED'))).toBe(true)
  })
})
