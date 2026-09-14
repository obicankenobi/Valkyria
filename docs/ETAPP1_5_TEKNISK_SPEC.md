# THE SEVENTH FRONT — Teknisk spec, etapp 1,5

**Version 1.0 — antagen (ägarbeslut 2026-09-14, se `docs/ANDRINGSLOGG.md`).** Samma vertikala
skiva: `INDOCHINA_SLICE`, 20 turer. Ingen ny front, ingen ny köpare, inget nytt scenario.
Etappen kopplar in det som redan finns i modellen och lagar det som mäts som trasigt.

Grundlaget är den externa granskningen i `docs/RAPPORT1_GRANSKNING.md` (mätt mot HEAD `156eb7d`)
och den långsiktiga planen i `docs/RAPPORT2_LANGSIKTIG_PLAN.md`.

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

Specen är **fryst under P13–P22**. Den får ändras mellan promptar om en byggd sanning visar sig
strida mot den, men aldrig av en kodsession på eget initiativ. Se `CLAUDE.md`.

---

## 0. Varför den här etappen finns

Etapp 1 byggde tretton resolve-steg och kopplade in ungefär åtta. Följande är mätt i härnessen
(6 000 partier, se granskningsrapporten) och är etappens beställningsunderlag:

| Fynd | Mätt värde | Avsnitt |
|---|---|---|
| Spelaren vinner nästan varje utlyst order | 94–100 % beroende på policy; `aggressive` 5 382/5 382 | 2 |
| Rivalbud diskvalificeras i stället för att förlora | ~2 diskade rivalbud per avgjord order | 2 |
| `supplyCostIndex` skrivs aldrig | konstant 100 i alla partier | 3 |
| `Product.unitsPerLineTurn` läses aldrig | varje linje bygger 40 av allt | 4 |
| `gradeScandalChance` konsumeras aldrig | `quality` = exakt 50 i 900/900 partier | 5 |
| `reliability` kollapsar utan konsekvens | medel 12,5–15,1 vid slutet; 0 i 28–37 % av partierna | 6 |
| `militaryBudget` går obegränsat negativ | negativ i 65–99,7 % av partierna; observerat −17 113 805 | 7 |
| `applyActions` saknar fyra av fem handlingstyper | `DESIGN.md` §4 ("detta är spelet") obyggt | 8 |
| Två av fem slutvillkor inträffar aldrig | `EXPOSURE` 0/6000, `NUCLEAR_EXCHANGE` 0/6000 | 9 |
| Härnessens `passive`-bot har ett enhetsfel | marginalfiltret släpper igenom allt | 10 |
| `npm run build` misslyckas på en ren klon | workspace-ordning | 11 |
| Testerna typkontrolleras aldrig | inget tsconfig-`include` täcker `test/` | 11 |
| Golden-testet existerar inte | bara två README.md i `test/golden/` | 11 |
| UI-strängarna är svenska, specen kräver engelska | alla sju app-filer, `<html lang="sv">` | 12 |

Etappens fråga: **tvingar tjugo turer fram minst ett beslut där lönsamhet och överlevnad pekar
åt olika håll?** Det är samma fråga som etapp 1:s avsnitt 11 ställer. Den går inte att besvara
i dag, eftersom besluten den handlar om inte finns i koden.

---

## 1. Repostruktur — tillägg

Inga nya paket. Nya filer:

```
packages/core/src/
  resolve/steps/supply.ts        NYTT steg, se 3
  officials.ts                   NEJ — etapp 3, inte här
packages/core/test/
  golden/playScript.ts           golden-testets drivare, se 11.3
  golden/hashState.ts
  golden/golden.test.ts
  golden/fixtures/balance.frozen.json
  steps/supply.test.ts
tsconfig.test.json               per paket, se 11.2
```

`core` får fortfarande aldrig importera `react`, `Date`, `Math.random`, `crypto`, `fs` eller
`console`. `eslint.config.js` bevakar det och ska inte luckras upp.

---

## 2. Auktionen — `trueBudget` mot rivalmarginal

**Detta är etappens viktigaste ändring.** Allt annat i etappen kan skjutas; detta kan inte.

### 2.1 Problemet, exakt

```
rivalBid   = referencePrice × (1 + margin + pressure + specBonus + jitter)
             margin = rivalMarginBase(0,30) − aggression/100 × rivalMarginAggressionScale(0,22)
             margin ∈ [0,08 … 0,30]
             ⇒ rivalBid ∈ ca [1,01 … 1,33] × referencePrice

trueBudget = referencePrice × U(trueBudgetMinFactor 0,90 … trueBudgetMaxFactor 1,30)
```

Fördelningarna överlappar så illa att en rival med låg `aggression` nästan alltid ligger över
taket. Spelarens bud ligger typiskt under `rivalPriceLow` och kvalificerar sig alltid.
Anbudet avgörs alltså av diskvalificering, inte av `computeScore` — vilket är motsatsen till
vad avsnitt 4.4 i etapp 1-specen beskriver som spelets kärna.

### 2.2 Regeln som ska gälla

