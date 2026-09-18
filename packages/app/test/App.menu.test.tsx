// App.menu.test.tsx — P65 klart-när (ETAPP6_TEKNISK_SPEC.md §3): "appen
// startar på 'menu', inte i spelet. 'Fortsätt' är inaktiverad och houseName är
// null om hasSavedGame('default') returnerar false. 'Nytt parti' visar en
// bekräftelsedialog ... bara om hasSave är true."
//
// jsdom saknar IndexedDB helt (verifierat: window.indexedDB är undefined) —
// samma "otillgängligt, som privat läge"-gren useGame.ts/persistence.ts redan
// är byggda för att falla tillbaka på. Ett riktigt <App/>-render täcker därför
// robust startvyn och hasSave=false-grenen (persistence.ts:s egna anrop
// förkastas naturligt i jsdom och tolkas som "inget sparat parti"). hasSave=
// true-grenen (Continue aktiverad, bekräftelsedialogen) kan inte drivas genom
// en riktig IndexedDB-runda i jsdom, så den testas mot MainMenu.tsx direkt med
// mockade props — exakt samma "rendera komponenten på riktigt, mocka bara det
// som ligger utanför den" -princip som TheFloor.weights.test.tsx.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../src/App.js'
import { MainMenu } from '../src/components/MainMenu.js'

afterEach(cleanup)

describe('App — huvudmenyn grindar inträdet (P65 klart-när, riktigt <App/>-render)', () => {
  it('startar på menyn, inte i spelet — HUD/flikar syns inte förrän en menyknapp klickats', async () => {
    render(<App />)

    expect(await screen.findByTestId('menu-continue')).toBeTruthy()
    expect(screen.queryByTestId('hud')).toBeNull()
  })

  it('utan sparat parti (jsdoms IndexedDB-lucka): Continue inaktiverad, subtitle nämner inget hus', async () => {
    render(<App />)

    const continueBtn = await screen.findByTestId('menu-continue')
    await waitFor(() => expect(continueBtn).toHaveProperty('disabled', true))
    expect(screen.getByTestId('menu-subtitle').textContent).not.toMatch(/Continue as/)
  })

  it('utan sparat parti: New Game startar spelet direkt, ingen bekräftelsedialog — full väg genom riktig <App/>', async () => {
    render(<App />)

    const newGameBtn = await screen.findByTestId('menu-new-game')
    fireEvent.click(newGameBtn)

    expect(screen.queryByTestId('new-game-confirm')).toBeNull()
    expect(await screen.findByTestId('hud')).toBeTruthy()
  })
})

describe('MainMenu — hasSave=true-grenen (mockade props, se filhuvudet för varför)', () => {
  it('Continue aktiverad och subtitle visar husnamnet när hasSave är true', () => {
    render(<MainMenu houseName="Meridian Arms" hasSave={true} onContinue={vi.fn()} onNewGame={vi.fn()} />)

    expect(screen.getByTestId('menu-continue')).toHaveProperty('disabled', false)
    expect(screen.getByTestId('menu-subtitle').textContent).toContain('Meridian Arms')
  })

  it('New Game visar en bekräftelsedialog INNAN onNewGame anropas, när hasSave är true', () => {
    const onNewGame = vi.fn()
    render(<MainMenu houseName="Meridian Arms" hasSave={true} onContinue={vi.fn()} onNewGame={onNewGame} />)

    fireEvent.click(screen.getByTestId('menu-new-game'))
    expect(screen.getByTestId('new-game-confirm')).toBeTruthy()
    expect(onNewGame).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('new-game-confirm-yes'))
    expect(onNewGame).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('new-game-confirm')).toBeNull()
  })

  it('Avbryt i bekräftelsedialogen stänger den utan att anropa onNewGame', () => {
    const onNewGame = vi.fn()
    render(<MainMenu houseName="Meridian Arms" hasSave={true} onContinue={vi.fn()} onNewGame={onNewGame} />)

    fireEvent.click(screen.getByTestId('menu-new-game'))
    fireEvent.click(screen.getByTestId('new-game-confirm-cancel'))

    expect(screen.queryByTestId('new-game-confirm')).toBeNull()
    expect(onNewGame).not.toHaveBeenCalled()
  })

  it('Continue inaktiverad och houseName-prop null renderas utan att krascha när hasSave är false', () => {
    render(<MainMenu houseName={null} hasSave={false} onContinue={vi.fn()} onNewGame={vi.fn()} />)

    expect(screen.getByTestId('menu-continue')).toHaveProperty('disabled', true)
  })
})
