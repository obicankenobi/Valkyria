// art/seals.mjs — rivalhusens sigill (ETAPP10_FORSLAG.md beslut 10M, §11 punkt 3). Ett runt prägelsigill per hus: dubbel ring,
// ett perforerat band i stället för text (text hör hemma i DOM:en) och en egen bild i mitten som berättar vad huset gör — kanonrören för
// Brandt (artilleri), tornet för Costigan (infanteri, försiktig), jordgloben med vingen för Meridian (flyg). Ritat i currentColor så
// att CSS avgör om det blir fettkrita-rött, stålgrått eller ockra; inga flaggor, vapensköldar eller verkliga företagsmärken.
import { createRandom, toPath, wobbleEllipse } from './core.mjs'
import { shapeToSvg } from './icons.mjs'

const STROKE = 2

const tick = (a, r0, r1, cx = 48, cy = 48) => [
  'line',
  cx + Math.cos(a) * r0,
  cy + Math.sin(a) * r0,
  cx + Math.cos(a) * r1,
  cy + Math.sin(a) * r1,
]

// Det perforerade bandet mellan de två ringarna: korta streck, 36 stycken.
function band() {
  const shapes = []
  for (let i = 0; i < 36; i++) shapes.push(tick((i / 36) * Math.PI * 2, 37.5, 41.5))
  return shapes
}

// Emblemen. Alla ligger inom radien ~32 från mitten (48,48).
export const SEAL_EMBLEMS = {
  // Artilleri: en fältkanon i sidovy — pjäs, sköld, hjul med ekrar och ett lavettben — över två staplade granater.
  brandt: [
    ['poly', [[46, 51], [20, 34], [17, 40], [44, 57]], true],
    ['rect', 13, 31, 8, 11],
    ['poly', [[44, 42], [52, 42], [55, 62], [46, 62]], true],
    ['circle', 49, 60, 12],
    ['circle', 49, 60, 3],
    ['line', 49, 48, 49, 72],
    ['line', 37, 60, 61, 60],
    ['line', 40.5, 51.5, 57.5, 68.5],
    ['line', 57.5, 51.5, 40.5, 68.5],
    ['poly', [[53, 63], [78, 72], [76, 76], [51, 67]], true],
    ['line', 22, 78, 74, 78],
  ],
  // Infanteri, försiktig: ett torn med tinnar och en välvd port, två pålar vid sidan.
  costigan: [
    ['poly', [[36, 70], [36, 38], [32, 38], [32, 28], [38, 28], [38, 33], [44, 33], [44, 28], [52, 28], [52, 33], [58, 33], [58, 28], [64, 28], [64, 38], [60, 38], [60, 70]], true],
    ['arc', 48, 70, 7, 180, 360],
    ['line', 41, 70, 41, 62],
    ['line', 55, 70, 55, 62],
    ['line', 28, 70, 68, 70],
    ['line', 24, 70, 24, 56],
    ['line', 72, 70, 72, 56],
    ['line', 20, 74, 76, 74],
  ],
  // Flyg: en jordglob med längd- och breddgrader, och ett pilformat plan sett uppifrån som skär över den.
  meridian: [
    ['circle', 48, 50, 24],
    ['ellipse', 48, 50, 10, 24],
    ['line', 24, 50, 72, 50],
    ['arc', 48, 50, 24, 200, 340],
    ['poly', [[48, 20], [51, 32], [51, 44], [76, 62], [76, 66], [51, 58], [51, 68], [57, 74], [57, 77], [48, 75], [39, 77], [39, 74], [45, 68], [45, 58], [20, 66], [20, 62], [45, 44], [45, 32]], true],
  ],
}

export const SEAL_IDS = Object.keys(SEAL_EMBLEMS)

export function makeSeal(id) {
  const emblem = SEAL_EMBLEMS[id]
  if (!emblem) throw new Error(`inget sigill för ${id}`)
  const rand = createRandom(`seal:${id}`)
  const ring = (r, rough) => {
    const e = wobbleEllipse(48, 48, r, r, rand, rough, 48)
    return `<path d="${toPath(e.points, true)}"/>`
  }
  const body = [ring(45, 0.5), ring(35.5, 0.4), ...band().map((s) => shapeToSvg(s, rand, 0.25)), ...emblem.map((s) => shapeToSvg(s, rand, 0.5))].join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" fill="none" ` +
    `stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="square" stroke-linejoin="miter" ` +
    `aria-hidden="true">${body}</svg>\n`
  )
}
