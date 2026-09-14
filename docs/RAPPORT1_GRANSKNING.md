# Rapport 1 — Granskning och dagsform

**THE SEVENTH FRONT / Valkyria** · granskad 2026-09-14 · HEAD `156eb7d` ("UI-overhaul: lägesrum i stället för dokument")

Granskningen är gjord på en färsk klon i en egen sandlåda. Inget i ditt repo är rört. Alla
siffror nedan är uppmätta i den här körningen, inte hämtade ur dokumentationen.

---

## 0. Kortversionen

Bygget är **tekniskt disciplinerat och speldesignmässigt tomt**. Arkitekturen håller vad
`CLAUDE.md` lovar — kärnan är ren, deterministisk och mekaniskt bevakad av lintregler. Men
spelet som körs ovanpå den arkitekturen prövar inte den fråga etapp 1 skulle besvara.

Tre meningar som sammanfattar:

1. **Anbudsspelet är inte ett anbudsspel.** Spelaren vinner 94–100 % av alla utlysta ordrar
   oavsett strategi. Rivalerna förlorar inte på poäng — de blir *diskvalificerade* innan de
   poängsätts, ungefär två rivalbud per order.
2. **Halva datamodellen är död.** `supplyCostIndex`, `unitsPerLineTurn`, `gradeScandalChance`,
   `quality`, `westStanding`/`eastStanding`, `techRequired` (för produktion), `actionPoints`
   — fälten finns, ingen kod läser dem, och mekanikerna de skulle driva existerar därför inte.
3. **Utfallsrymden är två turer bred.** 99,2 % av 6 000 partier slutar på exakt tur 14 eller
   tur 20. `EXPOSURE` och `NUCLEAR_EXCHANGE` inträffade noll gånger.

Det som är bra är genuint bra och ska inte byggas om: pipelinen, wire-motorn, determinismen,
teststrukturen per steg, och framför allt `ANDRINGSLOGG.md` — den är det mest värdefulla
dokumentet i repot och den enda anledningen till att den här granskningen gick att göra på en
natt i stället för en vecka.

---

## 1. Hårda kontroller — faktiska resultat

Kört i sandlådan, `node v22.22.2`, ren `npm install` från `package-lock.json`.

| Kontroll | Resultat |
|---|---|
| `npm install` | Grönt |
| `npm test` (vitest) | **182 tester i 26 filer, alla gröna**, 4,76 s |
| `npm run lint` (eslint) | **Rent**, exit 0, noll varningar |
| `npm run build` | **RÖTT — misslyckas på en ren klon.** Se 2.1 |
| `npm run build` i beroendeordning (core → app → harness) | Grönt. Bunt: 280,84 kB JS / 15,00 kB CSS |
| `npm run test:e2e` (Playwright) | **2/2 gröna**, 10,4 s |
| `npx tsc --noEmit` över testfiler | **RÖTT — 1 äkta typfel.** Se 2.2 |
| Renhet: muterar `resolveTurn` sin indata? | **Nej.** 21 turer, ingen mutation av inskickat state |
| Determinism: samma seed + submission → bitvis identiskt | **Ja.** Verifierat |
| Kodtäckningsverktyg | **Saknas.** `@vitest/coverage-v8` är inte installerat |

Härnesskörning: **6 000 partier (2 000 per policy) på 31 sekunder.** Specens P9-krav var
"500 partier på under fem minuter" — det klaras med ungefär fyrtio gångers marginal.

### 1.1 P10:s balanssiffror reproducerar exakt

Bra tecken på att balanspasset gjordes hederligt:

| Måltabellsrad (spec 7.3) | P10 dokumenterade | Jag mätte (n=2000) |
|---|---|---|
| `passive` överlever 20 turer | 33,9 % | **33,9 %** |
| `passive` förlorar på `BUYOUT` | 78,2 % | **78,2 %** |
| — varav före tur 20 | 84,4 % | **84,4 %** |
| `balanced` når `SCENARIO_COMPLETE` | 43,7 % | **43,7 %** |
| `aggressive` når `NUCLEAR_EXCHANGE` | 0,0 % | **0,0 %** |
| Andel avgjorda före tur 8 | 0,0 % | **0,00 %** |

En rad reproducerar *inte*: se 5.6.

---

## 2. Brister i verktygskedjan

### 2.1 `npm run build` går inte igenom på en ren klon

`package.json:11` kör `npm run build --workspaces --if-present`. npm kör workspaces i
katalogordning: **`app` före `core`**. `packages/app` importerar `@seventh-front/core`, som
inte har någon `dist/` förrän `core` byggts. Resultat på en färsk klon:

```
src/persistence.ts(15,48): error TS2307: Cannot find module '@seventh-front/core'
src/useGame.ts(6,49):      error TS2307: Cannot find module '@seventh-front/core'
src/wireChain.ts(3,34):    error TS2307: Cannot find module '@seventh-front/core'
npm error Lifecycle script `build` failed with error: code 2
```

