// SectorBoard.frontline.test.tsx — P68 klart-när (ETAPP6_TEKNISK_SPEC.md §4.6):
// "en känd trace-sekvens ger en känd, avrundningsbar SVG-koordinat (ingen
// pixel-för-pixel-snapshot — en toleransbaserad assertion)". Två lager: den
// rena interpolationsfunktionen isolerat (samma "räkna ut det för hand,
// jämför"-stil som pricing.test.ts/board.test.ts:s toBeCloseTo-tester), och
// ett riktigt jsdom-render som visar att SectorBoard faktiskt kopplar ihop
// front.position/front.trace med SVG:n — samma tvålagersmönster som
// deriveSectorControl (core-test) + SectorBoard.test.tsx (render-test).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { SectorBoard, interpolateFrontPosition } from '../src/components/SectorBoard.js'
import { SECTOR_LAYOUTS } from '../src/sectorLayout.js'

afterEach(cleanup)

const INDOCHINA = SECTOR_LAYOUTS.indochina!
const LAOS = SECTOR_LAYOUTS.laos!

describe('interpolateFrontPosition (§4.4 punkt 3, P68 klart-när — känd sekvens, känd koordinat)', () => {
  it('position -100 ger exakt layoutens FÖRSTA nod (hue)', () => {
    const point = interpolateFrontPosition(INDOCHINA, -100)
    expect(point.x).toBeCloseTo(70, 6)
    expect(point.y).toBeCloseTo(15, 6)
  })

  it('position +100 ger exakt layoutens SISTA nod (cu-chi)', () => {
    const point = interpolateFrontPosition(INDOCHINA, 100)
    expect(point.x).toBeCloseTo(40, 6)
    expect(point.y).toBeCloseTo(85, 6)
  })

  it('position 0 (mitten) ger mittpunkten av mittsegmentet — da-nang (65,40) till an-loc (45,65), halvvägs', () => {
    const point = interpolateFrontPosition(INDOCHINA, 0)
    expect(point.x).toBeCloseTo(55, 6)
    expect(point.y).toBeCloseTo(52.5, 6)
  })

  it('en tvånodslayout (laos) interpolerar över sitt enda segment — position 50 (75% mot sida B)', () => {
    const point = interpolateFrontPosition(LAOS, 50)
    // plain-of-jars (30,30) → ho-chi-minh-trail (50,70), 75% av vägen.
    expect(point.x).toBeCloseTo(45, 6)
    expect(point.y).toBeCloseTo(60, 6)
  })

  it('klampar position utanför -100..100 i stället för att extrapolera utanför tavlan', () => {
    const over = interpolateFrontPosition(INDOCHINA, 500)
    const atMax = interpolateFrontPosition(INDOCHINA, 100)
    expect(over).toEqual(atMax)
  })
})

describe('SectorBoard — frontlinje-indikatorn renderad (P68 klart-när, känd trace-sekvens)', () => {
  it('en känd front.position + front.trace ger kända SVG-koordinater för nuvarande markör och de tre föregående, tondämpade', () => {
    const state = createInitialState('indochina-slice', 'sector-board-frontline-seed')
    const front = state.fronts['front-1']!
    front.position = 100
    front.trace = [-100, -50, 0] // äldst → nyast, precis som fronts.ts bygger den

    const { container } = render(<SectorBoard front={front} state={state} />)

    const current = container.querySelector('[data-testid="frontline-marker"]')!
    expect(Number(current.getAttribute('cx'))).toBeCloseTo(40, 6) // cu-chi
    expect(Number(current.getAttribute('cy'))).toBeCloseTo(85, 6)

    // Nyast föregående (trace[2] = 0) visas FÖRST (mest synlig).
    const trace0 = container.querySelector('[data-testid="frontline-marker-trace-0"]')!
    expect(Number(trace0.getAttribute('cx'))).toBeCloseTo(55, 6)
    expect(Number(trace0.getAttribute('cy'))).toBeCloseTo(52.5, 6)

    const trace1 = container.querySelector('[data-testid="frontline-marker-trace-1"]')!
    expect(Number(trace1.getAttribute('cx'))).toBeCloseTo(66.25, 6)
    expect(Number(trace1.getAttribute('cy'))).toBeCloseTo(33.75, 6)

    const trace2 = container.querySelector('[data-testid="frontline-marker-trace-2"]')!
    expect(Number(trace2.getAttribute('cx'))).toBeCloseTo(70, 6) // äldst (trace[0] = -100) → hue
    expect(Number(trace2.getAttribute('cy'))).toBeCloseTo(15, 6)

    // Tondämpning: äldre punkter STRIKT mindre synliga än nyare.
    const opacity0 = Number((trace0 as HTMLElement).style.opacity)
    const opacity1 = Number((trace1 as HTMLElement).style.opacity)
    const opacity2 = Number((trace2 as HTMLElement).style.opacity)
    expect(opacity0).toBeGreaterThan(opacity1)
    expect(opacity1).toBeGreaterThan(opacity2)
  })

  it('trace med färre än tre värden (tidig tur) visar bara så många föregående markörer som faktiskt finns', () => {
    const state = createInitialState('indochina-slice', 'sector-board-frontline-seed')
    const front = state.fronts['front-1']!
    front.position = 0
    front.trace = [-20] // bara en föregående punkt

    const { container } = render(<SectorBoard front={front} state={state} />)

    expect(container.querySelector('[data-testid="frontline-marker-trace-0"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="frontline-marker-trace-1"]')).toBeNull()
  })

  it('en helt tom trace (partistart) kraschar inte — bara den nuvarande markören visas', () => {
    const state = createInitialState('indochina-slice', 'sector-board-frontline-seed')
    const front = state.fronts['front-1']!
    front.trace = []

    expect(() => render(<SectorBoard front={front} state={state} />)).not.toThrow()
    expect(document.querySelector('[data-testid="frontline-marker"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="frontline-marker-trace-0"]')).toBeNull()
  })
})
