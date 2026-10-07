// runin — P174 (ETAPP11_FORSLAG.md §5.2): inkörning. En linje som bygger samma sak blir bättre på det: för varje fördubbling av antalet byggda enheter (räknat i kvartals
// produktion av produkten) stiger takten och styckkostnaden faller, upp till ett tak. En omställning nollställer inkörningen — inom samma konstruktionsfamilj behålls en del. Det ger
// långa serier ett värde som är mer än summan av kvartalen och ett skäl att tveka inför omställning. Tal i balance.json (runIn*); underleverantörer ger ingen inkörning.
import balanceData from './data/balance.json' with { type: 'json' }
import { isRobustDesign } from './knowledge.js'
import type { SetupChange } from './tooling.js'
import type { House, Product, ProductionLine } from './types.js'

const BALANCE = balanceData as unknown as {
  runInRatePerDoubling: number
  runInCostPerDoubling: number
  runInMaxDoublings: number
  runInFamilyKeepPct: number
  robustRunInFactor: number
}

// Antalet fördubblingar linjen kommit: log2(1 + byggda enheter / produktens takt per kvartal), högst runInMaxDoublings.
export function runInDoublings(line: Pick<ProductionLine, 'runIn'>, product: Pick<Product, 'unitsPerLineTurn'>): number {
  const built = line.runIn ?? 0
  if (built <= 0 || product.unitsPerLineTurn <= 0) return 0
  return Math.min(BALANCE.runInMaxDoublings, Math.log2(1 + built / product.unitsPerLineTurn))
}

// `scale` > 1 för en konstruktion ritad för enkel tillverkning (P176, robustRunInFactor): inkörningen ger mer per fördubbling.
export function runInRateFactor(line: Pick<ProductionLine, 'runIn'>, product: Pick<Product, 'unitsPerLineTurn'>, scale = 1): number {
  return 1 + (runInDoublings(line, product) * BALANCE.runInRatePerDoubling * scale) / 100
}

export function runInCostFactor(line: Pick<ProductionLine, 'runIn'>, product: Pick<Product, 'unitsPerLineTurn'>, scale = 1): number {
  return 1 - (runInDoublings(line, product) * BALANCE.runInCostPerDoubling * scale) / 100
}

// Vad en omställning gör med inkörningen: samma uppsättning (none/fresh) rör den inte, samma familj behåller en del, en ny konstruktion eller produkt nollställer den.
export function carryRunIn(line: ProductionLine, change: SetupChange): void {
  if (change === 'family') {
    const kept = Math.floor(((line.runIn ?? 0) * BALANCE.runInFamilyKeepPct) / 100)
    if (kept > 0) line.runIn = kept
    else delete line.runIn
  } else if (change === 'design' || change === 'product') {
    delete line.runIn
  }
}

// Skalan för linjens inkörning: en konstruktion med inriktning 'robust' körs in robustRunInFactor gånger så fort (P176).
export function runInScale(house: Pick<House, 'designs'>, line: Pick<ProductionLine, 'tooling'>): number {
  return isRobustDesign(house, line.tooling?.designId) ? BALANCE.robustRunInFactor : 1
}
