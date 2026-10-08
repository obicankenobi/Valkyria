# Etapp 10 — Världen svarar

**THE SEVENTH FRONT** · **ANTAGEN 2026-10-02** · skriven mot `e91cf9b` (efter P137)

> **Status:** antagen av ägaren 2026-10-02. Ägaren bad om att besluten 10A–10O fattas enligt
> rekommendationerna och att de större punkterna prövas en gång till före antagandet. Prövningen ändrade
> tre av dem (10E, 10K, 10N) och lade till en mätning först i P141; se §3. Allt är loggat i
> `ANDRINGSLOGG.md`. Filen behåller namnet. **Ordningen ändrades 2026-10-06 efter ägarens speltest; se §3b
> och körordningen i §14.** Etappen har två delar, på ägarens begäran:
> **10A, "Slipningen"** förbättrar det som redan finns och lägger inte till någon ny mekanik.
> **10B, "Världen svarar"** gör rivalerna till motspelare, låter verkliga historiska händelser gripa in i
> partiet och höjer spelkänslan. Underlaget är en genomgång av P106–P137 (två granskningar mot kod och
> logg, 2026-10-02), en kodinventering samma dag och en källkontroll av varje historisk händelse
> (bilaga A). Premisskontrollen i §0 görs om mot koden före första prompten.

---

## Innehåll

0. Premisskontroll · 1. Frågorna · 2. Designprinciper · 3. Ägarbeslut · 3b. Speltestet 2026-10-06 ·
**Del 10A:** 4. Speltest och kvittering · 5. Mätningen · 6. Mekanik som är av eller nedskruvad ·
7. Fusket, kapplöpningen och konstruktionerna · 8. Gränssnittet i 10A ·
**Del 10B:** 9. Historiska händelser · 10. Rivalerna som motspelare · 11. Spelkänslan ·
12. Härness och måltabell · 13. Skyddsräcken · 14. Promptsekvens · 15. Utanför etappen ·
16. Kvarstående punkter för ägaren · Bilaga A, händelserna med datum och källor

---

## 0. Premisskontroll

Allt nedan är kontrollerat mot koden 2026-10-02 om inget annat sägs.

| # | Premiss | Belägg |
|---|---|---|
| 0.1 | Scenariot börjar 1964 Q1 och har 20 turer. De spelade kvartalen är 1964 Q1–1968 Q4. | `indochina-slice.json:4-6`, `state.ts:493-498` |
| 0.2 | Det finns ett enda scenario. | `state.ts:193-194`, `app/game.ts:6` |
| 0.3 | Scenariofilen har redan `scriptedEvents`, men bara av slaget `RESTRICTED_ORDER` (tur 7, 10, 16). | `indochina-slice.json:125-147`, `orders.ts:259` |
| 0.4 | `WireEvent` har inget fält för händelseslag. NEWS DESK känner igen blixtar på rubriktext. | `types.ts:1093-1103`, `newsClassification.ts:37-67` |
| 0.5 | Krisen är det enda kort där världen ställer spelaren inför ett val. Den utlöses av doomsday ≥ 75. | `doomsday.ts:95-127`, `crisis.ts` |
| 0.6 | De fyra daterade PM:en är appdata med fasta datumsträngar, inte speltid. | `app/memos.ts:27-80` |
| 0.7 | Tre rivaler. Ingen har minne av spelaren eller mål mot spelaren. En `cautious` rival gör ingenting i rivalsteget. | `rivals.json`, `rivals.ts:103-247` |
| 0.8 | Rivaler lägger bud, spelar råvarumarknaden, mutar provnämnden, kopierar fångad materiel och värvar över konstruktörer. De saboterar, läcker, mutar tjänstemän och anmäler aldrig. | `programme.ts:919-930`, `designer.ts:96-114`, grep |
| 0.9 | Rivalerna visas som en läsvy längst ner på CONTACTS, utan ansikten. | `ThePolitics.tsx:632-652` |
| 0.10 | `blocTechLevelStep` är 0 och `race.ts` hoppar över skrivningen. | `balance.json:327`, `race.ts:241` |
| 0.11 | `techMarginWeight` 0,25, `specialisationBidBonusPct` 1 och `counterDemandOrders` 0,25 är satta till det största värde som inte fällde vakterna. | `balance.json:115, 332`, logg P106/P117 |
| 0.12 | Motmedelskedjan, köparnas preferensmix, först på plats och `LEAK` mot en bedömning saknar gränssnitt. | noll träffar i `packages/app/src` |
| 0.13 | Ingen bot använder `FIELD_TRIAL`, `REVERSE_ENGINEER`, uppgradering, satser, `LOWBALL`, anmälan eller sabotage mot en upphandling. | `harness/src/policies.ts` |
| 0.14 | Mätkolumnen `suspensions` överräknar: den matchar också rubriken för varje avvisat bud. | `runGame.ts:215`, `bidding.ts:106`, `traces.ts:239` |
| 0.15 | Handledningen har fem steg och nämner varken ritbord eller upphandling. | `app/tutorial.ts:29-33` |
| 0.16 | `balance.json` har 458 datanycklar. Omkring 370–420 står under en not som kallar dem provisoriska. | räknat mot notfälten |
| 0.17 | THE COMPANY är 13 paneler i en enda kolumn. Tre av dem växer med antalet linjer, avtal och konstruktioner. | `TheHouse.tsx:168-313` |
| 0.18 | 18 av 19 ljudeffekter och båda miljöljuden saknas. Inga porträtt eller händelsebilder finns. | `public/sounds/`, `public/images/` |
| 0.19 | `MovementArrow` används inte av någon komponent. Kartan animerar bara nuläget. `QuarterReplay` är text. | `MovementArrow.tsx`, `QuarterReplay.tsx:16-23` |
| 0.20 | Efter P130/P137 missas eller saknas mätning för sju av fjorton målrader i etapp 9, och ingen av dem är reviderad av ägaren. | `ETAPP9_FORSLAG.md` §10, logg |
| 0.21 | Tre beslut som enligt specen var ägarens togs av kodsessionen: golden i P130, att del F byggdes i etapp 9, och generationsschemat i P118. | logg P118, P130, P131 |
| 0.22 | DESIGN.md §15 säger redan att stater, krig, fördrag och årtal är verkliga, att statschefer är verkliga men passiva, och att vapenhus och tjänstemän är fiktiva. | `DESIGN.md:516-528` |

Följd av 0.1: **Grisbuktsinvasionen (1961) och Kubakrisen (1962) ligger före scenariots start.** De kan
inte inträffa under partiet. Förslaget lägger dem i en prolog (§9.6).

---

## 1. Frågorna

**10A:** *Märker spelaren det som byggdes i etapp 9?* Delfrågor:
1. Är varje mekanik antingen påslagen och kännbar, eller borttagen?
2. Har fusket en verklig risk och en verklig vinst?
3. Går partiet att förstå utan att ha läst specen?

**10B:** *Känns det som att spela mot någon, i en värld som rör sig?* Delfrågor:
4. Gör rivalerna drag som spelaren måste svara på?
5. Vet spelaren vilket år det är och vad som händer i världen, utan att läsa en lärobok?
6. Ändrar minst ett historiskt beslut hur partiet slutar?

Fråga 3–6 kan bara besvaras av en människa som spelar.

---

## 2. Designprinciper

1. **På eller bort.** En mekanik som är avstängd eller nedskruvad för att vakterna ska hålla är en skuld.
   10A slår på den, ersätter den eller tar bort den. Inget lämnas "av tills vidare".
2. **Speltestet styr.** 10A börjar med att ägaren spelar. Det som stör i spel går före det som stör i en tabell.
3. **Svårighet kommer från motspelare, inte bara från styrelsen.** I dag är `boardTarget.threshold` den
   enda spaken uppåt. 10B ger rivalerna den rollen.
4. **Varje historisk händelse är verklig, daterad och belagd.** Ett test underkänner en händelse utan
   datum och källa. Inga påhittade citat läggs i verkliga personers mun.
5. **Historien griper in genom spakar som redan finns:** doomsday, heat, materielbehov, råvaruindex,
   relationer, opinion, kapplöpningens takt, pappersspårens risk. Inga nya mätare.
6. **Valet gäller huset, inte historien.** Spelaren ändrar aldrig vad som hände. Spelaren väljer hur det
   fiktiva huset reagerar.
7. **Händelser om civila offer är aldrig en ren vinst.** De bär alltid en kostnad på axeln SHADOW eller i
   redbarhetsryktet.
8. **Det som kan genereras ur kod genereras.** Förstasidor, sigill, siluettporträtt och ljudeffekter
   byggs av tillgångsfabriken, så att etappen inte väntar på material utifrån.

---

## 3. Ägarbeslut (fattade 2026-10-02)

Fattade enligt rekommendationerna, på ägarens uppdrag. Fyra punkter ändrades när de prövades en gång
till mot koden före antagandet:

- **10E:** steget `history` läggs direkt efter `applyActions`, inte före `race`. `race` ligger sent i
  turen, efter `fronts`, `heat` och `doomsday`. En händelse som höjer heat eller försenar leveranser
  hade då verkat först kvartalet efter sitt datum.
- **10K:** vapenvilan efter Parissamtalen kommer sent i partiet, med två eller tre kvartal kvar. Målet
  sänks från 20–50 % till 10–40 % av partierna, och den får inte ensam avgöra styrelsemålet.
- **10N:** en syntetiserad ljudeffekt som inte håller måttet i speltestet lämnas tyst. Ett dåligt ljud är
  sämre än inget.
- **P141** börjar med en mätning. Att lägga om efterfrågans uppbyggnad är etappens största risk, eftersom
  allt annat i ekonomin vilar på den.

