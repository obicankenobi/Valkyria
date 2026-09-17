import { describe, expect, it } from 'vitest'
import { applyActions } from '../../src/resolve/steps/applyActions.js'
import { endings } from '../../src/resolve/steps/endings.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import { bidEstimate } from '../../src/queries.js'
import { alignmentPenalty } from '../../src/pricing.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, Order, PlayerAction, TurnSubmission, WireEvent } from '../../src/types.js'

function makeCtx(
  state: GameState,
  actions: PlayerAction[],
  seed = 'apply-actions-test',
): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const submission: TurnSubmission = { standingOrders: [], bids: [], actions }
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

describe('applyActions (isolerat steg, spec avsnitt 3.1, 5 "Ekonomi", ETAPP1_5_TEKNISK_SPEC.md avsnitt 8) — INTERNAL', () => {
  it('(P8) ett lån inom creditLimit accepteras: debt och treasury ökar, en händelse emitteras (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 1000000
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 500000 } }])
    applyActions(ctx)

    expect(state.house.debt).toBe(500000)
    expect(state.house.treasury).toBe(treasuryBefore + 500000)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('TAKES OUT A LOAN'))).toBe(true)
  })

  it('(spec avsnitt 5, "Ekonomi") ett lån över creditLimit avvisas med reason "credit limit exceeded"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 100000
    const debtBefore = state.house.debt
    const treasuryBefore = state.house.treasury

    const action: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 200000 } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.debt).toBe(debtBefore)
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'credit limit exceeded' }])
  })

  it('flera TAKE_LOAN i samma inskickning bokförs mot en krympande lokal kreditrest, inte var för sig mot samma creditLimit', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 100000

    const first: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }
    const second: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 60000 } }
    const { ctx } = makeCtx(state, [first, second])
    applyActions(ctx)

    expect(state.house.debt).toBe(60000) // bara den första fick plats (60 000 <= 100 000, men 60 000+60 000 > 100 000)
    expect(ctx.rejected).toEqual([{ action: second, reason: 'credit limit exceeded' }])
  })

  it('ett ogiltigt låneutfall (icke-numeriskt/negativt amount) avvisas med reason "invalid loan amount"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.creditLimit = 1000000

    const badAmount: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: -500 } }
    const badType: PlayerAction = { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 'a lot' } }
    const { ctx } = makeCtx(state, [badAmount, badType])
    applyActions(ctx)

    expect(state.house.debt).toBe(0)
    expect(ctx.rejected).toEqual([
      { action: badAmount, reason: 'invalid loan amount' },
      { action: badType, reason: 'invalid loan amount' },
    ])
  })

  // P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.5): BROKER byggd — den sista tysta
  // grenen. Avgörs av köparens procurement-tjänsteman (relationToPlayer +
  // integrity), förbi computeScore helt, INTE av anbudsformeln.
  it('(P57) BROKER går igenom när procurement-tjänstemannens relation och integrity når över tröskeln: direktkontrakt, standing/scandalRisk drabbas', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 2
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 60 // >= brokerRelationThreshold (50); integrity 55 >= brokerIntegrityThreshold (40) redan i scenariodata
    const standingBefore = official.standing
    const scandalBefore = official.scandalRisk

    const action: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 }
    const { ctx, emitted } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([])
    expect(state.market.contracts).toHaveLength(1)
    const contract = state.market.contracts[0]!
    expect(contract.buyerId).toBe('rvn')
    expect(contract.productId).toBe('105mm_field_gun')
    expect(contract.quantity).toBe(10)
    expect(contract.price).toBe(100000)
    expect(contract.grade).toBe('A')
    expect(contract.status).toBe('active')
    expect(contract.frontId).toBeNull()
    expect(official.standing).toBe(standingBefore - balance.brokerStandingCost)
    expect(official.scandalRisk).toBe(scandalBefore + balance.brokerScandalRiskGain)
    expect(emitted.some((e) => e.headline.includes('BROKERS A DIRECT DEAL'))).toBe(true)
  })

  it('(P57) BROKER avvisas ("official will not broker this deal") när tjänstemannens relation är under tröskeln — hård regel 6', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 2
    const before = JSON.parse(JSON.stringify(state.house)) as typeof state.house

    const action: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 }
    const { ctx, emitted } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house).toEqual(before)
    expect(state.market.contracts).toEqual([])
    expect(ctx.rejected).toEqual([{ action, reason: 'official will not broker this deal' }])
    expect(emitted).toEqual([])
  })

  it('(P57) BROKER avvisas för okänd köpare, ogiltig quantity/price och okänd produkt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 10
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 100 // hade annars godkänts — isolerar de fyra valideringarna

    const badBuyer: PlayerAction = { type: 'BROKER', buyerId: 'nope', productId: '105mm_field_gun', quantity: 10, price: 100000 }
    const badQuantity: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: -1, price: 100000 }
    const badPrice: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 0 }
    const badProduct: PlayerAction = { type: 'BROKER', buyerId: 'rvn', productId: 'not_a_real_product', quantity: 10, price: 100000 }
    const { ctx } = makeCtx(state, [badBuyer, badQuantity, badPrice, badProduct])
    applyActions(ctx)

    expect(state.market.contracts).toEqual([])
    expect(ctx.rejected).toEqual([
      { action: badBuyer, reason: 'unknown buyer faction' },
      { action: badQuantity, reason: 'invalid quantity' },
      { action: badPrice, reason: 'invalid price' },
      { action: badProduct, reason: 'unknown product' },
    ])
  })

  it('(P17 klart-när) en fjärde handling avvisas med "no executive actions remaining" när chiefOfStaff <= 70 (3 actionPoints)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefOfStaff = 70 // exakt på tröskeln — INTE över, alltså 3 st (spec 8.1: "> tröskeln")
    state.house.actionPoints = 3
    state.house.creditLimit = 10000000 // gott om utrymme, så TAKE_LOAN i sig aldrig avvisas

    const actions: PlayerAction[] = [
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
    ]
    const { ctx } = makeCtx(state, actions)
    applyActions(ctx)

    expect(state.house.debt).toBe(3000) // de tre första gick igenom
    expect(ctx.rejected).toEqual([{ action: actions[3], reason: 'no executive actions remaining' }])
  })

  it('en fjärde handling GÅR igenom när chiefOfStaff > 70 (4 actionPoints)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefOfStaff = 71
    state.house.actionPoints = 4
    state.house.creditLimit = 10000000

    const actions: PlayerAction[] = Array.from({ length: 4 }, () => ({
      type: 'INTERNAL' as const,
      op: 'TAKE_LOAN' as const,
      payload: { amount: 1000 },
    }))
    const { ctx } = makeCtx(state, actions)
    applyActions(ctx)

    expect(state.house.debt).toBe(4000)
    expect(ctx.rejected).toEqual([])
  })

  it('REPAY: treasury och debt minskar med samma belopp, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.debt = 500000
    state.house.treasury = 2000000
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'REPAY', payload: { amount: 200000 } }])
    applyActions(ctx)

    expect(state.house.debt).toBe(300000)
    expect(state.house.treasury).toBe(treasuryBefore - 200000)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('REPAYS'))).toBe(true)
  })

  it('REPAY avvisas med "repayment exceeds treasury or debt" om beloppet överstiger min(treasury, debt)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.debt = 100000
    state.house.treasury = 5000000 // gott om kassa — det är SKULDEN som är taket här
    const debtBefore = state.house.debt
    const treasuryBefore = state.house.treasury

    const action: PlayerAction = { type: 'INTERNAL', op: 'REPAY', payload: { amount: 200000 } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.debt).toBe(debtBefore)
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'repayment exceeds treasury or debt' }])
  })

  it('BUILD_LINE: en ny idle-linje läggs till, kostar buildLineCost, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const linesBefore = state.house.lines.length
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }])
    applyActions(ctx)

    expect(state.house.lines.length).toBe(linesBefore + 1)
    const newLine = state.house.lines[state.house.lines.length - 1]!
    expect(newLine.status).toBe('idle')
    expect(newLine.assignedContractId).toBeNull()
    expect(newLine.unitsPerTurnAtFull).toBe(state.house.unitsPerLineTurnDefault)
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('NEW PRODUCTION LINE'))).toBe(true)
  })

  it('BUILD_LINE avvisas med "maximum production lines reached" vid maxProductionLines (9)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    while (state.house.lines.length < 9) {
      state.house.lines.push({ ...state.house.lines[0]!, id: `line-extra-${state.house.lines.length}` })
    }
    const linesBefore = state.house.lines.length

    const action: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.lines.length).toBe(linesBefore)
    expect(ctx.rejected).toEqual([{ action, reason: 'maximum production lines reached' }])
  })

  it('HIRE: den valda rollen höjs med hireGain (tak 100), kostar hireCost', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefEngineer = 50
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }])
    applyActions(ctx)

    expect(state.house.staff.chiefEngineer).toBeGreaterThan(50)
    expect(state.house.staff.chiefEngineer).toBeLessThanOrEqual(100)
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('HIRES'))).toBe(true)
  })

  it('HIRE klampar rollen till 100, går aldrig över', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.staff.chiefSalesman = 95

    const { ctx } = makeCtx(state, [{ type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } }])
    applyActions(ctx)

    expect(state.house.staff.chiefSalesman).toBe(100)
  })

  it('HIRE avvisas med "invalid hire role" för en okänd roll', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'ceo' } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'invalid hire role' }])
  })

  it('REPRIORITISE_RND: ett RndProject läggs i kön med turnsTotal = rndProjectTurns, en händelse emitteras', () => {
    const state = createInitialState('indochina-slice', 'seed')
    expect(state.house.rnd).toEqual([])

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'aviation' } }])
    applyActions(ctx)

    expect(state.house.rnd).toHaveLength(1)
    const project = state.house.rnd[0]!
    expect(project.category).toBe('aviation')
    expect(project.turnsRemaining).toBe(project.turnsTotal)
    expect(project.turnsTotal).toBeGreaterThan(0)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('R&D'))).toBe(true)
  })

  it('REPRIORITISE_RND avvisas med "invalid R&D category" för en okänd kategori', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'cyberwarfare' } }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(state.house.rnd).toEqual([])
    expect(ctx.rejected).toEqual([{ action, reason: 'invalid R&D category' }])
  })

  it('ett pågående RndProject avancerar en tur (turnsRemaining minskar) utan en ny REPRIORITISE_RND', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.rnd = [{ id: 'rnd-existing', category: 'artillery', turnsRemaining: 3, turnsTotal: 6 }]

    const { ctx } = makeCtx(state, [])
    applyActions(ctx)

    expect(state.house.rnd).toHaveLength(1)
    expect(state.house.rnd[0]!.turnsRemaining).toBe(2)
  })

  it('ett RndProject som når 0 turnsRemaining höjer techLevel[category] och lämnar kön', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const techBefore = state.house.techLevel.naval
    state.house.rnd = [{ id: 'rnd-almost-done', category: 'naval', turnsRemaining: 1, turnsTotal: 6 }]

    const { ctx, emitted } = makeCtx(state, [])
    applyActions(ctx)

    expect(state.house.rnd).toEqual([])
    expect(state.house.techLevel.naval).toBe(techBefore + 1)
    expect(emitted.some((e) => e.headline.includes('R&D PROJECT COMPLETE') && e.headline.includes('NAVAL'))).toBe(true)
  })
})

