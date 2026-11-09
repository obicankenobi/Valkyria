// shortcuts.test.ts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 16: "Kortkommandon
// (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus.").
// Esc fanns sedan P81b; 1–5 och Enter fanns inte förrän nu. Ren funktion.
import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, shortcutFor, type ShortcutContext, type ShortcutKey } from '../src/shortcuts.js'
import { findHandbookEntry } from '../src/handbook.js'

const ctx: ShortcutContext = { inGame: true, blocked: false }
const key = (k: string, extra: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  targetTag: 'body',
  targetRole: null,
  targetEditable: false,
  ...extra,
})

describe('shortcutFor — 1–5 byter skärm i flikordning', () => {
  it('1–5 ger operations, contracts, company, contacts, news', () => {
    const views = ['operations', 'contracts', 'company', 'contacts', 'news']
    for (let i = 0; i < 5; i++) {
      expect(shortcutFor(key(String(i + 1)), ctx)).toEqual({ kind: 'view', view: views[i] })
    }
  })

  it('andra siffror och tecken ger inget', () => {
    for (const k of ['6', '9', 'b', 'z', ' ', 'Tab', 'ArrowRight']) {
      expect(shortcutFor(key(k), ctx), k).toBeNull()
    }
  })
})

describe('shortcutFor — Enter avslutar kvartalet', () => {
  it('Enter från en neutral plats ger end-quarter', () => {
    expect(shortcutFor(key('Enter'), ctx)).toEqual({ kind: 'end-quarter' })
  })

  it('Enter på en knapp, länk eller annat klickbart lämnas åt elementet själv (annars dubbelklick)', () => {
    for (const tag of ['button', 'a', 'summary']) {
      expect(shortcutFor(key('Enter', { targetTag: tag }), ctx), tag).toBeNull()
    }
    for (const role of ['button', 'slider', 'radio', 'tab', 'switch', 'link']) {
      expect(shortcutFor(key('Enter', { targetRole: role }), ctx), role).toBeNull()
    }
  })

  it('en hållen Enter avslutar inte flera kvartal i rad', () => {
    expect(shortcutFor(key('Enter', { repeat: true }), ctx)).toBeNull()
  })
})

describe('shortcutFor — skriver man i ett fält, eller trycks en modifierare, händer inget', () => {
  it('redigerbara element äter alla tangenter', () => {
    for (const k of ['1', '5', 'Enter']) {
      expect(shortcutFor(key(k, { targetTag: 'input', targetEditable: true }), ctx), k).toBeNull()
      expect(shortcutFor(key(k, { targetTag: 'textarea' }), ctx), k).toBeNull()
      expect(shortcutFor(key(k, { targetTag: 'select' }), ctx), k).toBeNull()
      expect(shortcutFor(key(k, { targetEditable: true }), ctx), k).toBeNull()
    }
  })

  it('Ctrl/Cmd/Alt + tangent är webbläsarens (Ctrl+1 byter flik i webbläsaren)', () => {
    expect(shortcutFor(key('1', { ctrlKey: true }), ctx)).toBeNull()
    expect(shortcutFor(key('2', { metaKey: true }), ctx)).toBeNull()
    expect(shortcutFor(key('3', { altKey: true }), ctx)).toBeNull()
    expect(shortcutFor(key('Enter', { ctrlKey: true }), ctx)).toBeNull()
  })

  it('siffror på en fokuserad knapp fungerar fortfarande (bara Enter är knappens egen)', () => {
    expect(shortcutFor(key('2', { targetTag: 'button' }), ctx)).toEqual({ kind: 'view', view: 'contracts' })
  })
})

describe('shortcutFor — bara i spelet, aldrig bakom ett överlagg', () => {
  it('utanför spelet (meny, New Game, Briefing, epilog) ger ingenting', () => {
    for (const k of ['1', '3', 'Enter']) {
      expect(shortcutFor(key(k), { inGame: false, blocked: false }), k).toBeNull()
    }
  })

  it('ett öppet överlagg (paus, inställningar, handbok, ark, kris, uppspelning) blockerar allt', () => {
    for (const k of ['1', '5', 'Enter']) {
      expect(shortcutFor(key(k), { inGame: true, blocked: true }), k).toBeNull()
    }
  })
})

