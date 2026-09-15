// orders — genererar nya utlysningar, fryser referencePrice. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 4.1, 6, och (P45)
// ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.2.
//
// Två delar: (1) konsumerar scenariots scriptedEvents (idag bara RESTRICTED_ORDER,
// se data/scenarios/indochina-slice.json) på den tur de anger, OFÖRÄNDRAD sedan
// P45 (spec 4.2: "behåll den scriptade grenen oförändrad"). (2) P45: ordinarie
// generering är nu BEHOVSDRIVEN, inte ett tärningskast — se
// `generateNeedDrivenOrders` nedan. `orderGenerationChancePct` (P4:s ursprungliga,
// uttryckligen PROVISORISKA kadensregel, se docs/ANDRINGSLOGG.md) är borttagen
// helt, ur både koden och balance.json, per P45:s egen instruktion. Ordinarie
// generering väljer aldrig en restricted produkt — de kommer bara från
// scriptedEvents, i linje med att de ska vara sällsynta och konsekventa
// (DESIGN.md avsnitt 5.2).
import indochinaSlice from '../../data/scenarios/indochina-slice.json' with { type: 'json' }
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import { allProducts, BALANCE, computeHeatForBuyer, computeReferencePrice, getProduct } from '../../pricing.js'
import type { ResolveStep, ResolveContext } from '../index.js'
import type { Faction, FactionId, Order, Product, RivalId, TechCategory } from '../../types.js'

interface NeedBalance {
  orderTriggerThreshold: Record<TechCategory, number>
  maxOrdersPerFactionPerTurn: number
}
const NEED_BALANCE = balanceData as unknown as NeedBalance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

interface ScriptedRestrictedOrder {
  turn: number
  type: 'RESTRICTED_ORDER'
  buyerId: FactionId
  productId: string
  quantity: number
}
interface ScenarioFile {
  id: string
  scriptedEvents: ScriptedRestrictedOrder[]
}
// Bara ett scenario i etapp 1. Samma mönster som state.ts:s SCENARIOS-katalog.
const SCENARIOS: Record<string, ScenarioFile> = {
  'indochina-slice': indochinaSlice as unknown as ScenarioFile,
}

interface NewOrderParams {
  id: string
  buyerId: FactionId
  product: Product
  quantity: number
  requiredDeliveryTurns: number
  currentTurn: number
  competingRivals: RivalId[]
  heat: number
  supplyCostIndex: number
  rng: import('../../rng.js').Rng
}

function buildOrder(p: NewOrderParams): Order {
  const referencePrice = computeReferencePrice(p.product, p.quantity, p.heat, p.supplyCostIndex)

  // trueBudget: köparens verkliga tak, ett stycke över/under referencePrice.
  // statedBudget: den siffra köparen UPPGER — "kan vara lögn" (spec 2.4) — alltid
  // en andel av trueBudget, aldrig högre.
  const trueBudgetFactor =
    p.rng.next() * (BALANCE.trueBudgetMaxFactor - BALANCE.trueBudgetMinFactor) + BALANCE.trueBudgetMinFactor
  const trueBudget = round(referencePrice * trueBudgetFactor)

  const statedBudgetFactor =
    p.rng.next() * (BALANCE.statedBudgetMaxFactor - BALANCE.statedBudgetMinFactor) + BALANCE.statedBudgetMinFactor
  const statedBudget = round(trueBudget * statedBudgetFactor)

  const inspectorIntegrity = p.rng.int(0, 100)

  return {
    id: p.id,
    buyerId: p.buyerId,
    productId: p.product.id,
    quantity: p.quantity,
    statedBudget,
    trueBudget,
    referencePrice,
    requiredDeliveryTurns: p.requiredDeliveryTurns,
    // Invariant (spec 3.2, test/invariants/order-lifetime.test.ts): expiresTurn >
    // skapelseturen. orderBiddingWindowTurns >= 1 garanterar det genom konstruktion.
    expiresTurn: p.currentTurn + BALANCE.orderBiddingWindowTurns,
    competingRivals: p.competingRivals,
    weights: { ...BALANCE.bidWeightsDefault },
    inspectorIntegrity,
  }
}

export const orders: ResolveStep = (ctx) => {
  const { draft, rng, emit } = ctx
  const scenario = SCENARIOS[draft.meta.scenarioId]
  const allRivalIds = Object.keys(draft.rivals)
  let seq = 0
  const nextId = (): string => `order-${draft.meta.turn}-${seq++}`

  // 1) Scriptade händelser för den här turen.
  if (scenario) {
    for (const scripted of scenario.scriptedEvents) {
      if (scripted.turn !== draft.meta.turn || scripted.type !== 'RESTRICTED_ORDER') continue
      const buyer = draft.factions[scripted.buyerId]
      if (!buyer || buyer.bankrupt) continue

      const product = getProduct(scripted.productId)
      const heat = computeHeatForBuyer(draft, scripted.buyerId)
      const order = buildOrder({
        id: nextId(),
        buyerId: scripted.buyerId,
        product,
        quantity: scripted.quantity,
        requiredDeliveryTurns: product.minDelivery + BALANCE.orderDeliverySlackTurns,
        currentTurn: draft.meta.turn,
        competingRivals: allRivalIds,
        heat,
        supplyCostIndex: draft.market.supplyCostIndex,
        rng,
      })
      draft.market.openOrders.push(order)
      emit({
        severity: 'headline',
        scope: 'market',
        headline: `${buyer.name.toUpperCase()} SEEKS ${product.name.toUpperCase()} × ${scripted.quantity}`,
        causeId: null,
        delta: { referencePrice: order.referencePrice },
        actorIsPlayer: false,
        subjectId: scripted.buyerId,
      })
    }
  }

  // 2) Ordinarie generering — behovsdriven (P45, avsnitt 4.2), inte längre ett
  // tärningskast. Se generateNeedDrivenOrders nedan.
  for (const [factionId, faction] of Object.entries(draft.factions)) {
    if (faction.bankrupt || faction.embargoed) continue
    generateNeedDrivenOrders(ctx, factionId, faction, allRivalIds, nextId)
  }
}

