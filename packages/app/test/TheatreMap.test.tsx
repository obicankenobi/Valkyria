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
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createInitialState, DISPLAY_THRESHOLDS } from '@seventh-front/core'
import { TheatreMap, capitalLabel, supplyDotStyle } from '../src/components/TheatreMap.js'

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

describe('TheatreMap (P79) — landval och huvudstadsmarkörer', () => {
  it('att trycka på en mappad landmassa anropar onSelectCountry med rätt FactionId', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-select-seed')
    const onSelectCountry = vi.fn()
    render(<TheatreMap state={state} onSelectCountry={onSelectCountry} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    fireEvent.click(document.querySelector('[data-testid="map-country-south-vietnam"]')!)
    expect(onSelectCountry).toHaveBeenCalledWith('rvn')

    fireEvent.click(document.querySelector('[data-testid="map-country-laos"]')!)
    expect(onSelectCountry).toHaveBeenCalledWith('laos')
  })

  it('ett osammanhangslöst land (t.ex. Thailand) saknar is-selectable-klassen och onClick', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-select-seed')
    render(<TheatreMap state={state} onSelectCountry={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const thailand = document.querySelector('[data-testid="map-country-thailand"]')
    expect(thailand).toBeTruthy()
    expect(thailand!.getAttribute('class')).not.toContain('is-selectable')
  })

  it('huvudstadsmarkörer finns för båda huvudstäderna och kan väljas', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-capital-seed')
    const onSelectCountry = vi.fn()
    render(<TheatreMap state={state} onSelectCountry={onSelectCountry} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-capital-rvn"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-capital-laos"]')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-testid="map-capital-rvn"] .map-capital-marker')!)
    expect(onSelectCountry).toHaveBeenCalledWith('rvn')
  })

  // P94 (tillgänglighet): markören var kartflödets huvudingång men inte
  // fokuserbar eller tillgänglig för tangentbord/skärmläsare.
  it('huvudstadsmarkören är en tangentbordsbar knapp med namn och valt-läge', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-capital-a11y-seed')
    const onSelectCountry = vi.fn()
    render(<TheatreMap state={state} onSelectCountry={onSelectCountry} selectedFactionId="rvn" />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const rvn = document.querySelector('[data-testid="map-capital-rvn"] .map-capital-marker')!
    expect(rvn.getAttribute('role')).toBe('button')
    expect(rvn.getAttribute('tabindex')).toBe('0')
    expect(rvn.getAttribute('aria-label')).toMatch(/\w/)
    expect(rvn.getAttribute('aria-pressed')).toBe('true')
    const laos = document.querySelector('[data-testid="map-capital-laos"] .map-capital-marker')!
    expect(laos.getAttribute('aria-pressed')).toBe('false')

    fireEvent.keyDown(laos, { key: 'Enter' })
    expect(onSelectCountry).toHaveBeenLastCalledWith('laos')
    fireEvent.keyDown(rvn, { key: ' ' })
    expect(onSelectCountry).toHaveBeenLastCalledWith('rvn')
    fireEvent.keyDown(laos, { key: 'a' })
    expect(onSelectCountry).toHaveBeenCalledTimes(2)
  })

  it('utan onSelectCountry (t.ex. Briefing) är markören inte en falsk knapp', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-capital-passive-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const rvn = document.querySelector('[data-testid="map-capital-rvn"] .map-capital-marker')!
    expect(rvn.getAttribute('role')).toBeNull()
    expect(rvn.getAttribute('tabindex')).toBeNull()
  })

  it('capitalLabel nämner öppna ordrar i singular och plural, annars bara namnet', () => {
    expect(capitalLabel('Saigon', 0)).toBe('Saigon')
    expect(capitalLabel('Saigon', 1)).toBe('Saigon, 1 open order')
    expect(capitalLabel('Saigon', 3)).toBe('Saigon, 3 open orders')
  })

  it('valt land ritar en kontur (§6.3 lager 10), oval land inte', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-selected-seed')
    render(<TheatreMap state={state} selectedFactionId="rvn" />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-country-selected-south-vietnam"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-country-selected-laos"]')).toBeNull()
  })

  it('en huvudstad med öppna ordrar visar en räknarbadge, utan inga ordrar visas ingen', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-orders-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    // indochina-slice har inga öppna ordrar vid tur 0 (orders.ts genererar
    // dem senare) — badgen ska alltså inte finnas för någon huvudstad än.
    expect(document.querySelector('[data-testid="map-capital-orders-rvn"]')).toBeNull()

    state.market.openOrders.push({
      id: 'order-test',
      buyerId: 'rvn',
      productId: 'm1_rifle',
      quantity: 10,
      statedBudget: 1000,
      trueBudget: 1000,
      referencePrice: 1000,
      requiredDeliveryTurns: 4,
      expiresTurn: 4,
      competingRivals: [],
      weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
      officialId: 'official-rvn-procurement',
      reason: { kind: 'SCRIPTED' },
      frontId: null,
    })
    cleanup()
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())
    expect(document.querySelector('[data-testid="map-capital-orders-rvn"]')!.textContent).toBe('1')
  })
})

