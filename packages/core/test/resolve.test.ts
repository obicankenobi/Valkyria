import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import type { GameState, TurnSubmission } from '../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

// TAKE_LOAN processas på riktigt sedan P8 (applyActions.ts, se ANDRINGSLOGG.md) —
// det här testet fortsätter ändå vara sant: en förstatursfaktura på 5 000 000 mot en
// creditLimit som alltid är 0 för ett hus utan intäktshistorik (economy.test.ts)
// avvisas varje gång med "credit limit exceeded", så låneförsöket hjälper aldrig ett
// hus utan intäkter, precis som P3:s klart-när-villkor krävde ("även när boten
// försöker låna varje tur").
const SUBMISSION_WITH_LOAN_ATTEMPT: TurnSubmission = {
  standingOrders: [],
  bids: [],
  actions: [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: 5000000 } }],
}

describe('resolveTurn — P2: pipeline och wire', () => {
  it('20 turer kan köras utan handlingar utan att kasta', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    expect(() => {
      for (let i = 0; i < 20; i++) {
        state = resolveTurn(state, EMPTY_SUBMISSION).state
      }
    }).not.toThrow()
  })

  it('turräknaren och datumet stämmer efter 20 turer', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    const startYear = state.meta.year
    const startQuarter = state.meta.quarter

    for (let i = 0; i < 20; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.meta.turn).toBe(20)
    // 20 kvartal = 5 hela år framåt, tillbaka på samma kvartal.
    expect(state.meta.year).toBe(startYear + 5)
    expect(state.meta.quarter).toBe(startQuarter)
  })

  it('kvartalet rullar över och året ökar vid varje fjärde tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    expect(state.meta.quarter).toBe(1)

    const seen: { turn: number; year: number; quarter: number }[] = []
    for (let i = 0; i < 8; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      seen.push({ turn: state.meta.turn, year: state.meta.year, quarter: state.meta.quarter })
    }

    expect(seen.map((s) => s.quarter)).toEqual([2, 3, 4, 1, 2, 3, 4, 1])
    expect(seen[3]!.year).toBe(state.meta.year - 1) // året höjs mellan tur 4 (Q4) och tur 5 (Q1)
    expect(seen[7]!.year).toBe(seen[3]!.year + 1)
  })

  it('rngCursor ökar för varje tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    const cursors: number[] = [state.meta.rngCursor]

    for (let i = 0; i < 5; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      cursors.push(state.meta.rngCursor)
    }

    for (let i = 1; i < cursors.length; i++) {
      expect(cursors[i]!).toBeGreaterThan(cursors[i - 1]!)
    }
  })

  it('är rent: muterar aldrig indata-state', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    const before = JSON.parse(JSON.stringify(state))

    resolveTurn(state, EMPTY_SUBMISSION)

    expect(state).toEqual(before)
  })

  it('är deterministiskt: samma state + samma submission ger bitvis identiskt resultat', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    const resultA = resolveTurn(state, EMPTY_SUBMISSION)
    const resultB = resolveTurn(state, EMPTY_SUBMISSION)

    expect(resultB.state).toEqual(resultA.state)
    expect(resultB.wire).toEqual(resultA.wire)
    expect(resultB.rejected).toEqual(resultA.rejected)
  })

  it('rejected-hanteringen är trådad: result.rejected finns och är tom (inget steg avvisar något i P2 än)', () => {
    let state: GameState = createInitialState('indochina-slice', 'p2-seed')
    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      expect(result.rejected).toEqual([])
      state = result.state
    }
  })

  it('kastar aldrig i normal drift, även med tomma listor i submission', () => {
    const state = createInitialState('indochina-slice', 'p2-seed')
    expect(() => resolveTurn(state, { standingOrders: [], bids: [], actions: [] })).not.toThrow()
  })

  it('result.wire innehåller bara den här turens händelser, inte tidigare turers', () => {
    // Från och med P3 emittar economy.ts på riktigt varje tur (fasta kostnader,
    // eventuell ränta), så wire är inte längre tomt. Det som faktiskt ska hålla är
    // att result.wire bara innehåller DENNA turs händelser (turn === den tur som
    // löstes), inte ackumulerad historik från tidigare turer.
    const state = createInitialState('indochina-slice', 'p2-seed')
    const result = resolveTurn(state, EMPTY_SUBMISSION)

    expect(result.wire.length).toBeGreaterThan(0)
    for (const event of result.wire) {
      expect(event.turn).toBe(state.meta.turn)
    }

    const secondResult = resolveTurn(result.state, EMPTY_SUBMISSION)
    expect(secondResult.wire.length).toBeGreaterThan(0)
    for (const event of secondResult.wire) {
      expect(event.turn).toBe(result.state.meta.turn)
    }
  })
})

