// standingOrders — P100 (ETAPP8_FORSLAG.md §5.1). Stående order i tre slag: linjeuppdrag,
// leverantörsavtal och stationsläge. Validering, tillämpning och avräkning på ETT ställe; stegen
// (applyActions/upkeep/production/economy) anropar hit i stället för att upprepa reglerna.
//
// En ändring kostar INGEN handling (skyddsräcke 6), gäller från NÄSTA tur (sinceTurn = tur + 1) och
// ligger kvar. Ett sparat parti från före P100 saknar House.standingOrders — allt här läser fältet
// defensivt, så ett gammalt sparat parti är ett parti utan stående order.
import balanceData from './data/balance.json' with { type: 'json' }
import { round } from './money.js'
import { recordExpense } from './ledger.js'
import { COMMODITIES, TECH_CATEGORIES } from './validateAction.js'
import { applyInvestigationChoice, validateInvestigationChoice } from './investigations.js'
import { applyProgrammeChange, validateProgrammeChange } from './programme.js'
import { applyCivilChange, validateCivilChange } from './civil.js'
import { applyDesignerChange, validateDesignerChange } from './designer.js'
import { applyLicenceChange, validateLicenceChange } from './licence.js'
import { applyLegalChange, applyTraceChange, validateLegalChange, validateTraceChange } from './traces.js'
import { frontierGeneration, isFollowerTarget } from './race.js'
import { BALANCE_DESIGN_STEPS, isDesignProject, newDesignProject, validateDesignStart, validateTestingChange } from './design.js'
import type { ResolveContext } from './resolve/index.js'
import type {
  ActionValidation,
  GameState,
  House,
  LineStandingOrder,
  ResearchPace,
  StandingOrderChange,
  StandingOrders,
  StationMode,
} from './types.js'
import { findLine } from './works.js'
import { applyWorksChange, validateWorksChange } from './construction.js'

interface Balance {
  planMaxContracts: number
  supplyAgreementMinTurns: number
  supplyAgreementMaxTurns: number
  supplyLossStreakTurns: number
}
const BALANCE = balanceData as unknown as Balance

const SHIFTS = ['normal', 'overtime'] as const
const MODES: readonly StationMode[] = ['quiet', 'normal', 'active']
const PACES: readonly ResearchPace[] = ['low', 'normal', 'high']

export function emptyStandingOrders(): StandingOrders {
  return { lines: {}, supply: [], stations: {} }
}

// Läser (och vid behov skapar) det gällande läget — ett sparat parti från före P100 saknar fältet.
export function ensureStandingOrders(house: House): StandingOrders {
  if (!house.standingOrders) house.standingOrders = emptyStandingOrders()
  return house.standingOrders
}

// Den stående order som GÄLLER just nu för en linje (null = ingen, eller ännu inte i kraft).
export function standingLineOrder(house: House, lineId: string, turn: number): LineStandingOrder | null {
  const order = house.standingOrders?.lines[lineId]
  return order && turn >= order.sinceTurn ? order : null
}

// P171: linjens gällande produktionsplan (null = ingen eller ännu inte i kraft), och de kontrakt som är reserverade av ANDRA linjers gällande planer.
export function standingPlan(house: House, lineId: string, turn: number): string[] | null {
  const plan = house.standingOrders?.plan?.[lineId]
  return plan && turn >= plan.sinceTurn ? plan.contractIds : null
}

export function plannedOnOtherLines(house: House, lineId: string, turn: number): Set<string> {
  const reserved = new Set<string>()
  for (const [id, plan] of Object.entries(house.standingOrders?.plan ?? {})) {
    if (id !== lineId && turn >= plan.sinceTurn) for (const c of plan.contractIds) reserved.add(c)
  }
  return reserved
}

// Stationens gällande läge — 'normal' om ingen order gäller.
export function standingStationMode(house: House, stationId: string, turn: number): StationMode {
  const order = house.standingOrders?.stations[stationId]
  return order && turn >= order.sinceTurn ? order.mode : 'normal'
}

function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

