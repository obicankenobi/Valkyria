// art/core.mjs — tillgångsfabrikens grund: seedad slump, paletten ur styles.css och
// "handritade" linjer. Allt här är deterministiskt: samma indata ger bitvis samma SVG,
// så att genererade filer kan checkas in och ett test kan underkänna om de blivit
// inaktuella (test/artFactory.test.ts). Ingen Math.random, ingen tid, inget nätverk.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const STYLES = fileURLToPath(new URL('../../src/styles.css', import.meta.url))

// cyrb53-liknande strängkontroll → 32-bitars frö. Samma idé som core/queries.ts:s
// "hasha seed + id" (CLAUDE.md hård regel 2), men fabriken är ett byggverktyg, inte kärnan.
export function hashSeed(text) {
  let h1 = 0xdeadbeef ^ text.length
  let h2 = 0x41c6ce57 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return h1 >>> 0
}

// mulberry32: liten, snabb, deterministisk.
export function createRandom(seedText) {
  let a = hashSeed(String(seedText))
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Paletten läses ur :root i styles.css — en källa, aldrig en kopia (etapp 7 §10).
export function readPalette(cssText = readFileSync(STYLES, 'utf8')) {
  const root = cssText.match(/:root\s*\{([\s\S]*?)\n\}/)
  if (!root) throw new Error('styles.css saknar :root-blocket')
  const tokens = {}
  for (const m of root[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) tokens[m[1]] = m[2].toLowerCase()
  return tokens
}

export const round = (n) => Math.round(n * 10) / 10

// Punkter längs en rät linje, med ett litet, mjukt darr — ritat för hand, inte i CAD.
// amount i pixlar i 24-rutnätet; 0 ger en helt rak linje.
export function wobbleLine(p0, p1, rand, amount, steps = 4) {
  const [x0, y0] = p0
  const [x1, y1] = p1
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = -(y1 - y0) / len
  const ny = (x1 - x0) / len
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const edge = i === 0 || i === steps ? 0.35 : 1 // ändpunkterna darrar mindre
    const off = (rand() - 0.5) * 2 * amount * edge
    pts.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off])
  }
  return pts
}

export function toPath(points, close = false) {
  const [first, ...rest] = points
  let d = `M${round(first[0])} ${round(first[1])}`
  for (const [x, y] of rest) d += `L${round(x)} ${round(y)}`
  return close ? d + 'Z' : d
}

// Ellips som polygon med darr.
export function wobbleEllipse(cx, cy, rx, ry, rand, amount, segments = 16, from = 0, to = Math.PI * 2) {
  const pts = []
  const full = Math.abs(to - from - Math.PI * 2) < 1e-9
  const n = full ? segments : Math.max(3, Math.round((segments * (to - from)) / (Math.PI * 2)))
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n
    const r = 1 + (rand() - 0.5) * 2 * (amount / Math.max(rx, ry))
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r])
  }
  return { points: pts, closed: full }
}
