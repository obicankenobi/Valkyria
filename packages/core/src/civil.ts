// civil.ts — P133 (ETAPP9_FORSLAG.md §8b.2, beslut 9J): den civila grenen. Ett forskningsspår kan ge en civil produkt — traktorer ur
// pansarlinjen, radioapparater ur elektroniken, transporthelikoptrar ur flyget. Civila ordrar är små, stabila och beror inte på
// kriget (de betalas lika under en vapenvila), och de ger ett litet försprång tillbaka till forskningen. Grenen löser en fråga som
// varit öppen sedan P64: ett hus kan överleva en vapenvila, men till lägre marginal och med mindre inflytande.
//
// Modellen är en stående order per kategori (`CIVIL SET`/`CANCEL`, ingen handling): varje tur ger en nettointäkt
// `civilRevenuePerTurn` × (1 + `civilRevenueTechStep` × (techLevel − `civilMinTechLevel`)) — ordern är redan netto av civil
// tillverkning, så ingen egen kostnadsrad bokförs — och var `civilHeadStartEveryTurns`:e tur ett forskningsförsprång i kategorin.
// Faller kategorins techLevel under golvet upphör linjen.
import balanceData from './data/balance.json' with { type: 'json' }
import { recordIncome } from './ledger.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, CivilCategory, GameState, House, StandingOrderChange, TechCategory } from './types.js'

const BALANCE = balanceData as unknown as {
  civilMinTechLevel: number
  civilRevenuePerTurn: number
  civilRevenueTechStep: number
  civilHeadStartEveryTurns: number
}

export const CIVIL_CATEGORIES: readonly CivilCategory[] = ['armour', 'electronics', 'aviation']

// De civila produkterna (9J-exemplen). Namnen är fiktiva.
export const CIVIL_PRODUCT_NAME: Record<CivilCategory, string> = {
  armour: 'FARM TRACTORS',
  electronics: 'RADIO SETS',
  aviation: 'TRANSPORT HELICOPTERS',
}

export const isCivilCategory = (category: TechCategory): category is CivilCategory => (CIVIL_CATEGORIES as readonly string[]).includes(category)

// Vilka kategorier huset kan starta en civil linje i just nu (techLevel över golvet, ingen linje redan).
export function civilOptions(house: Pick<House, 'techLevel' | 'standingOrders'>): CivilCategory[] {
  return CIVIL_CATEGORIES.filter((c) => house.techLevel[c] >= BALANCE.civilMinTechLevel && !house.standingOrders?.civil?.[c])
}

// Nettointäkten för en linje i en kategori vid husets techLevel.
export function civilRevenueFor(house: Pick<House, 'techLevel'>, category: CivilCategory): number {
  const steps = Math.max(0, house.techLevel[category] - BALANCE.civilMinTechLevel)
  return Math.round(BALANCE.civilRevenuePerTurn * (1 + BALANCE.civilRevenueTechStep * steps))
}

export function validateCivilChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'CIVIL' }>): ActionValidation {
  if (!isCivilCategory(change.category as TechCategory)) return { ok: false, reason: 'no civil product in that category' }
  const active = draft.house.standingOrders?.civil?.[change.category]
  if (change.op === 'CANCEL') return active ? { ok: true } : { ok: false, reason: 'no civil line in that category' }
  if (active) return { ok: false, reason: 'a civil line already runs in that category' }
  if (draft.house.techLevel[change.category] < BALANCE.civilMinTechLevel) {
    return { ok: false, reason: `needs tech level ${BALANCE.civilMinTechLevel} in ${change.category}` }
  }
  return { ok: true }
}

export function applyCivilChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'CIVIL' }>): void {
  const { draft, emit } = ctx
  const orders = (draft.house.standingOrders.civil ??= {})
  if (change.op === 'CANCEL') {
    delete orders[change.category]
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `STANDING ORDER: THE CIVIL ${CIVIL_PRODUCT_NAME[change.category]} LINE IS CLOSED`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
    return
  }
  orders[change.category] = { sinceTurn: draft.meta.turn + 1 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STANDING ORDER: A CIVIL ${CIVIL_PRODUCT_NAME[change.category]} LINE OPENS (FROM NEXT QUARTER)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
}

// Varje tur: de civila linjerna betalar, och ger då och då ett forskningsförsprång. Beror inte på kriget.
export function advanceCivil(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const civil = draft.house.standingOrders?.civil
  if (!civil) return
  const turn = draft.meta.turn
  for (const category of CIVIL_CATEGORIES) {
    const line = civil[category]
    if (!line || line.sinceTurn > turn) continue
    if (draft.house.techLevel[category] < BALANCE.civilMinTechLevel) {
      delete civil[category]
      emit({
        severity: 'report',
        scope: 'house',
        headline: `THE CIVIL ${CIVIL_PRODUCT_NAME[category]} LINE LAPSES — THE HOUSE HAS FALLEN BEHIND IN ${category.toUpperCase()}`,
        causeId: null,
        delta: {},
        actorIsPlayer: true,
        subjectId: null,
      })
      continue
    }
    const net = civilRevenueFor(draft.house, category)
    draft.house.treasury += net
    draft.house.revenueByTurn[turn] = (draft.house.revenueByTurn[turn] ?? 0) + net
    recordIncome(draft, 'civil', net)
    const id = emit({
      severity: 'report',
      scope: 'house',
      headline: `CIVIL ${CIVIL_PRODUCT_NAME[category]} EARN £${net.toLocaleString('en-GB')} — THE ORDERS DO NOT DEPEND ON THE WAR`,
      causeId: null,
      delta: { treasury: net },
      actorIsPlayer: true,
      subjectId: null,
    })
    if ((turn - line.sinceTurn + 1) % BALANCE.civilHeadStartEveryTurns === 0) {
      draft.house.researchHeadStart[category] = (draft.house.researchHeadStart[category] ?? 0) + 1
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `THE CIVIL ${CIVIL_PRODUCT_NAME[category]} LINE FEEDS A QUARTER'S HEAD START BACK INTO ${category.toUpperCase()} RESEARCH`,
        causeId: id,
        delta: { [`researchHeadStart.${category}`]: 1 },
        actorIsPlayer: true,
        subjectId: null,
      })
    }
  }
}

// Andelen av husets bokförda intäkter som var civila — härledd ur huvudboken, aldrig lagrad (epilogens RESTRAINT-axel).
export function civilShare(state: Pick<GameState, 'ledger'>): number {
  let civil = 0
  let total = 0
  for (const entry of state.ledger ?? []) {
    civil += entry.income.civil ?? 0
    total += Object.values(entry.income).reduce((a, b) => a + (b ?? 0), 0)
  }
  return total > 0 ? (civil / total) * 100 : 0
}
