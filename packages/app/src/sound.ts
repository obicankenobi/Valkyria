// sound — Web Audio-baserad ljudmotor (P72 krokarna, P93 ljudpasset;
// ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md avsnitt 5).
//
// Regeln från P72 gäller oförändrad: VARJE fel sväljs tyst. En saknad fil
// (fetch !ok, en SPA-fallback som inte går att avkoda, ett 404 på ett
// mediaelement), en webbläsare utan Web Audio, en AudioContext som inte får
// startas före första tryck, och jsdom (som saknar AudioContext helt) ger alla
// tystnad — aldrig ett kastat fel eller ett konsolfel. Så fort en fil finns
// spelas den utan att koden här behöver röras.
//
// Två motorer, som avsnitt 5 föreskriver:
//  - Korta effekter avkodas till en AudioBuffer och cachas (playSound).
//  - Musik strömmas genom ett HTMLAudioElement kopplat till en
//    MediaElementAudioSourceNode, så den kan tonas via Web Audio utan att
//    avkodas till minnet (två minuter stereo är runt 40 MB som AudioBuffer).
//    Loopade miljöljud (rumsljud, teleprinter) är korta och loopas som buffer.
//
// Kanaler: master → { sfx, music, ambience } → destination. `volume` är master
// (samma reglage som P90:s Settings) — kanalvolymerna har API men inget eget
// reglage ännu.
import { musicDuck as _musicDuck, MUSIC_TRACKS, pauseGapMs, type MusicMode } from './musicDirector.js'

export type SoundEffect =
  | 'turn-end'
  | 'doomsday-threshold'
  | 'button-press'
  | 'hover'
  | 'tab-switch'
  | 'sheet-open'
  | 'sheet-close'
  | 'card-place'
  | 'card-remove'
  | 'stamp'
  | 'typewriter'
  | 'tier-select'
  | 'map-select'
  | 'order-new'
  | 'counter-tick'
  | 'crisis-phone'
  | 'backchannel'
  | 'static-burst'
  | 'newsreel-sting'

export type AmbienceName = 'room-tone' | 'telex-loop'

export const SOUND_EFFECTS: readonly SoundEffect[] = [
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
]

export const AMBIENCE_NAMES: readonly AmbienceName[] = ['room-tone', 'telex-loop']

export function soundUrl(name: SoundEffect | AmbienceName): string {
  return `/sounds/${name}.mp3`
}

// Relativ nivå per effekt. Hovring och räkneverk är bakgrundsdetaljer som inte
// får konkurrera med en handling; allt annat spelas på full kanalnivå.
const EFFECT_GAIN: Partial<Record<SoundEffect, number>> = {
  hover: 0.35,
  'counter-tick': 0.4,
}

// Minsta tid mellan två uppspelningar av samma effekt. Fem HUD-tal som börjar
// räkna samtidigt, eller en mus som sveper över en rad knappar, ska ge ETT ljud.
const EFFECT_MIN_INTERVAL_MS: Partial<Record<SoundEffect, number>> = {
  hover: 90,
  'counter-tick': 250,
  'card-remove': 60,
  'button-press': 40,
}

export function isThrottled(lastPlayedAt: number | undefined, now: number, minIntervalMs: number | undefined): boolean {
  if (!minIntervalMs || lastPlayedAt === undefined) return false
  return now - lastPlayedAt < minIntervalMs
}

export type Channel = 'master' | 'sfx' | 'music' | 'ambience'

// Musiken är normaliserad till −16 LUFS och ska ligga UNDER spelet ("den får
// aldrig kräva uppmärksamhet"); rumsljudet "mycket lågt".
const channelVolume: Record<Channel, number> = { master: 1, sfx: 1, music: 0.6, ambience: 0.3 }

let muted = false
let audioContext: AudioContext | null = null
let unlocked = false
const bufferCache = new Map<string, AudioBuffer | null>()
const lastPlayed = new Map<SoundEffect, number>()

interface Graph {
  master: GainNode
  sfx: GainNode
  music: GainNode
  ambience: GainNode
}
let graph: Graph | null = null

export function setMuted(value: boolean): void {
  muted = value
  applyChannelGains()
  syncMusic()
  syncAmbience()
}

export function isMuted(): boolean {
  return muted
}

// P90: en global volym (0–1) = masterkanalen.
export function setVolume(value: number): void {
  channelVolume.master = Math.min(1, Math.max(0, value))
  applyChannelGains()
}

export function getVolume(): number {
  return channelVolume.master
}

