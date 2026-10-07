// stock — P175 (ETAPP11_FORSLAG.md §5.6, beslut 11F): depån och tillverkning på lager. Med en depå i drift kan en LEDIG linje bygga en produkt till lager (stående order STOCK: produkt och mål i
// enheter) — bara om linjen redan är uppsatt för just den produkten (lager ger ingen omställning) och depån har plats. Lagret binder pengar (en andel av bokfört värde per kvartal ingår i de fasta
// kostnaderna) och åldras: när det ledande blockets generation stiger faller värdet. Ett nyvunnet kontrakt för samma produkt fylls direkt ur lagret — leveransen anländer ett kvartal senare i stället
// för efter tillverkning och leveransfördröjning, vilket gör nödleveranser (Tet, en gap-chock) möjliga. Tal i balance.json (stock*) och data/facilities.json (depot.stockCapacity).
import balanceData from './data/balance.json' with { type: 'json' }
import facilitiesData from './data/facilities.json' with { type: 'json' }
import { recordExpense } from './ledger.js'
import { round } from './money.js'
import { computeUnitCostNow, getProduct } from './pricing.js'
import { frontierGeneration } from './race.js'
import { computeLineThroughput } from './resolve/steps/production.js'
import { runInCostFactor } from './runin.js'
import { currentTooling, setupChange } from './tooling.js'
import { lineMayBuild } from './outsourcing.js'
import { lineBreaksDown } from './maintenance.js'
import { isOnStrike } from './workforce.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, Contract, DesignId, GameState, House, Money, ProductId, StandingOrderChange } from './types.js'
import { allLines, worksOfLine } from './works.js'

const BALANCE = balanceData as unknown as { stockMaxTargetUnits: number; stockHoldingPctPerQuarter: number; stockAgingPerGeneration: number; stockDeliveryTurns: number }
const CAPACITY = (facilitiesData as unknown as { kinds: { depot: { stockCapacity: number[] } } }).kinds.depot.stockCapacity
type StockChange = Extract<StandingOrderChange, { kind: 'STOCK' }>

const money = (n: number): string => `£${n.toLocaleString('en-GB')}`

// Depån i drift (en depå per hus, maxCount 1): en under byggnad eller i strejk räknas inte.
export function depotInOperation(house: Pick<House, 'works'>) {
  return house.works.find((w) => w.kind === 'depot' && w.status === 'operating')
}

// Depåns plats i bokfört värde (0 utan depå i drift).
export function stockCapacity(house: Pick<House, 'works'>): Money {
  const depot = depotInOperation(house)
  return depot ? (CAPACITY[depot.level - 1] ?? 0) : 0
}

export const stockValue = (house: Pick<House, 'stock'>): Money => round((house.stock ?? []).reduce((sum, i) => sum + i.bookValue, 0))
export const stockUnitsOf = (house: Pick<House, 'stock'>, productId: ProductId, designId: DesignId | null = null): number =>
  (house.stock ?? []).filter((i) => i.productId === productId && i.designId === designId).reduce((sum, i) => sum + i.units, 0)

// Vad lagret kostar att hålla per kvartal (ingår i de fasta kostnaderna, economy.ts).
export const stockHolding = (house: Pick<House, 'stock'>): Money => round((stockValue(house) * BALANCE.stockHoldingPctPerQuarter) / 100)

export function standingStockTargets(house: Pick<House, 'standingOrders'>, turn: number): [ProductId, number][] {
  return Object.entries(house.standingOrders?.stock ?? {})
    .filter(([, o]) => turn >= o.sinceTurn)
    .map(([productId, o]) => [productId, o.targetUnits])
}

function fail(reason: string): ActionValidation {
  return { ok: false, reason }
}

export function validateStockChange(draft: Readonly<GameState>, change: StockChange): ActionValidation {
  if (change.op === 'CANCEL') return draft.house.standingOrders?.stock?.[change.productId] ? { ok: true } : fail('no stock order for that product')
  if (!depotInOperation(draft.house)) return fail('the house needs a depot in operation')
  try {
    getProduct(change.productId)
  } catch {
    return fail('unknown product')
  }
  if (!Number.isInteger(change.targetUnits) || change.targetUnits < 1 || change.targetUnits > BALANCE.stockMaxTargetUnits) return fail(`the stock target must be 1–${BALANCE.stockMaxTargetUnits} units`)
  return { ok: true }
}

