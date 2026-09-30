# Etapp 9 — Ritbordet

**THE SEVENTH FRONT** · **ANTAGEN 2026-09-30** · skriven mot `e7b655d` (efter P104), del E tillagd samma dag

> **Status:** antagen av ägaren 2026-09-30. Besluten 9A–9L fattades enligt rekommendationerna, och
> tre nya beslut (9M–9O) fattades för del E, Upphandlingen. Allt är loggat i `ANDRINGSLOGG.md`. Del A–E
> är etappens kärna; del F kan brytas ut till en egen etapp (9A). Premisskontrollen i §0 görs om mot
> koden före P106. Rekommendationen att köra P105 (speltestet av etapp 8) först står kvar i §14.

> Ersätter de två tidigare utkasten från samma dag. Del E (upphandlingen) lades till efter ägarens fråga om
> utvecklingsupphandlingar med kravspecifikationer, konkurrens mellan husen och möjligheten att fuska. Ägaren bad om en etapp där forskning,
> produktutveckling och innovation blir dynamiska, anpassningsbara efter spelstil och avgörande
> för partiet: en bra produkt ska kunna lyfta huset, en medioker ska inte göra det. Kalla krigets
> kapplöpning ska driva innovationen. Förslaget bygger på en genomgång av koden, av tre
> researchrapporter (spel med forskningsmekanik, bräd- och krigsspel, och den verkliga
> vapenindustrin 1955–1975) och av tidigare granskningar (RAPPORT3, RAPPORT4). Historiska
> förebilder och källor finns i bilaga A. Allt i spelet förblir fiktivt (DESIGN.md §15).

---

## Innehåll

0. Premisskontroll · 1. Frågan · 2. Designprinciper · 3. Ägarbeslut ·
4. Del A, grunden · 5. Del B, konstruktionen · 6. Del C, fältet · 7. Del D, kapplöpningen ·
8. Del E, upphandlingen · 8b. Del F, huset och staten · 9. Gränssnittet · 10. Härness, måltabell, balans ·
11. Skyddsräcken · 12. Promptsekvens · 13. Utanför etappen · 14. Öppna beslut ·
Bilaga A, förebilder och källor

---

## 0. Premisskontroll

Kontrollerat mot koden vid `e7b655d`. En kodsession ska göra om kontrollen före P106 och stanna
om något inte stämmer.

| # | Påstående | Källa |
|---|---|---|
| 0.1 | **En order anger exakt en produkt** (`Order.productId`). Alla hus som bjuder levererar samma generiska produkt. | `types.ts` (`Order`), `orders.ts` `bestEligibleProduct` |
| 0.2 | Ett bud skiljer sig bara i pris, leveranstid, kvalitetsklass (A/B/C) och muta. `computeScore` väger pris, leverans, relation, muta, rykte och blockterm. **Ingen term handlar om produkten.** | `types.ts` (`Bid`), `pricing.ts` |
| 0.3 | Kvalitetsklassen ger bara lägre styckkostnad och högre skandalrisk (A 0 %, B 4 %, C 14 %). | `balance.json` |
| 0.4 | `reputation.quality` ändras bara av skandaler. Bra leveranser bygger inget rykte. | `deliveries.ts:201`, `:334` |
| 0.5 | Rivalerna bjuder alltid på en underförstådd klass A. De har ingen egen produkt och ingen teknik. | `pricing.ts:164`, `rivals.json` |
| 0.6 | Huset startar på `techLevel` 4 (7 i specialiseringen). Sex av sju produkter kräver ≤ 4. Forskning låser bara upp `Mk-9 "Longhand"`, och `techLevel` läses bara av diskvalificeringsgrinden. | `products.json`, `state.ts`, `bidding.ts` |
| 0.7 | `staff.chiefEngineer` läses av ingen kod. Spelarens specialiseringsbonus ur DESIGN.md §3 är obyggd. | sökning, DESIGN.md §3 |
| 0.8 | Levererad materiel fördelas på förband efter doktrin och styrka. **Antal räknas, inte produktens kvalitet.** `Front.attribution` bokför vilket hus som levererat. | `deliveries.ts` |
| 0.9 | Förband har doktrin. Faktionernas `techLevel` skrivs aldrig efter start. Blocktillhörighet finns (`Faction.alignment`, −100 öst … +100 väst), liksom husets `homeState`. Supermakterna finns inte som aktörer. | `types.ts`, `indochina-slice.json` |
| 0.10 | Byggt och återanvändbart: omställning av linjer (`retoolingTurns`), genombrott och omgruppering (P82), `EMBARGO`, `LEAK`/`TURN`/`SABOTAGE`, `counterIntelligence`, `scandalRisk`, stående order (P100), huvudboken (P96), krönikan (P89), styrelsens PM (P97). | respektive fil |
| 0.12 | **Korruption lämnar inga spår.** Mutan i ett bud (`Bid.bribe`) höjer poängen mot tjänstemän med låg integritet men ger ingen upptäcktsrisk. `BRIBE` och `BROKER` höjer `Official.scandalRisk`, men ingen kod läser fältet. P62 noterade att en utlösare för att en tjänsteman faller saknas. | `pricing.ts:236`, `political.ts:321`, `applyActions.ts:597`, sökning |
| 0.13 | Rivalhusen har `temperament` och `aggression` men inget beteende utöver prissättning. | `rivals.json` |
| 0.11 | Läget efter P104: `human` vinner 67 %, spelbarhetstestet har golv (30 %) och tak (90 %), och `capacity` är referensmätare. | `ANDRINGSLOGG.md` 2026-09-30 |

**Slutsats.** Spelet har ingen produkt som är *husets*. Så länge alla säljer samma gevär kan en bra
konstruktion inte lyfta huset, och forskningen blir ett upplåsningssystem utan något att låsa upp.
Etappen ger huset egna konstruktioner, låter fältet avgöra hur bra de är och låter blockens
kapplöpning bestämma vad som efterfrågas.

---

## 1. Frågan etappen ska besvara

**Kan en produkt avgöra ett parti?**

1. **Lyft:** Vinner ett hus med en lyckad konstruktion klart oftare än ett med en misslyckad?
2. **Spelstil:** Kan minst två olika inriktningar (till exempel robust och billig mot avancerad och dyr) båda vinna?
3. **Dynamik:** Tvingar kapplöpningen huset att fortsätta utveckla, eller räcker en tidig framgång?
4. **Spårbarhet (pelare 2):** Går en framgång eller ett haveri att spåra bakåt till ett beslut på ritbordet?
5. **Pelare 1:** Tjänar huset på att kapplöpningen går fort, och syns det i doomsday?
6. **Rent eller smutsigt:** Är både ett ärligt och ett korrupt hus spelbara vägar, med olika risker?

---

## 2. Designprinciper

Hämtade ur researchen och ur projektets egna erfarenheter. De gäller hela etappen.

1. **Egenskaper, inte upplåsningar.** Forskning ska ge något med värden och avvägningar, aldrig bara
   "nu får du sälja X". Att bara låsa upp är det vanligaste sättet att göra forskning tråkig.
2. **Osäkerhet som går att köpa bort.** Dold kvalitet är bara roligt om spelaren kan betala för att veta
   mer: provning, fältprov, underrättelse. Slump som spelaren inte kan påverka är ett straff.
