// Allt penningräknande i packages/core går härigenom (CLAUDE.md hård regel 8).
// Money är "hela £, aldrig decimaler" (types.ts). Ränta, procentfaktorer och delade
// kvantiteter producerar flyttal — round() är den enda platsen avrundningen sker.
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.4.
import type { Money } from './types.js'

export function round(amount: number): Money {
  return Math.round(amount)
}
