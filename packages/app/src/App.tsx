// THE SEVENTH FRONT — appskalet (P74, ETAPP7_TEKNISK_SPEC.md §5/§10/§13): fast
// viewport, HUD, This Quarter-band, telexremsa, handlingsdocka och flikrad
// (nya namn, §2G). Komponentfilerna för de fyra befintliga vyerna
// (TheFloor.tsx m.fl.) rörs INTE av namnbytet — bara det spelaren ser här i
// skalet. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8, 10 för den ursprungliga
// arkitekturen detta bygger vidare på.
import { useEffect, useRef, useState } from 'react'
import { ComponentLibrary } from './components/ComponentLibrary.js'
import { MainMenu } from './components/MainMenu.js'
import { NewGameScreen } from './components/NewGameScreen.js'
import { BriefingScreen } from './components/BriefingScreen.js'
import { EpilogueScreen, ENDING_LABEL } from './components/EpilogueScreen.js'
import { ActionDock, HudBar, QuarterBand, RejectedBanner, TabBar } from './components/Shell.js'
import type { ShellView } from './components/Shell.js'
import { TheatreMap } from './components/TheatreMap.js'
import { CountryFile } from './components/CountryFile.js'
import { boardMemo } from '@seventh-front/core'
import type { FactionId } from '@seventh-front/core'
import { TheFloor } from './components/TheFloor.js'
import { TheHouse } from './components/TheHouse.js'
import { ThePolitics } from './components/ThePolitics.js'
import { TheWire } from './components/TheWire.js'
import { QuarterReplay } from './components/QuarterReplay.js'
import { PauseOverlay } from './components/PauseOverlay.js'
import { SettingsOverlay } from './components/SettingsOverlay.js'
import { ActionCatalog } from './components/ActionCatalog.js'
import { ArmedVerbStrip } from './components/ArmedVerbStrip.js'
import { actionVerb } from './actionInfo.js'
import { ArmedVerbContext, HandbookContext } from './uiContext.js'
import type { ArmedVerb } from './uiContext.js'
import type { ActionCatalogEntry } from './actionCatalog.js'
import { TutorialOverlay } from './components/TutorialOverlay.js'
import { Handbook } from './components/Handbook.js'
import { MemoSheet } from './components/MemoSheet.js'
import { dueMemos, findMemo } from './memos.js'
import type { HandbookTopicId } from './handbook.js'
import type { ThisQuarterTarget } from './thisQuarter.js'
import { useGame } from './useGame.js'
import {
  hasSavedGame,
  loadFullReplay,
  loadMotion,
  loadMuted,
  loadTextScale,
  loadMemosRead,
  loadTutorialSeen,
  loadTutorialState,
  loadVolume,
  saveFullReplay,
  saveMotion,
  saveMuted,
  saveTextScale,
  saveMemosRead,
  saveTutorialSeen,
  saveTutorialState,
  saveVolume,
} from './persistence.js'
import type { MotionSetting, TextScaleSetting } from './persistence.js'
import { SAVE_SLOT } from './game.js'
import { isInGameView, musicMode } from './musicDirector.js'
import { createFrameRateGuard } from './frameRateGuard.js'
import { shortcutFor, shortcutKeyFromEvent } from './shortcuts.js'
import {
  initAudioLifecycle,
  playSound,
  setAmbience,
  setMusicDuck,
  setMusicMode,
  setMuted as setSoundMuted,
  setVolume as setSoundVolume,
} from './sound.js'
import { ambienceLayers, soundCuesFor, type SoundSnapshot } from './soundCues.js'
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
    setStandingOrder,
    removeStandingOrder,
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
  // P163 (ETAPP10_FORSLAG.md §3b): verbet spelaren valde i Actions-menyn. Det följer med till mappen där det utförs (remsa, markering, förvalt läge) tills det är
  // utfört eller avbrutet.
  const [armed, setArmed] = useState<ArmedVerb | null>(null)
  const armedNonce = useRef(0)
  // P101: This Quarter-larm hoppar till ett kort på anslagstavlan (THE COMPANY) med kortet öppet.
  const [focusCard, setFocusCard] = useState<string | null>(null)
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

  // P91b (§9/§13, P81-20): handboken. Ingen persistens behövs — bara ett
  // öppet/stängt-läge och vilket uppslag som ska vara i fokus, samma
  // mönster som MapLegend.tsx:s (P81a) redan etablerade focusId.
  // P127 (ETAPP9 §9, daterade PM): vilka PM som lästs (global inställning) och vilket PM som är öppet. Olästa PM visas inte förrän inläsningen
  // svarat (annars blinkar ett redan läst PM förbi).
  const [memosRead, setMemosRead] = useState<string[]>([])
  const [memosLoaded, setMemosLoaded] = useState(false)
  const [memoOpenId, setMemoOpenId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadMemosRead()
      .then((read) => {
        if (cancelled) return
        setMemosRead(read)
        setMemosLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setMemosLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [handbookOpen, setHandbookOpen] = useState(false)
  const [handbookFocusId, setHandbookFocusId] = useState<HandbookTopicId | null>(null)

  function fileMemo(id: string | null) {
    if (!id) return
    setMemoOpenId(null)
    setMemosRead((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      saveMemosRead(next).catch(() => {})
      return next
    })
  }

  function handleOpenHandbook(topic: HandbookTopicId) {
    setHandbookFocusId(topic)
    setHandbookOpen(true)
  }

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
    // P93 ("hovring"): bara en riktig mus — pekskärmar skickar pointerType
    // 'touch', så ett tryck spelar aldrig hovringsljudet (regel 13: hovring är
    // aldrig den enda vägen till något). En knapp räknas en gång per inträde,
    // inte för varje barnelement musen passerar.
    function handleHover(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (!button || button.disabled) return
      const from = event.relatedTarget instanceof Element ? event.relatedTarget.closest('button') : null
      if (button !== from) void playSound('hover')
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('pointerover', handleHover)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('pointerover', handleHover)
    }
  }, [])

  // P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md): första tryck
  // startar ljudet, appen i bakgrunden pausar det.
  useEffect(() => initAudioLifecycle(), [])

  // Musikläget följer speltillståndet (musicDirector.ts, ren). Slutorsaken
  // behövs bara för epilogens val mellan de två spåren.
  const endingCode = state.status.kind === 'ended' ? state.status.ending : null
  const crisisPending = state.pendingCrisis !== null
  useEffect(() => {
    setMusicMode(musicMode({ view, doomsday: state.doomsday, pendingCrisis: crisisPending, endingCode }))
  }, [view, state.doomsday, crisisPending, endingCode])

  useEffect(() => {
    setMusicDuck(replaying) // "pågående spår sänks 6 dB" under uppspelningen (musicDirector.musicDuck)
  }, [replaying])

  useEffect(() => {
    setAmbience(ambienceLayers({ view, replaying }))
  }, [view, replaying])

  // P94 (§12 punkt 5): "Sjunker bildtakten stängs omgivningsrörelsen av
  // automatiskt." Mäter bara medan en spelskärm är uppe och det finns någon
  // rörelse att stänga av; vid prefers-reduced-motion eller Motion: Off finns
  // ingen. Utlöser vakten sätts [data-ambient="off"] (styles.css) och mätningen
  // slutar — kartan blir stilla men inget annat ändras.
  const gameScreenUp = isInGameView(view)
  useEffect(() => {
    if (!gameScreenUp) return
    const root = document.documentElement
    if (root.dataset.ambient === 'off' || root.dataset.motion === 'off') return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const guard = createFrameRateGuard()
    let raf = 0
    function frame(now: number) {
      if (guard.feed(now)) {
        root.dataset.ambient = 'off'
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [gameScreenUp])

  // Tillståndsdrivna effekter (kortplacering, stämpel, ny order, kris, radiobrus,
  // flikbyte...): en ren diff mellan förra och nuvarande ögonblicksbild
  // (soundCues.ts). Körs efter varje rendering — jämförelsen är billig, och en
  // signal kommer bara när något faktiskt ändrats.
  const previousSnapshot = useRef<SoundSnapshot | null>(null)
  useEffect(() => {
    const next: SoundSnapshot = {
      view,
      actionTypes: draft.actions.map((action) => action.type),
      bidCount: draft.bids.length,
      openOrderCount: state.market.openOrders.length,
      pendingCrisis: crisisPending,
      selectedFactionId,
      replaying,
      turn: state.meta.turn,
      wireHeadlines: lastTurnWire.map((event) => event.headline),
    }
    const previous = previousSnapshot.current
    previousSnapshot.current = next
    if (!previous) return
    for (const cue of soundCuesFor(previous, next)) void playSound(cue)
  })

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

  // P94 (regel 16): "1–5 för skärmarna, Enter för End Quarter." Beslutet tas av
  // den rena shortcuts.ts; utförandet är ett klick på den riktiga fliken/knappen,
  // så att handledningssteg, ljud och spellogik går exakt som vid ett tryck (och
  // en avstängd knapp — partiet slut — gör ingenting). Spelläget läses ur en ref
  // så lyssnaren bara sätts upp en gång.
  const shortcutState = useRef({ inGame: false, blocked: true })
  useEffect(() => {
    shortcutState.current = {
      inGame: isInGameView(view),
      blocked: paused || settingsOpen || handbookOpen || catalogOpen || replaying || crisisPending,
    }
  })
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      // Bottenark (landsakt, teckenförklaring, ...) håller egen state i sina
      // komponenter — deras överlagg finns bara i DOM:en.
      const sheetOpen = document.querySelector('.ds-sheet-overlay') !== null
      const action = shortcutFor(shortcutKeyFromEvent(event), {
        inGame: shortcutState.current.inGame,
        blocked: shortcutState.current.blocked || sheetOpen,
      })
      if (!action) return
      const selector = action.kind === 'view' ? `[data-testid="tab-${action.view}"]` : '[data-testid="end-quarter-button"]'
      const button = document.querySelector<HTMLButtonElement>(selector)
      if (!button || button.disabled) return
      event.preventDefault()
      button.click()
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  // P163: markerar formuläret eller knappen som utför det valda verbet (data-verb → data-armed) och rullar det i sikte. Körs om när vyn eller landet byts, eftersom
  // elementen först då finns i DOM:en.
  useEffect(() => {
    const marked: Element[] = []
    let frame = 0
    if (armed) {
      frame = requestAnimationFrame(() => {
        const matches = [...document.querySelectorAll(`[data-verb~="${armed.verb}"]`)]
        for (const el of matches) {
          el.setAttribute('data-armed', 'true')
          marked.push(el)
        }
        const first = matches[0] as HTMLElement | undefined
        if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
    return () => {
      cancelAnimationFrame(frame)
      for (const el of marked) el.removeAttribute('data-armed')
    }
  }, [armed, view, selectedFactionId])

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

  // Ett köat verb av samma slag som det valda i menyn avväpnar det — uppgiften är gjord.
  function addActionDisarming(action: Parameters<typeof addAction>[0]) {
    addAction(action)
    if (armed && actionVerb(action) === armed.verb) setArmed(null)
  }

  function handleArmVerb(entry: ActionCatalogEntry) {
    armedNonce.current += 1
    setArmed({ verb: entry.verb, nonce: armedNonce.current })
    setSelectedFactionId(null)
    setFocusCard(null)
    setView(entry.target)
  }

  function handleEndTurn() {
    endTurn()
    setReplaying(true) // §5: End Quarter → Quarter Replay → Front Page (NEWS DESK)
    if (tutorial.active) setTutorial((t) => completeTutorialStep(t, 'end-quarter'))
  }

  return (
    <HandbookContext.Provider value={handleOpenHandbook}>
    <ArmedVerbContext.Provider value={armed}>
    <div className="ds-shell">
      <HudBar state={state} onOpenMenu={() => setPaused(true)} onOpenHandbook={handleOpenHandbook} />
      <QuarterBand
        state={state}
        memos={memosLoaded ? dueMemos(state, memosRead) : []}
        onOpenMemo={(id) => setMemoOpenId(id)}
        onNavigate={(target: ThisQuarterTarget) => {
          if (target.view === 'operations') setSelectedFactionId(target.factionId)
          setFocusCard(target.view === 'company' ? (target.focus ?? null) : null)
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

        {armed && <ArmedVerbStrip verb={armed.verb} onClear={() => setArmed(null)} />}

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
            onAddAction={addActionDisarming}
            onClose={() => setSelectedFactionId(null)}
            onOpenContacts={() => {
              setSelectedFactionId(null)
              setView('contacts')
            }}
          />
        )}
        {view === 'contracts' && <TheFloor state={state} draft={draft} onSubmitBid={setBid} onRemoveBid={removeBid} onAddAction={addActionDisarming} onSetStandingOrder={setStandingOrder} />}
        {view === 'company' && (
          <TheHouse
            state={state}
            draft={draft}
            onAddAction={addActionDisarming}
            onRemoveAction={removeAction}
            onSetStandingOrder={setStandingOrder}
            onRemoveStandingOrder={removeStandingOrder}
            focusCard={focusCard}
          />
        )}
        {view === 'contacts' && <ThePolitics state={state} onAddAction={addActionDisarming} />}
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
        onNavigate={handleArmVerb}
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
          memo={boardMemo(state, state.meta.turn - 1)}
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
        onOpenHandbook={() => {
          setSettingsOpen(false)
          setPaused(false)
          setHandbookFocusId(null)
          setHandbookOpen(true)
        }}
      />

      {/* P91b (§9/§13, P81-20): handboken, nådd från Settings (ovan) ELLER
          direkt från ett HUD-tals info-ikon (Shell.tsx:s onOpenHandbook). */}
      <MemoSheet
        memo={memoOpenId ? (findMemo(memoOpenId) ?? null) : null}
        onClose={() => setMemoOpenId(null)}
        onFile={() => fileMemo(memoOpenId)}
        onGo={() => {
          const memo = memoOpenId ? findMemo(memoOpenId) : undefined
          fileMemo(memoOpenId)
          if (memo) {
            setFocusCard(null)
            setView(memo.view)
          }
        }}
      />
      <Handbook open={handbookOpen} focusId={handbookFocusId} onClose={() => setHandbookOpen(false)} />
    </div>
    </ArmedVerbContext.Provider>
    </HandbookContext.Provider>
  )
}
