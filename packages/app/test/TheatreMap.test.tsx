// TheatreMap.test.tsx — P76 (ETAPP7_TEKNISK_SPEC.md §13). jsdom saknar både
// en riktig nätverksstack för relativa fetch-anrop och SVGElement.getBBox
// (verifierat, samma miljölucka som matchMedia/indexedDB på andra ställen i
// den här appen) — `global.fetch` mockas här med den RIKTIGA byggda
// topologifilen (samma fil TheatreMap faktiskt fetchar i webbläsaren), så
// projektions- och sektorfärgningslogiken testas mot äkta geometri i stället
// för en handskriven stubb. Etikettkollisionens getBBox-gren testas inte här
// (kräver en riktig layout-motor) — se e2e/text-overflow.spec.ts (regel 18).
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { TheatreMap } from '../src/components/TheatreMap.js'

afterEach(cleanup)

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const TOPOLOGY_JSON = readFileSync(join(TEST_DIR, '../public/geo/indochina.topo.json'), 'utf-8')

describe('TheatreMap (P76)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('visar platshållaren medan geodatan hämtas, sedan den riktiga kartan när den kommit fram', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-seed')
    render(<TheatreMap state={state} />)

    expect(document.querySelector('[data-testid="theatre-map-loading"]')).toBeTruthy()

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })
  })

  it('visar platshållaren i stället för att krascha om geodatan inte går att hämta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    )
    const state = createInitialState('indochina-slice', 'theatre-map-error-seed')
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="map-placeholder"]')).toBeTruthy()
    })
    expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeNull()
  })

  it('ritar alla sex sektorer från SECTOR_REGIONS, färgade av deriveSectorControl', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-sector-seed')
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })

    for (const sectorId of ['hue', 'da-nang', 'an-loc', 'cu-chi', 'plain-of-jars', 'ho-chi-minh-trail']) {
      const el = document.querySelector(`[data-testid="map-sector-${sectorId}"]`)
      expect(el, `sektor ${sectorId} saknas`).toBeTruthy()
      expect(el!.getAttribute('class')).toMatch(/is-(a|b|contested|empty)/)
    }
  })

  it('ritar en frontlinje-markör per front som har en SECTOR_REGIONS-post', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-frontline-seed')
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })

    expect(document.querySelector('[data-testid="map-frontline-marker-front-1"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-frontline-marker-front-laos"]')).toBeTruthy()
  })

  it('ritar ingen spårprick vid tur 0 — state.ts seedar front.trace = [position], samma koordinat som markören självt (regel 18: en kollision med sig själv, ingen information)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-trace-seed')
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })

    expect(document.querySelector('[data-testid="map-frontline-marker-trace-front-1-0"]')).toBeNull()
    expect(document.querySelector('[data-testid="map-frontline-marker-trace-front-laos-0"]')).toBeNull()
  })

  it('ritar en spårprick när fronten faktiskt rört sig (trace skiljer sig från nuvarande position)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-trace-moved-seed')
    state.fronts['front-1']!.trace = [state.fronts['front-1']!.position - 20]
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })

    expect(document.querySelector('[data-testid="map-frontline-marker-trace-front-1-0"]')).toBeTruthy()
  })

  it('ritar Vietnam delat i north-vietnam/south-vietnam och en dmz-linje', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-dmz-seed')
    render(<TheatreMap state={state} />)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy()
    })

    expect(document.querySelector('[data-testid="map-country-north-vietnam"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-country-south-vietnam"]')).toBeTruthy()
    expect(document.querySelector('.map-dmz-line')).toBeTruthy()
  })
})
