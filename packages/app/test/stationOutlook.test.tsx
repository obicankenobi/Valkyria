// @vitest-environment jsdom
// stationOutlook.test.tsx — P163 (ETAPP10_FORSLAG.md §3b, S5): stationskortets påståenden binds till kärnan.
import { describe, expect, it } from 'vitest'
import { bidEstimate, coverageForDepth, createInitialState, effectiveDepth, formationDisplay, officialDisplay, raceAssessment, resolveTurn, validateAction } from '@seventh-front/core'
import type { GameState, Order } from '@seventh-front/core'
import { COVERAGE_EFFECT, STATION_BAND_PCT, STATION_VERBS, stationOutlook } from '../src/stationOutlook.js'

function stateWithOrder(): { state: GameState; order: Order } {
  let state = createInitialState('indochina-slice', 'station-outlook-seed')
  for (let i = 0; i < 12; i++) {
    const order = state.market.openOrders.find((o) => o.competingRivals.length > 0)
    if (order) return { state, order }
    state = resolveTurn(state, { standingOrders: [], bids: [], actions: [] }).state
  }
  throw new Error('ingen order med rivaler hittades')
}

describe('stationOutlook — prisbandets bredd per djup är kärnans', () => {
  it.each([0, 1, 2, 3, 4, 5] as const)('djup %i: ±%i-spegeln ger samma band som bidEstimate', (depth) => {
    const { state, order } = stateWithOrder()
    state.house.staff.chiefSalesman = 0
    let station = state.house.stations.find((s) => s.nation === order.buyerId)
    if (!station) {
      station = { ...state.house.stations[0]!, id: 'probe', nation: order.buyerId, status: 'active' }
      state.house.stations.push(station)
    }
    station.status = 'active'
    station.depth = depth
    expect(effectiveDepth(state, order.buyerId)).toBe(depth)
    const est = bidEstimate(state, order, 'A')
    const measured = ((est.rivalPriceHigh - est.rivalPriceLow) / (est.rivalPriceHigh + est.rivalPriceLow)) * 100
    expect(measured).toBeCloseTo(STATION_BAND_PCT[depth]!, 0)
    expect(stationOutlook(state, order.buyerId).bandPct).toBe(STATION_BAND_PCT[depth])
  })
})

describe('stationOutlook — vad stationen ger', () => {
  it('med en station: de fem verben är verkligen giltiga mot den, och RECRUIT är det även utan en', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-verbs')
    const station = state.house.stations[0]!
    const out = stationOutlook(state, station.nation)
    expect(out.hasStation).toBe(true)
    expect([...out.verbs]).toEqual([...STATION_VERBS])
    expect(validateAction(state, state, { type: 'INTEL', op: 'EXPAND', stationId: 'no-such-station' }).ok).toBe(false)
    expect(validateAction(state, state, { type: 'INTEL', op: 'EXPAND', stationId: station.id }).ok).toBe(true)
    expect(validateAction(state, state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }).ok).toBe(true)
  })

  it('utan en station: inga verb, och bandet är det bredaste', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-none')
    const nation = 'laos'
    expect(state.house.stations.some((s) => s.nation === nation)).toBe(false)
    const out = stationOutlook(state, nation)
    expect(out.hasStation).toBe(false)
    expect(out.verbs).toEqual([])
    expect(out.bandPct).toBe(35)
    expect(out.next?.how).toBe('RECRUIT')
  })

  it('formationer och köparvillkor är kända exakt när effektivt djup är minst 1 (som kärnan säger)', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-known')
    const station = state.house.stations[0]!
    const formation = Object.values(state.fronts).flatMap((f) => f.formations).find((f) => f.factionId === station.nation)!
    state.house.staff.chiefSalesman = 0
    for (const depth of [0, 1, 3] as const) {
      station.depth = depth
      const out = stationOutlook(state, station.nation)
      expect(out.formationsKnown).toBe(formationDisplay(state, formation).known)
      expect(out.buyerTermsVisible).toBe(depth > 0)
      expect(out.formationCount).toBeGreaterThan(0)
    }
  })

  it('en chefsförsäljare över tröskeln lägger ett steg till det du ser, och kortet säger det', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-salesman')
    const station = state.house.stations[0]!
    station.depth = 2
    state.house.staff.chiefSalesman = 90
    const out = stationOutlook(state, station.nation)
    expect(out.salesmanBonus).toBe(true)
    expect(out.stationDepth).toBe(2)
    expect(out.effective).toBe(3)
  })

  it('nästa steg: kostnaden är EXPAND:s ur previewAction, och på högsta djup finns inget nästa steg', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-next')
    const station = state.house.stations[0]!
    state.house.staff.chiefSalesman = 0
    station.depth = 2
    const out = stationOutlook(state, station.nation)
    expect(out.next).toMatchObject({ depth: 3, bandPct: 8, how: 'EXPAND' })
    expect(out.next!.cost).toBeGreaterThan(0)
    expect(out.next!.gains.join(' ')).toContain('±14% to ±8%')
    station.depth = 5
    expect(stationOutlook(state, station.nation).next).toBeNull()
  })

  it('djup 0 → 1 lägger till formationer, villkor och chans; djup 3 → 4 nämner lägsta rivalen', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-gains')
    const station = state.house.stations[0]!
    state.house.staff.chiefSalesman = 0
    station.depth = 0
    expect(stationOutlook(state, station.nation).next!.gains.join(' ')).toMatch(/formations show their exact strength/)
    station.depth = 3
    expect(stationOutlook(state, station.nation).next!.gains.join(' ')).toMatch(/lowest bid is named/)
  })
})


