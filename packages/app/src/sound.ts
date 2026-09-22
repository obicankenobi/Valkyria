// sound — Web Audio-baserade korta effekter (P72, ETAPP6_TEKNISK_SPEC.md §5).
// Noll ljudfiler finns i repot (§2/§8) — det här bygger den TYSTA
// infrastrukturen specen ber om: mute-flagga, uppspelningskrokar, en fast
// effekt→filväg-tabell (packages/app/public/sounds/, Vites vanliga
// statiska-filkonvention). playSound() slukar VARJE fel tyst (saknad fil →
// fetch ger !response.ok, trasig/saknad ljud-API, AudioContext helt frånvarande
// i jsdom — verifierat med ett fristående node-skript mot jsdom-paketet
// direkt, samma sorts miljölucka som matchMedia/indexedDB) i stället för att
// kasta — ett saknat eller ej ännu skaffat ljud får aldrig störa spelet. Så
// fort riktiga filer läggs i public/sounds/ spelas de automatiskt, utan att
// koden här behöver röras.
export type SoundEffect = 'turn-end' | 'doomsday-threshold' | 'button-press'

const SOUND_FILES: Record<SoundEffect, string> = {
  'turn-end': '/sounds/turn-end.mp3',
  'doomsday-threshold': '/sounds/doomsday-threshold.mp3',
  'button-press': '/sounds/button-press.mp3',
}

let muted = false
let audioContext: AudioContext | null = null
const bufferCache = new Map<SoundEffect, AudioBuffer | null>()

export function setMuted(value: boolean): void {
  muted = value
}

export function isMuted(): boolean {
  return muted
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

async function loadBuffer(ctx: AudioContext, effect: SoundEffect): Promise<AudioBuffer | null> {
  if (bufferCache.has(effect)) return bufferCache.get(effect) ?? null
  try {
    const response = await fetch(SOUND_FILES[effect])
    if (!response.ok) {
      bufferCache.set(effect, null)
      return null
    }
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    bufferCache.set(effect, buffer)
    return buffer
  } catch {
    // Nätverksfel, decodeAudioData på en trasig/saknad fil, m.m. — ett ännu
    // inte skaffat ljud är inte ett programfel.
    bufferCache.set(effect, null)
    return null
  }
}

export async function playSound(effect: SoundEffect): Promise<void> {
  if (muted) return
  const ctx = getAudioContext()
  if (!ctx) return
  const buffer = await loadBuffer(ctx, effect)
  if (!buffer) return
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
}

// Ren, testbar utan DOM/Audio — P72:s "doomsday-tröskelpassage"-krok.
// DISPLAY_THRESHOLDS' tre doomsday-nivåer (watch/crisis/exchange) återanvänds
// direkt av App.tsx:s anrop, inget nytt balanstal här. "Passage" läst som en
// UPPÅTGÅENDE korsning av EN ELLER FLERA trösklar under en enda turövergång —
// before/after jämförs mot varje given tröskel var för sig.
export function crossedDoomsdayThreshold(before: number, after: number, thresholds: readonly number[]): boolean {
  return thresholds.some((threshold) => before < threshold && after >= threshold)
}
