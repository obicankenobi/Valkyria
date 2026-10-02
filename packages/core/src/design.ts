// design — P109 (ETAPP9_FORSLAG.md §5.1–5.3, beslut 9B/9D/9L). Konstruktionerna: ritbordsuppdraget (stående order
// DESIGN), utfallet (dras med ctx.rng när ett designprojekt blir klart), den dolda kvaliteten och den delade
// budtermen. En konstruktion är en VARIANT av en basprodukt (9B): ett bud bär designId på en order för basprodukten.
//
// EN källa för budtermen (skyddsräcke 3): bidding.ts, bidEstimate och playerWinCurve (via WinBandInputs) läser alla
// designBidTerm, och den läggs EFTER computeScore (skyddsräcke 1). Ett bud utan konstruktion får ingen term.
import balanceData from './data/balance.json' with { type: 'json' }
import environmentsData from './data/environments.json' with { type: 'json' }
import { TYPE_NAME, designDesignation, initialsOf } from './designNaming.js'
import { designerCostFactor, designerFlawReductionPct, designerQualityBonus, designerTurnsSaved } from './designer.js'
import { exclusivityRejection } from './exportRules.js'
import { allProducts, computeUnitCostNow, getProduct } from './pricing.js'
import { buyerGeneration, designPhasedOutForBuyer, noveltyBonus, yardstickAgainstPlayer } from './race.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { Rng } from './rng.js'
import type {
  Design,
  DesignAmbition,
  DesignEnvironment,
  DesignFocus,
  DesignId,
  DesignProjectSpec,
  Front,
  GameState,
  House,
  Order,
  Pct,
  Product,
  QualityClass,
  RndProject,
  TechCategory,
} from './types.js'

interface Balance {
  rndProjectTurns: number
  chiefEngineerProjectThreshold: number
  chiefEngineerTurnsSaved: number
  designFocus: Record<DesignFocus, { performance: number; reliability: number; unitCostFactor: number }>
  designAmbition: Record<DesignAmbition, { steps: number; turnsFactor: number; costFactor: number }>
  designAmbitionPerformanceGain: number
  designAmbitionReliabilityLoss: number
  designAmbitionUnitCostGain: number
  designBreakthroughBasePct: number
  designFlawBasePct: number
  designAmbitionFlawGainPct: number
  designBreakthroughDelta: number
  designFlawDelta: number
  designSpread: number
  designChiefEngineerFlawReductionPct: number
  designExperienceFlawReductionPct: number
  designExperienceCap: number
  qualityClassThresholds: { A: number; B: number; C: number }
  designBidWeight: number
  skunkTurnsFactor: number
  skunkCostFactor: number
  skunkFlawGainPct: number
  designBenchmarkBase: number
  preferenceMixBase: PreferenceMix
  preferenceMixAgendaShift: number
  preferenceMixLosingFrontShift: number
  preferenceMixLosingPosition: number
  preferenceMixDoctrineShift: number
  preferenceMixFloor: number
  benchmarkPerGeneration: number
  upgradeTurnsFactor: number
  upgradeCostFactor: number
  upgradeMaxPerformanceGain: number
  kitUnitCostFactor: number
  kitPriceCapFactor: number
  kitScoreBonus: number
  redesignTurnsFactor: number
  provenBidBonus: number
  fieldTrialBatchFraction: number
  fieldTrialBidBonus: number
  copyBidPenalty: number
  followerCostFactor: number
  followerTurnsSaved: number
  doctrineProfile: Record<string, Partial<Record<TechCategory, number>>>
}

// P111: köparens preferensmix — tre vikter som summerar till 1.
export interface PreferenceMix {
  performance: number
  reliability: number
  cost: number
}
const BALANCE = balanceData as unknown as Balance

// Ambitionens steg förbi det tidsenliga, för anropare som inte läser balansfilen själva.
export const BALANCE_DESIGN_STEPS: Record<DesignAmbition, number> = {
  timely: BALANCE.designAmbition.timely.steps,
  forward: BALANCE.designAmbition.forward.steps,
  ahead: BALANCE.designAmbition.ahead.steps,
}

