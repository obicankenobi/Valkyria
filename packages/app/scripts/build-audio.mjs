#!/usr/bin/env node
// build-audio.mjs — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 5 "Bearbetning"). Konverterar källfilerna i audio-src/ (ingår inte i
// bygget) till det appen faktiskt serverar:
//   audio-src/music/*.mp3  → packages/app/public/music/*.mp3   128 kbps, ≈ −16 LUFS
//   newsreel-sting         → packages/app/public/sounds/       klippt till ett par sekunder
//   audio-src/sfx/*        → packages/app/public/sounds/*.mp3  mono, tystnad bort, ≈ −20 LUFS
//
// Kräver ffmpeg: i PATH, eller peka ut den med miljövariabeln FFMPEG.
// Filformatet är MP3, inte AAC/.m4a som dokumentet föreslog: en Chromium utan
// proprietära codecs (Playwrights, alltså e2e-sviten) spelar inte AAC, medan
// MP3 spelas överallt, och 128 kbps håller budgeten (musik under 15 MB).
//
//   npm run build:audio --workspace=packages/app
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SRC_MUSIC = join(REPO_ROOT, 'audio-src/music')
const SRC_SFX = join(REPO_ROOT, 'audio-src/sfx')
const OUT_MUSIC = join(APP_DIR, 'public/music')
const OUT_SOUNDS = join(APP_DIR, 'public/sounds')

// Speglar SOUND_EFFECTS + AMBIENCE_NAMES i src/sound.ts — test/buildAudio.test.ts
// underkänner om listorna glider isär.
export const KNOWN_SFX = [
  'turn-end',
  'doomsday-threshold',
  'button-press',
  'hover',
  'tab-switch',
  'sheet-open',
  'sheet-close',
  'card-place',
  'card-remove',
  'stamp',
  'typewriter',
  'tier-select',
  'map-select',
  'order-new',
  'counter-tick',
  'crisis-phone',
  'backchannel',
  'static-burst',
  'newsreel-sting',
  'room-tone',
  'telex-loop',
]

// Musikspåren som konverteras rakt av; newsreel-sting är en effekt, se nedan.
export const MUSIC_FILES = [
  'title',
  'ops-calm-a',
  'ops-calm-b',
  'ops-tension',
  'crisis',
  'epilogue-survived',
  'epilogue-exchange',
]

// Längd på signaturen ur den 61 sekunder långa källfilen ("klipper ut 4–6 sekunder").
export const STING_SECONDS = 5.5

export const MUSIC_ARGS = [
  '-map_metadata', '-1',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-ar', '44100', '-ac', '2',
  '-c:a', 'libmp3lame', '-b:a', '128k',
]

export const STING_ARGS = [
  '-map_metadata', '-1',
  '-t', String(STING_SECONDS),
  '-af', `afade=t=out:st=${STING_SECONDS - 1}:d=1,loudnorm=I=-18:TP=-1.5:LRA=7`,
  '-ar', '44100', '-ac', '2',
  '-c:a', 'libmp3lame', '-b:a', '128k',
]

export const SFX_ARGS = [
  '-map_metadata', '-1',
  '-af',
  'silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=1:stop_threshold=-50dB:stop_duration=0.15,loudnorm=I=-20:TP=-1.5:LRA=7',
  '-ar', '44100', '-ac', '1',
  '-c:a', 'libmp3lame', '-b:a', '96k',
]

function ffmpeg(input, output, args) {
  const bin = process.env.FFMPEG || 'ffmpeg'
  const result = spawnSync(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, ...args, output], {
    encoding: 'utf8',
  })
  if (result.error) throw new Error(`Kunde inte köra ${bin}: ${result.error.message} (sätt FFMPEG=/sökväg/till/ffmpeg)`)
  if (result.status !== 0) throw new Error(`ffmpeg misslyckades för ${input}:\n${result.stderr}`)
}

function kb(path) {
  return `${Math.round(statSync(path).size / 1024)} KB`
}

function main() {
  mkdirSync(OUT_MUSIC, { recursive: true })
  mkdirSync(OUT_SOUNDS, { recursive: true })
  const missing = []

  for (const name of MUSIC_FILES) {
    const input = join(SRC_MUSIC, `${name}.mp3`)
    if (!existsSync(input)) {
      missing.push(`music/${name}`)
      continue
    }
    const output = join(OUT_MUSIC, `${name}.mp3`)
    ffmpeg(input, output, MUSIC_ARGS)
    console.log(`music   ${name}.mp3  ${kb(output)}`)
  }

  const stingIn = join(SRC_MUSIC, 'newsreel-sting.mp3')
  if (existsSync(stingIn)) {
    const output = join(OUT_SOUNDS, 'newsreel-sting.mp3')
    ffmpeg(stingIn, output, STING_ARGS)
    console.log(`sting   newsreel-sting.mp3  ${kb(output)}`)
  } else {
    missing.push('music/newsreel-sting')
  }

  const unknown = []
  const present = new Set(['newsreel-sting'])
  if (existsSync(SRC_SFX)) {
    for (const file of readdirSync(SRC_SFX)) {
      const name = basename(file, extname(file))
      if (name === 'newsreel-sting') continue // kommer från musikmappen
      if (!KNOWN_SFX.includes(name)) {
        unknown.push(file)
        continue
      }
      const output = join(OUT_SOUNDS, `${name}.mp3`)
      ffmpeg(join(SRC_SFX, file), output, SFX_ARGS)
      present.add(name)
      console.log(`sfx     ${name}.mp3  ${kb(output)}`)
    }
  }

  const missingSfx = KNOWN_SFX.filter((name) => !present.has(name))
  if (missing.length) console.log(`\nSaknas i audio-src/: ${missing.join(', ')}`)
  if (missingSfx.length) console.log(`\nEffekter utan källfil (motorn tiger om dem): ${missingSfx.join(', ')}`)
  if (unknown.length) console.log(`\nOkända filnamn i audio-src/sfx/ (hoppades över): ${unknown.join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
