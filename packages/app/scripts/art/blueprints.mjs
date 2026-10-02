// art/blueprints.mjs — blåkopior per materielkategori för ritbordet (ETAPP10_FORSLAG.md §11 punkt 6). En klassisk blåkopia: papperskrämfärgade
// linjer på ritblått, ett rutnät, dimensionspilar, mittlinjer och en tom ruta för titelblocket (texten hör hemma i DOM:en). Färgerna läses ur
// styles.css (--blue och --panel). Ritningarna är generiska — ingen verklig tillverkare eller modell — men läsbara: gevär, fältkanon, pansarbil,
// transporthelikopter, patrullbåt och radiosats, var och en tillräckligt olik de andra för att kategorin ska kännas igen på en blick.
import { createRandom } from './core.mjs'
import { shapeToSvg } from './icons.mjs'
import { readPalette } from './core.mjs'

export const BLUEPRINT_CATEGORIES = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

const W = 320
const H = 200

// Streckad linje.
function dashed(x0, y0, x1, y1, dash = 7, gap = 3) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const out = []
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(d + dash, len)
    out.push(['line', x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e])
  }
  return out
}

// Mittlinje: långt streck, kort streck.
function centre(x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const out = []
  let d = 0
  let long = true
  while (d < len) {
    const seg = long ? 10 : 2.5
    const e = Math.min(d + seg, len)
    out.push(['line', x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e])
    d = e + 3
    long = !long
  }
  return out
}

// Dimensionslinje med pilspetsar och två hjälplinjer. Vågrät om y0 === y1, annars lodrät.
function dimension(x0, y0, x1, y1, reach = 6) {
  const horiz = y0 === y1
  const arrow = (x, y, dir) =>
    horiz ? ['poly', [[x + dir * 5, y - 2], [x, y], [x + dir * 5, y + 2]], false] : ['poly', [[x - 2, y + dir * 5], [x, y], [x + 2, y + dir * 5]], false]
  const out = [['line', x0, y0, x1, y1], arrow(x0, y0, 1), arrow(x1, y1, -1)]
  if (horiz) out.push(['line', x0, y0 - reach, x0, y0 + reach], ['line', x1, y1 - reach, x1, y1 + reach])
  else out.push(['line', x0 - reach, y0, x0 + reach, y0], ['line', x1 - reach, y1, x1 + reach, y1])
  return out
}

function wheel(cx, cy, r, spokes = 8) {
  const out = [['circle', cx, cy, r], ['circle', cx, cy, r * 0.62], ['circle', cx, cy, r * 0.18]]
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    out.push(['line', cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62])
  }
  return out
}

