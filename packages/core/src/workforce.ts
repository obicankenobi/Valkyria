// workforce — P173 (ETAPP11_FORSLAG.md §3 11D, §5.1): arbetsstyrkan. Varje anläggning med löner har bemanning (andel av full styrka, 25–100) och yrkesskicklighet (0–100). Att anställa tar ett
// kvartal och späder ut skickligheten; en uppsägning sparar lön direkt men tar skickligheten med sig och sänker stämningen på de andra anläggningarna. Lönerna följer ett index som stiger
// med doomsday ("kriget trappas upp"). Låg stämning, övertid och uppsägningar kan utlösa en strejk: anläggningen står tills den tar slut av sig själv, huset ger med sig (lön) eller bryter den
// (stämning och redbarhet). Allt är stående order (ingen handling), alla tal ligger i balance.json (beteendet) och data/facilities.json (lönerna), all slump via ctx.rng och bara när en strejk
// är möjlig (stämningen under tröskeln), så ett lugnt hus drar ingenting.
import balanceData from './data/balance.json' with { type: 'json' }
import facilitiesData from './data/facilities.json' with { type: 'json' }
import { round } from './money.js'
import { standingLineOrder } from './standingOrders.js'
import { recordExpense } from './ledger.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, Facility, FacilityKind, GameState, House, LineShift, Money, StandingOrderChange } from './types.js'

const BALANCE = balanceData as unknown as {
  wageDoomsdaySlope: number
  wageIndexMax: number
  skillGrowthPerTurn: number
  skillMax: number
  newHireSkill: number
  layoffSkillLossFactor: number
  skillThroughputSlope: number
  moraleBaseline: number
  moraleRecoveryPerTurn: number
  moraleOvertimePenalty: number
  moraleWageWeight: number
  moraleLayoffHitSelf: number
  moraleLayoffHitOthers: number
  strikeMoraleThreshold: number
  strikeChancePct: number
  strikeMaxTurns: number
  strikeConcessionCost: number
  strikeConcessionPremiumPct: number
  strikeConcessionMorale: number
  strikeBreakMoraleHit: number
  strikeBreakIntegrityPenalty: number
  strikeEndMorale: number
  doubleShiftWageFactor: number
  moraleDoubleShiftPenalty: number
}
const WAGES = facilitiesData as unknown as { kinds: Record<FacilityKind, { label: string; wagePerQuarter: number[] }> }

export const STAFFING_STEPS: readonly number[] = [25, 50, 75, 100]
type WorkforceChange = Extract<StandingOrderChange, { kind: 'WORKFORCE' }>

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))
const money = (n: number): string => `£${n.toLocaleString('en-GB')}`

export const wageIndexOf = (house: Pick<House, 'wageIndex'>): number => house.wageIndex ?? 1
export const moraleOf = (facility: Pick<Facility, 'morale'>): number => facility.morale ?? BALANCE.moraleBaseline

// Anläggningar med löner (och därmed en arbetsstyrka att sköta): de som har en lön i datafilen.
export function hasWorkforce(kind: FacilityKind): boolean {
  return (WAGES.kinds[kind]?.wagePerQuarter[0] ?? 0) > 0
}

// Anläggningens lön per kvartal: grundlönen på nivån × bemanningen × löneindexet × ett eventuellt påslag. Ingen lön under bygge eller strejk.
export function facilityWage(facility: Pick<Facility, 'kind' | 'level' | 'status' | 'staffing' | 'wagePremiumPct'>, index: number, doubleShift = false): Money {
  if (facility.status === 'under_construction' || facility.status === 'strike') return 0
  const base = WAGES.kinds[facility.kind].wagePerQuarter[facility.level - 1] ?? 0
  return round(base * (facility.staffing / 100) * index * (1 + (facility.wagePremiumPct ?? 0) / 100) * (doubleShift ? BALANCE.doubleShiftWageFactor : 1))
}

// Linjens gällande skift. Två skift kräver full bemanning: under det går linjen på normalt skift (P174).
export function lineShift(house: Pick<House, 'works' | 'standingOrders'>, lineId: string, turn: number): LineShift {
  const order = standingLineOrder(house as House, lineId, turn)
  if (!order) return 'normal'
  if (order.shift === 'double') {
    const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
    return works && works.staffing >= 100 ? 'double' : 'normal'
  }
  return order.shift
}

export const worksOnDoubleShift = (house: Pick<House, 'works' | 'standingOrders'>, works: Facility, turn: number): boolean => works.lines.some((l) => lineShift(house, l.id, turn) === 'double')

// Utan `turn` räknas inga tvåskiftslöner (samma konvention som stationslägena i economy.ts).
export function totalWages(house: Pick<House, 'works' | 'wageIndex' | 'standingOrders'>, turn?: number): Money {
  const index = wageIndexOf(house)
  return round(house.works.reduce((sum, w) => sum + facilityWage(w, index, turn !== undefined && worksOnDoubleShift(house, w, turn)), 0))
}

