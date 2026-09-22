// TheWorld.stations.test.tsx — P71 klart-når (ETAPP6_TEKNISK_SPEC.md §5): "ingen
// <table> kvar i TheWorld.tsx, ett snapshot-test uppdaterat." Repot har ingen
// toMatchSnapshot-infrastruktur — "snapshot-test" läst som samma slags riktiga
// jsdom-render de andra panelerna redan testas med (TheWorld.formations.test.tsx,
// ThePolitics.gating.test.tsx), inte ett bokstavligt Vitest-snapshot.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { TheWorld } from '../src/components/TheWorld.js'

afterEach(cleanup)

describe('TheWorld — Stations blir kort (P71 klart-når)', () => {
  it('ingen <table> renderas längre någonstans i vyn', () => {
    const state = createInitialState('indochina-slice', 'the-world-stations-seed')
    state.house.stations = [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 20, coverage: ['military'], status: 'active' },
    ]

    const { container } = render(<TheWorld state={state} />)

    expect(container.querySelector('table')).toBeNull()
  })

  it('en station renderas som ett kort med stad, nation, djup, coverage, exponering och status', () => {
    const state = createInitialState('indochina-slice', 'the-world-stations-seed')
    state.house.stations = [
      { id: 'station-1', city: 'SAIGON', nation: 'rvn', depth: 2, exposure: 20, coverage: ['military'], status: 'active' },
    ]

    const { container } = render(<TheWorld state={state} />)

    expect(container.textContent).toContain('SAIGON')
    expect(container.textContent).toContain(state.factions.rvn!.name)
    expect(container.textContent).toContain('2/5')
    expect(container.textContent).toContain('military')
    expect(container.textContent).toContain('20')
    expect(container.textContent).toContain('Active')
  })

  it('en aktiv station över exposureBurnThreshold visas som "Under surveillance", en dormant/burned station gör det aldrig', () => {
    const state = createInitialState('indochina-slice', 'the-world-stations-seed')
    state.house.stations = [
      { id: 'station-1', city: 'HUE', nation: 'rvn', depth: 3, exposure: 85, coverage: ['procurement'], status: 'active' },
      { id: 'station-2', city: 'HANOI', nation: 'nlf', depth: 1, exposure: 90, coverage: ['industry'], status: 'burned' },
    ]

    const { container } = render(<TheWorld state={state} />)

    expect(container.textContent).toContain('Under surveillance')
    expect(container.textContent).toContain('Burned')
    // Bara EN "Under surveillance"-tagg — burned-stationen ska inte trigga den,
    // trots att dess exposure också ligger över tröskeln.
    expect(container.textContent!.split('Under surveillance').length - 1).toBe(1)
  })
})
