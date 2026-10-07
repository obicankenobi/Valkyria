// unmetBacklog.test.ts — P141 steg 1 (ETAPP10_FORSLAG.md §6 punkt 1, beslut 10U). Efterfrågans uppbyggnad följer krigets förbrukning turen den uppstår i stället för att samlas på hög bakom tekniknivån:
// ett behov som köparen inte kan beställa (ingen produkt klarar dess techLevel) hålls vid unmetNeedBacklogFactor × orderTriggerThreshold. När tekniknivån stiger har köparen alltså ett behov att beställa mot — men
// inte en hög som släpper loss hela den uppdämda efterfrågan på en gång (det var vad P118 mätte med blocTechLevelStep 1).
import { describe, expect, it } from 'vitest'
import { orders } from '../src/resolve/steps/orders.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import balance from '../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../src/resolve/index.js'
import type { WireEvent } from '../src/types.js'
import type { TurnSubmission } from '../src/types.js'

const B = balance as unknown as { unmetNeedBacklogFactor: number; orderTriggerThreshold: Record<string, number> }

function run(mutate: (s: ReturnType<typeof createInitialState>) => void) {
  const state = createInitialState('indochina-slice', 'unmet-backlog-seed')
  mutate(state)
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  const submission: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
  const ctx: ResolveContext = { state, draft: state, submission, rng: createRng('unmet-backlog', 0), emit: (e) => (emitted.push(e as never), `e-${emitted.length}`), rejected: [] }
  orders(ctx)
  return { state, emitted }
}

describe('behovet bakom tekniknivån hålls (P141 steg 1)', () => {
  it('nyckeln finns och är minst 1 (ett behov under tröskeln utlyser aldrig en order)', () => {
    expect(B.unmetNeedBacklogFactor).toBeGreaterThanOrEqual(1)
  })

  it('NLF (tekniknivå 1) kan inte beställa pansar: ett uppdämt behov hålls vid faktor × tröskel, med en rubrik som bär ändringen', () => {
    const { state, emitted } = run((s) => {
      s.factions.nlf!.materielNeed.armour = 300
    })
    const cap = B.orderTriggerThreshold.armour! * B.unmetNeedBacklogFactor
    expect(state.factions.nlf!.materielNeed.armour).toBe(cap)
    const held = emitted.find((e) => e.subjectId === 'nlf' && e.headline.includes('UNMET NEED FOR ARMOUR IS NOT STOCKPILED'))
    expect(held).toBeDefined()
    expect(held!.delta['materielNeed.armour']).toBe(cap - 300)
  })

  it('ett behov under taket rörs inte', () => {
    const cap = B.orderTriggerThreshold.armour! * B.unmetNeedBacklogFactor
    const { state } = run((s) => {
      s.factions.nlf!.materielNeed.armour = cap - 1
    })
    expect(state.factions.nlf!.materielNeed.armour).toBe(cap - 1)
  })

  it('en kategori köparen KAN beställa hålls inte: behovet förbrukas av ordern som förut', () => {
    const { state } = run((s) => {
      s.factions.rvn!.materielNeed.infantry = 300
      s.factions.rvn!.militaryBudget = 500_000_000
    })
    expect(state.factions.rvn!.materielNeed.infantry).toBe(0)
    expect(state.market.openOrders.some((o) => o.buyerId === 'rvn' && o.productId === 'm1_rifle')).toBe(true)
  })

  it('när tekniknivån stiger har köparen ett behov att beställa mot, men inte hela högen', () => {
    const { state } = run((s) => {
      s.factions.rvn!.materielNeed.armour = 300
      s.factions.rvn!.techLevel.armour = 1
      s.factions.rvn!.militaryBudget = 500_000_000
    })
    // tekniknivån rvn startar på räcker inte för pansar i det här läget: hålls vid taket, och först då kan den stiga
    expect(state.factions.rvn!.materielNeed.armour).toBe(B.orderTriggerThreshold.armour! * B.unmetNeedBacklogFactor)
  })
})
