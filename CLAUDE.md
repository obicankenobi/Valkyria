# THE SEVENTH FRONT

Turbaserad kallakrigssimulator. TypeScript, strict. Kärnan är headless och ren.

Designdokumentet är `docs/DESIGN.md`. Den tekniska specen för etapp 1 är
`docs/ETAPP1_TEKNISK_SPEC.md` (P0–P12, klar). Etapp 1,5, `docs/ETAPP1_5_TEKNISK_SPEC.md`
(P13–P22), är också klar. Etapp 2, "Motståndet", `docs/ETAPP2_TEKNISK_SPEC.md` (P23–P32), är
ÄVEN DEN klar — se avsnitt 6.3:s blockquote för balanspassets fulla facit (fem av åtta
fetstilta rader nådda, tre strukturellt reviderade). Etapp 3, "Kriget som marknad",
`docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` (P33–P42, antagen som ägarbeslut 2026-09-15,
validerad mot commit `e650be2`) är **KLAR — alla tio prompter (P33–P42) kördes klart samma
datum.** Den ersätter `orderGenerationChancePct`s tärningsdrivna ordergenerering med en
behovsdriven modell kopplad till materielförluster på fronten, i två halvor: 3A (förbrukning,
P33–P37) och 3B (namngivna förband, `Formation`, P38–P42). Se specens egna avsnitt 0–1 för de
fyra mätta fynd den bygger på, och avsnitt 8:s måltabell/blockquotes för balanspassens fulla
facit (P37 för 3A, P42 för 3B). Etapp 4, "Två krig, en kassabok",
`docs/ETAPP4_TEKNISK_SPEC.md` (P43–P52, antagen som ägarbeslut 2026-09-15, validerad mot
commit `42bb924`) är **KLAR — alla tio prompter (P43–P52) kördes klart 2026-09-16.** Den
bygger vidare på 3B:s förband i två oberoende halvor: 4A (en andra front, ny teater `LAOS`,
P43–P47) och 4B (råvarumarknaden — fem spor i stället för en enda `supplyCostIndex`-siffra,
P48–P52). `BUYOUT`-kaskaden (`board.ts`s linjära intäktsmål mot `orders.ts`s behovsdrivna
ordrar, etapp 3) är **fortfarande inte löst** — P47 (4A) och P52 (4B) svarade båda nej på
"löser den här etappens mekanik kaskaden?" (`SCENARIO_COMPLETE` 0/200 i båda mätningarna,
200/200 partier `BUYOUT` på exakt en enda tur, 10 i P47 och 11 i P52 — skiftet är en RNG-
kaskad från P50:s nya `rng.pick`-dragning i `rivals.ts`, inte en ny orsak). Fjärde gången
frågan ställts sammantaget (P37, P42, P47, P52); ägaren har fyra gånger valt att lämna
`boardTarget` orört och revidera måltabellrader i stället, se specens avsnitt 7. P52 hittade
också två egna, separata frågor utanför kaskaden — **båda avgjorda av ägaren 2026-09-16**, se
avsnitt 7:s P52-blockquote: `supplyIndexMaxStep` (ett delat, etapp 1,5-tal — inte ett
P50/P51-tillägg) begränsar hur mycket en enskild råvara kan röra sig per tur, vilket gör
måltabellens "spridning mellan dyraste/billigaste råvara"-rad onåbar oavsett hur mycket P50s
drivare skruvas (diagnostiskt verifierat: en 250× högre `warDemandCommodityCoupling` flyttade
snittkvoten bara 1,065 → 1,079) — **lämnas orört**, samma linje som `boardTarget`. `BUY_FORWARD`
(P51) är en platt, icke prisindexerad £-för-£-pool — mekaniken kan strukturellt aldrig vara
"olönsam" i den mening måltabellens egen rad förutsätter — **lämnas som är, frågan stängd**: den
platta poolen är den avsedda tolkningen, inte ett provisorium som väntar på en omskrivning. Se
specens avsnitt 1 för de fem premisskontrollerade fynd den bygger på (bl.a. att
`computePressureForFront` har samma "tar första matchande front"-brist som `deliveries.ts`s
`findFrontForBuyer` redan hade, och att `supplyCostIndex` kan bli ett härlett aggregat av de
fem råvarorna utan att röra `computeReferencePrice`). Avsnitt 10 protokollför de tre besluten
som togs vid antagandet: `DESIGN.md` avsnitt 16 uppdateras i samma commit som P45 (den raden
beskriver `INDOCHINA_SLICE` som enfronts, vilket P45 upphäver); `boardTarget`/`BUYOUT`-
kaskaden (se nästa stycke) lämnas orörd, med "löser andra fronten den?" som en mätbar rad i
P47:s måltabell snarare än ett antagande; namnet var "Två krig, en verkstad" i förslaget.
Etapp 1, 1,5, 2, 3 och 4 lämnas stående som historik. Etapp 5, "Näst mäktigast i rummet",
`docs/ETAPP5_TEKNISK_SPEC.md` (P53–P64, antagen som ägarbeslut 2026-09-16, validerad mot commit
`701c56a`) är den **aktiva** specen — **5A (P53–P58) helt klar, P59 (5B) klar (2026-09-17), P60
är nästa steg.** Den ger
designdokumentets tredje pelare ("du är alltid näst mäktigast i rummet") dess första mekanik, i
två oberoende halvor: 5A (`Official` — köparnas tjänstemän får namn, minne och agendor, ersätter
den hittills anonyma `Order.inspectorIntegrity`, P54–P58 — **P54 BYGGD 2026-09-17**: `Official`/
`Post`/`Agenda`-typerna, `GameState.officials`, `officials.json` (fyra tjänstemän per faktion),
`Order.officialId` ersätter `inspectorIntegrity`, `computeScore` i `pricing.ts` HELT ORÖRD
[skyddsräcke 2] — bara källan för integritetstalet flyttad. Golden omfryst, se
`docs/ANDRINGSLOGG.md`. **P55 BYGGD 2026-09-17**: `Agenda` viktar affären — REARM/AUSTERITY
skiftar `order.weights` (andra viktskiftare vid sidan av `weightPressureShift`), MODERNISE
diskvalificerar produkter under ett techgolv, NON_ALIGNMENT fördubblar `blocTerm`
(`bidding.ts`/`queries.ts`), SELF_ENRICHMENT kräver ingen ny kod (redan i `officials.json`s
startdata). Golden omfryst, se `docs/ANDRINGSLOGG.md`. **P56 BYGGD 2026-09-17**: `Official.
scandalRisk`/`House.favourMarginSpent` (nya fält). `PlayerAction`s `POLITICAL`-variant delad i
tre (skyddsräcke 3: `BRIBE`/`FUND_CAMPAIGN` tar `officialId`, `FAVOUR` tar `officialId`+
`marginCost`, `STAGE_INCIDENT`/`BACK_CHANNEL` behåller `targetFactionId` — `PlayerAction['type']`
oförändrad, skyddsräcke 4 intakt). `applyActions.ts` (568 rader) sprängdes — POLITICAL utbruten
till ny `resolve/political.ts`, ner till 427 rader (samma mönster som P23:s `crisis.ts`/
`upkeep.ts`). BRIBE riktades om (relationsvinst skalad mot låg integritet, höjer `scandalRisk`,
taket nu per tjänsteman). FUND_CAMPAIGN/FAVOUR nya — vardera en bot (skyddsräcke 4/GK-A).
Golden omfryst, se `docs/ANDRINGSLOGG.md`. **P57 BYGGD 2026-09-17**: nytt steg `politics.ts`
(mellan `factions`/`heat`, ägarbeslutet) — ett fast, PROVISORISKT agenda→`PolicyDecision`-schema
(REARM→TENDER_REFORM, AUSTERITY→PRICE_CAP, MODERNISE→LICENCE_REVIEW, NON_ALIGNMENT→EMBARGO,
SELF_ENRICHMENT→PREFERRED_SUPPLIER); `EMBARGO` är `Faction.embargoed`s FÖRSTA skrivare (fynd
1.7); `PREFERRED_SUPPLIER` går i den här triggern alltid till en rival, aldrig spelaren.
`BROKER` byggd (den sista helt tysta grenen) — direktkontrakt förbi `computeScore`, avgjort av
köparens procurement-tjänstemans relation/integrity; `bidding.ts` fick en poängbonus adderad
EFTER `computeScore` (skyddsräcke 2 intakt). **Genuint fynd under bygget**: `Official.
relationToPlayer` startar på 0 för alla, så en obehandlad grind gjorde "ohörsammad" sant redan
tur 1 och bröt två av etapp 3/4:s gröna invarianttester (skyddsräcke 5) — fixat med ett nytt
PROVISORISKT balanstal `policyDecisionMinTurn` (4). `aggressive` (harness) fick
`brokerFavourableDeal` (skyddsräcke 4/GK-A). Golden omfryst, se `docs/ANDRINGSLOGG.md`. **5A:s
kodbygge (P54–P57) är därmed klart. **P58 MÄTT 2026-09-17**: härnessmätning n=200/`balanced`
mot avsnitt 7:s fem 5A-rader — tre träffar (agendan ändrar vinnaren, minst ett
`PolicyDecision`, `FAVOUR` trots bättre alternativ) utan att röra `balance.json`/scenariodata.
Två strukturella missar, INGEN fixad med kalibrering (båda kräver kod, inte data, och P58 är
uttryckligen "ingen kod"): tjänsteman-byts-ut 0 % (`replaceOfficial` från P54 har aldrig fått
en live-utlösare — varken P56 eller P57 byggde den `officials.ts`s egen kommentar förutsatte)
och `EMBARGO` 100 % (`Policy` saknar rng, så `balanced`s `favourBestRelationOfficial` skyddar
deterministiskt exakt samma tjänsteman i alla 200 partier — bimodalt 0/100 %, aldrig
10–30 %-intervallet, verifierat). Samma "strukturellt onåbar"-linje som P52:s
`supplyIndexMaxStep` — dokumenterat, inte byggt runt. **5A (P53–P58) är därmed helt klar.**) och
5B (länder som aktörer — `Faction.
relations`, `Front.status`, `FUND_COUP`, `ASSASSINATE`, P59–P63). **P53 reviderad 2026-09-17,
innan den kördes** (ägaren bad om en långsiktig lösning på `BUYOUT`-kaskaden, inte en tillfällig
fix) — mätning visade att en ren `boardTarget`-omkalibrering, specens ursprungliga plan, inte
hade räckt: alla fyra botpolicyer har 0 kr bokförd intäkt vid FÖRSTA granskningsturen (tur 6, mot
ett krav på 2,16 Mkr), och utan granskningen dör tre av fyra ändå i `INSOLVENCY` (tur 15–17) —
grundorsaken är att `Faction.materielNeed` startar på 0, vilket ger noll ordrar turerna 1–4 medan
husets fasta kostnader (429 000 kr/tur) redan löper. Mätningen visade också att alla fyra
kaskadmätningarna hittills (P37/P42/P47/P52) kördes mot botpolicyn `balanced`, som bara tar 9,7 %
av marknaden — `aggressive` (45 %) överlever hela scenariot.
**P59 BYGGD 2026-09-17** (5B:s första prompt): `Faction.relations: Record<FactionId, Pct>`
(land-till-land, separat från `relationToPlayer`) och `Front.status: 'war' | 'ceasefire' |
'dormant'` (alla scenariofronter startar `'war'`). `fronts.ts`/`attrition.ts` gate:ar på
`status !== 'war'` — en ceasefire-front genererar varken stridsförluster eller materielbehov.
`relations` faller av leveranser (`deliveries.ts`, symmetriskt) och lyckade `STAGE_INCIDENT`
(`political.ts`, mot frontmotståndaren), stiger av `BACK_CHANNEL` och en liten passiv
återhämtning varje tur (`factions.ts`). Övergångarna är rena tröskeljämförelser, ingen rng:
war→ceasefire vid "FORCED TO SUE FOR PEACE" (tidigare bara en notis, fynd 1.5 — nu dess FÖRSTA
mekaniska konsekvens) eller ömsesidigt höga relationer; ceasefire→war vid hög doomsday eller
kollapsade relationer. Nio nya PROVISORISKA balanstal. Golden omfryst — den största enskilda
trajektorieändringen sedan P53b. Se `docs/ANDRINGSLOGG.md`.
P53 är därför delad i **P53a**
(scenariodata: `materielNeed` seedas till `orderTriggerThreshold` vid start, inte 0 — **BYGGD
2026-09-17**: `state.ts`, golden omfryst, härnessmätning n=30/botpolicy bekräftar första bokförda
intäkten mätbart tidigare för alla fyra policyer, se `docs/ANDRINGSLOGG.md`), **P53b**
(`board.ts`: styrelsen mäter orderbok + en rampad, kvadratisk förväntanskurva i stället för bara
linjär bokförd intäkt — **BYGGD 2026-09-17**: `progressSnapshot`/`computeExpectedProgress`, golden
omfryst, härnessmätning n=30/botpolicy visar `BUYOUT`-frekvens 0 %/0 %/67 %/70 % (`passive`/
`aggressive`/`balanced`/`capacity`) i stället för identisk 100 % för alla fyra, se
`docs/ANDRINGSLOGG.md`) och **P53c** (balanspass — `boardTarget.threshold`, 2× — **VERIFIERAD
2026-09-17, ingen kod eller data ändrad**: en känslighetsanalys mot 1,5×/2×/2,5× bekräftade att 2×
ger den tydligaste diskrimineringen mellan starka och svaga botar; 1,5× är för löst, 2,5× mättar
mot nästan enhetligt `BUYOUT` för alla fyra). **P53 är därmed helt klar** — se
`docs/ANDRINGSLOGG.md`, 2026-09-17, för samtliga tre mätningar. Se specens avsnitt 2.1 och 10
punkt 1 för de fullständiga ursprungsmätningarna, och
avsnitt 1 för de tio premisskontrollerade fynden specen bygger på (bl.a. att `Faction.alignment`
aldrig skrivs av någon kod, att `Station.coverage` är helt död data sedan etapp 1, och att
`Faction.embargoed` har tre färdiga effektkedjor men ingen utlösare). Avsnitt 10 protokollför de
åtta besluten som togs vid antagandet, samtliga enligt förslagets egna rekommendationer. **Känd
lucka, upptäckt
vid antagandet (se `docs/ANDRINGSLOGG.md`, 2026-09-15): specens avsnitt 5.5 och skyddsräcke 1/3
(etapp 3B) refererade upprepade gånger till en "THE_WORLD-spec" med `deriveDeployment`,
`MovementArrow`, `sectorId` och ett INTEL-lager som om de redan fanns — sökt igenom hela repot,
noll träffar. Blockerade INTE P33–P37 (3A rör ingen av dessa) — men BLOCKERADE P41 först
(2026-09-15): fortsatt noll träffar, och `TheWorld.tsx` hade inget lägesbord. Ägaren tillfrågad
en första gång; valde att hoppa över P41. Tillfrågad en andra gång, samma datum: valde att
skriva `THE_WORLD`-spec-innehållet i efterhand (nu specens eget avsnitt 5.5.1) i stället för att
lämna P41 olyst. **P41 är nu BYGGD** — `sectorId`-utgruppering och INTEL-dimning (`queries.ts`s
`formationDisplay`, delar `effectiveDepth` med `bidEstimate`) finns i `TheWorld.tsx`;
`MovementArrow` finns och är testad men körs ännu inte mot riktig `SUPPLY_ARRIVAL`-data (skulle
kräva att röra `WireEvent.delta`, en del av golden-hashen — ägaren tillfrågad, valde att inte
göra den ändringen nu) eller `REDEPLOY`-data (ingen mekanik i simuleringen flyttar ett förbands
sektor alls). Se avsnitt 5.5.1 i specen och `docs/ANDRINGSLOGG.md` för hela resonemanget.**
**Ytterligare känd spänning, upptäckt under P37 (se
`docs/ANDRINGSLOGG.md`, 2026-09-15): styrelsegranskningens linjära intäktsmål (`board.ts`, P30,
etapp 2) och P35:s behovsdrivna ordrar går inte längre ihop — 200/200 `balanced`-partier slutar
i `BUYOUT`, i snitt vid tur ~11. Ägaren tillfrågad två gånger, valde att lämna `boardTarget`
(`indochina-slice.json`) orört; en riktig fix är en egen omkalibrering, inte gjord här.** Se
avsnitt 8:s P37-blockquote i `docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` för hela fyndet.
Bakgrunden till etapp 2 finns i dess egna avsnitt 0/1; den
ärver etapp 1,5:s egen bakgrund i `docs/RAPPORT1_GRANSKNING.md` (extern granskning) och
`docs/RAPPORT2_LANGSIKTIG_PLAN.md` (långsiktig plan). **Läs den promptens avsnitt i den spec som
gäller innan du börjar** — den är skriven för att följas ordagrant, inte för att tolkas.

