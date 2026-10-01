// fieldQuality — P114 (ETAPP9_FORSLAG.md §6.1–6.2, beslut 9E). Produkten i striderna: materielkvaliteten per front och sida
// (högst ±fieldQualityRange), fälttillfällen, stridsbeprövad, familjerykte och flaggskeppet.
//
// Allt skrivs i valfria fält (Front.equipmentQuality/designUnits) som utelämnas tills en konstruktion levereras — ett parti utan
// konstruktioner är bitvis oförändrat. Ingen slump här (hård regel 2): fälttillfällen är rena konsekvenser av det fronten redan
// avgjort; varje ändring emitterar en WireEvent med causeId (hård regel 4).
import balanceData from './data/balance.json' with { type: 'json' }
import { designTrueValues, frontEnvironments } from './design.js'
import { counterReaction } from './race.js'
import type { ResolveContext } from './resolve/index.js'
import type { Contract, Design, Front, GameState, House, TechCategory } from './types.js'

interface Balance {
  fieldQualityRange: number
  flawBattlePenaltyPerSeverity: number
  provenOccasions: number
  provenMinOccasions: number
  provenFamilyStep: number
  frontHoldFraction: number
  frontBreakthroughThreshold: number
  preferenceMixLosingPosition: number
}
const BALANCE = balanceData as unknown as Balance

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Materielfaktorn för en konstruktion på en viss front: 1 ± fieldQualityRange efter de sanna värdenas medelvärde (mitt = 1),
// minus flawBattlePenaltyPerSeverity × allvar om en brist hör till frontens miljö, klampad till ±fieldQualityRange.
export function designFieldFactor(design: Design, frontId: string): number {
  const values = designTrueValues(design)
  const mean = (values.performance + values.reliability) / 2
  let factor = 1 + BALANCE.fieldQualityRange * clamp((mean - 50) / 50, -1, 1)
  const flaw = design.latentFlaw
  if (flaw && frontEnvironments(frontId).includes(flaw.environment)) factor -= BALANCE.flawBattlePenaltyPerSeverity * flaw.severity
  return clamp(factor, 1 - BALANCE.fieldQualityRange, 1 + BALANCE.fieldQualityRange)
}

// Sidans materielkvalitet i en kategori (1 om ingen konstruktion levererats).
export function sideQuality(front: Pick<Front, 'equipmentQuality'>, side: 'a' | 'b', category: TechCategory): number {
  return front.equipmentQuality?.[side]?.[category] ?? 1
}

// Bokför en leverans i kvalitetsfälten. Anropas FÖRE `front.equipment[side][category] += units`: medelvärdet viktas med
// det som redan finns. En vanlig leverans (kvalitet 1, ingen konstruktion) späder bara ut ett befintligt medelvärde och
// skriver aldrig ett fält i ett parti utan konstruktioner.
export function recordFrontDelivery(
  front: Front,
  side: 'a' | 'b',
  category: TechCategory,
  units: number,
  quality: number,
  designId: string | undefined,
): void {
  if (designId !== undefined) {
    const record = (front.designUnits ??= { a: {}, b: {} })
    record[side][designId] = (record[side][designId] ?? 0) + units
  }
  const existingQuality = front.equipmentQuality?.[side]?.[category]
  if (quality === 1 && existingQuality === undefined) return
  const existing = front.equipment[side][category]
  const before = existingQuality ?? 1
  const total = existing + units
  const record = (front.equipmentQuality ??= { a: {}, b: {} })
  record[side][category] = total > 0 ? (existing * before + units * quality) / total : quality
}

// Vad en front avgjorde den här turen i termer av fälttillfällen: ett genombrott (vinnaren) eller att hålla under press
// (den pressade sidan — netAdvantage mellan frontHoldFraction × tröskeln och tröskeln). netAdvantage > 0 gynnar anfallaren.
export function classifyFrontOutcome(
  netAdvantage: number,
  attacker: 'a' | 'b',
  defender: 'a' | 'b',
): { kind: 'breakthrough' | 'hold'; side: 'a' | 'b' } | null {
  const magnitude = Math.abs(netAdvantage)
  if (magnitude > BALANCE.frontBreakthroughThreshold) return { kind: 'breakthrough', side: netAdvantage > 0 ? attacker : defender }
  if (magnitude >= BALANCE.frontBreakthroughThreshold * BALANCE.frontHoldFraction) return { kind: 'hold', side: netAdvantage > 0 ? defender : attacker }
  return null
}

// Familjen: alla konstruktioner med samma rot i släktlinjen (uppgraderingar delar familj med sin föregångare).
function familyOf(designs: readonly Design[], design: Design): Set<string> {
  const rootOf = (d: Design): string => {
    let current = d
    const seen = new Set<string>()
    while (current.lineage !== null && !seen.has(current.id)) {
      seen.add(current.id)
      const parent = designs.find((x) => x.id === current.lineage)
      if (!parent) break
      current = parent
    }
    return current.id
  }
  const root = rootOf(design)
  return new Set(designs.filter((d) => rootOf(d) === root).map((d) => d.id))
}

