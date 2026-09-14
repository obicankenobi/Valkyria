// pricing.ts — rena formler från ETAPP1_TEKNISK_SPEC.md avsnitt 4 (referenspris,
// styckkostnad, rivalbud, poängsättning). Delad mellan orders.ts, bidding.ts och
// queries.ts (bidEstimate).
//
// Ny fil, inte namngiven i specens avsnitt 1 — se docs/ANDRINGSLOGG.md för
// motiveringen. Kortversionen: bidEstimate MÅSTE approximera exakt vad bidding.ts
// faktiskt gör (spec 4.3 hela poängen med winBand), och två handkopierade
// implementationer av samma formler hade varit en tyst driftrisk. Ingen I/O, inget
// state-skrivande, ingen egen slumpkälla — anropande kod skickar in den Rng som ska
// användas (huvud-Rng:n i bidding.ts, en hash-seedad i queries.ts, se rng.ts/3.3).
import productsData from './data/products.json' with { type: 'json' }
import balanceData from './data/balance.json' with { type: 'json' }
import { round } from './money.js'
import type { Rng } from './rng.js'
import type { FactionId, GameState, Grade, House, Money, Pct, Product, ProductId, RivalHouse } from './types.js'

interface Balance {
  heatPriceElasticity: number
  scarcityPriceDivisor: number
  gradePriceFactor: Record<Grade, number>
  gradeCostFactor: Record<Grade, number>
  rivalCashFloor: number
  rivalMarginBase: number
  rivalMarginAggressionScale: number
  rivalCashPressurePenalty: number
  rivalSpecialisationBonus: number
  rivalJitterRange: number
  rivalDeliveryJitterTurns: number
  scoreBase: number
  priceTermWeight: number
  deliveryTermWeight: number
  relationTermWeight: number
  bribeTermScale: number
  bribeTermMultiplier: number
  repTermReliabilityDivisor: number
  repTermQualityDivisor: number
  blocPenaltyScale: number
  relationBoostMin: number
  relationBoostMax: number
  orderGenerationChancePct: number
  orderQuantityMin: number
  orderQuantityMax: number
  orderDeliverySlackTurns: number
  orderBiddingWindowTurns: number
  statedBudgetMinFactor: number
  statedBudgetMaxFactor: number
  trueBudgetMinFactor: number
  trueBudgetMaxFactor: number
  reliabilityBidFloor: number
  bidWeightsDefault: { price: number; delivery: number; relationship: number }
}

export const BALANCE = balanceData as unknown as Balance

// ── Produktkatalog ───────────────────────────────────────────────────────────
// Statisk referensdata, precis som balance.json. Läses här (inte i varje
// konsumerande fil för sig) av samma DRY-skäl som resten av filen.

const PRODUCTS = productsData as unknown as Product[]
const PRODUCTS_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]))

export function getProduct(productId: ProductId): Product {
  const product = PRODUCTS_BY_ID.get(productId)
  if (!product) {
    throw new Error(`getProduct: okänt productId "${productId}"`)
  }
  return product
}

export function allProducts(): readonly Product[] {
  return PRODUCTS
}

// ── 4.1 Referenspris och styckkostnad ────────────────────────────────────────

export function computeReferencePrice(product: Product, quantity: number, heat: Pct, supplyCostIndex: number): Money {
  const heatFactor = 1 + (heat / 100) * BALANCE.heatPriceElasticity
  const scarcityFactor = 1 + (supplyCostIndex - 100) / BALANCE.scarcityPriceDivisor
  return round(product.baseCost * quantity * heatFactor * scarcityFactor)
}

export function computeUnitCostNow(product: Product, grade: Grade, supplyCostIndex: number): Money {
  const gradeCostFactor = BALANCE.gradeCostFactor[grade]
  const supplyFactor = supplyCostIndex / 100
  return round(product.unitCost * gradeCostFactor * supplyFactor)
}

// heat hör till en teater, inte en köpare — men referencePrice behöver "köparens
// heat". Etapp 1 har en front/teater; en köpare som inte står på någon front (t.ex.
// Laos i INDOCHINA_SLICE) har ingen aktiv-krig-prispress och får heat 0. Ingen
// spec-motsägelse: bara en naturlig läsning av "ingen front → inget krig här".
export function computeHeatForBuyer(state: GameState, buyerId: FactionId): Pct {
  const front = Object.values(state.fronts).find((f) => f.sideA === buyerId || f.sideB === buyerId)
  if (!front) return 0
  const theatre = state.theatres[front.theatreId]
  return theatre ? theatre.heat : 0
}

