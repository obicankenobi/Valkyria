// queries.ts — härledda värden för UI, rena funktioner över state. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 4.3.
//
// bidEstimate drar ALDRIG ur huvud-Rng:n (CLAUDE.md hård regel 2, spec 3.3). Den
// skapar sin egen, hash-seedade Rng ur seed+orderId+grade och kastar den efter
// anropet — stabil inom en tur (samma indata ger bitvis identiskt resultat) och rör
// aldrig state.meta.rngCursor.
import balanceData from './data/balance.json' with { type: 'json' }
import { createRng } from './rng.js'
import type { Rng } from './rng.js'
import { categoryReputation, playerBidTerm } from './bidTerms.js'
import { alignmentPenalty, allProducts, BALANCE, computeRivalBid, computeScore, getProduct, computeUnitCostNow, rivalBlocTerm } from './pricing.js'
import { computeExpectedProgress } from './resolve/steps/board.js'
import { advanceFactors, deliveryPayment, settleFavourMargin } from './resolve/advance.js'
import { computeFixedCostsBreakdown, computeQuarterlyInterest } from './resolve/steps/economy.js'
import type { FixedCostsBreakdown } from './resolve/steps/economy.js'
import { computeLineThroughput } from './resolve/steps/production.js'
import { round } from './money.js'
import type {
  BidEstimate,
  BoardTarget,
  Formation,
  FormationDisplay,
  Front,
  GameState,
  Grade,
  Money,
  Official,
  OfficialDisplay,
  Order,
  Pct,
  ProductionLine,
  RivalId,
  SectorControl,
  TechCategory,
} from './types.js'

const WIN_BAND_POINTS = 5
const MONTE_CARLO_SAMPLES = 100

// Tröskelvärden som UI:t ritar ut som markeringar i sina mätare. Läses HÄRIFRÅN,
// ur balance.json, så att appen aldrig upprepar en balanssiffra i sin egen kod —
// CLAUDE.md hård regel 5 gäller formellt bara packages/core, men drift-risken är
// exakt densamma i ett UI som ritar "krisgränsen" på fel ställe efter ett
// balanspass. Bara trösklar som FAKTISKT finns i balance.json exporteras; heatens
// 40/70 (spec avsnitt 5) är prosatal utan fält och ritas därför inte ut.
interface ThresholdBalance {
  doomsdayCrisisWatchThreshold: number
  doomsdayCrisisEventThreshold: number
  doomsdayNuclearExchangeThreshold: number
  heatEscalationThreshold: number
  supplyIndexMin: number
  supplyIndexMax: number
  crisisPushExchangePct: number
  exposureBurnThreshold: number
  boardReviewTolerance: number
  supplyLossStreakTurns: number
  supplyAgreementMinTurns: number
  supplyAgreementMaxTurns: number
  overtimeCapacityPct: number
}
const THRESHOLD_BALANCE = balanceData as unknown as ThresholdBalance

export const DISPLAY_THRESHOLDS = {
  doomsdayCrisisWatch: THRESHOLD_BALANCE.doomsdayCrisisWatchThreshold,
  doomsdayCrisisEvent: THRESHOLD_BALANCE.doomsdayCrisisEventThreshold,
  doomsdayNuclearExchange: THRESHOLD_BALANCE.doomsdayNuclearExchangeThreshold,
  heatEscalation: THRESHOLD_BALANCE.heatEscalationThreshold,
  // P21 (spec 3.4): THE HOUSE ritar supplyCostIndex som en mätare mot 100-linjen —
  // samma "läs härifrån, upprepa aldrig en balanssiffra i appen"-motivering som
  // doomsday-/heat-trösklarna ovan.
  supplyIndexMin: THRESHOLD_BALANCE.supplyIndexMin,
  supplyIndexMax: THRESHOLD_BALANCE.supplyIndexMax,
  // P21 (spec 9.4): "PUSH:s 30 % ska stå utskrivet" i krismodalen.
  crisisPushExchangePct: THRESHOLD_BALANCE.crisisPushExchangePct,
  // P29 (avsnitt 4.2): THE WORLD ritar varningsnivån en station brinner ovanför.
  exposureBurnThreshold: THRESHOLD_BALANCE.exposureBurnThreshold,
  // P81c (§13, P81-blockquoten): boardReviewOutlook nedan behöver EXAKT samma
  // tolerans board.ts:s runReview() faktiskt dömer efter, inte en gissning.
  boardReviewTolerance: THRESHOLD_BALANCE.boardReviewTolerance,
  // P101 (ETAPP8_FORSLAG.md §5.2): anslagstavlan ritar larmet vid samma tre-turers förlustföljd som
  // settleSupplyAgreements faktiskt larmar vid, avtalets tillåtna löptid och övertidens kapacitet.
  supplyLossStreakTurns: THRESHOLD_BALANCE.supplyLossStreakTurns,
  supplyAgreementMinTurns: THRESHOLD_BALANCE.supplyAgreementMinTurns,
  supplyAgreementMaxTurns: THRESHOLD_BALANCE.supplyAgreementMaxTurns,
  overtimeCapacityPct: THRESHOLD_BALANCE.overtimeCapacityPct,
} as const

