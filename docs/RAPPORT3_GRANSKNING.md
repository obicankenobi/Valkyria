# Rapport 3 — granskning av läget efter etapp 7

**THE SEVENTH FRONT** · 2026-09-29 · mätt mot `513870d` (efter P94), omkontrollerat mot `427684e` (efter P99)

> **Omkontroll efter P96–P99:** EMBARGO-regeln är oförändrad, och spelet vinns fortfarande nästan
> aldrig. Vid `427684e`, 100 partier per bot: `passive` 0/100, `aggressive` 0/100, `balanced` 1/100,
> `capacity` 5/100. Medianpartiet slutar på tur 10 för alla fyra, med 2–3 kontrakt. Förskottet (P98)
> ändrade inte utfallet. Tabellerna i §1–§2 är mätta vid `513870d`.

Samma sorts dokument som `RAPPORT1_GRANSKNING.md`: en extern läsning av repot, inte en spec.
Allt nedan är mätt med den incheckade harnessen eller kontrollerat i koden, om inte annat sägs.
Hur man upprepar mätningarna står i §7.

---

## Sammanfattning

1. **Spelet går inte att vinna i dag.** Av 400 partier med de fyra botarna når 2 (vid `513870d`) och
   6 (vid `427684e`, efter P99) `SCENARIO_COMPLETE`. Alla fyra botarnas medianparti slutar på tur 10.
2. **Orsaken är en enda regel, EMBARGO, som kom in med P57 den 17 september.** Två tjänstemän
   har agendan `NON_ALIGNMENT`. Alla tjänstemän börjar med relation 0 till spelaren, så på tur 4
   utfärdar båda embargo i varje parti. Embargot hävs aldrig. NLF och Laos slutar lägga ordrar,
   och spelaren har bara en köpare kvar av tre.
3. **Felet har funnits i tolv dagar och cirka fyrtio prompter utan att upptäckas.** Ingen mätning
   efter P53b har tittat på hur partierna slutar. Varje mätning har bara kontrollerat sin egen
   prompts rader.
4. **Arkitekturen är utmärkt.** Den rena, deterministiska kärnan och harnessen gjorde att felet
   gick att spåra till exakt en commit på en timme. Det är projektets största styrka.

---

## 1. Fyndet: EMBARGO avgör varje parti på tur 4

### 1.1 Mekanismen

`politics.ts` (P57): varje aktiv tjänsteman med `standing ≥ 60` och `relationToPlayer < 30`
utfärdar sitt policybeslut, en gång, från tur 4 (`policyDecisionMinTurn`). `relationToPlayer`
startar på 0 för alla tolv tjänstemän (`state.ts`). Villkoret är alltså uppfyllt för varje
tjänsteman med tillräcklig standing, så fort tur 4 kommer.

Två tjänstemän har agendan `NON_ALIGNMENT`, vilket ger beslutet `EMBARGO`:

| Faktion | Post | Agenda |
|---|---|---|
| `nlf` | defence | `NON_ALIGNMENT` |
| `laos` | finance | `NON_ALIGNMENT` |

`faction.embargoed = true` skrivs på ett enda ställe (`politics.ts`) och sätts aldrig tillbaka
till `false`. `orders.ts` hoppar över embargerade faktioner (rad ~304 och ~361), så de lägger
inga fler ordrar under resten av partiet.

**Spelaren kan inte se det komma.** `officialDisplay` visar en tjänstemans agenda bara om huset har
en station med täckningen `'cabinet'` i landet. Startstationen i Saigon har bara `'procurement'`.
För att slippa embargot hade spelaren behövt veta vilka två tjänstemän det gäller, och sedan höja
båda från 0 till 30 med `BRIBE`, `FUND_CAMPAIGN` eller `FAVOUR` under tur 1–3. `BRIBE` ger högst 15
per tur och tjänsteman, så det kräver minst fyra av de nio handlingarna i de tre första turerna.

P58 mätte redan att EMBARGO inträffar i 100 % av partierna (målet var 10–30 %) och loggade det som
en strukturell miss. Följden, att spelet inte längre går att vinna, mättes aldrig.

### 1.2 När det hände: mätning per commit

