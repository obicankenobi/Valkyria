// THE SEVENTH FRONT — appskalet (P74, ETAPP7_TEKNISK_SPEC.md §5/§10/§13): fast
// viewport, HUD, This Quarter-band, telexremsa, handlingsdocka och flikrad
// (nya namn, §2G). Komponentfilerna för de fyra befintliga vyerna
// (TheFloor.tsx m.fl.) rörs INTE av namnbytet — bara det spelaren ser här i
// skalet. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8, 10 för den ursprungliga
// arkitekturen detta bygger vidare på.
import { useEffect, useState } from 'react'
import { ComponentLibrary } from './components/ComponentLibrary.js'
import { MainMenu } from './components/MainMenu.js'
import { NewGameScreen } from './components/NewGameScreen.js'
import { BriefingScreen } from './components/BriefingScreen.js'
import { EpilogueScreen, ENDING_LABEL } from './components/EpilogueScreen.js'
import { ActionDock, HudBar, QuarterBand, RejectedBanner, TabBar } from './components/Shell.js'
import type { ShellView } from './components/Shell.js'
import { TheatreMap } from './components/TheatreMap.js'
import { CountryFile } from './components/CountryFile.js'
import type { FactionId } from '@seventh-front/core'
import { TheFloor } from './components/TheFloor.js'
import { TheHouse } from './components/TheHouse.js'
import { ThePolitics } from './components/ThePolitics.js'
import { TheWire } from './components/TheWire.js'
import { QuarterReplay } from './components/QuarterReplay.js'
import { PauseOverlay } from './components/PauseOverlay.js'
import { SettingsOverlay } from './components/SettingsOverlay.js'
import { ActionCatalog } from './components/ActionCatalog.js'
import { TutorialOverlay } from './components/TutorialOverlay.js'
import type { ThisQuarterTarget } from './thisQuarter.js'
import { useGame } from './useGame.js'
import {
  hasSavedGame,
  loadFullReplay,
  loadMotion,
  loadMuted,
  loadTextScale,
  loadTutorialSeen,
  loadTutorialState,
  loadVolume,
  saveFullReplay,
  saveMotion,
  saveMuted,
  saveTextScale,
  saveTutorialSeen,
  saveTutorialState,
  saveVolume,
} from './persistence.js'
import type { MotionSetting, TextScaleSetting } from './persistence.js'
import { SAVE_SLOT } from './game.js'
import { playSound, setMuted as setSoundMuted, setVolume as setSoundVolume } from './sound.js'
import {
  INITIAL_TUTORIAL_STATE,
  completeTutorialStep,
  currentTutorialStep,
  startTutorial,
  stopTutorial,
  tutorialIsDone,
} from './tutorial.js'

