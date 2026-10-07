// construction — P170 (ETAPP11_FORSLAG.md §4.1, §4.3, §4.4): tomten och byggena. Ett bygge, en utbyggnad, en avveckling och ett markköp är stående order
// (`WORKS`, ingen handling, gäller från nästa tur). Tomten har åtta platser (11C); varje anläggning, även en under byggnad, tar en plats. Ett bygge tar två till
// fyra kvartal och betalas i lika rater under tiden; forcerat bygge är halva tiden mot dubbla priset. Raterna räknas i `production` (11H), de fasta kostnaderna
// i `economy`. Alla tal ligger i data/facilities.json.
import facilitiesData from './data/facilities.json' with { type: 'json' }
import { recordExpense, recordIncome } from './ledger.js'
import { round } from './money.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, Facility, FacilityKind, GameState, House, Money, Plot, ProductionLine, StandingOrderChange } from './types.js'

type KindData = { label: string; buildCost: number[]; buildTurns: number[]; fixedCostPerQuarter: number[]; maxCount: number }
const DATA = facilitiesData as unknown as {
  maxLevel: number
  linesPerLevel: number[]
  plot: { slots: number; landSlots: number; landCost: number }
  forceTimeFactor: number
  forceCostFactor: number
  expansionSpeedPct: number
  sellValuePct: number
  newAssemblyLines: number
  startingInvested: Partial<Record<FacilityKind, number>>
  kinds: Record<FacilityKind, KindData>
}

type WorksChange = Extract<StandingOrderChange, { kind: 'WORKS' }>
const CATEGORY_KINDS: readonly FacilityKind[] = ['assembly', 'laboratory'] // slagen som arbetar i en kategori

export const FACILITY_KINDS = Object.keys(DATA.kinds) as FacilityKind[]
export const kindLabel = (kind: FacilityKind): string => DATA.kinds[kind].label

// Ett sparat parti från före P170 saknar House.plot: det läses som en orörd tomt.
export function plotOf(house: Pick<House, 'plot'>): Plot {
  return house.plot ?? { slots: DATA.plot.slots, landBought: false }
}

export function freePlotSlots(house: Pick<House, 'plot' | 'works'>): number {
  return Math.max(0, plotOf(house).slots - house.works.length)
}

function nextWorksId(house: Pick<House, 'works'>): string {
  const highest = house.works.reduce((max, w) => Math.max(max, Number(w.id.replace(/^works-/, '')) || 0), 0)
  return `works-${highest + 1}`
}

function nextLineNumber(house: Pick<House, 'works'>): number {
  return house.works.reduce((sum, w) => sum + w.lines.length, 0)
}

// Rater: lika stora, resten i den sista. Forcerat: halva tiden (avrundad uppåt, minst ett kvartal) mot dubbla priset.
function planBuild(kind: FacilityKind, toLevel: 1 | 2 | 3, forced: boolean): { turnsTotal: number; costTotal: Money; costPerTurn: Money } {
  const baseTurns = DATA.kinds[kind].buildTurns[toLevel - 1]!
  const turnsTotal = forced ? Math.max(1, Math.ceil(baseTurns * DATA.forceTimeFactor)) : baseTurns
  const costTotal = round(DATA.kinds[kind].buildCost[toLevel - 1]! * (forced ? DATA.forceCostFactor : 1))
  return { turnsTotal, costTotal, costPerTurn: Math.floor(costTotal / turnsTotal) }
}

// Anläggningens fasta kostnad per kvartal på dess nivå. En anläggning under byggnad betalar bara sina rater.
export function facilityFixedCost(facility: Pick<Facility, 'kind' | 'level' | 'status'>): Money {
  return facility.status === 'under_construction' ? 0 : DATA.kinds[facility.kind].fixedCostPerQuarter[facility.level - 1]!
}

export function worksUpkeep(house: Pick<House, 'works'>): Money {
  return round(house.works.reduce((sum, w) => sum + facilityFixedCost(w), 0))
}

// Hur snabbt en linje går just nu relativt full fart: ett monteringsverk under utbyggnad går på halv fart (§4.3).
export function worksSpeedFactor(house: Pick<House, 'works'>, lineId: string): number {
  const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
  return works?.build && works.status !== 'under_construction' ? DATA.expansionSpeedPct / 100 : 1
}

