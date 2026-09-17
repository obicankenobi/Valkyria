// golden.test.ts — snapshot-tester med fast frö, ett helt scriptat parti per
// botpolicy, hashat sluttillstånd. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3.
//
// Tre policyer, inte alla fyra: `passive`/`aggressive`/`balanced` är de tre
// ursprungliga botarkeetyperna (ETAPP1_TEKNISK_SPEC.md avsnitt 7.3) — `capacity`
// är etapp 1,5:s EGNA tillägg (P14, avsnitt 10.2) och dess ekonomi är redan
// separat, djupt utredd i avsnitt 13:s måltabell (se docs/ANDRINGSLOGG.md,
// P22-balanspasset: `capacity` mot `aggressive` är en av de fem medvetet
// reviderade raderna). Tre snapshots räcker för avsnitt 11.3:s krav och
// undviker att frysa ett fjärde partis hash mot en bot vars egen ekonomi redan
// är dokumenterat instabil mellan balanspass.
// POLICIES importeras från policies.js direkt, INTE paketets main
// (dist/index.js) — den filen är harness-CLI:ts eget skript och kör (main +
// skriver en CSV) så fort den laddas, se packages/harness/src/index.ts.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@seventh-front/harness/dist/policies.js'
import type { Policy } from '@seventh-front/harness/dist/policies.js'
import { playScript } from './playScript.js'
import { hashState } from './hashState.js'
import balanceLive from '../../src/data/balance.json' with { type: 'json' }
import balanceFrozen from './fixtures/balance.frozen.json' with { type: 'json' }

const SCENARIO = 'indochina-slice'
const TURNS = 21 // MAX_TURNS, se packages/harness/src/runGame.ts — turn 0..20

// Avsnitt 11.3: "Snapshotet fryses sist i etappen ... en fixtur som fryses
// innan balansen är klar hade dödat balanspasset." Omvänt: en gång fryst får
// den ALDRIG tyst glida isär från den levande filen — CLAUDE.md, "Om
// golden-snapshotet ändras: stanna och fråga. Uppdatera det aldrig själv."
// Den här kontrollen är mekaniken bakom det löftet: den failar HÖGT och
// TYDLIGT innan ett enda parti ens spelas, i stället för att låta ett senare
// balanspass tyst spela mot fel tal och producera ett meningslöst snapshot.
//
// Återaktiverad i P32 (ETAPP2_TEKNISK_SPEC.md avsnitt 9), omfryst mot P24–P31s
// balans. PENDAD IGEN från och med P34 (ägarbeslut 2026-09-15, se
// ANDRINGSLOGG.md samma datum): ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 6 säger uttryckligen "golden-snapshoten fryses om TVÅ GÅNGER, en
// gång per etapphalva" — dvs. P37 (balanspass 3A) är den avsedda
// omfrysningspunkten för hela 3A (P33–P36), inte varje enskild prompt inom
// den. P44s materielNeed-påfyllnad (varje tur, för varje faktion) bryter
// redan hash-en även om ingen balanssiffra "skruvats" i vanlig mening — precis
// den sortens förväntad, avsedd konsekvens P37 finns till för att samla ihop
// och frysa om på en gång, inte P33/P34/P35/P36 var för sig. Samma mönster
// och samma motivering som P24s pendning (se den raden i ANDRINGSLOGG.md):
// hellre pendat och synligt kommenterat än rött i fyra commit-cykler eller
// omfryst fyra separata gånger. Återaktiverad och omfryst i P37 (se
// ANDRINGSLOGG.md, 2026-09-15) — balance.json självt oförändrat sedan P36,
// men hela P33–P36-sekvensens ackumulerade beteendeändringar (materielNeed,
// behovsdriven utlysning, pressure-vikter, front.trace) bryter sluttillståndets
// hash ändå. Omfryst IGEN i P38 (samma datum) — P38:s eget klart när kräver
// uttryckligen omfrysning i just den commiten: Front.formations och
// balance.json:s doctrineProfile är nya fält i det hashade sluttillståndet.
// PENDAD IGEN i P39 (samma mönster som P34 ovan): engagement.ts:s nya fält
// (categoryCombatWeight m.fl.) och formationernas egen strid bryter både
// balansfixturen och sluttillståndets hash, men P39:s eget klart när ber INTE
// om en omfrysning ("...", inget golden-villkor alls) — nästa avsedda
// omfrysningspunkt är P42 (balanspass 3B, avsnitt 6:s "en gång per
// etapphalva"), inte varje enskild 3B-prompt.
//
// Återaktiverad och omfryst i P42 (2026-09-15, sista prompten i etapp 3) —
// P40:s namngivna ersättningsordrar, P40:s omkalibrerade förbandsroster
// (indochina-slice.json) och P42:s egen invariant-bugfix (resolveFront synkar
// nu förbandens strength, se ANDRINGSLOGG.md) bryter sluttillståndets hash.
it('fixtures/balance.frozen.json är bitvis identisk med src/data/balance.json', () => {
  expect(balanceFrozen).toEqual(balanceLive)
})