3. **Visa vad som påverkas, inte hur mycket.** Varje kort och beslut markerar vilka mätare det rör
   (doomsday, heat, kassa, rykte) utan exakta tal, som i *Reigns*. Kvaliteten visas som ett
   intervall som smalnar av över tid.
4. **Ingen skötsel varje tur.** Livscykler och utfasning sker av sig själva, som när kraftverken
   försvinner i *Power Grid*. Stående order styr forskning och produktion. Inget kräver ett tryck
   per produkt och kvartal.
5. **Att följa efter är billigare än att leda.** Den som ligger efter kommer ikapp billigare genom
   licens, spionage eller demontering. Det håller ledaren på tå och förhindrar att den som leder
   drar ifrån för gott.
6. **Ett system i taget.** Varje nytt system införs med ett daterat PM i spelet, som reglerna i
   *Papers, Please*, inte allt på tur 1.
7. **Kort för detaljerna, en tavla för överblicken.** Högst en kapplöpningstavla. Resten ligger på
   kort och i mappar, så att telefonen inte blir en instrumentbräda.
8. **Allt i världen går att spåra.** Varje effekt ger en `WireEvent` med `causeId` (hård regel 4) och
   kan hamna i krönikan.

---

## 3. Ägarbeslut (fattade 2026-09-30)

| | Fråga | Beslut |
|---|---|---|
| **9A** | Omfång | **Del A–E är etapp 9.** Del F (§8b) är andra halvan och kan brytas ut till en etapp 10 om etappen blir för stor. Kapningsordningen står i §12. |
| **9B** | Egna konstruktioner som varianter eller nya produkter? | **Varianter.** En konstruktion bygger på en basprodukt och bjuds på dess ordrar. `Order` skrivs inte om. |
| **9C** | Golden | Förhandsauktoriserad omfrysning **bara i promptar märkta "regel"** i §12, var och en i egen commit efter verifiering att ändringen är den prompten beskriver. |
| **9D** | Dold verklig kvalitet? | **Ja**, visad som ett intervall ("B±1") som smalnar av genom provning och fält. |
| **9E** | Produkten i striderna? | **Ja, högst ±25 %** på levererad materiel. |
| **9F** | Rivalernas konstruktioner | **Enkla**, enligt schema per rival och specialisering. Ingen egen forskningsmodell. |
| **9G** | Nya verb | **Två:** `FIELD_TRIAL` (§6.4) och `REVERSE_ENGINEER` (§6.5). Allt annat styrs via ritbordet och stående order. |
| **9H** | Blockens kapplöpning som dolda tal med underrättelsebedömningar? | **Ja.** Falska gap är en av de starkaste idéerna i förslaget (§7.3). |
| **9I** | Hemstatens betydelse (väst/öst/neutral) | **Stor:** den avgör vilka upphandlingar huset får delta i (§8.1), exportregler och vilka block huset lagligt får sälja till (§8b.1). |
| **9J** | Civil gren | **Ja** (§8b.2). Den prövar pelare 1:s andra halva. |
| **9K** | Namngivna chefskonstruktörer | **Ja** (§8b.3), som förlängning av etapp 5:s tjänstemän. |
| **9L** | Namnmall för konstruktioner | Husets initialer + beteckning + år + typ, till exempel "H&V M64 Field Gun". |
| **9M** | Hur långt får fusket i upphandlingarna gå? | **Alla sex knepen** (§8.2), från kravpåverkan till förfalskade protokoll. Pappersspåret gör de grövsta dyrast. |
| **9N** | Ska mutan i vanliga bud också lämna ett pappersspår? | **Ja.** All korruption kan komma fram (§8.3). Golden fryses om i den prompten. |
| **9O** | Hur görs upphandlingsdragen? | I upphandlingsmappen. Varje knep och motköp kostar en handling och är en ny `PlayerAction`-typ, `PROCUREMENT`, med en op per knep. Det utökar 9G; anmälan och inlämning av prototyp kostar ingen handling. |

---

## 4. Del A — Grunden (nära till hands)

Små ändringar i befintliga system. Stannar etappen efter del A är forskningen ändå märkbart bättre.

### 4.1 Teknik över kravet ger ett bättre bud
En term läggs till efter `computeScore` (skyddsräcke 2, som BROKER-bonusen i P57):
`techTerm = techMarginWeight × min(2, techLevel − techRequired)`. Samma term används i `bidEstimate`
och `playerWinCurve`.

### 4.2 Specialiseringen gör det DESIGN.md lovar
+10 % anbudsstyrka i den egna kategorin (term efter `computeScore`) och halverad forskningskostnad där.
Specialiseringen blir ett stilval, inte bara tre gratisnivåer.

### 4.3 Kvalitet bygger rykte, per kategori
- `reputation.quality` delas upp per kategori ("känt för artilleri").
- Fullgjorda kontrakt i klass A höjer ryktet något, med ett tak. Klass C sänker det något även utan
  skandal.
- Valet av klass blir marginal nu mot rykte senare.

### 4.4 Erfarenhet ger forskningsförsprång
Leveranser till en aktiv front i en kategori ger forskning i den kategorin ett litet försprång. En
förlorad upphandling med genomgång ger försprång i den egenskap som avgjorde den. Förebilden är
Civilizations *eurekas*: forskningen blir en följd av det huset gör, inte en separat timer.

### 4.5 Forskning som stående order
- Varje kategori kan få ett forskningsspår i takten låg, normal eller hög. Det kostar ingen handling
  (ETAPP8 skyddsräcke 6).
- `REPRIORITISE_RND` blir ett **krasprogram**: halverad tid mot dubbel kostnad, och huset kan inte
  bjuda i kategorin nästa kvartal. Kostnaden för att rusa är konkret, som när en faktion i
  COIN-spelen står över nästa kort efter att ha agerat.
- `chiefEngineer` får sin första läsare: kortare projekt och lägre risk för brister.

---

## 5. Del B — Konstruktionen

Här blir produkten husets egen.

### 5.1 Typbladet
Ett färdigt projekt ger en **konstruktion**:

```
Design {
  id, name            "H&V M64 Field Gun" (beslut 9L)
  baseProductId       vars ordrar den kan bjudas på (9B)
  generation          1, 2, 3 … (kopplad till kapplöpningen, §7)
  performance 0–100   stridsvärde
  reliability 0–100   hur ofta den fungerar
  unitCostFactor      produktionskostnad mot basprodukten
  trueQuality         DOLD; visas som intervall (9D)
  latentFlaw          valfri, dold: villkor + effekt (§5.3)
  fieldRecord         fältrykte (§6.2)
  lineage             föregångare, om uppgradering (§5.5)
  introducedTurn
}
```

Högst tre synliga egenskaper. Fler reglage gör valen svåra att överblicka, vilket spelare ofta klagar
på i liknande spel.

### 5.2 Uppdraget på ritbordet: inriktning och ambition
Spelaren väljer två saker innan ett projekt startar:

- **Inriktning:** robust och billig, balanserad eller avancerad. Den styr hur egenskaperna fördelas.
  Det är här spelstilen väljs.
- **Ambition:** tidsenlig, framskjuten eller före sin tid. Varje steg framåt förbi det som är
  tidsenligt (kopplat till blockens generation, §7.1) ger högre värden men längre tid, högre kostnad och
  större risk för brister. Förebilden är Hearts of Iron IV: man får forska före sin tid, men det kostar.
  Resultatet blir realistiskt utan hårda spärrar.

