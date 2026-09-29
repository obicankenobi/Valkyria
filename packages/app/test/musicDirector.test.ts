// musicDirector.test.ts — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 2 "Vad som spelas när"). Ren funktion, ingen ljudmotor behövs.
import { describe, expect, it } from 'vitest'
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import { MUSIC_TRACKS, musicDuck, musicMode, pauseGapMs } from '../src/musicDirector.js'

const base = { view: 'operations', doomsday: 10, pendingCrisis: false, endingCode: null } as const

describe('musicMode — vad som spelas när (docs/LJUDTILLGANGAR.md avsnitt 2)', () => {
  it('huvudmeny, New Game och Briefing spelar titelmusiken', () => {
    for (const view of ['menu', 'new-game', 'briefing']) {
      expect(musicMode({ ...base, view })).toBe('title')
    }
  })

  it('kartan och övriga spelskärmar spelar lugn musik under bevakningströskeln', () => {
    for (const view of ['operations', 'contracts', 'company', 'contacts', 'news']) {
      expect(musicMode({ ...base, view, doomsday: DISPLAY_THRESHOLDS.doomsdayCrisisWatch - 1 })).toBe('ops-calm')
    }
  })

  it('spänningsmusik exakt vid bevakningströskeln och över, tillbaka till lugn när värdet sjunker', () => {
    const at = DISPLAY_THRESHOLDS.doomsdayCrisisWatch
    expect(musicMode({ ...base, doomsday: at })).toBe('ops-tension')
    expect(musicMode({ ...base, doomsday: 99 })).toBe('ops-tension')
    expect(musicMode({ ...base, doomsday: at - 1 })).toBe('ops-calm')
  })

  it('en pågående kris slår allt annat i spelet, även hög doomsday', () => {
    expect(musicMode({ ...base, doomsday: 90, pendingCrisis: true })).toBe('crisis')
    expect(musicMode({ ...base, view: 'news', pendingCrisis: true })).toBe('crisis')
  })

  it('epilogen väljer spår efter slutorsak: kärnvapenutbyte får sitt eget, allt annat "överlevde"', () => {
    expect(musicMode({ ...base, view: 'epilogue', endingCode: 'NUCLEAR_EXCHANGE' })).toBe('epilogue-exchange')
    for (const code of ['INSOLVENCY', 'BUYOUT', 'EXPOSURE', 'SCENARIO_COMPLETE'] as const) {
      expect(musicMode({ ...base, view: 'epilogue', endingCode: code })).toBe('epilogue-survived')
    }
  })

  it('epilogen utan känd slutorsak faller tillbaka på "överlevde", aldrig tystnad', () => {
    expect(musicMode({ ...base, view: 'epilogue', endingCode: null })).toBe('epilogue-survived')
  })

  it('en krispost påverkar inte titel- eller epilogskärmarna (kortet visas bara i spelet)', () => {
    expect(musicMode({ ...base, view: 'menu', pendingCrisis: true })).toBe('title')
    expect(musicMode({ ...base, view: 'epilogue', pendingCrisis: true, endingCode: 'BUYOUT' })).toBe('epilogue-survived')
  })
})

describe('MUSIC_TRACKS — varje läge har minst ett spår, lugn musik har två att växla mellan', () => {
  it('alla lägen har spår, och alla vägar pekar under /music/', () => {
    for (const [mode, tracks] of Object.entries(MUSIC_TRACKS)) {
      expect(tracks.length, mode).toBeGreaterThan(0)
      for (const url of tracks) expect(url, mode).toMatch(/^\/music\/[a-z-]+\.mp3$/)
    }
  })

  it('ops-calm har två spår (M2 och M3), övriga lägen ett', () => {
    expect(MUSIC_TRACKS['ops-calm']).toEqual(['/music/ops-calm-a.mp3', '/music/ops-calm-b.mp3'])
    expect(MUSIC_TRACKS.title).toHaveLength(1)
    expect(MUSIC_TRACKS.crisis).toHaveLength(1)
  })
})

describe('pauseGapMs — 20–60 s tystnad mellan spår (avsnitt 2 "Musik med pauser")', () => {
  it('håller sig inom 20 000–60 000 ms för många uppspelningar, och är deterministisk', () => {
    for (let n = 0; n < 200; n++) {
      const gap = pauseGapMs(n)
      expect(gap).toBeGreaterThanOrEqual(20_000)
      expect(gap).toBeLessThanOrEqual(60_000)
      expect(pauseGapMs(n)).toBe(gap)
    }
  })

  it('varierar mellan uppspelningar i stället för att vara konstant', () => {
    const gaps = new Set(Array.from({ length: 10 }, (_, n) => pauseGapMs(n)))
    expect(gaps.size).toBeGreaterThan(3)
  })
})

describe('musicDuck — kvartalsuppspelningen sänker musiken 6 dB', () => {
  it('halv amplitud (≈ −6 dB) under uppspelningen, full annars', () => {
    expect(musicDuck(true)).toBeCloseTo(0.5, 2)
    expect(musicDuck(false)).toBe(1)
  })
})
