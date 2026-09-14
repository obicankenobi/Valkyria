# Rapport 2 — Långsiktig plan

**THE SEVENTH FRONT** · efter etapp 1 · skriven 2026-09-14 mot `156eb7d`

Den här rapporten handlar om vart spelet ska efter att den vertikala skivan fungerar. Den
förutsätter rapport 1:s slutsats: arkitekturen bär, men skivan är ännu inte ett spel. Planen
nedan är därför ordnad efter *vilken fråga varje steg besvarar*, inte efter vilken feature som
låter roligast.

---

## 1. Grundhållningen: bygg inte bredd förrän djupet betalar

`DESIGN.md` §20 lägger etapp 2 som "bredd" (andra fronten, kupper, `ASSASSINATE`,
råvarumarknad, `SUEZ`, `OCTOBER`) och etapp 3 som "djup" (karaktärer, fördrag, avkolonisering,
`THE LONG WAR`). Den ordningen var rätt när den skrevs. Den är fel nu, av ett skäl som inte
gick att veta i förväg:

**Etapp 1 byggde alla systemen men kopplade bara in hälften av dem.** Rapport 1 avsnitt 4
listar sju fält och två hela mekaniker (R&D, executive actions) som finns i modellen och inte
i spelet. Att lägga en andra front ovanpå det gör inte spelet bredare — det fördubblar bara
antalet ställen där en död mekanik syns.

Därför föreslår jag en etapp som inte finns i designdokumentet:

| Etapp | Fråga den besvarar | Omfattning |
|---|---|---|
| **1,5 — skivan som spel** | Är tjugo turer av *detta* spännande? | Ingen ny mekanik. Koppla in det som finns. Rapport 3 |
| **2 — bredd** | Tål modellen fler samtidiga system? | Andra fronten, kupper, råvaror, `SUEZ`, `OCTOBER` |
| **3 — djup** | Tål modellen tid? | Karaktärer, fördrag, avkolonisering, `WINDS` |
| **4 — kampanj** | Tål spelet 176 turer? | `THE LONG WAR`, metaprogression |

Etapp 1,5 är ungefär två veckors promptarbete och den enda etapp vars värde är *bevisbart* —
härnessen mäter den. Allt efter den är vadslagning.

---

## 2. Etapp 1,5 i sammanfattning

Detaljerna ligger i rapport 3. Här står bara varför de fyra blocken hänger ihop.

**Block A — laga auktionen.** `trueBudget` mot rivalmarginal (rapport 1, 5.3) är den enda
bristen som inte är "koppla in något som finns". Den måste lagas först, eftersom varje annan
balanssiffra i spec 7.3 är mätt genom den.

**Block B — väck den döda modellen.** `supplyCostIndex`, `unitsPerLineTurn`,
`gradeScandalChance`, `reliability`s faktiska tyngd, `militaryBudget` som en verklig gräns.
Fem små kodändringar som var och en återför ett beslut till spelaren.

**Block C — ge spelaren handlingar.** `applyActions` har saknat en ägande prompt sedan P2.
Utan den finns inte `INTEL`, `POLITICAL`, `INTERNAL` utöver lån — alltså inte `DESIGN.md` §4:s
"detta är spelet".

**Block D — stäng slutvillkoren.** `EXPOSURE` och `NUCLEAR_EXCHANGE` har aldrig inträffat i
6 000 partier. Krisvalet (PUSH / BACK DOWN / SELL THE FILE) är den saknade pusselbiten för
båda, och den kräver Block C.

Blocken är ordnade. B kan köras parallellt med C. D kräver C.

---

## 3. Etapp 2 — bredd

När skivan fungerar är frågan om modellen tål fler samtidiga system. Här är designdokumentets
lista, omprioriterad efter vad som faktiskt belastar modellen mest och vad som ger mest
spelvärde per byggd rad.

### 3.1 Råvarumarknaden — först, för att den är billigast och betyder mest

`DESIGN.md` §14 skjuter olja, stål, uran, titan och sällsynta jordartsmetaller till etapp 2
och låter `supply_cost_index` vara etapp 1:s ersättning. Om Block B kopplar in indexet
ordentligt har du redan hela kostnadssidans maskineri — fem råvaruspår är då en generalisering
av en siffra till en vektor, inte ett nytt system.

Vad det köper:

