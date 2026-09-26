// geoMath.test.ts — P76 (ETAPP7_TEKNISK_SPEC.md §13, P76 klart-när): "samma
// trace-sekvens som P68:s test ger känd kartkoordinat." Samma algoritm som
// SectorBoard.tsx:s interpolateFrontPosition (P68,
// SectorBoard.frontline.test.tsx), samma indata (position -100/0/100,
// trace [-100, -50, 0]) — bara målet bytt från 0–100-skärmkoordinater till
// SECTOR_REGIONS lat/lng-ankare.
import { describe, expect, it } from 'vitest'
import { interpolateFrontGeoPosition, tokenOffset } from '../src/geoMath.js'
import { SECTOR_REGIONS } from '../src/sectorRegions.js'

const INDOCHINA = SECTOR_REGIONS.indochina!
const LAOS = SECTOR_REGIONS.laos!

describe('interpolateFrontGeoPosition (P76 klart-när — känd sekvens, känd kartkoordinat)', () => {
  it('position -100 ger exakt regionslistans FÖRSTA ankare (hue)', () => {
    const [lat, lng] = interpolateFrontGeoPosition(INDOCHINA, -100)
    expect(lat).toBeCloseTo(16.46, 6)
    expect(lng).toBeCloseTo(107.59, 6)
  })

  it('position +100 ger exakt regionslistans SISTA ankare (cu-chi)', () => {
    const [lat, lng] = interpolateFrontGeoPosition(INDOCHINA, 100)
    expect(lat).toBeCloseTo(10.97, 6)
    expect(lng).toBeCloseTo(106.49, 6)
  })

  it('position 0 (mitten) ger mittpunkten av mittsegmentet — da-nang till an-loc, halvvägs', () => {
    const [lat, lng] = interpolateFrontGeoPosition(INDOCHINA, 0)
    // da-nang (16.05, 108.21) → an-loc (11.65, 106.60), halvvägs.
    expect(lat).toBeCloseTo(13.85, 6)
    expect(lng).toBeCloseTo(107.405, 6)
  })

  it('en tvånodsregion (laos) interpolerar över sitt enda segment — position 50 (75% mot sida B)', () => {
    const [lat, lng] = interpolateFrontGeoPosition(LAOS, 50)
    // plain-of-jars (19.45, 103.18) → ho-chi-minh-trail-ankaret (16, 106.5), 75% av vägen.
    expect(lat).toBeCloseTo(19.45 + (16 - 19.45) * 0.75, 6)
    expect(lng).toBeCloseTo(103.18 + (106.5 - 103.18) * 0.75, 6)
  })

  it('klampar position utanför -100..100 i stället för att extrapolera utanför regionen', () => {
    const over = interpolateFrontGeoPosition(INDOCHINA, 500)
    const atMax = interpolateFrontGeoPosition(INDOCHINA, 100)
    expect(over).toEqual(atMax)
  })

  it('samma trace-sekvens som SectorBoard.frontline.test.tsx (position 100, trace [-100,-50,0]) ger kända kartkoordinater', () => {
    // Samma indata som P68:s render-test, bara målet bytt. Nyast föregående
    // (trace[2] = 0) visas FÖRST, äldst (trace[0] = -100) sist — samma
    // ordning SectorBoard.tsx:s tracePositions = front.trace.slice(-3).reverse() ger.
    const trace = [-100, -50, 0].slice(-3).reverse()

    const current = interpolateFrontGeoPosition(INDOCHINA, 100)
    expect(current[0]).toBeCloseTo(10.97, 6) // cu-chi
    expect(current[1]).toBeCloseTo(106.49, 6)

    const trace0 = interpolateFrontGeoPosition(INDOCHINA, trace[0]!) // 0
    expect(trace0[0]).toBeCloseTo(13.85, 6)
    expect(trace0[1]).toBeCloseTo(107.405, 6)

    const trace1 = interpolateFrontGeoPosition(INDOCHINA, trace[1]!) // -50
    expect(trace1[0]).toBeCloseTo(16.1525, 6)
    expect(trace1[1]).toBeCloseTo(108.055, 6)

    const trace2 = interpolateFrontGeoPosition(INDOCHINA, trace[2]!) // -100
    expect(trace2[0]).toBeCloseTo(16.46, 6) // hue
    expect(trace2[1]).toBeCloseTo(107.59, 6)
  })
})

// P77 (ETAPP7_TEKNISK_SPEC.md §6.4/§13): förbandsbrickornas placering inom en
// sektor — flera Formation kan dela samma sectorId (t.ex. HUE har både 1st
// Infantry Division och 18th Artillery Group), en ren pixel-rutnät-förskjutning
// runt sektorns projicerade ankarpunkt, ingen geografi inblandad (skiljer sig
// från interpolateFrontGeoPosition, som arbetar i lat/lng).
describe('tokenOffset (P77 — förbandsbrickornas rutnätsplacering inom en sektor)', () => {
  it('ett enda förband centreras exakt på ankaret', () => {
    expect(tokenOffset(0, 1)).toEqual([0, 0])
  })

  it('två förband placeras symmetriskt kring ankaret på samma rad', () => {
    const [x0, y0] = tokenOffset(0, 2)
    const [x1, y1] = tokenOffset(1, 2)
    expect(y0).toBe(0)
    expect(y1).toBe(0)
    expect(x0).toBeCloseTo(-x1, 6)
    expect(x0).toBeLessThan(x1)
  })

  it('fyra förband (tokensPerRow=3) bildar två rader, tre på första och en på andra', () => {
    const offsets = [0, 1, 2, 3].map((i) => tokenOffset(i, 4))
    const rows = new Set(offsets.map(([, y]) => y))
    expect(rows.size).toBe(2) // två distinkta rad-y-värden
    // Det ensamma fjärde förbandet (index 3, ensamt på rad 2) centreras på x=0.
    expect(offsets[3]![0]).toBeCloseTo(0, 6)
  })

  it('är deterministiskt: samma index/total ger alltid samma förskjutning', () => {
    expect(tokenOffset(2, 5)).toEqual(tokenOffset(2, 5))
  })
})