**`trueBudget` ska vara ett sällsynt tak, inte den normala avgörandemekanismen.** Målet:
högst 10 % av alla rivalbud diskvalificeras, och rivalerna vinner mellan 25 % och 50 % av
utlysta ordrar mot en kompetent bot.

Två ändringar, båda i `balance.json` — ingen kodändring:

```jsonc
"trueBudgetMinFactor": 1.15,      // var 0.90
"trueBudgetMaxFactor": 1.45,      // var 1.30
```

Motivet för att flytta *taket* och inte rivalmarginalen: rivalmarginalen står ordagrant i
etapp 1-specens avsnitt 4.2 och är en beskriven speldesign (aggressiva rivaler lägger lågt).
`trueBudget`-faktorerna är däremot provisoriska, införda i P4 utan att specen ger dem värden.
Det är alltså den av de två fördelningarna som får flyttas utan att en skriven regel ändras.

**`statedBudget` följer med.** `statedBudgetMin/MaxFactor` (0,60 / 0,95) multiplicerar
`trueBudget`. Med det nya taket blir den uppgivna budgeten 0,69–1,38 × referenspris, vilket
fortfarande gör lögnen meningsfull åt båda håll.

### 2.3 Varning

Den här ändringen flyttar **varje** rad i måltabellen. Den måste därför köras *före* P22:s
balanspass och *efter* att härnessens botar lagats (10), annars mäts den genom en trasig bot.

---

## 3. `supplyCostIndex` — ett nytt pipeline-steg

### 3.1 Regeln

`DESIGN.md` §14: *"I etapp 1 finns råvara som en enda siffra: `supply_cost_index`, som rör sig
med globalt `heat` och multiplicerar dina styckkostnader."* Det sista ledet är byggt. Det
första är det inte.

Nytt steg `supply.ts`, insatt i `PIPELINE` **mellan `heat` och `doomsday`**:

```ts
const PIPELINE: ResolveStep[] = [
  applyActions, production, deliveries, fronts, factions,
  heat,
  supply,            // ← NYTT
  doomsday, rivals, orders, bidding, economy, board, endings,
]
```

Placeringen är en spelregel: indexet ska spegla den `heat` som just uppdaterats, och vara
skrivet innan `orders` fryser nästa referenspris.

**Detta är den enda ändringen av pipelineordningen som den här specen tillåter.** Se
`CLAUDE.md` hård regel 7.

### 3.2 Formeln

```
globalHeat      = medelvärdet av theatre.heat över alla teatrar
targetIndex     = 100 + globalHeat × supplyHeatCoupling
supplyCostIndex = clamp(supplyIndexMin, supplyIndexMax,
                        previous + clamp(−supplyIndexMaxStep, supplyIndexMaxStep,
                                         targetIndex − previous))
```

Trögheten (`supplyIndexMaxStep`) är poängen: indexet ska släpa efter `heat` så att ett kontrakt
taget i lugn och producerat i kris faktiskt kostar mer än det låstes till. Utan trögheten hinner
spelaren alltid se rörelsen innan hen bjuder.

Nya fält i `balance.json`:

```jsonc
"supplyHeatCoupling": 0.45,     // heat 100 → target 145
"supplyIndexMin": 85,
"supplyIndexMax": 160,
"supplyIndexMaxStep": 6         // max ±6 per tur
```

`supplyIndexMin` under 100 är avsiktligt: en teater som svalnar ska kunna ge spelaren ett
kostnadsläge som är *bättre* än utgångsläget, annars är indexet en ensidig skatt.

### 3.3 Wire

Steget emitterar en `ticker` varje tur indexet rör sig, med `delta: { supplyCostIndex: Δ }`,
och en `report` när det korsar 120 eller 140 i någondera riktningen:

```
SUPPLY COST INDEX RISES TO 127 — RAW MATERIAL PRESSURE ACROSS THE BLOC
```

### 3.4 UI

`THE HOUSE` ska visa indexet som en mätare mot 100-linjen, och **marginal per aktivt kontrakt
ska räknas mot `unitCostNow`, inte mot `unitCostAtSigning`**, med båda talen synliga. Det är
vad etapp 1-specens avsnitt 4.1 alltid krävt ("UI:t visar båda") och som hittills varit
meningslöst eftersom talen alltid varit lika.

---

## 4. Produktionstakt per produkt

### 4.1 Regeln

`production.ts:80` använder `line.unitsPerTurnAtFull` för varje produkt.
`Product.unitsPerLineTurn` läses aldrig. Byt till:

```
lineThroughput = product.unitsPerLineTurn × (line.capacityPct / 100) × lineEfficiency
plannedUnits   = min(remaining, floor(lineThroughput))
```

där `lineEfficiency` är `line.unitsPerTurnAtFull / scenario.unitsPerLineTurnDefault` — alltså
en linjekvalitetsfaktor som är 1,0 för alla linjer i dagens scenario men som ger `BUILD_LINE`
(avsnitt 8) något att variera.

### 4.2 Följd som måste hanteras

Med den här ändringen blir `m1_rifle` 4 000 enheter per linjetur och `mk9_longhand_shell` 2.
Det ändrar ekonomin dramatiskt i båda riktningarna. Två saker faller ut:

