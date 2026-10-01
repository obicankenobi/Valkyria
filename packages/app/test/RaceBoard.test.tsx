// RaceBoard.test.tsx — P127 (ETAPP9_FORSLAG.md §7.1, §7.3, §9). Kapplöpningstavlan: två kolumner (väst/öst), en rad per kategori, ett
// fettkritsstreck för den BEDÖMDA generationen (aldrig sanningen), en säkerhetsstämpel per rad och kravkort under tavlan.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { BLOCS, TECH_CATEGORIES, createInitialState, raceAssessment } from '@seventh-front/core'
import { RaceBoard } from '../src/components/RaceBoard.js'

afterEach(cleanup)

describe('kapplöpningstavlan (P127, §9)', () => {
  it('två kolumner, väst och öst, med en rad per kategori', () => {
    const state = createInitialState('indochina-slice', 'race-seed')
    render(<RaceBoard state={state} />)
    for (const bloc of BLOCS) {
      expect(screen.getByTestId(`race-column-${bloc}`)).toBeTruthy()
      for (const category of TECH_CATEGORIES) expect(screen.getByTestId(`race-row-${bloc}-${category}`)).toBeTruthy()
    }
  })

  it('varje rad visar den bedömda generationen och stämpeln ur raceAssessment — aldrig något annat', () => {
    const state = createInitialState('indochina-slice', 'race-seed')
    state.race.generation.west.artillery = 3
    render(<RaceBoard state={state} />)
    const a = raceAssessment(state, 'west', 'artillery')
    const expected = a.low === a.high ? `GEN ${a.low}` : `GEN ${a.low}–${a.high}`
    expect(screen.getByTestId('race-gen-west-artillery').textContent).toBe(expected)
    expect(screen.getByTestId('race-stamp-west-artillery').textContent).toBe(a.stamp)
  })

  it('en bedömning är ett intervall som innehåller sanningen men tavlan skriver aldrig ut sanningen separat', () => {
    const state = createInitialState('indochina-slice', 'race-seed')
    state.house.stations = [] // ingen underrättelse → bredast intervall
    state.race.generation.east.armour = 4
    render(<RaceBoard state={state} />)
    const a = raceAssessment(state, 'east', 'armour')
    expect(a.low).toBeLessThanOrEqual(4)
    expect(a.high).toBeGreaterThanOrEqual(4)
    const text = within(screen.getByTestId('race-row-east-armour')).getByTestId('race-gen-east-armour').textContent!
    expect(text).toMatch(/^GEN \d+(–\d+)?$/)
  })

  it('kravkort: utan kort står en lugn text, med kort visas vilket block och vilken kategori — aldrig generationsnumret', () => {
    const calm = createInitialState('indochina-slice', 'race-seed')
    calm.meta.turn = 0
    const { unmount } = render(<RaceBoard state={calm} />)
    const none = screen.queryByTestId('race-cards')
    if (none === null) expect(screen.getByTestId('race-no-cards')).toBeTruthy()
    unmount()

    // Hitta en tur då ett kravkort finns (schemat ger ett steg inom horisonten).
    let found = false
    for (let turn = 0; turn < 25 && !found; turn++) {
      const state = createInitialState('indochina-slice', 'race-seed')
      state.meta.turn = turn
      cleanup()
      render(<RaceBoard state={state} />)
      const cards = screen.queryByTestId('race-cards')
      if (cards) {
        found = true
        expect(cards.textContent).toMatch(/(THIS|NEXT) QUARTER|IN \d+ QUARTERS/)
        expect(cards.textContent).toMatch(/(WEST|EAST) · (INFANTRY|ARTILLERY|ARMOUR|AVIATION|NAVAL|ELECTRONICS)/)
        expect(cards.textContent).not.toMatch(/generation \d/i)
      }
    }
    expect(found).toBe(true)
  })

  it('en gap-chock märker ledarblocket på raden', () => {
    const state = createInitialState('indochina-slice', 'race-seed')
    state.race.gap = { artillery: { leader: 'east', sinceTurn: 2 } }
    render(<RaceBoard state={state} />)
    expect(within(screen.getByTestId('race-row-east-artillery')).getByText('GAP LEADER')).toBeTruthy()
    expect(within(screen.getByTestId('race-row-west-artillery')).queryByText('GAP LEADER')).toBeNull()
  })

  it('husets egen bästa konstruktion i kategorin märks på skalan (legenden finns)', () => {
    const state = createInitialState('indochina-slice', 'race-seed')
    render(<RaceBoard state={state} />)
    expect(screen.getByText(/marks your best design/)).toBeTruthy()
  })
})
