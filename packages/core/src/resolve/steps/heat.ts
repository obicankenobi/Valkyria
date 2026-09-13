// heat — heat per teater. Se ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Heat").
//
// deliveredUnitsIntoActiveWar läses (och nollställs) från
// Theatre.deliveriesIntoActiveWarThisTurn, som deliveries.ts fyller på tidigare i
// samma pipelinepassage — se den filens kommentar och types.ts. "Aktiv konflikt"
// tolkas som "en front finns i teatern": etapp 1 har ingen dormant/fred-status för
// en front (fronts.ts P6/factions.ts P7:s "forced peace" är notisen bara, se
// ANDRINGSLOGG.md), så alla leveranser till en front räknas.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'

interface Balance {
  heatPerUnit: number
  heatDecayActive: number
  heatDecayIdle: number
}
const BALANCE = balanceData as unknown as Balance

export const heat: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const theatre of Object.values(draft.theatres)) {
    const deliveredUnitsIntoActiveWar = theatre.deliveriesIntoActiveWarThisTurn
    theatre.deliveriesIntoActiveWarThisTurn = 0 // nollställ — nästa tur börjar om

    const heatFromDeliveries = deliveredUnitsIntoActiveWar * BALANCE.heatPerUnit
    const before = theatre.heat

    if (heatFromDeliveries > 0) {
      // Specens formel klampar bara uppåt ("min(100, …)") — men heat är en Pct
      // (0–100, types.ts), så en nedre klampning läggs till här av samma skäl som
      // house.creditLimit/front.strength redan klampas mot 0 på andra ställen:
      // typens egna kontrakt, inte en balanssiffra att flagga.
      theatre.heat = Math.max(0, Math.min(100, theatre.heat + heatFromDeliveries - BALANCE.heatDecayActive))
    } else {
      theatre.heat = Math.max(0, theatre.heat - BALANCE.heatDecayIdle)
    }

    if (theatre.heat === before) continue

    emit({
      severity: 'ticker',
      scope: 'market',
      headline: `${theatre.name.toUpperCase()} HEAT: ${before.toFixed(0)} → ${theatre.heat.toFixed(0)}`,
      causeId: null,
      delta: { heat: theatre.heat - before },
      actorIsPlayer: false,
      subjectId: theatre.id,
    })
  }
}
