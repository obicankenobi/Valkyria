// DrawingBoard.test.tsx — P126 (ETAPP9_FORSLAG.md §9). Ritbordet: en blåkopia per kategori, ritningen växer i blyerts med
// projektets framsteg, inriktning och ambition väljs med Segmented (regel 2), forskningsspåret likaså, och fångad materiel kan studeras.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TECH_CATEGORIES, createInitialState } from '@seventh-front/core'
import type { GameState, PlayerAction, StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { DrawingBoard } from '../src/components/DrawingBoard.js'

afterEach(cleanup)

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function setup(state: GameState = createInitialState('indochina-slice', 'drawing-seed'), draft: TurnSubmission = EMPTY) {
  state.house.treasury = 20_000_000
  const onSet = vi.fn<(change: StandingOrderChange) => void>()
  const onRemove = vi.fn<(key: string) => void>()
  const onAdd = vi.fn<(action: PlayerAction) => void>()
  render(<DrawingBoard state={state} draft={draft} onSet={onSet} onRemove={onRemove} onAddAction={onAdd} />)
  return { state, onSet, onRemove, onAdd }
}

const card = (category: string) => screen.getByTestId(`standing-card-drawing-${category}`)
const flip = (category: string) => fireEvent.click(within(card(category)).getByTestId(`standing-flip-drawing-${category}`))
const pick = (testId: string, label: string) => fireEvent.click(within(screen.getByTestId(testId)).getByText(label))

describe('ritbordet (P126, §9)', () => {
  it('har en blåkopia per kategori, var och en med en ritning', () => {
    setup()
    for (const category of TECH_CATEGORIES) {
      expect(card(category)).toBeTruthy()
      expect(within(card(category)).getByTestId(`drawing-${category}`)).toBeTruthy()
    }
  })

  it('ritningen växer med projektets framsteg: ingen = 0, hälften avverkat = 0,50', () => {
    const state = createInitialState('indochina-slice', 'drawing-progress')
    const category = state.house.specialisation
    setup(state)
    expect(within(card(category)).getByTestId(`drawing-${category}`).getAttribute('data-progress')).toBe('0.00')
    cleanup()

    const running = createInitialState('indochina-slice', 'drawing-progress')
    running.house.rnd.push({
      id: 'rnd-design-x',
      category,
      turnsRemaining: 2,
      turnsTotal: 4,
      costFactor: 1,
      design: { focus: 'robust', ambition: 'timely', targetGeneration: 2, upgradeOf: null },
    })
    setup(running)
    expect(within(card(category)).getByTestId(`drawing-${category}`).getAttribute('data-progress')).toBe('0.50')
    expect(card(category).textContent).toContain('ROBUST')
  })

  it('inriktning och ambition väljs med Segmented; START DRAWING köar en DESIGN START och förhandsvisningen följer valet', () => {
    const state = createInitialState('indochina-slice', 'drawing-start')
    const category = state.house.specialisation
    const { onSet } = setup(state)
    flip(category)
    const before = screen.getByTestId(`drawing-preview-${category}`).textContent
    pick(`drawing-focus-${category}`, 'ROBUST')
    pick(`drawing-ambition-${category}`, 'AHEAD')
    expect(screen.getByTestId(`drawing-preview-${category}`).textContent).not.toBe(before)
    fireEvent.click(screen.getByTestId(`drawing-start-${category}`))
    expect(onSet).toHaveBeenCalledWith({ kind: 'DESIGN', op: 'START', category, focus: 'robust', ambition: 'ahead' })
  })

  it('START är spärrad med orsaken i klartext när teknikläget är för lågt', () => {
    const state = createInitialState('indochina-slice', 'drawing-lowtech')
    const category = state.house.specialisation
    state.house.techLevel[category] = 0
    setup(state)
    flip(category)
    const button = screen.getByTestId(`drawing-start-${category}`) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(card(category).textContent).toContain('tech level too low')
  })

  it('ett pågående projekt kan skrotas (DESIGN CANCEL)', () => {
    const state = createInitialState('indochina-slice', 'drawing-cancel')
    const category = state.house.specialisation
    state.house.rnd.push({ id: 'rnd-design-x', category, turnsRemaining: 3, turnsTotal: 4, costFactor: 1, design: { focus: 'balanced', ambition: 'timely', targetGeneration: 2, upgradeOf: null } })
    const { onSet } = setup(state)
    flip(category)
    fireEvent.click(screen.getByTestId(`drawing-cancel-${category}`))
    expect(onSet).toHaveBeenCalledWith({ kind: 'DESIGN', op: 'CANCEL', category })
  })

  it('forskningsspåret: välj tempo → SET TRACK köar RESEARCH SET; ett befintligt spår stängs med OFF → CANCEL', () => {
    const state = createInitialState('indochina-slice', 'drawing-track')
    const category = state.house.specialisation
    const { onSet } = setup(state)
    flip(category)
    pick(`drawing-pace-${category}`, 'HIGH')
    fireEvent.click(screen.getByTestId(`drawing-track-set-${category}`))
    expect(onSet).toHaveBeenCalledWith({ kind: 'RESEARCH', op: 'SET', category, pace: 'high' })
    cleanup()

    const tracked = createInitialState('indochina-slice', 'drawing-track')
    tracked.house.standingOrders.research = { [category]: { pace: 'normal', sinceTurn: 1 } }
    const second = setup(tracked)
    flip(category)
    pick(`drawing-pace-${category}`, 'OFF')
    fireEvent.click(screen.getByTestId(`drawing-track-set-${category}`))
    expect(second.onSet).toHaveBeenCalledWith({ kind: 'RESEARCH', op: 'CANCEL', category })
  })

  it('en köad ändring visas som PENDING på kortet och kan ångras', () => {
    const state = createInitialState('indochina-slice', 'drawing-pending')
    const category = state.house.specialisation
    const draft: TurnSubmission = { ...EMPTY, standingOrders: [{ kind: 'RESEARCH', op: 'SET', category, pace: 'low' }] }
    const { onRemove } = setup(state, draft)
    expect(card(category).textContent).toContain('PENDING')
    fireEvent.click(within(card(category)).getByText('undo'))
    expect(onRemove).toHaveBeenCalledWith(`research:${category}`)
  })

  it('fångad materiel kan studeras: STUDY köar REVERSE_ENGINEER (en handling)', () => {
    const state = createInitialState('indochina-slice', 'drawing-captured')
    state.house.capturedMateriel = [{ systemId: 'nlf-artillery', name: 'Type 63 rocket launcher', category: 'artillery', fromFactionId: 'nlf', units: 3 }]
    const { onAdd } = setup(state)
    fireEvent.click(screen.getByTestId('drawing-study-nlf-artillery'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'INTERNAL', op: 'REVERSE_ENGINEER', payload: { systemId: 'nlf-artillery' } })
  })

  it('utan fångad materiel visas ingen sådan sektion', () => {
    setup()
    expect(screen.queryByTestId('drawing-captured')).toBeNull()
  })
})

describe('del F på ritbordet (P136)', () => {
  it('specialprojektet slås på med en omkopplare och köar DESIGN START med skunk; förhandsvisningen blir kortare och dyrare', () => {
    const state = createInitialState('indochina-slice', 'drawing-skunk')
    const category = state.house.specialisation
    const { onSet } = setup(state)
    flip(category)
    const before = screen.getByTestId(`drawing-preview-${category}`).textContent
    fireEvent.click(screen.getByTestId(`drawing-skunk-${category}`))
    expect(screen.getByTestId(`drawing-preview-${category}`).textContent).not.toBe(before)
    fireEvent.click(screen.getByTestId(`drawing-start-${category}`))
    expect(onSet).toHaveBeenCalledWith({ kind: 'DESIGN', op: 'START', category, focus: 'balanced', ambition: 'timely', skunk: true })
  })

  it('en civil linje visas bara i kategorier med en civil produkt, är spärrad under tekniknivån och köar CIVIL SET när nivån räcker', () => {
    const state = createInitialState('indochina-slice', 'drawing-civil')
    state.house.techLevel.armour = 5
    const { onSet } = setup(state)
    flip('armour')
    expect(screen.getByTestId('drawing-civil-hint-armour').textContent).toContain('FARM TRACTORS')
    fireEvent.click(screen.getByTestId('drawing-civil-armour'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'CIVIL', op: 'SET', category: 'armour' })
    flip('infantry')
    expect(screen.queryByTestId('drawing-civil-infantry')).toBeNull()
  })

  it('spärrad civil linje visar orsaken', () => {
    const state = createInitialState('indochina-slice', 'drawing-civil-low')
    state.house.techLevel.electronics = 4
    setup(state)
    flip('electronics')
    expect((screen.getByTestId('drawing-civil-electronics') as HTMLButtonElement).disabled).toBe(true)
    expect(card('electronics').textContent).toContain('needs tech level')
  })
})
