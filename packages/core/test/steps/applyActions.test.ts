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

  it('BROKER/MARKET förblir helt obyggda no-ops (ingen prompt äger dem i etapp 1,5) — men konsumerar en actionPoint', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.actionPoints = 2
    const before = JSON.parse(JSON.stringify(state.house)) as typeof state.house

    const { ctx, emitted } = makeCtx(state, [
      { type: 'BROKER', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, price: 100000 },
      { type: 'MARKET', op: 'BUY_FORWARD', spend: 0 },
    ])
    applyActions(ctx)

    expect(state.house).toEqual(before) // ingen ekonomisk effekt av något av de två
    expect(ctx.rejected).toEqual([]) // inte AVVISADE (ogiltiga) — bara aldrig byggda i etapp 1,5
    expect(emitted).toEqual([])
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
    inspectorIntegrity: 50,
  }
}

describe('applyActions — POLITICAL (ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.3)', () => {
  it('BRIBE höjer relationToPlayer med spend / bribeRelationCostPerPoint, kostar spend', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.relationToPlayer = 40
    const treasuryBefore = state.house.treasury

    const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', targetFactionId: 'rvn', spend: 10000 }])
    applyActions(ctx)

    // bribeRelationCostPerPoint = 5000 → 10 000 / 5000 = 2 poäng
    expect(faction.relationToPlayer).toBe(42)
    expect(state.house.treasury).toBe(treasuryBefore - 10000)
    expect(emitted.some((e) => e.headline.includes('CULTIVATES'))).toBe(true)
  })

  it('BRIBE klampas av bribeRelationMaxPerTurn per målfaktion, även över flera BRIBE samma tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.relationToPlayer = 40

    // Ett enda enormt bud skulle ge 100 poäng (500 000 / 5000) — långt över taket 15.
    const { ctx: ctx1 } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', targetFactionId: 'rvn', spend: 500000 }])
    applyActions(ctx1)
    expect(faction.relationToPlayer).toBe(55) // 40 + 15 (taket), inte 100+

    // En andra BRIBE samma faktion, NY tur (nollställt tak) — samma resonemang.
    faction.relationToPlayer = 40
    const { ctx: ctx2a } = makeCtx(state, [
      { type: 'POLITICAL', op: 'BRIBE', targetFactionId: 'rvn', spend: 250000 },
      { type: 'POLITICAL', op: 'BRIBE', targetFactionId: 'rvn', spend: 250000 },
    ])
    applyActions(ctx2a)
    expect(faction.relationToPlayer).toBe(55) // fortfarande klampat till +15, trots två separata bud
  })

  it('BRIBE går aldrig över 100 relationToPlayer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.relationToPlayer = 92

    const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'BRIBE', targetFactionId: 'rvn', spend: 100000 }])
    applyActions(ctx)

    expect(faction.relationToPlayer).toBe(100)
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

  it('POLITICAL avvisas med "unknown target faction" mot en okänd faktion', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const action: PlayerAction = { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'atlantis', spend: 1000 }
    const { ctx } = makeCtx(state, [action])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([{ action, reason: 'unknown target faction' }])
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

  it('LEAK/SABOTAGE/TURN avvisas med "not implemented in this stage"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const leak: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'station-1' }
    const sabotage: PlayerAction = { type: 'INTEL', op: 'SABOTAGE', stationId: 'station-1' }
    const turnOp: PlayerAction = { type: 'INTEL', op: 'TURN', stationId: 'station-1' }
    const { ctx } = makeCtx(state, [leak, sabotage, turnOp])
    applyActions(ctx)

    expect(ctx.rejected).toEqual([
      { action: leak, reason: 'not implemented in this stage' },
      { action: sabotage, reason: 'not implemented in this stage' },
      { action: turnOp, reason: 'not implemented in this stage' },
    ])
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
