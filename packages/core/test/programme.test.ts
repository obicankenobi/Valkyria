// programme.test.ts — P122 (ETAPP9_FORSLAG.md §8.1, beslut 9I och 9M, skyddsräcke 7). Utvecklingsupphandlingen: Programme, faserna,
// forskningsanslaget, hemstatens behörighet, tilldelning och delad order, evaluateTrial.
//
// Ett ministerium går ut med en anbudsinfordran i en kategori (utlöst av ett kravkort, en gap-chock eller en front som länge
// förlorat materiel). Faserna: announced → specLocked → development → trial → awarded. Husen anmäler sig utan handling (stående
// order); hemstaten avgör om huset får delta. Forskningsanslaget (kostnad plus eller fast pris) betalas under utvecklingen. Provet
// poängsätts av en egen funktion, `evaluateTrial`, som inte är computeScore (skyddsräcke 7). Vinnaren får ett vanligt Contract;
// ligger tvåan nära delas serien 70/30.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json'
import { designBenchmark } from '../src/design.js'
import {
  advanceProgrammes,
  evaluateTrial,
  maybeAnnounceProgramme,
  programmeEligible,
  programmeRequirements,
  validateProgrammeChange,
} from '../src/programme.js'
import { advanceRace } from '../src/race.js'
import { resolveTurn } from '../src/resolve/index.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { Design, GameState, Programme, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as {
  blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>
  programmeMaxPerGame: number
  programmeFirstTurn: number
  programmeLastAnnounceTurn: number
  programmeCooldownTurns: number
  programmeNeedTrigger: number
  programmeDevelopmentTurns: number
  programmeReliabilityFloor: number
  programmeUnitCostCeiling: number
  programmeGrantAmount: number
  programmeCostPlusMargin: number
  programmeSplitMargin: number
  programmeSplitSharePct: number
  programmeMandatoryWeight: number
  programmePrizeOrders: number
  needCeiling: number
}
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed = 'prog'): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
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

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'design-1',
    name: 'H&V M64 Field Gun',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    generation: 1,
    focus: 'robust',
    ambition: 'timely',
    performance: 62,
    reliability: 72,
    unitCostFactor: 0.9,
    trueQuality: 67,
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

// En konstruktion med givna mätvärden (sann kvalitet = nominellt medelvärde, så de sanna värdena blir exakt dessa).
function tuned(performance: number, reliability: number, unitCostFactor = 1): Design {
  return design({ performance, reliability, unitCostFactor, trueQuality: (performance + reliability) / 2 })
}

function programme(state: GameState, over: Partial<Programme> = {}): Programme {
  return {
    id: 'programme-1',
    buyerId: 'rvn',
    category: 'artillery',
    baseProductId: '105mm_field_gun',
    trigger: 'requirementCard',
    requirements: programmeRequirements(state, 'rvn', 'artillery'),
    testEnvironment: 'jungle',
    grant: { kind: 'fixedPrice', amount: B.programmeGrantAmount },
    prize: { quantity: 60, deliveryTurns: 5, unitPrice: 19_000, advancePct: 10 },
    phase: 'announced',
    phaseSinceTurn: 0,
    announcedTurn: 0,
    entrants: [],
    traces: [],
    ...over,
  }
}

function withProgramme(over: Partial<Programme> = {}, d: Design | null = design()): GameState {
  const state = createInitialState('indochina-slice', 'prog-seed')
  state.house.designs = d ? [d] : []
  state.house.treasury = 20_000_000
  state.programmes = [programme(state, over)]
  return state
}

