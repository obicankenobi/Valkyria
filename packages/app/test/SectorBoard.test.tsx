// SectorBoard.test.tsx — P66 klart-når (ETAPP6_TEKNISK_SPEC.md §4.6): "jsdom-
// render, en nod per sektor, ingen förbandsdata synlig innan sektorn
// klickats." Renderar SectorBoard PÅ RIKTIGT, samma mönster som
// TheFloor.weights.test.tsx/TheWorld.formations.test.tsx.
//
// P67 (§4.6): "samma för front-laos/laos (bevisar att layouten och
// komponenten generaliserar över fler än en theatre utan hårdkodning av
// frontantal)" — se beskrivningen 'SectorBoard generaliserar ...' nedan.
// Ingen kod i SectorBoard.tsx eller queries.ts rördes för P67, bara en ny
// post i SECTOR_LAYOUTS (sectorLayout.ts) — skyddsräcke 4:s "hel theatre
// utan layoutdata"-test flyttades därför till en FABRICERAD theatreId (ingen
// riktig front saknar längre layoutdata i det enda scenario som finns).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { Formation, Front, GameState } from '@seventh-front/core'
import { SectorBoard } from '../src/components/SectorBoard.js'

afterEach(cleanup)

function withFormations(state: GameState, formations: Formation[]): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  clone.fronts['front-1']!.formations = formations
  return clone
}

function withFabricatedTheatre(front: Front): Front {
  return { ...front, theatreId: 'unmapped-theatre' }
}

describe('SectorBoard (§4.4, P66 klart-når)', () => {
  it('en nod per sektor (front-1/indochina: hue, da-nang, an-loc, cu-chi), ingen förbandsdata synlig innan klick', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')

    render(<SectorBoard front={state.fronts['front-1']!} state={state} />)

    expect(screen.getByTestId('sector-node-hue')).toBeTruthy()
    expect(screen.getByTestId('sector-node-da-nang')).toBeTruthy()
    expect(screen.getByTestId('sector-node-an-loc')).toBeTruthy()
    expect(screen.getByTestId('sector-node-cu-chi')).toBeTruthy()
    expect(screen.queryByTestId('sector-detail')).toBeNull()
    expect(document.querySelector('.formation-row')).toBeNull()
  })

  it('ett klick på en nod öppnar dess formationslista; ett andra klick på SAMMA nod stänger den igen', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')
    state.house.stations = [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 0, coverage: ['military'], status: 'active' },
    ]

    render(<SectorBoard front={state.fronts['front-1']!} state={state} />)

    fireEvent.click(screen.getByTestId('sector-node-hue'))
    expect(screen.getByTestId('sector-detail')).toBeTruthy()
    expect(document.querySelector('.formation-row')).toBeTruthy()

    fireEvent.click(screen.getByTestId('sector-node-hue'))
    expect(screen.queryByTestId('sector-detail')).toBeNull()
  })

  it('noden färgas efter deriveSectorControl:s side — cu-chi (bara nlf, sida b) får is-b, hue (bara rvn, sida a) får is-a', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')

    render(<SectorBoard front={state.fronts['front-1']!} state={state} />)

    const hueCircle = document.querySelector('[data-testid="sector-node-hue"] circle')!
    const cuChiCircle = document.querySelector('[data-testid="sector-node-cu-chi"] circle')!

    expect(hueCircle.getAttribute('class')).toContain('is-a')
    expect(cuChiCircle.getAttribute('class')).toContain('is-b')
  })

  it('skyddsräcke 4: en sektor deriveSectorControl känner till men SECTOR_LAYOUTS saknar en post för renderas som en fallback-rad, inte en krasch', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')
    const engineered: Formation[] = [
      ...state.fronts['front-1']!.formations,
      {
        id: 'ghost-formation',
        name: 'Ghost Regiment',
        factionId: 'rvn',
        frontId: 'front-1',
        side: 'a',
        sectorId: 'unmapped-sector', // finns inte i SECTOR_LAYOUTS.indochina
        doctrine: 'infantry',
        strength: 10,
        equipment: { infantry: 5, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 },
        readiness: 80,
        status: 'active',
        engagedWith: null,
        strengthAtFull: 10,
        turnsMauled: 0,
      },
    ]
    const front = withFormations(state, engineered).fronts['front-1']!

    expect(() => render(<SectorBoard front={front} state={state} />)).not.toThrow()
    expect(screen.getByTestId('sector-board-unlayouted').textContent).toContain('UNMAPPED-SECTOR')
    expect(screen.queryByTestId('sector-node-unmapped-sector')).toBeNull()
  })

  it('skyddsräcke 4: en theatre helt utan layoutdata faller tillbaka på en textlista, ingen krasch, ingen SVG', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')
    const front = withFabricatedTheatre(state.fronts['front-laos']!)

    const { container } = render(<SectorBoard front={front} state={state} />)

    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByTestId('sector-board-unlayouted')).toBeTruthy()
  })
})

// P67 (§4.6): samma tavla, samma komponent, samma deriveSectorControl — bara
// en ny SECTOR_LAYOUTS-post (laos) bevisar att ingenting i P66:s bygge var
// tyst hårdkodat mot indochinas fyra sektorer eller mot exakt EN front.
describe('SectorBoard generaliserar till en andra theatre utan hårdkodning (P67 klart-när)', () => {
  it('en nod per sektor för front-laos/laos (plain-of-jars, ho-chi-minh-trail), ingen förbandsdata synlig innan klick', () => {
    const state = createInitialState('indochina-slice', 'sector-board-laos-seed')

    render(<SectorBoard front={state.fronts['front-laos']!} state={state} />)

    expect(screen.getByTestId('sector-node-plain-of-jars')).toBeTruthy()
    expect(screen.getByTestId('sector-node-ho-chi-minh-trail')).toBeTruthy()
    expect(screen.queryByTestId('sector-detail')).toBeNull()
    expect(document.querySelector('.formation-row')).toBeNull()
  })

  it('klick på en laos-nod öppnar dess formationslista — samma interaktion som indochina, ingen egen kodväg', () => {
    const state = createInitialState('indochina-slice', 'sector-board-laos-seed')
    state.house.stations = [
      { id: 'station-1', city: 'VIENTIANE', nation: 'laos', depth: 2, exposure: 0, coverage: ['military'], status: 'active' },
    ]

    render(<SectorBoard front={state.fronts['front-laos']!} state={state} />)

    fireEvent.click(screen.getByTestId('sector-node-plain-of-jars'))
    expect(screen.getByTestId('sector-detail')).toBeTruthy()
    expect(document.querySelector('.formation-row')).toBeTruthy()
  })

  it('noderna färgas efter deriveSectorControl:s side precis som för indochina — plain-of-jars (bara laos, sida a) får is-a, ho-chi-minh-trail (bara nlf, sida b) får is-b', () => {
    const state = createInitialState('indochina-slice', 'sector-board-laos-seed')

    render(<SectorBoard front={state.fronts['front-laos']!} state={state} />)

    const plainCircle = document.querySelector('[data-testid="sector-node-plain-of-jars"] circle')!
    const trailCircle = document.querySelector('[data-testid="sector-node-ho-chi-minh-trail"] circle')!

    expect(plainCircle.getAttribute('class')).toContain('is-a')
    expect(trailCircle.getAttribute('class')).toContain('is-b')
  })
})
