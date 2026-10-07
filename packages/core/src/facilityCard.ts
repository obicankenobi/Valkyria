// facilityCard — P179 (ETAPP11_FORSLAG.md §8 punkt 1–2): vad tomtplanen, anläggningskortet och byggmenyn visar. Ren läsning ur samma funktioner kärnan själv räknar med
// (`facilityFixedCost`, `facilityWage`, `planBuild`, `validateWorksChange` …) — gränssnittet räknar ingenting på egen hand (skyddsräcke 3: en formel, en källa).
// Läser aldrig ur rng. Texterna är engelska (gränssnittets språk).
import balanceData from './data/balance.json' with { type: 'json' }
import facilitiesData from './data/facilities.json' with { type: 'json' }
import { FACILITY_KINDS, facilityFixedCost, planBuild, planModernise, plotOf, validateWorksChange } from './construction.js'
import { foreignBuildBlockedReason, foreignSite, foreignWorks, homeWorks } from './foreign.js'
import { laboratoryTechCap } from './knowledge.js'
import { maintenanceCostFactor, maintenanceOf, MODERNISATION_MAX } from './maintenance.js'
import { round } from './money.js'
import { stockValue } from './stock.js'
import { TECH_CATEGORIES } from './validateAction.js'
import { facilityWage, hasWorkforce, moraleOf, wageIndexOf, worksOnDoubleShift } from './workforce.js'
import { lineCapacity } from './works.js'
import type { Facility, FacilityKind, FactionId, GameState, MaintenanceLevel, Money, StandingOrderChange, TechCategory } from './types.js'

const BALANCE = balanceData as unknown as { designDesksPerLevel: number; provingChamberLevel: number; moraleBaseline: number; strikeMoraleThreshold: number; breakdownConditionThreshold: number; worksAlarmStrikeRiskMargin: number }
const KINDS = facilitiesData as unknown as {
  maxLevel: number
  forceTimeFactor: number
  forceCostFactor: number
  sellValuePct: number
  plot: { slots: number; landSlots: number; landCost: number }
  kinds: Record<FacilityKind, { label: string; does: string; maxCount: number; stockCapacity?: number[] }>
}

export type FacilityLamp = 'running' | 'standing' | 'building'

export interface FacilityCardData {
  id: string
  kind: FacilityKind
  label: string
  does: string
  level: 1 | 2 | 3
  maxLevel: number
  category: TechCategory | null
  location: FactionId | null
  status: Facility['status']
  lamp: FacilityLamp
  // Skicket och underhållet gäller monteringsverk (bara de slits); annars null.
  condition: number | null
  conditionLow: boolean
  maintenance: MaintenanceLevel | null
  // Bemanningen: nuvarande, och målet om en bemanningsorder väntar. null för en anläggning utan löner.
  staffing: { current: number; target: number | null; skill: number; morale: number; strikeRisk: boolean } | null
  fixedCost: Money
  wage: Money
  activity: string
  build: { toLevel: number; turnsLeft: number; turnsTotal: number; costPerTurn: Money; modernise: boolean } | null
  machineLevel: number
  canModernise: boolean
  next: { level: number; cost: Money; turns: number; fixedCost: Money; gives: string } | null
  sellValue: Money
}

const money = (n: number): string => `£${n.toLocaleString('en-GB')}`

function gives(kind: FacilityKind, level: number): string {
  switch (kind) {
    case 'assembly':
      return `${lineCapacity({ kind, level: level as 1 | 2 | 3 })} production lines`
    case 'laboratory':
      return `research up to tech level ${laboratoryTechCap({ level: level as 1 | 2 | 3 })}`
    case 'design':
      return `${level * BALANCE.designDesksPerLevel} design desks`
    case 'proving':
      return level >= BALANCE.provingChamberLevel ? `${level} tests at once, with a climate chamber` : `${level} test at once`
    case 'depot':
      return `room for ${money(KINDS.kinds.depot.stockCapacity?.[level - 1] ?? 0)} of stock`
    case 'component':
      return 'more parts for the works it serves'
    case 'civil':
      return 'a larger civil branch'
  }
}