Det här är en regression från P11 — när appen fick sitt första riktiga core-beroende. **P0:s
egna `Klart när`-villkor ("`npm run build` går igenom i alla paket") är alltså osant sedan
P11, och ingen prompt har läst om det sedan dess.** Att `npm run harness` fungerar är en
slump: det skriptet bygger uttryckligen `core` först.

Fix: TypeScript project references, eller en explicit byggordning i rot-skriptet. En rad.

### 2.2 Ingen tsconfig täcker `test/` — testerna typkontrolleras aldrig

`packages/core/tsconfig.json` har `"include": ["src"]`. Samma i `harness`. Vitest
transpilerar utan typkontroll. Följden är att typfel i testkod aldrig upptäcks.

Bevis, ett äkta fel som ligger i repot just nu:

```
packages/core/test/resolve.test.ts:189
  const allWireEvents: WireEvent[] = []
```

`WireEvent` importeras aldrig (importerna står på rad 1–4: `describe/expect/it`,
`resolveTurn`, `createInitialState`, `type { GameState, TurnSubmission }`).
`tsc` säger `TS2304: Cannot find name 'WireEvent'`. Testet är grönt, eftersom
typannotationen raderas vid transformen. Det säger ingenting om just det testets riktighet —
men det säger att **hela testsviten är typmässigt oövervakad**, i ett projekt vars viktigaste
regel är `strict: true`.

Fix: en `tsconfig.test.json` per paket med `include: ["src", "test"]` och `noEmit`, kopplad
till `npm run build` eller ett eget `typecheck`-skript.

### 2.3 `packages/app` har noll enhetstester

182 tester fördelar sig: **167 i `core`, 15 i `harness`, 0 i `app`.**

Otestat: `App.tsx` (150 rader), `useGame.ts` (95), `persistence.ts` (89), `wireChain.ts` (20),
`TheHouse.tsx` (195), `TheWorld.tsx` (185), `BidForm.tsx` (154), `TheFloor.tsx` (136),
`TheWire.tsx` (99), `ui.tsx` (100). Cirka **1 220 rader TSX/TS plus 1 088 rader CSS** bevakas
av två Playwright-spec:ar som bara kontrollerar "inga konsolfel över 20 turer" och "draften
överlever en omladdning".

Det är inte en teoretisk risk. Marginalbuggen i `BidForm` (ÄNDRINGSLOGG rad 73) hittades av
att någon *tittade på en skärmbild*, inte av ett test — och den gjorde det enda tal spelaren
ska fatta sitt prisbeslut på meningslöst i varje bud. Samma buggklass finns kvar i härnessen
(5.7). En enda `expect(marginPct).toBeCloseTo(...)` hade fångat båda.

### 2.4 Golden-testet finns fortfarande inte

`packages/core/test/golden/` och `.../fixtures/` innehåller **bara två README.md**. Ingen
`playScript`, ingen `hashState`, ingen `balance.frozen.json`.

Det är redan ärligt loggat (ÄNDRINGSLOGG rad 62) men förtjänar att stå i en granskning ändå,
eftersom konsekvensen är större än raden antyder: `CLAUDE.md` arbetssätt säger "Om
golden-snapshotet ändras: **stanna och fråga**". Hela P10:s balanspass — 12 härnesskörningar,
halverade `fixedCosts`, höjd `orderQuantityMax` — kördes alltså **utan det skyddsnät som var
förutsättningen för att våga skruva**. Att inget gick sönder är tur, inte process.

### 2.5 Ingen CI, ingen täckningsmätning

Ingen `.github/workflows`. Inget `@vitest/coverage-v8`. Med 2.1 och 2.2 ovan betyder det att
tre av fyra kontroller (`build`, typkontroll av tester, täckning) inte körs av någon alls.

---

## 3. Följsamhet mot spec och CLAUDE.md

### 3.1 Där följsamheten är förebildlig

- **Hård regel 1 och 2 är mekaniserade.** `eslint.config.js` förbjuder `react`, `fs`,
  `crypto`, `Date`, `console`, `window`, `document`, `fetch` och `Math.random` i
  `packages/core/src` med egna felmeddelanden som citerar regelnumret. Det är precis rätt
  sätt att hantera en prosaregel som annars glöms bort.
- **Hård regel 3 håller.** Verifierat: `resolveTurn` muterar inte indata, och samma
  seed + submission ger bitvis identiskt resultat.
- **Hård regel 5 håller i `core`.** Alla balanstal ligger i `balance.json`. `DISPLAY_THRESHOLDS`
  (queries.ts:31) exporterar dem till UI:t i stället för att låta appen upprepa dem — ett
  omdöme som är bättre än regeln krävde.