export const DESIGN_FOCUSES: readonly DesignFocus[] = ['robust', 'balanced', 'advanced']
export const DESIGN_AMBITIONS: readonly DesignAmbition[] = ['timely', 'forward', 'ahead']
export const DESIGN_ENVIRONMENTS: readonly DesignEnvironment[] = ['jungle', 'monsoon', 'mine', 'wear']
export const QUALITY_CLASSES: readonly QualityClass[] = ['A', 'B', 'C', 'D']


// Kategorins basprodukt: den icke-restricted produkt en konstruktion bygger på och bjuds på ordrar för (9B).
export function designBaseProduct(category: TechCategory): Product {
  const product = allProducts().find((p) => p.category === category && !p.restricted)
  if (!product) throw new Error(`no base product for category ${category}`)
  return product
}


function chiefEngineerSaves(house: Pick<House, 'staff'>): number {
  return house.staff.chiefEngineer > BALANCE.chiefEngineerProjectThreshold ? BALANCE.chiefEngineerTurnsSaved : 0
}

// Ett designprojekts längd: rndProjectTurns × ambitionens tidsfaktor, en tur kortare med chefsingenjören över tröskeln.
export function designDuration(house: Pick<House, 'staff'>, ambition: DesignAmbition, upgrade = false): number {
  const factor = BALANCE.designAmbition[ambition].turnsFactor * (upgrade ? BALANCE.upgradeTurnsFactor : 1)
  const base = Math.max(1, Math.round(BALANCE.rndProjectTurns * factor))
  return Math.max(1, base - chiefEngineerSaves(house))
}

// Faktorn på rndOverhead per tur — ambitionens costFactor.
export function designCostPerTurn(ambition: DesignAmbition, upgrade = false): number {
  return BALANCE.designAmbition[ambition].costFactor * (upgrade ? BALANCE.upgradeCostFactor : 1)
}

export function qualityClassOf(trueQuality: number): QualityClass {
  const t = BALANCE.qualityClassThresholds
  if (trueQuality >= t.A) return 'A'
  if (trueQuality >= t.B) return 'B'
  if (trueQuality >= t.C) return 'C'
  return 'D'
}

function clampPct(value: number): Pct {
  return Math.max(0, Math.min(100, Math.round(value)))
}

// "H&V M64 Field Gun" (9L): husets initialer + beteckning (M + årtal) + typ. En andra konstruktion med samma namn får
// ett löpnummer så att namnen förblir unika.
export function designName(house: Pick<House, 'name' | 'designs'>, category: TechCategory, year: number): string {
  const base = `${initialsOf(house.name)} ${designDesignation(year)} ${TYPE_NAME[category]}`
  const same = house.designs.filter((d) => d.name === base || d.name.startsWith(`${base} Mk `)).length
  return same === 0 ? base : `${base} Mk ${same + 1}`
}

export interface DesignRollSpec {
  category: TechCategory
  focus: DesignFocus
  ambition: DesignAmbition
  upgradeOf: DesignId | null
  targetGeneration: number
  turn: number
  year: number
  // P113: en omkonstruktion efter en olycksfågel — felfri, och ärver bara ett icke-negativt utfall.
  redesignOf?: DesignId | null
  // P134: ett specialprojekt ger en större risk för en dold brist (skunkFlawGainPct).
  skunk?: boolean
}

