// THE SEVENTH FRONT — appskalet: HUD, navigation, turordning. De fyra vyerna
// ligger i components/. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8, 10.
import { useEffect, useState } from 'react'
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { ComponentLibrary } from './components/ComponentLibrary.js'
import { MainMenu } from './components/MainMenu.js'
import { TheFloor } from './components/TheFloor.js'
import { TheHouse } from './components/TheHouse.js'
import { ThePolitics } from './components/ThePolitics.js'
import { TheWire } from './components/TheWire.js'
import { TheWorld } from './components/TheWorld.js'
import { formatMoney } from './components/ui.js'
import { useGame } from './useGame.js'
import { hasSavedGame, loadMuted, saveMuted } from './persistence.js'
import { SAVE_SLOT } from './game.js'
import { playSound, setMuted as setSoundMuted } from './sound.js'

type View = 'menu' | 'wire' | 'floor' | 'house' | 'world' | 'politics'

const ENDING_LABEL: Record<string, string> = {
  INSOLVENCY: 'Insolvent — the house is liquidated',
  BUYOUT: 'Bought out — the board target was missed',
  EXPOSURE: 'Exposed — licence revoked',
  NUCLEAR_EXCHANGE: 'Nuclear exchange',
  SCENARIO_COMPLETE: 'Scenario complete',
}

