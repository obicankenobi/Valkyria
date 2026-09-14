// queries.ts — härledda värden för UI, rena funktioner över state. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 4.3.
//
// bidEstimate drar ALDRIG ur huvud-Rng:n (CLAUDE.md hård regel 2, spec 3.3). Den
// skapar sin egen, hash-seedade Rng ur seed+orderId+grade och kastar den efter
// anropet — stabil inom en tur (samma indata ger bitvis identiskt resultat) och rör
// aldrig state.meta.rngCursor.
import balanceData from './data/balance.json' with { type: 'json' }
import { createRng } from './rng.js'
import type { Rng } from './rng.js'
import { alignmentPenalty, computeRivalBid, computeScore, getProduct, computeUnitCostNow, rivalBlocTerm } from './pricing.js'
import type { BidEstimate, GameState, Grade, Money, Order, Pct, RivalId } from './types.js'

const WIN_BAND_POINTS = 5
const MONTE_CARLO_SAMPLES = 100

// Tröskelvärden som UI:t ritar ut som markeringar i sina mätare. Läses HÄRIFRÅN,
// ur balance.json, så att appen aldrig upprepar en balanssiffra i sin egen kod —
// CLAUDE.md hård regel 5 gäller formellt bara packages/core, men drift-risken är
// exakt densamma i ett UI som ritar "krisgränsen" på fel ställe efter ett
// balanspass. Bara trösklar som FAKTISKT finns i balance.json exporteras; heatens
// 40/70 (spec avsnitt 5) är prosatal utan fält och ritas därför inte ut.
interface ThresholdBalance {
  doomsdayCrisisWatchThreshold: number
  doomsdayCrisisEventThreshold: number
  doomsdayNuclearExchangeThreshold: number
  heatEscalationThreshold: number
  supplyIndexMin: number
  supplyIndexMax: number
  crisisPushExchangePct: number
}
const THRESHOLD_BALANCE = balanceData as unknown as ThresholdBalance

export const DISPLAY_THRESHOLDS = {
  doomsdayCrisisWatch: THRESHOLD_BALANCE.doomsdayCrisisWatchThreshold,
  doomsdayCrisisEvent: THRESHOLD_BALANCE.doomsdayCrisisEventThreshold,
  doomsdayNuclearExchange: THRESHOLD_BALANCE.doomsdayNuclearExchangeThreshold,
  heatEscalation: THRESHOLD_BALANCE.heatEscalationThreshold,
  // P21 (spec 3.4): THE HOUSE ritar supplyCostIndex som en mätare mot 100-linjen —
  // samma "läs härifrån, upprepa aldrig en balanssiffra i appen"-motivering som
  // doomsday-/heat-trösklarna ovan.
  supplyIndexMin: THRESHOLD_BALANCE.supplyIndexMin,
  supplyIndexMax: THRESHOLD_BALANCE.supplyIndexMax,
  // P21 (spec 9.4): "PUSH:s 30 % ska stå utskrivet" i krismodalen.
  crisisPushExchangePct: THRESHOLD_BALANCE.crisisPushExchangePct,
} as const

// Samma motivering som DISPLAY_THRESHOLDS ovan, bara riktad mot en annan extern
// konsument: härnessens botpolicyer (packages/harness, ETAPP1_5_TEKNISK_SPEC.md
// avsnitt 10.2) behöver två balanstal för att respektera kapacitet/kassaläge utan
// att hårdkoda en balanssiffra i harness-paketet.
interface BotTuningBalance {
  passiveMaxConcurrentBids: number
  gradeCashPressureThreshold: number
}
const BOT_TUNING_BALANCE = balanceData as unknown as BotTuningBalance

export const BOT_BALANCE = {
  passiveMaxConcurrentBids: BOT_TUNING_BALANCE.passiveMaxConcurrentBids,
  gradeCashPressureThreshold: BOT_TUNING_BALANCE.gradeCashPressureThreshold,
} as const

// Prisintervallet, spec 4.3: hur brett bandet kring lägsta rivalbud visas, per
// effectiveDepth.
const DEPTH_BAND_PCT: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0.35,
  1: 0.22,
  2: 0.14,
  3: 0.08,
  4: 0.04,
  5: 0,
}

function effectiveDepth(state: GameState, buyerId: string): 0 | 1 | 2 | 3 | 4 | 5 {
  const station = state.house.stations.find((s) => s.nation === buyerId && s.status === 'active')
  const baseDepth = station ? station.depth : 0
  const bonus = state.house.staff.chiefSalesman > 75 ? 1 : 0
  // Matematiskt garanterat 0..5 (baseDepth är 0..5, bonus 0 eller 1, min(5,·) klampar).
  return Math.min(5, baseDepth + bonus) as 0 | 1 | 2 | 3 | 4 | 5
}

