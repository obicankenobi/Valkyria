// memos.ts — P127 (ETAPP9_FORSLAG.md §9, "Daterade PM"). Etappens system införs ETT I TAGET med ett daterat PM i stället för att slängas på
// spelaren på en gång:
//   1. Konstruktionen från start (ritbordet och typbladet).
//   2. Kravkorten 1965.
//   3. Kapplöpningstavlan första gången ett block går upp en generation.
//   4. Den första upphandlingen efter första gap-chocken.
// P146 (ETAPP10 §8 punkt 3) lägger de tre system som saknade ett: pappersspåret, rapporten från fältet och exportlistan.
// Ett PM är ett skrivmaskinsblad med ett FAST datum (det dateras som ett historiskt PM — det är ingen spelrelaterad tidsstämpel) och en avsändare.
// Ren, testbar, appens eget (rör aldrig packages/core): vilka PM som är aktuella härleds ur GameState; vilka som är lästa är en app-inställning
// (persistence.ts, settings:memosRead) — ett PM som en spelare läst en gång visas aldrig igen, i vilket parti som helst.
import { requirementCards } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'

export type MemoId = 'drawing-board' | 'requirement-cards' | 'arms-race' | 'procurement' | 'paper-trail' | 'field-report' | 'export-list'

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
  {
    id: 'paper-trail',
    date: '17 NOVEMBER 1966',
    from: 'THE HOUSE COUNSEL',
    subject: 'WHAT THE FILES REMEMBER',
    body: [
      'Every favour, bribe and trick leaves a paper trail against the house. Most stay buried. Some do not, and then a card arrives in Legal with a deadline.',
      'You may deny, give up a director, or settle. A denial is cheapest today and can be dearest tomorrow. Counsel on retainer makes a surfacing less likely, never impossible.',
    ],
    view: 'company',
    due: (state) => (state.traces ?? []).some((t) => t.houseId === 'player'),
  },
  {
    id: 'field-report',
    date: '3 APRIL 1967',
    from: 'THE FIELD LIAISON',
    subject: 'REPORTS FROM THE FIELD',
    body: [
      'A design with a hidden fault can fail where the conditions find it. When it does, a field report opens an inquiry card with a deadline.',
      'Fix it in the field at a price, deny it and hope, or redesign from the drawing board. A denial that comes out later is a quality scandal.',
    ],
    view: 'company',
    due: (state) => (state.house.investigations ?? []).length > 0,
  },
  {
    id: 'export-list',
    date: '9 SEPTEMBER 1967',
    from: 'THE EXPORT CONTROL OFFICE',
    subject: 'THE EXPORT LIST',
    body: [
      'A design of the second generation or higher is on the export list. A house tied to one bloc that sells it across the line breaches the list: doomsday rises, heat builds in the buyer\'s theatre and a trail is left.',
      'A design built with a state research grant is bound to the buyer\'s bloc from the start. Neutral houses are exempt.',
    ],
    view: 'contracts',
    due: (state) => Object.values(state.race.generation).some((byCategory) => Object.values(byCategory).some((g) => g >= 2)),
  },
]

// Aktuella och ännu olästa PM, i listans ordning.
export function dueMemos(state: GameState, read: readonly string[]): DatedMemo[] {
  return MEMOS.filter((m) => !read.includes(m.id) && m.due(state))
}

export function findMemo(id: string): DatedMemo | undefined {
  return MEMOS.find((m) => m.id === id)
}
