// frameRateGuard — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5): "Sjunker bildtakten
// stängs omgivningsrörelsen av automatiskt." Mäter bildtakten ur
// requestAnimationFrame-tidsstämplar och säger till när den varaktigt är för låg.
// Ren (ingen DOM, ingen egen timer) så den går att testa med påhittade tider;
// App.tsx äger själva rAF-loopen och vad som händer när vakten löser ut.
//
// Tre skydd mot falsklarm: (1) en uppvärmningsperiod — sidan laddar geodata och
// ritar första gången, det är inte "spelets" bildtakt; (2) två sammanhängande
// dåliga fönster, så ett enskilt hack inte stänger av något för gott; (3) ett
// glapp längre än en sekund (fliken låg i bakgrunden, telefonen låstes) nollställer
// fönstret i stället för att räknas som noll bilder per sekund.
export interface FrameRateGuardOptions {
  warmupMs: number
  windowMs: number
  minFps: number
  consecutiveWindows: number
  gapMs: number
}

// 30 bilder/s är golvet för en Android i mellanklass (§12 punkt 5); under det
// stängs rörelsen av. 50 är BUDGETEN, inte avstängningsgränsen — att stänga av
// dekoren vid 45 bilder/s vore att ge upp för tidigt.
export const DEFAULT_FRAME_RATE_OPTIONS: FrameRateGuardOptions = {
  warmupMs: 1500,
  windowMs: 2000,
  minFps: 30,
  consecutiveWindows: 2,
  gapMs: 1000,
}

export interface FrameRateGuard {
  // Anropas med varje bildrutas tidsstämpel; returnerar true när omgivningsrörelsen
  // ska stängas av (och förblir true därefter).
  feed(now: number): boolean
}

export function createFrameRateGuard(overrides: Partial<FrameRateGuardOptions> = {}): FrameRateGuard {
  const options = { ...DEFAULT_FRAME_RATE_OPTIONS, ...overrides }
  let firstAt: number | null = null
  let lastAt: number | null = null
  let windowStart: number | null = null
  let frames = 0
  let lowWindows = 0
  let tripped = false

  return {
    feed(now: number): boolean {
      if (tripped) return true
      if (firstAt === null) firstAt = now
      if (lastAt !== null && now - lastAt > options.gapMs) {
        windowStart = null
        frames = 0
        lowWindows = 0
      }
      lastAt = now
      if (now - firstAt < options.warmupMs) return false
      if (windowStart === null) {
        windowStart = now
        frames = 0
        return false
      }
      frames += 1
      const elapsed = now - windowStart
      if (elapsed >= options.windowMs) {
        const fps = (frames * 1000) / elapsed
        lowWindows = fps < options.minFps ? lowWindows + 1 : 0
        if (lowWindows >= options.consecutiveWindows) tripped = true
        windowStart = now
        frames = 0
      }
      return tripped
    },
  }
}
