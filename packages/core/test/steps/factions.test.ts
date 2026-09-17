import { describe, expect, it } from 'vitest'
import { factions } from '../../src/resolve/steps/factions.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  const ids: string[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      const id = `test-${seq++}`
      ids.push(id)
      return id
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('factions (isolerat steg, spec avsnitt 5 "Faktion")', () => {
  it('(P7 klart-när) embargo → bankrutt → annullerat kontrakt bildar en oavbruten causeId-kedja', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.embargoed = true
    // Nära bankrutt redan innan denna tur, dränering knuffar över gränsen.
    faction.treasury = 100
    faction.negativeTreasuryTurns = balance.factionBankruptcyTurns - 1

    state.market.contracts.push({
      id: 'contract-1',
      buyerId: 'rvn',
      productId: 'artillery-a',
      quantity: 10,
      unitsDelivered: 0,
      price: 1000,
      unitCostAtSigning: 500,
      grade: 'A',
      dueTurn: 10,
      status: 'active',
      lateEventId: null,
      frontId: null,
    })

    const { ctx, emitted } = makeCtx(state, 'faction-seed')
    factions(ctx)

    expect(faction.bankrupt).toBe(true)
    const contract = state.market.contracts.find((c) => c.id === 'contract-1')!
    expect(contract.status).toBe('voided')

    // Substrängarna får inte överlappa: bankrutthändelsens headline innehåller
    // själv ordet "VOIDED" ("ALL CONTRACTS VOIDED") och annulleringshändelsens
    // innehåller "BANKRUPT" — en enkel .includes('BANKRUPT')/.includes('VOIDED')
    // skulle träffa fel event. Sök på det som är unikt för respektive headline.
    const drainEvent = emitted.find((e) => e.headline.includes('STRAINS UNDER YOUR EMBARGO'))
    const bankruptcyEvent = emitted.find((e) => e.headline.includes('ALL CONTRACTS VOIDED'))
    const voidEvent = emitted.find((e) => e.headline.startsWith('CONTRACT '))
    expect(drainEvent).toBeDefined()
    expect(bankruptcyEvent).toBeDefined()
    expect(voidEvent).toBeDefined()

    // Kedjan: dränering (causeId null, den ROT-orsak spelaren satte igång) →
    // bankruttbeslut (causeId = dräneringens id) → annullerat kontrakt (causeId =
    // bankruttbeslutets id).
    expect(drainEvent!.causeId).toBeNull()
    const drainIndex = emitted.indexOf(drainEvent!)
    const bankruptcyIndex = emitted.indexOf(bankruptcyEvent!)
    expect(bankruptcyEvent!.causeId).toBe(`test-${drainIndex}`)
    expect(voidEvent!.causeId).toBe(`test-${bankruptcyIndex}`)
  })

  it('bankrutt annullerar inte redan uppfyllda eller redan annullerade kontrakt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.treasury = -1
    faction.negativeTreasuryTurns = balance.factionBankruptcyTurns - 1

    state.market.contracts.push(
      {
        id: 'fulfilled-1',
        buyerId: 'rvn',
        productId: 'artillery-a',
        quantity: 10,
        unitsDelivered: 10,
        price: 1000,
        unitCostAtSigning: 500,
        grade: 'A',
        dueTurn: 10,
        status: 'fulfilled',
        lateEventId: null,
        frontId: null,
      },
      {
        id: 'voided-1',
        buyerId: 'rvn',
        productId: 'artillery-a',
        quantity: 10,
        unitsDelivered: 0,
        price: 1000,
        unitCostAtSigning: 500,
        grade: 'A',
        dueTurn: 10,
        status: 'voided',
        lateEventId: null,
        frontId: null,
      },
    )

    factions(makeCtx(state, 'faction-seed').ctx)

    expect(state.market.contracts.find((c) => c.id === 'fulfilled-1')!.status).toBe('fulfilled')
    expect(state.market.contracts.find((c) => c.id === 'voided-1')!.status).toBe('voided')
  })

  it('en redan bankrutt faktion rörs aldrig igen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.bankrupt = true
    faction.treasury = -999999
    faction.negativeTreasuryTurns = 99

    const { ctx, emitted } = makeCtx(state, 'faction-seed')
    factions(ctx)

    expect(emitted.filter((e) => e.subjectId === 'rvn')).toEqual([])
  })

  it('negativeTreasuryTurns nollställs så fort kassan blir positiv igen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.negativeTreasuryTurns = 5
    faction.treasury = 100

    factions(makeCtx(state, 'faction-seed').ctx)

    expect(faction.negativeTreasuryTurns).toBe(0)
    expect(faction.bankrupt).toBe(false)
  })

  it('lowSupportTurns korsar tröskeln exakt en gång (=== inte >=) — ingen repeterande notis', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.publicSupport = balance.factionLowSupportThreshold - 1
    faction.lowSupportTurns = balance.factionLowSupportTurns - 1

    const { emitted: firstEmitted } = (() => {
      const r = makeCtx(state, 'faction-seed')
      factions(r.ctx)
      return r
    })()
    expect(faction.lowSupportTurns).toBe(balance.factionLowSupportTurns)
    expect(firstEmitted.some((e) => e.headline.includes('FORCED TO SUE FOR PEACE'))).toBe(true)

    const { emitted: secondEmitted } = (() => {
      const r = makeCtx(state, 'faction-seed-2')
      factions(r.ctx)
      return r
    })()
    expect(secondEmitted.some((e) => e.headline.includes('FORCED TO SUE FOR PEACE'))).toBe(false)
  })
})