// Genomströmningsfaktorn för en linje: bemanningen × skicklighetens effekt; 0 under en strejk. Skicklighet 50 är neutral (1,0).
export function workforceSpeedFactor(house: Pick<House, 'works'>, lineId: string): number {
  const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
  if (!works) return 1
  if (works.status === 'strike') return 0
  return (works.staffing / 100) * (1 + (BALANCE.skillThroughputSlope * (works.skill - 50)) / 50)
}

export function isOnStrike(house: Pick<House, 'works'>, lineId: string): boolean {
  return house.works.some((w) => w.status === 'strike' && w.lines.some((l) => l.id === lineId))
}

function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

export function validateWorkforceChange(draft: Readonly<GameState>, change: WorkforceChange): ActionValidation {
  const facility = draft.house.works.find((w) => w.id === change.facilityId)
  if (!facility) return fail('unknown facility')
  if (change.op === 'STRIKE') {
    if (facility.status !== 'strike') return fail('that facility is not on strike')
    if (change.response === 'concede' && draft.house.treasury < BALANCE.strikeConcessionCost) return fail('cannot afford the concession')
    return { ok: true }
  }
  if (!hasWorkforce(facility.kind)) return fail('that kind of facility has no workforce to manage')
  if (facility.status === 'under_construction') return fail('the facility is not built yet')
  if (facility.status === 'strike') return fail('the facility is on strike')
  if (!STAFFING_STEPS.includes(change.staffing)) return fail(`staff at ${STAFFING_STEPS.join(', ')} percent`)
  const pending = draft.house.standingOrders?.workforce?.[facility.id]?.staffing
  if ((pending ?? facility.staffing) === change.staffing) return fail('the facility is already at that staffing')
  return { ok: true }
}

export function applyWorkforceChange(ctx: ResolveContext, change: WorkforceChange): void {
  const { draft, emit } = ctx
  const house = draft.house
  const facility = house.works.find((w) => w.id === change.facilityId)!
  const label = WAGES.kinds[facility.kind].label.toUpperCase()
  if (change.op === 'SET') {
    const orders = (house.standingOrders.workforce ??= {})
    orders[facility.id] = { staffing: change.staffing, sinceTurn: draft.meta.turn + 1 }
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `STANDING ORDER: ${label} ${facility.id.toUpperCase()} → ${change.staffing}% STAFFING (${change.staffing > facility.staffing ? 'HIRING TAKES A QUARTER' : 'FROM NEXT QUARTER'})`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: facility.id,
    })
    return
  }
  const strike = facility.strike
  delete facility.strike
  facility.status = 'operating'
  if (change.response === 'concede') {
    house.treasury -= BALANCE.strikeConcessionCost
    recordExpense(draft, 'fixedCosts', BALANCE.strikeConcessionCost)
    facility.wagePremiumPct = (facility.wagePremiumPct ?? 0) + BALANCE.strikeConcessionPremiumPct
    facility.morale = BALANCE.strikeConcessionMorale
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `${label} ${facility.id.toUpperCase()}: THE HOUSE GIVES IN — ${money(BALANCE.strikeConcessionCost)} NOW AND +${BALANCE.strikeConcessionPremiumPct}% ON WAGES, THE STRIKE IS OVER`,
      causeId: null,
      delta: { treasury: -BALANCE.strikeConcessionCost },
      actorIsPlayer: true,
      subjectId: facility.id,
    })
  } else {
    for (const w of house.works) w.morale = clamp(moraleOf(w) - BALANCE.strikeBreakMoraleHit, 0, 100)
    facility.morale = BALANCE.strikeEndMorale - BALANCE.strikeBreakMoraleHit // de som går tillbaka gör det surt
    house.reputation.integrity = clamp(house.reputation.integrity - BALANCE.strikeBreakIntegrityPenalty, 0, 100)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `${label} ${facility.id.toUpperCase()}: THE HOUSE BREAKS THE STRIKE (${strike ? `AFTER ${draft.meta.turn - strike.sinceTurn + 1} QUARTERS` : 'AT ONCE'}) — MORALE FALLS EVERYWHERE, THE HOUSE'S GOOD NAME WITH IT`,
      causeId: null,
      delta: { 'reputation.integrity': -BALANCE.strikeBreakIntegrityPenalty },
      actorIsPlayer: true,
      subjectId: facility.id,
    })
  }
}