| | Fråga | Beslut |
|---|---|---|
| **10A** | Omfång och ordning | **10A först, i sin helhet, sedan 10B.** 10B bygger på en balans som håller. |
| **10B** | De tre besluten kodsessionen tog (0.21) | **Kvittera golden i P130 och att del F byggdes. Ompröva generationsschemat** i P142, eftersom det ger 9,7 gap-chocker mot målet 1–3. |
| **10C** | Etapp 9:s missade målrader (0.20) | **Varje rad får ett av tre öden i P147: nådd, reviderad med skäl, eller struken med mekaniken.** Ingen lämnas öppen. |
| **10D** | Golden | **Kodsessionen får frysa om golden i promptar märkta "regel" i §14,** en gång per prompt, i egen commit, efter verifiering. I övriga promptar gäller "stanna och fråga". Samma ordning som 9C. |
| **10E** | Nytt pipeline-steg `history` (hård regel 7) | **Ja, placerat direkt efter `applyActions` och före `production`.** Kvartalets händelser verkar då på samma kvartals leveranser, fronter, heat, doomsday och ordrar. Spelarens svar på ett beslut gäller från kvartalet efter. |
| **10F** | Fasta datum eller rörliga? | **Fasta.** En händelse hör till det kvartal dess verkliga datum ligger i. Det är hela poängen med kravet på verkliga händelser. |
| **10G** | Händelser inne i teatern när partiet avviker från historien | **Villkor per händelse.** Tet kräver att fronten är i krig. Är villkoret inte uppfyllt utgår händelsen, och NEWS DESK säger ingenting. Händelser utanför teatern inträffar alltid. |
| **10H** | Grisbukten och Kubakrisen | **Prolog.** Fem förstasidor 1961–1963 i genomgången före partiet, utan mekanisk effekt. De blir spelbara först i ett scenario som börjar tidigare. |
| **10I** | Verkliga företagsnamn i händelser (DESIGN.md §15: inga verkliga vapenhus) | **Vapnets och statens namn, aldrig tillverkarens.** "The Starfighter", "the TSR-2", "the M16 rifle". Napalmtillverkaren namnges inte. |
| **10J** | Verkliga personer | **Enligt §15: statschefer och regeringsmedlemmar nämns för vad de faktiskt gjorde, är passiva och kan inte påverkas.** Inga citat utom sådana som är belagda ordagrant. |
| **10K** | Vapenvila mot spelarens vilja | **Ja, genom fredssamtalen i Paris (maj 1968).** Det är den uppskjutna halvan av pelare 1 ("för lite krig", ägarbeslut 2026-09-30). Samtalen sänker trösklarna; vapenvilan inträffar bara om partiets eget läge når dem. Den kommer sent, så prövningen blir begränsad i det här scenariot. |
| **10L** | Svårighetsgrad | **Tre nivåer vid New Game, som bara skalar rivalernas aggression.** Standardnivån är den som golden och vakterna mäts mot. |
| **10M** | Rivalernas ansikten | **En fiktiv ordförande per rivalhus, med namn, ett siluettporträtt och ett sigill ur tillgångsfabriken.** Ägarens genererade porträtt ersätter siluetten om de kommer. |
| **10N** | Ljudeffekter | **Syntetiseras i repot** (`build:sfx`, ffmpeg) så att krokarna inte längre är tysta. Ägaren lyssnar i speltestet; en effekt som inte håller måttet tas bort och kroken lämnas tyst. CC0-inspelningar ersätter dem fil för fil om ägaren skaffar sådana. |
| **10O** | Antal händelser per kvartal | **Högst ett beslut och en förstasida per kvartal, och högst tre telexrader.** |

---

## 3b. Speltestet 2026-10-06 och ändrad ordning

Ägaren spelade den aktuella versionen 2026-10-06 och lämnade sex synpunkter. Var och en är kontrollerad
mot koden samma dag. De räknas som ägarens halva av P139.

| # | Synpunkt | Vad koden visar |
|---|---|---|
| S1 | Delar av texten är på svenska | Bara kartans teckenförklaring: 45 strängar i `app/mapLegend.ts`, 2 i `MapLegend.tsx`, 1 i `TheatreMap.tsx`. Inget test kontrollerar språket. |
| S2 | En röd pil på kartan betyder ingenting | Det är sektorn `ho-chi-minh-trail`, en fylld polygon i `sectorRegions.ts:79-97`. Den är kartans enda stora färgyta, etiketten döljs, och ett tryck öppnar bara teckenförklaringen. P81a förklarade den i text i stället för att rita om den. |
| S3 | Knappar och vyer saknar förklaring och synlig effekt | Actions-menyn visar ikon och namn; ett tryck byter flik utan förval (`App.tsx:731`). De sex underrättelseverben visar bara kostnad, fast `previewAction` räknar ut chansen. `InfoTooltip` finns bara i HUD:en. `VERB_TOPIC` i handboken anropas inte av någon komponent. 16 av 22 handlingsutfall i `applyActions.ts` är `ticker` och syns inte i uppspelningen. |
| S4 | Produktionen känns meningslös | Fyra identiska linjer; `BUILD_LINE` ger en kopia direkt. Mätt över 30 partier: linjeutnyttjande 36 % (`human`), 27 % (`balanced`), 49 % (`aggressive`); ingen bot bygger en linje. |
| S5 | Oklart vad stationer gör | Ingen skärm säger vad en station är. Två grindar är döda: täckningen `'cabinet'` går aldrig att skaffa, så tjänstemäns integritet och agenda är alltid okända (`queries.ts:451`); en station som dragits tillbaka kan aldrig öppnas igen. Handbokens påstående om tjänstemän stämmer inte. |
| S6 | Kartan är en stillbild | Bara RVN och Laos är tryckbara. Sektorer, förband och frontlinje öppnar teckenförklaringen. Kontrakt, materielbehov, rivaler, embargo, upphandlingar och frontens status visas inte. `MovementArrow` är oanvänd. |

Funnet vid kontrollen: en anställning (`HIRE`, +15 från 45) ger ingen effekt förrän rollen passerar 70 och
säger det inte; `infantry` saknas bland specialiseringarna i `NewGameScreen.tsx`.

**Beslut (ägaren, 2026-10-06):**

- **10P — Ny ordning.** (1) Begriplighetspaketet, (2) kartan som arbetsyta, (3) anläggningarna som egen
  etapp 11, (4) resten av 10A, (5) 10B. Beslut 10A ("10A i sin helhet före 10B") gäller fortfarande, men
  10A pausas efter P140 tills etapp 11 är klar.
- **10Q — Produktionen blir ett stort system** som inte går att strunta i. Det är för stort för 10A och
  blir etapp 11 (`docs/ETAPP11_FORSLAG.md`). Skälet till ordningen: P141 och P147 balanserar annars en
  ekonomi där kapacitet inte spelar någon roll, och P145 delar upp en sida som etapp 11 bygger om.
- **10R — P158 flyttas fram** till kartpaketet och stryks ur kapningsordningen i §14.
- **10S — P145 utgår.** THE COMPANY byggs om av etapp 11. Skärmarna för det som saknar en (§8 punkt 2)
  flyttas till P146.
- **10T — P141:s mätning görs om** efter etapp 11, innan omläggningen bestäms.
- **10U — P141 utökas efter etapp 11 (2026-10-07).** Prompten bär också de rader i etapp 11:s måltabell
  som P186 inte nådde, och stoppregeln i §6 punkt 0 byts ut. Se "Tillägg efter etapp 11" i §6.
- **10V — Först på plats (2026-10-08).** Rivalernas konstruktionstidtabell skjuts inte. Raden blir "nåbar
  i test, ingen frekvensgräns i botspel" och mäts om efter P188, där forskningen ska börja löna sig.
- **10W — Hävda kontrakt.** Ingen ny regel. Fusket har redan en verklig risk (32 % av spåren kommer fram,
  `human-clean` vinner mer än `human-dirty`). Raden revideras till "`human-dirty` får fler följder av
  spår än `human-clean`".
- **10X — Forskningen ska löna sig.** `human-noresearch` vinner 70 % mot `human` 59 %, så etapp 9:s system
  är en kostnad utan vinst i botspel. Det rättas i en egen prompt, **P188**, se §7.
- **10Y — Tonen i händelsetexterna.** P149:s texter är granskade (2026-10-08) och godkända: de säger vad
  som hände, med datum och källa, utan värdeord. My Lai-efterordet godkänns som det står. Texterna för Tet
  och marschen mot Pentagon granskas när P150 är skriven.
- **10Z — `historyEffects`** är provisoriska till P160, som specen redan säger. Ingen åtgärd nu.
- **10Å — Ordning.** P187 (etapp 11) och P188 körs nu. Därefter speltestar ägaren (P148 och P184
  tillsammans), och först sedan körs P150.

### Begriplighetspaketet (P162–P164)

Inga regeländringar. Golden orörd.

- **P162 — Språk och snabba rättningar.**
  - Teckenförklaringen översätts. Ett test fäller svensk text i `packages/app/src` (å, ä, ö och en
    ordlista), med utvecklarsidan undantagen.
  - Ho Chi Minh-leden ritas som en streckad transportled med synlig etikett, inte som en fylld yta. Vem
    som håller den visas på leden, inte som färg över halva Laos.
  - `HIRE` visar rollens tröskel, nuvarande värde och vad som händer när tröskeln passeras.
  - `infantry` läggs till bland specialiseringarna.
  - Handbokens uppslag om underrättelse rättas mot koden.
- **P163 — Handlingskortet.** Ett gemensamt kort för alla verb, läst ur `previewAction`:
  - en mening om vad verbet gör, kostnad, chans (eller "unknown" utan underrättelse), vad du får och vad
    du riskerar
  - en länk till handboksuppslaget (`VERB_TOPIC` får sin första läsare)
  - Actions-menyn får en rad förklaring per verb, och ett tryck öppnar rätt mapp med verbet förvalt
  - varje panel får en info-ikon; ett test fäller en panel utan
  - stationskortet säger vad en station är och listar vad just den ger: prisbandets bredd, köparens
    villkor, förbandens styrka, upplåsta verb, och vad nästa djupnivå skulle ge
