// leadSupplier — P185 regel 1 (ETAPP11_FORSLAG.md §9b, beslut 11O/11P): huvudleverantörsregeln. Underleverantörerna är en ventil med tak, inte obegränsad kapacitet: huset får bara bjuda i en kategori
// där det har ett monteringsverk, och högst hälften av ett kontrakts enheter får läggas ut. Den hårda spärren stänger budet helt; den mjuka låter huset ta små ordrar utan verk, helt utlagda och
// till sämre marginal. `leadSupplierMode` väljer: 'off' är läget före P185 och finns bara för mätning och attribuering. Rena frågor (ingen slump) — samma svar i budmappen, kartans orderlager,
// This Quarter och i avgörandet (bidding.ts), eftersom alla läser den här filen.
import balanceData from './data/balance.json' with { type: 'json' }
import type { Facility, House, Product, TechCategory } from './types.js'

export type LeadSupplierMode = 'off' | 'hard' | 'soft'

interface Balance {
  leadSupplierMode: LeadSupplierMode
  leadSupplierMaxOutsourcePct: number
  leadSupplierBuildQuartersLeft: number
  leadSupplierSoftMaxLineTurns: number
  leadSupplierSoftCostFactor: number
  subcontractCostFactor: number
}
// Läses vid varje anrop (inte vid import), så att ett test eller en mätning kan byta läge på den delade balansposten.
const B = balanceData as unknown as Balance

export const leadSupplierMode = (): LeadSupplierMode => B.leadSupplierMode ?? 'off'
export const leadSupplierActive = (): boolean => leadSupplierMode() !== 'off'

type Works = Pick<House, 'works'>

// Ett monteringsverk i kategorin: i drift (strejk räknas, det är fortfarande husets verk), eller under byggnad med högst `leadSupplierBuildQuartersLeft` kvartal kvar — eller, för en upphandling
// (`anyBuild`), under byggnad hur långt det än har kvar. Ett verk utan kategori (migrerat) bygger allt; verk utomlands räknas.
export function hasWorksFor(house: Works, category: TechCategory, opts: { anyBuild?: boolean } = {}): boolean {
  return house.works.some((w: Facility) => {
    if (w.kind !== 'assembly') return false
    if (w.category !== null && w.category !== category) return false
    if (w.status === 'operating' || w.status === 'strike') return true
    return w.status === 'under_construction' && w.build !== undefined && (opts.anyBuild === true || w.build.turnsLeft <= B.leadSupplierBuildQuartersLeft)
  })
}

// Hur många enheter en "liten" order högst får vara i den mjuka spärren: ett antal linjekvartal av produktens takt.
export function softSmallOrderUnits(product: Pick<Product, 'unitsPerLineTurn'>): number {
  return Math.floor(product.unitsPerLineTurn * B.leadSupplierSoftMaxLineTurns)
}

const lockedReason = (category: TechCategory): string => `Requires an Assembly Works for ${category}`

// Skälet till att ett bud inte får läggas, eller null. Den enda källan — validateBid (validateAction.ts), bidding.ts, budmappen och botarna läser den.
export function leadSupplierRejection(house: Works, product: Pick<Product, 'category' | 'unitsPerLineTurn'>, quantity: number): string | null {
  const mode = leadSupplierMode()
  if (mode === 'off' || hasWorksFor(house, product.category)) return null
  if (mode === 'soft') {
    const limit = softSmallOrderUnits(product)
    return quantity <= limit ? null : `${lockedReason(product.category)} for orders over ${limit} units`
  }
  return lockedReason(product.category)
}

// Skälet till att en upphandling inte får anmälas till: ett verk i kategorin eller ett pågående bygge krävs (också i den mjuka spärren — en upphandling är aldrig en liten order).
export function programmeRejection(house: Works, category: TechCategory): string | null {
  return leadSupplierActive() && !hasWorksFor(house, category, { anyBuild: true }) ? lockedReason(category) : null
}

// Största andelen av ett kontrakt som får läggas ut: hälften när huset har ett verk i kategorin (och regeln är på), annars allt (ett kontrakt inget verk kan bygga — den lilla ordern i den mjuka
// spärren, eller ett förlorat verk — går helt till en underleverantör).
export function maxOutsourcePct(house: Works, product: Pick<Product, 'category'>): number {
  return leadSupplierActive() && hasWorksFor(house, product.category) ? B.leadSupplierMaxOutsourcePct : 100
}

// Underleverantörens kostnadsfaktor för en produkt: grunden, och i den mjuka spärren ett påslag till på en order huset saknar verk för.
export function subcontractCostFactorFor(house: Works, product: Pick<Product, 'category'>): number {
  const soft = leadSupplierMode() === 'soft' && !hasWorksFor(house, product.category)
  return soft ? B.subcontractCostFactor * B.leadSupplierSoftCostFactor : B.subcontractCostFactor
}
