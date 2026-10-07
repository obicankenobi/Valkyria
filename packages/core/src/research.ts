// research — P108 (ETAPP9_FORSLAG.md §4.5, ETAPP8 skyddsräcke 6). Forskning som stående order och krasprogrammet.
// Längd och kostnad per projekt räknas på ETT ställe; applyActions, standingOrders, economy och previewAction
// anropar hit i stället för att upprepa formlerna.
//
// Forskningsspår (stående order, kostar ingen handling, gäller från nästa tur): varje kategori kan ha ett spår i
// takten låg/normal/hög. Spåret startar ett projekt när kategorin saknar ett och fortsätter av sig självt tills
// kategorin nått techLevel 10 eller spåret sägs upp. Krasprogrammet (REPRIORITISE_RND, kostar en handling):
// halverad tid, dubbel totalkostnad och inga bud i kategorin nästa kvartal.
import balanceData from './data/balance.json' with { type: 'json' }
import { enemySystemName } from './capture.js'
import { researchBlockedReason } from './knowledge.js'
import { round } from './money.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { ResolveContext } from './resolve/index.js'
import type { House, Money, ResearchPace, RndProject, TechCategory } from './types.js'

interface Balance {
  rndProjectTurns: number
  researchPace: Record<ResearchPace, { turnsFactor: number; costFactor: number }>
  crashTimeFactor: number
  crashCostMultiple: number
  chiefEngineerProjectThreshold: number
  chiefEngineerTurnsSaved: number
  specialisationRndCostFactor: number
  fixedCosts: { rndOverhead: number }
  counterResearchTurnsSaved: number
}
const BALANCE = balanceData as unknown as Balance

export type ProjectKind = ResearchPace | 'crash'

export const MAX_TECH_LEVEL = 10

// Projektets längd i turer: rndProjectTurns × tempots (eller krasprogrammets) tidsfaktor, en tur kortare med
// chiefEngineer över tröskeln (första läsaren av staff.chiefEngineer), aldrig under en tur.
export function researchDuration(house: Pick<House, 'staff'>, kind: ProjectKind): number {
  const factor = kind === 'crash' ? BALANCE.crashTimeFactor : BALANCE.researchPace[kind].turnsFactor
  const base = Math.max(1, Math.round(BALANCE.rndProjectTurns * factor))
  const saved = house.staff.chiefEngineer > BALANCE.chiefEngineerProjectThreshold ? BALANCE.chiefEngineerTurnsSaved : 0
  return Math.max(1, base - saved)
}

// Faktorn på rndOverhead per tur. Krasprogrammet dubblar TOTALkostnaden (crashCostMultiple) trots den halverade
// tiden, så per tur blir det crashCostMultiple / crashTimeFactor.
export function projectCostPerTurn(kind: ProjectKind): number {
  return kind === 'crash' ? BALANCE.crashCostMultiple / BALANCE.crashTimeFactor : BALANCE.researchPace[kind].costFactor
}

// Ett projekts kostnad per tur: rndOverhead × dess costFactor (1 i ett gammalt sparat parti), och specialiseringen
// (P106) kostar specialisationRndCostFactor × det. Avrundas av anroparen över summan (Money, hård regel 8).
export function projectOverheadPerTurn(house: Pick<House, 'specialisation'>, project: Pick<RndProject, 'category' | 'costFactor'>): number {
  return (
    BALANCE.fixedCosts.rndOverhead *
    (project.costFactor ?? 1) *
    (project.category === house.specialisation ? BALANCE.specialisationRndCostFactor : 1)
  )
}

// Krasprogrammets totalkostnad för en ny eller omvandlad insats — det previewAction visar.
export function crashProgrammeCost(house: Pick<House, 'staff' | 'specialisation'>, category: TechCategory): Money {
  const duration = researchDuration(house, 'crash')
  return round(projectOverheadPerTurn(house, { category, costFactor: projectCostPerTurn('crash') }) * duration)
}

export function isBidLocked(house: Pick<House, 'rndBidLock'>, category: TechCategory, turn: number): boolean {
  return house.rndBidLock?.[category] === turn
}

