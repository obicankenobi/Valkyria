// orders — genererar nya utlysningar, fryser referencePrice. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 4.1, 6.
//
// Två delar: (1) konsumerar scenariots scriptedEvents (idag bara RESTRICTED_ORDER,
// se data/scenarios/indochina-slice.json) på den tur de anger. (2) genererar
// ordinarie ordrar med en enkel, PROVISORISK kadens — specen ger prissättnings-
// formeln för en redan beslutad order, men aldrig hur ofta eller vilka köpare som
// utlyser en. Se docs/ANDRINGSLOGG.md. Ordinarie generering väljer aldrig en
// restricted produkt — de kommer bara från scriptedEvents, i linje med att de ska
// vara sällsynta och konsekventa (DESIGN.md avsnitt 5.2).
import indochinaSlice from '../../data/scenarios/indochina-slice.json' with { type: 'json' }
import { round } from '../../money.js'
import { allProducts, BALANCE, computeHeatForBuyer, computeReferencePrice, getProduct } from '../../pricing.js'
import type { ResolveStep } from '../index.js'
import type { Faction, FactionId, Order, Product, RivalId } from '../../types.js'

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

function isEligibleForRegularOrder(product: Product, faction: Faction): boolean {
  return !product.restricted && product.techRequired <= faction.techLevel[product.category]
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

  // 2) Ordinarie generering, en chans per faktion och tur.
  for (const [factionId, faction] of Object.entries(draft.factions)) {
    if (faction.bankrupt || faction.embargoed) continue
    if (!rng.chance(BALANCE.orderGenerationChancePct)) continue

    const eligible = allProducts().filter((p) => isEligibleForRegularOrder(p, faction))
    if (eligible.length === 0) continue

    const product = rng.pick(eligible)
    // Produktens egna orderQuantityMin/Max (avsnitt 4.2) om satta, annars
    // balance.json:s globala tal som fallback — se types.ts:s Product-kommentar.
    const quantityMin = product.orderQuantityMin ?? BALANCE.orderQuantityMin
    const quantityMax = product.orderQuantityMax ?? BALANCE.orderQuantityMax
    const quantity = rng.int(quantityMin, quantityMax)
    const heat = computeHeatForBuyer(draft, factionId)

    // Avsnitt 7.1.C: en faktion utlyser ingen order vars referencePrice överstiger
    // dess militaryBudget. Gäller bara ORDINARIE generering (den här grenen) —
    // INTE scenariots scriptade restricted-order (grenen ovan): den är en
    // avsiktlig, en gång per parti-frestelse (spec avsnitt 6) som ska stå kvar
    // oavsett rvns militärbudget den turen (7,2 M scriptad kvantitet ger ett
    // referencePrice som rutinmässigt överstiger även en välfylld budget, se
    // ANDRINGSLOGG.md) — att låta 7.1.C tysta den hade förstört designpelare 1:s
    // enda garanterade prövning.
    const referencePrice = computeReferencePrice(product, quantity, heat, draft.market.supplyCostIndex)
    if (referencePrice > faction.militaryBudget) continue

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
    emit({
      severity: 'report',
      scope: 'market',
      headline: `${faction.name.toUpperCase()} SEEKS ${product.name.toUpperCase()} × ${quantity}`,
      causeId: null,
      delta: { referencePrice: order.referencePrice },
      actorIsPlayer: false,
      subjectId: factionId,
    })
  }
}
