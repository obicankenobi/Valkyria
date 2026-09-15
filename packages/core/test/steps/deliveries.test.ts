import { describe, expect, it } from 'vitest'
import { deliveries, PLAYER_ATTRIBUTION_KEY } from '../../src/resolve/steps/deliveries.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balanceData from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { Contract, GameState, RivalContract, Shipment, TurnSubmission, WireEvent } from '../../src/types.js'

const BALANCE = balanceData as unknown as {
  rivalDeliveryUnitsPerTurn: number
  reliabilityLatePenalty: number
  reliabilityLateEscalationPerTurn: number
  contractGracePeriodTurns: number
  voidedContractRelationPenalty: number
}

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

function activeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    price: 2000000,
    unitCostAtSigning: 11500,
    grade: 'A',
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    ...overrides,
  }
}

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return { id: 'shipment-test-0', contractId: 'contract-test-0', units: 20, arrivalTurn: 0, ...overrides }
}

describe('deliveries (isolerat steg, spec avsnitt 5 "Leverans")', () => {
  it('en skeppning som inte anlänt än rörs inte', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.market.contracts = [activeContract()]
    state.market.shipments = [shipment({ arrivalTurn: 5 })]
    state.meta.turn = 2

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(state.market.shipments).toHaveLength(1)
    expect(state.market.contracts[0]!.unitsDelivered).toBe(0)
  })

  it('en anländ skeppning ökar unitsDelivered och bokför betalning proportionellt i revenueByTurn', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 100, price: 2000000 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 3 })]
    state.meta.turn = 3
    const treasuryBefore = state.house.treasury

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(20)
    const expectedRevenue = Math.round(2000000 * (20 / 100))
    expect(state.house.treasury).toBe(treasuryBefore + expectedRevenue)
    expect(state.house.revenueByTurn[3]).toBe(expectedRevenue)
    expect(state.market.shipments).toHaveLength(0)
  })

  it('flera skeppningar till samma kontrakt samma tur summeras i revenueByTurn', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 100, price: 1000000 })
    state.market.contracts = [contract]
    state.market.shipments = [
      shipment({ id: 's1', units: 10, arrivalTurn: 2 }),
      shipment({ id: 's2', units: 15, arrivalTurn: 2 }),
    ]
    state.meta.turn = 2

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(25)
    const expected = Math.round(1000000 * (10 / 100)) + Math.round(1000000 * (15 / 100))
    expect(state.house.revenueByTurn[2]).toBe(expected)
  })

  it('kontraktet blir fulfilled när unitsDelivered når quantity', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ quantity: 20, unitsDelivered: 0 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 1 })]
    state.meta.turn = 1

    const { ctx, emitted } = makeCtx(state, 'del-seed')
    deliveries(ctx)

    expect(contract.status).toBe('fulfilled')
    expect(emitted.some((e) => e.headline.includes('FULFILLED'))).toBe(true)
  })

  it('ett kontrakt som passerar dueTurn utan att vara klart sätts late (engångsövergång) och reliability faller — sedan P27 eskalerar den vidare varje tur kontraktet FÖRBLIR late', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ dueTurn: 5, quantity: 100, unitsDelivered: 10 })
    state.market.contracts = [contract]
    state.meta.turn = 6 // > dueTurn
    const reliabilityBefore = state.house.reputation.reliability

    const { ctx: ctx1 } = makeCtx(state, 'del-seed')
    deliveries(ctx1)
    expect(contract.status).toBe('late')
    // Transitionsturen ger BÅDA straffen samma tur: engångsstraffet
    // (reliabilityLatePenalty) OCH den första eskaleringen (kontraktet HAR
    // redan status 'late' när eskaleringskontrollen körs, samma passage) —
    // matchar spec 3.1:s egen räkneexempel ("−17 innan voided" med tre
    // eskaleringar och ETT engångsstraff över exakt tre 'late'-turer).
    expect(state.house.reputation.reliability).toBe(
      reliabilityBefore - BALANCE.reliabilityLatePenalty - BALANCE.reliabilityLateEscalationPerTurn,
    )
    const afterFirst = state.house.reputation.reliability

    // P27 (avsnitt 3.1): kontraktet är fortfarande 'late' — reliability faller
    // VIDARE, med reliabilityLateEscalationPerTurn, inte "ingen ny smäll" som
    // innan P27.
    state.meta.turn = 7
    deliveries(makeCtx(state, 'del-seed-2').ctx)
    expect(contract.status).toBe('late') // ännu inte voided — innanför grace period
    expect(state.house.reputation.reliability).toBe(afterFirst - BALANCE.reliabilityLateEscalationPerTurn)
  })

  it('(P27 klart-når) ett kontrakt som passerar dueTurn + contractGracePeriodTurns blir voided, köparens relation faller, och ingen ytterligare betalning bokförs', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ dueTurn: 5, quantity: 100, unitsDelivered: 10, price: 1000000 })
    state.market.contracts = [contract]
    const buyer = state.factions['rvn']!
    const relationBefore = buyer.relationToPlayer
    const treasuryBefore = state.house.treasury

    // Kör fram till precis innan grace period passerat: dueTurn(5) + grace(3) = 8.
    for (let turn = 6; turn <= 8; turn++) {
      state.meta.turn = turn
      deliveries(makeCtx(state, `del-seed-${turn}`).ctx)
    }
    expect(contract.status).toBe('late') // turn 8: 8 > 8 är falskt — ännu inte voided

    state.meta.turn = 9 // 9 > 8 — nu voided
    const { ctx, emitted } = makeCtx(state, 'del-seed-void')
    deliveries(ctx)

    expect(contract.status).toBe('voided')
    expect(buyer.relationToPlayer).toBe(relationBefore - BALANCE.voidedContractRelationPenalty)
    expect(state.house.treasury).toBe(treasuryBefore) // ingen leverans skedde här — ingen betalning alls
    const voidEvent = emitted.find((e) => e.headline.includes('VOIDED'))
    expect(voidEvent).toBeDefined()
    expect(voidEvent!.causeId).toBe(contract.lateEventId)

    // Ett kontrakt som väl är voided rör sig aldrig igen, oavsett hur många
    // fler turer som spelas.
    state.meta.turn = 20
    deliveries(makeCtx(state, 'del-seed-after-void').ctx)
    expect(contract.status).toBe('voided')
    expect(buyer.relationToPlayer).toBe(relationBefore - BALANCE.voidedContractRelationPenalty) // ingen ny smäll

    // Starkaste beviset på "ingen ytterligare betalning bokförs": en skeppning
    // som redan var producerad och på väg innan kontraktet voidades anländer
    // ÄNDÅ inte till någon betalning — "redan producerade enheter är förlorade"
    // (spec 3.1, ordagrant).
    state.market.shipments = [{ id: 'ghost-shipment', contractId: contract.id, units: 20, arrivalTurn: 21 }]
    state.meta.turn = 21
    deliveries(makeCtx(state, 'del-seed-ghost').ctx)
    expect(state.house.treasury).toBe(treasuryBefore) // fortfarande orört
    expect(contract.unitsDelivered).toBe(10) // oförändrat — skeppningen konsumerades tyst, ingen effekt
  })

  it('en restricted-leverans anropar doomsdayGate med produktens doomsdayOnDelivery-intervall, kedjad via causeId till leveranshändelsen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ productId: 'mk9_longhand_shell', quantity: 8, price: 7200000 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 8, arrivalTurn: 4 })]
    state.meta.turn = 4
    const doomsdayBefore = state.doomsday

    const { ctx, emitted } = makeCtx(state, 'del-seed')
    deliveries(ctx)

    expect(state.doomsday).toBeGreaterThan(doomsdayBefore)
    expect(state.doomsday - doomsdayBefore).toBeGreaterThanOrEqual(14) // mk9_longhand_shell: [14,25]
    expect(state.doomsday - doomsdayBefore).toBeLessThanOrEqual(25)

    const deliveryIndex = emitted.findIndex((e) => e.headline.includes('DELIVERED'))
    const doomsdayEvent = emitted.find((e) => e.headline.includes('DOOMSDAY'))
    expect(deliveryIndex).toBeGreaterThanOrEqual(0)
    expect(doomsdayEvent).toBeDefined()
    // makeCtx:s emit-mock ger id:n som "test-${ordningsnummer}" — deliveryId är alltså
    // exakt "test-${deliveryIndex}", vilket är precis det doomsdayEvent.causeId ska
    // vara satt till (deliveries.ts skickar emit()-returvärdet vidare till addDoomsday).
    expect(doomsdayEvent!.causeId).toBe(`test-${deliveryIndex}`)
  })

  it('en icke-restricted leverans rör aldrig doomsday', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ productId: '105mm_field_gun' })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 2 })]
    state.meta.turn = 2
    const before = state.doomsday

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(state.doomsday).toBe(before)
  })

  it('rör inte ett voided eller redan fulfilled kontrakts skeppningar', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const contract = activeContract({ status: 'voided', unitsDelivered: 5 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 10, arrivalTurn: 1 })]
    state.meta.turn = 1

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(contract.unitsDelivered).toBe(5) // orört
    expect(state.market.shipments).toHaveLength(0) // skeppningen konsumeras ändå (inget mer att göra med den)
  })

  describe('materiel in på front + attribution (PIPELINE-kommentaren i spec 3.2, avsnitt 5)', () => {
    it('en leverans till en köpare som står på en front ökar front.equipment för rätt sida och kategori', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']! // sideA: rvn, sideB: nlf
      const contract = activeContract({ buyerId: 'rvn', productId: '105mm_field_gun' }) // artillery
      state.market.contracts = [contract]
      state.market.shipments = [shipment({ units: 20, arrivalTurn: 2 })]
      state.meta.turn = 2

      deliveries(makeCtx(state, 'del-seed').ctx)

      expect(front.equipment.a.artillery).toBe(20)
      expect(front.equipment.b.artillery).toBe(0) // andra sidan orörd
    })

    it('(P6 klart-när) attribution summerar till levererade enheter, under en reserverad nyckel för spelarens hus', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      const contract = activeContract({ buyerId: 'nlf', productId: '105mm_field_gun' })
      state.market.contracts = [contract]
      state.market.shipments = [
        shipment({ id: 's1', units: 15, arrivalTurn: 3 }),
        shipment({ id: 's2', units: 10, arrivalTurn: 3 }),
      ]
      state.meta.turn = 3

      deliveries(makeCtx(state, 'del-seed').ctx)

      expect(front.attribution[PLAYER_ATTRIBUTION_KEY]).toBe(25)
      expect(front.equipment.b.artillery).toBe(25)
    })

    it('attribution ackumuleras över flera turer, inte bara den senaste', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      const contract = activeContract({ buyerId: 'rvn', productId: '105mm_field_gun' })
      state.market.contracts = [contract]

      state.market.shipments = [shipment({ units: 10, arrivalTurn: 1 })]
      state.meta.turn = 1
      deliveries(makeCtx(state, 'del-seed-1').ctx)

      state.market.shipments = [shipment({ id: 's2', units: 7, arrivalTurn: 2 })]
      state.meta.turn = 2
      deliveries(makeCtx(state, 'del-seed-2').ctx)

      expect(front.attribution[PLAYER_ATTRIBUTION_KEY]).toBe(17)
    })

    it('en leverans till en köpare som INTE står på någon front rör ingen front', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const contract = activeContract({ buyerId: 'laos', productId: '105mm_field_gun' }) // laos står inte på front-1
      state.market.contracts = [contract]
      state.market.shipments = [shipment({ units: 20, arrivalTurn: 1 })]
      state.meta.turn = 1
      const frontBefore = JSON.parse(JSON.stringify(state.fronts['front-1']))

      deliveries(makeCtx(state, 'del-seed').ctx)

      expect(state.fronts['front-1']).toEqual(frontBefore)
    })

    it('olika produktkategorier hamnar i rätt fack i equipment', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      const contract = activeContract({ buyerId: 'rvn', productId: 'ch3_transport_helicopter' }) // aviation
      state.market.contracts = [contract]
      state.market.shipments = [shipment({ units: 5, arrivalTurn: 1 })]
      state.meta.turn = 1

      deliveries(makeCtx(state, 'del-seed').ctx)

      expect(front.equipment.a.aviation).toBe(5)
      expect(front.equipment.a.artillery).toBe(0)
    })
  })
})

