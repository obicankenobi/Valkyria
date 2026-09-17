// factions — faktionsekonomi, publicSupport, bankrutt. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 5 ("Faktion").
//
// "Förluster drar manpower och publicSupport" körs i fronts.ts (P6), inte här — se
// den filens huvudkommentar (samma skäl som attribution: datan finns bara där
// förlusterna beräknas). Det den här filen faktiskt gör: embargots ekonomiska
// effekt (PROVISORISK, se nedan), bankruttdetektion + kontraktsannullering med
// causeId-kedja, lowSupport-detektion och (P59, ETAPP5_TEKNISK_SPEC.md avsnitt
// 4.1/4.2) Faction.relations passiv återhämtning + Front.status-övergångar.
// "Forced to sue for peace" VAR bara en notis (fynd 1.5) — sedan P59 är den
// den ena av två utlösare in i 'ceasefire', se updateFrontStatuses nedan.
//
// Embargo har ingen egen mekanik i avsnitt 5:s Faktion-stycke — bara fältet
// Faction.embargoed finns (avsnitt 2.5), och ingen PlayerAction kan sätta det
// (samma applyActions-lucka ANDRINGSLOGG.md loggat sedan P2). P7:s klart när-
// villkor kräver ändå en "embargokedja hela vägen till en annullerad order" —
// löst genom att embargo får en egen, PROVISORISK ekonomisk konsekvens (en
// kvartalsvis kassadränering) som ett test kan trigga genom att direkt sätta
// embargoed: true på en handbyggd faktion (spec 7.1). Se ANDRINGSLOGG.md.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Faction, FactionId, GameState, TechCategory } from '../../types.js'

interface Balance {
  factionBankruptcyTurns: number
  factionLowSupportTurns: number
  factionLowSupportThreshold: number
  embargoTreasuryDrainPerTurn: number
  militaryBudgetQuarterlyShare: number
  peacetimeReplacement: Record<TechCategory, number>
  needCeiling: number
  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.1/4.2).
  relationsPassiveRecoveryPerTurn: number
  ceasefireRelationThreshold: number
  warReescalationRelationThreshold: number
  ceasefireDoomsdayReescalationThreshold: number
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

export const factions: ResolveStep = (ctx) => {
  const { draft, emit } = ctx
  // P59 (avsnitt 4.2): "FORCED TO SUE FOR PEACE" var tidigare bara en notis
  // (fynd 1.5, "ingen mekanisk konsekvens är specificerad eller byggd") — nu
  // den FÖRSTA av två vägar in i 'ceasefire' för varje front den faktionen
  // slåss på (se updateFrontStatuses nedan).
  const suedForPeace = new Set<FactionId>()

  for (const faction of Object.values(draft.factions)) {
    if (faction.bankrupt) continue // redan avgjort för den här faktionen

    processEconomicDistress(faction, draft, emit)
    if (!faction.bankrupt) {
      replenishMilitaryBudget(faction, emit)
      replenishMaterielNeed(faction, emit)
    }
    if (processLowSupport(faction, emit)) suedForPeace.add(faction.id)
    applyRelationsPassiveRecovery(faction, draft.factions, emit)
    expirePreferredSupplier(faction, draft.meta.turn, emit)
  }

  updateFrontStatuses(draft, suedForPeace, emit)
}

// P61 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.4): en lyckad FUND_COUP:s
// "förköpsrätt" har ett utgångsdatum (preferredSupplierUntilTurn, GK-B) —
// P57:s ursprungliga PolicyDecision-variant satte ALDRIG det fältet, så den
// är opåverkad (villkoret är false för `undefined`/`null`).
function expirePreferredSupplier(faction: Faction, turn: number, emit: ResolveContext['emit']): void {
  if (faction.preferredSupplierUntilTurn == null) return
  if (turn < faction.preferredSupplierUntilTurn) return

  faction.preferredSupplier = undefined
  faction.preferredSupplierUntilTurn = undefined
  emit({
    severity: 'ticker',
    scope: 'faction',
    headline: `${faction.name.toUpperCase()}'S PREFERENTIAL TREATMENT EXPIRES`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: faction.id,
  })
}

