// programme — P122 (ETAPP9_FORSLAG.md §8.1, beslut 9I och 9M, skyddsräcke 7). Utvecklingsupphandlingen.
//
// Ett ministerium (en faktion) går ut med en anbudsinfordran i en kategori. Den utlöses av det som redan driver efterfrågan: ett
// kravkort (§7.1), en gap-chock (§7.2) eller en front där köparens behov länge vuxit. Målet är en till tre per parti. Faserna är
// announced → specLocked → development → trial → awarded. Husen anmäler sig utan handling (en stående order, kind PROGRAMME);
// hemstaten avgör om huset får delta. Forskningsanslaget betalas under utvecklingen. Provet poängsätts av en egen funktion,
// `evaluateTrial`, som inte är computeScore (skyddsräcke 7), och vinnaren får seriekontraktet som ett vanligt Contract. Ligger
// tvåan nära delas serien 70/30.
//
// P122 mäter deltagarna på sina sanna värden; P123 lägger provet i köparens miljö, prototypfaktorn, mätbruset och protokollet.
// Slump används inte här (P123 drar mätbruset med ctx.rng). Varje ändring emitterar en WireEvent med causeId (hård regel 4).
import balanceData from './data/balance.json' with { type: 'json' }
import { categoryReputation } from './bidTerms.js'
import { designBaseProduct, designBenchmark, designTrueValues, frontEnvironments, revealFlaw } from './design.js'
import { recordIncome } from './ledger.js'
import { round } from './money.js'
import { findOfficial } from './officials.js'
import { computeReferencePrice, computeUnitCostNow, getProduct } from './pricing.js'
import { blocOfFaction, buyerGeneration, designPhasedOutForBuyer, requirementCards, rivalDesignSpec } from './race.js'
import { projectOverheadPerTurn } from './research.js'
import { advanceAmount, computeAdvancePct } from './resolve/advance.js'
import type { Rng } from './rng.js'
import type { ResolveContext } from './resolve/index.js'
import type {
  ActionValidation,
  Contract,
  DesignEnvironment,
  FactionId,
  GameState,
  PlayerAction,
  Programme,
  ProgrammeEntrant,
  ProgrammeRequirement,
  RivalContract,
  StandingOrderChange,
  TechCategory,
  TrialRow,
  TrialScore,
} from './types.js'

type Bloc = 'west' | 'east'
interface Balance {
  orderDeliverySlackTurns: number
  needCeiling: number
  rivalDesignSpecEdge: number
  programmeMaxPerGame: number
  programmeFirstTurn: number
  programmeLastAnnounceTurn: number
  programmeCooldownTurns: number
  programmeNeedTrigger: number
  programmeDevelopmentTurns: number
  programmePrizeOrders: number
  programmePriceFraction: number
  programmePerformanceMargin: number
  programmeReliabilityFloor: number
  programmeUnitCostCeiling: number
  programmeDeliverySlackTurns: number
  programmeMandatoryWeight: number
  programmeShouldWeight: number
  programmeScoreScale: number
  programmeCostScale: number
  programmeDeliveryScale: number
  programmeRelationWeight: number
  programmeReputationWeight: number
  programmeNeutralRelationFactor: number
  programmeSplitMargin: number
  programmeSplitSharePct: number
  programmeGrantAmount: number
  programmeCostPlusMargin: number
  programmeCostPlusCapFactor: number
  programmeOverrunRelationPenalty: number
  programmeSpecialistBonus: number
  programmePrototypeMax: number
  programmeMeasureNoise: number
  programmeFlawReliabilityPenalty: number
  programmeFlawPerformancePenalty: number
  programmeTestedMargin: number
  programmeTestedQualityGain: number
  programmeCounterPurchaseScore: number
  programmeCounterPurchaseNonAlignedFactor: number
  programmeCounterPurchaseMarginPct: number
  qualityCategoryCap: number
  blocGenerationSchedule: Record<string, unknown>
}
const BALANCE = balanceData as unknown as Balance
const CATEGORIES = Object.keys(BALANCE.blocGenerationSchedule) as TechCategory[]

const isOpen = (p: Programme): boolean => p.phase !== 'awarded' && p.phase !== 'cancelled'

// ── behörighet och krav ──────────────────────────────────────────────────────

// Hemstaten avgör (9I): ett västhus får inte delta i ett östministeriums upphandling och tvärtom; neutrala hus deltar överallt,
// och en neutral köpare (inget block) släpper in alla.
export function programmeEligible(homeState: 'west' | 'east' | 'neutral', buyerBloc: Bloc | null): boolean {
  if (homeState === 'neutral' || buyerBloc === null) return true
  return homeState === buyerBloc
}