- **P164 — Resultatrapporten.** Efter varje kvartal: "Your actions", en rad per handling med utfallet
  och orsakskedjan (`causeId`), även för utfall som är `ticker`. Avvisade handlingar står i samma lista.

### Kartan som arbetsyta (P165–P166, P158)

Gränssnitt. Golden orörd.

- **P165 — Tryck ger besked.** Ett informationskort i kartans nederkant för det valda föremålet, utan
  att kartan lämnas: land, sektor, förband, frontlinje, station, försörjningslinje. Alla länder blir
  tryckbara. Teckenförklaringen öppnas bara från sin egen knapp.
- **P166 — Lager.** Växlingsbara lager med tal, inte bara färg: *Orders* (öppna ordrar, husets kontrakt
  och materielbehov per köpare), *Supply* (leveranser, egna och rivalers), *Rivals* (marknadsandel och
  kontrakt per land), *Intelligence* (stationer, djup, vad som är okänt), *Politics* (relationer, opinion,
  embargo, upphandlingar). Krig eller vapenvila syns på frontlinjen. NLF får en egen markering.
- **P158 — Kvartalet spelas upp på kartan** (§11 punkt 1), flyttad hit.

### Regelrättningar (P167)

- **P167 (regel, golden får frysas om enligt 10D).** Stationens täckning växer med djupet, så att
  `'cabinet'`, `'military'` och `'industry'` går att nå. En vilande station kan öppnas igen mot en
  kostnad. Vakterna körs före och efter.

---

# DEL 10A — SLIPNINGEN

Ingen ny mekanik. Varje punkt nedan rättar, slår på, tar bort eller visar något som redan finns.

## 4. Speltest och kvittering

Tre speltest är ogjorda: P95 (etapp 7), P105 (etapp 8) och P138 (etapp 9). Ingen människa har spelat
sedan P81. 10A börjar därför med ett enda samlat speltest.

- Kodsessionen slår ihop de tre checklistorna till `docs/SPELTEST_SAMLAT.md`, högst en sida, ordnad
  efter skärm.
- Ägaren spelar tre partier på telefon: ett som ritar och fuskar, ett som håller sig rent, ett som inte
  ritar alls.
- Synpunkterna sorteras som i P81: numrerade, placerade i en prompt i 10A, i 10B eller utanför etappen.
- Samtidigt kvitterar ägaren besluten 10B och 10C.

Speltestet får ändra ordningen och innehållet i §5–§8. Det är avsikten.

## 5. Mätningen

Det går inte att slipa det som inte mäts rätt.

1. **`suspensions` räknar rätt** (0.14): bara rubriken från `traces.ts`, inte de avvisade buden.
2. **Fältrykteskvartilen mäts.** Den fetstilta raden i etapp 9 mättes aldrig.
3. **Botarna använder det som byggts** (0.13). `human` får `FIELD_TRIAL` och uppgradering.
   `human-dirty` får `LOWBALL` och sabotage mot en upphandling. `human-clean` får anmälan av en rival.
   En ny `human-engineer` använder `REVERSE_ENGINEER` och satser.
4. **Känslighetsverktyg.** Härnessen får ett läge som ändrar ett balanstal i taget med ±25 % och mäter
   hur mycket `human`s vinstandel rör sig. Resultatet är en rangordnad lista över vilka tal som spelar roll.
5. **Provisoriska tal.** Med listan ur punkt 4 delas talen i tre grupper: *fastställda* (påverkar, är
   avvägda), *okänsliga* (påverkar inte mätbart, fryses som de är) och *öppna* (påverkar, inte avvägda).
   Noterna i `balance.json` skrivs om efter det. Målet är färre än 30 öppna tal när 10A är klar.

## 6. Mekanik som är av eller nedskruvad

**Grundorsaken** är gemensam för alla fyra talen i 0.10–0.11. Scenariot har en uppdämd efterfrågan, och
allt som släpper loss den gör partiet lätt för alla botar, också de som inte gör något. P118 visade det:
med `blocTechLevelStep` på gick `passive` från 0 till 96 % vinst.

Åtgärden är därför inte att skruva de fyra talen, utan att rätta det de slår emot:

0. **Mätning först.** P141 börjar med att mäta var den uppdämda efterfrågan sitter och vad en omläggning
   gör med alla botar, utan att ändra någon regel. Flyttar omläggningen `human` mer än 15 procentenheter
   åt något håll stannar prompten och frågar, och punkt 3 gäller i stället.
1. **Efterfrågans uppbyggnad läggs om** så att den följer krigets förbrukning turen den uppstår, i
   stället för att samlas på hög bakom tekniknivån. Det är samma grepp som P53a tog för `materielNeed`.
2. **Därefter slås de fyra på, en i taget,** med vakterna körda mellan varje:
   - `blocTechLevelStep`: köparnas tekniknivå följer blockets generation.
   - `techMarginWeight` och `specialisationBidBonusPct`: mot specens ursprungliga nivå.
   - `counterDemandOrders`: motmedelskedjan ger märkbar efterfrågan.
3. **Den som inte går att slå på tas bort** ur kod, data och gränssnitt, med loggrad (princip 1).

### Tillägg efter etapp 11 (beslut 10U, 2026-10-07)

P186 visade vad den uppdämda efterfrågan kostar sedan verken byggdes. Köparnas tekniknivå är 2, 1 och 1,
så marknaden består av infanteri och artilleri, cirka 2,2 Mkr per kvartal. Behovet är 1–1,5 linjekvartal
per kvartal mot startverkets två linjer. Linjerna går därför 18–25 % av tiden, och den som specialiserar
sig på en annan kategori har ingen marknad.

P141 gäller som den står ovan, med fyra ändringar:

1. **Stoppregeln byts.** Punkt 0 sa att prompten stannar om omläggningen flyttar `human` mer än 15
   procentenheter. Den skrevs före etapp 11. Nu är avsikten att marknaden ska ändras, så regeln blir:
   mätningen görs först och redovisas, sedan fortsätter prompten. Den stannar och frågar bara om ingen
   kalibrering håller `human` inom 40–70 % med vakterna orörda.
2. **Målen är etapp 11:s måltabell** (`docs/ETAPP11_FORSLAG.md` §9), främst raderna som inte nåddes:
   utnyttjande 70–90 %, byggda anläggningar 3–6 per parti, full tomt i 30–60 % av partierna,
   driftsbeslut i minst 60 % av kvartalen, `human-specialist` minst 35 %, `human-outsource` 20–50 %.
   De fem rader som nåddes i P186 ska fortfarande hålla. `human-broad` ska ligga under taket 90 %.
3. **Kassadalen kvartal 6–9 hör hit.** Lägsta kassa per kvartal mäts för varje `human`-variant före och
   efter. Startvärde för målet: `human` går i konkurs i högst 10 % av partierna (18 % efter P186).
4. **Tre följdfrågor från etapp 11 avgörs här:** små köpares budgetar (NLF, Laos) mot kontrakt på
   3–4 Mkr (11X), fältprovets sats återställs till storleken före P185 (11Y), och `boardTarget.threshold`
   kalibreras om sedan marknadens värde ändrats (11W).

Spakar för kalibreringen, i den här ordningen: styrelsens tröskel, köparnas budgetandel, orderstorlekarna,
linjernas takt. Spelbarhetstestets gränser och `capacity`-referensen ändras bara efter ägarens beslut.
Huvudleverantörsregeln, byggnadslånet och fristen som växer med ordern (P185–P186) ändras inte.