// Bästa produkt i en kategori en faktion får beställa: icke-restricted, och
// faktionens techLevel räcker. Vid flera kandidater (finns inga i dagens
// products.json — varje kategori har högst en icke-restricted produkt — men
// formeln ska hålla om det ändras) väljs den med högst techRequired, som en
// rimlig läsning av "bästa" (den mest avancerade produkten faktionen faktiskt
// klarar av).
function bestEligibleProduct(category: TechCategory, faction: Faction): Product | null {
  const eligible = allProducts().filter(
    (p) => p.category === category && !p.restricted && p.techRequired <= faction.techLevel[category],
  )
  if (eligible.length === 0) return null
  return eligible.reduce((best, p) => (p.techRequired > best.techRequired ? p : best))
}

// avsnitt 4.2, ordagrant: för varje faktion, gå igenom kategorierna i fallande
// behovsordning. Ett behov under tröskeln hoppas över. Finns ingen produkt att
// köpa för ett behov över tröskeln: "UNMET NEED". Går inte att få priset under
// militaryBudget ens vid minsta tillåtna kvantitet: "CANNOT AFFORD". Annars
// utlyses ordern och behovet konsumeras DIREKT (vid utlysning, inte leverans —
// annars utlyser faktionen samma behov om och om igen innan någon hunnit
// leverera). Högst NEED_BALANCE.maxOrdersPerFactionPerTurn ordrar per faktion
// och tur — därefter är resten av kategorierna moot, så loopen avbryts helt.
function generateNeedDrivenOrders(
  ctx: ResolveContext,
  factionId: FactionId,
  faction: Faction,
  allRivalIds: RivalId[],
  nextId: () => string,
): void {
  const { draft, rng, emit } = ctx
  const categoriesByFallingNeed = [...TECH_CATEGORIES].sort(
    (a, b) => faction.materielNeed[b] - faction.materielNeed[a],
  )
  const heat = computeHeatForBuyer(draft, factionId)

  let ordersIssued = 0
  for (const category of categoriesByFallingNeed) {
    if (ordersIssued >= NEED_BALANCE.maxOrdersPerFactionPerTurn) break
    if (faction.materielNeed[category] < NEED_BALANCE.orderTriggerThreshold[category]) continue

    const product = bestEligibleProduct(category, faction)
    if (!product) {
      emit({
        severity: 'ticker',
        scope: 'market',
        headline: `${faction.name.toUpperCase()}: UNMET NEED FOR ${category.toUpperCase()}`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: factionId,
      })
      continue
    }

    const quantityMin = product.orderQuantityMin ?? BALANCE.orderQuantityMin
    const quantityMax = product.orderQuantityMax ?? BALANCE.orderQuantityMax
    let quantity = clampQuantity(Math.round(faction.materielNeed[category]), quantityMin, quantityMax)
    let referencePrice = computeReferencePrice(product, quantity, heat, draft.market.supplyCostIndex)

    // Avsnitt 7.1.C/4.2: militaryBudget är en verklig gräns — pruta kvantiteten
    // ner i 25 %-steg innan ordern ges upp helt.
    while (referencePrice > faction.militaryBudget && quantity > quantityMin) {
      quantity = Math.floor(quantity * 0.75)
      referencePrice = computeReferencePrice(product, quantity, heat, draft.market.supplyCostIndex)
    }
    if (referencePrice > faction.militaryBudget) {
      emit({
        severity: 'ticker',
        scope: 'market',
        headline: `${faction.name.toUpperCase()} CANNOT AFFORD ${product.name.toUpperCase()} — NEED FOR ${category.toUpperCase()} GOES UNMET`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: factionId,
      })
      continue
    }

    const order = buildOrder({
      id: nextId(),
      buyerId: factionId,
      product,
      quantity,
      requiredDeliveryTurns: product.minDelivery + BALANCE.orderDeliverySlackTurns,
      currentTurn: draft.meta.turn,
      competingRivals: allRivalIds,
      heat,
      supplyCostIndex: draft.market.supplyCostIndex,
      rng,
    })
    draft.market.openOrders.push(order)
    // Golvat vid 0 (samma symmetri som needCeiling golvar taket) — se
    // ANDRINGSLOGG.md: en bokstavlig `need[c] -= quantity` driver need långt
    // negativt varje gång quantityMin > orderTriggerThreshold (m1_rifle: min
    // 500, infantry-tröskel 60), och ett djupt negativt need tar decennier av
    // peacetimeReplacement att arbeta av — en faktion som en gång beställt gevär
    // beställer aldrig fler. Utan golvet uppfylls inte P45:s eget klart när
    // ("minst 6 av 7 produkter beställda över 100 partier"), uppmätt 2/7.
    const needBefore = faction.materielNeed[category]
    faction.materielNeed[category] = Math.max(0, needBefore - quantity)
    ordersIssued++

    emit({
      severity: 'report',
      scope: 'market',
      headline: `${faction.name.toUpperCase()} SEEKS ${product.name.toUpperCase()} × ${quantity}`,
      causeId: null,
      delta: { referencePrice: order.referencePrice, [`materielNeed.${category}`]: faction.materielNeed[category] - needBefore },
      actorIsPlayer: false,
      subjectId: factionId,
    })
  }
}

function clampQuantity(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
