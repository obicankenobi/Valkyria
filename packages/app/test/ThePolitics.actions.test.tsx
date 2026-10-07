// ThePolitics.actions.test.tsx — P86 (ETAPP7_TEKNISK_SPEC.md §7.1/§13): CONTACTS
// får politikverben. Klart-när, ordagrant: "alla 22 verb nåbara från
// gränssnittet." Den här filen verifierar att varje ny knapp faktiskt bygger
// och köar rätt PlayerAction (samma stil som CountryFile.test.tsx för P79),
// plus rivalhusens rena läsvy och FUND_COUP:s engångsspärr.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import { ThePolitics } from '../src/components/ThePolitics.js'

afterEach(cleanup)

describe('ThePolitics — officials-verben (P86)', () => {
  it('BRIBE köar rätt officialId/spend på MODEST-nivå', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    const target = officialId('rvn', 'procurement')
    fireEvent.click(screen.getByTestId(`contacts-verb-BRIBE-${target}`))
    fireEvent.click(screen.getByTestId(`contacts-BRIBE-file-${target}`))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'BRIBE', officialId: target, spend: 3 * 5000 })
  })

  it('FUND_CAMPAIGN köar rätt officialId/spend på MODEST-nivå', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    const target = officialId('rvn', 'procurement')
    fireEvent.click(screen.getByTestId(`contacts-verb-FUND_CAMPAIGN-${target}`))
    fireEvent.click(screen.getByTestId(`contacts-FUND_CAMPAIGN-file-${target}`))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: target, spend: 5 * 2000 })
  })

  it('FAVOUR köar marginCost, aldrig spend', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    const target = officialId('rvn', 'procurement')
    fireEvent.click(screen.getByTestId(`contacts-verb-FAVOUR-${target}`))
    fireEvent.click(screen.getByTestId(`contacts-FAVOUR-file-${target}`))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'FAVOUR', officialId: target, marginCost: 3 * 5000 })
  })

  it('ASSASSINATE köar rätt officialId/spend, och tjänstemannens verbgrid döljs när hon inte längre är active', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    const target = officialId('rvn', 'procurement')
    const { rerender } = render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId(`contacts-verb-ASSASSINATE-${target}`))
    fireEvent.click(screen.getByTestId(`contacts-ASSASSINATE-file-${target}`))
    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'ASSASSINATE', officialId: target, spend: 250_000 })

    state.officials[target]!.status = 'dead'
    rerender(<ThePolitics state={state} onAddAction={onAddAction} />)
    expect(screen.queryByTestId(`contacts-verb-ASSASSINATE-${target}`)).toBeNull()
  })
})

describe('ThePolitics — faktionsverben (P86)', () => {
  it('STAGE_INCIDENT köar targetFactionId/spend på MODEST-nivå', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId('contacts-verb-STAGE_INCIDENT-rvn'))
    fireEvent.click(screen.getByTestId('contacts-STAGE_INCIDENT-file-rvn'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 10_000 })
  })

  it('BACK_CHANNEL köar targetFactionId/spend på MODEST-nivå', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId('contacts-verb-BACK_CHANNEL-rvn'))
    fireEvent.click(screen.getByTestId('contacts-BACK_CHANNEL-file-rvn'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 10_000 })
  })

  it('FUND_COUP köar targetFactionId/spend, och knappen inaktiveras efter ett redan gjort försök', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    const { rerender } = render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId('contacts-verb-FUND_COUP-rvn'))
    fireEvent.click(screen.getByTestId('contacts-FUND_COUP-file-rvn'))
    expect(onAddAction).toHaveBeenCalledWith({ type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: 'rvn', spend: 500_000 })

    state.factions.rvn!.coupAttempted = true
    rerender(<ThePolitics state={state} onAddAction={onAddAction} />)
    const button = screen.getByTestId('contacts-verb-FUND_COUP-rvn') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('BROKER avvisas av validateAction (relationToPlayer 0 vid start) och FILE-knappen inaktiveras', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId('contacts-verb-BROKER-rvn'))
    const button = screen.getByTestId('contacts-broker-file-rvn') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onAddAction).not.toHaveBeenCalled()
  })

  it('BROKER köar rätt produkt/kvantitet/pris när tjänstemannen godkänner affären', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    const target = officialId('rvn', 'procurement')
    state.officials[target]!.relationToPlayer = 90
    state.officials[target]!.integrity = 90
    state.house.works[0]!.category = null // P185 (11O): en förmedlad affär kräver ett verk i kategorin — ett verk som bygger allt, så att testet gäller tjänstemannens villkor
    const onAddAction = vi.fn()
    render(<ThePolitics state={state} onAddAction={onAddAction} />)

    fireEvent.click(screen.getByTestId('contacts-verb-BROKER-rvn'))
    fireEvent.click(screen.getByTestId('contacts-broker-file-rvn'))

    expect(onAddAction).toHaveBeenCalledTimes(1)
    const filed = onAddAction.mock.calls[0]![0]
    expect(filed.type).toBe('BROKER')
    expect(filed.buyerId).toBe('rvn')
    expect(filed.quantity).toBeGreaterThan(0)
    expect(filed.price).toBeGreaterThan(0)
  })
})

describe('ThePolitics — rivalhusens akter (P86, §7.1: "inga verb där")', () => {
  it('listar varje rivalhus utan att erbjuda någon handling', () => {
    const state = createInitialState('indochina-slice', 'contacts-actions-seed')
    render(<ThePolitics state={state} onAddAction={() => {}} />)

    const rivalIds = Object.keys(state.rivals)
    expect(rivalIds.length).toBeGreaterThan(0)
    for (const id of rivalIds) {
      const card = screen.getByTestId(`contacts-rival-${id}`)
      expect(card.textContent).toContain(state.rivals[id]!.name)
      expect(card.querySelector('button')).toBeNull()
    }
  })
})
