// mapInfo.test.ts — P165 (ETAPP10_FORSLAG.md §3b, S6): informationskortet för det valda föremålet på kartan. Varje påstående kortet gör läses ur tillståndet eller kärnans egna
// frågor; testet binder dem dit så att kortet inte kan säga något som spelet inte håller med om.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DISPLAY_THRESHOLDS, createInitialState, deriveSectorControl, effectiveDepth, formationDisplay } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { COUNTRY_LABEL, COUNTRY_TO_FACTION, deriveMapInfo } from '../src/mapInfo.js'
import { HANDBOOK } from '../src/handbook.js'
import { stationOutlook } from '../src/stationOutlook.js'

const state = (seed = 'map-info-seed'): GameState => createInitialState('indochina-slice', seed)
const row = (info: ReturnType<typeof deriveMapInfo>, label: string): string => info!.rows.find((r) => r.label === label)?.value ?? '(saknas)'

describe('deriveMapInfo — land', () => {
  it('ett land med en spelbar faktion: namn, relation, krig, station, öppna ordrar och en väg in i landsakten', () => {
    const s = state()
    const info = deriveMapInfo(s, { kind: 'country', countryId: 'south-vietnam' })!
    expect(info.title).toBe('Republic of Vietnam')
    expect(info.openFile).toBe('rvn')
    expect(row(info, 'Relation to you')).toBe(`${Math.round(s.factions.rvn!.relationToPlayer)} / 100`)
    expect(row(info, 'Station')).toMatch(/SAIGON.*depth 1/i)
    expect(row(info, 'Fighting')).toMatch(/At war with .*Liberation/i)
    expect(row(info, 'Open orders')).toBe(String(s.market.openOrders.filter((o) => o.buyerId === 'rvn').length))
  })

  it('en vilande station: landets kort säger det och att REOPEN väcker den (P167)', () => {
    const s = state()
    s.house.stations[0]!.status = 'dormant'
    const info = deriveMapInfo(s, { kind: 'country', countryId: 'south-vietnam' })!
    expect(row(info, 'Station')).toMatch(/dormant.*REOPEN/i)
  })

  it('stationens kort visar vad den täcker (P167)', () => {
    const s = state()
    s.house.stations[0]!.depth = 3
    s.house.stations[0]!.coverage = ['procurement', 'military', 'industry']
    const info = deriveMapInfo(s, { kind: 'station', factionId: 'rvn' })!
    expect(row(info, 'Covers')).toBe('procurement, military, industry')
  })

  it('NLF har ingen egen landmassa: kortet för RVN säger var NLF:s styrkor finns', () => {
    const info = deriveMapInfo(state(), { kind: 'country', countryId: 'south-vietnam' })!
    expect(info.note).toMatch(/National Liberation Front/)
    expect(info.note).toMatch(/no territory of its own/)
  })

  it('utan station står det, och formationerna är okända', () => {
    const s = state()
    s.house.staff.chiefSalesman = 0
    const info = deriveMapInfo(s, { kind: 'country', countryId: 'laos' })!
    expect(row(info, 'Station')).toMatch(/^None/)
    expect(effectiveDepth(s, 'laos')).toBe(0)
    expect(row(info, 'Formations')).toMatch(/strength unknown/)
  })

  it('ett sammanhangsland (Kambodja) får ett kort som säger att det inte är en köpare, och ingen väg in i en landsakt', () => {
    const info = deriveMapInfo(state(), { kind: 'country', countryId: 'cambodia' })!
    expect(info.title).toBe('Cambodia')
    expect(info.openFile).toBeNull()
    expect(info.note).toMatch(/not a buyer/i)
  })

  it('alla sex länder i kartfilen har ett namn och ett kort (alla länder är tryckbara)', () => {
    const topo = JSON.parse(readFileSync(join(import.meta.dirname, '../public/geo/indochina.topo.json'), 'utf8'))
    const ids = topo.objects.countries.geometries.map((g: { id: string; properties: { name: string } }) => ({ id: g.id, name: g.properties.name }))
    expect(ids).toHaveLength(6)
    for (const { id, name } of ids) {
      expect(COUNTRY_LABEL[id], id).toBe(name)
      expect(deriveMapInfo(state(), { kind: 'country', countryId: id }), id).not.toBeNull()
    }
    for (const id of Object.keys(COUNTRY_TO_FACTION)) expect(ids.some((c: { id: string }) => c.id === id)).toBe(true)
  })
})