- **Ordervolymerna måste separeras per produkt.** `orderQuantityMin/Max` (20/185) är i dag
  globala. De blir orimliga för gevär (20 gevär är ingen order) och för kärnvapengranater (185
  är ett krig). Inför `Product.orderQuantityMin` / `orderQuantityMax` i `products.json` och låt
  `balance.json`s globala värden vara fallback.
- **`minDelivery` blir meningsfull.** En order på 200 helikoptrar kan inte levereras på tre
  turer med tre per linjetur och fyra linjer. Det är avsikten: `DESIGN.md` §4 säger att
  knappheten ligger i vad du kan leverera. Från och med nu gör den det.

### 4.3 Produktdata

Nuvarande sju produkter har alla `unitCost/baseCost` mellan 0,53 och 0,62 — alltså ingen
marginalprofil. Sätt om dem i tre klasser:

| Klass | `unitCost/baseCost` | Exempel | Roll |
|---|---|---|---|
| Massvara | 0,72–0,78 | `m1_rifle`, `tac_radio_suite` | Låg marginal, hög volym, låg risk. Betalar fasta kostnader |
| Specialitet | 0,48–0,56 | `105mm_field_gun`, `m3_apc`, `ch3_transport_helicopter`, `coastal_patrol_boat` | Medelmarginal, kräver kapacitet |
| `restricted` | 0,30–0,38 | `mk9_longhand_shell` | Extrem marginal, extrem risk |

Och: `mk9_longhand_shell.baseCost` höjs från 900 000 till **1 600 000**, så att den uppfyller
etapp 1-specens avsnitt 6-krav ("tre till fem gånger en ordinär order") i stället för dagens
2,1×.

---

## 5. Grade-skandal

### 5.1 Regeln

`balance.gradeScandalChance` (`{A: 0, B: 4, C: 14}`) finns sedan P1 och konsumeras ingenstans.
Koppla in den i `deliveries.ts`, vid den tur ett kontrakt sätts `fulfilled`:

```
om rng.chance(gradeScandalChance[contract.grade]):
    reputation.quality −= qualityScandalPenalty
    house.scandalUntilTurn = turn + qualityScandalTurns
    emit headline, scope 'house', causeId = leveransens event-id
```

Nya fält i `balance.json`:

```jsonc
"qualityScandalPenalty": 12,
"qualityScandalTurns": 3
```

`DESIGN.md` §5.1 säger "tre turers ryktesskada" för grade C, vilket `qualityScandalTurns`
kodar. Under `scandalUntilTurn` gäller:

- `repTerm`s `quality`-halva räknas med den sänkta siffran (automatiskt, inget extra)
- `creditLimit` multipliceras med `scandalCreditPenalty` (0,75)

### 5.2 Varför detta är viktigare än det ser ut

Utan skandalrisken är grade C strikt bättre än A i procentmarginal och därmed alltid rätt val
när kassan är trängd — vilket är hälften av den avvägning `DESIGN.md` §5.1 beskriver. Med
risken blir valet det dokumentet lovar: *"C är rätt när du är trängd på kassa eller när köparen
är prisviktad, och fel när du har rykte att förlora."*

**Kravet på härnessen efter denna ändring:** minst en bot ska variera grade. `balanced` ska
välja grade efter kassaläge (C under `gradeCashPressureThreshold`, annars A). Det gör
måltabellens grade-spridningsrad mätbar igen — den nollställdes i P10 just för att alla tre
botar alltid valde A.

---

## 6. `reliability` ska väga

### 6.1 Problemet

Vid `reliability = 0` ger `repTerm` −10. Ett bud 15 % under referenspriset ger `priceTerm`
ungefär +10. Ett hus med totalt förstört leveransrykte köper alltså tillbaka hela straffet med
en prissänkning på 15 %, och kan fortsätta bjuda på allt.

### 6.2 Regeln

Två ändringar. Den första är ett balanstal, den andra en regel.

**A. Skärp `repTerm`s viktning (balance.json):**

```jsonc
"repTermReliabilityDivisor": 2,     // var 5 → reliability 0 ger −25 i stället för −10
"repTermQualityDivisor": 4          // var 8 → quality-skandal biter
```

**B. Hård spärr vid mycket lågt rykte.** Ny regel i `bidding.ts`, direkt efter
`trueBudget`-kontrollen:

```
om house.reputation.reliability < reliabilityBidFloor:
    budet diskvalificeras
    rejected.push({ action: bid, reason: 'reputation below buyer threshold' })
    emit ticker
```

```jsonc
"reliabilityBidFloor": 15
```

Det gör "bjud på allt" till den självstraffande strategi `DESIGN.md` §4 påstår att den redan
är: du kan överbjuda din kapacitet, men bara till en punkt, och återhämtningen är långsam.

### 6.3 Återhämtning

`reliability` faller i dag 8 per missad deadline (`reliabilityLatePenalty`) och stiger aldrig.
Lägg till i `deliveries.ts`, vid ett kontrakt som blir `fulfilled` i tid:

