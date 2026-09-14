// supply — supplyCostIndex, den enda råvarusiffran etapp 1,5 har. Se
// ETAPP1_5_TEKNISK_SPEC.md avsnitt 3.
//
// Placeringen i PIPELINE (mellan heat och doomsday, resolve/index.ts) är en
// spelregel: indexet ska spegla den heat som just uppdaterats i samma passage,
// och vara skrivet innan orders fryser nästa referencePrice. Det är den ENDA
// ändringen av pipelineordningen den här specen tillåter (CLAUDE.md hård regel 7).
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'

interface Balance {
  supplyHeatCoupling: number
  supplyIndexMin: number
  supplyIndexMax: number
  supplyIndexMaxStep: number
}
const BALANCE = balanceData as unknown as Balance

// Rapporteras när indexet korsar en av de två här — i endera riktningen (spec 3.3).
const REPORT_THRESHOLDS = [120, 140] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export const supply: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  const theatres = Object.values(draft.theatres)
  const globalHeat = theatres.length > 0 ? theatres.reduce((sum, t) => sum + t.heat, 0) / theatres.length : 0

  const previous = draft.market.supplyCostIndex
  const targetIndex = 100 + globalHeat * BALANCE.supplyHeatCoupling
  const step = clamp(targetIndex - previous, -BALANCE.supplyIndexMaxStep, BALANCE.supplyIndexMaxStep)
  const next = clamp(previous + step, BALANCE.supplyIndexMin, BALANCE.supplyIndexMax)

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
