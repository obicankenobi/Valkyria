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
import { alignmentPenalty, BALANCE, computeRivalBid, computeScore, getProduct, computeUnitCostNow, rivalBlocTerm } from './pricing.js'
import type {
  BidEstimate,
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
  RivalId,
  SectorControl,
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
    reputation: state.house.reputation,
    blocTerm,
    rivals: state.rivals,
    factionAlignment: faction ? faction.alignment : 0,
    integrity,
    blocMultiplier,
  })

  return { rivalPriceLow, rivalPriceHigh, lowestRivalHouse, winBand, yourUnitCost }
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
}

// Monte Carlo-skattning: för varje prispunkt, kör MONTE_CARLO_SAMPLES simulerade
// omgångar rivalbud (dragna ur samma hash-Rng-ström) och räkna andelen där ett bud
// till det priset — med spelarens EGNA kända relation/rykte/blocTerm, ingen mut,
// leverans exakt vad ordern kräver — hade slagit alla icke-diskvalificerade
// rivalbud. Det är det ärliga sättet att uttrycka "dold information som
// sannolikhet" spec 4.3 efterlyser, snarare än att läcka en exakt siffra som ändå
// inte avgör anbudet.
function computeWinBand(hashRng: Rng, p: WinBandInputs): { price: Money; confidence: Pct }[] {
  const points: { price: Money; confidence: Pct }[] = []

  for (let i = 0; i < WIN_BAND_POINTS; i++) {
    const price =
      p.rivalPriceHigh === p.rivalPriceLow
        ? p.rivalPriceLow
        : Math.round(p.rivalPriceLow + ((p.rivalPriceHigh - p.rivalPriceLow) * i) / (WIN_BAND_POINTS - 1))

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
    })

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

    points.push({ price, confidence: Math.round((wins / MONTE_CARLO_SAMPLES) * 100) })
  }

  return points
}
