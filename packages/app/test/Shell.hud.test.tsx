// Shell.hud.test.tsx — P81b (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// HudBar: doomsday-mätaren (P81-4) och menyknappen (P81-6).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { HudBar } from '../src/components/Shell.js'

afterEach(cleanup)

describe('HudBar (P81b) — doomsday-mätaren', () => {
  it('ritar en gauge (halvcirkel, tre färgzoner, en visare) bredvid doomsday-talet', () => {
    const state = createInitialState('indochina-slice', 'hud-gauge-seed')
    render(<HudBar state={state} />)

    const gauge = document.querySelector('.ds-hud-gauge')
    expect(gauge).toBeTruthy()
    expect(gauge!.querySelectorAll('.ds-hud-gauge-zone').length).toBe(3)
    expect(gauge!.querySelector('.ds-hud-gauge-needle')).toBeTruthy()
    expect(gauge!.querySelector('.ds-hud-gauge-zone.is-safe')).toBeTruthy()
    expect(gauge!.querySelector('.ds-hud-gauge-zone.is-amber')).toBeTruthy()
    expect(gauge!.querySelector('.ds-hud-gauge-zone.is-danger')).toBeTruthy()
  })

  it('doomsday-talet syns fortfarande bredvid mätaren, oförändrat testid', () => {
    const state = createInitialState('indochina-slice', 'hud-gauge-value-seed')
    render(<HudBar state={state} />)
    expect(document.querySelector('[data-testid="hud-doomsday"]')).toBeTruthy()
  })
})

describe('HudBar (P81b) — menyknappen', () => {
  it('renderas inte utan onOpenMenu (bakåtkompatibelt, t.ex. skärmar som inte äger en meny)', () => {
    const state = createInitialState('indochina-slice', 'hud-no-menu-seed')
    render(<HudBar state={state} />)
    expect(document.querySelector('[data-testid="hud-menu-button"]')).toBeNull()
  })

  it('anropar onOpenMenu vid tryck, utan att fälla ut den vanliga statusraden', () => {
    const state = createInitialState('indochina-slice', 'hud-menu-seed')
    const onOpenMenu = vi.fn()
    render(<HudBar state={state} onOpenMenu={onOpenMenu} />)

    fireEvent.click(document.querySelector('[data-testid="hud-menu-button"]')!)
    expect(onOpenMenu).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-testid="hud-expanded"]')).toBeNull()
  })
})
