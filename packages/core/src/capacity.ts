// capacity — P172 (ETAPP11_FORSLAG.md §4.6): "ready by" och undanträngning. Budmappen visar när en order kan vara klar med dagens plan och vad den tränger undan. Frågan är ren (ingen
// slump, hård regel 2) och återanvänder det `production` redan räknar med — linjens takt (computeLineThroughput), omställningen (setupChange/setupCost) och underleverantörens takt —
// i en giraldig fördelning som liknar produktionens: första kontraktet i kön till den linje som blir fri först. Det är en uppskattning av när tillverkningen är klar, inte ett löfte:
// leveransen tar `deliveryDelayMinTurns`–`deliveryDelayMaxTurns` kvartal till (deliveredBetween), och slumpen (haveri, sen underleverantör) ingår inte.
import balanceData from './data/balance.json' with { type: 'json' }
import { canBuildHere, isActiveContract, lineMayBuild, ownRemaining, subcontractRate } from './outsourcing.js'
import { getProduct } from './pricing.js'
import { computeLineThroughput } from './resolve/steps/production.js'
import { currentTooling, setupChange, setupCost } from './tooling.js'
import type { Contract, DesignId, GameState, LineTooling, ProductId } from './types.js'
import { allLines } from './works.js'
import { estimateLineCompletionTurn } from './queries.js'

const BALANCE = balanceData as unknown as { deliveryDelayMinTurns: number; deliveryDelayMaxTurns: number }

export interface CapacityRequest {
  productId: ProductId
  quantity: number
  designId?: DesignId | null
  deliveryTurns?: number // för late/slack: ordern ska vara levererad så här många kvartal från nu
}

export interface CapacityOutlook {
  route: 'own' | 'subcontractor'
  line: string | null // linjen ordern skulle ställas på (null via underleverantör)
  readyTurn: number | null // tidigast färdigtillverkad
  deliveredBetween: [number, number] | null // tidigaste och senaste leveranskvartal (readyTurn + leveransfördröjningen)
  setupTurns: number // omställning på den linjen innan tillverkningen börjar
  waitingAhead: string[] // väntande kontrakt som ordern ställs bakom
  late: boolean | null // null om ingen leveranstid angetts
  slack: number | null // kvartal kvar till förfallodagen vid senast möjliga leverans (negativt = sen)
  // Om ordern i stället ställdes FÖRST i kön: vilka väntande kontrakt som då passerar sin förfallodag (och hur mycket de skjuts).
  displacesIfFirst: { contractId: string; delayTurns: number }[]
}

interface SimLine {
  id: string
  freeAt: number
  tooling: LineTooling | null
}

interface Job {
  id: string
  productId: ProductId
  designId: DesignId | null
  remaining: number
  dueTurn: number | null
}

interface Projection {
  readyById: Map<string, number | null>
  lineById: Map<string, string | null>
  setupById: Map<string, number>
  subcontractedById: Map<string, boolean>
}

function subcontractReady(turn: number, productId: ProductId, remaining: number): number {
  return turn + Math.ceil(remaining / subcontractRate(getProduct(productId)))
}