describe('deliveries — rykte (ETAPP1_5_TEKNISK_SPEC.md avsnitt 5.1, 6.3)', () => {
  it('(P19 klart-när) en grade C-leverans kan utlösa en skandal som sänker quality, och effekten släpper efter tre turer', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 5
    state.house.reputation.quality = 50
    const contract = activeContract({ grade: 'C', quantity: 20, unitsDelivered: 0, status: 'active' })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 5 })]

    // scandal-seed-9: rng.chance(gradeScandalChance.C = 14) lyckas på FÖRSTA
    // draget — kontraktet är inte restricted, så inget doomsday-drag kommer före.
    const { ctx, emitted } = makeCtx(state, 'scandal-seed-9')
    deliveries(ctx)

    expect(state.house.reputation.quality).toBe(38) // 50 − qualityScandalPenalty(12)
    expect(state.house.scandalUntilTurn).toBe(8) // turn(5) + qualityScandalTurns(3)
    expect(emitted.some((e) => e.headline.includes('QUALITY SCANDAL'))).toBe(true)

    // Tre turer senare: skandalen släpper, quality återställs.
    for (let t = 6; t <= 8; t++) {
      state.meta.turn = t
      deliveries(makeCtx(state, `scandal-fade-${t}`).ctx)
    }

    expect(state.house.reputation.quality).toBe(50)
    expect(state.house.scandalUntilTurn).toBeNull()
  })

  it('grade A kan aldrig utlösa en skandal (gradeScandalChance.A = 0)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.reputation.quality = 50
    const contract = activeContract({ grade: 'A', quantity: 20, unitsDelivered: 0, status: 'active' })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 20, arrivalTurn: 0 })]

    // scandal-seed-9 lyckas för grade C (14 %) — men chance(0) kan aldrig lyckas,
    // oavsett rng-ström.
    const { ctx } = makeCtx(state, 'scandal-seed-9')
    deliveries(ctx)

    expect(state.house.reputation.quality).toBe(50)
    expect(state.house.scandalUntilTurn).toBeNull()
  })

  it('reliability stiger med reliabilityOnTimeBonus (3) när ett kontrakt fulfillas I TID, klampat till 100', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.reputation.reliability = 98
    const contract = activeContract({ grade: 'A', quantity: 10, unitsDelivered: 0, status: 'active', dueTurn: 5 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 10, arrivalTurn: 3 })]
    state.meta.turn = 3 // före dueTurn — i tid

    const { ctx, emitted } = makeCtx(state, 'no-scandal-seed')
    deliveries(ctx)

    expect(state.house.reputation.reliability).toBe(100) // 98 + 3, klampat
    expect(emitted.some((e) => e.headline.includes('RELIABILITY RISES'))).toBe(true)
  })

  it('reliability stiger INTE när kontraktet redan hunnit bli "late" innan det fulfillas', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.house.reputation.reliability = 50
    const contract = activeContract({ grade: 'A', quantity: 10, unitsDelivered: 0, status: 'late', dueTurn: 2 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ units: 10, arrivalTurn: 5 })]
    state.meta.turn = 5

    const { ctx, emitted } = makeCtx(state, 'no-scandal-seed')
    deliveries(ctx)

    expect(state.house.reputation.reliability).toBe(50) // oförändrad
    expect(emitted.some((e) => e.headline.includes('RELIABILITY RISES'))).toBe(false)
  })
})

