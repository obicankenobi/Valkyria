// SettingsOverlay.test.tsx — P90 (ETAPP7_TEKNISK_SPEC.md §9/§13). persistence.ts
// kräver riktig IndexedDB (jsdom saknar den helt, samma gräns sound.test.ts/
// App.menu.test.tsx redan dokumenterar för AudioContext/indexedDB) — mockad
// här i stället för att kräva en riktig webbläsare, precis som komponenten
// själv bara anropar de tre exporterade funktionerna, aldrig databasen direkt.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { SettingsOverlay } from '../src/components/SettingsOverlay.js'
import { emptySubmission } from '../src/game.js'
import type { SavedGame } from '../src/persistence.js'

const { loadGameMock, saveGameMock, deleteSaveMock } = vi.hoisted(() => ({
  loadGameMock: vi.fn(),
  saveGameMock: vi.fn(),
  deleteSaveMock: vi.fn(),
}))

vi.mock('../src/persistence.js', () => ({
  loadGame: loadGameMock,
  saveGame: saveGameMock,
  deleteSave: deleteSaveMock,
}))

afterEach(cleanup)

function baseProps() {
  const state = createInitialState('indochina-slice', 'settings-seed', { houseName: 'Meridian Arms' })
  return {
    open: true,
    onClose: vi.fn(),
    muted: false,
    onToggleMuted: vi.fn(),
    volume: 1,
    onVolumeChange: vi.fn(),
    fullReplay: false,
    onToggleFullReplay: vi.fn(),
    motion: 'normal' as const,
    onMotionChange: vi.fn(),
    textScale: 'normal' as const,
    onTextScaleChange: vi.fn(),
    state,
    draft: emptySubmission(),
    recentEvents: [],
    onLoadFromSlot: vi.fn().mockResolvedValue(true),
    onRestartTutorial: vi.fn(),
  }
}

