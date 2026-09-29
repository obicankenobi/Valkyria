// sound.test.ts — P72 klart-når (ETAPP6_TEKNISK_SPEC.md §5): mute-flaggan och
// uppspelningskrokarna fungerar utan att en enda ljudfil finns i repot.
// jsdom saknar AudioContext HELT (verifierat med ett fristående node-skript
// mot jsdom-paketet direkt, samma sorts miljölucka som matchMedia/indexedDB
// — se TheWire.reveal.test.tsx/P65) — playSound() måste alltså aldrig kasta
// när ljud-API:t helt saknas, det är precis den tysta infrastrukturen P72
// efterfrågar.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  AMBIENCE_NAMES,
  SOUND_EFFECTS,
  crossedDoomsdayThreshold,
  getChannelVolume,
  getVolume,
  initAudioLifecycle,
  isMuted,
  isThrottled,
  playSound,
  setAmbience,
  setChannelVolume,
  setMusicDuck,
  setMusicMode,
  setMuted,
  setVolume,
  soundUrl,
} from '../src/sound.js'

describe('sound — mute-flaggan (P72 klart-når)', () => {
  it('setMuted/isMuted håller flaggan, default är omutad', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
  })
})

describe('sound — volym (P90)', () => {
  it('setVolume/getVolume håller värdet, default är 1', () => {
    expect(getVolume()).toBe(1)
    setVolume(0.5)
    expect(getVolume()).toBe(0.5)
    setVolume(1)
  })

  it('klampar värdet till [0, 1]', () => {
    setVolume(-5)
    expect(getVolume()).toBe(0)
    setVolume(50)
    expect(getVolume()).toBe(1)
    setVolume(1)
  })

  it('playSound kraschar inte vid en annan volym än default (jsdom saknar AudioContext helt, samma gräns som ovan)', async () => {
    setVolume(0)
    await expect(playSound('turn-end')).resolves.toBeUndefined()
    setVolume(1)
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

// P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md avsnitt 5): samma
// regel som P72 — allt tiger i jsdom, som helt saknar AudioContext.
describe('sound — P93: alla effekter, musik och miljöljud tiger utan ljud-API', () => {
  it('playSound kraschar aldrig för någon av effekterna', async () => {
    for (const effect of SOUND_EFFECTS) {
      await expect(playSound(effect)).resolves.toBeUndefined()
    }
  })

  it('setMusicMode, setMusicDuck och setAmbience kastar aldrig utan AudioContext', () => {
    expect(() => {
      setMusicMode('title')
      setMusicMode('ops-calm')
      setMusicMode(null)
      setMusicDuck(true)
      setMusicDuck(false)
      setAmbience(['room-tone', 'telex-loop'])
      setAmbience([])
    }).not.toThrow()
  })

  it('initAudioLifecycle installerar och städar utan att kasta', () => {
    const cleanup = initAudioLifecycle()
    expect(typeof cleanup).toBe('function')
    expect(() => cleanup()).not.toThrow()
  })
})

describe('sound — P93: effekttabellen', () => {
  it('varje effekt och miljöljud pekar på en unik fil under /sounds/', () => {
    const urls = [...SOUND_EFFECTS, ...AMBIENCE_NAMES].map((name) => soundUrl(name))
    expect(new Set(urls).size).toBe(urls.length)
    for (const url of urls) expect(url).toMatch(/^\/sounds\/[a-z-]+\.mp3$/)
  })

  it('de tre P72-krokarna finns kvar oförändrade', () => {
    expect(SOUND_EFFECTS).toEqual(expect.arrayContaining(['turn-end', 'doomsday-threshold', 'button-press']))
    expect(soundUrl('button-press')).toBe('/sounds/button-press.mp3')
  })

  it('täcker de effekter som specen namngav: hovring, kortplacering, stämpel, telex, radiobrus, rumsljud', () => {
    expect(SOUND_EFFECTS).toEqual(expect.arrayContaining(['hover', 'card-place', 'stamp', 'static-burst']))
    expect(AMBIENCE_NAMES).toEqual(['room-tone', 'telex-loop'])
  })
})

describe('sound — P93: kanalvolymer', () => {
  it('master är samma värde som setVolume/getVolume (P90)', () => {
    setVolume(0.4)
    expect(getChannelVolume('master')).toBe(0.4)
    setChannelVolume('master', 1)
    expect(getVolume()).toBe(1)
  })

  it('kanalvolymer klampas till 0–1 och har lugna standardnivåer för musik och rumsljud', () => {
    expect(getChannelVolume('music')).toBeLessThan(1)
    expect(getChannelVolume('ambience')).toBeLessThan(getChannelVolume('music'))
    setChannelVolume('sfx', 7)
    expect(getChannelVolume('sfx')).toBe(1)
    setChannelVolume('sfx', -3)
    expect(getChannelVolume('sfx')).toBe(0)
    setChannelVolume('sfx', 1)
  })
})

describe('sound — P93: isThrottled', () => {
  it('spelar första gången och när ingen gräns finns', () => {
    expect(isThrottled(undefined, 1000, 100)).toBe(false)
    expect(isThrottled(900, 1000, undefined)).toBe(false)
  })

  it('stryper en upprepning inom gränsen, släpper igenom exakt vid och efter den', () => {
    expect(isThrottled(1000, 1050, 100)).toBe(true)
    expect(isThrottled(1000, 1100, 100)).toBe(false)
    expect(isThrottled(1000, 1500, 100)).toBe(false)
  })
})
