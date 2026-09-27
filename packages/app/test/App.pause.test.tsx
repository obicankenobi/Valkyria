// App.pause.test.tsx — P81b (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten,
// regel 16 "Esc för paus"). Samma "New Game startar spelet direkt genom en
// riktig <App/>-render"-väg som App.menu.test.tsx redan använder för att nå
// bortom huvudmenyn utan jsdoms IndexedDB-lucka.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../src/App.js'

afterEach(cleanup)

async function enterGame() {
  render(<App />)
  const newGameBtn = await screen.findByTestId('menu-new-game')
  fireEvent.click(newGameBtn)
  await screen.findByTestId('hud')
}

describe('App (P81b) — pausöverlaget', () => {
  it('Esc öppnar pausöverlaget, ett andra Esc stänger det', async () => {
    await enterGame()
    expect(screen.queryByTestId('pause-overlay')).toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('pause-overlay')).toBeNull()
  })

  it('HUD:ens menyknapp öppnar samma pausöverlag', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('hud-menu-button'))
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy()
  })

  it('"Main Menu" i pausöverlaget för tillbaka till huvudmenyn', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('hud-menu-button'))
    await screen.findByTestId('pause-overlay')

    fireEvent.click(screen.getByTestId('pause-main-menu'))
    expect(await screen.findByTestId('menu-continue')).toBeTruthy()
    expect(screen.queryByTestId('hud')).toBeNull()
  })

  it('"Resume" stänger överlaget utan att lämna spelet', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('hud-menu-button'))
    await screen.findByTestId('pause-overlay')

    fireEvent.click(screen.getByTestId('pause-resume'))
    expect(screen.queryByTestId('pause-overlay')).toBeNull()
    expect(screen.getByTestId('hud')).toBeTruthy()
  })
})
