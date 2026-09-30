// art/wear.mjs — bläckslitage för gummistämplar och fettkrita, som SVG-masker.
// Masken läggs på ett DOM-element med CSS (mask-image), så att stämpelns TEXT stannar
// i sidan: typsnitten fungerar, skärmläsare läser den, och regel 18-testet kan mäta
// den. Vitt i masken = bläck syns, svart/transparent = bläcket tog inte.
import { createRandom, round } from './core.mjs'

// Ett slitagemönster: små luckor där stämpeln inte tog, några ljusa strimmor och en
// kant som är tunnare på ena sidan (ojämnt tryck). variant ger olika mönster så att
// två stämplar bredvid varandra inte ser identiska ut.
export function makeInkWear(variant, { width = 200, height = 80 } = {}) {
  const rand = createRandom(`wear:${variant}`)
  const holes = []
  const count = 110 + Math.floor(rand() * 40)
  for (let i = 0; i < count; i++) {
    const r = 0.7 + rand() * rand() * 4.2
    holes.push(`<circle cx="${round(rand() * width)}" cy="${round(rand() * height)}" r="${round(r)}" fill="#000"/>`)
  }
  // Kanterna tar sämst: extra små hack längs ramen.
  for (let i = 0; i < 40; i++) {
    const onX = rand() < 0.5
    const cx = onX ? rand() * width : rand() < 0.5 ? rand() * 6 : width - rand() * 6
    const cy = onX ? (rand() < 0.5 ? rand() * 6 : height - rand() * 6) : rand() * height
    holes.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(0.8 + rand() * 2.4)}" fill="#000"/>`)
  }
  const streaks = []
  for (let i = 0; i < 3; i++) {
    const y = round(rand() * height)
    const x = round(rand() * width * 0.6)
    const w = round(width * (0.2 + rand() * 0.35))
    streaks.push(`<rect x="${x}" y="${y}" width="${w}" height="${round(0.6 + rand() * 1.2)}" fill="#000" fill-opacity="${round(0.35 + rand() * 0.4)}"/>`)
  }
  // Ojämnt tryck: en mjuk övertoning från en slumpad sida.
  const side = Math.floor(rand() * 4)
  const [x1, y1, x2, y2] = [
    ['0', '0', '1', '0'],
    ['1', '0', '0', '0'],
    ['0', '0', '0', '1'],
    ['0', '1', '0', '0'],
  ][side]
  const fade = round(0.45 + rand() * 0.2)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">` +
    `<defs><linearGradient id="p" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="${fade}"/><stop offset="0.45" stop-color="#fff"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#p)"/>` +
    holes.join('') +
    streaks.join('') +
    `</svg>\n`
  )
}

export const INK_WEAR_VARIANTS = 6
