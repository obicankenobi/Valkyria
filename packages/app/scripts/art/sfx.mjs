// art/sfx.mjs — syntetiserade ljudeffekter (ETAPP10_FORSLAG.md beslut 10N, §11 punkt 4). De 18 effekter och 2 miljöljud som docs/LJUDTILLGANGAR.md
// avsnitt 3 listar men som aldrig hämtats byggs här ur ffmpegs egna källor (sinus, brus, uttryck) — föremål på ett bord 1965: bakelitknapp,
// registerkort, gummistämpel, skrivmaskin, teleprinter, fingerskiva, telefon. Korta, torra, mono, utan efterklang. Allt är DETERMINISTISKT:
// brus kommer från anoisesrc med fast frö och envelopper från uttryck, så samma recept ger samma ljud.
//
// Ett recept är en lista LAGER som mixas: { type:'noise'|'tone'|'expr', d, env, filter, gain, at }. Byggaren (buildFilterGraph) gör en ffmpeg-
// filtergraf av dem: varje lager blir en källa × en envelopp (amultiply), fördröjs med `at` sekunder och mixas. build-sfx.mjs kör ffmpeg.
//
// 10N: en syntetiserad effekt som inte håller måttet vid ägarens genomlyssning lämnas tyst — ta bort filen i public/sounds/ (motorn tiger om
// effekter som saknas). Måtten som går att kontrollera utan öron (längd, nivå, tystnad, determinism) binds av test/artFactory.test.ts.
import { spawnSync } from 'node:child_process'

export const SAMPLE_RATE = 44100

// Korta former för vanliga envelopper.
const decay = (k) => `exp(-t*${k})`
// Mjuk upp-och-ned över hela lagret (halv sinus i kvadrat), för papper som dras.
const swell = (d) => `pow(sin(PI*t/${d}),2)`