```
reliability = min(100, reliability + reliabilityOnTimeBonus)
```

```jsonc
"reliabilityOnTimeBonus": 3
```

Asymmetrin (−8 / +3) är avsiktlig: rykte tar tid att bygga och går snabbt att förlora.

---

## 7. `militaryBudget` som verklig gräns

### 7.1 Regeln

Tre ändringar, alla små.

**A. Golv vid tilldelning** (`bidding.ts`, före `faction.militaryBudget -= winner.price`):

```
om winner.price > faction.militaryBudget:
    ordern går ofullbordad (samma gren som "no winner")
    emit report: "<BUYER>'S ORDER FOR <PRODUCT> WITHDRAWN — BUDGET EXHAUSTED"
```

**B. Påfyllnad** (`factions.ts`, varje tur):

```
militaryBudget += round(faction.treasury × militaryBudgetQuarterlyShare)
militaryBudget  = min(militaryBudget, faction.treasury)
```

```jsonc
"militaryBudgetQuarterlyShare": 0.08
```

**C. Ordergenerering respekterar budgeten** (`orders.ts`): en faktion utlyser ingen order vars
`referencePrice` överstiger dess `militaryBudget`.

### 7.2 Vad det ger

`DESIGN.md` §11: *"Bankrutt faktion → pågående kontrakt annulleras... Det skapar det fina
beslutet: ibland tar du ett sämre pris bara för att hålla köparen solvent."* Det beslutet
existerar inte i dag, eftersom en köpare aldrig tar slut på pengar — hon bara går minus i
evighet. Med A+B+C blir en utplundrad köpare en köpare som slutar beställa, vilket är den enda
form av knapphet på efterfrågesidan spelet har.

---

## 8. `applyActions` — handlingarna som aldrig byggdes

`applyActions.ts` har saknat en ägande prompt sedan P2. Den här specen tilldelar den (P17–P18).
Etapp 1,5 bygger **inte** alla fem typerna. Den bygger de tre som har fält i modellen redan.

### 8.1 `house.actionPoints`

Nytt fält på `House`, refererat av `types.ts:339` sedan P2 men aldrig infört:

```ts
actionPoints: number     // härlett, skrivs bara i economy.ts
```

```
actionPoints = staff.chiefOfStaff > chiefOfStaffActionBonusThreshold ? 4 : 3
```

```jsonc
"chiefOfStaffActionBonusThreshold": 70
```

`applyActions` avvisar varje handling utöver `actionPoints` med
`reason: 'no executive actions remaining'`, i inskickad ordning. `QUOTE`/bud kostar fortfarande
ingenting (etapp 1-specens avsnitt 3.1, oförändrat).

### 8.2 `INTERNAL` — fullständig

| Op | Effekt |
|---|---|
| `TAKE_LOAN` | Byggd i P8. Oförändrad |
| `REPAY` | `payload: { amount }`. `treasury −= amount`, `debt −= amount`. Avvisas om `amount > min(treasury, debt)` |
| `BUILD_LINE` | Kostar `buildLineCost`. Ny `ProductionLine` med `unitsPerTurnAtFull = scenario-default`, `status: 'idle'`. Avvisas över `maxProductionLines` (9, `DESIGN.md` §3) |
| `HIRE` | `payload: { role: 'chiefEngineer' \| 'chiefSalesman' \| 'chiefOfStaff' }`. Kostar `hireCost`, höjer rollen med `hireGain` (tak 100) |
| `REPRIORITISE_RND` | `payload: { category }`. Lägger ett `RndProject` i kön med `turnsTotal = rndProjectTurns`. Kostar `rndOverhead` per tur medan det löper (redan byggt i `economy.ts`). Vid färdigställande: `techLevel[category] += 1` |

### 8.3 `POLITICAL` — två av tre

| Op | Effekt |
|---|---|
| `BRIBE` | `spend` läggs som `Bid.bribe` på nästa bud mot `targetFactionId`. Alternativt (enklare, föredraget): höj `relationToPlayer` med `spend / bribeRelationCostPerPoint`, tak `bribeRelationMaxPerTurn` |
| `STAGE_INCIDENT` | Kostar `spend`. `rng.chance(stageIncidentSuccessPct)`: vid framgång höjs teaterns `heat` med `stageIncidentHeatMin…Max` och, om målet är blockgränsande (`abs(alignment) > 60`), anropas `doomsdayGate` med `stageIncidentDoomsdayMin…Max`. Vid misslyckad attribution: `exposureEvents.push(turn)` och en `headline` som pekar tillbaka på huset |
| `BACK_CHANNEL` | Kostar `spend`. `doomsdayGate(ctx, −backChannelDoomsdayMin…Max, causeId)` |

`FUND_COUP` förblir etapp 2 (`DESIGN.md` §13). `ASSASSINATE` finns inte i `IntelOp` och ska
inte läggas till.

**`STAGE_INCIDENT` är den fjärde `DOOMSDAY`-drivaren** som etapp 1-specens avsnitt 5 räknar upp
och som aldrig kunde kopplas (loggad sedan P2, bekräftad i P7). Med den är alla fyra drivare
levande för första gången.

