// shortcuts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 16): "Kortkommandon
// (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus." En ren
// beslutsfunktion: tangenttryck + läge in, vilken åtgärd som ska köras ut. Själva
// utförandet (ett klick på den riktiga fliken/knappen, så att spellogik,
// handledningssteg och ljud går precis som vid ett tryck) ligger i App.tsx.
//
// Etapp 14 (ägarbeslut 2026-11-09: "se över vilka kortkommandon som behövs och besluta själv"): layouten är byggd för en
// spelare med höger hand på musen och vänster på tangentbordet. Allt ligger inom räckhåll från 1–5:
//   1–5  mapparna (oförändrat)           [ ]  föregående / nästa registerflik i den öppna mappen
//   Enter avsluta kvartalet (oförändrat)  Space hoppa över / kvittera kvartalsuppspelningen
//   Q This Quarter   W telexarkivet   A handlingskatalogen   F fäll ut / fäll in mappen
//   L nästa kartlager   K teckenförklaringen   + − zooma kartan   0 kartan tillbaka till Indokina
//   H handboken   ? kortkommandona   Esc stänger det översta (landsakt, kartkort, utfälld mapp), sedan paus
// Förslagets 1–4 för mappflikarna byggdes inte: 1–5 (regel 16) behålls, och flikarna inuti en mapp ligger på [ och ] i stället.
// SHORTCUT_GROUPS nedan är den enda listan — handbokens uppslag "Keyboard" byggs ur den, så de kan inte glida isär.
import { TABS, type ShellView } from './components/Shell.js'

export interface ShortcutKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat: boolean
  targetTag: string | null // gemener, t.ex. 'button'
  targetRole: string | null
  targetEditable: boolean
}

export interface ShortcutContext {
  inGame: boolean // en spelskärm med flikrad är uppe (inte meny/New Game/Briefing/epilog)
  blocked: boolean // ett överlagg är öppet: paus, inställningar, handbok, ark, kris, uppspelning
  replaying?: boolean // kvartalsuppspelningen är uppe — då gäller bara Space (hoppa över / kvittera)
}

// Knappar som kortkommandot trycker på (data-testid).
export type PressTarget = 'quarterband-toggle' | 'open-wire-desk' | 'open-action-catalog' | 'folio-expand' | 'map-legend-button' | 'replay-skip'

export type ShortcutAction =
  | { kind: 'view'; view: ShellView }
  | { kind: 'end-quarter' }
  | { kind: 'press'; target: PressTarget }
  | { kind: 'folder-tab'; step: -1 | 1 }
  | { kind: 'map-zoom'; direction: 'in' | 'out' | 'reset' }
  | { kind: 'map-layer' }
  | { kind: 'handbook'; topic: 'index' | 'keyboard' }
  | null

// Element som redan svarar på Enter/Space själva — ett kortkommando ovanpå skulle
// ge ett dubbelt utlöst klick.
const ENTER_OWNERS_TAG = new Set(['button', 'a', 'summary'])
const ENTER_OWNERS_ROLE = new Set(['button', 'slider', 'radio', 'tab', 'switch', 'link', 'checkbox', 'menuitem'])
const EDITABLE_TAG = new Set(['input', 'textarea', 'select'])

function ownsActivation(event: ShortcutKey): boolean {
  return (event.targetTag !== null && ENTER_OWNERS_TAG.has(event.targetTag)) || (event.targetRole !== null && ENTER_OWNERS_ROLE.has(event.targetRole))
}

// Bokstavstangenter (gemener; Shift ger versal, som räknas likadant).
const LETTERS: Record<string, ShortcutAction> = {
  q: { kind: 'press', target: 'quarterband-toggle' },
  w: { kind: 'press', target: 'open-wire-desk' },
  a: { kind: 'press', target: 'open-action-catalog' },
  f: { kind: 'press', target: 'folio-expand' },
  k: { kind: 'press', target: 'map-legend-button' },
  l: { kind: 'map-layer' },
  h: { kind: 'handbook', topic: 'index' },
}

export function shortcutFor(event: ShortcutKey, context: ShortcutContext): ShortcutAction {
  if (!context.inGame) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.targetEditable || (event.targetTag !== null && EDITABLE_TAG.has(event.targetTag))) return null

  // Under kvartalsuppspelningen: bara Space (Skip, eller Continue när styrelsens PM visas).
  if (context.replaying) {
    if (event.key === ' ' && !event.repeat && !ownsActivation(event)) return { kind: 'press', target: 'replay-skip' }
    return null
  }
  if (context.blocked) return null

  if (event.key === 'Enter') {
    if (event.repeat || ownsActivation(event)) return null
    return { kind: 'end-quarter' }
  }

  // Zoomen får upprepas (håll ned + för att zooma in i ett svep); allt annat är ett tryck i taget.
  if (event.key === '+' || event.key === '=') return { kind: 'map-zoom', direction: 'in' }
  if (event.key === '-' || event.key === '_') return { kind: 'map-zoom', direction: 'out' }
  if (event.repeat) return null

  if (/^[1-5]$/.test(event.key)) {
    const tab = TABS[Number(event.key) - 1]
    return tab ? { kind: 'view', view: tab.view } : null
  }
  if (event.key === '0') return { kind: 'map-zoom', direction: 'reset' }
  if (event.key === '[') return { kind: 'folder-tab', step: -1 }
  if (event.key === ']') return { kind: 'folder-tab', step: 1 }
  if (event.key === '?') return { kind: 'handbook', topic: 'keyboard' }

  return LETTERS[event.key.toLowerCase()] ?? null
}

// Läser de fält shortcutFor behöver ur en riktig KeyboardEvent.
export function shortcutKeyFromEvent(event: KeyboardEvent): ShortcutKey {
  const target = event.target instanceof Element ? event.target : null
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: event.repeat,
    targetTag: target ? target.tagName.toLowerCase() : null,
    targetRole: target ? target.getAttribute('role') : null,
    targetEditable: target instanceof HTMLElement ? target.isContentEditable : false,
  }
}

export { SHORTCUT_GROUPS } from './shortcutList.js'
