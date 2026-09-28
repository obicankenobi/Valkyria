// BriefingScreen.test.tsx — P88 (ETAPP7_TEKNISK_SPEC.md §9/§13). Klart-när,
// ordagrant: "Läget 1964, styrelsens mål, en karta med teatern markerad.
// Stämplad som CLASSIFIED."
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { BriefingScreen } from '../src/components/BriefingScreen.js'

afterEach(cleanup)

describe('BriefingScreen (P88 klart-när)', () => {
  it('visar läget, styrelsens mål, en CLASSIFIED-stämpel och en karta', async () => {
    const state = createInitialState('indochina-slice', 'briefing-seed', { houseName: 'Meridian Arms' })
    render(<BriefingScreen state={state} onBegin={() => {}} onBack={() => {}} />)

    const screen_ = await screen.findByTestId('briefing-screen')
    expect(screen_.textContent).toContain('Meridian Arms')
    expect(screen_.textContent).toContain(`${state.meta.year}`)
    expect(screen.getByTestId('briefing-classified').textContent).toBe('CLASSIFIED')
    expect(screen.getByTestId('briefing-target').textContent).toContain(state.house.boardTarget.label)
  })

  it('BEGIN OPERATIONS anropar onBegin', () => {
    const state = createInitialState('indochina-slice', 'briefing-seed')
    const onBegin = vi.fn()
    render(<BriefingScreen state={state} onBegin={onBegin} onBack={() => {}} />)

    fireEvent.click(screen.getByTestId('briefing-begin'))
    expect(onBegin).toHaveBeenCalledOnce()
  })

  it('BACK anropar onBack', () => {
    const state = createInitialState('indochina-slice', 'briefing-seed')
    const onBack = vi.fn()
    render(<BriefingScreen state={state} onBegin={() => {}} onBack={onBack} />)

    fireEvent.click(screen.getByTestId('briefing-back'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
