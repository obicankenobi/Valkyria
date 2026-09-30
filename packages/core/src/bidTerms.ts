// bidTerms — P106 (ETAPP9_FORSLAG.md §4.1–4.2, skyddsräcke 1 och 3): de termer som läggs på spelarens
// budpoäng EFTER computeScore (som BROKER-bonusen i P57 och preferredBonus). computeScore rörs inte.
//
// EN källa: bidding.ts (avgörandet), queries.ts bidEstimate/playerWinCurve (skattningen) och budmappen
// läser alla `playerBidTerm` — ett test (bidTerms.test.ts) underkänner om skattningen och avgörandet
// skiljer sig. Rivalerna har varken techLevel eller specialiseringsterm och får ingen av dem.
import balanceData from './data/balance.json' with { type: 'json' }
import type { House, Product, TechCategory } from './types.js'

interface Balance {
  scoreBase: number
  techMarginWeight: number
  specialisationBidBonusPct: number
}
const BALANCE = balanceData as unknown as Balance

// Teknik över kravet: techMarginWeight × min(2, techLevel − techRequired). Aldrig negativ — ett bud på en
// produkt under kravet är redan avvisat av diskvalificeringsgrinden i bidding.ts.
export function techTerm(techLevel: number, techRequired: number): number {
  return BALANCE.techMarginWeight * Math.max(0, Math.min(2, techLevel - techRequired))
}

// Specialiseringen: +specialisationBidBonusPct % av scoreBase ("anbudsstyrka") i den egna kategorin.
export function specialisationTerm(specialisation: TechCategory, category: TechCategory): number {
  return specialisation === category ? (BALANCE.scoreBase * BALANCE.specialisationBidBonusPct) / 100 : 0
}

export function playerBidTerm(house: Pick<House, 'techLevel' | 'specialisation'>, product: Pick<Product, 'category' | 'techRequired'>): number {
  return (
    techTerm(house.techLevel[product.category], product.techRequired) +
    specialisationTerm(house.specialisation, product.category)
  )
}
