// musicDirector — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 2 "Vad som spelas när"). Rena funktioner: speltillståndet in, vilket
// musikläge som ska gälla ut. Själva uppspelningen (sound.ts) läser bara
// resultatet — inga nya balanstal, doomsdaytröskeln är samma
// DISPLAY_THRESHOLDS.doomsdayCrisisWatch som HUD:ens mätare och
// kvartalsbandet redan använder.
import { DISPLAY_THRESHOLDS, type EndingCode } from '@seventh-front/core'

export type MusicMode = 'title' | 'ops-calm' | 'ops-tension' | 'crisis' | 'epilogue-survived' | 'epilogue-exchange'

export interface MusicInputs {
  view: string
  doomsday: number
  pendingCrisis: boolean
  endingCode: EndingCode | null
}

// Spelskärmarna med flikrad. Titel-/epilogskärmarna är utanför spelet.
export const IN_GAME_VIEWS: readonly string[] = ['operations', 'contracts', 'company', 'contacts', 'news']

const TITLE_VIEWS: readonly string[] = ['menu', 'new-game', 'briefing']

export function isInGameView(view: string): boolean {
  return IN_GAME_VIEWS.includes(view)
}

export function musicMode(input: MusicInputs): MusicMode {
  if (TITLE_VIEWS.includes(input.view)) return 'title'
  if (input.view === 'epilogue') {
    // Utan känd slutorsak faller det på "överlevde" — hellre ett lugnt slut än tystnad.
    return input.endingCode === 'NUCLEAR_EXCHANGE' ? 'epilogue-exchange' : 'epilogue-survived'
  }
  if (input.pendingCrisis) return 'crisis'
  return input.doomsday >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch ? 'ops-tension' : 'ops-calm'
}

// Kanonisk spårlista per läge. Filnamnen är de scripts/build-audio.mjs skriver
// till public/music/. Lugn musik har två spår som spelaren växlar mellan.
export const MUSIC_TRACKS: Record<MusicMode, readonly string[]> = {
  title: ['/music/title.mp3'],
  'ops-calm': ['/music/ops-calm-a.mp3', '/music/ops-calm-b.mp3'],
  'ops-tension': ['/music/ops-tension.mp3'],
  crisis: ['/music/crisis.mp3'],
  'epilogue-survived': ['/music/epilogue-survived.mp3'],
  'epilogue-exchange': ['/music/epilogue-exchange.mp3'],
}

// "Ett spår spelas, sedan 20–60 sekunders tystnad, sedan nästa." Deterministisk
// (ingen slump behövs för att variera pauserna) och alltid inom intervallet.
export function pauseGapMs(playCount: number): number {
  return 20_000 + ((playCount * 13_731 + 7_919) % 40_001)
}

// "Pågående spår sänks 6 dB" under kvartalsuppspelningen: 10^(−6/20) ≈ 0,5.
export function musicDuck(replaying: boolean): number {
  return replaying ? 0.5 : 1
}