export const SFX_RECIPES = {
  // Bakelitströmbrytare: ett torrt klick med en dov duns under.
  'button-press': {
    duration: 0.09,
    layers: [
      { type: 'noise', seed: 1, d: 0.05, env: decay(240), filter: 'highpass=f=1500,lowpass=f=7500', gain: 0.9 },
      { type: 'tone', freq: 170, d: 0.08, env: decay(80), gain: 0.7 },
      { type: 'tone', freq: 2600, d: 0.03, env: decay(500), gain: 0.25 },
    ],
  },
  // Hovring på skrivbord: nästan ingenting, ett fjäderlätt tick.
  hover: {
    duration: 0.05,
    layers: [
      { type: 'noise', seed: 2, d: 0.03, env: decay(320), filter: 'highpass=f=4000', gain: 0.28 },
      { type: 'tone', freq: 1900, d: 0.03, env: decay(300), gain: 0.1 },
    ],
  },
  // Metallflik: ett ljust klick med två oövertonsrika toner.
  'tab-switch': {
    duration: 0.16,
    layers: [
      { type: 'noise', seed: 3, d: 0.06, env: decay(170), filter: 'bandpass=f=3200:t=h:w=2400', gain: 0.65 },
      { type: 'tone', freq: 920, d: 0.14, env: decay(48), gain: 0.32 },
      { type: 'tone', freq: 1390, d: 0.14, env: decay(60), gain: 0.2 },
    ],
  },
  // Manillamapp som dras över bordet och slutar med en liten duns när den läggs.
  'sheet-open': {
    duration: 0.34,
    layers: [
      { type: 'noise', seed: 4, color: 'pink', d: 0.3, env: `${swell(0.3)}*(0.72+0.28*sin(2*PI*33*t))`, filter: 'highpass=f=700,lowpass=f=5200', gain: 0.5 },
      { type: 'tone', freq: 120, d: 0.06, env: decay(55), gain: 0.35, at: 0.27 },
    ],
  },
  'sheet-close': {
    duration: 0.28,
    layers: [
      { type: 'noise', seed: 5, color: 'pink', d: 0.2, env: `${swell(0.2)}*(0.75+0.25*sin(2*PI*29*t))`, filter: 'highpass=f=800,lowpass=f=4800', gain: 0.45 },
      { type: 'noise', seed: 6, d: 0.06, env: decay(110), filter: 'lowpass=f=1400', gain: 0.5, at: 0.2 },
      { type: 'tone', freq: 105, d: 0.07, env: decay(50), gain: 0.4, at: 0.2 },
    ],
  },
  // Registerkort som läggs på bordet: en mjuk smäll, ett kort hasande efter.
  'card-place': {
    duration: 0.2,
    layers: [
      { type: 'noise', seed: 7, d: 0.06, env: decay(95), filter: 'lowpass=f=3600', gain: 0.65 },
      { type: 'tone', freq: 150, d: 0.1, env: decay(46), gain: 0.55 },
      { type: 'noise', seed: 8, color: 'pink', d: 0.08, env: swell(0.08), filter: 'highpass=f=1500,lowpass=f=5000', gain: 0.2, at: 0.05 },
    ],
  },
  'card-remove': {
    duration: 0.2,
    layers: [
      { type: 'noise', seed: 9, color: 'pink', d: 0.16, env: `${swell(0.16)}*(0.7+0.3*sin(2*PI*40*t))`, filter: 'highpass=f=1100,lowpass=f=5600', gain: 0.4 },
      { type: 'noise', seed: 10, d: 0.02, env: decay(300), filter: 'highpass=f=2500', gain: 0.35, at: 0.17 },
    ],
  },
  // Gummistämpel: en dov duns med lite pressande gummi ovanpå.
  stamp: {
    duration: 0.42,
    layers: [
      { type: 'tone', freq: 82, d: 0.38, env: decay(22), gain: 0.95 },
      { type: 'tone', freq: 164, d: 0.2, env: decay(38), gain: 0.35 },
      { type: 'noise', seed: 11, d: 0.2, env: decay(42), filter: 'lowpass=f=950', gain: 0.55 },
      { type: 'noise', seed: 12, d: 0.1, env: decay(40), filter: 'bandpass=f=2600:t=h:w=2200', gain: 0.22, at: 0.01 },
    ],
  },
  // Skrivmaskin: fyra slag, oregelbundet — som en hand, inte en klocka.
  typewriter: {
    duration: 0.52,
    layers: [0, 0.09, 0.185, 0.3].flatMap((at, i) => [
      { type: 'noise', seed: 20 + i, d: 0.04, env: decay(200), filter: 'bandpass=f=4200:t=h:w=5000', gain: 0.72, at },
      { type: 'tone', freq: 1100 + i * 90, d: 0.04, env: decay(180), gain: 0.22, at },
      { type: 'tone', freq: 140, d: 0.05, env: decay(90), gain: 0.3, at },
    ]),
  },
  // Blyerts som ringar in en nivå: ett skrapande streck med fram-och-tillbaka-rörelse.
  'tier-select': {
    duration: 0.24,
    layers: [{ type: 'noise', seed: 30, d: 0.22, env: `${swell(0.22)}*(0.55+0.45*sin(2*PI*23*t))`, filter: 'highpass=f=3600,lowpass=f=9500', gain: 0.4 }],
  },
  // Blyerts som knackar på papper: två mjuka knackningar.
  'map-select': {
    duration: 0.24,
    layers: [0, 0.12].flatMap((at, i) => [
      { type: 'noise', seed: 31 + i, d: 0.04, env: decay(150), filter: 'lowpass=f=2600', gain: 0.55, at },
      { type: 'tone', freq: 330 - i * 20, d: 0.06, env: decay(105), gain: 0.5, at },
    ]),
  },
  // Liten teleprinterklocka: ett enda ljust klang med en oharmonisk överton.
  'order-new': {
    duration: 0.7,
    layers: [
      { type: 'tone', freq: 2093, d: 0.65, env: decay(8), gain: 0.5 },
      { type: 'tone', freq: 5775, d: 0.4, env: decay(15), gain: 0.14 },
      { type: 'tone', freq: 3140, d: 0.4, env: decay(11), gain: 0.18 },
      { type: 'noise', seed: 40, d: 0.012, env: decay(900), filter: 'highpass=f=3000', gain: 0.35 },
    ],
  },
  // Mekaniskt räkneverk: tre små tick i rad.
  'counter-tick': {
    duration: 0.17,
    layers: [0, 0.05, 0.1].flatMap((at, i) => [
      { type: 'noise', seed: 50 + i, d: 0.02, env: decay(420), filter: 'bandpass=f=3600:t=h:w=3000', gain: 0.5, at },
      { type: 'tone', freq: 1250, d: 0.025, env: decay(340), gain: 0.2, at },
    ]),
  },
  // Telefonsignal från 60-talet: två ringningar, klockan slår 22 gånger i sekunden.
  'crisis-phone': {
    duration: 2.1,
    layers: [0, 1.15].map((at) => ({
      type: 'expr',
      d: 0.8,
      expr: `(0.55+0.45*gte(sin(2*PI*22*t),0))*(sin(2*PI*1380*t)+0.8*sin(2*PI*1585*t))*0.5*min(1,t*40)*min(1,(0.8-t)*30)`,
      filter: 'highpass=f=500,lowpass=f=4200',
      gain: 0.5,
      at,
    })),
  },
  // Fingerskiva som dras tillbaka: ett rasslande surr med sex klick.
  backchannel: {
    duration: 0.82,
    layers: [
      { type: 'noise', seed: 60, color: 'brown', d: 0.7, env: `min(1,t*12)*min(1,(0.7-t)*10)*(0.55+0.45*sin(2*PI*17*t))`, filter: 'bandpass=f=1300:t=h:w=1800', gain: 0.55 },
      ...[0.05, 0.16, 0.27, 0.38, 0.49, 0.6].map((at, i) => ({ type: 'noise', seed: 61 + i, d: 0.02, env: decay(400), filter: 'bandpass=f=3000:t=h:w=3000', gain: 0.5, at })),
    ],
  },
  // Radiobrus som klipps: brus med snabb flimmer som tystnar tvärt.
  'static-burst': {
    duration: 0.36,
    layers: [{ type: 'noise', seed: 70, d: 0.3, env: `(0.62+0.38*sin(2*PI*53*t)*sin(2*PI*7*t))*min(1,t*60)`, filter: 'highpass=f=900,lowpass=f=6500', gain: 0.5 }],
  },
  // End Quarter: teleprintern slår en rad, vagnen slår tillbaka, och klockan ringer.
  'turn-end': {
    duration: 1.3,
    layers: [
      { type: 'noise', seed: 80, d: 0.5, env: `(0.45+0.55*gte(sin(2*PI*21*t),-0.2))*(1-0.5*t)*min(1,t*30)*min(1,(0.5-t)*20)`, filter: 'bandpass=f=3800:t=h:w=4200', gain: 0.5 },
      { type: 'tone', freq: 118, d: 0.12, env: decay(38), gain: 0.55, at: 0.52 },
      { type: 'noise', seed: 81, d: 0.05, env: decay(150), filter: 'lowpass=f=2400', gain: 0.4, at: 0.52 },
      { type: 'tone', freq: 2093, d: 0.7, env: decay(7), gain: 0.42, at: 0.6 },
      { type: 'tone', freq: 3140, d: 0.4, env: decay(11), gain: 0.14, at: 0.6 },
    ],
  },
  // Doomsday passerar en tröskel: en avlägsen siren som varvar upp, utan efterklang.
  'doomsday-threshold': {
    duration: 1.4,
    layers: [
      {
        type: 'expr',
        d: 1.3,
        expr: `sin(2*PI*(380*t+330*t*t))*min(1,t*8)*min(1,(1.3-t)*5)*(0.8+0.2*sin(2*PI*5*t))`,
        filter: 'lowpass=f=2600',
        gain: 0.34,
      },
      { type: 'expr', d: 1.3, expr: `0.35*sin(2*PI*(760*t+660*t*t))*min(1,t*8)*min(1,(1.3-t)*5)`, filter: 'lowpass=f=3200', gain: 0.22 },
    ],
  },
  // Teleprinter, loopbar (4 × 3 sekunder): slag i jämn takt, en kort paus och en vagnsretur varje 3:e sekund.
  'telex-loop': {
    duration: 12,
    bitrate: '64k',
    loop: true,
    layers: [
      {
        type: 'noise',
        seed: 90,
        d: 12,
        env: `lt(mod(t,3),2.35)*exp(-mod(t,0.085)*230)*(0.55+0.45*pow(sin(31*t),2))`,
        filter: 'bandpass=f=3600:t=h:w=4800',
        gain: 0.5,
      },
      { type: 'expr', d: 12, expr: `gte(mod(t,3),2.5)*lt(mod(t,3),2.8)*exp(-(mod(t,3)-2.5)*26)*sin(2*PI*115*t)`, gain: 0.45 },
      { type: 'noise', seed: 91, d: 12, env: `gte(mod(t,3),2.5)*lt(mod(t,3),2.6)*exp(-(mod(t,3)-2.5)*60)`, filter: 'lowpass=f=2200', gain: 0.4 },
    ],
  },
  // Rumsljud, loopbar (60 sekunder): ventilation, en klocka som tickar och avlägsna skrivmaskiner. Mycket lågt.
  'room-tone': {
    duration: 60,
    bitrate: '48k',
    loop: true,
    layers: [
      { type: 'noise', seed: 100, color: 'brown', d: 60, env: '1', filter: 'highpass=f=60,lowpass=f=520', gain: 0.24 },
      { type: 'noise', seed: 101, color: 'pink', d: 60, env: '1', filter: 'bandpass=f=1800:t=h:w=2400', gain: 0.025 },
      { type: 'noise', seed: 102, d: 60, env: `exp(-mod(t,1)*220)`, filter: 'bandpass=f=2800:t=h:w=2400', gain: 0.045 },
      { type: 'noise', seed: 103, d: 60, env: `(gte(mod(t,13),9.1)*lt(mod(t,13),9.6)+gte(mod(t,29),20.2)*lt(mod(t,29),21.0))*exp(-mod(t,0.11)*160)`, filter: 'bandpass=f=3800:t=h:w=4200', gain: 0.07 },
    ],
  },
}

