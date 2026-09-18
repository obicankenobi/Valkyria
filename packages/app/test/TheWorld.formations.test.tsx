// TheWorld.formations.test.tsx — P41 klart-när: "ett test visar att ett förband
// utan station i landet visas som UNKNOWN FORMATION" (ETAPP3_KRIGET_SOM_MARKNAD_
// TEKNISK_SPEC.md avsnitt 7, skyddsräcke 3). Renderar TheWorld PÅ RIKTIGT (jsdom),
// samma mönster som TheFloor.weights.test.tsx — en körtidsrendering fångar att
// panelen faktiskt kopplas ihop med formationDisplay, inte bara att funktionen
// själv gör rätt (redan täckt av queries.formationDisplay.test.ts i packages/core).
//
// P66 (ETAPP6_TEKNISK_SPEC.md §4.6) bytte front-1/indochina till SectorBoard,
// där förbandsdata är gömd tills en sektornod klickas (§4.4 punkt 4) — de två
// befintliga fallen här klickar nu igenom noden i stället för att läsa
// container.textContent direkt, annars testar de bara att panelen INTE renderar
// någon förbandsdata alls, vilket inte längre är sant.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { TheWorld } from '../src/components/TheWorld.js'

afterEach(cleanup)

describe('TheWorld — förbanden på lägesbordet (P41 klart-när, genom P66:s sektortavla)', () => {
  it('utan någon station visas samtliga klickade sektorer som UNKNOWN FORMATION, aldrig de riktiga namnen', () => {
    const state = createInitialState('indochina-slice', 'the-world-formations-seed')
    state.house.stations = []

    const { container } = render(<TheWorld state={state} />)

    // hue (rvn) och cu-chi (nlf) — en sektor från vardera sidan av front-1.
    fireEvent.click(screen.getByTestId('sector-node-hue'))
    expect(container.textContent).toContain('UNKNOWN FORMATION')
    expect(container.textContent).not.toContain('1st Infantry Division')

    fireEvent.click(screen.getByTestId('sector-node-cu-chi'))
    expect(container.textContent).toContain('UNKNOWN FORMATION')
    expect(container.textContent).not.toContain('9th Division')
  })

  it('med en aktiv station i ett lands nation visas det landets förband vid namn, motståndarens fortfarande dimmat', () => {
    const state = createInitialState('indochina-slice', 'the-world-formations-seed')
    state.house.stations = [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 0, coverage: ['military'], status: 'active' },
    ]

    const { container } = render(<TheWorld state={state} />)

    fireEvent.click(screen.getByTestId('sector-node-hue')) // rvn:s sektor
    expect(container.textContent).toContain('1st Infantry Division')

    fireEvent.click(screen.getByTestId('sector-node-cu-chi')) // nlf:s sektor, ingen station där
    expect(container.textContent).toContain('UNKNOWN FORMATION')
    expect(container.textContent).not.toContain('9th Division')
  })
})
