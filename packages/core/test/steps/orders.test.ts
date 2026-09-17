import { describe, expect, it } from 'vitest'
import { orders } from '../../src/resolve/steps/orders.js'
import { computeScore, getProduct } from '../../src/pricing.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

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

describe('orders (isolerat steg, spec avsnitt 4.1, 6)', () => {
  it('scenariots scriptade restricted-order dyker upp exakt på den angivna turen, inte tidigare eller senare', () => {
    const before = createInitialState('indochina-slice', 'seed')
    before.meta.turn = 9
    orders(makeCtx(before, 'orders-seed').ctx)
    expect(before.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)

    const atTurn = createInitialState('indochina-slice', 'seed')
    atTurn.meta.turn = 10 // indochina-slice.json: scriptedEvents[0].turn
    orders(makeCtx(atTurn, 'orders-seed').ctx)
    const restricted = atTurn.market.openOrders.find((o) => o.productId === 'mk9_longhand_shell')
    expect(restricted).toBeDefined()
    expect(restricted!.quantity).toBe(8)
    expect(restricted!.buyerId).toBe('rvn')

    const after = createInitialState('indochina-slice', 'seed')
    after.meta.turn = 11
    orders(makeCtx(after, 'orders-seed').ctx)
    expect(after.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)
  })

  it('mk9 (restricted) har ett baseCost tre till fem gånger en ordinär produkts (designkravet i spec avsnitt 6)', () => {
    // ETAPP1_5_TEKNISK_SPEC.md avsnitt 4.3 höjde mk9_longhand_shell.baseCost till
    // 1 600 000 EXAKT för att uppfylla det här kravet, kalibrerat mot
    // ch3_transport_helicopter (per-produkt baseCost, inte en scriptad orders
    // totala referencePrice — den senare beror även på den scriptade kvantiteten
    // och råkar inte längre ligga i intervallet efter höjningen, se ANDRINGSLOGG.md).
    const restricted = getProduct('mk9_longhand_shell')
    const ordinary = getProduct('ch3_transport_helicopter')
    const ratio = restricted.baseCost / ordinary.baseCost
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(ratio).toBeLessThanOrEqual(5)
  })

  it('ordinarie generering väljer aldrig en restricted produkt, oavsett hur högt behovet är', () => {
    // P35: artilleribehovet satt SKYHÖGT (300, långt över orderTriggerThreshold
    // 12) — om restricted-spärren någonsin brast skulle mk9 (restricted, samma
    // kategori) vara den mest lockande kandidaten.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const trial = createInitialState('indochina-slice', 'seed')
      trial.factions['rvn']!.materielNeed.artillery = 300
      trial.meta.turn = 0 // före tur 7 (P30: tidigaste scriptade restricted-order)
      orders(makeCtx(trial, seed).ctx)
      expect(trial.market.openOrders.some((o) => o.productId === 'mk9_longhand_shell')).toBe(false)
      expect(trial.market.openOrders.some((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')).toBe(true)
    }
  })

  it('genererar inga ordrar för en bankrutt eller embargerad faktion, trots högt behov hos alla tre', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (const factionId of ['rvn', 'nlf', 'laos']) {
      state.factions[factionId]!.materielNeed.infantry = 100 // över orderTriggerThreshold (60) för alla
    }
    state.factions['rvn']!.bankrupt = true
    state.factions['nlf']!.embargoed = true
    orders(makeCtx(state, 'orders-seed').ctx)
    expect(state.market.openOrders.every((o) => o.buyerId === 'laos')).toBe(true)
    expect(state.market.openOrders.length).toBeGreaterThan(0) // kontroll: genereringen fungerar alls
  })

  it('varje genererad order har expiresTurn > skapelseturen (order-lifetime-invarianten)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.factions['rvn']!.materielNeed.infantry = 100
    state.meta.turn = 3
    orders(makeCtx(state, 'orders-seed').ctx)
    expect(state.market.openOrders.length).toBeGreaterThan(0)
    for (const order of state.market.openOrders) {
      expect(order.expiresTurn).toBeGreaterThan(3)
    }
  })

  describe('behovsdriven utlysning (P35 klart-när, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.2)', () => {
    it('en faktion utlyser i fallande behovsordning — kategorin med störst behov utlyses (och skrivs till openOrders) först', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      rvn.materielNeed.artillery = 300 // störst behov
      rvn.materielNeed.infantry = 61 // precis över tröskeln (60) — minst
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const rvnOrders = state.market.openOrders.filter((o) => o.buyerId === 'rvn')
      expect(rvnOrders.length).toBe(2) // båda rvns enda två köpbara kategorier korsar sin tröskel
      expect(rvnOrders[0]!.productId).toBe('105mm_field_gun') // artillery, störst behov, kommer först
      expect(rvnOrders[1]!.productId).toBe('m1_rifle') // infantry, minst behov, kommer sist
    })

    it('behovet konsumeras vid utlysning, med exakt den utlysta kvantiteten', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      rvn.materielNeed.artillery = 80 // inom orderQuantityMin/Max (20–150) för 105mm_field_gun
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      expect(rvn.materielNeed.artillery).toBeCloseTo(80 - order.quantity, 6)
    })

    it('behovet golvas vid 0, aldrig negativt — en utlyst kvantitet över quantityMin får inte skuldsätta framtida behov', () => {
      // Bugg upptäckt under P35 (se ANDRINGSLOGG.md): need[c] -= quantity,
      // ordagrant enligt avsnitt 4.2, driver need djupt negativt så fort
      // orderQuantityMin > orderTriggerThreshold — exakt fallet för m1_rifle
      // (min 500, infantry-tröskeln 60). Ett djupt negativt behov hade tagit
      // decennier av peacetimeReplacement att arbeta av, vilket permanent
      // kvävt framtida ordrar i den kategorin.
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      rvn.materielNeed.infantry = 61 // precis över tröskeln (60), långt under m1_rifles min (500)
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === 'm1_rifle')!
      expect(order).toBeDefined()
      expect(order.quantity).toBe(500) // clampat upp till orderQuantityMin, inte 61
      expect(rvn.materielNeed.infantry).toBe(0) // golvat, INTE 61 − 500 = −439
    })

    it('ett behov under orderTriggerThreshold hoppas över — ingen order, behovet orört', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      // P53a (ETAPP5_TEKNISK_SPEC.md avsnitt 2.1): materielNeed seedas numera
      // till orderTriggerThreshold för ALLA kategorier, inte bara den här
      // testade — nollställ övriga så testet isolerat prövar bara artillery.
      for (const category of Object.keys(rvn.materielNeed) as (keyof typeof rvn.materielNeed)[]) {
        rvn.materielNeed[category] = 0
      }
      rvn.materielNeed.artillery = 11 // under tröskeln (12)
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      expect(state.market.openOrders.some((o) => o.buyerId === 'rvn')).toBe(false)
      expect(rvn.materielNeed.artillery).toBe(11)
    })

    it('en faktion utan råd utlyser inte — kvantiteten prutas i 25 %-steg, och CANNOT AFFORD emitteras om det ändå inte räcker', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      rvn.materielNeed.artillery = 100
      rvn.militaryBudget = 0
      state.meta.turn = 0

      const { ctx, emitted } = makeCtx(state, 'orders-seed')
      orders(ctx)

      expect(state.market.openOrders.some((o) => o.buyerId === 'rvn')).toBe(false)
      expect(rvn.materielNeed.artillery).toBe(100) // orört — ingen order utlystes
      expect(emitted.some((e) => e.headline.includes('CANNOT AFFORD') && e.subjectId === 'rvn')).toBe(true)
    })

    it('UNMET NEED emitteras när behovet är över tröskeln men ingen köpbar produkt finns i kategorin', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const nlf = state.factions['nlf']! // techLevel 1 — kan bara köpa m1_rifle (infantry)
      // P53a (ETAPP5_TEKNISK_SPEC.md avsnitt 2.1): materielNeed seedas numera
      // till orderTriggerThreshold för ALLA kategorier — nollställ infantry
      // (nlf:s enda köpbara kategori) så den inte själv utlyser en order och
      // döljer testets riktiga fråga (artillery, som nlf inte kan köpa alls).
      for (const category of Object.keys(nlf.materielNeed) as (keyof typeof nlf.materielNeed)[]) {
        nlf.materielNeed[category] = 0
      }
      nlf.materielNeed.artillery = 300 // långt över tröskeln (12), men ingen icke-restricted artilleriprodukt nlf får köpa
      state.meta.turn = 0

      const { ctx, emitted } = makeCtx(state, 'orders-seed')
      orders(ctx)

      expect(state.market.openOrders.some((o) => o.buyerId === 'nlf')).toBe(false)
      expect(emitted.some((e) => e.headline.includes('UNMET NEED') && e.subjectId === 'nlf')).toBe(true)
    })

    it('högst maxOrdersPerFactionPerTurn ordrar per faktion och tur', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const rvn = state.factions['rvn']!
      // rvn har bara två köpbara kategorier (techLevel 2) — sätt båda över
      // tröskeln för att bekräfta taket inte är lägre än vad som faktiskt går
      // att nå, snarare än att härleda det indirekt.
      rvn.materielNeed.artillery = 100
      rvn.materielNeed.infantry = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      expect(state.market.openOrders.filter((o) => o.buyerId === 'rvn').length).toBe(2)
    })
  })

  it('statedBudget är aldrig högre än trueBudget', () => {
    const state = createInitialState('indochina-slice', 'seed')
    for (let turn = 0; turn < 20; turn++) {
      state.meta.turn = turn
      orders(makeCtx(state, `budget-seed-${turn}`).ctx)
    }
    expect(state.market.openOrders.length).toBeGreaterThan(0)
    for (const order of state.market.openOrders) {
      expect(order.statedBudget).toBeLessThanOrEqual(order.trueBudget)
    }
  })

  it('emittar minst en händelse per skapad order (CLAUDE.md hård regel 4)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.meta.turn = 10 // garanterar minst den scriptade ordern
    const { ctx, emitted } = makeCtx(state, 'orders-seed')

    const before = state.market.openOrders.length
    orders(ctx)

    expect(state.market.openOrders.length).toBeGreaterThan(before)
    expect(emitted.length).toBeGreaterThanOrEqual(state.market.openOrders.length - before)
  })

  it('(P19 klart-när) en faktion vars militaryBudget är slut utlyser inga ordinarie ordrar (avsnitt 7.1.C)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.factions['rvn']!.militaryBudget = 0
    state.factions['nlf']!.militaryBudget = 0
    for (const factionId of ['rvn', 'nlf', 'laos']) {
      state.factions[factionId]!.materielNeed.infantry = 100 // över tröskeln för alla tre
    }
    // laos har kvar sin normala budget — kontroll: genereringen fungerar alls.

    for (let turn = 0; turn < 7; turn++) {
      // Stannar före tur 7 (P30: tidigaste scriptade restricted-order, avsnitt
      // 5.3) — samma skäl som "ordinarie generering väljer aldrig en restricted
      // produkt" ovan: de scriptade ordrarna (mot rvn) ska INTE blandas in här,
      // de prövas medvetet i en egen rad i ANDRINGSLOGG.md.
      state.meta.turn = turn
      orders(makeCtx(state, `budget-exhausted-seed-${turn}`).ctx)
    }

    expect(state.market.openOrders.some((o) => o.buyerId === 'rvn' || o.buyerId === 'nlf')).toBe(false)
    expect(state.market.openOrders.some((o) => o.buyerId === 'laos')).toBe(true)
  })

  describe('frontläget sätter vikterna (P36 klart-när, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 4.3)', () => {
    it('en faktion som förlorar mark (position rör sig mot motståndarens pol) och ligger under i moral får weights.delivery > weights.price', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      // front-1: sideA='rvn'. Position rör sig -20→+20 över tre turer — mot
      // sida B:s pol (+100), alltså dåligt för rvn (sida A). Moralen sätts
      // också till rvns nackdel, så båda pressure-termerna bidrar.
      front.trace = [-20, -10, 0, 20]
      front.morale.a = 30
      front.morale.b = 70
      state.factions['rvn']!.materielNeed.artillery = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      expect(order.weights.delivery).toBeGreaterThan(order.weights.price)
      expect(order.weights.relationship).toBe(balance.bidWeightsDefault.relationship) // oförändrad, avsnitt 4.3
    })

    it('en faktion som varken förlorar mark eller ligger under i moral får de vanliga standardvikterna (pressure 0)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      front.trace = [5, 5, 5, 5] // ingen rörelse alls
      // morale.a/morale.b redan lika (scenariots startvärden skiljer sig något
      // — sätt dem uttryckligen lika för att isolera testet till positionstermen).
      front.morale.a = 50
      front.morale.b = 50
      // P55 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.2): rvns procurement-tjänsteman
      // har REARM som standard (officials.json) — REARM skiftar vikterna
      // OBEROENDE av pressure. Neutraliserad till SELF_ENRICHMENT (varken
      // vikt- eller produktval-effekt i P55) för att isolera testet till
      // pressure-termen, samma sak testet redan hette (P36, inte P55).
      state.officials['official-rvn-procurement']!.agenda = 'SELF_ENRICHMENT'
      state.factions['rvn']!.materielNeed.artillery = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      expect(order.weights).toEqual(balance.bidWeightsDefault)
    })

    it('en faktion som VINNER mark får inte högre delivery-vikt än standard (pressure klampad till 0, inte negativ)', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front = state.fronts['front-1']!
      front.trace = [20, 10, 0, -20] // rör sig mot rvns egen pol (-100) — rvn vinner
      front.morale.a = 70
      front.morale.b = 30
      // P55: neutraliserad agenda, samma motivering som testet ovan.
      state.officials['official-rvn-procurement']!.agenda = 'SELF_ENRICHMENT'
      state.factions['rvn']!.materielNeed.artillery = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      expect(order.weights).toEqual(balance.bidWeightsDefault) // ingen "negativ press"
    })

    it('en köpare utan egen front är aldrig under press — standardvikter oavsett fronternas läge', () => {
      // P45 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.4): laos fick sin egen front
      // (front-laos, mot nlf) — inte längre exemplet på en frontlös köpare.
      // Tar bort den härur i stället för att hitta på en fjärde faktion, bara
      // för att pröva highestPressureFront/computePressureForFront:s null-fall
      // rent, isolerat från vilken faktion som råkar sakna en front just nu.
      const state = createInitialState('indochina-slice', 'seed')
      delete state.fronts['front-laos']
      state.fronts['front-1']!.trace = [-50, -40, -20, 0]
      // P55: laos procurement-tjänsteman har AUSTERITY som standard
      // (officials.json) — neutraliserad, samma motivering som ovan.
      state.officials['official-laos-procurement']!.agenda = 'SELF_ENRICHMENT'
      state.factions['laos']!.materielNeed.infantry = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'laos')!
      expect(order).toBeDefined()
      expect(order.weights).toEqual(balance.bidWeightsDefault)
    })

    it('(P44 klart-när) en köpare på TVÅ fronter viktas/väljs mot den med högst pressure, inte den först funna', () => {
      const state = createInitialState('indochina-slice', 'seed')
      const front1 = state.fronts['front-1']! // rvn, ingen rörelse — 0 pressure
      front1.trace = [5, 5, 5, 5]
      front1.morale.a = 50
      front1.morale.b = 50

      // front-2 läggs till EFTER front-1 (samma insättningsordning-fälla som
      // findFrontForBuyer/computePressureForBuyer hade innan P44 — "första
      // matchande" hade alltid gett front-1, oavsett pressure). Ger rvn hög
      // pressure här i stället.
      state.fronts['front-2'] = {
        ...JSON.parse(JSON.stringify(front1)),
        id: 'front-2',
        trace: [-20, -10, 0, 20], // rör sig mot sida B:s pol — dåligt för rvn (sida A)
        morale: { a: 30, b: 70 },
      }

      state.factions['rvn']!.materielNeed.artillery = 100
      state.meta.turn = 0

      orders(makeCtx(state, 'orders-seed').ctx)

      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      // Vikterna avslöjar VILKEN front som faktiskt användes: hade koden tagit
      // front-1 (0 pressure) hade weights varit standard, inte förskjutna.
      expect(order.weights.delivery).toBeGreaterThan(order.weights.price)
      expect(order.frontId).toBe('front-2')
    })
  })
})

