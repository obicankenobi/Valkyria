// persistence — hela GameState (och den ospardade draften) i IndexedDB under
// save:{slot}. meta.version styr migrering. Autospara efter varje resolveTurn.
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 8.
//
// "som JSON i IndexedDB" tolkas som "i JSON-kompatibel form", inte bokstavligen
// en JSON.stringify-sträng — GameState är redan ett rent, structured-clone-bart
// objekt (inga Date/Map/funktioner, se CLAUDE.md hård regel 1), så IndexedDB kan
// lagra det direkt. Att JSON.stringify:a och sedan structured-clone:a strängen
// hade bara varit ett extra, meningslöst serialiseringssteg.
//
// draften (TurnSubmission, ännu inte skickad) sparas TILLSAMMANS med state —
// P12:s klart när-villkor ("ett parti kan stängas och återupptas MITT I en tur
// utan förlust") kräver det uttryckligen; att bara spara efter resolveTurn hade
// tappat ett halvifyllt anbud vid en omladdning.
import type { Contract, GameState, Order, TurnSubmission } from '@seventh-front/core'
import type { TutorialState } from './tutorial.js'

const DB_NAME = 'seventh-front'
const DB_VERSION = 1
const STORE_NAME = 'saves'

// Den enda schemaversion createInitialState hittills någonsin producerat
// (GameState.meta.version, se state.ts). migrate() nedan har bara det här
// identitetsfallet att gå på — inget att migrera FRÅN finns än. Redo för
// framtiden: lägg till ett nytt case när meta.version faktiskt höjs.
const CURRENT_SCHEMA_VERSION = 1

export interface SavedGame {
  state: GameState
  draft: TurnSubmission
}