// ── 4.2 Rivalernas bud ───────────────────────────────────────────────────────

export interface RivalBid {
  price: Money
  deliveryTurns: number
}

// Rivalernas bud har ingen grade-faktor i spec 4.2:s formel — rivaler bjuder alltid
// på en implicit grade A-nivå i den här modellen (de har inget Grade-fält att välja
// från). Se docs/ANDRINGSLOGG.md.
export function computeRivalBid(rng: Rng, rival: RivalHouse, product: Product, referencePrice: Money): RivalBid {
  const margin = BALANCE.rivalMarginBase - (rival.aggression / 100) * BALANCE.rivalMarginAggressionScale
  const pressure = rival.capital < BALANCE.rivalCashFloor ? -BALANCE.rivalCashPressurePenalty : 0
  const specBonus = rival.specialisation === product.category ? -BALANCE.rivalSpecialisationBonus : 0
  const jitter = rng.next() * BALANCE.rivalJitterRange - BALANCE.rivalJitterRange / 2

  const price = round(referencePrice * (1 + margin + pressure + specBonus + jitter))
  const deliveryTurns = rng.int(product.minDelivery, product.minDelivery + BALANCE.rivalDeliveryJitterTurns)

  return { price, deliveryTurns }
}

// ── 4.4 Avgörandet ───────────────────────────────────────────────────────────

// alignmentPenalty(faction.alignment, house) namnges i spec 4.4 men definieras
// aldrig — varken formel eller vad "house" bidrar med. PROVISORISK, flaggad i
// docs/ANDRINGSLOGG.md: skalad mot husets west-/eastStanding (det enda fält House
// har som matchar temat "anseende hos ett block"), noll för en helt neutral
// faktion, storleksordning kalibrerad mot repTerm så den varken dominerar eller
// försvinner. En riktig formel är en designfråga, inte en kodfråga.
export function alignmentPenalty(factionAlignment: number, house: House): number {
  if (factionAlignment === 0) return 0
  const side: 'westStanding' | 'eastStanding' = factionAlignment > 0 ? 'westStanding' : 'eastStanding'
  const standing = house.reputation[side]
  const strength = Math.abs(factionAlignment) / 100
  return ((standing - 50) / 50) * strength * BALANCE.blocPenaltyScale
}

export interface ScoreInput {
  bidPrice: Money
  bidDeliveryTurns: number
  bidGrade: Grade
  bidBribe: Money
  referencePrice: Money
  requiredDeliveryTurns: number
  weights: { price: number; delivery: number; relationship: number }
  inspectorIntegrity: Pct
  // Rivaler har inget spårat relationToPlayer/reputation (RivalHouse saknar
  // fälten spec 4.4:s prosa förutsätter — se ANDRINGSLOGG.md). 0/null ger dem
  // relationTerm 0 och repTerm 0: de konkurrerar på pris och leveranstid, precis
  // det spec 4.2 faktiskt modellerar för dem.
  relationToPlayer: Pct
  reputation: { reliability: Pct; quality: Pct } | null
  // Samma skäl: blocTerm 0 för rivaler, riktig alignmentPenalty(...) för spelaren.
  blocTerm: number
}

export function computeScore(input: ScoreInput): number {
  const effectiveRef = input.referencePrice * BALANCE.gradePriceFactor[input.bidGrade]

  const priceTerm = -input.weights.price * (input.bidPrice / effectiveRef - 1) * BALANCE.priceTermWeight
  const deliveryTerm =
    -input.weights.delivery * Math.max(0, input.bidDeliveryTurns - input.requiredDeliveryTurns) * BALANCE.deliveryTermWeight
  const relationTerm = input.weights.relationship * (input.relationToPlayer / 100) * BALANCE.relationTermWeight
  const bribeTerm =
    (input.bidBribe / effectiveRef) * BALANCE.bribeTermScale * (1 - input.inspectorIntegrity / 100) * BALANCE.bribeTermMultiplier
  const repTerm = input.reputation
    ? (input.reputation.reliability - 50) / BALANCE.repTermReliabilityDivisor +
      (input.reputation.quality - 50) / BALANCE.repTermQualityDivisor
    : 0

  return BALANCE.scoreBase + priceTerm + deliveryTerm + relationTerm + bribeTerm + repTerm + input.blocTerm
}
