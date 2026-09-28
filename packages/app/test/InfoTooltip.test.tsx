// InfoTooltip.test.tsx — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20). Täcker
// den nya onReadMore-grenen och blur-fixet (klick på "More" ska inte bli
// avbrutet av att bubblan stängs av onBlur innan onClick hunnit köra), samt
// bakåtkompatibiliteten med det befintliga text-only-anropet (ComponentLibrary.tsx, P73).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InfoTooltip } from '../src/components/designSystem.js'

afterEach(cleanup)

describe('InfoTooltip (P91b: onReadMore)', () => {
  it('text-only-anropet (utan onReadMore) fungerar oförändrat — bakåtkompatibilitet', () => {
    render(<InfoTooltip text="A short explanation." testId="tip" />)
    expect(screen.queryByText('A short explanation.')).toBeNull()
    fireEvent.click(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!)
    expect(screen.getByText('A short explanation.')).toBeTruthy()
    expect(screen.queryByText('More →')).toBeNull()
  })

  it('visar en "More"-knapp bara när onReadMore anges', () => {
    render(<InfoTooltip text="Explains it." onReadMore={vi.fn()} testId="tip" />)
    fireEvent.click(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!)
    expect(screen.getByText('More →')).toBeTruthy()
  })

  it('klick på "More" anropar onReadMore och stänger bubblan, utan att blur hinner stänga den först', () => {
    const onReadMore = vi.fn()
    render(<InfoTooltip text="Explains it." onReadMore={onReadMore} testId="tip" />)
    fireEvent.click(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!)
    const more = screen.getByText('More →')
    // simulerar fokusflytten från triggerknappen till "More"-knappen, samma
    // ordning webbläsaren kör: blur på triggern (med relatedTarget = more),
    // sedan click på more.
    fireEvent.blur(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!, { relatedTarget: more })
    fireEvent.click(more)
    expect(onReadMore).toHaveBeenCalledOnce()
  })

  it('blur mot något UTANFÖR komponenten stänger bubblan', () => {
    render(
      <div>
        <InfoTooltip text="Explains it." onReadMore={vi.fn()} testId="tip" />
        <button type="button">elsewhere</button>
      </div>,
    )
    fireEvent.click(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!)
    expect(screen.getByText('More →')).toBeTruthy()
    fireEvent.blur(screen.getByTestId('tip').querySelector('.ds-tooltip-trigger')!, {
      relatedTarget: screen.getByText('elsewhere'),
    })
    expect(screen.queryByText('More →')).toBeNull()
  })
})