// Kravraderna för en köpares upphandling i en kategori. Prestandakravet följer köparens blocks generation (riktmärket).
export function programmeRequirements(state: Pick<GameState, 'race' | 'factions'>, buyerId: FactionId, category: TechCategory): ProgrammeRequirement[] {
  const product = designBaseProduct(category)
  return [
    { kind: 'performance', threshold: designBenchmark(buyerGeneration(state, buyerId, category)) + BALANCE.programmePerformanceMargin, mandatory: true, weight: BALANCE.programmeMandatoryWeight },
    { kind: 'reliability', threshold: BALANCE.programmeReliabilityFloor, mandatory: true, weight: BALANCE.programmeMandatoryWeight },
    { kind: 'unitCost', threshold: BALANCE.programmeUnitCostCeiling, mandatory: false, weight: BALANCE.programmeShouldWeight },
    { kind: 'delivery', threshold: product.minDelivery + BALANCE.programmeDeliverySlackTurns, mandatory: false, weight: BALANCE.programmeShouldWeight },
  ]
}

// ── anbudsinfordran ──────────────────────────────────────────────────────────

// Kandidaten i ett block med mest pengar som har råd med den minsta serien.
function pickBuyer(state: GameState, bloc: Bloc, category: TechCategory): FactionId | null {
  const product = designBaseProduct(category)
  const min = product.orderQuantityMin ?? 1
  let best: { id: FactionId; budget: number } | null = null
  for (const f of Object.values(state.factions).sort((a, b) => a.id.localeCompare(b.id))) {
    if (blocOfFaction(state, f.id) !== bloc) continue
    if (computeReferencePrice(product, min, 0, state.market.supplyCostIndex) > f.militaryBudget) continue
    if (!best || f.militaryBudget > best.budget) best = { id: f.id, budget: f.militaryBudget }
  }
  return best ? best.id : null
}

interface Trigger {
  trigger: Programme['trigger']
  buyerId: FactionId
  category: TechCategory
}

// Utlösarna i den ordning de prövas: kravkort (det blockets ministerium), gap-chock (det eftersläpande blockets) och en front där
// köparens behov nått programmeNeedTrigger. Ett block och en kategori har högst en öppen infordran.
function triggers(state: GameState): Trigger[] {
  const out: Trigger[] = []
  for (const card of requirementCards(state)) {
    if (card.inTurns !== 1) continue
    const buyerId = pickBuyer(state, card.bloc, card.category)
    if (buyerId) out.push({ trigger: 'requirementCard', buyerId, category: card.category })
  }
  for (const category of CATEGORIES) {
    const gap = state.race.gap?.[category]
    if (!gap || gap.sinceTurn !== state.meta.turn) continue
    const lagging: Bloc = gap.leader === 'west' ? 'east' : 'west'
    const buyerId = pickBuyer(state, lagging, category)
    if (buyerId) out.push({ trigger: 'gapShock', buyerId, category })
  }
  for (const category of CATEGORIES) {
    const hungry = Object.values(state.factions)
      .filter((f) => blocOfFaction(state, f.id) !== null && f.materielNeed[category] >= BALANCE.programmeNeedTrigger)
      .filter((f) => Object.values(state.fronts).some((fr) => fr.status === 'war' && (fr.sideA === f.id || fr.sideB === f.id)))
      .sort((a, b) => b.materielNeed[category] - a.materielNeed[category] || a.id.localeCompare(b.id))[0]
    if (hungry) out.push({ trigger: 'frontLoss', buyerId: hungry.id, category })
  }
  return out
}

// Går ut med en infordran om något är utlöst och taket, nedkylningen och tidsfönstret tillåter det. Anropas varje tur från steget `race`.
export function maybeAnnounceProgramme(ctx: ResolveContext): Programme | null {
  const { draft, emit } = ctx
  const turn = draft.meta.turn
  const existing = draft.programmes ?? []
  if (turn < BALANCE.programmeFirstTurn || turn > BALANCE.programmeLastAnnounceTurn) return null
  if (existing.length >= BALANCE.programmeMaxPerGame) return null
  if (existing.some((p) => turn - p.announcedTurn < BALANCE.programmeCooldownTurns)) return null

  for (const t of triggers(draft)) {
    const bloc = blocOfFaction(draft, t.buyerId)
    if (existing.some((p) => isOpen(p) && p.category === t.category && blocOfFaction(draft, p.buyerId) === bloc)) continue
    const programme = buildProgramme(draft, t, `programme-${existing.length + 1}`)
    if (!programme) continue
    ;(draft.programmes ??= []).push(programme)
    const buyer = draft.factions[t.buyerId]!
    const eventId = emit({
      severity: 'headline',
      scope: 'faction',
      headline: `${buyer.name.toUpperCase()} MINISTRY INVITES TENDERS FOR A NEW ${t.category.toUpperCase()} DESIGN (${programme.prize.quantity} UNITS, ${programme.trigger === 'requirementCard' ? 'NEW REQUIREMENTS' : programme.trigger === 'gapShock' ? 'CLOSING THE GAP' : 'LOSSES AT THE FRONT'})`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: t.buyerId,
    })
    for (const entrant of programme.entrants) {
      const rival = draft.rivals[entrant.houseId]
      if (!rival) continue
      emit({
        severity: 'ticker',
        scope: 'market',
        headline: `${rival.name.toUpperCase()} ENTERS THE ${t.category.toUpperCase()} PROGRAMME`,
        causeId: eventId,
        delta: {},
        actorIsPlayer: false,
        subjectId: rival.id,
      })
    }
    return programme
  }
  return null
}

