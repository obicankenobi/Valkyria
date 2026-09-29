// surplus.test.ts — P99c: aggressive och balanced spenderar bara på GK-A-verben (kampanjer,
// underrättelseoperationer, R&D, ...) ur ÖVERSKOTT över grundkapitalet — aldrig ur själva
// grundkapitalet under de första turerna, när inga intäkter ännu kommit och de fasta kostnaderna
// redan löper. Mätt i P99c: utan regeln spenderade botarna sig till BUYOUT/INSOLVENCY.
import { describe, expect, it } from 'vitest'
import { BOT_BALANCE, createInitialState } from '@seventh-front/core'
import type { GameState, PlayerAction } from '@seventh-front/core'
import { aggressive, balanced, spendOnlyFromSurplus } from '../src/policies.js'

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'surplus-seed')
  state.market.openOrders = []
  return state
}

const isCostly = (a: PlayerAction): boolean =>
  (a.type === 'POLITICAL' && ['FUND_CAMPAIGN', 'FUND_COUP', 'ASSASSINATE', 'INFLUENCE'].includes(a.op)) ||
  (a.type === 'INTEL' && ['LEAK', 'SABOTAGE', 'TURN'].includes(a.op)) ||
  (a.type === 'INTERNAL' && a.op === 'REPRIORITISE_RND')

describe('spendOnlyFromSurplus', () => {
  it('släpper igenom gratis och inkomstbringande handlingar, och stryker kostsamma när kassan inte når över grundkapitalet', () => {
    const state = fresh()
    const actions: PlayerAction[] = [
      { type: 'POLITICAL', op: 'FAVOUR', officialId: 'official-rvn-procurement', marginCost: 10000 },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: 'official-rvn-procurement', spend: 20000 },
      { type: 'INTEL', op: 'TURN', stationId: 'x', targetId: 'y' },
    ]
    const kept = spendOnlyFromSurplus(state, actions)
    expect(kept.map((a) => (a.type === 'POLITICAL' || a.type === 'INTERNAL' ? a.op : a.type))).toEqual(['FAVOUR', 'TAKE_LOAN'])
  })

  it('släpper igenom en kostsam handling när kassan efter kostnaden fortfarande ligger över grundkapitalet', () => {
    const state = fresh()
    state.house.treasury = state.house.foundingCapital + 21_000
    const spend: PlayerAction = { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: 'official-rvn-procurement', spend: 20000 }
    const tooMuch: PlayerAction = { type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: 'official-rvn-procurement', spend: 22000 }
    expect(spendOnlyFromSurplus(state, [spend])).toEqual([spend])
    expect(spendOnlyFromSurplus(state, [tooMuch])).toEqual([])
  })

  it('ett R&D-projekt kostar rndOverhead × rndProjectTurns (dess verkliga åtagande, inte noll)', () => {
    const state = fresh()
    const rnd: PlayerAction = { type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'artillery' } }
    state.house.treasury = state.house.foundingCapital + BOT_BALANCE.rndProjectCost - 1
    expect(spendOnlyFromSurplus(state, [rnd])).toEqual([])
    state.house.treasury = state.house.foundingCapital + BOT_BALANCE.rndProjectCost
    expect(spendOnlyFromSurplus(state, [rnd])).toEqual([rnd])
  })

  it('en underrättelseoperation kostar intelCovertOpCost', () => {
    const state = fresh()
    const op: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: 'x', targetId: 'y' }
    state.house.treasury = state.house.foundingCapital + BOT_BALANCE.intelCovertOpCost - 1
    expect(spendOnlyFromSurplus(state, [op])).toEqual([])
    state.house.treasury = state.house.foundingCapital + BOT_BALANCE.intelCovertOpCost
    expect(spendOnlyFromSurplus(state, [op])).toEqual([op])
  })
})

describe('aggressive och balanced på ett fräscht parti (kassa = grundkapital)', () => {
  it.each([
    ['aggressive', aggressive],
    ['balanced', balanced],
  ] as const)('%s skickar ingen kostsam handling, men lånar och uppvaktar som förut', (_name, policy) => {
    const state = fresh()
    state.house.creditLimit = 1_000_000
    const actions = policy(state).actions
    expect(actions.filter(isCostly)).toEqual([])
    expect(actions.some((a) => a.type === 'INTERNAL' && a.op === 'TAKE_LOAN')).toBe(true)
  })

  it('med ett överskott återkommer de kostsamma verben (aggressive: kampanj, balanced: INFLUENCE)', () => {
    const rich = fresh()
    rich.house.treasury = rich.house.foundingCapital + 5_000_000
    expect(aggressive(rich).actions.some((a) => a.type === 'POLITICAL' && a.op === 'FUND_CAMPAIGN')).toBe(true)
    expect(balanced(rich).actions.some((a) => a.type === 'POLITICAL' && a.op === 'INFLUENCE')).toBe(true)
  })
})
