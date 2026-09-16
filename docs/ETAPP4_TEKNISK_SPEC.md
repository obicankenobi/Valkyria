# THE SEVENTH FRONT — Teknisk spec, etapp 4: TVÅ KRIG, EN KASSABOK

**Version 1.0 — antagen (ägarbeslut 2026-09-15).** Validerad mot `obicankenobi/Valkyria` commit
`42bb924` (förslaget). Tre öppna punkter avgjorda vid antagandet, samma datum: avsnitt 10:s
DESIGN.md-koppling och `boardTarget`-hanteringen godkända som föreslaget; namnet satt till "Två
krig, en kassabok" (var "Två krig, en verkstad" i förslaget). Se avsnitt 10 och
`docs/ANDRINGSLOGG.md` för hela beslutet. Övrigt innehåll oförändrat mot förslaget.

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

Specen är **fryst under P43–P52**. Den får ändras mellan promptar om en byggd sanning visar sig
strida mot den, men aldrig av en kodsession på eget initiativ. Se `CLAUDE.md`.

> **Numrering:** etapp 3 omnumrerades P43–P52 → P33–P42 (`34c7fae`, se `docs/ANDRINGSLOGG.md`)
> för att stänga det glapp som fanns efter P32. Etapp 4 är därför P43–P52, direkt efter P42.
> Git-historikens commit-meddelanden för etapp 3 säger fortfarande P43–P52 — mappningstabellen
> i loggen är nyckeln till dem.

---

## 0. Frågan och det korta svaret

> *Vad är nästa sak som gör spelet bättre, nu när efterfrågan kommer ur kriget?*

**Två köpare som blöder samtidigt, och ett kostnadstryck som inte längre är en enda siffra.**

Etapp 3 kopplade efterfrågan till fronten. Men det finns bara **en** front, så varje order är
ett erbjudande huset kan tacka ja till. Det finns aldrig ett *val* mellan två kunder — bara ett
val mellan att bjuda och att låta bli.

`ProductionLine.assignedContractId` finns redan, och kapaciteten biter redan (P27, etapp 2).
Det som saknas är en andra efterfrågeström att ställa den mot. Det är 4A.

Och `supplyCostIndex` är i dag ett enda tal som multiplicerar allt du bygger. Den skapar
kostnadstryck, men aldrig ett *beslut* — den rör sig, du betalar. Fem råvaror med olika
materialåtgång per produkt gör kostnaden till något du kan positionera dig mot. Det är 4B.

Ingen av halvorna kräver en ny `PlayerAction`-variant, och ingen kräver en ändring av
pipelinens stegordning.

---

## 1. Fem verifierade fynd

Alla kontrollerade mot `34c7fae` innan den här specen skrevs (genomgående krav 8). Varje rad är
läst i koden, inte antagen.

**1.1 Scenarieformatet klarar exakt en front och en teater.** `ScenarioFile` har `front` och
`theatre` som **singularobjekt**, och `buildWorld` (`state.ts:290`) returnerar ett av varje:

```ts
fronts: { [front.id]: front },
theatres: { [theatre.id]: theatre },
```

