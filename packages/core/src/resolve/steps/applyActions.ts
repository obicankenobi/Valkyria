// applyActions — spelarens handlingar och bud, i inskickad ordning (spec 3.1).
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10 och ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.
//
// P17 bygger house.actionPoints (8.1) och INTERNAL i sin helhet (8.2): TAKE_LOAN
// (oförändrad, byggd i P8), REPAY, BUILD_LINE, HIRE, REPRIORITISE_RND. BROKER,
// MARKET, POLITICAL och INTEL förblir no-ops (P18 bygger två av tre POLITICAL-op
// och en minimal INTEL) — men konsumerar fortfarande en actionPoint, se nedan.
//
// payload-formerna är PROVISORISKA, samma sorts platshållare som StandingOrderChange
// (se ANDRINGSLOGG.md 2026-09-13) — ingen PlayerAction-payload har en frusen form
// någonstans i specen.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import type { ResolveStep } from '../index.js'
import type { Money, ProductionLine, RndProject, TechCategory, WireEvent } from '../../types.js'

type Emit = (e: Omit<WireEvent, 'id' | 'turn'>) => string

interface Balance {
  buildLineCost: number
  maxProductionLines: number
  hireCost: number
  hireGain: number
  rndProjectTurns: number
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']
const HIRABLE_ROLES = ['chiefEngineer', 'chiefSalesman', 'chiefOfStaff'] as const
type HirableRole = (typeof HIRABLE_ROLES)[number]

function isTakeLoanPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

function isRepayPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

function isHirePayload(payload: Record<string, unknown>): payload is { role: HirableRole } {
  return typeof payload.role === 'string' && (HIRABLE_ROLES as readonly string[]).includes(payload.role)
}

function isRndPayload(payload: Record<string, unknown>): payload is { category: TechCategory } {
  return typeof payload.category === 'string' && (TECH_CATEGORIES as readonly string[]).includes(payload.category)
}

// R&D-kön löper vidare även en tur utan en ny REPRIORITISE_RND — det här är inte en
// spelarhandling, det är tidens gång för ett redan pågående projekt. Ingen annan
// plats i pipelinen äger house.rnd (avsnitt 8.2: "Vid färdigställande: techLevel
// [category] += 1"), och pipelineordningen är fryst (CLAUDE.md hård regel 7) — hör
// därför hemma här, där kön faktiskt skrivs, precis innan turens NYA handlingar
// (som kan lägga till ett projekt som inte ska hinna en tur på samma passage).
function advanceRndQueue(house: { rnd: RndProject[]; techLevel: Record<TechCategory, number> }, emit: Emit): void {
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

export const applyActions: ResolveStep = (ctx) => {
  const { draft, submission, emit, rejected } = ctx
  const house = draft.house

  advanceRndQueue(house, emit)

  // house.creditLimit uppdateras inte förrän economy.ts (senare i samma pipeline-
  // passage) — så flera TAKE_LOAN i samma inskickning måste bokföras mot en lokal,
  // krympande kopia, annars kunde spelaren stapla lån långt över den faktiska
  // gränsen genom att bara skicka in många handlingar samma tur.
  let remainingCredit = house.creditLimit
  let rndSeq = 0

  let actionsUsed = 0
  for (const action of submission.actions) {
    actionsUsed++
    if (actionsUsed > house.actionPoints) {
      rejected.push({ action, reason: 'no executive actions remaining' })
      continue
    }

    if (action.type !== 'INTERNAL') continue // BROKER/INTEL/POLITICAL/MARKET: se filens huvudkommentar

    switch (action.op) {
      case 'TAKE_LOAN': {
        if (!isTakeLoanPayload(action.payload)) {
          rejected.push({ action, reason: 'invalid loan amount' })
          continue
        }
        const amount = round(action.payload.amount)
        if (amount > remainingCredit) {
          rejected.push({ action, reason: 'credit limit exceeded' })
          continue
        }
        house.debt += amount
        house.treasury += amount
        remainingCredit -= amount
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} TAKES OUT A LOAN OF £${amount.toLocaleString('en-GB')}`,
          causeId: null,
          delta: { treasury: amount, debt: amount },
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }

      case 'REPAY': {
        if (!isRepayPayload(action.payload)) {
          rejected.push({ action, reason: 'invalid repayment amount' })
          continue
        }
        const amount: Money = round(action.payload.amount)
        if (amount > Math.min(house.treasury, house.debt)) {
          rejected.push({ action, reason: 'repayment exceeds treasury or debt' })
          continue
        }
        house.treasury -= amount
        house.debt -= amount
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} REPAYS £${amount.toLocaleString('en-GB')} OF DEBT`,
          causeId: null,
          delta: { treasury: -amount, debt: -amount },
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }

      case 'BUILD_LINE': {
        if (house.lines.length >= BALANCE.maxProductionLines) {
          rejected.push({ action, reason: 'maximum production lines reached' })
          continue
        }
        const cost = BALANCE.buildLineCost
        house.treasury -= cost
        const line: ProductionLine = {
          id: `line-${house.lines.length + 1}`,
          productId: null,
          grade: 'A',
          unitsPerTurnAtFull: house.unitsPerLineTurnDefault,
          capacityPct: 100,
          assignedContractId: null,
          status: 'idle',
          blockedReason: null,
        }
        house.lines.push(line)
        emit({
          severity: 'headline',
          scope: 'house',
          headline: `${house.name.toUpperCase()} BUILDS A NEW PRODUCTION LINE (−£${cost.toLocaleString('en-GB')})`,
          causeId: null,
          delta: { treasury: -cost },
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }

      case 'HIRE': {
        if (!isHirePayload(action.payload)) {
          rejected.push({ action, reason: 'invalid hire role' })
          continue
        }
        const cost = BALANCE.hireCost
        house.treasury -= cost
        const role = action.payload.role
        const before = house.staff[role]
        house.staff[role] = Math.min(100, before + BALANCE.hireGain)
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} HIRES A NEW ${role === 'chiefOfStaff' ? 'CHIEF OF STAFF' : role === 'chiefEngineer' ? 'CHIEF ENGINEER' : 'CHIEF SALESMAN'} (−£${cost.toLocaleString('en-GB')})`,
          causeId: null,
          delta: { treasury: -cost, [role]: house.staff[role] - before },
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }

      case 'REPRIORITISE_RND': {
        if (!isRndPayload(action.payload)) {
          rejected.push({ action, reason: 'invalid R&D category' })
          continue
        }
        const category = action.payload.category
        const project: RndProject = {
          id: `rnd-${category}-${draft.meta.turn}-${rndSeq++}`,
          category,
          turnsRemaining: BALANCE.rndProjectTurns,
          turnsTotal: BALANCE.rndProjectTurns,
        }
        house.rnd.push(project)
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} REPRIORITISES R&D TOWARD ${category.toUpperCase()}`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }
    }
  }
}