// Anropas i början av `production` (11H), före genomströmningen räknas: löneindex, väntande bemanningsändringar, skicklighet, stämning och strejker.
export function advanceWorkforce(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn

  // Löneindexet: stiger med doomsday. Ett kvartal är ett steg om en femtedel i emitterad förändring (en rad när indexet rundat till 0,05 ändrats).
  const previousIndex = wageIndexOf(house)
  const index = Math.round(Math.min(BALANCE.wageIndexMax, 1 + BALANCE.wageDoomsdaySlope * draft.doomsday) * 1000) / 1000
  if (index !== 1 || house.wageIndex !== undefined) house.wageIndex = index // utelämnas så länge det står på grundnivån
  if (Math.round(index * 20) !== Math.round(previousIndex * 20)) {
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `WAGES ${index > previousIndex ? 'RISE' : 'EASE'}: THE WAR PULLS THE WHOLE INDUSTRY'S PAY TO ${Math.round(index * 100)}% OF THE BASE LEVEL`,
      causeId: null,
      delta: { wageIndex: index - previousIndex },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  // Väntande bemanningsändringar som nu gäller.
  const pending = house.standingOrders.workforce
  for (const facility of house.works) {
    const order = pending?.[facility.id]
    if (!order || turn < order.sinceTurn || facility.status === 'under_construction') continue
    delete pending![facility.id]
    if (facility.status === 'strike') continue
    const from = facility.staffing
    const to = order.staffing
    if (to === from) continue
    const label = WAGES.kinds[facility.kind].label.toUpperCase()
    if (to > from) {
      facility.skill = clamp(Math.round((facility.skill * from) / to + (BALANCE.newHireSkill * (to - from)) / to), 0, 100)
      facility.staffing = to
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${label} ${facility.id.toUpperCase()} HIRES UP TO ${to}% — THE NEW HANDS DILUTE THE SKILL (NOW ${facility.skill})`,
        causeId: null,
        delta: { staffing: to - from, skill: 0 },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
    } else {
      const share = (from - to) / from
      facility.skill = clamp(Math.round(facility.skill * (1 - BALANCE.layoffSkillLossFactor * share)), 0, 100)
      facility.staffing = to
      facility.morale = clamp(moraleOf(facility) - BALANCE.moraleLayoffHitSelf, 0, 100)
      for (const other of house.works) {
        if (other !== facility && hasWorkforce(other.kind)) other.morale = clamp(moraleOf(other) - BALANCE.moraleLayoffHitOthers, 0, 100)
      }
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${label} ${facility.id.toUpperCase()} LAYS OFF DOWN TO ${to}% — WAGES SAVED, SKILL FALLS TO ${facility.skill}, MORALE FALLS ACROSS THE HOUSE`,
        causeId: null,
        delta: { staffing: to - from },
        actorIsPlayer: true,
        subjectId: facility.id,
      })
    }
  }

  // Skicklighet, stämning och strejker, per anläggning med en arbetsstyrka.
  for (const facility of house.works) {
    if (!hasWorkforce(facility.kind) || facility.status === 'under_construction') continue
    const label = WAGES.kinds[facility.kind].label.toUpperCase()

    if (facility.status === 'strike') {
      const strike = facility.strike ?? { sinceTurn: turn }
      if (turn - strike.sinceTurn + 1 >= BALANCE.strikeMaxTurns) {
        delete facility.strike
        facility.status = 'operating'
        facility.morale = BALANCE.strikeEndMorale
        emit({
          severity: 'headline',
          scope: 'house',
          headline: `${label} ${facility.id.toUpperCase()}: THE STRIKE PETERS OUT AFTER ${BALANCE.strikeMaxTurns} QUARTERS — THE HANDS GO BACK`,
          causeId: null,
          delta: {},
          actorIsPlayer: false,
          subjectId: facility.id,
        })
      }
      continue
    }

    if (facility.status === 'operating') {
      if (facility.skill < BALANCE.skillMax) facility.skill = Math.min(BALANCE.skillMax, facility.skill + BALANCE.skillGrowthPerTurn)
    }

    // Stämningen: tillbaka mot grundnivån, ner av övertid och av lönetrycket.
    const overtime = facility.lines.some((l) => lineShift(house, l.id, turn) === 'overtime')
    const doubleShift = worksOnDoubleShift(house, facility, turn)
    const wagePressure = Math.max(0, (wageIndexOf(house) - 1) * 100 * BALANCE.moraleWageWeight - (facility.wagePremiumPct ?? 0) * BALANCE.moraleWageWeight)
    const morale = moraleOf(facility)
    const recovered = morale < BALANCE.moraleBaseline ? Math.min(BALANCE.moraleBaseline, morale + BALANCE.moraleRecoveryPerTurn) : morale
    const next = clamp(Math.round(recovered - (overtime ? BALANCE.moraleOvertimePenalty : 0) - (doubleShift ? BALANCE.moraleDoubleShiftPenalty : 0) - wagePressure), 0, 100)
    if (next !== morale || facility.morale !== undefined) facility.morale = next
    if (morale >= BALANCE.strikeMoraleThreshold && next < BALANCE.strikeMoraleThreshold) {
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${label} ${facility.id.toUpperCase()}: MORALE IS DOWN TO ${next} — THE UNIONS TALK OF A STRIKE`,
        causeId: null,
        delta: { morale: next - morale },
        actorIsPlayer: false,
        subjectId: facility.id,
      })
    }
    if (next < BALANCE.strikeMoraleThreshold && rng.chance(BALANCE.strikeChancePct)) {
      facility.status = 'strike'
      facility.strike = { sinceTurn: turn }
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `STRIKE AT ${label} ${facility.id.toUpperCase()} — THE LINES STAND STILL UNTIL THE HOUSE GIVES IN, WAITS IT OUT OR BREAKS IT`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: facility.id,
      })
    }
  }
}