function orderFor(state: GameState): Order {
  return {
    id: 'order-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    statedBudget: 1800000,
    trueBudget: 2400000,
    referencePrice: 2000000,
    requiredDeliveryTurns: 3,
    expiresTurn: state.meta.turn + 1,
    competingRivals: Object.keys(state.rivals),
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): buyerId är 'rvn' — samma faktions
    // procurement-tjänsteman finns garanterat i state byggd av createInitialState.
    officialId: 'official-rvn-procurement',
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: 'front-1',
  }
}

describe('applyActions — POLITICAL (ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.3, BRIBE reviderad P56 avsnitt 3.3)', () => {
  it('BRIBE höjer officialens relationToPlayer, skalat mot integrity (låg integritet ger mer), och höjer scandalRisk — kostar spend', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 40
    official.integrity = 55 // officials.json:s standardvärde, gjort explicit för testets skull
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 10000 }])
    applyActions(ctx)

    // integrityMultiplier = 1 + (1 - 55/100) * bribeLowIntegrityGainBonus(1,0) = 1,45
    // rawGain = (10 000 / 5000) * 1,45 = 2,9
    expect(official.relationToPlayer).toBeCloseTo(42.9, 6)
    expect(state.house.treasury).toBe(treasuryBefore - 10000)
    // scandalGain = 10 000 / bribeScandalRiskCostPerPoint(7500) = 1,333...
    expect(official.scandalRisk).toBeCloseTo(10000 / 7500, 6)
    expect(emitted.some((e) => e.headline.includes('CULTIVATES'))).toBe(true)
  })

  it('BRIBE klampas av bribeRelationMaxPerTurn per TJÄNSTEMAN, även över flera BRIBE samma tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 40

    // Ett enda enormt bud skulle ge långt över taket 15 (multiplikatorn gör det ännu mer).
    const { ctx: ctx1 } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 500000 }])
    applyActions(ctx1)
    expect(official.relationToPlayer).toBe(55) // 40 + 15 (taket), inte mer

    // En andra BRIBE samma tjänsteman, NY tur (nollställt tak) — samma resonemang.
    official.relationToPlayer = 40
    const { ctx: ctx2a } = makeCtx(state, [
      { type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 250000 },
      { type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 250000 },
    ])
    applyActions(ctx2a)
    expect(official.relationToPlayer).toBe(55) // fortfarande klampat till +15, trots två separata bud
  })

  it('BRIBE går aldrig över 100 relationToPlayer (eller 100 scandalRisk)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 92
    official.scandalRisk = 99

    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 100000 }])
    applyActions(ctx)

    expect(official.relationToPlayer).toBe(100)
    expect(official.scandalRisk).toBe(100)
  })

  it('BRIBE mot ett okänt officialId hamnar i rejected (hård regel 6)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', officialId: 'no-such-official', spend: 1000 }])
    applyActions(ctx)
    expect(ctx.rejected.length).toBe(1)
  })

  it('(P56 klart-når) FUND_CAMPAIGN höjer standing och håller kvar en tjänsteman som annars fallit', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    official.standing = 5 // nära noll — "skulle annars fallit" (P57 bygger den faktiska utlösaren)
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: official.id, spend: 20000 }])
    applyActions(ctx)

    // fundCampaignStandingCostPerPoint = 2000 → 20 000 / 2000 = 10 poäng
    expect(official.standing).toBe(15)
    expect(official.standing).toBeGreaterThan(5) // håller henne kvar över den låga standingen
    expect(state.house.treasury).toBe(treasuryBefore - 20000)
    expect(emitted.some((e) => e.headline.includes('FUNDS') && e.headline.includes('CAMPAIGN'))).toBe(true)
  })

  it('FUND_CAMPAIGN mot ett okänt officialId hamnar i rejected', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: 'no-such-official', spend: 1000 }])
    applyActions(ctx)
    expect(ctx.rejected.length).toBe(1)
  })

  it('(P56 klart-når) FAVOUR kostar marginal (house.favourMarginSpent), INTE kassa — höjer relationToPlayer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    official.relationToPlayer = 40
    const treasuryBefore = state.house.treasury
    const marginSpentBefore = state.house.favourMarginSpent

    const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: official.id, marginCost: 15000 }])
    applyActions(ctx)

    expect(state.house.treasury).toBe(treasuryBefore) // orört — det är hela poängen
    expect(state.house.favourMarginSpent).toBe(marginSpentBefore + 15000)
    // favourRelationCostPerPoint = 5000 → 15 000 / 5000 = 3 poäng
    expect(official.relationToPlayer).toBe(43)
    expect(emitted.some((e) => e.headline.includes('FAVOUR'))).toBe(true)
  })

  it('FAVOUR med ett ogiltigt marginCost (negativt) hamnar i rejected', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const official = state.officials['official-rvn-procurement']!
    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'FAVOUR', officialId: official.id, marginCost: -1 }])
    applyActions(ctx)
    expect(ctx.rejected.length).toBe(1)
  })

  it('(P18 klart-när) STAGE_INCIDENT mot en blockgränsande faktion: doomsdayGate anropas inom rätt intervall, kausalkedjan pekar tillbaka till handlingen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    expect(Math.abs(faction.alignment)).toBeGreaterThan(60) // premissen: rvn är blockgränsande
    const doomsdayBefore = state.doomsday

    const action: PlayerAction = { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50000 }
    // Seedad så att stageIncidentSuccessPct (65) slår in på FÖRSTA draget — inget
    // annat i den här turen (en enda station, exposure 0, ingen brinn-rullning) drar
    // ur rng:n innan STAGE_INCIDENT gör det.
    const { ctx, emitted } = makeCtx(state, [action], 'stage-incident-seed-2')
    applyActions(ctx)

    const incidentEvent = emitted.find((e) => e.headline.includes('INCIDENT STAGED'))
    expect(incidentEvent).toBeDefined()

    const doomsdayEvent = emitted.find((e) => e.headline.startsWith('DOOMSDAY'))
    expect(doomsdayEvent).toBeDefined()
    expect(doomsdayEvent!.causeId).toBe('test-0') // första emitten är incidenthändelsen
    expect(incidentEvent).toBe(emitted[0])

    const delta = state.doomsday - doomsdayBefore
    expect(delta).toBeGreaterThanOrEqual(12) // stageIncidentDoomsdayMin
    expect(delta).toBeLessThanOrEqual(20) // stageIncidentDoomsdayMax
  })

  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.1): "relationen faller ... av
  // iscensatta incidenter" — symmetriskt mellan målet (rvn) och dess
  // FRONTMOTSTÅNDARE (nlf, front-1), inte mot spelaren (relationToPlayer,
  // rört av HELT andra verb).
  it('(P59) ett lyckat STAGE_INCIDENT sänker relationen mellan målet och dess frontmotståndare, symmetriskt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rvn = state.factions['rvn']!
    const nlf = state.factions['nlf']!
    const beforeRvn = rvn.relations['nlf']!
    const beforeNlf = nlf.relations['rvn']!

    const action: PlayerAction = { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50000 }
    const { ctx, emitted } = makeCtx(state, [action], 'stage-incident-seed-2') // success=true på första draget
    applyActions(ctx)

    expect(rvn.relations['nlf']).toBe(beforeRvn - balance.relationsIncidentPenalty)
    expect(nlf.relations['rvn']).toBe(beforeNlf - balance.relationsIncidentPenalty)
    expect(emitted.some((e) => e.headline.includes('RELATIONS WORSEN') && e.headline.includes('NATIONAL LIBERATION FRONT'))).toBe(true)
  })

  it('(P29) STAGE_INCIDENT vid misslyckad attribution: en aktiv stations exposure stiger, INTE exposureEvents, ingen doomsday-effekt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    expect(station.status).toBe('active')
    const exposureBefore = station.exposure
    const exposureEventsBefore = state.house.exposureEvents.length
    const doomsdayBefore = state.doomsday

    const action: PlayerAction = { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50000 }
    // stage-incident-seed-0: success=false på första draget.
    const { ctx, emitted } = makeCtx(state, [action], 'stage-incident-seed-0')
    applyActions(ctx)

    // Avsnitt 4.1: misslyckad attribution höjer en stations exposure — bränner
    // INTE en station direkt och pushar INTE house.exposureEvents (det är bara
    // vad en FAKTISKT bränd station gör). EXPOSURE ska kräva tre brända
    // stationer, inte tre misslyckade attributioner.
    expect(state.house.exposureEvents.length).toBe(exposureEventsBefore) // orört
    expect(station.exposure).toBe(exposureBefore + 30) // misattributionExposurePenalty
    expect(state.doomsday).toBe(doomsdayBefore)
    expect(emitted.some((e) => e.headline.includes('ATTRIBUTION FAILED'))).toBe(true)
    expect(emitted.some((e) => e.headline.includes('EXPOSURE RISES'))).toBe(true)
  })

  it('(P29 klart-når) EXPOSURE kräver tre BRÄNDA stationer — hur många misslyckade attributioner som helst räcker aldrig ensamma', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!

    // Fyra misslyckade attributioner i rad — fler än exposureEventsForEnding(3).
    // 'stage-incident-seed-0' ger success=false varje gång (fräsch rng per
    // anrop, samma frö → samma första drag varje gång).
    for (let i = 0; i < 4; i++) {
      const action: PlayerAction = { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 0 }
      const { ctx } = makeCtx(state, [action], 'stage-incident-seed-0')
      applyActions(ctx)
    }

    // Stationen är kraftigt mer exponerad — men INGEN av gångerna räknades som
    // en bränd station.
    expect(station.exposure).toBeGreaterThan(0)
    expect(state.house.exposureEvents).toHaveLength(0)

    const { ctx: endingsCtx } = makeCtx(state, [], 'endings-check')
    endings(endingsCtx)
    expect(state.status.kind).not.toBe('ended') // inget EXPOSURE-slut, trots fyra misslyckade attributioner
  })

  it('BACK_CHANNEL sänker doomsday inom backChannelDoomsdayMin…Max, kostar spend', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = 50
    const treasuryBefore = state.house.treasury

    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 30000 }])
    applyActions(ctx)

    const delta = 50 - state.doomsday
    expect(delta).toBeGreaterThanOrEqual(10) // backChannelDoomsdayMin
    expect(delta).toBeLessThanOrEqual(20) // backChannelDoomsdayMax
    expect(state.house.treasury).toBe(treasuryBefore - 30000)
  })

  it('(P59) BACK_CHANNEL höjer relationen mellan målet och dess frontmotståndare, symmetriskt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rvn = state.factions['rvn']!
    const nlf = state.factions['nlf']!
    const beforeRvn = rvn.relations['nlf']!
    const beforeNlf = nlf.relations['rvn']!

    const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 30000 }])
    applyActions(ctx)

    expect(rvn.relations['nlf']).toBe(beforeRvn + balance.relationsBackChannelGain)
    expect(nlf.relations['rvn']).toBe(beforeNlf + balance.relationsBackChannelGain)
    expect(emitted.some((e) => e.headline.includes('RELATIONS IMPROVE') && e.headline.includes('NATIONAL LIBERATION FRONT'))).toBe(true)
  })

  it('POLITICAL avvisas med "unknown target faction" mot en okänd faktion', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'atlantis', spend: 1000 }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'unknown target faction' }])
  })

  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): INFLUENCE — alltid lyckad
  // ("förnekbart"), ingen rng inblandad. `direction` gör den dubbelriktad.
  describe('P60: INFLUENCE', () => {
    it('publicSupport-läget flyttar target.publicSupport enligt direction, kostar spend', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      const before = rvn.publicSupport
      const treasuryBefore = state.house.treasury

      const action: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 30000,
        direction: 'up',
        effect: { kind: 'publicSupport' },
      }
      const { ctx, emitted } = makeCtx(state, [action])
      applyActions(ctx)

      expect(rvn.publicSupport).toBe(
        Math.min(100, before + 30000 / balance.influencePublicSupportCostPerPoint),
      )
      expect(state.house.treasury).toBe(treasuryBefore - 30000)
      expect(emitted.some((e) => e.headline.includes('PUBLIC SUPPORT RISES'))).toBe(true)
    })

    it('publicSupport-läget med direction "down" sänker i stället', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      const before = rvn.publicSupport

      const action: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 30000,
        direction: 'down',
        effect: { kind: 'publicSupport' },
      }
      applyActions(makeCtx(state, [action]).ctx)

      expect(rvn.publicSupport).toBeLessThan(before)
    })

    it('relations-läget flyttar target.relations[towardFactionId], INTE towardFactionId:s egen relation tillbaka (enkelriktat)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      const nlf = state.factions['nlf']!
      const beforeRvn = rvn.relations['nlf']!
      const beforeNlf = nlf.relations['rvn']!

      const action: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 15000,
        direction: 'up',
        effect: { kind: 'relations', towardFactionId: 'nlf' },
      }
      const { ctx, emitted } = makeCtx(state, [action])
      applyActions(ctx)

      expect(rvn.relations['nlf']).toBe(
        Math.min(100, beforeRvn + 15000 / balance.influenceRelationsCostPerPoint),
      )
      expect(nlf.relations['rvn']).toBe(beforeNlf) // enkelriktat — motsatt sida orörd
      expect(emitted.some((e) => e.headline.includes('RELATIONS WITH NATIONAL LIBERATION FRONT IMPROVE'))).toBe(true)
    })

    it('avvisas för okänd targetFactionId, ogiltig spend, eller relations mot sig själv/okänt land', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const badTarget: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'atlantis',
        spend: 1000,
        direction: 'up',
        effect: { kind: 'publicSupport' },
      }
      const badSpend: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: -1,
        direction: 'up',
        effect: { kind: 'publicSupport' },
      }
      const selfTarget: PlayerAction = {
        type: 'POLITICAL',
        op: 'INFLUENCE',
        targetFactionId: 'rvn',
        spend: 1000,
        direction: 'up',
        effect: { kind: 'relations', towardFactionId: 'rvn' },
      }
      const { ctx } = makeCtx(state, [badTarget, badSpend, selfTarget])
      applyActions(ctx)

      expect(ctx.rejected).toEqual([
        { action: badTarget, reason: 'unknown target faction' },
        { action: badSpend, reason: 'invalid spend amount' },
        { action: selfTarget, reason: 'invalid influence target' },
      ])
    })
  })
})

