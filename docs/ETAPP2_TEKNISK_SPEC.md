# THE SEVENTH FRONT — Teknisk spec, etapp 2: MOTSTÅNDET

**Version 1.0 — antagen (ägarbeslut 2026-09-14).** Granskad mot `2010ee9` ("P22: balanspass mot
avsnitt 13 och golden-testet"). Innan antagande genomgick förslaget en kodgranskning som
hittade två saker som skulle ha brutit sönder byggandet mitt i etappen om de gått igenom
oändrade — se 2.2, 2.3 och 3.3, och `docs/ANDRINGSLOGG.md` för den fulla granskningen. Övrigt
innehåll oförändrat mot förslaget. Fortfarande `INDOCHINA_SLICE`, 20 turer. Ingen andra front,
inga nya scenarier, ingen råvarumarknad.

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

Specen är **fryst under P23–P32**. Den får ändras mellan promptar om en byggd sanning visar
sig strida mot den, men aldrig av en kodsession på eget initiativ. Se `CLAUDE.md`.

---

## 0. Läget efter etapp 1,5

### 0.1 Vad som byggdes

P13–P22 kördes i sin helhet. Verifierat på en ren klon i sandlåda:

| Kontroll | Resultat |
|---|---|
| `npm install && npm run build` | **Grönt** (var rött före P13) |
| `npm run typecheck` | **Grönt** — täcker nu `src` *och* `test` i alla tre paket |
| `npm test` | **269 tester i 30 filer, alla gröna** (var 182 i 26) |
| `npm run lint` | Rent |
| `npm run test:e2e` | 2/2 gröna, inklusive "20 turer med executive actions varje tur och minst en hanterad kris" |
| Golden-test | **Byggt.** `playScript.ts`, `hashState.ts` (cyrb53), tre snapshots, fryst fixtur |
| CI | **Finns.** `.github/workflows/ci.yml`, fem steg i rätt beroendeordning |
| `packages/app`-tester | 1 komponenttest (`BidForm.margin.test.tsx`) — var 0 |

### 0.2 Vad som faktiskt blev bättre i spelet

Härnesskörning i sandlåda, 8 000 partier (2 000 per policy):

| Mått | Före etapp 1,5 | Efter |
|---|---|---|
| Slutorsaker som förekommer | 3 av 5 | **5 av 5** |
| `EXPOSURE` | 0 / 6 000 | 8,1 % |
| `NUCLEAR_EXCHANGE` | 0 / 6 000 | 3,4 % (`aggressive` 13,4 %) |
| `INSOLVENCY` | 3,9 % | 10,3 % |
| Rivalbud diskvalificerade av `trueBudget` | ~2 per avgjord order | **0,00 %** |
| Rivalerna vinner ordrar (`balanced`) | 6,0 % | 15,0 % |
| Rivalerna vinner ordrar (`passive`) | 2,5 % | **53,1 %** |
| Partier som slutar på tur 14 eller 20 | 99,2 % | 80,7 % |
| `supplyCostIndex` | konstant 100 | rör sig, kopplad till `heat` |
| Döda modellfält | 8 | 3 |

Det är ett stort steg. Auktionen är inte längre avgjord av ett dolt tak, `DOOMSDAY` kan döda
spelaren, och kostnadsrisken finns.

### 0.3 En rättelse till granskningsrapporten

`RAPPORT1_GRANSKNING.md` avsnitt 5.7 påstod att enhetsfelet i `policies.ts:30` gjorde att
`passive` degenererade till samma bot som `aggressive`, och att **P10:s hela uppmätta kolumn
behövde köras om**. Det var fel. Kodsessionen körde om härnessen efter rättelsen och fick ett
bit-identiskt utfall — vilket är det korrekta resultatet: med den gamla `products.json` låg
bruttomarginalen vid referenspris på 38–47 %, alltså över filtrets 20 %-tröskel även räknat
rätt, så filtret var icke-bindande av precis det skäl P10 ursprungligen angav
(`products.json`s kostnadsspann). Buggen var verklig och skulle rättas; slutsatsen jag drog av
den var inte.

Att den kontrollen gjordes, och loggades som en omprövad rad i stället för att tyst accepteras,
är rätt hantverk.

---

## 1. Varför den här etappen inte är "bredd"

`DESIGN.md` §20 lägger etapp 2 som bredd: andra fronten, kupper, `ASSASSINATE`,
råvarumarknad, `SUEZ` och `OCTOBER`. Den ordningen bör skjutas ett steg, av ett skäl som är
mätt och inte tyckt.

**P22:s balanspass fick nio av fjorton måltabellsrader i mål och dokumenterade fem som
strukturellt ouppnåeliga via `balance.json`.** Den utredningen är riktig — jag har verifierat
var och en. Men de fem raderna är inte fem oberoende problem. De är tre:

### 1.1 Rivalerna är strukturellt svagare än spelaren

`pricing.ts` ger en rival `relationTerm 0`, `repTerm 0`, `bribeTerm 0`, `blocTerm 0` — fyra av
sex termer. Det var rätt lösning i P4, eftersom `RivalHouse` (spec 2.5) saknar de fälten. Men
konsekvensen är att rivalernas poäng är statisk medan spelarens växer med varje vunnet
kontrakt och varje levererad order.

P22 mätte platån exakt: `relationTermWeight` sänkt 40 → 5 flyttade `rivalWinPct` från ~7 % till
~15 % och mättades där; `rivalMarginBase` sänkt 0,3 → 0,1 gav i praktiken noll effekt. Mot
`aggressive` är medianen fortfarande **0,0 %** — rivalerna vinner inte en enda order i hälften
av partierna.

Och när en rival ändå vinner händer ingenting. `bidding.ts` emitterar en `report`-rad. Rivalen
producerar inte, levererar inte, får ingen attribution på fronten, och dess `capital` rör sig
inte. `Front.attribution` innehåller därför bara nyckeln `'player'` i varje parti som någonsin
spelats.

### 1.2 Kapacitetsknappheten är mätbart omvänd

`DESIGN.md` §4, ordagrant: *"Att bjuda på allt är därför den näst sämsta strategin i spelet,
strax efter att inte bjuda alls."*

Uppmätt, medianslutkassa bland partier som når tur 20:

| Bot | Strategi | Median slutkassa | Utfall |
|---|---|---|---|
| `aggressive` | bjuder på allt, grade C, lånar maximalt | **£28 379 166** | 53,8 % `SCENARIO_COMPLETE` |
| `balanced` | bjuder mot 60 %-konfidens | £14 979 729 | 92,1 % `SCENARIO_COMPLETE` |
| `passive` | bjuder bara vid > 20 % marginal | £463 734 | 41,6 % `SCENARIO_COMPLETE` |
| `capacity` | bjuder bara på det den kan leverera | **−£308 817** | 40,9 % `INSOLVENCY` |

Att bjuda på allt är den **bästa** strategin. Att respektera sin kapacitet är den sämsta.
Orsaken är att ett övertrasserat kontrakt kostar exakt en sak, en gång: `status: 'late'` och
`reliability −8`. `late` blir aldrig `voided`, `production.ts` producerar vidare mot det i
evighet, och betalningen kommer till slut. Ett sent kontrakt är alltså ett kontrakt med
fördröjd intäkt, inte ett kontrakt som gick förlorat.

`reliabilityBidFloor` (P19) biter inte heller: `aggressive` levererar tillräckligt mycket i tid
för att hålla sig över 15.

### 1.3 `EXPOSURE` gick från onåbart till ett myntkast på tur fyra

`aggressive` dör av `EXPOSURE` i 32,2 % av partierna, **median tur 4, spann tur 2–10**. 101
partier slutar på tur 2.

Mekaniken: `stageIncidentSuccessPct` är 65, så 35 % av alla `STAGE_INCIDENT` misslyckas med
attributionen och pushar direkt till `house.exposureEvents` (`applyActions.ts:596`).
`exposureEventsForEnding` är 3 inom 6 turer. En bot som iscensätter varje tur når tre
misslyckanden nästan omedelbart.

Det här är dessutom ett spec-glapp: `DESIGN.md` §7.2 säger **"tre *stationer* exponerade inom
sex turer"**. Scenariot startar med **en** station. Slutvillkoret kan alltså aldrig utlösas av
det designdokumentet beskriver — det utlöses uteslutande av misslyckade attributioner, som inte
är stationer.

Måltabellens rad (`> 2 %`) fångade inte detta, eftersom den bara frågade om slutet inträffar.

### 1.4 Slutsatsen

Alla tre är motståndsproblem: **världen slår inte tillbaka på ett sätt som gör val svåra.**
Att lägga en andra front, en råvarumarknad och kupper ovanpå det gör inte spelet djupare — det
multiplicerar ett spel som inte gör motstånd. Etapp 2 blir därför *Motståndet*, och
designdokumentets bredd-etapp flyttas till etapp 3.

---

## 2. Rivalhusen blir motståndare

Etappens tyngsta block. Fem av P22:s fjorton rader hänger på det här.

### 2.1 Datamodell

```ts
export interface RivalHouse {
  id: RivalId
  name: string
  specialisation: TechCategory
  aggression: Pct
  temperament: 'opportunist' | 'patriot' | 'cautious'
  capital: Money
  marketShare: Pct
  sabotagedUntilTurn: number | null

  // NYA — stänger spec 4.4:s ursprungliga prosa
  homeState: 'neutral' | 'west' | 'east'
  relations: Record<FactionId, Pct>          // samma roll som Faction.relationToPlayer
  reputation: { quality: Pct; reliability: Pct }
  contracts: RivalContract[]                 // se 2.3
}

export interface RivalContract {
  id: string
  buyerId: FactionId
  productId: ProductId
  quantity: number
  unitsDelivered: number
  dueTurn: number
  // 'voided' tillagt (granskning inför antagande) för symmetri med spelarens Contract —
  // se 3.1: samma sena-kontrakt-eskalering ska gälla en RivalContract, inte bara
  // spelarens egna. Utan den skulle en rival aldrig kunna FÖRLORA ett kontrakt till
  // förseningsspiralen, bara spelaren — en ny, egen asymmetri i stället för den etappen
  // just ska ta bort.
  status: 'active' | 'fulfilled' | 'late' | 'voided'
}
```

`rivals.json` får startvärden för `homeState`, `relations` (per faktion) och `reputation`.

### 2.2 Rivalerna poängsätts med hela formeln

`bidding.ts` och `queries.ts` slutar skicka `relationToPlayer: 0` / `reputation: null` /
`blocTerm: 0` för en rival. De skickar rivalens egna värden. Det är vad etapp 1-specens
avsnitt 4.4 alltid sa (*"Rivaler poängsätts med samma formel men med `relationTerm` och
`repTerm` från deras egna värden"*) och som P4 var tvungen att arbeta runt.

`bidEstimate` måste följa med, annars driver uppskattningen isär från avgörandet — vilket är
hela skälet `pricing.ts` finns.

**`blocTerm` för en rival — formeln som saknades i förslaget.** `alignmentPenalty(alignment,
house)` (`pricing.ts`) läser i dag `house.reputation.westStanding/eastStanding`, en löpande
0–100-skala. Den nya `RivalHouse` får ingen sådan skala, bara en fast kategori
(`homeState: 'neutral'|'west'|'east'`). "Skicka rivalens egna värden" (ovan) förutsätter
alltså en formel som inte fanns i förslaget — utan en skulle P24:s implementerare tvingas
uppfinna en på plats, oprövad. PROVISORISK, samma sorts platshållare som andra oformulerade
prosakrav i det här projektet (se `docs/ANDRINGSLOGG.md`):

```ts
function rivalBlocTerm(rival: RivalHouse, factionAlignment: number): number {
  if (factionAlignment === 0 || rival.homeState === 'neutral') return 0
  const strength = Math.abs(factionAlignment) / 100
  const aligned =
    (factionAlignment > 0 && rival.homeState === 'west') ||
    (factionAlignment < 0 && rival.homeState === 'east')
  return (aligned ? 1 : -1) * strength * BALANCE.blocPenaltyScale
}
```

Ingen ny balanssiffra: den återanvänder `blocPenaltyScale` och ger en rival exakt samma
maximala svängning (±`blocPenaltyScale` vid `strength = 1`) som spelarens
`alignmentPenalty` ger vid `standing` 0 respektive 100 — symmetriskt med avsikt, inte en ny,
egen skala att kalibrera.

**Effekt att vänta:** rivalernas poäng slutar vara statisk. En rival som vinner och levererar
bygger relation och rykte precis som spelaren, och blir svårare att slå nästa gång.
`relationTermWeight` bör återställas mot sitt ursprungsvärde (40) i samma veva — P22 sänkte
det till 5 just för att kompensera för asymmetrin.

### 2.3 En rival som vinner ett kontrakt fullföljer det

**Pipelineplatsen — rättad inför antagande.** Förslaget lade allt nedan i `rivals.ts`. Det
går inte: nuvarande `PIPELINE` (`resolve/index.ts`) kör
`... deliveries → fronts → factions → heat → supply → doomsday → rivals → orders ...` —
`rivals` ligger EFTER `deliveries`, `fronts` och `heat` i samma pass. `heat.ts` läser och
nollställer `Theatre.deliveriesIntoActiveWarThisTurn` innan `rivals.ts` någonsin hinner
skriva till den, så en rivalleverans där hade alltid varit en tur för sen för att påverka
`heat` samma tur den skedde — tyst, och inget av punkt 2–3:s egna klart när-test hade fångat
det (om `fronts.ts` använder ackumulerad attribution i stället för en per-tur-delta rör sig
fronten ändå, bara med fel timing på `heat`). Att flytta `rivals`-steget själv hade krävt att
ändra `PIPELINE`-ordningen, vilket är hård regel 7 och kräver ett eget, uttryckligt
ägarbeslut — inte något P25 ska göra i förbigående.

**Lösningen:** rivalernas LEVERANS/attribution-logik bor i `deliveries.ts`, i SAMMA steg som
spelarens egen redan gör (redan rätt placerad i pipelinen), inte i `rivals.ts`. `rivals.ts`
behåller sin nuvarande roll (passiv tillväxt, avsnitt 2.4:s två nya beteenden) — den äger
aldrig leverans/attribution.

Nytt i `deliveries.ts`, som ett eget avsnitt vid sidan av spelarens egen kedja (inte
sammanflätat med den — två olika typer, `Contract`/`RivalContract`, två olika ägare):

1. **Kontraktsskapande.** `bidding.ts`s rivalgren skapar en `RivalContract` och drar priset
   från köparens `militaryBudget` (redan gjort) *och* lägger det till rivalens `capital`.
2. **Leverans.** Varje tur, i `deliveries.ts`, levererar rivalen `rivalDeliveryUnitsPerTurn`
   enheter mot sina aktiva kontrakt. Vid `dueTurn` utan full leverans: `status: 'late'`,
   `reputation.reliability` faller.
3. **Attribution.** Levererade enheter går in på fronten precis som spelarens, under
   rivalens `id` i `Front.attribution`, och räknas in i teaterns
   `deliveriesIntoActiveWarThisTurn` — i SAMMA steg och alltså SAMMA tur som leveransen sker,
   innan `heat.ts` läser räknaren.
4. **Relation.** Vid vunnet kontrakt stiger `relations[buyerId]` med samma
   `relationBoostMin/Max` som spelaren får.

Punkt 3 är den viktigaste och den billigaste. Den gör att `heat` stiger även när spelaren står
still, att fronten rör sig utan spelaren, och att `THE WIRE` får material som inte är spelarens
fel — precis det `DESIGN.md` §12 kallar skillnaden mellan en aktiv värld och ett solipsistiskt
spel.

### 2.4 De två obyggda rivalbeteendena

`DESIGN.md` §12 namnger tre saker rivaler gör. Bara den första finns. Bygg de andra två:

**Binder leverantörskapacitet.** En rival med `temperament: 'opportunist'` och `capital >
rivalSupplyPlayCapitalFloor` kan en gång per `rivalSupplyPlayCooldownTurns` låsa
leverantörskapacitet:

```
market.supplyCostIndex += rivalSupplyPlayIndexPenalty     (via supply.ts, klampat som vanligt)
rival.capital          −= rivalSupplyPlayCost
```

Emitteras som `headline` med rivalens id som `subjectId`. Det är första gången något annat än
`heat` rör `supplyCostIndex`, och det ger spelaren en motståndare i kostnadsledet.

**Iscensätter egna incidenter.** En rival med `temperament: 'patriot'` kan iscensätta en
incident enligt samma mekanik som spelarens `STAGE_INCIDENT` (heat, och `DOOMSDAY` om målet är
blockgränsande). Vid misslyckad attribution pekar den med
`rivalIncidentMisattributionPct` sannolikhet på **spelaren** i stället för på rivalen — då
pushas till `house.exposureEvents` **i den form som gäller när P26 körs** (se 4.1: från P29
och framåt är målet för den pushen `station.exposure`, inte `house.exposureEvents`
direkt — P26 kommer FÖRE P29 i sekvensen, så bygg den här vägen mot samma
`house.exposureEvents.push`-mekanism som den redan befintliga STAGE_INCIDENT-misattributionen
använder då. **P29:s eget klart när-villkor måste täcka BÅDA källorna** (den ursprungliga
STAGE_INCIDENT-vägen sedan P18 och den här nya rivalincident-vägen) när det skiljer
misslyckad attribution från bränd station — annars läker bara hälften av spec-glappet i 1.3.

Det sista är `DESIGN.md` §12:s uttryckliga poäng (*"ibland attribuerade till dig"*) och det ger
`EXPOSURE` en drivare som inte är spelarens egen handling.

### 2.5 `sabotagedUntilTurn`

Fältet har varit dött sedan P1 (noll referenser i koden). Koppla det: en rival som är
saboterad (etapp 3:s `SABOTAGE`, eller en misslyckad egen incident) lägger inga bud och
levererar inte förrän turen passerat. Om ingen mekanik i den här etappen sätter fältet ska det
**tas bort ur `types.ts`** i stället för att stå kvar som dekoration. Välj ett av de två,
och logga valet.

---

## 3. Kapaciteten ska bita

Målet: vända ordningen i 1.2 så att `capacity` slår `aggressive`, utan att göra
`aggressive` ospelbar.

### 3.1 Sena kontrakt eskalerar

I dag är `late` en återvändsgränd med ett engångsstraff. Ny regel i `deliveries.ts`, och
tillämpad på BÅDE spelarens `Contract` och en rivals `RivalContract` (se 2.1/2.3 — annars
uppstår en ny asymmetri i stället för den etappen ska ta bort):

```
vid varje tur ett kontrakt har status 'late':
    reliability −= reliabilityLateEscalationPerTurn   (house.reputation.reliability för spelaren,
                                                        rival.reputation.reliability för en rival)
    emit report

om turn > contract.dueTurn + contractGracePeriodTurns:
    contract.status = 'voided'
    faction.relationToPlayer −= voidedContractRelationPenalty   (bara för spelarens egna — en
                                                                  rivals annullerade kontrakt
                                                                  drar `relations[buyerId]`
                                                                  med samma tal, se 2.1)
    ingen ytterligare betalning bokförs för kontraktet
    redan producerade enheter är förlorade
    emit headline, causeId = det event som satte kontraktet 'late'
```

Nya fält:

```jsonc
"reliabilityLateEscalationPerTurn": 3,
"contractGracePeriodTurns": 3,
"voidedContractRelationPenalty": 15
```

Det är det som gör en övertrasserad orderbok till en verklig förlust i stället för en
fördröjning. Spec 3.1 sa alltid att spelaren *"får övertrassera medvetet, och betala för det"*
— betalningen har hittills saknats.

**Risk att mäta, inte anta:** `reliabilityLateEscalationPerTurn`(3) staplat på det redan
befintliga engångsstraffet (`reliabilityLatePenalty`, −8) och `contractGracePeriodTurns`(3)
ger upp till −17 innan `voided` — gott om marginal att pressa en bot under
`reliabilityBidFloor`(15, P19) och göra den diskvalificerad från ALL budgivning en tid. Troligen
avsett (målet är att göra "bjud på allt" farligt), men P27:s härnesskörning ska uttryckligen
visa hur länge en bot typiskt är diskvalificerad efter EN sen leverans — inte bara att
`voidedContracts > 0`.

### 3.2 Linjeomställning kostar

`production.ts` tilldelar i dag en ledig linje till nästa obemannade kontrakt, gratis och
omedelbart. Ny regel:

```
när en linje byter productId:
    line.status = 'retooling'
    line.retoolingUntilTurn = turn + retoolingTurns
    linjen producerar ingenting under omställningen
```

```jsonc
"retoolingTurns": 1
```

Med sju produkter i tre marginalklasser gör en enda omställningstur att "bjud på allt och sortera
sedan" kostar något. Det är den knapphet `DESIGN.md` §4 påstår att spelet redan har.

### 3.3 `techRequired` gäller produktionen

`Product.techRequired` läses i dag bara av `orders.ts` (vem som *beställer*). Huset bygger
`mk9_longhand_shell` (`techRequired: 8`) med `techLevel.artillery = 4`.

Ny regel i `bidding.ts`, som en tredje diskvalificeringsgrund efter `trueBudget` och
`reliabilityBidFloor`:

```
om product.techRequired > house.techLevel[product.category]:
    budet avvisas i applyActions/bidding med
    reason: 'insufficient tech level'
```

Det ger `REPRIORITISE_RND` (byggd i P17, i praktiken utan syfte) ett faktiskt värde: R&D är
vägen till de produkter där marginalen finns. Och den `restricted`-ordern på tur 10 blir ett
mål man måste ha förberett sig för, inte en gratislott.

**Scenariot måste följa med — och förslagets "antingen X eller Y, mät vilket" var ofullständigt.**
En genomgång av alla sju produkter mot `INDOCHINA_SLICE`s starttekniknivåer
(`techLevelDefault: 1` i varje kategori, `+3` bara i husets specialisering `artillery` → 4)
visar att en bokstavlig `techRequired`-spärr INTE bara låser mk9 — den låser fyra av sju
produkter omedelbart, från tur 0, tills R&D (en kategori i taget, `rndProjectTurns`(6) styck)
hinner i kapp:

| Produkt | Kategori | `techRequired` | Starttekniknivå i kategorin | Biddbar vid start? |
|---|---|---|---|---|
| `m1_rifle` | infantry | 1 | 1 | Ja |
| `105mm_field_gun` | artillery | 2 | 4 | Ja |
| `m3_apc` | armour | 3 | 1 | **Nej** |
| `ch3_transport_helicopter` | aviation | 4 | 1 | **Nej** |
| `coastal_patrol_boat` | naval | 3 | 1 | **Nej** |
| `tac_radio_suite` | electronics | 3 | 1 | **Nej** |
| `mk9_longhand_shell` | artillery | 8 | 4 | Nej (avsett) |

En bokstavlig implementation av regeln ovan hade alltså stängt fyra sjundedelar av
produktkatalogen samtidigt som avsnitt 3.1:s åtstramningar — en betydligt större
intäktskollaps än vad 3.3 självt beskriver ("den restricted-ordern blir ett mål man måste ha
förberett sig för"), spridd över alla fyra policyer, och P28:s eget klart när-villkor (som
bara mäter mk9-fallet) hade inte fångat den innan härnessen visade orimliga tal på ett sätt
som varit dyrt att felsöka bakåt.

**Fixen, bestämd här i stället för lämnad som en mätfråga:** höj `INDOCHINA_SLICE`s
`techLevelDefault` från 1 till **4** i samtliga kategorier (`techLevelSpecialisationBonus`(3)
oförändrad). Det gör alla sex icke-restricted produkter biddbara direkt (armour/naval/
electronics landar på 4 ≥ 3, aviation på 4 ≥ 4), medan artillery blir 4 + 3 = 7 — fortfarande
under mk9:s 8, så den scriptade ordern kräver EXAKT ett fullföljt `REPRIORITISE_RND`-projekt
(6 turer) i `artillery` för att bli nåbar, inte noll och inte omöjligt. `mk9_longhand_shell.
techRequired` rörs inte.

P28:s härnesskörning mäter fortfarande, som förslaget bad om, att en rimlig andel partier når
mk9-ordern MED tillräcklig nivå och en rimlig andel INTE gör det — men nu mot en baslinje där
resten av katalogen inte oavsiktligt är avstängd samtidigt.

---

## 4. `EXPOSURE` blir en båge

### 4.1 Skilj station från attribution

`exposureEventsForEnding` (3) räknar i dag tre olika saker som samma sak: en bränd station, ett
krisval `BACK_DOWN`, och en misslyckad attribution. Bara de två första är stationer.

Ny regel — gäller BÅDA de mekanismer som i dag (och efter P26, se 2.4) pushar hit på en
misslyckad attribution: den ursprungliga `STAGE_INCIDENT` (P18) och P26:s nya
rivalincident-felattribution:

```
misslyckad attribution  →  station.exposure += misattributionExposurePenalty
                           (inte house.exposureEvents.push)
bränd station           →  house.exposureEvents.push(turn)
krisval BACK_DOWN       →  bränner en station, som ovan
```

```jsonc
"misattributionExposurePenalty": 30
```

Då blir `EXPOSURE` det `DESIGN.md` §7.2 beskriver: **tre stationer brända inom sex turer**.
Med `maxStations: 5` och en station vid start kräver det att spelaren först har expanderat —
alltså blir slutet en konsekvens av ambition, inte ett myntkast på tur två.

### 4.2 Exponering ska synas innan den dödar

`THE WORLD` visar i dag stationens `exposure` som ett tal. Lägg till en varningsnivå vid
`exposureBurnThreshold` (80) och en wire-`report` när en station passerar den:

```
STATION SAIGON UNDER SURVEILLANCE — EXPOSURE 84
```

Ett slutvillkor spelaren inte ser komma är inte ett beslut, och `DESIGN.md` §6.3:s princip
("spelaren ska kunna läsa sin egen skuld") gäller lika mycket före slutet som efter.

---

## 5. Styrelsen och scenariot

### 5.1 `reviewsFailed` ska nollställas

`board.ts:76` räknar underkända kontroller **kumulativt**. Spec avsnitt 5, `DESIGN.md` §7.3 och
`CLAUDE.md` säger alla "två underkända kontroller **i rad**". Med två kontrollturer syns det
inte; med fler gör det det.

```ts
if (passed) {
  target.reviewsFailed = 0     // NYTT
  emit(...)
  return
}
```

Fyndet stod i `RAPPORT1_GRANSKNING.md` avsnitt 3.2 B men togs aldrig in i etapp 1,5:s
promptsekvens. Det är mitt förbiseende, inte kodsessionens.

### 5.2 Fler och spridda granskningsturer

P22 visade att raden "andel partier som slutar på tur 14 eller 20" inte kan sänkas under 75 %
via `balance.json`, eftersom `reviewTurns` är scenariodata. Ändra scenariodata:

```jsonc
"boardTarget": { "reviewTurns": [6, 10, 14, 18], "dueTurn": 20 }
```

Med 5.1 på plats blir regeln vad den alltid var: två underkända **i rad** av fyra möjliga.
Det sprider `BUYOUT` över fyra turer i stället för att koncentrera 1 052 av 1 159 till tur 14,
och det gör `DESIGN.md` §7.3:s syfte sant — *"passivitet är något spelaren känner från tur 8"*
blir "från tur 6, och igen, och igen".

**Risk att mäta:** en granskning redan vid tur 6 ger produktionen (bud → vinst → tillverkning
→ leverans → bokförd intäkt) mindre tid att komma igång innan den första linjära banan prövas.
P30:s härnesskörning ska logga underkänd-andelen SPECIFIKT vid tur 6, separat från de tre
andra granskningsturerna — annars kan en systematiskt orättvis första kontroll gömma sig i ett
totalt `BUYOUT`-tal som ändå ser bra utspritt ut.

### 5.3 Fler än en `restricted`-utlysning

Scenariot har en scriptad `RESTRICTED_ORDER` (tur 10, mk9 × 8). Ett enda tillfälle gör
designpelare 1 till en lotteridragning: antingen tog du den eller inte.

Lägg till en andra, mindre, tidigare (tur 6–7) och en tredje, större, sen (tur 16–17). Då blir
frestelsen en **kurva**: den första är en test, den andra är beslutet, den tredje är frågan om
du kan sluta. Med 3.3 (teknikspärr, nu med den korrigerade `techLevelDefault`(4)) måste minst
den första vara inom räckhåll utan extra R&D utöver det redan pågående mk9-projektet.

---

## 6. Botarna och mätningen

### 6.1 Grade ska väljas, inte hårdkodas

Tre av fyra botar hårdkodar en grade var (`policies.ts`, oförändrat sedan P9/P14). Det gör
måltabellens grade-rad omätbar — den mäter botarnas konstruktion, inte spelet. P22 loggade det
korrekt som strukturellt, men lösningen är enkel och ligger i härnessen, inte i balansen:

Alla fyra botar väljer grade per order enligt en enkel regel: grade C när
`treasury < gradeCashPressureThreshold` eller när `order.weights.price` är hög, annars A, och B
när `reputation.quality` är sänkt av en pågående skandal. Det är ingen smart bot — det är en
bot som fattar det beslut spelet påstår att det ställer.

### 6.2 Nya härnesskolumner

```
rivalContractsWon        antal kontrakt rivalerna faktiskt fullföljde
rivalAttributionShare    rivalernas andel av Front.attribution vid partiets slut
voidedContracts          antal kontrakt som gick 'late' → 'voided' (spelarens OCH rivalernas)
retoolingTurns            antal turer linjer stod i omställning
stationsBurned            antal brända stationer
```

De fem mäter exakt det etappen bygger. En rad som inte rör sig betyder att blocket inte
levererade.

### 6.3 Måltabell för etapp 2

| Kriterium | Målvärde | Mätt nu (n=2000/policy) |
|---|---|---|
| **`capacity` mot `aggressive`, median slutkassa** | **`capacity` högre** | `capacity` −£308 817, `aggressive` £28 379 166 |
| **Rivalerna vinner ordrar, `aggressive`** | **> 15 %** | 1,6 % (median 0,0 %) |
| Rivalerna vinner ordrar, `balanced` | 25–45 % | 15,0 % |
| **Rivalernas andel av `Front.attribution`** | **> 25 %** | 0 % (fältet har aldrig haft en rivalnyckel) |
| **`aggressive` `SCENARIO_COMPLETE`** | **< 35 %** | 53,8 % |
| **`balanced` `SCENARIO_COMPLETE`** | **50–75 %** | 92,1 % |
| `passive` överlever 20 turer | 25–45 % | 47,2 % |
| `passive` förlorar på `BUYOUT` | > 50 % | 58,0 % |
| **Tidigaste `EXPOSURE`-parti** | **ingen före tur 8** | tur 2 (101 partier) |
| `EXPOSURE` totalt | 5–15 % | 8,1 % |
| `aggressive` når `NUCLEAR_EXCHANGE` | 5–20 % | 13,4 % |
| Andel partier avgjorda före tur 8 | **< 2 %** | 7,70 % |
| **Andel partier som slutar på tur 14 eller 20** | **< 60 %** | 80,7 % |
| Turer med `heat > 40`, medel per policy | 30–60 % | 45,3 / 54,0 / **70,4** / **65,5** |
| Rivalbud diskvalificerade | < 10 % | 0,00 % ✓ |
| Spridning slutkassa `balanced` (positiv kassa) | ≥ 3× | 8,7× ✓ |
| **Andel partier där någon grade väljs > 70 % av gångerna** | **< 60 %** | ~96 % |

Fetstilta rader är de som etappen finns för. Övriga är med för att fånga regressioner.

**Måltabellen är hypoteser, inte acceptanskriterier.** Om härnessen envist säger något annat
och partierna ändå är roliga att spela är det tabellen som ska skrivas om — men som ett
medvetet beslut med en motivering och en loggrad.

---

## 7. Refaktorering: `applyActions.ts`

`applyActions.ts` är 724 rader — 5,4 gånger nästa steg (`bidding.ts`, 226). Den äger nu:

- validering och tillämpning av fem handlingstyper
- R&D-köns framflyttning (`advanceRndQueue`)
- stationers exponeringsavkall och bränningsrullning (`advanceStations`)
- hela krislösningen (`resolvePush`, `resolveBackDown`, `resolveSellTheFile`)

Varje enskilt val är motiverat i filens egna kommentarer och inget av dem är fel. Summan är
ändå ett gudsteg, och etapp 1-specens avsnitt 7.1 säger vad som gäller: *"Ett steg som kräver
ett fullt scenario för att kunna testas är för hårt kopplat och ska brytas upp."*

Bryt ut tre filer utan att ändra någon regel eller pipelineordning:

```
resolve/steps/applyActions.ts     bara handlingar
resolve/crisis.ts                 resolvePendingCrisis + de tre utfallen
resolve/upkeep.ts                 advanceRndQueue + advanceStations
```

`upkeep` och `crisis` anropas från `applyActions` i oförändrad ordning, så golden-snapshoten får
inte röra sig. **Det är testet på att refaktoreringen är ren:** ändras hashen har en regel
ändrats, och då ska arbetet stanna (`CLAUDE.md`).

---

## 8. Vad som avsiktligt inte finns i etapp 2

Så att det inte smyger in under bygget.

En andra front, fler köpare, nya scenarier, råvaruspår utöver `supplyCostIndex`, `FUND_COUP`,
`ASSASSINATE`, `BROKER`, `MARKET`, `LEAK`/`SABOTAGE`/`TURN`, namngivna tjänstemän, fördrag,
avkolonisering, karta, ljud, highscore, `StandingOrderChange`s riktiga form, fler än fyra
produktionslinjer vid start.

Allt detta är etapp 3 (bredd) och etapp 4 (djup), enligt `RAPPORT2_LANGSIKTIG_PLAN.md`
avsnitt 3 och 4 — oförändrat, bara förskjutet ett steg.

---

## 9. Promptsekvens

En prompt per commit. Gå inte vidare förrän `Klart när`-villkoret är uppfyllt.

---

**P23 — refaktorering, noll regeländringar**
> Bryt ut `resolve/crisis.ts` och `resolve/upkeep.ts` ur `applyActions.ts` enligt avsnitt 7. Flytta kod, ändra ingen regel, ingen pipelineordning, ingen balanssiffra.
>
> *Klart när:* alla 269 tester är gröna, `npm run typecheck`/`lint`/`build`/`test:e2e` gröna, och **golden-testets tre snapshots är oförändrade**. Rör sig en hash: stanna och rapportera, en regel har ändrats.

**P24 — rivalernas datamodell**
> Utöka `RivalHouse` enligt avsnitt 2.1 och fyll `rivals.json` med startvärden. Låt `bidding.ts` och `queries.ts` skicka rivalens egna `relationToPlayer`, `reputation` och `blocTerm` (den nya `rivalBlocTerm`-formeln, avsnitt 2.2) till `computeScore`. Återställ `relationTermWeight` till 40.
>
> *Klart när:* ett test visar att två rivaler med olika `relations[buyerId]` får olika poäng på samma bud; ett test visar att `bidEstimate`s winBand och `bidding.ts`s avgörande fortfarande använder identiska termer för en rival; ett test visar `rivalBlocTerm` för en homeState-matchad respektive -omatchad rival mot samma blockgränsande faktion; härnessen visar `rivalWinPct` mot `aggressive` > 5 %.

**P25 — rivalerna fullföljer kontrakt**
> Implementera `RivalContract`, rivalernas leverans, attribution och relationsvinst enligt 2.3 — i `deliveries.ts`, INTE i `rivals.ts` (se 2.3:s egen motivering: pipelineordningen gör `rivals.ts` för sent för att `heat.ts` ska hinna se leveransen samma tur). En rivalleverans går in i `Front.attribution` under rivalens id och räknas i `Theatre.deliveriesIntoActiveWarThisTurn` i SAMMA steg leveransen sker.
>
> *Klart när:* ett test visar att en front rör sig i ett parti där spelaren inte levererar någonting men en rival gör det; ett test visar att `Front.attribution` innehåller minst en rivalnyckel efter 20 turer; ett test visar att en rival som missar `dueTurn` tappar `reputation.reliability`; ett test visar att en rivalleverans räknas i `Theatre.deliveriesIntoActiveWarThisTurn` SAMMA tur (inte nästa) — bevisar att pipelineplatsen faktiskt är rätt.

**P26 — rivalernas två obyggda beteenden**
> Implementera leverantörskapacitet och egna incidenter enligt 2.4, inklusive felattribution mot spelaren (samma `house.exposureEvents`-mekanism STAGE_INCIDENT redan använder — P29 gör om den mekanismen för båda källorna på en gång, se 4.1). Besluta `sabotagedUntilTurn` enligt 2.5 — koppla eller ta bort, och logga vilket.
>
> *Klart när:* ett test visar att en `opportunist`-rival kan höja `supplyCostIndex` och att kedjan går att läsa i wire; ett test visar att en rivalincident kan pusha till `house.exposureEvents` via felattribution; härnessen visar minst ett parti per 100 där spelarens `supplyCostIndex` höjts av en rival.

**P27 — kapaciteten biter**
> Implementera eskalerande straff för sena kontrakt och `late → voided` enligt 3.1 — för BÅDE spelarens `Contract` och en rivals `RivalContract`. Implementera linjeomställning enligt 3.2.
>
> *Klart när:* ett test visar att ett kontrakt som passerar `dueTurn + contractGracePeriodTurns` blir `voided`, att köparens relation faller och att ingen ytterligare betalning bokförs; ett test visar detsamma för en `RivalContract`; ett test visar att en linje som byter produkt inte producerar under omställningsturen; härnessen visar `voidedContracts > 0` för `aggressive` OCH loggar hur många turer en bot i median är diskvalificerad av `reliabilityBidFloor` efter en enda sen leverans (se 3.1:s riskvarning — inte bara att talet är större än noll).

**P28 — teknikspärr och R&D-värde**
> Implementera `techRequired` som diskvalificeringsgrund enligt 3.3. Höj `INDOCHINA_SLICE`s `techLevelDefault` från 1 till 4 i alla kategorier (3.3:s tabell och motivering — INTE en fri mätfråga mellan två alternativ, talet är bestämt här).
>
> *Klart när:* ett test visar att ett bud på en produkt över husets tekniknivå avvisas med `'insufficient tech level'`; ett test visar att `m3_apc`/`ch3_transport_helicopter`/`coastal_patrol_boat`/`tac_radio_suite` alla är biddbara vid scenariots start med den höjda `techLevelDefault`; ett test visar att ett fullföljt `REPRIORITISE_RND`-projekt i artillery gör mk9-budet giltigt; härnessen visar att minst 25 % av partierna når mk9-ordern med tillräcklig tekniknivå och att minst 25 % inte gör det.

**P29 — `EXPOSURE` som båge**
> Skilj misslyckad attribution från bränd station enligt 4.1 — för BÅDA källorna till en felattributionspush (STAGE_INCIDENT sedan P18, och P26:s nya rivalincident-väg). Lägg till varningsnivån i `THE WORLD` och wire-`report` enligt 4.2.
>
> *Klart när:* ett test visar att en misslyckad `STAGE_INCIDENT`-attribution höjer `station.exposure` men inte `house.exposureEvents`; ett test visar samma sak för en rivalincidents felattribution; ett test visar att `EXPOSURE` kräver tre brända stationer; **härnessen visar inget `EXPOSURE`-parti före tur 8.**

**P30 — styrelsen och scenariot**
> Nollställ `reviewsFailed` vid godkänd kontroll (5.1). Sätt `reviewTurns: [6, 10, 14, 18]` (5.2). Lägg till två `restricted`-utlysningar enligt 5.3.
>
> *Klart när:* ett test visar att underkänd → godkänd → underkänd **inte** ger `BUYOUT`, och att två i rad gör det; härnessen visar att `BUYOUT` inträffar på minst tre olika turer, att andelen partier som slutar på tur 14 eller 20 sjunkit under 70 %, och loggar underkänd-andelen specifikt vid tur 6 separat från de tre andra granskningsturerna (5.2:s riskvarning).

**P31 — botarna och mätningen**
> Ge alla fyra botar dynamiskt grade-val enligt 6.1. Lägg till de fem CSV-kolumnerna i 6.2.
>
> *Klart när:* `npm run harness -- --runs 500` skriver de fem nya kolumnerna, och ingen policy väljer samma grade i mer än 70 % av sina bud.

**P32 — balanspass**
> Ingen kod. Kör härnessen mot måltabellen i 6.3, ändra bara `balance.json` och scenariodata, kör igen. Frys om `balance.frozen.json` och uppdatera golden-snapshoten som ett medvetet, separat beslut när tabellen står.
>
> *Klart när:* de sex fetstilta raderna i 6.3 är uppfyllda eller uttryckligen reviderade med motivering och loggrad, och hela CI-kedjan är grön.

---

## 10. Vad som händer efter P32

Frågan är fortfarande etapp 1:s:

> **Är tjugo turer av detta spännande, och tvingar de fram minst ett beslut där lönsamhet och
> överlevnad pekar åt olika håll?**

Efter etapp 1,5 kan frågan ställas — alla system är levande. Efter etapp 2 kan den *besvaras*,
för då finns det något som svarar emot. Tre nya kriterier utöver etapp 1-specens avsnitt 11:

- Om du kan bjuda på varje order utan att någonsin ångra dig är kapaciteten fortfarande fiktion.
- Om du aldrig förlorar ett kontrakt till en namngiven rival är auktionen fortfarande en
  formalitet.
- Om du aldrig ser en station bli varm innan den brinner är `EXPOSURE` fortfarande ett myntkast.

Spela tio partier. Är svaret ja på alla tre plus etapp 1:s två, bygg bredden — andra fronten,
råvarumarknaden, `OCTOBER` och `SUEZ`, i den ordning `RAPPORT2_LANGSIKTIG_PLAN.md` avsnitt 3
föreslår.
