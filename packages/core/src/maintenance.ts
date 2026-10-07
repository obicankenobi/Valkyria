// maintenance — P174 (ETAPP11_FORSLAG.md §5.3): skick och underhåll. Ett monteringsverk slits av att arbeta (fortare på övertid och i två skift); underhållsnivån (stående order, låg/normal/hög)
// återställer skicket och skalar verkets fasta kostnad — låg sparar pengar nu och är en skuld på framtiden. Dåligt skick ger haverier (en linje står en tur), sänker takten och drar kvalitetsrykte. En
// modernisering (WORKS MODERNISE, construction.ts) återställer skicket och höjer takten för gott. Tal i balance.json (wear*, maintenance*, breakdown*, condition*, modernisation*).
import balanceData from './data/balance.json' with { type: 'json' }
import { lineShift } from './workforce.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, Facility, GameState, House, MaintenanceLevel, ProductionLine, StandingOrderChange } from './types.js'

const BALANCE = balanceData as unknown as {
  wearPerTurn: number
  wearOvertimeFactor: number
  wearDoubleShiftFactor: number
  maintenanceRestoreLow: number
  maintenanceRestoreNormal: number
  maintenanceRestoreHigh: number
  maintenanceCostFactorLow: number
  maintenanceCostFactorHigh: number
  breakdownConditionThreshold: number
  breakdownChancePerPoint: number
  conditionQualityThreshold: number
  conditionQualityPenalty: number
  conditionSpeedFloor: number
  modernisationMax: number
  modernisationRatePct: number
}

export const MAINTENANCE_LEVELS: readonly MaintenanceLevel[] = ['low', 'normal', 'high']
type MaintenanceChange = Extract<StandingOrderChange, { kind: 'MAINTENANCE' }>

// Underhållsnivån som gäller (normal om ingen order gäller än). Utan `turn` räknas en väntande order som gällande.
export function maintenanceOf(house: Pick<House, 'standingOrders'>, facilityId: string, turn?: number): MaintenanceLevel {
  const order = house.standingOrders?.maintenance?.[facilityId]
  return order && (turn === undefined || turn >= order.sinceTurn) ? order.level : 'normal'
}

export function maintenanceCostFactor(level: MaintenanceLevel): number {
  return level === 'low' ? BALANCE.maintenanceCostFactorLow : level === 'high' ? BALANCE.maintenanceCostFactorHigh : 1
}

export function maintenanceRestore(level: MaintenanceLevel): number {
  return level === 'low' ? BALANCE.maintenanceRestoreLow : level === 'high' ? BALANCE.maintenanceRestoreHigh : BALANCE.maintenanceRestoreNormal
}

// Takten faller mot conditionSpeedFloor när skicket går under haveritröskeln.
export function conditionSpeedFactor(facility: Pick<Facility, 'condition'>): number {
  if (facility.condition >= BALANCE.breakdownConditionThreshold) return 1
  return BALANCE.conditionSpeedFloor + (1 - BALANCE.conditionSpeedFloor) * (facility.condition / BALANCE.breakdownConditionThreshold)
}

export const machineSpeedFactor = (facility: Pick<Facility, 'machineLevel'>): number => 1 + (BALANCE.modernisationRatePct * (facility.machineLevel ?? 0)) / 100
export const MODERNISATION_MAX = BALANCE.modernisationMax

// Verkets tekniska skick som en faktor på linjens takt: skick och modernisering. Ett verk som inte finns ger 1.
export function plantSpeedFactor(house: Pick<House, 'works'>, lineId: string): number {
  const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
  return works ? conditionSpeedFactor(works) * machineSpeedFactor(works) : 1
}

function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

export function validateMaintenanceChange(draft: Readonly<GameState>, change: MaintenanceChange): ActionValidation {
  const facility = draft.house.works.find((w) => w.id === change.facilityId)
  if (!facility) return fail('unknown facility')
  if (facility.kind !== 'assembly') return fail('only an assembly works wears and needs maintenance')
  if (facility.status === 'under_construction') return fail('the facility is not built yet')
  if (!(MAINTENANCE_LEVELS as readonly string[]).includes(change.level)) return fail('unknown maintenance level')
  const current = draft.house.standingOrders?.maintenance?.[facility.id]?.level ?? 'normal'
  if (current === change.level) return fail('the facility is already on that maintenance level')
  return { ok: true }
}

export function applyMaintenanceChange(ctx: ResolveContext, change: MaintenanceChange): void {
  const { draft, emit } = ctx
  const orders = (draft.house.standingOrders.maintenance ??= {})
  orders[change.facilityId] = { level: change.level, sinceTurn: draft.meta.turn + 1 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STANDING ORDER: ${change.facilityId.toUpperCase()} MAINTENANCE → ${change.level.toUpperCase()} (FROM NEXT QUARTER)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: change.facilityId,
  })
}

// En linje får ett haveri om verkets skick är under tröskeln (en dragning ur ctx.rng per linje, bara då). Returnerar sant om linjen står stilla den här turen.
export function lineBreaksDown(ctx: ResolveContext, line: ProductionLine): boolean {
  const { draft, rng, emit } = ctx
  const works = draft.house.works.find((w) => w.lines.some((l) => l.id === line.id))
  if (!works || works.condition >= BALANCE.breakdownConditionThreshold) return false
  if (!rng.chance((BALANCE.breakdownConditionThreshold - works.condition) * BALANCE.breakdownChancePerPoint)) return false
  line.status = 'blocked'
  line.blockedReason = 'breakdown (poor condition)'
  emit({
    severity: 'report',
    scope: 'house',
    headline: `${line.id.toUpperCase()} BREAKS DOWN — ${works.id.toUpperCase()} IS RUN DOWN (CONDITION ${works.condition}), NO PRODUCTION THIS TURN`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: works.id,
  })
  return true
}

// Dåligt skick sänker kvalitetsryktet för varje tillverkningsparti.
export function conditionQualityPenalty(house: Pick<House, 'works'>, lineId: string): number {
  const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
  return works && works.condition < BALANCE.conditionQualityThreshold ? BALANCE.conditionQualityPenalty : 0
}

// Slitage och underhåll, sist i `production`: ett monteringsverk med en linje som arbetade slits (övertid och två skift mer), underhållsnivån återställer. En rad när skicket
// korsar en tröskel.
export function advanceCondition(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  for (const works of house.works) {
    if (works.kind !== 'assembly' || works.status === 'under_construction') continue
    const running = works.lines.filter((l) => l.status === 'running')
    const shifts = running.map((l) => lineShift(house, l.id, turn))
    const wear = running.length === 0 ? 0 : BALANCE.wearPerTurn * (shifts.includes('double') ? BALANCE.wearDoubleShiftFactor : shifts.includes('overtime') ? BALANCE.wearOvertimeFactor : 1)
    const before = works.condition
    const after = Math.max(0, Math.min(100, Math.round(before - wear + maintenanceRestore(maintenanceOf(house, works.id, turn)))))
    if (after === before) continue
    works.condition = after
    const t = BALANCE.breakdownConditionThreshold
    if (before >= t && after < t) {
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${works.id.toUpperCase()} IS WEARING OUT — CONDITION ${after}; BREAKDOWNS AND LOST OUTPUT FROM HERE UNLESS MAINTENANCE IS STEPPED UP OR THE WORKS IS MODERNISED`,
        causeId: null,
        delta: { condition: after - before },
        actorIsPlayer: false,
        subjectId: works.id,
      })
    }
  }
}