- **Hård regel 7 håller.** Pipelinen i `resolve/index.ts` är oförändrad från specens ordning.
- **Hård regel 9 håller.** `doomsday-exclusivity.test.ts` bevakar att bara `doomsdayGate`
  skriver `state.doomsday`.
- **Ändringsprotokollet efterlevs.** 62 rader, var och en med en motivering. Flera rader är
  självkritiska ("Upptäckt, EJ åtgärdat", "Störst öppen fråga i projektet hittills"). Det är
  ovanligt och det är rätt.

### 3.2 Där specen bryts utan loggrad

**A. Hela användargränssnittet är på svenska.**

Specens rad 6–7, oförändrad sedan v1.0:

> All kod, alla identifierare, **alla UI-strängar** och all speldata är på engelska och ska
> användas ordagrant.

`DESIGN.md` rad 5–6 säger detsamma. Men:

```
packages/app/index.html:2        <html lang="sv">
packages/app/src/components/BidForm.tsx    "Pris", "Leveranstid", "Muta", "Bruttomarginal",
                                           "Din styckkostnad", "Underrättelse",
                                           "Rivalpris, uppskattat", "Vinstchans per pris"
packages/app/src/components/TheHouse.tsx   "Kassa", "Skuld", "Ränta (årlig)", "Styrelsemål",
                                           "Intäkter totalt", "Inga pågående forskningsprojekt."
packages/app/src/components/TheWorld.tsx   "Blocktillhörighet", "Väst", "Öst", "Täckning", "Bränd"
packages/app/src/components/TheFloor.tsx   "Köpare", "Kontraktsvärde", "Försenat"
```

Alla sju app-filer. **Ingen rad i `ANDRINGSLOGG.md`.** Det här är inte en petitess: hela
spelets register är engelskspråkig 1960-talstelex, wire-rubrikerna *är* på engelska
(`HALVORSEN & VOSS WINS CONTRACT: 105MM FIELD GUN, TOWED × 120 TO REPUBLIC OF VIETNAM`), och
runt dem sitter nu svenska etiketter. Antingen ändras specen med en loggrad, eller så ändras
UI:t. Det som inte får stå kvar är att de säger olika.

**B. `board.ts` räknar underkända kontroller kumulativt, inte "två i rad".**

`packages/core/src/resolve/steps/board.ts:76`:

```ts
target.reviewsFailed += 1
```

Det finns ingen nollställning vid godkänd kontroll. Specen (avsnitt 5, "Board"), designen
(§7.3) och `CLAUDE.md` säger alla **"två underkända kontroller i rad"**.

I `INDOCHINA_SLICE` syns det inte, eftersom scenariot bara har två kontrollturer (8 och 14) —
kumulativt och i-rad är då samma sak. Men regeln är fel, inte bara olyckligt implementerad:
ett scenario med kontroller vid tur 8, 14 och 20 skulle ge `BUYOUT` på underkänd → godkänd →
underkänd, vilket är uttryckligen inte regeln. Latent bugg som väcks av nästa scenario.

Fix: `target.reviewsFailed = 0` i `passed`-grenen (board.ts:63).

**C. `House.actionPoints` finns inte.**

`types.ts:339` säger `actions: PlayerAction[] // max house.actionPoints st`. Fältet existerar
inte på `House`, och ingen kod begränsar antalet handlingar. `DESIGN.md` §4 om executive
actions: *"En tur presenterar typiskt 6–9 möjliga handlingar. Du får göra tre. **Detta är
spelet.**"*

Etapp 1 har alltså inte byggt det designdokumentet kallar spelet. Det är delvis loggat via
`applyActions`-luckan (rad 29, från P2) men själva taket har aldrig nämnts.

---

## 4. Den döda datamodellen

Det här är granskningens tyngsta fynd. Sju fält och en hel mekanik finns i `types.ts` och i
speldata, men konsumeras ingenstans. Det gör att flera av designens uttalade kärnmekaniker
inte existerar i det körande spelet.

| Fält / mekanik | Definierad i | Läses av | Konsekvens |
|---|---|---|---|
| `market.supplyCostIndex` | types.ts:141, spec 4.1, DESIGN §5.1, §14 | Läses av 6 ställen — **skrivs av noll** | Permanent 100. `scarcityFactor` och `supplyFactor` är alltid exakt 1 |
| `Product.unitsPerLineTurn` | products.json, spec 2.4 | **Ingenstans** | Produktionstakten är en flat konstant, se 4.2 |
| `balance.gradeScandalChance` | balance.json, DESIGN §5.1 | **Ingenstans** | `grade B/C` har ingen risk alls |
| `reputation.quality` | types.ts:181 | Läses i `repTerm` — **skrivs av noll** | Uppmätt exakt 50 i 900/900 partier |
| `reputation.westStanding` / `eastStanding` | types.ts:182–183 | Läses av `alignmentPenalty` — **skrivs av noll** | `blocTerm` är en konstant per faktion |
| `Product.techRequired` (produktion) | products.json | Bara i `orders.ts:34` (vem som *beställer*) | Huset kan bygga vad som helst, se 4.3 |
| `RivalHouse.sabotagedUntilTurn` | types.ts:346 | **Ingenstans** | — |
| `Station.exposure` | types.ts:223, DESIGN §9 | **Skrivs av noll** | `EXPOSURE`-slutet är praktiskt taget onåbart |

