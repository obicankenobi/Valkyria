# Etapp 9 — Ritbordet

**THE SEVENTH FRONT** · förslag, **inte antaget** · slutversion 2026-09-30 mot `e7b655d` (efter P104)

> Ersätter de två tidigare utkasten från samma dag. Ägaren bad om en etapp där forskning,
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
8. Del E, huset och staten · 9. Gränssnittet · 10. Härness, måltabell, balans ·
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

## 3. Ägarbeslut (ej fattade)

| | Fråga | Rekommendation |
|---|---|---|
| **9A** | Omfång | **Del A–D är etapp 9.** Del E (§8) är andra halvan och kan brytas ut till en etapp 10 om etappen blir för stor. Kapningsordningen står i §12. |
| **9B** | Egna konstruktioner som varianter eller nya produkter? | **Varianter.** En konstruktion bygger på en basprodukt och bjuds på dess ordrar. `Order` skrivs inte om. |
| **9C** | Golden | Förhandsauktoriserad omfrysning **bara i promptar märkta "regel"** i §12, var och en i egen commit efter verifiering att ändringen är den prompten beskriver. |
| **9D** | Dold verklig kvalitet? | **Ja**, visad som ett intervall ("B±1") som smalnar av genom provning och fält. |
| **9E** | Produkten i striderna? | **Ja, högst ±25 %** på levererad materiel. |
| **9F** | Rivalernas konstruktioner | **Enkla**, enligt schema per rival och specialisering. Ingen egen forskningsmodell. |
| **9G** | Nya verb | **Två:** `FIELD_TRIAL` (§6.4) och `REVERSE_ENGINEER` (§6.5). Allt annat styrs via ritbordet och stående order. |
| **9H** | Blockens kapplöpning som dolda tal med underrättelsebedömningar? | **Ja.** Falska gap är en av de starkaste idéerna i förslaget (§7.3). |
| **9I** | Hemstatens betydelse (väst/öst/neutral) | **Stor:** den avgör statliga kontrakt, exportregler och vilka block huset lagligt får sälja till (§8.1). |
| **9J** | Civil gren | **Ja** (§8.2). Den prövar pelare 1:s andra halva. |
| **9K** | Namngivna chefskonstruktörer | **Ja** (§8.3), som förlängning av etapp 5:s tjänstemän. |
| **9L** | Namnmall för konstruktioner | Husets initialer + beteckning + år + typ, till exempel "H&V M64 Field Gun". Godkänns före P109. |

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

## 8. Del E — Huset och staten (andra halvan, kan brytas ut)

### 8.1 Statliga utvecklingskontrakt och exportregler
- **Kontraktsformen:** ett block kan finansiera ett utvecklingsprojekt, antingen med **kostnad plus
  vinst** (säker marginal men granskning) eller till **fast pris** (hög vinst om det går bra, förlust och
  utfrågning vid fördyring). Förebilder: TFX/F-111-striden 1962–68 och C-5A-fördyringen 1968–69.
- **Exklusivitet:** kontraktets teknik får inte säljas till andra blocket eller till neutrala.
- **Exportregler:** konstruktioner över en nivå hamnar på blockens exportlista, en fiktiv motsvarighet
  till CoCom. Att sälja dem över blockgränsen ger heat, doomsday och risk för upptäckt.
- **Hemstaten avgör (9I):**
  - Ett västanslutet hus får västkontrakt men förlorar östmarknaden.
  - Ett neutralt hus får inga kontrakt men kan sälja till alla, med sämre betalningsvillkor.

  Förebilden är de neutrala exportörerna i Schweiz, Sverige och Belgien.

### 8.2 Den civila grenen
- Ett forskningsspår kan ge en **civil produkt**: traktorer ur pansarlinjen, radioapparater ur
  elektroniken, transporthelikoptrar till oljebolag.
- Civila ordrar är små och stabila och beror inte på kriget. De ger också ett litet försprång tillbaka
  till forskningen.
- Grenen löser en fråga som varit öppen sedan P64: ett hus kan överleva en vapenvila, men till lägre
  marginal och med mindre inflytande.
- Epilogen får en ny sorts slut, och axeln RESTRAINT får något att belöna.

Förebilden är Saab: bilar från 1949, datorer från flygelektroniken och sammanslagningen med
Scania-Vabis 1968.

### 8.3 Chefskonstruktörer
- Namngivna personer med en egenskap (snabb, noggrann eller sparsam) och en egen inriktning. De ger
  forskningen ett ansikte och knyter den till etapp 5:s tjänstemän.
- En rival kan värva din chefskonstruktör, och du kan värva deras.
- **Specialprojekt** i en "skunk works" ger snabbare projekt med mindre insyn, och därmed större risk
  för dolda brister.

Förebilder: de sovjetiska konstruktionsbyråerna som bar sina chefers namn, och Kelly Johnsons Skunk
Works.

### 8.4 Licenser
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
- **Beslutskort** (olycksfåglar, fältprov, statliga kontrakt) markerar med prickar vilka mätare de
  påverkar, utan tal.