// P54 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1/8, klart-når): "ett test visar att
// samma tjänsteman ger samma integritet två turer i rad." Order.officialId
// pekar nu på en PERSISTENT Official i stället för att rulla ett nytt tal per
// order (det tidigare inspectorIntegrity) — muta samma person två gånger och
// du vet vad du köper (avsnitt 3.1:s egen motivering).
describe('orders — P54: officialId pekar på en persistent tjänsteman', () => {
  it('en utlyst order pekar på faktionens procurement-tjänsteman, och samma tjänsteman/integritet återkommer i en senare tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.factions['rvn']!.materielNeed.artillery = 100
    state.meta.turn = 0

    orders(makeCtx(state, 'orders-seed-turn0').ctx)
    const firstOrder = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
    expect(firstOrder).toBeDefined()
    expect(firstOrder.officialId).toBe('official-rvn-procurement')

    const integrityAfterFirst = state.officials['official-rvn-procurement']!.integrity

    // Ny order, en senare tur — samma faktion, samma post.
    state.factions['rvn']!.materielNeed.artillery = 100
    state.meta.turn = 3
    orders(makeCtx(state, 'orders-seed-turn3').ctx)
    const secondOrder = state.market.openOrders.find(
      (o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun' && o.id !== firstOrder.id,
    )!
    expect(secondOrder).toBeDefined()
    expect(secondOrder.officialId).toBe(firstOrder.officialId)
    expect(state.officials['official-rvn-procurement']!.integrity).toBe(integrityAfterFirst)
  })
})