describe('kravraderna och hemstaten (P122, §8.1)', () => {
  it('prestanda och tillförlitlighet är ska-krav, styckpris och leverans bör-krav; prestandakravet följer köparens blocks generation', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const rows = programmeRequirements(state, 'rvn', 'artillery')
    expect(rows.map((r) => `${r.kind}:${r.mandatory ? 'M' : 'S'}`)).toEqual(['performance:M', 'reliability:M', 'unitCost:S', 'delivery:S'])
    expect(rows[0]!.threshold).toBe(designBenchmark(1))
    expect(rows[1]!.threshold).toBe(B.programmeReliabilityFloor)
    expect(rows[2]!.threshold).toBe(B.programmeUnitCostCeiling)
    expect(rows[0]!.weight).toBe(B.programmeMandatoryWeight)
    state.race.generation.west.artillery = 3
    expect(programmeRequirements(state, 'rvn', 'artillery')[0]!.threshold).toBe(designBenchmark(3))
    expect(programmeRequirements(state, 'nlf', 'artillery')[0]!.threshold).toBe(designBenchmark(1)) // östs nivå
  })

  it('hemstaten avgör behörigheten (9I): ett västhus får inte delta i ett östministeriums upphandling och tvärtom; neutrala deltar överallt', () => {
    expect(programmeEligible('west', 'west')).toBe(true)
    expect(programmeEligible('west', 'east')).toBe(false)
    expect(programmeEligible('east', 'west')).toBe(false)
    expect(programmeEligible('east', 'east')).toBe(true)
    expect(programmeEligible('neutral', 'west')).toBe(true)
    expect(programmeEligible('neutral', 'east')).toBe(true)
    expect(programmeEligible('west', null)).toBe(true) // en neutral köpare släpper in alla
  })
})

describe('anbudsinfordran (P122, §8.1)', () => {
  it('ett kravkort utlöser en infordran från det blockets ministerium: rubrik, anslag, pris, rivaler som får delta anmäler sig', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = B.blocGenerationSchedule.artillery.east[0]! - 1 // kravkortet för öst/artilleri syns
    expect(state.meta.turn).toBeGreaterThanOrEqual(B.programmeFirstTurn)
    const { ctx, emitted } = makeCtx(state)
    const p = maybeAnnounceProgramme(ctx)!
    expect(p).not.toBeNull()
    expect(p).toMatchObject({ buyerId: 'nlf', category: 'artillery', trigger: 'requirementCard', phase: 'announced', announcedTurn: state.meta.turn })
    expect(state.programmes).toHaveLength(1)
    expect(p.prize.quantity).toBeGreaterThan(0)
    expect(p.prize.unitPrice).toBeGreaterThan(0)
    expect(p.requirements.length).toBe(4)
    // Östministeriet: östra och neutrala rivaler anmäler sig, den västra gör det inte.
    expect(p.entrants.map((e) => e.houseId).sort()).toEqual(['costigan', 'meridian'])
    const headline = emitted.find((e) => e.headline.includes('INVITES TENDERS'))!
    expect(headline.severity).toBe('headline')
    expect(headline.headline).toContain('ARTILLERY')
  })

  it('en gap-chock utlöser en infordran från det eftersläpande blockets ministerium', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = 6 // ingen kravkortsstart nära
    state.race.gap = { artillery: { leader: 'east', sinceTurn: 6 } }
    state.race.generation.east.artillery = 2
    const p = maybeAnnounceProgramme(makeCtx(state).ctx)!
    expect(p).toMatchObject({ category: 'artillery', trigger: 'gapShock' })
    expect(['rvn', 'laos']).toContain(p.buyerId) // väst släpar
  })

  it('en front som länge förlorat materiel utlöser en infordran (behovet över programmeNeedTrigger)', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = 6
    state.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    const p = maybeAnnounceProgramme(makeCtx(state).ctx)!
    expect(p).toMatchObject({ buyerId: 'rvn', category: 'armour', trigger: 'frontLoss' })
  })

  it('inget före programmeFirstTurn, inget efter programmeLastAnnounceTurn, högst programmeMaxPerGame, och en nedkylning mellan', () => {
    const early = createInitialState('indochina-slice', 'prog-seed')
    early.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    early.meta.turn = B.programmeFirstTurn - 1
    expect(maybeAnnounceProgramme(makeCtx(early).ctx)).toBeNull()
    const late = createInitialState('indochina-slice', 'prog-seed')
    late.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    late.meta.turn = B.programmeLastAnnounceTurn + 1
    expect(maybeAnnounceProgramme(makeCtx(late).ctx)).toBeNull()

    const state = createInitialState('indochina-slice', 'prog-seed')
    state.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    state.factions['rvn']!.materielNeed.infantry = B.programmeNeedTrigger
    state.meta.turn = B.programmeFirstTurn
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).not.toBeNull()
    state.meta.turn += B.programmeCooldownTurns - 1
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).toBeNull() // nedkylning
    state.meta.turn += 1
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).not.toBeNull()
    const capped = createInitialState('indochina-slice', 'prog-seed')
    capped.meta.turn = B.programmeLastAnnounceTurn
    capped.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    capped.programmes = Array.from({ length: B.programmeMaxPerGame }, (_, i) => programme(capped, { id: `programme-${i + 1}`, phase: 'awarded', announcedTurn: 0 }))
    expect(maybeAnnounceProgramme(makeCtx(capped).ctx)).toBeNull()
  })

  it('en kategori och ett block har högst en öppen infordran åt gången', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = 6
    state.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).not.toBeNull()
    state.meta.turn = 6 + B.programmeCooldownTurns
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).toBeNull() // samma block och kategori är redan öppen
  })

  it('kräver att köparen har råd med serien (annars ingen infordran)', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    state.meta.turn = 6
    state.factions['rvn']!.materielNeed.armour = B.programmeNeedTrigger
    state.factions['rvn']!.militaryBudget = 1
    expect(maybeAnnounceProgramme(makeCtx(state).ctx)).toBeNull()
  })
})