// P82 (ETAPP7_TEKNISK_SPEC.md §13, §6.3 lager 8): stationsmarkören.
describe('TheatreMap (P82) — stationsmarkören', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('en aktiv station vid en huvudstad visar en badge, utan station visas ingen', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-station-seed')
    // indochina-slice.json seedar en aktiv station i RVN (Saigon), ingen i Laos.
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-capital-station-rvn"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="map-capital-station-laos"]')).toBeNull()
  })

  it('exponering under gränsen visar ingen puls-ring, över den gör det', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-station-exposure-seed')
    const station = state.house.stations.find((s) => s.nation === 'rvn')!
    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold - 1
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())
    expect(document.querySelector('[data-testid="map-capital-station-rvn"] .map-station-exposure-ring')).toBeNull()

    cleanup()
    station.exposure = DISPLAY_THRESHOLDS.exposureBurnThreshold
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())
    expect(document.querySelector('[data-testid="map-capital-station-rvn"] .map-station-exposure-ring')).toBeTruthy()
  })

  it('en burnad (icke-aktiv) station visas inte som markör', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-station-burned-seed')
    const station = state.house.stations.find((s) => s.nation === 'rvn')!
    station.status = 'burned'
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-capital-station-rvn"]')).toBeNull()
  })
})

// P82 (ETAPP7_TEKNISK_SPEC.md §13, §6.3 lager 6): försörjningslinjer.
describe('TheatreMap (P82) — försörjningslinjer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('en försändelse under transport till en front ritar spelarens försörjningslinje', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-supply-seed')
    state.market.contracts.push({
      id: 'c1',
      buyerId: 'rvn',
      productId: 'm1_rifle',
      quantity: 10,
      unitsDelivered: 0,
      price: 1000,
      unitCostAtSigning: 500,
      grade: 'B',
      dueTurn: 5,
      status: 'active',
      lateEventId: null,
      frontId: 'front-1',
    })
    state.market.shipments.push({ id: 's1', contractId: 'c1', units: 5, arrivalTurn: 3 })

    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const line = document.querySelector('[data-testid="map-supply-line-player-front-1"]')
    expect(line).toBeTruthy()
    expect(line!.classList.contains('is-player')).toBe(true)

    // P94 (§12 punkt 5): flödet är en prick med transform, inte ett animerat
    // streck — pricken följer linjen från avsändaren (x1,y1) och bär vektorn
    // till målet (x2,y2).
    const dot = document.querySelector('[data-testid="map-supply-dot-player-front-1"]') as SVGCircleElement
    expect(dot).toBeTruthy()
    expect(dot.classList.contains('is-player')).toBe(true)
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(Number(line!.getAttribute('x1')))
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(Number(line!.getAttribute('y1')))
    const dx = Number(line!.getAttribute('x2')) - Number(line!.getAttribute('x1'))
    const dy = Number(line!.getAttribute('y2')) - Number(line!.getAttribute('y1'))
    expect(dot.style.getPropertyValue('--dx')).toBe(`${dx}px`)
    expect(dot.style.getPropertyValue('--dy')).toBe(`${dy}px`)
  })

  it('supplyDotStyle: färdtiden är ungefär proportionell mot sträckan men klampad till 1,6–4 s', () => {
    expect(supplyDotStyle(1, 1).animationDuration).toBe('1.6s')
    expect(supplyDotStyle(90, 0).animationDuration).toBe('2s')
    expect(supplyDotStyle(0, 5000).animationDuration).toBe('4s')
  })

  it('utan aktiva försändelser eller rivalleveranser ritas ingen försörjningslinje', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-supply-empty-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('.map-supply-line')).toBeNull()
  })
})

