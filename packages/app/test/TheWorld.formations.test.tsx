// TheWorld.formations.test.tsx — P51 klart-när: "ett test visar att ett förband
// utan station i landet visas som UNKNOWN FORMATION" (ETAPP3_KRIGET_SOM_MARKNAD_
// TEKNISK_SPEC.md avsnitt 7, skyddsräcke 3). Renderar TheWorld PÅ RIKTIGT (jsdom),
// samma mönster som TheFloor.weights.test.tsx — en körtidsrendering fångar att
// panelen faktiskt kopplas ihop med formationDisplay, inte bara att funktionen
// själv gör rätt (redan täckt av queries.formationDisplay.test.ts i packages/core).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { TheWorld } from '../src/components/TheWorld.js'

afterEach(cleanup)

describe('TheWorld — förbanden på lägesbordet (P51 klart-när)', () => {
  it('utan någon station visas samtliga förband som UNKNOWN FORMATION, grupperade per sektor', () => {
    const state = createInitialState('indochina-slice', 'the-world-formations-seed')
    state.house.stations = []

    const { container } = render(<TheWorld state={state} />)

    expect(container.textContent).toContain('UNKNOWN FORMATION')
    // Inget av de faktiska förbandsnamnen (indochina-slice.json) läcker ut.
    expect(container.textContent).not.toContain('1st Infantry Division')
    expect(container.textContent).not.toContain('9th Division')
  })

  it('med en aktiv station i ett lands nation visas det landets förband vid namn, motståndarens fortfarande dimmat', () => {
    const state = createInitialState('indochina-slice', 'the-world-formations-seed')
    state.house.stations = [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 0, coverage: ['military'], status: 'active' },
    ]

    const { container } = render(<TheWorld state={state} />)

    expect(container.textContent).toContain('1st Infantry Division')
    expect(container.textContent).toContain('UNKNOWN FORMATION') // nlf, fortfarande okänt
  })
})