describe('att anmäla sig (stående order, ingen handling) (P122, §8.1)', () => {
  const ENTER = { kind: 'PROGRAMME', op: 'ENTER', programmeId: 'programme-1' } as const
  const SUBMIT = (designId = 'design-1') => ({ kind: 'PROGRAMME', op: 'SUBMIT', programmeId: 'programme-1', designId }) as const

  it('valideras: okänd infordran, fel fas, ej behörig hemstat, redan anmäld', () => {
    const state = withProgramme()
    expect(validateProgrammeChange(state, state, ENTER)).toEqual({ ok: true })
    expect(validateProgrammeChange(state, state, { ...ENTER, programmeId: 'nope' })).toEqual({ ok: false, reason: 'unknown programme' })
    const locked = withProgramme({ phase: 'specLocked' })
    expect(validateProgrammeChange(locked, locked, ENTER)).toEqual({ ok: false, reason: 'the programme is closed for entries' })
    const west = withProgramme({ buyerId: 'nlf' })
    west.house.homeState = 'west'
    expect(validateProgrammeChange(west, west, ENTER)).toEqual({ ok: false, reason: 'your home state bars you from this ministry' })
    const entered = withProgramme({ entrants: [{ houseId: 'player', enteredTurn: 0 }] })
    expect(validateProgrammeChange(entered, entered, ENTER)).toEqual({ ok: false, reason: 'already entered' })
  })

  it('en anmälan kostar ingen handling, emitterar en rad och lägger huset bland deltagarna', () => {
    const state = withProgramme()
    const actionPoints = state.house.actionPoints
    const result = resolveTurn(state, { ...EMPTY, standingOrders: [ENTER] })
    expect(result.rejected).toEqual([])
    const p = result.state.programmes![0]!
    expect(p.entrants.some((e) => e.houseId === 'player')).toBe(true)
    expect(result.wire.some((e) => e.actorIsPlayer && e.headline.includes('ENTERS'))).toBe(true)
    expect(result.state.house.actionPoints).toBe(actionPoints)
  })

  it('SUBMIT: en egen, aktiv konstruktion i kategorin (basprodukten passar), inte utfasad; WITHDRAW tar huset ur', () => {
    const entered = { entrants: [{ houseId: 'player' as const, enteredTurn: 0 }] }
    const state = withProgramme(entered)
    expect(validateProgrammeChange(state, state, SUBMIT())).toEqual({ ok: true })
    expect(validateProgrammeChange(state, state, SUBMIT('nope'))).toEqual({ ok: false, reason: 'unknown design' })
    const other = withProgramme(entered, design({ category: 'armour', baseProductId: 'm3_apc' }))
    expect(validateProgrammeChange(other, other, SUBMIT())).toEqual({ ok: false, reason: 'design does not fit this programme' })
    const withdrawn = withProgramme(entered, design({ status: 'withdrawn' }))
    expect(validateProgrammeChange(withdrawn, withdrawn, SUBMIT())).toEqual({ ok: false, reason: 'design is withdrawn' })
    const old = withProgramme(entered, design({ generation: 1 }))
    old.race.generation.west.artillery = 3
    expect(validateProgrammeChange(old, old, SUBMIT())).toEqual({ ok: false, reason: 'design phased out for this buyer' })
    const notIn = withProgramme()
    expect(validateProgrammeChange(notIn, notIn, SUBMIT())).toEqual({ ok: false, reason: 'not entered in this programme' })

    const result = resolveTurn(state, { ...EMPTY, standingOrders: [SUBMIT()] })
    expect(result.state.programmes![0]!.entrants.find((e) => e.houseId === 'player')!.designId).toBe('design-1')
    const out = resolveTurn(state, { ...EMPTY, standingOrders: [{ kind: 'PROGRAMME', op: 'WITHDRAW', programmeId: 'programme-1' }] })
    expect(out.state.programmes![0]!.entrants.some((e) => e.houseId === 'player')).toBe(false)
  })
})