// Familjerykte: tröskeln för stridsbeprövad sjunker med varje ytterligare köpare som använder konstruktionsfamiljen
// (ett fullt giltigt kontrakt — inte annullerat), aldrig under provenMinOccasions.
export function provenThreshold(state: Pick<GameState, 'house' | 'market'>, design: Design): number {
  const family = familyOf(state.house.designs, design)
  const buyers = new Set(
    state.market.contracts.filter((c: Contract) => c.status !== 'voided' && c.designId !== undefined && family.has(c.designId)).map((c) => c.buyerId),
  )
  return Math.max(BALANCE.provenMinOccasions, BALANCE.provenOccasions - BALANCE.provenFamilyStep * Math.max(0, buyers.size - 1))
}

// Ger EN konstruktion ett fälttillfälle (också via ett fältprov, P115). Når den tröskeln blir den stridsbeprövad med
// `provenHeadline` och funktionen returnerar rubrikens id; annars emitterar den inget och returnerar null (anroparen
// bestämmer om en rad behövs).
export function grantFieldOccasion(
  ctx: ResolveContext,
  design: Design,
  provenHeadline: string,
  causeId: string | null,
  subjectId: string | null,
): string | null {
  const { draft, emit } = ctx
  design.fieldRecord.occasions += 1
  if (design.fieldRecord.proven || design.fieldRecord.occasions < provenThreshold(draft, design)) return null
  design.fieldRecord.proven = true
  return emit({
    severity: 'headline',
    scope: 'front',
    headline: provenHeadline,
    causeId,
    delta: { [`fieldRecord.${design.id}.occasions`]: 1 },
    actorIsPlayer: true,
    subjectId,
  })
}

// Ger varje konstruktion som levererats till sidan på fronten ett fälttillfälle. Den som når tröskeln blir stridsbeprövad
// med en rubrik ("THE H&V M64 HELD AT …").
export function awardFieldOccasions(
  ctx: ResolveContext,
  front: Front,
  side: 'a' | 'b',
  kind: 'breakthrough' | 'hold',
  causeId: string | null,
): void {
  const { draft, emit } = ctx
  const units = front.designUnits?.[side]
  if (!units) return
  for (const designId of Object.keys(units)) {
    if ((units[designId] ?? 0) <= 0) continue
    const design = draft.house.designs?.find((d) => d.id === designId)
    if (!design) continue
    const name = design.name.toUpperCase()
    const provenId = grantFieldOccasion(
      ctx,
      design,
      kind === 'hold'
        ? `THE ${name} HELD THE ${front.id.toUpperCase()} FRONT UNDER PRESSURE — BATTLE-PROVEN`
        : `THE ${name} BROKE THROUGH ON THE ${front.id.toUpperCase()} FRONT — BATTLE-PROVEN`,
      causeId,
      front.id,
    )
    if (provenId !== null) {
      // P117 (§6.6): en stark (stridsbeprövad) konstruktion skapar efterfrågan på dess motmedel hos motsidan på fronten.
      counterReaction(ctx, [side === 'a' ? front.sideB : front.sideA], design.category, name, provenId)
    } else {
      emit({
        severity: 'ticker',
        scope: 'front',
        headline: `${name} ${kind === 'hold' ? 'HOLDS UNDER PRESSURE ON' : 'LEADS A BREAKTHROUGH ON'} THE ${front.id.toUpperCase()} FRONT (FIELD RECORD ${design.fieldRecord.occasions})`,
        causeId,
        delta: { [`fieldRecord.${design.id}.occasions`]: 1 },
        actorIsPlayer: true,
        subjectId: front.id,
      })
    }
  }
}

// Flaggskeppet: husets bäst ansedda konstruktion — den stridsbeprövade, aktiva med flest fälttillfällen (vid lika den med
// högst sann kvalitet). null om ingen är stridsbeprövad.
export function flagshipDesign(house: Pick<House, 'designs'>): Design | null {
  let best: Design | null = null
  for (const d of house.designs ?? []) {
    if (!d.fieldRecord.proven || d.status !== 'active') continue
    if (best === null || d.fieldRecord.occasions > best.fieldRecord.occasions || (d.fieldRecord.occasions === best.fieldRecord.occasions && d.trueQuality > best.trueQuality)) best = d
  }
  return best
}

// Förlorar köparen på fronten (samma tröskel som köparens preferensmix, P111)?
export function buyerIsLosing(front: Pick<Front, 'sideA' | 'sideB' | 'position'>, buyerId: string): boolean {
  if (front.sideA === buyerId) return front.position > BALANCE.preferenceMixLosingPosition
  if (front.sideB === buyerId) return front.position < -BALANCE.preferenceMixLosingPosition
  return false
}