export function bidEstimate(state: GameState, order: Order, grade: Grade): BidEstimate {
  const product = getProduct(order.productId)
  const hashRng = createRng(`${state.meta.seed}:${order.id}:${grade}`, 0)

  const depth = effectiveDepth(state, order.buyerId)
  const pct = DEPTH_BAND_PCT[depth]

  const rivalBids: { rivalId: RivalId; price: Money }[] = []
  for (const rivalId of order.competingRivals) {
    const rival = state.rivals[rivalId]
    if (!rival) continue
    const bid = computeRivalBid(hashRng, rival, product, order.referencePrice)
    rivalBids.push({ rivalId, price: bid.price })
  }

  let lowest = rivalBids[0] ?? null
  for (const rb of rivalBids.slice(1)) {
    if (rb.price < lowest!.price) lowest = rb
  }
  const lowestPrice = lowest ? lowest.price : order.referencePrice

  const rivalPriceLow = Math.round(lowestPrice * (1 - pct))
  const rivalPriceHigh = Math.round(lowestPrice * (1 + pct))
  // "plus vilket hus som ligger lägst" — bara vid depth >= 4 (spec 4.3-tabellen).
  const lowestRivalHouse = depth >= 4 && lowest ? lowest.rivalId : null

  const yourUnitCost = computeUnitCostNow(product, grade, state.market.supplyCostIndex)

  const faction = state.factions[order.buyerId]
  const relationToPlayer = faction ? faction.relationToPlayer : 0
  const blocTerm = faction ? alignmentPenalty(faction.alignment, state.house) : 0

  const winBand = computeWinBand(hashRng, {
    order,
    product,
    grade,
    rivalPriceLow,
    rivalPriceHigh,
    relationToPlayer,
    reputation: state.house.reputation,
    blocTerm,
    rivals: state.rivals,
    factionAlignment: faction ? faction.alignment : 0,
  })

  return { rivalPriceLow, rivalPriceHigh, lowestRivalHouse, winBand, yourUnitCost }
}

interface WinBandInputs {
  order: Order
  product: ReturnType<typeof getProduct>
  grade: Grade
  rivalPriceLow: Money
  rivalPriceHigh: Money
  relationToPlayer: Pct
  reputation: { reliability: Pct; quality: Pct }
  blocTerm: number
  rivals: GameState['rivals']
  factionAlignment: number
}

// Monte Carlo-skattning: för varje prispunkt, kör MONTE_CARLO_SAMPLES simulerade
// omgångar rivalbud (dragna ur samma hash-Rng-ström) och räkna andelen där ett bud
// till det priset — med spelarens EGNA kända relation/rykte/blocTerm, ingen mut,
// leverans exakt vad ordern kräver — hade slagit alla icke-diskvalificerade
// rivalbud. Det är det ärliga sättet att uttrycka "dold information som
// sannolikhet" spec 4.3 efterlyser, snarare än att läcka en exakt siffra som ändå
// inte avgör anbudet.
function computeWinBand(hashRng: Rng, p: WinBandInputs): { price: Money; confidence: Pct }[] {
  const points: { price: Money; confidence: Pct }[] = []

  for (let i = 0; i < WIN_BAND_POINTS; i++) {
    const price =
      p.rivalPriceHigh === p.rivalPriceLow
        ? p.rivalPriceLow
        : Math.round(p.rivalPriceLow + ((p.rivalPriceHigh - p.rivalPriceLow) * i) / (WIN_BAND_POINTS - 1))

    const withinBudget = price <= p.order.trueBudget
    const playerScore = computeScore({
      bidPrice: price,
      bidDeliveryTurns: p.order.requiredDeliveryTurns,
      bidGrade: p.grade,
      bidBribe: 0,
      referencePrice: p.order.referencePrice,
      requiredDeliveryTurns: p.order.requiredDeliveryTurns,
      weights: p.order.weights,
      inspectorIntegrity: p.order.inspectorIntegrity,
      relationToPlayer: p.relationToPlayer,
      reputation: p.reputation,
      blocTerm: p.blocTerm,
    })

    let wins = 0
    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample++) {
      let beatsAllRivals = withinBudget

      for (const rivalId of p.order.competingRivals) {
        const rival = p.rivals[rivalId]
        if (!rival) continue
        const sampledBid = computeRivalBid(hashRng, rival, p.product, p.order.referencePrice)
        if (sampledBid.price > p.order.trueBudget) continue // diskvalificerad, ingen konkurrent

        // relationToPlayer/reputation/blocTerm är sedan P24 rivalens EGNA värden —
        // samma termer bidding.ts faktiskt avgör med, annars driver skattningen isär
        // från avgörandet (queries.ts:s egen huvudkommentar).
        const rivalScore = computeScore({
          bidPrice: sampledBid.price,
          bidDeliveryTurns: sampledBid.deliveryTurns,
          bidGrade: 'A',
          bidBribe: 0,
          referencePrice: p.order.referencePrice,
          requiredDeliveryTurns: p.order.requiredDeliveryTurns,
          weights: p.order.weights,
          inspectorIntegrity: p.order.inspectorIntegrity,
          relationToPlayer: rival.relations[p.order.buyerId] ?? 0,
          reputation: rival.reputation,
          blocTerm: rivalBlocTerm(rival, p.factionAlignment),
        })
        if (rivalScore >= playerScore) beatsAllRivals = false
      }

      if (beatsAllRivals) wins++
    }

    points.push({ price, confidence: Math.round((wins / MONTE_CARLO_SAMPLES) * 100) })
  }

  return points
}