function buildProgramme(state: GameState, t: Trigger, id: string): Programme | null {
  const buyer = state.factions[t.buyerId]!
  const bloc = blocOfFaction(state, t.buyerId)
  const product = designBaseProduct(t.category)
  const min = product.orderQuantityMin ?? 1
  const max = product.orderQuantityMax ?? min * BALANCE.programmePrizeOrders
  let quantity = Math.min(max, min * BALANCE.programmePrizeOrders)
  while (quantity > min && computeReferencePrice(product, quantity, 0, state.market.supplyCostIndex) > buyer.militaryBudget) quantity -= 1
  const total = computeReferencePrice(product, quantity, 0, state.market.supplyCostIndex)
  if (total > buyer.militaryBudget) return null
  const official = findOfficial(state, t.buyerId, 'procurement')
  const front = Object.values(state.fronts).find((f) => f.sideA === t.buyerId || f.sideB === t.buyerId)
  const environment: DesignEnvironment = (front ? frontEnvironments(front.id)[0] : undefined) ?? 'jungle'
  const entrants: ProgrammeEntrant[] = Object.values(state.rivals)
    .filter((r) => programmeEligible(r.homeState, bloc))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({ houseId: r.id, enteredTurn: state.meta.turn }))
  return {
    id,
    buyerId: t.buyerId,
    category: t.category,
    baseProductId: product.id,
    trigger: t.trigger,
    requirements: programmeRequirements(state, t.buyerId, t.category),
    testEnvironment: environment,
    grant: { kind: official?.agenda === 'AUSTERITY' ? 'fixedPrice' : 'costPlus', amount: BALANCE.programmeGrantAmount },
    prize: {
      quantity,
      deliveryTurns: product.minDelivery + BALANCE.orderDeliverySlackTurns,
      unitPrice: round((total / quantity) * BALANCE.programmePriceFraction),
      advancePct: official ? computeAdvancePct({ faction: buyer, official, category: t.category, referencePrice: total }) : 0,
    },
    phase: 'announced',
    phaseSinceTurn: state.meta.turn,
    announcedTurn: state.meta.turn,
    entrants,
    traces: [],
  }
}

// ── anmälan (stående order) ──────────────────────────────────────────────────

export function validateProgrammeChange(_state: Readonly<GameState>, draft: GameState, change: Extract<StandingOrderChange, { kind: 'PROGRAMME' }>): ActionValidation {
  const fail = (reason: string): ActionValidation => ({ ok: false, reason })
  const programme = draft.programmes?.find((p) => p.id === change.programmeId)
  if (!programme) return fail('unknown programme')
  const entered = programme.entrants.some((e) => e.houseId === 'player')
  switch (change.op) {
    case 'ENTER': {
      if (programme.phase !== 'announced') return fail('the programme is closed for entries')
      if (!programmeEligible(draft.house.homeState, blocOfFaction(draft, programme.buyerId))) return fail('your home state bars you from this ministry')
      if (entered) return fail('already entered')
      return { ok: true }
    }
    case 'WITHDRAW': {
      if (!entered) return fail('not entered in this programme')
      if (programme.phase === 'trial' || !isOpen(programme)) return fail('the programme is closed for changes')
      return { ok: true }
    }
    case 'SUBMIT': {
      if (!entered) return fail('not entered in this programme')
      if (!isOpen(programme)) return fail('the programme is closed for changes')
      const design = draft.house.designs?.find((d) => d.id === change.designId)
      if (!design) return fail('unknown design')
      if (design.category !== programme.category || design.baseProductId !== programme.baseProductId) return fail('design does not fit this programme')
      if (design.status === 'withdrawn') return fail('design is withdrawn')
      if (designPhasedOutForBuyer(draft, design, programme.buyerId)) return fail('design phased out for this buyer')
      return { ok: true }
    }
  }
}

