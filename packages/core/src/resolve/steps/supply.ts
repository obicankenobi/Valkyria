// supply — supplyCostIndex, den enda råvarusiffran etapp 1,5 har. Se
// ETAPP1_5_TEKNISK_SPEC.md avsnitt 3.
//
// Placeringen i PIPELINE (mellan heat och doomsday, resolve/index.ts) är en
// spelregel: indexet ska spegla den heat som just uppdaterats i samma passage,
// och vara skrivet innan orders fryser nästa referencePrice. Det är den ENDA
// ändringen av pipelineordningen den här specen tillåter (CLAUDE.md hård regel 7).
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'
import type { Commodity } from '../../types.js'

interface Balance {
  supplyHeatCoupling: number
  supplyIndexMin: number
  supplyIndexMax: number
  supplyIndexMaxStep: number
  commodityIndexWeight: Record<Commodity, number>
}
const BALANCE = balanceData as unknown as Balance

const COMMODITIES: readonly Commodity[] = ['oil', 'steel', 'uranium', 'titanium', 'rare_earths']

// Rapporteras när indexet korsar en av de två här — i endera riktningen (spec 3.3).
const REPORT_THRESHOLDS = [120, 140] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// P48 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.1/4.2): supplyCostIndex är sedan P48
// DERIVERAD, inte längre en egen fritt skriven storhet — Σ commodities[c] ×
// commodityIndexWeight[c]. "Dagens heat-koppling flyttas bara ner en nivå"
// (avsnitt 8, P48:s eget mandat, ordagrant): samma mål/steg-formel som innan
// P48 styrde supplyCostIndex direkt styr nu VARJE råvara var för sig, likadant
// — inga nya prisdrivare än (P50). Så länge alla fem rör sig identiskt blir
// den viktade summan bit-för-bit densamma som den gamla ensamma formeln gav
// (vikterna summerar till 1, se balance.json:s _p48_note).
export const supply: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  const theatres = Object.values(draft.theatres)
  const globalHeat = theatres.length > 0 ? theatres.reduce((sum, t) => sum + t.heat, 0) / theatres.length : 0
  const targetIndex = 100 + globalHeat * BALANCE.supplyHeatCoupling

  const previous = draft.market.supplyCostIndex
  let nextAggregate = 0
  for (const commodity of COMMODITIES) {
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