// P55 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.2/8, klart-når). Agendan är "en ANDRA
// viktskiftare på samma ställe" som weightPressureShift (P36) — dessa tester
// bevisar effekten på en riktigt genererad order (order.weights), inte en
// isolerad formel.
describe('orders — P55: agendan viktar affären', () => {
  it('två köpare med identiskt behov men olika agenda (REARM vs AUSTERITY) ger olika vinnare mellan samma två konkurrerande bud', () => {
    function weightsFor(agenda: 'REARM' | 'AUSTERITY') {
      const state = createInitialState('indochina-slice', 'agenda-seed')
      state.officials['official-rvn-procurement']!.agenda = agenda
      state.factions['rvn']!.materielNeed.artillery = 100
      state.meta.turn = 0
      orders(makeCtx(state, 'orders-seed').ctx)
      const order = state.market.openOrders.find((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')!
      expect(order).toBeDefined()
      return order.weights
    }

    const rearmWeights = weightsFor('REARM')
    const austerityWeights = weightsFor('AUSTERITY')
    expect(rearmWeights).not.toEqual(austerityWeights)

    // Två fasta konkurrerande bud på SAMMA order: ett dyrt men snabbt, ett
    // billigt men långsamt. Poängen räknas med varje agendas EGNA order.
    // vikter (allt annat — pris, referencePrice, leveranskrav, integritet,
    // relation, reputation, blocTerm — identiskt).
    const shared = {
      referencePrice: 2000000,
      requiredDeliveryTurns: 3,
      inspectorIntegrity: 50,
      relationToPlayer: 40,
      reputation: { reliability: 50, quality: 50 },
      blocTerm: 0,
    }
    const expensiveFast = { bidPrice: 2000000, bidDeliveryTurns: 3, bidGrade: 'A' as const, bidBribe: 0 } // = referencePrice, exakt i tid
    const cheapSlow = { bidPrice: 1400000, bidDeliveryTurns: 5, bidGrade: 'A' as const, bidBribe: 0 } // 30 % billigare, 2 turer sent

    const rearmPrefersFast =
      computeScore({ ...shared, ...expensiveFast, weights: rearmWeights }) >
      computeScore({ ...shared, ...cheapSlow, weights: rearmWeights })
    const austerityPrefersFast =
      computeScore({ ...shared, ...expensiveFast, weights: austerityWeights }) >
      computeScore({ ...shared, ...cheapSlow, weights: austerityWeights })

    expect(rearmPrefersFast).toBe(true) // REARM: volym/snabbhet väger tyngre
    expect(austerityPrefersFast).toBe(false) // AUSTERITY: lägsta pris vinner i stället
  })

  it('MODERNISE diskvalificerar en kategori vars enda köpbara produkt ligger under teknikgolvet — UNMET NEED, ingen order', () => {
    const state = createInitialState('indochina-slice', 'seed')
    // 105mm_field_gun (artillery, rvns enda icke-restricted produkt i kategorin)
    // har techRequired 2 — under agendaModerniseTechFloor (3, balance.json).
    state.officials['official-rvn-procurement']!.agenda = 'MODERNISE'
    state.factions['rvn']!.materielNeed.artillery = 100
    state.meta.turn = 0

    const { ctx, emitted } = makeCtx(state, 'orders-seed')
    orders(ctx)

    expect(state.market.openOrders.some((o) => o.buyerId === 'rvn' && o.productId === '105mm_field_gun')).toBe(false)
    expect(emitted.some((e) => e.headline.includes('UNMET NEED') && e.subjectId === 'rvn')).toBe(true)
  })

  it('MODERNISE tillåter en kategori vars produkt klarar teknikgolvet — ordern utlyses som vanligt', () => {
    const state = createInitialState('indochina-slice', 'seed')
    // ch3_transport_helicopter (aviation) har techRequired 4 — över golvet (3).
    // rvns eget techLevel.aviation (default 2, indochina-slice.json) räcker
    // inte till 4 ändå — höjs explicit så det bara är MODERNISE-golvet som
    // testas här, inte den redan befintliga techLevel-spärren.
    state.factions['rvn']!.techLevel.aviation = 4
    state.officials['official-rvn-procurement']!.agenda = 'MODERNISE'
    state.factions['rvn']!.materielNeed.aviation = 100
    state.meta.turn = 0

    orders(makeCtx(state, 'orders-seed').ctx)

    expect(state.market.openOrders.some((o) => o.buyerId === 'rvn' && o.productId === 'ch3_transport_helicopter')).toBe(true)
  })
})
