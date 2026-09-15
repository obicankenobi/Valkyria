import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../src/resolve/index.js'
import { createInitialState } from '../src/state.js'
import { bidEstimate } from '../src/queries.js'
import { computeUnitCostNow, getProduct } from '../src/pricing.js'
import balanceData from '../src/data/balance.json' with { type: 'json' }
import type { Contract, GameState, TurnSubmission, WireEvent } from '../src/types.js'

const BALANCE = balanceData as unknown as { insolvencyTurns: number }

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
    // inte när det här testet skrevs i P3) underkänner BÅDA sina granskningar för
    // ett hus med progressSnapshot === 0 hela vägen, vilket ger BUYOUT innan
    // treasury ens hunnit bli negativt. Samma underliggande sanning som testets
    // ursprungliga namn ("ett hus utan intäkter förlorar") gäller alltså
    // fortfarande, bara med en annan, mer specifik slutkod, eftersom hela
    // pipelinen (inte bara economy.ts) nu är på plats.
    //
    // P30 (avsnitt 5.1/5.2): reviewTurns är nu [6, 10, 14, 18] (tidigare [8, 14]),
    // och en godkänd kontroll nollställer reviewsFailed — men det här huset klarar
    // ALDRIG en kontroll (progressSnapshot 0 hela vägen), så "två underkända I RAD"
    // inträffar nu redan vid den ANDRA granskningsturen (10), inte den gamla andra
    // (14).
    let state: GameState = createInitialState('indochina-slice', 'insolvency-seed')
    expect(state.house.treasury).toBe(4000000)

    let callsUntilEnded = 0
    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, SUBMISSION_WITH_LOAN_ATTEMPT)
      state = result.state
      callsUntilEnded++
      if (state.status.kind === 'ended') break
    }

    expect(callsUntilEnded).toBe(11)
    expect(state.status).toEqual({ kind: 'ended', ending: 'BUYOUT', turn: 10 })
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
    state.house.insolventTurns = BALANCE.insolvencyTurns - 1
    state.meta.turn = 5 // godtycklig, inte en granskningstur (8/14) — board.ts ska inte kunna störa

    const result = resolveTurn(state, EMPTY_SUBMISSION)
    expect(result.state.status).toEqual({ kind: 'ended', ending: 'INSOLVENCY', turn: 5 })
    expect(result.state.house.insolventTurns).toBe(BALANCE.insolvencyTurns)
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

    // Lägg ett bud som GARANTERAT vinner, oavsett rivalernas pris ELLER (sedan P24,
    // ETAPP2_TEKNISK_SPEC.md avsnitt 2.2) deras relations/reputation/blocTerm — bud
    // 1 maximerar priceTerm (bidPrice/effectiveRef ≈ 0), vilket dominerar även den
    // starkast tänkbara rivalens icke-pris-termer. winBand:s lägsta prispunkt
    // (P22-balanspassets fix) räckte inte längre: den var bara "nära säker" mot
    // ren prissättning, inte mot en rival med hög relations[buyerId]/reputation/
    // blocTerm (P24 gav rivaler de fälten på riktigt) — se docs/ANDRINGSLOGG.md.
    const bidPrice = 1
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
    // Sedan P25 (ETAPP2_TEKNISK_SPEC.md avsnitt 2.3) kan en rival som vinner en
    // order leverera helt utan spelarens medverkan och därmed flytta fronten —
    // exakt den nya, AVSEDDA effekten P25 finns för (se testet
    // "en front dit ENDAST en rival levererar" nedan). "Utan leveranser" i DET HÄR
    // testets ursprungliga mening (P6, ren stagnationsgaranti för nollställd
    // inmatning) kräver alltså att det inte finns några rivaler att vinna en order
    // överhuvudtaget — annars testar det inte längre "inga leveranser", bara
    // "spelaren skickade inget den här turen".
    state.rivals = {}
    const before = JSON.parse(JSON.stringify(state.fronts['front-1']))

    for (let i = 0; i < 15; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.fronts['front-1']).toEqual(before)
  })

  it('(P6 klart-när) en front dit spelaren levererar artilleri flyttar position i rätt riktning, och attribution summerar till levererade enheter', () => {
    // rvn = sideA (position ska röra sig mot -100 när rvn får materiel).
    let state: GameState = createInitialState('indochina-slice', 'p6-direction-seed')
    // Inga rivaler — samma isolering som stagnationstestet ovan. Sedan P26
    // (avsnitt 2.4) drar rivals.ts nya rng-anrop varje tur (opportunist-/
    // patriot-beteenden, oberoende av spelarens passivitet), vilket flyttar
    // rng-markören och därmed vilken order/kvantitet som genereras för det
    // här fröet. Testet handlar om produktions-/leveranskedjan, inte rivaler.
    state.rivals = {}
    const positionBefore = state.fronts['front-1']!.position

    let order = undefined as GameState['market']['openOrders'][number] | undefined
    for (let i = 0; i < 15 && !order; i++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
      order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')
    }
    expect(order).toBeDefined()

    // Samma motivering som P5-testet ovan: bud 1 garanterar vinsten oavsett
    // rivalernas prissättning ELLER (sedan P24) deras relations/reputation/blocTerm.
    const bidPrice = 1
    const submission: TurnSubmission = {
      standingOrders: [],
      bids: [{ orderId: order!.id, price: bidPrice, deliveryTurns: order!.requiredDeliveryTurns, grade: 'A', bribe: 0 }],
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
    // P43 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 3): equipment
    // förbrukas nu av attrition.ts varje stridstur — leveranser som ankommit
    // TIDIGT i loopen ovan har redan hunnit tära ner innan sista leveransen
    // kom in, så lagret på fronten är INTE längre garanterat lika med summan
    // levererat (attribution, orörd av attrition, är fortfarande det exakta
    // kumulativa måttet för det).
    expect(state.fronts['front-1']!.equipment.a.artillery).toBeLessThanOrEqual(deliveredQuantity)
    expect(state.fronts['front-1']!.equipment.a.artillery).toBeGreaterThan(0)
  })
})