export const SFX_NAMES = Object.keys(SFX_RECIPES)

// ── filtergrafen ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MONO = 'aformat=sample_fmts=fltp:channel_layouts=mono'

function layerChain(layer, index) {
  const d = layer.d
  const steps = []
  const label = `l${index}`
  if (layer.type === 'noise') {
    const env = layer.env ?? '1'
    steps.push(`anoisesrc=color=${layer.color ?? 'white'}:seed=${layer.seed}:amplitude=1:duration=${d}:sample_rate=${SAMPLE_RATE},${MONO}${layer.filter ? `,${layer.filter}` : ''}[n${index}]`)
    steps.push(`aevalsrc=exprs='${env}':duration=${d}:sample_rate=${SAMPLE_RATE}:channel_layout=mono,${MONO}[e${index}]`)
    steps.push(`[n${index}][e${index}]amultiply[m${index}]`)
  } else if (layer.type === 'tone') {
    steps.push(`aevalsrc=exprs='${layer.env ?? '1'}*sin(2*PI*${layer.freq}*t)':duration=${d}:sample_rate=${SAMPLE_RATE}:channel_layout=mono,${MONO}${layer.filter ? `,${layer.filter}` : ''}[m${index}]`)
  } else if (layer.type === 'expr') {
    steps.push(`aevalsrc=exprs='${layer.expr}':duration=${d}:sample_rate=${SAMPLE_RATE}:channel_layout=mono,${MONO}${layer.filter ? `,${layer.filter}` : ''}[m${index}]`)
  } else throw new Error(`okänd lagertyp ${layer.type}`)
  const delayMs = Math.round((layer.at ?? 0) * 1000)
  steps.push(`[m${index}]volume=${layer.gain ?? 1}${delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : ''}[${label}]`)
  return steps
}

