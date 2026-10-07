// worksPolicy — P182 (ETAPP11_FORSLAG.md §9): hur `human` sköter verken. Enkla regler, ingen optimering: en spelare som läser tavlan, inte en lösare.
//   - bud: grindas av "ready by" (`capacityOutlook`), inte av antalet lediga linjer — ett bud som inte hinner läggs inte, och redan beslutade bud den här turen räknas in;
//   - drift: underhåll höjs när skicket sjunker, strejker besvaras, bemanningen hålls på full styrka;
//   - bygge: utbyggnad när kapaciteten är trång, nya monteringsverk i fler kategorier (breda varianter), linjer fylls på med BUILD_LINE;
//   - plan: ett väntande kontrakt läggs på en linje som redan är uppsatt för produkten (så att omställningen slipper);
//   - utläggning: bara varianten `outsource`, som lägger ut i stället för att bygga.
// Allt är stående order (ingen handling) utom BUILD_LINE. Ren härness — ingen core-ändring.
import {
  TECH_CATEGORIES,
  allLines,
  assemblyWorks,
  capacityOutlook,
  cashPartOf,
  freeLineSlots,
  getProduct,
  lineMayBuild,
  maintenanceOf,
  planBuild,
  productionBoard,
  projectedQuarter,
  totalFixedCosts,
  validateAction,
  validateBid,
  validateStandingOrderChange,
} from '@seventh-front/core'
import type { Bid, Contract, GameState, MaintenanceLevel, PlayerAction, StandingOrderChange, TechCategory } from '@seventh-front/core'

export type WorksStyle = 'static' | 'steady' | 'eager'
export type WorksCategories = 'start' | 'broad'

export interface WorksOptions {
  style: WorksStyle // static: bygger aldrig · steady: bygger ut när det är trångt · eager: bygger tidigt och mycket
  categories: WorksCategories // start: bara startkategorin · broad: monteringsverk i tre kategorier, grunt
  gate: 'outlook' | 'none' // bud grindas av "ready by" — eller inte alls (utläggningsvarianten tar sena bud och lägger ut)
  outsource: boolean // lägger ut väntande kontrakt (50 %) i stället för att bygga
  expandAlways: boolean // specialisten: bygger ut verket så fort kassan tillåter, tryck eller ej
}

export const DEFAULT_WORKS: WorksOptions = { style: 'steady', categories: 'start', gate: 'outlook', outsource: false, expandAlways: false }

const CONDITION_RAISE_BELOW = 70 // skicket under detta: höjt underhåll
const CONDITION_RELAX_FROM = 90 // skicket från detta: tillbaka till normalt
const PRESSURE_RUNNING_SHARE = 0.75 // så stor andel av linjerna går: kapaciteten är trång
const BUILD_RESERVE_SHARE = 0.25 // steady: byggen betalas bara om kassan efter första raten, utöver FIXED_COST_QUARTERS kvartals fasta kostnader, är över så här stor andel av grundkapitalet
const FIXED_COST_QUARTERS = 2 // ... och kassan räcker till så många kvartal av husets fasta kostnader (kassan sjunker tills kontrakten betalar — bygget får inte fälla huset i dalen)
const EAGER_FIXED_COST_QUARTERS = 1 // eager: bara ett kvartals fasta kostnader i reserv
const EAGER_RESERVE_SHARE = 0.1 // eager: ingen reserv — att bygga för mycket ska kunna fälla huset
const STRIKE_CONCEDE_SHARE = 0.5 // ge med sig i en strejk bara om kassan är över så här stor andel av grundkapitalet, annars bryt den
const PLAN_MAX_PER_TURN = 2
const OUTSOURCE_SHARE_PCT = 50
const BROAD_CATEGORIES = 3

const reserve = (state: GameState, share: number): number => state.house.foundingCapital * share