// P81c (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten, P81-8): "utkastad tur 10
// utan tydlig förvarning" — HUD:ens Board-mätare visade bara en enda,
// odaterad procentandel mot det SLUTLIGA målet, aldrig vad som krävs vid
// NÄSTA granskning eller hur få turer som är kvar dit. Ordagrant samma
// pass mark-beräkning som board.ts:s runReview() (computeExpectedProgress,
// exporterad därifrån, plus boardReviewTolerance ovan) — "en formel, en
// källa", aldrig en egen gissning i appen.
export interface BoardReviewOutlook {
  nextReviewTurn: number | null // null: inga granskningar kvar (alla avklarade)
  turnsUntil: number | null
  required: number // pass mark vid nästa granskning, samma skala som progressSnapshot
  current: number
  onTrack: boolean
  isLastTurnBeforeReview: boolean // P81-8: "en varning i kvartalsbandet" turen INNAN en granskning spelaren ligger under
}

// P97: pass mark för EN granskningstur, på progressSnapshot-skalan. Utbruten ur
// boardReviewOutlook (bitvis identisk) så att styrelsens PM (boardMemo nedan) och
// huvudbokens målkurva delar exakt den formel board.ts:s runReview() dömer efter.
export function boardReviewRequirement(target: BoardTarget, reviewTurn: number): number {
  const expectedProgress = computeExpectedProgress(target.threshold, reviewTurn, target.dueTurn)
  return expectedProgress * (1 - DISPLAY_THRESHOLDS.boardReviewTolerance)
}

export function boardReviewOutlook(state: GameState): BoardReviewOutlook {
  const target = state.house.boardTarget
  const nextReviewTurn = target.reviewTurns.find((t) => t > state.meta.turn) ?? null
  const current = target.progressSnapshot

  if (nextReviewTurn === null) {
    return { nextReviewTurn: null, turnsUntil: null, required: 0, current, onTrack: true, isLastTurnBeforeReview: false }
  }

  const required = boardReviewRequirement(target, nextReviewTurn)
  const turnsUntil = nextReviewTurn - state.meta.turn

  return {
    nextReviewTurn,
    turnsUntil,
    required,
    current,
    onTrack: current >= required,
    isLastTurnBeforeReview: turnsUntil === 1 && current < required,
  }
}

// P99 (ETAPP8_FORSLAG.md §4.2, skyddsräcke 4): villkoren ordermappen visar. Förskottets
// procent är ett villkor i affären och syns alltid. Köparens kreditstämpel och faktorerna
// bakom förskottet är information om köparen och grindas genom underrättelse — EXAKT samma
// effectiveDepth-grind som formationDisplay/bidEstimate ("utan station: ?"). Stämpeln och
// nivåerna läser samma advanceFactors som förskottsformeln (advance.ts), så de kan aldrig
// säga något annat än det som drev procenten. OBS: faktorerna är köparens läge NU; procenten
// frystes vid utlysningen (Order.advancePct) — därför "buyer now" i gränssnittet.
export type CreditGrade = 'A' | 'B' | 'C'
export type DriverLevel = 'low' | 'mid' | 'high'

export interface OrderTerms {
  advancePct: Pct
  known: boolean
  credit: CreditGrade | null // null = okänd ("?")
  drivers: { urgency: DriverLevel; funds: DriverLevel; relationship: DriverLevel } | null
}

// Tredjedelar av 0..1 — en presentationsindelning, inget balanstal.
function driverLevel(value: number): DriverLevel {
  return value >= 2 / 3 ? 'high' : value >= 1 / 3 ? 'mid' : 'low'
}

export function orderTerms(state: GameState, order: Order): OrderTerms {
  const known = effectiveDepth(state, order.buyerId) > 0
  const faction = state.factions[order.buyerId]
  const official = state.officials[order.officialId]
  if (!known || !faction || !official) return { advancePct: order.advancePct, known, credit: null, drivers: null }

  const factors = advanceFactors({
    faction,
    official,
    category: getProduct(order.productId).category,
    referencePrice: order.referencePrice,
  })
  const funds = driverLevel(factors.ability)
  return {
    advancePct: order.advancePct,
    known,
    credit: funds === 'high' ? 'A' : funds === 'mid' ? 'B' : 'C',
    drivers: { urgency: driverLevel(factors.urgency), funds, relationship: driverLevel(factors.relation) },
  }
}

// P97 (ETAPP8_FORSLAG.md §3.2): styrelsens kvartalsrapport — "prognos mot mål, de tre
// största posterna och en mening om vad styrelsen vill se", bara siffrorna här (texten
// är presentation, appens ansvar). Anropas med tillståndet EFTER att granskningsturen
// `reviewedTurn` avgjorts (då är meta.turn = reviewedTurn + 1, progressSnapshot är
// granskningens egen, och boardReviewOutlook pekar på NÄSTA granskning). Läser bara —
// ingen ny formel: kravet är boardReviewRequirement, nästa krav är boardReviewOutlook.
export interface BoardMemoItem {
  kind: 'income' | 'expense'
  row: string // nyckeln i LedgerEntry.income/expenses
  amount: Money
}

