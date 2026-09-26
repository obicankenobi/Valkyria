// THE SEVENTH FRONT — appskalet (P74, ETAPP7_TEKNISK_SPEC.md §5/§10/§13): fast
// viewport, HUD, This Quarter-band, telexremsa, handlingsdocka och flikrad
// (nya namn, §2G). Komponentfilerna för de fyra befintliga vyerna
// (TheFloor.tsx m.fl.) rörs INTE av namnbytet — bara det spelaren ser här i
// skalet. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8, 10 för den ursprungliga
// arkitekturen detta bygger vidare på.
import { useEffect, useState } from 'react'
import { ComponentLibrary } from './components/ComponentLibrary.js'
import { MainMenu } from './components/MainMenu.js'
import { ActionDock, HudBar, MapPlaceholder, QuarterBand, RejectedBanner, TabBar } from './components/Shell.js'
import type { ShellView } from './components/Shell.js'
import { TheFloor } from './components/TheFloor.js'
import { TheHouse } from './components/TheHouse.js'
import { ThePolitics } from './components/ThePolitics.js'
import { TheWire } from './components/TheWire.js'
import { useGame } from './useGame.js'
import { hasSavedGame, loadMuted, saveMuted } from './persistence.js'
import { SAVE_SLOT } from './game.js'
import { playSound, setMuted as setSoundMuted } from './sound.js'

type View = 'menu' | ShellView

const ENDING_LABEL: Record<string, string> = {
  INSOLVENCY: 'Insolvent — the house is liquidated',
  BUYOUT: 'Bought out — the board target was missed',
  EXPOSURE: 'Exposed — licence revoked',
  NUCLEAR_EXCHANGE: 'Nuclear exchange',
  SCENARIO_COMPLETE: 'Scenario complete',
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
        onContinue={() => setView('operations')}
        onNewGame={() => {
          restart()
          setView('operations')
        }}
        muted={muted}
        onToggleMuted={handleToggleMuted}
      />
    )
  }

  const ended = state.status.kind === 'ended'

  function handleEndTurn() {
    endTurn()
    setView('news') // NEWS DESK (f.d. THE WIRE) är startvyn varje tur (avsnitt 8)
  }

  return (
    <div className="ds-shell">
      <HudBar state={state} />
      <QuarterBand state={state} />

      <main className="ds-shell-content">
        {ended && state.status.kind === 'ended' && (
          <div className="banner is-ended" data-testid="ended-banner">
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

        <RejectedBanner rejected={lastRejected} />

        {/* P74 (§13): OPERATIONS är kartan, med platshållare tills P76 bygger den
            riktiga teaterkartan. Den gamla THE WORLD-vyn (TheWorld.tsx — Doomsday,
            Theatres, Fronts, Factions, Stations) döps inte om till OPERATIONS; dess
            innehåll återkommer styckvis i senare prompter (kartan i P76, landets
            bottenark i P79, dossiererna i CONTACTS) i stället för att flyttas hit i
            sin helhet. TheWorld.tsx rörs inte och lämnas oanvänd så länge. */}
        {view === 'operations' && <MapPlaceholder theatreName={Object.values(state.theatres)[0]?.name ?? 'Indochina'} />}
        {view === 'contracts' && <TheFloor state={state} draft={draft} onSubmitBid={setBid} onRemoveBid={removeBid} />}
        {view === 'company' && (
          <TheHouse state={state} draft={draft} onAddAction={addAction} onRemoveAction={removeAction} />
        )}
        {view === 'contacts' && <ThePolitics state={state} />}
        {view === 'news' && (
          <TheWire wire={state.wire} state={state} draft={draft} onChooseCrisis={setCrisisChoice} />
        )}
      </main>

      {view === 'operations' && <ActionDock state={state} queuedCount={draft.actions.length} onRemoveAction={removeAction} onEndTurn={handleEndTurn} ended={ended} />}

      <TabBar
        active={view}
        onSelect={setView}
        contractsCount={state.market.openOrders.length}
        newsCount={undefined}
      />

      {/* End Quarter måste nås oavsett vilken flik som är aktiv (samma
          princip som den gamla, alltid synliga navigationsraden) — §5:s
          mockup visar den bara i OPERATIONS-läget, men att bara kunna
          avsluta kvartalet från en enda flik hade varit en regression mot
          appens nuvarande beteende. En liten, sekundär knapp på övriga
          flikar, i stället för att duplicera hela handlingsdockan. */}
      {view !== 'operations' && (
        <button type="button" className="ds-button is-primary ds-end-quarter-fallback" onClick={handleEndTurn} disabled={ended} data-testid="end-quarter-button">
          End Quarter
        </button>
      )}
    </div>
  )
}
