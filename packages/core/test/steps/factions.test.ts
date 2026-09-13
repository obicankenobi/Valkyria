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
