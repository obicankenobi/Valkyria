// sound.test.ts — P72 klart-når (ETAPP6_TEKNISK_SPEC.md §5): mute-flaggan och
// uppspelningskrokarna fungerar utan att en enda ljudfil finns i repot.
// jsdom saknar AudioContext HELT (verifierat med ett fristående node-skript
// mot jsdom-paketet direkt, samma sorts miljölucka som matchMedia/indexedDB
// — se TheWire.reveal.test.tsx/P65) — playSound() måste alltså aldrig kasta
// när ljud-API:t helt saknas, det är precis den tysta infrastrukturen P72
// efterfrågar.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { crossedDoomsdayThreshold, isMuted, playSound, setMuted } from '../src/sound.js'

describe('sound — mute-flaggan (P72 klart-når)', () => {
  it('setMuted/isMuted håller flaggan, default är omutad', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
  })
})

describe('sound — playSound kraschar aldrig (P72 klart-når)', () => {
  it('kraschar inte när AudioContext helt saknas (jsdom) och ljudet är omutat', async () => {
    setMuted(false)
    await expect(playSound('turn-end')).resolves.toBeUndefined()
  })

  it('kraschar inte, och gör ingenting, när muted är true', async () => {
    setMuted(true)
    await expect(playSound('doomsday-threshold')).resolves.toBeUndefined()
    setMuted(false)
  })

  it('kraschar inte för en okänd/kommande effekt-fil (button-press, ingen fil finns än)', async () => {
    await expect(playSound('button-press')).resolves.toBeUndefined()
  })
})

describe('sound — crossedDoomsdayThreshold (P72 klart-når, ren funktion)', () => {
  it('sant när after korsar en tröskel uppåt som before låg under', () => {
    expect(crossedDoomsdayThreshold(60, 76, [75])).toBe(true)
  })

  it('falskt när before redan låg på eller över tröskeln (ingen NY passage)', () => {
    expect(crossedDoomsdayThreshold(75, 80, [75])).toBe(false)
  })

  it('falskt när varken before eller after når tröskeln', () => {
    expect(crossedDoomsdayThreshold(10, 20, [75])).toBe(false)
  })

  it('sant om NÅGON av flera trösklar korsas, även om bara en gör det', () => {
    expect(crossedDoomsdayThreshold(60, 76, [50, 75, 95])).toBe(true)
  })

  it('sant vid exakt korsning (after == threshold räknas som nådd)', () => {
    expect(crossedDoomsdayThreshold(74, 75, [75])).toBe(true)
  })
})