Utfallet dras med `ctx.rng` ur ett spann som beror på ambition, takt, chefskonstruktör och husets
erfarenhet. Det kan bli ett genombrott, en gedigen konstruktion eller en med en dold brist.

### 5.3 Dold kvalitet och brister som hör till en miljö
- Den verkliga kvaliteten visas som en klass med osäkerhet ("B±1").
- **Provning i egen regi** (en stående order, kostar pengar och tid) minskar osäkerheten.
- **Brister kan höra till en miljö:** monsunfukt, djungel, minor eller slitage vid hög takt. De syns
  inte vid provning i fel miljö. Förebilderna är M16-geväret, som började klicka i Vietnam 1966, och
  stridsvagnen M551 Sheridan, vars lätta pansar inte klarade minor 1969.
- En miljöbrist visar sig först på en front med rätt miljö.

### 5.4 Köparna väger olika, och jämför med det bästa de fått
- Varje köpare har en dold **preferensmix**, härledd ur det som finns: MODERNISE väger prestanda,
  AUSTERITY väger kostnad, en front som förlorar väger prestanda högre, och förbandens doktrin avgör
  vilka kategorier som väger tyngst.
- Underrättelse avslöjar mixen: med en station står den i landsakten, utan station är den okänd.
- **Bedömningen är relativ:** en konstruktion jämförs med den bästa köparen redan erbjudits, inte mot
  en fast skala. När rivalerna hinner ikapp krymper husets försprång av sig självt, utan extra regler.
  Förebilderna är Production Line och Game Dev Tycoon.

Det finns alltså ingen bästa konstruktion för alla, och det besvarar delfråga 2.

### 5.5 Uppgradera eller börja om
- **Uppgradering (A1):** billigare och snabbare. Den ärver föregångarens fältrykte, både gott och
  dåligt.
- **Ny konstruktion:** dyrare, men ryktet nollställs och taket blir högre.
- **Uppgraderingssatser** till köparnas befintliga materiel ger lägre marginal men snabbare affärer.
  Förebilden är den brittiska L7-kanonen, som konstruerades för att passa i Centurion-vagnens
  befintliga torn.

Omställningen av produktionslinjer (redan byggd) gör att en ny konstruktion alltid kostar kapacitet.

### 5.6 Olycksfåglar
Rapporter från fältet följs av en utredning (`WireEvent`, krönikan). Spelaren väljer:

| Val | Kostnad | Risk |
|---|---|---|
| **Åtgärda i fält** | pengar och omställning | liten |
| **Förneka och fortsätta** | ingen nu | ryktet sjunker per leverans, en tjänsteman tappar anseende, större skandal om det kommer ut |
| **Konstruera om** | nytt projekt med kortare tid (huset har lärt sig) | tid utan produkt |

Förebild: M16-utredningen i USA:s representanthus 1967 och åtgärderna efteråt.

---

## 6. Del C — Fältet

Här påverkar produkten kriget, och kriget påverkar produkten.

### 6.1 Kvalitet i striden
Materiel från en konstruktion får en multiplikator på högst ±25 % i `fronts.ts` (9E). Antalet räknas
fortfarande, men tio bra kanoner väger mer än tio dåliga.

### 6.2 Fältrykte och "stridsbeprövad"
- `Front.attribution` vet vilket hus som levererat. När förband med husets materiel vinner ett
  genombrott eller håller en sektor under press får konstruktionen ett fälttillfälle.
- Efter tillräckligt många fälttillfällen blir konstruktionen **stridsbeprövad**. Stämpeln syns i
  budmappen hos alla köpare och ger en rubrik ("THE H&V M64 HELD AT AN LOC"). Förebilden är
  Mirage III, vars framgångar 1967 fick Israel att beställa en variant innan prototypen hade flugit.
- **Familjerykte:** ju fler köpare som använder en konstruktionsfamilj, desto lägre tröskel för nästa
  köpare. Förebilden är det belgiska FN FAL-geväret, som användes i över 90 länder.
- **Flaggskeppet:** husets bäst ansedda konstruktion ger en liten ryktesbonus i alla kategorier. Det är
  lyftet ägaren beskriver.
- En olycksfågel vid ett nederlag ger den omvända rubriken, och köparen skyller på leverantören.

### 6.3 Livscykeln sker av sig själv
- En ny konstruktion har ett nyhetsvärde som avtar.
- Rivalernas konstruktioner (9F) kommer enligt schema och syns med underrättelse.
- När en generation fasas ut av kapplöpningen (§7.1) förlorar äldre konstruktioner behörighet
  automatiskt. Spelaren behöver aldrig "pensionera" något för hand.

### 6.4 Fältprov (`FIELD_TRIAL`, nytt verb)
Huset lånar ut en mindre sats av en konstruktion till en köpare för prov i fält, till självkostnad.
- **Vad det ger:** intervallet smalnar av snabbt, fältrykte kan börja byggas, och huset får en bonus i
  köparens nästa upphandling.
- **Vad det kostar:** resultatet blir känt för alla. Rivalerna ser din konstruktions verkliga
  kvalitet, som när ett kort i COIN-spelen alltid har två sidor.
- **Krav:** en tjänsteman med relation över ett golv.

Förebilder: 1 000 AR-15 till sydvietnamesiska förband 1962, och flygplanet A-37 som prövades i
strid 1967.

### 6.5 Fångad materiel och kopiering (`REVERSE_ENGINEER`, nytt verb)
- **Åt ena hållet:** vid ett genombrott kan motståndaren ta husets materiel. En rival på andra sidan
  får då en chans att kopiera konstruktionen efter några turer.
- **Åt andra hållet:** köpare kan överlämna fiendens erövrade materiel. Med `REVERSE_ENGINEER` ger den
  ett forskningsförsprång mot just den konstruktionen. Flera exemplar ger snabbare resultat.

Förebilder: den sovjetiska kopian K-13 av en amerikansk Sidewinder-robot som fastnat i ett kinesiskt
plan 1958, och Israels operationer Diamond (1966) och Rooster 53 (1969).

### 6.6 Motmedel
En stark konstruktion i en kategori skapar efterfrågan på dess motmedel hos andra sidan: pansar ger
pansarvärn, flyg ger luftvärn, luftvärn ger störsändare. Forskningsprojekt kan riktas mot ett
namngivet fiendesystem.

Förebilden är luftvärnsroboten SA-2, som sköt ner ett amerikanskt plan i juli 1965. USA svarade med
Wild Weasel-planen i november samma år och Shrike-robotarna 1966.

---

## 7. Del D — Kapplöpningen

Kalla krigets kapplöpning är motorn som gör att innovation aldrig tar slut. Den bygger på blockens
generationer, underrättelsebedömningar och doomsday.

### 7.1 Blockens generationer och kravkorten
- Varje block har en **generation per kategori**, ett dolt tal som stiger enligt ett historiskt
  grundschema och påskyndas av händelser.
- Nästa kvartals **kravkort** ligger synliga, som marknaden med kommande kraftverk i *Power Grid*:
  ministeriernas kommande krav per kategori. Spelaren ser vad som kommer och avgör om huset ska
  investera nu eller vänta.
- När ett block går upp en generation fasas den äldsta generationen ut för köpare i det blocket,
  automatiskt. Förebilden är tidsepokerna i *Brass*, där de lägsta brickorna försvinner.
- Köparnas `techLevel` följer sitt blocks generation. Det är fältets första skrivare.

