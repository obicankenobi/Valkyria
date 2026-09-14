// production — linjer producerar mot tilldelade kontrakt; styckkostnad bokförs här.
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Produktion").
//
// Specen beskriver bara VAD som händer när en linje redan är knuten till ett
// kontrakt — den säger aldrig VEM som knyter en ledig linje till ett obemannat
// kontrakt. Det görs här (steg 2 nedan): en ledig linje tar automatiskt nästa
// kontrakt som fortfarande behöver produceras, och ärver dess productId/grade.
// Ingen spelarhandling för det finns (INTERNAL saknar en sådan op), så automatiskt
// är det enda rimliga — annars skulle ett vunnet kontrakt aldrig producera något.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { computeUnitCostNow, getProduct } from '../../pricing.js'
import type { ResolveStep } from '../index.js'
import type { Contract, Shipment } from '../../types.js'

interface Balance {
  deliveryDelayMinTurns: number
  deliveryDelayMaxTurns: number
}
const BALANCE = balanceData as unknown as Balance

function unitsInTransit(shipments: readonly Shipment[], contractId: string): number {
  return shipments.filter((s) => s.contractId === contractId).reduce((sum, s) => sum + s.units, 0)
}

function needsProduction(contract: Contract | undefined): contract is Contract {
  return !!contract && (contract.status === 'active' || contract.status === 'late')
}

function remainingToProduce(contract: Contract, shipments: readonly Shipment[]): number {
  return contract.quantity - contract.unitsDelivered - unitsInTransit(shipments, contract.id)
}

export const production: ResolveStep = (ctx) => {
  const { draft, rng, emit } = ctx
  const house = draft.house

  // 1) Frigör linjer vars kontrakt inte längre behöver produktion (fulfilled/
  //    voided, eller redan färdigproducerat och väntar på leverans).
  for (const line of house.lines) {
    if (!line.assignedContractId) continue
    const contract = draft.market.contracts.find((c) => c.id === line.assignedContractId)
    const stillNeeded = needsProduction(contract) && remainingToProduce(contract, draft.market.shipments) > 0
    if (stillNeeded) continue

    line.assignedContractId = null
    line.productId = null
    line.status = 'idle'
    line.blockedReason = null
  }

  // 2) Tilldela lediga linjer till obemannade kontrakt som fortfarande behöver
  //    produceras. En kontraktsrad kan bara ha en linje åt gången.
  const claimed = new Set(house.lines.map((l) => l.assignedContractId).filter((id): id is string => id !== null))
  for (const line of house.lines) {
    if (line.status !== 'idle') continue

    const contract = draft.market.contracts.find(
      (c) => needsProduction(c) && !claimed.has(c.id) && remainingToProduce(c, draft.market.shipments) > 0,
    )
    if (!contract) continue

    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.grade = contract.grade
    line.status = 'running'
    line.blockedReason = null
    claimed.add(contract.id)
  }

  // 3) Producera.
  for (const line of house.lines) {
    if (!line.assignedContractId) continue
    const contract = draft.market.contracts.find((c) => c.id === line.assignedContractId)
    if (!needsProduction(contract)) continue

    const remaining = remainingToProduce(contract, draft.market.shipments)
    if (remaining <= 0) continue // frigörs nästa tur av steg 1

    const product = getProduct(contract.productId)
    // Avsnitt 4.1: produktionstakten styrs av PRODUKTEN (unitsPerLineTurn), inte av
    // en platt line.unitsPerTurnAtFull som var lika för alla produkter — se
    // ANDRINGSLOGG.md (P16). lineEfficiency är 1,0 för alla linjer i dagens
    // scenario (alla linjer delar husets unitsPerLineTurnDefault), men ger
    // BUILD_LINE (avsnitt 8, ännu obyggd) något att variera senare.
    const lineEfficiency = line.unitsPerTurnAtFull / house.unitsPerLineTurnDefault
    const lineThroughput = product.unitsPerLineTurn * (line.capacityPct / 100) * lineEfficiency
    const plannedUnits = Math.min(remaining, Math.floor(lineThroughput))
    if (plannedUnits <= 0) continue

    const unitCostNow = computeUnitCostNow(product, line.grade, draft.market.supplyCostIndex)
    const affordableUnits = unitCostNow > 0 ? Math.floor(house.treasury / unitCostNow) : plannedUnits
    const actualUnits = Math.max(0, Math.min(plannedUnits, affordableUnits))
    const cost = unitCostNow * actualUnits
    house.treasury -= cost

    if (actualUnits < plannedUnits) {
      // Saknas täckning: producera så mycket kassan räcker till, aldrig gratis
      // (spec 5). Linjen blockeras, den stoppas inte.
      line.status = 'blocked'
      line.blockedReason = 'insufficient cash'
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${line.id.toUpperCase()} BLOCKED: INSUFFICIENT CASH (PRODUCED ${actualUnits}/${plannedUnits})`,
        causeId: null,
        delta: { treasury: -cost },
        actorIsPlayer: false,
        subjectId: null,
      })
    } else {
      line.status = 'running'
      line.blockedReason = null
    }

    if (actualUnits > 0) {
      const arrivalTurn = draft.meta.turn + rng.int(BALANCE.deliveryDelayMinTurns, BALANCE.deliveryDelayMaxTurns)
      draft.market.shipments.push({
        id: `shipment-${contract.id}-${draft.meta.turn}`,
        contractId: contract.id,
        units: actualUnits,
        arrivalTurn,
      })
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${line.id.toUpperCase()} PRODUCES ${actualUnits}× ${product.name.toUpperCase()} FOR ${contract.id} (−£${cost.toLocaleString('en-GB')})`,
        causeId: null,
        delta: { treasury: -cost },
        actorIsPlayer: true,
        subjectId: null,
      })
    }
  }
}