// P25 (ETAPP2_TEKNISK_SPEC.md avsnitt 2.3) — rivalernas EGEN leverans-/
// attributionskedja, vid sidan av spelarens ovan. RivalContract, inte
// Contract/Shipment: en rival har ingen egen produktionslinje i den här etappen,
// bara ett flatt rivalDeliveryUnitsPerTurn rakt mot kontraktet.
function activeRivalContract(overrides: Partial<RivalContract> = {}): RivalContract {
  return {
    id: 'rival-contract-test-0',
    buyerId: 'rvn',
    productId: '105mm_field_gun',
    quantity: 100,
    unitsDelivered: 0,
    dueTurn: 10,
    status: 'active',
    lateEventId: null,
    ...overrides,
  }
}

describe('deliveries — rivalernas leverans/attribution (P25, avsnitt 2.3)', () => {
  it('en rival levererar upp till rivalDeliveryUnitsPerTurn mot sitt aktiva kontrakt varje tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.contracts = [activeRivalContract({ quantity: 1000 })]
    state.meta.turn = 0

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(rival.contracts[0]!.unitsDelivered).toBe(BALANCE.rivalDeliveryUnitsPerTurn)
  })

  it('en rivalleverans till en köpare som står på en front ökar equipment och attribution under rivalens EGET id, inte "player"', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']! // sideA: rvn
    const rival = state.rivals['brandt']!
    rival.contracts = [activeRivalContract({ buyerId: 'rvn', productId: '105mm_field_gun', quantity: 1000 })]
    state.meta.turn = 0

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(front.equipment.a.artillery).toBe(BALANCE.rivalDeliveryUnitsPerTurn)
    expect(front.attribution['brandt']).toBe(BALANCE.rivalDeliveryUnitsPerTurn)
    expect(front.attribution[PLAYER_ATTRIBUTION_KEY]).toBeUndefined()
  })

  it('ett rivalkontrakt blir fulfilled när unitsDelivered når quantity', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const quantity = Math.round(BALANCE.rivalDeliveryUnitsPerTurn / 2)
    rival.contracts = [activeRivalContract({ quantity })]
    state.meta.turn = 0

    const { ctx, emitted } = makeCtx(state, 'del-seed')
    deliveries(ctx)

    expect(rival.contracts[0]!.status).toBe('fulfilled')
    expect(rival.contracts[0]!.unitsDelivered).toBe(quantity) // aldrig mer än quantity, trots kvot kvar av rivalDeliveryUnitsPerTurn
    expect(emitted.some((e) => e.headline.includes('RIVAL CONTRACT') && e.headline.includes('FULFILLED'))).toBe(true)
  })

  it('(P25 klart-när) ett rivalkontrakt som passerar dueTurn utan att vara klart sätts late (engångsövergång) och rivalens reliability faller — sedan P27 eskalerar den vidare varje tur kontraktet FÖRBLIR late', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.contracts = [activeRivalContract({ dueTurn: 5, quantity: 100000, unitsDelivered: 10 })] // aldrig hinner fulfillas
    state.meta.turn = 6 // > dueTurn
    const reliabilityBefore = rival.reputation.reliability

    deliveries(makeCtx(state, 'del-seed').ctx)
    expect(rival.contracts[0]!.status).toBe('late')
    // Se motsvarande spelartest ovan — transitionsturen ger BÅDA straffen.
    expect(rival.reputation.reliability).toBe(
      reliabilityBefore - BALANCE.reliabilityLatePenalty - BALANCE.reliabilityLateEscalationPerTurn,
    )
    const afterFirst = rival.reputation.reliability

    // P27 (avsnitt 3.1): samma eskalering som för spelarens Contract, TILLÄMPAD
    // på en RivalContract — kontraktet är fortfarande 'late', reliability
    // faller vidare.
    state.meta.turn = 7
    deliveries(makeCtx(state, 'del-seed-2').ctx)
    expect(rival.contracts[0]!.status).toBe('late') // ännu inte voided
    expect(rival.reputation.reliability).toBe(afterFirst - BALANCE.reliabilityLateEscalationPerTurn)
  })

  it('(P27 klart-när) ett RivalContract som passerar dueTurn + contractGracePeriodTurns blir voided, rivalens relations[buyerId] faller, och ingen ytterligare leverans sker', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    const contract = activeRivalContract({ dueTurn: 5, quantity: 100000, unitsDelivered: 10 })
    rival.contracts = [contract]
    rival.relations['rvn'] = 40
    const relationBefore = rival.relations['rvn']!

    for (let turn = 6; turn <= 8; turn++) {
      state.meta.turn = turn
      deliveries(makeCtx(state, `del-seed-${turn}`).ctx)
    }
    expect(contract.status).toBe('late') // turn 8: 8 > 8 är falskt

    state.meta.turn = 9
    const { ctx, emitted } = makeCtx(state, 'del-seed-void')
    deliveries(ctx)

    expect(contract.status).toBe('voided')
    expect(rival.relations['rvn']).toBe(relationBefore - BALANCE.voidedContractRelationPenalty)
    const voidEvent = emitted.find((e) => e.headline.includes('VOIDED'))
    expect(voidEvent).toBeDefined()
    expect(voidEvent!.causeId).toBe(contract.lateEventId)

    // Inget mer levereras mot ett voided RivalContract.
    const unitsBefore = contract.unitsDelivered
    state.meta.turn = 20
    deliveries(makeCtx(state, 'del-seed-after-void').ctx)
    expect(contract.unitsDelivered).toBe(unitsBefore)
    expect(contract.status).toBe('voided')
  })

  it('leverans fortsätter mot ett redan "late" rivalkontrakt (bara statusövergången är en engångshändelse)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.contracts = [activeRivalContract({ status: 'late', quantity: 1000, unitsDelivered: 50 })]
    state.meta.turn = 0

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(rival.contracts[0]!.unitsDelivered).toBe(50 + BALANCE.rivalDeliveryUnitsPerTurn)
  })

  it('rör inte ett voided eller redan fulfilled rivalkontrakt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const rival = state.rivals['brandt']!
    rival.contracts = [activeRivalContract({ status: 'fulfilled', unitsDelivered: 100, quantity: 100 })]
    state.meta.turn = 0

    deliveries(makeCtx(state, 'del-seed').ctx)

    expect(rival.contracts[0]!.unitsDelivered).toBe(100) // orört
  })
})

