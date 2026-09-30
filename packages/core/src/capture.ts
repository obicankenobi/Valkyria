// capture — P116 (ETAPP9_FORSLAG.md §6.5, beslut 9G). Fångad materiel och kopiering åt båda håll.
//
// Åt ena hållet tar motståndaren husets materiel vid ett genombrott, och en rival på andra sidan kan kopiera konstruktionen
// efter några turer (den tappar värde när andra kopierar). Åt andra hållet överlämnar köpare fiendens erövrade materiel, som
// REVERSE_ENGINEER (det andra nya verbet) förvandlar till ett forskningsförsprång mot just det systemet.
//
// Ingen slump utom rivalens kopiering (ctx.rng, bara när en fångad konstruktion faktiskt kan kopieras); varje ändring
// emitterar en WireEvent med causeId (hård regel 4).
import balanceData from './data/balance.json' with { type: 'json' }
import enemySystemsData from './data/enemySystems.json' with { type: 'json' }
import { recordExpense } from './ledger.js'
import { TECH_CATEGORIES } from './validateAction.js'
import type { ResolveContext } from './resolve/index.js'
import type { CapturedMateriel, Front, House, TechCategory } from './types.js'

interface Balance {
  copyDelayTurns: number
  copyChancePct: number
  copyExposedFactor: number
  captureFractionPct: number
  reverseEngineerCost: number
  reverseEngineerBaseTurns: number
  headStartCap: number
  categoryCombatWeight: Record<TechCategory, number>
}
const BALANCE = balanceData as unknown as Balance

const ENEMY_SYSTEMS = enemySystemsData as unknown as Record<string, Partial<Record<TechCategory, string>> | string>

export function enemySystemId(factionId: string, category: TechCategory): string {
  return `${factionId}-${category}`
}

export function enemySystemName(factionId: string, category: TechCategory): string {
  const faction = ENEMY_SYSTEMS[factionId]
  const named = faction && typeof faction === 'object' ? faction[category] : undefined
  return named ?? `${factionId.toUpperCase()} ${category.toUpperCase()} SYSTEM`
}

// Blocket en faktions alignment pekar på (öst −, väst +); 0 = inget block.
function blocOf(alignment: number): 'west' | 'east' | null {
  return alignment > 0 ? 'west' : alignment < 0 ? 'east' : null
}

// Anropas från fronts.ts när ett genombrott avgjorts (vinnare och förlorare känd): både det motståndaren tar av husets
// materiel och det husets köpare överlämnar av fiendens.
export function handleBreakthroughCaptures(ctx: ResolveContext, front: Front, winnerSide: 'a' | 'b', causeId: string): void {
  const { draft, emit } = ctx
  const house = draft.house
  const loserSide: 'a' | 'b' = winnerSide === 'a' ? 'b' : 'a'
  const winnerFactionId = winnerSide === 'a' ? front.sideA : front.sideB
  const loserFactionId = loserSide === 'a' ? front.sideA : front.sideB

  // (1) Motståndaren tar husets materiel — en gång per konstruktion.
  const units = front.designUnits?.[loserSide]
  if (units) {
    for (const designId of Object.keys(units)) {
      if ((units[designId] ?? 0) <= 0) continue
      const design = house.designs?.find((d) => d.id === designId)
      if (!design || design.captured) continue
      const captureId = emit({
        severity: 'headline',
        scope: 'front',
        headline: `THE ENEMY CAPTURES ${design.name.toUpperCase()} MATERIEL ON THE ${front.id.toUpperCase()} FRONT — A RIVAL ON THE OTHER SIDE MAY COPY IT`,
        causeId,
        delta: {},
        actorIsPlayer: true,
        subjectId: front.id,
      })
      design.captured = { turn: draft.meta.turn, byFactionId: winnerFactionId, eventId: captureId }
    }
  }

  // (2) Husets köpare vinner och överlämnar fiendens erövrade materiel — om huset har ett giltigt kontrakt med den köparen.
  const hasContract = draft.market.contracts.some((c) => c.buyerId === winnerFactionId && c.status !== 'voided')
  if (!hasContract) return
  let best: { category: TechCategory; value: number } | null = null
  for (const category of TECH_CATEGORIES) {
    const equipment = front.equipment[loserSide][category]
    if (equipment < 1) continue
    const value = equipment * BALANCE.categoryCombatWeight[category]
    if (best === null || value > best.value) best = { category, value }
  }
  if (best === null) return
  const captured = Math.max(1, Math.round((front.equipment[loserSide][best.category] * BALANCE.captureFractionPct) / 100))
  const systemId = enemySystemId(loserFactionId, best.category)
  const name = enemySystemName(loserFactionId, best.category)
  const list = (house.capturedMateriel ??= [])
  const existing = list.find((m) => m.systemId === systemId)
  if (existing) existing.units += captured
  else list.push({ systemId, name, category: best.category, fromFactionId: loserFactionId, units: captured })
  const buyer = draft.factions[winnerFactionId]
  emit({
    severity: 'report',
    scope: 'front',
    headline: `${(buyer ? buyer.name : winnerFactionId).toUpperCase()} HANDS ${captured}× CAPTURED ${name.toUpperCase()} OVER TO ${house.name.toUpperCase()}`,
    causeId,
    delta: { [`capturedMateriel.${systemId}`]: captured },
    actorIsPlayer: true,
    subjectId: winnerFactionId,
  })
}

