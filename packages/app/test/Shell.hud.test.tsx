// Shell.hud.test.tsx — P81b (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// HudBar: doomsday-mätaren (P81-4) och menyknappen (P81-6).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { HudBar } from '../src/components/Shell.js'
import { hudNumberTopic } from '../src/handbook.js'

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

// P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): "nåbar ... från varje info-ikon".
describe('HudBar (P91b) — info-ikonerna i den utfällda panelen', () => {
  it('renderas inte utan onOpenHandbook (bakåtkompatibelt)', () => {
    const state = createInitialState('indochina-slice', 'hud-info-no-handbook-seed')
    render(<HudBar state={state} />)
    fireEvent.click(document.querySelector('.ds-hud-row')!)
    expect(document.querySelector('[data-testid="hud-info-doomsday"]')).toBeNull()
  })

  it('varje av de sex talen har en info-ikon som anropar onOpenHandbook med rätt topic', () => {
    const state = createInitialState('indochina-slice', 'hud-info-seed')
    const onOpenHandbook = vi.fn()
    render(<HudBar state={state} onOpenHandbook={onOpenHandbook} />)
    fireEvent.click(document.querySelector('.ds-hud-row')!)

    const ids = ['doomsday', 'treasury', 'board', 'debt', 'creditLimit', 'actionPoints'] as const
    const testIds = ['hud-info-doomsday', 'hud-info-treasury', 'hud-info-board', 'hud-info-debt', 'hud-info-credit-limit', 'hud-info-action-points']
    for (let i = 0; i < ids.length; i++) {
      const tip = document.querySelector(`[data-testid="${testIds[i]}"]`)
      expect(tip, testIds[i]).toBeTruthy()
      fireEvent.click(tip!.querySelector('.ds-tooltip-trigger')!)
      fireEvent.click(tip!.querySelector('.ds-tooltip-more')!)
      expect(onOpenHandbook).toHaveBeenLastCalledWith(hudNumberTopic(ids[i]!))
    }
    expect(onOpenHandbook).toHaveBeenCalledTimes(ids.length)
  })
})
