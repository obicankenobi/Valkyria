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
import { bindDesignToGrantBloc } from './exportRules.js'
import balanceData from './data/balance.json' with { type: 'json' }
import { categoryReputation } from './bidTerms.js'
import { designBaseProduct, designBenchmark, designTrueValues, frontEnvironments, revealFlaw } from './design.js'
import { recordExpense, recordIncome } from './ledger.js'
import { round } from './money.js'
import { findOfficial } from './officials.js'
import { computeReferencePrice, computeUnitCostNow, getProduct } from './pricing.js'
import { blocOfFaction, buyerGeneration, designPhasedOutForBuyer, requirementCards, rivalDesignSpec } from './race.js'
import { effectiveDepth } from './queries.js'
import { projectOverheadPerTurn } from './research.js'
import { recordTrace } from './traces.js'
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
  programmeWriteSpecRelationFloor: number
  programmeWriteSpecBribeCost: number
  programmeSpecTiltPoints: number
  programmeSpecTiltWeight: number
  programmeRefuseIntegrityFloor: number
  programmeRefusePctPerPoint: number
  programmeRefuseRelationPenalty: number
  programmeHandbuiltBonus: number
  programmeBoardBribeCost: number
  programmeBoardBribeBonus: number
  programmeFalsifyCost: number
  programmeLowballDiscountPct: number
  programmeLowballScore: number
  programmeLowballOverrunTurns: number
  programmeLowballRecoupFactor: number
  programmeLowballHearingPct: number
  programmeLowballHearingRelationPenalty: number
  programmeRivalCheatPct: Record<string, number>
  programmeReportRelationPenalty: number
  programmeSabotagePenalty: number
  programmeLeakPenalty: number
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
      if ((draft.house.suspendedFrom?.[programme.buyerId] ?? 0) > draft.meta.turn) return fail('suspended from this buyer') // P125
      return { ok: true }
    }
    case 'WITHDRAW': {
      if (!entered) return fail('not entered in this programme')
      if (programme.phase === 'trial' || !isOpen(programme)) return fail('the programme is closed for changes')
      return { ok: true }
    }
    case 'REPORT': {
      if (!isOpen(programme)) return fail('the programme is closed for changes')
      const rival = programme.entrants.find((e) => e.houseId === change.rivalId && e.houseId !== 'player')
      if (!rival) return fail('unknown entrant')
      if (rival.reported) return fail('that rival has already been reported')
      if (effectiveDepth(draft, programme.buyerId) === 0) return fail('you need intelligence in the buyer country to report a rival')
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
    case 'REPORT': {
      const rival = programme.entrants.find((e) => e.houseId === change.rivalId)!
      const rivalName = houseName(draft, rival.houseId).toUpperCase()
      rival.reported = true
      if (rival.boardBribed) {
        rival.barred = 'DISQUALIFIED FOR IRREGULARITIES'
        const reportId = emit({ severity: 'headline', scope: 'market', headline: `${house} REPORTS ${rivalName} TO THE ${buyer} MINISTRY — IRREGULARITIES CONFIRMED, ${rivalName} IS DISQUALIFIED FROM THE ${programme.category.toUpperCase()} PROGRAMME`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
        for (const trace of draft.traces ?? []) {
          if (trace.programmeId === programme.id && trace.houseId === rival.houseId && trace.status === 'open') {
            trace.status = 'surfaced'
            emit({ severity: 'ticker', scope: 'market', headline: `THE ${buyer} MINISTRY OPENS ITS FILE ON ${rivalName}`, causeId: reportId, delta: { [`traces.${trace.id}`]: 0 }, actorIsPlayer: false, subjectId: rival.houseId })
          }
        }
      } else {
        const official = findOfficial(draft, programme.buyerId, 'procurement')
        if (official) official.relationToPlayer = Math.max(0, official.relationToPlayer - BALANCE.programmeReportRelationPenalty)
        emit({ severity: 'report', scope: 'house', headline: `${house}'S REPORT AGAINST ${rivalName} PROVES FALSE — THE ${buyer} MINISTRY RESENTS THE ACCUSATION`, causeId: null, delta: { [`relationToPlayer.${programme.buyerId}`]: -BALANCE.programmeReportRelationPenalty }, actorIsPlayer: true, subjectId: programme.buyerId })
      }
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
  // P124: övriga poängjusteringar (underbud, läckor), ett förfalskat protokoll (ska-krav räknas som godkända) och en diskvalificering.
  scoreAdjust?: number
  falsified?: boolean
  barred?: string
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
      const real = higherIsBetter ? value >= r.threshold : value <= r.threshold
      // P124: ett förfalskat protokoll visar ett underkänt ska-krav som godkänt (uppmätt värde står kvar — det är förfalskningen).
      return { kind: r.kind, measured: value, threshold: r.threshold, mandatory: r.mandatory, pass: real || (m.falsified === true && r.mandatory) }
    })
    if (m.barred) return { houseId: m.houseId, score: 0, disqualified: m.barred, rows }
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
    score += (m.counterPurchaseScore ?? 0) + (m.scoreAdjust ?? 0)
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
    // P124 (§8.2): ett handbyggt exemplar höjer prototypfaktorn, en mutad nämnd ger ett bättre protokoll, ett underbud poäng.
    const lift = (entrant.handbuilt ? BALANCE.programmeHandbuiltBonus : 0) + (entrant.boardBribed ? BALANCE.programmeBoardBribeBonus : 0)
    return {
      houseId: 'player',
      performance: values.performance + proto + lift + noisePerformance - flaw * BALANCE.programmeFlawPerformancePenalty,
      reliability: values.reliability + proto + lift + noiseReliability - flaw * BALANCE.programmeFlawReliabilityPenalty,
      unitCostFactor: design.unitCostFactor,
      deliveryTurns,
      ...(entrant.counterPurchase ? { counterPurchaseScore: counterPurchaseScore(state, programme) } : {}),
      ...(entrant.lowball ? { scoreAdjust: BALANCE.programmeLowballScore } : {}),
      ...(entrant.falsified ? { falsified: true } : {}),
    }
  }
  const rival = state.rivals[entrant.houseId]!
  const spec =
    designBenchmark(buyerGeneration(state, programme.buyerId, programme.category)) +
    BALANCE.rivalDesignSpecEdge +
    (rival.specialisation === programme.category ? BALANCE.programmeSpecialistBonus : 0)
  const own = [...(rival.designs ?? [])].reverse().find((d) => d.category === programme.category)
  const value = own ? Math.max(spec, rivalDesignSpec(own)) : spec
  // P124: en rival kan ha mutat nämnden (bättre protokoll), vara sabotagedrabbad (sämre) eller läckt mot (lägre poäng) eller anmäld.
  const lift = (rival.id && entrant.boardBribed ? BALANCE.programmeBoardBribeBonus : 0) - (entrant.sabotaged ? BALANCE.programmeSabotagePenalty : 0)
  return {
    houseId: rival.id,
    performance: value + proto + lift + noisePerformance,
    reliability: value + proto + lift + noiseReliability,
    unitCostFactor: 1,
    deliveryTurns,
    ...(entrant.leaked ? { scoreAdjust: -BALANCE.programmeLeakPenalty } : {}),
    ...(entrant.barred ? { barred: entrant.barred } : {}),
  }
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
    if (programme.phase === 'awarded' && programme.lowball) settleLowball(ctx, programme)
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
        if (turn >= programme.phaseSinceTurn + BALANCE.programmeDevelopmentTurns) {
          const trialId = setPhase(ctx, programme, 'trial', `${label}: PROTOTYPES ARE DUE FOR THE COMPARATIVE TRIAL`)
          rivalsCheat(ctx, programme, trialId)
        }
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
  const listPrice = quantity * programme.prize.unitPrice
  // P124 (§8.2): ett underbud tecknar serien till ett lägre pris; tilläggsbeställningen kommer senare (settleLowball).
  const lowballing = houseId === 'player' && programme.entrants.find((e) => e.houseId === 'player')?.lowball === true
  const price = lowballing ? round(listPrice * (1 - BALANCE.programmeLowballDiscountPct / 100)) : listPrice
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
    // P132 (§8b.1): teknik som tagits fram med ett forskningsanslag binds till köparens block (exklusivitet).
    if (design) {
      const bound = bindDesignToGrantBloc(draft, design, programme.buyerId, programme.grant !== null)
      if (bound !== null) {
        emit({
          severity: 'report',
          scope: 'house',
          headline: `THE ${design.name.toUpperCase()} IS BOUND TO THE ${bound.toUpperCase()} BY ITS RESEARCH GRANT — IT CANNOT BE SOLD ACROSS THE BLOC LINE`,
          causeId,
          delta: {},
          actorIsPlayer: true,
          subjectId: programme.buyerId,
        })
      }
    }
    if (lowballing) programme.lowball = { houseId: 'player', awardedTurn: draft.meta.turn, discount: listPrice - price, contractId: contract.id }
    // Husets spår i den här upphandlingen kopplas till kontraktet (P125: ett upptäckt spår kan häva det).
    for (const trace of draft.traces ?? []) if (trace.programmeId === programme.id && trace.houseId === 'player' && trace.contractId === undefined) trace.contractId = contract.id
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

const TRICK_PHASES: Programme['phase'][] = ['development', 'trial']

function cheatCost(op: 'BRIBE_BOARD' | 'FALSIFY'): number {
  return op === 'BRIBE_BOARD' ? BALANCE.programmeBoardBribeCost : BALANCE.programmeFalsifyCost
}

// Konstruktionen en kravlutning riktas mot: den inlämnade, annars husets första aktiva i kategorin.
function tiltDesign(draft: GameState, programme: Programme, entrant: ProgrammeEntrant) {
  const designs = draft.house.designs ?? []
  const submitted = entrant.designId !== undefined ? designs.find((d) => d.id === entrant.designId) : undefined
  return submitted ?? designs.find((d) => d.category === programme.category && d.baseProductId === programme.baseProductId && d.status === 'active')
}

export function validateProcurement(draft: GameState, action: Extract<PlayerAction, { type: 'PROCUREMENT' }>): ActionValidation {
  const fail = (reason: string): ActionValidation => ({ ok: false, reason })
  const programme = draft.programmes?.find((p) => p.id === action.programmeId)
  if (!programme) return fail('unknown programme')
  const entrant = programme.entrants.find((e) => e.houseId === 'player')
  if (!entrant) return fail('not entered in this programme')
  switch (action.op) {
    case 'COUNTERPURCHASE':
      if (programme.phase !== 'announced' && programme.phase !== 'specLocked' && programme.phase !== 'development') return fail('counter-purchase is no longer possible')
      if (entrant.counterPurchase) return fail('counter-purchase already offered')
      return { ok: true }
    case 'WRITE_SPEC': {
      if (programme.phase !== 'announced') return fail('the requirements are locked')
      if (action.requirementKind !== 'performance' && action.requirementKind !== 'reliability' && action.requirementKind !== 'unitCost') return fail('that requirement cannot be influenced')
      if (!tiltDesign(draft, programme, entrant)) return fail('no design to tilt the requirements towards')
      if (action.bribe) return draft.house.treasury >= BALANCE.programmeWriteSpecBribeCost ? { ok: true } : fail('not enough cash for the bribe')
      const official = findOfficial(draft, programme.buyerId, 'procurement')
      return (official?.relationToPlayer ?? 0) >= BALANCE.programmeWriteSpecRelationFloor ? { ok: true } : fail('relation too low to influence the requirements')
    }
    case 'HANDBUILT':
      if (!TRICK_PHASES.includes(programme.phase)) return fail('prototypes are built later in the programme')
      return entrant.handbuilt ? fail('already offered') : { ok: true }
    case 'BRIBE_BOARD':
    case 'FALSIFY': {
      if (!TRICK_PHASES.includes(programme.phase)) return fail('the test board is not convened yet')
      const done = action.op === 'BRIBE_BOARD' ? entrant.boardBribed : entrant.falsified
      if (done) return fail('already offered')
      return draft.house.treasury >= cheatCost(action.op) ? { ok: true } : fail('not enough cash for the bribe')
    }
    case 'LOWBALL':
      if (!isOpen(programme)) return fail('the programme is closed for changes')
      return entrant.lowball ? fail('already offered') : { ok: true }
  }
}

function spend(ctx: ResolveContext, amount: number): void {
  ctx.draft.house.treasury -= amount
  recordExpense(ctx.draft, 'political', amount)
}

export function applyProcurement(ctx: ResolveContext, action: Extract<PlayerAction, { type: 'PROCUREMENT' }>): void {
  const { draft, emit } = ctx
  const programme = draft.programmes!.find((p) => p.id === action.programmeId)!
  const entrant = programme.entrants.find((e) => e.houseId === 'player')!
  const house = draft.house.name.toUpperCase()
  const buyer = buyerName(draft, programme)
  const where = `THE ${buyer} ${programme.category.toUpperCase()} PROGRAMME`
  const official = findOfficial(draft, programme.buyerId, 'procurement')
  const trace = (kind: 'writeSpec' | 'handbuilt' | 'bribeBoard' | 'falsify', severity: 1 | 2 | 3, causeId: string | null) =>
    recordTrace(ctx, { houseId: 'player', officialId: official?.id ?? null, buyerId: programme.buyerId, kind, severity, programmeId: programme.id }, causeId)
  switch (action.op) {
    case 'COUNTERPURCHASE':
      entrant.counterPurchase = true
      emit({ severity: 'ticker', scope: 'house', headline: `${house} OFFERS LOCAL PRODUCTION IN ${where} (COUNTER-PURCHASE)`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      break
    case 'WRITE_SPEC': {
      // En tjänsteman med hög integritet kan vägra och rapportera: relationen sjunker och kravet rörs inte.
      const integrity = official?.integrity ?? 0
      if (integrity > BALANCE.programmeRefuseIntegrityFloor && ctx.rng.chance((integrity - BALANCE.programmeRefuseIntegrityFloor) * BALANCE.programmeRefusePctPerPoint)) {
        if (official) official.relationToPlayer = Math.max(0, official.relationToPlayer - BALANCE.programmeRefuseRelationPenalty)
        emit({ severity: 'report', scope: 'house', headline: `THE ${buyer} PROCUREMENT OFFICIAL REFUSES ${house}'S APPROACH ON THE REQUIREMENTS AND REPORTS IT`, causeId: null, delta: { [`relationToPlayer.${programme.buyerId}`]: -BALANCE.programmeRefuseRelationPenalty }, actorIsPlayer: true, subjectId: programme.buyerId })
        break
      }
      if (action.bribe) spend(ctx, BALANCE.programmeWriteSpecBribeCost)
      const design = tiltDesign(draft, programme, entrant)!
      const values = designTrueValues(design)
      const row = programme.requirements.find((r) => r.kind === action.requirementKind)!
      if (row.kind === 'unitCost') row.threshold = Math.max(design.unitCostFactor, Math.round((row.threshold - BALANCE.programmeSpecTiltPoints / 100) * 100) / 100)
      else row.threshold = Math.max(row.threshold, Math.min(row.kind === 'performance' ? values.performance : values.reliability, row.threshold + BALANCE.programmeSpecTiltPoints))
      row.weight += BALANCE.programmeSpecTiltWeight
      const id = emit({ severity: 'ticker', scope: 'house', headline: `${house} SHAPES THE ${row.kind.toUpperCase()} REQUIREMENT OF ${where}`, causeId: null, delta: action.bribe ? { treasury: -BALANCE.programmeWriteSpecBribeCost } : {}, actorIsPlayer: true, subjectId: programme.buyerId })
      trace('writeSpec', 1, id)
      break
    }
    case 'HANDBUILT': {
      entrant.handbuilt = true
      const id = emit({ severity: 'ticker', scope: 'house', headline: `${house} SENDS A HAND-BUILT TEST ARTICLE TO ${where}`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      trace('handbuilt', 2, id)
      break
    }
    case 'BRIBE_BOARD': {
      spend(ctx, BALANCE.programmeBoardBribeCost)
      entrant.boardBribed = true
      const id = emit({ severity: 'ticker', scope: 'house', headline: `${house} PAYS THE TEST BOARD OF ${where} (−£${BALANCE.programmeBoardBribeCost.toLocaleString('en-GB')})`, causeId: null, delta: { treasury: -BALANCE.programmeBoardBribeCost }, actorIsPlayer: true, subjectId: programme.buyerId })
      trace('bribeBoard', 2, id)
      break
    }
    case 'FALSIFY': {
      spend(ctx, BALANCE.programmeFalsifyCost)
      entrant.falsified = true
      const id = emit({ severity: 'ticker', scope: 'house', headline: `${house} FORGES THE TEST PROTOCOL OF ${where} (−£${BALANCE.programmeFalsifyCost.toLocaleString('en-GB')})`, causeId: null, delta: { treasury: -BALANCE.programmeFalsifyCost }, actorIsPlayer: true, subjectId: programme.buyerId })
      trace('falsify', 3, id)
      break
    }
    case 'LOWBALL':
      entrant.lowball = true
      emit({ severity: 'ticker', scope: 'house', headline: `${house} SUBMITS AN AGGRESSIVELY LOW PRICE IN ${where}`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: programme.buyerId })
      break
  }
}

// Vid provstart kan varje rival fuska efter temperament (ctx.rng, ett drag per rival i listans ordning): muta nämnden, med ett spår.
function rivalsCheat(ctx: ResolveContext, programme: Programme, causeId: string): void {
  const { draft } = ctx
  const official = findOfficial(draft, programme.buyerId, 'procurement')
  for (const entrant of programme.entrants) {
    if (entrant.houseId === 'player') continue
    const rival = draft.rivals[entrant.houseId]
    if (!rival || entrant.boardBribed) continue
    if (!ctx.rng.chance(BALANCE.programmeRivalCheatPct[rival.temperament] ?? 0)) continue
    entrant.boardBribed = true
    recordTrace(ctx, { houseId: rival.id, officialId: official?.id ?? null, buyerId: programme.buyerId, kind: 'bribeBoard', severity: 2, programmeId: programme.id }, causeId)
  }
}

// Tilläggsbeställningen efter ett underbud (C-5A, §8.2): intäkt värd rabatten × återvinningsfaktorn; ibland en utfrågning som
// halverar återstoden av serien och sänker relationen. En gång per underbud.
function settleLowball(ctx: ResolveContext, programme: Programme): void {
  const { draft, emit } = ctx
  const low = programme.lowball
  if (!low || draft.meta.turn < low.awardedTurn + BALANCE.programmeLowballOverrunTurns) return
  const contract = draft.market.contracts.find((c) => c.id === low.contractId)
  delete programme.lowball
  if (!contract || contract.status === 'voided') return
  const extra = round(low.discount * BALANCE.programmeLowballRecoupFactor)
  draft.house.treasury += extra
  draft.house.revenueByTurn[draft.meta.turn] = (draft.house.revenueByTurn[draft.meta.turn] ?? 0) + extra
  recordIncome(draft, 'contracts', extra)
  const id = emit({ severity: 'report', scope: 'house', headline: `THE ${buyerName(draft, programme)} MINISTRY PLACES A SUPPLEMENTARY ORDER WITH ${draft.house.name.toUpperCase()}: +£${extra.toLocaleString('en-GB')} AFTER THE LOW BID`, causeId: null, delta: { treasury: extra }, actorIsPlayer: true, subjectId: programme.buyerId })
  if (!ctx.rng.chance(BALANCE.programmeLowballHearingPct)) return
  const remaining = contract.quantity - contract.unitsDelivered
  const newQuantity = contract.unitsDelivered + Math.ceil(remaining / 2)
  contract.price = round((contract.price * newQuantity) / contract.quantity)
  contract.quantity = newQuantity
  const official = findOfficial(draft, programme.buyerId, 'procurement')
  if (official) official.relationToPlayer = Math.max(0, official.relationToPlayer - BALANCE.programmeLowballHearingRelationPenalty)
  emit({ severity: 'headline', scope: 'house', headline: `COST HEARING: THE ${buyerName(draft, programme)} LEGISLATURE QUESTIONS ${draft.house.name.toUpperCase()}'S LOW BID AND HALVES THE REMAINING ORDER`, causeId: id, delta: { [`relationToPlayer.${programme.buyerId}`]: -BALANCE.programmeLowballHearingRelationPenalty }, actorIsPlayer: true, subjectId: programme.buyerId })
}

// SABOTAGE/LEAK mot en upphandling (§8.2): "programme:<id>:<rival>". Målet är en rival som deltar i en öppen infordran.
export function parseProgrammeTarget(targetId: string | undefined): { programmeId: string; rivalId: string } | null {
  if (!targetId) return null
  const [prefix, programmeId, rivalId] = targetId.split(':')
  return prefix === 'programme' && programmeId && rivalId ? { programmeId, rivalId } : null
}

export function validProgrammeTarget(state: GameState, targetId: string | undefined): boolean {
  const target = parseProgrammeTarget(targetId)
  const programme = target ? state.programmes?.find((p) => p.id === target.programmeId) : undefined
  return !!target && !!programme && isOpen(programme) && programme.entrants.some((e) => e.houseId === target.rivalId && e.houseId !== 'player')
}

// En lyckad SABOTAGE/LEAK mot en deltagande rival: flaggan läses av measureEntrant.
export function applyProgrammeIntel(ctx: ResolveContext, op: 'SABOTAGE' | 'LEAK', targetId: string, nation: string): void {
  const { draft, emit } = ctx
  const target = parseProgrammeTarget(targetId)!
  const programme = draft.programmes!.find((p) => p.id === target.programmeId)!
  const entrant = programme.entrants.find((e) => e.houseId === target.rivalId)!
  if (op === 'SABOTAGE') entrant.sabotaged = true
  else entrant.leaked = true
  const rival = houseName(draft, target.rivalId).toUpperCase()
  const house = draft.house.name.toUpperCase()
  const where = `THE ${buyerName(draft, programme)} ${programme.category.toUpperCase()} PROGRAMME`
  emit({
    severity: 'report',
    scope: 'market',
    headline: op === 'SABOTAGE' ? `${house} SABOTAGES ${rival}'S PROTOTYPE IN ${where}` : `${house} LEAKS DAMAGING FILES ABOUT ${rival} TO ${where}`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: nation,
  })
}
