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
import type { GameState } from '@seventh-front/core'

export type TutorialStepId =
  | 'select-country'
  | 'place-bid'
  | 'fill-action-slot'
  | 'end-quarter'
  | 'read-news'
  | 'build-works'
  | 'plan-line'
  | 'read-alarm'
  | 'draw-design'
  | 'enter-programme'
  | 'answer-card'

// P146 (ETAPP10 §8 punkt 3): de tre sista stegen hör till etapp 9:s system, som inte finns att göra förrän runt tur 3 (första upphandlingen utlyses tidigast tur 3 och ett utredningskort
// kommer först när något hänt). Därför delas stegen i två faser: 'early' visas före tur TUTORIAL_TURN_LIMIT, 'late' därefter till TUTORIAL_LATE_LIMIT. Samma icke-grindade form som förut.
export interface TutorialStep {
  id: TutorialStepId
  prompt: string
  phase: 'early' | 'late'
  // late-stegen som bara går att göra när något finns: en öppen anbudsinfordran respektive ett öppet kort.
  needs?: 'programme' | 'card'
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'select-country', prompt: 'Tap a capital on the map, then open its country file.', phase: 'early' },
  { id: 'place-bid', prompt: 'Open CONTRACTS and place a bid on an open order.', phase: 'early' },
  { id: 'fill-action-slot', prompt: 'Tap an empty action slot and queue a card.', phase: 'early' },
  { id: 'end-quarter', prompt: 'Press End Quarter to resolve the turn.', phase: 'early' },
  { id: 'read-news', prompt: "Read NEWS DESK to see what happened.", phase: 'early' },
  // P181 (ETAPP11 §8 punkt 8): de tre nya stegen för verken. Samma princip som de fem första — aldrig hårt grindade i ordning.
  { id: 'build-works', prompt: 'Open THE COMPANY and queue a building on a free plot.', phase: 'early' },
  { id: 'plan-line', prompt: 'On the production board, put a contract on a line.', phase: 'early' },
  { id: 'read-alarm', prompt: 'Open This Quarter and tap an alarm to see what needs you.', phase: 'early' },
  // P146: etapp 9:s system.
  { id: 'draw-design', prompt: 'Open the Drawing office and start a design — it gives you a type of your own to bid with.', phase: 'late' },
  { id: 'enter-programme', prompt: 'A tender is open on CONTRACTS. Enter it and submit a design.', phase: 'late', needs: 'programme' },
  { id: 'answer-card', prompt: 'A card is waiting in Legal or the Drawing office. Answer it before the deadline, or it counts as a denial.', phase: 'late', needs: 'card' },
]

// Vad som finns att göra just nu; styr vilka late-steg som visas.
export interface TutorialContext {
  programmeOpen?: boolean
  cardOpen?: boolean
}

// En öppen anbudsinfordran huset inte anmält sig till, respektive ett kort (pappersspår eller utredning) som väntar på svar.
export function tutorialContext(state: Pick<GameState, 'programmes' | 'traces' | 'house'>): TutorialContext {
  return {
    programmeOpen: (state.programmes ?? []).some((p) => p.phase === 'announced' && !p.entrants.some((e) => e.houseId === 'player')),
    cardOpen:
      (state.traces ?? []).some((t) => t.houseId === 'player' && t.status === 'surfaced' && t.choice === undefined) ||
      (state.house.investigations ?? []).some((i) => i.status === 'open'),
  }
}

export interface TutorialState {
  active: boolean
  completed: readonly TutorialStepId[]
}

export const INITIAL_TUTORIAL_STATE: TutorialState = { active: false, completed: [] }

// "de tre första kvartalen" — en säkerhetsspärr utöver de fem stegens egen
// completion: även en spelare som aldrig råkar göra alla fem (t.ex. hoppar
// över att bjuda) får inte se banderollen resten av partiet.
export const TUTORIAL_TURN_LIMIT = 3
// ...och de sena stegen (etapp 9:s system) får finnas kvar till här.
export const TUTORIAL_LATE_LIMIT = 12

export function currentTutorialStep(tutorial: TutorialState, turn = 0, context: TutorialContext = {}): TutorialStep | null {
  if (!tutorial.active) return null
  const phase = turn >= TUTORIAL_TURN_LIMIT ? 'late' : 'early'
  return (
    TUTORIAL_STEPS.find((step) => {
      if (step.phase !== phase || tutorial.completed.includes(step.id)) return false
      if (step.needs === 'programme') return context.programmeOpen === true
      if (step.needs === 'card') return context.cardOpen === true
      return true
    }) ?? null
  )
}

export function tutorialIsDone(tutorial: TutorialState, turn: number): boolean {
  if (!tutorial.active) return true
  if (turn >= TUTORIAL_LATE_LIMIT) return true
  const phase = turn >= TUTORIAL_TURN_LIMIT ? 'late' : 'early'
  return TUTORIAL_STEPS.filter((step) => step.phase === phase).every((step) => tutorial.completed.includes(step.id))
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
