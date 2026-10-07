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
import { designUnitCostFactor } from '../../design.js'
import { computeUnitCostNow, getProduct, materialCostPerUnit } from '../../pricing.js'
import { round } from '../../money.js'
import { recordExpense } from '../../ledger.js'
import { plannedOnOtherLines, settleSupplyAgreements, standingLineOrder, standingPlan } from '../../standingOrders.js'
import { SETUP_LABEL, currentTooling, setupChange, setupCost } from '../../tooling.js'
import { autoOutsource, lineMayBuild, ownRemaining, runSubcontractors } from '../../outsourcing.js'
import type { ResolveStep } from '../index.js'
import type { Commodity, Contract, House, Product, ProductionLine, Shipment } from '../../types.js'
import { allLines } from '../../works.js'
import { advanceConstruction, worksSpeedFactor } from '../../construction.js'
import { advanceStock, buildToStock } from '../../stock.js'
import { advanceWorkforce, isOnStrike, lineShift, workforceSpeedFactor } from '../../workforce.js'
import { carryRunIn, runInCostFactor, runInRateFactor } from '../../runin.js'
import { advanceCondition, conditionQualityPenalty, lineBreaksDown, plantSpeedFactor } from '../../maintenance.js'

interface Balance {
  deliveryDelayMinTurns: number
  deliveryDelayMaxTurns: number
  retoolingTurns: number
  overtimeCapacityPct: number
  overtimeUnitCostFactor: number
  overtimeBreakdownChancePct: number
  doubleShiftCapacityPct: number
}
const BALANCE = balanceData as unknown as Balance

function needsProduction(contract: Contract | undefined): contract is Contract {
  return !!contract && (contract.status === 'active' || contract.status === 'late')
}

// P172: det som återstår för husets EGNA linjer — en utlagd del (underleverantören) räknas bort (outsourcing.ts).
function remainingToProduce(contract: Contract, shipments: readonly Shipment[]): number {
  return ownRemaining(contract, shipments)
}

// P85 (ETAPP7_TEKNISK_SPEC.md §13, P81-16): utbruten så att queries.ts kan
// härleda "när blir ett pågående kontrakt klart" (samma "en formel, en
// källa"-princip som computeFixedCostsBreakdown, economy.ts) utan att
// handkopiera avsnitt 4.1:s takt-formel. Oförändrad — bara flyttad ut ur
// steg 3 nedan, som nu anropar den i stället för att upprepa den.
export function computeLineThroughput(house: House, line: ProductionLine, product: Product): number {
  const lineEfficiency = line.unitsPerTurnAtFull / house.unitsPerLineTurnDefault
  // P170: ett monteringsverk under utbyggnad går på halv fart (construction.ts).
  // P173: bemanning och skicklighet (en strejk ger noll). P174: inkörningen, verkets skick och moderniseringarna.
  return (
    product.unitsPerLineTurn *
    (line.capacityPct / 100) *
    lineEfficiency *
    worksSpeedFactor(house, line.id) *
    workforceSpeedFactor(house, line.id) *
    runInRateFactor(line, product) *
    plantSpeedFactor(house, line.id)
  )
}