### 4.1 `supplyCostIndex` — den viktigaste döda siffran

`grep -rn "supplyCostIndex =" packages/core/src` returnerar **noll träffar**. Inget steg i
pipelinen rör den. Verifierat i en 21-turerskörning: 100 vid start, 100 vid slut.

Det tar bort tre saker på en gång:

- Spec 4.1: *"kostnaden som faktiskt dras är den som gäller vid produktionstillfället.
  Skillnaden är spelarens risk: ett långt kontrakt taget under lugn och producerat under kris
  äter sin egen marginal. **UI:t visar båda.**"* — `unitCostAtSigning` är alltid exakt lika
  med `unitCostNow`. UI:t visar två identiska tal.
- DESIGN §5.1: *"ett hett kvartal höjer både vad köparen betalar och vad du betalar, och
  nettot beror på om du hann låsa priset innan indexet rörde sig."* — nettot beror på
  ingenting.
- DESIGN §14: `supply_cost_index` är uttryckligen **hela etapp 1:s ersättning för
  råvarumarknaden**. Den ersättningen är en konstant.

Det är en liten kodändring (ett steg som låter indexet följa globalt `heat`) med stor
speleffekt, och den ligger redan implicit i designen: *"rör sig med globalt `heat`"*.

### 4.2 En produktionslinje bygger 40 av allt

`production.ts:80`:

```ts
const plannedUnits = Math.min(remaining, Math.floor(line.unitsPerTurnAtFull * (line.capacityPct / 100)))
```

`line.unitsPerTurnAtFull` sätts en gång i `state.ts:145` från scenariots
`unitsPerLineTurnDefault: 40` och ändras aldrig. `product.unitsPerLineTurn` läses inte.

Vad products.json faktiskt säger, mot vad spelet gör:

| Produkt | `unitsPerLineTurn` i data | Faktisk takt |
|---|---|---|
| M-1 Standard Infantry Rifle | 4 000 | 40 |
| 105mm Field Gun | 40 | 40 |
| M-3 APC | 15 | 40 |
| CH-3 Transport Helicopter | 3 | 40 |
| Coastal Patrol Boat | 4 | 40 |
| Tactical Radio Suite | 20 | 40 |
| **Mk-9 "Longhand" taktisk kärnvapengranat** | **2** | **40** |

Observerat i wire från en riktig körning: hela den scriptade `restricted`-ordern på 8 Mk-9
producerades klart, och `2× MK-9 ... REACHES THE FRONT` / `6× MK-9 ... REACHES THE FRONT`
levererades inom två turer. Kärnvapengranater byggs i samma takt som gevär.

Det förklarar också varför `DESIGN.md` §4:s kärnpåstående inte håller: *"Knappheten ligger i
vad du kan leverera."* När varje linje bygger 40 enheter av vad som helst är kapacitet inte
en knapphet som skiljer produkter åt — den är en flat kvot.

### 4.3 Ingen teknikspärr på produktion

`Mk-9` har `techRequired: 8`. Huset i `INDOCHINA_SLICE` startar med `artillery: 4`
(`techLevelDefault 1 + specialisationBonus 3`) och **`techLevel` ändras aldrig under partiet**
— `house.rnd` är alltid tom, ingen `REPRIORITISE_RND` är byggd. `production.ts` kontrollerar
inte `techRequired` alls.

Ett hus på teknisknivå 4 bygger alltså en produkt som kräver 8, i sin första tur efter
kontraktet. R&D-systemet, som designen ger en egen avdelning och en kö, har noll mekanisk
funktion i etapp 1 utöver att `rndOverhead` (£120 000/projekt) aldrig debiteras eftersom kön
alltid är tom.

---

## 5. Balans — vad härnessen faktiskt visar

6 000 partier, 2 000 per policy, seed-serie `indochina-slice:<policy>:<n>`.

### 5.1 Måltabellen mot verkligheten

| Kriterium | Målvärde | Uppmätt |
|---|---|---|
| `passive` överlever 20 turer | ~35 % | 33,9 % ✓ |
| `passive` förlorar på `BUYOUT` | > 50 %, halva före tur 20 | 78,2 % / 84,4 % ✓ |
| `aggressive` når `NUCLEAR_EXCHANGE` | 0 % (reviderat) | 0,0 % ✓ |
| `balanced` når `SCENARIO_COMPLETE` | 45–65 % | 43,7 % (strax under) |
| Avgjorda före tur 8 | < 10 % | 0,00 % ✓ |
| Spridning slutkassa `balanced` | ≥ 3× | 36,3 × (men se 5.6) |
| Turer med `heat > 40` | 30–60 % | 56,1 / 56,9 / 56,6 % ✓ |
| Grade-spridning | 0 % (reviderat) | 0 % ✓ |

