// art/icons.mjs — spelets ikonsats som schablonsymboler (etapp 7 regel 5 och 8).
// Varje ikon beskrivs som enkla former i ett 24×24-rutnät och ritas med ett lätt
// handdarr, i currentColor så att CSS bestämmer färgen (papper eller stål).
// Nya verb (etapp 9: FIELD_TRIAL, REVERSE_ENGINEER, PROCUREMENT m.fl.) läggs till här,
// och test/artFactory.test.ts underkänner om ett verb i appen saknar ikon.
import { createRandom, toPath, wobbleEllipse, wobbleLine } from './core.mjs'

// Former: ['line', x0,y0,x1,y1] · ['poly', [[x,y],...], closed] · ['rect', x,y,w,h]
//         ['circle', cx,cy,r] · ['ellipse', cx,cy,rx,ry] · ['arc', cx,cy,r,fromDeg,toDeg] · ['dot', cx,cy,r] (fylld)
export const ICON_SHAPES = {
  // INTEL
  EXPAND: [['line', 12, 21, 12, 9], ['line', 8, 21, 12, 9], ['line', 16, 21, 12, 9], ['arc', 12, 9, 4, 200, 340], ['arc', 12, 9, 7.5, 205, 335]],
  WITHDRAW: [['line', 9, 21, 9, 9], ['line', 5, 21, 9, 9], ['line', 13, 21, 9, 9], ['arc', 9, 9, 3.5, 200, 340], ['line', 19, 4, 19, 14], ['poly', [[16, 11], [19, 14.5], [22, 11]], false]],
  LEAK: [['rect', 3, 6, 18, 12], ['poly', [[3, 6], [12, 13], [21, 6]], false], ['dot', 18.5, 21, 1.4]],
  SABOTAGE: [['circle', 10, 14.5, 6.5], ['line', 14.5, 9.8, 17, 7.3], ['poly', [[17, 7.3], [18, 4.5], [20, 3]], false], ['line', 21, 1.5, 22.5, 1], ['line', 21.5, 4, 23, 4.5], ['arc', 10, 14.5, 3.5, 200, 260]],
  TURN: [['arc', 12, 12, 7.5, 30, 300], ['poly', [[18.5, 5], [19.5, 9.5], [15, 9]], false], ['dot', 12, 12, 1.8]],
  RECRUIT: [['circle', 10, 7.5, 3.2], ['poly', [[3.5, 20], [4.5, 14], [10, 12.5], [15.5, 14], [16.5, 20]], false], ['line', 19.5, 3, 19.5, 9], ['line', 16.5, 6, 22.5, 6]],
  // POLITIK
  INFLUENCE: [['poly', [[3, 10], [8, 10], [17, 5], [17, 19], [8, 14], [3, 14]], true], ['line', 6, 14, 7.5, 20], ['line', 20, 9, 21.5, 8], ['line', 20, 15, 21.5, 16]],
  STAGE_INCIDENT: [['poly', [[12, 2.5], [14, 8.5], [20.5, 6], [16.5, 11.5], [21.5, 15.5], [15, 15.5], [15.5, 21.5], [11.5, 17], [7, 21], [8, 15], [2.5, 13.5], [7.5, 10], [4.5, 4.5], [10, 7.5]], true]],
  BACK_CHANNEL: [['poly', [[4, 9], [6, 5], [18, 5], [20, 9]], false], ['rect', 4, 9, 4, 3], ['rect', 16, 9, 4, 3], ['poly', [[7, 12], [6, 20], [18, 20], [17, 12]], true], ['circle', 12, 16, 2.2]],
  BRIBE: [['rect', 3, 6, 18, 12], ['circle', 12, 12, 3], ['line', 6, 9, 6, 15], ['line', 18, 9, 18, 15]],
  FUND_CAMPAIGN: [['rect', 5, 4, 14, 11], ['line', 8, 7.5, 16, 7.5], ['line', 8, 11, 13, 11], ['line', 12, 15, 12, 21], ['line', 8, 21, 16, 21]],
  FAVOUR: [['rect', 4, 11, 16, 10], ['rect', 3, 7.5, 18, 3.5], ['line', 12, 7.5, 12, 21], ['poly', [[12, 7.5], [8, 3.5], [7, 6.5], [12, 7.5]], false], ['poly', [[12, 7.5], [16, 3.5], [17, 6.5], [12, 7.5]], false]],
  FUND_COUP: [['poly', [[4, 18], [3, 9], [8, 13], [12, 6], [16, 13], [21, 9], [20, 18]], true], ['line', 4, 21.5, 20, 21.5], ['line', 2, 3, 22, 16]],
  ASSASSINATE: [['circle', 12, 12, 7.5], ['line', 12, 2, 12, 7], ['line', 12, 17, 12, 22], ['line', 2, 12, 7, 12], ['line', 17, 12, 22, 12], ['dot', 12, 12, 1.4]],
  BROKER: [['line', 12, 4, 12, 20], ['line', 8, 20.5, 16, 20.5], ['line', 4, 7, 20, 7], ['poly', [[4, 7], [2, 13], [6, 13]], true], ['poly', [[20, 7], [18, 13], [22, 13]], true]],
  // MARKNAD
  BUY_FORWARD: [['rect', 4, 11, 16, 10], ['line', 4, 16, 20, 16], ['line', 12, 2, 12, 9], ['poly', [[9, 6.5], [12, 9.5], [15, 6.5]], false]],
  RELEASE: [['rect', 4, 11, 16, 10], ['line', 4, 16, 20, 16], ['line', 12, 9, 12, 2], ['poly', [[9, 4.5], [12, 1.5], [15, 4.5]], false]],
  // INTERNT
  TAKE_LOAN: [['poly', [[3, 9], [12, 3.5], [21, 9]], true], ['line', 6, 10.5, 6, 18], ['line', 10, 10.5, 10, 18], ['line', 14, 10.5, 14, 18], ['line', 18, 10.5, 18, 18], ['line', 3, 20.5, 21, 20.5]],
  REPAY: [['ellipse', 9, 19, 6, 2.2], ['ellipse', 9, 15, 6, 2.2], ['ellipse', 9, 11, 6, 2.2], ['line', 3, 11, 3, 19], ['line', 15, 11, 15, 19], ['line', 19.5, 13, 19.5, 3.5], ['poly', [[17, 6], [19.5, 3], [22, 6]], false]],
  BUILD_LINE: [['poly', [[3, 21], [3, 11], [8, 7], [8, 11], [13, 7], [13, 11], [18, 7], [18, 3], [21, 3], [21, 21]], true], ['rect', 6, 15, 3, 3], ['rect', 12, 15, 3, 3]],
  HIRE: [['circle', 12, 6.5, 3.2], ['poly', [[5.5, 16], [6.5, 12], [12, 10.5], [17.5, 12], [18.5, 16]], false], ['rect', 8, 16, 8, 5.5], ['line', 10.5, 16, 10.5, 14.5], ['line', 13.5, 16, 13.5, 14.5]],
  // ETAPP 9 (P126): ritbordet.
  FIELD_TRIAL: [['poly', [[2.5, 12.5], [11, 7.5], [12.5, 10.2], [4, 15.2]], true], ['line', 2.5, 12.5, 4, 15.2], ['circle', 7, 20, 2.6], ['line', 6, 15, 7, 17.4], ['circle', 19, 15, 3.6], ['circle', 19, 15, 1.3], ['line', 14.5, 8.5, 17, 11.5]],
  REVERSE_ENGINEER: [['circle', 10, 10, 6.5], ['line', 14.8, 14.8, 21.5, 21.5], ['line', 19.5, 15.8, 22, 18.3], ['rect', 7.2, 8, 5.6, 4], ['line', 10, 12, 10, 14]],
  PROCUREMENT: [['poly', [[3, 21], [3, 8], [9, 8], [11, 5], [21, 5], [21, 21]], true], ['line', 3, 11, 21, 11], ['circle', 12, 16, 2.6], ['line', 6, 19, 8, 19]],
  REPRIORITISE_RND: [['circle', 12, 12, 5], ['circle', 12, 12, 1.8], ['line', 12, 2.5, 12, 5.5], ['line', 12, 18.5, 12, 21.5], ['line', 2.5, 12, 5.5, 12], ['line', 18.5, 12, 21.5, 12], ['line', 5.3, 5.3, 7.4, 7.4], ['line', 16.6, 16.6, 18.7, 18.7], ['line', 5.3, 18.7, 7.4, 16.6], ['line', 16.6, 7.4, 18.7, 5.3]],
}

