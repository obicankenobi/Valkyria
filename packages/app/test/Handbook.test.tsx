// Handbook.test.tsx — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Handbook, HANDBOOK_SECTIONS } from '../src/components/Handbook.js'
import { HANDBOOK } from '../src/handbook.js'

afterEach(cleanup)

describe('Handbook (P91b)', () => {
  it('renderar ingenting när open är false', () => {
    render(<Handbook open={false} focusId={null} onClose={vi.fn()} />)
    expect(screen.queryByTestId('handbook')).toBeNull()
  })

  it('innehållsförteckningen har en rad per post i HANDBOOK, och varje post står i exakt en avdelning', () => {
    render(<Handbook open={true} focusId={null} onClose={vi.fn()} />)
    for (const entry of HANDBOOK) expect(screen.getByTestId(`handbook-row-${entry.id}`).textContent).toContain(entry.title)
    const listed = HANDBOOK_SECTIONS.flatMap((s) => s.ids)
    expect([...listed].sort()).toEqual(HANDBOOK.map((e) => e.id).sort())
  })

  it('utan focusId visas det första uppslaget i sin helhet; ett tryck i förteckningen byter uppslag', () => {
    render(<Handbook open={true} focusId={null} onClose={vi.fn()} />)
    const first = HANDBOOK[0]!
    for (const paragraph of first.body) expect(screen.getByTestId(`handbook-body-${first.id}`).textContent).toContain(paragraph)
    const other = HANDBOOK[3]!
    fireEvent.click(screen.getByTestId(`handbook-row-${other.id}`))
    expect(screen.getByTestId(`handbook-entry-${other.id}`)).toBeTruthy()
    expect(screen.queryByTestId(`handbook-entry-${first.id}`)).toBeNull()
  })

  it('en info-knapps focusId öppnar just det uppslaget (speltest 2026-10-17, punkt 14), markerat i förteckningen', () => {
    const focusId = HANDBOOK[5]!.id
    render(<Handbook open={true} focusId={focusId} onClose={vi.fn()} />)
    expect(screen.getByTestId(`handbook-entry-${focusId}`)).toBeTruthy()
    expect(screen.getByTestId(`handbook-row-${focusId}`).getAttribute('aria-current')).toBe('page')
  })

  it('anropar onClose vid tryck på stäng-knappen', () => {
    const onClose = vi.fn()
    render(<Handbook open={true} focusId={null} onClose={onClose} />)
    fireEvent.click(document.querySelector('[data-testid="handbook"] .ds-sheet-close')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