**Tabellen stämmer. Det är inte samma sak som att spelet fungerar** — vilket är precis vad
specen själv varnar för: *"Måltabellen är hypoteser, inte acceptanskriterier."* Sifferraderna
mäter inte de saker som faktiskt är trasiga nedan.

### 5.2 Rivalerna konkurrerar inte

Mätt över 300 partier per policy, räknat på wire-händelser:

| Policy | Avgjorda ordrar | Spelaren vann | Rival vann | Ingen vann |
|---|---|---|---|---|
| `passive` | 5 242 | 4 933 (**94,1 %**) | 132 (2,5 %) | 177 (3,4 %) |
| `aggressive` | 5 382 | 5 382 (**100,0 %**) | **0 (0,0 %)** | 0 |
| `balanced` | 5 564 | 5 224 (**93,9 %**) | 334 (6,0 %) | 6 (0,1 %) |

`aggressive` vann **samtliga 5 382 utlysta ordrar i 300 partier**. Inte en enda rival fick ett
kontrakt. Marknadsandel 100,0 % i 100,0 % av partierna.

Spec avsnitt 4 inleds: *"Detta är etapp 1:s kärna."* Kärnan avgör ingenting.

### 5.3 Orsaken: `trueBudget` diskvalificerar rivalerna i massa

Samma körning räknade diskvalificeringstickers:

| Policy | Rivalbud diskade (över `trueBudget`) | Spelarbud diskade |
|---|---|---|
| `passive` | **10 648** | 9 |
| `aggressive` | **10 707** | 0 |
| `balanced` | **11 212** | 6 |

Ungefär **två diskvalificerade rivalbud per avgjord order**. Med tre rivaler per order betyder
det att omkring två tredjedelar av alla rivalbud aldrig ens når `computeScore`.

Aritmetiken bakom, ur `balance.json` och `pricing.ts`:

```
rivalBid   = referencePrice × (1 + margin + pressure + specBonus + jitter)
             margin ∈ [0,08 … 0,30]     (rivalMarginBase 0,30 − aggression/100 × 0,22)
             ⇒ rivalBid ∈ ca [1,01 … 1,33] × referencePrice

trueBudget = referencePrice × U(0,90 … 1,30)     (trueBudgetMin/MaxFactor)
```

De två fördelningarna överlappar så illa att en rival med låg `aggression` (hög marginal)
nästan alltid ligger över taket. Spelarens botar bjuder under `rivalPriceLow`, alltså långt
under taket, och kvalificerar sig i princip alltid.

**Anbudet avgörs alltså av ett dolt tak, inte av poängformeln.** Det är det enskilt
allvarligaste balansfyndet, och det är inte ett balanstal som råkar vara fel — det är två
oberoende slumpintervall som aldrig kalibrerats mot varandra. `trueBudget` infördes (spec
v1.1, ändring 4) för att göra `statedBudget`-lögnen betydelsefull; effekten blev att den
ersatte auktionen.

### 5.4 `reliability` kollapsar, och det spelar ingen roll

| Policy | `reliability` vid partiets slut (medel) | Andel partier där den är exakt 0 |
|---|---|---|
| `passive` | 15,1 | 28,3 % |
| `aggressive` | 13,1 | 36,7 % |
| `balanced` | 12,5 | 37,0 % |

Startvärdet är 50. Botarna bjuder på allt, kan inte leverera i tid, och `reliability` faller
åtta poäng per missad deadline (`reliabilityLatePenalty: 8`). Och sedan händer ingenting.

Vid `reliability = 0` blir `repTerm = (0−50)/5 + (50−50)/8 = −10`. `priceTerm` skalas med
`priceTermWeight: 120`. Ett bud 10 % under referenspriset ger `−0,55 × (−0,10) × 120 = +6,6`;
ett bud 20 % under ger `+13,2`. Ett hus med totalt förstört leveransrykte köper alltså tillbaka
hela straffet med en prissänkning på ~15 %.

`DESIGN.md` §4 säger att detta ska vara den självstraffande mekanik som gör "bjud på allt" till
en dålig strategi: *"Att bjuda på allt är därför den näst sämsta strategin i spelet."* Mätt:
`aggressive`, som bjuder på precis allt, har den högsta slutkassans p90 (£7,4 M mot `passive`s
£4,0 M) och 36,2 % `SCENARIO_COMPLETE` mot `passive`s 21,7 %. Att bjuda på allt är just nu en
av de bättre strategierna.

