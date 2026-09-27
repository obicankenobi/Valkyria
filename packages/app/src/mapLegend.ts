// mapLegend.ts — P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten P81-2/P81-3):
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
  | 'frontline'
  | 'heat'
  | 'capital'
  | 'capital-orders'
  | 'formation-known'
  | 'formation-unknown'
  | 'formation-mauled'
  | 'fog'
  | 'dmz'

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
    title: 'Sektor du kontrollerar',
    whatItIs: 'En sektors färgfyllning, avgjord av vilken sida som har mest styrka i den.',
    whatItMeans: 'Din sidas styrkor står här. Leveranser och order i det här området går lättare.',
  },
  {
    id: 'sector-b',
    icon: 'sector-b',
    title: 'Sektor motståndaren kontrollerar',
    whatItIs: 'Samma färgfyllning som ovan, men för motståndarens sida.',
    whatItMeans: 'Fientligt kontrollerat område. Den röda, avlånga formen längs östra Laos är HO CHI MINH TRAIL — en transportkorridor, inte en pil.',
  },
  {
    id: 'sector-contested',
    icon: 'sector-contested',
    title: 'Omstridd sektor',
    whatItIs: 'Ingen sida har övertaget i sektorn just nu.',
    whatItMeans: 'Läget kan tippa åt endera hållet nästa kvartal.',
  },
  {
    id: 'sector-empty',
    icon: 'sector-empty',
    title: 'Tom sektor',
    whatItIs: 'Inga förband i sektorn just nu.',
    whatItMeans: 'Varken du eller motståndaren har styrkor här.',
  },
  {
    id: 'fog',
    icon: 'fog',
    title: 'Underrättelsedimma',
    whatItIs: 'Ett snedstreckat mönster över ett land.',
    whatItMeans: 'Du saknar en aktiv station där, så förbandsstyrka och tjänstemän visas som okända.',
  },
  {
    id: 'dmz',
    icon: 'dmz',
    title: 'Demarkationslinjen',
    whatItIs: 'Den streckade svarta linjen vid 17:e breddgraden.',
    whatItMeans: 'Gränsen mellan Nord- och Sydvietnam. Ren geografi, inget att trycka på.',
  },
  {
    id: 'frontline',
    icon: 'frontline',
    title: 'Frontlinje',
    whatItIs: 'En glödande punkt med upp till tre bleknande spår bakåt.',
    whatItMeans: 'Punkten är frontens läge just nu. Spåren visar var den låg de senaste kvartalen, så du ser vilken riktning den rör sig.',
  },
  {
    id: 'heat',
    icon: 'heat',
    title: 'Konfliktnivå',
    whatItIs: 'En andande glöd centrerad över en teater, gul vid låg nivå och röd när den eskalerar.',
    whatItMeans: 'Högre nivå betyder mer efterfrågan på materiel i teatern, men också högre risk att konflikten trappas upp mot doomsday.',
  },
  {
    id: 'formation-known',
    icon: 'formation-known',
    title: 'Förbandsbricka',
    whatItIs: 'En ram (rektangel för vänligt sinnad, romb för fientlig) med en symbol för doktrin och prickar för styrka.',
    whatItMeans: 'Ett namngivet förband i sektorn. Fler prickar betyder starkare förband.',
  },
  {
    id: 'formation-mauled',
    icon: 'formation-mauled',
    title: 'Sargat förband',
    whatItIs: 'En förbandsbricka med en sprucken ram.',
    whatItMeans: 'Förbandet har tagit svåra förluster och behöver fyllas på.',
  },
  {
    id: 'formation-unknown',
    icon: 'formation-unknown',
    title: 'Okänt förband',
    whatItIs: 'En streckad ram med ett frågetecken i stället för en doktrinsymbol.',
    whatItMeans: 'Du har ingen station med djup nog i landet för att identifiera förbandet.',
  },
  {
    id: 'capital',
    icon: 'capital',
    title: 'Huvudstad',
    whatItIs: 'En cirkel vid landets huvudstad.',
    whatItMeans: 'Tryck för att öppna landets akt: station, tjänstemän och handlingar.',
  },
  {
    id: 'capital-orders',
    icon: 'capital-orders',
    title: 'Öppna ordrar',
    whatItIs: 'En liten siffermärkning bredvid en huvudstad.',
    whatItMeans: 'Antal öppna upphandlingar hos den köparen just nu. Lägg bud på CONTRACTS.',
  },
] as const