// Varje tur efter fördröjningen kan EN rival i motståndarens block kopiera en fångad konstruktion (chans per tur och
// konstruktion, högre om kvaliteten blivit känd för alla genom ett fältprov). Anropas från rivals-steget.
export function processDesignCopying(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  for (const design of draft.house.designs ?? []) {
    const captured = design.captured
    if (!captured || draft.meta.turn < captured.turn + BALANCE.copyDelayTurns) continue
    const bloc = blocOf(draft.factions[captured.byFactionId]?.alignment ?? 0)
    if (bloc === null) continue
    const copied = new Set(design.copiedBy ?? [])
    const eligible = Object.values(draft.rivals)
      .filter((r) => r.homeState === bloc && !copied.has(r.id))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (eligible.length === 0) continue
    const chance = BALANCE.copyChancePct * (design.exposedToRivals ? BALANCE.copyExposedFactor : 1)
    if (!rng.chance(chance)) continue
    const rival = rng.pick(eligible)
    design.copiedBy = [...(design.copiedBy ?? []), rival.id]
    emit({
      severity: 'headline',
      scope: 'market',
      headline: `${rival.name.toUpperCase()} COPIES THE CAPTURED ${design.name.toUpperCase()} — ITS EDGE ERODES`,
      causeId: captured.eventId,
      delta: {},
      actorIsPlayer: false,
      subjectId: rival.id,
    })
  }
}

// ── REVERSE_ENGINEER ─────────────────────────────────────────────────────────

// Forskningsförsprånget (turer) av `units` exemplar: avtagande (sqrt), aldrig över headStartCap.
export function reverseEngineerTurns(units: number): number {
  return Math.min(BALANCE.headStartCap, BALANCE.reverseEngineerBaseTurns * Math.sqrt(units))
}

export function capturedSystem(house: Pick<House, 'capturedMateriel'>, systemId: string): CapturedMateriel | undefined {
  return house.capturedMateriel?.find((m) => m.systemId === systemId && m.units > 0)
}

// Studerar ALLA exemplar av ett erövrat system: kostar reverseEngineerCost (huvudboken: intel), förbrukar posten, lägger
// försprånget i kategorins bank (P107:s, förbrukas av pågående projekt, aldrig över headStartCap) och noterar studien.
export function applyReverseEngineer(ctx: ResolveContext, systemId: string): void {
  const { draft, emit } = ctx
  const house = draft.house
  const entry = capturedSystem(house, systemId)!
  const cost = BALANCE.reverseEngineerCost
  house.treasury -= cost
  recordExpense(draft, 'intel', cost)

  const bank = (house.researchHeadStart ??= { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 })
  const before = bank[entry.category] ?? 0
  bank[entry.category] = Math.min(BALANCE.headStartCap, before + reverseEngineerTurns(entry.units))
  const gained = bank[entry.category]! - before

  const studied = (house.studiedSystems ??= {})
  studied[systemId] = (studied[systemId] ?? 0) + entry.units
  house.capturedMateriel = (house.capturedMateriel ?? []).filter((m) => m.systemId !== systemId)

  emit({
    severity: 'report',
    scope: 'house',
    headline: `${house.name.toUpperCase()} REVERSE-ENGINEERS ${entry.units}× CAPTURED ${entry.name.toUpperCase()} — ${entry.category.toUpperCase()} R&D GETS A HEAD START (−£${cost.toLocaleString('en-GB')})`,
    causeId: null,
    delta: { treasury: -cost, [`researchHeadStart.${entry.category}`]: gained },
    actorIsPlayer: true,
    subjectId: entry.fromFactionId,
  })
}