function newProject(house: House, category: TechCategory, kind: ProjectKind, turn: number, counterTo?: string): RndProject {
  // P117 (§6.6): ett projekt riktat mot ett studerat fiendesystem går counterResearchTurnsSaved turer fortare.
  const turns = Math.max(1, researchDuration(house, kind) - (counterTo ? BALANCE.counterResearchTurnsSaved : 0))
  const project: RndProject = {
    id: `rnd-${category}-${turn}-${kind}`,
    category,
    turnsRemaining: turns,
    turnsTotal: turns,
    costFactor: projectCostPerTurn(kind),
  }
  if (kind === 'crash') project.crash = true
  if (counterTo) project.counterTo = counterTo
  return project
}

// Startar ett projekt för varje kategori med ett spår i kraft som saknar ett pågående projekt (och inte nått taket).
// Anropas i applyActions efter advanceRndQueue, så ett projekt som blev klart den här turen ersätts utan glapp.
export function startTrackedResearch(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const tracks = house.standingOrders?.research
  if (!tracks) return
  for (const category of TECH_CATEGORIES) {
    const track = tracks[category]
    if (!track || draft.meta.turn < track.sinceTurn) continue
    if (house.techLevel[category] >= MAX_TECH_LEVEL) continue
    if (house.rnd.some((p) => p.category === category && !p.design)) continue
    // P176: ett spår kräver ett laboratorium i kategorin med plats och tak. Skälet meldas en gång (när det ändras), inte varje tur.
    const blocked = researchBlockedReason(house, category)
    if (blocked) {
      if (track.blocked !== blocked) {
        track.blocked = blocked
        emit({
          severity: 'report',
          scope: 'house',
          headline: `RESEARCH TRACK IN ${category.toUpperCase()} STANDS STILL — ${blocked.toUpperCase()}`,
          causeId: null,
          delta: {},
          actorIsPlayer: false,
          subjectId: null,
        })
      }
      continue
    }
    delete track.blocked
    // Ett riktat spår förutsätter att systemet fortfarande är studerat (annars löper det som ett vanligt spår).
    const counterTo = track.counterTo && (house.studiedSystems?.[track.counterTo] ?? 0) > 0 ? track.counterTo : undefined
    const project = newProject(house, category, track.pace, draft.meta.turn, counterTo)
    house.rnd.push(project)
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `RESEARCH TRACK: ${category.toUpperCase()} PROJECT STARTS (${track.pace.toUpperCase()} PACE, ${project.turnsTotal} TURNS${counterTo ? `, AIMED AT THE ${enemySystemName(counterTo.slice(0, counterTo.length - category.length - 1), category).toUpperCase()}` : ''})`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
  }
}

// REPRIORITISE_RND som krasprogram. Finns ett pågående (icke-krasch) projekt i kategorin omvandlas det — tiden
// halveras (avrundad uppåt, minst en tur) och kostnaden per tur höjs; annars startar ett nytt krasprojekt.
// Huset kan inte bjuda i kategorin nästa kvartal. validateAction har redan avvisat ett andra krasprogram.
export function applyCrashProgramme(ctx: ResolveContext, category: TechCategory): void {
  const { draft, emit } = ctx
  const house = draft.house
  const running = house.rnd
    .filter((p) => p.category === category && !p.crash && !p.design)
    .sort((a, b) => b.turnsRemaining - a.turnsRemaining)[0]
  if (running) {
    running.turnsRemaining = Math.max(1, Math.ceil(running.turnsRemaining * BALANCE.crashTimeFactor))
    running.costFactor = projectCostPerTurn('crash')
    running.crash = true
  } else {
    house.rnd.push(newProject(house, category, 'crash', draft.meta.turn))
  }
  house.rndBidLock = { ...(house.rndBidLock ?? {}), [category]: draft.meta.turn + 1 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `${house.name.toUpperCase()} LAUNCHES A CRASH PROGRAMME IN ${category.toUpperCase()} R&D — NO BIDS IN THE CATEGORY NEXT QUARTER`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
}