function doomsdayTone(doomsday: number): string {
  if (doomsday >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'is-danger'
  if (doomsday >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'is-amber'
  return ''
}

function Hud({ state }: { state: GameState }) {
  const house = state.house
  const target = house.boardTarget
  const progressPct = target.threshold > 0 ? (target.progressSnapshot / target.threshold) * 100 : 0

  return (
    <div className="hud" data-testid="hud">
      <div className="hud-cell">
        <span className="hud-label">Treasury</span>
        <span className={house.treasury < 0 ? 'hud-value is-danger' : 'hud-value'} data-testid="hud-treasury">
          {formatMoney(house.treasury)}
        </span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Debt</span>
        <span className="hud-value">{formatMoney(house.debt)}</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Credit limit</span>
        <span className="hud-value">{formatMoney(house.creditLimit)}</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Board target</span>
        <span className="hud-value">{progressPct.toFixed(0)}%</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Action points</span>
        <span className="hud-value">{house.actionPoints}</span>
      </div>
      <div className="hud-cell">
        <span className="hud-label">Doomsday</span>
        <span className={`hud-value ${doomsdayTone(state.doomsday)}`}>{state.doomsday.toFixed(0)}</span>
      </div>
    </div>
  )
}

// P73 (ETAPP7_TEKNISK_SPEC.md §11.3): komponentsidan nås via ?screen=components,
// aldrig genom vanlig navigation i spelet — bara npm run shots och manuell
// granskning. Läst en gång från den statiska query-strängen, inte reaktiv state:
// URL:en ändras aldrig under en session (samma "stabil villkorskontroll före
// första hooket"-mönster som gör den säker att avgöra INNAN useGame() anropas).
function wantsComponentLibrary(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('screen') === 'components'
}

export function App() {
  if (wantsComponentLibrary()) return <ComponentLibrary />

  const { state, draft, lastRejected, hydrated, setBid, removeBid, addAction, removeAction, setCrisisChoice, endTurn, restart } =
    useGame()
  const [view, setView] = useState<View>('menu') // P65 (ETAPP6_TEKNISK_SPEC.md §3): menyn grindar inträdet, inte spelet direkt
  const [hasSave, setHasSave] = useState(false)
  const [muted, setMuted] = useState(false) // P72 (ETAPP6_TEKNISK_SPEC.md §5): den globala mute-togglen

  // Läses en gång, oberoende av useGame.ts:s egen loadGame-koll — samma
  // SAVE_SLOT, men bara FRÅGAR om ett parti finns i stället för att ladda det.
  // Samma gräns som useGame.ts drar: ett förkastat löfte (IndexedDB
  // otillgängligt, t.ex. privat läge) tolkas som "inget sparat parti", inte
  // som ett fel som ska synas.
  useEffect(() => {
    let cancelled = false
    hasSavedGame(SAVE_SLOT)
      .then((found) => {
        if (!cancelled) setHasSave(found)
      })
      .catch(() => {
        if (!cancelled) setHasSave(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // P72: samma gräns som ovan — ett förkastat löfte (IndexedDB otillgängligt)
  // tolkas som "omutad", inte som ett fel.
  useEffect(() => {
    let cancelled = false
    loadMuted()
      .then((value) => {
        if (!cancelled) setMuted(value)
      })
      .catch(() => {
        if (!cancelled) setMuted(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Håller sound.ts:s modulnivå-flagga i synk med React-staten ovan — den
  // enda platsen som skriver till den, så playSound() (anropad från useGame.ts
  // och klickdelegeringen nedan) alltid läser ett färskt värde.
  useEffect(() => {
    setSoundMuted(muted)
  }, [muted])

  function handleToggleMuted() {
    const next = !muted
    setMuted(next)
    saveMuted(next).catch(() => {
      // Persistens är best-effort, samma princip som useGame.ts:s autospar.
    })
  }

  // P72 ("knapptryck"): en enda click-delegering i stället för att röra varje
  // knappkomponent i appen — samma "en uppgift i taget"-princip som resten av
  // etappen. closest('button') fångar alla riktiga knappar, inklusive de i
  // MainMenu och de fyra vyerna, utan att någon av dem behöver veta att ljud
  // finns.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('button')) {
        void playSound('button-press')
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  if (!hydrated) {
    return (
      <div className="app">
        <p className="loading">Loading saved game…</p>
      </div>
    )
  }

  if (view === 'menu') {
    return (
      <MainMenu
        houseName={hasSave ? state.house.name : null}
        hasSave={hasSave}
        onContinue={() => setView('wire')}
        onNewGame={() => {
          restart()
          setView('wire')
        }}
        muted={muted}
        onToggleMuted={handleToggleMuted}
      />
    )
  }

  const ended = state.status.kind === 'ended'

  function handleEndTurn() {
    endTurn()
    setView('wire') // THE WIRE är startvyn varje tur (avsnitt 8)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          The Seventh Front
          <span className="brand-house">{state.house.name}</span>
        </h1>
        <span className="datestamp" data-testid="datestamp">
          {state.meta.year} · Q{state.meta.quarter} · Turn {state.meta.turn}
        </span>
      </header>

      <Hud state={state} />

      <nav className="tabs">
        <button type="button" className="tab" onClick={() => setView('wire')} disabled={view === 'wire'}>
          THE WIRE
        </button>
        <button type="button" className="tab" onClick={() => setView('floor')} disabled={view === 'floor'}>
          THE FLOOR
          <span className="tab-count">{state.market.openOrders.length}</span>
        </button>
        <button type="button" className="tab" onClick={() => setView('house')} disabled={view === 'house'}>
          THE HOUSE
        </button>
        <button type="button" className="tab" onClick={() => setView('world')} disabled={view === 'world'}>
          THE WORLD
        </button>
        <button type="button" className="tab" onClick={() => setView('politics')} disabled={view === 'politics'}>
          THE POLITICS
        </button>
        <span className="tabs-spacer" />
        <button type="button" className="btn btn-primary" onClick={handleEndTurn} disabled={ended}>
          End Turn
          {draft.bids.length > 0 ? ` · ${draft.bids.length} bids` : ''}
        </button>
      </nav>

      {ended && state.status.kind === 'ended' && (
        <div className="banner is-ended">
          <div>
            <div className="banner-title">{ENDING_LABEL[state.status.ending] ?? state.status.ending}</div>
            <div className="banner-sub">Game decided on turn {state.status.turn}.</div>
          </div>
          <span className="tabs-spacer" />
          <button type="button" className="btn" onClick={restart}>
            New Game
          </button>
        </div>
      )}

      {lastRejected.length > 0 && (
        <div className="banner">
          <div>
            <div className="banner-title">Rejected last turn</div>
            <ul>
              {lastRejected.map((entry, i) => (
                <li key={i}>{entry.reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <main>
        {view === 'wire' && (
          <TheWire wire={state.wire} state={state} draft={draft} onChooseCrisis={setCrisisChoice} />
        )}
        {view === 'floor' && <TheFloor state={state} draft={draft} onSubmitBid={setBid} onRemoveBid={removeBid} />}
        {view === 'house' && (
          <TheHouse state={state} draft={draft} onAddAction={addAction} onRemoveAction={removeAction} />
        )}
        {view === 'world' && <TheWorld state={state} />}
        {view === 'politics' && <ThePolitics state={state} />}
      </main>
    </div>
  )
}
