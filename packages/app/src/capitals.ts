// capitals — P79 (ETAPP7_TEKNISK_SPEC.md §6.3 lager 8, §13): huvudstadsmarkörer
// på kartan, ett tapp-mål in i landets bottenark (CountryFile.tsx) utöver att
// trycka på själva landmassan. Riktiga geografiska koordinater (samma sorts
// "verkligt, inte påhittat tal" som SECTOR_REGIONS/build-geo.mjs redan
// använder för sina ankare) — inte balansdata, så CLAUDE.md hård regel 5
// gäller inte här. Bara de två länder som kan ha en spelbar station i det
// här scenariot (samma TheatreMap.tsx:s COUNTRY_TO_FACTION-lista) — NLF har
// inget eget territorium på kartan (dess sektorer delar Sydvietnams
// landmassa med RVN, se TheatreMap.tsx:s egen COUNTRY_TO_FACTION-kommentar),
// så NLF nås inte via huvudstadsmarkörer eller landklick än. Dokumenterat,
// inte tyst byggt runt — se docs/ANDRINGSLOGG.md.
import type { FactionId } from '@seventh-front/core'

export interface Capital {
  factionId: FactionId
  name: string
  anchor: [number, number] // [lat, lng]
}

export const CAPITALS: Capital[] = [
  { factionId: 'rvn', name: 'SAIGON', anchor: [10.82, 106.63] },
  { factionId: 'laos', name: 'VIENTIANE', anchor: [17.97, 102.6] },
]
