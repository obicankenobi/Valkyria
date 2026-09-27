// Shell.boardOutlook.test.tsx — P81c (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten, P81-8). HudBar visar turer till nästa granskning;
// QuarterBand varnar turen innan en granskning spelaren ligger under kravet.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { HudBar, QuarterBand } from '../src/components/Shell.js'

afterEach(cleanup)

describe('HudBar (P81c) — Board-cellens granskningsutsikt', () => {
  it('visar antal turer till nästa granskning bredvid procenttalet', () => {
    const state = createInitialState('indochina-slice', 'hud-outlook-seed')
    state.meta.turn = 4 // två turer före granskningen vid 6
    render(<HudBar state={state} />)

    const label = document.querySelector('[data-testid="hud-board-outlook"]')!
    expect(label.textContent).toMatch(/2t/)
  })

  it('får is-danger-klassen turen före en granskning spelaren ligger under kravet, annars inte', () => {
    const state = createInitialState('indochina-slice', 'hud-outlook-danger-seed')
    state.meta.turn = 5
    state.house.boardTarget.progressSnapshot = 0
    render(<HudBar state={state} />)

    expect(document.querySelector('[data-testid="hud-board-outlook"]')!.className).toContain('is-danger')

    cleanup()
    state.house.boardTarget.progressSnapshot = state.house.boardTarget.threshold
    render(<HudBar state={state} />)
    expect(document.querySelector('[data-testid="hud-board-outlook"]')!.className).not.toContain('is-danger')
  })
})

describe('QuarterBand (P81c) — förvarning inför en granskning', () => {
  it('visar ingen varning när spelaren ligger på plan, eller det är mer än en tur kvar', () => {
    const state = createInitialState('indochina-slice', 'quarterband-ok-seed')
    state.meta.turn = 5
    state.house.boardTarget.progressSnapshot = state.house.boardTarget.threshold
    render(<QuarterBand state={state} />)
    expect(document.querySelector('[data-testid="quarterband-board-warning"]')).toBeNull()
  })

  it('visar en varningsmarkör redan i kollapsat läge, turen innan en granskning under kravet', () => {
    const state = createInitialState('indochina-slice', 'quarterband-warn-seed')
    state.meta.turn = 5
    state.house.boardTarget.progressSnapshot = 0
    render(<QuarterBand state={state} />)
    expect(document.querySelector('[data-testid="quarterband-board-warning"]')).toBeTruthy()
  })

  it('räknar varningen i badgens antal, och visar en förklarande rad i den utfällda kroppen', () => {
    const state = createInitialState('indochina-slice', 'quarterband-count-seed')
    state.meta.turn = 5
    state.house.boardTarget.progressSnapshot = 0
    render(<QuarterBand state={state} />)

    expect(document.querySelector('[data-testid="quarterband-toggle"] .ds-quarterband-count')!.textContent).toBe('1')

    fireEvent.click(document.querySelector('[data-testid="quarterband-toggle"]')!)
    expect(document.querySelector('[data-testid="quarterband-board-warning-item"]')).toBeTruthy()
  })
})
