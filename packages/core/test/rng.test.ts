import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'

describe('createRng', () => {
  it('ger samma talföljd för samma seed och cursor', () => {
    const a = createRng('alpha', 0)
    const b = createRng('alpha', 0)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqB).toEqual(seqA)
  })

  it('återskapar exakt samma fortsättning när man startar om från en senare cursor', () => {
    const full = createRng('alpha', 0)
    Array.from({ length: 10 }, () => full.next())
    const cursorAfter10 = full.cursor()

    const resumed = createRng('alpha', cursorAfter10)
    const next10ViaResume = Array.from({ length: 10 }, () => resumed.next())
    const next10ViaFull = Array.from({ length: 10 }, () => full.next())

    expect(next10ViaResume).toEqual(next10ViaFull)
  })

  it('ger olika följder för olika seed', () => {
    const a = createRng('alpha', 0)
    const b = createRng('beta', 0)
    expect(a.next()).not.toBe(b.next())
  })

  it('next() ligger i [0,1)', () => {
    const rng = createRng('gamma', 0)
    for (let i = 0; i < 1000; i++) {
      const n = rng.next()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('int(min,max) är inklusive i båda ändar och täcker hela intervallet', () => {
    const rng = createRng('delta', 0)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3))
    expect(seen).toEqual(new Set([1, 2, 3]))
  })

  it('int kastar om max < min', () => {
    const rng = createRng('delta', 0)
    expect(() => rng.int(5, 1)).toThrow()
  })

  it('pick väljer bara element ur listan', () => {
    const rng = createRng('epsilon', 0)
    const xs = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i++) {
      expect(xs).toContain(rng.pick(xs))
    }
  })

  it('pick kastar på tom lista', () => {
    const rng = createRng('epsilon', 0)
    expect(() => rng.pick([])).toThrow()
  })

  it('chance(0) är alltid falskt, chance(100) alltid sant', () => {
    const rng = createRng('zeta', 0)
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(100)).toBe(true)
    }
  })

  it('cursor() ökar med exakt ett per draget tal, oavsett metod', () => {
    const rng = createRng('eta', 0)
    expect(rng.cursor()).toBe(0)
    rng.next()
    expect(rng.cursor()).toBe(1)
    rng.int(1, 10)
    expect(rng.cursor()).toBe(2)
    rng.chance(50)
    expect(rng.cursor()).toBe(3)
    rng.pick([1, 2, 3])
    expect(rng.cursor()).toBe(4)
  })

  it('avvisar en negativ eller icke-heltalig startcursor', () => {
    expect(() => createRng('theta', -1)).toThrow()
    expect(() => createRng('theta', 1.5)).toThrow()
  })
})