// Bud som husets egna redan avgjorda bud den här turen räknas in som väntande kontrakt (samma fiktion som tavlan visar), så att nästa kandidat ser kön som den blir.
export function withPendingBids(state: GameState, accepted: Bid[]): GameState {
  if (accepted.length === 0) return state
  const pending: Contract[] = accepted.flatMap((bid) => {
    const order = state.market.openOrders.find((o) => o.id === bid.orderId)
    if (!order) return []
    return [
      {
        id: `pending-${bid.orderId}`, buyerId: order.buyerId, productId: order.productId, quantity: order.quantity, unitsDelivered: 0, price: bid.price, unitCostAtSigning: 0,
        grade: bid.grade, dueTurn: state.meta.turn + bid.deliveryTurns, status: 'active', lateEventId: null, frontId: order.frontId, advancePct: 0, advancePaid: 0,
        ...(bid.designId ? { designId: bid.designId } : {}),
      } as Contract,
    ]
  })
  return { ...state, market: { ...state.market, contracts: [...state.market.contracts, ...pending] } }
}

// Hinner ordern i tid, med dagens plan och de bud som redan lagts? (utläggning via underleverantör räknas — outlooken tar hänsyn till den.)
export function fitsCapacity(state: GameState, accepted: Bid[], bid: Bid): boolean {
  const order = state.market.openOrders.find((o) => o.id === bid.orderId)
  if (!order) return false
  const outlook = capacityOutlook(withPendingBids(state, accepted), { productId: order.productId, quantity: order.quantity, designId: bid.designId ?? null, deliveryTurns: bid.deliveryTurns })
  return outlook.late !== true && outlook.readyTurn !== null
}

function pressure(state: GameState): boolean {
  const lines = allLines(state.house)
  if (lines.length === 0) return false
  const running = lines.filter((l) => l.status === 'running' || l.status === 'retooling').length / lines.length
  return running >= PRESSURE_RUNNING_SHARE || productionBoard(state).contracts.some((c) => c.late)
}

const valid = (state: GameState, change: StandingOrderChange): boolean => validateStandingOrderChange(state, state, change).ok

function driftOrders(state: GameState): StandingOrderChange[] {
  const out: StandingOrderChange[] = []
  const house = state.house
  for (const w of house.works) {
    if (w.status === 'strike') {
      const response = house.treasury >= reserve(state, STRIKE_CONCEDE_SHARE) ? 'concede' : 'break'
      const change: StandingOrderChange = { kind: 'WORKFORCE', op: 'STRIKE', facilityId: w.id, response }
      if (valid(state, change)) out.push(change)
      continue
    }
    if (w.kind === 'assembly' && w.status === 'operating') {
      const current: MaintenanceLevel = maintenanceOf(house, w.id)
      const wanted: MaintenanceLevel = w.condition < CONDITION_RAISE_BELOW ? 'high' : w.condition >= CONDITION_RELAX_FROM ? 'normal' : current
      if (wanted !== current) out.push({ kind: 'MAINTENANCE', facilityId: w.id, level: wanted })
    }
    if (w.status === 'operating' && w.staffing < 100 && house.standingOrders?.workforce?.[w.id] === undefined) {
      const change: StandingOrderChange = { kind: 'WORKFORCE', op: 'SET', facilityId: w.id, staffing: 100 }
      if (valid(state, change) && house.treasury >= reserve(state, STRIKE_CONCEDE_SHARE)) out.push(change)
    }
  }
  return out
}

// Kategorier huset kan sälja i men saknar ett monteringsverk för: de som har en öppen order och en tekniknivå som räcker.
function missingCategories(state: GameState): TechCategory[] {
  const built = new Set(assemblyWorks(state.house).map((w) => w.category))
  const wanted = new Set<TechCategory>()
  for (const order of state.market.openOrders) {
    const product = getProduct(order.productId)
    if (!built.has(product.category) && state.house.techLevel[product.category] >= product.techRequired) wanted.add(product.category)
  }
  return TECH_CATEGORIES.filter((c) => wanted.has(c))
}

