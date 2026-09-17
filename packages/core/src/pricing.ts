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
import type { Commodity, FrontId, GameState, Grade, House, Money, Pct, Product, ProductId, RivalHouse } from './types.js'

interface Balance {
  heatPriceElasticity: number
  scarcityPriceDivisor: number
  gradePriceFactor: Record<Grade, number>
  gradeCostFactor: Record<Grade, number>
  bomDefaultByCategory: Record<Product['category'], Partial<Record<Commodity, number>>>
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
  // P55 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.2): NON_ALIGNMENT fördubblar
  // alignmentPenalty/rivalBlocTerm:s utslag — läst här (delad av bidding.ts och
  // queries.ts, samma skäl som resten av den här filens BALANCE).
  agendaNonAlignmentBlocMultiplier: number
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

const COMMODITIES: readonly Commodity[] = ['oil', 'steel', 'uranium', 'titanium', 'rare_earths']

// P49 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.3): produktens egen bom, annars
// kategorins standard (avsnitt 4.3: "per-produkt-överskrivning bara där
// kategorin inte räcker"). Utbruten i P50 (avsnitt 4.4) — "krigsefterfrågan"-
// drivaren (deliveries.ts) och materialkostnadens uppdelning per råvara
// (production.ts, P51/avsnitt 4.5) behöver exakt samma fallback-regel som
// computeUnitCostNow redan använder, i stället för att duplicera den.
export function resolveBom(product: Product): Partial<Record<Commodity, number>> {
  return product.bom ?? BALANCE.bomDefaultByCategory[product.category]
}

// P49 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.3), ordagrant:
// unitCost × (1 − bomShare) + unitCost × Σ(bom[c] × commodities[c]/100).
// Vid baseline (alla commodities = 100) blir costFactor exakt 1, oavsett bom —
// samma resultat som formeln gav innan P49 (supplyFactor = supplyCostIndex/100 = 1).
export function computeUnitCostNow(product: Product, grade: Grade, commodities: Record<Commodity, number>): Money {
  const gradeCostFactor = BALANCE.gradeCostFactor[grade]
  const bom = resolveBom(product)

  let bomShare = 0
  let materialFactor = 0
  for (const commodity of COMMODITIES) {
    const share = bom[commodity] ?? 0
    bomShare += share
    materialFactor += share * (commodities[commodity] / 100)
  }
  const costFactor = 1 - bomShare + materialFactor

  return round(product.unitCost * gradeCostFactor * costFactor)
}

// P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5): computeUnitCostNows termer,
// uppdelade PER RÅVARA i stället för summerade till ett tal. production.ts
// behöver uppdelningen för att veta hur mycket av en enhets materialkostnad
// ett BUY_FORWARD-innehav i EN SPECIFIK råvara faktiskt kan täcka — en enda
// summerad kostnad hade låtit ett stålinnehav subventionera en oljetung
// produkts kostnad, fel enligt avsnitt 4.5 ("ett för stort innehav binder
// kassa" förutsätter att innehavet bara täcker SIN EGEN råvaras andel).
// Osummerad, oavrundad med avsikt — bara den slutliga, faktiskt bokförda
// kostnaden ska avrundas (money.ts, hård regel 8), inte varje mellanled.
export function materialCostPerUnit(product: Product, grade: Grade, commodities: Record<Commodity, number>): Partial<Record<Commodity, Money>> {
  const gradeCostFactor = BALANCE.gradeCostFactor[grade]
  const bom = resolveBom(product)
  const result: Partial<Record<Commodity, Money>> = {}
  for (const [commodity, share] of Object.entries(bom) as [Commodity, number][]) {
    result[commodity] = product.unitCost * gradeCostFactor * share * (commodities[commodity] / 100)
  }
  return result
}

// heat hör till en teater, inte en köpare — men referencePrice behöver "en fronts
// heat". P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 1.3): var computeHeatForBuyer(state,
// buyerId) fram till etapp 4 — sökte upp KÖPARENS front, samma "första matchande
// front"-mönster som orders.ts:s dåvarande computePressureForBuyer hade, och som
// tyst gett fel pris så fort en köpare stod på två fronter. Tar nu en EXPLICIT
// frontId i stället — anropsplatsen (orders.ts) vet redan vilken front ordern
// gäller (Order.frontId, samma resonemang som avsnitt 3.2/3.3). En köpare som inte
// står på någon front (t.ex. Laos, innan sin egen front i P45) har ingen
// aktiv-krig-prispress och får heat 0 — samma fallback som innan, bara flyttad
// till anropsplatsen (frontId null → 0, se orders.ts).
export function computeHeatForFront(state: GameState, frontId: FrontId): Pct {
  const front = state.fronts[frontId]
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

// rivalBlocTerm — RivalHouse-motsvarigheten till alignmentPenalty (spec 2.2,
// ETAPP2_TEKNISK_SPEC.md). RivalHouse har ingen löpande 0–100-skala som House.
// reputation.westStanding/eastStanding, bara en fast kategori (homeState). PRO-
// VISORISK, samma sorts platshållare som alignmentPenalty självt (se
// docs/ANDRINGSLOGG.md): en homeState-matchad rival får samma maximala svängning
// (±blocPenaltyScale vid strength 1) som en spelare med standing 100/0 skulle få —
// symmetriskt med avsikt, ingen ny, egen skala att kalibrera.
export function rivalBlocTerm(rival: RivalHouse, factionAlignment: number): number {
  if (factionAlignment === 0 || rival.homeState === 'neutral') return 0
  const strength = Math.abs(factionAlignment) / 100
  const aligned =
    (factionAlignment > 0 && rival.homeState === 'west') || (factionAlignment < 0 && rival.homeState === 'east')
  return (aligned ? 1 : -1) * strength * BALANCE.blocPenaltyScale
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
  // Sedan P24 (ETAPP2_TEKNISK_SPEC.md avsnitt 2.2) skickar bidding.ts/queries.ts
  // rivalens EGNA relations[buyerId]/reputation/rivalBlocTerm(...) här, inte
  // längre statiska nollor — RivalHouse fick fälten i P24 (avsnitt 2.1).
  // `| null` finns kvar av samma skäl som fanns innan repTerm-grenen skrevs för
  // en anropare som saknar reputation helt.
  relationToPlayer: Pct
  reputation: { reliability: Pct; quality: Pct } | null
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