### 8.4 `INTEL` — minimal men verklig

| Op | Effekt |
|---|---|
| `EXPAND` | `station.depth += 1` (tak 5). Kostar `intelExpandCost`. `exposure += intelExposurePerOp` |
| `RECRUIT` | Ny `Station` i `payload.nation`, `depth: 0`. Kostar `intelRecruitCost`. Avvisas över `maxStations` (5) |
| `WITHDRAW` | `station.status = 'dormant'`. `exposure` faller `intelDormantExposureDecay` per vilande tur |
| `LEAK`, `SABOTAGE`, `TURN` | **Medvetna no-ops i etapp 1,5.** De kräver mål som inte finns i modellen än (namngivna tjänstemän, rivalers leverantörskedjor). Returnerar `rejected` med `reason: 'not implemented in this stage'` |

**`Station.exposure` skrivs för första gången.** Regeln ur `DESIGN.md` §9: `exposure` stiger
8–25 per operation, faller 5 per vilande tur, och vid `exposure > 80` rullas varje tur mot
avslöjande (`status: 'burned'` + `exposureEvents.push(turn)`).

Det är vad som gör `EXPOSURE`-slutet nåbart (9).

---

## 9. Krisvalet och de två spärrade slutvillkoren

### 9.1 Problemet

`NUCLEAR_EXCHANGE`: `doomsday.ts` (P7) väljer alltid automatiskt BACK DOWN vid tröskel 75 och
nollställer till 40 innan `endings.ts` kan se 95. Uttryckligen provisoriskt, loggat.

`EXPOSURE`: kräver tre exponeringar på sex turer; den enda kod som pushar till `exposureEvents`
är just den automatiska BACK DOWN.

Båda spärrarna öppnas av samma sak: ett riktigt spelarval.

### 9.2 Ny `PlayerAction`-variant

```ts
| { type: 'CRISIS'; choice: 'PUSH' | 'BACK_DOWN' | 'SELL_THE_FILE' }
```

Detta är den **enda** ändringen av `PlayerAction`-unionen i etappen. Den kostar ingen
`actionPoint` — krisen är inte valfri.

### 9.3 Regeln

När `doomsday >= doomsdayCrisisEventThreshold (75)` sätter `doomsday.ts`
`state.pendingCrisis = { turn, theatreId }` och emitterar en `headline`. **Turen fortsätter
normalt.** Nästa `TurnSubmission` *måste* innehålla en `CRISIS`-handling; saknas den väljs
`BACK_DOWN` automatiskt (samma fallback som i dag, men nu som ett dokumenterat standardval och
inte som den enda vägen).

Utfall enligt `DESIGN.md` §6.2, ordagrant:

| Val | Effekt |
|---|---|
| `PUSH` | `rng.chance(crisisPushExchangePct)` (30): `doomsday = 100`, `NUCLEAR_EXCHANGE`. Annars: `doomsday → crisisPushBackdownTarget` (45) och ett femårskontrakt genereras (`Contract` med `quantity = crisisPushContractQuantity`, till den teaterns största köpare) |
| `BACK_DOWN` | `doomsday → crisisBackDownDoomsdayTarget` (40). Kvartalets `restricted`-intäkt annulleras. En slumpvald aktiv station får `exposure = 100` och `status: 'burned'`, `exposureEvents.push(turn)` |
| `SELL_THE_FILE` | `doomsday → crisisSellFileTarget` (50). Engångsintäkt `crisisSellFileRevenue` i `revenueByTurn`. `westStanding` och `eastStanding` faller båda permanent med `crisisSellFileStandingPenalty` |

`SELL_THE_FILE` är dessutom den **första kod som skriver `westStanding`/`eastStanding`**, som
hittills bara lästs av `alignmentPenalty`. `blocTerm` blir därmed en mekanik i stället för en
konstant.

### 9.4 UI

Krisen är en modal i `THE WIRE` som inte går att stänga utan att välja. Den visar de tre valen
med deras kända konsekvenser — `PUSH`s 30 % ska stå utskrivet. Spelet döljer inte oddsen; det
döljer bara utfallet.

---

## 10. Härnessen — laga botarna, gör dem olika

### 10.1 Enhetsfelet

`packages/harness/src/policies.ts:30`:

```ts
const margin = point.price > 0 ? (point.price - estimate.yourUnitCost) / point.price : 0
```

`point.price` är hela kontraktets pris, `yourUnitCost` är en enhets kostnad. Rätt:

```ts
const totalCost = estimate.yourUnitCost * order.quantity
const margin = point.price > 0 ? (point.price - totalCost) / point.price : 0
```

Samma fel som rättades i `BidForm.tsx` (ÄNDRINGSLOGG rad 73) och loggades som "EJ åtgärdat" i
rad 74. **Varje siffra i etapp 1-specens avsnitt 7.3 är mätt genom den här buggen.**

### 10.2 Botarna ska faktiskt skilja sig

Efter fixen är `passive` fortfarande i praktiken samma bot som `aggressive` (båda väljer den
lägsta prispunkten). Utöka de tre beskrivningarna:

