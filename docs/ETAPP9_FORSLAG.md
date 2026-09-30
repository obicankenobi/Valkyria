# Etapp 9 — Ritbordet

**THE SEVENTH FRONT** · förslag, **inte antaget** · skrivet 2026-09-30 mot `7606322` (efter P103)

> **Tolkningar i den här körningen.** Skrivet i en schemalagd körning medan ägaren sov. (1)
> Etappen utgår från ETAPP7 §16 ("ett nytt forskningssystem med kännbara effekter") och RAPPORT3
> §3/§6. (2) Promptnumren fortsätter efter etapp 8:s sista (P105), trots att P104 och P105 ännu
> inte är gjorda. (3) Ägarbesluten har rekommendationer men är inte fattade. (4) Etappen bör inte
> startas förrän P104 (balanspasset) är klart, eftersom forskningen ändrar balansen igen.

Etapp 8 gjorde pengarna läsbara. Etapp 9 gör tiden till en resurs: det du bygger på ritbordet i
dag avgör vad du kan sälja om två år. I dag finns det inget sådant beslut. Nästan allt är upplåst
från start, och det enda forskningen kan låsa upp är en kärnvapengranat.

---

## 0. Premisskontroll

Kontrollerat mot koden vid `7606322`. En kodsession ska göra om kontrollen före första prompten
och stanna om något inte stämmer.

| # | Påstående | Källa |
|---|---|---|
| 0.1 | Huset startar på `techLevel` 4 i alla kategorier och 7 i sin specialisering (`techLevelDefault` 4, `techLevelSpecialisationBonus` 3). | `indochina-slice.json`, `state.ts` |
| 0.2 | Av sju produkter kräver sex `techRequired` ≤ 4. Den sjunde, `Mk-9 "Longhand"` (restricted), kräver 8. **Sex av sju produkter är upplåsta från tur 1.** | `products.json` |
| 0.3 | `techLevel` läses mekaniskt på ett enda ställe för huset: diskvalificeringsgrinden i `bidding.ts` (`techRequired > techLevel`). En nivå över kravet ger ingenting. | `bidding.ts`, P85-fyndet |
| 0.4 | `REPRIORITISE_RND` kostar en handling och lägger ett projekt i kön. Varje projekt tar `rndProjectTurns` (6) turer och kostar `rndOverhead` (120 000) per tur och projekt. Det finns inget tak för antalet parallella projekt. Valideringen kontrollerar bara att kategorin finns. | `applyActions.ts`, `economy.ts`, `validateAction.ts` |
| 0.5 | `staff.chiefEngineer` är kommenterad som "R&D-hastighet" men läses av ingen kod. En anställd chefsingenjör gör ingenting. | `types.ts:226`, sökning |
| 0.6 | DESIGN.md §3 lovar att specialiseringen ger "billigare R&D och +10 % anbudsstyrka i kategorin". För spelaren finns bara de +3 nivåerna vid start. Rivalerna har en specialiseringsbonus i prissättningen (`rivalSpecialisationBonus`). | DESIGN.md §3, `pricing.ts:170` |
| 0.7 | Rivalhusen har ingen `techLevel` och bjuder på allt oavsett teknik. | `rivals.json`, `bidding.ts` |
| 0.8 | Faktionernas `techLevel` sätts vid start och skrivs aldrig igen. Köparna moderniseras aldrig. `orders.ts` läser den för vad en MODERNISE-tjänsteman efterfrågar. | sökning, `orders.ts:472` |
| 0.9 | `computeScore` (`pricing.ts`) är orörd sedan etapp 5 (skyddsräcke 2). Tillägg läggs efter anropet, som BROKER-bonusen i P57. | `bidding.ts`, CLAUDE.md |
| 0.10 | ETAPP8 lämnade R&D-kön som stående order till etapp 9 (ETAPP8 §10). | `ETAPP8_FORSLAG.md` |

