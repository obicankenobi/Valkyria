// shortcuts.test.ts — P94 (ETAPP7_TEKNISK_SPEC.md §3 regel 16: "Kortkommandon
// (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus.").
// Esc fanns sedan P81b; 1–5 och Enter fanns inte förrän nu. Ren funktion.
import { describe, expect, it } from 'vitest'
import { shortcutFor, type ShortcutContext, type ShortcutKey } from '../src/shortcuts.js'

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
    for (const k of ['0', '6', '9', 'a', ' ', 'Tab', 'ArrowRight']) {
      expect(shortcutFor(key(k), ctx)).toBeNull()
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