// Hela filtergrafen för ett recept; slutetiketten är [out].
export function buildFilterGraph(recipe) {
  const steps = recipe.layers.flatMap((layer, i) => layerChain(layer, i))
  const labels = recipe.layers.map((_, i) => `[l${i}]`).join('')
  const mixed = recipe.layers.length > 1 ? `${labels}amix=inputs=${recipe.layers.length}:normalize=0:duration=longest:dropout_transition=0[mix]` : `[l0]anull[mix]`
  const fade = recipe.loop ? `afade=t=in:d=0.03,afade=t=out:st=${round(recipe.duration - 0.03)}:d=0.03,` : ''
  const tail = `[mix]apad=whole_dur=${recipe.duration},atrim=duration=${recipe.duration},${fade}alimiter=limit=0.89:level=disabled:attack=1:release=20,aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=mono[out]`
  return [...steps, mixed, tail].join(';')
}

const round = (n) => Math.round(n * 1000) / 1000

// ffmpeg-argumenten för ett recept (utan binär): mono MP3, inga metadata, bitexakt kodning.
export function ffmpegArgs(name, outPath, format = 'mp3') {
  const recipe = SFX_RECIPES[name]
  if (!recipe) throw new Error(`okänd effekt ${name}`)
  const common = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex', buildFilterGraph(recipe), '-map', '[out]', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact']
  if (format === 'f32le') return [...common, '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', outPath]
  return [...common, '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', recipe.bitrate ?? '96k', outPath]
}

export function findFfmpeg(env = process.env) {
  const candidate = env.FFMPEG || 'ffmpeg'
  const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8' })
  return probe.status === 0 ? candidate : null
}

// Renderar en effekt till råa float-prover (för mätning i tester och granskning). Returnerar Float32Array.
export function renderPcm(name, ffmpeg) {
  const result = spawnSync(ffmpeg, ffmpegArgs(name, 'pipe:1', 'f32le'), { maxBuffer: 1 << 28 })
  if (result.status !== 0) throw new Error(`ffmpeg misslyckades för ${name}:\n${result.stderr?.toString()}`)
  const buf = result.stdout
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
}

// Mätvärden som går att kontrollera utan öron.
export function measure(samples) {
  let peak = 0
  let sum = 0
  let sq = 0
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s))
    sum += s
    sq += s * s
  }
  const n = samples.length || 1
  return { seconds: samples.length / SAMPLE_RATE, peak, rms: Math.sqrt(sq / n), dc: sum / n }
}
