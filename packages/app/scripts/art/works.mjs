// art/works.mjs — tomtplanen för THE COMPANY (ETAPP11_FORSLAG.md §8 punkt 1, P178): en ritad situationsplan över hemmatomten i 1965 års stil.
// Byggnader sedda uppifrån, spår, grind, stakade hörn på tomma platser. Fabriken ritar markplanen och ETT sprite per anläggningsslag; lamporna
// (går / står / bygger), namn och nivå ritas av appen som riktig text och form ovanpå — ingen text i konsten. Färgerna läses ur styles.css.
//
// Geometrin (SLOT_GEOMETRY) är delad: markplanens fyrkanter och appens placering av spritesen utgår från samma tal; appen har en kopia i
// src/worksLayout.ts och test/artFactory.test.ts underkänner om de glider isär.
import { createRandom, readPalette } from './core.mjs'
import { shapeToSvg } from './icons.mjs'

export const WORKS_KINDS = ['assembly', 'component', 'laboratory', 'design', 'proving', 'depot', 'civil']

export const SLOT_GEOMETRY = { columns: 4, width: 76, height: 64, gapX: 6, gapY: 6, marginX: 7, marginTop: 12, plotWidth: 336, roadHeight: 46 }

export function slotRect(index) {
  const g = SLOT_GEOMETRY
  const col = index % g.columns
  const row = Math.floor(index / g.columns)
  return { x: g.marginX + col * (g.width + g.gapX), y: g.marginTop + row * (g.height + g.gapY), width: g.width, height: g.height }
}

export function groundHeight(slots) {
  const g = SLOT_GEOMETRY
  const rows = Math.ceil(slots / g.columns)
  return g.marginTop + rows * g.height + (rows - 1) * g.gapY + g.roadHeight
}

const stroke = (shapes, rand, rough) => shapes.map((s) => shapeToSvg(s, rand, rough)).join('')
const fillPoly = (pts, color, opacity = 1) => `<path d="M${pts.map((p) => p.join(' ')).join('L')}Z" fill="${color}" fill-opacity="${opacity}" stroke="none"/>`
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

// Taktäckning: tunna parallella linjer, som en ritares skrafferingar.
function hatch(x, y, w, h, step, slant = 0) {
  const out = []
  for (let yy = y + step; yy < y + h; yy += step) out.push(['line', x + 1, yy, x + w - 1, yy + slant])
  return out
}

