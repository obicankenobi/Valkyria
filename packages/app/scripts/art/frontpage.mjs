// art/frontpage.mjs — förstasidan (ETAPP10_FORSLAG.md §11 punkt 2, beslut 10O). En tryckt tidningssida från en FIKTIV nyhetsbyrå ("THE CALDER
// WIRE" — inget verkligt tidningsnamn, ingen verklig byrå): spaltlinjer, ett mastnamn mellan dubbla linjer, en datumrad, rubriken i blytyp, ett
// halvtonsfoto (rastermönster ur ett frö — en abstrakt bild av hav, himmel eller land, aldrig en verklig plats eller person), två rader ingress och
// "grå" textspalter som rena rektanglar. Sidan byggs ur händelsens text och ett frö, så att varje händelse får en bild utan att något ritas för hand.
//
// Texten är riktig <text> i SVG:n (typsnitt: Libre Baskerville och Courier Prime ur @fontsource) och ska därför SÄTTAS IN I DOM:en (inline). Som
// <img> når SVG inga externa typsnitt och faller tillbaka på systemets serif. Radbrytning och teckenstorlek räknas med konservativa breddtal så att
// ingen rad kan klippas av sin ruta (regel 18); en rubrik som är för lång krymps tills den får plats, och ingressen kortas med ett utelämnings­tecken.
import { createRandom, hashSeed, readPalette, round } from './core.mjs'

export const AGENCY = 'THE CALDER WIRE'
const W = 320
const H = 420
const MARGIN = 16
const INNER = W - MARGIN * 2

// Konservativa teckenbredder som andel av teckenstorleken (versaler i Baskerville Bold är breda).
const WIDTH = { headline: 0.74, body: 0.52, mono: 0.62, mast: 0.78 }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Bryter en text i högst `maxLines` rader om högst `maxChars` tecken; tar den slut kortas sista raden med "…".
export function wrapText(text, maxChars, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  let i = 0
  for (; i < words.length; i++) {
    let word = words[i]
    if (word.length > maxChars) word = word.slice(0, maxChars - 1) + '…'
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars) line = next
    else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  else if (lines.length === maxLines && i < words.length) {
    // Texten tog inte slut: kortar sista raden.
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last).replace(/[\s.,;:]+$/, '') + '…'
  }
  return lines.slice(0, maxLines)
}

// Rubriken: störst möjliga teckenstorlek (24 ned till 13 px) som ryms på högst tre rader.
export function fitHeadline(text, widthPx = INNER, maxLines = 3) {
  const upper = String(text).toUpperCase()
  for (let size = 24; size >= 13; size -= 1) {
    const maxChars = Math.floor(widthPx / (size * WIDTH.headline))
    const lines = wrapText(upper, maxChars, maxLines)
    if (!lines.some((l) => l.endsWith('…')) || size === 13) return { size, lines }
  }
  return { size: 13, lines: wrapText(upper, Math.floor(widthPx / (13 * WIDTH.headline)), maxLines) }
}

const MOTIFS = ['sea', 'sky', 'land']

