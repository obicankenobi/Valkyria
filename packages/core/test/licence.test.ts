// licence.test.ts — P135 (ETAPP9_FORSLAG.md §8b.4, reducerad): licenser och embargo som skapar en konkurrent.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { advanceLicences, applyLicenceChange, licenceRivalId, validateLicenceChange } from '../src/licence.js'
import { blocOfFaction } from '../src/race.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, GameState, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  licenceLumpSum: number
  licenceRoyaltyPerTurn: number
  licenceCapabilityPerTurn: number
  licenceRivalCapability: number
  licenceEmbargoGrowthFactor: number
  exportControlGeneration: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 60,
    reliability: 56,
    unitCostFactor: 1,
    trueQuality: 58,
    uncertainty: 2,
    latentFlaw: null,
    flawRevealed: false,
    testedIn: [],
    fieldRecord: { occasions: 0, proven: false },
    lineage: null,
    introducedTurn: 0,
    status: 'active',
    ...over,
  }
}

function fresh(): GameState {
  const state = createInitialState('indochina-slice', 'licence-seed')
  state.house.treasury = 20_000_000
  state.house.designs = [design()]
  return state
}

function makeCtx(state: GameState): { ctx: ResolveContext; emitted: WireEvent[] } {
  const emitted: WireEvent[] = []
  let seq = 0
  const ctx = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng('licence', 0),
    emit: (e: Omit<WireEvent, 'id' | 'turn'>) => {
      const id = `${state.meta.turn}-${seq++}`
      emitted.push({ id, turn: state.meta.turn, ...e })
      return id
    },
    rejected: [],
  } as unknown as ResolveContext
  return { ctx, emitted }
}

const firstFaction = (state: GameState): string => Object.keys(state.factions)[0]!
const grant = (state: GameState, factionId = firstFaction(state)) => ({ kind: 'LICENCE' as const, op: 'GRANT' as const, designId: 'design-1', factionId })

describe('licenser — validering (P135)', () => {
  it('kräver en egen aktiv konstruktion och en känd, solvent licenstagare; en licens per konstruktion och faktion', () => {
    const state = fresh()
    expect(validateLicenceChange(state, grant(state))).toEqual({ ok: true })
    expect(validateLicenceChange(state, { ...grant(state), designId: 'nope' })).toEqual({ ok: false, reason: 'unknown design' })
    expect(validateLicenceChange(state, grant(state, 'nobody'))).toEqual({ ok: false, reason: 'unknown licensee' })
    state.house.designs[0]!.status = 'withdrawn'
    expect(validateLicenceChange(state, grant(state))).toEqual({ ok: false, reason: 'design is withdrawn' })
    state.house.designs[0]!.status = 'active'
    const { ctx } = makeCtx(state)
    applyLicenceChange(ctx, grant(state))
    expect(validateLicenceChange(state, grant(state))).toEqual({ ok: false, reason: 'that licence already exists' })
    expect(validateLicenceChange(state, { kind: 'LICENCE', op: 'REVOKE', licenceId: 'licence-9' })).toEqual({ ok: false, reason: 'no such active licence' })
  })

  it('exklusiviteten (P132) gäller: en konstruktion bunden till ett block kan inte licensieras till det andra', () => {
    const state = fresh()
    const west = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === 'west')!
    const east = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === 'east')!
    state.house.designs[0]!.exclusiveTo = 'west'
    expect(validateLicenceChange(state, grant(state, west))).toEqual({ ok: true })
    expect(validateLicenceChange(state, grant(state, east))).toEqual({ ok: false, reason: 'design bound to the west by its research grant' })
  })
})

describe('licenser — engångsbelopp, royalty och förmåga (P135)', () => {
  it('betalar engångsbeloppet direkt (kassa, revenueByTurn, huvudbok) och royalty från nästa tur', () => {
    const state = fresh()
    state.ledger = [{ turn: 0, income: { contracts: 0, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 } } as never]
    const { ctx } = makeCtx(state)
    applyLicenceChange(ctx, grant(state))
    expect(state.house.treasury).toBe(20_000_000 + B.licenceLumpSum)
    expect(state.house.revenueByTurn[0]).toBe(B.licenceLumpSum)
    expect(state.ledger![0]!.income.licence).toBe(B.licenceLumpSum)
    advanceLicences(ctx) // tur 0: sinceTurn = 1 → ingen royalty än
    expect(state.house.treasury).toBe(20_000_000 + B.licenceLumpSum)
    state.meta.turn = 1
    state.ledger!.push({ turn: 1, income: { contracts: 0, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 } } as never)
    advanceLicences(ctx)
    expect(state.house.treasury).toBe(20_000_000 + B.licenceLumpSum + B.licenceRoyaltyPerTurn)
    expect(state.house.licences![0]!.capability).toBe(B.licenceCapabilityPerTurn)
  })

  it('en embargerad licenstagare växer licenceEmbargoGrowthFactor gånger så fort', () => {
    const state = fresh()
    const plainId = firstFaction(state)
    const embargoedId = Object.keys(state.factions)[1]!
    state.factions[embargoedId]!.embargoed = true
    const { ctx } = makeCtx(state)
    applyLicenceChange(ctx, grant(state, plainId))
    applyLicenceChange(ctx, grant(state, embargoedId))
    state.meta.turn = 1
    advanceLicences(ctx)
    const [plain, embargoed] = state.house.licences!
    expect(embargoed!.capability).toBe(plain!.capability * B.licenceEmbargoGrowthFactor)
  })
})

