// validateAction — P78 (ETAPP7_TEKNISK_SPEC.md §7.4), ordagrant:
// "validateAction(state, draft, action): { ok: true } | { ok: false; reason:
// string } ... bryts ut ur applyActions.ts, så att samma kontroll körs när
// kortet läggs och när turen avgörs. Golden ska vara bitvis identisk."
//
// Utbruten ur resolve/steps/applyActions.ts och resolve/political.ts, som nu
// ANROPAR den här filens funktion i stället för att upprepa kontrollerna
// inline — exakt samma villkor, exakt samma reason-strängar, bara flyttade.
// Ren funktion, ingen rng, ingen mutation (samma hårda regler 1–3 som resten
// av packages/core) — därför en egen topp-nivåfil, INTE under resolve/, som
// queries.ts/pricing.ts: en UI-anropare (P79) har ingen ResolveContext.
//
// `state` och `draft` är TVÅ olika GameState av en anledning: samma funktion
// ska ge samma svar när ett kort läggs i kön (innan submission, `draft` = en
// lokalt simulerad "state + redan köade kort", `state` = senast bekräftade
// state) OCH när turen faktiskt avgörs (applyActions.ts, `state` = state vid
// turens BÖRJAN, `draft` = draften efter alla FÖREGÅENDE actions i samma
// inskickning). De allra flesta kontrollerna nedan läser bara `draft` (den
// "nu"-bilden räcker) — TAKE_LOAN är den enda som behöver diffa mot `state`,
// se dess egen kommentar.
//
// GENUINT FYND, dokumenterat i samma commit (se docs/ANDRINGSLOGG.md): två av
// de ursprungliga lokala trackrarna i applyActions.ts/political.ts
// (`remainingCredit`, `bribeGainThisTurn`) fanns INTE i GameState — bara som
// loop-lokala variabler i den gamla, odelade applyActions.ts. `bribeGainThisTurn`
// visade sig aldrig vara en AVVISNINGSORSAK (BRIBE avvisas aldrig av taket,
// vinsten klipps bara tystare — se political.ts, oförändrat, ingen
// validateAction-gren behövs för den). `remainingCredit` ÄR en avvisningsorsak
// (TAKE_LOAN). Den kan INTE återges exakt via en enkel state/draft-diff om
// samma inskickning innehåller BÅDE REPAY och TAKE_LOAN (REPAY sänker
// house.debt, vilket en naiv diff skulle tolka som "mer kreditutrymme" — ett
// beteende ORIGINALKODEN aldrig hade, eftersom remainingCredit där ENDAST
// påverkas av TAKE_LOAN, aldrig av REPAY). Löst med en klampad diff
// (`Math.max(0, ...)`) som är EXAKT för alla scenarier utom "TAKE_LOAN, sedan
// REPAY, sedan ett nytt TAKE_LOAN i SAMMA inskickning" — verifierat att INGET
// befintligt test eller golden-scenario innehåller den sekvensen (sökt
// igenom hela test-sviten). Se test/validateAction.test.ts för både det
// exakta fallet (flera TAKE_LOAN, REPAY-före-TAKE_LOAN) och en kommentar om
// den kvarstående, medvetet accepterade avvikelsen.
import balanceData from './data/balance.json' with { type: 'json' }
import { round } from './money.js'
import { allProducts } from './pricing.js'
import { findOfficial } from './officials.js'
import type { ActionValidation, Commodity, GameState, PlayerAction, TechCategory } from './types.js'

interface Balance {
  maxProductionLines: number
  maxStations: number
  brokerRelationThreshold: number
  brokerIntegrityThreshold: number
}
const BALANCE = balanceData as unknown as Balance

export const COMMODITIES: readonly Commodity[] = ['oil', 'steel', 'uranium', 'titanium', 'rare_earths']
export const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']
export const HIRABLE_ROLES = ['chiefEngineer', 'chiefSalesman', 'chiefOfStaff'] as const
export type HirableRole = (typeof HIRABLE_ROLES)[number]

// Flyttade ordagrant ur applyActions.ts (P78) — samma fyra vaktfunktioner,
// nu den ENDA källan (applyActions.ts importerar dem tillbaka härifrån för
// att TypeScript ska smalna av payload-typen i sin egen mutationsgren).
export function isTakeLoanPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

export function isRepayPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

export function isHirePayload(payload: Record<string, unknown>): payload is { role: HirableRole } {
  return typeof payload.role === 'string' && (HIRABLE_ROLES as readonly string[]).includes(payload.role)
}

export function isRndPayload(payload: Record<string, unknown>): payload is { category: TechCategory } {
  return typeof payload.category === 'string' && (TECH_CATEGORIES as readonly string[]).includes(payload.category)
}

function ok(): ActionValidation {
  return { ok: true }
}
function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