export interface BoardMemo {
  reviewTurn: number
  current: number // progressSnapshot, samma skala som kravet
  required: number
  bookMoney: Money // current × foundingCapital: bokförd intäkt + orderbok, i kronor
  requiredMoney: Money
  passed: boolean
  reviewsFailed: number
  topItems: BoardMemoItem[] // högst tre, störst först
  next: { turn: number; required: number; requiredMoney: Money } | null
}

export function boardMemo(state: GameState, reviewedTurn: number): BoardMemo | null {
  const target = state.house.boardTarget
  if (!target.reviewTurns.includes(reviewedTurn)) return null

  const capital = state.house.foundingCapital
  const required = boardReviewRequirement(target, reviewedTurn)
  const current = target.progressSnapshot

  const ledgerEntry = state.ledger.find((e) => e.turn === reviewedTurn)
  const items: BoardMemoItem[] = []
  if (ledgerEntry) {
    for (const [row, amount] of Object.entries(ledgerEntry.income)) if (amount > 0) items.push({ kind: 'income', row, amount })
    for (const [row, amount] of Object.entries(ledgerEntry.expenses)) if (amount > 0) items.push({ kind: 'expense', row, amount })
  }
  items.sort((a, b) => b.amount - a.amount) // stabil sortering: lika belopp behåller raden ordning

  const outlook = boardReviewOutlook(state)
  return {
    reviewTurn: reviewedTurn,
    current,
    required,
    bookMoney: round(current * capital),
    requiredMoney: round(required * capital),
    passed: current >= required,
    reviewsFailed: target.reviewsFailed,
    topItems: items.slice(0, 3),
    next:
      outlook.nextReviewTurn === null
        ? null
        : { turn: outlook.nextReviewTurn, required: outlook.required, requiredMoney: round(outlook.required * capital) },
  }
}

// P79 (ETAPP7_TEKNISK_SPEC.md §7.3/§13): landets bottenark (CountryFile.tsx)
// bygger INFLUENCE:s TierPicker-nivåer från runda POÄNGtal (5/15/30, en
// presentationskonstant i appen — se CountryFile.tsx:s egen kommentar) times
// kronor-per-poäng — samma "läs kostnaden härifrån, upprepa den aldrig i
// appen"-motivering som DISPLAY_THRESHOLDS ovan.
interface InfluenceBalance {
  influencePublicSupportCostPerPoint: number
  influenceRelationsCostPerPoint: number
}
const INFLUENCE_COST_BALANCE = balanceData as unknown as InfluenceBalance

export const INFLUENCE_BALANCE = {
  publicSupportCostPerPoint: INFLUENCE_COST_BALANCE.influencePublicSupportCostPerPoint,
  relationsCostPerPoint: INFLUENCE_COST_BALANCE.influenceRelationsCostPerPoint,
} as const

// Samma motivering som DISPLAY_THRESHOLDS ovan, bara riktad mot en annan extern
// konsument: härnessens botpolicyer (packages/harness, ETAPP1_5_TEKNISK_SPEC.md
// avsnitt 10.2) behöver två balanstal för att respektera kapacitet/kassaläge utan
// att hårdkoda en balanssiffra i harness-paketet.
interface BotTuningBalance {
  passiveMaxConcurrentBids: number
  gradeCashPressureThreshold: number
  gradePriceWeightThreshold: number
  brokerRelationThreshold: number
  brokerIntegrityThreshold: number
  fundCoupCost: number
  intelCovertOpCost: number
  fixedCosts: { rndOverhead: number }
  rndProjectTurns: number
  policyDecisionStandingThreshold: number
  policyDecisionRelationThreshold: number
  officialRelationGraceTurns: number
  officialRelationDecayPerTurn: number
  favourRelationCostPerPoint: number
}
const BOT_TUNING_BALANCE = balanceData as unknown as BotTuningBalance

