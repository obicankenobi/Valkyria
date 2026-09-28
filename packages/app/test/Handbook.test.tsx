// Handbook.test.tsx — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Handbook } from '../src/components/Handbook.js'
import { HANDBOOK } from '../src/handbook.js'

afterEach(cleanup)

describe('Handbook (P91b)', () => {
  it('renderar ingenting när open är false', () => {
    render(<Handbook open={false} focusId={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId('handbook')).toBeNull()
  })

  it('visar en rad per post i HANDBOOK, med titel och sammanfattning', () => {
    render(<Handbook open={true} focusId={null} onClose={vi.fn()} />)
    for (const entry of HANDBOOK) {
      const row = screen.getByTestId(`handbook-row-${entry.id}`)
      expect(row.textContent).toContain(entry.title)
      expect(row.textContent).toContain(entry.summary)
    }
  })

  it('body döljs bakom en "More"-knapp tills den trycks (regel 7)', () => {
    const entry = HANDBOOK[0]!
    render(<Handbook open={true} focusId={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId(`handbook-body-${entry.id}`)).toBeNull()
    fireEvent.click(screen.getByTestId(`handbook-more-${entry.id}`))
    const body = screen.getByTestId(`handbook-body-${entry.id}`)
    for (const paragraph of entry.body) {
      expect(body.textContent).toContain(paragraph)
    }
  })

  it('en post som matchar focusId är expanderad direkt och markerad', () => {
    const focusId = HANDBOOK[2]!.id
    render(<Handbook open={true} focusId={focusId} onClose={vi.fn()} />)
    expect(screen.getByTestId(`handbook-body-${focusId}`)).toBeTruthy()
    expect(screen.getByTestId(`handbook-row-${focusId}`).className).toContain('is-focused')
    // en icke-fokuserad post är fortfarande hopfälld
    const other = HANDBOOK.find((e) => e.id !== focusId)!
    expect(screen.queryByTestId(`handbook-body-${other.id}`)).toBeNull()
  })

  it('anropar onClose vid tryck på stäng-knappen', () => {
    const onClose = vi.fn()
    render(<Handbook open={true} focusId={null} onClose={onClose} />)
    fireEvent.click(document.querySelector('[data-testid="handbook"] .ds-sheet-close')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