// P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten): teckenförklaringen.
// "Ett tryck på en symbol utan egna verb (heat-glöd, frontlinje,
// förbandsbricka) öppnar samma förklaring för just den symbolen" (regel 13).
describe('TheatreMap (P81a) — teckenförklaringen', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => JSON.parse(TOPOLOGY_JSON) }) as Response),
    )
  })

  it('legend-knappen öppnar hela teckenförklaringen, ingen rad fokuserad', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    expect(document.querySelector('[data-testid="map-legend"]')).toBeNull()
    fireEvent.click(document.querySelector('[data-testid="map-legend-button"]')!)
    expect(document.querySelector('[data-testid="map-legend"]')).toBeTruthy()
    expect(document.querySelector('.map-legend-row.is-focused')).toBeNull()
  })

  it('tryck på heat-glöden öppnar teckenförklaringen fokuserad på "heat"', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-heat-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const theatreId = Object.keys(state.theatres)[0]!
    fireEvent.click(document.querySelector(`[data-testid="map-heat-glow-tap-${theatreId}"]`)!)
    expect(document.querySelector('[data-testid="map-legend-row-heat"].is-focused')).toBeTruthy()
  })

  it('tryck på frontlinjens tryckyta öppnar teckenförklaringen fokuserad på "frontline"', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-frontline-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    fireEvent.click(document.querySelector('[data-testid="map-frontline-tap-front-1"]')!)
    expect(document.querySelector('[data-testid="map-legend-row-frontline"].is-focused')).toBeTruthy()
  })

  it('tryck på ett känt förband öppnar "formation-known", ett okänt öppnar "formation-unknown"', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-formation-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    fireEvent.click(document.querySelector('[data-testid="map-formation-rvn-1st-infantry"]')!)
    expect(document.querySelector('[data-testid="map-legend-row-formation-known"].is-focused')).toBeTruthy()

    fireEvent.click(document.querySelector('[data-testid="map-legend"] .ds-sheet-close')!)
    fireEvent.click(document.querySelector('[data-testid="map-formation-laos-1st-infantry"]')!)
    expect(document.querySelector('[data-testid="map-legend-row-formation-unknown"].is-focused')).toBeTruthy()
  })

  it('tryck på ett sargat förband öppnar "formation-mauled"', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-mauled-seed')
    state.fronts['front-1']!.formations.find((f) => f.id === 'rvn-1st-infantry')!.status = 'mauled'
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    fireEvent.click(document.querySelector('[data-testid="map-formation-rvn-1st-infantry"]')!)
    expect(document.querySelector('[data-testid="map-legend-row-formation-mauled"].is-focused')).toBeTruthy()
  })

  it('tryck på en sektor öppnar rätt sector-<side>-rad, tidigare ett dött tryck (sektorfyllningen ligger ovanpå landmassan utan pointer-events: none)', async () => {
    const state = createInitialState('indochina-slice', 'theatre-map-legend-sector-seed')
    render(<TheatreMap state={state} />)
    await waitFor(() => expect(document.querySelector('[data-testid="theatre-map-svg"]')).toBeTruthy())

    const sectorEl = document.querySelector('[data-testid="map-sector-hue"]')!
    const side = sectorEl.getAttribute('class')!.match(/is-(a|b|contested|empty)/)![1]
    fireEvent.click(sectorEl)
    expect(document.querySelector(`[data-testid="map-legend-row-sector-${side}"].is-focused`)).toBeTruthy()
  })
})
