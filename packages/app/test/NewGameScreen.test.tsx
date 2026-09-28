// NewGameScreen.test.tsx — P88 (ETAPP7_TEKNISK_SPEC.md §9/§13). Verifierar
// att formuläret bygger rätt StartChoices och att BACK inte köar något.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NewGameScreen } from '../src/components/NewGameScreen.js'

afterEach(cleanup)

describe('NewGameScreen', () => {
  it('FOUND THE HOUSE skickar standardvalen (första namnet, NEUTRAL, ARTILLERY) utan interaktion', () => {
    const onSubmit = vi.fn()
    render(<NewGameScreen onSubmit={onSubmit} onBack={() => {}} />)

    fireEvent.click(screen.getByTestId('newgame-submit'))

    expect(onSubmit).toHaveBeenCalledWith({ houseName: 'Meridian Arms', homeState: 'neutral', specialisation: 'artillery' })
  })

  it('ett valt namn, hemstat och specialisation följer med i StartChoices', () => {
    const onSubmit = vi.fn()
    render(<NewGameScreen onSubmit={onSubmit} onBack={() => {}} />)

    fireEvent.click(screen.getByTestId('newgame-name-Ashford & Vale'))
    fireEvent.click(screen.getByTestId('newgame-homestate').querySelector('[aria-checked="false"]') as HTMLElement)
    fireEvent.click(screen.getByTestId('newgame-specialisation').querySelectorAll('[role="radio"]')[3]!) // NAVAL
    fireEvent.click(screen.getByTestId('newgame-submit'))

    const filed = onSubmit.mock.calls[0]![0]
    expect(filed.houseName).toBe('Ashford & Vale')
    expect(filed.homeState).not.toBe('neutral')
    expect(filed.specialisation).toBe('naval')
  })

  it('BACK anropar onBack utan att köa något val', () => {
    const onSubmit = vi.fn()
    const onBack = vi.fn()
    render(<NewGameScreen onSubmit={onSubmit} onBack={onBack} />)

    fireEvent.click(screen.getByTestId('newgame-back'))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
