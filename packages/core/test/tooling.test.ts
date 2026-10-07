// tooling.test.ts — P171 (ETAPP11_FORSLAG.md §4.5, §3): uppsättning och omställning, även för konstruktioner, och produktionsplanen. En linje är uppsatt för en
// produkt eller en av husets konstruktioner; ett byte kostar tid och pengar — kort inom samma familj (en uppgradering), längre för en ny konstruktion, längst för en
// annan produkt (och avgör därmed P112:s premissfynd: en ny konstruktion kräver omställning). Planen säger vilken linje som bygger vad, i vilken ordning.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { production } from '../src/resolve/steps/production.js'
import { createRng } from '../src/rng.js'
import { setupChange, setupCost, designRoot } from '../src/tooling.js'
import { validateStandingOrderChange } from '../src/standingOrders.js'
import { allLines } from '../src/works.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Design, GameState, StandingOrderChange, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  retoolingTurns: number
  retoolingTurnsDesign: number
  retoolingTurnsProduct: number
  retoolingCostFamily: number
  retoolingCostDesign: number
  retoolingCostProduct: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function ctxFor(state: GameState, submission: TurnSubmission = EMPTY): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = { state, draft: state, submission, rng: createRng('tooling', 0), emit: (e) => (emitted.push(e), `t-${seq++}`), rejected: [] }
  return { ctx, emitted }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c-1', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 1000, unitsDelivered: 0, price: 2_000_000, unitCostAtSigning: 11_500, grade: 'A',
    dueTurn: 12, status: 'active', lateEventId: null, frontId: null, advancePct: 0, advancePaid: 0, ...overrides,
  }
}

function design(id: string, lineage: string | null = null): Design {
  return { id, lineage } as unknown as Design
}

describe('balance.json — omställningens tid och pris är växande: familj < konstruktion < produkt', () => {
  it('tiden och priset stiger med hur stor omställningen är', () => {
    expect(B.retoolingTurns).toBeLessThan(B.retoolingTurnsDesign)
    expect(B.retoolingTurnsDesign).toBeLessThan(B.retoolingTurnsProduct)
    expect(B.retoolingCostFamily).toBeLessThan(B.retoolingCostDesign)
    expect(B.retoolingCostDesign).toBeLessThan(B.retoolingCostProduct)
  })
})

describe('setupChange — vad ett byte är', () => {
  const house = { designs: [design('d-1'), design('d-2', 'd-1'), design('d-3', 'd-2'), design('d-9')] }

  it('en linje utan uppsättning ställs inte om (den startar bara)', () => {
    expect(setupChange(house, null, { productId: 'm3_apc', designId: undefined })).toBe('fresh')
    expect(setupChange(house, undefined, { productId: 'm3_apc', designId: 'd-1' })).toBe('fresh')
  })

  it('samma produkt och samma konstruktion: ingen omställning', () => {
    expect(setupChange(house, { productId: 'm3_apc', designId: null }, { productId: 'm3_apc', designId: undefined })).toBe('none')
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-2' }, { productId: 'm3_apc', designId: 'd-2' })).toBe('none')
  })

  it('en uppgradering av samma konstruktion (samma familj, även flera steg) är kort', () => {
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-1' }, { productId: 'm3_apc', designId: 'd-2' })).toBe('family')
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-1' }, { productId: 'm3_apc', designId: 'd-3' })).toBe('family')
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-3' }, { productId: 'm3_apc', designId: 'd-1' })).toBe('family')
  })

  it('en ny konstruktion — eller byte mellan standardprodukten och en konstruktion — kräver omställning (P112:s fynd)', () => {
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-1' }, { productId: 'm3_apc', designId: 'd-9' })).toBe('design')
    expect(setupChange(house, { productId: 'm3_apc', designId: null }, { productId: 'm3_apc', designId: 'd-1' })).toBe('design')
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-1' }, { productId: 'm3_apc', designId: undefined })).toBe('design')
  })

  it('en annan produkt är längst, oavsett konstruktion', () => {
    expect(setupChange(house, { productId: 'm3_apc', designId: 'd-1' }, { productId: 'm1_rifle', designId: 'd-1' })).toBe('product')
  })

  it('designRoot följer linjen till rötterna och tål en cykel', () => {
    expect(designRoot(house, 'd-3')).toBe('d-1')
    expect(designRoot({ designs: [design('a', 'b'), design('b', 'a')] }, 'a')).toBeDefined()
  })

  it('setupCost: tid och pengar per slag, och ingenting för fresh/none', () => {
    expect(setupCost('fresh')).toEqual({ turns: 0, cost: 0 })
    expect(setupCost('none')).toEqual({ turns: 0, cost: 0 })
    expect(setupCost('family')).toEqual({ turns: B.retoolingTurns, cost: B.retoolingCostFamily })
    expect(setupCost('design')).toEqual({ turns: B.retoolingTurnsDesign, cost: B.retoolingCostDesign })
    expect(setupCost('product')).toEqual({ turns: B.retoolingTurnsProduct, cost: B.retoolingCostProduct })
  })
})

