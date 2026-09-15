// orders — genererar nya utlysningar, fryser referencePrice. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 4.1, 6, och (P35)
// ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.2.
//
// Två delar: (1) konsumerar scenariots scriptedEvents (idag bara RESTRICTED_ORDER,
// se data/scenarios/indochina-slice.json) på den tur de anger, OFÖRÄNDRAD sedan
// P35 (spec 4.2: "behåll den scriptade grenen oförändrad"). (2) P35: ordinarie
// generering är nu BEHOVSDRIVEN, inte ett tärningskast — se
// `generateNeedDrivenOrders` nedan. `orderGenerationChancePct` (P4:s ursprungliga,
// uttryckligen PROVISORISKA kadensregel, se docs/ANDRINGSLOGG.md) är borttagen
// helt, ur både koden och balance.json, per P35:s egen instruktion. Ordinarie
// generering väljer aldrig en restricted produkt — de kommer bara från
// scriptedEvents, i linje med att de ska vara sällsynta och konsekventa
// (DESIGN.md avsnitt 5.2).
import indochinaSlice from '../../data/scenarios/indochina-slice.json' with { type: 'json' }
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import { allProducts, BALANCE, computeHeatForFront, computeReferencePrice, getProduct } from '../../pricing.js'
import type { ResolveStep, ResolveContext } from '../index.js'
import type { Faction, FactionId, FrontId, GameState, Order, OrderReason, Product, RivalId, TechCategory } from '../../types.js'

interface NeedBalance {
  orderTriggerThreshold: Record<TechCategory, number>
  maxOrdersPerFactionPerTurn: number
  weightPressureShift: number
  pressurePositionSpan: number
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
  weights: { price: number; delivery: number; relationship: number }
  rng: import('../../rng.js').Rng
  reason: OrderReason
  // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): vilken front leveransen är avsedd
  // för — null om ingen känd/vald (SCRIPTED).
  frontId: FrontId | null
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
    weights: p.weights,
    inspectorIntegrity,
    reason: p.reason,
    frontId: p.frontId,
  }
}

// P36 (avsnitt 4.3): "pressure(faction) = hur illa fronten går för faktionens
// sida, 0..1, härlett ur position-förändring senaste 3 turerna (front.trace)
// plus morale-underläge."
//
// P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 1.3/3.3): var computePressureForBuyer(draft,
// buyerId) fram till etapp 4 — sökte upp KÖPARENS (enda) front, ett mönster som
// tyst mätte fel front så fort en köpare stod på två. Tar nu en EXPLICIT frontId,
// precis som computeHeatForFront (pricing.ts) — anropsplatsen avgör vilken front
// som är relevant (se highestPressureFront nedan för "vilken", när det inte redan
// är känt via Order.reason).
//
// PROVISORISKT utöver det: hur "position-förändring" och "morale-underläge"
// kombineras till en 0..1-skala. "Plus" läst ordagrant (summan av två 0..1-
// termer, klampad till 1 — inte ett medelvärde). pressurePositionSpan
// (balance.json, PROVISORISKT) avgör hur många positionspoängs rörelse på tre
// turer som ensamt ger full press — se balance.json:s _p36_note.
function computePressureForFront(draft: GameState, buyerId: FactionId, frontId: FrontId): number {
  const front = draft.fronts[frontId]
  if (!front) return 0

  const side: 'a' | 'b' = front.sideA === buyerId ? 'a' : 'b'
  const otherSide: 'a' | 'b' = side === 'a' ? 'b' : 'a'

  // Position rör sig mot +100 (sida B:s pol) när B vinner mark — dåligt för A,
  // bra för B. "directionalDelta" är alltid positivt när DEN HÄR sidan förlorar
  // mark, oavsett vilken sida (a/b) den råkar vara.
  const trace = front.trace
  const oldest = trace[0]!
  const newest = trace[trace.length - 1]!
  const positionDelta = newest - oldest
  const directionalDelta = side === 'a' ? positionDelta : -positionDelta
  const positionPressure = clamp01(directionalDelta / NEED_BALANCE.pressurePositionSpan)

  const moraleDisadvantage = clamp01((front.morale[otherSide] - front.morale[side]) / 100)

  return clamp01(positionPressure + moraleDisadvantage)
}