// Samma form som validateAction (P78): ok/inte-ok med en orsak, prövad mot utkastet så att flera
// ändringar i samma inskickning ser varandras effekt (SET följt av CANCEL).
export function validateStandingOrderChange(_state: Readonly<GameState>, draft: GameState, change: StandingOrderChange): ActionValidation {
  const house = draft.house
  switch (change.kind) {
    case 'LINE': {
      if (!findLine(house, change.lineId)) return fail('unknown line')
      if (change.category !== null && !(TECH_CATEGORIES as readonly string[]).includes(change.category)) return fail('unknown category')
      if (!(SHIFTS as readonly string[]).includes(change.shift)) return fail('unknown shift')
      return { ok: true }
    }
    case 'SUPPLY': {
      if (!(COMMODITIES as readonly string[]).includes(change.commodity)) return fail('unknown commodity')
      const existing = (house.standingOrders?.supply ?? []).find((a) => a.commodity === change.commodity)
      if (change.op === 'CANCEL') {
        return existing ? { ok: true } : fail('no supply agreement for that commodity')
      }
      if (!Number.isFinite(change.volumePerTurn) || change.volumePerTurn <= 0) return fail('invalid supply volume')
      if (
        !Number.isInteger(change.durationTurns) ||
        change.durationTurns < BALANCE.supplyAgreementMinTurns ||
        change.durationTurns > BALANCE.supplyAgreementMaxTurns
      ) {
        return fail(`supply agreement must run ${BALANCE.supplyAgreementMinTurns}–${BALANCE.supplyAgreementMaxTurns} turns`)
      }
      if (existing) return fail('a supply agreement for that commodity already exists')
      return { ok: true }
    }
    case 'STATION': {
      const station = house.stations.find((s) => s.id === change.stationId)
      if (!station || station.status === 'burned') return fail('unknown station')
      if (!(MODES as readonly string[]).includes(change.mode)) return fail('unknown station mode')
      return { ok: true }
    }
    case 'RESEARCH': {
      if (!(TECH_CATEGORIES as readonly string[]).includes(change.category)) return fail('unknown category')
      if (change.op === 'CANCEL') {
        return house.standingOrders?.research?.[change.category] ? { ok: true } : fail('no research track for that category')
      }
      if (!(PACES as readonly string[]).includes(change.pace)) return fail('unknown research pace')
      if (change.counterTo !== undefined) {
        // P117 (§6.6): ett spår kan riktas mot ett fiendesystem huset studerat med REVERSE_ENGINEER, i samma kategori.
        if ((house.studiedSystems?.[change.counterTo] ?? 0) <= 0) return fail('that enemy system has not been studied')
        if (!change.counterTo.endsWith(`-${change.category}`)) return fail('that system is in another category')
      }
      return { ok: true }
    }
    case 'PROGRAMME':
      return validateProgrammeChange(_state, draft, change)
    case 'TRACE':
      return validateTraceChange(draft, change)
    case 'LEGAL':
      return validateLegalChange(draft, change)
    case 'CIVIL':
      return validateCivilChange(draft, change)
    case 'LICENCE':
      return validateLicenceChange(draft, change)
    case 'DESIGNER':
      return validateDesignerChange(draft, change)
    case 'WORKS':
      return validateWorksChange(draft, change)
    case 'PLAN': {
      const plans = house.standingOrders?.plan ?? {}
      if (change.op === 'CLEAR') return plans[change.lineId] ? { ok: true } : fail('no plan for that line')
      if (!findLine(house, change.lineId)) return fail('unknown line')
      if (change.contractIds.length > BALANCE.planMaxContracts) return fail(`a plan holds at most ${BALANCE.planMaxContracts} contracts`)
      if (new Set(change.contractIds).size !== change.contractIds.length) return fail('a contract can only be planned once')
      for (const id of change.contractIds) {
        const contract = draft.market.contracts.find((c) => c.id === id)
        if (!contract) return fail('unknown contract')
        const inTransit = draft.market.shipments.filter((s) => s.contractId === id).reduce((sum, s) => sum + s.units, 0)
        if ((contract.status !== 'active' && contract.status !== 'late') || contract.quantity - contract.unitsDelivered - inTransit <= 0) {
          return fail('that contract needs no more production')
        }
        if (Object.entries(plans).some(([lineId, p]) => lineId !== change.lineId && p.contractIds.includes(id))) return fail('that contract is already planned on another line')
      }
      return { ok: true }
    }
    case 'INVESTIGATION': {
      const reason = validateInvestigationChoice(house, change)
      return reason ? fail(reason) : { ok: true }
    }
    case 'TESTING': {
      const reason = validateTestingChange(house, change)
      return reason ? fail(reason) : { ok: true }
    }
    case 'DESIGN': {
      if (change.op === 'CANCEL') {
        return house.rnd.some((p) => p.category === change.category && isDesignProject(p)) ? { ok: true } : fail('no design project in that category')
      }
      const reason = validateDesignStart(house, change)
      return reason ? fail(reason) : { ok: true }
    }
  }
}