export const production: ResolveStep = (ctx) => {
  const { draft, rng, emit } = ctx
  const house = draft.house

  // P100 (ETAPP8_FORSLAG.md §5.1): leverantörsavtalen avräknas FÖRST, så innehavet redan är krediterat
  // när den här turens produktion räknar sin materialkostnad. Linjeuppdragens skift sätter capacityPct
  // (fältets första skrivare) — bara för linjer med en gällande order, så ett hus utan stående order
  // räknar exakt som förut.
  // P170: byggraterna betalas först (11H: bygge och inkörning räknas i production).
  advanceConstruction(ctx)
  advanceWorkforce(ctx) // P173: löneindex, bemanning, skicklighet, stämning och strejker
  settleSupplyAgreements(ctx)
  for (const line of allLines(house)) {
    const order = standingLineOrder(house, line.id, draft.meta.turn)
    if (order) {
      const shift = lineShift(house, line.id, draft.meta.turn) // P174: två skift kräver full bemanning
      line.capacityPct = shift === 'overtime' ? BALANCE.overtimeCapacityPct : shift === 'double' ? BALANCE.doubleShiftCapacityPct : 100
    }
  }

  // 0) Linjer vars omställning (P27, avsnitt 3.2) är klar den här turen återgår
  //    till normal drift innan resten av steget hinner röra dem.
  for (const line of allLines(house)) {
    if (line.status !== 'retooling') continue
    if (line.retoolingUntilTurn === null || draft.meta.turn < line.retoolingUntilTurn) continue
    line.status = 'running'
    line.retoolingUntilTurn = null
  }

  // Fångar varje linjes uppsättning INNAN steg 1 eventuellt nollställer productId —
  // "linjen BYTER uppsättning" (avsnitt 3.2, P171) går annars inte att avgöra, eftersom
  // en frigjord linje redan har productId: null när steg 2 tilldelar den på nytt
  // i SAMMA anrop. En linje med `tooling` behåller den även när den står ledig (P171).
  const previousTooling = new Map(allLines(house).map((l) => [l.id, currentTooling(l, draft.market.contracts)]))

  // 0b) P175: en linje utan kontrakt som byggde till lager (eller stod stilla) förra turen är ledig igen.
  for (const line of allLines(house)) {
    if (line.assignedContractId || (line.status !== 'running' && line.status !== 'blocked')) continue
    line.status = 'idle'
    line.blockedReason = null
    line.productId = null
  }

  // 1) Frigör linjer vars kontrakt inte längre behöver produktion (fulfilled/
  //    voided, eller redan färdigproducerat och väntar på leverans).
  for (const line of allLines(house)) {
    if (!line.assignedContractId) continue
    const contract = draft.market.contracts.find((c) => c.id === line.assignedContractId)
    const stillNeeded = needsProduction(contract) && remainingToProduce(contract, draft.market.shipments) > 0
    if (stillNeeded) continue

    // P100 LARM 1: en linje med ett stående uppdrag som tillverkade mot ett annullerat kontrakt
    // varnar — annars frigörs den tyst. causeId = kontraktets sena-/annulleringshändelse.
    if (contract?.status === 'voided' && house.standingOrders?.lines[line.id]) {
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `${line.id.toUpperCase()} WAS BUILDING FOR A VOIDED CONTRACT (${contract.id}) — FREED`,
        causeId: contract.lateEventId,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
    }

    line.assignedContractId = null
    line.productId = null
    line.status = 'idle'
    line.blockedReason = null
  }

  // 1b) P171: ett kontrakt som blivit färdigt, annullerat eller redan helt producerat städas ur produktionsplanerna (en rad när något städats).
  for (const [lineId, plan] of Object.entries(house.standingOrders?.plan ?? {})) {
    const stale = plan.contractIds.filter((id) => {
      const contract = draft.market.contracts.find((c) => c.id === id)
      return !(needsProduction(contract) && remainingToProduce(contract, draft.market.shipments) > 0)
    })
    if (stale.length === 0) continue
    plan.contractIds = plan.contractIds.filter((id) => !stale.includes(id))
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${lineId.toUpperCase()} PLAN: ${stale.join(', ').toUpperCase()} DONE — ${plan.contractIds.length === 0 ? 'THE LINE GOES BACK TO AUTOMATIC ASSIGNMENT' : `${plan.contractIds.length} LEFT IN THE PLAN`}`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
  }

  // 1c) P172: ett kontrakt som inget driftsatt verk kan bygga läggs ut av huset självt.
  autoOutsource(ctx)

  // 2) Tilldela lediga linjer till obemannade kontrakt som fortfarande behöver
  //    produceras. En kontraktsrad kan bara ha en linje åt gången.
  const claimed = new Set(allLines(house).map((l) => l.assignedContractId).filter((id): id is string => id !== null))
  for (const line of allLines(house)) {
    if (line.status !== 'idle') continue
    if (isOnStrike(house, line.id)) continue // P173: ett verk i strejk tar inga nya kontrakt

    // P100: ett linjeuppdrag med en kategori tar bara kontrakt i den kategorin; "fritt" (null) och en
    // linje utan order behåller den automatiska tilldelningen.
    const wantedCategory = standingLineOrder(house, line.id, draft.meta.turn)?.category ?? null
    // P171: linjens produktionsplan går först, i sin ordning; ett kontrakt som ligger i en ANNAN linjes plan är reserverat åt den linjen.
    // P172: en linje i ett monteringsverk med en kategori bygger bara den kategorin (ett verk utan kategori bygger allt).
    const claimable = (c: Contract | undefined): c is Contract =>
      needsProduction(c) && !claimed.has(c.id) && remainingToProduce(c, draft.market.shipments) > 0 && lineMayBuild(house, line.id, getProduct(c.productId))
    const planned = standingPlan(house, line.id, draft.meta.turn) ?? []
    const reserved = plannedOnOtherLines(house, line.id, draft.meta.turn)
    const contract =
      planned.map((id) => draft.market.contracts.find((c) => c.id === id)).find(claimable) ??
      draft.market.contracts.find(
        (c) => claimable(c) && !reserved.has(c.id) && (wantedCategory === null || getProduct(c.productId).category === wantedCategory),
      )
    if (!contract) continue

    // P27, avsnitt 3.2 + P171 (§4.5): en linje som BYTER uppsättning kostar tid och pengar — kort inom samma konstruktionsfamilj, längre för en ny konstruktion,
    // längst för en annan produkt. En helt ny linje (ingen uppsättning än) straffas inte, den startar bara upp.
    const change = setupChange(house, previousTooling.get(line.id) ?? null, contract)
    const setup = setupCost(change)
    carryRunIn(line, change) // P174: omställning nollställer inkörningen (samma familj behåller en del)
    line.tooling = { productId: contract.productId, designId: contract.designId ?? null }

    line.assignedContractId = contract.id
    line.productId = contract.productId
    line.grade = contract.grade
    line.blockedReason = null
    claimed.add(contract.id)

    if (setup.turns > 0) {
      line.status = 'retooling'
      line.retoolingUntilTurn = draft.meta.turn + setup.turns
      house.treasury -= setup.cost
      recordExpense(draft, 'retooling', setup.cost)
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${line.id.toUpperCase()} RETOOLS FOR ${getProduct(contract.productId).name.toUpperCase()} (${SETUP_LABEL[change as 'family' | 'design' | 'product']}) — IDLE ${setup.turns} QUARTER${setup.turns === 1 ? '' : 'S'}, −£${setup.cost.toLocaleString('en-GB')}`,
        causeId: null,
        delta: { treasury: -setup.cost },
        actorIsPlayer: true,
        subjectId: null,
      })
    } else {
      line.status = 'running'
    }
  }

  // 3) Producera.
  for (const line of allLines(house)) {
    if (!line.assignedContractId) continue
    if (line.status === 'retooling') continue // avsnitt 3.2: "producerar ingenting under omställningen"
    if (isOnStrike(house, line.id)) {
      // P173: strejk — linjen behåller sitt kontrakt men står still (och kontraktet väntar).
      line.status = 'blocked'
      line.blockedReason = 'strike'
      continue
    }
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
    const lineThroughput = computeLineThroughput(house, line, product)
    const plannedUnits = Math.min(remaining, Math.floor(lineThroughput))
    if (plannedUnits <= 0) continue

    // P174: ett nedslitet verk kan få ett haveri (en dragning bara när skicket är under tröskeln).
    if (lineBreaksDown(ctx, line)) continue
    // P100: övertid = högre styckkostnad + en liten slitagerisk (rng dras BARA för en linje på övertid).
    const overtime = standingLineOrder(house, line.id, draft.meta.turn)?.shift === 'overtime'
    if (overtime && rng.chance(BALANCE.overtimeBreakdownChancePct)) {
      line.status = 'blocked'
      line.blockedReason = 'overtime breakdown'
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${line.id.toUpperCase()} BREAKS DOWN UNDER OVERTIME — NO PRODUCTION THIS TURN`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
      continue
    }
    // P109: en konstruktions styckkostnadsfaktor (1 för ett kontrakt utan konstruktion).
    const unitCostNow =
      computeUnitCostNow(product, line.grade, draft.market.commodities) *
      (overtime ? BALANCE.overtimeUnitCostFactor : 1) *
      designUnitCostFactor(house, contract.designId) *
      runInCostFactor(line, product) // P174: inkörningen sänker styckkostnaden
    // affordableUnits räknas mot RÅ unitCostNow, inte mot kostnaden EFTER ett
    // BUY_FORWARD-innehav — en medveten förenkling (P51, avsnitt 4.5): ett
    // stort innehav sänker vad du FAKTISKT betalar, men relaxar inte hur
    // mycket en linje planeras producera samma tur. Se ANDRINGSLOGG.md.
    const affordableUnits = unitCostNow > 0 ? Math.floor(house.treasury / unitCostNow) : plannedUnits
    const actualUnits = Math.max(0, Math.min(plannedUnits, affordableUnits))

    // P51 (avsnitt 4.5): BUY_FORWARD-innehav sänker den FAKTISKT bokförda
    // materialkostnaden, per råvara — ett stålinnehav får aldrig subventionera
    // en produkts oljeandel (materialCostPerUnit delar upp kostnaden per
    // råvara, exakt samma termer computeUnitCostNow redan räknar, se
    // pricing.ts). Innehavet töms krona för krona i takt med att det täcker.
    const perUnitMaterialCost = materialCostPerUnit(product, line.grade, draft.market.commodities)
    let holdingsDiscount = 0
    const holdingsSpent: Partial<Record<Commodity, number>> = {}
    for (const [commodity, costPerUnit] of Object.entries(perUnitMaterialCost) as [Commodity, number][]) {
      if (costPerUnit <= 0 || actualUnits <= 0) continue
      const totalMaterialCost = costPerUnit * actualUnits
      const used = round(Math.min(house.commodityHoldings[commodity], totalMaterialCost))
      if (used <= 0) continue
      house.commodityHoldings[commodity] -= used
      holdingsSpent[commodity] = used
      holdingsDiscount += used
    }

    const cost = Math.max(0, round(unitCostNow * actualUnits - holdingsDiscount))
    house.treasury -= cost
    recordExpense(draft, 'production', cost)

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
      line.runIn = (line.runIn ?? 0) + actualUnits // P174: inkörningen växer med byggda enheter
      const penalty = conditionQualityPenalty(house, line.id)
      if (penalty > 0) house.reputation.quality = Math.max(0, house.reputation.quality - penalty) // P174: ett nedslitet verk bygger sämre
      const arrivalTurn = draft.meta.turn + rng.int(BALANCE.deliveryDelayMinTurns, BALANCE.deliveryDelayMaxTurns)
      draft.market.shipments.push({
        id: `shipment-${contract.id}-${draft.meta.turn}`,
        contractId: contract.id,
        units: actualUnits,
        arrivalTurn,
      })
      const holdingsDelta = Object.fromEntries(
        Object.entries(holdingsSpent).map(([commodity, used]) => [`commodityHoldings.${commodity}`, -used!]),
      )
      emit({
        severity: 'ticker',
        scope: 'house',
        headline:
          holdingsDiscount > 0
            ? `${line.id.toUpperCase()} PRODUCES ${actualUnits}× ${product.name.toUpperCase()} FOR ${contract.id} (−£${cost.toLocaleString('en-GB')}, −£${round(holdingsDiscount).toLocaleString('en-GB')} FROM FORWARD HOLDINGS)`
            : `${line.id.toUpperCase()} PRODUCES ${actualUnits}× ${product.name.toUpperCase()} FOR ${contract.id} (−£${cost.toLocaleString('en-GB')})`,
        causeId: null,
        delta: { treasury: -cost, ...holdingsDelta },
        actorIsPlayer: true,
        subjectId: null,
      })
    }
  }

  // 4) P172: underleverantörerna bygger sina delar (en leverans per utlagt kontrakt och tur).
  runSubcontractors(ctx)

  // 4b) P175: lediga linjer bygger till lager (stående order STOCK, kräver en depå).
  buildToStock(ctx)

  // 5) P174: slitage och underhåll.
  advanceCondition(ctx)

  // 6) P175: lagret åldras när blocket kliver en generation.
  advanceStock(ctx)
}
