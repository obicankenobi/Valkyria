// ActionCatalog.test.tsx — P81-12 (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ActionCatalog } from '../src/components/ActionCatalog.js'
import { ACTION_CATALOG } from '../src/actionCatalog.js'

afterEach(cleanup)

describe('ActionCatalog (P81-12)', () => {
  it('renderar ingenting när open är false', () => {
    render(<ActionCatalog open={false} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(document.querySelector('[data-testid="action-catalog"]')).toBeNull()
  })

  it('visar en rad per katalogpost, grupperad per föremål', () => {
    render(<ActionCatalog open={true} onClose={vi.fn()} onNavigate={vi.fn()} />)
    for (const entry of ACTION_CATALOG) {
      const row = document.querySelector(`[data-testid="action-catalog-entry-${entry.verb}"]`)
      expect(row, `rad för ${entry.verb} saknas`).toBeTruthy()
      expect(row!.textContent).toContain(entry.label)
    }
    const groups = new Set(ACTION_CATALOG.map((e) => e.objectGroup))
    for (const group of groups) {
      expect(document.querySelector(`[data-testid="action-catalog-group-${group}"]`)).toBeTruthy()
    }
  })

  it('ett tryck på en rad anropar onNavigate med rätt mål och stänger katalogen', () => {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    render(<ActionCatalog open={true} onClose={onClose} onNavigate={onNavigate} />)

    const recruitEntry = ACTION_CATALOG.find((e) => e.verb === 'RECRUIT')!
    fireEvent.click(document.querySelector('[data-testid="action-catalog-entry-RECRUIT"]')!)

    expect(onNavigate).toHaveBeenCalledWith(recruitEntry.target)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