describe('SettingsOverlay (P90)', () => {
  beforeEach(() => {
    loadGameMock.mockReset().mockResolvedValue(null)
    saveGameMock.mockReset().mockResolvedValue(undefined)
    deleteSaveMock.mockReset().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('renderar ingenting när open är false', () => {
    render(<SettingsOverlay {...baseProps()} open={false} />)
    expect(screen.queryByTestId('settings-overlay')).toBeNull()
  })

  it('visar alla fem sektioner när öppen', async () => {
    render(<SettingsOverlay {...baseProps()} />)
    const overlay = await screen.findByTestId('settings-overlay')
    expect(overlay.textContent).toContain('Sound')
    expect(overlay.textContent).toContain('Playback')
    expect(overlay.textContent).toContain('Display')
    expect(overlay.textContent).toContain('Save Slots')
    expect(overlay.textContent).toContain('Support')
  })

  it('ljudtoggeln anropar onToggleMuted', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByTestId('settings-sound-toggle'))
    expect(props.onToggleMuted).toHaveBeenCalledOnce()
  })

  it('volymreglaget anropar onVolumeChange med tangentbordet (End -> 100%)', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    const slider = screen.getByTestId('settings-volume').querySelector('[role="slider"]')!
    fireEvent.keyDown(slider, { key: 'End' })
    expect(props.onVolumeChange).toHaveBeenCalledWith(1)
  })

  it('uppspelningstoggeln anropar onToggleFullReplay', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByTestId('settings-full-replay-toggle'))
    expect(props.onToggleFullReplay).toHaveBeenCalledWith(true)
  })

  it('rörelseläget anropar onMotionChange', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByText('Fast'))
    expect(props.onMotionChange).toHaveBeenCalledWith('fast')
  })

  it('textstorleken anropar onTextScaleChange', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByText('Large'))
    expect(props.onTextScaleChange).toHaveBeenCalledWith('large')
  })

  it('visar "Empty" för en tom flik, och Load/Delete är avstängda', async () => {
    render(<SettingsOverlay {...baseProps()} />)
    const row = await screen.findByTestId('settings-slot-manual-1')
    await waitFor(() => expect(row.textContent).toContain('Empty'))
    expect((screen.getByTestId('settings-slot-load-manual-1') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('settings-slot-delete-manual-1') as HTMLButtonElement).disabled).toBe(true)
  })

  it('en fylld flik visar hus och tur, Load/Delete är påslagna', async () => {
    const saved: SavedGame = { state: createInitialState('indochina-slice', 'x', { houseName: 'Ashford & Vale' }), draft: emptySubmission() }
    saved.state.meta.turn = 4
    loadGameMock.mockImplementation((slot: string) => Promise.resolve(slot === 'manual-1' ? saved : null))
    render(<SettingsOverlay {...baseProps()} />)
    const row = await screen.findByTestId('settings-slot-manual-1')
    await waitFor(() => expect(row.textContent).toContain('Ashford & Vale — Turn 4'))
    expect((screen.getByTestId('settings-slot-load-manual-1') as HTMLButtonElement).disabled).toBe(false)
  })

  it('Save på en flik ber om bekräftelse, och anropar saveGame efter Confirm', async () => {
    render(<SettingsOverlay {...baseProps()} />)
    await screen.findByTestId('settings-slot-manual-1')
    fireEvent.click(screen.getByTestId('settings-slot-save-manual-1'))
    expect(screen.getByTestId('settings-confirm')).toBeTruthy()
    fireEvent.click(screen.getByTestId('settings-confirm-yes'))
    await waitFor(() => expect(saveGameMock).toHaveBeenCalledWith('manual-1', expect.any(Object)))
  })

  it('Cancel i bekräftelsedialogen anropar varken saveGame, deleteSave eller onLoadFromSlot', () => {
    render(<SettingsOverlay {...baseProps()} />)
    fireEvent.click(screen.getByTestId('settings-slot-save-manual-1'))
    fireEvent.click(screen.getByTestId('settings-confirm-cancel'))
    expect(screen.queryByTestId('settings-confirm')).toBeNull()
    expect(saveGameMock).not.toHaveBeenCalled()
  })

  it('Load på en fylld flik anropar onLoadFromSlot och stänger panelen', async () => {
    const saved: SavedGame = { state: createInitialState('indochina-slice', 'x'), draft: emptySubmission() }
    loadGameMock.mockImplementation((slot: string) => Promise.resolve(slot === 'manual-1' ? saved : null))
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    await waitFor(() => expect((screen.getByTestId('settings-slot-load-manual-1') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('settings-slot-load-manual-1'))
    fireEvent.click(screen.getByTestId('settings-confirm-yes'))
    await waitFor(() => expect(props.onLoadFromSlot).toHaveBeenCalledWith('manual-1'))
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('Delete på en fylld flik anropar deleteSave', async () => {
    const saved: SavedGame = { state: createInitialState('indochina-slice', 'x'), draft: emptySubmission() }
    loadGameMock.mockImplementation((slot: string) => Promise.resolve(slot === 'manual-1' ? saved : null))
    render(<SettingsOverlay {...baseProps()} />)
    await waitFor(() => expect((screen.getByTestId('settings-slot-delete-manual-1') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('settings-slot-delete-manual-1'))
    fireEvent.click(screen.getByTestId('settings-confirm-yes'))
    await waitFor(() => expect(deleteSaveMock).toHaveBeenCalledWith('manual-1'))
  })

  it('Copy Bug Report kopierar hus, tur, version och senaste händelser till urklipp', async () => {
    const props = baseProps()
    render(
      <SettingsOverlay
        {...props}
        recentEvents={[
          { id: '1-0', turn: 1, severity: 'ticker', scope: 'global', headline: 'DELIVERED 5x RIFLES TO RVN', causeId: null, delta: {}, actorIsPlayer: true, subjectId: null },
        ]}
      />,
    )
    fireEvent.click(screen.getByTestId('settings-copy-bug-report'))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce())
    const report = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(report).toContain('Meridian Arms')
    expect(report).toContain('Turn: 0')
    expect(report).toContain('DELIVERED 5x RIFLES TO RVN')
  })

  it('Restart Tutorial anropar onRestartTutorial', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByTestId('settings-restart-tutorial'))
    expect(props.onRestartTutorial).toHaveBeenCalledOnce()
  })

  it('länken till ärendelistan pekar på GitHub-repots issues, och gör ingen egen nätverkstrafik', () => {
    render(<SettingsOverlay {...baseProps()} />)
    const link = screen.getByTestId('settings-issue-tracker-link')
    expect(link.getAttribute('href')).toBe('https://github.com/obicankenobi/Valkyria/issues/new')
    expect(link.tagName).toBe('A') // ett vanligt <a>-element, aldrig ett fetch/XHR-anrop
  })

  it('stängningsknappen och Escape-bakgrunden anropar onClose, ett tryck inuti panelen gör det inte', () => {
    const props = baseProps()
    render(<SettingsOverlay {...props} />)
    fireEvent.click(screen.getByText('Sound', { selector: 'h3' }))
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('settings-close'))
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
