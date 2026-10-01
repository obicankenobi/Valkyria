// race — P117 (ETAPP9_FORSLAG.md §6.3 och §6.6, beslut 9F). Motmedelskedjor, livscykel och automatisk utfasning. P118–P121 bygger
// kapplöpningen ovanpå (blockens generationer, kravkort, gap-chocker).
//
// Livscykeln sker av sig själv (princip 4): en ny konstruktion har ett nyhetsvärde som avtar, rivalernas konstruktioner (9F)
// kommer enligt schema, och när en generation fasas ut förlorar äldre konstruktioner behörighet i det blocket automatiskt.
// Motmedlen (§6.6): en stark konstruktion skapar efterfrågan på dess motmedel hos andra sidan, och ett forskningsprojekt kan
// riktas mot ett namngivet, studerat fiendesystem.
//
// Ren kärnlogik: inga imports av design.ts eller validateAction.ts (design.ts importerar den här filen). Slump används inte.
import balanceData from './data/balance.json' with { type: 'json' }
import { TYPE_NAME, designDesignation, initialsOf } from './designNaming.js'
import { getProduct } from './pricing.js'
import type { ResolveContext } from './resolve/index.js'
import type { Design, FactionId, GameState, House, Order, RivalHouse, TechCategory } from './types.js'

interface Balance {
  generationStepTurns: number
  counterCategory: Partial<Record<TechCategory, TechCategory>>
  counterDemandOrders: number
  orderTriggerThreshold: Record<TechCategory, number>
  counterBidBonus: number
  noveltyBidBonus: number
  noveltyLifeTurns: number
  rivalDesignSchedule: Record<string, number[]>
  rivalDesignQualityBonus: number
  rivalDesignLifeTurns: number
  designPhaseOutKeep: number
  needCeiling: number
}
const BALANCE = balanceData as unknown as Balance

export type Bloc = 'west' | 'east'
export const BLOCS: readonly Bloc[] = ['west', 'east']

// Det tidsenliga generationsnumret vid en viss tur — ett PROVISORISKT tidsschema (kliv var generationStepTurns:e tur).
export function currentGeneration(turn: number): number {
  return 1 + Math.floor(turn / BALANCE.generationStepTurns)
}

// Blocket en alignment pekar på (väst +, öst −); 0 = inget block (neutral).
export function blocOfAlignment(alignment: number): Bloc | null {
  return alignment > 0 ? 'west' : alignment < 0 ? 'east' : null
}

export function blocOfFaction(state: Pick<GameState, 'factions'>, factionId: FactionId): Bloc | null {
  const faction = state.factions[factionId]
  return faction ? blocOfAlignment(faction.alignment) : null
}

// Ett blocks generation i en kategori. Än så länge samma tidsschema för båda blocken och alla kategorier; P118 ersätter
// funktionens innehåll med blockens egna, dolda generationer — anropare ändras inte.
export function blocGeneration(state: Pick<GameState, 'meta'>, _bloc: Bloc, _category: TechCategory): number {
  return currentGeneration(state.meta.turn)
}

// En köpares generation: dess blocks. En neutral köpare (inget block) godtar det mildare av de två.
export function buyerGeneration(state: Pick<GameState, 'meta' | 'factions'>, buyerId: FactionId, category: TechCategory): number {
  const bloc = blocOfFaction(state, buyerId)
  if (bloc) return blocGeneration(state, bloc, category)
  return Math.min(...BLOCS.map((b) => blocGeneration(state, b, category)))
}

// Utfasningen (§6.3, §7.1): köparna i ett block behåller designPhaseOutKeep generationer; en konstruktion äldre än så förlorar
// behörighet automatiskt. En senare generation är aldrig utfasad.
export function designPhasedOutForGeneration(design: Pick<Design, 'generation'>, blocGen: number): boolean {
  return design.generation < blocGen - (BALANCE.designPhaseOutKeep - 1)
}

export function designPhasedOutForBloc(state: Pick<GameState, 'meta'>, design: Pick<Design, 'generation' | 'category'>, bloc: Bloc): boolean {
  return designPhasedOutForGeneration(design, blocGeneration(state, bloc, design.category))
}

export function designPhasedOutForBuyer(state: Pick<GameState, 'meta' | 'factions'>, design: Pick<Design, 'generation' | 'category'>, buyerId: FactionId): boolean {
  return designPhasedOutForGeneration(design, buyerGeneration(state, buyerId, design.category))
}

