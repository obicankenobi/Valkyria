// migrate() — ett sparat parti från före P96 saknar GameState.ledger och skulle krascha i
// resolveTurn (ledger.ts skriver mot draft.ledger). Migreringen ger det en tom huvudbok:
// historiken FÖRE inläsningen finns inte att återskapa, så P97-grafen får tåla en huvudbok
// som inte börjar på tur 0.
import { describe, expect, it } from 'vitest'
import { INTEGRITY_START, allLines, createInitialState, resolveTurn, scheduledGeneration } from '@seventh-front/core'
import type { GameState, ProductionLine } from '@seventh-front/core'
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

  it('(P99d/P100) ger ett gammalt sparat parti utan favourMarginOwed/standingOrders en skuldfri, tom standard och det går att spela vidare', () => {
    const save = oldSave()
    const house = save.state.house as Partial<GameState['house']>
    delete house.favourMarginOwed
    delete house.standingOrders
    const migrated = migrate(save)!
    expect(migrated.state.house.favourMarginOwed).toBe(0)
    expect(migrated.state.house.standingOrders).toEqual({ lines: {}, supply: [], stations: {} })
    expect(() => resolveTurn(migrated.state, migrated.draft)).not.toThrow()
  })

  it('(P107) ger ett gammalt sparat parti utan categoryQuality/researchHeadStart nollor i alla kategorier, och en befintlig bank rörs inte', () => {
    const save = oldSave()
    const house = save.state.house as Partial<GameState['house']>
    delete house.categoryQuality
    delete house.researchHeadStart
    delete house.rndBidLock
    delete house.designs
    delete house.investigations
    const migrated = migrate(save)!
    const zeros = { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 }
    expect(migrated.state.house.categoryQuality).toEqual(zeros)
    expect(migrated.state.house.researchHeadStart).toEqual(zeros)
    expect(() => resolveTurn(migrated.state, migrated.draft)).not.toThrow()

    // P108: rndBidLock tillkom på House — ett gammalt sparat parti har inga lås, och ett befintligt lås rörs inte.
    expect(migrated.state.house.rndBidLock).toEqual({})
    expect(migrated.state.house.designs).toEqual([]) // P109
    expect(migrated.state.house.investigations).toEqual([]) // P113
    const locked = oldSave()
    locked.state.house.rndBidLock = { artillery: 7 }
    expect(migrate(locked)!.state.house.rndBidLock).toEqual({ artillery: 7 })

    const fresh = oldSave()
    fresh.state.house.researchHeadStart.naval = 1.25
    const kept = migrate(fresh)!
    expect(kept.state.house.researchHeadStart.naval).toBe(1.25)
  })

  it('(P125) ger ett gammalt sparat parti utan reputation.integrity startvärdet, och ett befintligt värde rörs inte', () => {
    const save = oldSave()
    delete (save.state.house.reputation as Partial<GameState['house']['reputation']>).integrity
    const migrated = migrate(save)!
    expect(migrated.state.house.reputation.integrity).toBe(INTEGRITY_START)
    expect(() => resolveTurn(migrated.state, migrated.draft)).not.toThrow()
    const kept = oldSave()
    kept.state.house.reputation.integrity = 83
    expect(migrate(kept)!.state.house.reputation.integrity).toBe(83)
  })

  it('(P118) ger ett gammalt sparat parti utan race de generationer grundschemat ger vid dess tur, höjer köparnas techLevel i takt med dem, och rör inget som redan finns', () => {
    const save = oldSave()
    save.state.meta.turn = 9
    const before = createInitialState('indochina-slice', 'migrate-seed')
    delete (save.state as Partial<GameState>).race
    const migrated = migrate(save)!
    for (const bloc of ['west', 'east'] as const) {
      for (const category of ['artillery', 'naval', 'infantry'] as const) {
        expect(migrated.state.race.generation[bloc][category]).toBe(scheduledGeneration(9, bloc, category))
      }
    }
    expect(migrated.state.race.generation.west.artillery).toBe(2)
    expect(migrated.state.race.generation.east.infantry).toBe(1) // steget på tur 12 har ännu inte skett
    // rvn (väst) har sett ett artillerisprång (tur 8) och ett marint (tur 4): techLevel följer.
    expect(migrated.state.factions['rvn']!.techLevel.artillery).toBe(before.factions['rvn']!.techLevel.artillery + 1)
    expect(migrated.state.factions['rvn']!.techLevel.naval).toBe(before.factions['rvn']!.techLevel.naval + 1)
    expect(migrated.state.factions['nlf']!.techLevel.infantry).toBe(before.factions['nlf']!.techLevel.infantry)
    expect(() => resolveTurn(migrated.state, migrated.draft)).not.toThrow()

    // Ett parti som redan har race rörs inte.
    const kept = oldSave()
    kept.state.race.generation.west.armour = 2
    expect(migrate(kept)!.state.race.generation.west.armour).toBe(2)
  })
})

describe('migrate (P169, etapp 11 §3 11K): fyra linjer blir två verk med två linjer var', () => {
  // Så här såg ett sparat parti ut före etapp 11: en fristående `lines`-lista på huset, inga verk.
  function preWorksSave(mutate?: (lines: ProductionLine[]) => void) {
    const save = oldSave()
    const house = save.state.house as unknown as { lines?: ProductionLine[]; works?: unknown }
    const proto = allLines(save.state.house)[0]!
    const lines = ['line-1', 'line-2', 'line-3', 'line-4'].map((id) => ({ ...proto, id })) // så här såg startläget ut före P170: fyra linjer
    mutate?.(lines)
    house.lines = lines
    delete house.works
    return { save, lines }
  }

  it('två monteringsverk med två linjer var, i ordning, och inga fristående linjer kvar', () => {
    const { save, lines } = preWorksSave()
    const migrated = migrate(save)!
    const house = migrated.state.house as unknown as Record<string, unknown>
    expect('lines' in house).toBe(false)
    expect(migrated.state.house.works.map((w) => w.id)).toEqual(['works-1', 'works-2'])
    expect(migrated.state.house.works.map((w) => w.lines.map((l) => l.id))).toEqual([['line-1', 'line-2'], ['line-3', 'line-4']])
    expect(allLines(migrated.state.house)).toEqual(lines)
  })

  it('ingen linje, inget uppdrag och ingen status går förlorad', () => {
    const { save } = preWorksSave((lines) => {
      lines[1] = { ...lines[1]!, status: 'running', assignedContractId: 'c-9', productId: 'm1_rifle' }
      lines[3] = { ...lines[3]!, status: 'retooling', retoolingUntilTurn: 7 }
    })
    const migrated = migrate(save)!
    const moved = allLines(migrated.state.house)
    expect(moved[1]).toMatchObject({ status: 'running', assignedContractId: 'c-9', productId: 'm1_rifle' })
    expect(moved[3]).toMatchObject({ status: 'retooling', retoolingUntilTurn: 7 })
  })

  it('partiet går att spela vidare efter migreringen, och indata muteras inte', () => {
    const { save } = preWorksSave()
    const before = JSON.stringify(save.state.house)
    const migrated = migrate(save)!
    expect(JSON.stringify(save.state.house)).toBe(before)
    const next = resolveTurn(migrated.state, migrated.draft).state
    expect(allLines(next.house)).toHaveLength(4)
  })

  it('ett parti som redan har verk rörs inte', () => {
    const save = oldSave()
    const kept = migrate(save)!
    expect(kept.state.house.works).toBe(save.state.house.works)
  })
})