// P44 (avsnitt 3.2): "PEACETIME_REPLACEMENT: vald — den av köparens fronter där
// pressure är högst. Ett försvarsdepartement köper till den front som går sämst."
// null om köparen inte står på någon front (t.ex. Laos, innan sin egen front i
// P45) — samma fallback som computePressureForFront/computeHeatForFront gav för
// en frontlös köpare innan P44.
//
// Deterministisk tie-break (samma princip som engagement.ts:s byDescendingStrength
// — CLAUDE.md hård regel 2, ingen RNG här): vid exakt lika pressure vinner lägst
// front.id, sorterat före sökningen så ordningen aldrig beror av
// Object.values-iterationsordning.
function highestPressureFront(draft: GameState, buyerId: FactionId): FrontId | null {
  const buyersFronts = Object.values(draft.fronts)
    .filter((f) => f.sideA === buyerId || f.sideB === buyerId)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (buyersFronts.length === 0) return null

  let best = buyersFronts[0]!
  let bestPressure = computePressureForFront(draft, buyerId, best.id)
  for (const front of buyersFronts.slice(1)) {
    const pressure = computePressureForFront(draft, buyerId, front.id)
    if (pressure > bestPressure) {
      best = front
      bestPressure = pressure
    }
  }
  return best.id
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function weightsForPressure(pressure: number): { price: number; delivery: number; relationship: number } {
  const shift = pressure * NEED_BALANCE.weightPressureShift
  return {
    price: BALANCE.bidWeightsDefault.price - shift,
    delivery: BALANCE.bidWeightsDefault.delivery + shift,
    relationship: BALANCE.bidWeightsDefault.relationship,
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
      // P44 (avsnitt 3.2): "SCRIPTED: null om scenariohändelsen inte anger
      // någon." scriptedEvents ger ingen front i dagens scenariodata — Order.
      // frontId blir null, men vikterna räknas ändå mot köparens mest pressade
      // front (samma princip som innan P44, bara explicit i stället för sökt).
      const weightingFront = highestPressureFront(draft, scripted.buyerId)
      const heat = weightingFront !== null ? computeHeatForFront(draft, weightingFront) : 0
      const pressure = weightingFront !== null ? computePressureForFront(draft, scripted.buyerId, weightingFront) : 0
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
        weights: weightsForPressure(pressure),
        rng,
        reason: { kind: 'SCRIPTED' },
        frontId: null,
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

  // 2) NYTT (P40, avsnitt 5.4): namngivna ersättningsordrar för förband som
  // blivit mauled/destroyed DEN HÄR TURENS strid — resolve/engagement.ts (kört
  // inuti steps/fronts.ts, tidigare i SAMMA turs pipeline) har redan fyllt
  // draft.pendingFormationReplacements.
  //
  // Tolkning (spec), motiverad: EGEN budget (maxOrdersPerFactionPerTurn),
  // separat från steg 3:s anonyma pool, inte delad med den. Avsnitt 5.3 punkt
  // 4 kallar den här efterfrågan uttryckligen "akut" — en faktion vars förband
  // just blev mauled har inget VAL att avstå, till skillnad från anonym
  // fredstidspåfyllning. En delad pool lät den anonyma grenen (eller flera
  // samtidiga mauled-händelser i SAMMA tur, vanligt eftersom en illa gynnad
  // tur ofta skadar flera förband på samma sida på en gång) konkurrera bort
  // "akuta" ersättningar — uppmätt (härnessen, n=200): tre samtidiga mauled-
  // händelser för samma faktion, bara två resulterade i en order, den tredje
  // föll bort tyst på den DELADE budgeten. Se docs/ANDRINGSLOGG.md.
  const namedOrdersIssuedThisTurn: Record<FactionId, number> = {}
  for (const request of draft.pendingFormationReplacements) {
    const faction = draft.factions[request.factionId]
    if (!faction || faction.bankrupt || faction.embargoed) continue

    const issued = namedOrdersIssuedThisTurn[request.factionId] ?? 0
    if (issued >= NEED_BALANCE.maxOrdersPerFactionPerTurn) continue

    // P44 (avsnitt 3.2): "REPLACE_FORMATION_LOSSES: härledd ur reason.formationId
    // → förbandets frontId." Redan känt (request.frontId, satt av engagement.ts)
    // — ingen sökning, och heat/pressure räknas mot EXAKT den fronten striden
    // faktiskt stod på, inte köparens eventuella andra front.
    const heat = computeHeatForFront(draft, request.frontId)
    const weights = weightsForPressure(computePressureForFront(draft, request.factionId, request.frontId))
    const issuedOrder = tryIssueOrder(
      ctx,
      request.factionId,
      faction,
      request.category,
      request.quantity,
      heat,
      weights,
      nextId,
      request.frontId,
      {
        kind: 'REPLACE_FORMATION_LOSSES',
        formationId: request.formationId,
        formationName: request.formationName,
        engagementWireId: request.engagementWireId,
      },
    )
    if (!issuedOrder) continue

    namedOrdersIssuedThisTurn[request.factionId] = issued + 1
    emit({
      severity: 'headline',
      scope: 'market',
      headline: `${faction.name.toUpperCase()} SEEKS ${issuedOrder.product.name.toUpperCase()} × ${issuedOrder.quantity} — REPLACING ${request.formationName.toUpperCase()}'S LOSSES`,
      causeId: request.statusEventId,
      delta: { referencePrice: issuedOrder.order.referencePrice },
      actorIsPlayer: false,
      subjectId: request.factionId,
    })
  }
  // Konsumerad denna tur, oavsett utfall (UNMET NEED/CANNOT AFFORD droppar den
  // — samma "inget omförsök samma tur"-princip som steg 3:s anonyma gren).
  draft.pendingFormationReplacements = []

  // 3) Ordinarie generering — behovsdriven (P35, avsnitt 4.2), inte längre ett
  // tärningskast. Egen budget, se steg 2:s motivering ovan. Se
  // generateNeedDrivenOrders nedan.
  for (const [factionId, faction] of Object.entries(draft.factions)) {
    if (faction.bankrupt || faction.embargoed) continue
    generateNeedDrivenOrders(ctx, factionId, faction, nextId)
  }
}

// Delad av steg 2 (namngiven) och generateNeedDrivenOrders (anonym): väljer
// produkt, klampar kvantitet mot produktens min/max, prutar mot militaryBudget
// i 25 %-steg (avsnitt 7.1.C/4.2), och bygger ordern om den går att få under
// budget. Emittar UNMET NEED/CANNOT AFFORD och returnerar null annars —
// anropspunkten avgör sin egen "SEEKS"-rubrik (de två grenarna har olika text).
function tryIssueOrder(
  ctx: ResolveContext,
  factionId: FactionId,
  faction: Faction,
  category: TechCategory,
  rawQuantity: number,
  heat: number,
  weights: { price: number; delivery: number; relationship: number },
  nextId: () => string,
  frontId: FrontId | null,
  reason: OrderReason,
): { order: Order; product: Product; quantity: number } | null {
  const { draft, rng, emit } = ctx

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
    return null
  }

  const quantityMin = product.orderQuantityMin ?? BALANCE.orderQuantityMin
  const quantityMax = product.orderQuantityMax ?? BALANCE.orderQuantityMax
  let quantity = clampQuantity(Math.round(rawQuantity), quantityMin, quantityMax)
  let referencePrice = computeReferencePrice(product, quantity, heat, draft.market.supplyCostIndex)

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
    return null
  }

  const order = buildOrder({
    id: nextId(),
    buyerId: factionId,
    product,
    quantity,
    requiredDeliveryTurns: product.minDelivery + BALANCE.orderDeliverySlackTurns,
    currentTurn: draft.meta.turn,
    competingRivals: Object.keys(draft.rivals),
    heat,
    supplyCostIndex: draft.market.supplyCostIndex,
    weights,
    rng,
    reason,
    frontId,
  })
  draft.market.openOrders.push(order)
  return { order, product, quantity }
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
function generateNeedDrivenOrders(ctx: ResolveContext, factionId: FactionId, faction: Faction, nextId: () => string): void {
  const { draft, emit } = ctx
  const categoriesByFallingNeed = [...TECH_CATEGORIES].sort(
    (a, b) => faction.materielNeed[b] - faction.materielNeed[a],
  )
  // P44 (avsnitt 3.2): "PEACETIME_REPLACEMENT: vald — den av köparens fronter
  // där pressure är högst." Samma front används för heat/pressure OCH lagras
  // som Order.frontId — de är samma val, inte två separata beräkningar.
  const frontId = highestPressureFront(draft, factionId)
  const heat = frontId !== null ? computeHeatForFront(draft, frontId) : 0
  const weights = weightsForPressure(frontId !== null ? computePressureForFront(draft, factionId, frontId) : 0)

  // Egen budget (maxOrdersPerFactionPerTurn), separat från steg 2:s namngivna
  // ersättningsordrar — se steg 2:s motivering (P40, avsnitt 5.4).
  let ordersIssued = 0
  for (const category of categoriesByFallingNeed) {
    if (ordersIssued >= NEED_BALANCE.maxOrdersPerFactionPerTurn) break
    if (faction.materielNeed[category] < NEED_BALANCE.orderTriggerThreshold[category]) continue

    const issuedOrder = tryIssueOrder(
      ctx,
      factionId,
      faction,
      category,
      faction.materielNeed[category],
      heat,
      weights,
      nextId,
      frontId,
      { kind: 'PEACETIME_REPLACEMENT' },
    )
    if (!issuedOrder) continue

    // Golvat vid 0 (samma symmetri som needCeiling golvar taket) — se
    // ANDRINGSLOGG.md: en bokstavlig `need[c] -= quantity` driver need långt
    // negativt varje gång quantityMin > orderTriggerThreshold (m1_rifle: min
    // 500, infantry-tröskel 60), och ett djupt negativt need tar decennier av
    // peacetimeReplacement att arbeta av — en faktion som en gång beställt gevär
    // beställer aldrig fler. Utan golvet uppfylls inte P35:s eget klart när
    // ("minst 6 av 7 produkter beställda över 100 partier"), uppmätt 2/7.
    const needBefore = faction.materielNeed[category]
    faction.materielNeed[category] = Math.max(0, needBefore - issuedOrder.quantity)
    ordersIssued++

    emit({
      severity: 'report',
      scope: 'market',
      headline: `${faction.name.toUpperCase()} SEEKS ${issuedOrder.product.name.toUpperCase()} × ${issuedOrder.quantity}`,
      causeId: null,
      delta: {
        referencePrice: issuedOrder.order.referencePrice,
        [`materielNeed.${category}`]: faction.materielNeed[category] - needBefore,
      },
      actorIsPlayer: false,
      subjectId: factionId,
    })
  }
}

function clampQuantity(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