describe('licenser — licenstagaren blir en rival (P135)', () => {
  it('när förmågan räcker upphör licensen och en ny rival skapas, med en rubrik som nämner embargot', () => {
    const state = fresh()
    const id = firstFaction(state)
    state.factions[id]!.embargoed = true
    const { ctx, emitted } = makeCtx(state)
    applyLicenceChange(ctx, grant(state, id))
    for (let t = 1; t <= 10 && state.house.licences![0]!.status === 'active'; t++) {
      state.meta.turn = t
      advanceLicences(ctx)
    }
    expect(state.house.licences![0]!.status).toBe('ended')
    const rival = state.rivals[licenceRivalId(id)]!
    expect(rival).toBeDefined()
    expect(rival.specialisation).toBe('artillery')
    expect(rival.contracts).toEqual([])
    expect(Object.keys(rival.relations).sort()).toEqual(Object.keys(state.factions).sort())
    expect(emitted.some((e) => e.headline.startsWith('EMBARGOED') && e.headline.includes('NEW RIVAL'))).toBe(true)
    // Licenstagaren som rival kan inte licensieras till igen.
    expect(validateLicenceChange(state, grant(state, id))).toEqual({ ok: false, reason: 'the licensee already builds on its own' })
  })

  it('en vanlig (icke embargerad) licenstagare blir också rival, men senare och med en annan rubrik', () => {
    const state = fresh()
    const id = firstFaction(state)
    const { ctx, emitted } = makeCtx(state)
    applyLicenceChange(ctx, grant(state, id))
    let turns = 0
    for (let t = 1; t <= 20 && state.house.licences![0]!.status === 'active'; t++) {
      state.meta.turn = t
      advanceLicences(ctx)
      turns = t
    }
    expect(turns).toBe(Math.ceil(B.licenceRivalCapability / B.licenceCapabilityPerTurn))
    expect(emitted.some((e) => e.headline.includes('NOW BUILDS THE'))).toBe(true)
    expect(state.rivals[licenceRivalId(id)]).toBeDefined()
  })

  it('en återkallad licens betalar inget och ger ingen rival', () => {
    const state = fresh()
    const { ctx } = makeCtx(state)
    applyLicenceChange(ctx, grant(state))
    applyLicenceChange(ctx, { kind: 'LICENCE', op: 'REVOKE', licenceId: 'licence-1' })
    const cash = state.house.treasury
    state.meta.turn = 5
    advanceLicences(ctx)
    expect(state.house.treasury).toBe(cash)
    expect(Object.keys(state.rivals).some((id) => id.startsWith('licensee-'))).toBe(false)
  })
})

describe('licenser — exportlistan (P135 + P132)', () => {
  it('en exportreglerad licens över blockgränsen ger exportbrottets doomsday och pappersspår', () => {
    const state = fresh()
    state.house.homeState = 'west'
    state.house.designs[0]!.generation = B.exportControlGeneration
    const east = Object.keys(state.factions).find((id) => blocOfFaction(state, id) === 'east')!
    const { ctx, emitted } = makeCtx(state)
    applyLicenceChange(ctx, grant(state, east))
    expect(emitted.some((e) => e.headline.startsWith('EXPORT CONTROL BREACHED'))).toBe(true)
    expect(state.doomsday).toBeGreaterThan(0)
    expect(state.traces?.some((t) => t.kind === 'illegalExport' && t.contractId === 'licence-1')).toBe(true)
  })
})

describe('licenser — genom resolveTurn (P135)', () => {
  it('en stående order GRANT gäller i samma tur (engångsbelopp) och royalty betalas turen efter', () => {
    let state = fresh()
    const cash = state.house.treasury
    const first = resolveTurn(state, { ...EMPTY, standingOrders: [grant(state)] })
    state = first.state
    expect(first.wire.some((e) => e.headline.includes('LICENCES THE'))).toBe(true)
    expect(state.house.licences).toHaveLength(1)
    expect(state.house.treasury).toBeGreaterThan(cash - 5_000_000)
    const second = resolveTurn(state, EMPTY)
    expect(second.wire.some((e) => e.headline.includes('IN ROYALTIES ON THE'))).toBe(true)
  })
})