export const BOT_BALANCE = {
  passiveMaxConcurrentBids: BOT_TUNING_BALANCE.passiveMaxConcurrentBids,
  gradeCashPressureThreshold: BOT_TUNING_BALANCE.gradeCashPressureThreshold,
  // P31 (avsnitt 6.1): tröskeln för "order.weights.price är högt" i den delade
  // grade-regeln alla fyra botar nu använder, se policies.ts:s chooseGrade.
  gradePriceWeightThreshold: BOT_TUNING_BALANCE.gradePriceWeightThreshold,
  // P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.5, GK-A/skyddsräcke 4): samma två
  // trösklar som applyActions.ts:s BROKER-gren läser — policies.ts prövar
  // mot EXAKT samma villkor den faktiska handlingen sedan avgörs av, inte en
  // separat bot-gissning.
  brokerRelationThreshold: BOT_TUNING_BALANCE.brokerRelationThreshold,
  brokerIntegrityThreshold: BOT_TUNING_BALANCE.brokerIntegrityThreshold,
  // P61 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.4, GK-A/skyddsräcke 4): samma
  // kostnad political.ts:s FUND_COUP-gren faktiskt drar — policies.ts
  // budgeterar mot EXAKT samma tal, inte en separat bot-gissning.
  fundCoupCost: BOT_TUNING_BALANCE.fundCoupCost,
  intelCovertOpCost: BOT_TUNING_BALANCE.intelCovertOpCost,
  // Vad ett R&D-projekt faktiskt kostar: rndOverhead varje tur under hela rndProjectTurns (economy.ts).
  rndProjectCost: BOT_TUNING_BALANCE.fixedCosts.rndOverhead * BOT_TUNING_BALANCE.rndProjectTurns,
  // P99c (ägarbeslut 2026-09-29): relationen förfaller, så en bot som vill undvika P57:s beslut
  // måste veta EXAKT samma tal förfallet och politics.ts läser — inte gissa dem.
  policyDecisionStandingThreshold: BOT_TUNING_BALANCE.policyDecisionStandingThreshold,
  policyDecisionRelationThreshold: BOT_TUNING_BALANCE.policyDecisionRelationThreshold,
  officialRelationGraceTurns: BOT_TUNING_BALANCE.officialRelationGraceTurns,
  officialRelationDecayPerTurn: BOT_TUNING_BALANCE.officialRelationDecayPerTurn,
  favourRelationCostPerPoint: BOT_TUNING_BALANCE.favourRelationCostPerPoint,
} as const

// Prisintervallet, spec 4.3: hur brett bandet kring lägsta rivalbud visas, per
// effectiveDepth.
const DEPTH_BAND_PCT: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0.35,
  1: 0.22,
  2: 0.14,
  3: 0.08,
  4: 0.04,
  5: 0,
}

// Exporterad sedan P41 (avsnitt 7, skyddsräcke 3: "samma princip som bidEstimate") —
// formationDisplay nedan delar EXAKT den här funktionen, inte en egen kopia.
export function effectiveDepth(state: GameState, buyerId: string): 0 | 1 | 2 | 3 | 4 | 5 {
  const station = state.house.stations.find((s) => s.nation === buyerId && s.status === 'active')
  const baseDepth = station ? station.depth : 0
  const bonus = state.house.staff.chiefSalesman > 75 ? 1 : 0
  // Matematiskt garanterat 0..5 (baseDepth är 0..5, bonus 0 eller 1, min(5,·) klampar).
  return Math.min(5, baseDepth + bonus) as 0 | 1 | 2 | 3 | 4 | 5
}

// P41 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 7, skyddsräcke 3), ordagrant:
// "readiness och exakt equipment per förband visas bara på den underrättelsenivå
// Station.depth i landet medger — samma princip som bidEstimate. Utan station:
// UNKNOWN FORMATION och ett styrkeband." Gatingen är binär (känd/okänd, depth > 0),
// inte gradvis som bidEstimate:s bandbredd — specen ger ingen gradvis regel för
// förband, bara "utan station"/annars. sectorId/doctrine/status nämns aldrig som
// dolda och visas därför alltid, se types.ts:s FormationDisplay-kommentar.
interface FormationDisplayBalance {
  formationStrengthBandLowPct: number
  formationStrengthBandHighPct: number
}
const FORMATION_DISPLAY_BALANCE = balanceData as unknown as FormationDisplayBalance

export function formationDisplay(state: GameState, formation: Formation): FormationDisplay {
  const known = effectiveDepth(state, formation.factionId) > 0

  const strengthPct = formation.strengthAtFull > 0 ? (formation.strength / formation.strengthAtFull) * 100 : 0
  const strengthBand: FormationDisplay['strengthBand'] =
    strengthPct < FORMATION_DISPLAY_BALANCE.formationStrengthBandLowPct
      ? 'svag'
      : strengthPct < FORMATION_DISPLAY_BALANCE.formationStrengthBandHighPct
        ? 'medel'
        : 'stark'

  return {
    id: formation.id,
    name: known ? formation.name : 'UNKNOWN FORMATION',
    factionId: formation.factionId,
    frontId: formation.frontId,
    side: formation.side,
    sectorId: formation.sectorId,
    doctrine: formation.doctrine,
    status: formation.status,
    strength: known ? formation.strength : null,
    strengthBand,
    readiness: known ? formation.readiness : null,
    equipment: known ? { ...formation.equipment } : null,
    known,
  }
}