describe('stationOutlook — täckning och vilande stationer (P167)', () => {
  it('nästa EXPAND nämner den täckning som djupsteget faktiskt låser upp (kärnans coverageForDepth), och inga andra', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-coverage-next')
    const station = state.house.stations[0]!
    state.house.staff.chiefSalesman = 0
    for (const depth of [0, 1, 2, 3, 4] as const) {
      station.depth = depth
      station.coverage = coverageForDepth(depth)
      const gains = stationOutlook(state, station.nation).next!.gains.join(' | ')
      for (const c of ['military', 'industry', 'cabinet'] as const) {
        const unlocked = coverageForDepth(depth + 1).includes(c) && !coverageForDepth(depth).includes(c)
        expect(gains.includes(`${c} coverage`), `${c} vid djup ${depth} → ${depth + 1}`).toBe(unlocked)
      }
    }
  })

  it('stationens täckning visas som den är', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-coverage-now')
    const station = state.house.stations[0]!
    station.depth = 3
    station.coverage = coverageForDepth(3)
    expect(stationOutlook(state, station.nation).coverage).toEqual(['procurement', 'military', 'industry'])
    expect(stationOutlook(state, 'laos').coverage).toEqual([])
  })

  it("COVERAGE_EFFECT.cabinet: integritet och agenda visas med kabinettäckning, och inte utan", () => {
    const state = createInitialState('indochina-slice', 'station-outlook-cabinet')
    const station = state.house.stations[0]!
    const official = Object.values(state.officials).find((o) => o.factionId === station.nation)!
    station.coverage = ['procurement', 'military', 'industry']
    expect(officialDisplay(state, official).integrity).toBeNull()
    station.coverage = ['procurement', 'military', 'industry', 'cabinet']
    expect(officialDisplay(state, official).integrity).not.toBeNull()
    expect(COVERAGE_EFFECT.cabinet).toMatch(/integrity and agenda/)
  })

  it('COVERAGE_EFFECT.military/industry: bedömningen av blockets generation är skarpare med någon av dem, och lika skarp med båda', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-race')
    const station = state.house.stations[0]!
    state.house.staff.chiefSalesman = 0
    station.depth = 4 // assessmentWidthByDepth [3,3,2,2,1,0]: med täckning 1, utan (ett steg sämre) 2
    const width = (bloc: 'west' | 'east') => {
      const a = raceAssessment(state, bloc, 'armour')
      return a.high - a.low
    }
    const widths = (coverage: typeof station.coverage) => {
      station.coverage = coverage
      return [width('west'), width('east')]
    }
    const none = widths(['procurement'])
    const mil = widths(['procurement', 'military'])
    const ind = widths(['procurement', 'industry'])
    expect(ind).toEqual(mil) // industry ger samma som military, inget extra
    expect(mil.every((w, i) => w <= none[i]!)).toBe(true)
    expect(mil.some((w, i) => w < none[i]!)).toBe(true) // och stationens block får en skarpare bedömning
    expect(COVERAGE_EFFECT.industry).toMatch(/no extra effect/)
  })

  it('en vilande station: nästa steg är REOPEN (inte RECRUIT), med REOPEN:s kostnad ur previewAction', () => {
    const state = createInitialState('indochina-slice', 'station-outlook-dormant')
    const station = state.house.stations[0]!
    station.status = 'dormant'
    station.depth = 3
    const out = stationOutlook(state, station.nation)
    expect(out.hasStation).toBe(false)
    expect(out.dormant).toEqual({ city: station.city, depth: 3 })
    expect(out.next).toMatchObject({ how: 'REOPEN', depth: 3 })
    expect(out.next!.cost).toBeGreaterThan(0)
    expect(validateAction(state, state, { type: 'INTEL', op: 'REOPEN', stationId: station.id }).ok).toBe(true)
  })
})
