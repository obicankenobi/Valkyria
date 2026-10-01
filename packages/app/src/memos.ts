// memos.ts — P127 (ETAPP9_FORSLAG.md §9, "Daterade PM"). Etappens system införs ETT I TAGET med ett daterat PM i stället för att slängas på
// spelaren på en gång:
//   1. Konstruktionen från start (ritbordet och typbladet).
//   2. Kravkorten 1965.
//   3. Kapplöpningstavlan första gången ett block går upp en generation.
//   4. Den första upphandlingen efter första gap-chocken.
// Ett PM är ett skrivmaskinsblad med ett FAST datum (det dateras som ett historiskt PM — det är ingen spelrelaterad tidsstämpel) och en avsändare.
// Ren, testbar, appens eget (rör aldrig packages/core): vilka PM som är aktuella härleds ur GameState; vilka som är lästa är en app-inställning
// (persistence.ts, settings:memosRead) — ett PM som en spelare läst en gång visas aldrig igen, i vilket parti som helst.
import { requirementCards } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'

export type MemoId = 'drawing-board' | 'requirement-cards' | 'arms-race' | 'procurement'

export interface DatedMemo {
  id: MemoId
  date: string
  from: string
  subject: string
  body: readonly string[]
  // Vyn "gå dit"-knappen öppnar.
  view: 'company' | 'contracts'
  due: (state: GameState) => boolean
}

export const MEMOS: readonly DatedMemo[] = [
  {
    id: 'drawing-board',
    date: '12 FEBRUARY 1964',
    from: 'THE DESIGN OFFICE',
    subject: 'YOUR OWN DESIGNS',
    body: [
      'From this quarter the house may draw its own designs instead of selling only what the catalogue lists. Open THE COMPANY: the drawing board has a blueprint for every category.',
      'Choose a focus (robust, balanced or advanced) and an ambition (timely, forward or ahead). A step past the times costs more, takes longer and carries a bigger risk of a hidden fault.',
      'A finished design gets a type sheet. Its true quality stays hidden behind a class with a margin — test it in your own shop, or let a buyer try it in the field, to narrow the margin.',
    ],
    view: 'company',
    due: () => true,
  },
  {
    id: 'requirement-cards',
    date: '20 JANUARY 1965',
    from: 'THE MINISTRIES OF DEFENCE',
    subject: 'REQUIREMENT LEVELS',
    body: [
      'The ministries raise their requirements in steps, one category at a time. A requirement card tells you which bloc steps up in which category next quarter — never how far.',
      'A design one generation behind may be phased out and can no longer be offered to that bloc\'s buyers. Plan your drawings against the cards, not against last quarter\'s orders.',
    ],
    view: 'contracts',
    due: (state) => requirementCards(state).length > 0,
  },
  {
    id: 'arms-race',
    date: '8 JUNE 1965',
    from: 'THE ATTACHÉS',
    subject: 'THE ARMS RACE BOARD',
    body: [
      'A bloc has taken a step forward. The arms race board on CONTRACTS shows how far each bloc has come in every category, as your intelligence judges it.',
      'The crayon line is an estimate, never the truth: the better your stations cover a bloc, the narrower the line and the firmer the stamp. A rumour can mislead a buyer as easily as it misleads you.',
    ],
    view: 'contracts',
    due: (state) => Object.values(state.race.generation).some((byCategory) => Object.values(byCategory).some((g) => g > 1)),
  },
  {
    id: 'procurement',
    date: '2 MARCH 1966',
    from: 'THE MINISTRY OF PROCUREMENT',
    subject: 'DEVELOPMENT PROCUREMENTS',
    body: [
      'When a bloc pulls ahead, a ministry may put out a development procurement: several houses draw to the same requirement sheet, prototypes are tested side by side in the buyer\'s own conditions, and the winner is awarded the series.',
      'Everything in a procurement leaves a paper trail. Read the rules before you bend them.',
    ],
    view: 'contracts',
    due: (state) => (state.programmes?.length ?? 0) > 0 || Object.keys(state.race.gap ?? {}).length > 0,
  },
]

// Aktuella och ännu olästa PM, i listans ordning.
export function dueMemos(state: GameState, read: readonly string[]): DatedMemo[] {
  return MEMOS.filter((m) => !read.includes(m.id) && m.due(state))
}

export function findMemo(id: string): DatedMemo | undefined {
  return MEMOS.find((m) => m.id === id)
}
