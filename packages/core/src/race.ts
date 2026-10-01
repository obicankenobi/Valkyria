// race — P117 (ETAPP9_FORSLAG.md §6.3 och §6.6, beslut 9F) och P118 (§7.1, beslut 9H). Motmedelskedjor, livscykel och automatisk
// utfasning, och blockens kapplöpning: dolda generationer per block och kategori, kravkort och köpare som följer sitt block.
// P119–P121 bygger gap-chocker, bedömningar och doomsday ovanpå.
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
import type { Design, FactionId, GameState, House, Order, RaceState, RivalHouse, TechCategory } from './types.js'

interface Balance {
  blocGenerationSchedule: Record<string, Record<Bloc, number[]>>
  raceAccelerationTurns: number
  blocTechLevelStep: number
  raceAccelerationCap: number
  requirementCardHorizon: number
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

// Blocket en alignment pekar på (väst +, öst −); 0 = inget block (neutral).
export function blocOfAlignment(alignment: number): Bloc | null {
  return alignment > 0 ? 'west' : alignment < 0 ? 'east' : null
}

export function blocOfFaction(state: Pick<GameState, 'factions'>, factionId: FactionId): Bloc | null {
  const faction = state.factions[factionId]
  return faction ? blocOfAlignment(faction.alignment) : null
}

// ── blockens kapplöpning (P118, §7.1) ────────────────────────────────────────

// Kategorierna som kapplöpningen omfattar: de som grundschemat har rader för (i filens ordning — deterministisk).
const RACE_CATEGORIES = Object.keys(BALANCE.blocGenerationSchedule) as TechCategory[]

export function initialRace(): RaceState {
  const generation = (): Record<TechCategory, number> =>
    Object.fromEntries(RACE_CATEGORIES.map((c) => [c, 1])) as Record<TechCategory, number>
  return { generation: { west: generation(), east: generation() }, pulled: { west: {}, east: {} } }
}

// Generationen ett block har vid början av en tur enligt grundschemat (steget sker i den turens resolve, så ett steg på tur S
// syns från tur S + 1). Används för att härleda `race` ur ett sparat parti från före P118.
export function scheduledGeneration(turn: number, bloc: Bloc, category: TechCategory): number {
  const steps = BALANCE.blocGenerationSchedule[category]?.[bloc] ?? []
  return 1 + steps.filter((s) => s < turn).length
}

// Ett blocks (dolda) generation i en kategori.
export function blocGeneration(state: Pick<GameState, 'race'>, bloc: Bloc, category: TechCategory): number {
  return state.race.generation[bloc][category]
}

// Det ledande blockets generation i en kategori — "det tidsenliga" som ett nytt designprojekt siktar förbi.
export function frontierGeneration(state: Pick<GameState, 'race'>, category: TechCategory): number {
  return Math.max(...BLOCS.map((b) => blocGeneration(state, b, category)))
}

// En köpares generation: dess blocks. En neutral köpare (inget block) godtar det mildare av de två.
export function buyerGeneration(state: Pick<GameState, 'race' | 'factions'>, buyerId: FactionId, category: TechCategory): number {
  const bloc = blocOfFaction(state, buyerId)
  if (bloc) return blocGeneration(state, bloc, category)
  return Math.min(...BLOCS.map((b) => blocGeneration(state, b, category)))
}

// Utfasningen (§6.3, §7.1): köparna i ett block behåller designPhaseOutKeep generationer; en konstruktion äldre än så förlorar
// behörighet automatiskt. En senare generation är aldrig utfasad.
export function designPhasedOutForGeneration(design: Pick<Design, 'generation'>, blocGen: number): boolean {
  return design.generation < blocGen - (BALANCE.designPhaseOutKeep - 1)
}

export function designPhasedOutForBloc(state: Pick<GameState, 'race'>, design: Pick<Design, 'generation' | 'category'>, bloc: Bloc): boolean {
  return designPhasedOutForGeneration(design, blocGeneration(state, bloc, design.category))
}

export function designPhasedOutForBuyer(state: Pick<GameState, 'race' | 'factions'>, design: Pick<Design, 'generation' | 'category'>, buyerId: FactionId): boolean {
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

// En stark konstruktions rubrik-effekt hos motsidan (§6.6 + §7.1): efterfrågan på motmedlet hos varje angiven faktion, och — om
// motsidans block har ett steg kvar i motmedelskategorin — det steget påskyndas (kapplöpningen går fortare). Delas av husets
// stridsbeprövade konstruktioner (fieldQuality.ts) och rivalernas nya (processRivalDesigns).
export function counterReaction(ctx: ResolveContext, opposing: readonly FactionId[], strongCategory: TechCategory, label: string, causeId: string | null): void {
  addCounterDemand(ctx, opposing, strongCategory, label, causeId)
  const counter = counterCategoryOf(strongCategory)
  if (counter === null) return
  const blocs = new Set<Bloc>()
  for (const id of opposing) {
    const bloc = blocOfFaction(ctx.draft, id)
    if (bloc) blocs.add(bloc)
  }
  for (const bloc of BLOCS) if (blocs.has(bloc)) accelerateBlocStep(ctx, bloc, counter, causeId)
}

// Flyttar blockets nästa steg i kategorin raceAccelerationTurns tidigare (högst raceAccelerationCap per steg). Falskt — och ingen
// rubrik — när blocket inte har fler steg eller redan är på taket.
export function accelerateBlocStep(ctx: ResolveContext, bloc: Bloc, category: TechCategory, causeId: string | null): boolean {
  const { draft, emit } = ctx
  const next = BALANCE.blocGenerationSchedule[category]?.[bloc]?.[blocGeneration(draft, bloc, category) - 1]
  if (next === undefined) return false
  const before = draft.race.pulled[bloc][category] ?? 0
  const after = Math.min(BALANCE.raceAccelerationCap, before + BALANCE.raceAccelerationTurns)
  if (after <= before) return false
  draft.race.pulled[bloc][category] = after
  emit({
    severity: 'report',
    scope: 'market',
    headline: `THE ${bloc.toUpperCase()} ACCELERATES ITS ${category.toUpperCase()} PROGRAMME`,
    causeId,
    delta: { [`race.pulled.${bloc}.${category}`]: after - before },
    actorIsPlayer: false,
    subjectId: null,
  })
  return true
}

// Turen då blockets nästa steg i kategorin sker (grundschemat minus framflyttningen), eller null om inga steg återstår.
function nextStepTurn(state: Pick<GameState, 'race'>, bloc: Bloc, category: TechCategory): number | null {
  const scheduled = BALANCE.blocGenerationSchedule[category]?.[bloc]?.[blocGeneration(state, bloc, category) - 1]
  return scheduled === undefined ? null : scheduled - (state.race.pulled[bloc][category] ?? 0)
}

// Det nya steget `race` (körs direkt före `orders`): varje block som nått sitt nästa steg i en kategori går upp en generation,
// med en rubrik (utan generationsnumret — bedömningarna är P120), och köparna i blocket får techLevel + 1 (fältets första
// skrivare) med en rad kopplad till steget.
export function advanceRace(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const turn = draft.meta.turn
  for (const category of RACE_CATEGORIES) {
    for (const bloc of BLOCS) {
      const due = nextStepTurn(draft, bloc, category)
      if (due === null || turn < due) continue
      draft.race.generation[bloc][category] += 1
      delete draft.race.pulled[bloc][category]
      const stepId = emit({
        severity: 'headline',
        scope: 'market',
        headline: `${bloc.toUpperCase()} MINISTRIES RAISE ${category.toUpperCase()} REQUIREMENTS`,
        causeId: null,
        delta: { [`race.${bloc}.${category}`]: 1 },
        actorIsPlayer: false,
        subjectId: null,
      })
      for (const faction of Object.values(draft.factions).sort((a, b) => a.id.localeCompare(b.id))) {
        if (blocOfAlignment(faction.alignment) !== bloc) continue
        if (BALANCE.blocTechLevelStep === 0) continue
        faction.techLevel[category] += BALANCE.blocTechLevelStep
        emit({
          severity: 'ticker',
          scope: 'faction',
          headline: `${faction.name.toUpperCase()} ${category.toUpperCase()} TECH LEVEL RISES TO ${faction.techLevel[category]}`,
          causeId: stepId,
          delta: { [`techLevel.${category}`]: 1 },
          actorIsPlayer: false,
          subjectId: faction.id,
        })
      }
    }
  }
}

export interface RequirementCard {
  bloc: Bloc
  category: TechCategory
  inTurns: number // 0 = ministerierna höjer kraven i den här turens resolve, 1 = nästa kvartal
}

// Kravkorten (§7.1): vad ministerierna kommer att kräva härnäst, per block och kategori, requirementCardHorizon turer i förväg —
// som kommande kraftverk i Power Grid. Visar bara att och när, aldrig generationsnumret (skyddsräcke 5).
export function requirementCards(state: Pick<GameState, 'meta' | 'race'>): RequirementCard[] {
  const cards: RequirementCard[] = []
  for (const category of RACE_CATEGORIES) {
    for (const bloc of BLOCS) {
      const due = nextStepTurn(state, bloc, category)
      if (due === null) continue
      const inTurns = Math.max(0, due - state.meta.turn)
      if (inTurns <= BALANCE.requirementCardHorizon) cards.push({ bloc, category, inTurns })
    }
  }
  return cards
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
    const generation = bloc ? blocGeneration(draft, bloc, category) : frontierGeneration(draft, category)
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
      counterReaction(ctx, opposing, category, designs[designs.length - 1]!.name.toUpperCase(), eventId)
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

// Anropas varje tur från steget `race` (efter generationsskiftena): märker de konstruktioner som just blivit
// utfasade för ett block, med en rubrik per konstruktion. Själva behörigheten läses ur generationen — flaggan är bara märket.
export function advanceDesignLifecycle(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  for (const design of draft.house.designs ?? []) {
    const fresh = BLOCS.filter((bloc) => design.phasedOut?.[bloc] === undefined && designPhasedOutForBloc(draft, design, bloc))
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
