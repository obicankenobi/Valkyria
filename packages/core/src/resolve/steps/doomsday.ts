// doomsday — avkylning, heat-eskalering, CRISIS WATCH, krisevent. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Doomsday") och DESIGN.md §6.2.
//
// Alla skrivningar till draft.doomsday går via addDoomsday (doomsdayGate.ts,
// CLAUDE.md hård regel 9) — den här filen anropar aldrig fältet direkt.
//
// Fyra etapp 1-drivare (DESIGN.md §6.2): (1) restricted-leverans och (2) styrsystem
// över blocklinjen är SAMMA generiska mekanism, redan kopplad i P5 (deliveries.ts:
// varje `restricted`-produkt med `doomsdayOnDelivery` anropar addDoomsday). (4)
// heat > heatEscalationThreshold är den här filens eget nya arbete nedan. (3)
// iscensatt incident (STAGE_INCIDENT) går INTE att koppla i P7 — den beror av
// applyActions.ts, som fortfarande är en owordnad no-ops-stub utan någon prompt i
// avsnitt 10 som äger den. Flaggat, inte byggt runt. Se ANDRINGSLOGG.md.
//
// KÄND BEGRÄNSNING: crossing-detekteringen för CRISIS WATCH jämför doomsday vid
// den HÄR stegets start mot doomsday efter avkylning+eskalering — den kan alltså
// missa en korsning som redan skedde tidigare SAMMA tur via deliveries.ts
// (restricted-leverans). CRISIS WATCH har ingen mekanisk konsekvens (bara en
// notis), så detta bedöms vara en acceptabel, dokumenterad kosmetisk lucka —
// inte värt ännu ett persisterat fält. Se ANDRINGSLOGG.md.
//
// Krisevent (doomsday >= 75, DESIGN.md §6.2's tre val PUSH / BACK DOWN / SELL THE
// FILE) kräver ett spelarbeslut som PlayerAction-unionen (fryst sedan P2) inte har
// någon variant för. Löst med en tydligt flaggad automatisk fallback: BACK DOWN
// väljs alltid, med ett wire-headline som ärligt anger att det är en automatisk
// standard i väntan på ett riktigt spelarval. Se ANDRINGSLOGG.md.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { addDoomsday } from '../doomsdayGate.js'
import type { ResolveContext, ResolveStep } from '../index.js'

interface Balance {
  doomsdayDecayPerTurn: number
  heatEscalationThreshold: number
  heatEscalationChancePct: number
  heatEscalationDoomsdayMin: number
  heatEscalationDoomsdayMax: number
  doomsdayCrisisWatchThreshold: number
  doomsdayCrisisEventThreshold: number
  crisisBackDownDoomsdayTarget: number
}
const BALANCE = balanceData as unknown as Balance

export const doomsday: ResolveStep = (ctx) => {
  const { draft } = ctx
  const beforeStep = draft.doomsday

  addDoomsday(ctx, -BALANCE.doomsdayDecayPerTurn, null)

  applyHeatEscalation(ctx)

  checkCrisisWatch(ctx, beforeStep)
  resolveCrisisEvent(ctx)
}

function applyHeatEscalation(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx

  for (const theatre of Object.values(draft.theatres)) {
    if (theatre.heat <= BALANCE.heatEscalationThreshold) continue
    if (!rng.chance(BALANCE.heatEscalationChancePct)) continue

    const amount = rng.int(BALANCE.heatEscalationDoomsdayMin, BALANCE.heatEscalationDoomsdayMax)
    const escalationId = emit({
      severity: 'headline',
      scope: 'global',
      headline: `${theatre.name.toUpperCase()} ESCALATES — HEAT AT ${theatre.heat.toFixed(0)}`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: theatre.id,
    })
    addDoomsday(ctx, amount, escalationId)
  }
}

function checkCrisisWatch(ctx: ResolveContext, beforeStep: number): void {
  const { draft, emit } = ctx
  const threshold = BALANCE.doomsdayCrisisWatchThreshold

  if (beforeStep >= threshold || draft.doomsday < threshold) return // ingen uppåtgående korsning

  emit({
    severity: 'headline',
    scope: 'global',
    headline: `CRISIS WATCH — DOOMSDAY CROSSES ${threshold}`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  })
}

function resolveCrisisEvent(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  if (draft.doomsday < BALANCE.doomsdayCrisisEventThreshold) return

  const eventId = emit({
    severity: 'headline',
    scope: 'global',
    headline: `CRISIS — DOOMSDAY AT ${draft.doomsday.toFixed(0)}`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  })

  // PROVISORISK automatisk fallback — se filens huvudkommentar. Ingen PlayerAction
  // finns för PUSH/SELL THE FILE, så BACK DOWN väljs alltid.
  const target = BALANCE.crisisBackDownDoomsdayTarget
  const delta = target - draft.doomsday
  if (delta < 0) addDoomsday(ctx, delta, eventId)

  draft.house.exposureEvents.push(draft.meta.turn)

  emit({
    severity: 'report',
    scope: 'global',
    headline: 'BACK DOWN (AUTOMATIC — NO PLAYER CHOICE MECHANISM YET, SEE ANDRINGSLOGG.md)',
    causeId: eventId,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  })
}
