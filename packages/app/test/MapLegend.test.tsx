// MapLegend.test.tsx — P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MapLegend } from '../src/components/MapLegend.js'
import { MAP_LEGEND } from '../src/mapLegend.js'

afterEach(cleanup)

describe('MapLegend (P81a)', () => {
  it('renderar ingenting när open är false', () => {
    render(<MapLegend open={false} focusId={null} onClose={vi.fn()} />)
    expect(document.querySelector('[data-testid="map-legend"]')).toBeNull()
  })

  it('visar en rad per entry i MAP_LEGEND, var och en med både "vad den är" och "vad den betyder"', () => {
    render(<MapLegend open={true} focusId={null} onClose={vi.fn()} />)
    for (const entry of MAP_LEGEND) {
      const row = document.querySelector(`[data-testid="map-legend-row-${entry.id}"]`)
      expect(row, `rad för ${entry.id} saknas`).toBeTruthy()
      expect(row!.textContent).toContain(entry.title)
      expect(row!.textContent).toContain(entry.whatItIs)
      expect(row!.textContent).toContain(entry.whatItMeans)
    }
  })

  it('markerar bara den rad som matchar focusId', () => {
    const focusId = MAP_LEGEND[3]!.id
    render(<MapLegend open={true} focusId={focusId} onClose={vi.fn()} />)
    for (const entry of MAP_LEGEND) {
      const row = document.querySelector(`[data-testid="map-legend-row-${entry.id}"]`)
      const isFocused = row!.className.includes('is-focused')
      expect(isFocused).toBe(entry.id === focusId)
    }
  })

  it('anropar onClose vid tryck på stäng-knappen', () => {
    const onClose = vi.fn()
    render(<MapLegend open={true} focusId={null} onClose={onClose} />)
    const closeButton = document.querySelector('[data-testid="map-legend"] .ds-sheet-close') as HTMLButtonElement
    closeButton.click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