// Fördelar väntande jobb över linjerna och räknar klartid per jobb (kontrakt som redan står på en linje får sin egen skattade klartid).
function project(state: GameState, waiting: Job[]): Projection {
  const turn = state.meta.turn
  const house = state.house
  const result: Projection = { readyById: new Map(), lineById: new Map(), setupById: new Map(), subcontractedById: new Map() }

  const sim: SimLine[] = []
  for (const works of house.works) {
    if (works.kind !== 'assembly' || works.status !== 'operating') continue
    for (const line of works.lines) {
      let freeAt = turn
      if (line.assignedContractId) {
        const done = estimateLineCompletionTurn(state, line)
        if (done !== null) freeAt = Math.max(freeAt, done)
        result.readyById.set(line.assignedContractId, done)
      }
      if (line.status === 'retooling' && line.retoolingUntilTurn !== null) freeAt = Math.max(freeAt, line.retoolingUntilTurn)
      sim.push({ id: line.id, freeAt, tooling: currentTooling(line, state.market.contracts) })
    }
  }
  const lines = allLines(house)

  for (const job of waiting) {
    const product = getProduct(job.productId)
    if (!canBuildHere(house, product) || job.remaining <= 0) {
      result.readyById.set(job.id, job.remaining <= 0 ? turn : subcontractReady(turn, job.productId, job.remaining))
      result.lineById.set(job.id, null)
      result.setupById.set(job.id, 0)
      result.subcontractedById.set(job.id, job.remaining > 0)
      continue
    }
    let best: { sim: SimLine; setupTurns: number; start: number } | null = null
    for (const candidate of sim) {
      if (!lineMayBuild(house, candidate.id, product)) continue
      const setupTurns = setupCost(setupChange(house, candidate.tooling, { productId: job.productId, designId: job.designId })).turns
      const start = candidate.freeAt + setupTurns
      if (!best || start < best.start) best = { sim: candidate, setupTurns, start }
    }
    if (!best) {
      result.readyById.set(job.id, subcontractReady(turn, job.productId, job.remaining))
      result.lineById.set(job.id, null)
      result.setupById.set(job.id, 0)
      result.subcontractedById.set(job.id, true)
      continue
    }
    const real = lines.find((l) => l.id === best!.sim.id)!
    const rate = computeLineThroughput(house, real, product)
    const ready = rate > 0 ? best.start + Math.ceil(job.remaining / rate) : null
    best.sim.freeAt = ready ?? best.start
    best.sim.tooling = { productId: job.productId, designId: job.designId }
    result.readyById.set(job.id, ready)
    result.lineById.set(job.id, best.sim.id)
    result.setupById.set(job.id, best.setupTurns)
    result.subcontractedById.set(job.id, false)
  }
  return result
}

// De väntande kontrakten: aktiva, utan linje, med något egen tillverkning kvar och inte helt utlagda — i kontraktslistans ordning (så som production tar dem).
function waitingJobs(state: GameState): Job[] {
  const onLine = new Set(allLines(state.house).map((l) => l.assignedContractId).filter((id): id is string => id !== null))
  return state.market.contracts
    .filter((c: Contract) => isActiveContract(c) && !onLine.has(c.id) && ownRemaining(c, state.market.shipments) > 0)
    .map((c) => ({ id: c.id, productId: c.productId, designId: c.designId ?? null, remaining: ownRemaining(c, state.market.shipments), dueTurn: c.dueTurn }))
}

export function capacityOutlook(state: GameState, request: CapacityRequest): CapacityOutlook {
  const turn = state.meta.turn
  const waiting = waitingJobs(state)
  const probe: Job = { id: '__probe__', productId: request.productId, designId: request.designId ?? null, remaining: request.quantity, dueTurn: request.deliveryTurns === undefined ? null : turn + request.deliveryTurns }

  const last = project(state, [...waiting, probe])
  const base = project(state, waiting)
  const first = project(state, [probe, ...waiting])

  const readyTurn = last.readyById.get(probe.id) ?? null
  const deliveredBetween: [number, number] | null = readyTurn === null ? null : [readyTurn + BALANCE.deliveryDelayMinTurns, readyTurn + BALANCE.deliveryDelayMaxTurns]
  const slack = request.deliveryTurns === undefined || deliveredBetween === null ? null : turn + request.deliveryTurns - deliveredBetween[1]

  const displaces: CapacityOutlook['displacesIfFirst'] = []
  for (const job of waiting) {
    if (job.dueTurn === null) continue
    const was = base.readyById.get(job.id)
    const now = first.readyById.get(job.id)
    if (was == null || now == null) continue
    if (was + BALANCE.deliveryDelayMaxTurns <= job.dueTurn && now + BALANCE.deliveryDelayMaxTurns > job.dueTurn) displaces.push({ contractId: job.id, delayTurns: now - was })
  }

  return {
    route: last.subcontractedById.get(probe.id) ? 'subcontractor' : 'own',
    line: last.lineById.get(probe.id) ?? null,
    readyTurn,
    deliveredBetween,
    setupTurns: last.setupById.get(probe.id) ?? 0,
    waitingAhead: waiting.map((j) => j.id),
    late: slack === null ? null : slack < 0,
    slack,
    displacesIfFirst: displaces,
  }
}