// Halvtonsfältet: ett värde 0–1 (mörkt = tätt) per punkt. Motivet styr horisont och former, fröet placerar dem.
function field(motif, rand) {
  const blobs = Array.from({ length: 3 }, () => ({ x: rand(), y: 0.25 + rand() * 0.5, r: 0.12 + rand() * 0.2, s: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.3) }))
  const horizon = 0.5 + (rand() - 0.5) * 0.18
  const phase = rand() * 6.28
  const cx = 0.3 + rand() * 0.4 // var motivets föremål står
  const box = (u, v, x0, x1, y0, y1) => (u >= x0 && u <= x1 && v >= y0 && v <= y1 ? 1 : 0)
  // Föremålet: ett fartyg vid horisonten (hav), ett plan med kondensstrimma (himmel) eller en rökpelare över en åsrygg (land).
  const subject = (u, v) => {
    if (motif === 'sea') {
      const hull = box(u, v, cx - 0.2, cx + 0.2, horizon - 0.05, horizon + 0.01) * (u < cx + 0.14 || v > horizon - 0.025 ? 1 : 0)
      const bridge = box(u, v, cx - 0.07, cx + 0.05, horizon - 0.13, horizon - 0.05)
      const mast = box(u, v, cx - 0.012, cx - 0.004, horizon - 0.22, horizon - 0.13)
      const gun = box(u, v, cx + 0.1, cx + 0.2, horizon - 0.085, horizon - 0.07)
      return Math.max(hull, bridge, mast, gun) * 0.62
    }
    if (motif === 'sky') {
      const cy = 0.26
      const fuselage = box(u, v, cx - 0.14, cx + 0.14, cy - 0.016, cy + 0.016)
      const wings = box(u, v, cx - 0.04, cx + 0.02, cy - 0.1, cy + 0.1)
      const tail = box(u, v, cx - 0.14, cx - 0.1, cy - 0.05, cy + 0.01)
      const trail = box(u, v, cx + 0.14, cx + 0.62, cy - 0.006, cy + 0.006) * 0.55
      return Math.max(fuselage, wings, tail) * 0.7 + trail
    }
    const plume = Math.exp(-((u - cx) ** 2 / (2 * (0.03 + (horizon - v) * 0.14) ** 2))) * (v < horizon && v > 0.08 ? 0.5 : 0)
    return plume
  }
  return (u, v) => {
    let value = v < horizon ? 0.12 + 0.12 * v : 0.46 + 0.3 * (v - horizon)
    if (motif === 'sea') value += v > horizon ? 0.08 * Math.sin(u * 38 + phase + v * 20) : 0
    if (motif === 'land') value += 0.18 * Math.sin(u * 7 + phase) * (v > horizon - 0.1 ? 1 : 0.2) + (v > horizon ? 0.1 : 0)
    if (motif === 'sky') value += 0.2 * Math.max(0, Math.sin(u * 9 + phase) * Math.sin(v * 8)) * (v < horizon ? 1 : 0)
    for (const b of blobs) value += b.s * 0.7 * Math.exp(-(((u - b.x) ** 2 + (v - b.y) ** 2) / (2 * b.r * b.r)))
    value += subject(u, v)
    return Math.min(1, Math.max(0, value))
  }
}

// Halvtonsraster: punkter på ett 45° rutnät, fem storleksklasser; varje klass är EN path med runda "streck av längd noll".
function halftone(seed, motif, x0, y0, w, h, ink) {
  const rand = createRandom(`frontpage:${seed}:halftone`)
  const f = field(motif, rand)
  const step = 5
  const classes = [[], [], [], [], []]
  for (let row = 0; row * step * 0.5 < h; row++) {
    const y = row * step * 0.5
    for (let col = 0; col * step < w + step; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0)
      if (x > w) continue
      const grain = ((hashSeed(`${seed}:${row}:${col}`) % 100) / 100 - 0.5) * 0.08
      const level = Math.round(Math.min(1, Math.max(0, f(x / w, y / h) + grain)) * 5)
      if (level >= 1) classes[level - 1].push(`M${round(x0 + x)} ${round(y0 + y)}h0`)
    }
  }
  const widths = [0.9, 1.7, 2.5, 3.3, 4.1]
  return classes
    .map((dots, i) => (dots.length ? `<path d="${dots.join('')}" stroke="${ink}" stroke-width="${widths[i]}" stroke-linecap="round" fill="none"/>` : ''))
    .join('')
}

