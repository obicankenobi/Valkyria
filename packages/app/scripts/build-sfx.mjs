#!/usr/bin/env node
// build-sfx.mjs — P155 (ETAPP10_FORSLAG.md beslut 10N). Syntetiserar de 18 saknade effekterna och de två miljöljuden med ffmpeg till
// packages/app/public/sounds/<namn>.mp3 — de filnamn src/sound.ts redan frågar efter. Receptet för varje ljud finns i scripts/art/sfx.mjs.
//
//   npm run build:sfx --workspace=packages/app            alla
//   npm run build:sfx --workspace=packages/app -- stamp   bara de namngivna
//
// Kräver ffmpeg med libmp3lame: i PATH, eller peka ut den med FFMPEG=/sökväg/till/ffmpeg. newsreel-sting (musikmappens) rörs inte.
// En effekt som inte håller måttet vid genomlyssning lämnas tyst genom att filen tas bort ur public/sounds/ (beslut 10N).
import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SFX_NAMES, ffmpegArgs, findFfmpeg } from './art/sfx.mjs'

const OUT = join(fileURLToPath(new URL('..', import.meta.url)), 'public/sounds')

export function main(argv = process.argv.slice(2)) {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    console.error('build:sfx — hittar ingen ffmpeg (sätt FFMPEG=/sökväg/till/ffmpeg)')
    process.exitCode = 1
    return
  }
  const wanted = argv.length > 0 ? argv : SFX_NAMES
  for (const name of wanted) if (!SFX_NAMES.includes(name)) throw new Error(`okänd effekt "${name}" — giltiga: ${SFX_NAMES.join(', ')}`)
  mkdirSync(OUT, { recursive: true })
  let total = 0
  for (const name of wanted) {
    const out = join(OUT, `${name}.mp3`)
    mkdirSync(dirname(out), { recursive: true })
    const result = spawnSync(ffmpeg, ffmpegArgs(name, out), { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`ffmpeg misslyckades för ${name}:\n${result.stderr}`)
    const size = statSync(out).size
    total += size
    console.log(`sfx   ${name}.mp3  ${(size / 1024).toFixed(1)} KB`)
  }
  console.log(`build:sfx — ${wanted.length} filer, ${(total / 1024).toFixed(0)} KB`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