// P59 (avsnitt 4.1): "stiger av ... tid" — den ENDA av de fyra drivarna
// (leveranser/incidenter/BACK_CHANNEL/tid) som ALDRIG sänker, bara höjer,
// litet och begränsat. Ensam räcker den inte till ceasefireRelationThreshold
// inom ett 20-turersparti (se balance.json:s _p59_note) — den ger fred en
// riktning över tid, inte en gratis genväg dit.
function applyRelationsPassiveRecovery(faction: Faction, factions: GameState['factions'], emit: ResolveContext['emit']): void {
  for (const [otherId, value] of Object.entries(faction.relations)) {
    if (value >= 100) continue
    const next = Math.min(100, value + BALANCE.relationsPassiveRecoveryPerTurn)
    faction.relations[otherId] = next

    const other = factions[otherId]
    const otherName = other ? other.name.toUpperCase() : otherId.toUpperCase()
    emit({
      severity: 'ticker',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()}–${otherName} RELATIONS EASE WITH TIME`,
      causeId: null,
      delta: { [`relations.${otherId}`]: next - value },
      actorIsPlayer: false,
      subjectId: faction.id,
    })
  }
}

// P59 (avsnitt 4.2): "övergångarna drivs av relations, publicSupport och
// doomsday — inte av ett tärningskast." War→ceasefire: antingen den faktion
// som just tvingades söka fred (publicSupport-drivet, se suedForPeace ovan)
// eller BÅDA sidors ömsesidiga goda relationer (relations-drivet).
// Ceasefire→war: global eskalering (doomsday) eller att relationen kollapsat
// tillbaka mot krigsnivå (relations). 'dormant' har ingen övergångsregel än
// (types.ts:s egen kommentar) — bara 'war'/'ceasefire' hanteras här.
function updateFrontStatuses(draft: GameState, suedForPeace: ReadonlySet<FactionId>, emit: ResolveContext['emit']): void {
  for (const front of Object.values(draft.fronts)) {
    const factionA = draft.factions[front.sideA]
    const factionB = draft.factions[front.sideB]
    if (!factionA || !factionB) continue

    if (front.status === 'war') {
      const forcedPeace = suedForPeace.has(front.sideA) || suedForPeace.has(front.sideB)
      const mutualGoodwill =
        (factionA.relations[front.sideB] ?? 0) >= BALANCE.ceasefireRelationThreshold &&
        (factionB.relations[front.sideA] ?? 0) >= BALANCE.ceasefireRelationThreshold
      if (!forcedPeace && !mutualGoodwill) continue

      front.status = 'ceasefire'
      emit({
        severity: 'headline',
        scope: 'front',
        headline: `CEASEFIRE ON THE ${front.id.toUpperCase()} FRONT${forcedPeace ? ' — PUBLIC SUPPORT COLLAPSED' : ' — NEGOTIATED PEACE'}`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: front.id,
      })
    } else if (front.status === 'ceasefire') {
      const doomsdayReescalates = draft.doomsday >= BALANCE.ceasefireDoomsdayReescalationThreshold
      const relationsCollapsed =
        (factionA.relations[front.sideB] ?? 100) < BALANCE.warReescalationRelationThreshold ||
        (factionB.relations[front.sideA] ?? 100) < BALANCE.warReescalationRelationThreshold
      if (!doomsdayReescalates && !relationsCollapsed) continue

      front.status = 'war'
      emit({
        severity: 'headline',
        scope: 'front',
        headline: `WAR RESUMES ON THE ${front.id.toUpperCase()} FRONT${doomsdayReescalates ? ' — GLOBAL TENSION' : ' — RELATIONS COLLAPSE'}`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: front.id,
      })
    }
  }
}

// P34 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.1): "need[cat] +=
// peacetimeReplacement[cat]; need[cat] = min(need[cat], needCeiling)" — golvet
// som håller marknaden vid liv innan attrition.ts någonsin haft en stridstur
// att förbruka materiel i. Samma "emit bara på faktisk ändring"-mönster som
// replenishMilitaryBudget ovan (redan i den här filen) — en faktion redan vid
// taket i alla kategorier ger inget att rapportera.
function replenishMaterielNeed(faction: Faction, emit: ResolveContext['emit']): void {
  const delta: Record<string, number> = {}
  const grown: string[] = []

  for (const category of TECH_CATEGORIES) {
    const before = faction.materielNeed[category]
    const next = Math.min(before + BALANCE.peacetimeReplacement[category], BALANCE.needCeiling)
    if (next === before) continue

    faction.materielNeed[category] = next
    delta[`materielNeed.${category}`] = next - before
    grown.push(`${Number((next - before).toFixed(1))} ${category.toUpperCase()}`)
  }
  if (grown.length === 0) return

  emit({
    severity: 'ticker',
    scope: 'faction',
    headline: `${faction.name.toUpperCase()}'S MATERIEL NEED GROWS: ${grown.join(', ')} (PEACETIME REPLACEMENT)`,
    causeId: null,
    delta,
    actorIsPlayer: false,
    subjectId: faction.id,
  })
}