// Utfallet (§5.2): genombrott, gedigen eller en konstruktion med en dold miljöbrist. Spannet beror på ambition,
// chefsingenjör och husets erfarenhet (antalet egna konstruktioner i kategorin). Dras med den Rng som skickas in
// (ctx.rng i resolve, hård regel 2). De SYNLIGA värdena är designvalen; bara trueQuality och bristen är utfallet.
export function rollDesign(rng: Rng, house: House, spec: DesignRollSpec): Design {
  const predecessor = spec.upgradeOf !== null ? house.designs.find((d) => d.id === spec.upgradeOf) : undefined
  if (predecessor) return rollUpgrade(rng, house, spec, predecessor)
  const focus = BALANCE.designFocus[spec.focus]
  const steps = BALANCE.designAmbition[spec.ambition].steps
  const performance = clampPct(focus.performance + steps * BALANCE.designAmbitionPerformanceGain)
  const reliability = clampPct(focus.reliability - steps * BALANCE.designAmbitionReliabilityLoss)
  const unitCostFactor = Math.round((focus.unitCostFactor + steps * BALANCE.designAmbitionUnitCostGain) * 100) / 100

  const experience = Math.min(BALANCE.designExperienceCap, house.designs.filter((d) => d.category === spec.category).length)
  const flawPct = Math.max(
    0,
    BALANCE.designFlawBasePct +
      steps * BALANCE.designAmbitionFlawGainPct +
      (spec.skunk ? BALANCE.skunkFlawGainPct : 0) -
      designerFlawReductionPct(house) -
      (house.staff.chiefEngineer > BALANCE.chiefEngineerProjectThreshold ? BALANCE.designChiefEngineerFlawReductionPct : 0) -
      experience * BALANCE.designExperienceFlawReductionPct,
  )
  const roll = rng.int(0, 99)
  const breakthrough = roll < BALANCE.designBreakthroughBasePct
  const flawed = !breakthrough && roll < BALANCE.designBreakthroughBasePct + flawPct
  const delta = breakthrough ? BALANCE.designBreakthroughDelta : flawed ? BALANCE.designFlawDelta : 0
  const trueQuality = clampPct((performance + reliability) / 2 + delta + rng.int(-BALANCE.designSpread, BALANCE.designSpread) + designerQualityBonus(house, spec.category, spec.focus))

  const latentFlaw = flawed ? { environment: rng.pick(DESIGN_ENVIRONMENTS), severity: rng.int(1, 3) } : null

  return {
    id: `design-${house.designs.length + 1}`,
    name: designName(house, spec.category, spec.year),
    category: spec.category,
    baseProductId: designBaseProduct(spec.category).id,
    generation: spec.targetGeneration,
    focus: spec.focus,
    ambition: spec.ambition,
    performance,
    reliability,
    unitCostFactor,
    trueQuality,
    uncertainty: 2,
    latentFlaw,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: spec.upgradeOf,
    introducedTurn: spec.turn,
    status: 'active',
    ...(spec.skunk ? { skunk: true } : {}),
  }
}

// P112 (§5.5): en uppgradering ärver föregångarens dolda utfall (gott och dåligt), brist, osäkerhet, provningshistorik och
// fältrykte; dess tak är lägre (prestanda och tillförlitlighet stiger högst upgradeMaxPerformanceGain över föregångarens och
// sjunker aldrig) och styckkostnaden är föregångarens. Bara en liten spridning dras — ingen ny brist- eller genombrottsrullning.
function rollUpgrade(rng: Rng, house: House, spec: DesignRollSpec, pred: Design): Design {
  const focus = BALANCE.designFocus[spec.focus]
  const steps = BALANCE.designAmbition[spec.ambition].steps
  const gain = BALANCE.upgradeMaxPerformanceGain
  const freshPerformance = focus.performance + steps * BALANCE.designAmbitionPerformanceGain
  const freshReliability = focus.reliability - steps * BALANCE.designAmbitionReliabilityLoss
  const performance = clampPct(Math.max(pred.performance, Math.min(freshPerformance, pred.performance + gain)))
  const reliability = clampPct(Math.max(pred.reliability, Math.min(freshReliability, pred.reliability + gain)))
  const redesign = spec.redesignOf !== undefined && spec.redesignOf !== null
  const rawDelta = pred.trueQuality - (pred.performance + pred.reliability) / 2
  // En omkonstruktion (P113) är felfri och tar inte med sig ett negativt utfall.
  const inheritedDelta = redesign ? Math.max(0, rawDelta) : rawDelta
  const trueQuality = clampPct((performance + reliability) / 2 + inheritedDelta + rng.int(-BALANCE.designSpread, BALANCE.designSpread))
  return {
    id: `design-${house.designs.length + 1}`,
    name: designName(house, spec.category, spec.year),
    category: spec.category,
    baseProductId: pred.baseProductId,
    generation: spec.targetGeneration,
    focus: spec.focus,
    ambition: spec.ambition,
    performance,
    reliability,
    unitCostFactor: pred.unitCostFactor,
    trueQuality,
    uncertainty: pred.uncertainty,
    latentFlaw: !redesign && pred.latentFlaw ? { ...pred.latentFlaw } : null,
    flawRevealed: redesign ? false : pred.flawRevealed,
    testedIn: [...pred.testedIn],
    fieldRecord: { ...pred.fieldRecord },
    lineage: pred.id,
    introducedTurn: spec.turn,
    status: 'active',
  }
}

