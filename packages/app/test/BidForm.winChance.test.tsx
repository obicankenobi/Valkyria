// BidForm.winChance.test.tsx — P81c (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten, P81-7). Speltestets fynd: budformuläret visade 0 %
// vinstchans i alla fem bandpunkter, oavsett bud — winBand samplar bara
// rivalPriceLow..rivalPriceHigh och missar helt de lägre priser spelaren
// faktiskt kan vinna med. "Win chance at this price" läser playerWinCurve
// för det pris spelaren skrivit in, inte bara den närmaste bandpunkten.
//
// P84 (ETAPP7_TEKNISK_SPEC.md §7.5, regel 2): priset styrs nu av DsSlider,
// bundet till playerWinCurve:s eget [min, max] — spelaren kan alltså inte
// längre lämna fältet tomt (price === 0 finns inte som tillstånd, reglaget
// startar alltid på golvet). Den gamla "ingen avläsning innan ett pris
// skrivits in"-branchen är därför obsolet: readouten visas nu alltid, live,
// från första render. interpolateConfidence exporteras separat från
// BidForm.tsx och testas här också som en ren funktion, för att täcka
// interpolationsloopens inre punkter utan att behöva landa reglaget exakt på
// en godtycklig kurvpunkt via tangentbordet (vilket bara Home/End gör
// pålitligt, se de två integrationstesten nedan).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bidEstimate, createInitialState, officialId, playerWinCurve } from '@seventh-front/core'
import type { GameState, Order, PlayerWinCurvePoint } from '@seventh-front/core'
import { BidForm, interpolateConfidence } from '../src/components/BidForm.js'

afterEach(cleanup)

function makeOrder(state: GameState): Order {
  const buyerId = Object.keys(state.factions)[0]!
  return {
    id: 'order-test-0',
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
    frontId: 'front-1',
  }
}

describe('interpolateConfidence (ren funktion) — interpolerar mellan playerWinCurve:s punkter', () => {
  const curve: PlayerWinCurvePoint[] = [
    { price: 100, confidence: 0 },
    { price: 200, confidence: 40 },
    { price: 300, confidence: 90 },
  ]

  it('returnerar exakt kurvans värde vid en känd punkt', () => {
    expect(interpolateConfidence(curve, 200)).toBe(40)
  })

  it('interpolerar linjärt mellan två punkter', () => {
    expect(interpolateConfidence(curve, 150)).toBe(20) // mitt emellan 0 och 40
    expect(interpolateConfidence(curve, 250)).toBe(65) // mitt emellan 40 och 90
  })

  it('klampar utanför kurvans intervall i stället för att extrapolera', () => {
    expect(interpolateConfidence(curve, 0)).toBe(0)
    expect(interpolateConfidence(curve, 1000)).toBe(90)
  })

  it('en tom kurva ger 0 utan att krascha', () => {
    expect(interpolateConfidence([], 150)).toBe(0)
  })
})

describe('BidForm (P81c/P84) — vinstchansen för spelarens eget pris', () => {
  it('visar en avläsning redan vid första render, vid reglagets golv (playerWinCurve:s första punkt)', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-floor-seed')
    const order = makeOrder(state)
    const curve = playerWinCurve(state, order, 'A')

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    expect(screen.getByTestId('your-win-chance').textContent).toContain(`${curve[0]!.confidence}%`)
  })

  it('reglaget till taket (End) visar playerWinCurve:s sista punkt exakt', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-ceiling-seed')
    const order = makeOrder(state)
    const curve = playerWinCurve(state, order, 'A')
    const last = curve[curve.length - 1]!

    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)
    fireEvent.keyDown(screen.getByLabelText('Price'), { key: 'End' })

    expect(screen.getByTestId('your-win-chance').textContent).toContain(`${last.confidence}%`)
  })

  it('vid golvpriset (nära självkostnaden) visar avläsningen en chans mätbart över 0 % när winBand visar 0 % överallt', () => {
    const state = createInitialState('indochina-slice', 'bidform-winchance-low-seed')
    const order = makeOrder(state)
    const estimate = bidEstimate(state, order, 'A')
    const allZeroInBand = estimate.winBand.every((p) => p.confidence === 0)

    const curve = playerWinCurve(state, order, 'A')
    render(<BidForm state={state} order={order} existingBid={undefined} onSubmit={() => {}} onRemove={() => {}} />)

    const shown = Number(screen.getByTestId('your-win-chance').textContent!.match(/(\d+)%/)![1])
    expect(shown).toBe(curve[0]!.confidence)
    if (allZeroInBand) {
      // Just den situation P81-7 beskrev: winBand missvisande visar 0 % i alla
      // fem punkter, men det billigaste priset på curven vinner ändå riktigt.
      expect(shown).toBeGreaterThan(0)
    } else {
      expect(shown).toBeGreaterThanOrEqual(0)
    }
  })
})