- **Prissättning blir tvådimensionell.** Idag väljer spelaren pris. Med råvaror väljer hen pris
  *och tidpunkt* — ta kontraktet nu till dagens stålpris, eller vänta och riskera att
  efterfrågan går till en rival.
- **`MARKET`-handlingarna (`BUY_FORWARD`, `RELEASE`) får innehåll.** De är stubbade sedan P2
  och är den enda handlingskategorin som är ren ekonomi utan politisk risk — alltså den
  naturliga ingången för en spelare som inte vill iscensätta incidenter.
- **Embargo blir ett vapen i stället för en flagga.** Idag är `Faction.embargoed` ett fält med
  en provisorisk kassadränering. Med råvaror blir embargo det designdokumentet §8 exemplifierar
  med: *"crude oil +140 % sedan Q2 1961 ← ditt embargo av Gulf-råolja"* — en fyra led djup
  kausalkedja som spelet idag inte kan producera.

Modellbelastning: låg. `market.supplyCostIndex: number` → `market.commodities:
Record<CommodityId, { price, trend }>`, och `computeUnitCostNow` slår upp produktens
råvaruprofil. Ingen ny pipeline-fas.

### 3.2 Den andra fronten — därefter, för att den prövar attribution på riktigt

Etapp 1 har en front och en teater. Det gör `heat` till ett globalt tal med extra steg och
gör `attribution` (`Front.attribution`, `DESIGN.md` §10) till bokföring utan konsekvens.

Med två fronter i olika teatrar blir tre saker verkliga för första gången:

- **`heat` blir ett val.** Du kan låta en teater svalna medan du eldar i den andra. Med en
  front finns bara "leverera" och "inte leverera".
- **Attribution får en mottagare.** Att dina pjäser dödade 9 000 man på front A medan du sålde
  till front B:s motpart är den andrahandseffekt designpelare 2 beskriver. Med en front kan
  spelaren aldrig hamna på båda sidor.
- **Kapacitet blir knapp på riktigt.** Fyra linjer mot två samtidiga efterfrågetoppar är den
  knapphet `DESIGN.md` §4 påstår att spelet redan har.

Modellbelastning: medel. `Theatre` och `Front` är redan `Record`-baserade, så datamodellen
behöver ingenting. Men `computeHeatForBuyer` (pricing.ts:91) antar idag "en köpare hör till
högst en front" och returnerar 0 annars — den regeln måste beslutas ordentligt, inte lösas i
förbifarten.

Rekommenderat scenario att bygga den i: **`OCTOBER` (1971–1975, 17 turer)**. Det är kortare än
`INDOCHINA`, har hög `DOOMSDAY` från start och en oljechock — alltså prövar det råvarorna från
3.1 och den andra fronten samtidigt, i ett scenario som är snabbt nog att köra i härnessen.
`SUEZ` (14 turer, en enda kund) är det andra bra valet men prövar motsatsen: en extremt smal
marknad där relationen till en köpare är allt.

### 3.3 `FUND_COUP` och `ASSASSINATE` — sist i etapp 2, och med försiktighet

Designdokumentet §13 och §9 beskriver båda väl, och §15 drar rätt gräns (fiktiva tjänstemän,
verkliga statschefer passiva). Två anmärkningar inför bygget:

- **Bygg dem efter att `DOOMSDAY` faktiskt kan döda spelaren.** I dag är båda bara
  `DOOMSDAY`-siffror utan konsekvens (rapport 1, 5.6). En kupp som ger +8…15 på en mätare som
  aldrig når 95 är en knapp som inte gör något.
- **Kupp är intressantare än lönnmord.** `FUND_COUP` byter en faktions `alignment`, annullerar
  den gamla regimens kontrakt och ger förköpsrätt — alltså tre systemeffekter som alla redan
  har fält i modellen. `ASSASSINATE` har ingen motsvarande systemeffekt beskriven; den riskerar
  att bli en dyr `BRIBE`. Om budgeten tryter, bygg kuppen och skjut lönnmordet.

### 3.4 Vad jag skulle *stryka* ur etapp 2

`DESIGN.md` §21 har en bra lista över medvetet bortskuret. Två saker som står kvar i planen och
som jag skulle flytta bakåt:

- **Fler än fyra produktionslinjer.** §3 säger "utbyggbart till 9". Så länge
  `unitsPerLineTurn` är kopplat (Block B) och produkterna får skilda takter är fyra linjer
  redan ett hårt val. Nio linjer är klickarbete tills det finns en anledning att specialisera
  dem.