> **Utfall P141 (2026-10-07; 100 partier per bot om inget annat anges, `indochina-slice`).**
>
> **Steg 0 — mätningen, ingen regel ändrad.** *Var den uppdämda efterfrågan sitter:* behovet (summa för de tre köparna, medel över 60 partier) växte under partiet i alla kategorier — infanteri 180 → 670, artilleri
> 36 → 119, pansar 24 → 84, flyg 6 → 24, marin 6 → 14, elektronik 18 → 81 — men köparnas tekniknivå (2/1/1) släpper bara fram infanteri och artilleri (pansar, marin och elektronik kräver 3, flyg 4). Pansar, flyg, marin
> och elektronik låg alltså på tio gånger utlysningströskeln (8/2/2/6) utan att kunna beställas. *Men högen är liten mot en order:* 28 pansarenheter per köpare efter tjugo kvartal mot en minsta order på 30, så den
> släpper inte loss en störtflod när tekniknivån stiger — den ger en order. Det som faktiskt sätter marknadens storlek är (a) köparnas budgetar (`militaryBudgetQuarterlyShare` 0,08 × statskassorna 28 Mkr = 2,2 Mkr
> per kvartal) och (b) att en kategori utlyser en order när behovet når tröskeln och sedan golvas till 0 (fredspåfyllningen är 12/2/1/0,3/0,2/1 per kvartal), vilket ger en lucka i kvartal 2–4 (0,0–1,0 nya ordrar) efter de
> tre första ordrarna i kvartal 1. *Marknadens värde:* 1,0 order per kvartal, ordinarie ca 2,2 Mkr per kvartal, bara infanteri (7,6 ordrar per parti) och artilleri (12,1). *Kassadalen (`human`):* medelkassan faller från
> 4,0 Mkr till 0,1–0,4 Mkr vid kvartal 5–9, lägsta enskilda −0,5 Mkr, median −0,03 Mkr vid kvartal 9, 18 % konkurs, och slutar på −0,56 Mkr (median) vid kvartal 20. *Utgångsläget mot etapp 11:s måltabell:* se
> `docs/ETAPP11_FORSLAG.md` §9 (kolumnen "före").
>
> **Steg 1 — omläggningen (`unmetNeedBacklogFactor` 2, `orders.ts` `holdUnmetBacklog`).** Ett behov som köparen inte kan beställa hålls vid två gånger utlysningströskeln i stället för att samlas på hög bakom
> tekniknivån (samma grepp som P53a). Enligt mätningen ovan flyttar det ingen order i dag; det hindrar att en höjd tekniknivå släpper loss en hög. Golden flyttade (egen commit). Ärligt: **efterfrågan begränsas av
> budgeten och tröskeln, inte av tekniknivån** — det är därför steg 2a behövde en större budgetandel.
>
> **Steg 2 — det som slogs på, en i taget, med vakterna körda mellan varje (golden omfryst i egen commit för var och en; attribuerat genom att sätta tillbaka det gamla värdet med ombyggd dist):**
> - **2a `blocTechLevelStep` 0 → 1** med `militaryBudgetQuarterlyShare` 0,08 → 0,24 och styrelsetröskeln 3,4 → 9. Steget ensamt vid 0,08 gav `human` 5 % vinst och 25 % konkurs vid varje tröskel (0,08: marknaden för liten för
>   bredare kategorier); steg 2 (två nivåer) gav samma bild som steg 1. Efter kalibreringen: `human` 43–58 %, ingen bot över 90 %.
> - **2b `techMarginWeight` 0,25 → 2 och `specialisationBidBonusPct` 1 → 10** (specens ursprungliga nivåer) med tröskeln 9 → 11. Vakterna höll (`human-broad` bröt taket vid 10,5 med 28/30 och håller vid 11).
> - **2c `counterDemandOrders` 0,25 → 1** med oförändrad tröskel (11): `human-builder` vann 28 % med 17 % konkurs (var 8 %), `human` 51 %.
> - **Inget togs bort:** alla tre gick att slå på med vakterna orörda.
>
> **Steg 3 — följdfrågorna.** *11X (NLF/Laos budgetar):* NLF och Laos står redan för ungefär hälften av ordrarna (20 av 40 per parti); en höjning av startbudgetarna (4,0/2,5 och 6,0/4,0 Mkr, 100 partier) sänkte `human` 51 → 38 % och
> `human-builder` 28 → 22 % utan att flytta någon rad som inte nåddes — **lämnas som de är**. *11Y (fältprovet):* `fieldTrialBatchFraction` 0,25 → 0,0625 (kanon 5 enheter som före P185, pansarbil 2 (3), helikopter och båt 1,
> radio 3 (5); i pund inom 0,7–4× av före P185 för varje produkt). *11W (styrelsetröskeln):* 11, kalibrerad mot det nya marknadsvärdet (ca 7 Mkr per kvartal). *Följd:* inkörningens andel steg från 17 % till 44 % (mer
> tillverkning per linje: 3,2 fördubblingar mot 1,7), så `runInCostPerDoubling` 3 → 2 håller raden (27 %).
>
> **Prövat och förkastat (40–100 partier):** orderstorlekar × 2 (`human` föll till 3–13 % vid samma tröskel; vid tröskel 12 gav det `human-outsource` 98 % och `human-broad` 95 %); linjetakt × 0,5 med orderstorlekar × 0,5
> (`human` 85–100 %, `capacity` 8 % vinst / 40 % konkurs — bryter capacity-referensen); fredspåfyllning × 2–3 och `equipmentAttritionCoupling` × 2 (utnyttjandet 28 → 31–35 %, `human-outsource` 70 %); budgetandel 0,4–0,6
> (utnyttjandet 33 %, ingen rad flyttar); spridda startbehov per köpare (flyttar luckan, tar inte bort den; borttaget igen); en justering av `human-specialist` (bygger först efter första leveransen: 0 % vinst oförändrat;
> återtagen).
>
> **Kassadalen före och efter (`human`, medel/median av lägsta kassa, Mkr):** kvartal 7: 0,21 / 0,14 → 0,21 / −0,01; kvartal 8: 0,30 / 0,36 → 0,16 / 0,08; kvartal 9: 0,12 / −0,03 → 1,39 / 1,37; kvartal 10: 0,80 / 0,85 →
> 2,21 / 2,33; kvartal 20: −0,42 / −0,56 → 3,88 / 3,51. Konkurs 18 % → 0 %. **Dalen i kvartal 5–8 finns kvar (medianen runt noll)** — den följer av att inga kontrakt är bokförda de första fyra kvartalen medan husets fasta
> kostnader och tillverkningen löper — men huset kommer ur den ett till två kvartal tidigare och slutar med 3,5–3,9 Mkr i stället för underskott.
>
> **Raderna i etapp 11:s måltabell, före och efter:** se `docs/ETAPP11_FORSLAG.md` §9. Nådda: `human` 47 % (konkurs 0 %), +47 pp mot `human-static`, `human-builder` konkurs 18 %, `human-broad` 80 %, `human-outsource` 33 %,
> inkörningens andel 27 %. **Inte nådda:** utnyttjande 28 % (70–90), `human-specialist` 1 % (≥ 35), driftsbeslut 44 % (≥ 60), full tomt 0 % (30–60), nya anläggningar 1,8 per parti (3–6; med utbyggnader 3,8), sena leveranser
> 1,0 (gräns 1–4: precis på). **Varför:** en ren artillerispecialist kan inte nå styrelsemålet i en marknad där hälften av värdet är infanteri och låst för den som inte byggt ett verk (artilleri är ca 1,2 ordrar per kvartal);
> `human` har i genomsnitt 3,5–4,7 aktiva kontrakt men ett bygge per kontrakt går på *en* linje, så linjerna (som boten fyller på till 7,5 mot slutet) går 28 % av tiden. Det är en spak i regelns form (marknadens form, ett kontrakt
> på flera linjer, eller kapaciteten som kostnad), inte ett tal.

## 7. Fusket, kapplöpningen och konstruktionerna

**Fusket** (delfråga 2). I dag kommer 12 % av spåren fram, inget kontrakt hävs, och det smutsiga huset
vinner inte fler upphandlingar än det rena.
- Knepen ska ge tydlig vinst i provet. Annars finns ingen frestelse.
- Spårens chans att komma fram höjs till målet 30–60 % under ett parti.
- Följden "hävt kontrakt" ska inträffa. I dag når ingen kedja dit.
- Huset vinner i dag omkring en tiondel av sina anmälningar mot rivaler. En anmälan med underrättelse i
  landet ska oftast lyckas.

> **Utfall P143 (2026-10-08).** Spår som kommer fram ca 32 % (mål 30–60, nådd). Anmälan med underrättelse lyckas (100 % av de som görs; boten anmäler bara misstänkta). `human-clean` 45 och `human-dirty` 35 (båda ≥ 35, dirty på gränsen); dirty vinner fler upphandlingar (0,52 mot 0,15). **Hävda kontrakt inträffar men sällan (ca 0,03 per parti) — raden "fler hävda kontrakt än clean" är sann men svag; en riktig åtgärd är en regel (fler spår med kontrakt, eller att ett avslöjat spår hävt en redan levererad order), ägarbeslut.** Mätfelet i `voidedByScandal` rättat. Se ANDRINGSLOGG.

**Kapplöpningen.** Generationsschemat omprövas (beslut 10B) så att gap-chockerna blir 1–3 per parti.
- De 17 tester som låser stegen till tur 4, 8 och 12 skrivs om mot det nya schemat.
- "Först på plats" inträffar aldrig i botspel. Villkoret ses över så att ett hus som satsar kan nå det.
- Att sälja till båda sidor ska synas på doomsday (mål +10, i dag +1).
- `aggressive` slutar i kärnvapenutbyte i 21 av 200 partier. Talen från P121 avvägs mot det.

> **Utfall P142 (2026-10-08).** Gap-chocker 2,7 per parti (nådd), båda sidor +10 doomsday (nådd, aggressive 0 kärnvapenutbyten av 60), 17 stegtester omskrivna. **Först på plats nås inte i botspel** (rivalernas konstruktioner kommer före husets; en senare tidtabell kostade `human` 6 pp) — raden revideras till "nåbar i test, inte i botspel" tills ägaren avgör om rivaltidtabellen ska skjutas. Se ANDRINGSLOGG.

**Konstruktionerna.** Egna konstruktioner står för 18 % av intäkten (mål 30–60 %), och olycksfåglar
inträffar i 0,09 fall per parti.
- Bristrisken och miljöerna avvägs så att en olycksfågel inträffar i 10–25 % av partierna.
- Linjeomställning vid byte till ny konstruktion (premissfyndet i P112) avgörs: byggs eller stryks ur specen.

> **Utfall P144 (2026-10-08).** Unga konstruktioners intäkt ca 31 % (nådd), olycksfåglar i 11–15 % av partierna (nådd), linjeomställning redan byggd i P171 (stryks), civila boten lagad (laboratoriet), exportbrott 0 i botspel (raden reviderad: nåbar i test, ingen frekvensgräns), epilogens civila rad byggd. Se ANDRINGSLOGG.

### P188 — forskningen ska löna sig (regel, beslut 10X)

**Fyndet (P147):** `human-noresearch` vinner 70 %, `human` 59 %. Forskning och egna konstruktioner kostar
mer än de ger i botspel.

1. **Mätning först, ingen regel ändras.** Vad kostar forskningen per parti (spår, labb, ritkontor,
   provning) och vad ger den (bud som vinns tack vare `techTerm`, `designBidTerm`, specialiseringen och
   tekniknivåns grind; kategorier som öppnas när köparnas tekniknivå stiger)? Redovisa var kostnaden
   och nyttan sitter, per kvartal.
2. **Tal**, i den här ordningen: forskningens kostnad, `techMarginWeight`, `designBidWeight`.
3. **Om talen inte räcker: en regel.** Köparens tekniska golv följer blockets generation, så att en produkt
   eller konstruktion som ligger mer än en generation efter köparens block inte kan bjudas. Det gör
   utfasningen verklig för den som inte forskar.
4. Stanna och redovisa om varken talen eller regeln når målet med vakterna orörda.

**Mål:** `human` minst 10 procentenheter över `human-noresearch`. `human-noresearch` ska fortfarande vinna
minst 30 %, så att det är en sämre väg och inte en omöjlig. `human` 40–70 %. Först på plats mäts om
(10V). Golden får frysas om en gång per regeländring, i egen commit (10D).

