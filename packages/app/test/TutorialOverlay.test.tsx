// TutorialOverlay.test.tsx — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TutorialOverlay } from '../src/components/TutorialOverlay.js'
import { TUTORIAL_STEPS } from '../src/tutorial.js'

afterEach(cleanup)

describe('TutorialOverlay (P91a)', () => {
  it('renderar ingenting när step är null', () => {
    render(<TutorialOverlay step={null} onDismiss={vi.fn()} />)
    expect(screen.queryByTestId('tutorial-banner')).toBeNull()
  })

  it('visar stegets uppmaningstext', () => {
    render(<TutorialOverlay step={TUTORIAL_STEPS[0]!} onDismiss={vi.fn()} />)
    expect(screen.getByTestId('tutorial-prompt').textContent).toBe(TUTORIAL_STEPS[0]!.prompt)
  })

  it('Dismiss anropar onDismiss', () => {
    const onDismiss = vi.fn()
    render(<TutorialOverlay step={TUTORIAL_STEPS[0]!} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('tutorial-dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
