// worksLayout.ts — tomtplanens geometri. En kopia av SLOT_GEOMETRY i scripts/art/works.mjs (P178); test/artFactory.test.ts underkänner om de glider isär.
// Markplanens SVG (public/art/works/ground-8|12.svg) och spritesen delar de här talen, så att ett byggnadskort hamnar exakt på sin fyrkant.
export const SLOT_GEOMETRY = {
  columns: 4,
  width: 76,
  height: 64,
  gapX: 6,
  gapY: 6,
  marginX: 7,
  marginTop: 12,
  plotWidth: 336,
  roadHeight: 46,
} as const

export interface SlotRect {
  x: number
  y: number
  width: number
  height: number
}

export function slotRect(index: number): SlotRect {
  const g = SLOT_GEOMETRY
  return { x: g.marginX + (index % g.columns) * (g.width + g.gapX), y: g.marginTop + Math.floor(index / g.columns) * (g.height + g.gapY), width: g.width, height: g.height }
}

export function groundHeight(slots: number): number {
  const g = SLOT_GEOMETRY
  const rows = Math.ceil(slots / g.columns)
  return g.marginTop + rows * g.height + (rows - 1) * g.gapY + g.roadHeight
}

/** Markplanen som tillgång: åtta platser som standard, tolv efter markköpet. */
export function groundAsset(slots: number): string {
  return `/art/works/ground-${slots > 8 ? 12 : 8}.svg`
}
