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
// Fram till P25 gick bara SPELARENS egna leveranser (Contract/Shipment) genom den
// här kedjan — när en rival vann en order skapades inget Contract (spec 4.4), så
// rivalmateriel kunde inte spåras till en front. P25 (ETAPP2_TEKNISK_SPEC.md
// avsnitt 2.3) lägger till en EGEN, parallell rivalkedja längst ned i den här
// funktionen — RivalContract, inte Contract/Shipment (rivaler har ingen egen
// produktionslinje/kapacitet att modellera i den här etappen, bara ett flatt
// rivalDeliveryUnitsPerTurn rakt mot kontraktet, se avsnitt 2.3 punkt 2). Se
// avsnitt 2.3:s egen motivering för VARFÖR den kedjan bor här och inte i
// rivals.ts: PIPELINE kör rivals EFTER deliveries/fronts/heat, så en leverans
// byggd i rivals.ts hade alltid varit en tur för sen för att heat.ts skulle
// hinna se den (heat.ts läser och nollställer Theatre.deliveriesIntoActiveWar-
// ThisTurn i samma passage, innan rivals.ts någonsin körs).
import balanceData from '../../data/balance.json' with { type: 'json' }
import { round } from '../../money.js'
import { getProduct, resolveBom } from '../../pricing.js'
import { addDoomsday } from '../doomsdayGate.js'
import { allocateByWeight } from '../allocateByWeight.js'
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Commodity, Doctrine, Front, GameState, Grade, Product, TechCategory } from '../../types.js'

interface Balance {
  reliabilityLatePenalty: number
  reliabilityOnTimeBonus: number
  gradeScandalChance: Record<Grade, number>
  qualityScandalPenalty: number
  qualityScandalTurns: number
  rivalDeliveryUnitsPerTurn: number
  reliabilityLateEscalationPerTurn: number
  contractGracePeriodTurns: number
  voidedContractRelationPenalty: number
  doctrineProfile: Record<Doctrine, Partial<Record<TechCategory, number>>>
  // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.1).
  relationsDeliveryDecay: number
  relationsNeutralStart: number
}
const BALANCE = balanceData as unknown as Balance

// P59 (avsnitt 4.1): "relationen faller av leveranser till motståndaren" — en
// liten, symmetrisk sänkning varje gång materiel når en front, oavsett vem
// som levererade den (spelaren eller en rival, se filens huvudkommentar om
// den parallella rivalkedjan) eller frontens nuvarande status (redan
// levererat materiel skärper misstron oavsett stridsläge just den turen).
function applyDeliveryRelationsDecay(factions: GameState['factions'], front: Front, emit: ResolveContext['emit']): void {
  const factionA = factions[front.sideA]
  const factionB = factions[front.sideB]
  if (!factionA || !factionB) return

  const beforeA = factionA.relations[front.sideB] ?? BALANCE.relationsNeutralStart
  const beforeB = factionB.relations[front.sideA] ?? BALANCE.relationsNeutralStart
  const afterA = Math.max(0, beforeA - BALANCE.relationsDeliveryDecay)
  const afterB = Math.max(0, beforeB - BALANCE.relationsDeliveryDecay)
  factionA.relations[front.sideB] = afterA
  factionB.relations[front.sideA] = afterB
  if (afterA === beforeA) return // redan botten, ingen ändring att rapportera

  emit({
    severity: 'ticker',
    scope: 'front',
    headline: `${factionA.name.toUpperCase()}–${factionB.name.toUpperCase()} RELATIONS STRAIN AS ARMS FLOW TO THE ${front.id.toUpperCase()} FRONT`,
    causeId: null,
    delta: { [`relations.${front.sideB}`]: afterA - beforeA },
    actorIsPlayer: false,
    subjectId: front.id,
  })
}

