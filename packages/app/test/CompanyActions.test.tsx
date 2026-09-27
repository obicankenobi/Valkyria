// CompanyActions.test.tsx — P85 (ETAPP7_TEKNISK_SPEC.md §13). Verifierar att
// INTERNAL-formulären (regel 2: TierPicker/Segmented, inte <input type=
// number>/<select>) bygger och köar rätt PlayerAction, och att tier-
// fraktionerna faktiskt landar på de belopp filens huvudkommentar
// dokumenterar (LAVISH === 100 % av creditLimit/debt/holding).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { InternalActionsForm, RawMaterialsPanel } from '../src/components/CompanyActions.js'

afterEach(cleanup)

describe('InternalActionsForm (P85) — TAKE_LOAN/REPAY', () => {
  it('LAVISH-nivån lånar exakt husets creditLimit', () => {
    const state = createInitialState('indochina-slice', 'company-loan-seed')
    state.house.creditLimit = 4_000_000
    const onAddAction = vi.fn()
    render(<InternalActionsForm state={state} onAddAction={onAddAction} />)

    fireEvent.click(within(screen.getByTestId('company-credit-tier')).getByText('LAVISH'))
    fireEvent.click(screen.getByTestId('company-credit-file'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 4_000_000 } })
  })

  it('REPAY-läget begränsar beloppet till min(debt, treasury) — LAVISH är den mindre av de två', () => {
    const state = createInitialState('indochina-slice', 'company-repay-seed')
    state.house.debt = 5_000_000
    state.house.treasury = 1_200_000
    const onAddAction = vi.fn()
    render(<InternalActionsForm state={state} onAddAction={onAddAction} />)

    fireEvent.click(within(screen.getByTestId('company-credit-mode')).getByText('REPAY'))
    fireEvent.click(within(screen.getByTestId('company-credit-tier')).getByText('LAVISH'))
    fireEvent.click(screen.getByTestId('company-credit-file'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTERNAL', op: 'REPAY', payload: { amount: 1_200_000 } })
  })

  it('Build Production Line-knappen avvisas (disabled) vid maxProductionLines', () => {
    const state = createInitialState('indochina-slice', 'company-buildline-max-seed')
    // maxProductionLines i balance.json — fyller på fler än rimligt gott mått för
    // att garantera taket är nått, oavsett scenariots exakta startantal.
    for (let i = state.house.lines.length; i < 50; i++) {
      state.house.lines.push({
        id: `line-extra-${i}`,
        productId: null,
        grade: 'A',
        unitsPerTurnAtFull: state.house.unitsPerLineTurnDefault,
        capacityPct: 100,
        assignedContractId: null,
        status: 'idle',
        blockedReason: null,
        retoolingUntilTurn: null,
      })
    }
    render(<InternalActionsForm state={state} onAddAction={() => {}} />)
    expect((screen.getByTestId('company-build-line') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('RawMaterialsPanel (P85) — BUY_FORWARD/RELEASE', () => {
  it('RELEASE, LAVISH-nivån, frigör hela det aktuella innehavet för vald råvara', () => {
    const state = createInitialState('indochina-slice', 'company-release-seed')
    state.house.commodityHoldings.oil = 300_000
    const onAddAction = vi.fn()
    render(<RawMaterialsPanel state={state} onAddAction={onAddAction} />)

    fireEvent.click(within(screen.getByTestId('company-commodity-op')).getByText('RELEASE'))
    fireEvent.click(within(screen.getByTestId('company-commodity-tier')).getByText('LAVISH'))
    fireEvent.click(screen.getByTestId('company-commodity-file'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'MARKET', op: 'RELEASE', commodity: 'oil', spend: 300_000 })
  })

  it('BUY_FORWARD kan aldrig spendera mer än treasury (LAVISH-fraktionen är < 1)', () => {
    const state = createInitialState('indochina-slice', 'company-buyforward-seed')
    state.house.treasury = 1_000_000
    const onAddAction = vi.fn()
    render(<RawMaterialsPanel state={state} onAddAction={onAddAction} />)

    fireEvent.click(within(screen.getByTestId('company-commodity-tier')).getByText('LAVISH'))
    fireEvent.click(screen.getByTestId('company-commodity-file'))

    const [action] = onAddAction.mock.calls[0]!
    expect(action.op).toBe('BUY_FORWARD')
    expect(action.spend).toBeLessThan(state.house.treasury)
    expect(action.spend).toBeGreaterThan(0)
  })
})
