// spendCurves.test.ts — P102 (ETAPP8_FORSLAG.md §6.1, pelare 3: "spelet säger aldrig nej till en handling, det
// prissätter den"). STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP och ASSASSINATE fick en kurva från belopp till effekt
// med AVTAGANDE AVKASTNING och ETT TAK: dubbel summa ger märkbart bättre odds/effekt, men aldrig dubbelt så bra,
// och aldrig säkert. Samma formel i resolve och i previewAction (en formel, en källa).
import { describe, expect, it } from 'vitest'
import { applyActions } from '../src/resolve/steps/applyActions.js'
import { economy } from '../src/resolve/steps/economy.js'
import { advanceStations } from '../src/resolve/upkeep.js'
import { previewAction } from '../src/previewAction.js'
import {
  assassinateReductionFactor,
  backChannelGain,
  fundCoupBonusPct,
  spendCurve,
  stageIncidentHeatScale,
} from '../src/spendCurves.js'
import { fundCoupSuccessPct } from '../src/resolve/political.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, PlayerAction, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  fundCoupSuccessCapPct: number
  fundCoupSpendBonusMaxPct: number
  fundCoupSpendHalf: number
  stageIncidentHeatScaleMin: number
  stageIncidentHeatScaleMax: number
  backChannelGainScaleMin: number
  backChannelGainScaleMax: number
  relationsBackChannelGain: number
  assassinateCounterIntelligenceGain: number
  assassinateMaxReductionPct: number
  investigationActionPointPenalty: number
  exposureBurnThreshold: number
  stationBurnChancePct: number
}

type Emitted = Omit<WireEvent, 'id' | 'turn'> & { id: string }

function makeCtx(state: GameState, actions: PlayerAction[], seed: string): { ctx: ResolveContext; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: { standingOrders: [], bids: [], actions },
    rng: createRng(seed, 0),
    emit: (e) => {
      const id = `w-${seq++}`
      emitted.push({ ...e, id })
      return id
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function fresh(seed = 'spend-seed'): GameState {
  const state = createInitialState('indochina-slice', seed)
  state.meta.turn = 5
  state.house.treasury = 20_000_000
  return state
}

describe('spendCurve — avtagande avkastning, aldrig 1', () => {
  it('0 vid 0, växer med beloppet, avtar (varje extra summa ger mindre) och når aldrig 1', () => {
    const half = 1_000_000
    expect(spendCurve(0, half)).toBe(0)
    expect(spendCurve(-5, half)).toBe(0)
    const a = spendCurve(500_000, half)
    const b = spendCurve(1_000_000, half)
    const c = spendCurve(2_000_000, half)
    const d = spendCurve(4_000_000, half)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBeLessThan(d)
    expect(c - b).toBeLessThan(b - a) // avtagande (samma steg dubblas, vinsten minskar)
    expect(d - c).toBeLessThan(c - b)
    expect(spendCurve(1e12, half)).toBeLessThan(1)
  })

  it('dubbel summa ger märkbart mer, men aldrig dubbelt så mycket', () => {
    const half = 1_000_000
    for (const spend of [100_000, 500_000, 1_000_000, 3_000_000]) {
      const single = spendCurve(spend, half)
      const double = spendCurve(spend * 2, half)
      expect(double).toBeGreaterThan(single * 1.1) // märkbart
      expect(double).toBeLessThan(single * 2) // aldrig dubbelt
    }
  })
})

describe('FUND_COUP — lyckandechansen stiger med beloppet, tak under 100', () => {
  const target = { counterIntelligence: 40 }

  it('högsta nivån ger mätbart bättre odds än lägsta, och dubbel summa < dubbla oddsen', () => {
    const low = fundCoupSuccessPct(target, 500_000)
    const mid = fundCoupSuccessPct(target, 1_500_000)
    const high = fundCoupSuccessPct(target, 3_000_000)
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
    expect(high - low).toBeGreaterThan(10) // mätbart
    expect(fundCoupSuccessPct(target, 1_000_000)).toBeLessThan(fundCoupSuccessPct(target, 500_000) * 2)
  })

  it('ingen summa ger säker framgång: taket (fundCoupSuccessCapPct) håller även vid absurda belopp och svag motpart', () => {
    expect(fundCoupSuccessPct({ counterIntelligence: 0 }, 1e12)).toBeLessThanOrEqual(B.fundCoupSuccessCapPct)
    expect(B.fundCoupSuccessCapPct).toBeLessThan(100)
    expect(fundCoupBonusPct(1e12)).toBeLessThan(B.fundCoupSpendBonusMaxPct + 1e-9)
  })

  it('motpartens counterIntelligence räknas fortfarande av, och golvet består', () => {
    expect(fundCoupSuccessPct({ counterIntelligence: 90 }, 0)).toBeGreaterThanOrEqual(balance.fundCoupMinSuccessPct)
    expect(fundCoupSuccessPct({ counterIntelligence: 20 }, 1_500_000)).toBeGreaterThan(fundCoupSuccessPct({ counterIntelligence: 60 }, 1_500_000))
  })

  it('över många partier lyckas högsta nivån oftare än lägsta (resolve och preview använder samma formel)', () => {
    function successRate(spend: number): number {
      let wins = 0
      const n = 400
      for (let i = 0; i < n; i++) {
        const state = fresh(`coup-${i}`)
        const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend }], `coup-rng-${i}`)
        applyActions(ctx)
        if (emitted.some((e) => e.headline.includes('SUCCESSFUL COUP'))) wins++
      }
      return wins / n
    }
    const low = successRate(500_000)
    const high = successRate(3_000_000)
    expect(high).toBeGreaterThan(low + 0.08)
    expect(high).toBeLessThan(1)
  })

  it('previewAction visar exakt formelns tal per nivå (med station: känt)', () => {
    const state = fresh()
    const rvn = state.factions['rvn']!
    for (const spend of [500_000, 1_500_000, 3_000_000]) {
      const p = previewAction(state, { type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend })
      expect(p.successPctKnown).toBe(true)
      expect(p.successPct).toBe(fundCoupSuccessPct(rvn, spend))
    }
  })
})

