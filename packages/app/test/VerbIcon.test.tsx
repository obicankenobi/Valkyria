// VerbIcon.test.tsx — Unicode-tecknen i VERB_ICON är ersatta av tillgångsfabrikens SVG-ikoner
// @vitest-environment jsdom
// (public/art/icons/<VERB>.svg), färgade med currentColor via CSS mask-image.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import { actionSummary, VERB_ICON } from '../src/components/Shell.js'
import { VerbIcon } from '../src/components/VerbIcon.js'

afterEach(cleanup)

describe('VerbIcon', () => {
  it('VERB_ICON pekar på en SVG-fil som finns, för varje verb — inga Unicode-tecken kvar', () => {
    for (const [verb, url] of Object.entries(VERB_ICON)) {
      expect(url, verb).toBe(`/art/icons/${verb}.svg`)
      expect(existsSync(join(import.meta.dirname, '../public', url)), `${verb}: ${url}`).toBe(true)
    }
  })

  it('renderar ett dekorativt element vars mask är verbets SVG (färgen kommer från currentColor)', () => {
    const { container } = render(<VerbIcon verb="BRIBE" />)
    const el = container.querySelector('.verb-icon') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.getPropertyValue('--verb-icon')).toBe('url(/art/icons/BRIBE.svg)')
    expect(el.textContent).toBe('')
  })

  it('ett okänt verb får en neutral reservruta, inte ett trasigt mask-url', () => {
    const { container } = render(<VerbIcon verb="NO_SUCH_VERB" />)
    const el = container.querySelector('.verb-icon') as HTMLElement
    expect(el.classList.contains('is-unknown')).toBe(true)
    expect(el.style.getPropertyValue('--verb-icon')).toBe('')
  })

  it('en köad handling (actionSummary → ActionSlot) får SVG-ikonen, inte ett Unicode-tecken', () => {
    const state = createInitialState('indochina-slice', 'verb-icon-seed')
    const station = state.house.stations[0]
    const target = Object.values(state.rivals)[0]
    const { icon } = actionSummary(state, { type: 'INTEL', op: 'LEAK', stationId: station?.id ?? 'x', targetId: target?.id ?? 'y' })
    const { container } = render(<span>{icon}</span>)
    const el = container.querySelector('.verb-icon') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.getPropertyValue('--verb-icon')).toBe('url(/art/icons/LEAK.svg)')
    expect(container.textContent).toBe('')
  })
})