Samma sak från andra hållet: `creditLimit` skalas med `reliabilityMult = 0,5 + reliability/100`.
Vid reliability 0 halveras kreditutrymmet — men botarna tar aldrig lån, så kopplingen mellan
rykte och ekonomi som DESIGN §7.1 beskriver som poängen med kreditgränsen har aldrig prövats.

### 5.5 Köparna handlar för pengar de inte har

`bidding.ts:148`:

```ts
faction.militaryBudget -= winner.price
```

Ingen golvkontroll, ingen påfyllnad någonstans i `factions.ts`, och ingen kontroll vid
ordergenerering. Uppmätt:

| Policy | Partier med minst en köpare på negativ `militaryBudget` |
|---|---|
| `passive` | 65,3 % |
| `aggressive` | **99,7 %** |
| `balanced` | **99,7 %** |

Observerat i ett enskilt parti: Republic of Vietnam slutade på
**`militaryBudget: −17 113 805`** efter att ha startat på 6 000 000.

`DESIGN.md` §11 definierar fältet som *"det som faktiskt kan köpa av dig"*. Just nu köper det
oändligt. Det tar bort det beslut designen uttryckligen pekar ut som fint: *"ibland tar du ett
sämre pris bara för att hålla köparen solvent."*

### 5.6 Utfallsrymden är två turer bred

Sluttur för samtliga 6 000 partier:

| Sluttur | Antal | Andel |
|---|---|---|
| **14** | 3 653 | **60,9 %** |
| **20** | 2 299 | **38,3 %** |
| 15–18 | 48 | 0,8 % |

**99,2 % av alla partier slutar på en av exakt två turer.** Tur 14 är den tidigaste tur
`BUYOUT` kan inträffa (två kontroller krävs, de ligger på 8 och 14). Tur 20 är scenariots
slut. Allt däremellan är nästan tomt.

Slutorsaker över alla 6 000: `BUYOUT` 3 734 (62,2 %), `SCENARIO_COMPLETE` 2 033 (33,9 %),
`INSOLVENCY` 233 (3,9 %), **`EXPOSURE` 0, `NUCLEAR_EXCHANGE` 0**.

Två av fem slutvillkor har alltså aldrig inträffat i 6 000 partier. `NUCLEAR_EXCHANGE` är
redan utrett och korrekt förklarat (P7:s automatiska BACK DOWN nollställer till 40 innan
`endings.ts` ser 95). `EXPOSURE` har ingen loggrad: det kräver tre exponeringar på sex turer,
och den enda kod som pushar till `exposureEvents` är just den automatiska BACK DOWN
(`doomsday.ts:113`). `Station.exposure` skrivs aldrig, `INTEL`-operationer är no-ops. Slutet är
onåbart av samma skäl som sitt motsatta.

**Om "spridning i slutkassa":** ÄNDRINGSLOGG rad 60 definierar måttet som p90/p10 bland partier
som *inte* gick i `INSOLVENCY`, och rapporterar ~32×. Den definitionen reproducerar inte —
25,1 % av `balanced`s partier slutar med negativ kassa utan att vara `INSOLVENCY` (`BUYOUT` med
skuld), så p10 blir −235 200 och kvoten −40,7×, alltså meningslös. Måttet reproducerar vid
**36,3×** om man i stället läser "bland partier med positiv slutkassa". Det är samma slags
problem raden själv beskriver, bara ett steg för lite löst. Dokumentationsfel, inte kodfel —
men raden bör rättas, annars kommer nästa balanspass att mäta något annat.

### 5.7 De tre botarna är i praktiken samma bot

ÄNDRINGSLOGG rad 74 loggar enhetsfelet i `policies.ts:30` som "Upptäckt, EJ åtgärdat":

```ts
const margin = point.price > 0 ? (point.price - estimate.yourUnitCost) / point.price : 0
if (margin <= 0.2) continue
```

`point.price` är hela kontraktets pris; `yourUnitCost` är **en enhets** kostnad. Med en order
på 100 enheter jämförs £2 000 000 mot £11 500. Marginalen blir ~99 % på varenda prispunkt,
filtret släpper igenom allt, och `passive` degenererar till "välj winBand-punkten med högst
konfidens" — vilket är den lägsta prispunkten. Alltså i praktiken samma sak som `aggressive`s
"underbjud alltid".

Mätbar effekt av att de tre inte är olika:

- `passive` och `aggressive` får **samma slutorsak på samma seedindex i 52,6 %** av fallen.
- Andel turer med `heat > 40`: median **exakt 60,0 %** för alla tre.
- Kontrakt per parti: 16,9 / 18,1 / 17,3.
- Bruttomarginal: 43,4 % / 41,7 % / 48,5 %.