describe('resolveTurn — P3: ekonomi och slut', () => {
  it('ett hus utan intäkter förlorar på en förutsägbar tur, även när boten försöker låna varje tur', () => {
    // indochina-slice: founding capital 4 000 000, fasta kostnader 255 000/tur
    // (P10-balanspass, se ANDRINGSLOGG.md — ursprungligen 510 000). Ingen leverans
    // sker (inga bud skickas), så det finns aldrig någon intäkt att låna mot —
    // creditLimit blir därför alltid 0 (bevisat separat i economy.test.ts), vilket
    // är VARFÖR lånförsöket inte hjälper, inte bara för att TAKE_LOAN råkar sakna
    // effekt.
    //
    // P10-rättelse: med de sänkta fasta kostnaderna hinner huset INTE gå insolvent
    // (3 negativa turer i rad) förrän långt senare — men board.ts (byggd i P8, fanns
    // inte när det här testet skrevs i P3) underkänner BÅDA sina granskningar
    // (tur 8 och 14) för ett hus med progressSnapshot === 0 hela vägen, vilket ger
    // BUYOUT redan vid tur 14 — innan treasury ens hunnit bli negativt. Samma
    // underliggande sanning som testets ursprungliga namn ("ett hus utan intäkter
    // förlorar") gäller alltså fortfarande, bara med en annan, mer specifik
    // slutkod, eftersom hela pipelinen (inte bara economy.ts) nu är på plats.
    let state: GameState = createInitialState('indochina-slice', 'insolvency-seed')
    expect(state.house.treasury).toBe(4000000)

    let callsUntilEnded = 0
    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, SUBMISSION_WITH_LOAN_ATTEMPT)
      state = result.state
      callsUntilEnded++
      if (state.status.kind === 'ended') break
    }

    expect(callsUntilEnded).toBe(15)
    expect(state.status).toEqual({ kind: 'ended', ending: 'BUYOUT', turn: 14 })
    expect(state.house.boardTarget.reviewsFailed).toBe(2)
    expect(state.house.creditLimit).toBe(0)
  })

  it('endings.ts kör efter economy.ts i samma tur: INSOLVENCY syns direkt den tur insolventTurns når tröskeln, utan en extra resolveTurn-omgång', () => {
    // Isolerat konstruerad, i stället för att spela fram det via en full 20-
    // turerskörning (P10, se ovanstående test): ett revenue-löst parti träffar
    // numera BUYOUT via board.ts långt innan insolventTurns hinner nå 3, så den
    // vägen dit finns inte längre i den fulla pipelinen. Testets EGNA syfte —
    // att endings.ts avgör partiet i SAMMA pipelinepassage som economy.ts för den
    // tröskeln, utan en extra resolveTurn-omgång — prövas ändå exakt, bara utan
    // att först spela fram dit.
    const state: GameState = createInitialState('indochina-slice', 'insolvency-seed-2')
    state.house.treasury = -1
    state.house.insolventTurns = 2
    state.meta.turn = 5 // godtycklig, inte en granskningstur (8/14) — board.ts ska inte kunna störa

    const result = resolveTurn(state, EMPTY_SUBMISSION)
    expect(result.state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: 5 })
    expect(result.state.house.insolventTurns).toBe(3)
  })
})