describe('deriveMapInfo — sektor och förband', () => {
  it('en sektor visar vem som håller den, ur deriveSectorControl, och vilka förband som står där', () => {
    const s = state()
    const front = Object.values(s.fronts).find((f) => f.formations.length > 0)!
    const control = deriveSectorControl(s, front).find((c) => c.formations.length > 0)!
    const info = deriveMapInfo(s, { kind: 'sector', sectorId: control.sectorId })!
    const expected = { a: 'Friendly', b: 'Hostile', contested: 'Contested', empty: 'No forces' }[control.side]
    expect(row(info, 'Held by')).toBe(expected)
    expect(info.rows.some((r) => r.label === 'Friendly forces' || r.label === 'Hostile forces')).toBe(true)
  })

  it('Ho Chi Minh-leden säger att den är en led och inte en plats', () => {
    const info = deriveMapInfo(state(), { kind: 'sector', sectorId: 'ho-chi-minh-trail' })!
    expect(info.note).toMatch(/route/i)
  })

  it('ett okänt förband: ingen styrka, inget namn, och vad som krävs för att se det', () => {
    const s = state()
    s.house.staff.chiefSalesman = 0
    for (const st of s.house.stations) st.depth = 0
    const formation = Object.values(s.fronts).flatMap((f) => f.formations)[0]!
    const info = deriveMapInfo(s, { kind: 'formation', formationId: formation.id })!
    expect(info.title).toBe('Unknown formation')
    expect(JSON.stringify(info)).not.toContain(formation.name)
    expect(row(info, 'Strength')).toMatch(/unknown/i)
    expect(info.note).toMatch(/station/i)
  })

  it('ett känt förband: namn och exakt styrka ur formationDisplay', () => {
    const s = state()
    const formation = Object.values(s.fronts).flatMap((f) => f.formations).find((f) => f.factionId === s.house.stations[0]!.nation)!
    const display = formationDisplay(s, formation)
    expect(display.known).toBe(true)
    const info = deriveMapInfo(s, { kind: 'formation', formationId: formation.id })!
    expect(info.title).toBe(formation.name)
    expect(row(info, 'Strength')).toContain(String(display.strength))
  })
})

describe('deriveMapInfo — frontlinje, station, försörjningslinje, heat', () => {
  it('frontlinjen: status, sidor, ställning och förändring ur Front', () => {
    const s = state()
    const front = Object.values(s.fronts)[0]!
    front.position = -40
    front.trace = [-10, -25, -40]
    const info = deriveMapInfo(s, { kind: 'frontline', frontId: front.id })!
    expect(row(info, 'Status')).toMatch(/War/i)
    expect(row(info, 'Ahead')).toMatch(/Friendly/)
    expect(row(info, 'Last quarters')).toMatch(/-10.*-25.*-40/)
    expect(info.topic).toBe('fronts')
  })

  it('en vapenvila säger att ingen strid sker', () => {
    const s = state()
    const front = Object.values(s.fronts)[0]!
    front.status = 'ceasefire'
    const info = deriveMapInfo(s, { kind: 'frontline', frontId: front.id })!
    expect(row(info, 'Status')).toMatch(/Ceasefire/i)
    expect(info.note).toMatch(/no fighting/i)
  })

  it('stationen: djup, exponering mot bränntröskeln och prisbandet ur stationOutlook, och en väg in i landsakten', () => {
    const s = state()
    const st = s.house.stations[0]!
    st.depth = 2
    st.exposure = 33
    const info = deriveMapInfo(s, { kind: 'station', factionId: st.nation })!
    expect(info.openFile).toBe(st.nation)
    expect(row(info, 'Depth')).toMatch(/2/)
    expect(row(info, 'Exposure')).toContain('33%')
    expect(row(info, 'Exposure')).toContain(String(DISPLAY_THRESHOLDS.exposureBurnThreshold))
    expect(row(info, 'Price bands')).toContain(`±${stationOutlook(s, st.nation).bandPct}%`)
    expect(info.topic).toBe('intelligence')
  })

  it('spelarens försörjningslinje: enheter under transport och nästa ankomst ur Shipment', () => {
    const s = state()
    s.market.contracts.push({
      id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 500, grade: 'B', dueTurn: 5,
      status: 'active', lateEventId: null, frontId: 'front-1', advancePct: 0, advancePaid: 0,
    })
    s.market.shipments.push({ id: 's1', contractId: 'c1', units: 5, arrivalTurn: s.meta.turn + 2 }, { id: 's2', contractId: 'c1', units: 3, arrivalTurn: s.meta.turn + 1 })
    const info = deriveMapInfo(s, { kind: 'supply', lineId: 'player-front-1' })!
    expect(info.title).toBe('Your supply line')
    expect(row(info, 'In transit')).toBe('8 units in 2 shipments')
    expect(row(info, 'Next arrival')).toMatch(/1 quarter/)
  })

  it('en rivals linje: vem och hur mycket rivalen levererat till fronten sammanlagt', () => {
    const s = state()
    const rival = Object.values(s.rivals)[0]!
    s.fronts['front-1']!.attribution[rival.id] = 42
    const info = deriveMapInfo(s, { kind: 'supply', lineId: `rival-front-1-${rival.id}` })!
    expect(info.title).toBe(`${rival.name}'s supply line`)
    expect(row(info, 'Delivered here')).toBe('42 units in total')
  })

  it('heat: värde, tröskel och handbokens egen sammanfattning', () => {
    const s = state()
    const theatre = Object.values(s.theatres)[0]!
    theatre.heat = 61
    const info = deriveMapInfo(s, { kind: 'heat', theatreId: theatre.id })!
    expect(row(info, 'Heat')).toBe('61 / 100')
    expect(row(info, 'Escalates at')).toBe(String(DISPLAY_THRESHOLDS.heatEscalation))
    expect(info.note).toBe(HANDBOOK.find((t) => t.id === 'heat')!.summary)
  })

  it('ett föremål som inte finns längre (ett förstört förband) ger inget kort', () => {
    const s = state()
    expect(deriveMapInfo(s, { kind: 'formation', formationId: 'no-such' })).toBeNull()
    expect(deriveMapInfo(s, { kind: 'sector', sectorId: 'no-such' })).toBeNull()
    expect(deriveMapInfo(s, { kind: 'supply', lineId: 'player-nowhere' })).toBeNull()
    expect(deriveMapInfo(s, { kind: 'country', countryId: 'atlantis' })).toBeNull()
  })
})