| Bot | Nytt beteende |
|---|---|
| `passive` | Bjuder bara vid marginal > 20 %, aldrig `restricted`, **tar `TAKE_LOAN` bara när `treasury < 0`**, väljer alltid grade A, bjuder på högst `passiveMaxConcurrentBids` ordrar per tur (respekterar kapacitet) |
| `aggressive` | Underbjuder alltid, tar varje `restricted`, `STAGE_INCIDENT` när `heat < 40`, **väljer grade C**, lånar maximalt varje tur |
| `balanced` | Bjuder mot 60 %-konfidenspunkten, `BACK_CHANNEL` vid `doomsday > 65`, **grade C när `treasury < gradeCashPressureThreshold`, annars A**, lånar till halva `creditLimit` |

Och en fjärde bot, som etapp 1 saknade:

| `capacity` | Bjuder bara på ordrar huset faktiskt kan leverera i tid givet ledig linjekapacitet och `product.unitsPerLineTurn`. Ingen politik, inga lån |

`capacity` är referensboten: den mäter om kapacitetsknappheten (`DESIGN.md` §4) är verklig. Om
`capacity` presterar sämre än `aggressive` är knappheten fortfarande fiktion.

---

## 11. Verktygskedjan

### 11.1 `npm run build`

`package.json`s `build` kör workspaces i katalogordning, alltså `app` före `core`. Byt till en
explicit ordning:

```jsonc
"build": "npm run build --workspace=packages/core && npm run build --workspace=packages/harness && npm run build --workspace=packages/app"
```

Alternativt TypeScript project references. Antingen duger; det som inte duger är att P0:s
`Klart när`-villkor är osant.

### 11.2 Typkontroll av tester