Harnessen körd vid varje commit som rört `packages/core/src` eller `packages/harness/src` sedan
P53b, 30 partier per bot. Vinst betyder `SCENARIO_COMPLETE`.

| Commit | Prompt | `passive` vinst | `aggressive` vinst | Medianparti slutar |
|---|---|---|---|---|
| `3690f29` | P53b | 50/50 | 48/50 | tur 20 |
| `8d495fa` | P54 | 28/30 | 28/30 | tur 20 |
| `a92926d` | P55 | 20/30 | 16/30 | tur 20 |
| `db8b95f` | P56 | 20/30 | 17/30 | tur 20 |
| **`4734a7b`** | **P57** | **0/30** | **0/30** | **tur 10** |
| `98b0327` … `8b9b921` | P59–P89 | 0/30 | 0/30 | tur 10 |

P53b:s egna siffror i ändringsloggen (30/30 och 29/30) går att återskapa med den incheckade
harnessen. Mätningen var korrekt; det är P57 som ändrade läget.

### 1.3 Vilket av P57:s beslut: varje beslut avstängt för sig

Vid `4734a7b`, 40 partier per bot:

| Variant | `passive` vinst | Kontrakt (median) | `aggressive` vinst |
|---|---|---|---|
| P57 som den är | 0/40 | 2 | 0/40 |
| utan `EMBARGO` | 19/40 | 33 | 3/40 |
| utan `PRICE_CAP` | 0/40 | 2 | 0/40 |
| utan `TENDER_REFORM` | 0/40 | 7 | 0/40 |
| utan `LICENCE_REVIEW` | 0/40 | 2 | 0/40 |
| utan `PREFERRED_SUPPLIER` | 0/40 | 2 | 0/40 |
| utan något policybeslut | 26/40 | 35 | 19/40 |

`EMBARGO` förklarar det mesta. `TENDER_REFORM` och `PREFERRED_SUPPLIER` bidrar något.
Kontraktsantalet visar vad som händer: två kontrakt på ett helt parti i stället för drygt trettio.

### 1.4 Vad det förklarar i speltestet P81

P81-7 ("0 % vinstchans oavsett bud") och P81-8 ("utkastad tur 10") förklarades som ett visningsfel
i `winBand` och som den kända `BUYOUT`-kaskaden. Visningsfelet var verkligt, och P81c rättade det.
Men grundorsaken till att partiet tog slut på tur 10 var att två av tre köpare hade försvunnit på tur
4. Det har P81c inte rört.

---

## 2. Även utan fällan fungerar bara en strategi

Dagens kod (`513870d`) med bara `faction.embargoed = true` avstängd, 100 partier per bot:

| Bot | Vinst | Kontrakt | Marknadsandel | Bruttomarginal | Slutar (median) |
|---|---|---|---|---|---|
| `passive` | 58/100 | 34 | 72 % | 49 % | tur 20 |
| `aggressive` | 0/100 | 5 | 26 % | −2 % | tur 10 |
| `balanced` | 0/100 | 4 | 22 % | −12 % | tur 10 |
| `capacity` | 5/100 | 5 | 26 % | 6 % | tur 10 |

Botarna är enkla, så tabellen bevisar inte att spelet är dåligt. Men mönstret är tydligt: **den bot
som gör minst vinner mest.** `balanced` säljer med förlust (P81 fynd 1, den bjuder på fel prisband).
`aggressive` lägger pengar på politiska operationer vars belopp inte påverkar något (P86-fyndet) och
har fler handlingar än sin budget (P64). DESIGN.md §4 säger att "inte bjuda alls" ska vara den
sämsta strategin. I dag är passivitet den bästa.

Den nya botpolicyn `human` i etapp 8 (P103) är rätt verktyg för att avgöra om det är botarna eller
spelet som brister.

---

## 3. Andra mekaniska observationer (kontrollerade i koden)

**Forskningen låser upp en enda sak, kärnvapengranaten.** Huset startar på `techLevel` 4 i alla
kategorier och 7 i sin specialisering (artilleri). Av sju produkter kräver sex `techRequired` ≤ 4
och är alltså upplåsta från start. Den sjunde är `Mk-9 "Longhand"` (`techRequired` 8, restricted).
Ett R&D-projekt i artilleri (6 turer) låser upp den. I alla andra kategorier höjer forskningen ett
tal som inget läser. Det förklarar P81-17 ("research känns obyggd") helt och ger etapp 9 en tydlig
utgångspunkt.

