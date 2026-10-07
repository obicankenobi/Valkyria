// orderSizes.test.ts — P185 regel 3 (ETAPP11_FORSLAG.md §9b, beslut 11R): orderstorlekar som fyller en linje. Ett typiskt kontrakt tar en produktionslinje i två till fyra kvartal; ett kontrakt som en linje
// gör på ett kvartal gör kapaciteten ointressant. Den scriptade Mk-9-granaten (restricted, bara scriptade ordrar) ingår inte.
import { describe, expect, it } from 'vitest'
import { allProducts } from '../src/pricing.js'
import { orders } from '../src/resolve/steps/orders.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { TurnSubmission } from '../src/types.js'

const ordinary = allProducts().filter((p) => !p.restricted)

describe('orderstorlekar mot linjernas takt (11R)', () => {
  it('det finns ordinarie produkter att pröva', () => {
    expect(ordinary.length).toBeGreaterThanOrEqual(6)
  })

  it.each(ordinary.map((p) => [p.id, p] as const))('%s: minsta order är minst två och största högst fyra linjekvartal', (_id, p) => {
    expect(p.orderQuantityMin).toBeDefined()
    expect(p.orderQuantityMax).toBeDefined()
    expect(p.orderQuantityMin! / p.unitsPerLineTurn).toBeGreaterThanOrEqual(2)
    expect(p.orderQuantityMax! / p.unitsPerLineTurn).toBeLessThanOrEqual(4)
  })

  it.each(ordinary.map((p) => [p.id, p] as const))('%s: ett typiskt kontrakt (mitten av intervallet) tar en linje 2–4 kvartal', (_id, p) => {
    const typical = (p.orderQuantityMin! + p.orderQuantityMax!) / 2
    const quarters = typical / p.unitsPerLineTurn
    expect(quarters).toBeGreaterThanOrEqual(2)
    expect(quarters).toBeLessThanOrEqual(4)
  })
})

// P186 (leveranstider mot de större kontrakten, §9b punkt 3): en order som tar flera linjekvartal att tillverka måste ge tid för det — annars är varje stor order sen redan innan den börjar
// (tillverkning + leveransfördröjningen på upp till tre kvartal > kravet), och "ready by" stänger dem alla.
const B = balance as unknown as { orderDeliverySlackTurns: number; orderDeliveryTurnsPerLineQuarter: number }

describe('leveranstid för en order som fyller en linje (P186)', () => {
  it('kravet = produktens minDelivery + slack + (linjekvartal − 1) × orderDeliveryTurnsPerLineQuarter', () => {
    const state = createInitialState('indochina-slice', 'order-delivery-seed')
    for (const f of Object.values(state.factions)) {
      f.militaryBudget = 500_000_000
      for (const c of Object.keys(f.materielNeed) as (keyof typeof f.materielNeed)[]) f.materielNeed[c] = 400
    }
    const emitted: unknown[] = []
    const submission: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
    const ctx: ResolveContext = { state, draft: state, submission, rng: createRng('order-delivery', 0), emit: (e) => (emitted.push(e), `e-${emitted.length}`), rejected: [] }
    orders(ctx)
    const generated = state.market.openOrders.filter((o) => o.reason.kind === 'PEACETIME_REPLACEMENT')
    expect(generated.length).toBeGreaterThan(0)
    for (const o of generated) {
      const p = allProducts().find((x) => x.id === o.productId)!
      const lineQuarters = Math.max(1, Math.ceil(o.quantity / p.unitsPerLineTurn))
      expect(o.requiredDeliveryTurns).toBe(p.minDelivery + B.orderDeliverySlackTurns + (lineQuarters - 1) * B.orderDeliveryTurnsPerLineQuarter)
    }
    expect(generated.some((o) => o.requiredDeliveryTurns > allProducts().find((x) => x.id === o.productId)!.minDelivery + B.orderDeliverySlackTurns)).toBe(true)
  })
})