const DRAWINGS = {
  // Gevär: sidovy med sikte, mynning i ändvy och ett snitt genom pipa och förskaft.
  infantry: () => [
    ['rect', 40, 88, 128, 5],
    ['rect', 118, 84, 62, 13],
    ['rect', 178, 80, 30, 20],
    ['poly', [[208, 82], [266, 92], [274, 120], [258, 124], [208, 102]], true],
    ['poly', [[184, 100], [198, 100], [200, 122], [186, 124]], true],
    ['arc', 168, 104, 14, 20, 160],
    ['line', 44, 82, 44, 88],
    ['line', 40, 88, 36, 92],
    ['poly', [[196, 76], [196, 80], [204, 80], [204, 76]], false],
    ['line', 120, 90, 176, 90],
    ...centre(30, 90, 284, 90),
    ...dimension(40, 64, 274, 64),
    ...dimension(292, 80, 292, 124),
    ['circle', 70, 156, 13],
    ['circle', 70, 156, 4.5],
    ...centre(52, 156, 88, 156),
    ...centre(70, 138, 70, 174),
    ['rect', 120, 144, 46, 24],
    ['circle', 143, 156, 6],
    ['line', 120, 156, 166, 156],
    ...dashed(120, 150, 166, 150, 3, 2),
  ],
  // Fältkanon: pjäs med sköld, hjul, rekylcylinder och två lavettben; höjdvinkeln anges med en båge.
  artillery: () => [
    ['poly', [[150, 100], [40, 64], [38, 72], [150, 112]], true],
    ['rect', 28, 62, 12, 14],
    ['line', 30, 66, 38, 66],
    ['poly', [[150, 82], [164, 82], [170, 126], [152, 126]], true],
    ['rect', 118, 100, 32, 8],
    ['line', 118, 104, 150, 104],
    ...wheel(152, 134, 32),
    ['poly', [[160, 126], [232, 150], [229, 155], [158, 133]], true],
    ['poly', [[156, 132], [226, 160], [222, 164], [154, 138]], true],
    ['line', 232, 150, 229, 155],
    ['line', 110, 168, 232, 168],
    ...centre(20, 74, 168, 114),
    ...dimension(28, 52, 172, 52),
    ...dimension(268, 96, 268, 168),
  ],
  // Pansarbil: skrov, bandfordon med bärhjul, lucka och kulspruta; längd- och höjdmått.
  armour: () => [
    ['poly', [[44, 120], [62, 92], [102, 84], [208, 84], [248, 98], [262, 120], [250, 138], [54, 138]], true],
    ['poly', [[62, 92], [102, 84], [102, 120], [44, 120]], false],
    ['rect', 118, 70, 54, 14],
    ['line', 172, 74, 198, 66],
    ['line', 198, 64, 198, 70],
    ['rect', 124, 96, 40, 22],
    ['line', 144, 96, 144, 118],
    ['poly', [[56, 138], [64, 154], [244, 154], [252, 138]], false],
    ['circle', 78, 146, 8],
    ['circle', 112, 146, 8],
    ['circle', 146, 146, 8],
    ['circle', 180, 146, 8],
    ['circle', 214, 146, 8],
    ['circle', 78, 146, 2.5],
    ['circle', 146, 146, 2.5],
    ['circle', 214, 146, 2.5],
    ['line', 44, 120, 262, 120],
    ...centre(40, 112, 270, 112),
    ...dimension(44, 52, 262, 52),
    ...dimension(292, 70, 292, 154),
  ],
  // Transporthelikopter: kabin, stjärtbalk, huvudrotor, stjärtrotor och medar.
  aviation: () => [
    ['poly', [[60, 108], [70, 90], [104, 80], [168, 80], [196, 92], [200, 112], [180, 126], [76, 126]], true],
    ['poly', [[70, 90], [104, 80], [104, 104], [64, 108]], false],
    ['line', 118, 80, 118, 126],
    ['line', 150, 80, 150, 126],
    ['poly', [[196, 94], [292, 84], [294, 92], [200, 108]], true],
    ['poly', [[290, 82], [300, 62], [306, 64], [296, 92]], true],
    ['circle', 296, 76, 12],
    ['line', 284, 76, 308, 76],
    ['line', 296, 64, 296, 88],
    ['line', 136, 80, 136, 62],
    ['rect', 128, 56, 16, 7],
    ['line', 24, 58, 250, 58],
    ['line', 24, 61, 250, 61],
    ['line', 70, 138, 190, 138],
    ['line', 100, 126, 96, 138],
    ['line', 158, 126, 162, 138],
    ['line', 70, 138, 66, 142],
    ['line', 190, 138, 194, 142],
    ...centre(20, 100, 312, 100),
    ...dimension(24, 36, 250, 36),
    ...dimension(60, 160, 200, 160),
  ],
  // Patrullbåt: skrov i sidovy med brygga, mast och kanon, plus en liten planvy.
  naval: () => [
    ['poly', [[30, 104], [250, 104], [286, 84], [258, 128], [54, 128]], true],
    ['rect', 120, 80, 62, 24],
    ['rect', 134, 64, 34, 16],
    ['line', 150, 64, 150, 38],
    ['line', 144, 46, 156, 46],
    ['line', 232, 104, 238, 92],
    ['rect', 222, 88, 14, 6],
    ['line', 236, 90, 262, 80],
    ['rect', 66, 92, 26, 12],
    ['line', 66, 98, 44, 92],
    ['line', 24, 128, 296, 128],
    ['line', 30, 134, 60, 134],
    ['line', 90, 134, 130, 134],
    ['line', 160, 134, 210, 134],
    ['line', 240, 134, 292, 134],
    ['poly', [[40, 158], [168, 158], [210, 168], [168, 178], [40, 178]], true],
    ['rect', 100, 162, 34, 12],
    ...centre(30, 168, 222, 168),
    ...centre(150, 30, 150, 190),
    ...dimension(30, 58, 286, 58),
  ],
  // Radiosats: frontpanel med tre ratter, brytare och högtalargaller, handtelefon på spiralsladd, antennfäste.
  electronics: () => {
    const out = [
      ['rect', 40, 44, 200, 110],
      ['rect', 46, 50, 188, 98],
      ['circle', 84, 84, 20],
      ['circle', 84, 84, 14],
      ['circle', 84, 84, 3],
      ['line', 84, 84, 96, 74],
      ['circle', 148, 78, 13],
      ['circle', 148, 78, 8],
      ['line', 148, 78, 148, 68],
      ['circle', 196, 78, 13],
      ['circle', 196, 78, 8],
      ['line', 196, 78, 204, 84],
      ['rect', 134, 108, 12, 8],
      ['rect', 156, 108, 12, 8],
      ['rect', 178, 108, 12, 8],
      ['rect', 206, 108, 20, 8],
      ['rect', 60, 124, 104, 16],
      ['circle', 252, 62, 6],
      ['line', 252, 56, 252, 22],
      ['line', 246, 22, 258, 22],
      ['poly', [[246, 112], [280, 108], [284, 126], [250, 132]], true],
      ['arc', 248, 134, 14, 100, 250],
      ...dimension(40, 28, 240, 28),
      ...dimension(300, 44, 300, 154),
      ...centre(30, 99, 250, 99),
    ]
    for (let i = 0; i < 6; i++) out.push(['line', 68 + i * 15, 126, 68 + i * 15, 138])
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.8 + (i / 11) * 1.4)
      out.push(['line', 84 + Math.cos(a) * 14, 84 + Math.sin(a) * 14, 84 + Math.cos(a) * 18, 84 + Math.sin(a) * 18])
    }
    return out
  },
}