`state.fronts` är alltså redan en `Record`, och `fronts.ts` löser flera fronter oberoende — det
finns till och med ett test för det (`fronts.test.ts`, "flera fronter löses oberoende av
varandra"). Men **ingenting kan skapa en andra front.** Det är formatet, inte motorn, som är
enfronts.

**1.2 En leverans vet inte vilken front den går till.** `Contract` har inget `frontId`.
`deliveries.ts` använder `findFrontForBuyer`, som tar **första** fronten där köparen är med:

```ts
for (const front of Object.values(fronts)) {
  if (front.sideA === buyerId) return { front, side: 'a' }
  if (front.sideB === buyerId) return { front, side: 'b' }
}
```

Med en köpare på två fronter hamnar all materiel på den ena. Detta är 4A:s kärnfråga.

**1.3 `computePressureForBuyer` har exakt samma brist.** `orders.ts` väljer front med
`Object.values(draft.fronts).find((f) => f.sideA === buyerId || f.sideB === buyerId)` och
räknar `pressure` — som sätter `Order.weights` (P36) — ur bara den fronten. En andra front får
alltså etapp 3:s viktförskjutning att tyst mäta fel front. **Det är en regression som uppstår i
samma stund som den andra fronten finns**, inte en ny funktion.

**1.4 `heat.ts` är redan N-teatersäker.** Steget loopar `for (const theatre of
Object.values(draft.theatres))` och nollställer `deliveriesIntoActiveWarThisTurn` per teater.
Två teatrar ger alltså två oberoende hetkurvor **utan en enda ändring i `heat.ts`**. Det är
skälet till att två teatrar är billigare än det låter, och varför valet mellan "två fronter i
en teater" och "två teatrar" är ett riktigt designval och inte ett kostnadsval.

**1.5 `MARKET`/`BUY_FORWARD`/`RELEASE` finns redan typat — och är obyggt.** Varianten ligger i
`PlayerAction`-unionen (`types.ts:478`) men hanteras ingenstans. `applyActions.ts` avslutas med:

```ts
// BROKER, MARKET: se filens huvudkommentar — obyggda i etapp 1,5, men har redan
// konsumerat en actionPoint ovan.
```

En `MARKET`-handling **varken utförs eller avvisas** i dag — den äter en handlingspoäng tyst.
Det är en befintlig avvikelse mot hård regel 6 ("ogiltiga spelarhandlingar returneras i
`result.rejected`"), och 4B:s naturliga ingång: verbet finns, unionen behöver inte röras.

**Dessutom, som förutsättning:** `laos` är redan en faktion **utan front**. Den köper bara via
`peacetimeReplacement` (`factions.ts`). Etapp 4 behöver alltså inte hitta på nya faktioner för
att få en andra front.

---

## 2. Den redan kända spänningen som förorenar varje mätning

`P30`/`P35`-kaskaden är **inte löst** och gäller fortfarande: 200/200 `balanced`-partier slutar i
`BUYOUT`, i snitt vid tur ~11 (se `docs/ANDRINGSLOGG.md` och etapp 3:s avsnitt 8). Ägaren har
två gånger valt att lämna `boardTarget` orört.

Det måste stå här, före måltabellen, eftersom **varje siffra i etapp 4 mäts i partier som i
praktiken är elva turer långa, inte tjugo.**

Men den andra fronten är också den första mekanik som rimligen kan *påverka* kaskaden: en
andra köpare med eget behov är ny intäkt, och styrelsemålet är ett intäktsmål. Därför är
"löser den andra fronten `BUYOUT`-kaskaden?" en **mätbar hypotes i avsnitt 7**, inte ett
antagande. Om svaret är ja är spänningen borta av sig själv. Om svaret är nej är en
omkalibrering av `boardTarget` ett eget ägarbeslut som fortfarande inte är fattat.

---

## 3. 4A — Andra fronten (P43–P47)

### 3.1 Scenarieformatet blir flertaligt

```ts
// Före
interface ScenarioFile { theatre: {...}; front: {...} }
// Efter
interface ScenarioFile { theatres: {...}[]; fronts: {...}[] }
```

Varje front i `fronts[]` får ett `theatreId`. `buildWorld` returnerar `Theatre[]` och `Front[]`,
och `Theatre.frontIds` fylls ur fronternas `theatreId` i stället för att hårdkodas till
`[front.id]`.

**P43 ändrar bara formatet, inte innehållet.** `indochina-slice.json` får en array med exakt en
teater och en front. Sluttillståndet blir bitvis identiskt, och golden ska därför **inte**
behöva frysas om i P43 — det är promptens eget klart-när-villkor, och en billig, tydlig
kontroll på att refaktoreringen är ren.

### 3.2 Ordern bär sin front

`Order` får `frontId: FrontId | null`. Regeln är **härledd först, vald sedan**:

| Ordertyp | Hur `frontId` sätts |
|---|---|
| `REPLACE_FORMATION_LOSSES` | **Härledd** ur `reason.formationId` → förbandets `frontId`. Förbandet vet redan sin front (`Formation.frontId`, P38). |
| `PEACETIME_REPLACEMENT` | **Vald**: den av köparens fronter där `pressure` är högst. Ett försvarsdepartement köper till den front som går sämst. |
| `SCRIPTED` | `null` om scenariohändelsen inte anger någon — fallback nedan gäller. |

`Contract` ärver `frontId` från ordern vid signering (`bidding.ts`). `deliveries.ts` använder
`contract.frontId` när den finns, och faller tillbaka på dagens `findFrontForBuyer` när den är
`null`. **Fallbacken tas aldrig bort** — den håller scriptade och krisgenererade kontrakt
(`crisis.ts`) fungerande utan att de behöver kunna välja front.

Det är ägarens beslut (c) med (a) som fallback, ordagrant.

### 3.3 `pressure` blir per front

`computePressureForBuyer(draft, buyerId)` → `computePressureForFront(draft, buyerId, frontId)`,
plus en `highestPressureFront(draft, buyerId)` som 3.2:s "vald"-rad använder. Formeln inuti
(positionsdelta ur `front.trace` + moralunderläge) ändras **inte** — bara vilken front den läser.

Detta är fynd 1.3:s regression, åtgärdad i samma prompt som den uppstår.

### 3.4 Andra teatern i `indochina-slice`

| | Front 1 (befintlig) | Front 2 (ny) |
|---|---|---|
| Teater | `INDOCHINA` | `LAOS` (ny, egen hetkurva) |
| Sida A | `rvn` | `laos` |
| Sida B | `nlf` | `nlf` |

**`nlf` står på båda fronterna med flit.** Det är det svåra fallet — en faktion vars
`materielNeed` fylls på från två håll och vars ordrar måste välja front — och att bygga
mekaniken mot det svåra fallet från början är billigare än att upptäcka det i en senare etapp.
Ingen ny faktion behövs.

`Faction.materielNeed` **förblir per faktion, inte per front.** Ett försvarsdepartement har en
budget och ett lager, inte två. Fronten avgör var materielen *hamnar* (3.2), inte var behovet
*bokförs*. Det håller P34:s datamodell orörd.

Den nya fronten behöver en egen förbandsordning (`formations`) enligt P38:s modell, och
scenariot behöver ett rimligt styrkeförhållande. Båda är scenariodata, inte balansfält.

> **Kräver ett ägarbeslut vid antagandet:** `DESIGN.md` avsnitt 16 beskriver
> `INDOCHINA_SLICE` som "en front, tre köpare, tre rivaler", och reserverar två fronter åt det
> fulla `INDOCHINA` (34 turer). Att ge skivan en andra front motsäger den raden. Alternativet —
> att bygga mekaniken men aldrig köra den i det scenario härnessen mäter — gör balanspasset
> meningslöst och lämnar mekaniken oprövad. Förslaget är därför att **uppdatera `DESIGN.md`
> avsnitt 16 i samma commit som P45**, med en loggrad. Se avsnitt 10.

---

## 4. 4B — Råvarumarknaden (P48–P52)

### 4.1 Fem råvaror, en smal söm

`DESIGN.md` avsnitt 14 ger dem ordagrant: **olja, stål, uran, titan, sällsynta jordartsmetaller.**

```ts
export type Commodity = 'oil' | 'steel' | 'uranium' | 'titanium' | 'rare_earths'
// state.market
commodities: Record<Commodity, number>   // prisindex, 100 = utgångsläge
```

Sömmen är förvånansvärt smal. Bara **två** funktioner i hela kärnan läser `supplyCostIndex`:

- `computeReferencePrice(product, quantity, heat, supplyCostIndex)` — `scarcityFactor`
- `computeUnitCostNow(product, grade, supplyCostIndex)` — `supplyFactor`

Allt annat (`production.ts`, `bidding.ts`, `orders.ts`, `crisis.ts`, `queries.ts`, härnessen,
UI:ts mätare) går via de två.

### 4.2 `supplyCostIndex` försvinner aldrig — den blir härledd

Detta är 4B:s viktigaste designbeslut, och skälet till att halvan är genomförbar utan att röra
tjugo filer:

```
supplyCostIndex = Σ (commodities[c] × commodityIndexWeight[c])
```

Fältet ligger kvar på `state.market`, i samma intervall `[supplyIndexMin, supplyIndexMax]`, och
skrivs fortfarande bara av `supply.ts`. Därmed fortsätter `computeReferencePrice`, UI:ts mätare
(`DISPLAY_THRESHOLDS.supplyIndexMin/Max`), `rivals.ts`s supply play och härnessen fungera
**oförändrade**. Bara `computeUnitCostNow` går över till att räkna per råvara.

Ett skyddsräcke (avsnitt 6) fäster detta med ett test.

### 4.3 Materialåtgången är det som gör fem råvaror till fem saker

Utan den här delen är fem prisindex bara fem kopior av samma tal.

```ts
// Product
bom: Partial<Record<Commodity, number>>   // andel av unitCost som är råvara c
```

`computeUnitCostNow` blir:

```
unitCost × (1 − bomShare)                     // arbete, verktyg, overhead — rör sig inte
  + unitCost × Σ (bom[c] × commodities[c]/100) // materialet, per råvara
```

Det ger produkterna olika **exponering**: ett gevär är stål och arbete, en stridsvagn är stål
och titan, ett artillerigranatskal med kärnladdning bär uran, elektronik bär sällsynta
jordartsmetaller. En oljechock och en stålbrist ska inte drabba din portfölj lika.

`bom` är produktdata (`products.json`), inte balansfält — men andelarna i sig är balanstal och
hör därför i `balance.json` som en `bomDefaultByCategory`, med per-produkt-överskrivning bara
där kategorin inte räcker. Hård regel 5.

### 4.4 Prisdrivarna

`DESIGN.md` avsnitt 14: *"Priser drivs av krigsefterfrågan, embargon, sabotage och dina egna
inköp."* Alla fyra finns redan som signaler i motorn:

| Drivare | Källa som redan finns | Effekt |
|---|---|---|
| Krigsefterfrågan | `Theatre.deliveriesIntoActiveWarThisTurn` (läses redan av `heat.ts`) | Höjer priset på de råvaror den levererade materielen bär |
| Embargon | `Faction.embargoed` | Höjer den/de råvaror den faktionen är källa till |
| Sabotage | `rivals.ts`s supply play (rör i dag `supplyCostIndex` direkt) | Generaliseras till att slå mot **en** råvara |
| Egna inköp | `MARKET`-verbet, 4.5 | Se nedan |

`supply.ts` växer från att flytta ett tal till att flytta fem och härleda aggregatet. **Steget
ligger kvar där det ligger** (mellan `heat` och `doomsday`) — hård regel 7 rörs inte.

### 4.5 `MARKET`-verbet byggs

```ts
{ type: 'MARKET'; op: 'BUY_FORWARD' | 'RELEASE'; spend: Money }
```

Varianten finns redan (fynd 1.5) och ändras **inte**. Den behöver bara ett `commodity`-fält för
att vara meningsfull — det är den enda ändringen i `PlayerAction`-unionen i hela etapp 4, och
den utvidgar en befintlig variant i stället för att lägga till en ny.

- `BUY_FORWARD` — köp ett innehav till dagens pris. Innehavet sänker din *effektiva* materialkostnad
  så länge det räcker. Ett för stort innehav binder kassa du behöver till linjer.
- `RELEASE` — sälj innehavet till dagens pris. Ger kassa, och **trycker ner priset** — vilket
  också hjälper dina konkurrenter.

Det är samma form av beslut som resten av spelet: en fördel nu mot en exponering sen. Och
`applyActions.ts` slutar tyst svälja handlingen — hård regel 6 gäller igen.

---

## 5. Vad det kostar

Var ärlig om det här innan arbetet börjar.

**Balansen måste köras om två gånger**, en gång per halva (P47, P52). Andra fronten ungefär
fördubblar efterfrågan; råvarumarknaden skriver om varje styckkostnad.

**Golden fryses om fler än två gånger, och det är avsiktligt.** Etapp 3:s spec budgeterade för
två och behövde i praktiken fyra. Den här specen säger i stället rakt ut: golden fryses om i
**varje prompt som ändrar `GameState`s form** (P44, P45, P48, P49) samt efter varje balanspass
(P47, P52) — var och en i en egen commit med loggrad, ingen annan ändring i den commiten. P43
och P46 ska **inte** behöva någon omfrysning; att de inte gör det är deras eget klart-när.

**`orders.ts` växer igen.** Filen fick redan tre faser i P40. Front­valet (3.2) och
per-front-`pressure` (3.3) ska in som egna, namngivna funktioner — inte som fler grenar i
`generateNeedDrivenOrders`.

**`THE FLOOR` och `THE WORLD` måste visa fronten.** En order utan synlig front är ett beslut
spelaren inte kan fatta. Det ligger i P46, inte som en eftertanke i balanspasset.

**Scenariodata växer igen.** Andra fronten behöver en egen förbandsordning enligt P38:s modell.

---

## 6. Skyddsräcken

Fyra regler. De ska stå som kommentar i koden.

**1. Pipelinens stegordning ändras inte.** Båda halvorna ryms i befintliga steg (`fronts`,
`deliveries`, `orders`, `supply`). `resolve/index.ts`s `PIPELINE` är oförändrad efter P52.
Hård regel 7.

**2. `supplyCostIndex` finns kvar och är härledd.** Ett test fäster att fältet existerar, ligger
i `[supplyIndexMin, supplyIndexMax]`, och att det är en funktion av `commodities` — inte ett
eget, fritt skrivet tal. Bryts det har råvarumarknaden blivit en parallell sanning och
`computeReferencePrice` räknar på fel värld.

**3. Invarianten från etapp 3 håller på BÅDA fronterna.** Σ `formations[side].equipment[c]` ===
`front.equipment[side][c]` och Σ `formations[side].strength` === `front.strength[side]`, för
varje front, över 20 turer. Etapp 3:s invarianttest utvidgas till att loopa `state.fronts`.

**4. Ingen ny `PlayerAction`-variant.** `MARKET` utvidgas med `commodity`; `BROKER` förblir
obyggd. Ett test fäster att unionens variantlista är oförändrad. Skyddsräcke 1 från etapp 3
(inga order till förband) gäller fortfarande, och dess test flyttas inte.

---

## 7. Måltabell

Hypoteser, inte acceptanskriterier. Mäts med härnessen, 200 partier `balanced`, om inget annat
anges. Om härnessen envist säger något annat och partierna ändå är roliga är det tabellen som
ska skrivas om — men som ett medvetet beslut med motivering och loggrad.

Mätt läge i högerkolumnen (4A-raderna) är P47, n=200 `balanced`, mot `indochina-slice.json` med
`front-laos` (P43–P46).

> **P47: samma `BUYOUT`-kaskad som redan dokumenterad i `ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md`
> (P37/P40/P42) — nu bekräftat RIGID, inte bara vanlig.** 200/200 `balanced`-partier slutar i
> `BUYOUT`, och alla 200 slutar på EXAKT tur 10 (min = max = 10, inte bara ett snitt). Ingen av
> 4A:s mekaniker hinner alltså utveckla sig innan partiet avgörs — andra fronten byggdes klart,
> men fick aldrig chansen att visa vad den kan. Diagnostik körd före beslut: andelen ordrar till
> `front-laos` faller över tid (33 % vid tur 4, ner mot 14 % vid tur 10) snarare än att stiga mot
> målintervallet — `laos` (militaryBudget 1,2 Mkr mot `rvn`s 6 Mkr) är helt enkelt en mindre
> ekonomi som genererar färre ordrar, en andra, delvis oberoende orsak till att raden missar sitt
> mål även bortsett från kaskaden.
>
> **Löser andra fronten `BUYOUT`-kaskaden? Nej — definitivt besvarat.**
> `SCENARIO_COMPLETE` 0/200, identiskt med läget innan P43–P46. Tredje gången frågan ställs
> (P37, P42, nu P47) — se avsnitt 10, punkt 2 i den här specen. Ägaren tillfrågad en tredje gång:
> valde att lämna `boardTarget` orört igen och revidera 4A:s rader i stället, samma linje som
> P37/P42. Kvarstår som samma öppna, loggade spänning — inte löst av den här etappen, inte
> avsett att lösas av den.
>
> Fyra rader av samma skäl inte nåbara med bara `balance.json`/scenariodata på tio turer:
> - **Andel ordrar som går till front 2** (13,8 %, mål 25–45 %): dels kaskaden, dels `laos`s
>   mindre ekonomi (ovan). En riktig fix för det andra (höjd `militaryBudget`/`materielNeed`-
>   parametrar för `laos`) hade snedvridit scenariots redan etablerade ekonomiska förhållanden
>   utan att röra grundorsaken (kaskaden) — inte gjort här.
> - **Turer där antalet aktiva kontrakt överstiger antalet linjer** (0 %, mål 30–60 %):
>   `house.lines.length` är 4; det tar fler än tio turer av ackumulerade kontrakt för att
>   pressa fyra linjer, särskilt med `laos`s låga ordervolym (ovan) som håller nere den totala
>   kontraktsmängden.
> - **Partier där båda fronterna byter riktning minst en gång** (0 %, mål > 20 %): samma
>   observation som `ETAPP3`s P37-blockquote gjorde för front-1 ensam — för kort tid för att en
>   leverans ska hinna vända ett övertag, nu sant för BÅDA fronterna samtidigt.
> - **`nlf`s `materielNeed` fylls på från båda fronterna, alltid när båda strider**: premissen
>   ("när båda strider") uppfylldes 0/200 gånger i mätningen — `front-laos` hinner sällan se
>   strid alls innan `BUYOUT`. Det här är INTE samma sak som att raden är falsk: den är
>   strukturellt garanterad (`Faction.materielNeed` är ett enda, delat fält — se avsnitt 3.4)
>   och verifierad direkt med ett konstruerat test i P45
>   (`attrition.test.ts`, "nlf:s materielNeed växer av förluster på BÅDA fronterna"), som ger
>   BÅDA fronterna strid inom en enda tur i stället för att vänta på att härnessen råkar göra
>   det. Radens sanning vilar på testet, inte på den här mätningen.
>
> Endast raden om `Order.frontId` härlett ur `reason` möttes ograverad: **18,9 %** (mål ≥ 15 %)
> — `REPLACE_FORMATION_LOSSES`-mekaniken (P40, etapp 3) fortsätter fungera identiskt, opåverkad
> av kaskaden eftersom den utlöses av strid, inte av tid.

| Kriterium | Målvärde | Halva | Mätt (P47) |
|---|---|---|---|
| **Andel ordrar som går till front 2** | **25–45 %** | 4A | **13,8 % — ej uppfyllt, se blockquote** |
| Ordrar med `frontId` härledd ur `reason` (regel c) | ≥ 15 % | 4A | **18,9 % — uppfyllt** |
| **Turer där antalet aktiva kontrakt överstiger antalet linjer** (kapacitetstryck) | **30–60 %** | 4A | **0 % — ej uppfyllt, se blockquote** |
| Partier där båda fronterna byter riktning minst en gång | > 20 % | 4A | **0 % — ej uppfyllt, se blockquote** |
| `nlf`s `materielNeed` fylls på från båda fronterna | alltid, när båda strider | 4A | **Premiss aldrig uppfylld i mätningen — håller strukturellt, se blockquote och P45-test** |
| **Löser andra fronten `BUYOUT`-kaskaden?** (avsnitt 2) | **`SCENARIO_COMPLETE` > 25 %** | 4A | **Nej — 0 %, se blockquote** |
| **Spridning mellan dyraste och billigaste råvaran vid partiets slut** | **kvot > 1,3 i > 60 % av partier** | 4B | — |
| Partier där minst två råvaror rör sig åt olika håll samma tur | > 50 % | 4B | — |
| Andel partier där `BUY_FORWARD` hade varit lönsam i efterhand | 30–70 % | 4B | — |
| `supplyCostIndex` stannar i `[supplyIndexMin, supplyIndexMax]` | alltid | 4B | — |
| Invarianten i skyddsräcke 3 håller över 20 turer, båda fronterna | alltid | båda | **Ja — se `fronts.test.ts`/`engagement.test.ts` och P45:s eget test** |

---

## 8. Promptsekvens

### 4A — Andra fronten

**P43 — scenariot blir flertaligt**
> Ändra `ScenarioFile.front`/`theatre` till `fronts[]`/`theatres[]` och generalisera
> `buildWorld` enligt 3.1. Lägg INTE till någon ny front i datan. Ren refaktorering.
>
> *Klart när:* `indochina-slice.json` har arrayer med ett element var; ett test visar att
> `buildWorld` bygger två teatrar med var sin front ur en konstruerad scenariofil;
> **golden-snapshoten är oförändrad och orörd** — sluttillståndet ska vara bitvis identiskt.

**P44 — ordern bär sin front**
> Lägg till `Order.frontId` och `Contract.frontId` enligt 3.2. Härled ur `reason` för
> `REPLACE_FORMATION_LOSSES`, välj högsta `pressure`-fronten för `PEACETIME_REPLACEMENT`. Låt
> `deliveries.ts` använda fältet med `findFrontForBuyer` som fallback. Bryt ut
> `computePressureForFront` och `highestPressureFront` enligt 3.3.
>
> *Klart när:* ett test visar att en namngiven ersättningsorder får förbandets front; ett test
> visar att ett kontrakt utan `frontId` fortfarande levereras via fallbacken; ett test visar att
> `pressure` räknas per front och inte längre tar första fronten; **golden omfryst i denna
> commit och ingen annan**, med loggrad.

**P45 — andra teatern**
> Lägg in teatern `LAOS` och fronten `laos` mot `nlf` i `indochina-slice.json` enligt 3.4, med
> en förbandsordning enligt P38:s modell. Uppdatera `DESIGN.md` avsnitt 16:s rad om
> `INDOCHINA_SLICE` i samma commit, med loggrad.
>
> *Klart när:* ett test visar att `nlf`s `materielNeed` växer av förluster på båda fronterna;
> ett test visar att de två teatrarnas `heat` rör sig oberoende; invarianttestet (skyddsräcke 3)
> gröna på båda fronterna; **golden omfryst i denna commit och ingen annan**, med loggrad.

**P46 — fronten blir synlig**
> Visa `frontId` på order- och kontraktsraderna i `THE FLOOR`, och visa per front i `THE WORLD`
> vilka kontrakt som matar den. Ingen ny mekanik.
>
> *Klart när:* ett komponenttest visar att en orderrad namnger sin front; ett test visar att en
> order utan `frontId` inte kraschar vyn; **golden orörd**.

**P47 — balanspass 4A**
> Ingen kod. Kör härnessen mot avsnitt 7:s 4A-rader. Skruva bara `balance.json` och
> scenariodata. Frys om golden när tabellen står.
>
> *Klart när:* alla fetstilta 4A-rader uppfyllda eller reviderade med motivering och loggrad;
> `BUYOUT`-hypotesen besvarad med en siffra; hela CI-kedjan grön.

### 4B — Råvarumarknaden

**P48 — de fem råvarorna**
> Lägg till `Commodity`, `state.market.commodities` och `commodityIndexWeight`. Generalisera
> `supply.ts` till att flytta fem tal och härleda `supplyCostIndex` enligt 4.2. Inga nya
> prisdrivare än — dagens heat-koppling flyttas bara ner en nivå.
>
> *Klart när:* ett test visar att `supplyCostIndex` är det viktade aggregatet av `commodities`;
> ett test visar att den stannar i `[supplyIndexMin, supplyIndexMax]`; ett test visar att
> `computeReferencePrice` ger identiskt resultat som före för ett givet aggregat; **golden
> omfryst i denna commit och ingen annan**, med loggrad.

**P49 — materialåtgången**
> Lägg till `Product.bom` och `bomDefaultByCategory`. Skriv om `computeUnitCostNow` enligt 4.3.
>
> *Klart när:* ett test visar att en oljechock ändrar styckkostnaden för en oljetung produkt mer
> än för en stål­tung; ett test visar att en produkt utan `bom` faller tillbaka på sin kategoris
> standardandelar; ett test visar att summan av `bom`-andelarna aldrig överstiger 1; **golden
> omfryst i denna commit och ingen annan**, med loggrad.

**P50 — prisdrivarna**
> Implementera de fyra drivarna i 4.4:s tabell utom `MARKET`. Generalisera `rivals.ts`s supply
> play till att slå mot en enskild råvara.
>
> *Klart när:* ett test visar att leveranser in i ett aktivt krig höjer just de råvaror
> materielen bär; ett test visar att ett embargo höjer sin råvara och inte de andra; ett test
> visar att en rivals supply play träffar en råvara, inte aggregatet.

**P51 — `MARKET`-verbet**
> Bygg `BUY_FORWARD` och `RELEASE` enligt 4.5. Utvidga varianten med `commodity` — ingen ny
> variant. Låt `applyActions.ts` avvisa ogiltiga `MARKET`-handlingar i stället för att svälja dem.
>
> *Klart när:* ett test visar att `BUY_FORWARD` sänker effektiv styckkostnad så länge innehavet
> räcker; ett test visar att `RELEASE` ger kassa och trycker ner priset; ett test visar att en
> `MARKET`-handling med okänd råvara eller ogiltigt belopp hamnar i `result.rejected` (hård
> regel 6); ett test visar att `PlayerAction`-unionens variantlista är oförändrad (skyddsräcke 4).

**P52 — balanspass 4B**
> Ingen kod. Kör härnessen mot hela avsnitt 7. Skruva `balance.json` och produktdata. Frys om
> golden när tabellen står.
>
> *Klart när:* alla rader uppfyllda eller reviderade med motivering och loggrad; hela CI-kedjan
> grön.

---

## 9. Vad som avsiktligt inte finns i etapp 4

Order till förband, hexrutenät, taktiskt lager, spelarägda förband, en tredje front, nya
scenarier (`SUEZ`, `OCTOBER`, `WINDS`, `THE LONG WAR`), `FUND_COUP`, `ASSASSINATE`, namngivna
tjänstemän, fördrag, avkolonisering, `BROKER`.

**Scenarierna väntar med flit.** Ägarbeslut: mekaniken ska vara robust och färdig först, så att
ett scenario byggs på en grund som håller — inte tvärtom, där ett kreativt scenario tvingar fram
mekanik i efterhand.

**Karaktärer och politik flyttas till etapp 5.** `FUND_COUP`, `ASSASSINATE`, namngivna
tjänstemän och fördrag hänger ihop: de förutsätter alla ett karaktärssystem som inte finns, och
`DESIGN.md` avsnitt 20 grupperar dem redan under "djup". Etapp 5 blir den etapp som handlar om
spelarens interaktion med människor, inte med marknader.

---

## 10. Beslut vid antagandet (2026-09-15)

Tre punkter var öppna i förslaget. Alla tre avgjorda av ägaren samma dag specen antogs.

1. **`DESIGN.md` avsnitt 16:s rad om `INDOCHINA_SLICE`** beskriver skivan som enfronts och
   reserverar två fronter åt fulla `INDOCHINA`. P45 motsäger den. **Avgjort: uppdatera raden i
   samma commit som P45, med loggrad** — inte kvarlämnad som en tyst motsägelse, och inte en
   andra front som bara finns i en testfixtur. Detta ligger redan i P45:s eget klart-när
   (avsnitt 8) — ingen ytterligare ändring krävs av den här specen.

2. **`boardTarget` och `BUYOUT`-kaskaden. Avgjort: lämnas orörd**, precis som i förslaget.
   "Löser andra fronten `BUYOUT`-kaskaden?" står kvar som en mätbar rad i avsnitt 7:s
   måltabell, inte ett antagande. Visar P47:s mätning att den inte gör det krävs ett eget,
   separat ägarbeslut om omkalibrering av `boardTarget` — det blir då tredje gången frågan
   ställs (se avsnitt 2).

3. **Namnet.** `TVÅ KRIG, EN VERKSTAD` var förslagets arbetsnamn. **Avgjort: "Två krig, en
   kassabok"** — samma bild som avsnitt 0 redan bygger på (en verkstad som betjänar två fronter
   samtidigt), men kassaboken pekar tydligare på var beslutet faktiskt fattas: inte i
   produktionen utan i vilken kund som får varje enhet. Namnet är genomfört i hela specen från
   och med denna version.