export const EXPANSION_SPEED_PCT = DATA.expansionSpeedPct

function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

export function validateWorksChange(draft: Readonly<GameState>, change: WorksChange): ActionValidation {
  const house = draft.house
  switch (change.op) {
    case 'BUILD': {
      if (!(FACILITY_KINDS as readonly string[]).includes(change.facilityKind)) return fail('unknown facility kind')
      const data = DATA.kinds[change.facilityKind]
      const needsCategory = CATEGORY_KINDS.includes(change.facilityKind)
      const article = change.facilityKind === 'assembly' ? 'an' : 'a'
      if (needsCategory && !change.category) return fail(`${article} ${data.label.toLowerCase()} needs a category`)
      if (!needsCategory && change.category) return fail(`${article} ${data.label.toLowerCase()} has no category`)
      if (change.category && !(TECH_CATEGORIES as readonly string[]).includes(change.category)) return fail('unknown category')
      if (house.works.length >= plotOf(house).slots) return fail('the plot is full')
      if (change.facilityKind === 'laboratory' && house.works.some((w) => w.kind === 'laboratory' && w.category === change.category)) {
        return fail('the house already has a laboratory in that category')
      }
      if (house.works.filter((w) => w.kind === change.facilityKind).length >= data.maxCount) {
        return fail(`the house already has the most ${data.label.toLowerCase()}s it may have`)
      }
      if (house.treasury < planBuild(change.facilityKind, 1, change.forced === true).costPerTurn) return fail('cannot afford the first instalment')
      return { ok: true }
    }
    case 'EXPAND': {
      const facility = house.works.find((w) => w.id === change.facilityId)
      if (!facility) return fail('unknown facility')
      if (facility.build) return fail('already being built')
      if (facility.level >= DATA.maxLevel) return fail('already at the highest level')
      if (house.treasury < planBuild(facility.kind, (facility.level + 1) as 2 | 3, change.forced === true).costPerTurn) return fail('cannot afford the first instalment')
      return { ok: true }
    }
    case 'SELL': {
      const facility = house.works.find((w) => w.id === change.facilityId)
      if (!facility) return fail('unknown facility')
      if (facility.status === 'under_construction') return fail('cannot sell a facility under construction')
      if (facility.kind === 'assembly' && house.works.filter((w) => w.kind === 'assembly').length <= 1) return fail('the house needs at least one assembly works')
      if (facility.lines.some((l) => l.assignedContractId !== null)) return fail('a line in it is working on a contract')
      return { ok: true }
    }
    case 'BUY_LAND': {
      if (plotOf(house).landBought) return fail('the house has already bought more land')
      if (house.treasury < DATA.plot.landCost) return fail('cannot afford the land')
      return { ok: true }
    }
  }
}

const money = (n: number): string => `£${n.toLocaleString('en-GB')}`