describe('factions — militaryBudget-påfyllnad (ETAPP1_5_TEKNISK_SPEC.md avsnitt 7.1.B)', () => {
  it('militaryBudget fylls på med militaryBudgetQuarterlyShare × treasury, klampat till högst treasury', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.treasury = 10000000
    faction.militaryBudget = 1000000
    const before = faction.militaryBudget

    const { ctx, emitted } = makeCtx(state, 'faction-seed')
    factions(ctx)

    // militaryBudgetQuarterlyShare = 0.08 → 10 000 000 × 0.08 = 800 000
    expect(faction.militaryBudget).toBe(before + 800000)
    expect(emitted.some((e) => e.headline.includes('MILITARY BUDGET'))).toBe(true)
  })

  it('militaryBudget klampas till högst faction.treasury — kan aldrig vara en fiktion kassan inte täcker', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.treasury = 500000
    faction.militaryBudget = 480000 // + 8 % av 500 000 (40 000) skulle ge 520 000, över treasury

    const { ctx } = makeCtx(state, 'faction-seed')
    factions(ctx)

    expect(faction.militaryBudget).toBe(500000)
  })

  it('en bankrutt faktion får ingen militaryBudget-påfyllnad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.bankrupt = true
    faction.militaryBudget = 1000000
    const before = faction.militaryBudget

    const { ctx } = makeCtx(state, 'faction-seed')
    factions(ctx)

    expect(faction.militaryBudget).toBe(before)
  })
})