// P66 (ETAPP6_TEKNISK_SPEC.md §4.3), ordagrant: "Grupperar front.formations på
// sectorId (samma logik som TheWorld.tsx:s groupBySector i dag, FLYTTAD hit så
// att komponenten blir en ren presentation av redan härledd data). side avgörs
// av vilken sidas SUMMA av strength (känd eller ej) är störst i sektorn —
// beräknat på det RIKTIGA Formation.strength, inte det formationDisplay-dimmade
// (kontrollstatus är grov/synlig oavsett underrättelsedjup, precis som
// front.position redan alltid varit synlig utan någon station). 'empty' om
// inga formationer finns där — läst som "sammanlagd styrka noll" (täcker både
// en sektor utan förband alls OCH en där samtliga förband slagits ut, strength
// 0), inte "sektorn saknas i layoutdata" (det avgör SectorBoard.tsx, appen,
// via SECTOR_LAYOUTS — queries.ts känner inte till presentationsdata,
// CLAUDE.md hård regel 1). 'contested' vid "praktiskt taget paritet" —
// PROVISORISKT tolkat som samma tredjedelströskel formationStrengthBandLowPct/
// -HighPct (33/66) redan definierar, applicerad på sidan A:s andel av total
// styrka i stället för att gissa ett nytt talpar: inget nytt balanstal
// behövs, samma "återanvänd en befintlig, konceptuellt likartad tröskel"-
// princip som P62:s DOOMSDAY-gräns återanvände STAGE_INCIDENT:s.
export function deriveSectorControl(state: GameState, front: Front): SectorControl[] {
  const bySector = new Map<string, Formation[]>()
  for (const formation of front.formations) {
    const group = bySector.get(formation.sectorId)
    if (group) group.push(formation)
    else bySector.set(formation.sectorId, [formation])
  }

  const result: SectorControl[] = []
  for (const [sectorId, formations] of bySector) {
    let strengthA = 0
    let strengthB = 0
    for (const formation of formations) {
      if (formation.side === 'a') strengthA += formation.strength
      else strengthB += formation.strength
    }

    const total = strengthA + strengthB
    let side: SectorControl['side']
    if (total === 0) {
      side = 'empty'
    } else {
      const sharePctA = (strengthA / total) * 100
      side =
        sharePctA < FORMATION_DISPLAY_BALANCE.formationStrengthBandLowPct
          ? 'b'
          : sharePctA > FORMATION_DISPLAY_BALANCE.formationStrengthBandHighPct
            ? 'a'
            : 'contested'
    }

    result.push({ sectorId, side, formations: formations.map((formation) => formationDisplay(state, formation)) })
  }
  return result
}

// P63 (ETAPP5_TEKNISK_SPEC.md avsnitt 8), ordagrant: "tjänstemän, agendor,
// ställning och relation ... en tjänsteman utan 'cabinet'-täckning visas UTAN
// integritet OCH agenda" — bara de två fälten gated, resten visas alltid.
// Samma gate-mönster som effectiveDepth/formationDisplay: en aktiv station i
// landet, men här kontrolleras 'cabinet' i Station.coverage (fynd 1.4) i
// stället för depth.
export function officialDisplay(state: GameState, official: Official): OfficialDisplay {
  const cabinetCoverage = state.house.stations.some(
    (s) => s.nation === official.factionId && s.status === 'active' && s.coverage.includes('cabinet'),
  )

  return {
    id: official.id,
    name: official.name,
    factionId: official.factionId,
    post: official.post,
    standing: official.standing,
    relationToPlayer: official.relationToPlayer,
    integrity: cabinetCoverage ? official.integrity : null,
    agenda: cabinetCoverage ? official.agenda : null,
    cabinetCoverage,
  }
}

export function bidEstimate(state: GameState, order: Order, grade: Grade): BidEstimate {
  const product = getProduct(order.productId)
  const hashRng = createRng(`${state.meta.seed}:${order.id}:${grade}`, 0)

  const depth = effectiveDepth(state, order.buyerId)
  const pct = DEPTH_BAND_PCT[depth]

  const rivalBids: { rivalId: RivalId; price: Money }[] = []
  for (const rivalId of order.competingRivals) {
    const rival = state.rivals[rivalId]
    if (!rival) continue
    const bid = computeRivalBid(hashRng, rival, product, order.referencePrice)
    rivalBids.push({ rivalId, price: bid.price })
  }

  let lowest = rivalBids[0] ?? null
  for (const rb of rivalBids.slice(1)) {
    if (rb.price < lowest!.price) lowest = rb
  }
  const lowestPrice = lowest ? lowest.price : order.referencePrice

  const rivalPriceLow = Math.round(lowestPrice * (1 - pct))
  const rivalPriceHigh = Math.round(lowestPrice * (1 + pct))
  // "plus vilket hus som ligger lägst" — bara vid depth >= 4 (spec 4.3-tabellen).
  const lowestRivalHouse = depth >= 4 && lowest ? lowest.rivalId : null

  const yourUnitCost = computeUnitCostNow(product, grade, state.market.commodities)

  const faction = state.factions[order.buyerId]
  const relationToPlayer = faction ? faction.relationToPlayer : 0
  // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): integriteten läses nu ur den
  // persistenta Official ordern pekar på, inte ur ordern själv (skyddsräcke 2 —
  // computeScore/formeln oförändrad).
  const official = state.officials[order.officialId]
  const integrity = official ? official.integrity : 0
  // P55 (avsnitt 3.2): NON_ALIGNMENT fördubblar blocTerm — samma multiplikator
  // som bidding.ts, för att hålla P24:s invariant ("bidEstimate och bidding.ts
  // använder identiska termer") även för den nya effekten.
  const blocMultiplier = official && official.agenda === 'NON_ALIGNMENT' ? BALANCE.agendaNonAlignmentBlocMultiplier : 1
  const blocTerm = faction ? alignmentPenalty(faction.alignment, state.house) * blocMultiplier : 0

  const winBand = computeWinBand(hashRng, {
    order,
    product,
    grade,
    rivalPriceLow,
    rivalPriceHigh,
    relationToPlayer,
    reputation: categoryReputation(state.house, product.category),
    blocTerm,
    rivals: state.rivals,
    factionAlignment: faction ? faction.alignment : 0,
    integrity,
    blocMultiplier,
    playerBidTerm: playerBidTerm(state.house, product),
  })

  return { rivalPriceLow, rivalPriceHigh, lowestRivalHouse, winBand, yourUnitCost }
}