// Tillämpar submission.standingOrders i inskickad ordning (kostar ingen handling). Varje accepterad
// ändring emitteras (hård regel 4); en avvisad hamnar i result.rejected.
export function applyStandingOrders(ctx: ResolveContext): void {
  const { state, draft, submission, emit, rejected } = ctx
  const orders = ensureStandingOrders(draft.house)
  const turn = draft.meta.turn
  const from = turn + 1

  for (const change of submission.standingOrders) {
    const validation = validateStandingOrderChange(state, draft, change)
    if (!validation.ok) {
      rejected.push({ action: change, reason: validation.reason })
      continue
    }

    switch (change.kind) {
      case 'LINE': {
        orders.lines[change.lineId] = { category: change.category, shift: change.shift, sinceTurn: from }
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `STANDING ORDER: ${change.lineId.toUpperCase()} → ${change.category ? change.category.toUpperCase() : 'ANY PRODUCT'}, ${change.shift.toUpperCase()} SHIFT (FROM NEXT QUARTER)`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: null,
        })
        break
      }
      case 'SUPPLY': {
        if (change.op === 'CANCEL') {
          const agreement = orders.supply.find((a) => a.commodity === change.commodity)!
          if (agreement.startTurn > turn) {
            // Har inte börjat än — försvinner direkt.
            orders.supply = orders.supply.filter((a) => a !== agreement)
          } else {
            agreement.endTurn = turn // dagens betalning görs, sedan är det borta
          }
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: ${change.commodity.toUpperCase()} SUPPLY AGREEMENT CANCELLED (FROM NEXT QUARTER)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        } else {
          orders.supply.push({
            id: `supply-${change.commodity}-${turn}`,
            commodity: change.commodity,
            volumePerTurn: round(change.volumePerTurn),
            lockedIndex: draft.market.commodities[change.commodity],
            startTurn: from,
            endTurn: from + change.durationTurns - 1,
            lossStreak: 0,
          })
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: ${change.commodity.toUpperCase()} SUPPLY AGREEMENT — £${round(change.volumePerTurn).toLocaleString('en-GB')} A TURN FOR ${change.durationTurns} TURNS, PRICE LOCKED AT ${draft.market.commodities[change.commodity].toFixed(0)}`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        }
        break
      }
      case 'STATION': {
        const station = draft.house.stations.find((s) => s.id === change.stationId)!
        const previous = orders.stations[change.stationId]
        orders.stations[change.stationId] = {
          mode: change.mode,
          sinceTurn: from,
          activeTurns: previous && previous.mode === change.mode ? previous.activeTurns : 0,
        }
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `STANDING ORDER: STATION ${station.city.toUpperCase()} → ${change.mode.toUpperCase()} (FROM NEXT QUARTER)`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: station.nation,
        })
        break
      }
      case 'INVESTIGATION':
        // P113: utredningskortets val (ingen handling, ingen fördröjning — utredningen är redan öppen).
        applyInvestigationChoice(ctx, change)
        break
      case 'TRACE':
        // P125: pappersspårets kort (ingen handling, ingen fördröjning — spåret har redan kommit fram).
        applyTraceChange(ctx, change)
        break
      case 'LEGAL':
        applyLegalChange(ctx, change)
        break
      case 'CIVIL':
        applyCivilChange(ctx, change)
        break
      case 'LICENCE':
        applyLicenceChange(ctx, change)
        break
      case 'DESIGNER':
        applyDesignerChange(ctx, change)
        break
      case 'WORKS':
        applyWorksChange(ctx, change)
        break
      case 'PLAN': {
        const plans = (orders.plan ??= {})
        if (change.op === 'CLEAR') {
          delete plans[change.lineId]
          emit({ severity: 'ticker', scope: 'house', headline: `STANDING ORDER: ${change.lineId.toUpperCase()} GOES BACK TO AUTOMATIC ASSIGNMENT (FROM NEXT QUARTER)`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: null })
        } else {
          plans[change.lineId] = { contractIds: [...change.contractIds], sinceTurn: from }
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: ${change.lineId.toUpperCase()} BUILDS ${change.contractIds.length === 0 ? 'ON AUTOMATIC ASSIGNMENT' : change.contractIds.join(', ').toUpperCase()}, IN THAT ORDER (FROM NEXT QUARTER)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        }
        break
      }
      case 'TESTING': {
        // P110: provning i egen regi. SET byter miljö och börjar om räkningen (från nästa tur); CANCEL avbryter.
        const testing = (orders.testing ??= {})
        const design = draft.house.designs.find((d) => d.id === change.designId)
        if (change.op === 'CANCEL') {
          delete testing[change.designId]
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: TESTING OF ${(design?.name ?? change.designId).toUpperCase()} STOPPED`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        } else {
          testing[change.designId] = { environment: change.environment, sinceTurn: from, turnsRun: 0 }
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: TESTING OF ${(design?.name ?? change.designId).toUpperCase()} IN ${change.environment.toUpperCase()} CONDITIONS (FROM NEXT QUARTER)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        }
        break
      }
      case 'DESIGN': {
        // P109: ritbordsuppdraget. START lägger ett designprojekt i kön (går i gång nästa tur, som all tid); CANCEL
        // tar bort det pågående i kategorin och dess framsteg.
        if (change.op === 'CANCEL') {
          draft.house.rnd = draft.house.rnd.filter((p) => !(p.category === change.category && isDesignProject(p)))
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `${draft.house.name.toUpperCase()} CANCELS ITS ${change.category.toUpperCase()} DESIGN PROJECT`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        } else {
          const targetGeneration = frontierGeneration(draft, change.category) + BALANCE_DESIGN_STEPS[change.ambition]
          const project = newDesignProject(
            draft.house,
            {
              category: change.category,
              focus: change.focus,
              ambition: change.ambition,
              targetGeneration,
              upgradeOf: change.upgradeOf ?? null,
              ...(change.skunk ? { skunk: true } : {}),
            },
            turn,
            isFollowerTarget(draft, change.category, targetGeneration), // P119: efterföljare betalar mindre
          )
          draft.house.rnd.push(project)
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `DESIGN PROJECT: ${draft.house.name.toUpperCase()} STARTS A ${change.focus.toUpperCase()}, ${change.ambition.toUpperCase()} ${change.category.toUpperCase()} ${change.upgradeOf ? 'UPGRADE' : 'DESIGN'} (${project.turnsTotal} TURNS)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        }
        break
      }
      case 'PROGRAMME':
        applyProgrammeChange(ctx, change)
        break
      case 'RESEARCH': {
        // P108: ett spår per kategori. SET skriver över (byte av tempo), CANCEL tar bort spåret men låter ett
        // pågående projekt löpa klart. Projektet startar i startTrackedResearch (research.ts) från sinceTurn.
        const research = (orders.research ??= {})
        if (change.op === 'CANCEL') {
          delete research[change.category]
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: ${change.category.toUpperCase()} RESEARCH TRACK CANCELLED (A RUNNING PROJECT FINISHES)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        } else {
          research[change.category] = { pace: change.pace, sinceTurn: from, ...(change.counterTo ? { counterTo: change.counterTo } : {}) }
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STANDING ORDER: ${change.category.toUpperCase()} RESEARCH TRACK — ${change.pace.toUpperCase()} PACE (FROM NEXT QUARTER)`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
        }
        break
      }
    }
  }
}