function saveKey(slot: string): string {
  return `save:${slot}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error as Error)
  })
}

export async function saveGame(slot: string, saved: SavedGame): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(saved, saveKey(slot))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

// Migrerar ett inläst sparat parti till CURRENT_SCHEMA_VERSION, eller ger
// null om det är en version det inte finns en migrering för än — säkrare att
// börja om än att köra vidare på ett state som kan ha fel form.
//
// P96: GameState.ledger (huvudboken) tillkom utan att schemaversionen höjdes — ett sparat
// parti från före P96 saknar fältet och skulle krascha vid nästa resolveTurn. Det får en
// tom huvudbok; historiken före inläsningen går inte att återskapa. (Exporterad för test.)
export function migrate(saved: SavedGame): SavedGame | null {
  switch (saved.state.meta.version) {
    case CURRENT_SCHEMA_VERSION: {
      let state = saved.state
      if (!Array.isArray((state as Partial<GameState>).ledger)) state = { ...state, ledger: [] }
      // P98: förskottsfälten tillkom på Order och Contract. Ett sparat parti från före P98 har
      // dem inte, och leveransbetalningen (price − advancePaid) hade blivit NaN. Gamla ordrar
      // och kontrakt är förskottslösa: 0.
      if (state.market.openOrders.some((o) => typeof (o as Partial<Order>).advancePct !== 'number') ||
          state.market.contracts.some((c) => typeof (c as Partial<Contract>).advancePaid !== 'number')) {
        state = {
          ...state,
          market: {
            ...state.market,
            openOrders: state.market.openOrders.map((o) => ({ ...o, advancePct: (o as Partial<Order>).advancePct ?? 0 })),
            contracts: state.market.contracts.map((c) => ({
              ...c,
              advancePct: (c as Partial<Contract>).advancePct ?? 0,
              advancePaid: (c as Partial<Contract>).advancePaid ?? 0,
            })),
          },
        }
      }
      // P99d/P100: favourMarginOwed och standingOrders tillkom på House. Core läser båda defensivt, men
      // gränssnittet (anslagstavlan) ska slippa det: ett gammalt sparat parti får skuldfri/tom standard.
      const house = state.house as Partial<GameState['house']>
      if (typeof house.favourMarginOwed !== 'number' || !house.standingOrders) {
        state = {
          ...state,
          house: {
            ...state.house,
            favourMarginOwed: house.favourMarginOwed ?? 0,
            standingOrders: house.standingOrders ?? { lines: {}, supply: [], stations: {} },
          },
        }
      }
      return state === saved.state ? saved : { ...saved, state }
    }
    default:
      return null
  }
}

export async function loadGame(slot: string): Promise<SavedGame | null> {
  const db = await openDb()
  try {
    const raw = await new Promise<SavedGame | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(saveKey(slot))
      request.onsuccess = () => resolve(request.result as SavedGame | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ? migrate(raw) : null
  } finally {
    db.close()
  }
}

// P65 (ETAPP6_TEKNISK_SPEC.md §3): huvudmenyn behöver veta OM ett parti finns
// utan att ladda det. loadGame returnerar `null` (inte `undefined` — specens
// eget utkast antog fel returtyp, rättat mot den faktiska signaturen ovan) när
// inget är sparat eller migreringen misslyckas — båda räknas som "inget att
// fortsätta". Anropsplatsen (App.tsx) ansvarar för att fånga ett förkastat
// löfte (IndexedDB otillgängligt, t.ex. privat läge) — samma gräns som
// useGame.ts:s egen loadGame-anrop redan drar.
export async function hasSavedGame(slot: string): Promise<boolean> {
  const saved = await loadGame(slot)
  return saved !== null
}

// P72 (ETAPP6_TEKNISK_SPEC.md §5): "en global mute-toggle sparad i
// persistence.ts". Delar samma objektlager (STORE_NAME) och databas som
// spardatan i stället för ett eget schema/en egen version — nyckeln
// 'settings:sound' krockar aldrig med `saveKey(slot)`s `save:${slot}`-form,
// så ingen DB_VERSION-höjning eller migrering behövs (samma "ingen ändring
// av befintliga funktioner"-princip som hasSavedGame ovan, P65). Anropsplatsen
// (App.tsx) drar samma gräns som hasSavedGame/loadGame: ett förkastat löfte
// (IndexedDB otillgängligt) tolkas som "omutad", inte som ett fel.
const SOUND_SETTINGS_KEY = 'settings:sound'

export async function loadMuted(): Promise<boolean> {
  const db = await openDb()
  try {
    const raw = await new Promise<boolean | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(SOUND_SETTINGS_KEY)
      request.onsuccess = () => resolve(request.result as boolean | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? false
  } finally {
    db.close()
  }
}

export async function saveMuted(muted: boolean): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(muted, SOUND_SETTINGS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

// P80 (ETAPP7_TEKNISK_SPEC.md §8): "Full uppspelning av alla händelser är
// ett val i inställningarna." Samma nyckel-i-samma-objektlager-mönster som
// SOUND_SETTINGS_KEY ovan (P72) — ingen egen inställningsskärm finns än
// (P90, "Paus, inställningar, sparplatser", obyggd), så togglen exponeras i
// stället i QuarterReplay.tsx självt, precis som mute-togglen fick bo i
// MainMenu.tsx innan en riktig inställningsskärm fanns. Samma
// förkastat-löfte-är-standardvärde-gräns som loadMuted ovan.
const REPLAY_SETTINGS_KEY = 'settings:fullReplay'

export async function loadFullReplay(): Promise<boolean> {
  const db = await openDb()
  try {
    const raw = await new Promise<boolean | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(REPLAY_SETTINGS_KEY)
      request.onsuccess = () => resolve(request.result as boolean | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? false
  } finally {
    db.close()
  }
}

export async function saveFullReplay(full: boolean): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(full, REPLAY_SETTINGS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

// P90 (ETAPP7_TEKNISK_SPEC.md §9/§13): "sparplatser." Genuint fynd: useGame.ts
// autosparar kontinuerligt till EN enda flik (SAVE_SLOT, game.ts) — att göra
// varje flik till ett eget, självständigt autosparande parti hade krävt att
// riva upp den arkitekturen (vilken flik är "aktiv", stäng av autospar mot
// den gamla, m.m.), utanför en enda prompts rimliga yta. Löst med NAMNGIVNA
// MANUELLA KONTROLLPUNKTER ovanpå den redan befintliga autosparningen —
// saveGame/loadGame tar redan en godtycklig `slot`-sträng (inget nytt schema
// behövs), bara en ny `deleteSave` saknades för att kunna tömma en flik.
export async function deleteSave(slot: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(saveKey(slot))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

// P90: volym (0–1, se sound.ts:s egen kommentar om varför "per kanal" blev
// en enda global volym), rörelseläge (reducerad rörelse + animationshastighet
// slås ihop till EN kontroll, se styles.css:s [data-motion]-regler) och
// textstorlek. Samma nyckel-i-samma-objektlager-mönster som SOUND_SETTINGS_KEY/
// REPLAY_SETTINGS_KEY ovan.
const VOLUME_SETTINGS_KEY = 'settings:volume'
const MOTION_SETTINGS_KEY = 'settings:motion'
const TEXT_SCALE_SETTINGS_KEY = 'settings:textScale'

export type MotionSetting = 'normal' | 'fast' | 'off'
export type TextScaleSetting = 'normal' | 'large'

export async function loadVolume(): Promise<number> {
  const db = await openDb()
  try {
    const raw = await new Promise<number | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(VOLUME_SETTINGS_KEY)
      request.onsuccess = () => resolve(request.result as number | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? 1
  } finally {
    db.close()
  }
}

export async function saveVolume(volume: number): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(volume, VOLUME_SETTINGS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

export async function loadMotion(): Promise<MotionSetting> {
  const db = await openDb()
  try {
    const raw = await new Promise<MotionSetting | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(MOTION_SETTINGS_KEY)
      request.onsuccess = () => resolve(request.result as MotionSetting | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? 'normal'
  } finally {
    db.close()
  }
}

export async function saveMotion(motion: MotionSetting): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(motion, MOTION_SETTINGS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

export async function loadTextScale(): Promise<TextScaleSetting> {
  const db = await openDb()
  try {
    const raw = await new Promise<TextScaleSetting | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(TEXT_SCALE_SETTINGS_KEY)
      request.onsuccess = () => resolve(request.result as TextScaleSetting | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? 'normal'
  } finally {
    db.close()
  }
}

export async function saveTextScale(scale: TextScaleSetting): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(scale, TEXT_SCALE_SETTINGS_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

// P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): två separata flaggor.
// `tutorialSeen` (settings:tutorialSeen) styr AUTOSTARTEN — en spelares
// FÖRSTA nya parti startar den automatiskt, ett senare nytt parti gör det
// inte (annars vore "avstängningsbar" meningslöst, den vore på igen nästa
// omstart). `tutorial` (settings:tutorial) är själva förloppet — sparas så
// ett halvfärdigt handledningssteg överlever en omladdning mitt i, samma
// princip som draften i `saveGame` ovan.
const TUTORIAL_SEEN_KEY = 'settings:tutorialSeen'
const TUTORIAL_STATE_KEY = 'settings:tutorial'

export async function loadTutorialSeen(): Promise<boolean> {
  const db = await openDb()
  try {
    const raw = await new Promise<boolean | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(TUTORIAL_SEEN_KEY)
      request.onsuccess = () => resolve(request.result as boolean | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? false
  } finally {
    db.close()
  }
}

export async function saveTutorialSeen(seen: boolean): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(seen, TUTORIAL_SEEN_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}

export async function loadTutorialState(): Promise<TutorialState | null> {
  const db = await openDb()
  try {
    const raw = await new Promise<TutorialState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(TUTORIAL_STATE_KEY)
      request.onsuccess = () => resolve(request.result as TutorialState | undefined)
      request.onerror = () => reject(request.error as Error)
    })
    return raw ?? null
  } finally {
    db.close()
  }
}

export async function saveTutorialState(tutorial: TutorialState): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(tutorial, TUTORIAL_STATE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error as Error)
    })
  } finally {
    db.close()
  }
}