// De värden köparen FAKTISKT får: de nominella förskjutna med utfallet (trueQuality minus det nominella medelvärdet).
export function designTrueValues(design: Pick<Design, 'performance' | 'reliability' | 'trueQuality'>): { performance: number; reliability: number } {
  const delta = design.trueQuality - (design.performance + design.reliability) / 2
  return { performance: design.performance + delta, reliability: design.reliability + delta }
}

// ── köparens preferensmix och den relativa bedömningen (P111, ETAPP9 §5.4) ──────────────────────────

type MixInput = Pick<GameState, 'officials' | 'fronts'>
type MixOrder = Pick<Order, 'buyerId' | 'officialId' | 'frontId'>

function frontFor(state: MixInput, order: MixOrder): { front: Front; side: 'a' | 'b' } | null {
  const direct = order.frontId !== null ? state.fronts[order.frontId] : undefined
  const candidates = direct ? [direct] : Object.values(state.fronts)
  for (const front of candidates) {
    if (front.sideA === order.buyerId) return { front, side: 'a' }
    if (front.sideB === order.buyerId) return { front, side: 'b' }
  }
  return null
}

// Köparens dolda preferensmix för en kategori, härledd ur det som finns (ingen ny lagrad sanning): grundmixen,
// tjänstemannens agenda, en förlorande front och förbandens doktrin. Ren och deterministisk; varje vikt golvas och
// mixen normaliseras till summa 1. Underrättelse avslöjar den (buyerPreferenceDisplay i queries).
export function buyerPreferenceMix(state: MixInput, order: MixOrder, category: TechCategory): PreferenceMix {
  const mix: PreferenceMix = { ...BALANCE.preferenceMixBase }
  // Flytta `amount` till en vikt från de två andra, lika.
  const shift = (to: keyof PreferenceMix, amount: number): void => {
    mix[to] += amount
    for (const other of ['performance', 'reliability', 'cost'] as const) if (other !== to) mix[other] -= amount / 2
  }

  const agenda = state.officials[order.officialId]?.agenda
  if (agenda === 'MODERNISE') shift('performance', BALANCE.preferenceMixAgendaShift)
  if (agenda === 'AUSTERITY') shift('cost', BALANCE.preferenceMixAgendaShift)

  const match = frontFor(state, order)
  if (match) {
    const { front, side } = match
    const losing = side === 'a' ? front.position > BALANCE.preferenceMixLosingPosition : front.position < -BALANCE.preferenceMixLosingPosition
    if (losing) shift('performance', BALANCE.preferenceMixLosingFrontShift)

    const formations = (front.formations ?? []).filter((f) => f.factionId === order.buyerId && f.status !== 'destroyed')
    if (formations.length > 0) {
      const meanWeight = formations.reduce((sum, f) => sum + (BALANCE.doctrineProfile[f.doctrine]?.[category] ?? 0), 0) / formations.length
      // 0,25 = lika vikt mellan de fyra kategorier en doktrin namnger; 0,5 = avståndet till "helt dominerande".
      const emphasis = Math.max(-1, Math.min(1, (meanWeight - 0.25) / 0.5))
      shift('performance', BALANCE.preferenceMixDoctrineShift * emphasis)
    }
  }

  for (const key of ['performance', 'reliability', 'cost'] as const) mix[key] = Math.max(BALANCE.preferenceMixFloor, mix[key])
  const total = mix.performance + mix.reliability + mix.cost
  return { performance: mix.performance / total, reliability: mix.reliability / total, cost: mix.cost / total }
}

// Riktmärket en konstruktion bedöms mot: nivån för en viss generation, som stiger med generationen. P118: generationen är
// KÖPARENS blocks (hos ett block som kommit längre krävs mer). Det är "det bästa köparen redan erbjudits" — när rivalerna hinner
// ikapp krymper försprånget av sig självt, utan extra regler. Kostnadsdelen är fast (basproduktens faktor 1 värderas lika med
// riktmärket).
export function designBenchmark(generation: number): number {
  return BALANCE.designBenchmarkBase + BALANCE.benchmarkPerGeneration * (generation - 1)
}