> **Utfall P188 (2026-10-08; regel, golden omfryst i egen commit).**
> **1. Mätning (ingen regel ändrad; `human` mot `human-noresearch`, 100 partier, gemensamma frön 150).** Forskningen kostar litet och ger ingenting: R&D- och konstruktionsöverhead 0,99 Mkr per parti (`fixedCosts.rndOverhead`), politiska utlägg
> 0,37 mot 0,20 (upphandlingarna), omställning 0,13 — ca 0,5 Mkr av ca 30. Intäkten är i stället *lägre* för `human` (22,5 + 7,0 mot 23,7 + 7,7 Mkr; 13,9 kontrakt mot 16,0). Nyttan: **tekniktermen är redan tak** (`techMarginWeight` × min(2, nivå − krav):
> husets nivåer 7 och 4 mot produktkrav 1–4 ger maxbonus utan forskning), **tekniknivåns grind stänger 3,0 av 51 ordrar per parti för båda**, och köparnas nivå når högst 4 vid tur 20, så inget efterfrågar mer teknik än huset har. `human`s forskningsspår
> startade aldrig (`researchStandingOrders` krävde överskott över grundkapitalet och räknade ett designprojekt som ett spår): tekniknivåerna är oförändrade i alla partier. Delat i gemensamma frön (tröskel 9,5): `human` 69, `human-noresearch` 77,
> bara spår 77, konstruktioner utan upphandlingar 67, upphandlingar utan konstruktioner 79 — **konstruktionerna kostar 8–10 procentenheter** (1,1 konstruktionsbud per parti, 0,9 vunna, men 24,3 bud mot 26,0: omställningen för en konstruktion
> förlänger "ready by" och släpper igenom färre bud), upphandlingarna är neutrala.
> **2. Talen (i angiven ordning).** Forskningens kostnad: ca 1 Mkr per parti, flyttar ingenting. `designBidWeight` 40 → 60/90/140: `human` 70/71/74 mot 77 — gapet förblir negativt. `techMarginWeight` 3/4/6/8: `human` 67/82/85/85 och
> `human-noresearch` 79/68/77/84 — icke-monotont och olika för varje värde (partiet ligger vid styrelsetröskeln), alltså ingen stabil spak. Talen räcker inte.
> **3. Regeln.** En standardprodukt (utan konstruktion) har generation 1 + tekniknivån över startnivån (`stockGeneration`, `stockGenerationTechBase` 4, `stockGenerationSpecialisedBase` 7 — bundna till scenariots `techLevelDefault` och bonus av
> `stockGeneration.test.ts`) och får inte bjudas när den ligger mer än en generation efter köparens block (`stockBidRejection`, samma gräns som en konstruktion: `designPhaseOutKeep`). Den sitter i `bidDesignRejection` (ett bud utan konstruktion),
> `validateBid` (ordern är låst när standardprodukten är utfasad och ingen konstruktion kan bjudas) och `bidding.ts` (rubrik: *… PRODUCT IS A GENERATION BEHIND THE BUYER'S BLOC*); budmappen låser ordern med skälet och döljer STANDARD. Blockens tredje
> generation kommer tur 17 i artilleri och flyg och tur 13 i marin, så regeln träffer den som inte forskat sist i partiet (artilleri är ca hälften av intäkten). `human` sätter nu forskningsspåret i artilleri från start (ett projekt, nivå 7 → 8 = generation 2)
> och bjuder inte med en utfasad standardprodukt. `boardTarget.threshold` 9,5 → 9,0 (regelns data: den sänker alla botar). `stockGenerationEnabled` 0 stänger regeln.
>
> | Rad | Mål | Före | Efter | |
> |---|---|---|---|---|
> | `human`, `SCENARIO_COMPLETE` | 40–70 % | 59 | **67** (gemensamma frön 69) | nådd |
> | `human-noresearch` | ≥ 30 % | 70 | **32** (33) | nådd |
> | `human` mot `human-noresearch` | ≥ +10 pp | −11 | **+35** | nådd |
> | Övriga: `-robust` / `-advanced` / `-bothsides` / `-clean` / `-dirty` | – | 40 / 86 / 58 / 64 / 57 | 66 / 79 / 67 / 72 / 71 | |
> | `balanced` / `balanced-pwc` / `aggressive` / `passive` / `capacity` | – | 37 / 40 / 0 / 0 / 0 | 40 / 52 / 0 / 0 / 0 | |
> | `capacity`, BUYOUT | 96,7 ± 10 | 94 | 94 | referensen håller |
> | Först på plats, `human` / `human-advanced` | förekommer (10V) | 0 / 11 % | 0 / 4 % | oförändrad: nåbar i test, ingen frekvensgräns i botspel |
>
> **Vakterna orörda:** spelbarhetstestet (ingen bot över 90 %, bästa ≥ 30 %) och `capacity`-referensen gröna utan revidering. **Bieffekt (ägarbeslut):** forskningen till nivå 8 öppnar `mk9_longhand_shell` (krav 8), och varje leverans lägger
> 14–23 på doomsday — `human` får `NUCLEAR_EXCHANGE` i 6–7 % av partierna (var 0 %) och doomsday-toppen stiger 40 → 61; utan spåren (bara konstruktioner) 0 %, bara spår 1 %. Det är pelare 1:s fråga i ett nytt ljus, inte ett fel: forskning
> är vägen till kärnvapenskalet. **Konstruktionerna** förblir en kostnad i botspel (bara spår 87 % mot `human` 67 %, konstruktioner utan spår 43 %); det kräver en egen åtgärd om det ska rättas (bristrisk, omställning eller att boten bjuder med
> konstruktion bara när den vinner tydligt). Se ANDRINGSLOGG och `docs/SPELTEST_ETAPP10A.md`.

**Del F.** `human-civil` går i konkurs i 59 av 200 partier, och exportbrott inträffar aldrig i botspel.
Båda avvägs. Epilogens utlovade slut för det civila huset byggs eller stryks.

## 8. Gränssnittet i 10A

1. **THE COMPANY delas upp** (0.17). Sidan blir fyra lådor med var sin flik överst:
   *Books* (balans, styrelse, huvudbok, nästa kvartal), *Works* (linjer, stående order, råvaror),
   *Drawing office* (ritbord, typblad, konstruktörer, forskning) och *Legal* (pappersspår, utredningar,
   licenser). Inget innehåll ändras, bara var det ligger.
2. **Det som saknar skärm får en** (0.12):
   - motmedelskedjan på kapplöpningstavlan
   - köparens preferensmix i ordermappen (bara med station)
   - först på plats och måttstocken på typbladet
   - `LEAK` mot en bedömning i landmappen
3. **Handledningen** får tre steg till: rita en konstruktion, anmäl dig till en upphandling, svara på ett
   utredningskort. Samma icke-grindade form som P91a.
4. **Handboken** får uppslag för det som tillkommit sedan P91b och saknar ett.
> **Utfall P146 (2026-10-08).** Byggt: punkt 2 (alla fyra skärmarna: kedjan och först på plats på tavlan, preferensmixen i ordermappen, först på plats/måttstock på typbladet, ryktet i landmappen), punkt 3 (tre sena handledningssteg, tur 3–12) och punkt 4 (två nya handboksuppslag, *The Arms Race* och *The Paper Trail*; tre nya PM). Punkt 1 (THE COMPANY i fyra lådor) gjordes redan av P179. Se ANDRINGSLOGG.

5. Regel 17 och 18 gäller: `npm run shots` och klippningstestet för varje ny eller flyttad skärm.

---

# DEL 10B — VÄRLDEN SVARAR

## 9. Historiska händelser

### 9.1 Tre slag

| Slag | Vad spelaren ser | Effekt | Antal |
|---|---|---|---|
| **Beslut** | Ett helskärmskort i kvartalsuppspelningen, med två eller tre svar | Svaret har verklig effekt | 8 |
| **Förstasida** | En tidningssida i uppspelningen och överst på NEWS DESK | En liten, fast effekt | 11 |
| **Telex** | En daterad rad i NEWS DESK under avdelningen *World* | Ingen eller mycket liten | omkring 20 |

Varje händelse visar sitt verkliga datum. Ett kvartal har högst ett beslut, en förstasida och tre
telexrader (10O).

### 9.2 Hur det byggs

- **Data, inte kod.** Händelserna ligger i `core/data/history/indochina.json`. Varje post har `id`,
  `date`, `quarter`, `kind`, `headline`, `body`, `source`, `condition`, `effects` och, för beslut, `responses`.
- **Nytt pipeline-steg `history`** direkt efter `applyActions` (10E). Det slår upp kvartalets händelser,
  prövar villkoren och tillämpar effekterna, så att de verkar på samma kvartals fronter, heat och ordrar.
- **Effekterna går genom befintliga funktioner:** `addDoomsday`, heat, `materielNeed`, råvaruindex,
  relationer, opinion, kapplöpningens takt, spårens risk. Alla tal ligger i `balance.json`.
- **Varje effekt ger en `WireEvent`** med `scope: 'global'` och `causeId: 'history:<id>'`. NEWS DESK och
  krönikan känner igen händelsen på det prefixet. `WireEvent` får inget nytt fält.
- **Svaret är en stående order** (`HISTORY`), som utredningskortet: ingen handling, frist ett kvartal,
  och ett angivet standardsvar om spelaren inte svarar.
- **`GameState.history`** minns vilka händelser som inträffat och vad spelaren svarade. Epilogen läser den.
- **Underrättelse ger förvarning.** Med en station i landet syns ett rykte om teaterhändelser kvartalet
  innan. Hemliga händelser (Barrel Roll) syns bara med station.
- **Krönikan** får slaget `history`.

### 9.3 De åtta besluten

Datum och källor står i bilaga A. Effekterna är riktningar; talen sätts i balanspasset.

| Kvartal | Händelse | Vad den gör | Husets svar |
|---|---|---|---|
| 1964 Q3 | **Tonkinbukten**, 2 augusti; resolutionen 7 augusti | Kriget trappas upp. Materielbehovet stiger hos båda sidor, doomsday stiger. | **Bygg ut nu:** en linje till halva tiden, dyrare. · **Säkra råvaror:** leverantörsavtal till dagens index. · **Avvakta.** |
| 1965 Q2 | **TSR-2 läggs ned**, 6 april | Ett helt konstruktionskontor står utan arbete. | **Anställ ur konkursboet:** en chefskonstruktör till halva priset. · **Köp ritningarna:** forskningsförsprång i flyg. · **Låt rivalerna ta dem:** en rival får konstruktören. |
| 1966 Q3 | **Starfighter-krisen**, flygvapenchefen avskedas 25 augusti | Köpare väger tillförlitlighet tyngre i flera kvartal. | **Öppna böckerna:** frivillig granskning av en egen konstruktion, bristen avslöjas om den finns, redbarheten stiger. · **Tig.** · **Peka på en rival:** läcka mot en rivals konstruktion, med spår. |
| 1967 Q2 | **Sexdagarskriget**, 5–10 juni, och Frankrikes embargo | Betalda flygplan levereras aldrig. Köpare ser att en leverantör kan stänga kranen. Pansar och flyg i kapplöpningen går fortare. | **Lova leveranssäkerhet:** bindande klausul, högre poäng hos alliansfria köpare, vite om huset senare bryter. · **Sälj till den som stängts ute:** en engångsaffär utanför kartan, med exportspår. · **Avstå.** |
| 1967 Q3 | **Kongressen granskar M16**, utfrågningar 15 maj–22 augusti | Alla infanterivapen i fält granskas. Risken att en dold brist avslöjas stiger. | **Återkalla och åtgärda** en egen infanterikonstruktion. · **Skicka rengöringssatser:** billig sats, halverar risken. · **Skyll på handhavandet:** ingen kostnad, men blir det en olycksfågel räknas det som förnekande. |
| 1967 Q4 | **Marschen mot Pentagon**, 21 oktober | Fredsrörelsen når industrin. Rekrytering blir dyrare och opinionen i väst faller. | **Ligg lågt:** civil gren får fördel, vapenbuden ett litet avdrag. · **Bemöt:** kostar pengar, opinionen i hemstaten hålls uppe. · **Strunta i det:** personalrollen sjunker. |
| 1968 Q1 | **Tet-offensiven**, 30–31 januari (villkor: fronten i krig) | Stora förluster på båda sidor, akut materielbehov, opinionen i väst rasar. | **Leverera till överpris:** kassa nu, redbarhet och relation sjunker. · **Leverera till självkostnad:** relation och förskott stiger. · **Avstå:** en rival tar ordern. |
| 1968 Q2 | **Fredssamtalen i Paris**, maj (villkor: fronten i krig) | Trösklarna för vapenvila sänks i resten av partiet (10K). | **Motarbeta:** påverkan mot samtalen, dyrt, doomsday stiger, lämnar spår. · **Ställ om:** civil linje till halva startkostnaden. · **Vänta ut.** |

### 9.4 De elva förstasidorna

| Kvartal | Händelse | Effekt |
|---|---|---|
| 1964 Q2 | Kuppen i Laos, 18–19 april | Laos lägger inga nya ordrar det kvartalet |
| 1964 Q4 | Kinas första kärnvapenprov, 16 oktober | Doomsday stiger |
| 1965 Q1 | Rolling Thunder, 2 mars, och landstigningen vid Da Nang, 8 mars | Materielbehov och heat stiger i Indokina |
| 1965 Q2 | Thiệu och Kỳ tar makten i Saigon, 19 juni (villkor: ingen kupp i RVN av spelaren) | Relationen till RVN:s tjänstemän sjunker något om de inte uppvaktats nyligen |
| 1965 Q3 | Indisk-pakistanska kriget; USA och Storbritannien stoppar leveranser till båda | Alliansfria tjänstemän väger motköp och neutrala hus tyngre |
| 1966 Q1 | Fulbright-utfrågningarna, 4–18 februari, i tv | Opinionen i väst faller |
| 1966 Q2 | Buddhistupproret, 26 mars–8 juni (villkor: RVN består) | Leveranser till RVN försenas ett kvartal; opinionen i RVN faller |
| 1967 Q1 | Forskaruppropet mot växtgifterna, 14 februari | Redbarhetsryktet väger tyngre hos tjänstemän med hög integritet |
| 1967 Q4 | Pundet devalveras, 18 november, från 2,80 till 2,40 dollar | Importerade råvaror blir dyrare; husets priser blir konkurrenskraftigare utomlands i några kvartal |
| 1968 Q3 | Invasionen av Tjeckoslovakien, 20–21 augusti | Doomsday stiger; östanslutna hus tappar hos alliansfria köpare |
| 1968 Q4 | Bombstoppet, 1 november (villkor: fronten i krig) | Heat sjunker; vapenvilan kommer närmare |

Pundet är värt en särskild rad: spelets kassa räknas i pund, så det är den enda händelsen som slår
direkt mot huvudboken.

### 9.5 Telexraderna

En rad var, daterad, under *World*. Ingen eller mycket liten effekt. Urvalet: Chrusjtjov avsätts
(14 oktober 1964) · Storbritanniens vapenembargo mot Sydafrika (17 november 1964) · Barrel Roll över
Laos (14 december 1964, bara med station i Laos) · Västtyskland stoppar vapen till Israel (februari 1965)
· Dominikanska republiken (28 april 1965) · 30 september-rörelsen i Indonesien (1965) · Rhodesia
(11 november 1965) · den saudiska flygaffären (december 1965) · Frankrike lämnar Natos kommando
(7 mars 1966) · kulturrevolutionen (16 maj 1966) · FN:s första tvingande vapensanktioner (16 december 1966)
· rymdfördraget (27 januari 1967) · kuppen i Grekland (21 april 1967) · Glassboro (23–25 juni 1967) ·
Biafrakriget (6 juli 1967) · McNamara lämnar (29 november 1967) · F-111K avbeställs (16 januari 1968) ·
Pueblo (23 januari 1968) · Nam Bac faller (14 januari 1968) · Johnson ställer inte upp (31 mars 1968) ·
icke-spridningsavtalet (1 juli 1968) · lagen om statlig vapenförsäljning (22 oktober 1968) · Nixon väljs
(5 november 1968) · C-5A-vittnesmålet (13 november 1968).

### 9.6 Prologen och efterordet

- **Prologen** visas i genomgången före partiet: fem förstasidor som ger läget när huset öppnar.
  Grisbukten (17–20 april 1961), Kubakrisen (16–28 oktober 1962), det partiella provstoppsavtalet
  (5 augusti 1963), kuppen mot Diệm (1–2 november 1963) och mordet på Kennedy (22 november 1963).
- **Efterordet** i epilogen visar det som kom efter sista kvartalet: gränsstriderna vid Ussuri
  (2 och 15 mars 1969), och **My Lai**, som ägde rum 16 mars 1968 men blev känt först 13 november 1969.
  Efterordet säger det rakt ut: det hände under partiet, och ingen visste.
- Epilogen får också en **tidslinje**: partiets krönika bredvid historiens, kvartal för kvartal.

> **Utfall P149 (2026-10-08).** Byggt: steget `history` (direkt efter `applyActions`, beslut 10E), datafilen `core/src/data/history/indochina.json` (elva förstasidor, 23 telexrader, fem prologsidor, två efterord, alla med datum, källa och kvartal), `GameState.history`, krönikaslaget `history`, brytaren `historyEnabled`, äkthetstestet (`history.data.test.ts`), `FrontPageCard` i uppspelningen och på NEWS DESK, avdelningen *World*, prologen i genomgången, efterordet och tidslinjen i epilogen. **Inte byggt (P150/P151):** de åtta besluten, `HISTORY`-stående order, förvarning genom underrättelse, vapenvila mot spelarens vilja. Avvikelser: Nam Bac (14 januari 1968) ströks ur telexen — 1968 Q1 har annars fyra rader mot taket tre (10O); två förstasidor (indisk-pakistanska kriget, forskaruppropet) är ren text — spelet saknar de krokar effekten kräver. Se ANDRINGSLOGG.

### 9.7 Äkthetskravet

- Ett test underkänner en händelse som saknar `date` eller `source`, eller vars `quarter` inte stämmer
  med datumet.
- Texterna säger vad som hände, i en eller två meningar. Inga påhittade citat (10J).
- Tre datum är osäkra i källorna och skrivs som de är: dagen då USA och Storbritannien stoppade
  leveranserna 1965 ("september 1965"), dagen för Frankrikes embargo (2 eller 3 juni 1967) och dagen då
  Parissamtalen öppnade (10 eller 13 maj 1968).

---

## 10. Rivalerna som motspelare

### 10.1 Ansikte och hållning

- Varje rivalhus får en **fiktiv ordförande** med namn, ett **sigill** och ett siluettporträtt (10M).
- Varje rival har en **hållning** som gäller ett år i taget, till exempel "Brandt går efter RVN:s
  artilleri". Hållningen styr var rivalen bjuder hårt och vem den uppvaktar. Den syns bara med
  underrättelse.
- Rivalerna får egna **mappar**, som landmapparna, överst på CONTACTS.

### 10.2 Minne

- Varje rival får ett **agg** mot spelaren (0–100). Det stiger när spelaren saboterar, läcker, anmäler
  eller tar en order rivalen ville ha. Det sjunker långsamt.
- Agget avgör om och hur rivalen slår tillbaka. En `cautious` rival, som i dag aldrig gör något (0.7),
  agerar bara när agget är högt.

### 10.3 Drag mot spelaren

Rivalerna får sex drag. Alla är spegelbilder av verb spelaren redan har, så inga nya regler behövs.

| Drag | Verkan | Förvarning | Motdrag |
|---|---|---|---|
| **Uppvakta en tjänsteman** | Rivalens relation stiger; spelarens bud väger relativt lättare där | Syns i tjänstemannens mapp med station | Uppvakta själv |
| **Priskrig** | Rivalen bjuder under självkostnad i en kategori i några kvartal | Hållningen syns med underrättelse | Vänta ut, eller möt med en bättre konstruktion |
| **Läcka mot huset** | Husets relation till ett land sjunker | Ingen | Aktivt stationsläge upptäcker och namnger rivalen |
| **Sabotera en linje** | En linje står ett kvartal | Rykte kvartalet innan, med station i hemstaten | Juridisk rådgivning och aktivt stationsläge minskar chansen |
| **Anmäla huset** | Bara om huset har ett öppet spår i en upphandling: spåret kommer fram | Ingen | Inga spår |
| **Värva över konstruktören** | Finns redan (P134) | — | — |

- Varje drag kostar rivalen kapital och lämnar ett eget spår, som spelaren kan hitta och anmäla.
- En rival gör högst ett fientligt drag per kvartal.
- Rivalernas drag visas i kvartalsuppspelningen och under *This Quarter*.

### 10.4 Motvikten

- Rivalernas aggression stiger med husets marknadsandel. Ett hus som leder möter hårdare motstånd, och
  ett som ligger efter får andrum.
- **Svårighetsgraden** vid New Game (10L) skalar samma tal.
- När motvikten finns sänks `boardTarget.threshold` tillbaka mot 2, eftersom den inte längre behöver
  bära hela svårigheten.
- Undantaget i spelbarhetstestet (`balanced-pwc` över 90 %) ska kunna tas bort när motvikten finns.

---

## 11. Spelkänslan

1. **Kvartalet spelas upp på kartan.** `QuarterReplay` visar leveranser som rör sig längs
   försörjningslinjerna, genombrott som en stöt i frontlinjen och förband som flyttas (`MovementArrow`,
   0.19, får äntligen riktig data). Historiska händelser i teatern nålas där de ägde rum: Tonkinbukten,
   Da Nang, Saigon, Huế, Nam Bac. Bara `transform` och `opacity`; reducerad rörelse gör allt omedelbart.
2. **Förstasidan.** Historiska händelser visas som en tryckt tidningssida från en fiktiv nyhetsbyrå:
   datumrad, rubrik i blytyp, två rader text, rastermönster. Sidan genereras av tillgångsfabriken ur
   händelsens text, så att varje händelse har en bild utan att någon behöver ritas.
3. **Sigill och porträtt.** Fabriken ger varje rivalhus ett sigill och varje namngiven person en
   siluett i profil. Ägarens porträtt ur `GRAFISKA_TILLGANGAR_ETAPP7.md` kopplas in i samma ram när de finns.
4. **Ljudet.** De 18 saknade effekterna och två miljöljuden syntetiseras (10N): skrivmaskin, stämpel,
   telex, bakelitknapp, telefon. Musiken finns redan.
5. **Världsläget i HUD:en.** Årtalet i HUD:en blir tryckbart och öppnar *The world this quarter*:
   kvartalets händelser, vad som väntar enligt underrättelsen, och rivalernas kända hållning.
6. **Ritbordet får egen grafik:** blåkopior per kategori ur fabriken i stället för en gemensam ram.

`art-director`-skillen gäller för allt i avsnittet.

---

## 12. Härness och måltabell

**Härnessen:**
- En brytare som stänger av historien, så att varje händelses effekt kan mätas mot ett parti utan den.
- `human` svarar på beslut efter en enkel regel; varianterna `human-hawk` (trappar alltid upp) och
  `human-dove` (avstår alltid).
- Nya kolumner: fientliga drag per rival, upptäckta drag, agg, historiska beslut per svar, vapenvilor
  efter Paris, och partier som slutar olika beroende på ett historiskt svar.

**Måltabell 10A** (balanspasset P147):

| Rad | Mål | Fetstilt |
|---|---|---|
| Mekaniker som är avstängda eller satta till ett vaktbestämt minimum | 0 | **ja** |
| Öppna provisoriska balanstal | < 30 | **ja** |
| Etapp 9:s målrader utan öde (nådd, reviderad eller struken) | 0 | **ja** |
| Andel pappersspår som kommer fram | 30–60 % | **ja** |
| `human-dirty` vinner fler upphandlingar och får fler hävda kontrakt än `human-clean` | båda sant | **ja** |
| `human-clean` och `human-dirty`, vinst | båda ≥ 35 % | |
| Gap-chocker per parti | 1–3 | |
| Intäkt från konstruktioner yngre än fyra kvartal | 30–60 % | |
| Verb som ingen bot använder | 0 | |
| `human`, `SCENARIO_COMPLETE` | 40–70 % | **ja** |

> **Utfall P147 (2026-10-08, 100 partier per bot).** Måltabell 10A: *Mekaniker avstängda* 0 — nådd (`blocTechLevelStep` på sedan P141; de tre talen som är 0 är naturliga nollor). *Öppna provisoriska tal* 11 (< 30) — nådd, se `docs/BALANSTAL_10A.md`. *`human`* 59 % — nådd. *clean/dirty* 64/57 — nådd. *Gap-chocker* 2,7 — nådd. *Spår som kommer fram* 30 % (`human`) — nådd. *Unga intäkter* 22 % för `human` (31–37 för tre varianter) — delvis. *Verb som ingen bot använder* — inte mätt i den här prompten (kvarstår för P159). *`dirty` vinner fler upphandlingar och får fler hävda kontrakt än `clean`* — sant (0,46 mot 0,16; 0,03 mot 0), svagt.
>
> **Etapp 9:s fjorton målrader har ett öde:** nådda — robust/advanced ≥ 40 (40/86), gap-chocker 1–3 (2,7), upphandlingar per parti 1–3 (3), clean/dirty ≥ 35 (64/57), dirty vinner fler upphandlingar men får fler hävda kontrakt (sant, svagt), `human` 40–70 (59). Reviderade — *unga intäkter 30–60* (nådd för `bothsides` 31, `clean` 33, `dirty` 37, `civil` 31; `human` 22), *olycksfåglar 10–25 %* (nådd för `robust` 32, `underhand` 20, `dirty` 17; `human` 7), *spår som kommer fram 30–60 %* (30 för `human`, 13 för `dirty` som har juridisk rådgivning), *`bothsides` mot `human` ≥ +10 doomsday* (båda beväpnar båda sidor — raden gäller per tillfälle, där `bothSidesDoomsday` är 10). Strukna — *fältryktekvartilen* (ingen mätkolumn byggd), *`human` mot `noresearch` ≥ +15 pp* (utfall −11: forskning och konstruktioner kostar och lönar sig inte i botspel — ägarbeslut om raden ska ersättas av en regel), *först-på-plats-vinnaren ≤ 80 %* (inga tillfällen i botspel), *civilt hus överlever vapenvila > 30 %* (2 av 200 partier har en vapenvila).
>
> **Tröskeln:** efter historiens steg (P149) låg `human` på 30–38 %; `boardTarget.threshold` 11 → 9,5. Se ANDRINGSLOGG.

**Måltabell 10B** (balanspasset P160):

| Rad | Mål | Fetstilt |
|---|---|---|
| Fientliga rivaldrag mot `human` per parti | 3–8 | **ja** |
| Andel fientliga drag som spelaren kan upptäcka med underrättelse | ≥ 50 % | |
| `human` på högsta svårighet mot lägsta, vinst | ≥ 25 procentenheter lägre | **ja** |
| `balanced-pwc`, vinst | ≤ 90 % (undantaget tas bort) | **ja** |
| Historiska beslut där svaren ger mätbart olika utfall | minst 6 av 8 | **ja** |
| Inget enskilt svar är bäst i mer än 70 % av partierna | alla åtta beslut | |
| Partier med vapenvila efter Parissamtalen | 10–40 % | **ja** (pelare 1) |
| `human` med historien på mot av, vinst | inom ±10 procentenheter | |
| `human` med vapenvila efter Paris mot utan, `BUYOUT` | högst 20 procentenheter fler | |
| Händelser med datum och källa | 100 % | **ja** |
| `human`, `SCENARIO_COMPLETE` på standardnivån | 40–70 % | **ja** |

Spelbarhetstestets golv och tak och capacity-referensen ska hålla efter varje prompt som rör kärnan.

---

## 13. Skyddsräcken

1. **10A lägger inte till någon mekanik.** En prompt i 10A som behöver ett nytt fält i `GameState`
   stannar och frågar.
2. **`computeScore` rörs inte.** Rivalernas drag och historiens effekter verkar genom de termer som
   redan läggs efter anropet.
3. **En formel, en källa** för allt som både kärnan och gränssnittet räknar.
4. **All slump via `ctx.rng`.** Historiska händelser drar ingen slump; de är fasta.
5. **Historien är data.** Ingen händelse hårdkodas i ett resolve-steg.
6. **Äkthetstestet** (§9.7) körs i CI.
7. **Inga verkliga vapenhus och inga påhittade citat** (10I, 10J). Rivalernas ordförande är fiktiva.
8. **Dolda värden läcker inte:** rivalernas hållning och agg visas bara genom underrättelse.
9. **Golden** fryses bara om enligt 10D.
10. **UI-reglerna 1–18** gäller varje skärm som byggs eller flyttas.

---

## 14. Promptsekvens

"Regel" får frysa om golden enligt 10D. "UI", "mätning", "tillgång" och "ingen kod" lämnar golden orörd.

| Del | Prompt | Innehåll | Typ |
|---|---|---|---|
| **10A Slipningen** | P139 | Samlad speltestlista, lista över beslut att kvittera; ägaren spelar | ingen kod |
| | P140 | Mätfel rättade, botarna använder alla verb, känslighetsverktyget | mätning |
| | P141 | Mätning av den uppdämda efterfrågan; uppbyggnaden läggs om; de fyra talen slås på eller mekaniken tas bort | regel |
| | P142 | Kapplöpningens takt: schemat, gap-chocker, först på plats, båda sidor | regel |
| | P143 | Fuskets risk och vinst: spår, hävda kontrakt, anmälan | regel |
| | P144 | Konstruktionernas bärkraft, olycksfåglar, linjeomställning, del F | regel |
| | P145 | THE COMPANY i fyra lådor; skärmar för det som saknar en | UI |
| | P146 | Handledning, handbok och PM för etapp 9:s system | UI |
| | P147 | Balanspass 10A, provisoriska tal sorterade, etapp 9:s målrader avgjorda | regel |
| | P148 | Speltest av 10A | ingen kod |
| **10B Historien** | P149 | Steget `history`, datafilen, äkthetstestet, förstasidor och telex, prologen | regel |
| | P150 | De åtta besluten, svaren som stående order, förvarning genom underrättelse | regel |
| | P151 | Vapenvila mot spelarens vilja efter Parissamtalen; efterordet | regel |
| **10B Rivalerna** | P152 | Ordförande, hållning, agg | regel |
| | P153 | De sex dragen, förvarning, motdrag, rivalernas spår | regel |
| | P154 | Motvikten, svårighetsgraden, `boardTarget` tillbaka | regel |
| **10B Spelkänslan** | P155 | Tillgångsfabriken: förstasidor, sigill, siluetter, blåkopior; `build:sfx` | tillgång |
| | P156 | Förstasidan och beslutskortet i uppspelningen; *World* i NEWS DESK; världsläget i HUD:en | UI |
| | P157 | Rivalmapparna på CONTACTS; rivalernas drag i *This Quarter* | UI |
| | P158 | Kvartalet spelas upp på kartan | UI |
| | P159 | Härnessen för 10B | mätning |
| | P160 | Balanspass 10B | regel |
| | P161 | Speltest av etapp 10 | ingen kod |

| **Speltestet 2026-10-06** | P162 | Språk, leden på kartan, anställningströskeln, infanteri, handboksrättning | UI |
| | P163 | Handlingskortet, Actions-menyn, info-ikoner, stationskortet | UI |
| | P164 | Resultatrapporten efter varje kvartal | UI |
| | P165 | Informationskort på kartan; alla länder tryckbara | UI |
| | P166 | Kartlager med tal | UI |
| | P167 | Stationens täckning växer med djupet; vilande station kan öppnas igen | regel |
| **Efter P147** | P188 | Forskningen ska löna sig (10X) | regel |

**Körordning (beslut 10P, 2026-10-06).** Klart: premisskontrollen, P139, P140, mätningen i P141, P155, P162–P167, P158, etapp 11 och **P141 (körd 2026-10-07, se utfallet i §6)**.
Därefter: P142–P144, P146–P148 → P149–P154, P156, P157, P159–P161. P145 utgår (10S).
**Ändrad 2026-10-08 (10Å):** P142–P149 är körda. Nästa: P187 (etapp 11) och P188 → ägarens speltest (P148 och P184) → P150–P154, P156, P157, P159–P161.

**Kapningsordning** om etappen blir för stor: priskriget och sabotaget i P153 först, sedan telexraderna.
De åtta besluten, motvikten och kartuppspelningen (P158, beslut 10R) kapas inte.

---

## 15. Utanför etappen

- Ett andra scenario eller en kampanj. Händelsesystemet byggs som data per scenario, så att ett scenario
  som börjar 1961 kan göra Grisbukten och Kubakrisen spelbara.
- Uppköp, sammanslagningar och rivaler som går under av spelarens drag.
- Händelser som beror på spelarens egna val långt tidigare (kedjor över flera år).
- Riktiga porträtt och händelsefotografier. De är ägarens att generera och kopplas in när de finns.
- Flerspelarläge.

---

## 16. Kvarstående punkter för ägaren

1. Spela det samlade speltestet (P139) innan resten av 10A körs.
2. Godkänna det nya generationsschemat när P142 föreslår det (10B). Golden i P130 och bygget av del F
   är kvitterade genom antagandet.
3. Lyssna på de syntetiserade ljudeffekterna i speltestet (10N).
4. Läsa igenom händelsetexterna när P149–P150 är skrivna. Tonen i dem är ett omdömesbeslut, särskilt
   för Tet, fredsrörelsen och efterordet om My Lai.

---

## Bilaga A — Händelserna, med datum och källor

Kontrollerade mot källorna 2026-10-02. Där källorna går isär står det utskrivet.

**Prologen**
- Grisbuktsinvasionen, 17–20 april 1961 · en.wikipedia.org/wiki/Bay_of_Pigs_Invasion
- Kubakrisen, 16–28 oktober 1962 · en.wikipedia.org/wiki/Cuban_Missile_Crisis
- Partiella provstoppsavtalet, undertecknat 5 augusti 1963 · en.wikipedia.org/wiki/Partial_Nuclear_Test_Ban_Treaty
- Kuppen mot Diệm, 1–2 november 1963 · en.wikipedia.org/wiki/1963_South_Vietnamese_coup_d'état
- Mordet på Kennedy, 22 november 1963 · en.wikipedia.org/wiki/Assassination_of_John_F._Kennedy

**Beslut**
- Tonkinbukten: anfallet på USS Maddox 2 augusti 1964; det rapporterade andra anfallet 4 augusti ägde aldrig rum; resolutionen antogs 7 augusti och undertecknades 10 augusti · en.wikipedia.org/wiki/Gulf_of_Tonkin_incident
- TSR-2: regeringsbeslut 1 april, tillkännagivet i budgettalet 6 april 1965 · en.wikipedia.org/wiki/BAC_TSR-2
- Starfighter-krisen: 27 olyckor och 17 döda under 1965; flygvapeninspektören Panitzki avskedades 25 augusti 1966 · de.wikipedia.org/wiki/Starfighter-Affäre
- Sexdagarskriget, 5–10 juni 1967; Frankrikes embargo 2 eller 3 juni (källorna går isär); 50 betalda Mirage 5 levererades aldrig · en.wikipedia.org/wiki/Dassault_Mirage_5
- M16: underutskottet tillsatt maj 1967, utfrågningar 15 maj–22 augusti, rapport 19 oktober 1967 · archive.org/details/M16IchordReport1
- Marschen mot Pentagon, 21 oktober 1967 · en.wikipedia.org/wiki/March_on_the_Pentagon · protesten mot napalmtillverkarens rekryterare i Madison, 18 oktober 1967 · 1967.wisc.edu/timeline
- Tet-offensiven, 30 och 31 januari 1968 · en.wikipedia.org/wiki/Tet_Offensive
- Parissamtalen: första mötet 10 maj, första officiella sessionen 13 maj 1968 · en.wikipedia.org/wiki/Paris_Peace_Accords

**Förstasidor**
- Kuppen i Laos, natten 18–19 april 1964 · en.wikipedia.org/wiki/1964_Laotian_coups
- Kinas första kärnvapenprov, 16 oktober 1964 · en.wikipedia.org/wiki/Project_596
- Rolling Thunder inleds 2 mars 1965; landstigningen vid Da Nang 8 mars 1965 · en.wikipedia.org/wiki/Operation_Rolling_Thunder
- Thiệu och Kỳ, 19 juni 1965 · en.wikipedia.org/wiki/Nguyễn_Cao_Kỳ
- Indisk-pakistanska kriget, 5 augusti–23 september 1965; leveransstoppet i september, dagen inte belagd · en.wikipedia.org/wiki/Indo-Pakistani_war_of_1965
- Fulbright-utfrågningarna, 4–18 februari 1966 · senate.gov/artandhistory/history/minute/Vietnam_Hearings.htm
- Buddhistupproret, 26 mars–8 juni 1966 · en.wikipedia.org/wiki/Buddhist_Uprising
- Forskaruppropet till presidenten, 14 februari 1967 · meselsonarchive.hsites.harvard.edu/petition-president-johnson
- Pundet devalveras, 18 november 1967 · en.wikipedia.org/wiki/1967_sterling_devaluation
- Invasionen av Tjeckoslovakien, natten 20–21 augusti 1968 · en.wikipedia.org/wiki/Warsaw_Pact_invasion_of_Czechoslovakia
- Bombstoppet: tal 31 oktober, i kraft 1 november 1968 · presidency.ucsb.edu

**Telex**
- Chrusjtjov avsätts, 14 oktober 1964 · Storbritanniens embargo mot Sydafrika, 17 november 1964 · Barrel Roll, 14 december 1964
- Västtyskland stoppar vapen till Israel, februari 1965 (dagen inte belagd) · Dominikanska republiken, 28 april 1965 · 30 september-rörelsen, 30 september–1 oktober 1965 · Rhodesia, 11 november 1965 · den saudiska flygaffären, december 1965 (dagen inte belagd)
- Frankrike och Nato, brevet 7 mars 1966 · kulturrevolutionen, 16 maj 1966 · FN-resolution 232, 16 december 1966
- Rymdfördraget, 27 januari 1967 · Grekland, 21 april 1967 · Glassboro, 23–25 juni 1967 · Biafrakriget, 6 juli 1967 · McNamara, 29 november 1967
- Nam Bac, 14 januari 1968 · F-111K, 16 januari 1968 · Pueblo, 23 januari 1968 · Johnsons tal, 31 mars 1968 · icke-spridningsavtalet, 1 juli 1968 · lagen om statlig vapenförsäljning, 22 oktober 1968 · Nixon, 5 november 1968 · C-5A-vittnesmålet, 13 november 1968

**Efterordet**
- Gränsstriderna vid Zhenbao/Damanskij, 2 och 15 mars 1969 · en.wikipedia.org/wiki/Sino-Soviet_border_conflict
- My Lai, 16 mars 1968; känt genom Dispatch News Service 13 november 1969 · en.wikipedia.org/wiki/My_Lai_massacre

Två kandidater ströks för att de inte gick att belägga: senatens stabsstudie om vapenförsäljning
(januari 1967) och Export-Import Banks lån till onämnda länder (1967).