**Slutsats.** Forskning är i dag en kostnad utan motprestation, utom för den som vill ha
kärnvapengranaten. Ingen köpare vill ha något nytt, ingen rival hinner ifatt och ingen nivå över
kravet ger ett bättre bud.

---

## 1. Frågan etappen ska besvara

**Fattar spelaren minst ett beslut per parti där pengar nu står mot försprång senare?**

Tre delfrågor gör den mätbar:

1. **Värde:** Vinner en spelare som forskar klart oftare än en som inte gör det, räknat över hela partiet?
2. **Val:** Finns det mer än en rimlig forskningsväg, så att två spelare kan välja olika och båda klara sig?
3. **Pelare 1:** Blir kärnvapengranaten ett beslut med en synlig kostnad, inte bara en produkt till?

---

## 2. Ägarbeslut (ej fattade)

| | Fråga | Rekommendation |
|---|---|---|
| **9A** | Etappens namn | "Ritbordet" |
| **9B** | Hur ska forskningen få något att låsa upp? | **En andra generation** per kategori (sex nya produkter, `techRequired` 5–7) i stället för att sänka startnivån. Dagens produkter och deras balans står kvar. |
| **9C** | Får golden frysas om utan att fråga i de prompter som ändrar regler? | **Ja, bara i P106, P107, P108 och P109**, var och en i egen commit, samma sorts förhandsauktorisering som 8C. |
| **9D** | Ska en nivå över produktens krav ge ett bättre bud? | **Ja, en teknikterm efter `computeScore`**, högst två nivåer över kravet. Samma term i `bidEstimate` och `playerWinCurve` (en formel, en källa). |
| **9E** | Hur ska forskningen styras? | **Som en fjärde stående order** (forskningsprioritet per kategori, kostar ingen handling). `REPRIORITISE_RND` blir ett **krasprogram**: halva tiden, dubbel kostnad, kostar en handling. |
| **9F** | Ska kärnvapengranaten lämna spår? | **Ja.** Ett färdigt restricted-projekt ger en rubrik, en `heat`-höjning och en rad i krönikan, och kan läcka (`LEAK` mot huset). |
| **9G** | Ska rivalerna och köparna utvecklas? | **Ja, enkelt.** Rivalerna får en `techLevel` som stiger enligt ett fast schema per specialisering. Köparnas `techLevel` stiger när en front förlorat materiel länge. Ingen egen forskningsmodell för dem. |
| **9H** | Ett nytt verb för industrispionage (stjäla ritningar)? | **Nej.** De 22 verben räcker. `LEAK` och `TURN` kan få en teknikeffekt i en senare etapp. |

---

## 3. Del 9A — Teknik som betyder något (P106–P107)

### 3.1 Teknikmarginal i budet (P106)

- Ny term `techTerm` i `bidding.ts`, adderad **efter** `computeScore` (0.9):
  `techTerm = techMarginWeight × min(2, techLevel − techRequired)`, bara för nivåer över kravet.
- Samma term i `bidEstimate` och `playerWinCurve`, så att det spelaren ser är det som gäller.
  Det ändrar `winBand`s *värden* men inte hur bandet samplas.
- Spelarens specialisering får det DESIGN.md §3 lovar (0.6): +10 % anbudsstyrka i kategorin, som
  en egen term efter `computeScore`, och lägre `rndOverhead` i kategorin.
- Nya balanstal i `balance.json`, provisoriska till P113. Golden fryses om (**9C, P106**).

### 3.2 En andra generation, och köpare som moderniseras (P107)

- **Sex nya produkter**, en per kategori, med `techRequired` 5–7, högre `baseCost` och bättre
  marginal än första generationen. Namnen är fiktiva och generiska (DESIGN.md §15), till exempel
  "M-4 Self-Loading Rifle" och "155mm Field Howitzer, Self-Propelled". Ägaren godkänner listan.