### 7.2 Gap-chocker och först på plats
- När ett block tar ett kliv som det andra inte matchar blir det en **gap-chock**: en rubrik, och under
  några kvartal betalar köparna på den eftersläpande sidan överpris och högre förskott i kategorin.
- **Först på plats:** det första hus som levererar en konstruktion på den nya nivån får en varaktig
  bonus hos det blocket, och dess specifikationer blir måttstocken som rivalerna bedöms mot. Förebilden
  är milstolparna i *Food Chain Magnate*.
- **Efterföljare betalar mindre:** när en nivå redan finns i fält är det billigare att nå den (princip
  5). Ledningen lönar sig, men den räcker inte för evigt.

### 7.3 Bedömningar, inte sanningen: falska gap
- Spelaren ser aldrig blockens generation direkt, bara en **underrättelsebedömning**: ett intervall med
  en stämpel för säkerheten ("ESTIMATE — LOW CONFIDENCE"). Stationer och deras täckning snävar in
  intervallet.
- **Köparnas budgetar följer det upplevda hotet**, inte det verkliga. En överdriven bedömning ger
  större ordrar. När sanningen kommer fram sjunker efterfrågan.
- **`LEAK` kan blåsa upp en bedömning.** Det skapar panik och ordrar, men om det avslöjas faller
  tjänstemännens förtroende och doomsday stiger.

Förebilden är "missilgapet": Sputnik och Gaither-rapporten 1957 blåste upp hotbilden, och
satellitbilder visade 1961 att USA i själva verket låg långt före.

### 7.4 Kapplöpningen och doomsday
- Varje generationsskifte och varje gap-chock lägger lite på doomsday.
- **Att sälja till båda sidorna** påskyndar kapplöpningen, eftersom motmedelskedjan (§6.6) går fortare.
  Rubriken namnger huset. Förebilden är DEFCON-mätaren i *Twilight Struggle*, där den som utlöser
  katastrofen förlorar.
- En vapenvila (etapp 5) bromsar kapplöpningen, och gap-premierna försvinner.

Det här är pelare 1 i sin tydligaste form: huset tjänar på att kapplöpningen går fort, och det är
samma fart som drar doomsday uppåt.

---

## 8. Del E — Upphandlingen

Kravkorten i §7.1 blir här konkreta upphandlingar, där husen konkurrerar öppet mot varandra om
samma krav. Del E ger också korruptionen en baksida som den saknar i dag (0.12).

### 8.1 Utvecklingsupphandlingen

En faktion, eller ett blocks ministerium, går ut med en **anbudsinfordran** i en kategori. Den utlöses
av det som redan driver efterfrågan: ett kravkort (§7.1), en gap-chock (§7.2) eller en front som länge
förlorat materiel. Målet är en till tre upphandlingar per parti.

```
Programme {
  id, buyerId, category, baseProductId
  requirements[]     kravrader: prestanda ≥, tillförlitlighet ≥, styckpris ≤, leveransår ≤
                     varje rad är ska-krav eller bör-krav, med vikt
  testEnvironment    köparens miljö: djungel, monsun, berg … (kopplat till §5.3)
  grant              forskningsanslag: 'costPlus' | 'fixedPrice' | null, belopp
  prize              seriekontrakt: kvantitet × turer, förskott enligt etapp 8
  phase              announced → specLocked → development → trial → awarded
  entrants[]         anmälda hus, spelaren och rivaler
  traces[]           pappersspår kopplade till upphandlingen (§8.3)
}
```

**Faserna:**

1. **Anbudsinfordran (ett kvartal).** Kraven är ett utkast och går att påverka (§8.2). Husen anmäler sig,
   vilket inte kostar någon handling. Du ser vilka rivaler som anmält sig, och med underrättelse hur
   långt de har kommit.
2. **Kravlåsning.** Kraven fastställs. Hemstaten avgör om huset får delta (9I): ett västanslutet hus får
   inte delta i ett östblocksministeriums upphandling, och tvärtom. Neutrala får delta överallt, men med
   lägre vikt på relationen.
3. **Utveckling (2–4 kvartal).** Huset konstruerar mot kravet på ritbordet (del B), eller anmäler en
   befintlig konstruktion. **Forskningsanslaget** betalas ut här:
   - **Kostnad plus vinst:** säker marginal, men granskning. Stora överskridanden syns.
   - **Fast pris:** hög vinst om det går bra, förlust vid fördyring.

   Förebilderna är TFX/F-111-striden 1962–68 och C-5A 1968–69.
4. **Jämförande prov.** Varje hus lämnar in en prototyp, vilket inte kostar någon handling. Provet görs i
   köparens miljö, så en miljöbrist (§5.3) kan avslöjas redan här, vilket belönar robusta konstruktioner.
   Resultatet kommer som ett **utvärderingsprotokoll** med uppmätt värde per kravrad. Uppmätt värde =
   verklig kvalitet + prototypfaktor + mätbrus, dragna med `ctx.rng`. Den som underkänns på ett ska-krav
   diskvalificeras.
5. **Tilldelning.** Poängen räknas av en egen funktion, `evaluateTrial`, som inte är `computeScore`
   (skyddsräcke 2). Den väger provpoäng per kravrad, pris, relation, rykte och motköp (§8.2). Vinnaren
   får seriekontraktet som ett vanligt `Contract`, med förskott enligt etapp 8.