// Kategorin där flest enheter just nu ligger hos en underleverantör (utlagda aktiva kontrakt), om huset saknar ett monteringsverk för den och tekniknivån räcker.
function outsourcedCategory(state: GameState): TechCategory | null {
  const built = new Set(assemblyWorks(state.house).map((w) => w.category))
  const units = new Map<TechCategory, number>()
  for (const c of productionBoard(state).contracts) {
    if (!(c.subcontracted || c.sharePct > 0) || c.remaining <= 0) continue
    const product = getProduct(c.productId)
    if (built.has(product.category) || state.house.techLevel[product.category] < product.techRequired) continue
    units.set(product.category, (units.get(product.category) ?? 0) + c.remaining)
  }
  let best: TechCategory | null = null
  for (const [category, n] of units) if (best === null || n > (units.get(best) ?? 0)) best = category
  return best
}

// P185 (11O): kategorin där flest ordrar går huset förbi just nu — öppna ordrar som huvudleverantörsregeln låser (inget monteringsverk i kategorin) och som tekniknivån räcker till. Störst sammanlagt
// referenspris vinner. null när inget är låst (regeln av, eller huset har verk överallt där det finns ordrar).
function passedByCategory(state: GameState): TechCategory | null {
  const value = new Map<TechCategory, number>()
  for (const order of state.market.openOrders) {
    if (validateBid(state, state, { orderId: order.id }).ok) continue
    const product = getProduct(order.productId)
    if (state.house.techLevel[product.category] < product.techRequired) continue
    value.set(product.category, (value.get(product.category) ?? 0) + order.referencePrice)
  }
  let best: TechCategory | null = null
  for (const [category, v] of value) if (best === null || v > (value.get(best) ?? 0)) best = category
  return best
}

// Första ratens storlek för ett bygge eller en utbyggnad (samma plan som motorn räknar med).
function instalmentOf(state: GameState, change: StandingOrderChange): number {
  if (change.kind !== 'WORKS') return 0
  if (change.op === 'BUILD') return planBuild(change.facilityKind, 1, change.forced === true, change.abroad !== undefined).costPerTurn
  if (change.op === 'EXPAND') {
    const works = state.house.works.find((w) => w.id === change.facilityId)
    return works ? planBuild(works.kind, (works.level + 1) as 2 | 3, change.forced === true).costPerTurn : 0
  }
  return 0
}

function buildOrders(state: GameState, opts: WorksOptions): StandingOrderChange[] {
  if (opts.style === 'static') return []
  const house = state.house
  if (house.works.some((w) => w.build)) return [] // ett bygge i taget
  const share = opts.style === 'eager' ? EAGER_RESERVE_SHARE : BUILD_RESERVE_SHARE
  const trangt = opts.style === 'eager' || opts.expandAlways || pressure(state)
  const carry = (opts.style === 'eager' ? EAGER_FIXED_COST_QUARTERS : FIXED_COST_QUARTERS) * totalFixedCosts(projectedQuarter(state).fixedCosts)
  const afford = (change: StandingOrderChange): boolean => valid(state, change) && house.treasury >= reserve(state, share) + carry
  // P185 (11Q): räcker kassan inte för bygget kontant — men skulle räcka om en andel av första raten lånades — tar boten byggnadslån. Kassan som blir kvar efter den kontanta delen ska täcka reserven för
  // husets fasta kostnader (carry); en reservandel av grundkapitalet krävs inte, det är just den lånet ersätter.
  const withFinancing = (change: StandingOrderChange): StandingOrderChange | null => {
    if (afford(change)) return change
    if (change.kind !== 'WORKS' || (change.op !== 'BUILD' && change.op !== 'EXPAND')) return null
    const loan: StandingOrderChange = { ...change, financing: 'loan' }
    const firstCash = cashPartOf(instalmentOf(state, change), 'loan')
    return valid(state, loan) && house.treasury - firstCash >= carry ? loan : null
  }

  // 0) Steady och eager: ett nytt monteringsverk där huset just nu betalar en underleverantör — det är vad en spelare som läser tavlan gör.
  if (opts.categories === 'start' && !opts.expandAlways) {
    const category = passedByCategory(state) ?? outsourcedCategory(state)
    if (category) {
      const change: StandingOrderChange = { kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category }
      const financed = withFinancing(change)
      if (financed) return [financed]
    }
  }
  // 1) Ett nytt monteringsverk i en saknad kategori (breda varianter), upp till tre kategorier.
  if (opts.categories === 'broad' && new Set(assemblyWorks(house).map((w) => w.category)).size < BROAD_CATEGORIES) {
    const category = missingCategories(state)[0]
    if (category) {
      const change: StandingOrderChange = { kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category }
      const financed = withFinancing(change)
      if (financed) return [financed] // bredden byggs tidigt, trångt eller inte
    }
  }
  if (!trangt) return []
  // 2) Bygg ut första monteringsverket som inte nått nivå 3 (fler linjer, mer plats). Breda varianter bygger inte ut, de bygger ut i bredd.
  if (opts.categories === 'start' || opts.style === 'eager') {
    const works = assemblyWorks(house).find((w) => w.level < 3 && w.status === 'operating' && freeLineSlots(w) === 0)
    if (works) {
      const change: StandingOrderChange = { kind: 'WORKS', op: 'EXPAND', facilityId: works.id }
      const financed = withFinancing(change)
      if (financed) return [financed]
    }
  }
  return []
}

