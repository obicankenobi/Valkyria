// migrate() — ett sparat parti från före P96 saknar GameState.ledger och skulle krascha i
// resolveTurn (ledger.ts skriver mot draft.ledger). Migreringen ger det en tom huvudbok:
// historiken FÖRE inläsningen finns inte att återskapa, så P97-grafen får tåla en huvudbok
// som inte börjar på tur 0.
import { describe, expect, it } from 'vitest'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { migrate } from '../src/persistence'

function oldSave(): { state: GameState; draft: { standingOrders: []; bids: []; actions: [] } } {
  const state = createInitialState('indochina-slice', 'migrate-seed') as Partial<GameState>
  delete state.ledger // så här såg ett sparat parti ut före P96
  return { state: state as GameState, draft: { standingOrders: [], bids: [], actions: [] } }
}

describe('migrate (P96-uppföljning)', () => {
  it('ger ett gammalt sparat parti utan ledger en tom huvudbok, och partiet går att spela vidare', () => {
    const saved = migrate(oldSave())
    expect(saved).not.toBeNull()
    expect(saved!.state.ledger).toEqual([])

    const next = resolveTurn(saved!.state, saved!.draft).state
    expect(next.ledger).toHaveLength(1)
    expect(next.ledger[0]!.turn).toBe(0)
  })

  it('rör inte en befintlig huvudbok', () => {
    const save = oldSave()
    const withLedger = resolveTurn(createInitialState('indochina-slice', 'migrate-seed'), save.draft).state
    const migrated = migrate({ state: withLedger, draft: save.draft })
    expect(migrated!.state.ledger).toBe(withLedger.ledger)
  })

  it('(P98) ger gamla ordrar och kontrakt utan förskottsfält advancePct/advancePaid 0, så leveransbetalningen inte blir NaN', () => {
    const save = oldSave()
    const state = save.state as GameState
    // Så här såg en order/ett kontrakt ut före P98: inga förskottsfält.
    state.market.openOrders = [
      { id: 'o1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, statedBudget: 1, trueBudget: 1, referencePrice: 1, requiredDeliveryTurns: 2, expiresTurn: 3, competingRivals: [], weights: { price: 0.5, delivery: 0.3, relationship: 0.2 }, officialId: 'official-rvn-procurement', reason: { kind: 'SCRIPTED' }, frontId: null },
    ] as unknown as GameState['market']['openOrders']
    state.market.contracts = [
      { id: 'c1', buyerId: 'rvn', productId: 'm1_rifle', quantity: 10, unitsDelivered: 0, price: 1000, unitCostAtSigning: 50, grade: 'A', dueTurn: 9, status: 'active', lateEventId: null, frontId: null },
    ] as unknown as GameState['market']['contracts']

    const migrated = migrate(save)!
    expect(migrated.state.market.openOrders[0]!.advancePct).toBe(0)
    expect(migrated.state.market.contracts[0]!.advancePct).toBe(0)
    expect(migrated.state.market.contracts[0]!.advancePaid).toBe(0)
    expect(save.state.market.contracts[0]).not.toHaveProperty('advancePaid') // indata muteras inte
  })

  it('en okänd schemaversion ger fortfarande null', () => {
    const save = oldSave()
    save.state.meta.version = 999
    expect(migrate(save)).toBeNull()
  })
})
