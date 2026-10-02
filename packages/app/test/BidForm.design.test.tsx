// BidForm.design.test.tsx — P127 (ETAPP9 §9, budmappen). Ett Segmented-val bland husets konstruktioner, stämplarna BATTLE-PROVEN och REQUIRED
// LEVEL, och vinstchansen räknas om direkt (bidEstimate/playerWinCurve tar designId — en formel, en källa).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, playerWinCurve } from '@seventh-front/core'
import type { Bid, Design, GameState, Order } from '@seventh-front/core'
import { BidForm } from '../src/components/BidForm.js'

afterEach(cleanup)

const design = (over: Partial<Design> = {}): Design =>
  ({
    id: 'design-1', name: 'H&V M64 Field Gun', category: 'artillery', baseProductId: '105mm_field_gun', generation: 1, focus: 'balanced', ambition: 'timely',
    performance: 70, reliability: 70, unitCostFactor: 1, trueQuality: 66, uncertainty: 1, latentFlaw: null, flawRevealed: false, testedIn: [],
    fieldRecord: { occasions: 0, proven: false }, lineage: null, introducedTurn: 1, status: 'active', ...over,
  }) as Design

function setup(designs: Design[], tweak: (s: GameState) => void = () => {}) {
  const state = createInitialState('indochina-slice', 'bid-design-seed')
  state.meta.turn = 3
  state.house.designs = designs
  tweak(state)
  const order: Order = {
    id: 'order-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 10, statedBudget: 6_000_000, trueBudget: 7_000_000, referencePrice: 5_000_000,
    requiredDeliveryTurns: 3, expiresTurn: 6, competingRivals: ['brandt', 'costigan'], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 },
    officialId: 'official-rvn-procurement', reason: { kind: 'PEACETIME_REPLACEMENT' }, frontId: 'front-1', advancePct: 10,
  }
  state.market.openOrders = [order]
  const onSubmit = vi.fn<(bid: Bid) => void>()
  render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={onSubmit} onRemove={() => {}} />)
  return { state, order, onSubmit }
}

describe('budmappen: konstruktionsval (P127)', () => {
  it('utan egna konstruktioner finns inget val (ett vanligt bud som förut)', () => {
    setup([])
    expect(screen.queryByTestId('bid-design-field')).toBeNull()
  })

  it('ett Segmented bland STANDARD och husets konstruktioner; ett val skickas med som designId', () => {
    const { onSubmit } = setup([design()])
    expect(screen.getByTestId('bid-design-field')).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.getByTestId('bid-design-name').textContent).toContain('H&V M64 Field Gun')
    fireEvent.click(screen.getByTestId('bid-submit'))
    expect(onSubmit.mock.calls[0]![0].designId).toBe('design-1')

    cleanup()
    const std = setup([design()])
    fireEvent.click(screen.getByTestId('bid-submit'))
    expect(std.onSubmit.mock.calls[0]![0].designId).toBeUndefined()
  })

  it('en tillbakadragen eller utfasad konstruktion erbjuds inte', () => {
    setup([design({ status: 'withdrawn' })])
    expect(screen.queryByTestId('bid-design-field')).toBeNull()
  })

  it('stämplarna: BATTLE-PROVEN bara för en beprövad konstruktion, REQUIRED LEVEL ? utan underrättelse', () => {
    setup([design({ fieldRecord: { occasions: 3, proven: true } })], (s) => (s.house.stations = []))
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.getByTestId('stamp-battle-proven')).toBeTruthy()
    expect(screen.getByTestId('stamp-required-level').textContent).toBe('REQUIRED LEVEL ?')
    cleanup()

    setup([design()], (s) => (s.house.stations = []))
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.queryByTestId('stamp-battle-proven')).toBeNull()
  })

  it('REQUIRED LEVEL MET / BELOW REQUIRED LEVEL med underrättelse i köparens land', () => {
    const watch = (s: GameState) => {
      s.house.stations = [{ id: 's', city: 'Saigon', nation: 'rvn', depth: 2, exposure: 0, coverage: ['procurement'], status: 'active' }]
      const bloc = s.factions['rvn']!.alignment > 0 ? 'west' : 'east'
      s.race.generation[bloc].artillery = 2
    }
    setup([design({ generation: 1 })], watch)
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.getByTestId('stamp-required-level').textContent).toBe('BELOW REQUIRED LEVEL')
    cleanup()
    setup([design({ generation: 2 })], watch)
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.getByTestId('stamp-required-level').textContent).toBe('REQUIRED LEVEL MET')
  })

  it('formuläret räknar om med konstruktionen: styckkostnaden följer dess faktor, och kurvan är playerWinCurve med designId (en formel, en källa)', () => {
    const d = design({ performance: 95, reliability: 95, trueQuality: 95, unitCostFactor: 0.8, fieldRecord: { occasions: 3, proven: true } })
    const { state, order } = setup([d])
    const before = screen.getByTestId('your-unit-cost').textContent
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.getByTestId('your-unit-cost').textContent).not.toBe(before)
    const std = playerWinCurve(state, order, 'A')
    const withDesign = playerWinCurve(state, order, 'A', 'design-1')
    expect(JSON.stringify(withDesign)).not.toBe(JSON.stringify(std))
  })
})

describe('budmappen: kundanpassning och exportstämplar (P135/P136)', () => {
  it('kundanpassningen är en omkopplare: den höjer prisgolvet (dyrare att bygga), visar risken och skickas med som customise', () => {
    const { onSubmit } = setup([])
    const slider = () => screen.getByTestId('bid-price').getAttribute('data-min') ?? screen.getByTestId('bid-price').textContent
    const before = slider()
    fireEvent.click(screen.getByTestId('bid-customise'))
    expect(screen.getByTestId('bid-customise-hint').textContent).toContain('scandal')
    expect(slider()).not.toBe(before)
    fireEvent.click(screen.getByTestId('bid-submit'))
    expect(onSubmit.mock.calls[0]![0].customise).toBe(true)
    cleanup()
    const plain = setup([])
    fireEvent.click(screen.getByTestId('bid-submit'))
    expect(plain.onSubmit.mock.calls[0]![0].customise).toBeUndefined()
  })

  it('en bunden eller exportreglerad konstruktion får stämplar; en exportreglerad över blockgränsen visar EXPORT BREACH', () => {
    setup([design({ generation: 2, exclusiveTo: 'west' })], (s) => {
      s.house.homeState = 'west'
    })
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.queryByTestId('stamp-bound')).toBeTruthy()
    cleanup()
    setup([design({ generation: 2 })], (s) => {
      s.house.homeState = 'east' // köparen rvn är i väst i scenariot
    })
    fireEvent.click(within(screen.getByTestId('bid-design')).getByText('#1'))
    expect(screen.queryByTestId('stamp-export-breach')).toBeTruthy()
  })
})