// Nyhetsvärdet: 1 vid introduktionen, avtar linjärt till 0 efter noveltyLifeTurns.
export function noveltyFactor(design: Pick<Design, 'introducedTurn'>, turn: number): number {
  const age = Math.max(0, turn - design.introducedTurn)
  return Math.max(0, 1 - age / BALANCE.noveltyLifeTurns)
}

export function noveltyBonus(design: Pick<Design, 'introducedTurn'>, turn: number): number {
  return BALANCE.noveltyBidBonus * noveltyFactor(design, turn)
}

// ── motmedel ─────────────────────────────────────────────────────────────────

export function counterCategoryOf(category: TechCategory): TechCategory | null {
  return BALANCE.counterCategory[category] ?? null
}

// Lägger counterDemandOrders × motmedelskategorins orderTriggerThreshold (alltså en orders värde) i dess materielNeed hos varje angiven faktion (klampat vid needCeiling) och
// emitterar en rad per faktion som faktiskt fick något. `label` namnger den starka konstruktionen i rubriken.
export function addCounterDemand(ctx: ResolveContext, factionIds: readonly FactionId[], strongCategory: TechCategory, label: string, causeId: string | null): void {
  const counter = counterCategoryOf(strongCategory)
  if (counter === null) return
  const { draft, emit } = ctx
  for (const factionId of [...factionIds].sort()) {
    const faction = draft.factions[factionId]
    if (!faction) continue
    const before = faction.materielNeed[counter]
    const after = Math.min(BALANCE.needCeiling, before + BALANCE.orderTriggerThreshold[counter] * BALANCE.counterDemandOrders)
    if (after <= before) continue
    faction.materielNeed[counter] = after
    emit({
      severity: 'report',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()} MINISTRIES SEEK ${counter.toUpperCase()} COUNTERS TO THE ${label}`,
      causeId,
      delta: { [`materielNeed.${counter}`]: after - before },
      actorIsPlayer: false,
      subjectId: factionId,
    })
  }
}

// Ett färdigt motmedel (House.counters) ger counterBidBonus hos köpare vars front möter just den faktionen, i kategorin.
// En term efter computeScore, delad av bidding.ts, bidEstimate och playerWinCurve (skyddsräcke 1 och 3).
export function counterBidTerm(state: Pick<GameState, 'house' | 'fronts'>, order: Pick<Order, 'buyerId' | 'productId' | 'frontId'>): number {
  const counters = state.house.counters
  if (!counters) return 0
  const front = order.frontId ? state.fronts[order.frontId] : undefined
  if (!front) return 0
  const opponent = front.sideA === order.buyerId ? front.sideB : front.sideB === order.buyerId ? front.sideA : null
  if (opponent === null) return 0
  const category = getProduct(order.productId).category
  const hit = Object.values(counters).some((c) => c.factionId === opponent && c.category === category)
  return hit ? BALANCE.counterBidBonus : 0
}

// ── rivalernas konstruktioner (9F) ───────────────────────────────────────────

function rivalBloc(rival: Pick<RivalHouse, 'homeState'>): Bloc | null {
  return rival.homeState === 'west' || rival.homeState === 'east' ? rival.homeState : null
}

// Anropas från rivals-steget: varje rival med en schemalagd tur får en konstruktion i sin specialisering, en rubrik, och —
// om rivalen tillhör ett block — motmedelsefterfrågan hos det motsatta blockets köpare. Idempotent per tur.
export function processRivalDesigns(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const turn = draft.meta.turn
  for (const rival of Object.values(draft.rivals).sort((a, b) => a.id.localeCompare(b.id))) {
    const schedule = BALANCE.rivalDesignSchedule[rival.id]
    if (!schedule || !schedule.includes(turn)) continue
    const designs = (rival.designs ??= [])
    if (designs.some((d) => d.introducedTurn === turn)) continue
    const category = rival.specialisation
    const bloc = rivalBloc(rival)
    const generation = bloc ? blocGeneration(draft, bloc, category) : Math.min(...BLOCS.map((b) => blocGeneration(draft, b, category)))
    const name = `${initialsOf(rival.name)} ${designDesignation(draft.meta.year)} ${TYPE_NAME[category]}`
    const sameName = designs.filter((d) => d.name === name || d.name.startsWith(`${name} Mk `)).length
    designs.push({
      id: `${rival.id}-design-${designs.length + 1}`,
      name: sameName === 0 ? name : `${name} Mk ${sameName + 1}`,
      category,
      generation,
      introducedTurn: turn,
    })
    const eventId = emit({
      severity: 'report',
      scope: 'market',
      headline: `${rival.name.toUpperCase()} UNVEILS A NEW ${category.toUpperCase()} DESIGN`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: rival.id,
    })
    if (bloc) {
      const opposing = Object.values(draft.factions)
        .filter((f) => blocOfAlignment(f.alignment) === (bloc === 'west' ? 'east' : 'west'))
        .map((f) => f.id)
      addCounterDemand(ctx, opposing, category, designs[designs.length - 1]!.name.toUpperCase(), eventId)
    }
  }
}

// Rivalens rykte i en kategori: kvalitetsbonus ur dess nyaste konstruktion där, avtagande över rivalDesignLifeTurns. Samma
// funktion läses av bidding.ts och bidEstimate/playerWinCurve (en formel, en källa). Inga designs → rykteobjektet orört.
export function effectiveRivalReputation(
  rival: Pick<RivalHouse, 'reputation' | 'designs'>,
  category: TechCategory,
  turn: number,
): RivalHouse['reputation'] {
  let bonus = 0
  for (const d of rival.designs ?? []) {
    if (d.category !== category) continue
    const fade = Math.max(0, 1 - Math.max(0, turn - d.introducedTurn) / BALANCE.rivalDesignLifeTurns)
    bonus = Math.max(bonus, BALANCE.rivalDesignQualityBonus * fade)
  }
  if (bonus === 0) return rival.reputation
  return { quality: rival.reputation.quality + bonus, reliability: rival.reputation.reliability }
}

export interface RivalDesignDisplay {
  known: boolean
  name: string | null
  category: TechCategory
  introducedTurn: number
  novelty: number // 0–100
}

// Rivalens nyaste konstruktion, som spelaren får se den (skyddsräcke 5): namnet bara med underrättelse — en aktiv station i
// ett land i rivalens block (en neutral rival: någon station). Kategori och tidpunkt är alltid kända (rubriken är offentlig).
export function rivalDesignDisplay(state: GameState, rivalId: string): RivalDesignDisplay | null {
  const rival = state.rivals[rivalId]
  const newest = rival?.designs?.[rival.designs.length - 1]
  if (!rival || !newest) return null
  const bloc = rivalBloc(rival)
  const known = state.house.stations.some((s) => s.status === 'active' && (bloc === null || blocOfFaction(state, s.nation) === bloc))
  const fade = Math.max(0, 1 - Math.max(0, state.meta.turn - newest.introducedTurn) / BALANCE.rivalDesignLifeTurns)
  return {
    known,
    name: known ? newest.name : null,
    category: newest.category,
    introducedTurn: newest.introducedTurn,
    novelty: Math.round(fade * 100),
  }
}

// ── utfasningen märks ────────────────────────────────────────────────────────

// Anropas varje tur från rivals-steget (P118 flyttar den till kapplöpningssteget): märker de konstruktioner som just blivit
// utfasade för ett block, med en rubrik per konstruktion. Själva behörigheten läses ur generationen — flaggan är bara märket.
export function advanceDesignLifecycle(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  for (const design of draft.house.designs ?? []) {
    const fresh = BLOCS.filter((bloc) => !design.phasedOut?.[bloc] && designPhasedOutForBloc(draft, design, bloc))
    if (fresh.length === 0) continue
    design.phasedOut = { ...(design.phasedOut ?? {}), ...Object.fromEntries(fresh.map((b) => [b, draft.meta.turn])) }
    emit({
      severity: 'report',
      scope: 'house',
      headline: `THE ${design.name.toUpperCase()} (GENERATION ${design.generation}) IS PHASED OUT FOR ${fresh.map((b) => b.toUpperCase()).join(' AND ')} BUYERS`,
      causeId: null,
      delta: { [`phasedOut.${design.id}`]: draft.meta.turn },
      actorIsPlayer: true,
      subjectId: null,
    })
  }
}

// Husets egna färdiga motmedel, för UI och mätning.
export function houseCounters(house: Pick<House, 'counters'>): { systemId: string; factionId: FactionId; category: TechCategory; turn: number }[] {
  return Object.entries(house.counters ?? {}).map(([systemId, c]) => ({ systemId, ...c }))
}