// P38 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1/5.2): en ankommen
// leverans delas ut över SIDANS förband enligt doktrinernas vikter — front.equipment
// självt rörs inte här, det ökas separat (samma anropsplats, precis intill) precis
// som innan P38. Håller invarianten i 5.1 genom konstruktion: samma `units` läggs
// till på båda ställena, varje tur, aldrig i olika steg.
//
// Nödvändigt tillägg (se ANDRINGSLOGG.md): doctrineProfile (avsnitt 5.2) ger ingen
// doktrin någon vikt alls för aviation/naval — utan en reserv bryts invarianten så
// fort en sådan leverans anländer (ingen förband skulle ta emot något, men
// front.equipment[side][cat] hade ändå ökat). Faller då tillbaka till en
// strength-proportionell fördelning i stället.
//
// P39 (se ANDRINGSLOGG.md): fördelningsaritmetiken (störst bråkdel, deterministisk)
// bröts ut till allocateByWeight.ts, delad med attrition.ts:s motsvarande minskning
// — samma garanti (summan blir exakt `units`) behövs på båda ställena, inte bara
// här.
function distributeUnitsToFormations(front: Front, side: 'a' | 'b', category: TechCategory, units: number): void {
  if (units <= 0) return
  const sideFormations = front.formations.filter((f) => f.side === side)
  if (sideFormations.length === 0) return

  const doctrineWeights = sideFormations.map((f) => BALANCE.doctrineProfile[f.doctrine][category] ?? 0)
  const totalDoctrineWeight = doctrineWeights.reduce((sum, w) => sum + w, 0)
  const weights = totalDoctrineWeight > 0 ? doctrineWeights : sideFormations.map((f) => f.strength)
  if (weights.reduce((sum, w) => sum + w, 0) <= 0) return // inget förband kan ta emot — front.equipment ökar ändå, invarianten håller (0 på den här sidan)

  const allocated = allocateByWeight(weights, units)
  sideFormations.forEach((formation, i) => {
    formation.equipment[category] += allocated[i]!
  })
}

// House (till skillnad från RivalHouse) har inget eget id-fält — det finns bara ett
// hus, spelarens eget. attribution (Front.attribution: "houseId | rivalId → ...")
// behöver ändå en stabil nyckel för det huset. Reserverad konstant, inte husets
// (spelarredigerbara) namn.
export const PLAYER_ATTRIBUTION_KEY = 'player'

// P50 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.4): "krigsefterfrågan" — en leverans in
// på en aktiv front höjer priset på de råvaror MATERIELEN BÄR, inte alla fem
// lika (till skillnad från heat). resolveBom (pricing.ts) ger samma fallback-
// regel computeUnitCostNow redan använder — units × varje råvaras andel av
// bom:en ackumuleras i market.commodityDemandThisTurn, läst och nollställd av
// supply.ts (samma "denna-tur-transient"-mönster som Theatre.deliveriesIntoActiveWarThisTurn).
function accumulateWarDemand(market: GameState['market'], product: Product, units: number): void {
  const bom = resolveBom(product)
  for (const [commodity, share] of Object.entries(bom) as [Commodity, number][]) {
    market.commodityDemandThisTurn[commodity] += units * share
  }
}

function findFrontForBuyer(fronts: GameState['fronts'], buyerId: string): { front: Front; side: 'a' | 'b' } | null {
  for (const front of Object.values(fronts)) {
    if (front.sideA === buyerId) return { front, side: 'a' }
    if (front.sideB === buyerId) return { front, side: 'b' }
  }
  return null
}

