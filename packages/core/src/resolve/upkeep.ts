// upkeep — tidsstyrda husförändringar, ej en direkt effekt av en PlayerAction.
// Utbruten ur applyActions.ts i P23 (ETAPP2_TEKNISK_SPEC.md avsnitt 7) —
// oförändrad logik, bara flyttad. Se ANDRINGSLOGG.md.
import balanceData from '../data/balance.json' with { type: 'json' }
import { standingStationMode } from '../standingOrders.js'
import type { ResolveContext } from './index.js'
import { revealFlaw, rollDesign } from '../design.js'
import { closeRedesignInvestigations } from '../investigations.js'
import type { Rng } from '../rng.js'
import type { House, RndProject, Station, WireEvent } from '../types.js'

type Emit = (e: Omit<WireEvent, 'id' | 'turn'>) => string

interface Balance {
  testingTurnsPerStep: number
  intelDormantExposureDecay: number
  exposureBurnThreshold: number
  stationBurnChancePct: number
  stationActiveExposurePerTurn: number
  stationQuietExposureDecay: number
  stationActiveDepthTurns: number
}
const BALANCE = balanceData as unknown as Balance

// R&D-kön löper vidare även en tur utan en ny REPRIORITISE_RND — det här är inte en
// spelarhandling, det är tidens gång för ett redan pågående projekt. Ingen annan
// plats i pipelinen äger house.rnd (avsnitt 8.2: "Vid färdigställande: techLevel
// [category] += 1"), och pipelineordningen är fryst (CLAUDE.md hård regel 7) — hör
// därför hemma här, där kön faktiskt skrivs, precis innan turens NYA handlingar
// (som kan lägga till ett projekt som inte ska hinna en tur på samma passage).
// P109: ett designprojekt som blir klart drar sitt utfall ur `designCtx.rng` (ctx.rng, hård regel 2). Utan ett sådant
// sammanhang (ett anrop som bara avancerar teknikprojekt) får ett färdigt designprojekt vänta en tur.
export interface DesignCompletionContext {
  rng: Rng
  turn: number
  year: number
}

export function advanceRndQueue(
  house: Pick<House, 'rnd' | 'techLevel' | 'staff' | 'name'> & Partial<Pick<House, 'researchHeadStart' | 'designs'>>,
  emit: Emit,
  designCtx?: DesignCompletionContext,
): void {
  const stillRunning: RndProject[] = []
  for (const project of house.rnd) {
    project.turnsRemaining -= 1
    // P107 (ETAPP9 §4.4): erfarenhet ur leveranser in i krigsfronter. Ett pågående projekt förbrukar HELA turer ur
    // kategorins bank (bråkdelen ligger kvar) — aldrig mer än att projektet blir klart den här turen.
    const banked = house.researchHeadStart?.[project.category] ?? 0
    const used = Math.min(Math.floor(banked), project.turnsRemaining)
    if (used > 0 && house.researchHeadStart) {
      project.turnsRemaining -= used
      house.researchHeadStart[project.category] = banked - used
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `FIELD EXPERIENCE SAVES ${used} TURN${used === 1 ? '' : 'S'} ON ${project.category.toUpperCase()} R&D`,
        causeId: null,
        delta: { [`researchHeadStart.${project.category}`]: -used },
        actorIsPlayer: true,
        subjectId: null,
      })
    }
    if (project.turnsRemaining > 0) {
      stillRunning.push(project)
      continue
    }
    if (project.design) {
      if (!designCtx) {
        project.turnsRemaining = 1
        stillRunning.push(project)
        continue
      }
      const designs = (house.designs ??= [])
      const design = rollDesign(designCtx.rng, house as House, {
        category: project.category,
        focus: project.design.focus,
        ambition: project.design.ambition,
        upgradeOf: project.design.upgradeOf,
        redesignOf: project.design.redesignOf ?? null,
        targetGeneration: project.design.targetGeneration,
        turn: designCtx.turn,
        year: designCtx.year,
      })
      designs.push(design)
      // P113: en omkonstruktion avslutar utredningen som åtgärdad (den gamla konstruktionen förblir tillbakadragen).
      if (project.design.redesignOf) closeRedesignInvestigations(house as House, project.design.redesignOf)
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `DESIGN COMPLETE: ${design.name.toUpperCase()} (GENERATION ${design.generation}) — QUALITY NOT YET TESTED`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
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

// P110 (ETAPP9 §5.3): provning i egen regi. Varje tur en provning gäller: osäkerheten smalnar av ett klasssteg var
// testingTurnsPerStep:e tur, miljön noteras, och bristen avslöjas bara om provningen görs i bristens miljö. Provningen
// slutar av sig själv när osäkerheten är noll och bristen (om någon) provats i sin miljö. Anropas först i applyActions,
// före turens nya stående order, så en provning som sätts denna tur börjar gälla nästa.
export function advanceDesignTesting(house: Pick<House, 'designs' | 'standingOrders' | 'name'>, turn: number, emit: Emit): void {
  const testing = house.standingOrders?.testing
  if (!testing) return
  for (const [designId, test] of Object.entries(testing)) {
    if (turn < test.sinceTurn) continue
    const design = house.designs?.find((d) => d.id === designId)
    if (!design || design.status !== 'active') {
      delete testing[designId]
      continue
    }
    test.turnsRun += 1
    if (!design.testedIn.includes(test.environment)) design.testedIn.push(test.environment)

    if (design.latentFlaw && design.latentFlaw.environment === test.environment && revealFlaw(design)) {
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `TESTING IN ${test.environment.toUpperCase()} CONDITIONS REVEALS A FLAW IN ${design.name.toUpperCase()}`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
    }
    if (test.turnsRun % BALANCE.testingTurnsPerStep === 0 && design.uncertainty > 0) design.uncertainty -= 1
    if (design.uncertainty === 0) {
      delete testing[designId]
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `TESTING OF ${design.name.toUpperCase()} COMPLETE — ITS QUALITY CLASS IS NOW KNOWN`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
    }
  }
}

// Samma princip som advanceRndQueue: stationers exponering rör sig med TIDEN
// (avkallning för en vilande station, en risk att brännas ovanför tröskeln), inte
// bara som en direkt effekt av en ny INTEL-handling. DESIGN.md §9, ordagrant: "−5
// per vilande tur. Vid exposure > 80 rullas varje tur mot avslöjande."
//
// P29 (ETAPP2_TEKNISK_SPEC.md avsnitt 4.2): en station som överlever rullningen
// men fortfarande ligger över tröskeln varnas i wire, VARJE sådan tur — inte
// bara en engångsnotis vid första gången den korsar tröskeln (ingen ny "redan
// varnad"-flagga på Station för det, och risken är verkligen återkommande så
// länge exponeringen ligger kvar däruppe). "Ett slutvillkor spelaren inte ser
// komma är inte ett beslut" (avsnitt 4.2, ordagrant).
export function advanceStations(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house

  for (const station of house.stations) {
    applyStationMode(ctx, station)

    if (station.status === 'dormant') {
      station.exposure = Math.max(0, station.exposure - BALANCE.intelDormantExposureDecay)
    }

    if (station.status === 'burned' || station.exposure <= BALANCE.exposureBurnThreshold) continue

    if (rng.chance(BALANCE.stationBurnChancePct)) {
      station.status = 'burned'
      house.exposureEvents.push(draft.meta.turn)
      const burnId = emit({
        severity: 'headline',
        scope: 'house',
        headline: `STATION ${station.city.toUpperCase()} BURNED — EXPOSURE ${station.exposure.toFixed(0)}`,
        causeId: null,
        delta: { exposure: 0 },
        actorIsPlayer: false,
        subjectId: station.nation,
      })
      // P102 (beslut 8E): "under utredning" — en bränd station öppnar en utredning; nästa kvartal har huset
      // en handling färre (economy.ts drar investigationActionPointPenalty). Ett mellansteg före EXPOSURE-slutet.
      house.investigationUntilTurn = draft.meta.turn + 1
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `INVESTIGATION OPENED INTO ${station.city.toUpperCase()} — ONE FEWER EXECUTIVE ACTION NEXT QUARTER`,
        causeId: burnId,
        delta: { investigationUntilTurn: draft.meta.turn + 1 },
        actorIsPlayer: false,
        subjectId: station.nation,
      })
      continue
    }

    emit({
      severity: 'report',
      scope: 'house',
      headline: `STATION ${station.city.toUpperCase()} UNDER SURVEILLANCE — EXPOSURE ${station.exposure.toFixed(0)}`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: station.nation,
    })
  }
}

