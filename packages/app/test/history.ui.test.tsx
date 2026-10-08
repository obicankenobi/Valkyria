// history.ui.test.tsx — P149 (ETAPP10_FORSLAG.md §9). Förstasidan i kvartalsuppspelningen och på NEWS DESK, telexraderna under World med sitt verkliga datum, prologen i
// genomgången, efterordet och tidslinjen i epilogen.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HISTORY_AFTERWORD, HISTORY_PROLOGUE, createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
import { BriefingScreen } from '../src/components/BriefingScreen.js'
import { EpilogueScreen, buildTimeline } from '../src/components/EpilogueScreen.js'
import { FrontPageCard } from '../src/components/FrontPageCard.js'
import { QuarterReplay } from '../src/components/QuarterReplay.js'
import { TheWire } from '../src/components/TheWire.js'
import { historyDateLabel, quarterLabelOfTurn } from '../src/historyText.js'
import { NEWS_DEPARTMENTS, historyFrontPage, isFlashEvent, newsDepartment } from '../src/newsClassification.js'

const ORIGINAL_MATCH_MEDIA = window.matchMedia
afterEach(() => {
  cleanup()
  window.matchMedia = ORIGINAL_MATCH_MEDIA
})

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// Kör till och med tur 3 (1964 Q4): Kinas första prov (förstasida) och tre telexrader löses.
function playTo1964Q4(): { state: GameState; wire: WireEvent[] } {
  let state = createInitialState('indochina-slice', 'history-ui-seed')
  let wire: WireEvent[] = []
  for (let i = 0; i < 4; i++) {
    const r = resolveTurn(state, EMPTY)
    state = r.state
    wire = r.wire
  }
  return { state, wire }
}

describe('historiens text (P149)', () => {
  it('ett datum skrivs som ett riktigt datum, eller som månad när dagen inte är belagd', () => {
    expect(historyDateLabel('1964-04-19')).toBe('19 APRIL 1964')
    expect(historyDateLabel('1965-02')).toBe('FEBRUARY 1965')
    expect(historyDateLabel('inte-ett-datum')).toBe('inte-ett-datum')
  })

  it('kvartalet en turn tillhör: tur 0 är 1964 Q1', () => {
    expect(quarterLabelOfTurn(0)).toBe('1964 Q1')
    expect(quarterLabelOfTurn(3)).toBe('1964 Q4')
    expect(quarterLabelOfTurn(4)).toBe('1965 Q1')
  })
})

describe('nyhetsavdelningen World (P149)', () => {
  it('en historisk händelse och dess effekter hör till World; en förstasida är en blixt', () => {
    const { state, wire } = playTo1964Q4()
    expect(NEWS_DEPARTMENTS.map((d) => d.id)).toContain('world')
    const china = wire.find((e) => e.headline.includes('CHINA EXPLODES'))!
    expect(newsDepartment(state, china)).toBe('world')
    expect(isFlashEvent(china)).toBe(true)
    expect(historyFrontPage(china)?.id).toBe('china-bomb')
    const effect = wire.find((e) => e.headline.startsWith('DOOMSDAY') && e.causeId === 'history:china-bomb')!
    expect(newsDepartment(state, effect)).toBe('world')
    expect(historyFrontPage(effect)).toBeNull() // effekten är ingen förstasida
  })

  it('NEWS DESK visar förstasidan som ett tidningskort och telexraderna under World med datum', () => {
    // Reducerad rörelse: hela listan renderas direkt (annars avslöjas raderna en i taget, se TheWire.reveal.test.tsx).
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    const { state, wire } = playTo1964Q4()
    render(<TheWire state={state} wire={wire} draft={EMPTY} onChooseCrisis={() => {}} />)
    expect(screen.getByTestId('news-history-front-page').textContent).toContain('CHINA EXPLODES')
    expect(screen.getByTestId('news-history-front-page').textContent).toContain('16 OCTOBER 1964')
    const world = screen.getByTestId('news-department-world')
    expect(world.textContent).toContain('KHRUSHCHEV REMOVED')
    expect(world.textContent).toContain('14 OCTOBER 1964')
  })
})

describe('kvartalsuppspelningen (P149)', () => {
  it('visar kvartalets förstasida överst', () => {
    const { state, wire } = playTo1964Q4()
    render(<QuarterReplay wire={wire} state={state} fullReplay={false} onToggleFullReplay={() => {}} onDone={() => {}} />)
    expect(screen.getByTestId('replay-front-page').textContent).toContain('CHINA EXPLODES ITS FIRST ATOMIC BOMB')
  })

  it('FrontPageCard: datum, rubrik, text och källa', () => {
    render(<FrontPageCard event={HISTORY_PROLOGUE[0]!} />)
    expect(screen.getByTestId('front-page-date').textContent).toBe('17 APRIL 1961')
    expect(screen.getByTestId('front-page-card').textContent).toContain('Source:')
  })
})

describe('genomgången och epilogen (P149)', () => {
  it('genomgången har prologen: fem förstasidor före partiet', () => {
    const state = createInitialState('indochina-slice', 'history-ui-seed')
    render(<BriefingScreen state={state} onBegin={() => {}} onBack={() => {}} />)
    expect(screen.getByTestId('briefing-prologue')).toBeTruthy()
    expect(screen.queryByTestId('prologue-bay-of-pigs')).toBeNull() // bakom en knapp tills spelaren öppnar den
    fireEvent.click(screen.getByTestId('briefing-prologue-toggle'))
    for (const page of HISTORY_PROLOGUE) expect(screen.getByTestId(`prologue-${page.id}`)).toBeTruthy()
    expect(HISTORY_PROLOGUE).toHaveLength(5)
  })

  it('epilogen har efterordet med My Lai sagt rakt ut', () => {
    const { state } = playTo1964Q4()
    render(<EpilogueScreen state={state} onTitleScreen={() => {}} />)
    for (const page of HISTORY_AFTERWORD) expect(screen.getByTestId(`afterword-${page.id}`)).toBeTruthy()
    expect(screen.getByTestId('afterword-my-lai').textContent).toContain('during the years you have just played')
  })

  it('tidslinjen: historiens förstasidor och husets egna krönikeposter, kvartal för kvartal i tidsordning', () => {
    const state = createInitialState('indochina-slice', 'history-ui-seed')
    state.history = { occurred: { 'laos-coup': { turn: 1 }, 'china-bomb': { turn: 3 } } }
    state.chronicle = [
      { turn: 3, kind: 'contract', headline: 'THE HOUSE WINS CONTRACT: X', actorIsPlayer: true, causeHeadlines: [], doomsdayDelta: 0 },
      { turn: 2, kind: 'crisis', headline: 'A RIVAL DOES SOMETHING', actorIsPlayer: false, causeHeadlines: [], doomsdayDelta: 0 },
    ]
    const rows = buildTimeline(state)
    expect(rows.map((r) => r.quarter)).toEqual(['1964 Q2', '1964 Q4'])
    expect(rows[0]!.history[0]!.headline).toContain('COUP IN LAOS')
    expect(rows[1]!.house).toEqual(['THE HOUSE WINS CONTRACT: X'])
  })
})