- **Köparna moderniseras:** en faktions `techLevel` i en kategori stiger med 1 när fronten har
  förlorat materiel i den kategorin i `modernisationPressureTurns` turer i följd. Det är en
  tröskeljämförelse utan slump, samma princip som frontstatus i P59. Den skrivs i `factions.ts`
  med en `WireEvent` (hård regel 4).
- Ordrar efterfrågar den nyaste generation köparen behärskar. Första generationen finns kvar hos
  köpare som ligger efter. Därmed tappar en spelare som aldrig forskar marknad under andra halvan
  av partiet.
- Golden fryses om (**9C, P107**).

---

## 4. Del 9B — Forskningen som beslut (P108–P109)

### 4.1 Forskningsprioritet som stående order (P108)

- Ny variant i `StandingOrderChange`: `research`, med en kategori och en takt (*låg*, *normal*,
  *hög*) som styr kostnad per tur och tid till nästa nivå. Kostar ingen handling (ETAPP8
  skyddsräcke 6). Högst ett aktivt forskningsspår per kategori.
- `staff.chiefEngineer` får sin första läsare (0.5): över en tröskel kortas varje projekt med en tur.
- `REPRIORITISE_RND` blir **krasprogram**: halverar återstående tid för ett pågående spår mot
  dubbel kostnad. Det kostar en handling, som i dag.
- Ett larm till anslagstavlan (P101): en kategori där köparna har gått förbi husets nivå.
- Golden fryses om (**9C, P108**).

### 4.2 Rivalerna och kärnvapengranaten (P109)

- `RivalHouse.techLevel` med startvärden och ett fast schema per specialisering i `rivals.json`.
  Rivaler bjuder inte på produkter över sin nivå, med samma grind som huset.
- Restricted-forskning (9F): när ett projekt låser upp en restricted-produkt emittas en rubrik,
  `heat` i husets hemteater stiger och krönikan får en post. Om en station är exponerad kan
  projektet läcka nästa tur. Det ger `Mk-9` en synlig kostnad innan den första granaten levereras.
- Golden fryses om (**9C, P109**).

---

## 5. Gränssnittet (P110–P111)

Etapp 7:s regler 1–18 gäller oförändrade. Registret är krigsrummet 1965.

- **Ritbordet (P110)** är en ny panel i THE COMPANY: ett ritbord med en blåkopia per kategori.
  Varje blåkopia visar nuvarande nivå, nästa generations produkt i blyerts och hur många turer som
  återstår. Ett färdigt projekt får stämpeln "APPROVED FOR PRODUCTION". Forskningsspåret ställs in på
  blåkopian med `Segmented` (takt), och krasprogrammet är en egen knapp med kostnaden utskriven.
- **Köparnas nivå** syns som en blyertsmarkering på blåkopian: "RVN FIELDS GEN 2 FROM Q3 1966". Utan
  station är markeringen ett frågetecken (samma `effectiveDepth`-grind som `formationDisplay`).
- **CONTRACTS (P111):** budmappen visar teknikkravet och husets marginal över det, och
  vinstchansen räknas med teknikterm. Rivalernas nivå syns i rivalakten i CONTACTS, grindad av
  underrättelse.
- Varje UI-prompt avslutas med `npm run shots` och regel 18/11 i CI.

---

## 6. Härnessen, måltabell och balans (P112–P113)

**P112 (härnessen, ingen `core`-ändring):** `human` sätter forskningsspår i den kategori där flest
öppna ordrar kräver mer än husets nivå. Ny variant `human-noresearch` som aldrig forskar, som
jämförelse. Nya kolumner: slutnivå per kategori, andel ordrar efter tur 12 som kräver generation 2,
forskningskostnadens andel av utgifterna, `Mk-9` upplåst (ja/nej) och tur.

**Måltabell (P113 mäter och reviderar, samma regler som tidigare balanspass):**

