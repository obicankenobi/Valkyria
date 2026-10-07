// p146.screens.test.tsx — P146 (ETAPP10_FORSLAG.md §8 punkt 2). Skärmarna för det som saknade en: motmedelskedjan och först på plats på kapplöpningstavlan, köparens preferensmix i
// ordermappen (bara med station), först på plats och måttstocken på typbladet, och ryktet (LEAK mot en bedömning) i landmappen.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { CountryFile } from '../src/components/CountryFile.js'
import { RaceBoard } from '../src/components/RaceBoard.js'
import { TheFloor } from '../src/components/TheFloor.js'
import { designStandings } from '../src/designSheet.js'

afterEach(cleanup)

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function order(state: GameState, buyerId: string): Order {
  return {
    id: 'order-p146-0',
    buyerId,
    productId: 'm1_rifle',
    quantity: 250,
    statedBudget: 5_000_000,
    trueBudget: 8_000_000,
    referencePrice: 4_000_000,
    requiredDeliveryTurns: 5,
    expiresTurn: state.meta.turn + 3,
    competingRivals: [],
    weights: { price: 0.55, delivery: 0.3, relationship: 0.15 },
    officialId: officialId(buyerId, 'procurement'),
    reason: { kind: 'PEACETIME_REPLACEMENT' },
    frontId: null,
    advancePct: 0,
  }
}

describe('kapplöpningstavlan: motmedelskedjan och först på plats (P146)', () => {
  it('kedjan skrivs ut ur balansdatan: pansar drar infanteri, flyg drar artilleri, artilleri drar elektronik', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    render(<RaceBoard state={state} />)
    const text = screen.getByTestId('race-chain').textContent!.toLowerCase()
    expect(text).toContain('armour pulls infantry')
    expect(text).toContain('aviation pulls artillery')
    expect(text).toContain('artillery pulls electronics')
  })

  it('ett gällande anspråk visas med vem som är först hos vilket block; ett förbrukat (blocket har kliver vidare) visas inte', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    state.race.generation.west.armour = 2
    state.race.firstInPlace = { west: { armour: { generation: 2, holder: 'player', turn: 5, spec: 60 } }, east: {} }
    const { rerender } = render(<RaceBoard state={state} />)
    expect(screen.getByTestId('race-claim-west-armour').textContent).toContain('FIRST IN PLACE')
    expect(screen.getByTestId('race-claim-west-armour').textContent).toContain(state.house.name.toUpperCase())
    state.race.generation.west.armour = 3 // blocket klev vidare: anspråket gäller inte längre
    rerender(<RaceBoard state={{ ...state }} />)
    expect(screen.queryByTestId('race-claim-west-armour')).toBeNull()
  })
})

describe('typbladet: först på plats och måttstocken (P146)', () => {
  it('designStandings: huset som först på plats, en rival som måttstock, inget om anspråket är förbrukat', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    const rivalId = Object.keys(state.rivals)[0]!
    state.race.generation.west.armour = 2
    state.race.generation.east.armour = 2
    state.race.firstInPlace = {
      west: { armour: { generation: 2, holder: 'player', turn: 4, spec: 60 } },
      east: { armour: { generation: 2, holder: rivalId, turn: 4, spec: 62 } },
    }
    const standings = designStandings(state, { category: 'armour', status: 'active' })
    expect(standings).toEqual([
      { bloc: 'west', kind: 'first', holder: state.house.name },
      { bloc: 'east', kind: 'yardstick', holder: state.rivals[rivalId]!.name },
    ])
    state.race.generation.west.armour = 3
    expect(designStandings(state, { category: 'armour', status: 'active' }).map((s) => s.bloc)).toEqual(['east'])
    expect(designStandings(state, { category: 'aviation', status: 'active' })).toEqual([])
  })
})

describe('ordermappen: köparens preferensmix, bara med station (P146)', () => {
  it('med en station i köparens land står vikterna i mappen', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    const buyerId = 'rvn'
    expect(state.house.stations.some((s) => s.nation === buyerId && s.status === 'active')).toBe(true)
    state.market.openOrders = [order(state, buyerId)]
    render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    const text = screen.getByTestId('order-preference-mix').textContent!
    expect(text).toMatch(/Performance \d+ % · Reliability \d+ % · Cost \d+ %/)
  })

  it('utan station står det "?" och inga tal', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    state.house.stations = []
    state.market.openOrders = [order(state, 'rvn')]
    render(<TheFloor state={state} draft={EMPTY_DRAFT} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    const text = screen.getByTestId('order-preference-mix').textContent!
    expect(text).toContain('?')
    expect(text).not.toMatch(/\d+ %/)
  })
})

describe('landmappen: LEAK mot en bedömning (P146)', () => {
  it('LEAK-väljaren erbjuder att plantera ett rykte i varje kategori och köar rätt targetId', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    const onAddAction = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={() => {}} onOpenContacts={() => {}} />)
    fireEvent.click(screen.getByTestId('cf-verb-LEAK'))
    expect(screen.getByTestId('cf-rumour-targets')).toBeTruthy()
    // RVN är västblock: ryktet säger att östblocket gått före.
    fireEvent.click(screen.getByTestId('cf-rumour-armour'))
    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: 'assessment:east:armour' })
  })

  it('ett rykte som redan sprids kan inte plantas igen — kategorin saknas i listan', () => {
    const state = createInitialState('indochina-slice', 'p146-seed')
    state.race.perception = { west: { armour: { bias: 1, sinceTurn: 1, source: 'leak', causeId: null } } } as never
    render(<CountryFile state={state} factionId="rvn" onAddAction={() => {}} onClose={() => {}} onOpenContacts={() => {}} />)
    fireEvent.click(screen.getByTestId('cf-verb-LEAK'))
    expect(screen.queryByTestId('cf-rumour-armour')).toBeNull()
    expect(screen.getByTestId('cf-rumour-aviation')).toBeTruthy()
  })
})