## Hårda regler

1. `packages/core` får aldrig importera react, DOM, `Date`, `Math.random`, `crypto`, `fs` eller `console`.
2. All slump går via `createRng(seed, cursor)`. Ingen annan slumpkälla finns. `queries.ts` drar aldrig ur den — härledda värden som behöver slump hashar `seed + id`.
3. `resolveTurn(state, submission)` är ren: samma indata ger bitvis identisk utdata. Indata muteras aldrig.
4. Varje state-ändring i ett resolve-steg måste emitta minst en `WireEvent`, med `causeId` när det finns en känd orsak. Tyst state-ändring är en bugg.
5. Alla balanssiffror ligger i `core/src/data/balance.json`. Inga magiska tal i kod.
6. Ogiltiga spelarhandlingar returneras i `result.rejected`. `resolveTurn` kastar aldrig.
7. Stegordningen i `resolve/index.ts` är spelregler. Ändra den aldrig utan att jag ber om det.
8. Allt penningräknande går genom `money.ts`. Inga decimaler i `Money`-fält.
9. `state.doomsday` skrivs bara av `doomsdayGate.ts`. Alla andra steg anropar `addDoomsday`.
10. Kostnad och pris är två skilda tal. `baseCost` är vad köparen förväntas betala, `unitCost` är vad det kostar dig att bygga. Blanda dem aldrig.

## Arbetssätt

- En uppgift i taget. Rör inte moduler som uppgiften inte nämner.
- Skriv testet före implementationen.
- Kör `npm test` innan du säger att du är klar.
- Om golden-snapshotet ändras: **stanna och fråga.** Uppdatera det aldrig själv. Snapshotet läser en fryst balansfil, så ett brott betyder alltid att en regel ändrats — aldrig att en siffra skruvats.
- Föreslå aldrig nya features. Specen är fryst för den prompt du kör.

## Om specen och verkligheten inte stämmer

Planen får ändras under utvecklingen — men inte tyst, och inte av en kodsession på eget initiativ.

Om du under bygget upptäcker att specen är omöjlig, motsäger sig själv, eller bygger på ett
antagande som inte håller: **stanna, beskriv vad som inte stämmer, och föreslå ändringen.** Bygg
inte runt problemet och skriv inte om specen själv.

När en ändring beslutas skrivs den in i specen **och** som en rad i `docs/ANDRINGSLOGG.md`, i
samma commit som koden. En ändrad spec utan loggrad är samma sak som ingen ändring.
