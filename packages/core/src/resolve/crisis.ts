// crisis — CRISIS-handlingen (PUSH/BACK_DOWN/SELL_THE_FILE), avsnitt 9.3.
// Utbruten ur applyActions.ts i P23 (ETAPP2_TEKNISK_SPEC.md avsnitt 7) —
// oförändrad logik, bara flyttad. Se ANDRINGSLOGG.md.
//
// Krisen FLAGGAS av doomsday.ts (som sätter draft.pendingCrisis) en tur, och LÖSES
// här, i nästa tur — den ordningen faller ut naturligt ur pipelinens fasta sekvens
// (applyActions kör FÖRST, doomsday.ts SENARE, samma passage) utan någon särskild
// kod för att skjuta upp det en tur. resolvePendingCrisis är den enda funktionen
// som anropas utifrån (från applyActions.ts).
import balanceData from '../data/balance.json' with { type: 'json' }
import { addDoomsday } from './doomsdayGate.js'
import { computeReferencePrice, computeUnitCostNow, getProduct } from '../pricing.js'
import type { ResolveContext } from './index.js'
import type { Contract, Faction, GameState, PlayerAction, TheatreId } from '../types.js'

interface Balance {
  crisisPushExchangePct: number
  crisisPushBackdownTarget: number
  crisisPushContractQuantity: number
  crisisBackDownDoomsdayTarget: number
  crisisSellFileTarget: number
  crisisSellFileRevenue: number
  crisisSellFileStandingPenalty: number
}
const BALANCE = balanceData as unknown as Balance

type PendingCrisis = NonNullable<GameState['pendingCrisis']>

// buyerId (en Faction) hör till en teater genom den front den står på — samma
// logik som pricing.ts:s computeHeatForBuyer, men den funktionen returnerar bara
// heat-talet, inte teatern själv (som STAGE_INCIDENT behöver för att kunna HÖJA
// den). Ingen delad helper fanns för "hitta teatern", så en liten egen håller sig
// här i stället för att bredda pricing.ts:s publika yta för en enda konsument.
//
// Avsnitt 9.3, PUSH: "ett femårskontrakt ... till den teaterns största köpare".
// "Störst" tolkat som högst treasury — RivalHouse/Faction har inget annat mått
// som fångar "störst" (militaryBudget mäter bara köpkraft för NYA ordrar, inte
// nationens storlek). Se ANDRINGSLOGG.md.
function findLargestBuyerInTheatre(draft: GameState, theatreId: TheatreId): Faction | null {
  const theatre = draft.theatres[theatreId]
  if (!theatre) return null
  let best: Faction | null = null
  for (const frontId of theatre.frontIds) {
    const front = draft.fronts[frontId]
    if (!front) continue
    for (const factionId of [front.sideA, front.sideB]) {
      const faction = draft.factions[factionId]
      if (faction && (!best || faction.treasury > best.treasury)) best = faction
    }
  }
  return best
}