const COST_BENCHMARK = 50

// Budtermen (skyddsräcke 1 och 3): designBidWeight × clamp((köparens värdering − riktmärket) / 50, −1, 1), adderad till
// spelarens poäng EFTER computeScore. Värderingen är mix-viktad över sann prestanda, sann tillförlitlighet och en kostnadspoäng
// (50 + (1 − styckkostnadsfaktor) × 100); riktmärket viktas med samma mix. Samma funktion används av bidding.ts,
// bidEstimate och playerWinCurve.
export function designBidTerm(state: Pick<GameState, 'meta' | 'officials' | 'fronts' | 'race' | 'factions'>, design: Design, order: MixOrder): number {
  const mix = buyerPreferenceMix(state, order, design.category)
  const values = designTrueValues(design)
  const costScore = Math.max(0, Math.min(100, COST_BENCHMARK + (1 - design.unitCostFactor) * 100))
  const value = mix.performance * values.performance + mix.reliability * values.reliability + mix.cost * costScore
  // P119: en rivals specifikationer som först på plats hos köparens block är en måttstock husets konstruktion bedöms mot (aldrig lägre
  // än generationens riktmärke).
  const benchmark = Math.max(designBenchmark(buyerGeneration(state, order.buyerId, design.category)), yardstickAgainstPlayer(state, order.buyerId, design.category) ?? 0)
  const benchmarkValue = (mix.performance + mix.reliability) * benchmark + mix.cost * COST_BENCHMARK
  const relative = Math.max(-1, Math.min(1, (value - benchmarkValue) / 50))
  // P114: stridsbeprövad syns hos alla köpare som en bonus (utanför ±designBidWeight — den är ett ryktesbevis, inte en värdering).
  // P115: ett fältprov hos just den här köparen ger en bonus i dess nästa upphandling (förbrukas när konstruktionen vinner där).
  const trialBonus = design.trials?.[order.buyerId]?.bonusActive ? BALANCE.fieldTrialBidBonus : 0
  // P116: varje rival som kopierat den fångade konstruktionen sänker dess värde (egenskaper som tappar värde när andra kopierar).
  const copyPenalty = (design.copiedBy?.length ?? 0) * BALANCE.copyBidPenalty
  // P117: ett nyhetsvärde som avtar (en ny konstruktion drar uppmärksamhet; den åldras av sig själv).
  return BALANCE.designBidWeight * relative + (design.fieldRecord?.proven ? BALANCE.provenBidBonus : 0) + trialBonus - copyPenalty + noveltyBonus(design, state.meta.turn)
}

// P115 (§6.4): fältprovets sats — en mindre del av basproduktens minsta orderkvantitet, till självkostnad.
export function fieldTrialBatch(state: Pick<GameState, 'market'>, design: Design): { units: number; cost: number } {
  const product = getProduct(design.baseProductId)
  const units = Math.max(1, Math.ceil((product.orderQuantityMin ?? 1) * BALANCE.fieldTrialBatchFraction))
  const unitCost = computeUnitCostNow(product, 'A', state.market.commodities) * design.unitCostFactor
  return { units, cost: Math.round(unitCost * units) }
}

// Styckkostnadsfaktorn för ett kontrakt/bud med en konstruktion (1 utan).
export function designUnitCostFactor(house: Pick<House, 'designs'>, designId: DesignId | undefined): number {
  if (!designId) return 1
  return house.designs?.find((d) => d.id === designId)?.unitCostFactor ?? 1
}

// Kontrollen bud med designId går igenom (bidding.ts): ger avvisningsorsaken eller null.
export function designBidRejection(house: Pick<House, 'designs'>, designId: DesignId, productId: string): string | null {
  const design = house.designs?.find((d) => d.id === designId)
  if (!design) return 'unknown design'
  if (design.baseProductId !== productId) return 'design does not fit this order'
  if (design.status === 'withdrawn') return 'design is withdrawn'
  return null
}

// ── ritbordsuppdraget ────────────────────────────────────────────────────────

export function isDesignProject(project: Pick<RndProject, 'design'>): boolean {
  return project.design !== undefined
}