describe('förbandsfördelning (P38, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1/5.2)', () => {
  it('(P38 klart-når) ett mechanised-förband får mer armour än ett infantry-förband av samma leverans', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.formations = [
      {
        id: 'test-infantry',
        name: 'Test Infantry',
        factionId: 'rvn',
        frontId: front.id,
        side: 'a',
        sectorId: 'test-sector',
        doctrine: 'infantry',
        strength: 50,
        strengthAtFull: 50,
        equipment: { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 },
        readiness: 100,
        status: 'active',
        engagedWith: null,
        turnsMauled: 0,
      },
      {
        id: 'test-mechanised',
        name: 'Test Mechanised',
        factionId: 'rvn',
        frontId: front.id,
        side: 'a',
        sectorId: 'test-sector',
        doctrine: 'mechanised',
        strength: 50,
        strengthAtFull: 50,
        equipment: { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 },
        readiness: 100,
        status: 'active',
        engagedWith: null,
        turnsMauled: 0,
      },
    ]

    const contract = activeContract({ id: 'contract-armour-0', buyerId: 'rvn', productId: 'm3_apc', quantity: 100 })
    state.market.contracts = [contract]
    state.market.shipments = [shipment({ contractId: 'contract-armour-0', units: 100, arrivalTurn: 0 })]
    state.meta.turn = 0

    deliveries(makeCtx(state, 'del-seed').ctx)

    const infantryArmour = front.formations.find((f) => f.id === 'test-infantry')!.equipment.armour
    const mechanisedArmour = front.formations.find((f) => f.id === 'test-mechanised')!.equipment.armour
    expect(mechanisedArmour).toBeGreaterThan(infantryArmour)
  })

  function invariantHolds(front: ReturnType<typeof createInitialState>['fronts'][string]): void {
    for (const side of ['a', 'b'] as const) {
      const sideFormations = front!.formations.filter((f) => f.side === side)
      const categories = Object.keys(front!.equipment[side]) as (keyof typeof front.equipment.a)[]
      for (const category of categories) {
        const summed = sideFormations.reduce((sum, f) => sum + f.equipment[category], 0)
        expect(summed).toBe(front!.equipment[side][category])
      }
    }
  }

  it('(P38 klart-när) invarianten i 5.1 håller efter 20 turers leveranser, alla kategorier, båda sidor', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    invariantHolds(front) // 0 = 0 vid start

    // En leverans per tur, växlande sida, produkt (inkl. aviation/naval — den
    // fallback som ANDRINGSLOGG.md dokumenterar, ingen doktrin ger dem vikt) och
    // kvantitet, i 20 turer.
    const productsByTurn: { buyerId: 'rvn' | 'nlf'; productId: string; units: number }[] = [
      { buyerId: 'rvn', productId: 'm1_rifle', units: 500 },
      { buyerId: 'nlf', productId: 'm1_rifle', units: 500 },
      { buyerId: 'rvn', productId: '105mm_field_gun', units: 37 },
      { buyerId: 'nlf', productId: 'm3_apc', units: 23 },
      { buyerId: 'rvn', productId: 'ch3_transport_helicopter', units: 5 },
      { buyerId: 'nlf', productId: 'coastal_patrol_boat', units: 3 },
      { buyerId: 'rvn', productId: 'tac_radio_suite', units: 41 },
      { buyerId: 'nlf', productId: '105mm_field_gun', units: 17 },
      { buyerId: 'rvn', productId: 'm3_apc', units: 29 },
      { buyerId: 'nlf', productId: 'tac_radio_suite', units: 13 },
    ]

    for (let turn = 0; turn < 20; turn++) {
      const spec = productsByTurn[turn % productsByTurn.length]!
      const contractId = `contract-inv-${turn}`
      state.market.contracts.push(
        activeContract({ id: contractId, buyerId: spec.buyerId, productId: spec.productId, quantity: spec.units }),
      )
      state.market.shipments.push(shipment({ contractId, units: spec.units, arrivalTurn: turn }))
      state.meta.turn = turn

      deliveries(makeCtx(state, `del-seed-inv-${turn}`).ctx)

      invariantHolds(front)
    }
  })
})