| Rad | Mål | Fetstilt |
|---|---|---|
| `human` mot `human-noresearch`, vinstfrekvens | minst 15 procentenheter högre | **ja** |
| `human`: `SCENARIO_COMPLETE` | 40–70 % (oförändrat från ETAPP8 §7.2) | **ja** |
| Andel ordrar efter tur 12 som kräver generation 2 | 30–60 % | **ja** |
| Kategorier som `human` forskar i, över 200 partier | minst tre olika, ingen över 60 % av alla spår | |
| `human` slutför minst två forskningsnivåer | > 70 % av partierna | |
| Partier där `Mk-9` låses upp, högsta doomsday mot övriga | minst 10 högre | **ja** (pelare 1) |
| Rivalbud diskvalificerade av teknik | 5–25 % av rivalbuden efter tur 10 | |

`balance.frozen.json` fryses om sist i etappen, som tidigare.

**P114 — Speltest. Ingen kod.** Tre partier på telefon. Frågan i §1 och de tre vanliga.

---

## 7. Skyddsräcken

1. **`computeScore` rörs inte.** Teknik- och specialiseringstermerna läggs efter anropet.
2. **Golden fryses bara om i P106–P109**, i egen commit, efter verifiering att ändringen är den
   prompten beskriver. Annars gäller "stanna och fråga".
3. **En formel, en källa.** `bidEstimate`, `playerWinCurve` och `bidding.ts` läser samma teknikterm.
   Ett test underkänner om de skiljer sig.
4. **Inga dolda tal i gränssnittet.** Köparnas och rivalernas nivå grindas genom underrättelse.
5. **Forskning kostar aldrig en handling utom som krasprogram.** Blir det frestande, stanna och fråga.
6. **Spelbarhetstestet ska vara grönt efter varje prompt som rör kärnan.** Om RAPPORT4 §3:s tak
   har lagts till gäller även det.

---

## 8. Promptsekvens

**9A — Teknik som betyder något**
- **P106 — Premisskontroll och teknikterm.** §0 om, sedan §3.1. *Klart när:* termen är samma i alla
  tre anropen (testat), och golden är omfryst.
- **P107 — Andra generationen och köpare som moderniseras.** *Klart när:* en köpare efterfrågar
  generation 2 i minst ett parti per botpolicy, och golden är omfryst.

**9B — Forskningen som beslut**
- **P108 — Forskning som stående order, chefsingenjören, krasprogram.** *Klart när:* varje del har
  ett test, och golden är omfryst.
- **P109 — Rivalernas teknik och restricted-spår.** *Klart när:* rivalbud diskvalificeras av teknik
  i minst ett parti, `Mk-9`-projektet ger rubrik och heat, och golden är omfryst.

**9C — Gränssnittet**
- **P110 — Ritbordet.** *Klart när:* ett forskningsspår går att sätta, ändra och krasa från
  ritbordet på 390×844. Golden orörd.
- **P111 — Teknik i budmappen och rivalakten.** Golden orörd.

**9D — Balans**
- **P112 — Härnessen.** Ingen `core`-ändring.
- **P113 — Balanspasset.** Bara data. `balance.frozen.json` sist.
- **P114 — Speltest.** Ingen kod.

Nio prompter. 9A och 9B är kärnan. Om etappen behöver kortas stryks restricted-spåret i P109 först.

---

## 9. Medvetet utanför etappen

- Ett verb för industrispionage (9H).
- En egen forskningsmodell för rivaler och köpare. Scheman och trösklar räcker.
- Nya scenarier, fler köpare och en reagerande rival (RAPPORT4 §4). De passar i senare etapper.
- Produktlinjer som byggs om för en ny generation ("retooling" finns redan i begränsad form). Om
  generation 2 visar sig kräva det, är det ett fynd för P107 att stanna på.

---

## 10. Öppna beslut för ägaren

1. Besluten 9A–9H i §2.
2. **Ordningen:** P104 (balanspasset i etapp 8) bör köras först, och gärna ett gemensamt speltest
   för etapp 7 och 8 (RAPPORT4 §4). Etapp 9 flyttar balansen igen, så P104 kan hållas lätt.
3. **Produktlistan för generation 2** godkänns av ägaren innan P107.