export function makeBlueprint(category, palette = readPalette()) {
  const draw = DRAWINGS[category]
  if (!draw) throw new Error(`ingen blåkopia för ${category}`)
  const rand = createRandom(`blueprint:${category}`)
  const paper = palette['panel']
  const blue = palette['blue']
  // Rutnät: 10-rutor tunt, 40-rutor tydligare.
  const grid = []
  for (let x = 0; x <= W; x += 10) grid.push(`<path d="M${x} 0V${H}" stroke-width="${x % 40 === 0 ? 0.6 : 0.25}" stroke-opacity="${x % 40 === 0 ? 0.32 : 0.18}"/>`)
  for (let y = 0; y <= H; y += 10) grid.push(`<path d="M0 ${y}H${W}" stroke-width="${y % 40 === 0 ? 0.6 : 0.25}" stroke-opacity="${y % 40 === 0 ? 0.32 : 0.18}"/>`)
  const frame = [['rect', 8, 8, W - 16, H - 16], ['rect', 12, 12, W - 24, H - 24], ['rect', 238, 158, 70, 30], ['line', 238, 170, 308, 170], ['line', 276, 170, 276, 188]]
  const body = DRAWINGS[category]().map((s) => shapeToSvg(s, rand, 0.55)).join('')
  const frameSvg = frame.map((s) => shapeToSvg(s, rand, 0.3)).join('')
  void draw
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">` +
    `<rect width="${W}" height="${H}" fill="${blue}"/>` +
    `<g fill="none" stroke="${paper}" stroke-linecap="square">${grid.join('')}</g>` +
    `<g fill="none" stroke="${paper}" stroke-width="1.1" stroke-linecap="square" stroke-linejoin="miter">${frameSvg}${body}</g>` +
    `</svg>\n`
  )
}