describe('production — omställningen kostar tid och pengar', () => {
  function switchState(next: Partial<Contract>, tooling?: { productId: string; designId: string | null }) {
    const state = createInitialState('indochina-slice', 'tool-1')
    state.house.works[0]!.category = null // verket bygger allt: testen gäller omställningen, inte kategorin
    state.meta.turn = 3
    const line = allLines(state.house)[0]!
    state.market.contracts = [contract({ id: 'old', unitsDelivered: 1000, status: 'fulfilled' }), contract({ id: 'new', ...next })]
    line.assignedContractId = 'old'
    line.productId = '105mm_field_gun'
    line.status = 'running'
    if (tooling) line.tooling = tooling as never
    return { state, line }
  }

  it('ny produkt: produkt-omställningens tid och pris, bokfört på huvudbokens rad `retooling`', () => {
    const { state, line } = switchState({ productId: 'ch3_transport_helicopter' })
    const t0 = state.house.treasury
    const { ctx, emitted } = ctxFor(state)
    production(ctx)
    expect(line.status).toBe('retooling')
    expect(line.retoolingUntilTurn).toBe(3 + B.retoolingTurnsProduct)
    expect(t0 - state.house.treasury).toBe(B.retoolingCostProduct)
    expect(state.ledger.at(-1)!.expenses.retooling).toBe(B.retoolingCostProduct)
    expect(emitted.some((e) => e.headline.includes('RETOOLS') && e.headline.includes('NEW PRODUCT'))).toBe(true)
  })

  it('en uppsättning överlever att linjen står tom: bytet kostar även efter ett uppehåll (förut nollställdes den)', () => {
    const { state, line } = switchState({ productId: 'ch3_transport_helicopter' })
    production(ctxFor(state).ctx) // tur 3: omställning börjar
    expect(line.tooling).toEqual({ productId: 'ch3_transport_helicopter', designId: null })
    // kontraktet blir färdigt, linjen står ledig en tur, sedan kommer en ny produkt
    state.market.contracts.find((c) => c.id === 'new')!.status = 'fulfilled'
    state.meta.turn = 3 + B.retoolingTurnsProduct + 1
    production(ctxFor(state).ctx)
    expect(line.status).toBe('idle')
    expect(line.productId).toBeNull()
    expect(line.tooling).toEqual({ productId: 'ch3_transport_helicopter', designId: null }) // fortfarande uppsatt
    state.market.contracts.push(contract({ id: 'third', productId: 'm1_rifle' }))
    state.meta.turn += 1
    const t0 = state.house.treasury
    production(ctxFor(state).ctx)
    expect(line.status).toBe('retooling')
    expect(t0 - state.house.treasury).toBe(B.retoolingCostProduct)
  })

  it('samma produkt, ny konstruktion: konstruktions-omställningen', () => {
    const { state, line } = switchState({ id: 'new', designId: 'd-2' as never }, { productId: '105mm_field_gun', designId: null })
    state.house.designs.push(design('d-2') as Design)
    const t0 = state.house.treasury
    production(ctxFor(state).ctx)
    expect(line.status).toBe('retooling')
    expect(line.retoolingUntilTurn).toBe(3 + B.retoolingTurnsDesign)
    expect(t0 - state.house.treasury).toBe(B.retoolingCostDesign)
    expect(line.tooling).toEqual({ productId: '105mm_field_gun', designId: 'd-2' })
  })

  it('en uppgradering av samma konstruktion: kort och billig', () => {
    const { state, line } = switchState({ designId: 'd-2' as never }, { productId: '105mm_field_gun', designId: 'd-1' })
    state.house.designs.push(design('d-1') as Design, design('d-2', 'd-1') as Design)
    const t0 = state.house.treasury
    production(ctxFor(state).ctx)
    expect(line.retoolingUntilTurn).toBe(3 + B.retoolingTurns)
    expect(t0 - state.house.treasury).toBe(B.retoolingCostFamily)
  })

  it('samma uppsättning igen: ingen omställning, ingen kostnad', () => {
    const { state, line } = switchState({}, { productId: '105mm_field_gun', designId: null })
    const t0 = state.house.treasury
    production(ctxFor(state).ctx)
    expect(line.status).toBe('running')
    expect(t0 - state.house.treasury).toBeGreaterThanOrEqual(0)
    expect(state.ledger.at(-1)?.expenses.retooling ?? 0).toBe(0)
  })

  it('en helt ny linje som får sitt första kontrakt ställer inte om, och blir uppsatt för det', () => {
    const state = createInitialState('indochina-slice', 'tool-fresh')
    state.house.works[0]!.category = null
    state.market.contracts = [contract({ id: 'first', productId: 'm3_apc' })]
    const line = allLines(state.house)[0]!
    const t0 = state.house.treasury
    production(ctxFor(state).ctx)
    expect(line.status).toBe('running')
    expect(line.tooling).toEqual({ productId: 'm3_apc', designId: null })
    expect(state.ledger.at(-1)?.expenses.retooling ?? 0).toBe(0)
    expect(t0).toBeGreaterThan(state.house.treasury) // produktion kostar, omställning inte
  })
})

