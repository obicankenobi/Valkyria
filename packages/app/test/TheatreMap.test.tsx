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

// P77 (ETAPP7_TEKNISK_SPEC.md §13): "APP-6-brickor, underrättelsedimma,
// allt i §6.6 under omgivningsrörelse." Klart när: "förband utan station
// renderas streckat och namnlöst."
describe('TheatreMap (P77) — förbandsbrickor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('ritar en bricka per aktivt förband (destroyed uteslutna)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-tokens-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    // Scenariots front-1 har åtta förband, front-laos har fler — alla utom
    // eventuellt destroyed (inget är destroyed vid partistart) ska finnas.
    const allFormationIds = [...Object.values(state.fronts)].flatMap((f) => f.formations.map((formation) => formation.id))
    expect(allFormationIds.length).toBeGreaterThan(0)
    for (const id of allFormationIds) {
      expect(document.querySelector(`[data-testid="map-formation-${id}"]`), `bricka för ${id} saknas`).toBeTruthy()
    }
  })

  it('rvn:s förband (känd station i Saigon) renderas MED heltäckt ram, inget "unknown"-tecken', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-known-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const token = document.querySelector('[data-testid="map-formation-rvn-1st-infantry"]')!
    expect(token).toBeTruthy()
    expect(token.querySelector('.map-token-frame.is-unknown')).toBeNull()
    expect(token.querySelector('.map-token-unknown-mark')).toBeNull()
  })

  it('förband utan aktiv station (nlf/laos — bara Saigon/rvn har en station vid partistart) renderas streckat och namnlöst (P77 klart-när, ordagrant)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-unknown-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    for (const id of ['nlf-9th-division', 'laos-1st-infantry']) {
      const token = document.querySelector(`[data-testid="map-formation-${id}"]`)!
      expect(token, `bricka för ${id} saknas`).toBeTruthy()
      // "Streckat": frame har is-unknown-klassen (stroke-dasharray i CSS).
      expect(token.querySelector('.map-token-frame.is-unknown'), `${id} inte streckad`).toBeTruthy()
      // "Frågetecken": det streckade doktrinstecknet ersätts av en
      // frågetecken-bana (SVG-form, inte text — se TheatreMap.tsx:s
      // kommentar om regel 18:s scrollWidth-kvirk).
      expect(token.querySelector('.map-token-unknown-mark')).toBeTruthy()
      // "Inget namn": ingen etikett alls renderas för ett okänt förband,
      // oavsett zoomnivå — display.known styr texten INNAN zoomnivå-grinden
      // ens frågas (se map-formation-labels-blocket).
      expect(document.querySelector(`[data-testid="map-formation-label-${id}"]`)).toBeNull()
    }
  })

  it('förbandsnamn visas inte förrän zoomnivå 3 (§6.9) — vid standardzoomen (nivå 2, k=1) syns bara brickan', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-zoomgate-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="theatre-map-svg"]')?.getAttribute('data-zoom-level')).toBe('2')
    expect(document.querySelector('[data-testid="map-formation-rvn-1st-infantry"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-formation-label-rvn-1st-infantry"]')).toBeNull()
  })
})

describe('TheatreMap (P77) — underrättelsedimma', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('Laos (ingen aktiv station vid partistart) ritas med dimma, Sydvietnam (Saigon-stationen) inte', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-fog-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-fog-laos"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-fog-south-vietnam"]')).toBeNull()
  })

  it('sektorkontrollen förblir synlig även i ett dimmat land (deriveSectorControl grindas aldrig av dimma)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-fog-control-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    // plain-of-jars ligger i det dimmade Laos, men sektorfärgen ska ändå
    // visa en riktig sida (a/b/contested/empty), inte en gated "unknown".
    const el = document.querySelector('[data-testid="map-sector-plain-of-jars"]')!
    expect(el.getAttribute('class')).toMatch(/is-(a|b|contested|empty)/)
  })
})

describe('TheatreMap (P77) — heat-glöd', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('ritar en heat-glöd per teater', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-heat-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    for (const theatreId of Object.keys(state.theatres)) {
      expect(document.querySelector(`[data-testid="map-heat-glow-${theatreId}"]`), `heat-glöd för ${theatreId} saknas`).toBeTruthy()
    }
  })

  it('en teater med hög heat får is-hot-klassen (DISPLAY_THRESHOLDS.heatEscalation)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-hot-seed')
    state.theatres['indochina']!.heat = 90 // över heatEscalationThreshold (85)
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const el = document.querySelector('[data-testid="map-heat-glow-indochina"]')!
    expect(el.getAttribute('class')).toContain('is-hot')
  })
})