Specen är uttrycklig: *"Botstrategier behöver inte vara smarta. De behöver vara olika."* De är
det inte, och det gör att hela måltabellen i 7.3 jämför tre kopior av samma spelstil. Det är
skälet att P10:s slutsats "`passive`s marginalfilter är sällan begränsande" har fel förklaring
i loggen — orsaken är inte `products.json`s kostnadsspann, som rad 74 riktigt påpekar, utan
buggen. Och konsekvensen är att **P10:s hela uppmätta kolumn behöver köras om efter en fix.**

### 5.8 Produkterna har ingen marginalprofil

`unitCost / baseCost` per produkt:

| Produkt | Kvot | Bruttomarginal vid referenspris |
|---|---|---|
| Tactical Radio Suite | 0,533 | 46,7 % |
| M-1 Rifle | 0,553 | 44,7 % |
| 105mm Field Gun | 0,575 | 42,5 % |
| M-3 APC | 0,585 | 41,5 % |
| Mk-9 Longhand | 0,600 | 40,0 % |
| Coastal Patrol Boat | 0,611 | 38,9 % |
| CH-3 Helicopter | 0,619 | 38,1 % |

Spannet är 38–47 %. Spec 2.4: *"`baseCost` är marknadens förväntan, `unitCost` är
verkstadsgolvet. **Marginalen mellan dem är spelet.**"* Med sju produkter som alla ligger
inom nio procentenheter finns inget produktval att göra — och eftersom `unitsPerLineTurn` är
dött (4.2) finns inte heller något kapacitetsval. Valet av *vad* man bygger är för närvarande
utan innehåll; bara *vilket pris* man sätter betyder något.

Relaterat, ett spec-krav som inte är uppfyllt: avsnitt 6 kräver att den `restricted`-produkten
har *"ett `baseCost` i storleksordningen tre till fem gånger en ordinär order"* (DESIGN §5.2
säger detsamma). Mk-9 ligger på 900 000 mot CH-3:ans 420 000 — **2,1×**, under intervallet.
Den scriptade ordern (8 st, tur 10) ger ändå ~7,2 M mot ett styrelsemål på 8 M, så kravet
"stor nog att ensam avgöra styrelsemålet" är uppfyllt. Men frestelsen är mindre än designen
beställde.

---

## 6. Designfråga värd ett beslut: `bidEstimate` använder dold information exakt

`queries.ts` läser i `computeWinBand`:

- rad 132: `const withinBudget = price <= p.order.trueBudget`
- rad 140–141: `weights: p.order.weights`, `inspectorIntegrity: p.order.inspectorIntegrity`
- rad 155: `if (sampledBid.price > p.order.trueBudget) continue`

