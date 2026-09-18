// SectorBoard.test.tsx — P66 klart-när (ETAPP6_TEKNISK_SPEC.md §4.6): "jsdom-
// render, en nod per sektor, ingen förbandsdata synlig innan sektorn
// klickats." Renderar SectorBoard PÅ RIKTIGT, samma mönster som
// TheFloor.weights.test.tsx/TheWorld.formations.test.tsx.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { Formation, GameState } from '@seventh-front/core'
import { SectorBoard } from '../src/components/SectorBoard.js'

afterEach(cleanup)

function withFormations(state: GameState, formations: Formation[]): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  clone.fronts['front-1']!.formations = formations
  return clone
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

  it('skyddsräcke 4: en theatre helt utan layoutdata (front-laos, tills P67) faller tillbaka på en textlista, ingen krasch, ingen SVG', () => {
    const state = createInitialState('indochina-slice', 'sector-board-seed')

    const { container } = render(<SectorBoard front={state.fronts['front-laos']!} state={state} />)

    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByTestId('sector-board-unlayouted')).toBeTruthy()
  })
})