describe('resolveTurn — P5: produktion, kostnad och leverans', () => {
  it('(P5 klart-när) ett scriptat parti tar ett kontrakt, producerar, levererar och får betalt — hela kedjan går att läsa i wire', () => {
    let state: GameState = createInitialState('indochina-slice', 'p5-happy-path-seed')
    // Ackumulera varje turs händelser separat — wire.ts:s rullande 8-turersfönster
    // (state.wire) garanterar INTE att tidiga händelser (WINS CONTRACT) fortfarande
    // finns kvar när ett långt scriptat parti väl är klart, så "hela kedjan går att
    // läsa i wire" verifieras mot vad som faktiskt EMITTERADES turn för turn, inte
    // mot den beskurna slutsnapshoten.
    const allWireEvents: WireEvent[] = []

    // Spela tills en order dyker upp.
    let order = undefined as GameState['market']['openOrders'][number] | undefined
    for (let i = 0; i < 10 && !order; i++) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      allWireEvents.push(...result.wire)
      state = result.state
      order = state.market.openOrders[0]
    }
    expect(order).toBeDefined()

    // Lägg ett bud som bör vinna: gott om marginal under trueBudget.
    const bidPrice = Math.round(order!.trueBudget * 0.75)
    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order!.id, price: bidPrice, deliveryTurns: order!.requiredDeliveryTurns, grade: 'A', bribe: 0 }],
      actions: [],
    }
    const winResult = resolveTurn(state, submission)
    allWireEvents.push(...winResult.wire)
    state = winResult.state
    expect(state.market.contracts).toHaveLength(1)
    const contractId = state.market.contracts[0]!.id

    // Spela tills kontraktet är fulfilled (eller ge upp — då har testet ett verkligt
    // fel att visa, inte en timeout).
    let turns = 0
    while (state.market.contracts.find((c) => c.id === contractId)?.status !== 'fulfilled' && turns < 20) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      allWireEvents.push(...result.wire)
      state = result.state
      turns++
    }
    const finalContract = state.market.contracts.find((c) => c.id === contractId)!
    expect(finalContract.status).toBe('fulfilled')
    expect(finalContract.unitsDelivered).toBe(finalContract.quantity)

    // Betalt: revenueByTurn summerar till minst kontraktets fulla pris minus en
    // försumbar avrundningsdifferens (spec 5: "proportionellt mot levererad andel").
    const totalRevenue = state.house.revenueByTurn.reduce((sum: number, r) => sum + (r ?? 0), 0)
    expect(totalRevenue).toBeGreaterThanOrEqual(finalContract.price - 5)

    // Hela kedjan — vunnet, producerat, levererat, fullgjort — går att läsa i wire.
    expect(allWireEvents.some((e) => e.headline.includes('WINS CONTRACT'))).toBe(true)
    expect(allWireEvents.some((e) => e.headline.includes('PRODUCES') && e.headline.includes(contractId))).toBe(true)
    expect(allWireEvents.some((e) => e.headline.includes('DELIVERED'))).toBe(true)
    expect(allWireEvents.some((e) => e.headline.includes('FULFILLED') && e.headline.includes(contractId))).toBe(true)
  })
})

describe('resolveTurn — P6: front och attribution', () => {
  it('(P6 klart-när) en front utan leveranser stagnerar över 15 turer: position, styrka, moral, förluster helt orörda', () => {
    let state: GameState = createInitialState('indochina-slice', 'p6-stagnation-seed')
    const before = JSON.parse(JSON.stringify(state.fronts['front-1']))

    for (let i = 0; i < 15; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.fronts['front-1']).toEqual(before)
  })

  it('(P6 klart-när) en front dit spelaren levererar artilleri flyttar position i rätt riktning, och attribution summerar till levererade enheter', () => {
    // rvn = sideA (position ska röra sig mot -100 när rvn får materiel).
    let state: GameState = createInitialState('indochina-slice', 'p6-direction-seed')
    const positionBefore = state.fronts['front-1']!.position

    let order = undefined as GameState['market']['openOrders'][number] | undefined
    for (let i = 0; i < 15 && !order; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')
    }
    expect(order).toBeDefined()

    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order!.id, price: Math.round(order!.trueBudget * 0.75), deliveryTurns: order!.requiredDeliveryTurns, grade: 'A', bribe: 0 }],
      actions: [],
    }
    state = resolveTurn(state, submission).state
    const contract = state.market.contracts.find((c) => c.buyerId === 'rvn')!
    const deliveredQuantity = contract.quantity

    let turns = 0
    while (state.market.contracts.find((c) => c.id === contract.id)?.status !== 'fulfilled' && turns < 15) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      turns++
    }
    expect(state.market.contracts.find((c) => c.id === contract.id)?.status).toBe('fulfilled')

    expect(state.fronts['front-1']!.position).toBeLessThan(positionBefore) // mot -100, rvn:s sida
    expect(state.fronts['front-1']!.attribution['player']).toBe(deliveredQuantity)
    expect(state.fronts['front-1']!.equipment.a.artillery).toBe(deliveredQuantity)
  })
})