// Avsnitt 7.1.B: militaryBudget är annars en engångstilldelning från
// scenariofilen som bara sjunker (bidding.ts) — utan påfyllnad tar varje köpare
// slut på pengar för gott inom några turer, vilket inte är vad "en köpare som
// slutar beställa" (7.2) betyder. Klampad till högst faction.treasury: budgeten
// kan aldrig vara en fiktion köparens egen kassa inte täcker.
function replenishMilitaryBudget(faction: Faction, emit: ResolveContext['emit']): void {
  const before = faction.militaryBudget
  const next = Math.min(faction.treasury, faction.militaryBudget + round(faction.treasury * BALANCE.militaryBudgetQuarterlyShare))
  faction.militaryBudget = Math.max(0, next)
  if (faction.militaryBudget === before) return

  emit({
    severity: 'ticker',
    scope: 'faction',
    headline: `${faction.name.toUpperCase()}'S MILITARY BUDGET: £${faction.militaryBudget.toLocaleString('en-GB')}`,
    causeId: null,
    delta: { militaryBudget: faction.militaryBudget - before },
    actorIsPlayer: false,
    subjectId: faction.id,
  })
}

function processEconomicDistress(faction: Faction, draft: GameState, emit: ResolveContext['emit']): void {
  // Kedjans första led: embargots ekonomiska smäll DENNA tur, om någon. Ingen
  // sparad över-turer-referens behövs — bankrutt kan bara triggas av den SENASTE
  // av de factionBankruptcyTurns i rad, så om embargo var orsaken är det alltid
  // den här turens dräneringshändelse som är den riktiga, omedelbara orsaken.
  let drainEventId: string | null = null

  if (faction.embargoed) {
    faction.treasury -= BALANCE.embargoTreasuryDrainPerTurn
    drainEventId = emit({
      severity: 'report',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()}'S ECONOMY STRAINS UNDER YOUR EMBARGO (-£${BALANCE.embargoTreasuryDrainPerTurn.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { treasury: -BALANCE.embargoTreasuryDrainPerTurn },
      actorIsPlayer: true,
      subjectId: faction.id,
    })
  }

  faction.negativeTreasuryTurns = faction.treasury < 0 ? faction.negativeTreasuryTurns + 1 : 0
  if (faction.negativeTreasuryTurns < BALANCE.factionBankruptcyTurns) return

  faction.bankrupt = true
  const bankruptcyId = emit({
    severity: 'headline',
    scope: 'faction',
    headline: `${faction.name.toUpperCase()} BANKRUPT — ALL CONTRACTS VOIDED`,
    // Ärligt: bara satt när embargo faktiskt var den här turens orsak. Annars null
    // (t.ex. om en faktion går bankrutt av andra skäl — inget att peka tillbaka på).
    causeId: drainEventId,
    delta: {},
    actorIsPlayer: drainEventId !== null,
    subjectId: faction.id,
  })

  for (const contract of draft.market.contracts) {
    if (contract.buyerId !== faction.id) continue
    if (contract.status === 'voided' || contract.status === 'fulfilled') continue

    contract.status = 'voided'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `CONTRACT ${contract.id} VOIDED — ${faction.name.toUpperCase()} BANKRUPT`,
      causeId: bankruptcyId,
      delta: {},
      actorIsPlayer: false,
      subjectId: faction.id,
    })
  }
}

// P59 (avsnitt 4.2): returnerar true exakt på korsningsturen — den enda tur
// updateFrontStatuses (ovan) ska läsa "just nu tvingad att söka fred" som en
// war→ceasefire-utlösare, inte varje tur stödet FÖRBLIR lågt.
function processLowSupport(faction: Faction, emit: ResolveContext['emit']): boolean {
  faction.lowSupportTurns = faction.publicSupport < BALANCE.factionLowSupportThreshold ? faction.lowSupportTurns + 1 : 0

  // === (inte >=): en engångshändelse på korsningsturen, inte en repeterande
  // notis varje tur stödet förblir lågt.
  if (faction.lowSupportTurns === BALANCE.factionLowSupportTurns) {
    emit({
      severity: 'headline',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()} FORCED TO SUE FOR PEACE — PUBLIC SUPPORT COLLAPSED`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: faction.id,
    })
    return true
  }
  return false
}