describe('applyActions — INTEL (ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.4)', () => {
  it('EXPAND höjer station.depth (tak 5) och exposure, kostar intelExpandCost', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.depth = 0
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTEL', op: 'EXPAND', stationId: station.id }])
    applyActions(ctx)

    expect(station.depth).toBe(1)
    expect(station.exposure).toBeGreaterThanOrEqual(8) // intelExposureMin
    expect(station.exposure).toBeLessThanOrEqual(25) // intelExposureMax
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(emitted.some((e) => e.headline.includes('EXPANDED'))).toBe(true)
  })

  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3 klart-når): "samma operation ger
  // mer exposure i ett land med hög counterIntelligence" — samma seed, samma
  // roll, bara counterIntelligence olika mellan de två körningarna.
  it('(P60 klart-når) EXPAND ger mer exposure i ett land med hög counterIntelligence, samma seed', () => {
    const low = createInitialState('indochina-slice', 'expand-ci-seed')
    low.factions['rvn']!.counterIntelligence = 10
    const stationLow = low.house.stations[0]!
    applyActions(makeCtx(low, [{ type: 'INTEL', op: 'EXPAND', stationId: stationLow.id }], 'expand-ci-seed').ctx)

    const high = createInitialState('indochina-slice', 'expand-ci-seed')
    high.factions['rvn']!.counterIntelligence = 90
    const stationHigh = high.house.stations[0]!
    applyActions(makeCtx(high, [{ type: 'INTEL', op: 'EXPAND', stationId: stationHigh.id }], 'expand-ci-seed').ctx)

    expect(stationHigh.exposure).toBeGreaterThan(stationLow.exposure)
  })

  it('EXPAND klampar depth till 5, går aldrig över', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.depth = 5

    const { ctx } = makeCtx(state, [{ type: 'INTEL', op: 'EXPAND', stationId: station.id }])
    applyActions(ctx)

    expect(station.depth).toBe(5)
  })

  it('(P18 klart-när) EXPAND krymper bidEstimate:s prisintervall nästa tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.depth = 0
    station.nation = 'rvn' // samma köpare som ordern nedan
    state.house.staff.chiefSalesman = 50 // under 75 — isolerar depth-effekten, se queries.test.ts

    const order = orderFor(state)
    const before = bidEstimate(state, order, 'A')
    const widthBefore = before.rivalPriceHigh - before.rivalPriceLow

    const { ctx } = makeCtx(state, [{ type: 'INTEL', op: 'EXPAND', stationId: station.id }])
    applyActions(ctx)

    const after = bidEstimate(state, order, 'A')
    const widthAfter = after.rivalPriceHigh - after.rivalPriceLow

    expect(station.depth).toBe(1)
    expect(widthAfter).toBeLessThan(widthBefore)
  })

  it('EXPAND avvisas med "unknown station" för ett okänt station-id', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'INTEL', op: 'EXPAND', stationId: 'station-does-not-exist' }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'unknown station' }])
  })

  it('RECRUIT lägger en ny Station (depth 0, active) i den angivna nationen (targetId), kostar intelRecruitCost', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const stationsBefore = state.house.stations.length
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }])
    applyActions(ctx)

    expect(state.house.stations.length).toBe(stationsBefore + 1)
    const newStation = state.house.stations[state.house.stations.length - 1]!
    expect(newStation.nation).toBe('laos')
    expect(newStation.depth).toBe(0)
    expect(newStation.exposure).toBe(0)
    expect(newStation.status).toBe('active')
    expect(state.house.treasury).toBeLessThan(treasuryBefore)
    expect(emitted.some((e) => e.headline.includes('RECRUITS'))).toBe(true)
  })

  it('RECRUIT avvisas med "maximum stations reached" vid maxStations (5)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    while (state.house.stations.length < 5) {
      state.house.stations.push({ ...state.house.stations[0]!, id: `station-extra-${state.house.stations.length}` })
    }
    const action: PlayerAction = { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'maximum stations reached' }])
  })

  it('RECRUIT avvisas med "invalid recruit target" utan ett giltigt targetId', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const missing: PlayerAction = { type: 'INTEL', op: 'RECRUIT', stationId: '' }
    const unknown: PlayerAction = { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'atlantis' }
    const { ctx } = makeCtx(state, [missing, unknown])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([
      { action: missing, reason: 'invalid recruit target' },
      { action: unknown, reason: 'invalid recruit target' },
    ])
  })

  it('WITHDRAW sätter station.status till dormant', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.status = 'active'

    const { ctx, emitted } = makeCtx(state, [{ type: 'INTEL', op: 'WITHDRAW', stationId: station.id }])
    applyActions(ctx)

    expect(station.status).toBe('dormant')
    expect(emitted.some((e) => e.headline.includes('WITHDRAWN'))).toBe(true)
  })

  it('en vilande stations exposure faller intelDormantExposureDecay (5) per tur, golv 0', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.status = 'dormant'
    station.exposure = 3 // mindre än decay-talet — ska golvas till 0, inte bli negativt

    const { ctx } = makeCtx(state, [])
    applyActions(ctx)

    expect(station.exposure).toBe(0)
  })

  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): LEAK/SABOTAGE/TURN byggda —
  // gemensam lyckandechans (intelOpBaseSuccessPct − counterIntelligence),
  // gemensam kostnad (intelCovertOpCost), gemensam "åker fast"-bestraffning.
  // station-1 ligger i rvn (counterIntelligence 40 vid start, ordagrant
  // intelOpBaseSuccessPct(90) − 40 = 50 % lyckandechans) — seeds funna genom
  // sökning (samma metod som stage-incident-seed-0/2).
  describe('P60: LEAK/SABOTAGE/TURN', () => {
    it('LEAK (lyckad): sänker rivalens relations[nation], kostar intelCovertOpCost, ingen rejected', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rival = state.rivals['brandt']!
      const before = rival.relations['rvn'] ?? 0
      const treasuryBefore = state.house.treasury

      const action: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'brandt' }
      const { ctx, emitted } = makeCtx(state, [action], 'intel-leak-seed-2')
      applyActions(ctx)

      expect(ctx.rejected).toEqual([])
      expect(rival.relations['rvn']).toBe(Math.max(0, before - balance.leakRelationPenalty))
      expect(state.house.treasury).toBe(treasuryBefore - balance.intelCovertOpCost)
      expect(emitted.some((e) => e.headline.includes('LEAKS DAMAGING INFORMATION'))).toBe(true)
    })

    it('LEAK (misslyckad): rivalens relations orörda, landets counterIntelligence och stationens exposure stiger', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rival = state.rivals['brandt']!
      const relationsBefore = rival.relations['rvn'] ?? 0
      const rvn = state.factions['rvn']!
      const ciBefore = rvn.counterIntelligence
      const station = state.house.stations[0]!
      const exposureBefore = station.exposure

      const action: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'brandt' }
      const { ctx } = makeCtx(state, [action], 'intel-leak-seed-0')
      applyActions(ctx)

      expect(rival.relations['rvn']).toBe(relationsBefore) // orört — misslyckandet drabbar INTE rivalen
      expect(rvn.counterIntelligence).toBe(ciBefore + balance.intelCaughtCounterIntelligenceGain)
      expect(station.exposure).toBeGreaterThan(exposureBefore)
    })

    it('LEAK avvisas för okänd station eller okänt rivalmål', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const badStation: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'nope', targetId: 'brandt' }
      const badRival: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'nope' }
      const { ctx } = makeCtx(state, [badStation, badRival])
      applyActions(ctx)

      expect(ctx.rejected).toEqual([
        { action: badStation, reason: 'unknown station' },
        { action: badRival, reason: 'unknown rival target' },
      ])
    })

    it('SABOTAGE (lyckad): sätter rival.sabotagedUntilTurn — samma fält bidding.ts redan läser (avsnitt 2.5)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rival = state.rivals['brandt']!
      expect(rival.sabotagedUntilTurn).toBeNull()

      const action: PlayerAction = { type: 'INTEL', op: 'SABOTAGE', stationId: 'station-1', targetId: 'brandt' }
      const { ctx, emitted } = makeCtx(state, [action], 'intel-sabotage-seed-0')
      applyActions(ctx)

      expect(rival.sabotagedUntilTurn).toBe(state.meta.turn + balance.rivalSabotageCooldownTurns)
      expect(emitted.some((e) => e.headline.includes('SABOTAGES'))).toBe(true)
    })

    it('SABOTAGE (misslyckad): sabotagedUntilTurn orört, landet åker fast', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rival = state.rivals['brandt']!
      const rvn = state.factions['rvn']!
      const ciBefore = rvn.counterIntelligence

      const action: PlayerAction = { type: 'INTEL', op: 'SABOTAGE', stationId: 'station-1', targetId: 'brandt' }
      const { ctx } = makeCtx(state, [action], 'intel-sabotage-seed-1')
      applyActions(ctx)

      expect(rival.sabotagedUntilTurn).toBeNull()
      expect(rvn.counterIntelligence).toBe(ciBefore + balance.intelCaughtCounterIntelligenceGain)
    })

    it('TURN (lyckad): höjer official.relationToPlayer med turnRelationGain', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const official = state.officials['official-rvn-procurement']!
      const before = official.relationToPlayer

      const action: PlayerAction = { type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: official.id }
      const { ctx, emitted } = makeCtx(state, [action], 'intel-turn-seed-4')
      applyActions(ctx)

      expect(official.relationToPlayer).toBe(Math.min(100, before + balance.turnRelationGain))
      expect(emitted.some((e) => e.headline.includes('TURNS'))).toBe(true)
    })

    it('TURN (misslyckad): sänker official.standing med turnFailureStandingPenalty, landet åker fast', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const official = state.officials['official-rvn-procurement']!
      const standingBefore = official.standing
      const rvn = state.factions['rvn']!
      const ciBefore = rvn.counterIntelligence

      const action: PlayerAction = { type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: official.id }
      const { ctx } = makeCtx(state, [action], 'intel-turn-seed-0')
      applyActions(ctx)

      expect(official.standing).toBe(Math.max(0, standingBefore - balance.turnFailureStandingPenalty))
      expect(rvn.counterIntelligence).toBe(ciBefore + balance.intelCaughtCounterIntelligenceGain)
    })

    it('TURN avvisas för okänd station eller en tjänsteman i FEL land', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const badStation: PlayerAction = { type: 'INTEL', op: 'TURN', stationId: 'nope', targetId: 'official-rvn-procurement' }
      // official-nlf-procurement hör till nlf, station-1 ligger i rvn.
      const wrongNation: PlayerAction = { type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: 'official-nlf-procurement' }
      const { ctx } = makeCtx(state, [badStation, wrongNation])
      applyActions(ctx)

      expect(ctx.rejected).toEqual([
        { action: badStation, reason: 'unknown station' },
        { action: wrongNation, reason: 'unknown official target' },
      ])
    })
  })

  it('(P18 klart-när) en station kan brännas: status blir "burned", exposureEvents växer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.exposure = 90 // över exposureBurnThreshold (80)
    const exposureEventsBefore = state.house.exposureEvents.length

    // station-burn-seed-5: rng.chance(stationBurnChancePct=20) lyckas på FÖRSTA
    // draget — advanceStations gör exakt ett rng-anrop här (en station, ingen
    // ny handling drar ur rng:n innan dess).
    const { ctx, emitted } = makeCtx(state, [], 'station-burn-seed-5')
    applyActions(ctx)

    expect(station.status).toBe('burned')
    expect(state.house.exposureEvents.length).toBe(exposureEventsBefore + 1)
    expect(emitted.some((e) => e.headline.includes('BURNED'))).toBe(true)
  })

  it('en station under exposureBurnThreshold rullar aldrig mot avslöjande', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.exposure = 50 // under tröskeln 80

    // Samma seed som garanterat bränner EN station ÖVER tröskeln — beviset att
    // skillnaden är tröskeln, inte turen.
    const { ctx } = makeCtx(state, [], 'station-burn-seed-5')
    applyActions(ctx)

    expect(station.status).not.toBe('burned')
  })

  it('en redan bränd station rullar aldrig igen (ingen ny exposureEvents-post)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const station = state.house.stations[0]!
    station.exposure = 90
    station.status = 'burned'
    const exposureEventsBefore = state.house.exposureEvents.length

    const { ctx } = makeCtx(state, [], 'station-burn-seed-5')
    applyActions(ctx)

    expect(state.house.exposureEvents.length).toBe(exposureEventsBefore)
  })
})

