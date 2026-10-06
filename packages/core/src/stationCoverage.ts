// stationCoverage — P167 (ETAPP10_FORSLAG.md §3b, S5): en stations täckning växer med dess djup. Före P167 gav ingen kod en station annat än ['procurement'], så de tre grindar som
// läser täckningen — 'cabinet' (tjänstemäns integritet och agenda, `officialDisplay`) samt 'military'/'industry' (bedömningen av blockens generation, `raceAssessment`) —
// gick aldrig att öppna. Djupen ligger i balance.json (stationCoverageDepth); upphandling täcker en station alltid.
import balanceData from './data/balance.json' with { type: 'json' }
import type { Station } from './types.js'

export type Coverage = Station['coverage'][number]

const COVERAGE_DEPTH = (balanceData as unknown as { stationCoverageDepth: Record<'military' | 'industry' | 'cabinet', number> }).stationCoverageDepth
const ORDER: readonly Exclude<Coverage, 'procurement'>[] = ['military', 'industry', 'cabinet']

export function coverageForDepth(depth: number): Coverage[] {
  return ['procurement', ...ORDER.filter((c) => depth >= COVERAGE_DEPTH[c])]
}

// Täckningen en station har efter ett djupsteg: den den redan hade (scenariot kan ha gett mer) plus det djupet nu ger. Täckningen krymper aldrig.
export function grownCoverage(station: Pick<Station, 'coverage' | 'depth'>): { coverage: Coverage[]; gained: Coverage[] } {
  const coverage = [...new Set<Coverage>([...station.coverage, ...coverageForDepth(station.depth)])]
  return { coverage, gained: coverage.filter((c) => !station.coverage.includes(c)) }
}
