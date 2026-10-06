// mapLayers.test.ts — P166 (ETAPP10_FORSLAG.md §3b): kartlager med tal. Varje tal på kartan läses ur tillståndet; testet räknar om det för hand.
import { describe, expect, it } from 'vitest'
import { createInitialState, effectiveDepth } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { MAP_LAYERS, landlessFactions, layerTags } from '../src/mapLayers.js'
import { SECTOR_REGIONS } from '../src/sectorRegions.js'
import { STATION_BAND_PCT } from '../src/stationOutlook.js'

const state = (seed = 'layers-seed'): GameState => createInitialState('indochina-slice', seed)
const tagFor = (tags: ReturnType<typeof layerTags>, id: string) => tags.find((t) => t.id === id)

describe('MAP_LAYERS', () => {
  it('fem lager i spelets ordning, var och ett med en etikett', () => {
    expect(MAP_LAYERS.map((l) => l.id)).toEqual(['orders', 'supply', 'rivals', 'intelligence', 'politics'])
    for (const layer of MAP_LAYERS) expect(layer.label.length).toBeGreaterThan(2)
  })
})

describe('landlessFactions — NLF har ingen landmassa', () => {
  it('NLF är en front-sida utan eget land, och får en ankarpunkt mitt bland sina förband', () => {
    const s = state()
    const landless = landlessFactions(s)
    expect(landless.map((l) => l.factionId)).toContain('nlf')
    const nlf = landless.find((l) => l.factionId === 'nlf')!
    const sectors = new Set(Object.values(s.fronts).flatMap((f) => f.formations).filter((f) => f.factionId === 'nlf' && f.status !== 'destroyed').map((f) => f.sectorId))
    const anchors = Object.values(SECTOR_REGIONS).flat().filter((r) => sectors.has(r.sectorId)).map((r) => r.anchor)
    expect(anchors.length).toBeGreaterThan(0)
    expect(nlf.anchor![0]).toBeCloseTo(anchors.reduce((a, p) => a + p[0], 0) / anchors.length, 5)
    expect(nlf.anchor![1]).toBeCloseTo(anchors.reduce((a, p) => a + p[1], 0) / anchors.length, 5)
  })
})

describe('layerTags — Orders', () => {
  it('öppna ordrar, husets kontrakt och materielbehov per köpare', () => {
    const s = state()
    s.market.contracts.push({
      id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B', dueTurn: 5,
      status: 'active', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    const tag = tagFor(layerTags(s, 'orders'), 'rvn')!
    const open = s.market.openOrders.filter((o) => o.buyerId === 'rvn').length
    const need = Math.round(Object.values(s.factions.rvn!.materielNeed).reduce((a, b) => a + b, 0))
    expect(tag.lines).toEqual([`${open} open`, '1 yours', `need ${need}`])
    expect(tag.selection).toEqual({ kind: 'country', countryId: 'south-vietnam' })
  })
})

describe('layerTags — Supply', () => {
  it('per front: spelarens enheter under transport och rivalernas levererade enheter', () => {
    const s = state()
    s.market.contracts.push({
      id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B', dueTurn: 5,
      status: 'active', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    s.market.shipments.push({ id: 's1', contractId: 'c1', units: 5, arrivalTurn: 3 }, { id: 's2', contractId: 'c1', units: 2, arrivalTurn: 4 })
    const rival = Object.values(s.rivals)[0]!
    s.fronts['front-1']!.attribution[rival.id] = 40
    const tag = tagFor(layerTags(s, 'supply'), 'front-1')!
    expect(tag.lines).toEqual(['you 7 in transit', 'rivals 40 delivered'])
    expect(tag.selection).toEqual({ kind: 'frontline', frontId: 'front-1' })
  })
})

describe('layerTags — Rivals', () => {
  it('kontrakt husets mot rivalernas per köpare, och husets andel', () => {
    const s = state()
    const rival = Object.values(s.rivals)[0]!
    rival.contracts.push({ id: 'r1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 5, unitsDelivered: 0, dueTurn: 5, status: 'active', lateEventId: null }, { id: 'r2', buyerId: 'rvn', productId: 'm1_rifle', quantity: 5, unitsDelivered: 0, dueTurn: 5, status: 'voided', lateEventId: null })
    s.market.contracts.push({
      id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B', dueTurn: 5,
      status: 'active', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    const tag = tagFor(layerTags(s, 'rivals'), 'rvn')!
    // ett avslutat/hävt kontrakt räknas inte
    expect(tag.lines).toEqual(['1 : 1 contracts', 'you 50%'])
  })

  it('utan kontrakt alls visas ett streck, inte 0 %', () => {
    const tag = tagFor(layerTags(state(), 'rivals'), 'laos')!
    expect(tag.lines).toEqual(['0 : 0 contracts', 'you —'])
  })
})

describe('layerTags — Intelligence', () => {
  it('med station: djup, exponering och prisbandets bredd; utan: ingen station och det bredaste bandet', () => {
    const s = state()
    s.house.staff.chiefSalesman = 0
    const st = s.house.stations[0]!
    st.depth = 2
    st.exposure = 17
    const rvn = tagFor(layerTags(s, 'intelligence'), 'rvn')!
    expect(rvn.lines).toEqual(['depth 2 · exp 17%', `bands ±${STATION_BAND_PCT[2]}%`])
    expect(rvn.selection).toEqual({ kind: 'station', factionId: 'rvn' })
    const laos = tagFor(layerTags(s, 'intelligence'), 'laos')!
    expect(effectiveDepth(s, 'laos')).toBe(0)
    expect(laos.lines).toEqual(['no station', `bands ±${STATION_BAND_PCT[0]}%`])
  })
})

describe('layerTags — Politics', () => {
  it('relation, opinion och embargo per land, och antalet öppna upphandlingar', () => {
    const s = state()
    s.factions.rvn!.embargoed = true
    const tag = tagFor(layerTags(s, 'politics'), 'rvn')!
    expect(tag.lines[0]).toBe(`relation ${Math.round(s.factions.rvn!.relationToPlayer)}`)
    expect(tag.lines[1]).toBe(`support ${Math.round(s.factions.rvn!.publicSupport)}%`)
    expect(tag.lines).toContain('EMBARGO')
  })

  it('NLF har en egen etikett i varje lager det har något att visa i', () => {
    const s = state()
    for (const layer of ['orders', 'intelligence', 'politics'] as const) {
      expect(tagFor(layerTags(s, layer), 'nlf'), layer).toBeTruthy()
    }
  })
})
