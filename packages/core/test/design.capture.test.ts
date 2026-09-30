// design.capture.test.ts — P116 (ETAPP9_FORSLAG.md §6.5, beslut 9G, skyddsräcke 4). Fångad materiel och REVERSE_ENGINEER.
//
// Åt ena hållet: vid ett genombrott kan motståndaren ta husets materiel, och en rival på andra sidan får en chans att
// kopiera konstruktionen efter några turer (Production Line: egenskaper som tappar värde när andra kopierar). Åt andra
// hållet: köpare överlämnar fiendens erövrade materiel, och REVERSE_ENGINEER (det andra nya verbet) ger ett
// forskningsförsprång mot just det systemet — flera exemplar ger snabbare resultat.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designBidTerm } from '../src/design.js'
import { previewAction } from '../src/previewAction.js'
import { resolveTurn } from '../src/resolve/index.js'
import { fronts } from '../src/resolve/steps/fronts.js'
import { rivals } from '../src/resolve/steps/rivals.js'
import { validateAction } from '../src/validateAction.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Contract, Design, Front, GameState, PlayerAction, TurnSubmission, WireEvent } from '../src/types.js'

const B = balance as unknown as {
  copyDelayTurns: number
  copyChancePct: number
  copyExposedFactor: number
  copyBidPenalty: number
  captureFractionPct: number
  reverseEngineerCost: number
  reverseEngineerBaseTurns: number
  headStartCap: number
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const REVERSE = (systemId: string): PlayerAction => ({ type: 'INTERNAL', op: 'REVERSE_ENGINEER', payload: { systemId } })

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'balanced',
    ambition: 'timely',
    performance: 50,
    reliability: 50,
    unitCostFactor: 1,
    trueQuality: 50,
    uncertainty: 1,
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

function fresh(d: Design = design()): GameState {
  const state = createInitialState('indochina-slice', 'capture-seed')
  state.house.treasury = 50_000_000
  state.house.designs = [d]
  return state
}

function makeCtx(state: GameState, seed = 'capture'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function levelFront(front: Front): void {
  front.status = 'war'
  front.terrainBonus = 0
  front.supplyStress = { a: 0, b: 0 }
  for (const side of ['a', 'b'] as const) {
    const formations = front.formations.filter((f) => f.side === side)
    for (const f of formations) {
      for (const c of Object.keys(f.equipment) as (keyof typeof f.equipment)[]) f.equipment[c] = 0
      f.equipment.artillery = 100 / formations.length
      f.strength = 1000 / formations.length
      f.strengthAtFull = f.strength
      f.readiness = 100
      f.status = 'active'
    }
    front.equipment[side].artillery = 100
    front.strength[side] = 1000
  }
}

function scaleArtillery(front: Front, side: 'a' | 'b', factor: number): void {
  for (const f of front.formations.filter((x) => x.side === side)) f.equipment.artillery *= factor
  front.equipment[side].artillery *= factor
}

function contract(buyerId: string, over: Partial<Contract> = {}): Contract {
  return {
    id: `contract-${buyerId}`,
    buyerId,
    productId: '105mm_field_gun',
    quantity: 10,
    unitsDelivered: 0,
    price: 100000,
    unitCostAtSigning: 10000,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    frontId: 'front-1',
    advancePct: 0,
    advancePaid: 0,
    ...over,
  }
}

// Spelarens konstruktion står på sida `playerSide`; den andra sidan vinner ett förkrossande genombrott.
function breakthroughAgainstPlayer(state: GameState): { front: Front; playerSide: 'a' | 'b'; winnerSide: 'a' | 'b'; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const front = state.fronts['front-1']!
  const playerSide = front.sideA === 'rvn' ? 'a' : 'b'
  const winnerSide = playerSide === 'a' ? 'b' : 'a'
  levelFront(front)
  front.attacker = winnerSide
  scaleArtillery(front, winnerSide, 1000)
  front.designUnits = { a: {}, b: {} }
  front.designUnits[playerSide]['design-1'] = 10
  const { ctx, emitted } = makeCtx(state, 'breakthrough')
  fronts(ctx)
  return { front, playerSide, winnerSide, emitted }
}

describe('motståndaren tar husets materiel (P116, §6.5)', () => {
  it('ett genombrott mot sidan som fått konstruktionen fångas materielen: rubrik och Design.captured', () => {
    const state = fresh()
    const { winnerSide, front, emitted } = breakthroughAgainstPlayer(state)
    const d = state.house.designs[0]!
    const winnerFaction = winnerSide === 'a' ? front.sideA : front.sideB
    expect(d.captured).toMatchObject({ byFactionId: winnerFaction })
    expect(emitted.some((e) => e.headline.includes('CAPTURES') && e.headline.includes('H&V M64 FIELD GUN'))).toBe(true)
  })

  it('inget fångas om spelarens sida vinner, eller om ingen konstruktion levererats dit; en redan fångad fångas inte igen', () => {
    const won = fresh()
    const front = won.fronts['front-1']!
    const playerSide = front.sideA === 'rvn' ? 'a' : 'b'
    levelFront(front)
    front.attacker = playerSide
    scaleArtillery(front, playerSide, 1000)
    front.designUnits = { a: {}, b: {} }
    front.designUnits[playerSide]['design-1'] = 10
    fronts(makeCtx(won).ctx)
    expect(won.house.designs[0]!.captured).toBeUndefined()

    const empty = fresh()
    const f2 = empty.fronts['front-1']!
    const ps = f2.sideA === 'rvn' ? 'a' : 'b'
    levelFront(f2)
    f2.attacker = ps === 'a' ? 'b' : 'a'
    scaleArtillery(f2, f2.attacker, 1000)
    fronts(makeCtx(empty).ctx)
    expect(empty.house.designs[0]!.captured).toBeUndefined()

    const twice = fresh(design({ captured: { turn: 1, byFactionId: 'nlf', eventId: null } }))
    breakthroughAgainstPlayer(twice)
    expect(twice.house.designs[0]!.captured!.turn).toBe(1)
  })
})

describe('rivalen kopierar (P116, §6.5)', () => {
  const captured = (turn = 0, byFactionId = 'nlf'): Design['captured'] => ({ turn, byFactionId, eventId: null })

  function runRivals(state: GameState, seed: string): Omit<WireEvent, 'id' | 'turn'>[] {
    const { ctx, emitted } = makeCtx(state, seed)
    rivals(ctx)
    return emitted
  }

  function copyRate(make: () => GameState, turn: number, runs = 400): number {
    let hits = 0
    for (let i = 0; i < runs; i++) {
      const state = make()
      state.meta.turn = turn
      runRivals(state, `copy-${i}`)
      if ((state.house.designs[0]!.copiedBy ?? []).length > 0) hits++
    }
    return hits / runs
  }

  it('ingen kopiering före copyDelayTurns', () => {
    expect(copyRate(() => fresh(design({ captured: captured(5, 'nlf') })), 5 + B.copyDelayTurns - 1, 100)).toBe(0)
  })

  it('efter fördröjningen kopierar en rival från motståndarens block med frekvens ≈ copyChancePct', () => {
    const rate = copyRate(() => fresh(design({ captured: captured(0, 'nlf') })), B.copyDelayTurns)
    // nlf är östblock (alignment −70): bara rivaler med homeState 'east' kan kopiera
    expect(rate).toBeGreaterThan(B.copyChancePct / 100 - 0.1)
    expect(rate).toBeLessThan(B.copyChancePct / 100 + 0.1)
  })

  it('bara rivaler i motståndarens block kopierar; utan någon rival i det blocket sker inget', () => {
    const state = fresh(design({ captured: captured(0, 'nlf') }))
    state.meta.turn = 10
    for (let i = 0; i < 200; i++) runRivals(state, `bloc-${i}`)
    const copiers = state.house.designs[0]!.copiedBy ?? []
    for (const id of copiers) expect(state.rivals[id]!.homeState).toBe('east')

    const none = fresh(design({ captured: captured(0, 'nlf') }))
    none.meta.turn = 10
    for (const r of Object.values(none.rivals)) r.homeState = 'west'
    for (let i = 0; i < 200; i++) runRivals(none, `none-${i}`)
    expect(none.house.designs[0]!.copiedBy ?? []).toEqual([])
  })

  it('en konstruktion vars kvalitet blivit känd för rivalerna (fältprov) kopieras oftare', () => {
    const plain = copyRate(() => fresh(design({ captured: captured(0, 'nlf') })), B.copyDelayTurns)
    const exposed = copyRate(() => fresh(design({ captured: captured(0, 'nlf'), exposedToRivals: true })), B.copyDelayTurns)
    expect(exposed).toBeGreaterThan(plain + 0.08)
    expect(exposed).toBeLessThan(Math.min(1, (B.copyChancePct * B.copyExposedFactor) / 100 + 0.12))
  })

  it('en kopiering emitterar en rubrik, en rival kopierar högst en gång, och varje kopia sänker budtermen med copyBidPenalty', () => {
    let emittedHeadline: string | undefined
    const state = fresh(design({ captured: captured(0, 'nlf') }))
    state.meta.turn = 10
    for (let i = 0; i < 300; i++) {
      const events = runRivals(state, `head-${i}`)
      emittedHeadline ??= events.find((e) => e.headline.includes('COPIES'))?.headline
    }
    expect(emittedHeadline).toContain('H&V M64 FIELD GUN')
    const copiers = state.house.designs[0]!.copiedBy ?? []
    expect(new Set(copiers).size).toBe(copiers.length)

    const order = { buyerId: 'rvn', officialId: 'official-rvn-procurement', frontId: 'front-1' }
    const clean = fresh(design())
    const copied = fresh(design({ copiedBy: ['meridian'] }))
    expect(designBidTerm(clean, clean.house.designs[0]!, order) - designBidTerm(copied, copied.house.designs[0]!, order)).toBeCloseTo(B.copyBidPenalty, 9)
    const twice = fresh(design({ copiedBy: ['meridian', 'brandt'] }))
    expect(designBidTerm(clean, clean.house.designs[0]!, order) - designBidTerm(twice, twice.house.designs[0]!, order)).toBeCloseTo(2 * B.copyBidPenalty, 9)
  })
})

describe('fångad materiel från fienden (P116, §6.5)', () => {
  // Spelarens köpare rvn (sida A eller B) vinner ett genombrott; nlf förlorar och förlorar materiel.
  function breakthroughForBuyer(state: GameState): { front: Front; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
    const front = state.fronts['front-1']!
    const buyerSide = front.sideA === 'rvn' ? 'a' : 'b'
    levelFront(front)
    front.attacker = buyerSide
    scaleArtillery(front, buyerSide, 1000)
    const { ctx, emitted } = makeCtx(state, 'handover')
    fronts(ctx)
    return { front, emitted }
  }

  it('när en köpare huset har ett kontrakt med vinner ett genombrott överlämnas fiendens materiel: en post med enheter', () => {
    const state = fresh()
    state.market.contracts = [contract('rvn')]
    const { emitted } = breakthroughForBuyer(state)
    const captured = state.house.capturedMateriel ?? []
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({ systemId: 'nlf-artillery', category: 'artillery', fromFactionId: 'nlf' })
    expect(captured[0]!.units).toBeGreaterThanOrEqual(1)
    expect(captured[0]!.name.length).toBeGreaterThan(0)
    expect(emitted.some((e) => e.headline.includes('CAPTURED'))).toBe(true)
  })

  it('utan kontrakt med den vinnande köparen, eller när motståndaren saknar materiel, överlämnas inget', () => {
    const noContract = fresh()
    breakthroughForBuyer(noContract)
    expect(noContract.house.capturedMateriel ?? []).toEqual([])

    const voided = fresh()
    voided.market.contracts = [contract('rvn', { status: 'voided' })]
    breakthroughForBuyer(voided)
    expect(voided.house.capturedMateriel ?? []).toEqual([])
  })

  it('flera överlämningar av samma system läggs ihop', () => {
    const state = fresh()
    state.market.contracts = [contract('rvn')]
    state.house.capturedMateriel = [{ systemId: 'nlf-artillery', name: 'x', category: 'artillery', fromFactionId: 'nlf', units: 3 }]
    breakthroughForBuyer(state)
    expect(state.house.capturedMateriel).toHaveLength(1)
    expect(state.house.capturedMateriel![0]!.units).toBeGreaterThan(3)
  })
})

describe('REVERSE_ENGINEER (P116, §6.5, beslut 9G)', () => {
  function withCaptured(units: number): GameState {
    const state = fresh()
    state.house.capturedMateriel = [{ systemId: 'nlf-artillery', name: 'Type-54 Field Gun', category: 'artillery', fromFactionId: 'nlf', units }]
    return state
  }

  it('validering: okänt system och för lite kassa avvisas', () => {
    const state = withCaptured(4)
    expect(validateAction(state, state, REVERSE('nlf-artillery'))).toEqual({ ok: true })
    expect(validateAction(state, state, REVERSE('nope'))).toEqual({ ok: false, reason: 'unknown captured system' })
    const poor = withCaptured(4)
    poor.house.treasury = B.reverseEngineerCost - 1
    expect(validateAction(poor, poor, REVERSE('nlf-artillery'))).toEqual({ ok: false, reason: 'not enough cash to reverse-engineer' })
    const empty = fresh()
    expect(validateAction(empty, empty, REVERSE('nlf-artillery'))).toEqual({ ok: false, reason: 'unknown captured system' })
  })

  it('kostar pengar och en handling, förbrukar exemplaren, ger forskningsförsprång i kategorin och noterar studien', () => {
    const state = withCaptured(4)
    const treasury = state.house.treasury
    const r = resolveTurn(state, { ...EMPTY, actions: [REVERSE('nlf-artillery')] })
    expect(r.rejected).toEqual([])
    const s = r.state
    expect(s.house.capturedMateriel).toEqual([])
    expect(s.house.researchHeadStart.artillery).toBeCloseTo(Math.min(B.headStartCap, B.reverseEngineerBaseTurns * Math.sqrt(4)), 9)
    expect(s.house.studiedSystems?.['nlf-artillery']).toBe(4)
    expect(s.ledger[s.ledger.length - 1]!.expenses.intel).toBeGreaterThanOrEqual(B.reverseEngineerCost)
    expect(treasury - s.house.treasury).toBeGreaterThanOrEqual(B.reverseEngineerCost)
    const headline = r.wire.find((e) => e.headline.includes('REVERSE-ENGINEER'))!
    expect(headline.headline).toContain('TYPE-54 FIELD GUN')
    expect(headline.delta.treasury).toBe(-B.reverseEngineerCost)
  })

  it('flera exemplar ger ett större försprång (avtagande), som aldrig går över headStartCap', () => {
    const turns = (units: number): number => {
      const r = resolveTurn(withCaptured(units), { ...EMPTY, actions: [REVERSE('nlf-artillery')] })
      return r.state.house.researchHeadStart.artillery
    }
    expect(turns(4)).toBeGreaterThan(turns(1))
    expect(turns(9)).toBeGreaterThanOrEqual(turns(4))
    expect(turns(1000)).toBeLessThanOrEqual(B.headStartCap + 1e-9)
  })

  it('previewAction visar kostnaden och försprångets före → efter', () => {
    const state = withCaptured(4)
    const preview = previewAction(state, REVERSE('nlf-artillery'))
    expect(preview.cost).toBe(B.reverseEngineerCost)
    expect(preview.effect).toMatchObject({ label: 'R&D HEAD START (TURNS)', before: 0 })
    expect(preview.effect!.after).toBeCloseTo(Math.min(B.headStartCap, B.reverseEngineerBaseTurns * 2), 9)
  })

  it('försprånget förbrukas av ett pågående projekt i kategorin (samma bank som erfarenhet, P107)', () => {
    const state = withCaptured(9)
    let s = resolveTurn(state, { ...EMPTY, actions: [REVERSE('nlf-artillery')] }).state
    s.house.rnd = [{ id: 'r1', category: 'artillery', turnsRemaining: 5, turnsTotal: 6 }]
    s = resolveTurn(s, EMPTY).state
    expect(s.house.rnd.length === 0 || s.house.rnd[0]!.turnsRemaining <= 2).toBe(true)
  })
})

describe('sparade partier (P116)', () => {
  it('ett sparat parti utan capturedMateriel/studiedSystems kraschar inte', () => {
    const state = fresh()
    expect('capturedMateriel' in state.house).toBe(false)
    expect(() => resolveTurn(state, EMPTY)).not.toThrow()
  })
})