// P88 (ETAPP7_TEKNISK_SPEC.md §5/§9/§13): "Title Screen ─► New Game ─►
// Briefing ─► OPERATIONS." 'menu' är Title Screen (MainMenu.tsx, oförändrad
// sedan P65); 'new-game'/'briefing' är de två nya mellanstegen.
// P89 (§5/§9): "Front Page ──(slut)──► Epilogue ─► Title Screen" — 'epilogue'
// är det sista steget, nått från den redan befintliga ended-bannern nedan.
type View = 'menu' | 'new-game' | 'briefing' | 'epilogue' | ShellView

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

  const {
    state,
    draft,
    lastRejected,
    lastTurnWire,
    hydrated,
    setBid,
    removeBid,
    addAction,
    removeAction,
    setCrisisChoice,
    endTurn,
    restart,
    loadFromSlot,
  } = useGame()
  const [view, setView] = useState<View>('menu') // P65 (ETAPP6_TEKNISK_SPEC.md §3): menyn grindar inträdet, inte spelet direkt
  const [hasSave, setHasSave] = useState(false)
  // P79 (ETAPP7_TEKNISK_SPEC.md §7.1/§13): valt land på kartan öppnar dess
  // bottenark (CountryFile.tsx). Bara relevant på OPERATIONS — ett tabbyte
  // stänger den implicit (renderas bara när view === 'operations').
  const [selectedFactionId, setSelectedFactionId] = useState<FactionId | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [muted, setMuted] = useState(false) // P72 (ETAPP6_TEKNISK_SPEC.md §5): den globala mute-togglen
  // P80 (ETAPP7_TEKNISK_SPEC.md §8): kvartalsuppspelningen visas mellan End
  // Quarter och NEWS DESK. `replaying` styr ÖVERLAGET, oberoende av `view` —
  // NEWS DESK-navigeringen sker först efter att uppspelningen är klar
  // (QuarterReplay.tsx:s onDone), samma sekvens som §5:s skärmarkitektur
  // ("End Quarter → Quarter Replay → Front Page").
  const [replaying, setReplaying] = useState(false)
  const [fullReplay, setFullReplay] = useState(false)
  // P81b (§13, P81-6): pausöverlaget. Regel 16 ("Esc för paus") nås oavsett
  // vilken flik som är aktiv, samma princip som End Quarter-fallbacken.
  const [paused, setPaused] = useState(false)
  // P90 (§9/§13): inställningsöverlaget, öppnat FRÅN pausöverlaget (en ny
  // "Settings"-knapp där) — se SettingsOverlay.tsx:s egen kommentar för
  // varför volym/rörelseläge/textstorlek fick de här formerna.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [motion, setMotion] = useState<MotionSetting>('normal')
  const [textScale, setTextScale] = useState<TextScaleSetting>('normal')
  // P91a (§9/§13, P81-20): handledningen. `tutorialSeen` styr bara
  // AUTOSTARTEN (se persistence.ts:s egen kommentar) — `tutorial` är det
  // faktiska förloppet, laddat separat nedan så ett pågående steg överlever
  // en omladdning mitt i.
  const [tutorial, setTutorial] = useState(INITIAL_TUTORIAL_STATE)
  // GENUINT FYND: `false` (inte `true`) som startvärde — `loadTutorialSeen()`
  // är asynkron (IndexedDB), och ett tillräckligt snabbt klick genom New Game
  // (upptäckt av just den sortens klick i scripts/shots.mjs/e2e-specerna)
  // hinner annars före svaret. `false` gör att en racead läsning i VÄRSTA
  // fall visar handledningen en gång för mycket för en återvändande spelare
  // — hellre det än att den ALDRIG visas för en genuint ny.
  const [tutorialSeen, setTutorialSeen] = useState(false)

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

  // P80: samma gräns som ovan — ett förkastat löfte (IndexedDB otillgängligt)
  // tolkas som "standardläge, rubriker" (false), inte som ett fel.
  useEffect(() => {
    let cancelled = false
    loadFullReplay()
      .then((value) => {
        if (!cancelled) setFullReplay(value)
      })
      .catch(() => {
        if (!cancelled) setFullReplay(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleToggleFullReplay(next: boolean) {
    setFullReplay(next)
    saveFullReplay(next).catch(() => {
      // Persistens är best-effort, samma princip som handleToggleMuted nedan.
    })
  }

  // P90: samma förkastat-löfte-är-standardvärde-gräns som ovan, för de tre
  // nya inställningarna.
  useEffect(() => {
    let cancelled = false
    loadVolume()
      .then((value) => {
        if (!cancelled) setVolume(value)
      })
      .catch(() => {
        if (!cancelled) setVolume(1)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadMotion()
      .then((value) => {
        if (!cancelled) setMotion(value)
      })
      .catch(() => {
        if (!cancelled) setMotion('normal')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadTextScale()
      .then((value) => {
        if (!cancelled) setTextScale(value)
      })
      .catch(() => {
        if (!cancelled) setTextScale('normal')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleVolumeChange(next: number) {
    setVolume(next)
    saveVolume(next).catch(() => {})
  }

  function handleMotionChange(next: MotionSetting) {
    setMotion(next)
    saveMotion(next).catch(() => {})
  }

  function handleTextScaleChange(next: TextScaleSetting) {
    setTextScale(next)
    saveTextScale(next).catch(() => {})
  }

  // P91a: läs vilket förlopp som redan pågår (om spelaren laddade om mitt i)
  // och om handledningen någonsin körts förut — samma förkastat-löfte-är-
  // standardvärde-gräns som resten av filens egna loadX-effekter.
  useEffect(() => {
    let cancelled = false
    loadTutorialState()
      .then((value) => {
        if (!cancelled && value) setTutorial(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadTutorialSeen()
      .then((seen) => {
        if (!cancelled) setTutorialSeen(seen)
      })
      .catch(() => {
        if (!cancelled) setTutorialSeen(true) // ovisst läge — hellre tyst än en oönskad autostart
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveTutorialState(tutorial).catch(() => {})
  }, [tutorial])

  function handleDismissTutorial() {
    setTutorial(stopTutorial())
  }

  function handleRestartTutorial() {
    setTutorial(startTutorial())
    setTutorialSeen(true)
    saveTutorialSeen(true).catch(() => {})
  }

  // Ett steg markeras klart oavsett var i partiet spelaren är — se
  // tutorial.ts:s egen kommentar om varför ordningen inte är hårt grindad.
  // Avstängningen vid TUTORIAL_TURN_LIMIT sker i samma effekt som markerar
  // 'read-news' (den enda som beror på `state.meta.turn`).
  useEffect(() => {
    if (!tutorial.active) return
    if (selectedFactionId) setTutorial((t) => completeTutorialStep(t, 'select-country'))
  }, [tutorial.active, selectedFactionId])

  useEffect(() => {
    if (!tutorial.active) return
    if (draft.bids.length > 0) setTutorial((t) => completeTutorialStep(t, 'place-bid'))
  }, [tutorial.active, draft.bids.length])

  useEffect(() => {
    if (!tutorial.active) return
    if (draft.actions.length > 0) setTutorial((t) => completeTutorialStep(t, 'fill-action-slot'))
  }, [tutorial.active, draft.actions.length])

  useEffect(() => {
    if (!tutorial.active) return
    if (view === 'news' && state.meta.turn > 0) setTutorial((t) => completeTutorialStep(t, 'read-news'))
  }, [tutorial.active, view, state.meta.turn])

  useEffect(() => {
    if (!tutorial.active) return
    if (tutorialIsDone(tutorial, state.meta.turn)) setTutorial(stopTutorial())
  }, [tutorial, state.meta.turn])

  // Håller sound.ts:s modulnivå-flagga i synk med React-staten ovan — den
  // enda platsen som skriver till den, så playSound() (anropad från useGame.ts
  // och klickdelegeringen nedan) alltid läser ett färskt värde.
  useEffect(() => {
    setSoundMuted(muted)
  }, [muted])

  useEffect(() => {
    setSoundVolume(volume)
  }, [volume])

  // P90: [data-motion]/[data-text-scale] på <html> — styles.css:s nya regler
  // (samma universalselektor-teknik som den redan befintliga
  // prefers-reduced-motion-regeln) läser attributen direkt, ingen inline-
  // style eller CSS-in-JS behövs.
  useEffect(() => {
    document.documentElement.dataset.motion = motion
  }, [motion])

  useEffect(() => {
    document.documentElement.dataset.textScale = textScale
  }, [textScale])

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

  // Regel 16 (CLAUDE.md, "Spelgränssnitt — regler (etapp 7)"): "Esc för
  // paus." Guardas mot menyn/uppspelningen — ett pausöverlag ovanpå
  // huvudmenyn eller mitt i kvartalsuppspelningen har ingen mening (och
  // uppspelningen har sin egen Skip-knapp). P90: Settings öppnas OVANPÅ
  // Pause (samma "en kris slår igenom ett öppet pausläge"-lagring som
  // crisis-fullscreen redan har mot .pause-overlay) — Esc stänger då bara
  // Settings, aldrig båda på en gång, annars hade paus-overlayet blivit
  // kvarlämnat overlayat utan sin egen dimning.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (view === 'menu' || replaying) return
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      setPaused((v) => !v)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [view, replaying, settingsOpen])

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
        onNewGame={() => setView('new-game')}
        muted={muted}
        onToggleMuted={handleToggleMuted}
      />
    )
  }

  // P88 (§5): "New Game ─► Briefing ─► OPERATIONS." restart() overwrites
  // state immediately (same as the old direct-to-operations flow always
  // did) — Briefing then shows the freshly created house before the
  // player commits to entering OPERATIONS.
  if (view === 'new-game') {
    return (
      <NewGameScreen
        onSubmit={(choices) => {
          restart(choices)
          // P91a (§9/§13, P81-20): "de tre första kvartalen i ETT NYTT
          // PARTI" — bara den FÖRSTA egentliga nya spelomgången autostartar
          // den (tutorialSeen), aldrig varje omstart (annars vore "avstängningsbar"
          // meningslöst).
          if (!tutorialSeen) {
            setTutorial(startTutorial())
            setTutorialSeen(true)
            saveTutorialSeen(true).catch(() => {})
          }
          setView('briefing')
        }}
        onBack={() => setView('menu')}
      />
    )
  }

  if (view === 'briefing') {
    return <BriefingScreen state={state} onBegin={() => setView('operations')} onBack={() => setView('menu')} />
  }

  // P89 (§5/§9): sista steget innan Title Screen. Öppnas bara via bannerns
  // egen "Epilogue"-knapp nedan — ingen egen autonavigering, samma "spelaren
  // väljer när" som Quarter Replay redan har (Skip-knapp, aldrig tvingad).
  if (view === 'epilogue') {
    return <EpilogueScreen state={state} onTitleScreen={() => setView('menu')} />
  }

  const ended = state.status.kind === 'ended'

  function handleEndTurn() {
    endTurn()
    setReplaying(true) // §5: End Quarter → Quarter Replay → Front Page (NEWS DESK)
    if (tutorial.active) setTutorial((t) => completeTutorialStep(t, 'end-quarter'))
  }

  return (
    <div className="ds-shell">
      <HudBar state={state} onOpenMenu={() => setPaused(true)} />
      <QuarterBand
        state={state}
        onNavigate={(target: ThisQuarterTarget) => {
          if (target.view === 'operations') setSelectedFactionId(target.factionId)
          setView(target.view)
        }}
      />

      <main className="ds-shell-content">
        {ended && state.status.kind === 'ended' && (
          <div className="banner is-ended" data-testid="ended-banner">
            <div>
              <div className="banner-title">{ENDING_LABEL[state.status.ending] ?? state.status.ending}</div>
              <div className="banner-sub">Game decided on turn {state.status.turn}.</div>
            </div>
            <span className="tabs-spacer" />
            {/* P89 (§5): "Front Page ──(slut)──► Epilogue ─► Title Screen" —
                the ended-game shortcut now opens the Epilogue (the four
                axes, the ending card, turning points, the full chronicle)
                instead of jumping straight to the Title Screen. Epilogue
                itself offers the Title Screen button (which in turn offers
                New Game → Briefing). */}
            <button type="button" className="btn" onClick={() => setView('epilogue')} data-testid="ended-banner-epilogue">
              Epilogue
            </button>
          </div>
        )}

        <RejectedBanner rejected={lastRejected} />

        {/* P91a (§9/§13, P81-20): synlig oavsett flik, samma princip som
            RejectedBanner ovan — se TutorialOverlay.tsx:s egen kommentar. */}
        <TutorialOverlay step={currentTutorialStep(tutorial)} onDismiss={handleDismissTutorial} />

        {/* P74/P76 (§13): OPERATIONS är kartan. P74 byggde skalet med en
            platshållare; P76 ersätter den med TheatreMap, den riktiga
            geografiska kartan (TopoJSON, d3-geo, d3-zoom, SECTOR_REGIONS).
            Den gamla THE WORLD-vyn (TheWorld.tsx — Doomsday, Theatres,
            Factions, Stations) döps inte om till OPERATIONS; dess innehåll
            återkommer styckvis i senare prompter (landets bottenark i P79,
            dossiererna i CONTACTS) i stället för att flyttas hit i sin
            helhet. TheWorld.tsx rörs inte och lämnas oanvänd så länge. */}
        {view === 'operations' && (
          <TheatreMap state={state} selectedFactionId={selectedFactionId} onSelectCountry={setSelectedFactionId} />
        )}
        {view === 'operations' && selectedFactionId && (
          <CountryFile
            state={state}
            factionId={selectedFactionId}
            onAddAction={addAction}
            onClose={() => setSelectedFactionId(null)}
            onOpenContacts={() => {
              setSelectedFactionId(null)
              setView('contacts')
            }}
          />
        )}
        {view === 'contracts' && <TheFloor state={state} draft={draft} onSubmitBid={setBid} onRemoveBid={removeBid} />}
        {view === 'company' && (
          <TheHouse state={state} draft={draft} onAddAction={addAction} onRemoveAction={removeAction} />
        )}
        {view === 'contacts' && <ThePolitics state={state} onAddAction={addAction} />}
        {view === 'news' && (
          <TheWire wire={state.wire} state={state} draft={draft} onChooseCrisis={setCrisisChoice} />
        )}
      </main>

      {view === 'operations' && (
        <ActionDock
          state={state}
          actions={draft.actions}
          onRemoveAction={removeAction}
          onEndTurn={handleEndTurn}
          onOpenCatalog={() => setCatalogOpen(true)}
          ended={ended}
        />
      )}

      <ActionCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onNavigate={(catalogView) => setView(catalogView)}
      />

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

      {replaying && (
        <QuarterReplay
          wire={lastTurnWire}
          state={state}
          fullReplay={fullReplay}
          onToggleFullReplay={handleToggleFullReplay}
          onDone={() => {
            setReplaying(false)
            setView('news') // NEWS DESK (f.d. THE WIRE) är startvyn varje tur (avsnitt 8)
          }}
        />
      )}

      {/* P81b (§13, P81-6): pausöverlaget. "Tillbaka till huvudmenyn" kräver
          ingen egen sparning — useGame.ts:s autospar körs redan efter varje
          tur, samma gräns MainMenu.tsx:s "New Game"-bekräftelse redan litar
          på. */}
      <PauseOverlay
        open={paused}
        muted={muted}
        onToggleMuted={handleToggleMuted}
        onResume={() => setPaused(false)}
        onMainMenu={() => {
          setPaused(false)
          setView('menu')
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* P90 (§9/§13): SettingsOverlay öppnas FRÅN pausöverlaget — se den
          filens egen kommentar för scope-besluten (volym i stället för
          "kanaler", rörelseläge i stället för två separata reglage,
          sparplatser som manuella kontrollpunkter ovanpå den befintliga
          autosparningen). */}
      <SettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        muted={muted}
        onToggleMuted={handleToggleMuted}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        fullReplay={fullReplay}
        onToggleFullReplay={handleToggleFullReplay}
        motion={motion}
        onMotionChange={handleMotionChange}
        textScale={textScale}
        onTextScaleChange={handleTextScaleChange}
        state={state}
        draft={draft}
        recentEvents={lastTurnWire}
        onLoadFromSlot={loadFromSlot}
        onRestartTutorial={handleRestartTutorial}
      />
    </div>
  )
}