// P100 (ETAPP8_FORSLAG.md §5.1): stationsläget. Bara en station med status 'active' har ett läge — en
// vilande sköter dormancy-regeln ovan, en bränd är slut. Aktiv bygger exponering varje tur och växer ett
// djupsteg var stationActiveDepthTurns:e tur; tyst sänker exponeringen och växer inte; normal rör ingenting
// (då styr bara INTEL-handlingarna, som förut). En station på aktiv vars exponering passerar
// exposureBurnThreshold ger ett larm med causeId = exponeringshändelsen (DESIGN.md §4, ordagrant).
function applyStationMode(ctx: ResolveContext, station: Station): void {
  const { draft, emit } = ctx
  if (station.status !== 'active') return
  const mode = standingStationMode(draft.house, station.id, draft.meta.turn)
  if (mode === 'normal') return
  const order = draft.house.standingOrders.stations[station.id]!

  const exposureBefore = station.exposure
  const depthBefore = station.depth

  if (mode === 'active') {
    station.exposure = Math.min(100, exposureBefore + BALANCE.stationActiveExposurePerTurn)
    order.activeTurns += 1
    if (order.activeTurns >= BALANCE.stationActiveDepthTurns) {
      station.depth = Math.min(5, station.depth + 1) as Station['depth']
      order.activeTurns = 0
    }
  } else {
    if (exposureBefore <= 0) return
    station.exposure = Math.max(0, exposureBefore - BALANCE.stationQuietExposureDecay)
  }

  const riseId = emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STATION ${station.city.toUpperCase()} (${mode.toUpperCase()}): EXPOSURE ${exposureBefore.toFixed(0)} → ${station.exposure.toFixed(0)}${
      station.depth !== depthBefore ? `, DEPTH ${depthBefore} → ${station.depth}` : ''
    }`,
    causeId: null,
    delta: { exposure: station.exposure - exposureBefore, ...(station.depth !== depthBefore ? { depth: station.depth - depthBefore } : {}) },
    actorIsPlayer: true,
    subjectId: station.nation,
  })

  if (mode === 'active' && exposureBefore <= BALANCE.exposureBurnThreshold && station.exposure > BALANCE.exposureBurnThreshold) {
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `STATION ${station.city.toUpperCase()} ON ACTIVE DUTY PASSES THE BURN THRESHOLD — EXPOSURE ${station.exposure.toFixed(0)}`,
      causeId: riseId,
      delta: {},
      actorIsPlayer: false,
      subjectId: station.nation,
    })
  }
}