describe('faserna och forskningsanslaget (P122, §8.1)', () => {
  it('announced → specLocked → development → trial, en fas i taget med en rad per övergång', () => {
    const state = withProgramme({ phaseSinceTurn: 0, announcedTurn: 0 })
    const seen: string[] = []
    for (let turn = 0; turn < 12; turn++) {
      state.meta.turn = turn
      const { ctx, emitted } = makeCtx(state)
      advanceProgrammes(ctx)
      const phase = state.programmes![0]!.phase
      if (seen[seen.length - 1] !== phase) seen.push(phase)
      if (phase === 'awarded' || phase === 'cancelled') break
      void emitted
    }
    expect(seen.slice(0, 5)).toEqual(['announced', 'specLocked', 'development', 'trial', seen[4]])
    expect(['awarded', 'cancelled']).toContain(seen[4])
  })

  it('fast pris: hela anslaget betalas när utvecklingen börjar (bara till den som anmält sig), bokfört som intäkt', () => {
    const state = withProgramme({ phase: 'specLocked', phaseSinceTurn: 0, entrants: [{ houseId: 'player', enteredTurn: 0 }] })
    state.meta.turn = 1
    const before = state.house.treasury
    const { ctx, emitted } = makeCtx(state)
    advanceProgrammes(ctx)
    expect(state.programmes![0]!.phase).toBe('development')
    expect(state.house.treasury - before).toBe(B.programmeGrantAmount)
    expect(emitted.some((e) => e.actorIsPlayer && e.headline.includes('GRANT'))).toBe(true)
    expect(state.ledger[state.ledger.length - 1]!.income.contracts).toBe(B.programmeGrantAmount)
    // Den som inte anmält sig får ingenting.
    const out = withProgramme({ phase: 'specLocked', phaseSinceTurn: 0 })
    out.meta.turn = 1
    const treasury = out.house.treasury
    advanceProgrammes(makeCtx(out).ctx)
    expect(out.house.treasury).toBe(treasury)
  })

  it('kostnad plus: varje utvecklingstur ersätts husets pågående designprojekt i kategorin med (1 + marginal), överskridande över taket ger en granskning', () => {
    const state = withProgramme({
      phase: 'development',
      phaseSinceTurn: 0,
      grant: { kind: 'costPlus', amount: 100_000 },
      entrants: [{ houseId: 'player', enteredTurn: 0 }],
    })
    state.house.rnd = [
      { id: 'rnd-design-artillery-0', category: 'artillery', turnsRemaining: 5, turnsTotal: 6, costFactor: 1, design: { focus: 'robust', ambition: 'timely', targetGeneration: 1, upgradeOf: null } },
    ]
    state.meta.turn = 1
    const before = state.house.treasury
    const { ctx, emitted } = makeCtx(state)
    advanceProgrammes(ctx)
    const paid = state.house.treasury - before
    expect(paid).toBeGreaterThan(0)
    expect(emitted.some((e) => e.headline.includes('REIMBURSE'))).toBe(true)
    // Utan ett pågående projekt ersätts ingenting.
    const idle = withProgramme({ phase: 'development', phaseSinceTurn: 0, grant: { kind: 'costPlus', amount: 100_000 }, entrants: [{ houseId: 'player', enteredTurn: 0 }] })
    idle.meta.turn = 1
    const treasury = idle.house.treasury
    advanceProgrammes(makeCtx(idle).ctx)
    expect(idle.house.treasury).toBe(treasury)
    // Taket (anslaget × programmeCostPlusCapFactor) ger en granskning med relationsstraff, en gång.
    const hearing = withProgramme({ phase: 'development', phaseSinceTurn: 0, grant: { kind: 'costPlus', amount: 10 }, entrants: [{ houseId: 'player', enteredTurn: 0 }] })
    hearing.house.rnd = state.house.rnd
    hearing.meta.turn = 1
    const relation = hearing.officials['official-rvn-procurement']!.relationToPlayer
    const h = makeCtx(hearing)
    advanceProgrammes(h.ctx)
    expect(hearing.officials['official-rvn-procurement']!.relationToPlayer).toBeLessThan(relation)
    expect(h.emitted.some((e) => e.headline.includes('HEARING') || e.headline.includes('OVERRUN'))).toBe(true)
  })
})

