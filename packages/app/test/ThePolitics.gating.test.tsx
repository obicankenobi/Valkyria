// ThePolitics.gating.test.tsx — P63 klart-när (ETAPP5_TEKNISK_SPEC.md avsnitt 8):
// "ett komponenttest visar att en tjänsteman utan 'cabinet'-täckning visas utan
// integritet och agenda; ett test visar att vyn inte kraschar utan station."
// Samma mönster som TheWorld.formations.test.tsx — riktig jsdom-rendering, inte
// bara ett test av officialDisplay() isolerat (redan täckt i packages/core).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { ThePolitics } from '../src/components/ThePolitics.js'

afterEach(cleanup)

describe('ThePolitics — rummet blir synligt (P63 klart-när)', () => {
  it('utan någon station visas ingen integritet eller agenda, och vyn kraschar inte', () => {
    const state = createInitialState('indochina-slice', 'the-politics-gating-seed')
    state.house.stations = []

    const { container } = render(<ThePolitics state={state} />)

    expect(container.textContent).toContain('UNKNOWN')
    expect(container.textContent).not.toMatch(/REARM|AUSTERITY|MODERNISE|NON_ALIGNMENT|SELF_ENRICHMENT/)
  })

  it('med en aktiv station med cabinet-täckning i ett lands nation visas det landets tjänstemäns integritet och agenda', () => {
    const state = createInitialState('indochina-slice', 'the-politics-gating-seed')
    const official = Object.values(state.officials).find((o) => o.post === 'procurement')
    if (!official) throw new Error('test-setup: inget procurement-official i indochina-slice')
    state.house.stations = [
      {
        id: 'station-1',
        city: 'SAIGON',
        nation: official.factionId,
        depth: 2,
        exposure: 0,
        coverage: ['cabinet'],
        status: 'active',
      },
    ]

    const { container } = render(<ThePolitics state={state} />)

    expect(container.textContent).toContain(official.agenda)
    expect(container.textContent).toContain(official.integrity.toFixed(0))
  })

  it('en aktiv station UTAN cabinet i coverage-listan ger fortfarande UNKNOWN, inte bara "ingen station"', () => {
    const state = createInitialState('indochina-slice', 'the-politics-gating-seed')
    const official = Object.values(state.officials).find((o) => o.post === 'procurement')
    if (!official) throw new Error('test-setup: inget procurement-official i indochina-slice')
    state.house.stations = [
      {
        id: 'station-1',
        city: 'SAIGON',
        nation: official.factionId,
        depth: 5,
        exposure: 0,
        coverage: ['procurement', 'military', 'industry'],
        status: 'active',
      },
    ]

    const { container } = render(<ThePolitics state={state} />)

    expect(container.textContent).toContain('UNKNOWN')
    expect(container.textContent).not.toContain(official.agenda)
  })
})
