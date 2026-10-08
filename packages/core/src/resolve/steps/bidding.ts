// bidding — avgör anbud som löper ut denna tur. Se ETAPP1_TEKNISK_SPEC.md avsnitt
// 4.2, 4.4.
import { BALANCE, alignmentPenalty, computeRivalBid, computeScore, computeUnitCostNow, getProduct, rivalBlocTerm } from '../../pricing.js'
import { categoryReputation, playerBidTerm } from '../../bidTerms.js'
import { CUSTOMISE_TERMS, KIT_UNIT_COST_FACTOR, bidDesignRejection, customiseBidTerm, designBidTerm, kitBidTerm } from '../../design.js'
import { round } from '../../money.js'
import { counterBidTerm, effectiveRivalReputation, firstInPlaceBidTerm } from '../../race.js'
import { isBidLocked } from '../../research.js'
import { leadSupplierActive } from '../../leadSupplier.js'
import { validateBid } from '../../validateAction.js'
import { advanceAmount } from '../advance.js'
import { rivalLoadMarkup, routeCostFactor } from '../../outsourcing.js'
import { integrityBidTerm, isSuspendedFrom, recordTrace } from '../../traces.js'
import { recordIncome } from '../../ledger.js'
import { applyExportViolation, isExportViolation } from '../../exportRules.js'
import { deliverFromStock } from '../../stock.js'
import { localWorksBidTerm } from '../../foreign.js'
import type { ResolveStep } from '../index.js'
import type { Contract, Grade, Money, Order, RivalContract, RivalId } from '../../types.js'

interface Candidate {
  source: 'player' | RivalId
  price: Money
  deliveryTurns: number
  grade: Grade
  bribe: Money
  score: number
  designId?: string // P109
  kit?: boolean // P112
  customise?: boolean // P135
}

function pickWinner(candidates: readonly Candidate[]): Candidate | null {
  if (candidates.length === 0) return null
  let best = candidates[0]!
  for (const c of candidates.slice(1)) {
    if (c.score > best.score) best = c
  }
  return best
}

