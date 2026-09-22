// MAIN MENU — grindar inträdet till spelet (P65, ETAPP6_TEKNISK_SPEC.md §3).
// En egen, full-bredd skärm som bryter panelmönstret medvetet, inte ännu en
// Panel — se styles.css:s .menu-*-regler.
//
// Bekräftelsedialogen för "New Game" hör hemma HÄR, inte i App.tsx: den delar
// exakt samma hasSave-gren som "Continue"-knappens disabled-status, och att
// hålla båda i samma komponent undviker att den grenen dupliceras. Utfallet är
// detsamma specen beskriver ("bekräftelsedialog INNAN onNewGame anropas") —
// bara var JSX:en bor skiljer sig, inte beteendet.
import { useState } from 'react'

export function MainMenu({
  houseName,
  hasSave,
  onContinue,
  onNewGame,
  muted,
  onToggleMuted,
}: {
  houseName: string | null // null om inget sparat parti finns
  hasSave: boolean
  onContinue: () => void
  onNewGame: () => void
  muted: boolean // P72 (ETAPP6_TEKNISK_SPEC.md §5): den globala mute-togglen
  onToggleMuted: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  function handleNewGameClick() {
    if (hasSave) {
      setConfirming(true)
      return
    }
    onNewGame()
  }

  function handleConfirm() {
    setConfirming(false)
    onNewGame()
  }

  return (
    <div className="menu-screen">
      <div className="menu-backdrop" />
      <div className="menu-content">
        <h1 className="menu-title">The Seventh Front</h1>
        <p className="menu-subtitle" data-testid="menu-subtitle">
          {houseName ? `Continue as ${houseName}` : 'A new arms house, waiting for its first order.'}
        </p>
        <div className="menu-actions">
          <button
            type="button"
            className="btn btn-primary menu-btn"
            onClick={onContinue}
            disabled={!hasSave}
            data-testid="menu-continue"
          >
            Continue
          </button>
          <button type="button" className="btn menu-btn" onClick={handleNewGameClick} data-testid="menu-new-game">
            New Game
          </button>
        </div>
        <button type="button" className="btn btn-ghost menu-mute" onClick={onToggleMuted} data-testid="menu-mute-toggle">
          {muted ? 'Sound: Off' : 'Sound: On'}
        </button>
      </div>

      {confirming && (
        <div className="modal-overlay" data-testid="new-game-confirm">
          <div className="modal-panel">
            <h2 className="view-title">Start a new game?</h2>
            <p className="banner-sub">This overwrites your saved game.</p>
            <div className="crisis-choices">
              <button type="button" className="btn btn-primary" onClick={handleConfirm} data-testid="new-game-confirm-yes">
                Overwrite and start new
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
                data-testid="new-game-confirm-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