describe('factions — materielNeed peacetidspåfyllnad (P34 klart-når, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.1)', () => {
  it('fredstidspåfyllningen ensam når orderTriggerThreshold för infantry inom 5 turer, utan strid', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    // Ingen attrition inblandad — bara factions.ts:s egen peacetimeReplacement.
    // peacetimeReplacement.infantry (12) × 5 = 60 = orderTriggerThreshold.infantry.

    for (let turn = 0; turn < 5; turn++) {
      factions(makeCtx(state, `peacetime-seed-${turn}`).ctx)
    }

    expect(faction.materielNeed.infantry).toBeGreaterThanOrEqual(balance.orderTriggerThreshold.infantry)
  })

  it('materielNeed klampas till högst needCeiling', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.materielNeed.infantry = balance.needCeiling - 5 // 5 kvar till taket, påfyllnaden (12) skulle annars gå över

    factions(makeCtx(state, 'peacetime-ceiling-seed').ctx)

    expect(faction.materielNeed.infantry).toBe(balance.needCeiling)
  })

  it('en bankrutt faktion får ingen materielNeed-påfyllnad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const faction = state.factions['rvn']!
    faction.bankrupt = true
    const before = { ...faction.materielNeed }

    factions(makeCtx(state, 'peacetime-bankrupt-seed').ctx)

    expect(faction.materielNeed).toEqual(before)
  })

  it('emittar en ticker när behovet faktiskt växer (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const { ctx, emitted } = makeCtx(state, 'peacetime-emit-seed')

    factions(ctx)

    expect(emitted.some((e) => e.headline.includes('MATERIEL NEED GROWS'))).toBe(true)
  })

  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.1/4.2 klart-när): "övergångarna är
  // deterministiska funktioner av relations/publicSupport/doomsday" — varje
  // test nedan isolerar EN av de fyra utlösarna (publicSupport, relations×2,
  // doomsday), ingen rng inblandad i utfallet.
  describe('P59: Faction.relations och Front.status', () => {
    it('ett obehandlat parti startar med front-1 i war och rvn/nlf lågt (relationsAtWarStart) mot varandra', () => {
      const state = createInitialState('indochina-slice', 'seed')
      expect(state.fronts['front-1']!.status).toBe('war')
      expect(state.factions['rvn']!.relations['nlf']).toBe(balance.relationsAtWarStart)
      expect(state.factions['nlf']!.relations['rvn']).toBe(balance.relationsAtWarStart)
    })

    it('ingen av de fyra utlösarna aktiv → fronten stannar i war (kontrollfall)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!

      factions(makeCtx(state, 'no-trigger-seed').ctx)

      expect(front.status).toBe('war')
    })

    it('en faktion tvingad söka fred (publicSupport-drivet) sätter dess front i ceasefire', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const faction = state.factions['rvn']!
      faction.publicSupport = balance.factionLowSupportThreshold - 1
      faction.lowSupportTurns = balance.factionLowSupportTurns - 1 // en tur från korsningen
      const front = state.fronts['front-1']!

      const { ctx, emitted } = makeCtx(state, 'forced-peace-seed')
      factions(ctx)

      expect(faction.lowSupportTurns).toBe(balance.factionLowSupportTurns)
      expect(front.status).toBe('ceasefire')
      expect(emitted.some((e) => e.headline.includes('CEASEFIRE ON THE FRONT-1 FRONT') && e.headline.includes('PUBLIC SUPPORT'))).toBe(
        true,
      )
    })

    it('ömsesidigt höga relationer (relations-drivet) sätter fronten i ceasefire, utan att publicSupport kollapsat', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.factions['rvn']!.relations['nlf'] = balance.ceasefireRelationThreshold
      state.factions['nlf']!.relations['rvn'] = balance.ceasefireRelationThreshold
      const front = state.fronts['front-1']!

      const { ctx, emitted } = makeCtx(state, 'goodwill-seed')
      factions(ctx)

      expect(front.status).toBe('ceasefire')
      expect(emitted.some((e) => e.headline.includes('CEASEFIRE ON THE FRONT-1 FRONT') && e.headline.includes('NEGOTIATED PEACE'))).toBe(
        true,
      )
    })

    it('ceasefire kräver BÅDA sidors relation över tröskeln — bara den ena räcker inte', () => {
      const state = createInitialState('indochina-slice', 'seed')
      state.factions['rvn']!.relations['nlf'] = balance.ceasefireRelationThreshold
      // nlf.relations['rvn'] lämnas vid relationsAtWarStart, under tröskeln.
      const front = state.fronts['front-1']!

      factions(makeCtx(state, 'one-sided-seed').ctx)

      expect(front.status).toBe('war')
    })

    it('hög doomsday (doomsday-drivet) tänder om en ceasefire till krig', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      front.status = 'ceasefire'
      state.doomsday = balance.ceasefireDoomsdayReescalationThreshold

      const { ctx, emitted } = makeCtx(state, 'reescalate-doomsday-seed')
      factions(ctx)

      expect(front.status).toBe('war')
      expect(emitted.some((e) => e.headline.includes('WAR RESUMES ON THE FRONT-1 FRONT') && e.headline.includes('GLOBAL TENSION'))).toBe(
        true,
      )
    })

    it('kollapsade relationer (relations-drivet) tänder om en ceasefire till krig', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      front.status = 'ceasefire'
      state.factions['rvn']!.relations['nlf'] = balance.warReescalationRelationThreshold - 1

      const { ctx, emitted } = makeCtx(state, 'reescalate-relations-seed')
      factions(ctx)

      expect(front.status).toBe('war')
      expect(
        emitted.some((e) => e.headline.includes('WAR RESUMES ON THE FRONT-1 FRONT') && e.headline.includes('RELATIONS COLLAPSE')),
      ).toBe(true)
    })

    it('relationerna stiger med relationsPassiveRecoveryPerTurn varje tur ("tid"), aldrig över 100', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      const before = rvn.relations['nlf']!

      const { ctx, emitted } = makeCtx(state, 'recovery-seed')
      factions(ctx)

      expect(rvn.relations['nlf']).toBe(before + balance.relationsPassiveRecoveryPerTurn)
      expect(emitted.some((e) => e.headline.includes('RELATIONS EASE WITH TIME'))).toBe(true)

      for (const faction of Object.values(state.factions)) {
        for (const otherId of Object.keys(faction.relations)) faction.relations[otherId] = 100
      }
      const { ctx: ctx2, emitted: emitted2 } = makeCtx(state, 'recovery-seed-2')
      factions(ctx2)
      expect(rvn.relations['nlf']).toBe(100) // klampat, inte 101
      expect(emitted2.some((e) => e.headline.includes('RELATIONS EASE WITH TIME'))).toBe(false)
    })
  })
})
