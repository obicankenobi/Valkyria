// mapLegend.ts — P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten P81-2/P81-3). P162: all text på engelska (S1):
// "En teckenförklaring ... förklarar varje symbol i två led: vad den är, och
// vad den betyder för spelaren." Ren data, ingen mekanik — varje entry beskriver
// en symbol som redan finns på kartan (TheatreMap.tsx), aldrig en ny en.
//
// `icon` är en liten identifierare (inte en komponent) — MapLegend.tsx väljer
// SVG-återgivningen per icon, så att glyfen i teckenförklaringen ser exakt ut
// som den gör på kartan i stället för att uppfinnas på nytt i två filer.
export type MapLegendIconKind =
  | 'sector-a'
  | 'sector-b'
  | 'sector-contested'
  | 'sector-empty'
  | 'route'
  | 'frontline'
  | 'heat'
  | 'capital'
  | 'capital-orders'
  | 'formation-known'
  | 'formation-unknown'
  | 'formation-mauled'
  | 'fog'
  | 'dmz'
  | 'supply-line-player'
  | 'supply-line-rival'
  | 'station'

export interface MapLegendEntry {
  id: string
  icon: MapLegendIconKind
  title: string
  whatItIs: string
  whatItMeans: string
}

// Ordningen är den spelaren möter symbolerna i, understa lagret (mark) först,
// översta (markeringar) sist — samma lagerordning som §6.3.
export const MAP_LEGEND: readonly MapLegendEntry[] = [
  {
    id: 'sector-a',
    icon: 'sector-a',
    title: 'Sector you control',
    whatItIs: "A sector's colour fill, decided by which side has the most strength in it.",
    whatItMeans: "Your side's forces hold this ground. Deliveries and orders in this area go more easily.",
  },
  {
    id: 'sector-b',
    icon: 'sector-b',
    title: 'Sector the opposition controls',
    whatItIs: 'The same colour fill as above, but for the opposing side.',
    whatItMeans: 'Hostile-held ground: the opposition has more strength in this sector than you do.',
  },
  {
    id: 'sector-contested',
    icon: 'sector-contested',
    title: 'Contested sector',
    whatItIs: 'Neither side has the upper hand in the sector right now.',
    whatItMeans: 'It can tip either way next quarter.',
  },
  {
    id: 'sector-empty',
    icon: 'sector-empty',
    title: 'Empty sector',
    whatItIs: 'No formations in the sector right now.',
    whatItMeans: 'Neither you nor the opposition has forces here.',
  },
  {
    id: 'route',
    icon: 'route',
    title: 'Transport route',
    whatItIs: 'A dashed line through the hills, coloured by who holds it, with its name and holder printed on it. The Ho Chi Minh Trail in eastern Laos is one.',
    whatItMeans: 'A route is a corridor for troops and supplies, not ground to hold. Its colour shows which side is strongest along it, and the label on the line names the holder.',
  },
  {
    id: 'fog',
    icon: 'fog',
    title: 'Intelligence fog',
    whatItIs: 'A diagonal hatch pattern over a country.',
    whatItMeans: 'You have no intelligence depth there (no station, or one still at depth 0), so formation strength shows as unknown.',
  },
  {
    id: 'dmz',
    icon: 'dmz',
    title: 'Demarcation line',
    whatItIs: 'The dashed black line at the 17th parallel.',
    whatItMeans: 'The border between North and South Vietnam. Pure geography, nothing to tap.',
  },
  {
    id: 'supply-line-player',
    icon: 'supply-line-player',
    title: 'Your supply line',
    whatItIs: 'A flowing, dashed ochre line from an entry port to a front.',
    whatItMeans: 'One of your contracts has materiel in transit there right now.',
  },
  {
    id: 'supply-line-rival',
    icon: 'supply-line-rival',
    title: "Rival's supply line",
    whatItIs: "The same flowing line, in a rival's own colour.",
    whatItMeans: 'A rival delivered materiel to that front last quarter.',
  },
  {
    id: 'frontline',
    icon: 'frontline',
    title: 'Front line',
    whatItIs: 'A bright dot with up to three fading traces behind it.',
    whatItMeans: 'The dot is where the front stands now. The traces show where it stood in the last quarters, so you can see which way it is moving.',
  },
  {
    id: 'heat',
    icon: 'heat',
    title: 'Conflict level',
    whatItIs: 'A breathing glow centred over a theatre, yellow at a low level and red as it escalates.',
    whatItMeans: 'A higher level means more demand for materiel in the theatre, but also a higher risk that the conflict escalates towards doomsday.',
  },
  {
    id: 'formation-known',
    icon: 'formation-known',
    title: 'Formation token',
    whatItIs: 'A frame (rectangle for friendly, diamond for hostile) with a doctrine symbol and dots for strength.',
    whatItMeans: 'A named formation in the sector. More dots mean a stronger formation.',
  },
  {
    id: 'formation-mauled',
    icon: 'formation-mauled',
    title: 'Mauled formation',
    whatItIs: 'A formation token with a cracked frame.',
    whatItMeans: 'The formation has taken heavy losses and needs replenishing.',
  },
  {
    id: 'formation-unknown',
    icon: 'formation-unknown',
    title: 'Unknown formation',
    whatItIs: 'A dashed frame with a question mark instead of a doctrine symbol.',
    whatItMeans: 'You have no intelligence depth in the country to identify the formation.',
  },
  {
    id: 'capital',
    icon: 'capital',
    title: 'Capital',
    whatItIs: "A circle at the country's capital.",
    whatItMeans: 'Tap to open the country file: station, officials and actions.',
  },
  {
    id: 'capital-orders',
    icon: 'capital-orders',
    title: 'Open orders',
    whatItIs: 'A small number badge beside a capital.',
    whatItMeans: 'The number of open tenders with that buyer right now. Place bids on CONTRACTS.',
  },
  {
    id: 'station',
    icon: 'station',
    title: 'Your station',
    whatItIs: 'A small square mark beside a capital, with a pulsing ring if it is heavily exposed.',
    whatItMeans: 'You have an active intelligence station in the country. The ring means exposure is high — the station risks being burned.',
  },
] as const