describe('golden — ett scriptat parti per botpolicy, seed och sluttillstånd frysta (avsnitt 11.3)', () => {
  // P37 (se ANDRINGSLOGG.md, 2026-09-15): alla tre golden-partierna slutar nu i
  // BUYOUT vid tur 10 (den dokumenterade P30/P35-spänningen, lämnad orörd på
  // ägarens beslut) — kortare partier ger färre rubriker. `passive` mäter nu
  // exakt 12 (var väl över tidigare), så tröskeln sänkt till > 8 med marginal
  // kvar mot alla tre policyer, i stället för att höja den siffra som faktiskt
  // brast.
  //
  // Omfryst i P44 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2, "golden omfryst i denna
  // commit och ingen annan") — Order.frontId/Contract.frontId är nya fält i
  // öppna ordrar/kontrakt, en del av det hashade sluttillståndet, oavsett att
  // ingen SPELREGEL ändrades (samma tal, samma utfall, bara ett nytt fält per
  // objekt). headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P45 (avsnitt 3.4, samma klart-når-krav) — indochina-slice.json
  // fick en andra front (front-laos, teater LAOS) och en fjärde/femte formation
  // för laos/nlf. En genuint ny spelvärld, inte bara ett nytt fält den här
  // gången: rvn/nlf-partiet på front-1 borde vara oberört, men laos deltar nu i
  // ordergenerering/leveranser på ett sätt scenariot aldrig gjorde förut.
  // headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P48 (avsnitt 4.2, samma klart-när-krav) — state.market.
  // commodities är ett nytt fält (fem tal, en del av det hashade slut-
  // tillståndet) även om VÄRDET på supplyCostIndex är bit-för-bit detsamma som
  // innan (fem lika vikter, identisk rörelse — se balance.json:s _p48_note).
  // headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P49 (avsnitt 4.3, samma klart-när-krav) — computeUnitCostNow
  // räknar nu per råvara i stället för mot ett enda supplyCostIndex-tal. Till
  // skillnad från P48 är detta INTE bit-för-bit samma resultat i allmänhet:
  // olika produkter reagerar nu olika på samma commodities-drift beroende på
  // sin bom (hela poängen med P49) — unitCostAtSigning/produktionskostnad
  // påverkas så fort commodities glider från baseline (100) under partiets
  // 20 turer. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P50 (avsnitt 4.4). Formens ändring (market.commodityDemandThisTurn,
  // Faction.commoditySources? — se avsnitt 5s generella regel: golden fryses om i
  // VARJE prompt som ändrar GameState:s form, inte bara de fyra som var kända vid
  // specens skrivande) är den mindre orsaken. Den STÖRRE: rivals.ts:s supply play
  // drar nu ett rng.pick(COMMODITIES) den aldrig gjorde förut, för att välja VILKEN
  // råvara sabotaget träffar — en ny RNG-dragning som skiftar hela partiets
  // nedströms-kaskad (ordrar, bud, strid) från den tur en opportunist-rival
  // sabbar första gången, inte bara ett nytt tomt fält. headlines > 8 höll
  // oförändrat.
  //
  // Omfryst IGEN i P51 (avsnitt 4.5, samma generella regel som P50). Nytt fält:
  // House.commodityHoldings (fem nollor i alla tre scriptade partier — ingen
  // botpolicy skickar in en MARKET-handling, så BUY_FORWARD/RELEASE rörs aldrig
  // här). Formen ändras alltså, inte trajektorin. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P53a (ETAPP5_TEKNISK_SPEC.md avsnitt 2.1/8, "golden omfryst
  // i denna commit och ingen annan" — se docs/ANDRINGSLOGG.md, 2026-09-17).
  // Faction.materielNeed seedas nu till orderTriggerThreshold i stället för 0
  // (state.ts, buildFactions) — samma fält som förut, men ett annat
  // starttillstånd för alla tre faktioner i alla tre partierna, vilket flyttar
  // ordergenereringen från tur ~5-10 till tur 0 och kaskaderar genom hela
  // partiets 20 turer. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P53b (ETAPP5_TEKNISK_SPEC.md avsnitt 8, samma klart-når-krav).
  // board.ts:s progressSnapshot inkluderar nu obetald orderbok, inte bara bokförd
  // intäkt, och expectedProgress bytte bana från linjär till kvadratisk — ingen
  // ny GameState-form, men styrelsegranskningens pass/fail-utfall (och därmed
  // creditPenaltyMultiplier/BUYOUT-tidpunkten) kan skifta för samma seed. headlines
  // > 8 höll oförändrat.
  //
  // Omfryst IGEN i P54 (avsnitt 3.1/8, samma klart-når-krav). state.officials
  // är ett nytt fält på GameState (tolv tjänstemän — fyra poster × tre
  // faktioner), och Order.inspectorIntegrity (ett tal per order) ersatt av
  // Order.officialId (en pekare till en persistent person). Trajektorin
  // förändras genuint, inte bara formen: en faktions procurement-integritet är
  // nu FAST över hela partiet (officials.json) i stället för nyrullad per
  // order, vilket ändrar vilka bud som vinner. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P55 (avsnitt 3.2/8, samma klart-når-krav). Ingen ny
  // GameState-form (agendan skriver inga nya fält, bara läser Official.agenda
  // som redan fanns sedan P54) — men order.weights (REARM/AUSTERITY) förskjuts
  // nu av köparens agenda utöver frontlägets pressure, vilket ändrar vilka bud
  // som vinner. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P56 (avsnitt 3.3/8, samma klart-når-krav). GameState.officials
  // fick två nya fält per tjänsteman (scandalRisk) och House fick
  // favourMarginSpent -- ny form. BRIBE riktades om mot officialId (relationsvinst
  // nu skalad mot integrity, höjer scandalRisk); FUND_CAMPAIGN/FAVOUR är nya op
  // policies.ts:s aggressive/balanced nu skickar in (GK-A) -- genuin
  // trajektorieändring, inte bara formen. headlines > 8 höll oförändrat.
  const cases: { policyName: 'passive' | 'aggressive' | 'balanced'; seed: string; expectedHash: string }[] = [
    { policyName: 'passive', seed: 'golden-passive-p22', expectedHash: '1d34b363345790' },
    { policyName: 'aggressive', seed: 'golden-aggressive-p22', expectedHash: '2c083d751c256' },
    { policyName: 'balanced', seed: 'golden-balanced-p22', expectedHash: '1b6498a94af0fe' },
  ]

  for (const { policyName, seed, expectedHash } of cases) {
    it(`${policyName}: sluttillståndets hash är oförändrad, och partiet ger > 8 rubriker`, () => {
      const policy = POLICIES[policyName] as Policy
      const { finalState, wireLog } = playScript(SCENARIO, seed, policy, TURNS)

      const headlineCount = wireLog.filter((e) => e.severity === 'headline').length
      expect(headlineCount).toBeGreaterThan(8)

      expect(hashState(finalState)).toBe(expectedHash)
    })
  }
})