// P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): spelarens EGNA kontrakt vet numera
// (oftast) exakt vilken front leveransen gäller — Contract.frontId, ärvt från
// Order.frontId vid signering (bidding.ts). findFrontForBuyer används bara som
// FALLBACK, kvar oförändrad (och fortsatt hela vägen för rivalernas leveranser,
// som aldrig fick ett eget frontId — se avsnitt 3.2:s tabell, bara Order/Contract
// nämns). Utan fallbacken hade ett kontrakt utan frontId (SCRIPTED, eller ett
// krisköp via crisis.ts) aldrig levererat materiel någonstans.
function resolveDeliveryFront(fronts: GameState['fronts'], buyerId: string, frontId: string | null): { front: Front; side: 'a' | 'b' } | null {
  if (frontId !== null) {
    const front = fronts[frontId]
    if (front) {
      if (front.sideA === buyerId) return { front, side: 'a' }
      if (front.sideB === buyerId) return { front, side: 'b' }
    }
  }
  return findFrontForBuyer(fronts, buyerId)
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

  // Nollställs varje tur, precis som Theatre.deliveriesIntoActiveWarThisTurn —
  // doomsday.ts (senare i samma passage) läser av och kopierar in i pendingCrisis
  // om en kris utlöses den här turen (avsnitt 9.3, BACK_DOWN).
  draft.market.restrictedRevenueThisTurn = 0

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
    if (product.restricted) draft.market.restrictedRevenueThisTurn += revenue

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
    const frontMatch = resolveDeliveryFront(draft.fronts, contract.buyerId, contract.frontId)
    if (frontMatch) {
      const { front, side } = frontMatch
      front.equipment[side][product.category] += shipment.units
      distributeUnitsToFormations(front, side, product.category, shipment.units)
      front.attribution[PLAYER_ATTRIBUTION_KEY] = (front.attribution[PLAYER_ATTRIBUTION_KEY] ?? 0) + shipment.units

      // P7-tillägg: heatFromDeliveries (spec 5, "Heat") behöver "denna turs
      // leveranser in i aktiv konflikt" — en transient räknare på Theatre som
      // heat.ts läser och nollställer i samma steg. Se types.ts och ANDRINGSLOGG.md.
      const theatre = draft.theatres[front.theatreId]
      if (theatre) theatre.deliveriesIntoActiveWarThisTurn += shipment.units
      accumulateWarDemand(draft.market, product, shipment.units)
      applyDeliveryRelationsDecay(draft.factions, front, emit)

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

  // 2) Försenade kontrakt. Engångsövergång 'active' → 'late' (oförändrad sedan
  //    P7), plus (P27, avsnitt 3.1) ett NYTT, eskalerande straff varje tur
  //    kontraktet FÖRBLIR 'late', och 'voided' om det passerar sin nådaperiod
  //    (contractGracePeriodTurns) utan att bli klart — "spelaren får
  //    övertrassera medvetet, och betala för det" (spec 3.1), en betalning som
  //    saknades fram till nu.
  for (const contract of draft.market.contracts) {
    if (contract.status === 'active' && draft.meta.turn > contract.dueTurn) {
      contract.status = 'late'
      house.reputation.reliability = Math.max(0, house.reputation.reliability - BALANCE.reliabilityLatePenalty)

      contract.lateEventId = emit({
        severity: 'headline',
        scope: 'house',
        headline: `CONTRACT ${contract.id} LATE — ${house.name.toUpperCase()}'S RELIABILITY FALLS`,
        causeId: null,
        delta: { reliability: -BALANCE.reliabilityLatePenalty },
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
    }

    if (contract.status !== 'late') continue

    if (draft.meta.turn > contract.dueTurn + BALANCE.contractGracePeriodTurns) {
      contract.status = 'voided'
      const buyer = draft.factions[contract.buyerId]
      if (buyer) buyer.relationToPlayer = Math.max(0, buyer.relationToPlayer - BALANCE.voidedContractRelationPenalty)

      emit({
        severity: 'headline',
        scope: 'market',
        headline: `CONTRACT ${contract.id} VOIDED — TOO LATE TO SALVAGE, NO FURTHER PAYMENT`,
        causeId: contract.lateEventId,
        delta: buyer ? { relationToPlayer: -BALANCE.voidedContractRelationPenalty } : {},
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
      continue
    }

    house.reputation.reliability = Math.max(0, house.reputation.reliability - BALANCE.reliabilityLateEscalationPerTurn)
    emit({
      severity: 'report',
      scope: 'house',
      headline: `CONTRACT ${contract.id} STILL LATE — ${house.name.toUpperCase()}'S RELIABILITY KEEPS FALLING`,
      causeId: contract.lateEventId,
      delta: { reliability: -BALANCE.reliabilityLateEscalationPerTurn },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })
  }

  // 3) Rivalernas EGEN leverans-/attributionskedja (P25, avsnitt 2.3) — vid sidan
  // av spelarens ovan, aldrig sammanflätad med den: RivalContract, inte
  // Contract/Shipment.
  for (const rival of Object.values(draft.rivals)) {
    // Avsnitt 2.5: en saboterad rival "levererar inte" — bara SJÄLVA leveransen
    // hoppas över, inte försenings-övergången nedan (sabotage ska inte skydda
    // mot att bli 'late' på ett kontrakt de ändå missar).
    const sabotaged = rival.sabotagedUntilTurn !== null && draft.meta.turn < rival.sabotagedUntilTurn

    if (!sabotaged) {
      for (const contract of rival.contracts) {
        if (contract.status !== 'active' && contract.status !== 'late') continue

        const remaining = contract.quantity - contract.unitsDelivered
        if (remaining <= 0) continue

        const delivered = Math.min(BALANCE.rivalDeliveryUnitsPerTurn, remaining)
        contract.unitsDelivered += delivered
        const product = getProduct(contract.productId)
        const buyer = draft.factions[contract.buyerId]
        const buyerName = buyer ? buyer.name.toUpperCase() : contract.buyerId.toUpperCase()

        const deliveryId = emit({
          severity: 'ticker',
          scope: 'market',
          headline: `${rival.name.toUpperCase()} DELIVERS ${delivered}× ${product.name.toUpperCase()} TO ${buyerName}`,
          causeId: null,
          delta: { unitsDelivered: delivered },
          actorIsPlayer: false,
          subjectId: contract.buyerId,
        })

        // Attribution + teaterns leveransräknare i SAMMA steg, SAMMA tur — innan
        // heat.ts (senare i samma pipeline-passage) läser och nollställer den. Det
        // här är avsnitt 2.3:s hela poäng (punkt 3): fronten och heat rör sig utan
        // att spelaren gjort något.
        const frontMatch = findFrontForBuyer(draft.fronts, contract.buyerId)
        if (frontMatch) {
          const { front, side } = frontMatch
          front.equipment[side][product.category] += delivered
          distributeUnitsToFormations(front, side, product.category, delivered)
          front.attribution[rival.id] = (front.attribution[rival.id] ?? 0) + delivered

          const theatre = draft.theatres[front.theatreId]
          if (theatre) theatre.deliveriesIntoActiveWarThisTurn += delivered
          accumulateWarDemand(draft.market, product, delivered)
          applyDeliveryRelationsDecay(draft.factions, front, emit)

          emit({
            severity: 'ticker',
            scope: 'front',
            headline: `${delivered}× ${product.name.toUpperCase()} REACHES THE ${front.id.toUpperCase()} FRONT (${rival.name.toUpperCase()})`,
            causeId: deliveryId,
            delta: { [`equipment.${side}.${product.category}`]: delivered },
            actorIsPlayer: false,
            subjectId: front.id,
          })
        }

        if (contract.unitsDelivered >= contract.quantity) {
          contract.status = 'fulfilled'
          emit({
            severity: 'report',
            scope: 'market',
            headline: `RIVAL CONTRACT ${contract.id} FULFILLED: ${product.name.toUpperCase()} TO ${buyerName} (${rival.name.toUpperCase()})`,
            causeId: deliveryId,
            delta: {},
            actorIsPlayer: false,
            subjectId: contract.buyerId,
          })
        }
      }
    }

    // Försenade rivalkontrakt — samma engångsövergång 'active' → 'late' som
    // spelarens egen (steg 2 ovan), samma reliabilityLatePenalty. P27 (avsnitt
    // 3.1): samma eskalering och 'voided' som spelarens Contract, TILLÄMPAD PÅ
    // en RivalContract — annars uppstår en ny asymmetri i stället för den
    // etappen just ska ta bort (avsnitt 2.1/3.1:s egen motivering). Skillnaden
    // mot spelarens gren: relationsstraffet drar rival.relations[buyerId], inte
    // en Faction.relationToPlayer (avsnitt 2.1: "en rivals annullerade kontrakt
    // drar relations[buyerId] med samma tal").
    for (const contract of rival.contracts) {
      if (contract.status === 'active' && draft.meta.turn > contract.dueTurn) {
        contract.status = 'late'
        rival.reputation.reliability = Math.max(0, rival.reputation.reliability - BALANCE.reliabilityLatePenalty)

        contract.lateEventId = emit({
          severity: 'report',
          scope: 'market',
          headline: `RIVAL CONTRACT ${contract.id} LATE — ${rival.name.toUpperCase()}'S RELIABILITY FALLS`,
          causeId: null,
          delta: { reliability: -BALANCE.reliabilityLatePenalty },
          actorIsPlayer: false,
          subjectId: contract.buyerId,
        })
      }

      if (contract.status !== 'late') continue

      if (draft.meta.turn > contract.dueTurn + BALANCE.contractGracePeriodTurns) {
        contract.status = 'voided'
        const before = rival.relations[contract.buyerId] ?? 0
        const after = Math.max(0, before - BALANCE.voidedContractRelationPenalty)
        rival.relations[contract.buyerId] = after

        emit({
          severity: 'headline',
          scope: 'market',
          headline: `RIVAL CONTRACT ${contract.id} VOIDED — TOO LATE TO SALVAGE (${rival.name.toUpperCase()})`,
          causeId: contract.lateEventId,
          delta: { [`relations.${contract.buyerId}`]: after - before },
          actorIsPlayer: false,
          subjectId: contract.buyerId,
        })
        continue
      }

      rival.reputation.reliability = Math.max(0, rival.reputation.reliability - BALANCE.reliabilityLateEscalationPerTurn)
      emit({
        severity: 'report',
        scope: 'market',
        headline: `RIVAL CONTRACT ${contract.id} STILL LATE — ${rival.name.toUpperCase()}'S RELIABILITY KEEPS FALLING`,
        causeId: contract.lateEventId,
        delta: { reliability: -BALANCE.reliabilityLateEscalationPerTurn },
        actorIsPlayer: false,
        subjectId: contract.buyerId,
      })
    }
  }
}