describe('applyActions — P20: CRISIS (avsnitt 9.3, DESIGN.md §6.2) — löser ett pendingCrisis flaggat av doomsday.ts en tidigare tur', () => {
  it('(P20 klart-när) PUSH kan leda till NUCLEAR_EXCHANGE — doomsday sätts till 100 när utbytet (crisisPushExchangePct) slår in', () => {
    let found = false
    for (let i = 0; i < 500 && !found; i++) {
      const state = createInitialState('indochina-slice', 'seed')
      state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
      const action: PlayerAction = { type: 'CRISIS', choice: 'PUSH' }

      const { ctx, emitted } = makeCtx(state, [action], `push-exchange-seed-${i}`)
      applyActions(ctx)

      if (state.doomsday !== 100) continue

      found = true
      expect(emitted.some((e) => e.headline.includes('CATASTROPHIC MISCALCULATION'))).toBe(true)
      expect(state.doomsday).toBeGreaterThanOrEqual(balance.doomsdayNuclearExchangeThreshold) // endings.ts:s NUCLEAR_EXCHANGE-tröskel
      expect(state.pendingCrisis).toBeNull()
    }
    expect(found).toBe(true)
  })

  it('(P20 klart-när) PUSH utan utbyte trappar ned till crisisPushBackdownTarget och tecknar ett femårskontrakt med teaterns största köpare', () => {
    let found = false
    for (let i = 0; i < 500 && !found; i++) {
      const state = createInitialState('indochina-slice', 'seed')
      state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
      const action: PlayerAction = { type: 'CRISIS', choice: 'PUSH' }
      const contractsBefore = state.market.contracts.length

      const { ctx, emitted } = makeCtx(state, [action], `push-blink-seed-${i}`)
      applyActions(ctx)

      if (state.doomsday === 100) continue // utbytet slog in i den här iterationen — testar den andra grenen

      found = true
      expect(emitted.some((e) => e.headline.includes('BLINKS FIRST'))).toBe(true)
      expect(state.doomsday).toBe(balance.crisisPushBackdownTarget)
      expect(state.market.contracts.length).toBe(contractsBefore + 1)
      const contract = state.market.contracts.at(-1)!
      expect(contract.quantity).toBe(balance.crisisPushContractQuantity)
      expect(state.pendingCrisis).toBeNull()
    }
    expect(found).toBe(true)
  })

  it('(P20 klart-när) BACK_DOWN bränner en slumpvald aktiv station och lägger till en exposureEvents-post', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
    const station = state.house.stations[0]!
    expect(station.status).toBe('active') // sanity: förutsättningen för att BACK_DOWN har något att bränna
    const exposureEventsBefore = state.house.exposureEvents.length

    const action: PlayerAction = { type: 'CRISIS', choice: 'BACK_DOWN' }
    const { ctx, emitted } = makeCtx(state, [action], 'back-down-seed')
    applyActions(ctx)

    expect(station.status).toBe('burned')
    expect(station.exposure).toBe(100)
    expect(state.house.exposureEvents.length).toBe(exposureEventsBefore + 1)
    expect(state.house.exposureEvents.at(-1)).toBe(state.meta.turn)
    expect(state.doomsday).toBe(balance.crisisBackDownDoomsdayTarget)
    expect(emitted.some((e) => e.headline === 'BACK DOWN')).toBe(true) // spelarvalt, INTE "(AUTOMATIC ...)"
    expect(state.pendingCrisis).toBeNull()
  })

  it('(P20 klart-än) BACK_DOWN annullerar kvartalets restricted-intäkt (treasury och revenueByTurn för den flaggade turen)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 5
    state.pendingCrisis = { turn: 3, theatreId: 'indochina', restrictedRevenueThisTurn: 400000 }
    state.house.revenueByTurn[3] = 900000
    const treasuryBefore = state.house.treasury

    const action: PlayerAction = { type: 'CRISIS', choice: 'BACK_DOWN' }
    const { ctx } = makeCtx(state, [action], 'back-down-clawback-seed')
    applyActions(ctx)

    expect(state.house.treasury).toBe(treasuryBefore - 400000)
    expect(state.house.revenueByTurn[3]).toBe(500000) // 900 000 - 400 000, den flaggade turens intäkt — inte turen krisen löses
  })

  it('(P20 klart-när) SELL_THE_FILE ger engångsintäkt och sänker permanent westStanding/eastStanding — synligt i alignmentPenalty för en bloc-anpassad faktion', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
    const treasuryBefore = state.house.treasury
    const rvn = state.factions['rvn']! // alignment 70 (väst) — indochina-slice.json
    const penaltyBefore = alignmentPenalty(rvn.alignment, state.house)

    const action: PlayerAction = { type: 'CRISIS', choice: 'SELL_THE_FILE' }
    const { ctx, emitted } = makeCtx(state, [action], 'sell-the-file-seed')
    applyActions(ctx)

    expect(state.house.treasury).toBe(treasuryBefore + balance.crisisSellFileRevenue)
    expect(state.doomsday).toBe(balance.crisisSellFileTarget)
    expect(state.house.reputation.westStanding).toBe(50 - balance.crisisSellFileStandingPenalty)
    expect(state.house.reputation.eastStanding).toBe(50 - balance.crisisSellFileStandingPenalty)

    const penaltyAfter = alignmentPenalty(rvn.alignment, state.house)
    expect(penaltyAfter).toBeLessThan(penaltyBefore) // samma bloc-anpassade köpares score-term faller mätbart i en senare bud-utvärdering (pricing.ts, computeScore)
    expect(emitted.some((e) => e.headline.includes('STANDING WITH BOTH BLOCS COLLAPSES'))).toBe(true)
    expect(state.pendingCrisis).toBeNull()
  })

  it('(P20 klart-när) ingen CRISIS-handling skickas in → automatisk BACK_DOWN, flaggad som sådan i headline och actorIsPlayer:false', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }
    const station = state.house.stations[0]!

    const { ctx, emitted } = makeCtx(state, [], 'automatic-back-down-seed') // inga actions alls

    applyActions(ctx)

    const backDownEvent = emitted.find((e) => e.headline.includes('BACK DOWN'))
    expect(backDownEvent).toBeDefined()
    expect(backDownEvent!.headline).toContain('AUTOMATIC')
    expect(backDownEvent!.headline).toContain('NO CRISIS CHOICE SUBMITTED')
    expect(backDownEvent!.actorIsPlayer).toBe(false)
    expect(state.doomsday).toBe(balance.crisisBackDownDoomsdayTarget)
    expect(station.status).toBe('burned')
    expect(state.pendingCrisis).toBeNull()
  })

  it('en actionPoint konsumeras INTE av CRISIS — handlingstaket gäller bara övriga handlingstyper', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 1
    state.pendingCrisis = { turn: state.meta.turn, theatreId: 'indochina', restrictedRevenueThisTurn: 0 }

    const crisisAction: PlayerAction = { type: 'CRISIS', choice: 'SELL_THE_FILE' }
    const internalAction: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }
    const { ctx } = makeCtx(state, [crisisAction, internalAction], 'crisis-action-point-seed')
    applyActions(ctx)

    expect(ctx.rejected).toEqual([]) // internalAction fick plats — CRISIS drog inget ur actionPoints-taket
    expect(state.house.lines.length).toBeGreaterThan(0)
  })

  it('inget pendingCrisis satt → CRISIS-handlingen (om en ändå skickas in) är en no-op, ingen krishändelse löses', () => {
    const state = createInitialState('indochina-slice', 'seed')
    expect(state.pendingCrisis).toBeNull()
    const doomsdayBefore = state.doomsday

    const action: PlayerAction = { type: 'CRISIS', choice: 'PUSH' }
    const { ctx, emitted } = makeCtx(state, [action], 'no-pending-crisis-seed')
    applyActions(ctx)

    expect(state.doomsday).toBe(doomsdayBefore)
    expect(emitted.some((e) => e.headline.includes('PUSH') || e.headline.includes('BACK DOWN') || e.headline.includes('SELL THE FILE'))).toBe(false)
  })
})

