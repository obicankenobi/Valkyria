// stampWear — välj en slitagemask (public/art/wear/ink-wear-N.svg, tillgångsfabriken) per stämpel.
//
// art-director-skillen: "Pick the variant by a stable hash of the stamp's id, never randomly at render
// time." En stämpel ska alltså se likadan ut varje gång den ritas (och på varje enhet), men två olika
// stämplar ska inte alltid dela slitage. FNV-1a (32 bit) över id-strängens UTF-16-koder — ren, snabb och
// utan Math.random/Date (samma determinism som resten av spelet).
//
// WEAR_VARIANTS måste vara samma tal som fabriken genererar (scripts/art/wear.mjs:s INK_WEAR_VARIANTS);
// test/stampWear.test.ts underkänner om de skiljer sig eller om en fil saknas.
export const WEAR_VARIANTS = 6

export function wearVariant(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash % WEAR_VARIANTS) + 1
}

// Klassen CSS:en (styrelsen .wear-1 … .wear-6 i styles.css) binder masken till.
export function wearClass(id: string): string {
  return `wear-${wearVariant(id)}`
}
