// supply — supplyCostIndex, den enda råvarusiffran etapp 1,5 har. Se
// ETAPP1_5_TEKNISK_SPEC.md avsnitt 3.
//
// Placeringen i PIPELINE (mellan heat och doomsday, resolve/index.ts) är en
// spelregel: indexet ska spegla den heat som just uppdaterats i samma passage,
// och vara skrivet innan orders fryser nästa referencePrice. Det är den ENDA
// ändringen av pipelineordningen den här specen tillåter (CLAUDE.md hård regel 7).
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'
import type { Commodity, Faction, FactionId } from '../../types.js'

interface Balance {
  supplyHeatCoupling: number
  supplyIndexMin: number
  supplyIndexMax: number
  supplyIndexMaxStep: number
  commodityIndexWeight: Record<Commodity, number>
  warDemandCommodityCoupling: number
  embargoCommodityTargetBoost: number
}
const BALANCE = balanceData as unknown as Balance

const COMMODITIES: readonly Commodity[] = ['oil', 'steel', 'uranium', 'titanium', 'rare_earths']

// Rapporteras när indexet korsar en av de två här — i endera riktningen (spec 3.3).
const REPORT_THRESHOLDS = [120, 140] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// P50 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.4): den enda formeln som får räkna ut
// supplyCostIndex ur commodities — exporterad och delad med rivals.ts (vars
// sabotage, se den filens kommentar, bumpar EN råvara direkt i stället för
// aggregatet). Utan en delad, omedelbart återanropad formel hade supplyCostIndex
// varit osynkroniserad mot commodities från det ögonblicket sabotaget landar
// tills nästa gång DET HÄR steget kör — skyddsräcke 2 ("supplyCostIndex ... en
// funktion av commodities, inte ett eget fritt skrivet tal") ska hålla HELA
// tiden, inte bara direkt efter att supply-steget kört.
export function deriveSupplyCostIndex(commodities: Record<Commodity, number>, weights: Record<Commodity, number>): number {
  let aggregate = 0
  for (const commodity of COMMODITIES) aggregate += commodities[commodity] * weights[commodity]
  // Samma avrundning som nedan, av samma skäl (flyttalsbrus i en summa av fem
  // viktade termer) — se stegets huvudkommentar.
  return Math.round(clamp(aggregate, BALANCE.supplyIndexMin, BALANCE.supplyIndexMax) * 100) / 100
}

// P50 (avsnitt 4.4): vilka råvaror minst en EMBARGERAD faktion är källa till —
// ett PERSISTENT tryck (varar så länge embargot gör), till skillnad från
// krigsefterfrågan (denna-tur-transient, se nedan) och en rivals sabotage (en
// engångsstöt, rivals.ts). Faction.commoditySources är PROVISORISKT och obesatt
// i indochina-slice.json (ingen PlayerAction kan sätta embargoed:true i den här
// etappen ändå, se factions.ts:s egen kommentar) — samma "byggd och testad,
// strukturellt vilande i dagens scenario"-status som embargots ekonomiska
// effekt redan har.
function embargoedCommodities(factions: Record<FactionId, Faction>): ReadonlySet<Commodity> {
  const result = new Set<Commodity>()
  for (const faction of Object.values(factions)) {
    if (!faction.embargoed || !faction.commoditySources) continue
    for (const commodity of faction.commoditySources) result.add(commodity)
  }
  return result
}

// P48 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.1/4.2): supplyCostIndex är sedan P48
// DERIVERAD, inte längre en egen fritt skriven storhet — Σ commodities[c] ×
// commodityIndexWeight[c]. P50 (avsnitt 4.4) generaliserar målformeln för VARJE
// råvara till tre signaler i stället för bara heat: krigsefterfrågan (denna-tur-
// transient, deliveries.ts) och embargo (persistent, så länge embargot varar) —
// utöver den delade heat-baslinjen alla fem fortfarande rör sig med. En rivals
// sabotage är INTE en fjärde term här: den är en engångsstöt direkt mot
// commodities (rivals.ts, efter det här steget i PIPELINE), inte en del av
// målet det här steget konvergerar mot.
export const supply: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  const theatres = Object.values(draft.theatres)
  const globalHeat = theatres.length > 0 ? theatres.reduce((sum, t) => sum + t.heat, 0) / theatres.length : 0
  const heatTargetTerm = globalHeat * BALANCE.supplyHeatCoupling
  const embargoed = embargoedCommodities(draft.factions)

  const previous = draft.market.supplyCostIndex
  let nextAggregate = 0
  for (const commodity of COMMODITIES) {
    // Krigsefterfrågan (avsnitt 4.4): denna-tur-transient, samma "läs och
    // nollställ i samma steg"-mönster som Theatre.deliveriesIntoActiveWarThisTurn
    // redan har (heat.ts) — annars ackumulerar den för evigt i stället för att
    // spegla EN leverans effekt.
    const warDemand = draft.market.commodityDemandThisTurn[commodity]
    draft.market.commodityDemandThisTurn[commodity] = 0

    const embargoTerm = embargoed.has(commodity) ? BALANCE.embargoCommodityTargetBoost : 0
    const targetIndex = 100 + heatTargetTerm + warDemand * BALANCE.warDemandCommodityCoupling + embargoTerm

    const previousCommodity = draft.market.commodities[commodity]
    const step = clamp(targetIndex - previousCommodity, -BALANCE.supplyIndexMaxStep, BALANCE.supplyIndexMaxStep)
    const nextCommodity = clamp(previousCommodity + step, BALANCE.supplyIndexMin, BALANCE.supplyIndexMax)
    draft.market.commodities[commodity] = nextCommodity
    nextAggregate += nextCommodity * BALANCE.commodityIndexWeight[commodity]
  }
  // Avrundat till två decimaler — fem viktade termer summerade kan annars driva
  // isär med flyttalsbrus i sista decimalerna (t.ex. 106.00000000000001), som
  // multiplicerar in i varje pris computeReferencePrice/computeUnitCostNow
  // räknar. Samma motivering som hashState.ts:s egen avrundning, fast här för
  // att hålla värdet rent i SJÄLVA state, inte bara vid hashning.
  const next = Math.round(clamp(nextAggregate, BALANCE.supplyIndexMin, BALANCE.supplyIndexMax) * 100) / 100

  draft.market.supplyCostIndex = next
  if (next === previous) return

  emit({
    severity: 'ticker',
    scope: 'market',
    headline: `SUPPLY COST INDEX: ${previous.toFixed(0)} → ${next.toFixed(0)}`,
    causeId: null,
    delta: { supplyCostIndex: next - previous },
    actorIsPlayer: false,
    subjectId: null,
  })

  for (const threshold of REPORT_THRESHOLDS) {
    const crossedUp = previous < threshold && next >= threshold
    const crossedDown = previous > threshold && next <= threshold
    if (!crossedUp && !crossedDown) continue

    const direction = crossedUp ? 'RISES TO' : 'FALLS TO'
    const tail = crossedUp ? 'RAW MATERIAL PRESSURE ACROSS THE BLOC' : 'RAW MATERIAL PRESSURE EASES ACROSS THE BLOC'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `SUPPLY COST INDEX ${direction} ${next.toFixed(0)} — ${tail}`,
      causeId: null,
      delta: { supplyCostIndex: next - previous },
      actorIsPlayer: false,
      subjectId: null,
    })
  }
}