const PLAYER_WIN_CURVE_POINTS = 7

// P81c (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten, P81-7): speltestets fynd
// var att de flesta ordrar visade 0 % vinstchans "oavsett bud" — ett
// visningsfel, inte ett spelfel. bidEstimate.winBand samplar bara FEM punkter
// mellan rivalPriceLow och rivalPriceHigh (ett band centrerat på en enda
// rivalsamplings pris ± DEPTH_BAND_PCT), och det bandet kan ligga helt över
// det prisintervall där SPELARENS EGET bud faktiskt vinner — en simulering
// mot riktig bidding.ts visade bud på 50–70 % av rivalPriceLow vinna
// 36–100 % av gångerna, siffror winBand aldrig visade. playerWinCurve
// besvarar en ANNAN fråga än winBand: inte "var ligger rivalerna", utan
// "var, mellan min egen självkostnad och rivalPriceHigh, börjar JAG vinna."
// Golden-säker: bidEstimate/computeWinBand rörs inte (golden-testets
// balanced-bot läser dem, hård regel — se ANDRINGSLOGG.md), och detta är en
// ny, fristående funktion med sin egen hash-seedade Rng-ström (hård regel 2).
export interface PlayerWinCurvePoint {
  price: Money
  confidence: Pct
}

export function playerWinCurve(state: GameState, order: Order, grade: Grade): PlayerWinCurvePoint[] {
  const product = getProduct(order.productId)
  const hashRng = createRng(`${state.meta.seed}:${order.id}:${grade}:playerWinCurve`, 0)

  // Rivalprisbandets ÖVRE gräns — ordagrant samma beräkning som bidEstimate
  // ovan (samma "en enda samplad rivalprissiffra, ±DEPTH_BAND_PCT"-metod),
  // duplicerad avsiktligt i stället för att låta playerWinCurve anropa hela
  // bidEstimate: den skulle kört en HEL extra winBand-Monte-Carlo (500 rival-
  // dragningar) bara för en siffra den redan visar spelaren. Håll i synk med
  // bidEstimate om rivalprisbandets formel någonsin ändras.
  const depth = effectiveDepth(state, order.buyerId)
  const pct = DEPTH_BAND_PCT[depth]
  const rivalPrices: Money[] = []
  for (const rivalId of order.competingRivals) {
    const rival = state.rivals[rivalId]
    if (!rival) continue
    rivalPrices.push(computeRivalBid(hashRng, rival, product, order.referencePrice).price)
  }
  const lowestRivalPrice = rivalPrices.length > 0 ? Math.min(...rivalPrices) : order.referencePrice
  const rivalPriceHigh = Math.round(lowestRivalPrice * (1 + pct))

  const yourUnitCost = computeUnitCostNow(product, grade, state.market.commodities)
  const costFloor = Math.max(1, yourUnitCost * order.quantity)
  const ceiling = Math.max(costFloor, rivalPriceHigh)

  const faction = state.factions[order.buyerId]
  const relationToPlayer = faction ? faction.relationToPlayer : 0
  const official = state.officials[order.officialId]
  const integrity = official ? official.integrity : 0
  const blocMultiplier = official && official.agenda === 'NON_ALIGNMENT' ? BALANCE.agendaNonAlignmentBlocMultiplier : 1
  const blocTerm = faction ? alignmentPenalty(faction.alignment, state.house) * blocMultiplier : 0

  const inputs: WinBandInputs = {
    order,
    product,
    grade,
    rivalPriceLow: costFloor,
    rivalPriceHigh: ceiling,
    relationToPlayer,
    reputation: categoryReputation(state.house, product.category),
    blocTerm,
    rivals: state.rivals,
    factionAlignment: faction ? faction.alignment : 0,
    integrity,
    blocMultiplier,
    playerBidTerm: playerBidTerm(state.house, product),
  }

  const points: PlayerWinCurvePoint[] = []
  for (let i = 0; i < PLAYER_WIN_CURVE_POINTS; i++) {
    const price =
      ceiling === costFloor ? costFloor : Math.round(costFloor + ((ceiling - costFloor) * i) / (PLAYER_WIN_CURVE_POINTS - 1))
    points.push({ price, confidence: computeWinAtPrice(hashRng, inputs, price) })
  }
  return points
}