- **Daterade PM** inför systemen ett i taget:
  1. Konstruktionen från start.
  2. Kravkorten 1965.
  3. Kapplöpningstavlan första gången ett block går upp en generation.
  4. Statliga kontrakt efter första gap-chocken.
- **Kartan och NEWS DESK:** rubriker om fältrykte, gap och återkallelser. Förbandsbrickor med husets
  materiel får en liten märkning.

---

## 10. Härness, måltabell och balans

**Härnessen (ingen `core`-ändring):**
- `human` väljer inriktning efter köparnas mix och ambition efter kravkorten.
- Nya varianter för att pröva spelstilarna: `human-robust`, `human-advanced`, `human-noresearch`,
  `human-bothsides` (säljer till båda sidor) och, om del E ingår, `human-civil`.
- Nya kolumner:
  - konstruktioner, genombrott och olycksfåglar
  - antal stridsbeprövade
  - gap-chocker och antal gånger huset var först på plats
  - falska gap som huset själv skapade
  - intäkt från konstruktioner yngre än fyra kvartal
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
| Vapenvilepartier där `human-civil` överlever | > 30 % | om del E ingår |
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
7. **Golden** fryses bara om enligt 9C.

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
| **Gränssnitt 1** | P122 | Ritbordet och typbladet | UI |
| | P123 | Kapplöpningstavlan, kravkorten, budmappen, beslutskort, daterade PM | UI |
| **Mätning 1** | P124 | Härnessen för A–D | mätning |
| | P125 | Balanspass A–D | data |
| | P126 | Speltest, ingen kod | – |
| **E Huset och staten** | P127 | Statliga kontrakt och exportregler | regel |
| | P128 | Civil gren | regel |
| | P129 | Chefskonstruktörer och specialprojekt | regel |
| | P130 | Licenser och embargo som skapar konkurrent | regel |
| | P131 | Gränssnitt för del E | UI |
| **Mätning 2** | P132 | Härness och balanspass för E | mätning/data |
| | P133 | Speltest, ingen kod | – |

**Kapningsordning** om etappen behöver bli mindre:
1. Bryt ut del E (P127–P133) till en egen etapp.
2. Stryk P116 (fångad materiel).
3. Stryk P120 (falska gap). Den är stark men inte nödvändig för frågan i §1.
4. Stryk P112 (uppgraderingar).

Del A–C besvarar ensamma delfråga 1, 2 och 4. Del D behövs för delfråga 3 och 5.

---

## 13. Utanför etappen

Idéer från researchen som passar senare:
- **Vapenmässan** vartannat år: visa upp för ordrar, eller håll hemligt. En krasch vid en uppvisning
  blir en rubrik (förebild: B-58 i Paris 1965).
- **Mutspår med lång stubin:** mutor som blir en skandal långt senare (förebild: Lockheed-affärerna,
  avslöjade 1975–76). Bygger på `scandalRisk`.
- **Förfalskade slutanvändarintyg** för neutrala hus (förebild: Bührle-målet i Schweiz 1968–70).
- **Försvarsutredningar** som betygsätter husens fältrykte vid en tidpunkt spelaren inte känner till
  exakt, i stil med poängkorten i *Twilight Struggle*.
- **En egen forskningsmodell för rivalerna.**
- **Nya scenarier.**

---

## 14. Öppna beslut för ägaren

1. Besluten 9A–9L i §3.
2. **P105 först:** speltestet av etapp 8 bör göras innan etappen antas. Det är första gången spelet
   går att vinna med rimlig marginal, och det är värt att veta hur det känns innan nästa lager läggs på.
3. **Det historiska grundschemat** för blockens generationer (§7.1) tas fram och godkänns av ägaren
   före P118. Förslag: en generation per kategori vartannat år, med kliv 1965 (luftvärn), 1966
   (helikoptrar) och 1967 (pansarvärn).

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
| Statliga kontrakt, fördyring (§8.1) | TFX/F-111 1962–68, C-5A 1968–69 | [GlobalSecurity](https://www.globalsecurity.org/military/systems/aircraft/f-111-history.htm) |
| Exportregler, neutrala (§8.1) | CoCom 1949–94; Bührle-målet 1968–70 | [CoCom](https://en.wikipedia.org/wiki/Coordinating_Committee_for_Multilateral_Export_Controls) |
| Civil gren (§8.2) | Saab: bilar, datorer, Scania-Vabis 1968 | [Saab AB](https://en.wikipedia.org/wiki/Saab_AB) |
| Konstruktörer (§8.3) | Sovjetiska konstruktionsbyråer, Skunk Works | [Kelly Johnson](https://migflug.com/jetflights/kelly-johnson-lockheed-skunk-works-designer-sr-71-u-2/) |
| Licenser (§8.4) | MiG-21 i Tjeckoslovakien, Indien och Kina | [mig-21.de](https://mig-21.de/english/production.htm) |
| Kundanpassning, skandal (§8.4) | Mirage-affären i Schweiz 1964 | [Mirages affair](https://en.wikipedia.org/wiki/Mirages_affair) |
| Embargo skapar konkurrent (§8.4) | Frankrikes embargo 1969, Israels Nesher | [IAI Nesher](https://en.wikipedia.org/wiki/IAI_Nesher) |

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
