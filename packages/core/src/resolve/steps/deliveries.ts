// deliveries — leveranser anländer, betalning bokförs, reliability faller vid
// missad deadline, restricted-leverans anropar doomsdayGate, materiel in på front.
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Leverans") och 3.2 (PIPELINE-kommentaren:
// "leveranser anländer, betalning, materiel in på front").
//
// "Materiel in på front" byggdes inte i P5 — P5:s egen instruktionstext nämnde den
// aldrig, bara PIPELINE-kommentaren gjorde det, så det föll mellan P5 och P6. Utan
// den kan fronts.ts (P6) aldrig uppfylla sitt eget klart när-villkor ("en front dit
// spelaren levererar artilleri flyttar position"), så den läggs till här — en
// nödvändig, liten komplettering av redan committad P5-kod, inte en ny uppgift P6
// hittar på. Se ANDRINGSLOGG.md.
//
// Bara SPELARENS egna leveranser (Contract/Shipment) går genom den här kedjan —
// när en rival vinner en order skapas inget Contract (spec 4.4, se ANDRINGSLOGG.md
// för P4:s motivering), så rivalmateriel kan inte spåras till en front i etapp 1.
// P6:s klart när-villkor testar bara spelarens egna leveranser, så det blockerar
// inget.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import { getProduct } from '../../pricing.js'
import { addDoomsday } from '../doomsdayGate.js'
import type { ResolveStep } from '../index.js'
import type { Front, GameState, Grade } from '../../types.js'

interface Balance {
  reliabilityLatePenalty: number
  reliabilityOnTimeBonus: number
  gradeScandalChance: Record<Grade, number>
  qualityScandalPenalty: number
  qualityScandalTurns: number
}
const BALANCE = balanceData as unknown as Balance

// House (till skillnad från RivalHouse) har inget eget id-fält — det finns bara ett
// hus, spelarens eget. attribution (Front.attribution: "houseId | rivalId → ...")
// behöver ändå en stabil nyckel för det huset. Reserverad konstant, inte husets
// (spelarredigerbara) namn.
export const PLAYER_ATTRIBUTION_KEY = 'player'

function findFrontForBuyer(fronts: GameState['fronts'], buyerId: string): { front: Front; side: 'a' | 'b' } | null {
  for (const front of Object.values(fronts)) {
    if (front.sideA === buyerId) return { front, side: 'a' }
    if (front.sideB === buyerId) return { front, side: 'b' }
  }
  return null
}

