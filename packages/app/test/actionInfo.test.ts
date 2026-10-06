// actionInfo.test.ts — P163 (ETAPP10_FORSLAG.md §3b, S3): texten på handlingskortet täcker varje verb och säger inget som koden motsäger.
// "Always works" (info.certain) får bara stå på ett verb vars förhandsvisning inte är slumpavgjord, och ett verb som SAKNAR den texten
// ska ha en chans i förhandsvisningen — annars skulle kortet antingen ljuga om oddsen eller hoppa över dem.
import { describe, expect, it } from 'vitest'
import { createInitialState, previewAction, validateAction, effectiveDepth, resolveTurn } from '@seventh-front/core'
import type { GameState, PlayerAction } from '@seventh-front/core'
import { ACTION_INFO, actionInfo } from '../src/actionInfo.js'
import { ACTION_CATALOG } from '../src/actionCatalog.js'
import { VERB_TOPIC } from '../src/handbook.js'

describe('actionInfo — täckning', () => {
  it('varje verb i Actions-menyn och i handboksmappningen har en mening, en vinst och en risk', () => {
    const verbs = new Set([...ACTION_CATALOG.map((e) => e.verb), ...Object.keys(VERB_TOPIC)])
    expect(verbs.size).toBeGreaterThanOrEqual(25)
    for (const verb of verbs) {
      const info = actionInfo(verb)
      expect(info, verb).not.toBeNull()
      expect(info!.does.length, `${verb}.does`).toBeGreaterThan(15)
      expect(info!.gain.length, `${verb}.gain`).toBeGreaterThan(8)
      expect(info!.risk.length, `${verb}.risk`).toBeGreaterThan(8)
    }
  })

  it('ingen post saknar en motsvarande verb i menyn (inga föräldralösa texter)', () => {
    const verbs = new Set(ACTION_CATALOG.map((e) => e.verb))
    for (const verb of Object.keys(ACTION_INFO)) expect(verbs.has(verb), verb).toBe(true)
  })

  it('texten innehåller inga belopp eller procenttal — de kommer ur previewAction', () => {
    for (const [verb, info] of Object.entries(ACTION_INFO)) {
      for (const text of [info.does, info.gain, info.risk]) expect(text, verb).not.toMatch(/[£%]/)
    }
  })

  it('texten använder aldrig hon/han om en tjänsteman', () => {
    for (const [verb, info] of Object.entries(ACTION_INFO)) {
      for (const text of [info.does, info.gain, info.risk]) expect(text, verb).not.toMatch(/\b(he|his|him|she|her|hers)\b/i)
    }
  })
})

function sampleActions(state: GameState): Record<string, PlayerAction> {
  const station = state.house.stations[0]!
  const official = Object.values(state.officials).find((o) => o.factionId === station.nation)!
  const rival = Object.values(state.rivals)[0]!
  const faction = state.factions[station.nation]!
  const other = Object.values(state.factions).find((f) => f.id !== faction.id)!
  return {
    EXPAND: { type: 'INTEL', op: 'EXPAND', stationId: station.id },
    WITHDRAW: { type: 'INTEL', op: 'WITHDRAW', stationId: station.id },
    RECRUIT: { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' },
    LEAK: { type: 'INTEL', op: 'LEAK', stationId: station.id, targetId: rival.id },
    SABOTAGE: { type: 'INTEL', op: 'SABOTAGE', stationId: station.id, targetId: rival.id },
    TURN: { type: 'INTEL', op: 'TURN', stationId: station.id, targetId: official.id },
    INFLUENCE: { type: 'POLITICAL', op: 'INFLUENCE', targetFactionId: faction.id, spend: 45000, direction: 'up', effect: { kind: 'publicSupport' } },
    STAGE_INCIDENT: { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: faction.id, spend: 50000 },
    BACK_CHANNEL: { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: faction.id, spend: 50000 },
    FUND_COUP: { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: faction.id, spend: 200000 },
    BRIBE: { type: 'POLITICAL', op: 'BRIBE', officialId: official.id, spend: 25000 },
    FUND_CAMPAIGN: { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: official.id, spend: 10000 },
    FAVOUR: { type: 'POLITICAL', op: 'FAVOUR', officialId: official.id, marginCost: 5 },
    ASSASSINATE: { type: 'POLITICAL', op: 'ASSASSINATE', officialId: official.id, spend: 100000 },
    REPAY: { type: 'INTERNAL', op: 'REPAY', payload: { amount: 1000 } },
    BUILD_LINE: { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} },
    HIRE: { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } },
    REPRIORITISE_RND: { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'armour' } },
    BUY_FORWARD: { type: 'MARKET', op: 'BUY_FORWARD', commodity: 'oil', spend: 10000 },
    RELEASE: { type: 'MARKET', op: 'RELEASE', commodity: 'oil', spend: 1000 },
    BROKER: { type: 'BROKER', buyerId: other.id } as unknown as PlayerAction,
  }
}