// Sprites i en 76×64-ruta. Varje slag har en egen siluett: sågtaksverket, verkstaden med travar, kupolen och masten, ritsalen med takljus, provbanan,
// lagret med lastbryggor och fabriken med skorsten. Byggnaden står i markplanens papper (--panel) med --ink-linjer; skuggan ligger nedåt höger.
const SPRITES = {
  assembly: () => {
    const fills = [fillPoly(rectPts(6, 18, 62, 36), 'PANEL'), fillPoly([[69, 20], [73, 24], [73, 58], [69, 54]], 'INK', 0.18), fillPoly([[10, 55], [73, 58], [69, 54], [6, 54]], 'INK', 0.14)]
    const lines = [['rect', 6, 18, 62, 36], ['line', 6, 24, 68, 24]]
    // sågtak: sex ryggar
    for (let i = 0; i < 6; i++) lines.push(['poly', [[6 + i * 10.3, 40], [6 + i * 10.3, 27], [6 + i * 10.3 + 10.3, 40]], false])
    lines.push(['line', 6, 40, 68, 40], ['line', 6, 47, 68, 47], ['line', 12, 18, 12, 54], ['line', 62, 18, 62, 54])
    lines.push(['circle', 14, 10, 3.2], ['circle', 24, 10, 3.2], ['line', 11, 13, 11, 18], ['line', 17, 13, 17, 18], ['line', 21, 13, 21, 18], ['line', 27, 13, 27, 18])
    lines.push(['rect', 28, 54, 12, 5])
    return { fills, lines }
  },
  component: () => {
    const fills = [fillPoly(rectPts(10, 20, 40, 32), 'PANEL'), fillPoly([[51, 22], [55, 26], [55, 56], [51, 52]], 'INK', 0.18)]
    const lines = [['rect', 10, 20, 40, 32], ['line', 30, 20, 30, 52], ['line', 10, 29, 50, 29], ['line', 14, 40, 26, 40], ['line', 34, 40, 46, 40]]
    lines.push(['rect', 58, 24, 8, 8], ['rect', 58, 36, 8, 8], ['rect', 58, 48, 8, 8], ['line', 50, 36, 58, 36], ['circle', 20, 46, 2.4], ['circle', 40, 46, 2.4])
    return { fills, lines }
  },
  laboratory: () => {
    const fills = [fillPoly([[8, 22], [44, 22], [44, 40], [30, 40], [30, 54], [8, 54]], 'PANEL'), fillPoly([[46, 30], [50, 34], [50, 48], [46, 44]], 'INK', 0.16)]
    const lines = [['poly', [[8, 22], [44, 22], [44, 40], [30, 40], [30, 54], [8, 54]], true]]
    lines.push(['circle', 56, 38, 11], ['circle', 56, 38, 7], ['line', 56, 27, 56, 49], ['line', 45, 38, 67, 38], ['circle', 56, 38, 1.8])
    for (let i = 0; i < 3; i++) lines.push(['rect', 12 + i * 9, 27, 5, 4], ['rect', 12 + i * 9, 44, 5, 4])
    lines.push(['line', 22, 22, 22, 10], ['line', 18, 14, 26, 14], ['line', 19, 11, 25, 11], ['circle', 22, 9, 1.6])
    return { fills, lines }
  },
  design: () => {
    const fills = [fillPoly(rectPts(6, 20, 64, 34), 'PANEL'), fillPoly([[71, 22], [74, 25], [74, 56], [71, 53]], 'INK', 0.16)]
    const lines = [['rect', 6, 20, 64, 34], ['line', 6, 28, 70, 28]]
    // takljus i rad
    for (let i = 0; i < 4; i++) lines.push(['rect', 11 + i * 15, 31, 11, 6], ['line', 11 + i * 15, 34, 22 + i * 15, 34])
    // ritbord
    for (let i = 0; i < 4; i++) lines.push(['poly', [[11 + i * 15, 48], [22 + i * 15, 48], [20 + i * 15, 42], [13 + i * 15, 42]], true])
    lines.push(['line', 36, 20, 36, 14], ['rect', 30, 10, 12, 4])
    return { fills, lines }
  },
  proving: () => {
    const fills = [fillPoly(rectPts(4, 6, 68, 54), 'INK', 0.07)]
    const lines = [['ellipse', 36, 33, 29, 19], ['ellipse', 36, 33, 21, 12]]
    lines.push(['rect', 28, 28, 16, 10], ['line', 28, 33, 44, 33], ['line', 36, 28, 36, 38])
    lines.push(['line', 6, 56, 14, 56], ['line', 10, 52, 10, 56], ['line', 66, 10, 70, 10], ['circle', 68, 10, 2.6])
    lines.push(['poly', [[8, 12], [14, 12], [11, 17]], true], ['poly', [[60, 52], [66, 52], [63, 57]], true])
    for (let i = 0; i < 7; i++) lines.push(['line', 11 + i * 9, 59, 13 + i * 9, 56])
    return { fills, lines }
  },
  depot: () => {
    const fills = [fillPoly(rectPts(5, 14, 62, 34), 'PANEL'), fillPoly([[68, 16], [72, 20], [72, 52], [68, 48]], 'INK', 0.18)]
    const lines = [['rect', 5, 14, 62, 34], ['line', 5, 31, 67, 31], ['line', 5, 22, 67, 22], ['line', 5, 40, 67, 40]]
    for (let i = 0; i < 6; i++) lines.push(['rect', 9 + i * 10, 48, 7, 7])
    lines.push(['rect', 14, 56, 8, 5], ['rect', 24, 56, 8, 5], ['rect', 19, 51, 8, 5])
    return { fills, lines }
  },
  civil: () => {
    const fills = [fillPoly(rectPts(5, 22, 46, 30), 'PANEL'), fillPoly(rectPts(52, 30, 18, 22), 'PANEL'), fillPoly([[71, 32], [74, 35], [74, 55], [71, 52]], 'INK', 0.16)]
    const lines = [['rect', 5, 22, 46, 30], ['rect', 52, 30, 18, 22], ['line', 5, 37, 51, 37], ['line', 5, 29, 51, 29]]
    for (let i = 0; i < 5; i++) lines.push(['rect', 9 + i * 8.5, 41, 5, 6])
    lines.push(['rect', 10, 8, 6, 14], ['line', 10, 12, 16, 12], ['rect', 58, 36, 6, 6], ['circle', 61, 20, 6], ['line', 61, 26, 61, 30])
    lines.push(['line', 6, 58, 70, 58], ['line', 12, 58, 12, 61], ['line', 24, 58, 24, 61], ['line', 36, 58, 36, 61], ['line', 48, 58, 48, 61], ['line', 60, 58, 60, 61])
    return { fills, lines }
  },
}