**Doomsday kan inte döda genom att växa.** Krisen flaggas vid 75, och alla tre val sätter doomsday
till 40–50. `NUCLEAR_EXCHANGE` (95) nås därför bara via `PUSH`, med 30 % risk, som spelaren själv väljer.
`SELL_THE_FILE` ger 3 000 000, det vill säga tre fjärdedelar av startkapitalet. Det kan bli en loop:
driv doomsday till 75, sälj akten, upprepa. Det är en hypotes som jag inte har mätt. Pelare 1, "för
mycket våld avslutar spelet", har alltså ingen smygande dödsväg, bara ett frivilligt tärningsslag.
Median för högsta doomsday per parti ligger på 17–54 beroende på bot.

**Det politiska lagret syns inte i utfallen.** Över 400 partier: 0 lyckade kupper, 0 utbytta
tjänstemän, 0 `EXPOSURE`. Det är känt sedan P64, men värt att säga rakt ut: tolv prompter i etapp 5
påverkar i dag inte hur ett parti slutar, utom genom EMBARGO.

**Död data som etapp 8 redan tar hand om:** `capacityPct` skrivs aldrig, och `StandingOrderChange`
är en tom platshållare.

---

## 4. Processen

### Det som fungerar

- **Den rena kärnan, seedad slump och golden-testet.** Utan dem hade felsökningen tagit dagar.
  Varje commit gick att bygga och mäta för sig på sex sekunder.
- **Harnessen.** Den kör 400 partier på några sekunder och är projektets viktigaste verktyg.
- **"Genuina fynd" loggas i stället för att byggas runt.** P58 såg EMBARGO 100 %, P64 såg partier på
  i snitt elva turer, P86 såg att beloppen inte gör något. Informationen fanns.
- **Testmängden.** 16 000 rader test mot 19 000 rader kod, plus 136 e2e-tester.

### Det som föll mellan stolarna

1. **Varje mätning kontrollerar bara sin egen prompts rader.** P58 mätte 5A:s fem rader, P64 5B:s,
   P75 stillhet, P82 omgruppering. Ingen av dem tittade på vinstfrekvensen, som är det enda talet
   som säger om spelet fungerar.
2. **Symptomen lästes som bakgrund.** P64 skrev "inom partier på i snitt ~11 turer" som en
   förklaring till varför frontstatus aldrig ändras. I ett scenario på 20 turer borde det ha varit
   ett larm.
3. **Etapp 6 och 7 var ren presentation.** Det var rätt beslut, men det gjorde att ingen byggde i
   kärnan på tolv dagar, och därmed ingen som märkte något.

### Förslag

- **Ett spelbarhetstest i CI.** Ett test som kör harnessen med till exempel 50 partier per bot och
  underkänner om ingen bot når `SCENARIO_COMPLETE` i minst 30 % av partierna. Det är golden-testets
  motsvarighet för spelbarhet, och det hade stoppat P57 samma dag. Tröskeln är ett ägarbeslut.
- **Varje balansmätning redovisar också slutfördelningen**, oavsett vad prompten mäter. En rad per
  bot räcker.
- **Mätskript checkas in.** P53b:s "ad-hoc mätskript (ej committat)" råkade stämma, men det gick bara
  att kontrollera genom att återskapa det. Lägg mätningar som harness-kolumner eller skript i repot.
- **Banta `CLAUDE.md`.** Den är på cirka 8 000 ord och läses av varje kodsession. Det mesta är
  historik som redan finns i ändringsloggen och specarna. Behåll reglerna, det aktuella läget och
  pekare. Det sparar kontext i varje session och gör att reglerna inte drunknar.
- **Ändringsloggen är på 46 000 ord** med rader som är hela uppsatser. Den fungerar som arkiv men
  inte som arbetsminne. Överväg en kort "läget just nu"-sammanfattning högst upp i varje spec.

---

## 5. Vad det betyder för etapp 8

