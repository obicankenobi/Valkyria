// App.actionCard.test.tsx — P163 (ETAPP10_FORSLAG.md §3b, S3): Actions-menyn → rätt mapp med verbet förvalt, handlingskortet i mappen, och en info-ikon på varje panel.
// Samma väg in i spelet som App.pause.test.tsx (ett riktigt <App/>, jsdom).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../src/App.js'

afterEach(cleanup)

async function enterGame() {
  render(<App />)
  fireEvent.click(await screen.findByTestId('menu-new-game'))
  fireEvent.click(await screen.findByTestId('newgame-submit'))
  fireEvent.click(await screen.findByTestId('briefing-begin'))
  await screen.findByTestId('hud')
}

async function pickFromMenu(verb: string) {
  fireEvent.click(screen.getByTestId('action-slot-0-empty'))
  fireEvent.click(await screen.findByTestId(`action-catalog-entry-${verb}`))
}

describe('App (P163) — Actions-menyn öppnar mappen med verbet förvalt', () => {
  it('REPAY: THE COMPANY öppnas med läget REPAY redan valt, och remsan säger vilket verb som är valt', async () => {
    await enterGame()
    await pickFromMenu('REPAY')
    expect(await screen.findByTestId('armed-verb')).toBeTruthy()
    expect(screen.getByTestId('armed-verb-label').textContent).toBe('Repay debt')
    // formuläret står i REPAY-läge: kortet är REPAY:s, inte TAKE_LOAN:s
    expect(screen.getByTestId('action-card-REPAY')).toBeTruthy()
    expect(screen.queryByTestId('action-card-TAKE_LOAN')).toBeNull()
  })

  it('TAKE_LOAN: formuläret är i lånläge och det valda formuläret markeras (data-armed)', async () => {
    await enterGame()
    await pickFromMenu('TAKE_LOAN')
    expect(screen.getByTestId('action-card-TAKE_LOAN')).toBeTruthy()
    await waitFor(() => {
      const marked = document.querySelector('[data-verb~="TAKE_LOAN"]')
      expect(marked?.getAttribute('data-armed')).toBe('true')
    })
  })

  it('att köa verbet avväpnar det: remsan försvinner', async () => {
    await enterGame()
    await pickFromMenu('HIRE')
    expect(await screen.findByTestId('armed-verb')).toBeTruthy()
    fireEvent.click(screen.getByTestId('company-hire-file'))
    await waitFor(() => expect(screen.queryByTestId('armed-verb')).toBeNull())
  })

  it('Cancel i remsan tar bort valet utan att köa något', async () => {
    await enterGame()
    await pickFromMenu('HIRE')
    fireEvent.click(await screen.findByTestId('armed-verb-clear'))
    expect(screen.queryByTestId('armed-verb')).toBeNull()
  })

  it('BRIBE: CONTACTS öppnas, remsan pekar på tjänstemannens verbknapp och knapparna markeras', async () => {
    await enterGame()
    await pickFromMenu('BRIBE')
    expect(await screen.findByTestId('armed-verb-hint')).toBeTruthy()
    expect(screen.getByTestId('armed-verb-hint').textContent).toMatch(/official/)
    await waitFor(() => {
      const buttons = [...document.querySelectorAll('[data-verb~="BRIBE"]')]
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) expect(b.getAttribute('data-armed')).toBe('true')
    })
    // inget annat verb är markerat
    expect(document.querySelectorAll('[data-armed="true"]:not([data-verb~="BRIBE"])').length).toBe(0)
  })

  it('EXPAND: kartan visas med en remsa som säger att man ska trycka på ett land med station', async () => {
    await enterGame()
    await pickFromMenu('EXPAND')
    expect(await screen.findByTestId('armed-verb-hint')).toBeTruthy()
    expect(screen.getByTestId('armed-verb-hint').textContent).toMatch(/Tap a country/)
  })

  it('ett handboksuppslag nås från kortet i formuläret', async () => {
    await enterGame()
    await pickFromMenu('HIRE')
    const card = await screen.findByTestId('action-card-HIRE')
    fireEvent.click(within(card).getByTestId('action-card-handbook-HIRE'))
    expect(await screen.findByTestId('handbook')).toBeTruthy()
  })
})

describe('App (P163) — varje panel på varje flik har en info-ikon', () => {
  it('OPERATIONS, CONTRACTS, COMPANY, CONTACTS och NEWS DESK: ingen .panel eller .ds-panel saknar ikonen', async () => {
    await enterGame()
    for (const tab of ['operations', 'contracts', 'company', 'contacts', 'news']) {
      fireEvent.click(screen.getByTestId(`tab-${tab}`))
      const panels = [...document.querySelectorAll('.panel, .ds-panel')]
      for (const panel of panels) {
        const title = panel.querySelector('.panel-title, .ds-panel-title')?.textContent
        expect(panel.querySelector('[data-testid="panel-info"]'), `panelen "${title}" på ${tab} saknar info-ikon`).not.toBeNull()
      }
    }
  })
})
