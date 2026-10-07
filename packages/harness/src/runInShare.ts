// runInShare — P186 (ETAPP11_FORSLAG.md §9): inkörningens andel av styckkostnadens fall i en serie på åtta kvartal (målrad 15–30 %). Specen anger inte hur "fallet" avgränsas; här: en serie är en linje som
// står uppsatt för samma produkt åtta kvartal (linjens `tooling`, uppehåll mellan kontrakten räknas — inkörningen följer de byggda enheterna, inte kalendern, och försvinner först vid omställning),
// fallet är styckkostnaden första kvartalet minus den sista, och inkörningens del är det inkörningsrabatten ökat under serien. Resten är råvaruindexets rörelse (inkörningen är det enda systematiska
// som sänker styckkostnaden i en serie). En första version som krävde åtta kvartal i följd av tillverkning fann serier i bara 0–16 % av partierna. Läser bara tillståndet — ingen ny räknare i core.
import { allLines, computeUnitCostNow, getProduct, runInCostFactor, runInScale } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'

export const SERIES_QUARTERS = 8

export interface SeriesFall {
  total: number
  runIn: number
}

// Summan av inkörningens del över summan av det totala fallet, i procent. Serier där kostnaden steg (fallet ≤ 0) har ingen andel att tala om och räknas inte.
export function shareOfFall(series: readonly SeriesFall[]): number {
  let total = 0
  let runIn = 0
  for (const s of series) {
    if (s.total <= 0) continue
    total += s.total
    runIn += s.runIn
  }
  return total > 0 ? Math.max(0, Math.min(100, (100 * runIn) / total)) : 0
}

interface Open {
  productId: string
  quarters: number
  firstCost: number
  firstDiscount: number
  lastCost: number
  lastDiscount: number
}

export class RunInTracker {
  private readonly open = new Map<string, Open>()
  private readonly closed: SeriesFall[] = []

  private close(key: string): void {
    const s = this.open.get(key)
    this.open.delete(key)
    if (!s || s.quarters < SERIES_QUARTERS) return
    this.closed.push({ total: s.firstCost - s.lastCost, runIn: s.lastDiscount - s.firstDiscount })
  }

  // Anropas en gång per tur med tillståndet efter avgörandet. En linje utan uppsättning (aldrig använd) är ingen serie.
  observe(state: GameState): void {
    const seen = new Set<string>()
    for (const line of allLines(state.house)) {
      const productId = line.tooling?.productId ?? null
      if (productId === null) continue
      const product = getProduct(productId)
      const base = computeUnitCostNow(product, line.grade, state.market.commodities)
      const factor = runInCostFactor(line, product, runInScale(state.house, line))
      const cost = base * factor
      const discount = base - cost
      seen.add(line.id)
      const current = this.open.get(line.id)
      if (current && current.productId === productId) {
        current.quarters++
        current.lastCost = cost
        current.lastDiscount = discount
        continue
      }
      if (current) this.close(line.id)
      this.open.set(line.id, { productId, quarters: 1, firstCost: cost, firstDiscount: discount, lastCost: cost, lastDiscount: discount })
    }
    for (const key of [...this.open.keys()]) if (!seen.has(key)) this.close(key)
  }

  finish(): { series: number; sharePct: number } {
    for (const key of [...this.open.keys()]) this.close(key)
    return { series: this.closed.length, sharePct: shareOfFall(this.closed) }
  }
}