describe('evaluateTrial (P122, §8.1, skyddsräcke 7)', () => {
  const rows = (state: GameState) => programmeRequirements(state, 'rvn', 'artillery')
  const base = { houseId: 'player', performance: 70, reliability: 70, unitCostFactor: 1, deliveryTurns: 3 }
  const inputs = (relation: Record<string, number> = {}, reputation: Record<string, number> = {}, neutral: Record<string, boolean> = {}) => ({ relation, reputation, neutral })

  it('den som underkänns på ett ska-krav diskvalificeras, med orsak', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const p = programme(state)
    const scores = evaluateTrial(
      p,
      [base, { ...base, houseId: 'brandt', reliability: B.programmeReliabilityFloor - 1 }, { ...base, houseId: 'meridian', performance: designBenchmark(1) - 1 }],
      inputs(),
    )
    expect(scores.find((s) => s.houseId === 'player')!.disqualified).toBeNull()
    expect(scores.find((s) => s.houseId === 'brandt')!.disqualified).toContain('RELIABILITY')
    expect(scores.find((s) => s.houseId === 'meridian')!.disqualified).toContain('PERFORMANCE')
    expect(rows(state).length).toBe(4)
  })

  it('en saknad prototyp diskvalificerar', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const scores = evaluateTrial(programme(state), [{ ...base, prototypeMissing: true }], inputs())
    expect(scores[0]!.disqualified).toBe('NO PROTOTYPE SUBMITTED')
  })

  it('poängen väger marginal mot kravet, pris, relation och rykte — och en bättre mätning ger högre poäng', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const [a, b] = evaluateTrial(programme(state), [base, { ...base, houseId: 'brandt', performance: 80 }], inputs({ player: 50, brandt: 50 }, { player: 50, brandt: 50 }))
    expect(b!.score).toBeGreaterThan(a!.score)
    const [cheap, dear] = evaluateTrial(programme(state), [{ ...base, unitCostFactor: 0.8 }, { ...base, houseId: 'brandt', unitCostFactor: 1.1 }], inputs())
    expect(cheap!.score).toBeGreaterThan(dear!.score)
    const [warm, cold] = evaluateTrial(programme(state), [base, { ...base, houseId: 'brandt' }], inputs({ player: 90, brandt: 10 }))
    expect(warm!.score).toBeGreaterThan(cold!.score)
    const [renowned, obscure] = evaluateTrial(programme(state), [base, { ...base, houseId: 'brandt' }], inputs({}, { player: 90, brandt: 10 }))
    expect(renowned!.score).toBeGreaterThan(obscure!.score)
  })

  it('neutrala hus väger relationen lägre (9I)', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const [bloc] = evaluateTrial(programme(state), [base], inputs({ player: 90 }, {}, {}))
    const [neutral] = evaluateTrial(programme(state), [base], inputs({ player: 90 }, {}, { player: true }))
    expect(neutral!.score).toBeLessThan(bloc!.score)
  })

  it('protokollet har en rad per kravrad med uppmätt värde och godkänt/underkänt', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const [score] = evaluateTrial(programme(state), [{ ...base, performance: designBenchmark(1) - 5 }], inputs())
    expect(score!.rows.map((r) => r.kind)).toEqual(['performance', 'reliability', 'unitCost', 'delivery'])
    expect(score!.rows[0]).toMatchObject({ measured: designBenchmark(1) - 5, pass: false, mandatory: true })
    expect(score!.rows[1]).toMatchObject({ measured: 70, pass: true })
  })
})

