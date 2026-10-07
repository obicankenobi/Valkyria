// tooling — P171 (ETAPP11_FORSLAG.md §4.5): uppsättning och omställning. En produktionslinje är uppsatt för en produkt eller en av husets konstruktioner.
// Ett byte kostar tid och pengar och växer med hur stort det är: inom samma familj (en uppgradering av samma konstruktion) kort, till en ny konstruktion längre,
// till en annan produkt längst. Det avgör P112:s premissfynd — en ny konstruktion kräver omställning. Tal i balance.json (retooling*).
import balanceData from './data/balance.json' with { type: 'json' }
import type { Contract, DesignId, House, LineTooling, ProductionLine } from './types.js'

const BALANCE = balanceData as unknown as {
  retoolingTurns: number
  retoolingTurnsDesign: number
  retoolingTurnsProduct: number
  retoolingCostFamily: number
  retoolingCostDesign: number
  retoolingCostProduct: number
}

// fresh = ingen uppsättning än (en ny linje startar utan omställning); none = samma produkt och konstruktion.
export type SetupChange = 'fresh' | 'none' | 'family' | 'design' | 'product'

// Konstruktionens rot: följer `lineage` (föregångaren) till slutet. En cykel (som inte ska finnas) bryts.
export function designRoot(house: Pick<House, 'designs'>, id: DesignId): DesignId {
  const seen = new Set<string>()
  let current = id
  while (!seen.has(current)) {
    seen.add(current)
    const parent = house.designs.find((d) => d.id === current)?.lineage ?? null
    if (parent === null) break
    current = parent
  }
  return current
}

export function setupChange(
  house: Pick<House, 'designs'>,
  tooling: LineTooling | null | undefined,
  contract: Pick<Contract, 'productId'> & { designId?: DesignId | null },
): SetupChange {
  if (!tooling) return 'fresh'
  if (tooling.productId !== contract.productId) return 'product'
  const wanted = contract.designId ?? null
  if (tooling.designId === wanted) return 'none'
  if (tooling.designId !== null && wanted !== null && designRoot(house, tooling.designId) === designRoot(house, wanted)) return 'family'
  return 'design'
}

export function setupCost(change: SetupChange): { turns: number; cost: number } {
  switch (change) {
    case 'family':
      return { turns: BALANCE.retoolingTurns, cost: BALANCE.retoolingCostFamily }
    case 'design':
      return { turns: BALANCE.retoolingTurnsDesign, cost: BALANCE.retoolingCostDesign }
    case 'product':
      return { turns: BALANCE.retoolingTurnsProduct, cost: BALANCE.retoolingCostProduct }
    default:
      return { turns: 0, cost: 0 }
  }
}

// Linjens uppsättning före en tilldelning. Ett sparat parti från före P171 (och tester som sätter productId för hand) saknar `tooling`: då räknas
// uppsättningen ur linjens nuvarande produkt och det tilldelade kontraktets konstruktion, som förut.
export function currentTooling(line: ProductionLine, contracts: readonly Pick<Contract, 'id' | 'designId'>[]): LineTooling | null {
  if (line.tooling !== undefined) return line.tooling
  if (!line.productId) return null
  const assigned = line.assignedContractId ? contracts.find((c) => c.id === line.assignedContractId) : undefined
  return { productId: line.productId, designId: assigned?.designId ?? null }
}

export const SETUP_LABEL: Record<Exclude<SetupChange, 'fresh' | 'none'>, string> = {
  family: 'SAME DESIGN FAMILY',
  design: 'NEW DESIGN',
  product: 'NEW PRODUCT',
}