const STROKE = 1.8

export function shapeToSvg(shape, rand, rough) {
  const [kind, ...a] = shape
  switch (kind) {
    case 'line':
      return `<path d="${toPath(wobbleLine([a[0], a[1]], [a[2], a[3]], rand, rough))}"/>`
    case 'poly': {
      const [pts, closed] = a
      const out = []
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = wobbleLine(pts[i], pts[i + 1], rand, rough, 2)
        out.push(...(i === 0 ? seg : seg.slice(1)))
      }
      if (closed) out.push(...wobbleLine(pts[pts.length - 1], pts[0], rand, rough, 2).slice(1))
      return `<path d="${toPath(out, closed)}"/>`
    }
    case 'rect': {
      const [x, y, w, h] = a
      return shapeToSvg(['poly', [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true], rand, rough)
    }
    case 'circle': {
      const e = wobbleEllipse(a[0], a[1], a[2], a[2], rand, rough, 18)
      return `<path d="${toPath(e.points, true)}"/>`
    }
    case 'ellipse': {
      const e = wobbleEllipse(a[0], a[1], a[2], a[3], rand, rough, 18)
      return `<path d="${toPath(e.points, true)}"/>`
    }
    case 'arc': {
      const [cx, cy, r, f, t] = a
      const e = wobbleEllipse(cx, cy, r, r, rand, rough, 18, (f * Math.PI) / 180, (t * Math.PI) / 180)
      return `<path d="${toPath(e.points)}"/>`
    }
    case 'dot':
      return `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="currentColor" stroke="none"/>`
    default:
      throw new Error(`okänd form: ${kind}`)
  }
}

// rough: darr i pixlar (24-rutnätet). 0,35 är husstilen: synligt handritat vid 44 px,
// fortfarande skarpt vid 20 px.
export function makeIcon(name, { rough = 0.35 } = {}) {
  const shapes = ICON_SHAPES[name]
  if (!shapes) throw new Error(`ingen ikon för ${name}`)
  const rand = createRandom(`icon:${name}`)
  const body = shapes.map((s) => shapeToSvg(s, rand, rough)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
    `stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="square" stroke-linejoin="miter" ` +
    `aria-hidden="true">${body}</svg>\n`
  )
}
