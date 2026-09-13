// doomsdayGate — enda vägen in i DOOMSDAY (CLAUDE.md hård regel 9). Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 5 ("Doomsday").
//
// Byggs i P5, inte P7 som min egen preliminära notis i P0-skelettet gissade — den
// gissningen var min egen, inte specens. Ingen prompt i avsnitt 10 äger uttryckligen
// den här filen, men P5:s instruktionstext säger uttryckligen "restricted-leverans
// anropar doomsdayGate", så den minimala porten (klampa, uppdatera doomsdayPeak,
// emitta) byggs här. resolve/steps/doomsday.ts — avkylning, trösklar 60/75/95,
// krisevent — är fortfarande P7:s jobb och rör ingenting den här filen inte redan
// gör.
import type { ResolveContext } from './index.js'

const HEADLINE_THRESHOLD = 10

export function addDoomsday(ctx: ResolveContext, amount: number, causeId: string | null): void {
  const { draft, emit } = ctx
  const before = draft.doomsday
  draft.doomsday = Math.max(0, Math.min(100, draft.doomsday + amount))
  draft.doomsdayPeak = Math.max(draft.doomsdayPeak, draft.doomsday)

  if (draft.doomsday === before) return // klampat till samma värde — ingen faktisk förändring

  emit({
    severity: Math.abs(amount) >= HEADLINE_THRESHOLD ? 'headline' : 'report',
    scope: 'global',
    headline: `DOOMSDAY ${amount >= 0 ? '+' : ''}${draft.doomsday - before} → ${draft.doomsday}`,
    causeId,
    delta: { doomsday: draft.doomsday - before },
    actorIsPlayer: false,
    subjectId: null,
  })
}