function activityOf(state: GameState, f: Facility): { text: string; busy: boolean } {
  const house = state.house
  if (f.status === 'under_construction') return { text: 'Under construction', busy: false }
  if (f.status === 'strike') return { text: 'On strike — nothing runs', busy: false }
  switch (f.kind) {
    case 'assembly': {
      const running = f.lines.filter((l) => l.status === 'running').length
      const retooling = f.lines.filter((l) => l.status === 'retooling').length
      const text = `${running} of ${f.lines.length} lines running${retooling > 0 ? `, ${retooling} retooling` : ''}`
      return { text, busy: running + retooling > 0 }
    }
    case 'laboratory': {
      const project = house.rnd.find((p) => p.category === f.category && !p.design)
      return project ? { text: `Researching ${f.category}, ${project.turnsRemaining} quarters left`, busy: true } : { text: 'No research running', busy: false }
    }
    case 'design': {
      const n = house.rnd.filter((p) => p.design).length
      const desks = f.level * BALANCE.designDesksPerLevel
      return n > 0 ? { text: `${n} of ${desks} design desks in use`, busy: true } : { text: `${desks} design desks free`, busy: false }
    }
    case 'proving': {
      const n = Object.keys(house.standingOrders?.testing ?? {}).length
      return n > 0 ? { text: `${n} of ${f.level} tests running`, busy: true } : { text: 'No test running', busy: false }
    }
    case 'depot': {
      const value = stockValue(house)
      const units = (house.stock ?? []).reduce((sum, i) => sum + i.units, 0)
      return value > 0 ? { text: `${units} units in store, ${money(value)} booked`, busy: true } : { text: 'Empty', busy: false }
    }
    case 'component':
      return { text: 'Supplying the works', busy: true }
    case 'civil': {
      const lines = Object.keys(house.standingOrders?.civil ?? {}).length
      return lines > 0 ? { text: `${lines} civil line${lines > 1 ? 's' : ''} paying`, busy: true } : { text: 'No civil line open', busy: false }
    }
  }
}

export function facilityCard(state: GameState, facilityId: string): FacilityCardData | null {
  const house = state.house
  const f = house.works.find((w) => w.id === facilityId)
  if (!f) return null
  const data = KINDS.kinds[f.kind]
  const turn = state.meta.turn
  const maintenance = f.kind === 'assembly' ? maintenanceOf(house, f.id) : null
  const { text, busy } = activityOf(state, f)
  const lamp: FacilityLamp = f.status === 'under_construction' || f.build ? 'building' : f.status === 'strike' || f.status === 'idle' || !busy ? 'standing' : 'running'
  const pending = house.standingOrders?.workforce?.[f.id]
  const morale = moraleOf(f)
  const nextLevel = f.level + 1
  const nextPlan = f.level < KINDS.maxLevel && !f.build && f.status !== 'under_construction' ? planBuild(f.kind, nextLevel as 2 | 3, false) : null
  const modPlan = f.kind === 'assembly' && f.status === 'operating' && !f.build ? planModernise(f.kind, f.level, false) : null
  void modPlan
  return {
    id: f.id,
    kind: f.kind,
    label: data.label,
    does: data.does,
    level: f.level,
    maxLevel: KINDS.maxLevel,
    category: f.category,
    location: f.location ?? null,
    status: f.status,
    lamp,
    condition: f.kind === 'assembly' ? f.condition : null,
    conditionLow: f.kind === 'assembly' && f.condition < BALANCE.breakdownConditionThreshold,
    maintenance,
    staffing: hasWorkforce(f.kind)
      ? { current: f.staffing, target: pending ? pending.staffing : null, skill: f.skill, morale, strikeRisk: f.status !== 'strike' && morale < BALANCE.strikeMoraleThreshold + BALANCE.worksAlarmStrikeRiskMargin }
      : null,
    fixedCost: facilityFixedCost(f, maintenance ? maintenanceCostFactor(maintenance) : 1),
    wage: facilityWage(f, wageIndexOf(house), worksOnDoubleShift(house, f, turn)),
    activity: text,
    build: f.build ? { toLevel: f.build.toLevel, turnsLeft: f.build.turnsLeft, turnsTotal: f.build.turnsTotal, costPerTurn: f.build.costPerTurn, modernise: f.build.modernise === true } : null,
    machineLevel: f.machineLevel ?? 0,
    canModernise: f.kind === 'assembly' && f.status === 'operating' && !f.build && (f.machineLevel ?? 0) < MODERNISATION_MAX,
    next: nextPlan ? { level: nextLevel, cost: nextPlan.costTotal, turns: nextPlan.turnsTotal, fixedCost: round(facilityFixedCost({ kind: f.kind, level: nextLevel as 2 | 3, status: 'operating' })), gives: gives(f.kind, nextLevel) } : null,
    sellValue: round((f.invested * KINDS.sellValuePct) / 100),
  }
}