// Avsnitt 9.3, PUSH: 30 % kärnvapenutbyte (slut), annars nedtrappning + ett
// femårskontrakt. Produkt (m1_rifle), grade (A) och prissättning (computeReference
// Price, samma formel som en ordinär order) är PROVISORISKA val — specen namnger
// bara "ett femårskontrakt", ingen produkt/grade. m1_rifle valdes för att den är
// den enda produkten VARJE faktion är techLevel-behörig för (techRequired 1),
// oavsett vilken faktion som råkar vara "störst" i teatern. Se ANDRINGSLOGG.md.
function resolvePush(ctx: ResolveContext, pending: PendingCrisis): void {
  const { draft, rng, emit } = ctx

  if (rng.chance(BALANCE.crisisPushExchangePct)) {
    const pushId = emit({
      severity: 'headline',
      scope: 'global',
      headline: 'PUSH — CATASTROPHIC MISCALCULATION',
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
    addDoomsday(ctx, 100 - draft.doomsday, pushId)
    return
  }

  const pushId = emit({
    severity: 'headline',
    scope: 'global',
    headline: 'PUSH — THE OTHER SIDE BLINKS FIRST',
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
  const doomsdayDelta = BALANCE.crisisPushBackdownTarget - draft.doomsday
  if (doomsdayDelta !== 0) addDoomsday(ctx, doomsdayDelta, pushId)

  const buyer = findLargestBuyerInTheatre(draft, pending.theatreId)
  if (!buyer) return // ingen köpare att teckna kontraktet med — ingen i teatern

  const theatre = draft.theatres[pending.theatreId]
  const product = getProduct('m1_rifle')
  const quantity = BALANCE.crisisPushContractQuantity
  const price = computeReferencePrice(product, quantity, theatre ? theatre.heat : 0, draft.market.supplyCostIndex)
  const contract: Contract = {
    id: `contract-crisis-${draft.meta.turn}`,
    buyerId: buyer.id,
    productId: product.id,
    quantity,
    unitsDelivered: 0,
    price,
    unitCostAtSigning: computeUnitCostNow(product, 'A', draft.market.supplyCostIndex),
    grade: 'A',
    dueTurn: draft.meta.turn + 20, // "femårskontrakt" — 20 turer, ett kvartal per tur
    status: 'active',
    lateEventId: null,
    // P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2): krisköpet går inte via en Order —
    // ingen naturlig källa att härleda frontId ur. null, samma fallback
    // (findFrontForBuyer i deliveries.ts) som gällde för alla kontrakt innan P44.
    frontId: null,
  }
  draft.market.contracts.push(contract)
  emit({
    severity: 'headline',
    scope: 'market',
    headline: `A FIVE-YEAR CONTRACT EMERGES FROM THE CHAOS: ${product.name.toUpperCase()} × ${quantity} TO ${buyer.name.toUpperCase()}`,
    causeId: pushId,
    delta: { price },
    actorIsPlayer: true,
    subjectId: buyer.id,
  })
}

// Avsnitt 9.3, BACK_DOWN: nedtrappning, kvartalets restricted-intäkt annullerad,
// en slumpvald AKTIV station bränns.
function resolveBackDown(ctx: ResolveContext, pending: PendingCrisis, wasAutomatic: boolean): void {
  const { draft, rng, emit } = ctx
  const house = draft.house

  const backDownId = emit({
    severity: 'headline',
    scope: 'global',
    headline: wasAutomatic ? 'BACK DOWN (AUTOMATIC — NO CRISIS CHOICE SUBMITTED)' : 'BACK DOWN',
    causeId: null,
    delta: {},
    actorIsPlayer: !wasAutomatic,
    subjectId: null,
  })

  const doomsdayDelta = BALANCE.crisisBackDownDoomsdayTarget - draft.doomsday
  if (doomsdayDelta !== 0) addDoomsday(ctx, doomsdayDelta, backDownId)

  if (pending.restrictedRevenueThisTurn > 0) {
    house.treasury -= pending.restrictedRevenueThisTurn
    house.revenueByTurn[pending.turn] = (house.revenueByTurn[pending.turn] ?? 0) - pending.restrictedRevenueThisTurn
    emit({
      severity: 'report',
      scope: 'house',
      headline: `${house.name.toUpperCase()}'S RESTRICTED REVENUE THIS QUARTER IS CLAWED BACK (−£${pending.restrictedRevenueThisTurn.toLocaleString('en-GB')})`,
      causeId: backDownId,
      delta: { treasury: -pending.restrictedRevenueThisTurn },
      actorIsPlayer: true,
      subjectId: null,
    })
  }

  const activeStations = house.stations.filter((s) => s.status === 'active')
  if (activeStations.length > 0) {
    const burned = rng.pick(activeStations)
    burned.exposure = 100
    burned.status = 'burned'
    house.exposureEvents.push(draft.meta.turn)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `STATION ${burned.city.toUpperCase()} BURNED IN THE FALLOUT`,
      causeId: backDownId,
      delta: { exposure: 0 },
      actorIsPlayer: false,
      subjectId: burned.nation,
    })
  }
}

// Avsnitt 9.3, SELL_THE_FILE: engångsintäkt, permanent skada på anseendet hos
// BÅDA blocken — den första kod som skriver westStanding/eastStanding
// (hittills bara lästa av alignmentPenalty, pricing.ts).
function resolveSellTheFile(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const house = draft.house

  const sellId = emit({
    severity: 'headline',
    scope: 'global',
    headline: 'SELL THE FILE — YOU BURN EVERYTHING YOU KNOW',
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })

  const doomsdayDelta = BALANCE.crisisSellFileTarget - draft.doomsday
  if (doomsdayDelta !== 0) addDoomsday(ctx, doomsdayDelta, sellId)

  house.treasury += BALANCE.crisisSellFileRevenue
  house.revenueByTurn[draft.meta.turn] = (house.revenueByTurn[draft.meta.turn] ?? 0) + BALANCE.crisisSellFileRevenue
  emit({
    severity: 'headline',
    scope: 'house',
    headline: `${house.name.toUpperCase()} SELLS THE FILE (+£${BALANCE.crisisSellFileRevenue.toLocaleString('en-GB')})`,
    causeId: sellId,
    delta: { treasury: BALANCE.crisisSellFileRevenue },
    actorIsPlayer: true,
    subjectId: null,
  })

  const westBefore = house.reputation.westStanding
  const eastBefore = house.reputation.eastStanding
  house.reputation.westStanding = Math.max(0, westBefore - BALANCE.crisisSellFileStandingPenalty)
  house.reputation.eastStanding = Math.max(0, eastBefore - BALANCE.crisisSellFileStandingPenalty)
  emit({
    severity: 'headline',
    scope: 'house',
    headline: `${house.name.toUpperCase()}'S STANDING WITH BOTH BLOCS COLLAPSES`,
    causeId: sellId,
    delta: {
      westStanding: house.reputation.westStanding - westBefore,
      eastStanding: house.reputation.eastStanding - eastBefore,
    },
    actorIsPlayer: true,
    subjectId: null,
  })
}

// Avsnitt 9.3: krisen FLAGGAS av doomsday.ts en tur (sätter draft.pendingCrisis)
// och LÖSES här i nästa tur — se filens huvudkommentar. Kostar ingen actionPoint,
// hanteras alltså separat från handlingstaksloopen i applyActions.ts.
export function resolvePendingCrisis(ctx: ResolveContext): void {
  const { draft, submission } = ctx
  const pending = draft.pendingCrisis
  if (!pending) return

  const crisisAction = submission.actions.find((a): a is Extract<PlayerAction, { type: 'CRISIS' }> => a.type === 'CRISIS')
  const wasAutomatic = !crisisAction
  const choice = crisisAction ? crisisAction.choice : 'BACK_DOWN'

  if (choice === 'PUSH') resolvePush(ctx, pending)
  else if (choice === 'SELL_THE_FILE') resolveSellTheFile(ctx)
  else resolveBackDown(ctx, pending, wasAutomatic)

  draft.pendingCrisis = null
}