describe('produktionsplanen (§4.5) — PLAN SET/CLEAR', () => {
  const v = (s: GameState, c: StandingOrderChange) => validateStandingOrderChange(s, s, c)

  const WAITING = (): Contract[] => [contract({ id: 'a', productId: 'm3_apc' }), contract({ id: 'b', productId: '105mm_field_gun' }), contract({ id: 'c', productId: 'm1_rifle' })]
  // Båda linjerna är upptagna med långa kontrakt (x, y); a, b och c väntar. En plan kan bara peka på kontrakt som finns.
  function busyState(seed: string): GameState {
    const state = createInitialState('indochina-slice', seed)
    state.house.works[0]!.category = null
    const [l1, l2] = allLines(state.house) as [ReturnType<typeof allLines>[number], ReturnType<typeof allLines>[number]]
    state.market.contracts = [contract({ id: 'x', quantity: 100000 }), contract({ id: 'y', quantity: 100000 }), ...WAITING()]
    l1.assignedContractId = 'x'
    l1.productId = '105mm_field_gun'
    l1.status = 'running'
    l2.assignedContractId = 'y'
    l2.productId = '105mm_field_gun'
    l2.status = 'running'
    return state
  }
  const planState = () => busyState('plan-1')
  const finish = (s: GameState, id: string) => {
    const c = s.market.contracts.find((x) => x.id === id)!
    c.status = 'fulfilled'
    c.unitsDelivered = c.quantity
  }
  function planned(changes: StandingOrderChange[]): GameState {
    return resolveTurn(busyState('plan-2'), { standingOrders: changes, bids: [], actions: [] }).state
  }

  it('validering: okänd linje, okänt/avslutat kontrakt, dubblett och ett kontrakt som redan ligger på en annan linje avvisas', () => {
    const s = planState()
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'nope', contractIds: ['a'] })).toEqual({ ok: false, reason: 'unknown line' })
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['zzz'] })).toEqual({ ok: false, reason: 'unknown contract' })
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['a', 'a'] })).toEqual({ ok: false, reason: 'a contract can only be planned once' })
    finish(s, 'c')
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['c'] })).toEqual({ ok: false, reason: 'that contract needs no more production' })
    s.house.standingOrders.plan = { 'line-2': { contractIds: ['a'], sinceTurn: 1 } }
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['a'] })).toEqual({ ok: false, reason: 'that contract is already planned on another line' })
    expect(v(s, { kind: 'PLAN', op: 'SET', lineId: 'line-2', contractIds: ['a', 'b'] })).toEqual({ ok: true }) // samma linje får skriva om sin plan
    expect(v(s, { kind: 'PLAN', op: 'CLEAR', lineId: 'line-1' })).toEqual({ ok: false, reason: 'no plan for that line' })
    expect(v(s, { kind: 'PLAN', op: 'CLEAR', lineId: 'line-2' })).toEqual({ ok: true })
  })

  it('planen gäller från nästa tur: den lediga linjen tar kontrakten i planens ordning i stället för i listans', () => {
    const s = planned([{ kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['c', 'b'] }])
    expect(s.house.standingOrders.plan!['line-1']).toEqual({ contractIds: ['c', 'b'], sinceTurn: 1 })
    finish(s, 'x') // linje 1 blir ledig
    const next = resolveTurn(s, EMPTY).state
    expect(allLines(next.house)[0]!.assignedContractId).toBe('c') // planens första, inte listans första ('a')
  })

  it('en plan som sätts samma tur en linje blir ledig gäller inte än (från nästa tur)', () => {
    const s = busyState('plan-same-turn')
    finish(s, 'x')
    const next = resolveTurn(s, { standingOrders: [{ kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['c'] }], bids: [], actions: [] }).state
    expect(allLines(next.house)[0]!.assignedContractId).toBe('a') // automatiskt, planen börjar gälla nästa tur
  })

  it('ett planerat kontrakt är reserverat: en annan linje tar det inte, utan nästa fria', () => {
    let s = planned([{ kind: 'PLAN', op: 'SET', lineId: 'line-2', contractIds: ['a'] }])
    finish(s, 'x') // linje 1 blir ledig först
    s = resolveTurn(s, EMPTY).state
    expect(allLines(s.house)[0]!.assignedContractId).toBe('b') // 'a' är reserverat åt linje 2
    finish(s, 'y')
    s = resolveTurn(s, EMPTY).state
    expect(allLines(s.house)[1]!.assignedContractId).toBe('a')
  })

  it('en tom eller uttömd plan ger den automatiska fördelningen tillbaka; avklarade kontrakt städas ur planen', () => {
    let s = planned([{ kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['b'] }])
    finish(s, 'b')
    finish(s, 'x')
    const r = resolveTurn(s, EMPTY)
    s = r.state
    expect(s.house.standingOrders.plan!['line-1']?.contractIds ?? []).toEqual([])
    expect(r.wire.some((e) => e.headline.includes('LINE-1 PLAN: B DONE'))).toBe(true)
    expect(allLines(s.house)[0]!.assignedContractId).toBe('a') // auto tog över
  })

  it('CLEAR tar bort planen', () => {
    let s = planned([{ kind: 'PLAN', op: 'SET', lineId: 'line-1', contractIds: ['a'] }])
    s = resolveTurn(s, { standingOrders: [{ kind: 'PLAN', op: 'CLEAR', lineId: 'line-1' }], bids: [], actions: [] }).state
    expect(s.house.standingOrders.plan?.['line-1']).toBeUndefined()
  })
})