// spec: { headline, dateline, deck?, seed?, motif? } — motif sea | sky | land (annars ur fröet).
export function makeFrontPage(spec, palette = readPalette()) {
  const { headline, dateline, deck = '' } = spec
  const seed = spec.seed ?? headline
  const rand = createRandom(`frontpage:${seed}`)
  const motif = MOTIFS.includes(spec.motif) ? spec.motif : MOTIFS[Math.floor(rand() * MOTIFS.length)]
  const paper = palette['panel']
  const ink = palette['ink']
  const dim = palette['ink-dim']
  const line = palette['line-strong'] ?? palette['line']
  const red = palette['red']

  const parts = []
  parts.push(`<rect width="${W}" height="${H}" fill="${paper}"/>`)
  parts.push(`<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="${ink}" stroke-width="1.6"/>`)

  // Mastnamn mellan dubbla linjer.
  let y = 26
  parts.push(`<path d="M${MARGIN} ${y - 14}H${W - MARGIN}M${MARGIN} ${y - 11}H${W - MARGIN}" stroke="${ink}" stroke-width="${1.6}" fill="none"/>`)
  const mastSize = Math.min(24, Math.floor(INNER / (AGENCY.length * WIDTH.mast)))
  parts.push(`<text x="${W / 2}" y="${y + 14}" text-anchor="middle" font-family="'Libre Baskerville',Georgia,serif" font-weight="700" font-size="${mastSize}" letter-spacing="1" fill="${ink}">${esc(AGENCY)}</text>`)
  y += 26
  parts.push(`<path d="M${MARGIN} ${y}H${W - MARGIN}" stroke="${ink}" stroke-width="1.6" fill="none"/>`)

  // Datumraden: tunna linjer över och under, Courier.
  const dateChars = Math.floor(INNER / (9 * WIDTH.mono))
  const dateText = wrapText(String(dateline).toUpperCase(), dateChars, 1)[0] ?? ''
  y += 14
  parts.push(`<text x="${MARGIN}" y="${y}" font-family="'Courier Prime','Courier New',monospace" font-size="9" letter-spacing="0.4" fill="${dim}">${esc(dateText)}</text>`)
  y += 6
  parts.push(`<path d="M${MARGIN} ${y}H${W - MARGIN}" stroke="${line}" stroke-width="0.8" fill="none"/>`)

  // Rubrik.
  const fit = fitHeadline(headline)
  y += 8
  fit.lines.forEach((text, i) => {
    parts.push(`<text x="${MARGIN}" y="${y + fit.size * (i + 0.92)}" font-family="'Libre Baskerville',Georgia,serif" font-weight="700" font-size="${fit.size}" fill="${ink}">${esc(text)}</text>`)
  })
  y += fit.size * 1.14 * fit.lines.length + 6

  // Halvtonsfoto med ram.
  const photoH = 120
  parts.push(halftone(seed, motif, MARGIN, y, INNER, photoH, ink))
  parts.push(`<rect x="${MARGIN}" y="${y}" width="${INNER}" height="${photoH}" fill="none" stroke="${ink}" stroke-width="1.2"/>`)
  y += photoH + 14

  // Ingress, högst två rader.
  const deckChars = Math.floor(INNER / (9.5 * WIDTH.body))
  wrapText(deck, deckChars, 2).forEach((text, i) => {
    parts.push(`<text x="${MARGIN}" y="${y + i * 12.5}" font-family="'Libre Baskerville',Georgia,serif" font-size="9.5" fill="${ink}">${esc(text)}</text>`)
  })
  y += (deck ? 12.5 * 2 : 0) + 8
  parts.push(`<path d="M${MARGIN} ${y - 4}H${W - MARGIN}" stroke="${line}" stroke-width="0.8" fill="none"/>`)

  // Två "gråa" textspalter: rena rektanglar i olika längd, ingen text.
  const colW = (INNER - 12) / 2
  const bottom = H - 22
  for (let col = 0; col < 2; col++) {
    const x = MARGIN + col * (colW + 12)
    for (let yy = y + 6, k = 0; yy < bottom - 4; yy += 6.5, k++) {
      const len = colW * (k % 5 === 4 ? 0.55 : 0.82 + rand() * 0.18)
      parts.push(`<rect x="${x}" y="${round(yy)}" width="${round(len)}" height="2.3" fill="${dim}" fill-opacity="0.55"/>`)
    }
  }
  parts.push(`<path d="M${W / 2} ${y - 2}V${bottom}" stroke="${line}" stroke-width="0.8" fill="none"/>`)

  // Sidfot: en tunn linje och ett litet rött "stop press"-streck.
  parts.push(`<path d="M${MARGIN} ${H - 16}H${W - MARGIN}" stroke="${ink}" stroke-width="1" fill="none"/>`)
  parts.push(`<path d="M${MARGIN} ${H - 11}h34" stroke="${red}" stroke-width="2.2" fill="none"/>`)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(AGENCY)}: ${esc(headline)}">` +
    `<title>${esc(AGENCY)}: ${esc(headline)}</title>${parts.join('')}</svg>\n`
  )
}

// Tre specimen för kontaktarket och testerna. Händelserna är verkliga (stater, krig och årtal är verkliga, DESIGN.md §15), texten är påhittad av
// fabriken och bär ingen citerad person; de riktiga händelsetexterna kommer med P149:s datafil.
export const SPECIMEN_PAGES = [
  { seed: 'specimen-tonkin', motif: 'sea', dateline: 'Saigon, Tuesday 4 August 1964', headline: 'Patrol boats reported in action off the northern coast', deck: 'Naval staffs in two capitals ask for the log books. Ministries say little, and the markets say less.' },
  { seed: 'specimen-pleiku', motif: 'sky', dateline: 'Pleiku, Sunday 7 February 1965', headline: 'Airfield attacked before dawn; reprisals expected within the week', deck: 'Advisers count the losses in aircraft and sleep. Procurement offices are told to expect revised lists.' },
  { seed: 'specimen-tet', motif: 'land', dateline: 'Hue, Wednesday 31 January 1968', headline: 'Fighting reaches the cities as the holiday truce collapses', deck: 'Every ministry now wants everything at once, and every supplier is asked who else is buying.' },
]