describe('STAGE_INCIDENT — beloppet styr hur stor heat-höjningen blir', () => {
  it('skalan stiger med beloppet, från stageIncidentHeatScaleMin, och tar slut under maxvärdet', () => {
    expect(stageIncidentHeatScale(0)).toBeCloseTo(B.stageIncidentHeatScaleMin, 10)
    expect(stageIncidentHeatScale(10_000)).toBeLessThan(stageIncidentHeatScale(50_000))
    expect(stageIncidentHeatScale(1e12)).toBeLessThan(B.stageIncidentHeatScaleMax + 1e-9)
    expect(stageIncidentHeatScale(50_000) - stageIncidentHeatScale(25_000)).toBeLessThan(stageIncidentHeatScale(25_000) - stageIncidentHeatScale(0))
  })

  it('över många partier ger högsta nivån större heat-höjning än lägsta; sannolikheten att lyckas är oförändrad', () => {
    function meanHeatRise(spend: number): { rise: number; success: number } {
      let total = 0
      let successes = 0
      const n = 300
      for (let i = 0; i < n; i++) {
        const state = fresh(`inc-${i}`)
        const theatre = Object.values(state.theatres)[0]!
        theatre.heat = 10
        const { ctx, emitted } = makeCtx(state, [{ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend }], `inc-rng-${i}`)
        applyActions(ctx)
        if (emitted.some((e) => e.headline.startsWith('INCIDENT STAGED'))) {
          successes++
          total += Object.values(state.theatres).reduce((sum, t) => sum + (t.heat - 10), 0) + 0
        }
      }
      return { rise: successes === 0 ? 0 : total / successes, success: successes / n }
    }
    const low = meanHeatRise(10_000)
    const high = meanHeatRise(50_000)
    expect(high.rise).toBeGreaterThan(low.rise * 1.2)
    expect(Math.abs(high.success - low.success)).toBeLessThan(0.12) // samma fasta chans
    expect(high.success).toBeLessThan(1)
  })

  it('previewAction ger en HEAT-effekt (nuvarande → förväntat) som växer med nivån', () => {
    const state = fresh()
    const front = Object.values(state.fronts).find((f) => f.sideA === 'rvn' || f.sideB === 'rvn')!
    const theatre = state.theatres[front.theatreId]!
    theatre.heat = 20
    const low = previewAction(state, { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 10_000 })
    const high = previewAction(state, { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50_000 })
    expect(low.effect?.label).toBe('HEAT')
    expect(high.effect!.after - high.effect!.before).toBeGreaterThan(low.effect!.after - low.effect!.before)
  })
})