export function applyWorksChange(ctx: ResolveContext, change: WorksChange): void {
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  switch (change.op) {
    case 'BUILD': {
      const plan = planBuild(change.facilityKind, 1, change.forced === true)
      const facility: Facility = {
        id: nextWorksId(house),
        kind: change.facilityKind,
        level: 1,
        category: change.category ?? null,
        condition: 100,
        staffing: 100,
        skill: 50,
        status: 'under_construction',
        lines: [],
        invested: 0,
        build: { toLevel: 1, startTurn: turn + 1, turnsTotal: plan.turnsTotal, turnsLeft: plan.turnsTotal, costTotal: plan.costTotal, costPerTurn: plan.costPerTurn, forced: change.forced === true },
      }
      house.plot = { ...plotOf(house) }
      house.works.push(facility)
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${house.name.toUpperCase()} BREAKS GROUND ON A ${DATA.kinds[change.facilityKind].label.toUpperCase()}${change.category ? ` (${change.category.toUpperCase()})` : ''} — ${plan.turnsTotal} QUARTERS, ${money(plan.costTotal)}${change.forced ? ', FORCED' : ''}`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: facility.id,
      })
      break
    }
    case 'EXPAND': {
      const facility = house.works.find((w) => w.id === change.facilityId)!
      const toLevel = (facility.level + 1) as 2 | 3
      const plan = planBuild(facility.kind, toLevel, change.forced === true)
      facility.build = { toLevel, startTurn: turn + 1, turnsTotal: plan.turnsTotal, turnsLeft: plan.turnsTotal, costTotal: plan.costTotal, costPerTurn: plan.costPerTurn, forced: change.forced === true }
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${DATA.kinds[facility.kind].label.toUpperCase()} ${facility.id.toUpperCase()} IS BEING EXPANDED TO LEVEL ${toLevel} — ${plan.turnsTotal} QUARTERS, ${money(plan.costTotal)}${facility.kind === 'assembly' ? `, RUNNING AT ${DATA.expansionSpeedPct}% MEANWHILE` : ''}`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: facility.id,
      })
      break
    }
    case 'SELL': {
      const facility = house.works.find((w) => w.id === change.facilityId)!
      const value = round((DATA.sellValuePct / 100) * facility.invested)
      house.works = house.works.filter((w) => w !== facility)
      const lineOrders = house.standingOrders?.lines
      if (lineOrders) for (const line of facility.lines) delete lineOrders[line.id]
      house.treasury += value
      recordIncome(draft, 'facilitySale', value)
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${house.name.toUpperCase()} CLOSES ITS ${DATA.kinds[facility.kind].label.toUpperCase()} ${facility.id.toUpperCase()} — SOLD FOR ${money(value)}, THE WORKFORCE GOES`,
        causeId: null,
        delta: { treasury: value },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
      break
    }
    case 'BUY_LAND': {
      house.treasury -= DATA.plot.landCost
      recordExpense(draft, 'works', DATA.plot.landCost)
      house.plot = { slots: plotOf(house).slots + DATA.plot.landSlots, landBought: true }
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${house.name.toUpperCase()} BUYS ${DATA.plot.landSlots} MORE PLOTS (−${money(DATA.plot.landCost)}) — ${house.plot.slots} IN ALL`,
        causeId: null,
        delta: { treasury: -DATA.plot.landCost, plots: DATA.plot.landSlots },
        actorIsPlayer: true,
        subjectId: null,
      })
      break
    }
  }
}

function newLines(house: Pick<House, 'works' | 'unitsPerLineTurnDefault'>, count: number): ProductionLine[] {
  const start = nextLineNumber(house)
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${start + i + 1}`,
    productId: null,
    grade: 'A' as const,
    unitsPerTurnAtFull: house.unitsPerLineTurnDefault,
    capacityPct: 100,
    assignedContractId: null,
    status: 'idle' as const,
    blockedReason: null,
    retoolingUntilTurn: null,
  }))
}

// Varje tur: en rat för varje pågående bygge (från startTurn); när den sista är betald är anläggningen klar. Anropas först i `production` (11H).
export function advanceConstruction(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  for (const facility of house.works) {
    const build = facility.build
    if (!build || turn < build.startTurn) continue
    const instalment = build.turnsLeft === 1 ? build.costTotal - build.costPerTurn * (build.turnsTotal - 1) : build.costPerTurn
    house.treasury -= instalment
    recordExpense(draft, 'works', instalment)
    build.turnsLeft -= 1
    const label = DATA.kinds[facility.kind].label.toUpperCase()
    if (build.turnsLeft > 0) {
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${label} ${facility.id.toUpperCase()} RISES — INSTALMENT ${money(instalment)}, ${build.turnsLeft} QUARTER${build.turnsLeft === 1 ? '' : 'S'} TO GO`,
        causeId: null,
        delta: { treasury: -instalment },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
      continue
    }
    const wasNew = facility.status === 'under_construction'
    facility.level = build.toLevel
    facility.status = 'operating'
    facility.invested += build.costTotal
    delete facility.build
    if (wasNew && facility.kind === 'assembly') facility.lines = newLines(house, DATA.newAssemblyLines)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `${label} ${facility.id.toUpperCase()} IS READY${wasNew ? '' : ` — NOW LEVEL ${facility.level}`} (FINAL INSTALMENT ${money(instalment)})`,
      causeId: null,
      delta: { treasury: -instalment, level: facility.level },
      actorIsPlayer: true,
      subjectId: facility.id,
    })
  }
}

// Ett monteringsverks plats för linjer räknas av works.ts (lineCapacity); startpaketet byggs i state.ts med den här.
export function startingInvested(kind: FacilityKind): Money {
  return DATA.startingInvested[kind] ?? 0
}
export const NEW_ASSEMBLY_LINES = DATA.newAssemblyLines