interface WinBandInputs {
  order: Order
  product: ReturnType<typeof getProduct>
  grade: Grade
  rivalPriceLow: Money
  rivalPriceHigh: Money
  relationToPlayer: Pct
  reputation: { reliability: Pct; quality: Pct }
  blocTerm: number
  rivals: GameState['rivals']
  factionAlignment: number
  // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): ersätter order.inspectorIntegrity —
  // slås upp av anroparen (bidEstimate) eftersom den, till skillnad från denna
  // inre funktion, har hela state och alltså state.officials.
  integrity: Pct
  // P55 (avsnitt 3.2): NON_ALIGNMENT-multiplikatorn (1 annars), räknad en gång av
  // bidEstimate — samma tal används för både spelarens blocTerm (ovan) och varje
  // samplad rivals, se rivalScore nedan.
  blocMultiplier: number
  // P106: teknik- och specialiseringstermen (bidTerms.ts), en gång räknad av anroparen ur state.house —
  // samma tal bidding.ts lägger på spelarens poäng efter computeScore.
  playerBidTerm: number
}

// Monte Carlo-skattning för EN prispunkt: kör MONTE_CARLO_SAMPLES simulerade
// omgångar rivalbud (dragna ur samma hash-Rng-ström) och räkna andelen där ett
// bud till det priset — med spelarens EGNA kända relation/rykte/blocTerm,
// ingen mut, leverans exakt vad ordern kräver — hade slagit alla icke-
// diskvalificerade rivalbud. Det är det ärliga sättet att uttrycka "dold
// information som sannolikhet" spec 4.3 efterlyser, snarare än att läcka en
// exakt siffra som ändå inte avgör anbudet. Utbruten ur computeWinBand (P81c,
// ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten) så att playerWinCurve nedan
// återanvänder EXAKT samma formel över ett annat prisintervall, i stället för
// att handkopiera den — samma "en formel, en källa"-disciplin som
// intelOpSuccessPct/fundCoupSuccessPct (P78).
function computeWinAtPrice(hashRng: Rng, p: WinBandInputs, price: Money): Pct {
  const withinBudget = price <= p.order.trueBudget
  const playerScore = computeScore({
    bidPrice: price,
    bidDeliveryTurns: p.order.requiredDeliveryTurns,
    bidGrade: p.grade,
    bidBribe: 0,
    referencePrice: p.order.referencePrice,
    requiredDeliveryTurns: p.order.requiredDeliveryTurns,
    weights: p.order.weights,
    inspectorIntegrity: p.integrity,
    relationToPlayer: p.relationToPlayer,
    reputation: p.reputation,
    blocTerm: p.blocTerm,
  }) + p.playerBidTerm

  let wins = 0
  for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample++) {
    let beatsAllRivals = withinBudget

    for (const rivalId of p.order.competingRivals) {
      const rival = p.rivals[rivalId]
      if (!rival) continue
      const sampledBid = computeRivalBid(hashRng, rival, p.product, p.order.referencePrice)
      if (sampledBid.price > p.order.trueBudget) continue // diskvalificerad, ingen konkurrent

      // relationToPlayer/reputation/blocTerm är sedan P24 rivalens EGNA värden —
      // samma termer bidding.ts faktiskt avgör med, annars driver skattningen isär
      // från avgörandet (queries.ts:s egen huvudkommentar).
      const rivalScore = computeScore({
        bidPrice: sampledBid.price,
        bidDeliveryTurns: sampledBid.deliveryTurns,
        bidGrade: 'A',
        bidBribe: 0,
        referencePrice: p.order.referencePrice,
        requiredDeliveryTurns: p.order.requiredDeliveryTurns,
        weights: p.order.weights,
        inspectorIntegrity: p.integrity,
        relationToPlayer: rival.relations[p.order.buyerId] ?? 0,
        reputation: rival.reputation,
        blocTerm: rivalBlocTerm(rival, p.factionAlignment) * p.blocMultiplier,
      })
      if (rivalScore >= playerScore) beatsAllRivals = false
    }

    if (beatsAllRivals) wins++
  }

  return Math.round((wins / MONTE_CARLO_SAMPLES) * 100)
}

function computeWinBand(hashRng: Rng, p: WinBandInputs): { price: Money; confidence: Pct }[] {
  const points: { price: Money; confidence: Pct }[] = []

  for (let i = 0; i < WIN_BAND_POINTS; i++) {
    const price =
      p.rivalPriceHigh === p.rivalPriceLow
        ? p.rivalPriceLow
        : Math.round(p.rivalPriceLow + ((p.rivalPriceHigh - p.rivalPriceLow) * i) / (WIN_BAND_POINTS - 1))

    points.push({ price, confidence: computeWinAtPrice(hashRng, p, price) })
  }

  return points
}