export function applyProgrammeChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'PROGRAMME' }>): void {
  const { draft, emit } = ctx
  const programme = draft.programmes!.find((p) => p.id === change.programmeId)!
  const house = draft.house.name.toUpperCase()
  const buyer = draft.factions[programme.buyerId]?.name.toUpperCase() ?? programme.buyerId.toUpperCase()
  switch (change.op) {
    case 'ENTER':
      programme.entrants.push({ houseId: 'player', enteredTurn: draft.meta.turn })
      emit({ severity: 'ticker', scope: 'house', headline: `${house} ENTERS THE ${buyer} ${programme.category.toUpperCase()} PROGRAMME`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      break
    case 'SUBMIT': {
      const entrant = programme.entrants.find((e) => e.houseId === 'player')!
      entrant.designId = change.designId
      const design = draft.house.designs.find((d) => d.id === change.designId)!
      emit({ severity: 'ticker', scope: 'house', headline: `${house} SUBMITS THE ${design.name.toUpperCase()} TO THE ${buyer} ${programme.category.toUpperCase()} PROGRAMME`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      break
    }
    case 'WITHDRAW':
      programme.entrants = programme.entrants.filter((e) => e.houseId !== 'player')
      emit({ severity: 'ticker', scope: 'house', headline: `${house} WITHDRAWS FROM THE ${buyer} ${programme.category.toUpperCase()} PROGRAMME`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      break
  }
}

// ── provet ───────────────────────────────────────────────────────────────────

export interface TrialMeasurement {
  houseId: 'player' | string
  performance: number
  reliability: number
  unitCostFactor: number
  deliveryTurns: number
  prototypeMissing?: boolean
  // P123 (§8.2): poäng ur ett motköp (counterPurchaseScore), adderade till provpoängen.
  counterPurchaseScore?: number
}

export interface TrialInputs {
  relation: Record<string, number> // 0–100 per hus: upphandlingstjänstemannens relation
  reputation: Record<string, number> // 0–100 per hus: ryktet i kategorin
  neutral: Record<string, boolean> // neutrala hus väger relationen lägre (9I)
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

// Provets poängsättning — EN egen funktion (skyddsräcke 7), inte computeScore. Ren: samma mått och indata ger samma poäng.
export function evaluateTrial(programme: Pick<Programme, 'requirements'>, measured: readonly TrialMeasurement[], inputs: TrialInputs): TrialScore[] {
  return measured.map((m) => {
    const rows: TrialRow[] = programme.requirements.map((r) => {
      const value = r.kind === 'performance' ? m.performance : r.kind === 'reliability' ? m.reliability : r.kind === 'unitCost' ? m.unitCostFactor : m.deliveryTurns
      const higherIsBetter = r.kind === 'performance' || r.kind === 'reliability'
      return { kind: r.kind, measured: value, threshold: r.threshold, mandatory: r.mandatory, pass: higherIsBetter ? value >= r.threshold : value <= r.threshold }
    })
    if (m.prototypeMissing) return { houseId: m.houseId, score: 0, disqualified: 'NO PROTOTYPE SUBMITTED', rows }
    const failed = rows.find((row) => row.mandatory && !row.pass)
    if (failed) return { houseId: m.houseId, score: 0, disqualified: `FAILED MANDATORY REQUIREMENT: ${failed.kind.toUpperCase()}`, rows }
    let score = 0
    for (const [i, r] of programme.requirements.entries()) {
      const row = rows[i]!
      const margin =
        r.kind === 'unitCost' ? (row.threshold - row.measured) / BALANCE.programmeCostScale
        : r.kind === 'delivery' ? (row.threshold - row.measured) / BALANCE.programmeDeliveryScale
        : (row.measured - row.threshold) / BALANCE.programmeScoreScale
      score += r.weight * clamp01(margin)
    }
    const relationFactor = inputs.neutral[m.houseId] ? BALANCE.programmeNeutralRelationFactor : 1
    score += BALANCE.programmeRelationWeight * ((inputs.relation[m.houseId] ?? 0) / 100) * relationFactor
    score += BALANCE.programmeReputationWeight * ((inputs.reputation[m.houseId] ?? 0) / 100)
    score += m.counterPurchaseScore ?? 0
    return { houseId: m.houseId, score, disqualified: null, rows }
  })
}

// Motköpets poäng i provet (§8.2): programmeCounterPurchaseScore, mer hos en NON_ALIGNMENT-tjänsteman.
export function counterPurchaseScore(state: Pick<GameState, 'officials'>, programme: Pick<Programme, 'buyerId'>): number {
  const official = findOfficial(state, programme.buyerId, 'procurement')
  return BALANCE.programmeCounterPurchaseScore * (official?.agenda === 'NON_ALIGNMENT' ? BALANCE.programmeCounterPurchaseNonAlignedFactor : 1)
}

// Uppmätta värden för en deltagare (P123, §8.1 fas 4): sann kvalitet + prototypfaktor + mätbrus, dragna med `rng` (tre drag per
// deltagare i listans ordning). Provet görs i köparens miljö: en latent brist i just den miljön sänker uppmätt tillförlitlighet och
// prestanda. Ren — skriver ingenting i staten (avslöjandet gör resolveTrial).
export function measureEntrant(state: GameState, programme: Programme, entrant: ProgrammeEntrant, rng: Rng): TrialMeasurement {
  const product = getProduct(programme.baseProductId)
  const deliveryTurns = product.minDelivery + 1
  const proto = rng.int(0, BALANCE.programmePrototypeMax)
  const noisePerformance = rng.int(-BALANCE.programmeMeasureNoise, BALANCE.programmeMeasureNoise)
  const noiseReliability = rng.int(-BALANCE.programmeMeasureNoise, BALANCE.programmeMeasureNoise)
  if (entrant.houseId === 'player') {
    const design = entrant.designId !== undefined ? state.house.designs?.find((d) => d.id === entrant.designId) : undefined
    if (!design) return { houseId: 'player', performance: 0, reliability: 0, unitCostFactor: 1, deliveryTurns, prototypeMissing: true }
    const values = designTrueValues(design)
    const flaw = design.latentFlaw && design.latentFlaw.environment === programme.testEnvironment ? design.latentFlaw.severity : 0
    return {
      houseId: 'player',
      performance: values.performance + proto + noisePerformance - flaw * BALANCE.programmeFlawPerformancePenalty,
      reliability: values.reliability + proto + noiseReliability - flaw * BALANCE.programmeFlawReliabilityPenalty,
      unitCostFactor: design.unitCostFactor,
      deliveryTurns,
      ...(entrant.counterPurchase ? { counterPurchaseScore: counterPurchaseScore(state, programme) } : {}),
    }
  }
  const rival = state.rivals[entrant.houseId]!
  const spec =
    designBenchmark(buyerGeneration(state, programme.buyerId, programme.category)) +
    BALANCE.rivalDesignSpecEdge +
    (rival.specialisation === programme.category ? BALANCE.programmeSpecialistBonus : 0)
  const own = [...(rival.designs ?? [])].reverse().find((d) => d.category === programme.category)
  const value = own ? Math.max(spec, rivalDesignSpec(own)) : spec
  return { houseId: rival.id, performance: value + proto + noisePerformance, reliability: value + proto + noiseReliability, unitCostFactor: 1, deliveryTurns }
}

function trialInputs(state: GameState, programme: Programme, entrants: readonly ProgrammeEntrant[]): TrialInputs {
  const official = findOfficial(state, programme.buyerId, 'procurement')
  const buyerBloc = blocOfFaction(state, programme.buyerId)
  const inputs: TrialInputs = { relation: {}, reputation: {}, neutral: {} }
  for (const e of entrants) {
    if (e.houseId === 'player') {
      inputs.relation['player'] = official?.relationToPlayer ?? 0
      inputs.reputation['player'] = categoryReputation(state.house, programme.category).quality
      inputs.neutral['player'] = state.house.homeState === 'neutral' && buyerBloc !== null
    } else {
      const rival = state.rivals[e.houseId]!
      inputs.relation[rival.id] = rival.relations[programme.buyerId] ?? 0
      inputs.reputation[rival.id] = rival.reputation.quality
      inputs.neutral[rival.id] = rival.homeState === 'neutral' && buyerBloc !== null
    }
  }
  return inputs
}

// ── livscykeln ───────────────────────────────────────────────────────────────

// Går igenom varje öppen infordran: fasbyten, forskningsanslaget och provet/tilldelningen. Anropas varje tur från steget `race`.
export function advanceProgrammes(ctx: ResolveContext): void {
  const { draft } = ctx
  for (const programme of draft.programmes ?? []) {
    if (!isOpen(programme)) continue
    const turn = draft.meta.turn
    const buyer = draft.factions[programme.buyerId]?.name.toUpperCase() ?? programme.buyerId.toUpperCase()
    const label = `${buyer} ${programme.category.toUpperCase()} PROGRAMME`
    switch (programme.phase) {
      case 'announced':
        if (turn >= programme.phaseSinceTurn + 1) setPhase(ctx, programme, 'specLocked', `${label}: REQUIREMENTS LOCKED — ${programme.entrants.length} ENTRANT${programme.entrants.length === 1 ? '' : 'S'}`)
        break
      case 'specLocked':
        if (turn >= programme.phaseSinceTurn + 1) {
          setPhase(ctx, programme, 'development', `${label}: DEVELOPMENT BEGINS`)
          payFixedGrant(ctx, programme, label)
        }
        break
      case 'development':
        reimburseCostPlus(ctx, programme, label)
        if (turn >= programme.phaseSinceTurn + BALANCE.programmeDevelopmentTurns) setPhase(ctx, programme, 'trial', `${label}: PROTOTYPES ARE DUE FOR THE COMPARATIVE TRIAL`)
        break
      case 'trial':
        if (turn >= programme.phaseSinceTurn + 1) resolveTrial(ctx, programme, label)
        break
    }
  }
}

function setPhase(ctx: ResolveContext, programme: Programme, phase: Programme['phase'], headline: string): string {
  programme.phase = phase
  programme.phaseSinceTurn = ctx.draft.meta.turn
  return ctx.emit({ severity: 'report', scope: 'faction', headline, causeId: null, delta: { [`programme.${programme.id}.phase`]: 1 }, actorIsPlayer: false, subjectId: programme.buyerId })
}

function payGrant(ctx: ResolveContext, programme: Programme, amount: number, headline: string): void {
  const { draft, emit } = ctx
  const paid = round(amount)
  if (paid <= 0) return
  draft.house.treasury += paid
  draft.house.revenueByTurn[draft.meta.turn] = (draft.house.revenueByTurn[draft.meta.turn] ?? 0) + paid
  recordIncome(draft, 'contracts', paid)
  programme.grantPaid = (programme.grantPaid ?? 0) + paid
  emit({ severity: 'report', scope: 'house', headline, causeId: null, delta: { treasury: paid }, actorIsPlayer: true, subjectId: programme.buyerId })
}

// Fast pris: hela anslaget när utvecklingen börjar, till den som anmält sig.
function payFixedGrant(ctx: ResolveContext, programme: Programme, label: string): void {
  if (!programme.grant || programme.grant.kind !== 'fixedPrice' || !programme.entrants.some((e) => e.houseId === 'player')) return
  payGrant(ctx, programme, programme.grant.amount, `${ctx.draft.house.name.toUpperCase()} RECEIVES THE FIXED-PRICE GRANT: £${programme.grant.amount.toLocaleString('en-GB')} (${label})`)
}

// Kostnad plus: varje utvecklingstur ersätts husets pågående designprojekt i kategorin med (1 + marginal). Överskrids anslaget ×
// taket ger det en granskning, en gång: upphandlingstjänstemannen tappar förtroende.
function reimburseCostPlus(ctx: ResolveContext, programme: Programme, label: string): void {
  const { draft, emit } = ctx
  if (!programme.grant || programme.grant.kind !== 'costPlus' || !programme.entrants.some((e) => e.houseId === 'player')) return
  const project = draft.house.rnd.find((p) => p.category === programme.category && p.design)
  if (!project) return
  const spend = projectOverheadPerTurn(draft.house, project)
  payGrant(ctx, programme, spend * (1 + BALANCE.programmeCostPlusMargin), `${draft.house.name.toUpperCase()} IS REIMBURSED FOR ITS ${programme.category.toUpperCase()} DEVELOPMENT COSTS PLUS A MARGIN (${label})`)
  if (!programme.grantHearing && (programme.grantPaid ?? 0) > programme.grant.amount * BALANCE.programmeCostPlusCapFactor) {
    programme.grantHearing = true
    const official = findOfficial(draft, programme.buyerId, 'procurement')
    if (official) official.relationToPlayer = Math.max(0, official.relationToPlayer - BALANCE.programmeOverrunRelationPenalty)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `COST OVERRUN HEARING: THE ${label} QUESTIONS ${draft.house.name.toUpperCase()}'S SPENDING`,
      causeId: null,
      delta: { [`relationToPlayer.${programme.buyerId}`]: -BALANCE.programmeOverrunRelationPenalty },
      actorIsPlayer: true,
      subjectId: programme.buyerId,
    })
  }
}

function buyerName(state: GameState, programme: Pick<Programme, 'buyerId'>): string {
  return state.factions[programme.buyerId]?.name.toUpperCase() ?? programme.buyerId.toUpperCase()
}

function houseName(state: GameState, id: 'player' | string): string {
  return id === 'player' ? state.house.name : (state.rivals[id]?.name ?? id)
}

// Provet och tilldelningen: mät alla, poängsätt med evaluateTrial, utse vinnare och ev. en delad order, skriv kontrakten.
function resolveTrial(ctx: ResolveContext, programme: Programme, label: string): void {
  const { draft, emit } = ctx
  const measured = programme.entrants.map((e) => measureEntrant(draft, programme, e, ctx.rng))
  const scores = evaluateTrial(programme, measured, trialInputs(draft, programme, programme.entrants))
  const qualified = scores.filter((s) => s.disqualified === null).sort((a, b) => b.score - a.score)
  programme.result = { winner: qualified[0]?.houseId ?? null, scores, turn: draft.meta.turn }
  recordTrialOnHouseDesign(ctx, programme)

  if (qualified.length === 0) {
    programme.phase = 'cancelled'
    programme.phaseSinceTurn = draft.meta.turn
    emit({ severity: 'report', scope: 'faction', headline: `${label}: NO ENTRANT QUALIFIED — PROGRAMME WITHDRAWN`, causeId: null, delta: {}, actorIsPlayer: false, subjectId: programme.buyerId })
    return
  }

  const winner = qualified[0]!
  const runnerUp = qualified[1]
  const split = runnerUp !== undefined && winner.score - runnerUp.score <= BALANCE.programmeSplitMargin
  const winnerQty = split ? Math.round((programme.prize.quantity * BALANCE.programmeSplitSharePct) / 100) : programme.prize.quantity
  const secondQty = programme.prize.quantity - winnerQty
  programme.phase = 'awarded'
  programme.phaseSinceTurn = draft.meta.turn
  if (split) programme.result.split = { second: runnerUp.houseId, sharePct: 100 - BALANCE.programmeSplitSharePct }

  const awardId = emit({
    severity: 'headline',
    scope: 'faction',
    headline: `${buyerName(draft, programme)} MINISTRY AWARDS THE ${programme.category.toUpperCase()} PROGRAMME: ${houseName(draft, winner.houseId).toUpperCase()} WINS THE COMPARATIVE TRIAL (${split ? `${winnerQty} OF ${programme.prize.quantity}` : programme.prize.quantity} UNITS${split ? `; ${houseName(draft, runnerUp.houseId).toUpperCase()} GETS THE REST` : ''})`,
    causeId: null,
    delta: {},
    actorIsPlayer: winner.houseId === 'player',
    subjectId: programme.buyerId,
  })
  award(ctx, programme, winner.houseId, winnerQty, programme.id, awardId)
  if (split) award(ctx, programme, runnerUp.houseId, secondQty, `${programme.id}-split`, awardId)
  applyTestedReputation(ctx, programme)

  // Köparen har fått sitt behov täckt: serien konsumerar materielNeed (samma som en vanlig order).
  const buyer = draft.factions[programme.buyerId]
  if (buyer) buyer.materielNeed[programme.category] = Math.max(0, buyer.materielNeed[programme.category] - programme.prize.quantity)
}

// Ett vanligt Contract (spelaren, med förskott enligt etapp 8) eller ett RivalContract (rivalen, kapital som vid ett vunnet bud).
function award(ctx: ResolveContext, programme: Programme, houseId: 'player' | string, quantity: number, idSuffix: string, causeId: string): void {
  const { draft, emit } = ctx
  if (quantity <= 0) return
  const product = getProduct(programme.baseProductId)
  const price = quantity * programme.prize.unitPrice
  const buyer = draft.factions[programme.buyerId]
  if (buyer) buyer.militaryBudget = Math.max(0, buyer.militaryBudget - price)
  const dueTurn = draft.meta.turn + programme.prize.deliveryTurns

  if (houseId === 'player') {
    const entrant = programme.entrants.find((e) => e.houseId === 'player')
    const design = entrant?.designId !== undefined ? draft.house.designs.find((d) => d.id === entrant.designId) : undefined
    const baseUnitCost = round(computeUnitCostNow(product, 'A', draft.market.commodities) * (design ? design.unitCostFactor : 1))
    // P123 (§8.2): ett motköp ger lägre marginal på serien — styckkostnaden vid signering blir högre.
    const unitCost = entrant?.counterPurchase ? round(baseUnitCost * (1 + BALANCE.programmeCounterPurchaseMarginPct / 100)) : baseUnitCost
    const front = Object.values(draft.fronts).find((f) => f.sideA === programme.buyerId || f.sideB === programme.buyerId)
    const advancePaid = advanceAmount(price, programme.prize.advancePct)
    const contract: Contract = {
      id: `contract-${idSuffix}`,
      buyerId: programme.buyerId,
      productId: product.id,
      quantity,
      unitsDelivered: 0,
      price,
      unitCostAtSigning: unitCost,
      grade: 'A',
      dueTurn,
      status: 'active',
      lateEventId: null,
      frontId: front ? front.id : null,
      advancePct: programme.prize.advancePct,
      advancePaid,
      ...(design ? { designId: design.id } : {}),
    }
    draft.market.contracts.push(contract)
    if (advancePaid > 0) {
      draft.house.treasury += advancePaid
      draft.house.revenueByTurn[draft.meta.turn] = (draft.house.revenueByTurn[draft.meta.turn] ?? 0) + advancePaid
      recordIncome(draft, 'advances', advancePaid)
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${buyer ? buyer.name.toUpperCase() : programme.buyerId.toUpperCase()} PAYS AN ADVANCE OF £${advancePaid.toLocaleString('en-GB')} (${contract.advancePct}%) ON ${contract.id}`,
        causeId,
        delta: { treasury: advancePaid },
        actorIsPlayer: true,
        subjectId: programme.buyerId,
      })
    }
    return
  }

  const rival = draft.rivals[houseId]
  if (!rival) return
  const rivalContract: RivalContract = {
    id: `rival-contract-${idSuffix}`,
    buyerId: programme.buyerId,
    productId: product.id,
    quantity,
    unitsDelivered: 0,
    dueTurn,
    status: 'active',
    lateEventId: null,
  }
  rival.contracts.push(rivalContract)
  rival.capital += price
  emit({
    severity: 'report',
    scope: 'market',
    headline: `${rival.name.toUpperCase()} WINS CONTRACT: ${product.name.toUpperCase()} × ${quantity} TO ${buyer ? buyer.name.toUpperCase() : programme.buyerId.toUpperCase()}`,
    causeId,
    delta: { price },
    actorIsPlayer: false,
    subjectId: programme.buyerId,
  })
}

// Blocken som en infordran riktar sig till, för UI och mätning.
export function programmeBloc(state: Pick<GameState, 'factions'>, programme: Pick<Programme, 'buyerId'>): Bloc | null {
  return blocOfFaction(state, programme.buyerId)
}

// Provet avslöjar husets konstruktions brist om provmiljön stämmer och gör att huset prövat den i miljön (testedIn, ett smalare
// intervall). Anropas av resolveTrial innan tilldelningen.
function recordTrialOnHouseDesign(ctx: ResolveContext, programme: Programme): void {
  const { draft, emit } = ctx
  const entrant = programme.entrants.find((e) => e.houseId === 'player')
  const design = entrant?.designId !== undefined ? draft.house.designs?.find((d) => d.id === entrant.designId) : undefined
  if (!design) return
  const env = programme.testEnvironment.toUpperCase()
  if (design.latentFlaw?.environment === programme.testEnvironment && revealFlaw(design)) {
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `THE ${env} TRIAL REVEALS A FLAW IN THE ${design.name.toUpperCase()} (SEVERITY ${design.latentFlaw.severity})`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: programme.buyerId,
    })
  }
  const newlyTested = !design.testedIn.includes(programme.testEnvironment)
  const narrowed = design.uncertainty > 0
  if (newlyTested) design.testedIn = [...design.testedIn, programme.testEnvironment]
  if (narrowed) design.uncertainty -= 1
  if (newlyTested || narrowed) {
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${design.name.toUpperCase()} IS TESTED IN THE ${env} (CLASS UNCERTAINTY ±${design.uncertainty})`,
      causeId: null,
      delta: { [`uncertainty.${design.id}`]: narrowed ? -1 : 0 },
      actorIsPlayer: true,
      subjectId: programme.buyerId,
    })
  }
}

// Ett litet rykte åt den som förlorar nära (§8.1): en kvalificerad förlorare inom programmeTestedMargin poäng får
// programmeTestedQualityGain på kategoriryktet (klampat vid qualityCategoryCap).
export function applyTestedReputation(ctx: ResolveContext, programme: Programme): void {
  const { draft, emit } = ctx
  const result = programme.result
  if (!result || result.winner === null || result.winner === 'player') return
  if (!programme.entrants.some((e) => e.houseId === 'player')) return
  const own = result.scores.find((s) => s.houseId === 'player')
  const winner = result.scores.find((s) => s.houseId === result.winner)
  if (!own || !winner || own.disqualified !== null) return
  if (winner.score - own.score > BALANCE.programmeTestedMargin) return
  const before = draft.house.categoryQuality[programme.category]
  const after = Math.max(-BALANCE.qualityCategoryCap, Math.min(BALANCE.qualityCategoryCap, before + BALANCE.programmeTestedQualityGain))
  if (after === before) return
  draft.house.categoryQuality[programme.category] = after
  emit({
    severity: 'report',
    scope: 'house',
    headline: `${draft.house.name.toUpperCase()}'S ${programme.category.toUpperCase()} DESIGN IS TESTED BY THE ${buyerName(draft, programme)} MINISTRY OF DEFENCE — A SMALL BOOST TO ITS STANDING`,
    causeId: null,
    delta: { [`categoryQuality.${programme.category}`]: after - before },
    actorIsPlayer: true,
    subjectId: programme.buyerId,
  })
}

// ── utvärderingsprotokollet (§8.1 fas 4) ─────────────────────────────────────

export interface ProtocolEntry {
  houseId: 'player' | string
  name: string
  disqualified: string | null
  rows: TrialRow[]
}

export interface ProtocolView {
  winner: 'player' | string | null
  entries: ProtocolEntry[]
}

// Protokollet visas först när provet är gjort och bara för den som deltog (skyddsräcke 5): uppmätt värde per kravrad för alla
// deltagare. Poängen är inte en del av protokollet.
export function programmeProtocol(state: GameState, programme: Programme): ProtocolView | null {
  const result = programme.result
  if (!result || !programme.entrants.some((e) => e.houseId === 'player')) return null
  return {
    winner: result.winner,
    entries: result.scores.map((s) => ({ houseId: s.houseId, name: houseName(state, s.houseId), disqualified: s.disqualified, rows: s.rows })),
  }
}

// ── motköp (PROCUREMENT, §8.2, beslut 9O) ────────────────────────────────────

export function validateProcurement(draft: GameState, action: Extract<PlayerAction, { type: 'PROCUREMENT' }>): ActionValidation {
  const fail = (reason: string): ActionValidation => ({ ok: false, reason })
  const programme = draft.programmes?.find((p) => p.id === action.programmeId)
  if (!programme) return fail('unknown programme')
  const entrant = programme.entrants.find((e) => e.houseId === 'player')
  if (!entrant) return fail('not entered in this programme')
  if (programme.phase !== 'announced' && programme.phase !== 'specLocked' && programme.phase !== 'development') return fail('counter-purchase is no longer possible')
  if (entrant.counterPurchase) return fail('counter-purchase already offered')
  return { ok: true }
}

export function applyProcurement(ctx: ResolveContext, action: Extract<PlayerAction, { type: 'PROCUREMENT' }>): void {
  const { draft, emit } = ctx
  const programme = draft.programmes!.find((p) => p.id === action.programmeId)!
  programme.entrants.find((e) => e.houseId === 'player')!.counterPurchase = true
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `${draft.house.name.toUpperCase()} OFFERS LOCAL PRODUCTION IN THE ${buyerName(draft, programme)} ${programme.category.toUpperCase()} PROGRAMME (COUNTER-PURCHASE)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: programme.buyerId,
  })
}
