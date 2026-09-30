// design — P109 (ETAPP9_FORSLAG.md §5.1–5.3, beslut 9B/9D/9L). Konstruktionerna: ritbordsuppdraget (stående order
// DESIGN), utfallet (dras med ctx.rng när ett designprojekt blir klart), den dolda kvaliteten och den delade
// budtermen. En konstruktion är en VARIANT av en basprodukt (9B): ett bud bär designId på en order för basprodukten.
//
// EN källa för budtermen (skyddsräcke 3): bidding.ts, bidEstimate och playerWinCurve (via WinBandInputs) läser alla
// designBidTerm, och den läggs EFTER computeScore (skyddsräcke 1). Ett bud utan konstruktion får ingen term.
import balanceData from './data/balance.json' with { type: 'json' }
import { allProducts } from './pricing.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { Rng } from './rng.js'
import type {
  Design,
  DesignAmbition,
  DesignEnvironment,
  DesignFocus,
  DesignId,
  DesignProjectSpec,
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
  generationStepTurns: number
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
  designBenchmarkBase: number
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

// Typnamn per kategori (beslut 9L: "H&V M64 Field Gun").
const TYPE_NAME: Record<TechCategory, string> = {
  infantry: 'Rifle',
  artillery: 'Field Gun',
  armour: 'APC',
  aviation: 'Helicopter',
  naval: 'Patrol Boat',
  electronics: 'Radio Suite',
}

// Kategorins basprodukt: den icke-restricted produkt en konstruktion bygger på och bjuds på ordrar för (9B).
export function designBaseProduct(category: TechCategory): Product {
  const product = allProducts().find((p) => p.category === category && !p.restricted)
  if (!product) throw new Error(`no base product for category ${category}`)
  return product
}

// Den tidsenliga generationen vid en viss tur — ett PROVISORISKT tidsschema (kliv var generationStepTurns:e tur,
// ägarbeslut 2026-09-30). P118 ersätter det med blockens dolda generationer; ambitionen mäts mot samma funktion.
export function currentGeneration(turn: number): number {
  return 1 + Math.floor(turn / BALANCE.generationStepTurns)
}

function chiefEngineerSaves(house: Pick<House, 'staff'>): number {
  return house.staff.chiefEngineer > BALANCE.chiefEngineerProjectThreshold ? BALANCE.chiefEngineerTurnsSaved : 0
}

// Ett designprojekts längd: rndProjectTurns × ambitionens tidsfaktor, en tur kortare med chefsingenjören över tröskeln.
export function designDuration(house: Pick<House, 'staff'>, ambition: DesignAmbition): number {
  const base = Math.max(1, Math.round(BALANCE.rndProjectTurns * BALANCE.designAmbition[ambition].turnsFactor))
  return Math.max(1, base - chiefEngineerSaves(house))
}

// Faktorn på rndOverhead per tur — ambitionens costFactor.
export function designCostPerTurn(ambition: DesignAmbition): number {
  return BALANCE.designAmbition[ambition].costFactor
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

function initialsOf(houseName: string): string {
  const words = houseName.split(/\s+/).filter((w) => w.length > 0 && w !== '&')
  const initials = words.map((w) => w[0]!.toUpperCase())
  return houseName.includes('&') ? initials.join('&') : initials.join('')
}

// "H&V M64 Field Gun" (9L): husets initialer + beteckning (M + årtal) + typ. En andra konstruktion med samma namn får
// ett löpnummer så att namnen förblir unika.
export function designName(house: Pick<House, 'name' | 'designs'>, category: TechCategory, year: number): string {
  const base = `${initialsOf(house.name)} M${String(year % 100).padStart(2, '0')} ${TYPE_NAME[category]}`
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
}

// Utfallet (§5.2): genombrott, gedigen eller en konstruktion med en dold miljöbrist. Spannet beror på ambition,
// chefsingenjör och husets erfarenhet (antalet egna konstruktioner i kategorin). Dras med den Rng som skickas in
// (ctx.rng i resolve, hård regel 2). De SYNLIGA värdena är designvalen; bara trueQuality och bristen är utfallet.
export function rollDesign(rng: Rng, house: House, spec: DesignRollSpec): Design {
  const focus = BALANCE.designFocus[spec.focus]
  const steps = BALANCE.designAmbition[spec.ambition].steps
  const performance = clampPct(focus.performance + steps * BALANCE.designAmbitionPerformanceGain)
  const reliability = clampPct(focus.reliability - steps * BALANCE.designAmbitionReliabilityLoss)
  const unitCostFactor = Math.round((focus.unitCostFactor + steps * BALANCE.designAmbitionUnitCostGain) * 100) / 100

  const experience = Math.min(BALANCE.designExperienceCap, house.designs.filter((d) => d.category === spec.category).length)
  const flawPct = Math.max(
    0,
    BALANCE.designFlawBasePct +
      steps * BALANCE.designAmbitionFlawGainPct -
      (house.staff.chiefEngineer > BALANCE.chiefEngineerProjectThreshold ? BALANCE.designChiefEngineerFlawReductionPct : 0) -
      experience * BALANCE.designExperienceFlawReductionPct,
  )
  const roll = rng.int(0, 99)
  const breakthrough = roll < BALANCE.designBreakthroughBasePct
  const flawed = !breakthrough && roll < BALANCE.designBreakthroughBasePct + flawPct
  const delta = breakthrough ? BALANCE.designBreakthroughDelta : flawed ? BALANCE.designFlawDelta : 0
  const trueQuality = clampPct((performance + reliability) / 2 + delta + rng.int(-BALANCE.designSpread, BALANCE.designSpread))

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
  }
}

// De värden köparen FAKTISKT får: de nominella förskjutna med utfallet (trueQuality minus det nominella medelvärdet).
export function designTrueValues(design: Pick<Design, 'performance' | 'reliability' | 'trueQuality'>): { performance: number; reliability: number } {
  const delta = design.trueQuality - (design.performance + design.reliability) / 2
  return { performance: design.performance + delta, reliability: design.reliability + delta }
}

// Budtermen (skyddsräcke 1 och 3): designBidWeight × clamp((sant värde − riktmärket) / 50, −1, 1), adderad till
// spelarens poäng EFTER computeScore. P109:s neutrala läge — medelvärdet av sann prestanda och tillförlitlighet mot ett
// fast riktmärke. P111 gör den köpar-viktad och relativ; funktionen och dess anropare är desamma.
export function designBidTerm(_state: Pick<GameState, 'meta'>, design: Design, _order: Pick<Order, 'buyerId'>): number {
  const values = designTrueValues(design)
  const mean = (values.performance + values.reliability) / 2
  const relative = Math.max(-1, Math.min(1, (mean - BALANCE.designBenchmarkBase) / 50))
  return BALANCE.designBidWeight * relative
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
  change: { category: TechCategory; focus: DesignFocus; ambition: DesignAmbition },
): string | null {
  if (!(TECH_CATEGORIES as readonly string[]).includes(change.category)) return 'unknown category'
  if (!(DESIGN_FOCUSES as readonly string[]).includes(change.focus)) return 'unknown design focus'
  if (!(DESIGN_AMBITIONS as readonly string[]).includes(change.ambition)) return 'unknown design ambition'
  if (house.techLevel[change.category] < designBaseProduct(change.category).techRequired) {
    return 'tech level too low for a design in that category'
  }
  if (house.rnd.some((p) => p.category === change.category && p.design)) return 'a design project is already running in that category'
  return null
}

export function newDesignProject(house: House, spec: DesignProjectSpec & { category: TechCategory }, turn: number): RndProject {
  const turns = designDuration(house, spec.ambition)
  return {
    id: `rnd-design-${spec.category}-${turn}`,
    category: spec.category,
    turnsRemaining: turns,
    turnsTotal: turns,
    costFactor: designCostPerTurn(spec.ambition),
    design: {
      focus: spec.focus,
      ambition: spec.ambition,
      targetGeneration: spec.targetGeneration,
      upgradeOf: spec.upgradeOf,
    },
  }
}