describe('actionInfo — "Always works" stämmer med previewAction', () => {
  it('ett verb med `certain` har aldrig en chans i förhandsvisningen; ett utan har en (när underrättelsen räcker)', () => {
    const state = createInitialState('indochina-slice', 'info-seed')
    for (const station of state.house.stations) station.depth = 3 // så att chansen är känd
    const samples = sampleActions(state)
    for (const [verb, action] of Object.entries(samples)) {
      const info = actionInfo(verb)!
      const preview = previewAction(state, action)
      if (info.certain) expect(preview.successPct, `${verb} säger "${info.certain}" men har en chans`).toBeNull()
      else expect(preview.successPct, `${verb} har ingen "certain" men saknar chans`).not.toBeNull()
    }
  })

  it('utan underrättelse är chansen okänd för just de verb som har en chans bakom den', () => {
    const state = createInitialState('indochina-slice', 'info-seed-2')
    for (const station of state.house.stations) station.depth = 0
    state.house.staff.chiefSalesman = 0
    const samples = sampleActions(state)
    for (const verb of ['LEAK', 'SABOTAGE', 'TURN', 'FUND_COUP']) {
      const preview = previewAction(state, samples[verb]!)
      expect(preview.successPctKnown, verb).toBe(false)
    }
    expect(effectiveDepth(state, state.house.stations[0]!.nation)).toBe(0)
  })

  it('verb som kortet kallar kostnadsfria har ingen kostnad i förhandsvisningen', () => {
    const state = createInitialState('indochina-slice', 'info-seed-3')
    const samples = sampleActions(state)
    for (const verb of ['WITHDRAW', 'FAVOUR', 'RELEASE', 'BROKER']) {
      expect(previewAction(state, samples[verb]!).cost, verb).toBeNull()
      expect(actionInfo(verb)!.costNote, verb).toBeTruthy()
    }
  })
})

describe('actionInfo — påståenden om stationer stämmer med koden', () => {
  const quarter = (state: GameState) => resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state.ledger.at(-1)!.expenses.fixedCosts

  it('WITHDRAW: en vilande station räknas fortfarande mot gränsen på fem och kostar fortfarande upphåll (kortet säger det)', () => {
    const fiveDormant = createInitialState('indochina-slice', 'info-withdraw')
    while (fiveDormant.house.stations.length < 5) {
      fiveDormant.house.stations.push({ ...fiveDormant.house.stations[0]!, id: `s-${fiveDormant.house.stations.length}` })
    }
    for (const s of fiveDormant.house.stations) s.status = 'dormant'
    // gränsen: inget RECRUIT, trots att ingen station är aktiv
    expect(validateAction(fiveDormant, fiveDormant, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }).ok).toBe(false)
    // upphållet: samma kvartal kostar mer med vilande stationer än med brända
    const fiveBurned = structuredClone(fiveDormant)
    for (const s of fiveBurned.house.stations) s.status = 'burned'
    expect(quarter(fiveDormant)).toBeGreaterThan(quarter(fiveBurned))
    expect(actionInfo('WITHDRAW')!.gain).toMatch(/still counts toward your limit of five and still costs upkeep/)
  })
})