describe('tilldelning och delad order (P122, §8.1)', () => {
  // En färdig infordran i provfasen med huset (robust konstruktion) och en rival anmälda.
  function trialState(houseDesign: Design | null = design(), over: Partial<Programme> = {}): GameState {
    const state = withProgramme(
      {
        phase: 'trial',
        phaseSinceTurn: 4,
        entrants: [
          { houseId: 'player', enteredTurn: 0, ...(houseDesign ? { designId: houseDesign.id } : {}) },
          { houseId: 'brandt', enteredTurn: 0 },
        ],
        ...over,
      },
      houseDesign,
    )
    state.meta.turn = 5
    return state
  }

  it('vinnaren får ett vanligt Contract med serien, förskott enligt etapp 8 betalas, köparens budget och behov dras och en rubrik namnger vinnaren', () => {
    const state = trialState(tuned(90, 90, 0.7))
    state.factions['rvn']!.materielNeed.artillery = 100
    const budget = state.factions['rvn']!.militaryBudget
    const treasury = state.house.treasury
    const { ctx, emitted } = makeCtx(state)
    advanceProgrammes(ctx)
    const p = state.programmes![0]!
    expect(p.phase).toBe('awarded')
    expect(p.result?.winner).toBe('player')
    const contract = state.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!
    expect(contract).toMatchObject({ buyerId: 'rvn', productId: '105mm_field_gun', designId: 'design-1', status: 'active' })
    expect(contract.quantity).toBe(p.prize.quantity)
    expect(contract.price).toBe(p.prize.quantity * p.prize.unitPrice)
    expect(contract.advancePaid).toBeGreaterThan(0)
    expect(state.house.treasury - treasury).toBe(contract.advancePaid)
    expect(state.factions['rvn']!.militaryBudget).toBe(budget - contract.price)
    expect(state.factions['rvn']!.materielNeed.artillery).toBe(Math.max(0, 100 - p.prize.quantity))
    expect(emitted.some((e) => e.severity === 'headline' && e.headline.includes('AWARDS') && e.headline.includes(state.house.name.toUpperCase()))).toBe(true)
  })

  it('en rival som vinner får ett RivalContract och kapital', () => {
    const state = trialState(tuned(40, 60)) // under prestandakravet: diskvalificerad
    const { ctx } = makeCtx(state)
    const capital = state.rivals['brandt']!.capital
    advanceProgrammes(ctx)
    const p = state.programmes![0]!
    expect(p.result?.winner).toBe('brandt')
    expect(state.market.contracts.some((c) => c.id.startsWith('contract-programme-1'))).toBe(false)
    expect(state.rivals['brandt']!.contracts.some((c) => c.id.startsWith('rival-contract-programme-1'))).toBe(true)
    expect(state.rivals['brandt']!.capital).toBeGreaterThan(capital)
  })

  it('ligger tvåan nära delas serien programmeSplitSharePct/resten (båda får ett kontrakt), annars tar vinnaren allt', () => {
    // Brandt mäts på riktmärket + edge + specialistbonus (58/58, styckpris 1). Samma mått, lika relation och rykte → lika poäng.
    const state = trialState(tuned(58, 58, 1))
    state.officials['official-rvn-procurement']!.relationToPlayer = 0
    state.rivals['brandt']!.relations['rvn'] = 0
    state.rivals['brandt']!.reputation = { quality: 0, reliability: 0 }
    state.house.reputation = { ...state.house.reputation, quality: 0, reliability: 0 }
    state.house.categoryQuality.artillery = 0
    advanceProgrammes(makeCtx(state).ctx)
    const p = state.programmes![0]!
    expect(p.result?.split).toBeDefined()
    expect(p.result!.split!.sharePct).toBe(100 - B.programmeSplitSharePct)
    const playerShare = state.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!
    const rivalShare = state.rivals['brandt']!.contracts.find((c) => c.id.startsWith('rival-contract-programme-1'))!
    expect(playerShare.quantity + rivalShare.quantity).toBe(p.prize.quantity)
    expect(Math.max(playerShare.quantity, rivalShare.quantity)).toBe(Math.round((p.prize.quantity * B.programmeSplitSharePct) / 100))
    // En klar vinnare delar inte.
    const clear = trialState(tuned(95, 95, 0.6))
    advanceProgrammes(makeCtx(clear).ctx)
    expect(clear.programmes![0]!.result?.split).toBeUndefined()
    expect(clear.market.contracts.find((c) => c.id.startsWith('contract-programme-1'))!.quantity).toBe(clear.programmes![0]!.prize.quantity)
  })

  it('delas serien är splitgränsen programmeSplitMargin: en synlig närhet ger exakt 70/30 (rent test av gränsen)', () => {
    const state = createInitialState('indochina-slice', 'prog-seed')
    const p = programme(state, { entrants: [{ houseId: 'player', enteredTurn: 0 }, { houseId: 'brandt', enteredTurn: 0 }] })
    const same = { houseId: 'player', performance: 70, reliability: 70, unitCostFactor: 1, deliveryTurns: 3 }
    const scores = evaluateTrial(p, [same, { ...same, houseId: 'brandt' }], { relation: {}, reputation: {}, neutral: {} })
    expect(Math.abs(scores[0]!.score - scores[1]!.score)).toBeLessThanOrEqual(B.programmeSplitMargin)
  })

  it('ingen godkänd deltagare → infordran återkallas utan tilldelning, med en rubrik', () => {
    const state = trialState(tuned(10, 10))
    state.programmes![0]!.entrants = [{ houseId: 'player', enteredTurn: 0, designId: 'design-1' }]
    const { ctx, emitted } = makeCtx(state)
    advanceProgrammes(ctx)
    expect(state.programmes![0]!.phase).toBe('cancelled')
    expect(emitted.some((e) => e.headline.includes('NO ENTRANT') || e.headline.includes('WITHDRAWN'))).toBe(true)
    expect(state.market.contracts.some((c) => c.id.startsWith('contract-programme-1'))).toBe(false)
  })

  it('en anmäld utan inlämnad konstruktion diskvalificeras (ingen prototyp)', () => {
    const state = trialState(null)
    advanceProgrammes(makeCtx(state).ctx)
    const p = state.programmes![0]!
    expect(p.result?.scores.find((s) => s.houseId === 'player')!.disqualified).toBe('NO PROTOTYPE SUBMITTED')
    expect(p.result?.winner).toBe('brandt')
  })
})

describe('hela kedjan genom resolveTurn (P122)', () => {
  it('en infordran utlöst av kravkortet vid tur 3 går genom alla faser och slutar tilldelad eller återkallad, utan att kasta', () => {
    let state = createInitialState('indochina-slice', 'chain-seed')
    state.meta.turn = 3
    state.factions['nlf']!.militaryBudget = 10_000_000
    let announced = false
    for (let i = 0; i < 12; i++) {
      state = resolveTurn(state, EMPTY).state
      if (state.programmes && state.programmes.length > 0) announced = true
    }
    expect(announced).toBe(true)
    expect(state.programmes!.length).toBeLessThanOrEqual(B.programmeMaxPerGame)
    expect(state.programmes!.some((p) => p.phase === 'awarded' || p.phase === 'cancelled')).toBe(true)
  })

  it('advanceRace och programmeslutet delar inte state: en ren partistart har inga infordringar', () => {
    const state = createInitialState('indochina-slice', 'chain-seed')
    expect(state.programmes).toBeUndefined()
    advanceRace(makeCtx(state).ctx)
    expect(state.programmes).toBeUndefined()
  })
})
