// Etapp 14, P201: kartans ram på en bred skärm (mapFrame.ts).
import { describe, expect, it } from 'vitest'
import { geoMercator } from 'd3-geo'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FOCUS_BOUNDS, PRINT_LABELS, VIEW_HEIGHT, scaleBarFor, viewWidthFor } from '../src/mapFrame.js'
import { COUNTRY_LABEL, COUNTRY_TO_FACTION } from '../src/mapInfo.js'

describe('viewWidthFor', () => {
  it('följer kartytans proportion med höjden fast på VIEW_HEIGHT', () => {
    expect(viewWidthFor(747, 628)).toBe(Math.round((VIEW_HEIGHT * 747) / 628))
    expect(viewWidthFor(1013, 808)).toBe(Math.round((VIEW_HEIGHT * 1013) / 808))
  })
  it('okänd storlek ger den gamla stående vyn, och ytterlägen klampas', () => {
    expect(viewWidthFor(0, 0)).toBe(600)
    expect(viewWidthFor(100, 800)).toBe(600)
    expect(viewWidthFor(10000, 100)).toBe(2000)
  })
})

describe('scaleBarFor', () => {
  it('ger ett jämnt avstånd med en stock på minst 60 enheter, som krymper i km när man zoomar in', () => {
    const projection = geoMercator().fitExtent([[24, 24], [929, 776]], { type: 'MultiPoint', coordinates: FOCUS_BOUNDS.map((p) => [...p]) })
    const atStart = scaleBarFor(projection.scale(), 15, 1)
    const zoomed = scaleBarFor(projection.scale(), 15, 4)
    expect(atStart.length).toBeGreaterThanOrEqual(60)
    expect(zoomed.km).toBeLessThan(atStart.km)
    expect(atStart.nauticalMiles).toBe(Math.round(atStart.km / 1.852))
  })
})

describe('kartfilen och de tryckta namnen', () => {
  const topo = JSON.parse(readFileSync(join(import.meta.dirname, '../public/geo/indochina.topo.json'), 'utf8'))
  it('kartfilen täcker mer än fokus åt alla håll, så att en bred skärm aldrig visar tomt papper där det är land', () => {
    const [minLng, minLat, maxLng, maxLat] = topo.bbox as number[]
    expect(minLng).toBeLessThan(FOCUS_BOUNDS[0][0] - 5)
    expect(maxLng).toBeGreaterThan(FOCUS_BOUNDS[1][0] + 5)
    expect(minLat).toBeLessThan(FOCUS_BOUNDS[0][1] - 3)
    expect(maxLat).toBeGreaterThan(FOCUS_BOUNDS[1][1] + 2)
  })
  it('varje tryckt landsnamn hör till ett land i kartfilen, och stämpeln finns bara för köparländer', () => {
    for (const label of PRINT_LABELS.filter((l) => l.kind === 'country')) {
      expect(COUNTRY_LABEL[label.id], label.id).toBeDefined()
      if (label.stampLngLat) expect(COUNTRY_TO_FACTION[label.id], label.id).toBeDefined()
    }
    for (const id of Object.keys(COUNTRY_TO_FACTION)) expect(PRINT_LABELS.find((l) => l.id === id)?.stampLngLat, id).toBeDefined()
  })
})