// Avräknar leverantörsavtalen (anropas i början av production-steget, så innehavet redan är
// krediterat när produktionen räknar sin materialkostnad). Volymen betalas varje tur oavsett behov
// och krediteras innehavet till dagens index mot det låsta: stiger indexet tjänar spelaren, sjunker
// det förlorar spelaren. Kassan → huvudboken (commodityPurchase); innehavet är icke-kontant, som vid
// BUY_FORWARD. Tredje förlustturen i följd (supplyLossStreakTurns) ger ett larm med causeId.
export function settleSupplyAgreements(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const orders = house.standingOrders
  if (!orders || orders.supply.length === 0) return
  const turn = draft.meta.turn

  const remaining: typeof orders.supply = []
  for (const agreement of orders.supply) {
    if (turn > agreement.endTurn) {
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `SUPPLY AGREEMENT EXPIRES: ${agreement.commodity.toUpperCase()}`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
      continue
    }
    remaining.push(agreement)
    if (turn < agreement.startTurn) continue

    const index = draft.market.commodities[agreement.commodity]
    const paid = agreement.volumePerTurn
    const credited = round(paid * (index / agreement.lockedIndex))
    house.treasury -= paid
    recordExpense(draft, 'commodityPurchase', paid)
    house.commodityHoldings[agreement.commodity] += credited
    agreement.lossStreak = credited < paid ? agreement.lossStreak + 1 : 0

    const settlementId = emit({
      severity: 'ticker',
      scope: 'house',
      headline: `SUPPLY AGREEMENT ${agreement.commodity.toUpperCase()}: PAID £${paid.toLocaleString('en-GB')}, RECEIVED £${credited.toLocaleString('en-GB')} AT INDEX ${index.toFixed(0)} (LOCKED ${agreement.lockedIndex.toFixed(0)})`,
      causeId: null,
      delta: { treasury: -paid, [`commodityHoldings.${agreement.commodity}`]: credited },
      actorIsPlayer: true,
      subjectId: null,
    })

    if (agreement.lossStreak >= BALANCE.supplyLossStreakTurns) {
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `SUPPLY AGREEMENT ${agreement.commodity.toUpperCase()} HAS BEEN LOSING MONEY FOR ${agreement.lossStreak} TURNS RUNNING`,
        causeId: settlementId,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
    }
  }
  orders.supply = remaining
}
