// sectorLayout — ren presentationsdata (godtyckliga skärmkoordinater) för
// SectorBoard.tsx (P66, ETAPP6_TEKNISK_SPEC.md §4.2). Hör hemma i appen, inte
// i den UI-okunniga kärnan (CLAUDE.md hård regel 1).
//
// P66 fyllde bara `indochina` (front-1). P67 (§4.6, "bevisar att layouten och
// komponenten generaliserar över fler än en theatre utan hårdkodning av
// frontantal") lägger till `laos` (front-laos) utan att röra en enda rad i
// SectorBoard.tsx eller queries.ts:s deriveSectorControl — bara den här nya
// dataposten. Ett theatreId som SAKNAS här faller tillbaka på den gamla
// textlistan (skyddsräcke 4, se TheWorld.tsx) — inget theatreId saknas längre
// i den enda scenario som finns i dag, men mekanismen kvarstår för ett
// framtida scenario som ännu inte har en post.
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
  laos: [
    { sectorId: 'plain-of-jars', label: 'PLAIN OF JARS', x: 30, y: 30, neighbours: ['ho-chi-minh-trail'] },
    { sectorId: 'ho-chi-minh-trail', label: 'HO CHI MINH TRAIL', x: 50, y: 70, neighbours: ['plain-of-jars'] },
  ],
}
