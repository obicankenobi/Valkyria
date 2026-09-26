// geoMath — ren geometri för TheatreMap.tsx, P76 (ETAPP7_TEKNISK_SPEC.md
// §13). interpolateFrontGeoPosition är SAMMA algoritm som SectorBoard.tsx:s
// interpolateFrontPosition (P68) — front.position (-100..100) interpolerat
// linjärt över en theaters sektorankare I LISTORDNING — bara målet bytt från
// den gamla tavlans 0–100-skärmkoordinater till SECTOR_REGIONS riktiga
// [lat, lng]-ankare. Ren funktion, ingen rng, ingen DOM (CLAUDE.md hård
// regel 1/2 gäller `packages/core`, men samma princip hålls här av vana —
// TheatreMap.tsx projicerar resultatet, den här filen känner inte till SVG).
import type { SectorRegion } from './sectorRegions.js'

export function interpolateFrontGeoPosition(regions: SectorRegion[], position: number): [number, number] {
  const first = regions[0]
  if (!first) return [0, 0] // tom regionslista når aldrig hit i praktiken — TheatreMap renderar bara med regions.length > 0
  if (regions.length === 1) return first.anchor

  const clamped = Math.max(-100, Math.min(100, position))
  const t = (clamped + 100) / 200 // 0..1
  const segments = regions.length - 1
  const scaled = t * segments
  const index = Math.min(Math.floor(scaled), segments - 1)
  const localT = scaled - index

  const from = regions[index]!
  const to = regions[index + 1]!
  return [
    from.anchor[0] + (to.anchor[0] - from.anchor[0]) * localT,
    from.anchor[1] + (to.anchor[1] - from.anchor[1]) * localT,
  ]
}