export interface BuildOption {
  kind: FacilityKind
  label: string
  does: string
  cost: Money
  turns: number
  forcedCost: Money
  forcedTurns: number
  fixedCost: Money
  wage: Money
  needsCategory: boolean
  // Ett skäl som gäller slaget i stort (null = går att bygga); för ett slag med kategori finns skälet per kategori.
  blockedReason: string | null
  categories: { category: TechCategory; blockedReason: string | null }[]
  gives: string
}

export interface AbroadOption {
  factionId: FactionId
  city: string
  blockedReason: string | null
}

const CATEGORY_KINDS: readonly FacilityKind[] = ['assembly', 'laboratory']

// Byggmenyn för en tom plats: ett val per anläggningsslag med pris, byggtid och skälet om det inte går. Skälen kommer ur validateWorksChange — samma kontroll som avgör ordern.
export function worksBuildOptions(state: GameState): BuildOption[] {
  return FACILITY_KINDS.map((kind) => {
    const data = KINDS.kinds[kind]
    const plan = planBuild(kind, 1, false)
    const forced = planBuild(kind, 1, true)
    const needsCategory = CATEGORY_KINDS.includes(kind)
    const check = (category?: TechCategory): string | null => {
      const change: StandingOrderChange = { kind: 'WORKS', op: 'BUILD', facilityKind: kind, ...(category ? { category } : {}) }
      const v = validateWorksChange(state, change as Extract<StandingOrderChange, { kind: 'WORKS' }>)
      return v.ok ? null : v.reason
    }
    const categories = needsCategory ? TECH_CATEGORIES.map((category) => ({ category, blockedReason: check(category) })) : []
    const blockedReason = needsCategory ? (categories.every((c) => c.blockedReason !== null) ? (categories[0]?.blockedReason ?? null) : null) : check()
    return {
      kind,
      label: data.label,
      does: data.does,
      cost: plan.costTotal,
      turns: plan.turnsTotal,
      forcedCost: forced.costTotal,
      forcedTurns: forced.turnsTotal,
      fixedCost: facilityFixedCost({ kind, level: 1, status: 'operating' }),
      wage: round(facilityWage({ kind, level: 1, status: 'operating', staffing: 100 }, wageIndexOf(state.house))),
      needsCategory,
      blockedReason,
      categories,
      gives: gives(kind, 1),
    }
  })
}

// Verk i köparland (P177): bara ett monteringsverk, ett land i taget.
export function worksAbroadOptions(state: GameState): AbroadOption[] {
  const out: AbroadOption[] = []
  for (const faction of Object.values(state.factions)) {
    const site = foreignSite(faction.id)
    if (!site) continue
    const change = { kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'infantry', abroad: faction.id } as Extract<StandingOrderChange, { kind: 'WORKS'; op: 'BUILD' }>
    const reason = foreignBuildBlockedReason(state, change)
    const v = reason === null ? validateWorksChange(state, change) : null
    out.push({ factionId: faction.id, city: site.city, blockedReason: reason ?? (v && !v.ok ? v.reason : null) })
  }
  return out
}

// Tomten: hemmaverken i platsordning, antal platser (8, eller 12 efter markköpet) och vad markköpet kostar.
export function worksSite(state: GameState): { slots: number; homeWorks: Facility[]; abroad: Facility[]; landBought: boolean; landCost: Money; landSlots: number } {
  const house = state.house
  const plot = plotOf(house)
  return { slots: plot.slots, homeWorks: homeWorks(house), abroad: foreignWorks(house), landBought: plot.landBought, landCost: KINDS.plot.landCost, landSlots: KINDS.plot.landSlots }
}