Ny `tsconfig.test.json` per paket:

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src", "test"]
}
```

Nytt rotskript `"typecheck": "tsc -p packages/core/tsconfig.test.json && tsc -p packages/harness/tsconfig.test.json && tsc -p packages/app/tsconfig.json"`, kört av `npm test`.

**Känt fel som ska falla ut direkt:** `packages/core/test/resolve.test.ts:189` använder
`WireEvent` utan att importera typen.

### 11.3 Golden-testet

Bygg det som etapp 1-specens avsnitt 7.2 alltid beskrivit:

- `test/golden/playScript.ts` — spelar N turer från en seed med en inskickad balansfil
- `test/golden/hashState.ts` — stabil hash över `GameState` (sorterade nycklar, inga
  flyttalsartefakter)
- `test/golden/fixtures/balance.frozen.json` — en **kopia av `balance.json` som den ser ut när
  P22 är klar**, inte som den ser ut nu
- `golden.test.ts` — **tre** snapshots, en per botpolicy, plus kravet
  `headlines > 12` från specen

Snapshotet fryses sist i etappen, av samma skäl som P10 fick en fryst fixtur: en fixtur som
fryses innan balansen är klar hade dödat balanspasset.

### 11.4 CI och täckning

Lägg till `@vitest/coverage-v8` och en `.github/workflows/ci.yml` som kör `npm run typecheck`,
`npm test`, `npm run lint`, `npm run build` och `npm run test:e2e`. Ingen täckningströskel än —
mät först, sätt tröskel i etapp 2.

---

## 12. UI-språket

Etapp 1-specens rad 6–7 och `DESIGN.md` rad 5–6 kräver engelska UI-strängar. Hela appen är
svensk, inklusive `<html lang="sv">`. Ingen loggrad finns.

**Beslutet i den här specen: UI-strängarna översätts till engelska.** Skälet är tonen — spelets
hela register är engelskspråkig telex från 1964, och wire-rubrikerna är redan engelska.
`<html lang="en">`.

**Avgjort (ägarbeslut 2026-09-14):** engelska UI-strängar, enligt beslutet ovan — se
`docs/ANDRINGSLOGG.md` för loggraden. P21 genomför översättningen och sätter
`<html lang="en">`.

---

## 13. Måltabell för etapp 1,5

Ersätter etapp 1-specens avsnitt 7.3-tabell. Tre helt nya rader mäter det som gick sönder utan
att någon rad rörde sig.

| Kriterium | Målvärde | Varför |
|---|---|---|
| **Rivalerna vinner utlysta ordrar** | **25–50 %** mot `balanced` | NY. Auktionen ska vara en auktion (2) |
| **Rivalbud diskvalificerade av `trueBudget`** | **< 10 %** av alla rivalbud | NY. Taket ska vara sällsynt, inte normalt (2) |
| **Partier där en grade väljs > 70 % av gångerna** | **< 60 %** | Grade-valet ska vara levande (5) |
| **`supplyCostIndex` spann under ett parti** | **≥ 25 enheter** mellan min och max | NY. Kostnadsrisken ska vara verklig (3) |
| `passive` överlever 20 turer | 25–45 % | |
| `passive` förlorar på `BUYOUT` | > 50 %, minst hälften före tur 20 | |
| `aggressive` når `NUCLEAR_EXCHANGE` | **5–20 %** | Krisvalet gör det nåbart igen (9) |
| Något parti når `EXPOSURE` | **> 2 %** över alla policyer | `Station.exposure` skrivs nu (8.4) |
| `balanced` når `SCENARIO_COMPLETE` | 35–55 % | |
| Andel partier avgjorda före tur 8 | < 10 % | |
| **Andel partier som slutar på tur 14 eller 20** | **< 75 %** | NY. I dag 99,2 %. Utfallsrymden ska vara bred |
| Spridning i slutkassa för `balanced` | ≥ 3× mellan p10 och p90 **bland partier med positiv slutkassa** | Definitionen rättad, se granskningsrapporten |
| Turer med `heat > 40` i ett aktivt parti | 30–60 % | |
| `capacity`-boten mot `aggressive` | `capacity` ska ha **högre** median-slutkassa | NY. Prövar om kapacitetsknappheten är verklig |

**Måltabellen är hypoteser, inte acceptanskriterier.** Samma brasklapp som etapp 1. Om
härnessen envist säger något annat och partierna ändå är roliga att spela är det tabellen som
ska skrivas om — men som ett medvetet beslut med en motivering och en loggrad.

---

## 14. Promptsekvens

En prompt per commit. Gå inte vidare förrän `Klart när`-villkoret är uppfyllt.

---

**P13 — verktygskedjan**
> Laga `npm run build` (explicit byggordning, spec 11.1). Lägg till `tsconfig.test.json` per paket och ett `typecheck`-skript som täcker `src` och `test` (11.2). Rätta de typfel som faller ut. Lägg till `@vitest/coverage-v8` och en CI-workflow som kör typecheck, test, lint, build och e2e (11.4). Ingen spellogik.
>
> *Klart när:* `git clone && npm install && npm run build` går igenom på en ren katalog, `npm run typecheck` är grönt, `npm test` är fortsatt grönt, och CI-workflowen kör alla fem stegen.

**P14 — härnessens botar**
> Rätta enhetsfelet i `policies.ts:30` (10.1). Bygg om de tre botarna enligt 10.2 och lägg till den fjärde, `capacity`. Lägg till kolumnerna `rivalWinPct` och `disqualifiedRivalBidPct` i CSV-utdata.
>
> *Klart när:* `npm run harness -- --runs 500 --policy passive,aggressive,balanced,capacity` kör och skriver en CSV med de två nya kolumnerna, och de fyra policyerna ger mätbart olika slutorsaksfördelning (ingen två policyer inom 5 procentenheter på alla fyra `EndingCode`).

**P15 — auktionen**
> Ändra `trueBudgetMinFactor`/`trueBudgetMaxFactor` i `balance.json` enligt 2.2. Ingen kodändring. Kör härnessen och rapportera `rivalWinPct` och `disqualifiedRivalBidPct` per policy.
>
> *Klart när:* `disqualifiedRivalBidPct < 10` för alla fyra policyer och `rivalWinPct` mot `balanced` ligger i 25–50 %. Nås det inte med de föreslagna talen: skruva vidare inom `balance.json` och logga de slutliga värdena.

**P16 — supply och produktionstakt**
> Bygg `resolve/steps/supply.ts` och sätt in det i pipelinen enligt 3.1. Implementera formeln i 3.2 och wire-händelserna i 3.3. Koppla in `Product.unitsPerLineTurn` i `production.ts` enligt 4.1 och inför `Product.orderQuantityMin/Max` enligt 4.2. Sätt om produktdata enligt 4.3.
>
> *Klart när:* ett test visar att `supplyCostIndex` rör sig minst 25 enheter över ett 20-turersparti med `aggressive`; ett test visar att `unitCostNow` för samma kontrakt skiljer sig från `unitCostAtSigning` i minst ett parti av tio; ett test visar att en linje producerar `product.unitsPerLineTurn` enheter per tur för tre olika produkter.

**P17 — executive actions: INTERNAL**
> Inför `house.actionPoints` (8.1) och handlingstaket i `applyActions.ts`. Implementera `REPAY`, `BUILD_LINE`, `HIRE` och `REPRIORITISE_RND` enligt 8.2. Koppla `RndProject`-kön till `techLevel`.
>
> *Klart när:* ett test visar att en fjärde handling avvisas med `'no executive actions remaining'` vid `chiefOfStaff <= 70`; ett test visar att `BUILD_LINE` höjer produktionen nästa tur; ett test visar att ett R&D-projekt som löper klart höjer `techLevel` i rätt kategori och att `rndOverhead` debiterats varje tur under tiden.

**P18 — executive actions: POLITICAL och INTEL**
> Implementera `BRIBE`, `STAGE_INCIDENT` och `BACK_CHANNEL` enligt 8.3, och `EXPAND`, `RECRUIT`, `WITHDRAW` enligt 8.4. Koppla `Station.exposure` enligt `DESIGN.md` §9: +8–25 per operation, −5 per vilande tur, rullning mot avslöjande vid > 80.
>
> *Klart när:* ett test kör en `STAGE_INCIDENT` mot en blockgränsande faktion och verifierar att `doomsdayGate` anropas med rätt intervall och att kausalkedjan i wire pekar tillbaka till handlingen; ett test visar att `EXPAND` krymper `bidEstimate`s prisintervall nästa tur; ett test visar att en station kan brännas och att `exposureEvents` växer.

**P19 — rykte och köparbudget**
> Skärp `repTerm`-divisorerna och inför `reliabilityBidFloor` enligt 6.2. Lägg till `reliabilityOnTimeBonus` enligt 6.3. Koppla in `gradeScandalChance` enligt 5.1. Inför `militaryBudget`-golvet, påfyllnaden och ordergenereringsspärren enligt 7.1.
>
> *Klart när:* ett test visar att ett hus med `reliability < 15` får sitt bud avvisat med `'reputation below buyer threshold'`; ett test visar att en grade C-leverans kan utlösa en skandal som sänker `quality` och att effekten släpper efter tre turer; ett test visar att en köpare vars `militaryBudget` är slut inte längre utlyser ordrar och att en order som ingen har råd med dras tillbaka.

**P20 — krisvalet**
> Inför `CRISIS`-varianten i `PlayerAction` och `state.pendingCrisis`. Bygg de tre utfallen enligt 9.3. Ta bort den automatiska BACK DOWN-fallbacken som ensam mekanism — behåll den bara som standardval när ingen `CRISIS`-handling skickas in. Koppla `SELL_THE_FILE` till `westStanding`/`eastStanding`.
>
> *Klart när:* ett test visar att `PUSH` kan leda till `NUCLEAR_EXCHANGE` (fast seed där chansen slår in); ett test visar att `BACK_DOWN` bränner en station och ökar `exposureEvents`; ett test visar att `SELL_THE_FILE` sänker båda standing-värdena permanent och därmed ändrar `blocTerm` i ett senare anbud; ett test visar att en utebliven `CRISIS`-handling ger BACK DOWN med ett wire-headline som säger att valet var automatiskt.

**P21 — UI**
> Översätt alla UI-strängar till engelska och sätt `<html lang="en">` (12) — **eller**, om ägaren beslutat annat, lägg in i18n-lagret och skriv loggraden. Bygg krismodalen i `THE WIRE` (9.4). Visa `supplyCostIndex` som mätare i `THE HOUSE` och marginal per kontrakt mot både `unitCostAtSigning` och `unitCostNow` (3.4). Bygg en enkel handlings-UI för `INTERNAL` och `POLITICAL` med kvarvarande `actionPoints` synligt.
>
> *Klart när:* ett e2e-test spelar 20 turer, tar minst en executive action per tur, hanterar minst en kris, och avslutar utan konsolfel. Minst ett komponenttest verifierar att den visade bruttomarginalen stämmer mot `price − unitCost × quantity`.

**P22 — balanspass**
> Ingen kod. Kör härnessen mot måltabellen i 13, ändra bara `balance.json`, kör igen. Upprepa tills tabellen stämmer. När den gör det: frys `balance.frozen.json` som en kopia av den slutliga `balance.json`, bygg golden-testet enligt 11.3, och kör det.
>
> *Klart när:* alla fjorton raderna i 13 är uppfyllda eller uttryckligen reviderade med motivering och loggrad, golden-testet passerar med tre snapshots, och `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` och `npm run test:e2e` är gröna.

---

## 15. Vad som avsiktligt inte finns i etapp 1,5

Så att det inte smyger in under bygget.

En andra front, fler köpare, fler rivaler, råvaruspår utöver `supplyCostIndex`, `FUND_COUP`,
`ASSASSINATE`, `BROKER`, `MARKET`, `LEAK`/`SABOTAGE`/`TURN`, namngivna tjänstemän, fördrag,
avkolonisering, nya scenarier, karta, ljud, highscore, `StandingOrderChange`s riktiga form.

`StandingOrderChange` förblir den provisoriska platshållare den varit sedan P2. Den behövs
först när produktionslinjer ska styras manuellt, och `production.ts`s automatiska tilldelning
räcker för den här etappen.

---

## 16. Vad som händer efter P22

Då, och först då, går etapp 1:s egen fråga att besvara:

> **Är tjugo turer av detta spännande, och tvingar de fram minst ett beslut där lönsamhet och
> överlevnad pekar åt olika håll?**

Spela tio partier. Kriterierna i etapp 1-specens avsnitt 11 gäller oförändrat, med ett tillägg:

- Om du efter parti tre vet exakt vad du ska göra varje tur är anbudsspelet för genomskådat.
- Om du efter parti tre fortfarande gissar och ändå förbättras, fungerar det.
- Om du aldrig ens funderade på `restricted`-ordern är den för dyr, för liten eller för sent
  utlyst.
- **Nytt:** om du aldrig tvekade inför ett krisval har `DOOMSDAY` fortfarande ingen tyngd, och
  det är då `stageIncidentDoomsday*` och `doomsdayDecayPerTurn` som ska skruvas — inte
  trösklarna.

Är svaret ja på alla fyra är etapp 2 värd att bygga. Är det nej på första ledet är det
designen som är fel, och då har den här etappen ändå gjort sitt jobb: den gjorde frågan
besvarbar.