describe('BACK_CHANNEL — beloppet styr relationsvinsten', () => {
  it('vinsten stiger med beloppet (avtagande), aldrig utan tak', () => {
    expect(backChannelGain(0)).toBeCloseTo(B.relationsBackChannelGain * B.backChannelGainScaleMin, 10)
    expect(backChannelGain(10_000)).toBeLessThan(backChannelGain(50_000))
    expect(backChannelGain(1e12)).toBeLessThan(B.relationsBackChannelGain * B.backChannelGainScaleMax + 1e-9)
    expect(backChannelGain(100_000)).toBeLessThan(backChannelGain(50_000) * 2)
  })

  it('relationen mellan frontmotståndarna förbättras mer vid högsta nivån än vid lägsta', () => {
    function gain(spend: number): number {
      const state = fresh('bc-seed')
      const front = Object.values(state.fronts)[0]!
      state.factions[front.sideA]!.relations[front.sideB] = 20
      state.factions[front.sideB]!.relations[front.sideA] = 20
      const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: front.sideA, spend }], 'bc-rng')
      applyActions(ctx)
      return state.factions[front.sideA]!.relations[front.sideB]! - 20
    }
    expect(gain(50_000)).toBeGreaterThan(gain(10_000))
    expect(gain(10_000)).toBeGreaterThan(0)
  })

  it('previewAction visar RELATIONS före → efter för nivån', () => {
    const state = fresh('bc-preview')
    const front = Object.values(state.fronts)[0]!
    state.factions[front.sideA]!.relations[front.sideB] = 20
    const p = previewAction(state, { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: front.sideA, spend: 25_000 })
    expect(p.effect?.label).toBe('RELATIONS')
    expect(p.effect!.after).toBeGreaterThan(p.effect!.before)
  })
})

describe('ASSASSINATE — beloppet sänker konsekvenserna, målet dör alltid', () => {
  it('reduktionsfaktorn sjunker med beloppet men når aldrig noll (1 − maxReduktion är golvet)', () => {
    expect(assassinateReductionFactor(0)).toBe(1)
    expect(assassinateReductionFactor(250_000)).toBeGreaterThan(assassinateReductionFactor(750_000))
    expect(assassinateReductionFactor(1e12)).toBeGreaterThan(1 - B.assassinateMaxReductionPct / 100 - 1e-9)
    expect(assassinateReductionFactor(1e12)).toBeGreaterThan(0)
  })

  it('högre summa → mindre counterIntelligence-höjning, men målet dör i alla nivåer och höjningen är aldrig noll', () => {
    function ciRise(spend: number): number {
      const state = fresh('as-seed')
      const official = state.officials['official-rvn-procurement']!
      const before = state.factions['rvn']!.counterIntelligence
      const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'ASSASSINATE', officialId: official.id, spend }], 'as-rng')
      applyActions(ctx)
      expect(state.officials[official.id]!.name).not.toBe(official.name) // ersatt: målet är dött
      return state.factions['rvn']!.counterIntelligence - before
    }
    const low = ciRise(250_000)
    const high = ciRise(1_500_000)
    expect(high).toBeLessThan(low)
    expect(high).toBeGreaterThan(0)
  })

  it('doomsday-risken skalas med samma faktor (blockbunden nation): större summa → mindre höjning', () => {
    function doomsdayRise(spend: number): number {
      let total = 0
      for (let i = 0; i < 60; i++) {
        const state = fresh(`as-doom-${i}`)
        state.factions['rvn']!.alignment = 90
        const before = state.doomsday
        const { ctx } = makeCtx(state, [{ type: 'POLITICAL', op: 'ASSASSINATE', officialId: 'official-rvn-procurement', spend }], `as-doom-rng-${i}`)
        applyActions(ctx)
        total += state.doomsday - before
      }
      return total / 60
    }
    expect(doomsdayRise(1_500_000)).toBeLessThan(doomsdayRise(250_000))
  })

  it('previewAction visar COUNTER-INTELLIGENCE före → efter när underrättelsen räcker, och ingen effekt utan', () => {
    const state = fresh('as-preview')
    const known = previewAction(state, { type: 'POLITICAL', op: 'ASSASSINATE', officialId: 'official-rvn-procurement', spend: 500_000 })
    expect(known.effect?.label).toBe('COUNTER-INTELLIGENCE')
    expect(known.effect!.after).toBeGreaterThan(known.effect!.before)
    const hidden = previewAction(state, { type: 'POLITICAL', op: 'ASSASSINATE', officialId: 'official-nlf-defence', spend: 500_000 })
    expect(hidden.effect).toBeNull()
    expect(hidden.successPctKnown).toBe(false)
  })
})