export function validateDesignStart(
  house: House,
  change: { category: TechCategory; focus: DesignFocus; ambition: DesignAmbition; upgradeOf?: DesignId | null; skunk?: boolean },
): string | null {
  if (!(TECH_CATEGORIES as readonly string[]).includes(change.category)) return 'unknown category'
  if (!(DESIGN_FOCUSES as readonly string[]).includes(change.focus)) return 'unknown design focus'
  if (!(DESIGN_AMBITIONS as readonly string[]).includes(change.ambition)) return 'unknown design ambition'
  if (house.techLevel[change.category] < designBaseProduct(change.category).techRequired) {
    return 'tech level too low for a design in that category'
  }
  if (house.rnd.some((p) => p.category === change.category && p.design)) return 'a design project is already running in that category'
  if (change.skunk && change.upgradeOf !== undefined && change.upgradeOf !== null) return 'a special project cannot be an upgrade'
  if (change.upgradeOf !== undefined && change.upgradeOf !== null) {
    const pred = house.designs?.find((d) => d.id === change.upgradeOf)
    if (!pred) return 'unknown design to upgrade'
    if (pred.category !== change.category) return 'the design to upgrade is in another category'
    if (pred.status !== 'active') return 'the design to upgrade is withdrawn'
  }
  return null
}

export function newDesignProject(house: House, spec: DesignProjectSpec & { category: TechCategory }, turn: number, follower = false): RndProject {
  const upgrade = spec.upgradeOf !== null
  const redesign = spec.redesignOf !== undefined && spec.redesignOf !== null
  // P113: en omkonstruktion går ännu fortare än en uppgradering — huset har lärt sig (redesignTurnsFactor).
  const baseTurns = redesign
    ? Math.max(1, Math.round(designDuration(house, spec.ambition, true) * BALANCE.redesignTurnsFactor))
    : designDuration(house, spec.ambition, upgrade)
  // P119 (princip 5): ett efterföljarprojekt — mot en nivå som redan fältats — är billigare och kortare.
  const followerTurns = follower ? Math.max(1, baseTurns - BALANCE.followerTurnsSaved) : baseTurns
  // P134 (§8b.3): ett specialprojekt går fortare men kostar mer per tur.
  const skunkTurns = spec.skunk ? Math.max(1, Math.round(followerTurns * BALANCE.skunkTurnsFactor)) : followerTurns
  // P134 (§8b.3): en snabb chefskonstruktör kortar ett projekt en tur.
  const turns = Math.max(1, skunkTurns - designerTurnsSaved(house))
  return {
    id: `rnd-design-${spec.category}-${turn}`,
    category: spec.category,
    turnsRemaining: turns,
    turnsTotal: turns,
    costFactor: designCostPerTurn(spec.ambition, upgrade) * (follower ? BALANCE.followerCostFactor : 1) * (spec.skunk ? BALANCE.skunkCostFactor : 1) * designerCostFactor(house),
    design: {
      focus: spec.focus,
      ambition: spec.ambition,
      targetGeneration: spec.targetGeneration,
      upgradeOf: spec.upgradeOf,
      ...(redesign ? { redesignOf: spec.redesignOf } : {}),
      ...(spec.skunk ? { skunk: true } : {}),
    },
  }
}

// ── miljöer och provning (P110, ETAPP9 §5.3) ─────────────────────────────────

const FRONT_ENVIRONMENTS = environmentsData as unknown as Record<string, DesignEnvironment[] | string>

// Miljöerna en front har (data/environments.json). En okänd front har inga.
export function frontEnvironments(frontId: string): DesignEnvironment[] {
  const value = FRONT_ENVIRONMENTS[frontId]
  return Array.isArray(value) ? value : []
}

export function validateTestingChange(
  house: House,
  change: { op: 'SET'; designId: DesignId; environment: DesignEnvironment } | { op: 'CANCEL'; designId: DesignId },
): string | null {
  if (change.op === 'CANCEL') return house.standingOrders?.testing?.[change.designId] ? null : 'no testing of that design'
  const design = house.designs?.find((d) => d.id === change.designId)
  if (!design) return 'unknown design'
  if (!(DESIGN_ENVIRONMENTS as readonly string[]).includes(change.environment)) return 'unknown test environment'
  if (design.status !== 'active') return 'design is withdrawn'
  return null
}

