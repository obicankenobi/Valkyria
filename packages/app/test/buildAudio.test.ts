// buildAudio.test.ts — P93. scripts/build-audio.mjs har en egen kopia av
// effektlistan (ett .mjs-skript kan inte importera .ts). Prosaregler om att hålla
// två listor lika har misslyckats i det här projektet — så testet binder dem.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AMBIENCE_NAMES, SOUND_EFFECTS } from '../src/sound.js'
import { MUSIC_TRACKS } from '../src/musicDirector.js'

// @ts-expect-error — ett .mjs-skript utan typdeklaration
import * as script from '../scripts/build-audio.mjs'

const PUBLIC = join(import.meta.dirname, '../public')

describe('build-audio.mjs håller sig i takt med appen', () => {
  it('KNOWN_SFX är exakt SOUND_EFFECTS plus miljöljuden', () => {
    expect([...script.KNOWN_SFX].sort()).toEqual([...SOUND_EFFECTS, ...AMBIENCE_NAMES].sort())
  })

  it('MUSIC_FILES täcker varje spår musikregissören kan be om', () => {
    const wanted = Object.values(MUSIC_TRACKS)
      .flat()
      .map((url) => url.replace('/music/', '').replace('.mp3', ''))
    expect([...script.MUSIC_FILES].sort()).toEqual([...new Set(wanted)].sort())
  })

  it('ingen musikfil är också en effekt (newsreel-sting är en effekt, inte ett musikspår)', () => {
    for (const name of script.MUSIC_FILES) expect(script.KNOWN_SFX).not.toContain(name)
  })
})

describe('public/music — de konverterade spåren finns och håller budgeten', () => {
  it('varje spår regissören kan be om finns som fil', () => {
    for (const url of Object.values(MUSIC_TRACKS).flat()) {
      expect(existsSync(join(PUBLIC, url)), url).toBe(true)
    }
  })

  it('musik totalt under 15 MB, effekter under 1 MB (docs/LJUDTILLGANGAR.md avsnitt 5 "Budget")', () => {
    const total = (urls: string[]) => urls.reduce((sum, u) => sum + statSync(join(PUBLIC, u)).size, 0)
    const music = [...new Set(Object.values(MUSIC_TRACKS).flat())]
    expect(total(music)).toBeLessThan(15 * 1024 * 1024)
    const sounds = [...SOUND_EFFECTS, ...AMBIENCE_NAMES].map((n) => `/sounds/${n}.mp3`).filter((u) => existsSync(join(PUBLIC, u)))
    expect(total(sounds)).toBeLessThan(1024 * 1024)
  })
})

describe('sw.js — Range-förfrågningar (206) får aldrig nå cache.put', () => {
  it('/music/ släpps förbi service workern INNAN respondWith anropas', () => {
    const source = readFileSync(join(PUBLIC, 'sw.js'), 'utf8')
    const bypass = source.indexOf("url.pathname.startsWith('/music/')")
    const respond = source.indexOf('event.respondWith(')
    expect(bypass).toBeGreaterThan(-1)
    expect(respond).toBeGreaterThan(bypass)
  })
})