// P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5) — MARKET-verbet, BUY_FORWARD/RELEASE.
// "BUY_FORWARD sänker effektiv styckkostnad så länge innehavet räcker" är ett
// production.ts-test (production.test.ts) — applyActions.ts bara SKAPAR
// innehavet, den faktiska rabatten sker vid produktion.
describe('applyActions — P51: MARKET (BUY_FORWARD/RELEASE, avsnitt 4.5)', () => {
  it('(P51 klart-når) BUY_FORWARD flyttar spend från treasury till commodityHoldings, 1:1', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: 500000 }])
    applyActions(ctx)

    expect(state.house.treasury).toBe(treasuryBefore - 500000)
    expect(state.house.commodityHoldings.steel).toBe(500000)
    expect(state.house.commodityHoldings.oil).toBe(0) // bara den köpta råvaran rörs
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('BUYS STEEL FORWARD'))).toBe(true)
  })

  it('(P51 klart-når) RELEASE ger kassa 1:1 och trycker ner PRECIS den råvarans pris, inte de andra', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.commodityHoldings.steel = 500000
    const treasuryBefore = state.house.treasury
    const steelBefore = state.market.commodities.steel
    const indexBefore = state.market.supplyCostIndex

    const { ctx, emitted } = makeCtx(state, [{ type: 'MARKET', op: 'RELEASE', commodity: 'steel', spend: 500000 }])
    applyActions(ctx)

    expect(state.house.treasury).toBe(treasuryBefore + 500000)
    expect(state.house.commodityHoldings.steel).toBe(0)
    expect(state.market.commodities.steel).toBeLessThan(steelBefore) // trycker ner priset
    expect(state.market.commodities.oil).toBe(100) // orört — bara den släppta råvaran
    expect(state.market.supplyCostIndex).toBeLessThan(indexBefore)
    expect(ctx.rejected).toEqual([])
    expect(emitted.some((e) => e.headline.includes('RELEASES STEEL ONTO THE MARKET'))).toBe(true)
  })

  it('(P51 klart-når) en MARKET-handling med okänd råvara hamnar i rejected — ingen effekt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const treasuryBefore = state.house.treasury

    const action = { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'plutonium', spend: 100000 } as unknown as PlayerAction
    const { ctx, emitted } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'unknown commodity' }])
    expect(state.house.treasury).toBe(treasuryBefore)
    expect(emitted).toEqual([])
  })

  it('(P51 klart-når) en MARKET-handling med ogiltigt belopp (0, negativt, icke-numeriskt) hamnar i rejected', () => {
    const state = createInitialState('indochina-slice', 'seed')

    const zero: PlayerAction = { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: 0 }
    const negative: PlayerAction = { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: -100 }
    const notFinite = { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: 'a lot' } as unknown as PlayerAction
    const { ctx } = makeCtx(state, [zero, negative, notFinite])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([
      { action: zero, reason: 'invalid market spend amount' },
      { action: negative, reason: 'invalid market spend amount' },
      { action: notFinite, reason: 'invalid market spend amount' },
    ])
  })

  it('BUY_FORWARD avvisas om spend överstiger treasury', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'steel', spend: state.house.treasury + 1 }

    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'insufficient treasury' }])
  })

  it('RELEASE avvisas om spend överstiger det faktiska innehavet', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.commodityHoldings.steel = 1000
    const action: PlayerAction = { type: 'MARKET', op: 'RELEASE', commodity: 'steel', spend: 1001 }

    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'release exceeds holding' }])
    expect(state.house.commodityHoldings.steel).toBe(1000) // orört
  })
})
