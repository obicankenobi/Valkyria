#!/usr/bin/env node
// build-geo.mjs — P76 (ETAPP7_TEKNISK_SPEC.md §6.1): "Källa: Natural Earth
// 1:50m (public domain), beskuren till Indokina med Thailand och södra Kina
// som sammanhang. Nord- och Sydvietnam skilda av den demilitariserade zonen
// längs 17:e breddgraden, tillagd för hand. Ett byggskript konverterar till
// TopoJSON och checkas in. Ingen nätverkstrafik vid körning."
//
// Körs en gång vid utveckling (inte i CI, inte vid `vite dev`/`vite build`),
// samma mönster som scripts/build-geo.mjs:s egna syskon shots.mjs — ett
// fristående devskript. Källan är `world-atlas`s `countries-50m.json`, som
// ÄR Natural Earth 1:50m admin-0-gränser, redan TopoJSON-kodade (npm-paket,
// ingen nätverkstrafik vid KÖRNING av spelet — bara vid detta byggskripts
// egen körning, exakt så som README-mönstret för world-atlas är avsett).
//
// Pipeline: TopoJSON → GeoJSON (topojson-client), filtrera till de fem
// länderna, klipp till en bounding box runt Indokina (@turf/bbox-clip — det
// enda sättet att ge "södra Kina" utan hela landets nordöstra bulk), dela
// Vietnam i två separata features vid 17°N (samma bbox-clip-teknik, "tillagd
// för hand" enligt specen — Natural Earth har ingen 1964-gräns), bygg om till
// en delad topologi (topojson-server — dedupar gemensamma landgränser SÅ att
// Vietnams nord/syd-delning och grannländernas gränser matchar exakt), och
// förenkla (topojson-simplify) tills filen ligger under 300 kB (§12 punkt 5).
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import * as topojsonClient from 'topojson-client'
import * as topojsonServer from 'topojson-server'
import * as topojsonSimplify from 'topojson-simplify'
import bboxClip from '@turf/bbox-clip'
import worldAtlas from 'world-atlas/countries-50m.json' with { type: 'json' }

const OUT_DIR = fileURLToPath(new URL('../public/geo', import.meta.url))
const OUT_PATH = join(OUT_DIR, 'indochina.topo.json')
const SIZE_BUDGET_BYTES = 300 * 1024

// Natural Earth admin-0 ISO 3166-1 numeriska koder (world-atlas:s `id`).
const COUNTRY_IDS = {
  vietnam: '704',
  laos: '418',
  china: '156',
  thailand: '764',
  cambodia: '116',
}

// Indokina-regionen plus "sammanhang" (Thailand, södra Kina) — [minLng, minLat, maxLng, maxLat].
const REGION_BBOX = [95, 8, 110, 23]
// 17:e breddgraden — den historiska DMZ:n mellan Nord- och Sydvietnam 1964.
const DMZ_LAT = 17

function toFeatureCollection(topology, objectKey) {
  return topojsonClient.feature(topology, topology.objects[objectKey])
}

function findCountry(featureCollection, id) {
  const feature = featureCollection.features.find((f) => String(f.id) === id)
  if (!feature) throw new Error(`Land med id ${id} hittades inte i world-atlas`)
  return feature
}

function clipToBbox(feature, bbox) {
  // @turf/bbox-clip kräver Polygon/MultiPolygon — world-atlas ger alltid en
  // av de två för ett land.
  return bboxClip(feature, bbox)
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const countries = toFeatureCollection(worldAtlas, 'countries')

  const vietnam = findCountry(countries, COUNTRY_IDS.vietnam)
  const laos = findCountry(countries, COUNTRY_IDS.laos)
  const china = findCountry(countries, COUNTRY_IDS.china)
  const thailand = findCountry(countries, COUNTRY_IDS.thailand)
  const cambodia = findCountry(countries, COUNTRY_IDS.cambodia)

  // Vietnam delat vid DMZ_LAT — "tillagd för hand" (§6.1), Natural Earth har
  // ingen 1964-gräns att läsa. Två separata bbox-klipp av SAMMA polygon.
  const northVietnam = clipToBbox(vietnam, [REGION_BBOX[0], DMZ_LAT, REGION_BBOX[2], REGION_BBOX[3]])
  const southVietnam = clipToBbox(vietnam, [REGION_BBOX[0], REGION_BBOX[1], REGION_BBOX[2], DMZ_LAT])
  northVietnam.id = 'north-vietnam'
  northVietnam.properties = { name: 'North Vietnam' }
  southVietnam.id = 'south-vietnam'
  southVietnam.properties = { name: 'South Vietnam' }

  const clippedChina = clipToBbox(china, REGION_BBOX)
  clippedChina.id = 'china'
  clippedChina.properties = { name: 'China' }
  const clippedThailand = clipToBbox(thailand, REGION_BBOX)
  clippedThailand.id = 'thailand'
  clippedThailand.properties = { name: 'Thailand' }
  const clippedLaos = clipToBbox(laos, REGION_BBOX)
  clippedLaos.id = 'laos'
  clippedLaos.properties = { name: 'Laos' }
  const clippedCambodia = clipToBbox(cambodia, REGION_BBOX)
  clippedCambodia.id = 'cambodia'
  clippedCambodia.properties = { name: 'Cambodia' }

  // DMZ:n som en egen linje (inte bara Vietnam-delningens gräns) — en
  // synlig, avsiktlig markering, samma bredd som Vietnams del av boxen.
  const dmzLine = {
    type: 'Feature',
    id: 'dmz',
    properties: { name: 'Demilitarized Zone (17th parallel)' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [REGION_BBOX[0] + 3, DMZ_LAT],
        [REGION_BBOX[2] - 3, DMZ_LAT],
      ],
    },
  }

  const regionCountries = {
    type: 'FeatureCollection',
    features: [northVietnam, southVietnam, clippedLaos, clippedCambodia, clippedThailand, clippedChina],
  }

  // topojson-server delar gemensamma bågar mellan features i SAMMA anrop —
  // därför byggs countries och dmz som två skilda objekt i en och samma
  // topology() (en delad arc-pool, inte två frikopplade filer).
  let topology = topojsonServer.topology({
    countries: regionCountries,
    dmz: { type: 'FeatureCollection', features: [dmzLine] },
  })

  // Förenkla tills filen ligger under budgeten. presimplify en gång,
  // simplify med stigande tröskel tills storleken räcker.
  topology = topojsonSimplify.presimplify(topology)
  let minWeight = 0
  let json = JSON.stringify(topology)
  while (Buffer.byteLength(json) > SIZE_BUDGET_BYTES) {
    minWeight = minWeight === 0 ? 1e-10 : minWeight * 4
    const simplified = topojsonSimplify.simplify(topology, minWeight)
    json = JSON.stringify(simplified)
    if (minWeight > 1) {
      throw new Error('Kunde inte förenkla under storleksbudgeten utan att tappa geometrin helt')
    }
  }

  writeFileSync(OUT_PATH, json)
  const sizeKb = (Buffer.byteLength(json) / 1024).toFixed(1)
  console.log(`Skrev ${OUT_PATH} (${sizeKb} kB, minWeight ${minWeight})`)
  if (Buffer.byteLength(json) > SIZE_BUDGET_BYTES) {
    throw new Error(`Filen är ${sizeKb} kB, över 300 kB-budgeten (§12 punkt 5)`)
  }
}

main()
