// allocateByWeight — delar ut `units` proportionellt mot `weights`, med
// restposter tilldelade störst bråkdel först (deterministiskt, ingen RNG —
// CLAUDE.md hård regel 2, tie-break på lägst index). Summan av returvärdet är
// ALLTID exakt `units` (så länge summan av weights > 0) — både deliveries.ts
// (P38, doktrinvikter) och attrition.ts (P39, förbandens nuvarande innehav)
// behöver den garantin för att hålla invarianten i
// ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1 EXAKT, inte bara
// "ungefär".
export function allocateByWeight(weights: number[], units: number): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0)
  if (weightSum <= 0 || units <= 0) return weights.map(() => 0)

  const raw = weights.map((w) => (w / weightSum) * units)
  const allocated = raw.map(Math.floor)
  let remainder = units - allocated.reduce((sum, v) => sum + v, 0)

  const byRemainingFraction = raw
    .map((v, i) => ({ i, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)

  for (let k = 0; k < byRemainingFraction.length && remainder > 0; k++) {
    allocated[byRemainingFraction[k]!.i]!++
    remainder--
  }

  return allocated
}
