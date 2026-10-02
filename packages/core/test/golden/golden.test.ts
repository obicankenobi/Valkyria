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
  //
  // Omfryst IGEN i P57 (avsnitt 3.4/3.5/8, samma klart-når-krav). Faction fick
  // tre nya fält (trueBudgetCapFactor, weightsOverride, preferredSupplier) och
  // Official fick hasIssuedPolicyDecision -- ny form. Det nya politics-steget
  // (mellan factions och heat) kan från och med policyDecisionMinTurn (tur 4)
  // fatta ett PolicyDecision för varje tjänsteman vars agenda är ohörsammad --
  // EMBARGO/PRICE_CAP/TENDER_REFORM/LICENCE_REVIEW/PREFERRED_SUPPLIER kaskaderar
  // alla nedströms genom ordergenerering och/eller anbud. aggressive skickar nu
  // också BROKER (GK-A) när en tjänsteman är gynnsam. Genuin trajektorieändring,
  // inte bara formen. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P59 (avsnitt 4.1/4.2/8, samma klart-når-krav). Faction fick
  // ett nytt fält (relations) och Front fick ett nytt fält (status) -- ny form.
  // Front.status kan nu övergå war<->ceasefire (factions.ts:s nya
  // updateFrontStatuses), vilket stänger av HELA etapp 3:s stridskedja
  // (fronts.ts/attrition.ts) för den fronten så länge den varar -- den
  // STÖRSTA enskilda trajektorieändringen sedan P53b. relations rörs dessutom
  // varje leverans (deliveries.ts), varje STAGE_INCIDENT/BACK_CHANNEL
  // (political.ts) och varje tur (factions.ts:s passiva återhämtning) --
  // samtliga tre botpartiernas seeds påverkas. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P60 (avsnitt 4.3/8, samma klart-når-krav). Faction fick
  // ett nytt fält (counterIntelligence) -- ny form. LEAK/SABOTAGE/TURN gick
  // från avvisade no-ops till byggda (rör rival.relations/rival.
  // sabotagedUntilTurn/official.relationToPlayer/official.standing), och
  // INFLUENCE (helt nytt POLITICAL-op) rör publicSupport/relations -- alla
  // fyra nu faktiskt skickade av aggressive/balanced (GK-A). EXPAND:s
  // exposure-roll skalas dessutom om av counterIntelligence. headlines > 8
  // höll oförändrat.
  //
  // Omfryst IGEN i P82 (ETAPP7_TEKNISK_SPEC.md §2F, beslut 2F — uttryckligen
  // förhandsauktoriserat: "redeploy-mekaniken byggs ... som egen commit med
  // omfryst golden"). Formation.sectorId kan nu ändras mitt i partiet:
  // fronts.ts's nya redeployAfterBreakthrough() låter den VINNANDE sidan i
  // ett genombrott flytta ett förband in i den sektor där motståndaren står
  // svagast, samma genombrottströskel som redan flyttar front.position (inget
  // nytt balanstal -- balance.frozen.json oförändrat, verifierat). Ingen ny
  // form på GameState, bara ett fälts VÄRDE som kan ändras oftare -- en
  // härnessmätning (200 partier, alla fyra botpolicyer) visar 32,8 % av
  // genombrotten ger en omgruppering och att sektorkontroll (deriveSectorControl)
  // nu faktiskt byter sida i 100 % av partierna (mot P75s uppmätta 6,4 %) --
  // se docs/ANDRINGSLOGG.md för hela mätningen och den tidigare, strukturellt
  // ALDRIG utlösande designen (0 % av 1 827 genombrott) den ersätter.
  // headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P89 (ETAPP7_TEKNISK_SPEC.md §9/§13, "golden omfryst i denna
  // commit och ingen annan"). GameState.chronicle är ett nytt fält -- byggt av
  // resolveTurn() själv (resolve/index.ts) direkt efter PIPELINE-loopen, ur
  // exakt den turens råa, opruade WireEvent (se chronicle.ts:s egen kommentar
  // för varför det INTE kan vara ett PIPELINE-steg: ResolveContext exponerar
  // bara ctx.emit, aldrig en läsning tillbaka av samma turs redan emitterade
  // händelser). Ingen spelregel/balanssiffra rörd -- bara ny form (ett nytt,
  // hittills tomt-vid-tur-0 fält som fylls på i takt med partiet) och
  // därför en ny hash, precis som P48/P51/P59 m.fl. tidigare rena
  // formändringar. headlines > 8 höll oförändrat.
  //
  // Omfryst IGEN i P96 (ETAPP8_FORSLAG.md §3.1/§9, beslut 8C — förhandsauktoriserat, egen
  // commit efter koden). GameState.ledger är ett nytt fält (en rad per tur, skriven av de
  // penningflyttande stegen), en ren formändring: INNAN omfrysningen verifierades att
  // sluttillståndets hash UTAN ledger var bit-identisk med de gamla värdena i alla tre partier
  // (passive 13410cbd5a4b, aggressive 32259821910dc, balanced 72f55dcef5b0c) — inget annat
  // fält ändrades, ingen balanssiffra rördes (balance.frozen.json oförändrad). headlines > 8
  // höll oförändrat.
  //
  // Omfryst IGEN i P98 (ETAPP8_FORSLAG.md §4.1/§9, beslut 8C — förhandsauktoriserat, egen
  // commit efter koden). Förskottet ändrar banan (Order.advancePct/Contract.advancePaid är nya
  // fält OCH kassan får 27–37 % av intäkten redan vid tilldelning, så kassa-, kredit- och
  // ordervägen förskjuts). balance.json fick åtta nya tal (advancePctMin/-Max, tre vikter, två
  // normaliseringskonstanter) — balance.frozen.json följer med, annars vore första testet här rött.
  // De nya hasharna: passive 529fc6b53f3ba, aggressive 14211565c40155, balanced 847bd7d7bbcd.
  // headlines > 8 höll oförändrat (passive 48, aggressive 56, balanced 43).
  //
  // Omfryst IGEN i P99b (ETAPP8_FORSLAG.md, P99b-blockquoten, ägarbeslut 2026-09-29 —
  // förhandsauktoriserat, EN omfrysning, egen commit efter koden). EMBARGO-fällan rättas:
  // Official.relationToPlayer startar på policyDecisionRelationThreshold (30) i stället för 0, och
  // politics-steget varnar en tur före ett PolicyDecision (nytt fält Official.policyWarningTurn).
  // INNAN omfrysningen verifierades att sluttillståndets hash UTAN policyWarningTurn och med
  // A+B återställda var bit-identisk med P98:s (passive 529fc6b53f3ba, aggressive 14211565c40155,
  // balanced 847bd7d7bbcd) — ändringen är alltså exakt A, B och det nya fältet, inget annat.
  // balance.frozen.json speglar balance.json (bara en _p99b_note-sträng tillkom, inga tal).
  // De nya hasharna: passive 789113d09a625, aggressive 6962667e8cdde, balanced 3e3e27ba64cd6.
  // headlines > 8 höll oförändrat (passive 134, aggressive 61, balanced 39).
  //
  // Omfryst IGEN i P99c (ETAPP8_FORSLAG.md, P99c-blockquoten, ägarbeslut 2026-09-29 — alternativ A
  // efter P99b, förhandsauktoriserat, EN omfrysning, egen commit efter koden). Official.
  // relationToPlayer förfaller nu över tid (nytt fält Official.lastCourtedTurn, förfall i politics-
  // steget) och aggressive/balanced (harness) uppvaktar tjänstemän i riskzonen och spenderar de
  // kostsamma GK-A-verben bara ur överskott över grundkapitalet — båda ändrar banan. INNAN
  // omfrysningen verifierades kärnans del: med förfallet avstängt (grace 9999) och de gamla botarna
  // var sluttillståndets hash, utan lastCourtedTurn, bit-identisk med P99b:s (passive 789113d09a625,
  // aggressive 6962667e8cdde, balanced 3e3e27ba64cd6). balance.frozen.json speglar balance.json (tre
  // nya tal och en anteckning). De nya hasharna: passive 19da60a7a4ce76, aggressive 5d7419dee6d16,
  // balanced 79da51ef1da3a. headlines > 8 höll oförändrat (passive 72, aggressive 163, balanced 146).
  //
  // Omfryst IGEN i P99d (ägarbeslut 2026-09-29: FAVOUR får en verklig kostnad; omfrysningen bekräftad av
  // ägaren i samma veva, egen commit efter koden). House.favourMarginOwed är ett nytt fält och FAVOUR:s
  // kostnad dras nu från leveransintäkten (deliveries.ts). INNAN omfrysningen verifierades att passive —
  // som aldrig skickar FAVOUR — bara ändras av det nya fältet: utan favourMarginOwed är hashen bit-identisk
  // med P99c:s (19da60a7a4ce76). aggressive och balanced skickar FAVOUR (26 respektive 41 favörer och 14
  // avräkningar per golden-parti) och förskjuts därför på riktigt. balance.frozen.json oförändrad (inget nytt
  // balanstal). De nya hasharna: passive 4b56386427578, aggressive 174dd1a878059d, balanced aaf7115caebdf.
  // headlines > 8 höll oförändrat (passive 72, aggressive 172, balanced 155).
  //
  // Omfryst IGEN i P100 (ETAPP8_FORSLAG.md §5.1/§9, beslut 8C — förhandsauktoriserat, egen commit efter
  // koden). House.standingOrders är ett nytt fält (tre stående order-slag: linjeuppdrag, leverantörsavtal,
  // stationsläge). Ingen botpolicy skickar en stående order, så INNAN omfrysningen verifierades att
  // sluttillståndets hash UTAN det nya fältet är bit-identisk med P99d:s i alla tre partier (passive
  // 4b56386427578, aggressive 174dd1a878059d, balanced aaf7115caebdf) — befintliga botars beteende är
  // oförändrat, och omfrysningen speglar bara den nya fältformen. balance.frozen.json följer med (elva nya
  // tal). De nya hasharna: passive 11ad870a249092, aggressive 6a1a16e93ce0a, balanced 7cd16075822ce.
  // headlines > 8 höll oförändrat (passive 72, aggressive 172, balanced 155).
  //
  // Omfryst IGEN i P102 (ETAPP8_FORSLAG.md §6.1/§9, beslut 8C — förhandsauktoriserat, egen commit efter
  // koden). STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP och ASSASSINATE fick en kurva från belopp till effekt
  // (spendCurves.ts), och en bränd station öppnar en utredning (House.investigationUntilTurn, nytt fält).
  // aggressive och balanced skickar de fyra verben med fasta belopp (spend 0 för incident/back channel,
  // 1 000 000 för kupp, 500 000 för lönnmord) och deras utfall ändras — precis som specen förutsåg.
  // INNAN omfrysningen verifierades att passive, som aldrig skickar dem, bara ändras av det nya fältet: utan
  // investigationUntilTurn är hashen bit-identisk med P100:s (11ad870a249092). balance.frozen.json följer med
  // (tolv nya tal). De nya hasharna: passive ac66ac396a835, aggressive 1e42b914c3069f, balanced
  // 12e06615d26d5d. headlines > 8 höll oförändrat (passive 72, aggressive 169, balanced 155).
  //
  // Omfryst IGEN i P104 (ETAPP8_FORSLAG.md §7.2/§9, ägarbeslut 2026-09-30: "du får omfrysa golden" — P104 hade
  // stannat på att skyddsräcke 8.2 bara nämner P96/P98/P100/P102). Ändringen är exakt två dataposter, inget
  // annat (git diff verifierad): advancePctMin/Max 10/40 -> 5/30 (balance.json) och boardTarget.threshold
  // 2 -> 2,31 (indochina-slice.json); balance.frozen.json följer med (fyra rader: två tal, en anteckning).
  // Ingen kod rörd. De nya hasharna: passive 1deca8837b7ec4, aggressive 1b6a8b7573baeb, balanced
  // 1595f8a6ff97a1.
  //
  // Omfryst IGEN i P106 (ETAPP9_FORSLAG.md §4.1–4.2/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen
  // commit efter koden). Spelarens budpoäng får techTerm och specialiseringstermen EFTER computeScore
  // (bidTerms.ts), och ett forskningsprojekt i specialiseringen kostar halv rndOverhead. INNAN omfrysningen
  // verifierades att ändringen är exakt det: med de tre nya talen neutraliserade (techMarginWeight 0,
  // specialisationBidBonusPct 0, specialisationRndCostFactor 1) är alla tre hashar bit-identiska med P104:s.
  // balance.frozen.json följer med (fyra nya rader: en anteckning och tre tal). aggressive är oförändrad
  // (1b6a8b7573baeb) — dess tio turer bjuder inget där termen avgör. De nya hasharna: passive c60a1067590f3,
  // aggressive 1b6a8b7573baeb, balanced 1cfa09b74e3354.
  //
  // Omfryst IGEN i P107 (ETAPP9_FORSLAG.md §4.3–4.4/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen
  // commit efter koden). House.categoryQuality och House.researchHeadStart är nya fält i det hashade
  // sluttillståndet, och fullgjorda klass A/C-kontrakt samt leveranser in i krigsfronter rör dem. INNAN
  // omfrysningen verifierades att ändringen är exakt det: med de fem nya talen neutraliserade
  // (qualityCategoryGradeABonus 0, qualityCategoryGradeCPenalty 0, headStartPerShipment 0) och de två nya
  // fälten borttagna ur det hashade tillståndet är alla tre hashar bit-identiska med P106:s (c60a1067590f3,
  // 1b6a8b7573baeb, 1cfa09b74e3354). balance.frozen.json följer med (sex nya rader: en anteckning och fem tal).
  // De nya hasharna: passive 1fdf598fe6c117, aggressive b56647e507f30, balanced 1224ccdfc47d34.
  //
  // Omfryst IGEN i P108 (ETAPP9_FORSLAG.md §4.5/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen
  // commit efter koden). House.rndBidLock är ett nytt fält i det hashade sluttillståndet; forskningsspår
  // (stående order), krasprogrammet och chefsingenjörens projektkortning rör inget av de tre scriptade partierna
  // (ingen av dem lägger ett forskningsprojekt inom de 21 turerna: balanced når aldrig överskottsspärren). INNAN
  // omfrysningen verifierades att ändringen är exakt det: med det nya fältet borttaget ur det hashade tillståndet
  // är alla tre hashar bit-identiska med P107:s (1fdf598fe6c117, b56647e507f30, 1224ccdfc47d34).
  // balance.frozen.json följer med (nya rader: en anteckning och fem tal). De nya hasharna: passive
  // 3a5b3ed8d4bc, aggressive 16a19817a63401, balanced 15e1f3d04960ba.
  //
  // Omfryst IGEN i P109 (ETAPP9_FORSLAG.md §5.1–5.2/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen
  // commit efter koden). House.designs är ett nytt fält i det hashade sluttillståndet; stående order DESIGN, utfallet
  // och budtermen rör inget av de tre scriptade partierna (ingen bot ritar eller bjuder med en konstruktion). INNAN
  // omfrysningen verifierades att ändringen är exakt det: med det nya fältet borttaget ur det hashade tillståndet är
  // alla tre hashar bit-identiska med P108:s (3a5b3ed8d4bc, 16a19817a63401, 15e1f3d04960ba). balance.frozen.json följer
  // med (nya rader: en anteckning och nya tal). De nya hasharna: passive db2c6cf301dd0, aggressive 9fd1f1efb7f35,
  // balanced 1bb041a449d989.
  //
  // P110 (ETAPP9_FORSLAG.md §5.3/§12, beslut 9C — "regel"-prompt, egen commit): provning i egen regi och miljöbrister
  // lägger inget nytt obligatoriskt fält i sluttillståndet (StandingOrders.testing är valfritt och utelämnas tills en
  // provning sätts) och ingen bot provar något, så ALLA TRE HASHAR ÄR OFÖRÄNDRADE mot P109:s — det är verifierat, inte
  // antaget. Bara balance.frozen.json följer med (nya rader: en anteckning och två tal).
  //
  // P111 (ETAPP9_FORSLAG.md §5.4/§12, beslut 9C — "regel"-prompt, egen commit): köparens preferensmix och den relativa
  // bedömningen är rena funktioner över befintligt tillstånd (agenda, front, doktrin, tur) och lägger inget fält i
  // sluttillståndet; ingen bot bjuder med en konstruktion. ALLA TRE HASHAR ÄR OFÖRÄNDRADE mot P109:s/P110:s (verifierat).
  // Bara balance.frozen.json följer med (nya rader: en anteckning och tio tal).
  //
  // P112 (ETAPP9_FORSLAG.md §5.5/§12, beslut 9C — "regel"-prompt, egen commit): uppgraderingar och uppgraderingssatser
  // lägger inga obligatoriska fält i sluttillståndet (Bid.kit, Contract.kit och upgradeOf är valfria och utelämnas) och
  // ingen bot ritar eller bjuder med en sats. ALLA TRE HASHAR ÄR OFÖRÄNDRADE mot P109:s (verifierat). Bara
  // balance.frozen.json följer med (nya rader: en anteckning och sex tal).
  //
  // Omfryst IGEN i P113 (ETAPP9_FORSLAG.md §5.6/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter
  // koden). House.investigations är ett nytt fält i det hashade sluttillståndet; olycksfall, utredningskortet och
  // standardförnekandet rör inget av de tre scriptade partierna (ingen bot levererar en konstruktion). INNAN omfrysningen
  // verifierades att ändringen är exakt det: med det nya fältet borttaget ur det hashade tillståndet är alla tre hashar
  // bit-identiska med P109:s–P112:s (db2c6cf301dd0, 9fd1f1efb7f35, 1bb041a449d989). balance.frozen.json följer med (nya
  // rader: en anteckning och tio tal). De nya hasharna: passive c799ecdd5bd39, aggressive 8b4c7721789cc, balanced
  // da588da434161.
  //
  // P114 (ETAPP9_FORSLAG.md §6.1–6.2/§12, beslut 9C — "regel"-prompt, egen commit): kvalitet i striden och fältrykte skrivs i
  // VALFRIA fält (Front.equipmentQuality/designUnits) som utelämnas tills en konstruktion levereras, och ingen bot levererar
  // en. ALLA TRE HASHAR ÄR OFÖRÄNDRADE mot P113:s (verifierat). Bara balance.frozen.json följer med (nya rader: en anteckning
  // och tio tal).
  //
  // P115 (ETAPP9_FORSLAG.md §6.4/§12, beslut 9C — "regel"-prompt, egen commit): FIELD_TRIAL lägger bara valfria fält på Design
  // (trials, exposedToRivals) och ingen bot skickar verbet. ALLA TRE HASHAR ÄR OFÖRÄNDRADE mot P113:s (verifierat). Bara
  // balance.frozen.json följer med (nya rader: en anteckning och fem tal).
  //
  // Omfryst IGEN i P116 (ETAPP9_FORSLAG.md §6.5/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter
  // koden). Till skillnad från P109–P115 ÄNDRAS de scriptade partierna på riktigt: när en köpare huset har ett kontrakt med
  // vinner ett genombrott överlämnar den fiendens erövrade materiel (House.capturedMateriel, nytt valfritt fält, och en
  // rubrik per överlämning) — det händer i alla tre partier (passive 7, aggressive 7, balanced 7 genombrott). En ren
  // strippning av fältet går därför inte att jämföra bitvis (rubrikerna flyttar wire-id:n), så attributionen gjordes på
  // det andra sättet: med den ENA hook-raden i fronts.ts (handleBreakthroughCaptures) bortkommenterad är alla tre hashar
  // bit-identiska med P113:s (c799ecdd5bd39, 8b4c7721789cc, da588da434161) — inget annat i P116 (kopiering, verbet) rör
  // partierna. balance.frozen.json följer med (nya rader: en anteckning och sju tal). De nya hasharna: passive
  // 3952e3b974b05, aggressive 143653a4a5c867, balanced 92d255177e644.
  //
  // Omfryst IGEN i P117 (ETAPP9_FORSLAG.md §6.3/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter
  // koden). De scriptade partierna ändras på riktigt: rivalerna får konstruktioner enligt schema (meridian tur 4 och 11, brandt 6
  // och 13, costigan 8 och 15; RivalHouse.designs, en rubrik per konstruktion), vilket ger rivalens rykte en kvalitetsbonus i
  // sin kategori och motmedelsefterfrågan hos motsatta blockets köpare. Med den ENA raden `processRivalDesigns(ctx)` i rivals-
  // steget bortkommenterad är alla tre hashar bit-identiska med P116:s (3952e3b974b05, 143653a4a5c867, 92d255177e644) — inget
  // annat i P117 (nyhetsvärde, utfasning, motmedelsforskning, counterBidTerm) rör partierna, eftersom ingen bot har konstruktioner.
  // balance.frozen.json följer med (nya rader: en anteckning och tio tal). De nya hasharna: passive 9d17c10fad501, aggressive
  // 3e99092d65ea5, balanced d72eaa2ef55c5.
  //
  // Omfryst IGEN i P118 (ETAPP9_FORSLAG.md §7.1/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt: GameState.race är nytt tillstånd, rivalkonstruktionernas `generation` får en ny källa
  // (blockens generation i stället för P109:s tidsschema), och generationsskiftena (rubrik per steg, tur 4/8/12/16) och
  // påskyndningarna (counterReaction) är nya händelser. Attribution: med `advanceRace` och `accelerateBlocStep` avstängda och
  // `race` struket ur det hashade tillståndet är wire och tillstånd bit-identiska med P117:s utom RivalDesign.generation (5–6
  // rader per parti) — ändringen är alltså exakt det prompten beskriver. balance.frozen.json följer med (nya rader: en
  // anteckning, fyra tal och schemat; generationStepTurns borttagen). De nya hasharna: passive 17adc8e53f9211, aggressive
  // 1fb8a6c8527ab9, balanced c5d1cc24ee7f9.
  //
  // Omfryst IGEN i P119 (ETAPP9_FORSLAG.md §7.2/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt, men bara av GAP-CHOCKEN: när ett block tar ett steg det andra inte matchar (tur 4:
  // artilleri öst och marin väst, och senare steg) får köparna på den eftersläpande sidan ett överpris och ett förskottspåslag på
  // sina ordrar i kategorin, och rubriken GAP SHOCK tillkommer. Attribution med tre körningar: gap-chocken och claimFirstInPlace
  // båda avstängda — bit-identiska med P118:s hashar (17adc8e53f9211, 1fb8a6c8527ab9, c5d1cc24ee7f9); bara gap-chocken avstängd —
  // också identiska med P118:s (alltså sker INGEN först-på-plats-claim i något scriptat parti: botarna har inga konstruktioner);
  // bara claimen avstängd — samma nya hashar som med allt på. balance.frozen.json följer med (nya rader: en anteckning och tio
  // tal). De nya hasharna: passive 1a030467da4f13, aggressive 191569dec71a53, balanced 149707a8a20d95.
  //
  // Omfryst IGEN i P120 (ETAPP9_FORSLAG.md §7.3/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt, men bara av RYKTESLOTTERIET: vid varje generationsskifte drar `maybeRumour` ctx.rng
  // (falseGapChancePct) och flyttar därmed hela slumpströmmen; inga LEAK-handlingar förekommer i partierna. Attribution: med den
  // enda raden i `maybeRumour` avstängd är alla tre hashar bit-identiska med P119:s (1a030467da4f13, 191569dec71a53,
  // 149707a8a20d95). balance.frozen.json följer med (nya rader: en anteckning och åtta tal). De nya hasharna: passive
  // 1620f95a2f0ff7, aggressive feede904471ab, balanced b6ee913fa1cb6.
  //
  // Omfryst IGEN i P121 (ETAPP9_FORSLAG.md §7.4/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt: varje generationsskifte och gap-chock lägger på doomsday (i alla tre partier), och
  // `checkBothSides` märker att huset säljer till båda sidorna (i aggressive- och balanced-partierna men inte i passive-partiet;
  // ingen vapenvila förekommer). Attribution: med doomsday-kopplingen, checkBothSides och vapenviloblocket avstängda är alla tre
  // hashar bit-identiska med P120:s (1620f95a2f0ff7, feede904471ab, b6ee913fa1cb6); med bara checkBothSides och vapenvilan avstängda
  // är passive-hashen oförändrad medan aggressive och balanced skiljer sig. balance.frozen.json följer med (nya rader: en anteckning
  // och tre tal). De nya hasharna: passive 10d0bd19b58ec, aggressive 13f7efa0f046f1, balanced 25bf2c27b8ee1.
  //
  // Omfryst IGEN i P122 (ETAPP9_FORSLAG.md §8.1/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt: kravkortet vid tur 3 utlöser en anbudsinfordran (GameState.programmes, nytt valfritt
  // fält) i alla tre partier, den går genom alla faser och en rival vinner serien (ingen bot anmäler sig). Attribution: med
  // `maybeAnnounceProgramme` avstängd är alla tre hashar bit-identiska med P121:s (10d0bd19b58ec, 13f7efa0f046f1, 25bf2c27b8ee1).
  // balance.frozen.json följer med (nya rader: en anteckning och 28 tal). De nya hasharna: passive 1b2c349323f2fb, aggressive
  // 1fee8803ac1293, balanced 1f93a9463ff254.
  //
  // Omfryst IGEN i P123 (ETAPP9_FORSLAG.md §8.1/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt, men bara av PROVETS MÄTNING: varje deltagare mäts med tre `ctx.rng`-drag (prototypfaktor
  // och mätbrus) vid provet, vilket flyttar slumpströmmen i de tre partierna (en rival vinner provet i alla tre; ingen bot anmäler sig,
  // så miljöbrist, protokoll, motköp och rykte rör inte partierna). Attribution: med dragen avstängda är alla tre hashar bit-identiska
  // med P122:s (1b2c349323f2fb, 1fee8803ac1293, 1f93a9463ff254). balance.frozen.json följer med (nya rader: en anteckning och nio tal).
  // De nya hasharna: passive 774bcc2a4d22a, aggressive 66f6cad930cb8, balanced b61ca2e747ed5.
  //
  // Omfryst IGEN i P124 (ETAPP9_FORSLAG.md §8.2/§12, beslut 9C — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt, men bara av RIVALERNAS FUSKDRAG: vid provstart drar `rivalsCheat` ett ctx.rng-drag per
  // rival (programmeRivalCheatPct per temperament) och flyttar därmed slumpströmmen; ingen bot använder knepen, anmäler eller bjuder
  // motköp. Attribution: med `rivalsCheat` avstängd är alla tre hashar bit-identiska med P123:s (774bcc2a4d22a, 66f6cad930cb8,
  // b61ca2e747ed5). balance.frozen.json följer med (nya rader: en anteckning och 22 tal). De nya hasharna: passive 8bd0a4cc97a96,
  // aggressive 1ffcde769af96b, balanced 564be11a60fa2.
  //
  // Omfryst IGEN i P125 (ETAPP9_FORSLAG.md §8.3/§8.4/§12, beslut 9C och 9N — förhandsauktoriserat "regel"-prompt, egen commit efter koden).
  // De scriptade partierna ändras på riktigt: rivalernas P124-spår kommer fram och ger följder, huset får +4 integritet var 4:e tur
  // (`House.reputation.integrity`, nytt obligatoriskt fält) och FAVOUR/BRIBE/BROKER/budmutor skriver nu spår. Attribution: med
  // `advanceTraces`, `openArchives`, `integrityBidTerm` och de nya spårkällorna (favour, bribe, broker, bidBribe, legal) avstängda, och
  // `reputation.integrity` struket ur det hashade tillståndet, är alla tre hashar bit-identiska med P124:s (8bd0a4cc97a96, 1ffcde769af96b,
  // 564be11a60fa2). balance.frozen.json följer med (nya rader: en anteckning och 28 tal). De nya hasharna: passive 17d301750e44ea,
  // aggressive 16c3ae1aa99888, balanced 7b4739c6ea139.
  // Omfryst IGEN i P130 (ETAPP9_FORSLAG.md §10/§12, balanspass A–E). OBS: P130 är typad "data", inte "regel" — omfrysningen är ett eget beslut av
  // kodsessionen (ägarens uppdrag 2026-10-02: "dyker det upp något jag hade behövt besluta tar du ett eget beslut och återkopplar"), i egen commit.
  // Attribution: bara `boardTarget.threshold` 2,31 → 2,45 (indochina-slice.json) rör de scriptade partierna (styrelsegranskningen); med
  // `designBidWeight` 6 i stället för 40 är alla tre hashar bit-identiska med de nya (golden-botarna ritar inga konstruktioner), och med BÅDA
  // gamla värden är de bit-identiska med P125:s. balance.frozen.json följer med (en ny anteckning och ett ändrat tal).
  // De nya hasharna: passive 63048b0971ece, aggressive 9b9662250ca4a, balanced 9ebe54ccbc404.
  const cases: { policyName: 'passive' | 'aggressive' | 'balanced'; seed: string; expectedHash: string }[] = [
    { policyName: 'passive', seed: 'golden-passive-p22', expectedHash: '63048b0971ece' },
    { policyName: 'aggressive', seed: 'golden-aggressive-p22', expectedHash: '9b9662250ca4a' },
    { policyName: 'balanced', seed: 'golden-balanced-p22', expectedHash: '9ebe54ccbc404' },
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
