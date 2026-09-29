// shortcuts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 16): "Kortkommandon
// (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus." Esc har
// legat i App.tsx sedan P81b; det här är resten. En ren beslutsfunktion:
// tangenttryck + läge in, vilken åtgärd som ska köras ut. Själva utförandet
// (ett klick på den riktiga fliken/knappen, så att spellogik, handledningssteg
// och ljud går precis som vid ett tryck) ligger i App.tsx.
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
}

export type ShortcutAction = { kind: 'view'; view: ShellView } | { kind: 'end-quarter' } | null

// Element som redan svarar på Enter själva — ett kortkommando ovanpå skulle
// ge ett dubbelt utlöst klick.
const ENTER_OWNERS_TAG = new Set(['button', 'a', 'summary'])
const ENTER_OWNERS_ROLE = new Set(['button', 'slider', 'radio', 'tab', 'switch', 'link', 'checkbox', 'menuitem'])
const EDITABLE_TAG = new Set(['input', 'textarea', 'select'])

export function shortcutFor(event: ShortcutKey, context: ShortcutContext): ShortcutAction {
  if (!context.inGame || context.blocked) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.targetEditable || (event.targetTag !== null && EDITABLE_TAG.has(event.targetTag))) return null

  if (event.key === 'Enter') {
    if (event.repeat) return null
    if (event.targetTag !== null && ENTER_OWNERS_TAG.has(event.targetTag)) return null
    if (event.targetRole !== null && ENTER_OWNERS_ROLE.has(event.targetRole)) return null
    return { kind: 'end-quarter' }
  }

  if (/^[1-5]$/.test(event.key)) {
    if (event.repeat) return null
    const tab = TABS[Number(event.key) - 1]
    return tab ? { kind: 'view', view: tab.view } : null
  }

  return null
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