export function setChannelVolume(channel: Channel, value: number): void {
  channelVolume[channel] = Math.min(1, Math.max(0, value))
  applyChannelGains()
}

export function getChannelVolume(channel: Channel): number {
  return channelVolume[channel]
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) {
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  return audioContext
}

function getGraph(ctx: AudioContext): Graph {
  if (graph) return graph
  const master = ctx.createGain()
  const sfx = ctx.createGain()
  const music = ctx.createGain()
  const ambience = ctx.createGain()
  sfx.connect(master)
  music.connect(master)
  ambience.connect(master)
  master.connect(ctx.destination)
  graph = { master, sfx, music, ambience }
  applyChannelGains()
  return graph
}

let duck = 1

function applyChannelGains(): void {
  if (!graph || !audioContext) return
  const now = audioContext.currentTime
  const set = (node: GainNode, value: number) => node.gain.setTargetAtTime(value, now, 0.05)
  set(graph.master, muted ? 0 : channelVolume.master)
  set(graph.sfx, channelVolume.sfx)
  set(graph.music, channelVolume.music * duck)
  set(graph.ambience, channelVolume.ambience)
}

// ── Effekter ──

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(url)) return bufferCache.get(url) ?? null
  try {
    const response = await fetch(url)
    if (!response.ok) {
      bufferCache.set(url, null)
      return null
    }
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    bufferCache.set(url, buffer)
    return buffer
  } catch {
    // Nätverksfel, decodeAudioData på en trasig/saknad fil, m.m. — ett ännu
    // inte skaffat ljud är inte ett programfel.
    bufferCache.set(url, null)
    return null
  }
}

export async function playSound(effect: SoundEffect): Promise<void> {
  if (muted) return
  const ctx = getAudioContext()
  if (!ctx) return
  const now = Date.now()
  if (isThrottled(lastPlayed.get(effect), now, EFFECT_MIN_INTERVAL_MS[effect])) return
  lastPlayed.set(effect, now)
  const buffer = await loadBuffer(ctx, soundUrl(effect))
  if (!buffer) return
  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const level = ctx.createGain()
    level.gain.value = EFFECT_GAIN[effect] ?? 1
    source.connect(level)
    level.connect(getGraph(ctx).sfx)
    source.start()
  } catch {
    // En AudioContext som stängts eller avbrutits — tystnad, inte ett fel.
  }
}

// ── Miljöljud (loopade buffrar på ambience-kanalen) ──

interface AmbienceNode {
  source: AudioBufferSourceNode
  gain: GainNode
}
const ambienceNodes = new Map<AmbienceName, AmbienceNode>()
let desiredAmbience: readonly AmbienceName[] = []

export function setAmbience(layers: readonly AmbienceName[]): void {
  desiredAmbience = layers
  syncAmbience()
}

function syncAmbience(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const want = muted || !unlocked ? [] : desiredAmbience
  for (const [name, node] of ambienceNodes) {
    if (want.includes(name)) continue
    ambienceNodes.delete(name)
    try {
      node.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
      node.source.stop(ctx.currentTime + 1)
    } catch {
      // redan stoppad
    }
  }
  for (const name of want) {
    if (ambienceNodes.has(name)) continue
    void startAmbience(ctx, name)
  }
}

async function startAmbience(ctx: AudioContext, name: AmbienceName): Promise<void> {
  const buffer = await loadBuffer(ctx, soundUrl(name))
  // Läget kan ha ändrats medan filen hämtades.
  if (!buffer || muted || !unlocked || !desiredAmbience.includes(name) || ambienceNodes.has(name)) return
  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.4)
    source.connect(gain)
    gain.connect(getGraph(ctx).ambience)
    source.start()
    ambienceNodes.set(name, { source, gain })
  } catch {
    // tystnad
  }
}

// ── Musik (strömmad, ett spår i taget, tonas över, pauser mellan spår) ──

const CROSSFADE_S = 3.5

interface Track {
  el: HTMLAudioElement
  gain: GainNode
  node: MediaElementAudioSourceNode
}

let desiredMusic: MusicMode | null = null
let playingMode: MusicMode | null = null
let currentTrack: Track | null = null
let gapTimer: ReturnType<typeof setTimeout> | null = null
let playCount = 0
let calmIndex = 0

export function setMusicMode(mode: MusicMode | null): void {
  desiredMusic = mode
  syncMusic()
}

export function setMusicDuck(replaying: boolean): void {
  duck = _musicDuck(replaying)
  applyChannelGains()
}