export const deliveries: ResolveStep = (ctx) => {
  const { draft, rng, emit } = ctx
  const house = draft.house

  // 0) En grade-skandals utgång (avsnitt 5.1) — inte en del av leveransloopen,
  // eftersom skandalens fönster kan löpa ut en tur helt utan nya leveranser.
  if (house.scandalUntilTurn !== null && draft.meta.turn >= house.scandalUntilTurn) {
    house.reputation.quality = Math.min(100, house.reputation.quality + BALANCE.qualityScandalPenalty)
    house.scandalUntilTurn = null
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${house.name.toUpperCase()}'S QUALITY SCANDAL FADES FROM MEMORY`,
      causeId: null,
      delta: { quality: BALANCE.qualityScandalPenalty },
      actorIsPlayer: false,
      subjectId: null,
    })
  }

  // 1) Skeppningar som anlänt den här turen.
  const arrived = draft.market.shipments.filter((s) => s.arrivalTurn <= draft.meta.turn)
  const stillInTransit = draft.market.shipments.filter((s) => s.arrivalTurn > draft.meta.turn)

  for (const shipment of arrived) {
    const contract = draft.market.contracts.find((c) => c.id === shipment.contractId)
    if (!contract || (contract.status !== 'active' && contract.status !== 'late')) continue

    const product = getProduct(contract.productId)
    const buyer = draft.factions[contract.buyerId]
    const buyerName = buyer ? buyer.name.toUpperCase() : contract.buyerId.toUpperCase()

    contract.unitsDelivered += shipment.units
    // Betalning bokförs proportionellt mot levererad andel (spec 5).
    const revenue = round(contract.price * (shipment.units / contract.quantity))
    house.treasury += revenue
    house.revenueByTurn[draft.meta.turn] = (house.revenueByTurn[draft.meta.turn] ?? 0) + revenue

    const deliveryId = emit({
      severity: 'report',
      scope: 'market',
      headline: `DELIVERED ${shipment.units}× ${product.name.toUpperCase()} TO ${buyerName} (+£${revenue.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { treasury: revenue, unitsDelivered: shipment.units },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })

    if (product.restricted && product.doomsdayOnDelivery) {
      const [min, max] = product.doomsdayOnDelivery
      addDoomsday(ctx, rng.int(min, max), deliveryId)
    }

    // Materiel in på front (PIPELINE-kommentaren, spec 3.2) + attribution (spec 5,
    // "Attribution bokförs per levererande hus" — Front.attribution kommenteras i
    // types.ts som "levererade enheter", så den räknas upp direkt här, inte vid en
    // separat "sammandrabbning"-mekanik som fronts.ts inte har någon egen formel
    // för att avgöra tidpunkten på).
    const frontMatch = findFrontForBuyer(draft.fronts, contract.buyerId)
    if (frontMatch) {
      const { front, side } = frontMatch
      front.equipment[side][product.category] += shipment.units
      front.attribution[PLAYER_ATTRIBUTION_KEY] = (front.attribution[PLAYER_ATTRIBUTION_KEY] ?? 0) + shipment.units

      // P7-tillägg: heatFromDeliveries (spec 5, "Heat") behöver "denna turs
      // leveranser in i aktiv konflikt" — en transient räknare på Theatre som
      // heat.ts läser och nollställer i samma steg. Se types.ts och ANDRINGSLOGG.md.
      const theatre = draft.theatres[front.theatreId]
      if (theatre) theatre.deliveriesIntoActiveWarThisTurn += shipment.units

      emit({
        severity: 'ticker',
        scope: 'front',
        headline: `${shipment.units}× ${product.name.toUpperCase()} REACHES THE ${front.id.toUpperCase()} FRONT`,
        causeId: deliveryId,
        delta: { [`equipment.${side}.${product.category}`]: shipment.units },
        actorIsPlayer: true,
        subjectId: front.id,
      })
    }

    if (contract.unitsDelivered >= contract.quantity) {
      const wasOnTime = contract.status === 'active' // före omskrivningen nedan — 'late' hann det redan bli annars
      contract.status = 'fulfilled'
      const fulfilledId = emit({
        severity: 'headline',
        scope: 'market',
        headline: `CONTRACT ${contract.id} FULFILLED: ${product.name.toUpperCase()} TO ${buyerName}`,
        causeId: deliveryId,
        delta: {},
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })

      // Avsnitt 6.3: återhämtning, bara vid leverans I TID. Asymmetrisk mot
      // reliabilityLatePenalty (−8 / +3) med avsikt — rykte tar tid att bygga.
      if (wasOnTime) {
        house.reputation.reliability = Math.min(100, house.reputation.reliability + BALANCE.reliabilityOnTimeBonus)
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()}'S RELIABILITY RISES — CONTRACT ${contract.id} DELIVERED ON TIME`,
          causeId: fulfilledId,
          delta: { reliability: BALANCE.reliabilityOnTimeBonus },
          actorIsPlayer: true,
          subjectId: contract.buyerId,
        })
      }

      // Avsnitt 5.1: grade-skandal. gradeScandalChance['A'] är 0 (balance.json) —
      // grade A kan alltså aldrig utlösa en skandal, vilket är avsiktligt: risken
      // är precis det som ska göra C till ett verkligt avvägt val, inte A.
      if (rng.chance(BALANCE.gradeScandalChance[contract.grade])) {
        house.reputation.quality = Math.max(0, house.reputation.quality - BALANCE.qualityScandalPenalty)
        house.scandalUntilTurn = draft.meta.turn + BALANCE.qualityScandalTurns
        emit({
          severity: 'headline',
          scope: 'house',
          headline: `QUALITY SCANDAL: GRADE ${contract.grade} DELIVERY TO ${buyerName} DAMAGES ${house.name.toUpperCase()}'S REPUTATION`,
          causeId: fulfilledId,
          delta: { quality: -BALANCE.qualityScandalPenalty },
          actorIsPlayer: true,
          subjectId: contract.buyerId,
        })
      }
    }
  }

  draft.market.shipments = stillInTransit

  // 2) Försenade kontrakt — en engångsövergång 'active' → 'late', inte en
  //    återkommande straffavgift varje tur den förblir försenad.
  for (const contract of draft.market.contracts) {
    if (contract.status !== 'active') continue
    if (draft.meta.turn <= contract.dueTurn) continue

    contract.status = 'late'
    house.reputation.reliability = Math.max(0, house.reputation.reliability - BALANCE.reliabilityLatePenalty)

    emit({
      severity: 'headline',
      scope: 'house',
      headline: `CONTRACT ${contract.id} LATE — ${house.name.toUpperCase()}'S RELIABILITY FALLS`,
      causeId: null,
      delta: { reliability: -BALANCE.reliabilityLatePenalty },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })
  }
}