function svgOpen(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-hidden="true">`
}

export function makeBuilding(kind, palette = readPalette()) {
  const sprite = SPRITES[kind]
  if (!sprite) throw new Error(`ingen byggnad för ${kind}`)
  const rand = createRandom(`works:building:${kind}`)
  const { fills, lines } = sprite()
  const colour = (s) => s.replaceAll('PANEL', palette['panel']).replaceAll('INK', palette['ink'])
  return (
    svgOpen(76, 64) +
    fills.map(colour).join('') +
    `<g fill="none" stroke="${palette['ink']}" stroke-width="1.1" stroke-linecap="square" stroke-linejoin="miter">${stroke(lines, rand, 0.4)}</g>` +
    `</svg>\n`
  )
}

// En tom, stakad plats: fyra hörnpålar med snöre och en prick i mitten (där grinden vänder sig om).
export function makeEmptyPlot(palette = readPalette()) {
  const rand = createRandom('works:empty')
  const lines = []
  const corners = [[8, 8], [68, 8], [68, 56], [8, 56]]
  for (const [x, y] of corners) lines.push(['rect', x - 2, y - 2, 4, 4], ['line', x - 1, y - 6, x - 1, y - 2])
  const pts = [[8, 8], [68, 8], [68, 56], [8, 56]]
  const string = []
  for (let i = 0; i < 4; i++) string.push(['line', ...pts[i], ...pts[(i + 1) % 4]])
  return (
    svgOpen(76, 64) +
    `<g fill="none" stroke="${palette['ink']}" stroke-width="1" stroke-linecap="square" stroke-dasharray="3 3" stroke-opacity="0.55">${stroke(string, rand, 0.3)}</g>` +
    `<g fill="${palette['panel']}" stroke="${palette['ink']}" stroke-width="1.1" stroke-linecap="square">${stroke(lines, rand, 0.25)}</g>` +
    `</svg>\n`
  )
}

// En byggplats: schaktad grop med grundlinje, stege och en kran.
export function makeSite(palette = readPalette()) {
  const rand = createRandom('works:site')
  const fills = fillPoly(rectPts(10, 22, 52, 34), palette['ink'], 0.1)
  const lines = [['rect', 10, 22, 52, 34], ['rect', 16, 28, 40, 22]]
  for (let i = 0; i < 5; i++) lines.push(['line', 16 + i * 10, 28, 26 + i * 10, 50])
  lines.push(['line', 66, 56, 66, 8], ['line', 54, 12, 74, 12], ['line', 66, 12, 52, 30], ['rect', 63, 54, 6, 4])
  return (
    svgOpen(76, 64) +
    fills +
    `<g fill="none" stroke="${palette['ink']}" stroke-width="1.1" stroke-linecap="square" stroke-linejoin="miter">${stroke(lines, rand, 0.4)}</g>` +
    `</svg>\n`
  )
}

// Markplanen: stängsel, plattor för varje plats, en väg med grind och ett stickspår i botten, gräsmarkering. Åtta eller tolv platser.
export function makeGround(slots, palette = readPalette()) {
  const g = SLOT_GEOMETRY
  const rand = createRandom(`works:ground:${slots}`)
  const height = groundHeight(slots)
  const rows = Math.ceil(slots / g.columns)
  const plotBottom = g.marginTop + rows * g.height + (rows - 1) * g.gapY + 8
  const pads = []
  for (let i = 0; i < slots; i++) {
    const r = slotRect(i)
    pads.push(['rect', r.x, r.y, r.width, r.height])
  }
  const fence = []
  for (let x = 2; x < g.plotWidth - 2; x += 8) fence.push(['line', x, 4, x + 4, 4])
  fence.push(['line', 2, 4, 2, plotBottom], ['line', g.plotWidth - 2, 4, g.plotWidth - 2, plotBottom])
  for (let x = 2; x < g.plotWidth - 2; x += 8) {
    if (x > 140 && x < 196) continue // grinden
    fence.push(['line', x, plotBottom, x + 4, plotBottom])
  }
  const road = plotBottom + 14
  const gate = [['line', 140, plotBottom - 3, 140, plotBottom + 3], ['line', 196, plotBottom - 3, 196, plotBottom + 3], ['line', 144, plotBottom, 192, plotBottom]]
  const roadLines = [['line', 0, road, g.plotWidth, road], ['line', 0, road + 12, g.plotWidth, road + 12]]
  for (let x = 6; x < g.plotWidth; x += 18) roadLines.push(['line', x, road + 6, x + 8, road + 6])
  // stickspår
  const railY = height - 6
  const rail = [['line', 0, railY, g.plotWidth, railY], ['line', 0, railY + 3, g.plotWidth, railY + 3]]
  for (let x = 4; x < g.plotWidth; x += 7) rail.push(['line', x, railY - 1, x, railY + 4])
  // grenspår från banan upp mot grinden
  const spur = [['line', 168, road + 12, 176, railY], ['line', 172, road + 12, 180, railY]]
  // gräsmarkering mellan platserna
  const tufts = []
  for (let i = 0; i < 26; i++) {
    const x = 4 + rand() * (g.plotWidth - 8)
    const y = 8 + rand() * (plotBottom - 12)
    tufts.push(['line', x, y, x - 1.5, y - 3], ['line', x, y, x + 1.5, y - 3])
  }
  return (
    svgOpen(g.plotWidth, height) +
    `<rect width="${g.plotWidth}" height="${height}" fill="${palette['bg']}"/>` +
    `<g fill="${palette['panel']}" fill-opacity="0.55" stroke="none">${pads.map((p) => `<rect x="${p[1]}" y="${p[2]}" width="${p[3]}" height="${p[4]}"/>`).join('')}</g>` +
    `<g fill="none" stroke="${palette['line']}" stroke-width="0.9" stroke-linecap="square" stroke-opacity="0.75">${stroke(pads, rand, 0.35)}</g>` +
    `<g fill="none" stroke="${palette['sepia-ink']}" stroke-width="0.7" stroke-linecap="square" stroke-opacity="0.5">${stroke(tufts, rand, 0.15)}</g>` +
    `<g fill="none" stroke="${palette['ink']}" stroke-width="1.2" stroke-linecap="square">${stroke(fence, rand, 0.3)}${stroke(gate, rand, 0.2)}</g>` +
    `<g fill="none" stroke="${palette['ink']}" stroke-width="0.9" stroke-linecap="square" stroke-opacity="0.8">${stroke(roadLines, rand, 0.3)}${stroke(rail, rand, 0.25)}${stroke(spur, rand, 0.25)}</g>` +
    `</svg>\n`
  )
}

export const GROUND_SIZES = [8, 12]
