// Seedad, deterministisk slumpkälla. All slump i packages/core går härigenom
// (CLAUDE.md hård regel 2, mekaniskt bevakat av eslint.config.js för Math.random).
//
// mulberry32, med en enkel xmur3-hash som omvandlar strängseeden till ett 32-bitars
// starttillstånd. Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.3.
//
// createRng(seed, cursor) återskapar exakt samma position i talföljden som cursor
// anger, genom att spola fram `cursor` steg från start. mulberry32 har ingen O(1)
// hoppformel, men cursor-värdena i ett 20-turersparti är för små för att det ska
// spela någon roll. Det är detta som gör ett parti reproducerbart enbart från
// (seed, handlingslogg) — grunden för balanshärnessen i avsnitt 7.3.

export interface Rng {
  next(): number // [0,1)
  int(min: number, max: number): number // inklusive i båda ändar
  pick<T>(xs: readonly T[]): T
  chance(pct: number): boolean
  cursor(): number
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed: string, startCursor: number): Rng {
  if (!Number.isInteger(startCursor) || startCursor < 0) {
    throw new Error(`createRng: cursor måste vara ett icke-negativt heltal, fick ${startCursor}`)
  }

  const step = mulberry32(xmur3(seed)())
  let drawn = 0

  for (let i = 0; i < startCursor; i++) step()

  function next(): number {
    drawn++
    return step()
  }

  return {
    next,
    int(min, max) {
      if (max < min) {
        throw new Error(`Rng.int: max (${max}) < min (${min})`)
      }
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(xs) {
      if (xs.length === 0) {
        throw new Error('Rng.pick: tom lista')
      }
      const index = Math.floor(next() * xs.length)
      // noUncheckedIndexedAccess: index är matematiskt garanterat < xs.length ovan
      // (next() < 1), typen vet bara inte det.
      return xs[index] as (typeof xs)[number]
    },
    chance(pct) {
      return next() * 100 < pct
    },
    cursor() {
      return startCursor + drawn
    },
  }
}