describe('resolveTurn — P8: rivaler och styrelse', () => {
  // "Ett passivt parti" (P8:s klart-när-villkor) kan INTE betyda EMPTY_SUBMISSION —
  // P3:s test ovan bevisar redan att det scenariot alltid slutar i INSOLVENCY vid tur
  // 9 (fasta kostnader ensamma, 510 000/tur, dränerar snabbare än startkapitalet
  // räcker). "Passivt" tolkas här som en bot som gör minsta möjliga ANSTRÄNGNING —
  // budgivning kostar inga handlingspoäng (spec 3.1) och är den enda vägen till
  // intäkt över huvud taget — men uttryckligen INTE FÖRSÖKER VÄXA: den slutar lägga
  // nya bud så fort kumulativ intäkt/foundingCapital (progressSnapshot) når
  // GROWTH_CAP, långt under styrelsens tröskel (2 — "Doubling"), och lånar upp till
  // creditLimit varje tur för att hålla sig flytande. Se ANDRINGSLOGG.md för den
  // fulla utredningen: utan TAKE_LOAN (byggd i P8 specifikt för att göra det här
  // scenariot möjligt, se applyActions.ts) gick alla 20 testade seeds i INSOLVENCY
  // istället — fasta kostnader ensamma slår ut varje passiv strategi utan lån.
  const GROWTH_CAP = 0.4

  function passiveButNotZeroSubmission(state: GameState): TurnSubmission {
    const stopGrowing = state.house.boardTarget.progressSnapshot >= GROWTH_CAP

    const bids = stopGrowing
      ? []
      : state.market.openOrders.map((order) => ({
          orderId: order.id,
          price: Math.round(order.referencePrice * 1.05),
          deliveryTurns: order.requiredDeliveryTurns,
          grade: 'A' as const,
          bribe: 0,
        }))

    const actions: TurnSubmission['actions'] =
      state.house.creditLimit > 0
        ? [{ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: state.house.creditLimit } }]
        : []

    return { standingOrders: [], bids, actions }
  }

  it(
    '(P8 klart-när, siffra reviderad — se ANDRINGSLOGG.md) ett passivt-men-inte-tomt parti förlorar på ' +
      'BUYOUT i minst 6 av 20 seeds inom 20 turer, och minst hälften av dem före tur 20',
    () => {
      const outcomes: { ending: string | null; turn: number }[] = []

      for (let i = 0; i < 20; i++) {
        let state: GameState = createInitialState('indochina-slice', `calib-seed-${i}`)
        // Scenariots dueTurn/turnCount är 20 (0-indexerat) — endings.ts:s strikta
        // dueTurn-kontroll kräver att draft.meta.turn FAKTISKT når 20 vid stegets
        // start, vilket kräver 21 resolveTurn-anrop (tur 0..20), inte 20.
        for (let t = 0; t <= 20; t++) {
          const result = resolveTurn(state, passiveButNotZeroSubmission(state))
          state = result.state
          if (state.status.kind === 'ended') break
        }
        outcomes.push({
          ending: state.status.kind === 'ended' ? state.status.ending : null,
          turn: state.status.kind === 'ended' ? state.status.turn : state.meta.turn,
        })
      }

      const buyouts = outcomes.filter((o) => o.ending === 'BUYOUT')
      const buyoutsBeforeTurn20 = buyouts.filter((o) => o.turn < 20)

      expect(buyouts.length).toBeGreaterThanOrEqual(6)
      expect(buyoutsBeforeTurn20.length).toBeGreaterThanOrEqual(Math.ceil(buyouts.length / 2))
    },
  )

  it('rivalhusen växer i kapital och marknadsandel när partiet är helt passivt (EMPTY_SUBMISSION), tur efter tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p8-rival-growth-seed')
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital

    for (let t = 0; t < 5; t++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.rivals['brandt']!.capital).toBeGreaterThan(capitalBefore)
  })
})