Alla tre är fält specen uttryckligen kallar **dolda** (spec 4.3: *"Vikterna, `trueBudget` och
`inspectorIntegrity` förblir dolda"*).

Två följder:

1. **`winBand` läcker taket.** Konfidensen faller till 0 exakt vid `trueBudget`. Spelaren kan
   avläsa var köparens sanna tak ligger genom att se var stapeln tar slut — utan att spelet
   någonsin säger det.
2. **`depth` köper mindre än designen lovar.** `effectiveDepth` (queries.ts:49) påverkar bara
   *prisbandets bredd*. Poängmodellen bakom konfidenssiffran är perfekt kalibrerad redan vid
   `depth 0`. En spelare utan underrättelse får alltså ett brett prisband med *exakt riktiga*
   sannolikheter i det. DESIGN §5: *"Varje spionpoäng du lägger konverteras till
   anbudsprecision, och anbudsprecision är pengar."* — halva den konverteringen saknas.

Det här är inte en bugg mot en skriven regel, och implementationen är genomtänkt (kommentaren
i queries.ts:116–122 motiverar Monte Carlo-valet bra). Men det är ett designbeslut som fattats
i kod utan loggrad, och det påverkar precis den mekanik som är etapp 1:s hjärta.

---

## 7. Kodkvalitet i övrigt

Det här är en kort sektion, för att det mesta är bra.

**Starkt:**

- Kommentarstätheten är exceptionell och nästan alltid *motiverande* snarare än beskrivande.
  `production.ts:4–9` förklarar varför linjetilldelningen är automatisk; `applyActions.ts:9–24`
  förklarar varför `TAKE_LOAN` byggdes ur ordning. Den som tar över repot om sex månader kan
  läsa sig till besluten.
- Provisoriska konstruktioner är genomgående märkta `PROVISORISK` i versaler med en pekare till
  ÄNDRINGSLOGG. Det är rätt sätt att bära teknisk skuld.
- `applyActions.ts:38–41` — den lokala `remainingCredit`-kopian, så att flera `TAKE_LOAN` i
  samma inskickning inte kan stapla lån förbi taket. Ett riktigt fynd som ingen spec krävde.
- `heat.ts:31–34` — nedre klampning på `heat` med motiveringen att `Pct` är ett typkontrakt,
  inte en balanssiffra. Rätt gränsdragning.
- `wire.ts` beskärning med bevarade orsakskedjor, bevakad av ett invarianttest.

**Svagt:**

- **`causeId` är nästan alltid `null`.** `CLAUDE.md` hård regel 4 säger "med `causeId` när det
  finns en känd orsak". I `bidding.ts` (5 emits), `production.ts` (2 emits) och `board.ts`
  (2 emits) är samtliga `causeId: null`. Flera av dem har en känd orsak: en produktion har ett
  kontrakt som har en vunnen order. `DESIGN.md` §8 kallar kausalmotorn *"ett arkitektoniskt
  krav, inte en UI-feature"* och exemplifierar med en fyra led djup kedja. I praktiken är
  wire-trädet mest platt. Regeln följs formellt (varje ändring emitterar något) men inte i
  anden.
- `draft.market.contracts.find(...)` körs tre gånger per linje och tur i `production.ts`
  (rad 41, 57, 73) över en växande array. Med 24 kontrakt och 4 linjer i ett 20-turersparti är
  det irrelevant för prestanda, men det är samma slags linjärsökning tre gånger om i samma
  funktion där ett `Map` hade varit tydligare.
- `pricing.ts:52` och fem andra ställen: `balanceData as unknown as Balance`. Dubbel-castet
  kringgår all typkontroll mot JSON-filen. Om ett fält stavas fel i `balance.json` blir det
  `undefined` och propagerar som `NaN` genom hela poängformeln utan att något test fångar det.
  En `zod`-validering eller en genererad typ vid bygget hade varit billig försäkring i just den
  fil som är tänkt att skruvas hundratals gånger.

---

## 8. Dagsform — sammanfattande bedömning

**Var projektet står:** P0–P12 är byggda och alla `Klart när`-villkor utom P0:s (`npm run
build`, se 2.1) är uppfyllda i bokstavlig mening. Det är tolv promptar på under två dygn, med
en ändringslogg som faktiskt håller. Som *process* är det här bland det bättre jag sett i ett
LLM-drivet bygge.

**Var spelet står:** Specens avsnitt 11 ställer frågan som avgör om etapp 2 är värd att bygga:

> Är tjugo turer av detta spännande, och tvingar de fram minst ett beslut där lönsamhet och
> överlevnad pekar åt olika håll?

Härnessen svarar redan, utan att du behöver spela tio partier:

- **Anbudsspelet tvingar fram inget beslut**, eftersom spelaren vinner allt (5.2/5.3).
- **Grade-valet tvingar fram inget beslut**, eftersom skandalrisken inte finns (4, `gradeScandalChance`).
- **Produktvalet tvingar fram inget beslut**, eftersom alla produkter har samma marginal och
  samma produktionstakt (4.2, 5.8).
- **Kostnadsrisken finns inte**, eftersom `supplyCostIndex` är en konstant (4.1).
- **Ryktet kostar ingenting**, eftersom `reliability` kan prisas bort (5.4).

Det enda beslut som faktiskt pekar åt två håll är den scriptade `restricted`-ordern på tur 10:
7,2 M mot ett styrelsemål på 8 M, till priset av +14…25 `DOOMSDAY`. **Designpelare 1 prövas
alltså av exakt en händelse per parti** — och eftersom `NUCLEAR_EXCHANGE` är strukturellt
onåbart (P7:s automatiska BACK DOWN) finns ingen väg från den frestelsen till en verklig
förlust. Frestelsen är gratis.

**Min bedömning:** svaret på specens fråga är *"inte än, men inte för att spelet är fel
tänkt"*. Ingen av bristerna ovan är arkitektonisk. Alla utom en (`trueBudget` mot rivalmarginal,
5.3) är att koppla in något som redan finns i modellen. Det är ovanligt gynnsamt läge — och
det är starkt skäl att **inte** gå vidare till etapp 2:s bredd förrän skivan faktiskt är ett
spel. Se rapport 3.

**Det jag skulle göra först, i den ordningen:**

1. Rätta enhetsfelet i `policies.ts:30` och kör om hela P10 (annars är varje balanssiffra i
   spec 7.3 mätt på en trasig bot).
2. Kalibrera `trueBudget` mot rivalernas marginalintervall så att rivaler *förlorar* i stället
   för att diskas.
3. Koppla in `supplyCostIndex`, `unitsPerLineTurn` och `gradeScandalChance` — tre små
   kodändringar, tre återuppståndna mekaniker.
4. Laga `npm run build` och typkontrollera testerna.
5. Bestäm UI-språket, och skriv en loggrad oavsett vilket du väljer.

---

*Granskningen kördes i en isolerad sandlåda mot commit `156eb7d`. Härnessdata: 6 000 partier
(måltabell) + 900 partier (instrumenterade wire-mätningar). Rådata och probe-skript kan
återskapas ur siffrorna i avsnitt 5.*