export function validateAction(state: Readonly<GameState>, draft: Readonly<GameState>, action: PlayerAction): ActionValidation {
  const house = draft.house

  switch (action.type) {
    case 'CRISIS':
      // Kostar ingen actionPoint, hanteras separat (resolvePendingCrisis) och
      // avvisas aldrig i applyActions.ts:s handlingslopp — oförändrat.
      return ok()

    case 'INTERNAL':
      switch (action.op) {
        case 'TAKE_LOAN': {
          if (!isTakeLoanPayload(action.payload)) return fail('invalid loan amount')
          const amount = round(action.payload.amount)
          // Se filens huvudkommentar: klampad diff, exakt utom en dokumenterat
          // accepterad, otestad kombination (TAKE_LOAN–REPAY–TAKE_LOAN samma tur).
          const debtTakenThisTurn = Math.max(0, draft.house.debt - state.house.debt)
          const remainingCredit = draft.house.creditLimit - debtTakenThisTurn
          if (amount > remainingCredit) return fail('credit limit exceeded')
          return ok()
        }
        case 'REPAY': {
          if (!isRepayPayload(action.payload)) return fail('invalid repayment amount')
          const amount = round(action.payload.amount)
          if (amount > Math.min(house.treasury, house.debt)) return fail('repayment exceeds treasury or debt')
          return ok()
        }
        case 'BUILD_LINE':
          if (house.lines.length >= BALANCE.maxProductionLines) return fail('maximum production lines reached')
          return ok()
        case 'HIRE':
          if (!isHirePayload(action.payload)) return fail('invalid hire role')
          return ok()
        case 'REPRIORITISE_RND':
          if (!isRndPayload(action.payload)) return fail('invalid R&D category')
          return ok()
      }
      break

    case 'POLITICAL':
      switch (action.op) {
        case 'STAGE_INCIDENT':
        case 'BACK_CHANNEL': {
          if (!draft.factions[action.targetFactionId]) return fail('unknown target faction')
          if (!Number.isFinite(action.spend) || action.spend < 0) return fail('invalid spend amount')
          return ok()
        }
        case 'BRIBE':
        case 'FUND_CAMPAIGN': {
          if (!draft.officials[action.officialId]) return fail('unknown official')
          if (!Number.isFinite(action.spend) || action.spend < 0) return fail('invalid spend amount')
          return ok()
        }
        case 'FAVOUR': {
          if (!draft.officials[action.officialId]) return fail('unknown official')
          if (!Number.isFinite(action.marginCost) || action.marginCost < 0) return fail('invalid margin cost')
          return ok()
        }
        case 'INFLUENCE': {
          const target = draft.factions[action.targetFactionId]
          if (!target) return fail('unknown target faction')
          if (!Number.isFinite(action.spend) || action.spend < 0) return fail('invalid spend amount')
          if (action.effect.kind === 'relations') {
            const toward = draft.factions[action.effect.towardFactionId]
            if (!toward || action.effect.towardFactionId === target.id) return fail('invalid influence target')
          }
          return ok()
        }
        case 'FUND_COUP': {
          const target = draft.factions[action.targetFactionId]
          if (!target) return fail('unknown target faction')
          if (!Number.isFinite(action.spend) || action.spend < 0) return fail('invalid spend amount')
          if (target.coupAttempted) return fail('coup already attempted against this faction')
          return ok()
        }
        case 'ASSASSINATE': {
          const official = draft.officials[action.officialId]
          if (!official || official.status !== 'active') return fail('unknown official target')
          if (!Number.isFinite(action.spend) || action.spend < 0) return fail('invalid spend amount')
          return ok()
        }
      }
      break

    case 'INTEL': {
      switch (action.op) {
        case 'EXPAND':
        case 'WITHDRAW': {
          const station = house.stations.find((s) => s.id === action.stationId)
          if (!station) return fail('unknown station')
          return ok()
        }
        case 'RECRUIT': {
          const nation = action.targetId
          if (!nation || !draft.factions[nation]) return fail('invalid recruit target')
          if (house.stations.length >= BALANCE.maxStations) return fail('maximum stations reached')
          return ok()
        }
        case 'LEAK':
        case 'SABOTAGE': {
          const station = house.stations.find((s) => s.id === action.stationId)
          if (!station) return fail('unknown station')
          const rival = action.targetId ? draft.rivals[action.targetId] : undefined
          if (!rival) return fail('unknown rival target')
          return ok()
        }
        case 'TURN': {
          const station = house.stations.find((s) => s.id === action.stationId)
          if (!station) return fail('unknown station')
          const official = action.targetId ? draft.officials[action.targetId] : undefined
          if (!official || official.status !== 'active' || official.factionId !== station.nation) return fail('unknown official target')
          return ok()
        }
      }
      break
    }

    case 'MARKET': {
      if (!(COMMODITIES as readonly string[]).includes(action.commodity)) return fail('unknown commodity')
      if (!Number.isFinite(action.spend) || action.spend <= 0) return fail('invalid market spend amount')
      const spend = round(action.spend)
      if (action.op === 'BUY_FORWARD') {
        if (spend > house.treasury) return fail('insufficient treasury')
        return ok()
      }
      // RELEASE
      if (spend > house.commodityHoldings[action.commodity]) return fail('release exceeds holding')
      return ok()
    }

    case 'BROKER': {
      const faction = draft.factions[action.buyerId]
      if (!faction) return fail('unknown buyer faction')
      if (!Number.isFinite(action.quantity) || action.quantity <= 0) return fail('invalid quantity')
      if (!Number.isFinite(action.price) || action.price <= 0) return fail('invalid price')
      if (!allProducts().some((p) => p.id === action.productId)) return fail('unknown product')

      const official = findOfficial(draft, action.buyerId, 'procurement')
      if (
        !official ||
        official.status !== 'active' ||
        official.relationToPlayer < BALANCE.brokerRelationThreshold ||
        official.integrity < BALANCE.brokerIntegrityThreshold
      ) {
        return fail('official will not broker this deal')
      }
      return ok()
    }
  }

  // Ouppnåeligt — PlayerAction är en sluten union och alla varianter hanteras
  // ovan (TypeScript's exhaustiveness räcker inte rakt över en nästlad
  // op-switch, se test/validateAction.test.ts för ett exhaustiveness-test).
  return fail('unhandled action')
}