**Min egen premiss i `ETAPP8_FORSLAG.md` var fel.** §0.2 och §4.1 säger att förskottet kan lösa
`BUYOUT`-kaskaden genom att fylla tomrummet under tur 1–4. Det tomrummet finns, men det är inte
orsaken till tur 10. Orsaken är embargot. Förskott hade inte hjälpt när två av tre köpare försvinner.

**Rekommendation: rätta embargot nu, som en egen prompt före P100.** P96–P99 är redan byggda, men
balanspasset P104 och botpolicyn `human` (P103) är det som påverkas mest. Den ändrar en regel i kärnan och
kräver därför omfryst golden och ett ägarbeslut. Utan den mäter hela etapp 8:s måltabell (§7.2) mot
ett spel som inte går att vinna, och varje tal där blir missvisande.

Möjliga sätt att rätta det, i ordning efter hur lite de ändrar:

1. **Starta `relationToPlayer` på tröskeln (30) i stället för 0.** Då betyder "ohörsammad" att spelaren
   har gjort något som försämrat relationen, inte att spelaren ännu inte hunnit göra något. Det passar
   pelare 2 bäst: en följd av något du gjorde. Minsta ändringen.
2. **Varna innan.** En telexrad turen innan, till exempel "MINISTRY OF FINANCE, VIENTIANE, REVIEWING
   ARMS IMPORTS", med tjänstemannen och vad som krävs. Då blir det ett beslut i stället för en fälla.
3. **Tidsbegränsa embargot**, till exempel 4–6 turer, som `preferredSupplierUntilTurn`.
4. **Låt embargot gälla spelaren, inte hela faktionen.** I dag slutar faktionen köpa från alla.
   Ett embargo mot bara ditt hus hade gett rivalerna marknaden, vilket är en intressantare följd.

Alternativ 1 och 2 går att kombinera. Efter rättelsen: mät om slutfördelningen för alla fyra botar
och uppdatera §0 och §7.2 i etapp 8-förslaget med den nya baslinjen.

---

## 6. Idéer

- **Alla regler som kan stänga ett parti ska synas i världen först.** Pelare 2 säger att den osedda
  effekten ska gå att spåra bakåt. Embargot är det omvända: en osedd orsak. En enkel princip att
  lägga i DESIGN.md: *ingen förlust utan en varning i THE WIRE minst en tur innan.*
- **Kartan ritar sex länder men bara tre köper.** Thailand, Kambodja och Kina är ritade men är inte
  köpare. Små köpare där, med låg volym och egna tjänstemän, skulle göra marknaden mindre sårbar (ett
  embargo tar i dag en tredjedel av den) och ge kartan mer att göra. Det passar som tillägg i etapp 8
  eller som eget litet paket.
- **Låt forskningen påverka kvaliteten, inte bara låsa upp.** I dag är nästan allt redan upplåst.
  Om `techLevel` över produktens krav gav bonus i `computeScore` (via `quality`), skulle forskning i
  alla kategorier betyda något. Det är en fråga för etapp 9.
- **Mät `SELL_THE_FILE`-loopen** innan pelare 1 anses prövad: hur ofta botarna når 75, vad de väljer
  och hur stor del av intäkterna som kommer från kriser.
- **Speltesta med en fusklapp.** Innan P95: ett parti där du vet om embargot och försöker undvika det.
  Om spelet då känns rätt är problemet synlighet. Om det fortfarande inte går att vinna finns det mer.

---

## 7. Så upprepas mätningarna

```
npm install
npm run harness                       # 100 partier per bot, skriver harness-results.csv
node packages/harness/dist/index.js --runs 50 --policy passive,aggressive
```

Per commit: checka ut commiten i en separat arbetskopia (`git worktree add`). Ge den egna
`node_modules` där `@seventh-front/core` och `@seventh-front/harness` pekar på arbetskopians egna
paket, annars körs huvudrepots kärna. Bygg sedan `packages/core` och `packages/harness` med `tsc`
och kör harnessen. Varianterna i §1.3 och §2 gjordes genom att sätta `if (false as boolean)` framför
respektive rad i `politics.ts`, bara i arbetskopian. Inget av det är incheckat.