- **Fler än tre rivaler.** Rapport 1, 5.2 visar att tre rivaler redan är tre för många att
  konkurrera — de vinner 0–6 %. Att lägga till fler innan de är farliga gör bara wire mer
  brusigt.

---

## 4. Etapp 3 — djup

Det här är den etapp där spelet antingen blir minnesvärt eller blir en tabell.

### 4.1 Karaktärer, men som *relationer till roller* — inte som personer

`DESIGN.md` §20 säger "karaktärer med relationer". Den formuleringen kan gå två vägar, och
bara den ena är i register.

**Undvik:** namngivna NPC:er med porträtt, humör och dialogträd. Det bryter mot §18 ("grafik
utöver typografi" är bortskuret) och mot spelets grundgrepp — du ser aldrig människor, du ser
telexmeddelanden om dem.

**Bygg i stället:** en `Relationship`-modell ovanpå de tjänstemän som redan finns implicit i
anbudet. `Order.inspectorIntegrity` är i dag en anonym siffra. Ge inspektören ett namn, en
karriärbana och ett minne:

```
Col. Trân, procurement, RVN
  integrity 62 · befordrad Q3 1965 · du mutade honom Q1 1964 (£40 000)
  minne: du levererade grade C till hans enhet 1966 — repTerm mot honom permanent −6
```

Det här är billigt (en `Record<OfficialId, Official>` och en uppslagning i `computeScore`) och
det gör tre saker som inget annat system gör:

- **Mutan blir en investering i stället för en kostnad.** I dag är `bribe` en engångsterm i
  poängformeln. Med minne blir den en relation som kan förvaltas eller brännas.
- **`INTEL`-operationerna får riktiga mål.** `TURN` (vända en agent) är i dag abstrakt. Med
  namngivna tjänstemän är det "vänd Trân" — och `LEAK` blir "läck Trâns mutor till hans chef".
- **Epilogen får ansikten.** `DESIGN.md` §6.3 kräver att kärnvapenslutet inte är en svart
  skärm. En dödsruna över huset som kan säga *vilka* tre tjänstemän som stod i vägen och vad
  som hände med dem är ojämförligt starkare än en siffersammanställning.

### 4.2 Fördrag — som en klocka, inte som en förhandling

`DESIGN.md` §21 stryker "detaljerad diplomatisk fördragsmaskin i etapp 1", vilket är rätt.
För etapp 3 föreslår jag att den aldrig blir en maskin heller.

Fördrag bör vara **historiska händelser med datum**, inte något spelaren förhandlar om:
provstoppsavtalet 1963, SALT I 1972, Helsingforsavtalet 1975. De sänker `DOOMSDAY` med 12–18
(§6.2), de stänger vissa `restricted`-produkter permanent, och de öppnar ett fönster innan de
träder i kraft där just de produkterna är extremt värdefulla.

Det ger spelaren något att *planera mot* utan att ge hen en förhandlingsmeny — vilket är i
linje med designpelare 3: *"Du är alltid näst mäktigast i rummet."* Du förhandlar inte SALT.
Du vet att det kommer och du säljer klart innan.

### 4.3 Avkolonisering och `WINDS` — tolv nya köpare är ett annat spel

`WINDS` (1958–1968, 41 turer, tolv nya köpare, ingen aktiv front vid start) är det scenario som
mest skiljer sig från `INDOCHINA_SLICE`. Det prövar en helt annan färdighet: att *bygga* en
marknad i stället för att slåss om en.

Det är värt att bygga, men det är också det scenario som mest sannolikt avslöjar att
anbudsmodellen inte skalar — tolv köpare × tre rivaler × N produkter per tur är en
kombinatorisk explosion i `bidEstimate` (som i dag kör 100 Monte Carlo-sampel × 5 prispunkter
× antal rivaler *per order och rendering*). Räkna med ett prestandapass.

### 4.4 `THE LONG WAR` — bara om metaprogressionen finns

176 turer är designdokumentets egen varning (§16: "det är en grindmaskin"). Den enda version
av full kampanj som är värd att bygga är en där scenarierna *är* kampanjen: du spelar `SUEZ`,
ditt hus bär med sig kapital, rykte och stationer in i `INDOCHINA`, och slutkortets fyra axlar
(`CAPITAL` / `REACH` / `SHADOW` / `RESTRAINT`, §17) blir startvillkor för nästa scenario i
stället för ett betyg.

Det gör kampanjen till sex scenarier med arv, inte till 176 kvartal i rad. Och det använder
`§17`:s betygsmodell till något, vilket den annars inte är.

---

## 5. Teknisk riktning — fem beslut som blir dyra senare

### 5.1 Balansdata måste valideras vid bygget

`pricing.ts:52` och fem andra ställen gör `balanceData as unknown as Balance`. Det betyder att
en felstavning i `balance.json` blir `undefined` och propagerar som `NaN` genom poängformeln.
I en fil som enligt specen ska skruvas "hundratals gånger" är det fel sorts risk.

Med fem råvaruspår, fler scenarier och fler produkter växer datafilerna snabbt. Lägg in en
schemavalidering (`zod` eller genererade typer) innan etapp 2, inte efter. Kostnad nu: en
kväll. Kostnad senare: en balanskväll som går åt till att leta efter varför en siffra blev
`NaN`.

### 5.2 Golden-testet måste faktiskt byggas innan etapp 2

Det saknas fortfarande (rapport 1, 2.4). Så länge det inte finns saknar varje framtida
balanspass det skyddsnät `CLAUDE.md` förutsätter. Med fler system blir "ändrades en regel eller
en siffra?" en fråga man inte kan besvara genom att läsa diffen.

Bygg det med `balance.frozen.json` som planerat, och bygg det som **tre** snapshots — ett per
botpolicy — så att det fångar regeländringar som bara syns i ett spelmönster.

### 5.3 `bidEstimate` behöver en prestandabudget

I dag: `MONTE_CARLO_SAMPLES (100) × WIN_BAND_POINTS (5) × antal rivaler` anrop av
`computeRivalBid` + `computeScore` per order, och `BidForm` räknar om vid varje grade-byte.
Med tre rivaler är det 1 500 poängberäkningar per order. Med `WINDS`
(tolv köpare, fler ordrar per tur, fem rivaler) blir det femsiffrigt per tur — i UI-tråden.

Det är inte ett problem nu och det ska inte optimeras nu. Men det ska mätas innan etapp 2, så
att beslutet att memoisera per `(seed, orderId, grade)` fattas medvetet i stället för i panik.

### 5.4 `GameState`-migrering behöver ett andra fall innan den behövs

`persistence.ts` har ett migreringsramverk med exakt ett identitetsfall (version 1 → 1), ärligt
loggat. Det är rätt beslut nu. Men **första gången det används på riktigt bör inte vara första
gången det testas.** Lägg in ett syntetiskt `version 0 → 1`-fall med ett test, så att
ramverket är prövat innan etapp 2 oundvikligen höjer versionen.

### 5.5 Bestäm UI-språket nu, inte om två etapper

Rapport 1, 3.2 A: hela UI:t är svenskt, specen kräver engelska. Ju fler vyer som byggs desto
dyrare blir bytet. Mitt råd, om du frågar: **engelska UI-strängar, svenskt dokumentationsspråk**
— precis som specen redan säger. Spelets hela ton är engelskspråkig telex från 1964; ett
svenskt "Bruttomarginal" bredvid `HALVORSEN & VOSS WINS CONTRACT` bryter illusionen på ett sätt
som ingen mekanik kan laga. Om du ändå vill ha svenskt gränssnitt: skriv loggraden, och lägg in
i18n-strukturen direkt i stället för att hårdkoda ett andra språk.

---

## 6. Nytt innehåll — vad som är värt att lägga till, i värdeordning

Ordnat efter *spelvärde per byggd rad*, inte efter hur lockande det låter.

| # | Tillägg | Etapp | Varför just detta |
|---|---|---|---|
| 1 | Fler produkter med **olika marginalprofil** | 1,5 | Sju produkter med 38–47 % marginal ger inget val (rapport 1, 5.8). Tre profiler behövs: massvara med låg marginal/hög volym, specialitet med hög marginal/låg volym, `restricted` med extrem marginal/extrem risk |
| 2 | `gradeScandalChance` som riktig händelse | 1,5 | Fältet finns. En skandal som sänker `quality` i tre turer gör grade-valet till det beslut §5.1 beskriver |
| 3 | Krisvalet PUSH / BACK DOWN / SELL THE FILE | 1,5 | Öppnar två spärrade slutvillkor på en gång och är spelets mest dramatiska ögonblick |
| 4 | Råvaruspår (5 st) | 2 | Gör prissättning tvådimensionell, ger `MARKET` innehåll, ger embargo tänder |
| 5 | Andra fronten + `OCTOBER` | 2 | Gör `heat` till ett val och attribution till en konsekvens |
| 6 | Namngivna tjänstemän med minne | 3 | Gör muta till investering, `INTEL` till riktade operationer, epilogen till en berättelse |
| 7 | `FUND_COUP` | 2 | Tre systemeffekter som alla har fält i modellen redan |
| 8 | Historiska fördrag som klocka | 3 | Något att planera mot utan en förhandlingsmeny |
| 9 | Scenarioarv (`CAPITAL`/`REACH`/`SHADOW`/`RESTRAINT` → startvillkor) | 4 | Gör kampanjen till sex scenarier i stället för 176 kvartal |
| 10 | `ASSASSINATE` | 2/3 | Sist. Saknar en systemeffekt som skiljer den från en dyr muta |

---

## 7. Vad jag skulle akta mig för

**Fällan: fler system innan de befintliga betalar.** Rapport 1 visar att etapp 1 byggde tretton
resolve-steg och kopplade in ungefär åtta. Frestelsen efter etapp 1,5 är att hoppa direkt till
andra fronten och kupperna, eftersom de är roligare att specificera. Motmedlet är härnessen:
kör den efter varje block och kräv att någon måltabellsrad *rör sig*. Ett system som inte
ändrar en enda fördelning har inte byggts, bara skrivits.

**Fällan: måltabellen som facit.** Specen 7.3 varnar själv för det, och P10 hanterade det
föredömligt genom att revidera tre rader med motivering. Men rapport 1, 5.1 visar det
motsatta problemet: **hela tabellen stämmer medan spelet inte fungerar.** Tabellen mäter inte
marknadsandel, inte hur ofta rivaler vinner, inte om `reliability` betyder något. Utöka den
med tre rader innan etapp 2 (förslag i rapport 3, avsnitt 7).

**Fällan: att fixa balans genom att skruva tal.** Fyra av rapport 1:s sju balansfynd går inte
att laga i `balance.json` — de kräver kod (`supplyCostIndex`, `unitsPerLineTurn`,
`gradeScandalChance`, `militaryBudget`-golvet). P10 upptäckte samma sak för tre måltabellsrader
och hanterade det rätt. Regeln att dra av det: **när ett balanspass säger "strukturellt
ouppnåeligt" tre gånger är det en kodbeställning, inte en tabellrevision.**

**Fällan: att tro att ändringsloggen är underhåll.** Den är projektets mest värdefulla
tillgång. 62 rader gjorde den här granskningen möjlig på en natt. Låt den aldrig bli
efterhandskonstruktion — och lägg in raden om UI-språket, som är den första riktiga luckan i
den.

---

## 8. Tidsuppskattning, grovt

Räknat i promptar av samma storlek som P0–P12 (en commit var, ett `Klart när`-villkor var).

| Etapp | Promptar | Kommentar |
|---|---|---|
| 1,5 — skivan som spel | 10 (P13–P22) | Se rapport 3. Inklusive ett omkört balanspass |
| 2 — bredd | 14–18 | Råvaror 4, andra fronten 4, `OCTOBER`+`SUEZ` 4, kupp 2, polish 2–4 |
| 3 — djup | 16–22 | Tjänstemän 5, fördrag 3, `WINDS` 5, prestandapass 2, epilog 3–7 |
| 4 — kampanj | 8–12 | Mest arv och metaprogression; lite ny mekanik |

Den enda siffran jag har förtroende för är den första, eftersom rapport 3 specificerar den.
De övriga är storleksordningar.

---

## 9. Den enda frågan som avgör allt

Specens avsnitt 11 och `DESIGN.md` §20 ställer den redan, och de har rätt att göra det:

> Är tjugo turer av detta spännande, och tvingar de fram minst ett beslut där lönsamhet och
> överlevnad pekar åt olika håll?

Efter etapp 1,5 går den att besvara ärligt genom att spela tio partier. Före den går det inte,
eftersom de beslut frågan handlar om ännu inte finns i koden.

Det är ett bra läge. Det vanliga misslyckandet i ett projekt som det här är att designen är
fel. Här är designen inte prövad än. Det är en mycket billigare sorts problem.