**Delad order:** om tvåan ligger nära vinnaren kan ministeriet dela serien, till exempel 70/30.
Förlusten blir då inte total, och den som leder drar inte ifrån för gott. En förlorare behåller alltid
sin konstruktion och kan sälja den till andra. Ett bra provprotokoll ger ett litet rykte ("TESTED BY THE
RVN MINISTRY OF DEFENCE") även för den som förlorar.

Förebilden är proven mellan Leopard och AMX-30 1963 under internationell övervakning. Belgien valde
Leopard när Frankrike vägrade att låta delar av AMX-30 tillverkas i Belgien.

### 8.2 Påverkan, motköp och fusk

Dragen görs i upphandlingsmappen och kostar en handling var (9O). Varje drag markerar med prickar vilka
mätare det påverkar, utan tal (princip 3).

| Drag | Fas | Vad det ger | Pappersspår och risk |
|---|---|---|---|
| **Motköp** (lagligt) | anbudsinfordran, utveckling | Du lovar lokal tillverkning. Högre poäng, särskilt hos NON_ALIGNMENT-tjänstemän, men lägre marginal på serien. | inget |
| **Skriva kravet** | anbudsinfordran | En kravrad eller vikt lutas mot din konstruktions styrka. Kräver relation med eller muta till upphandlingstjänstemannen. | Litet spår. En tjänsteman med hög integritet kan vägra och rapportera, och då sjunker relationen. |
| **Handbyggt provexemplar** | prov | Högre prototypfaktor, alltså bättre provpoäng. | Spåret är tekniskt: serien blir sämre än provet. När det syns i fält börjar en utredning. Hur stor den blir beror på gapet. |
| **Muta provnämnden** | prov | Bättre protokoll. | Medelstort spår. Upptäckt ger diskvalificering, även i efterhand. |
| **Förfalska protokoll** | prov | Ett ska-krav som inte nås blir godkänt. | Stort spår. Kopplas till olycksfågeln (§5.6): när bristen syns i fält kan kontraktet hävas i efterhand och huset stängas av hos köparen. |
| **Underbud** (gråzon) | tilldelning | Lågt pris vinner. Priset höjs senare med tilläggsbeställningar. | Inget brottsligt spår, men fördyringen kan ge utfrågning och halverad order (C-5A). |
| **Sabotera eller läcka mot rival** | utveckling, prov | Befintliga `SABOTAGE` och `LEAK` får upphandlingen som mål. | Befintliga regler för exponering och motspionage. |

**Rivalerna fuskar också.** En rival med hårt temperament (0.13) använder ibland samma knep och lämnar
egna spår. Med underrättelse i köparens land kan du **anmäla** en rival som fuskat. Har du rätt
diskvalificeras rivalen. Har du fel sjunker relationen till upphandlingstjänstemannen.

Förebild för det handbyggda exemplaret: en utredning av den amerikanska arméns generalinspektör fann
1963 att jämförelseproven mellan AR-15 och M14 hade riggats. Man valde tester som gynnade M14 och
ställde handplockade M14-gevär av tävlingskvalitet mot AR-15 direkt från fabrik.

### 8.3 Pappersspåret

Ett enhetligt system för all korruption i spelet: knepen i §8.2, `BRIBE`, `BROKER`, `FAVOUR` och, enligt
beslut 9N, **mutan i vanliga bud**.

- **Varje korrupt handling ger ett spår:** vem, vilken tjänsteman, vilken sorts handling, hur allvarlig,
  vilken tur. Spåren sparas i staten.
- **Varje tur kan ett öppet spår komma fram.** Chansen stiger med:
  - tjänstemannens `scandalRisk`, som därmed får sin första läsare (0.12)
  - rivalernas underrättelse i landet
  - tiden, eftersom en lång stubin brinner
  - **regimskiften:** efter en kupp (`FUND_COUP`) öppnas arkiven och gamla spår får en engångschans att
    komma fram, både dina och rivalernas
- **När ett spår kommer fram** får du ett **utredningskort**, uppbyggt som krisen, med tre dåliga vägar:
  - **Förneka:** ingen kostnad nu, men risk att det blir större.
  - **Offra någon:** du avskedar en direktör, och en personalroll (`staff`) sjunker.
  - **Förlikas:** du betalar, och det syns i huvudboken.
- **Följderna** beror på allvaret:
  - hävt kontrakt
  - avstängning från köparens upphandlingar i några turer
  - tjänstemannen faller och ersätts. Det är den utlösare för `replaceOfficial` som saknats sedan P62.
  - sämre rykte och en rad i krönikan
  - avdrag vid styrelsens nästa granskning
- **Spåren kan sopas igen** mot betalning (en stående order, "juridisk rådgivning"). Det minskar
  chansen, men lämnar ett eget litet spår.

Förebilden är Lockheed-affärerna: mutor som betalades under många år och avslöjades först 1975–76.

### 8.4 Rent rykte

Ett nytt värde, `reputation.integrity`, för husets hederlighet:

- Det stiger långsamt när inga spår kommer fram och sjunker kraftigt när ett gör det.
- **Tjänstemän med hög integritet** väger det i upphandlingar. Ett rent hus har alltså en fördel där
  mutor fungerar sämst.
- Epilogen räknar det: fusk som kommit fram räknas till axeln SHADOW, och ett rent hus kan få ett eget
  slutkort.

Det är detta som gör "rent hus" och "smutsigt hus" till två verkliga spelstilar, och som besvarar
delfråga 6.

---

## 8b. Del F — Huset och staten (andra halvan, kan brytas ut)

### 8b.1 Exportregler och hemstaten
- **Exklusivitet:** teknik som tagits fram med forskningsanslag i en upphandling (§8.1) får inte säljas
  till andra blocket eller till neutrala.
- **Exportregler:** konstruktioner över en nivå hamnar på blockens exportlista, en fiktiv motsvarighet
  till CoCom. Att sälja dem över blockgränsen ger heat, doomsday och risk för upptäckt.
- **Hemstaten avgör (9I):**
  - Ett västanslutet hus får delta i västliga upphandlingar men förlorar östmarknaden.
  - Ett neutralt hus får delta överallt med lägre relationsvikt, och säljer till alla med sämre betalningsvillkor.

  Förebilden är de neutrala exportörerna i Schweiz, Sverige och Belgien.

### 8b.2 Den civila grenen
- Ett forskningsspår kan ge en **civil produkt**: traktorer ur pansarlinjen, radioapparater ur
  elektroniken, transporthelikoptrar till oljebolag.
- Civila ordrar är små och stabila och beror inte på kriget. De ger också ett litet försprång tillbaka
  till forskningen.
- Grenen löser en fråga som varit öppen sedan P64: ett hus kan överleva en vapenvila, men till lägre
  marginal och med mindre inflytande.
- Epilogen får en ny sorts slut, och axeln RESTRAINT får något att belöna.

Förebilden är Saab: bilar från 1949, datorer från flygelektroniken och sammanslagningen med
Scania-Vabis 1968.

### 8b.3 Chefskonstruktörer
- Namngivna personer med en egenskap (snabb, noggrann eller sparsam) och en egen inriktning. De ger
  forskningen ett ansikte och knyter den till etapp 5:s tjänstemän.
- En rival kan värva din chefskonstruktör, och du kan värva deras.
- **Specialprojekt** i en "skunk works" ger snabbare projekt med mindre insyn, och därmed större risk
  för dolda brister.

Förebilder: de sovjetiska konstruktionsbyråerna som bar sina chefers namn, och Kelly Johnsons Skunk
Works.

### 8b.4 Licenser
- En licens ger engångsbelopp och royalty. Samtidigt växer licenstagarens förmåga, och den kan till
  slut sälja på egen hand på husets marknader.
- Kundanpassningar driver upp kostnaden och kan utlösa en politisk skandal hos köparen, som då
  halverar ordern.
- **Embargo kan skapa en konkurrent:** en embargerad faktion som har husets licens eller ritning kan
  börja tillverka själv och bli en ny rival. Det bygger direkt på den befintliga `EMBARGO`-mekaniken.

Förebilder: licenstillverkningen av MiG-21 i Tjeckoslovakien, Indien och Kina, Mirage-affären i
Schweiz 1964, och Israels Nesher efter Frankrikes embargo 1969.

---

## 9. Gränssnittet

Etapp 7:s regler 1–18 gäller. Registret är krigsrummet 1965.

- **Ritbordet** (THE COMPANY) är ett lutande bord med en blåkopia per kategori. Inriktning och
  ambition väljs med `Segmented` på blåkopian. Ett pågående projekt syns som en ritning som växer fram
  i blyerts.
- **Typbladet** är en skrivmaskinsskriven sida per konstruktion. Prestanda och tillförlitlighet visas
  som visarinstrument och den verkliga kvaliteten som en klass med osäkerhet ("B±1"). Stämplar anger
  läget: UNTESTED, PROVEN IN THE FIELD, UNDER REVIEW eller RECALLED.
- **Kapplöpningstavlan** är den enda tavlan i etappen: två kolumner med blåkopiesiluetter, öst och väst,
  en rad per kategori. Fettkritsstreck visar bedömd generation, och varje rad har en stämpel för
  säkerheten. Under tavlan ligger nästa kvartals kravkort, synliga.
- **Budmappen** har ett `Segmented`-val bland husets konstruktioner och stämplarna STRIDSBEPRÖVAD och
  KRAVNIVÅ. Vinstchansen räknas om direkt.
- **Upphandlingsmappen** (CONTRACTS) är en egen mapp per upphandling: kravbladet stämplat och daterat,
  en tidslinje för faserna, konkurrenterna med underrättelsens prickar, knepen som registerkort och
  provdagens **utvärderingsprotokoll**, skrivet på skrivmaskin med en rad per krav och ett underkänt
  ska-krav överstruket med rött.
- **Utredningskortet** (§8.3) är byggt som kriskortet, med tre val och prickar för vad de påverkar.
- **Beslutskort** (olycksfåglar, fältprov, upphandlingar) markerar med prickar vilka mätare de
  påverkar, utan tal.
- **Daterade PM** inför systemen ett i taget:
  1. Konstruktionen från start.
  2. Kravkorten 1965.
  3. Kapplöpningstavlan första gången ett block går upp en generation.
  4. Den första upphandlingen efter första gap-chocken.
- **Kartan och NEWS DESK:** rubriker om fältrykte, gap och återkallelser. Förbandsbrickor med husets
  materiel får en liten märkning.

---

## 10. Härness, måltabell och balans

**Härnessen (ingen `core`-ändring):**
- `human` väljer inriktning efter köparnas mix och ambition efter kravkorten.
- Nya varianter för att pröva spelstilarna: `human-robust`, `human-advanced`, `human-noresearch`,
  `human-bothsides` (säljer till båda sidor), `human-clean` (fuskar aldrig), `human-dirty` (använder
  knepen när de lönar sig) och, om del F ingår, `human-civil`. Rivalernas fusk styrs av deras temperament.
- Nya kolumner:
  - konstruktioner, genombrott och olycksfåglar
  - antal stridsbeprövade
  - gap-chocker och antal gånger huset var först på plats
  - falska gap som huset själv skapade
  - intäkt från konstruktioner yngre än fyra kvartal
  - upphandlingar per parti, vunna, delade och förlorade
  - pappersspår, andel som kommit fram, hävda kontrakt och avstängningar
  - civil intäkt

**Måltabell** (balanspasset mäter och reviderar, samma regler som tidigare):

| Rad | Mål | Fetstilt |
|---|---|---|
| `human`, bästa mot sämsta kvartilen i fältrykte, vinst | ≥ 25 procentenheter skillnad | **ja** (lyft) |
| `human-robust` och `human-advanced`, vinst | båda ≥ 40 % | **ja** (spelstil) |
| `human` mot `human-noresearch`, vinst | ≥ 15 procentenheter högre | **ja** |
| Intäkt från konstruktioner yngre än fyra kvartal, `human` | 30–60 % | **ja** (dynamik) |
| Gap-chocker per parti | 1–3 | |
| `human-bothsides` mot `human`, högsta doomsday | ≥ 10 högre | **ja** (pelare 1) |
| Andel olycksfåglar | 10–25 % | |
| Den som var först på plats vinner också partiet | ≤ 80 % (ingen fri väg till seger) | |
| Upphandlingar per parti | 1–3 | |
| `human-clean` och `human-dirty`, vinst | båda ≥ 35 % | **ja** (delfråga 6) |
| `human-dirty` vinner fler upphandlingar men får fler hävda kontrakt än `human-clean` | båda sant | **ja** |
| Andel pappersspår som kommer fram under partiet | 30–60 % | |
| Vapenvilepartier där `human-civil` överlever | > 30 % | om del F ingår |
| `human`, `SCENARIO_COMPLETE` | 40–70 % | **ja** |

Spelbarhetstestets golv och tak samt capacity-referensen (ägarbeslut 2026-09-30) ska hålla efter varje
prompt som rör kärnan.

---

## 11. Skyddsräcken

1. **`computeScore` rörs inte.** Teknik-, specialiserings- och konstruktionstermer läggs efter anropet.
2. **Ett bud utan konstruktion beter sig exakt som i dag.** Golden-banan och befintliga botar påverkas
   inte förrän en prompt uttryckligen ändrar dem.
3. **En formel, en källa.** `bidding.ts`, `bidEstimate`, `playerWinCurve` och budmappen läser samma
   termer. Ett test underkänner om de skiljer sig.
4. **All slump via `ctx.rng`** (hård regel 2).
5. **Dolda värden läcker aldrig** till gränssnittet innan de avslöjats. Intervall och bedömningar är
   det enda som visas.
6. **Inga verkliga namn.** Konstruktioner, konstruktörer och exportlistor är fiktiva. De historiska
   förebilderna står bara i bilaga A.
7. **Upphandlingens tilldelning räknas av `evaluateTrial`, inte `computeScore`**, samma princip som BROKER
   i P57. Budmutans spår (9N) läggs till utan att röra `computeScore`s formel.
8. **Golden** fryses bara om enligt 9C.

---

## 12. Promptsekvens

"Regel" betyder att prompten ändrar spelregler och får frysa om golden enligt 9C. "UI" och "mätning"
lämnar golden orörd.

| Del | Prompt | Innehåll | Typ |
|---|---|---|---|
| **A Grunden** | P106 | Premisskontroll, `techTerm`, specialiseringen | regel |
| | P107 | Rykte per kategori, kvalitet bygger rykte, erfarenhet ger försprång | regel |
| | P108 | Forskning som stående order, krasprogram, chefsingenjören | regel |
| **B Konstruktionen** | P109 | Typbladet, inriktning och ambition, utfall | regel |
| | P110 | Dold kvalitet som intervall, egen provning, miljöbrister | regel |
| | P111 | Köparnas preferensmix, relativ bedömning, mixen via underrättelse | regel |
| | P112 | Uppgradering mot ny konstruktion, uppgraderingssatser | regel |
| | P113 | Olycksfåglar och utredningar | regel |
| **C Fältet** | P114 | Kvalitet i striden, fältrykte, stridsbeprövad, familjerykte, flaggskepp | regel |
| | P115 | `FIELD_TRIAL` | regel |
| | P116 | Fångad materiel och `REVERSE_ENGINEER` | regel |
| | P117 | Motmedelskedjor, livscykel och automatisk utfasning | regel |
| **D Kapplöpningen** | P118 | Blockens generationer, kravkort, köpare som följer sitt block | regel |
| | P119 | Gap-chocker, först på plats, efterföljarrabatt | regel |
| | P120 | Bedömningar som intervall, falska gap, `LEAK` mot bedömningar | regel |
| | P121 | Kapplöpningen och doomsday, sälja till båda sidor | regel |
| **E Upphandlingen** | P122 | `Programme`, faserna, forskningsanslag, hemstatens behörighet, tilldelning och delad order, `evaluateTrial` | regel |
| | P123 | Jämförande prov i köparens miljö, utvärderingsprotokoll, motköp | regel |
| | P124 | `PROCUREMENT`: de sex knepen (9M, 9O), rivalernas fusk och anmälan | regel |
| | P125 | Pappersspåret för all korruption inklusive budmutor (9N), utredningskortet, regimskiften öppnar arkiven, `replaceOfficial` när en tjänsteman faller, rent rykte | regel |
| **Gränssnitt** | P126 | Ritbordet och typbladet | UI |
| | P127 | Kapplöpningstavlan, kravkorten, budmappen, beslutskort, daterade PM | UI |
| | P128 | Upphandlingsmappen, utvärderingsprotokollet, utredningskortet | UI |
| **Mätning** | P129 | Härnessen för A–E | mätning |
| | P130 | Balanspass A–E | data |
| | P131 | Speltest, ingen kod | – |
| **F Huset och staten** | P132 | Exportregler och exklusivitet | regel |
| | P133 | Civil gren | regel |
| | P134 | Chefskonstruktörer och specialprojekt | regel |
| | P135 | Licenser och embargo som skapar konkurrent | regel |
| | P136 | Gränssnitt för del F | UI |
| **Mätning F** | P137 | Härness och balanspass för F | mätning/data |
| | P138 | Speltest, ingen kod | – |

> **P106 BYGGD 2026-09-30.** Premisskontrollen (§0) gjordes om mot koden och höll; ingen premiss föll.
> `bidTerms.ts` (`techTerm`, `specialisationTerm`, `playerBidTerm`) läggs på spelarens poäng efter
> `computeScore`, på en plats per läsare (`bidding.ts`; `bidEstimate`/`playerWinCurve` via
> `WinBandInputs.playerBidTerm`). Specialiseringen halverar `rndOverhead` för projekt i den egna kategorin.
> **Fynd:** specens "+10 %" (tolkat som +10 poäng) och `techMarginWeight` 2 bröt spelbarhetstaket och
> `capacity`-referensen (`human` 99 %, `balanced` 100 %, `capacity` 65 % vinst). Valda provisoriska tal:
> `techMarginWeight` 0,25, `specialisationBidBonusPct` 1 (de största som håller vakterna). Orsaken är
> strukturell — `human` har ingen marginal uppåt — och måste mötas med en rivalsidig motvikt eller ett
> ägarbeslut i P130, inte med fler spelarbonusar. Golden omfryst i egen commit. Se ANDRINGSLOGG 2026-09-30.

> **P107 BYGGD 2026-09-30.** `House.categoryQuality` (tillägg i poäng på `reputation.quality`, ±4) och
> `House.researchHeadStart` (turer per kategori) är nya fält; `categoryReputation` (`bidTerms.ts`) ger budpoängen
> kategorins kvalitet i `bidding.ts`, `bidEstimate` och `playerWinCurve`. Klass A höjer, klass C sänker, klass B
> rör inte; leveranser in i en krigsfront bankar forskningsförsprång som `advanceRndQueue` förbrukar i hela turer.
> Förlorad upphandling med genomgång (§4.4:s andra halva) väntar på del E. Vakterna håller (`human` 80 %,
> `capacity` 3/97). Saved-game-migrering i `persistence.ts`. Golden omfryst i egen commit. Se ANDRINGSLOGG 2026-09-30.

> **P108 BYGGD 2026-09-30.** `RESEARCH` är en ny stående order (spår per kategori, låg/normal/hög, ingen handling,
> från nästa tur; `research.ts`). `REPRIORITISE_RND` är ett krasprogram: halverad tid, dubbel totalkostnad, en
> handling, inga bud i kategorin nästa kvartal (`House.rndBidLock`). `chiefEngineer` över 70 kortar ett nytt
> projekt en tur. Botarna använder ett spår i stället för handlingen. **Gap:** appen saknar kontroll för
> forskningsspår tills P126. Vakterna håller (`human` 80 %, `capacity` 3/97, `balanced-pwc` 100 %). Golden omfryst
> i egen commit. Se ANDRINGSLOGG 2026-09-30.

> **P109 BYGGD 2026-09-30.** `Design` (`House.designs`), stående order `DESIGN` (inriktning + ambition, en per
> kategori, ingen handling), utfallet dras med `ctx.rng` när projektet blir klart (genombrott / gedigen / dold
> brist), `Bid.designId` och `designBidTerm` (efter `computeScore`, delad med `bidEstimate`/`playerWinCurve`),
> `Contract.designId` med styckkostnad × `unitCostFactor`, `designDisplay` visar klassen som intervall. `currentGeneration`
> är ett provisoriskt tidsschema tills P118. Golden omfryst i egen commit. Se ANDRINGSLOGG 2026-09-30.

> **P110 BYGGD 2026-09-30.** `data/environments.json` (miljöer per front), stående order `TESTING` (provning i egen
> regi: osäkerheten smalnar av ett klasssteg per 2 turer, kostar `rndOverhead` × 0,5 per tur, slutar vid 0) och
> miljöbrister som bara avslöjas av provning i rätt miljö (`revealFlaw`, återanvänds av P113). Golden-hasharna
> oförändrade; bara `balance.frozen.json` omfryst i egen commit. Se ANDRINGSLOGG 2026-09-30.

> **P111 BYGGD 2026-09-30.** `buyerPreferenceMix` (härledd ur agenda, förlorande front och doktrin), `designBidTerm` är nu
> mix-viktad och relativ mot ett riktmärke som stiger med generationen (rivalerna hinner ikapp av sig själva),
> `buyerPreferenceDisplay` avslöjar mixen bara med en station. Avsteg: riktmärket är härlett ur generationen tills P118.
> Golden-hasharna oförändrade. Se ANDRINGSLOGG 2026-09-30.

> **P112 BYGGD 2026-09-30.** `DESIGN START` med `upgradeOf` (billigare, snabbare, lägre tak, ärver föregångarens dolda
> utfall/brist/fältrykte) mot en ny konstruktion (dyrare, nollställd, högre tak). `Bid.kit`: uppgraderingssats till köparens
> befintliga materiel (lägre marginal, poängbonus), prövad av `bidDesignRejection` och delad med `bidEstimate`/`playerWinCurve`.
> **Premissfynd:** §5.5:s mening om att omställning av linjer gör en ny konstruktion kostsam stämmer inte under 9B
> (samma `productId`) — ej byggt, förslag till ägaren. Golden-hasharna oförändrade. Se ANDRINGSLOGG 2026-09-30.

> **P113 BYGGD 2026-09-30.** `Investigation`/`House.investigations`: en leverans av en konstruktion med en miljöbrist i
> frontens miljö kan ge en rapport från fältet (`ctx.rng`, avslöjar bristen, öppnar en utredning med frist). Utredningskortet
> är en stående order: åtgärda i fält (pengar, omställning, 15 % risk), förneka (anseende, rykte per leverans, kan avslöjas
> som skandal) eller konstruera om (tillbakadragen under ett kortare projekt). Utan svar = förnekande. Nytt krönikeslag
> `casualty`. Del B (P109–P113) är därmed klar. Golden omfryst i egen commit. Se ANDRINGSLOGG 2026-09-30.

**Kapningsordning** om etappen behöver bli mindre:
1. Bryt ut del F (P132–P138) till en egen etapp.
2. Stryk P116 (fångad materiel).
3. Stryk P120 (falska gap). Den är stark men inte nödvändig för frågan i §1.
4. Stryk P112 (uppgraderingar).

Del E stryks inte: pappersspåret (P125) rättar ett fel som finns i dag (0.12), oavsett resten.
Del A–C besvarar delfråga 1, 2 och 4, del D delfråga 3 och 5, och del E delfråga 6.

---

## 13. Utanför etappen

Idéer från researchen som passar senare:
- **Vapenmässan** vartannat år: visa upp för ordrar, eller håll hemligt. En krasch vid en uppvisning
  blir en rubrik (förebild: B-58 i Paris 1965).
- **Förfalskade slutanvändarintyg** för neutrala hus (förebild: Bührle-målet i Schweiz 1968–70).
- **Försvarsutredningar** som betygsätter husens fältrykte vid en tidpunkt spelaren inte känner till
  exakt, i stil med poängkorten i *Twilight Struggle*.
- **En egen forskningsmodell för rivalerna.**
- **Nya scenarier.**

---

## 14. Kvarstående punkter för ägaren

> **Uppdatering 2026-09-30 (ägarbeslut, se ANDRINGSLOGG):** (a) nya pipeline-steg får läggas in i etapp 9 med
> loggad placering; (b) generationsschemat mappas mot de sex kategorierna (kliv tur 4, 8, 12) och den slutliga
> listan godkänns före P118; (c) en konstruktionsfamilj per kategori är avsiktligt; (d) nya verb kommer med
> handlingskatalog, Handbok, handledning och SVG-ikoner via tillgångsfabriken; (e) ägaren anger per gång vilka
> prompter som körs ("Kör x–x").


Besluten 9A–9O är fattade (§3). Kvar:

1. **P105 först:** speltestet av etapp 8 bör göras innan P106 körs. Det är första gången spelet går att
   vinna med rimlig marginal, och det är värt att veta hur det känns innan nästa lager läggs på.
2. **Det historiska grundschemat** för blockens generationer (§7.1) tas fram och godkänns av ägaren
   före P118. Förslag: en generation per kategori vartannat år, med kliv 1965 (luftvärn), 1966
   (helikoptrar) och 1967 (pansarvärn).
3. **Utvärderingen av del F:** efter P131 avgör ägaren om del F byggs i etapp 9 eller blir en egen etapp.

---

## Bilaga A — Förebilder och källor

Historiska mönster som mekanikerna bygger på. Namnen används bara här, aldrig i spelet.

| Mekanik | Förebild | Källa |
|---|---|---|
| Olycksfågel, utredning, åtgärd (§5.6) | M16 i Vietnam 1966–67, kongressens utredning 1967 | [American Rifleman](https://www.americanrifleman.org/articles/2012/6/22/us-m16/) |
| Brister som hör till en miljö (§5.3) | M551 Sheridan i Vietnam 1969 | [National Interest](https://nationalinterest.org/node/208601) |
| Stridsbeprövad (§6.2) | Mirage III 1967 | [IAI Nesher](https://en.wikipedia.org/wiki/IAI_Nesher) |
| Familjerykte (§6.2) | FN FAL, över 90 länder | [FN FAL](https://en.wikipedia.org/wiki/FN_FAL) |
| Fältprov (§6.4) | 1 000 AR-15 1962; A-37 i strid 1967 | [warbirdforum](https://warbirdforum.com/arpaar15.htm) |
| Kopiering (§6.5) | Sidewinder blev K-13 1958–60; operation Diamond 1966 | [K-13](https://en.wikipedia.org/wiki/K-13_(missile)) |
| Motmedel (§6.6) | SA-2 1965, Wild Weasel och Shrike 1965–66 | [Air & Space Forces](https://www.airandspaceforces.com/article/0710weasels/) |
| Uppgraderingssatser (§5.5) | L7-kanonen i Centurions torn | [Royal Ordnance L7](https://en.wikipedia.org/wiki/Royal_Ordnance_L7) |
| Falska gap (§7.3) | Missilgapet 1957–61 | [Missile gap](https://en.wikipedia.org/wiki/Missile_gap) |
| Forskningsanslag, fördyring (§8.1) | TFX/F-111 1962–68, C-5A 1968–69 | [GlobalSecurity](https://www.globalsecurity.org/military/systems/aircraft/f-111-history.htm) |
| Exportregler, neutrala (§8b.1) | CoCom 1949–94; Bührle-målet 1968–70 | [CoCom](https://en.wikipedia.org/wiki/Coordinating_Committee_for_Multilateral_Export_Controls) |
| Civil gren (§8b.2) | Saab: bilar, datorer, Scania-Vabis 1968 | [Saab AB](https://en.wikipedia.org/wiki/Saab_AB) |
| Konstruktörer (§8b.3) | Sovjetiska konstruktionsbyråer, Skunk Works | [Kelly Johnson](https://migflug.com/jetflights/kelly-johnson-lockheed-skunk-works-designer-sr-71-u-2/) |
| Licenser (§8b.4) | MiG-21 i Tjeckoslovakien, Indien och Kina | [mig-21.de](https://mig-21.de/english/production.htm) |
| Kundanpassning, skandal (§8b.4) | Mirage-affären i Schweiz 1964 | [Mirages affair](https://en.wikipedia.org/wiki/Mirages_affair) |
| Embargo skapar konkurrent (§8b.4) | Frankrikes embargo 1969, Israels Nesher | [IAI Nesher](https://en.wikipedia.org/wiki/IAI_Nesher) |
| Jämförande prov, motköp (§8.1–8.2) | Leopard mot AMX-30 1963; Belgiens val när Frankrike vägrade lokal tillverkning | [AMX-30](https://en.wikipedia.org/wiki/AMX-30) |
| Handbyggt provexemplar, riggat prov (§8.2) | Generalinspektörens utredning 1963 av proven AR-15 mot M14 | [M16 rifle](https://en.wikipedia.org/wiki/M16_rifle) |
| Pappersspår med lång stubin (§8.3) | Lockheed-affärerna, avslöjade 1975–76 | [Lockheed bribery scandals](https://en.wikipedia.org/wiki/Lockheed_bribery_scandals) |

**Spelmekaniska förebilder:**
- **Forska före sin tid:** Hearts of Iron IV.
- **Konstruktionsbyråer med egenskaper:** Hearts of Iron IV (MIO).
- **Prototyp och fältförbättrad Mk II:** Shadow Empire.
- **Egenskaper som tappar värde när andra kopierar:** Production Line.
- **Bedömning mot eget bästa och köparens mix:** Game Dev Tycoon.
- **Dolda effekter och betyg:** Big Pharma.
- **Forskning ur fångad materiel:** XCOM.
- **Eurekas:** Civilization VI.
- **Efterföljare kommer ikapp billigare:** Victoria 3, Capitalism Lab.
- **Patentkapplöpning:** Offworld Trading Company.
- **Milstolpar för den som är först:** Food Chain Magnate.
- **Epoker som fasar ut gammal teknik:** Brass.
- **Synlig framtida marknad:** Power Grid.
- **Rymdkapplöpning och DEFCON:** Twilight Struggle.
- **Kort med två sidor och kostnad för att agera:** COIN-serien.
- **Otestat tills man agerar:** Labyrinth.
- **Dold styrka före en känd konflikt:** Imperial Struggle.
- **Visa vad som påverkas, inte hur mycket:** Reigns.
- **En regel i taget:** Papers, Please.

Källor för spelen finns i researchrapporterna (sessionens underlag). De viktigaste:
[HoI4 forskning](https://eip.gg/hoi4/guides/research/), [Production Line](https://www.positech.co.uk/cliffsblog/?p=4596),
[Offworld patent](https://www.designer-notes.com/otc-designer-notes-9-patent-lab/),
[Food Chain Magnate](https://eriktwice.com/en/2021/06/18/food-chain-magnate-understanding-milestones/),
[Twilight Struggle](https://en.wikipedia.org/wiki/Twilight_Struggle), [Reigns](https://emshort.blog/2016/08/20/reigns/).