describe('under utredning (beslut 8E) — en bränd station kostar en handling nästa kvartal', () => {
  function burning(seed: string): GameState {
    const state = fresh(seed)
    state.meta.turn = 6
    const station = state.house.stations[0]!
    station.exposure = B.exposureBurnThreshold + 5
    return state
  }

  it('när en station bränns öppnas en utredning: investigationUntilTurn = tur + 1, med en rubrik som har causeId', () => {
    let opened = 0
    for (let i = 0; i < 200; i++) {
      const state = burning(`inv-${i}`)
      const { ctx, emitted } = makeCtx(state, [], `inv-rng-${i}`)
      advanceStations(ctx)
      const burn = emitted.find((e) => e.headline.includes('BURNED'))
      if (!burn) {
        expect(state.house.investigationUntilTurn ?? null).toBeNull()
        continue
      }
      opened++
      expect(state.house.investigationUntilTurn).toBe(7)
      const inquiry = emitted.find((e) => e.headline.includes('INVESTIGATION'))
      expect(inquiry).toBeDefined()
      expect(inquiry!.severity).toBe('headline')
      expect(inquiry!.causeId).toBe(burn.id)
    }
    expect(opened).toBeGreaterThan(0)
    expect(B.stationBurnChancePct).toBeGreaterThan(0)
  })

  it('under kvartalet har huset en handling färre; efteråt är det normalt igen (economy räknar nästa turs actionPoints)', () => {
    const state = fresh('inv-ap')
    state.meta.turn = 6
    const normal = createInitialState('indochina-slice', 'inv-ap-normal')
    normal.meta.turn = 6
    economy(makeCtx(normal, [], 'e1').ctx)
    const ap = normal.house.actionPoints

    state.house.investigationUntilTurn = 7
    economy(makeCtx(state, [], 'e2').ctx)
    expect(state.house.actionPoints).toBe(ap - B.investigationActionPointPenalty)

    state.meta.turn = 7
    economy(makeCtx(state, [], 'e3').ctx)
    expect(state.house.actionPoints).toBe(ap) // turn 8: utredningen avslutad
  })

  it('handlingstaket bryts: med en handling färre avvisas den tredje handlingen', () => {
    const state = fresh('inv-cap')
    state.house.actionPoints = 2
    const actions: PlayerAction[] = [
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
      { type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 1000 } },
    ]
    state.house.creditLimit = 1_000_000
    const { ctx } = makeCtx(state, actions, 'cap')
    applyActions(ctx)
    expect(ctx.rejected.map((r) => r.reason)).toContain('no executive actions remaining')
  })

  it('ett sparat parti utan investigationUntilTurn räknas som utan utredning', () => {
    const state = fresh('inv-old')
    delete (state.house as unknown as { investigationUntilTurn?: unknown }).investigationUntilTurn
    expect(() => economy(makeCtx(state, [], 'old').ctx)).not.toThrow()
  })
})