export const bidding: ResolveStep = (ctx) => {
  const { draft, rng, submission, emit, rejected } = ctx
  const knownOrderIds = new Set(draft.market.openOrders.map((o) => o.id))

  // Bud mot en order som inte finns (aldrig utlyst, eller redan avgjord) är ogiltiga.
  for (const bid of submission.bids) {
    if (!knownOrderIds.has(bid.orderId)) {
      rejected.push({ action: bid, reason: `unknown order "${bid.orderId}"` })
    }
  }

  const stillOpen: Order[] = []

  for (const order of draft.market.openOrders) {
    if (order.expiresTurn > draft.meta.turn) {
      stillOpen.push(order)
      continue
    }

    const product = getProduct(order.productId)
    const faction = draft.factions[order.buyerId]
    const buyerName = faction ? faction.name.toUpperCase() : order.buyerId.toUpperCase()
    // P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1): integriteten läses nu ur den
    // persistenta Official ordern pekar på, inte ur ordern själv. computeScore
    // och dess fältnamn (inspectorIntegrity) är oförändrade — bara källan flyttad
    // (skyddsräcke 2).
    const official = draft.officials[order.officialId]
    const officialIntegrity = official ? official.integrity : 0
    // P55 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.2): NON_ALIGNMENT "fördubblar
    // alignmentPenalty:s utslag" — ordagrant, applicerat på blocTerm oavsett
    // om det kom från spelarens alignmentPenalty eller en rivals rivalBlocTerm
    // (samma term, bara två källor, se P24).
    const blocMultiplier = official && official.agenda === 'NON_ALIGNMENT' ? BALANCE.agendaNonAlignmentBlocMultiplier : 1
    // P57 (avsnitt 3.4): PREFERRED_SUPPLIER — en poängbonus adderad EFTER
    // computeScore (skyddsräcke 2, formeln själv orörd), till precis den
    // kandidat (spelaren eller en namngiven rival) som faktionen gynnar.
    const preferredBonus = (source: 'player' | RivalId): number =>
      faction && faction.preferredSupplier === source ? BALANCE.preferredSupplierScoreBonus : 0

    const playerBids = submission.bids.filter((b) => b.orderId === order.id)
    for (const extra of playerBids.slice(1)) {
      rejected.push({ action: extra, reason: `duplicate bid on order "${order.id}", first one kept` })
    }
    const playerBid = playerBids[0]

    const candidates: Candidate[] = []
    let bribeTraceId: string | null = null // P125: spåret efter en muta i budet, kopplas till kontraktet om budet vinner
    // P109: en konstruktion i budet prövas mot huset och ordern innan något annat räknas.
    const designRejection = playerBid ? bidDesignRejection(draft, playerBid, order) : null

    if (playerBid) {
      if (playerBid.price > order.trueBudget) {
        // Diskvalificerad: över trueBudget. Tyst mot spelaren (ingen upplysning om
        // var taket låg), men synlig som ticker för felsökning (spec 4.4).
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: PRICE EXCEEDS BUYER'S TRUE BUDGET`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (isSuspendedFrom(draft.house, order.buyerId, draft.meta.turn)) {
        // P125 (§8.3): ett avslöjat spår kan stänga huset ute från en köpare en tid.
        rejected.push({ action: playerBid, reason: 'suspended from this buyer' })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${draft.house.name.toUpperCase()} IS SUSPENDED FROM TENDERING TO ${buyerName}`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (draft.house.reputation.reliability < BALANCE.reliabilityBidFloor) {
        // Avsnitt 6.2.B: en hård spärr, direkt efter trueBudget-kontrollen. Till
        // skillnad från trueBudget-diskvalificeringen (tyst, bara ticker) avvisas
        // den här UTTRYCKLIGEN — specens egen pseudokod pushar till rejected.
        rejected.push({ action: playerBid, reason: 'reputation below buyer threshold' })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${draft.house.name.toUpperCase()}'S RELIABILITY BELOW BUYER THRESHOLD`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (product.techRequired > draft.house.techLevel[product.category]) {
        // P28 (ETAPP2_TEKNISK_SPEC.md avsnitt 3.3): en TREDJE diskvalificerings-
        // grund, efter trueBudget och reliabilityBidFloor. Gäller bara spelarens
        // eget bud — RivalHouse har inget techLevel-fält, rivaler byggs inte av
        // den här spärren (de har heller inget REPRIORITISE_RND att investera i).
        rejected.push({ action: playerBid, reason: 'insufficient tech level' })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${draft.house.name.toUpperCase()}'S ${product.category.toUpperCase()} TECH LEVEL IS TOO LOW`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (leadSupplierActive() && !validateBid(draft, draft, playerBid).ok) {
        // P185 (11O/11P): huvudleverantörsregeln — ett bud i en kategori kräver ett monteringsverk i den. Skälet i klartext kommer ur validateBid, samma som budmappen visar.
        const lock = validateBid(draft, draft, playerBid) as { ok: false; reason: string }
        rejected.push({ action: playerBid, reason: lock.reason })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${lock.reason.toUpperCase()}`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (isBidLocked(draft.house, product.category, draft.meta.turn)) {
        // P108 (ETAPP9 §4.5): ett krasprogram i kategorin förra turen låser husets bud i den här.
        rejected.push({ action: playerBid, reason: 'crash programme: no bids in this category this quarter' })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${draft.house.name.toUpperCase()}'S ${product.category.toUpperCase()} CRASH PROGRAMME`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else if (designRejection !== null) {
        rejected.push({ action: playerBid, reason: designRejection })
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `BID ON ${order.id} DISQUALIFIED: ${playerBid.designId === undefined ? `${draft.house.name.toUpperCase()}'S ${product.category.toUpperCase()} PRODUCT IS A GENERATION BEHIND THE BUYER'S BLOC` : `${draft.house.name.toUpperCase()}'S DESIGN CANNOT BE OFFERED HERE`}`,
          causeId: null,
          delta: {},
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      } else {
        const design = playerBid.designId !== undefined ? draft.house.designs.find((d) => d.id === playerBid.designId) : undefined
        if (playerBid.bribe > 0) {
          // P125 (beslut 9N): mutan i ett vanligt bud ger ett spår hos köparen.
          bribeTraceId = recordTrace(ctx, { houseId: 'player', officialId: order.officialId, buyerId: order.buyerId, kind: 'bidBribe', severity: 1 }, null).id
        }
        const score = computeScore({
          bidPrice: playerBid.price,
          bidDeliveryTurns: playerBid.deliveryTurns,
          bidGrade: playerBid.grade,
          bidBribe: playerBid.bribe,
          referencePrice: order.referencePrice,
          requiredDeliveryTurns: order.requiredDeliveryTurns,
          weights: order.weights,
          inspectorIntegrity: officialIntegrity,
          relationToPlayer: faction ? faction.relationToPlayer : 0,
          reputation: categoryReputation(draft.house, product.category), // P107: rykte per kategori
          blocTerm: faction ? alignmentPenalty(faction.alignment, draft.house) * blocMultiplier : 0,
        })
        candidates.push({
          source: 'player',
          price: playerBid.price,
          deliveryTurns: playerBid.deliveryTurns,
          grade: playerBid.grade,
          bribe: playerBid.bribe,
          // P106: teknik- och specialiseringstermen läggs EFTER computeScore (skyddsräcke 1) och delas med
          // bidEstimate/playerWinCurve via playerBidTerm (skyddsräcke 3).
          // P109: konstruktionens term, också EFTER computeScore och delad med bidEstimate/playerWinCurve (designBidTerm).
          score: score + preferredBonus('player') + playerBidTerm(draft.house, product) + (design ? designBidTerm(draft, design, order) : 0) + (playerBid.kit ? kitBidTerm() : 0) + (playerBid.customise ? customiseBidTerm() : 0) + counterBidTerm(draft, order) + firstInPlaceBidTerm(draft, order) + integrityBidTerm(draft, order) + localWorksBidTerm(draft, order),
          ...(design ? { designId: design.id } : {}),
          ...(playerBid.kit ? { kit: true } : {}),
          ...(playerBid.customise ? { customise: true } : {}),
        })
      }
    }

    for (const rivalId of order.competingRivals) {
      const rival = draft.rivals[rivalId]
      if (!rival) continue
      // Avsnitt 2.5: en saboterad rival "lägger inga bud" — hoppas över helt,
      // ingen ticker (de deltar inte, snarare än att bli diskvalificerade).
      if (rival.sabotagedUntilTurn !== null && draft.meta.turn < rival.sabotagedUntilTurn) continue
      // P185 (11O/11L): huvudleverantörsregeln gäller rivalerna genom kapacitetstalet — en fullbelagd rival bjuder inte utanför sin specialisering (i den bjuder den, dyrare).
      if (leadSupplierActive() && rival.specialisation !== product.category && rival.contracts.filter((c) => c.status === 'active').length >= BALANCE.rivalCapacityContracts) continue

      const baseRivalBid = computeRivalBid(rng, rival, product, order.referencePrice)
      // P172 (11L): en rival som redan bär sin kapacitet i aktiva kontrakt är fullbelagd och bjuder dyrare. Ett enda tal per rival; ingen ny slump.
      const loadMarkup = rivalLoadMarkup(rival.contracts.filter((c) => c.status === 'active').length, BALANCE.rivalCapacityContracts, BALANCE.rivalFullPriceMarkupPct)
      const rivalBid = loadMarkup === 1 ? baseRivalBid : { ...baseRivalBid, price: round(baseRivalBid.price * loadMarkup) }
      if (rivalBid.price > order.trueBudget) {
        emit({
          severity: 'ticker',
          scope: 'market',
          headline: `${rival.name.toUpperCase()}'S BID ON ${order.id} DISQUALIFIED: PRICE EXCEEDS BUYER'S TRUE BUDGET`,
          causeId: null,
          delta: {},
          actorIsPlayer: false,
          subjectId: order.buyerId,
        })
        continue
      }

      // Rivaler har ingen grade (spec 4.2 tillämpar ingen gradeFactor på rivalbudet).
      // 'A' ger effectiveRef = referencePrice, exakt vad formeln de facto redan bjöd
      // mot. relationToPlayer/reputation/blocTerm är sedan P24 rivalens EGNA värden
      // (RivalHouse.relations/reputation, rivalBlocTerm) — inte längre statiska
      // nollor, se ETAPP2_TEKNISK_SPEC.md avsnitt 2.2.
      const score = computeScore({
        bidPrice: rivalBid.price,
        bidDeliveryTurns: rivalBid.deliveryTurns,
        bidGrade: 'A',
        bidBribe: 0,
        referencePrice: order.referencePrice,
        requiredDeliveryTurns: order.requiredDeliveryTurns,
        weights: order.weights,
        inspectorIntegrity: officialIntegrity,
        relationToPlayer: rival.relations[order.buyerId] ?? 0,
        reputation: effectiveRivalReputation(rival, product.category, draft.meta.turn, { state: draft, buyerId: order.buyerId }), // P117/P119: rivalens nyaste konstruktion, måttstock och först-på-plats
        blocTerm: faction ? rivalBlocTerm(rival, faction.alignment) * blocMultiplier : 0,
      })
      candidates.push({
        source: rivalId,
        price: rivalBid.price,
        deliveryTurns: rivalBid.deliveryTurns,
        grade: 'A',
        bribe: 0,
        score: score + preferredBonus(rivalId),
      })
    }

    const winner = pickWinner(candidates)

    if (!winner) {
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${buyerName}'S ORDER FOR ${product.name.toUpperCase()} GOES UNFULFILLED`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
      continue
    }

    if (faction && winner.price > faction.militaryBudget) {
      // Avsnitt 7.1.A: golv vid tilldelning, samma gren som "no winner" — en
      // vinnare fanns, men köparen har inte råd med DEN.
      emit({
        severity: 'report',
        scope: 'market',
        headline: `${buyerName}'S ORDER FOR ${product.name.toUpperCase()} WITHDRAWN — BUDGET EXHAUSTED`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
      continue
    }

    if (faction) {
      faction.militaryBudget -= winner.price
    }

    if (winner.source === 'player') {
      // P172: går kontraktet via en underleverantör (inget verk bygger kategorin) är dess styckkostnad den dyrare vägens.
      const route = routeCostFactor(draft.house, product)
      const baseUnitCost = route === 1 ? computeUnitCostNow(product, winner.grade, draft.market.commodities) : round(computeUnitCostNow(product, winner.grade, draft.market.commodities) * route)
      const winningDesign = winner.designId !== undefined ? draft.house.designs.find((d) => d.id === winner.designId) : undefined
      // P112: en uppgraderingssats sänker styckkostnaden ytterligare (lägre marginal mot snabbare affär).
      const unitCostAtSigning =
        winningDesign || winner.kit || winner.customise
          ? round(baseUnitCost * (winningDesign ? winningDesign.unitCostFactor : 1) * (winner.kit ? KIT_UNIT_COST_FACTOR : 1) * (winner.customise ? CUSTOMISE_TERMS.costFactor : 1))
          : baseUnitCost
      // P135 (§8b.4): en kundanpassning kan utlösa en politisk skandal hos köparen som halverar ordern. Slumptalet dras bara för ett kundanpassat bud.
      const scandal = winner.customise === true && rng.chance(CUSTOMISE_TERMS.scandalPct)
      const contractPrice = scandal ? round(winner.price * CUSTOMISE_TERMS.scandalOrderFactor) : winner.price
      const contractQuantity = scandal ? Math.max(1, Math.round(order.quantity * CUSTOMISE_TERMS.scandalOrderFactor)) : order.quantity
      if (scandal && faction) faction.militaryBudget += winner.price - contractPrice
      const contract: Contract = {
        id: `contract-${order.id}`,
        buyerId: order.buyerId,
        productId: order.productId,
        quantity: contractQuantity,
        unitsDelivered: 0,
        price: contractPrice,
        unitCostAtSigning,
        grade: winner.grade,
        dueTurn: draft.meta.turn + winner.deliveryTurns,
        status: 'active',
        lateEventId: null,
        // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): ärvt rakt av vid signering.
        frontId: order.frontId,
        // P98 (ETAPP8_FORSLAG.md §4.1): förskottet, fryst på ordern och betalt vid tilldelning.
        advancePct: order.advancePct,
        advancePaid: advanceAmount(contractPrice, order.advancePct),
        ...(winningDesign ? { designId: winningDesign.id } : {}),
        ...(winner.kit ? { kit: true } : {}),
        ...(winner.customise ? { customised: true } : {}),
        ...(scandal ? { scandalHalved: true } : {}),
      }
      draft.market.contracts.push(contract)
      deliverFromStock(ctx, contract) // P175: ett kontrakt fylls ur depån om lagret räcker
      if (bribeTraceId !== null && winner.bribe > 0) {
        const bribeTrace = draft.traces?.find((t) => t.id === bribeTraceId)
        if (bribeTrace) bribeTrace.contractId = contract.id
      }
      // P115: fältprovets bonus hos den här köparen är förbrukad — "nästa upphandling" var den här.
      const trial = winningDesign?.trials?.[order.buyerId]
      if (trial) trial.bonusActive = false

      if (faction) {
        const boost = rng.int(BALANCE.relationBoostMin, BALANCE.relationBoostMax)
        faction.relationToPlayer = Math.min(100, faction.relationToPlayer + boost)
      }

      const winId = emit({
        severity: 'headline',
        scope: 'market',
        headline: `${draft.house.name.toUpperCase()} WINS CONTRACT: ${product.name.toUpperCase()} × ${contractQuantity} TO ${buyerName}`,
        causeId: null,
        delta: { price: contractPrice },
        actorIsPlayer: true,
        subjectId: order.buyerId,
      })

      if (scandal) {
        if (faction) faction.relationToPlayer = Math.max(0, faction.relationToPlayer - CUSTOMISE_TERMS.scandalRelationLoss)
        emit({
          severity: 'headline',
          scope: 'house',
          headline: `SCANDAL IN ${buyerName}: THE CUSTOMISED ${product.name.toUpperCase()} DEAL IS CALLED A FAVOUR — THE LEGISLATURE HALVES THE ORDER TO ${contractQuantity} UNITS`,
          causeId: winId,
          delta: { price: contractPrice - winner.price },
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      }

      // P132 (§8b.1): en exportreglerad konstruktion såld över blockgränsen ger doomsday, heat och ett pappersspår.
      if (winningDesign && isExportViolation(draft, winningDesign, order.buyerId)) applyExportViolation(ctx, winningDesign, order.buyerId, contract.id, winId)

      // P98: förskottet betalas nu, innan första leveransen — bokförd intäkt (revenueByTurn,
      // så styrelsens progressSnapshot och kreditgränsen ser den) och en huvudboksrad. Resten
      // av kontraktsvärdet betalas vid leverans (deliveries.ts, deliveryPayment).
      if (contract.advancePaid > 0) {
        const house = draft.house
        house.treasury += contract.advancePaid
        house.revenueByTurn[draft.meta.turn] = (house.revenueByTurn[draft.meta.turn] ?? 0) + contract.advancePaid
        recordIncome(draft, 'advances', contract.advancePaid)
        emit({
          severity: 'report',
          scope: 'market',
          headline: `${buyerName} PAYS AN ADVANCE OF £${contract.advancePaid.toLocaleString('en-GB')} (${contract.advancePct}%) ON ${contract.id}`,
          causeId: winId,
          delta: { treasury: contract.advancePaid },
          actorIsPlayer: true,
          subjectId: order.buyerId,
        })
      }
    } else {
      const rival = draft.rivals[winner.source]
      const rivalName = rival ? rival.name.toUpperCase() : winner.source.toUpperCase()

      // P25 (ETAPP2_TEKNISK_SPEC.md avsnitt 2.3, punkt 1): "bidding.ts:s rivalgren
      // skapar en RivalContract och drar priset från köparens militaryBudget (redan
      // gjort ovan) och lägger det till rivalens capital." Leverans/attribution
      // hanteras i deliveries.ts, INTE här — se avsnitt 2.3:s egen motivering
      // (rivals.ts ligger för sent i PIPELINE för att heat.ts ska hinna se en
      // leverans byggd där samma tur).
      if (rival) {
        const rivalContract: RivalContract = {
          id: `rival-contract-${order.id}`,
          buyerId: order.buyerId,
          productId: order.productId,
          quantity: order.quantity,
          unitsDelivered: 0,
          dueTurn: draft.meta.turn + winner.deliveryTurns,
          status: 'active',
          lateEventId: null,
        }
        rival.contracts.push(rivalContract)
        rival.capital += winner.price

        // Punkt 4: "Vid vunnet kontrakt stiger relations[buyerId] med samma
        // relationBoostMin/Max som spelaren får" (ovan, spelarens gren).
        if (faction) {
          const boost = rng.int(BALANCE.relationBoostMin, BALANCE.relationBoostMax)
          const before = rival.relations[order.buyerId] ?? 0
          rival.relations[order.buyerId] = Math.min(100, before + boost)
        }
      }

      emit({
        severity: 'report',
        scope: 'market',
        headline: `${rivalName} WINS CONTRACT: ${product.name.toUpperCase()} × ${order.quantity} TO ${buyerName}`,
        causeId: null,
        delta: { price: winner.price },
        actorIsPlayer: false,
        subjectId: order.buyerId,
      })
    }
  }

  draft.market.openOrders = stillOpen
}
