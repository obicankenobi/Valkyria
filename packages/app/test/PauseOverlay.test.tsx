// PauseOverlay.test.tsx — P81b (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// P90: onOpenSettings tillagd (ny "Settings"-knapp, se filens egen kommentar).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { PauseOverlay } from '../src/components/PauseOverlay.js'

afterEach(cleanup)

describe('PauseOverlay (P81b)', () => {
  it('renderar ingenting när open är false', () => {
    render(
      <PauseOverlay
        open={false}
        muted={false}
        onToggleMuted={vi.fn()}
        onResume={vi.fn()}
        onMainMenu={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-testid="pause-overlay"]')).toBeNull()
  })

  it('visar ljudtoggeln avstängd när muted är true, på när muted är false', () => {
    render(
      <PauseOverlay
        open={true}
        muted={true}
        onToggleMuted={vi.fn()}
        onResume={vi.fn()}
        onMainMenu={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-testid="pause-sound-toggle"]')!.getAttribute('aria-checked')).toBe('false')

    cleanup()
    render(
      <PauseOverlay
        open={true}
        muted={false}
        onToggleMuted={vi.fn()}
        onResume={vi.fn()}
        onMainMenu={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-testid="pause-sound-toggle"]')!.getAttribute('aria-checked')).toBe('true')
  })

  it('anropar onToggleMuted, onResume, onMainMenu och onOpenSettings vid respektive tryck', () => {
    const onToggleMuted = vi.fn()
    const onResume = vi.fn()
    const onMainMenu = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <PauseOverlay
        open={true}
        muted={false}
        onToggleMuted={onToggleMuted}
        onResume={onResume}
        onMainMenu={onMainMenu}
        onOpenSettings={onOpenSettings}
      />,
    )

    fireEvent.click(document.querySelector('[data-testid="pause-sound-toggle"]')!)
    expect(onToggleMuted).toHaveBeenCalledOnce()

    fireEvent.click(document.querySelector('[data-testid="pause-settings"]')!)
    expect(onOpenSettings).toHaveBeenCalledOnce()

    fireEvent.click(document.querySelector('[data-testid="pause-main-menu"]')!)
    expect(onMainMenu).toHaveBeenCalledOnce()
    expect(onResume).not.toHaveBeenCalled()

    fireEvent.click(document.querySelector('[data-testid="pause-resume"]')!)
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('ett tryck utanför panelen (overlayen) stänger, ett tryck INUTI panelen gör det inte', () => {
    const onResume = vi.fn()
    render(
      <PauseOverlay
        open={true}
        muted={false}
        onToggleMuted={vi.fn()}
        onResume={onResume}
        onMainMenu={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(document.querySelector('.pause-title')!)
    expect(onResume).not.toHaveBeenCalled()

    fireEvent.click(document.querySelector('[data-testid="pause-overlay"]')!)
    expect(onResume).toHaveBeenCalledOnce()
  })
})
