// worksOnMap.test.tsx — P181 (ETAPP11_FORSLAG.md §8): ett verk i ett köparland syns på teaterkartan, och Nytt parti visar startpaketet som en liten tomtplan.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { Facility, GameState } from '@seventh-front/core'
import { TheatreMap } from '../src/components/TheatreMap.js'
import { NewGameScreen } from '../src/components/NewGameScreen.js'
import { deriveMapInfo } from '../src/mapInfo.js'

afterEach(cleanup)

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const TOPOLOGY_JSON = readFileSync(join(TEST_DIR, '../public/geo/indochina.topo.json'), 'utf-8')

function withForeignWorks(): { state: GameState; works: Facility } {
  const state = createInitialState('indochina-slice', 'works-on-map')
  const works: Facility = {
    id: 'works-9', kind: 'assembly', level: 1, category: 'infantry', condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 1_000_000,
    location: 'rvn', hostAlignment: state.factions.rvn!.alignment, localKnowledge: 0,
  }
  state.house.works.push(works)
  return { state, works }
}

describe('verk i köparland på kartan (P181)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response))
  })

  it('utan verk utomlands ritas ingen markör', async () => {
    render(<TheatreMap state={createInitialState('indochina-slice', 'works-on-map-0')} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())
    expect(document.querySelector('.map-works-marker')).toBeNull()
  })

  it('ett verk i RVN får en markör i sin sektor (Hue) med lampa, och ett tryck väljer det och visar kortet', async () => {
    const { state, works } = withForeignWorks()
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector(`[data-testid="map-works-${works.id}"]`)).toBeTruthy())
    const marker = document.querySelector(`[data-testid="map-works-${works.id}"]`) as SVGGElement
    expect(marker.getAttribute('aria-label')).toMatch(/Assembly Works in Hue/)
    expect(marker.querySelector('image')?.getAttribute('href')).toBe('/art/works/assembly.svg')
    expect(marker.querySelector('.map-works-lamp')).toBeTruthy()
    fireEvent.click(marker)
    await waitFor(() => expect(screen.getByTestId('map-info-card')).toBeTruthy())
    expect(screen.getByTestId('map-info-card').textContent).toContain('Hue')
  })
})

describe('deriveMapInfo — ett verk (P181)', () => {
  it('kortet: nivå, status, bemanning och vem som håller sektorn; en väg in i landsakten och en handboksrad', () => {
    const { state, works } = withForeignWorks()
    const info = deriveMapInfo(state, { kind: 'works', facilityId: works.id })!
    expect(info.kicker).toBe('YOUR WORKS')
    expect(info.title).toContain('Hue')
    expect(info.rows.map((r) => r.label)).toEqual(['Level', 'Status', 'Staff', 'Sector'])
    expect(info.openFile).toBe('rvn')
    expect(info.topic).toBe('works')
  })

  it('ett verk som inte finns (sålt eller förlorat) ger inget kort, och ett hemmaverk heller inte', () => {
    const { state } = withForeignWorks()
    expect(deriveMapInfo(state, { kind: 'works', facilityId: 'works-404' })).toBeNull()
    expect(deriveMapInfo(state, { kind: 'works', facilityId: state.house.works[0]!.id })).toBeNull()
  })
})

describe('Nytt parti visar startpaketet som en liten tomtplan (P181)', () => {
  it('tre byggnader på planen — monteringsverk, labb och ritkontor — och en rad som säger vilka, i den valda kategorin', () => {
    render(<NewGameScreen onSubmit={() => {}} onBack={() => {}} />)
    expect(screen.getByTestId('newgame-site-plan').querySelectorAll('.mini-plan-building')).toHaveLength(3)
    for (const kind of ['assembly', 'laboratory', 'design']) expect(screen.getByTestId(`mini-plan-${kind}`)).toBeTruthy()
    expect(screen.getByTestId('newgame-site-summary').textContent).toMatch(/Assembly Works \(artillery\), 2 production lines/)
    expect(screen.getByTestId('newgame-site-summary').textContent).toMatch(/Laboratory \(artillery\)/)
    expect(screen.getByTestId('newgame-site-summary').textContent).toMatch(/Design Office/)
  })

  it('att byta specialisering byter kategorin i startpaketet', () => {
    render(<NewGameScreen onSubmit={() => {}} onBack={() => {}} />)
    fireEvent.click(screen.getByTestId('newgame-specialisation').querySelectorAll('[role="radio"]')[3]!) // NAVAL
    expect(screen.getByTestId('newgame-site-summary').textContent).toMatch(/Assembly Works \(naval\)/)
    expect(screen.getByTestId('newgame-site-summary').textContent).toMatch(/Laboratory \(naval\)/)
    expect(screen.getByTestId('newgame-site-plan').getAttribute('aria-label')).toContain('naval')
  })
})