// Avslöjar en konstruktions dolda brist (provning i rätt miljö nu, en front med rätt miljö i P113). Returnerar sant om
// något avslöjades. Bristen görs synlig — inte åtgärdad.
export function revealFlaw(design: Design): boolean {
  if (!design.latentFlaw || design.flawRevealed) return false
  design.flawRevealed = true
  return true
}

// Kostnaden för pågående provningar per tur, i multiplar av rndOverhead (ingen specialiseringshalvering — provning är
// inte forskning i en kategori). `turn` utelämnat räknar alla; annars bara de som redan gäller.
export function testingOverheadCount(house: Pick<House, 'standingOrders'>, turn?: number): number {
  const tests = Object.values(house.standingOrders?.testing ?? {})
  return tests.filter((t) => turn === undefined || turn >= t.sinceTurn).length
}

// ── uppgraderingssatser (P112, ETAPP9 §5.5) ─────────────────────────────────

// Poängbonusen en satsaffär ger (snabbare affär), efter computeScore — delad av bidding.ts, bidEstimate och playerWinCurve.
export function kitBidTerm(): number {
  return BALANCE.kitScoreBonus
}

export function kitPriceCap(order: Pick<Order, 'referencePrice'>): number {
  return Math.round(BALANCE.kitPriceCapFactor * order.referencePrice)
}

export const KIT_UNIT_COST_FACTOR = BALANCE.kitUnitCostFactor
export const DESIGN_SPREAD = BALANCE.designSpread // P129: härnessens genombrottsmått läser spridningen ur datan

// Villkoren för en uppgraderingssats: en uppgraderad konstruktion (lineage), köparen har fått föregångaren (eller någon
// tidigare i släktlinjen) levererad (ett fullgjort kontrakt bärande dess designId), och priset ligger under taket
// (lägre marginal). `price` utelämnat prövar bara de två första villkoren (skattningarna).
export function kitBidRejection(
  state: Pick<GameState, 'house' | 'market'>,
  design: Design,
  order: Pick<Order, 'buyerId' | 'referencePrice'>,
  price?: number,
): string | null {
  if (design.lineage === null) return 'an upgrade kit needs an upgraded design'
  const lineage = new Set<string>()
  for (let id: string | null = design.lineage; id !== null && !lineage.has(id); ) {
    lineage.add(id)
    id = state.house.designs.find((d) => d.id === id)?.lineage ?? null
  }
  const hasMateriel = state.market.contracts.some(
    (c) => c.status === 'fulfilled' && c.buyerId === order.buyerId && c.designId !== undefined && lineage.has(c.designId),
  )
  if (!hasMateriel) return 'the buyer has no materiel of the predecessor'
  if (price !== undefined && price > kitPriceCap(order)) return 'kit price above the cap'
  return null
}

// Hela prövningen av ett bud som bär en konstruktion och/eller en sats (bidding.ts). null = godtaget.
export function bidDesignRejection(
  state: Pick<GameState, 'house' | 'market' | 'meta' | 'factions' | 'race'>,
  bid: { designId?: string; kit?: boolean; price: number },
  order: Pick<Order, 'buyerId' | 'productId' | 'referencePrice'>,
): string | null {
  if (bid.designId === undefined) return bid.kit ? 'an upgrade kit needs an upgraded design' : null
  const rejection = designBidRejection(state.house, bid.designId, order.productId)
  if (rejection) return rejection
  // P117 (§6.3): en konstruktion vars generation fasats ut för köparens block kan inte längre bjudas.
  const offered = state.house.designs.find((d) => d.id === bid.designId)!
  if (designPhasedOutForBuyer(state, offered, order.buyerId)) return 'design phased out for this buyer'
  // P132 (§8b.1): en konstruktion bunden av ett forskningsanslag får inte säljas till det andra blocket eller till neutrala.
  const exclusive = exclusivityRejection(state, offered, order.buyerId)
  if (exclusive) return exclusive
  if (!bid.kit) return null
  return kitBidRejection(state, state.house.designs.find((d) => d.id === bid.designId)!, order, bid.price)
}
