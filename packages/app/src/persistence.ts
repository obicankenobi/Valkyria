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
import type { GameState, TurnSubmission } from '@seventh-front/core'

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
function migrate(saved: SavedGame): SavedGame | null {
  switch (saved.state.meta.version) {
    case CURRENT_SCHEMA_VERSION:
      return saved
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