export function applyStockChange(ctx: ResolveContext, change: StockChange): void {
  const { draft, emit } = ctx
  const orders = (draft.house.standingOrders.stock ??= {})
  if (change.op === 'CANCEL') {
    delete orders[change.productId]
    emit({ severity: 'ticker', scope: 'house', headline: `STANDING ORDER: BUILDING ${getProduct(change.productId).name.toUpperCase()} TO STOCK STOPPED (WHAT IS IN THE DEPOT STAYS)`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: null })
    return
  }
  orders[change.productId] = { targetUnits: change.targetUnits, sinceTurn: draft.meta.turn + 1 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STANDING ORDER: IDLE LINES BUILD ${getProduct(change.productId).name.toUpperCase()} TO STOCK, UP TO ${change.targetUnits} UNITS (FROM NEXT QUARTER)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
}

function addToStock(draft: GameState, productId: ProductId, designId: DesignId | null, units: number, cost: Money): void {
  const stock = (draft.house.stock ??= [])
  const generation = frontierGeneration(draft, getProduct(productId).category)
  const same = stock.find((i) => i.productId === productId && i.designId === designId && i.generation === generation)
  if (same) {
    same.units += units
    same.bookValue += cost
  } else {
    stock.push({ productId, designId, units, bookValue: cost, generation, builtTurn: draft.meta.turn })
  }
}

// Lediga linjer bygger till lager (anropas i `production` efter att kontrakten fått sina linjer). En linje bygger högst en produkt per tur.
export function buildToStock(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  const targets = standingStockTargets(house, turn)
  if (targets.length === 0 || !depotInOperation(house)) return
  for (const line of allLines(house)) {
    if (line.assignedContractId || line.status !== 'idle' || isOnStrike(house, line.id)) continue
    const works = worksOfLine(house, line.id)
    if (!works || works.status !== 'operating') continue
    const tooling = currentTooling(line, draft.market.contracts)
    for (const [productId, target] of targets) {
      const product = getProduct(productId)
      if (!lineMayBuild(house, line.id, product)) continue
      const change = setupChange(house, tooling, { productId, designId: null })
      if (change !== 'none' && change !== 'fresh') continue // lager ger ingen omställning
      const have = stockUnitsOf(house, productId)
      if (have >= target) continue
      const unitCost = computeUnitCostNow(product, 'A', draft.market.commodities) * runInCostFactor(line, product)
      if (unitCost <= 0) continue
      const room = Math.floor((stockCapacity(house) - stockValue(house)) / unitCost)
      const affordable = Math.floor(Math.max(0, house.treasury) / unitCost)
      const units = Math.min(Math.floor(computeLineThroughput(house, line, product)), target - have, room, affordable)
      if (units <= 0) continue
      if (lineBreaksDown(ctx, line)) break
      const cost: Money = Math.max(0, round(unitCost * units))
      house.treasury -= cost
      recordExpense(draft, 'production', cost)
      addToStock(draft, productId, null, units, cost)
      line.tooling = { productId, designId: null }
      line.productId = productId
      line.status = 'running'
      line.runIn = (line.runIn ?? 0) + units
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${line.id.toUpperCase()} BUILDS ${units}× ${product.name.toUpperCase()} TO STOCK (−${money(cost)}) — ${have + units}/${target} IN THE DEPOT`,
        causeId: null,
        delta: { treasury: -cost },
        actorIsPlayer: true,
        subjectId: line.id,
      })
      break
    }
  }
}

// Ett nyvunnet kontrakt fylls ur lagret (anropas i `bidding` direkt efter att kontraktet skapats): leveransen anländer stockDeliveryTurns kvartal senare.
export function deliverFromStock(ctx: ResolveContext, contract: Contract): void {
  const { draft, emit } = ctx
  const house = draft.house
  const items = (house.stock ?? []).filter((i) => i.productId === contract.productId && i.designId === (contract.designId ?? null) && i.units > 0)
  let need = contract.quantity
  let taken = 0
  for (const item of items) {
    if (need <= 0) break
    const take = Math.min(item.units, need)
    item.bookValue = Math.round(item.bookValue * ((item.units - take) / item.units))
    item.units -= take
    need -= take
    taken += take
  }
  if (taken <= 0) return
  house.stock = (house.stock ?? []).filter((i) => i.units > 0)
  if (house.stock.length === 0) delete house.stock
  draft.market.shipments.push({ id: `shipment-${contract.id}-stock`, contractId: contract.id, units: taken, arrivalTurn: draft.meta.turn + BALANCE.stockDeliveryTurns })
  emit({
    severity: 'report',
    scope: 'house',
    headline: `${taken}× ${getProduct(contract.productId).name.toUpperCase()} GO OUT FROM THE DEPOT ON ${contract.id.toUpperCase()}${taken < contract.quantity ? ` (${contract.quantity - taken} STILL TO BUILD)` : ' — THE WHOLE ORDER FROM STOCK'}`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: contract.id,
  })
}

// Lagret åldras: när det ledande blockets generation i produktens kategori stiger faller bokfört värde med stockAgingPerGeneration per steg.
export function advanceStock(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  for (const item of draft.house.stock ?? []) {
    const product = getProduct(item.productId)
    const generation = frontierGeneration(draft, product.category)
    if (generation <= item.generation) continue
    const steps = generation - item.generation
    const before = item.bookValue
    item.bookValue = Math.round(item.bookValue * Math.pow(1 - BALANCE.stockAgingPerGeneration / 100, steps))
    item.generation = generation
    emit({
      severity: 'report',
      scope: 'house',
      headline: `THE DEPOT'S ${item.units}× ${product.name.toUpperCase()} AGE — THE ${product.category.toUpperCase()} STATE OF THE ART MOVED ON; BOOK VALUE ${money(before)} → ${money(item.bookValue)}`,
      causeId: null,
      delta: { stockValue: item.bookValue - before },
      actorIsPlayer: false,
      subjectId: null,
    })
  }
}
