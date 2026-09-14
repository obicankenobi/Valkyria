// upkeep — tidsstyrda husförändringar, ej en direkt effekt av en PlayerAction.
// Utbruten ur applyActions.ts i P23 (ETAPP2_TEKNISK_SPEC.md avsnitt 7) —
// oförändrad logik, bara flyttad. Se ANDRINGSLOGG.md.
import balanceData from '../data/balance.json' with { type: 'json' }
import type { ResolveContext } from './index.js'
import type { RndProject, TechCategory, WireEvent } from '../types.js'

type Emit = (e: Omit<WireEvent, 'id' | 'turn'>) => string

interface Balance {
  intelDormantExposureDecay: number
  exposureBurnThreshold: number
  stationBurnChancePct: number
}
const BALANCE = balanceData as unknown as Balance

// R&D-kön löper vidare även en tur utan en ny REPRIORITISE_RND — det här är inte en
// spelarhandling, det är tidens gång för ett redan pågående projekt. Ingen annan
// plats i pipelinen äger house.rnd (avsnitt 8.2: "Vid färdigställande: techLevel
// [category] += 1"), och pipelineordningen är fryst (CLAUDE.md hård regel 7) — hör
// därför hemma här, där kön faktiskt skrivs, precis innan turens NYA handlingar
// (som kan lägga till ett projekt som inte ska hinna en tur på samma passage).
export function advanceRndQueue(house: { rnd: RndProject[]; techLevel: Record<TechCategory, number> }, emit: Emit): void {
  const stillRunning: RndProject[] = []
  for (const project of house.rnd) {
    project.turnsRemaining -= 1
    if (project.turnsRemaining > 0) {
      stillRunning.push(project)
      continue
    }
    house.techLevel[project.category] += 1
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `R&D PROJECT COMPLETE: ${project.category.toUpperCase()} TECH LEVEL RISES TO ${house.techLevel[project.category]}`,
      causeId: null,
      delta: { [`techLevel.${project.category}`]: 1 },
      actorIsPlayer: true,
      subjectId: null,
    })
  }
  house.rnd = stillRunning
}

// Samma princip som advanceRndQueue: stationers exponering rör sig med TIDEN
// (avkallning för en vilande station, en risk att brännas ovanför tröskeln), inte
// bara som en direkt effekt av en ny INTEL-handling. DESIGN.md §9, ordagrant: "−5
// per vilande tur. Vid exposure > 80 rullas varje tur mot avslöjande."
export function advanceStations(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house

  for (const station of house.stations) {
    if (station.status === 'dormant') {
      station.exposure = Math.max(0, station.exposure - BALANCE.intelDormantExposureDecay)
    }

    if (station.status === 'burned' || station.exposure <= BALANCE.exposureBurnThreshold) continue
    if (!rng.chance(BALANCE.stationBurnChancePct)) continue

    station.status = 'burned'
    house.exposureEvents.push(draft.meta.turn)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `STATION ${station.city.toUpperCase()} BURNED — EXPOSURE ${station.exposure.toFixed(0)}`,
      causeId: null,
      delta: { exposure: 0 },
      actorIsPlayer: false,
      subjectId: station.nation,
    })
  }
}