describe('shortcutFor — etapp 14: layouten för krigsbordet (ägarbeslut 2026-11-09)', () => {
  it('bokstäverna trycker på rätt knapp eller öppnar rätt sak, versal eller gemen', () => {
    expect(shortcutFor(key('q'), ctx)).toEqual({ kind: 'press', target: 'quarterband-toggle' })
    expect(shortcutFor(key('W'), ctx)).toEqual({ kind: 'press', target: 'open-wire-desk' })
    expect(shortcutFor(key('a'), ctx)).toEqual({ kind: 'press', target: 'open-action-catalog' })
    expect(shortcutFor(key('f'), ctx)).toEqual({ kind: 'press', target: 'folio-expand' })
    expect(shortcutFor(key('k'), ctx)).toEqual({ kind: 'press', target: 'map-legend-button' })
    expect(shortcutFor(key('l'), ctx)).toEqual({ kind: 'map-layer' })
    expect(shortcutFor(key('h'), ctx)).toEqual({ kind: 'handbook', topic: 'index' })
    expect(shortcutFor(key('?'), ctx)).toEqual({ kind: 'handbook', topic: 'keyboard' })
  })

  it('[ och ] byter registerflik, 0 återställer kartan, + och − zoomar och får upprepas', () => {
    expect(shortcutFor(key('['), ctx)).toEqual({ kind: 'folder-tab', step: -1 })
    expect(shortcutFor(key(']'), ctx)).toEqual({ kind: 'folder-tab', step: 1 })
    expect(shortcutFor(key('0'), ctx)).toEqual({ kind: 'map-zoom', direction: 'reset' })
    expect(shortcutFor(key('+', { repeat: true }), ctx)).toEqual({ kind: 'map-zoom', direction: 'in' })
    expect(shortcutFor(key('='), ctx)).toEqual({ kind: 'map-zoom', direction: 'in' })
    expect(shortcutFor(key('-', { repeat: true }), ctx)).toEqual({ kind: 'map-zoom', direction: 'out' })
    expect(shortcutFor(key('f', { repeat: true }), ctx)).toBeNull()
  })

  it('under kvartalsuppspelningen gäller bara Space (Skip/Continue), inte på en fokuserad knapp', () => {
    const replay: ShortcutContext = { inGame: true, blocked: true, replaying: true }
    expect(shortcutFor(key(' '), replay)).toEqual({ kind: 'press', target: 'replay-skip' })
    expect(shortcutFor(key(' ', { targetTag: 'button' }), replay)).toBeNull()
    for (const k of ['1', 'Enter', 'q', '+']) expect(shortcutFor(key(k), replay), k).toBeNull()
    expect(shortcutFor(key(' '), ctx)).toBeNull()
  })

  it('handbokens uppslag Keyboard listar varje tangent ur samma lista', () => {
    const entry = findHandbookEntry('keyboard')!
    const text = entry.body.join(' ')
    for (const group of SHORTCUT_GROUPS) for (const k of group.keys) expect(text, k.keys).toContain(`${k.keys} — ${k.does}`)
  })

  it('varje tangent i listan gör något i shortcutFor (Esc och Space hanteras utanför)', () => {
    const probe: Record<string, string[]> = { '1–5': ['1', '5'], '[ ]': ['[', ']'], '+ −': ['+', '-'], Enter: ['Enter'] }
    for (const group of SHORTCUT_GROUPS)
      for (const k of group.keys) {
        if (k.keys === 'Esc' || k.keys === 'Space') continue
        for (const pressed of probe[k.keys] ?? [k.keys.toLowerCase()]) expect(shortcutFor(key(pressed), ctx), k.keys).not.toBeNull()
      }
  })
})