// Ett väntande kontrakt (ingen linje, ingen plan) läggs på en LEDIG linje som redan är uppsatt för produkten och får bygga kategorin.
function planOrders(state: GameState): StandingOrderChange[] {
  const house = state.house
  const board = productionBoard(state)
  const planned = new Set(board.lines.flatMap((l) => l.plan))
  const out: StandingOrderChange[] = []
  for (const contract of board.contracts) {
    if (out.length >= PLAN_MAX_PER_TURN) break
    if (contract.onLine || contract.subcontracted || planned.has(contract.contractId)) continue
    const product = getProduct(contract.productId)
    const line = allLines(house).find(
      (l) => l.status === 'idle' && l.tooling?.productId === contract.productId && lineMayBuild(house, l.id, product) && !(board.lines.find((b) => b.lineId === l.id)?.plan.length),
    )
    if (!line) continue
    const change: StandingOrderChange = { kind: 'PLAN', op: 'SET', lineId: line.id, contractIds: [contract.contractId] }
    if (valid(state, change)) {
      out.push(change)
      planned.add(contract.contractId)
    }
  }
  return out
}

function outsourceOrders(state: GameState): StandingOrderChange[] {
  const out: StandingOrderChange[] = []
  for (const c of productionBoard(state).contracts) {
    if (c.onLine || c.subcontracted || c.sharePct > 0 || c.remaining <= 0) continue
    const change: StandingOrderChange = { kind: 'OUTSOURCE', op: 'SET', contractId: c.contractId, sharePct: OUTSOURCE_SHARE_PCT }
    if (valid(state, change)) out.push(change)
  }
  return out
}

export function worksStandingOrders(state: GameState, opts: WorksOptions): StandingOrderChange[] {
  return [...driftOrders(state), ...buildOrders(state, opts), ...(opts.outsource ? outsourceOrders(state) : planOrders(state))]
}

// En ny linje i ett verk med ledig plats — den enda handlingen i verksskötseln (kostar en handlingspoäng). Bara när kassan tål det.
export function buildLineAction(state: GameState, opts: WorksOptions): PlayerAction[] {
  if (opts.style === 'static') return []
  const action: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }
  const share = opts.style === 'eager' ? EAGER_RESERVE_SHARE : BUILD_RESERVE_SHARE
  if (state.house.treasury < reserve(state, share) + 1_200_000) return []
  if (!(opts.style === 'eager' || pressure(state))) return []
  return validateAction(state, state, action).ok ? [action] : []
}