// ── THE COMPANY (P85, ETAPP7_TEKNISK_SPEC.md §13, P81-14/15/16) ────────────

export interface ProjectedQuarter {
  // Skeppningar redan schemalagda att anlända NÄSTA tur (state.market.shipments,
  // arrivalTurn === meta.turn + 1) — en prognos, inte en gissning: varje krona
  // är redan låst i ett vunnet kontrakt, samma "betalning bokförs proportionellt
  // mot levererad andel"-formel som deliveries.ts faktiskt använder (en formel,
  // en källa). Leveranser längre fram i röret (delay kan vara upp till tre
  // turer) räknas medvetet INTE in — "prognos för NÄSTA kvartal", inte hela röret.
  expectedRevenueNextTurn: Money
  fixedCosts: FixedCostsBreakdown
  interest: Money
  netChange: Money
}

// "en prognos för nästa kvartal ur accepterade kontrakt och fasta kostnader"
// (P81-14/15, ETAPP7_TEKNISK_SPEC.md §13). Fasta kostnader och ränta är redan
// kända/deterministiska (de ändras bara av spelarens EGNA handlingar denna
// tur, inte av rng) — bara den framtida INTÄKTEN är en genuin prognos.
export function projectedQuarter(state: GameState): ProjectedQuarter {
  const nextTurn = state.meta.turn + 1
  let expectedRevenueNextTurn = 0
  for (const shipment of state.market.shipments) {
    if (shipment.arrivalTurn !== nextTurn) continue
    const contract = state.market.contracts.find((c) => c.id === shipment.contractId)
    if (!contract) continue
    expectedRevenueNextTurn += deliveryPayment(contract, shipment.units)
  }

  // P99d: FAVOUR-skulden betalas ur just de leveranserna — prognosen räknar nettot.
  expectedRevenueNextTurn = settleFavourMargin(state.house.favourMarginOwed, expectedRevenueNextTurn).revenue

  const fixedCosts = computeFixedCostsBreakdown(state.house, state.meta.turn)
  const interest = computeQuarterlyInterest(state.house)
  const totalFixedCosts = fixedCosts.payroll + fixedCosts.lineUpkeep + fixedCosts.stationUpkeep + fixedCosts.rndOverhead
  const netChange = expectedRevenueNextTurn - totalFixedCosts - interest

  return { expectedRevenueNextTurn, fixedCosts, interest, netChange }
}

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

export interface CategoryResearchOutlook {
  category: TechCategory
  techLevel: number
  // Produkten med LÄGST techRequired bland dem som fortfarande är låsta i den
  // här kategorin — "vad varje område låser upp och när" (P81-17), utan att
  // hitta på ett nytt forskningssystem (etapp 9:s jobb). null när allt i
  // kategorin redan är upplåst.
  nextUnlock: { productName: string; techRequired: number } | null
}

// R&D:s nuläge visat ÄRLIGT (P81-17): vad techLevel faktiskt gör mekaniskt är
// gate:a bidding.ts:s techRequired-kontroll (en disponerad rivals bud
// diskvalificeras annars) — den enda konsumenten i hela kodbasen. Ingen ny
// mekanik, bara en sanningsenlig läsning av en redan existerande grind.
export function researchOutlook(state: GameState): CategoryResearchOutlook[] {
  return TECH_CATEGORIES.map((category) => {
    const techLevel = state.house.techLevel[category]
    const locked = allProducts()
      .filter((p) => p.category === category && p.techRequired > techLevel)
      .sort((a, b) => a.techRequired - b.techRequired)
    const nextUnlock = locked[0] ? { productName: locked[0].name, techRequired: locked[0].techRequired } : null
    return { category, techLevel, nextUnlock }
  })
}

// "när pågående kontrakt blir klara" (P81-16). null för en ledig linje (inget
// kontrakt att räkna mot) eller en linje vars takt är noll (skulle aldrig bli
// klar — strukturellt onåbart i dagens balans, se computeLineThroughput, men
// avvisat explicit i stället för att dela med noll).
export function estimateLineCompletionTurn(state: GameState, line: ProductionLine): number | null {
  if (!line.assignedContractId) return null
  const contract = state.market.contracts.find((c) => c.id === line.assignedContractId)
  if (!contract) return null

  const inTransit = state.market.shipments
    .filter((s) => s.contractId === contract.id)
    .reduce((sum, s) => sum + s.units, 0)
  const remaining = contract.quantity - contract.unitsDelivered - inTransit
  if (remaining <= 0) return state.meta.turn

  const product = getProduct(contract.productId)
  const rate = computeLineThroughput(state.house, line, product)
  if (rate <= 0) return null

  return state.meta.turn + Math.ceil(remaining / rate)
}
