// advance — betalningsvillkoren per order (P98, ETAPP8_FORSLAG.md §4.1, beslut 8D).
// Ren och exporterad så att bud-formuläret (P99) och härnessen (P103) kan läsa exakt samma
// härledning. Alla tal ligger i balance.json (_p98_note); formeln är en viktad summa av tre
// termer på 0..1, avbildad på [advancePctMin, advancePctMax]:
//   brådska  — köparens materielNeed mot orderTriggerThreshold (kopplar förskottet till kriget)
//   förmåga  — min(militaryBudget, treasury) i antal ordrar av referenspriset
//   relation — procurement-tjänstemannens relationToPlayer/100 (en liten bonus)
import balanceData from '../data/balance.json' with { type: 'json' }
import { round } from '../money.js'
import type { Contract, Faction, Money, Official, Pct, TechCategory } from '../types.js'

interface AdvanceBalance {
  advancePctMin: number
  advancePctMax: number
  advanceUrgencyWeight: number
  advanceAbilityWeight: number
  advanceRelationWeight: number
  advanceUrgencyFullAt: number
  advanceCoverageFull: number
  orderTriggerThreshold: Record<TechCategory, number>
}
const BALANCE = balanceData as unknown as AdvanceBalance

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export interface AdvanceInputs {
  faction: Pick<Faction, 'materielNeed' | 'militaryBudget' | 'treasury'>
  official: Pick<Official, 'relationToPlayer'>
  category: TechCategory
  referencePrice: Money
}

// De tre termerna, var för sig (0..1) — exporterade så P99 kan visa vad som drev talet
// (bakom underrättelsegrinden, skyddsräcke 4) och så testerna kan pröva varje drivare isolerat.
export function advanceFactors(input: AdvanceInputs): { urgency: number; ability: number; relation: number } {
  const threshold = BALANCE.orderTriggerThreshold[input.category]
  const ratio = threshold > 0 ? input.faction.materielNeed[input.category] / threshold : 1
  const urgency = clamp01((ratio - 1) / (BALANCE.advanceUrgencyFullAt - 1))

  const funds = Math.max(0, Math.min(input.faction.militaryBudget, input.faction.treasury))
  const coverage = input.referencePrice > 0 ? funds / input.referencePrice : BALANCE.advanceCoverageFull
  const ability = clamp01(coverage / BALANCE.advanceCoverageFull)

  const relation = clamp01(input.official.relationToPlayer / 100)
  return { urgency, ability, relation }
}

// Hela procent (Pct), så ordermappens stämpel ("ADVANCE 30 %", P99) och beloppet går ihop.
export function computeAdvancePct(input: AdvanceInputs): Pct {
  const f = advanceFactors(input)
  const score =
    BALANCE.advanceUrgencyWeight * f.urgency + BALANCE.advanceAbilityWeight * f.ability + BALANCE.advanceRelationWeight * f.relation
  return Math.round(BALANCE.advancePctMin + (BALANCE.advancePctMax - BALANCE.advancePctMin) * score)
}

// Förskottet i kronor för ett kontrakt till `price`. EN formel för bidding.ts (betalningen vid
// tilldelning) och budformuläret (P99, "pengar i kassan nästa kvartal") — formuläret kan aldrig
// visa ett annat belopp än det som faktiskt betalas.
export function advanceAmount(price: Money, advancePct: Pct): Money {
  return round((price * advancePct) / 100)
}

// Betalningen för `units` levererade enheter: det som återstår av kontraktsvärdet efter
// förskottet, proportionellt mot levererad andel. EN formel för leveransen (deliveries.ts) och
// prognosen (queries.ts projectedQuarter) — för ett kontrakt utan förskott är den bitvis den
// gamla `price × units / quantity`.
export function deliveryPayment(contract: Pick<Contract, 'price' | 'advancePaid' | 'quantity'>, units: number): Money {
  return round((contract.price - contract.advancePaid) * (units / contract.quantity))
}

// P99d (ägarbeslut 2026-09-29): FAVOUR:s marginalskuld (House.favourMarginOwed) dras från intäkten på
// nästa leverans, hela eller så mycket som räcker. En formel, en källa — deliveries.ts betalar med den
// och queries.ts:s prognos läser samma funktion. `owed` kan saknas i ett sparat parti från före P99d.
export function settleFavourMargin(owed: Money | undefined, gross: Money): { revenue: Money; settled: Money } {
  const settled = Math.min(Math.max(owed ?? 0, 0), gross)
  return { revenue: gross - settled, settled }
}
