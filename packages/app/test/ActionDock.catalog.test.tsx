// ActionDock.catalog.test.tsx — P81-12 (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten): "En tom handlingsplats går att trycka på och öppnar en
// handlingskatalog."
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { ActionDock } from '../src/components/Shell.js'

afterEach(cleanup)

describe('ActionDock (P81-12) — tom handlingsplats öppnar katalogen', () => {
  it('ett tryck på en tom plats anropar onOpenCatalog', () => {
    const state = createInitialState('indochina-slice', 'actiondock-catalog-seed')
    const onOpenCatalog = vi.fn()
    render(
      <ActionDock state={state} actions={[]} onRemoveAction={vi.fn()} onEndTurn={vi.fn()} onOpenCatalog={onOpenCatalog} ended={false} />,
    )

    fireEvent.click(document.querySelector('[data-testid="action-slot-0-empty"]')!)
    expect(onOpenCatalog).toHaveBeenCalledOnce()
  })

  it('utan onOpenCatalog är en tom plats fortfarande bara en ren markör, ingen krasch vid tryck', () => {
    const state = createInitialState('indochina-slice', 'actiondock-no-catalog-seed')
    render(<ActionDock state={state} actions={[]} onRemoveAction={vi.fn()} onEndTurn={vi.fn()} ended={false} />)

    const slot = document.querySelector('[data-testid="action-slot-0-empty"]')!
    expect(slot.tagName).toBe('DIV')
    expect(() => fireEvent.click(slot)).not.toThrow()
  })
})
