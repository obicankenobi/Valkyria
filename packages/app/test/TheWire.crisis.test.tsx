// TheWire.crisis.test.tsx — P87 (ETAPP7_TEKNISK_SPEC.md §7.6/§13). Klart-när,
// ordagrant: "Helskärmskort med illustration, de tre valen och PUSH:s 30 %
// utskrivet. Kan inte stängas utan val." Verifierar den ombyggda
// CrisisModal (tidigare en centrerad .modal-overlay/.modal-panel, aldrig
// uppdaterad till etapp 7:s regelverk).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import type { TurnSubmission } from '@seventh-front/core'
import { TheWire } from '../src/components/TheWire.js'

afterEach(cleanup)

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function stateWithPendingCrisis() {
  const state = createInitialState('indochina-slice', 'crisis-card-seed')
  const theatreId = Object.keys(state.theatres)[0]!
  state.doomsday = 78
  state.pendingCrisis = { turn: state.meta.turn, theatreId, restrictedRevenueThisTurn: 2_000_000 }
  return state
}

describe('CrisisModal — helskärmskortet (P87 klart-när)', () => {
  it('visar en illustration (doomsday-gaugen), alla tre val och PUSH:s 30 % utskrivet', () => {
    const state = stateWithPendingCrisis()
    render(<TheWire wire={state.wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    const card = screen.getByTestId('crisis-modal')
    expect(card.querySelector('.crisis-illustration')).toBeTruthy()
    expect(card.textContent).toContain('30%')
    expect(screen.getByTestId('crisis-choice-PUSH')).toBeTruthy()
    expect(screen.getByTestId('crisis-choice-BACK_DOWN')).toBeTruthy()
    expect(screen.getByTestId('crisis-choice-SELL_THE_FILE')).toBeTruthy()
    expect(screen.getByTestId('crisis-doomsday').textContent).toContain('78')
  })

  it('går inte att stänga utan val — ingen stäng-/X-knapp finns', () => {
    const state = stateWithPendingCrisis()
    render(<TheWire wire={state.wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    const card = screen.getByTestId('crisis-modal')
    const buttons = [...card.querySelectorAll('button')]
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button.textContent).not.toMatch(/close|×|✕/i)
    }
  })

  it('ett val anropar onChooseCrisis med rätt choice', () => {
    const state = stateWithPendingCrisis()
    const onChooseCrisis = vi.fn()
    render(<TheWire wire={state.wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={onChooseCrisis} />)

    fireEvent.click(screen.getByTestId('crisis-choice-SELL_THE_FILE'))
    expect(onChooseCrisis).toHaveBeenCalledWith('SELL_THE_FILE')
  })

  it('ingen kris utan pendingCrisis — kortet renderas inte', () => {
    const state = createInitialState('indochina-slice', 'crisis-card-seed')
    render(<TheWire wire={state.wire} state={state} draft={EMPTY_DRAFT} onChooseCrisis={() => {}} />)

    expect(screen.queryByTestId('crisis-modal')).toBeNull()
  })

  it('ett redan valt CRISIS-kort denna tur döljer modalen (crisisChosen)', () => {
    const state = stateWithPendingCrisis()
    const draft: TurnSubmission = { standingOrders: [], bids: [], actions: [{ type: 'CRISIS', choice: 'SELL_THE_FILE' }] }
    render(<TheWire wire={state.wire} state={state} draft={draft} onChooseCrisis={() => {}} />)

    expect(screen.queryByTestId('crisis-modal')).toBeNull()
  })
})
