// tutorial — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): "de tre första
// kvartalen i ett nytt parti leds steg för steg (välj land, lägg ett bud,
// fyll en handlingsplats, avsluta kvartalet, läs förstasidan)." Ren,
// testbar logik — bara App.tsx känner till DOM/state och anropar in hit.
//
// SCOPE-BESLUT: byggd som kontextuella textbanderoller (samma register som
// Shell.tsx:s RejectedBanner), inte DOM-ankrade "coachmarks" pekande på ett
// exakt element — de fem stegen spänner över fyra olika skärmar
// (OPERATIONS/kartan, CONTRACTS, handlingsdockan, NEWS DESK), och riktiga
// ankrade pilar hade krävt en egen positioneringsmekanism för var och en.
// En textrad som talar om VAD som ska göras, synlig oavsett vilken flik
// spelaren råkar stå på, täcker "kontextuella tips" ärligt utan att
// uppfinna en pekare-mot-koordinat-motor för en enda prompt.
//
// Ordningen är inte ett HÅRT grindat flöde (spelaren blockeras aldrig från
// att t.ex. avsluta kvartalet innan ett bud lagts) — varje steg markeras
// klart så fort dess egen händelse inträffar, oavsett i vilken ordning
// spelaren faktiskt gör dem. Panelen visar alltid det tidigaste steget som
// ÄNNU inte är klart, vilket i praktiken leder en spelare som följer tipsen
// rakt igenom i ordning, utan att straffa en som hoppar runt.
export type TutorialStepId = 'select-country' | 'place-bid' | 'fill-action-slot' | 'end-quarter' | 'read-news' | 'build-works' | 'plan-line' | 'read-alarm'

export interface TutorialStep {
  id: TutorialStepId
  prompt: string
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'select-country', prompt: 'Tap a capital on the map, then open its country file.' },
  { id: 'place-bid', prompt: 'Open CONTRACTS and place a bid on an open order.' },
  { id: 'fill-action-slot', prompt: 'Tap an empty action slot and queue a card.' },
  { id: 'end-quarter', prompt: 'Press End Quarter to resolve the turn.' },
  { id: 'read-news', prompt: "Read NEWS DESK to see what happened." },
  // P181 (ETAPP11 §8 punkt 8): de tre nya stegen för verken. Samma princip som de fem första — aldrig hårt grindade i ordning.
  { id: 'build-works', prompt: 'Open THE COMPANY and queue a building on a free plot.' },
  { id: 'plan-line', prompt: 'On the production board, put a contract on a line.' },
  { id: 'read-alarm', prompt: 'Open This Quarter and tap an alarm to see what needs you.' },
]

export interface TutorialState {
  active: boolean
  completed: readonly TutorialStepId[]
}

export const INITIAL_TUTORIAL_STATE: TutorialState = { active: false, completed: [] }

// "de tre första kvartalen" — en säkerhetsspärr utöver de fem stegens egen
// completion: även en spelare som aldrig råkar göra alla fem (t.ex. hoppar
// över att bjuda) får inte se banderollen resten av partiet.
export const TUTORIAL_TURN_LIMIT = 3

export function currentTutorialStep(tutorial: TutorialState): TutorialStep | null {
  if (!tutorial.active) return null
  return TUTORIAL_STEPS.find((step) => !tutorial.completed.includes(step.id)) ?? null
}

export function tutorialIsDone(tutorial: TutorialState, turn: number): boolean {
  if (!tutorial.active) return true
  if (turn >= TUTORIAL_TURN_LIMIT) return true
  return TUTORIAL_STEPS.every((step) => tutorial.completed.includes(step.id))
}

// Idempotent — markera ett steg klart flera gånger (t.ex. varje ny
// draft.bids-ändring) ger samma resultat, ingen dubblettkontroll behövs vid
// anropsstället.
export function completeTutorialStep(tutorial: TutorialState, id: TutorialStepId): TutorialState {
  if (tutorial.completed.includes(id)) return tutorial
  return { ...tutorial, completed: [...tutorial.completed, id] }
}

export function startTutorial(): TutorialState {
  return { active: true, completed: [] }
}

export function stopTutorial(): TutorialState {
  return { active: false, completed: [] }
}