describe('resolveTurn — P25: rivalerna fullföljer kontrakt (ETAPP2_TEKNISK_SPEC.md avsnitt 2.3)', () => {
  it('(P25 klart-når) en front dit ENDAST en rival levererar rör sig, och Front.attribution innehåller en rivalnyckel efter 20 turer — spelaren gör ingenting', () => {
    let state: GameState = createInitialState('indochina-slice', 'p25-rival-delivers-seed')
    const positionBefore = state.fronts['front-1']!.position

    for (let t = 0; t < 20; t++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    // Spelaren har inte skickat in ett enda bud eller en enda handling någon av
    // de 20 turerna — varje förflyttning här kommer uteslutande från en rival
    // som vunnit en order och levererat mot den (P25), inte från spelaren.
    expect(state.fronts['front-1']!.position).not.toBe(positionBefore)
    const attributionKeys = Object.keys(state.fronts['front-1']!.attribution)
    expect(attributionKeys.some((key) => key !== 'player')).toBe(true)
    expect(state.market.contracts).toHaveLength(0) // spelaren har aldrig vunnit ett kontrakt
  })

  it('(P25 klart-når) en rivalleverans räknas i Theatre.deliveriesIntoActiveWarThisTurn SAMMA tur den sker, inte nästa — heat.ts (senare i samma pipeline-passage) ser den direkt', () => {
    const state: GameState = createInitialState('indochina-slice', 'p25-same-turn-seed')
    state.rivals = {
      brandt: {
        ...state.rivals['brandt']!,
        contracts: [
          { id: 'rc-heat-test', buyerId: 'rvn', productId: '105mm_field_gun', quantity: 100000, unitsDelivered: 0, dueTurn: 500, status: 'active', lateEventId: null },
        ],
      },
    }
    // Ta bort ordergenereringens rivaltävlan så att INGEN NY rivalorder/kontrakt
    // kan uppstå och störa mätningen — bara det redan skapade kontraktet ovan
    // ska leverera den här enda turen.
    state.market.openOrders = []
    const theatre = state.theatres['indochina']!
    theatre.heat = 50
    theatre.deliveriesIntoActiveWarThisTurn = 0
    const heatBefore = theatre.heat

    const result = resolveTurn(state, EMPTY_SUBMISSION)

    // heat.ts's formel (isolerat testad i heat.test.ts): branchen "heatFromDeliveries > 0"
    // ger heat + enheter×heatPerUnit − heatDecayActive. Om rivalleveransen inte hade
    // räknats SAMMA tur (t.ex. en bugg som skrev den en pipeline-passage för sent)
    // hade branchen "annars" (− heatDecayIdle, en annan formel) körts i stället.
    const rivalDeliveryUnitsPerTurn = balanceData.rivalDeliveryUnitsPerTurn as number
    const heatPerUnit = balanceData.heatPerUnit as number
    const heatDecayActive = balanceData.heatDecayActive as number
    const expectedHeat = Math.max(0, Math.min(100, heatBefore + rivalDeliveryUnitsPerTurn * heatPerUnit - heatDecayActive))

    expect(result.state.theatres['indochina']!.heat).toBe(expectedHeat)
    // Räknaren är transient (nollställd av heat.ts i samma steg) — just DÄRFÖR
    // bevisar heat-utfallet ovan tidpunkten, inte en direkt läsning av räknaren.
    expect(result.state.theatres['indochina']!.deliveriesIntoActiveWarThisTurn).toBe(0)
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
  //
  // GROWTH_CAP sänkt 0,4 → 0,2 och "minst hälften av BUYOUT före tur 20" bytt mot
  // "minst en" under P16 (se ANDRINGSLOGG.md): P16 kopplade in product.unitsPerLineTurn
  // (avsnitt 4.1), vilket för högvolymprodukter (t.ex. m1_rifle: 40 → 4000/linjetur)
  // gör att kontrakt produceras och betalas klart mycket snabbare. Den här boten
  // överlever därför till scenariots slut mycket oftare än förr — BUYOUT via
  // board.ts:s TVÅ UNDERKÄNDA KONTROLLER (tur 14) blev sällsynt (1–2/20 i ett brett
  // svep av GROWTH_CAP), medan BUYOUT via endings.ts:s ANDRA väg — `dueTurn` nått
  // utan att styrelsemålet ("Doubling") är uppfyllt — blev den dominerande, sena
  // (tur 20). Båda är BUYOUT-vägar som redan stod ordagrant i specen (avsnitt 5);
  // ingen regel ändrades, bara VILKEN av dem som hinner slå till först för den här
  // specifika, syntetiska bidstrategin.
  const GROWTH_CAP = 0.2

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
    '(P8 klart-när, siffra reviderad under P16 — se ANDRINGSLOGG.md) ett passivt-men-inte-tomt parti ' +
      'förlorar på BUYOUT i minst 6 av 20 seeds inom 20 turer, och minst en av dem via den TIDIGARE ' +
      'vägen (två underkända kontroller, inte bara dueTurn nått utan uppfyllt styrelsemål)',
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
      // BUYOUT via den TIDIGARE vägen (två underkända kontroller, board.ts) kan bara
      // inträffa vid tur 14 (reviewTurns [8, 14]) — den SENA vägen (dueTurn nått utan
      // uppfyllt styrelsemål, endings.ts) inträffar alltid exakt vid tur 20. "Före tur
      // 20" är alltså synonymt med "via den tidigare vägen" i just det här scenariot.
      const buyoutsBeforeTurn20 = buyouts.filter((o) => o.turn < 20)

      expect(buyouts.length).toBeGreaterThanOrEqual(6)
      expect(buyoutsBeforeTurn20.length).toBeGreaterThanOrEqual(1)
    },
  )

  it('rivalhusen växer i kapital och marknadsandel när partiet är helt passivt (EMPTY_SUBMISSION), tur efter tur', () => {
    let state: GameState = createInitialState('indochina-slice', 'p8-rival-growth-seed')
    // P26:s NYA, oberoende opportunist-beteende (avsnitt 2.4) drar också capital
    // och hade annars kunnat maskera den passiva tillväxten det här testet
    // faktiskt mäter — se rivals.test.ts för samma isolering.
    state.rivals['brandt']!.sabotagedUntilTurn = 999
    const rival = state.rivals['brandt']!
    const capitalBefore = rival.capital

    for (let t = 0; t < 5; t++) {
      state = resolveTurn(state, EMPTY_SUBMISSION).state
    }

    expect(state.rivals['brandt']!.capital).toBeGreaterThan(capitalBefore)
  })
})

describe('resolveTurn — P16: supply och produktionstakt', () => {
  // Lokal, uttryckligt ENKEL "bjud på allt, underbjud rivalerna"-submission — bara
  // för att generera vunna kontrakt, leveranser och därmed heat över ett helt
  // parti. Ingen av härnessens riktiga botpolicyer (packages/harness) importeras
  // hit: core får aldrig bero på ett annat paket (CLAUDE.md hård regel 1 gäller
  // headless-kravet i den riktningen också), och samma "bygg en lokal, minimal
  // submission-funktion i testet" är redan P8:s mönster ovan
  // (passiveButNotZeroSubmission).
  function bidsOnEverythingSubmission(state: GameState): TurnSubmission {
    const bids = state.market.openOrders.map((order) => {
      const estimate = bidEstimate(state, order, 'A')
      return {
        orderId: order.id,
        price: Math.round(estimate.rivalPriceLow * 0.9),
        deliveryTurns: order.requiredDeliveryTurns,
        grade: 'A' as const,
        bribe: 0,
      }
    })
    return { standingOrders: [], bids, actions: [] }
  }

  it('(P16 klart-när) supplyCostIndex rör sig minst 25 enheter över ett 20-turersparti', () => {
    let state: GameState = createInitialState('indochina-slice', 'p16-supply-seed-0')
    let min = state.market.supplyCostIndex
    let max = state.market.supplyCostIndex

    for (let t = 0; t <= 20; t++) {
      const result = resolveTurn(state, bidsOnEverythingSubmission(state))
      state = result.state
      min = Math.min(min, state.market.supplyCostIndex)
      max = Math.max(max, state.market.supplyCostIndex)
      if (state.status.kind === 'ended') break
    }

    expect(max - min).toBeGreaterThanOrEqual(25)
  })

  it('(P16 klart-när) unitCostNow för ett aktivt kontrakt skiljer sig från unitCostAtSigning i minst ett parti av tio', () => {
    let anyDivergence = false

    for (let i = 0; i < 10 && !anyDivergence; i++) {
      let state: GameState = createInitialState('indochina-slice', `p16-unitcost-seed-${i}`)
      for (let t = 0; t <= 20; t++) {
        const result = resolveTurn(state, bidsOnEverythingSubmission(state))
        state = result.state
        if (state.status.kind === 'ended') break
      }

      for (const contract of state.market.contracts) {
        const product = getProduct(contract.productId)
        const unitCostNow = computeUnitCostNow(product, contract.grade, state.market.supplyCostIndex)
        if (unitCostNow !== contract.unitCostAtSigning) {
          anyDivergence = true
          break
        }
      }
    }

    expect(anyDivergence).toBe(true)
  })
})

describe('resolveTurn — P17: executive actions (INTERNAL)', () => {
  function fillerContract(id: string): Contract {
    return {
      id,
      buyerId: 'rvn',
      productId: '105mm_field_gun',
      quantity: 100000, // aldrig färdigt under testets gång — håller linjen upptagen
      unitsDelivered: 0,
      price: 1,
      unitCostAtSigning: 1,
      grade: 'A',
      dueTurn: 999,
      status: 'active',
      lateEventId: null,
    }
  }

  it('(P17 klart-när) BUILD_LINE höjer produktionen: en tidigare obemannad kontraktsrad får en linje och producerar', () => {
    let state: GameState = createInitialState('indochina-slice', 'p17-build-line-seed')
    state.house.treasury = 10000000 // gott om kassa för BUILD_LINE och produktion

    // Alla FYRA befintliga linjer upptagna med kontrakt som aldrig blir klara.
    const busyContracts = state.house.lines.map((_, i) => fillerContract(`contract-busy-${i}`))
    const waitingContract: Contract = { ...fillerContract('contract-waiting'), quantity: 1000 }
    state.market.contracts = [...busyContracts, waitingContract]
    state.house.lines.forEach((line, i) => {
      line.assignedContractId = busyContracts[i]!.id
      line.productId = busyContracts[i]!.productId
      line.status = 'running'
    })
    // Premissen: utan en femte linje finns det inget ledigt att tilldela waitingContract.
    expect(state.house.lines.every((l) => l.status !== 'idle')).toBe(true)

    let result = resolveTurn(state, {
      standingOrders: [],
      bids: [],
      actions: [{ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }],
    })
    state = result.state
    expect(state.house.lines.length).toBe(5)

    // production.ts kör direkt efter applyActions i SAMMA pipeline-passage (avsnitt
    // 10), så den nya linjen kan redan ha tilldelats och producerat den här turen —
    // annars säkerställer nästa tur det (fortsatt tomma inskickningar räcker).
    const alreadyShipped = state.market.shipments.some((s) => s.contractId === waitingContract.id)
    if (!alreadyShipped) {
      result = resolveTurn(state, { standingOrders: [], bids: [], actions: [] })
      state = result.state
    }

    expect(state.market.shipments.some((s) => s.contractId === waitingContract.id)).toBe(true)
  })

  it('(P17 klart-när) ett R&D-projekt som löper klart höjer techLevel i rätt kategori, och rndOverhead debiteras varje tur under tiden', () => {
    let state: GameState = createInitialState('indochina-slice', 'p17-rnd-seed')
    state.house.treasury = 10000000
    const techBefore = state.house.techLevel.naval
    const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

    let result = resolveTurn(state, {
      standingOrders: [],
      bids: [],
      actions: [{ type: 'INTERNAL', op: 'REPRIORITISE_RND', payload: { category: 'naval' } }],
    })
    state = result.state
    expect(state.house.rnd).toHaveLength(1)
    const turnsTotal = state.house.rnd[0]!.turnsTotal

    function fixedCostsChargedThisTurn(wire: readonly WireEvent[]): number {
      const ticker = wire.find((e) => e.headline.includes('QUARTERLY FIXED COSTS'))
      return ticker ? -ticker.delta.treasury! : 0
    }

    // rndOverhead debiteras av economy.ts, som läser house.rnd.length EFTER att
    // applyActions (samma pipeline-passage) redan kan ha avancerat/tagit bort ett
    // klart projekt — den sista av de här turnsTotal turerna är alltså turen
    // projektet FÄRDIGSTÄLLS på, och den turen debiteras INTE rndOverhead (kön är
    // redan tom när economy.ts kör). Mät därför bara medan kön fortfarande är
    // icke-tom efter turen.
    let fixedCostsWhileActive = 0
    for (let t = 0; t < turnsTotal; t++) {
      result = resolveTurn(state, EMPTY)
      state = result.state
      if (state.house.rnd.length > 0) {
        fixedCostsWhileActive = fixedCostsChargedThisTurn(result.wire)
      }
    }

    // Projektet ska nu vara klart: techLevel höjd, borttaget ur kön.
    expect(state.house.techLevel.naval).toBe(techBefore + 1)
    expect(state.house.rnd).toEqual([])

    // En tur TILL, efter att projektet lämnat kön — rndOverhead (120 000) ska inte
    // längre ingå i de fasta kostnaderna.
    result = resolveTurn(state, EMPTY)
    const fixedCostsAfterCompletion = fixedCostsChargedThisTurn(result.wire)

    expect(fixedCostsWhileActive - fixedCostsAfterCompletion).toBe(120000) // fixedCosts.rndOverhead, balance.json
  })
})