function clearGap(): void {
  if (gapTimer !== null) {
    clearTimeout(gapTimer)
    gapTimer = null
  }
}

function fadeOutAndDispose(track: Track, ctx: AudioContext, seconds: number): void {
  try {
    track.gain.gain.cancelScheduledValues(ctx.currentTime)
    track.gain.gain.setValueAtTime(track.gain.gain.value, ctx.currentTime)
    track.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds)
  } catch {
    // ignoreras
  }
  setTimeout(() => disposeTrack(track), seconds * 1000 + 100)
}

function disposeTrack(track: Track): void {
  try {
    track.el.pause()
    track.el.removeAttribute('src')
    track.el.load()
    track.node.disconnect()
    track.gain.disconnect()
  } catch {
    // ignoreras
  }
}

function syncMusic(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const want = muted || !unlocked ? null : desiredMusic
  if (want === playingMode && (want === null || currentTrack !== null || gapTimer !== null)) return
  clearGap()
  if (currentTrack) {
    fadeOutAndDispose(currentTrack, ctx, want === null ? 0.3 : CROSSFADE_S)
    currentTrack = null
  }
  playingMode = want
  if (want) startNextTrack(ctx, want)
}

function startNextTrack(ctx: AudioContext, mode: MusicMode): void {
  const tracks = MUSIC_TRACKS[mode]
  const url = tracks[calmIndex % tracks.length]
  if (!url) return
  try {
    const el = new Audio(url)
    el.preload = 'auto'
    const node = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    gain.gain.value = 0
    node.connect(gain)
    gain.connect(getGraph(ctx).music)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE_S)
    const track: Track = { el, gain, node }
    currentTrack = track
    el.addEventListener('ended', () => onTrackEnded(ctx, track, mode))
    // Saknad fil eller ett format webbläsaren inte kan spela: tystnad, ingen omstart.
    el.addEventListener('error', () => {
      if (currentTrack === track) currentTrack = null
      disposeTrack(track)
    })
    el.play().catch(() => {
      if (currentTrack === track) currentTrack = null
      disposeTrack(track)
    })
  } catch {
    currentTrack = null
  }
}

function onTrackEnded(ctx: AudioContext, track: Track, mode: MusicMode): void {
  if (currentTrack !== track) return
  currentTrack = null
  disposeTrack(track)
  playCount += 1
  calmIndex += 1
  // Epilogen spelas en gång och lämnar sedan tystnad; övriga lägen lägger in en
  // paus och spelar nästa spår.
  if (mode === 'epilogue-survived' || mode === 'epilogue-exchange') return
  gapTimer = setTimeout(() => {
    gapTimer = null
    if (playingMode === mode && !muted && unlocked) startNextTrack(ctx, mode)
  }, pauseGapMs(playCount))
}

// ── Livscykel: första tryck, appen i bakgrunden ──

// "AudioContext startar pausad tills användaren rört skärmen: anropa resume()
// vid första tryck. Pausa allt vid visibilitychange till hidden." Anropas en
// gång från App.tsx; returnerar en städfunktion.
export function initAudioLifecycle(): () => void {
  if (typeof document === 'undefined') return () => {}

  function unlock() {
    const ctx = getAudioContext()
    if (!ctx) return
    const finish = () => {
      unlocked = true
      applyChannelGains()
      syncMusic()
      syncAmbience()
    }
    if (ctx.state === 'running') finish()
    else ctx.resume().then(finish, () => {})
  }

  function onVisibility() {
    const ctx = audioContext
    if (!ctx) return
    if (document.visibilityState === 'hidden') {
      currentTrack?.el.pause()
      void ctx.suspend().catch(() => {})
    } else {
      void ctx
        .resume()
        .then(() => currentTrack?.el.play().catch(() => {}))
        .catch(() => {})
    }
  }

  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    document.removeEventListener('pointerdown', unlock)
    document.removeEventListener('keydown', unlock)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

// Ren, testbar utan DOM/Audio — P72:s "doomsday-tröskelpassage"-krok.
// DISPLAY_THRESHOLDS' tre doomsday-nivåer (watch/crisis/exchange) återanvänds
// direkt av App.tsx:s anrop, inget nytt balanstal här. "Passage" läst som en
// UPPÅTGÅENDE korsning av EN ELLER FLERA trösklar under en enda turövergång —
// before/after jämförs mot varje given tröskel var för sig.
export function crossedDoomsdayThreshold(before: number, after: number, thresholds: readonly number[]): boolean {
  return thresholds.some((threshold) => before < threshold && after >= threshold)
}
