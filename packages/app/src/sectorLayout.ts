// sectorLayout — ren presentationsdata (godtyckliga skärmkoordinater) för
// SectorBoard.tsx (P66, ETAPP6_TEKNISK_SPEC.md §4.2). Hör hemma i appen, inte
// i den UI-okunniga kärnan (CLAUDE.md hård regel 1).
//
// P66 fyller bara `indochina` (front-1) — `laos` (front-laos) tillkommer i
// P67, som ska bevisa att SectorBoard/deriveSectorControl generaliserar över
// fler än en theatre UTAN hårdkodning (§4.6). Ett theatreId som SAKNAS här
// faller tillbaka på den gamla textlistan (skyddsräcke 4, se TheWorld.tsx) —
// front-laos använder den vägen fram till P67, inte en bugg.
export interface SectorLayoutEntry {
  sectorId: string
  label: string // t.ex. "HUE" — visningsnamn, versaler, samma register som resten av UI:t
  x: number // 0–100, procent av tavlans bredd
  y: number // 0–100, procent av tavlans höjd
  neighbours: string[] // andra sectorId i SAMMA theatre — ritar en linje mellan noder
}

export const SECTOR_LAYOUTS: Record<string, SectorLayoutEntry[]> = {
  indochina: [
    { sectorId: 'hue', label: 'HUE', x: 70, y: 15, neighbours: ['da-nang'] },
    { sectorId: 'da-nang', label: 'DA NANG', x: 65, y: 40, neighbours: ['hue', 'an-loc'] },
    { sectorId: 'an-loc', label: 'AN LOC', x: 45, y: 65, neighbours: ['da-nang', 'cu-chi'] },
    { sectorId: 'cu-chi', label: 'CU CHI', x: 40, y: 85, neighbours: ['an-loc'] },
  ],
}
