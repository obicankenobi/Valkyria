// frameRateGuard.test.ts — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5, ordagrant:
// "Sjunker bildtakten stängs omgivningsrörelsen av automatiskt."). Den fanns
// inte byggd. Ren funktion över tidsstämplar från requestAnimationFrame.
import { describe, expect, it } from 'vitest'
import { createFrameRateGuard } from '../src/frameRateGuard.js'

// Matar vaktens `feed` med bildrutor i en given takt under `seconds`, från `from` ms.
function run(guard: ReturnType<typeof createFrameRateGuard>, fps: number, seconds: number, from = 0): { end: number; tripped: boolean } {
  const step = 1000 / fps
  let t = from
  let tripped = false
  for (; t < from + seconds * 1000; t += step) tripped = guard.feed(t)
  return { end: t, tripped }
}

describe('createFrameRateGuard', () => {
  it('60 bilder/s länge utlöser aldrig', () => {
    const guard = createFrameRateGuard()
    expect(run(guard, 60, 30).tripped).toBe(false)
  })

  it('strax över 30 bilder/s räknas som godkänt (gränsen är "under 30")', () => {
    const guard = createFrameRateGuard()
    expect(run(guard, 30.5, 30).tripped).toBe(false)
  })

  it('20 bilder/s varaktigt utlöser, och efter uppvärmningen — inte omedelbart', () => {
    const guard = createFrameRateGuard()
    expect(run(guard, 20, 1).tripped).toBe(false) // inom uppvärmningen (1,5 s)
    expect(run(guard, 20, 10, 1000).tripped).toBe(true)
  })

  it('kräver två sammanhängande dåliga fönster: ett enda hack följt av återhämtning utlöser inte', () => {
    const guard = createFrameRateGuard()
    const warm = run(guard, 60, 2)
    const slow = run(guard, 15, 2, warm.end)
    expect(slow.tripped).toBe(false)
    expect(run(guard, 60, 10, slow.end).tripped).toBe(false)
  })

  it('en laddningsperiod (dålig takt under uppvärmningen) räknas inte', () => {
    const guard = createFrameRateGuard()
    const loading = run(guard, 10, 1.4)
    expect(loading.tripped).toBe(false)
    expect(run(guard, 60, 10, loading.end).tripped).toBe(false)
  })

  it('ett långt glapp (appen i bakgrunden) nollställer fönstret i stället för att räknas som noll bilder/s', () => {
    const guard = createFrameRateGuard()
    const before = run(guard, 60, 5)
    // fem sekunders tystnad — fliken låg i bakgrunden — sedan frisk takt igen
    const after = run(guard, 60, 10, before.end + 5000)
    expect(after.tripped).toBe(false)
  })

  it('ett glapp mitt i en dålig period nollställer även serien av dåliga fönster', () => {
    const guard = createFrameRateGuard()
    const a = run(guard, 60, 2)
    const slow = run(guard, 15, 2, a.end)
    expect(slow.tripped).toBe(false)
    const resumed = run(guard, 60, 3, slow.end + 5000)
    expect(resumed.tripped).toBe(false)
  })

  it('när den utlösts förblir den utlöst', () => {
    const guard = createFrameRateGuard()
    const bad = run(guard, 15, 12)
    expect(bad.tripped).toBe(true)
    expect(guard.feed(bad.end + 16)).toBe(true)
    expect(run(guard, 60, 5, bad.end + 100).tripped).toBe(true)
  })

  it('tröskelvärdena går att ställa, för test och framtida finjustering', () => {
    const guard = createFrameRateGuard({ minFps: 50, warmupMs: 0, windowMs: 500, consecutiveWindows: 1 })
    expect(run(guard, 40, 2).tripped).toBe(true)
  })
})
