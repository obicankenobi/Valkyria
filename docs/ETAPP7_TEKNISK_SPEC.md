# ETAPP 7 — SPELBORDET

*Version 1.3. **Antagen 2026-09-22.** Premisskontrollen (§0) verifierad ordagrant mot koden vid
antagandet, inget avvek. Skriven mot grenen `claude/funny-lamport-nvno9f`, commit `22a5ea2`
(2026-09-22). Se `docs/ANDRINGSLOGG.md` för hela beslutsprotokollet (A–J).*

Prosan är på svenska. All kod, alla identifierare och alla UI-strängar är på engelska.

Etapp 1–5 byggde en simulering. Etapp 6 gav den en meny, ett ljudlager och en sektortavla. Den här etappen gör om hur spelet *ser ut och känns*: från en webbsida med fem flikar och formulär till ett spelbord med en levande karta, där man pekar på saker i världen och ser vad som händer med dem.

**Ägarens prioritering för etappen:** spelet ska se ut och kännas som ett riktigt spel. Levande karta, menyer, knappar och flikar som hör hemma i ett strategispel, inte i ett dokument man fyller i.

---

## Ändrat sedan 1.2

| Ändring | Var |
|---|---|
| **Nytt visuellt register:** från mörk skärm med glödande accenter till det fysiska krigsrummet 1965 — papperskarta, acetat och fettkrita, manillamappar, skrivmaskin, bakelit och Dymo-etiketter | §2J, §4, §10 |
| Nya typsnitt i tidens anda | §10 |
| *DEFCON* struken som förebild; den drog mot det futuristiska | §4 |
| Ny regel: ingen text får överlappa eller klippas, kontrolleras automatiskt i CI | §3, P73 |
| Zoomnivåerna konkretiserade: vad som syns på vilken nivå | §6.9 |

## Ändrat sedan 1.1

| Ändring | Var |
|---|---|
| **Mobil först.** Telefon i stående läge är primär plattform; skrivbordet är en uppskalning | §2I |
| Frågan etappen besvarar: "bara tummen" i stället för "bara musen" | §1 |
| Regler för pekskärm: träffytor, tumzon, säkra områden, ingen information bara vid hovring | §3 |
| OPERATIONS ritad för telefon; skrivbordslayouten blir en variant | §5 |
| Interaktion omskriven för tryck, nyp och bottenark | §6.9, §7 |
| Installerbar PWA i helskärm flyttad till P74 | §10, §13 |
| Prestandabudget satt mot en mellanklassmobil | §12 |
| Skiss av OPERATIONS finns som referens | §11 |

## Ändrat sedan 1.0

| Ändring | Var |
|---|---|
| Verbräkningen rättad: 22 verb, 8 i gränssnittet, 14 saknas | §0.1 |
| Verbkartan rättad: alla underrättelseverb utgår från en station och verkar i dess land | §6.1 |
| `doomsdayPeak` finns redan; epilogen byggs på en krönika i stället för lösa räknare | §0.2, §8 |
| Nytt fynd: varför det *ser* ut som ett dokument, rad för rad i CSS:en | §0.5 |
| Nytt avsnitt: regler för spelgränssnitt, att lägga i `CLAUDE.md` | §3 |
| Nytt avsnitt: visuella förebilder | §4 |
| Levande karta: omgivningsrörelse och vad som faktiskt rör sig | §6.6 |
| Ny panel: *This Quarter* — kvartalets lägen, klickbara | §7.7 |
| Kvartalsuppspelningen: bara rubriker som standard | §8 |
| Promptsekvensen byggd som vertikal skiva i stället för horisontella lager | §13 |
| Stillhetsmått i härnessen innan beslut 2F | §2F, P75 |
| Plattformsbeslut före P73 | §2I |
| Flikarna har nya namn (antaget i 1.0) | §2G |

---

## 0. Fem fynd som styr etappen

Verifierat mot koden, inte antaget.

### 0.1 Fjorton av tjugotvå spelarhandlingar går inte att göra

Kärnan har 22 verb. Gränssnittet bygger bara åtta av dem:

```
I gränssnittet (8):   TAKE_LOAN  REPAY  BUILD_LINE  HIRE  REPRIORITISE_RND
                      BRIBE  STAGE_INCIDENT  BACK_CHANNEL

Saknas (14):          RECRUIT  EXPAND  WITHDRAW  LEAK  SABOTAGE  TURN        (INTEL, 6)
                      FUND_CAMPAIGN  FAVOUR  INFLUENCE  FUND_COUP  ASSASSINATE (POLITICAL, 5)
                      BROKER                                                (1)
                      BUY_FORWARD  RELEASE                                  (MARKET, 2)
```

`FUND_CAMPAIGN` och `FAVOUR` beskrivs i `TheHouse.tsx`s `describeAction`, men inget formulär skapar dem. Allt utöver mutor och incidenter i etapp 5:s politik, hela underrättelsen och hela råvarumarknaden används i dag bara av härnessens botar.

### 0.2 Epilogen finns inte

`DESIGN.md` §17 och §6.3 beskriver ett slut med fyra axlar och en kärnvapenepilog. I appen är slutet en rad i en banner.

Underlaget finns delvis: `doomsdayPeak` lagras redan för `RESTRAINT`. Det som saknas är historiken. `state.wire` är ett rullande fönster på åtta turer (`WIRE_WINDOW_TURNS`), så `SHADOW` och kärnvapenepilogens "vilken handling utlöste det" kan inte räknas fram. §8 löser det med ett enda nytt fält.

### 0.3 Varje handling är ett formulär

Spelaren väljer ett id ur en rullgardin och skriver ett belopp i ett fält. Resultatet syns som text nästa tur, på en annan flik. Spelaren pekar aldrig på något i världen och ser aldrig en handling få effekt där den hände.

### 0.4 Det som visas på kartan rör sig nästan inte

Inget förband byter sektor, P64 mätte att ingen front når `ceasefire` och att ingen kupp lyckas i härnessen, och det finns två fronter med sex sektorer. En vacker karta över en front som aldrig ändrar form blir ett dokument med bilder. §2F och §6.6 tar upp det.

### 0.5 Varför det *ser* ut som ett dokument

Paletten och typografin i `styles.css` är redan genomtänkta. Det som gör att det läser som en webbsida är strukturellt:

- **Sidan scrollar.** `min-height: 100vh` på appen. Ett spel fyller skärmen och står still; paneler scrollar inuti sig själva.
- **Webbläsarens egna kontroller syns.** `<select>` och `input[type='number']` är stylade men är fortfarande rullgardiner och sifferfält.
- **Systemtypsnitt.** Kommentaren i CSS:en motiverar det med offlinestöd, men det finns ingen service worker i projektet (PWA-pluginen från P12 lades aldrig till), och typsnitt som paketeras med appen fungerar offline exakt lika bra som appen själv.
- **Inga övergångar.** Flikbyte är ett hårt byte av innehåll. Inga paneler glider, inga tal räknar, inga knappar trycks ned.
- **Text i stället för ikoner.** Knappar, flikar och resurser är ord.
- **Ingen ram.** Paneler är rutor med kant. Spel ger sina paneler en gemensam "chrome": hörnmarkeringar, rubrikband, textur, djup.

Inget av detta kräver grafiska tillgångar. Det är regler, och §3 skriver ut dem.

### Slutsats

Känslan av dokument kommer från fyra saker i den här ordningen: sidan beter sig som en webbsida (§0.5), handlingar är formulär (§0.3), halva spelet är oåtkomligt (§0.1), och kartan står still (§0.4). Etappen tar dem i den ordningen, med ägarens prioritering i fokus: först ska det se ut och kännas som ett spel, på ett smalt område, i slutlig kvalitet.

---

## 1. Frågan etappen ska besvara

**Ser det ut som ett strategispel inom fem sekunder, och kan en ny spelare spela ett helt parti på telefonen med bara tummen?**

1. *Fem sekunder:* en person som ser en skärmbild ska säga "spel", inte "webbapp".
2. *Bara tummen:* varje verb nås genom att trycka på ett föremål i världen eller en tydlig knapp, med en hand, i stående läge. Inga id, inga fritextfält, inget tangentbord.
3. *Förstå varför:* turupplösningen visas där den händer och epilogen berättar partiets historia.

---

## 2. Ägarbeslut — läggs i `ANDRINGSLOGG.md` innan P73

**A. Kartan blir geografisk.** Den schematiska sektortavlan ersätts av en teaterkarta över Indokina med verklig kustlinje och gränser. Oförändrat ur `DESIGN.md` §21: inget taktiskt lager, spelaren flyttar inga förband, kartan visar aldrig mer än modellen håller reda på.

**B. Kartan är huvudskärmen.** OPERATIONS är spelets centrum. Övriga skärmar öppnas från kartan eller sidomenyn.

**C. Handlingar startar i världen.** Man väljer ett land, en station, en tjänsteman eller en order och ser de verb som gäller just där. Formulär tas bort.

**D. Rendering: SVG, `d3-geo`, `d3-zoom`.** Ingen kartmotor (MapLibre, Leaflet: brickbaserade, nätverksberoende, fel estetik) och ingen spelmotor (Phaser, Pixi: onödigt för några hundra element, lämnar React och jsdom-testerna). En Pixi-canvas under SVG-lagret införs bara om prestandabudgeten i §12 bryts.

**E. Epilogen byggs på en krönika** (§8). Golden fryses om i en enda prompt.

**F. Förbandsförflyttning avgörs på data.** P75 lägger ett stillhetsmått i härnessen. Beslutet om att förband kan byta sektor efter genombrott tas när måttet finns, före bredningen i 7C.

> **Beslut 2F fattat 2026-09-26, på P75:s underlag (§13:s P75-blockquote):** redeploy-mekaniken
> byggs — 93,6 % av 500 partier hade noll sektorer som bytte sida under hela partiet, trots
> betydande churn under ytan (`frontMovementTotal` ≈4,5/tur, `formationsChangedStatus`
> ≈0,77/tur). Ägaren valde ATT FÖLJA SPECENS EGEN ORDNING i stället för att flytta fram
> mekaniken till P76: P76 förblir ren frontend (baskartan/sektorerna, Sydvietnam) och rör
> aldrig `resolve/`/golden; själva redeploy-regeln byggs i P82 som redan planerat — en egen
> commit med omfryst golden, körd mot hela kartan (Sydvietnam + Laos) i stället för bara halva
> teatern. Se `docs/ANDRINGSLOGG.md`.

**G. Flikarna döps om.**

| Gammalt namn | Nytt namn | Vad sidan är |
|---|---|---|
| THE WORLD | **OPERATIONS** | Teaterkartan, huvudskärmen |
| THE FLOOR | **CONTRACTS** | Ordrar, bud, aktiva kontrakt |
| THE HOUSE | **THE COMPANY** | Produktion, R&D, kassa, kredit, styrelsemål, personal |
| THE POLITICS | **CONTACTS** | Dossierer: tjänstemän, faktioner, rivalhus |
| THE WIRE | **NEWS DESK** | Telexremsan och tidningens förstasida |

Komponentfilerna (`TheHouse.tsx` m.fl.) rörs inte av bytet, bara det spelaren ser.

**H. Utseende och känsla först, på en smal skiva.** Etappen byggs som en vertikal skiva (§13, 7B): ett land, dess föremål och verb, handlingsplatserna, kvartalsuppspelningen och tidningssidan, i slutlig visuell kvalitet. Först när skivan är godkänd breddas den. Känd avvägning: de 14 saknade verben blir inte alla spelbara förrän i 7C, och några av dem (kupp, lönnmord) kan visa sig vara svaga system. Det hanteras genom att de byggs sist i 7C, efter att ägaren spelat skivan.

**J. Visuellt register: det fysiska krigsrummet, 1965.** Den mörka paletten från etapp 6 (nästan svart yta, kallt blågrått, glödande telexgult) läste som futuristisk i skissen. Den ersätts av föremål som fanns på ett riktigt lägesbord 1965: en tryckt papperskarta, acetatfilm med fettkritemarkeringar, manillamappar, skrivmaskinstext, gummistämplar, Dymo-etiketter, bakelitknappar, visarinstrument och en telexremsa. Reglerna i §3 och förebilderna i §4 bygger på det.

**I. Primär plattform: mobil först.** Telefon i stående läge är spelets huvudplattform, och varje skärm ritas först för 390 × 844 px. Skrivbordet är en uppskalning av samma design, inte tvärtom.

Det passar spelet bättre än det låter. Indokina är långt och smalt i nord–sydlig riktning, så teaterkartan fyller en stående telefonskärm nästan perfekt. Och ett turbaserat spel med tre handlingar per kvartal är precis den sortens spel man spelar fem minuter i taget med en hand.

Konsekvenser som gäller hela etappen:
- Ingen information finns bara vid hovring. Tryck väljer och visar; allt som var en tooltip blir en rad i bottenarket eller en förklaring bakom en info-ikon.
- De viktigaste kontrollerna ligger i tumzonen, nedre tredjedelen av skärmen.
- Spelet installeras som PWA och startar i helskärm utan webbläsarens adressfält. Det ensamt får det att kännas som en app i stället för en webbsida, och flyttas därför till P74.
- Stående läge låses i manifestet. Liggande läge och surfplatta stöds via skrivbordsvarianten.

---

## 3. Regler för spelgränssnitt

Läggs som ett eget avsnitt i `CLAUDE.md`, så att varje UI-prompt i etappen följer dem utan att de upprepas.

```markdown
## Spelgränssnitt — regler (etapp 7)
1. Sidan scrollar aldrig. Appen fyller 100dvh. Paneler scrollar inuti sig själva, med stylad rullist.
2. Inga webbläsarkontroller syns. Aldrig <select>, input[type=number], checkbox eller radio.
   Använd komponenterna i designsystemet: Slider, Stepper, Segmented, TierPicker, Toggle.
3. Varje interaktivt element har fyra tillstånd: idle, pressed, selected, disabled (plus hover,
   bara på skrivbord). Pressed syns och hörs inom 100 ms.
4. Allt som ändras rör sig. Paneler glider, modaler skalar in, skärmbyten tonar,
   150–250 ms. Tal som ändras räknar till sitt nya värde och blinkar grönt eller rött.
5. Alla verb, resurser och flikar har en ikon. Text är etikett till ikonen, inte ersättning.
6. Alla paneler använder samma ram (Panel-komponenten): rubrikband, hörnmarkeringar, textur.
7. Högst två rader brödtext i en panel. Resten bakom "More".
8. Allt är ett föremål från 1965. HUD: en lackerad stålpanel med visarinstrument, räkneverk och
   signallampor. Kartan: tryckt papper med acetat och fettkrita ovanpå. Lådor och formulär:
   manillamappar och blanketter med skrivmaskinstext. Handlingar: registerkort. Knappar: bakelit.
   Etiketter: Dymo-tejp. Nyheter: telexpapper. Inga glödeffekter, inga gradienter i neonfärg,
   ingen glasmorfism, inget som ser ut som en skärm från framtiden.
9. Valt föremål på kartan har en tydlig kontur. (Skrivbord: markörer för grepp och pekare.)
10. Mobil först. Varje skärm byggs för 390×844 i stående läge och skalas sedan upp, aldrig tvärtom.
11. Träffytor minst 44×44 px. Primära handlingar i nedre tredjedelen av skärmen.
12. Respektera säkra områden: env(safe-area-inset-*) runt HUD och bottendocka.
13. Ingen information bara vid hovring. Allt som visas vid hovring på skrivbord nås med tryck på mobil.
14. Brödtext minst 13 px. Etiketter i versaler med kondenserat typsnitt minst 11 px. Tal i HUD minst 15 px.
15. prefers-reduced-motion stänger av all rörelse utom tillståndsbyten.
16. Kortkommandon (skrivbord): 1–5 för skärmarna, Enter för End Quarter, Esc för paus.
17. Varje UI-prompt avslutas med `npm run shots` i båda formaten och en jämförelse mot docs/ui/reference/.
18. Ingen text får överlappa annan text eller klippas av sin ruta. Kontrolleras automatiskt:
    ett Playwright-test går igenom varje textelement på varje skärm i båda formaten och underkänner
    om scrollWidth > clientWidth, och ett test över kartan underkänner om två etiketters eller
    markörers avgränsningsrutor skär varandra. Testet körs i CI. Etiketter som inte får plats
    på en zoomnivå döljs enligt §6.9, de krymps aldrig under minimistorleken.
```

Regel 1, 2 och 4, tillsammans med helskärms-PWA:n i §2I, gör ensamma mer för "det ser ut som ett spel" än någon grafisk tillgång.

---

## 4. Visuella förebilder

Registret är **krigsrummet 1965, som föremål på ett bord**: en tryckt karta under en lampa, acetat och fettkrita ovanpå, mappar, blanketter, en stålpanel med instrument och en telexmaskin som tickar. Förebilderna nedan är till för skisserna i §11. Ta det som står i kolumnen, inte hela spelet.

| Förebild | Vad vi tar |
|---|---|
| Tidens militära kartor (US Army JOG-serien, CIA:s avhemligade kartbibliotek) | Den tryckta kartans färger och typografi: krämvitt land, blekt blågrått hav med kustlinjer, serifer för länder, kursiv för vatten. |
| Lägeskartor med acetatöverlägg | Fettkrita i rött och blått, NATO-symboler ritade för hand, frontlinjer som dragits om och suddats. |
| *Twilight Struggle* (digital) | Kalla krigets register i ett spel, inflytandemarkörer på länder. |
| *Papers, Please* | Det diegetiska skrivbordet: stämplar, mappar, papper som känns fysiskt. |
| *Unity of Command II* | Läsbara förbandsbrickor och försörjningslinjer som man förstår på en blick. |
| *Suzerain* | Dossierer och personer i centrum, tidningen som berättare. |
| Dymo-etiketter, bakelit, visarinstrument, telexremsa | Materialen i gränssnittet runt kartan. |

*DEFCON* är struken som förebild. Dess glödande vektorkarta på svart var källan till det futuristiska intrycket i den första skissen.

---

## 5. Skärmarkitektur

```
Title Screen ─► New Game ─► Briefing ─► OPERATIONS (kartan) ◄─────────────────┐
                                           │                                  │
                  ┌────────────────┬───────┴────────┬───────────────┐         │
                  ▼                ▼                ▼               ▼         │
              CONTRACTS       THE COMPANY       CONTACTS        NEWS DESK     │
                                           │                                  │
                                     End Quarter                              │
                                           ▼                                  │
                                 Quarter Replay ─► Front Page ────────────────┘
                                           │
                                     (slut)▼
                                       Epilogue ─► Title Screen

Paus och inställningar: överlager, nåbart överallt (Esc)
```

OPERATIONS på telefon, stående, 390 × 844 — **primär layout**:

```
┌────────────────────────────────┐
│ ◉41  £4.2M   ▓▓▓░░    1965·Q2  │  HUD: doomsday, kassa, styrelsemål, datum
├────────────────────────────────┤  (tryck för full HUD: skuld, kredit m.m.)
│ ◆ THIS QUARTER · 3        ▾    │  kvartalets lägen, tryck för att fälla ut
├────────────────────────────────┤
│                                │
│         TEATERKARTAN           │
│   (Indokina, nord uppåt —      │
│    fyller höjden naturligt)    │
│                                │
│   en finger: panorera          │
│   nyp: zooma                   │
│   tryck: välj                  │
│                                │
├────────────────────────────────┤
│ ▸ TELEX · · · · · · · · · ·    │  löpande remsa
├────────────────────────────────┤
│ [▢] [▢] [▢]    [END QUARTER]   │  handlingsplatser + knapp, i tumzonen
├────────────────────────────────┤
│  ⌖     ▤     ⚙     ☷     ≋     │  flikrad: OPERATIONS · CONTRACTS ·
└────────────────────────────────┘  THE COMPANY · CONTACTS · NEWS DESK
```

Valt föremål öppnar ett **bottenark** som täcker nedre halvan av kartan och kan dras upp till helskärm. Kartan förblir synlig ovanför, med det valda föremålet centrerat i den synliga delen.

**Skrivbord (≥ 1024 px)** är samma komponenter i en annan uppställning: flikraden blir en vänstermeny, bottenarket en fast högerpanel under *This Quarter*, och HUD:en visar alla värden direkt.

---

## 6. Kartan

### 6.1 Geografi

- Källa: **Natural Earth 1:50m** (public domain), beskuren till Indokina med Thailand och södra Kina som sammanhang.
- 1964: Nord- och Sydvietnam skilda av den demilitariserade zonen längs 17:e breddgraden, tillagd för hand.
- Ett byggskript (`scripts/build-geo.mjs`) konverterar till TopoJSON och checkas in. Ingen nätverkstrafik vid körning. Under 300 kB.
- Projektion: `d3.geoMercator`, centrerad på regionen.

### 6.2 Sektorer som områden

`SECTOR_LAYOUTS` ersätts av `SECTOR_REGIONS`: handritade polygoner per sektor med ett ankare på verklig koordinat. Ungefärliga ankare, verifieras vid bygget:

| sectorId | Ankare (lat, lng) |
|---|---|
| `hue` | 16.46, 107.59 |
| `da-nang` | 16.05, 108.21 |
| `an-loc` | 11.65, 106.60 |
| `cu-chi` | 10.97, 106.49 |
| `plain-of-jars` | 19.45, 103.18 |
| `ho-chi-minh-trail` | korridor i östra Laos, ca 15–17° N, 106–107° E, ritas som band |

Datat bor i `packages/app`. `deriveSectorControl` rörs inte.

### 6.3 Lager, underifrån

1. Hav och land, papperskornstextur (finns redan sedan etapp 6)
2. Landsgränser, DMZ
3. Underrättelsedimma
4. Sektorfyllning efter `SectorControl.side`
5. Frontlinje med tre bleknande spår bakåt
6. Försörjningslinjer
7. Förbandsbrickor
8. Huvudstäder, stationer, hamnar, ordermarkörer
9. `heat`-glöd per teater
10. Markering av valt föremål
11. Etiketter, kollisionsfria

### 6.4 Förbandsbrickor

APP-6-stil, ritat i kod: ramens **form** visar sida (rektangel för vänligt sinnad, romb för fientlig, kvadrat för neutral), inte bara färgen, så kartan fungerar för färgblinda. Inre tecken per doktrin, styrka som prickar, `mauled` som sprucken ram, `refitting` som dämpad. Allt läses via `formationDisplay`; utan station är ramen streckad med frågetecken och inget namn.

### 6.5 Underrättelsedimma

Sektorer i länder utan aktiv station ritas med snedstreck och lägre kontrast, med samma grind som `formationDisplay` och `officialDisplay`. Dimman visar var `RECRUIT` och `EXPAND` skulle ge något.

### 6.6 Den levande kartan

En karta känns levande av två slags rörelse, och det är viktigt att skilja dem åt.

**Omgivningsrörelse** (dekor, alltid på, billig): försörjningslinjernas streck flyter mot målet, `heat`-glöden andas långsamt, ordermarkörer pulserar tills de öppnats, stationer med hög exponering har en ring som blinkar, frontlinjen har ett svagt skimmer, telexremsan rullar. Detta är vad *DEFCON* gör: nästan ingenting förändras, men ingenting står still.

**Tillståndsrörelse** (modellen, en gång per tur): sektorer byter färg, frontlinjen flyttas, förband spricker, ordrar dyker upp där behov uppstod, en faktion byter färg efter en kupp, en tjänsteman ersätts.

Omgivningsrörelse löser *känslan* av stillhet men inte stillheten i sig. Om stillhetsmåttet i P75 visar att tillståndsrörelsen är nära noll de flesta turer, är beslut 2F nödvändigt för att kartan ska vara mer än en vacker bakgrund.

### 6.7 Försörjningslinjer

Spelarens leveranser under transport, ur `Shipment` (`arrivalTurn`) och `Contract.frontId`, som streckad linje i telexgult från ingångshamn till sektor. Rivalernas härleds ur hur `Front.attribution` förändrats mellan två turer och ritas i rivalens färg. Ingångshamnar per teater är presentationsdata.

### 6.8 Världsöversikt — ej i denna etapp

Rivalhusens kontor bär inga verb (§7.1), och med en enda teater blir en världskarta nästan tom. Flyttad till en framtida etapp med fler scenarier.

### 6.9 Interaktion

Ett finger panorerar, nyp zoomar, dubbeltryck zoomar in ett steg. Tre zoomnivåer där etiketter och detaljer tänds stegvis, så att vyn aldrig blir ett myller på en liten skärm:

| Nivå | Visar |
|---|---|
| 1 · Region (land valt, hela regionen) | Länder, sektorfärger, frontlinjer, försörjningslinjer, huvudstäder, ordrar, stationer |
| 2 · Teater (startläget) | Allt ovan plus förbandsbrickor, sektornamn, taggar på försörjningslinjer |
| 3 · Sektor | Allt ovan plus förbandsnamn och styrka i klartext |

Nivån avgörs av skalan, och etiketter som ändå kolliderar döljs efter prioritet (regel 18 i §3). Tryck väljer och öppnar bottenarket; tryck på tom yta stänger det. Föremål som ligger tätt (Hue och Da Nang) visar en liten väljare när trycket träffar flera. Skrivbord lägger till hovring, hjulzoom och tangentbord.

---

## 7. Interaktionsmodellen

### 7.1 Föremål och deras verb — rättad

Underrättelseverben utförs alltid **från en station** och verkar **i stationens land**. `LEAK` och `SABOTAGE` skadar en rivals ställning hos just den köparen. `TURN` riktas mot en tjänsteman i samma land. Kartans naturliga enhet är därför landet.

| Föremål | Verb | Mål väljs ur |
|---|---|---|
| Land med egen station | `EXPAND`, `WITHDRAW` | — |
| | `LEAK`, `SABOTAGE` | rivalhus aktiva i landet |
| | `TURN` | tjänstemän i landet |
| Land utan station | `RECRUIT` | — |
| Faktion / huvudstad | `INFLUENCE`, `STAGE_INCIDENT`, `BACK_CHANNEL`, `FUND_COUP`, `BROKER` | — |
| Tjänsteman (i CONTACTS eller landets bottenark) | `BRIBE`, `FUND_CAMPAIGN`, `FAVOUR`, `ASSASSINATE` | — |
| Order (markör vid köparen) | lägg bud | — |
| Sektor | förbandsinformation, inga verb | — |
| Råvarupanel i THE COMPANY | `BUY_FORWARD`, `RELEASE` | råvara |
| THE COMPANY | `TAKE_LOAN`, `REPAY`, `BUILD_LINE`, `HIRE`, `REPRIORITISE_RND` | — |

Rivalhus har en egen akt i CONTACTS, men inga verb där. Verben mot dem sitter i länderna där de konkurrerar.

Alla 22 verb nåbara är 7C:s viktigaste klart-villkor.

### 7.2 Handlingsplatserna

Antal platser är `house.actionPoints`. Varje köad handling är ett kort med ikon, mål och kostnad som glider in i sin plats i bottendockan. Tryck på kortet för att se det, tryck × för att ångra. Bud kostar ingen plats (`DESIGN.md` v2.1 §4) och syns som en räknare på CONTRACTS-ikonen.

### 7.3 Belopp utan fritextfält

Varje verb med kostnad får `TierPicker` med tre nivåer (*Modest*, *Serious*, *Lavish*), stora nog för tummen, och ett reglage för finjustering med ett greppområde på minst 44 px. Nivåernas belopp är balansdata. De flesta spelare kommer aldrig att röra reglaget.

### 7.4 Förhandsvisning och validering

Två nya rena funktioner i kärnan:

```ts
validateAction(state, draft, action): { ok: true } | { ok: false; reason: string }
previewAction(state, action): ActionPreview
```

`validateAction` bryts ut ur `applyActions.ts`, så att samma kontroll körs när kortet läggs och när turen avgörs. Golden ska vara bitvis identisk. `previewAction` visar bara vad spelaren kan veta: kostnad, intervall ur balansfilen, sannolikheter där underrättelsen räcker. Motståndarens `counterIntelligence` utan station visas som *Unknown*. Ett test per fält mot samma grind som `formationDisplay`.

### 7.5 CONTRACTS

En stämplad mapp per order: köpare, produkt, kvantitet, frist, och ett prisreglage över `winBand` som kurva, med marginal och vinstchans som följer reglaget. Inga dolda fält (`trueBudget`, `weights`, `integrity`).

### 7.6 Krisen

Helskärmskort med illustration, de tre valen och `PUSH`:s 30 % utskrivet. Kan inte stängas utan val.

### 7.7 This Quarter

Ett alltid synligt band under HUD:en med antal lägen (*THIS QUARTER · 3*). Tryck fäller ut listan över kvartalets lägen som spelaren kan agera på:

- nya ordrar
- stationer med hög exponering
- tjänstemän inför omval eller ersättning
- kontrakt som riskerar att bli sena
- kreditgränsen nära
- pågående kris

Varje rad har en ikon och hoppar till föremålet på kartan eller rätt skärm. Listan är en vägvisare, inte ett formulär: den löser att verb gömda i bottenark annars är svåra att hitta och omöjliga att planera kring. Härleds med en ren funktion i appen ur `GameState`.

---

## 8. Kvartalsuppspelningen

Varje `WireEvent` får ett ankare:

```ts
// packages/app — ren, testbar
wireAnchor(state, event): { kind: 'sector' | 'country' | 'station' | 'hud'; id: string }
```

**Standardläge: bara rubrikhändelser, i hög takt.** Full uppspelning av alla händelser är ett val i inställningarna. Tjugo turer av full uppspelning blir tjat efter den åttonde.

Uppspelningen visar händelserna i pipeline-ordning: leveranser längs linjer, strider som blixtar i sektorer, frontlinjen som flyttar sig, nya ordrar. Hoppa över med en knapp. Omedelbar vid `prefers-reduced-motion`.

Efteråt: NEWS DESK:s förstasida med rubriker och kausalkedjor, spelarens egna spår i telexgult.

---

## 9. Sidor som saknas eller byggs om

**Title Screen.** Den befintliga huvudmenyn görs om: kartan i bakgrunden med omgivningsrörelse, menyval som stora knappar med ikon, ljud och tillstånd, tangentbordsnavigering.

**New Game.** Husets namn, specialisering och hemstat enligt `DESIGN.md` §3. `createInitialState` tar valfria startval; standardvalen ger bitvis identisk golden.

**Briefing.** Läget 1964, styrelsens mål, en karta med teatern markerad. Stämplad som *CLASSIFIED*.

**Epilogue.** Byggs på ett nytt fält:

```ts
interface ChronicleEntry {
  turn: number
  kind: 'coup' | 'incident' | 'assassination' | 'leak' | 'sabotage' | 'crisis'
      | 'exposure' | 'bankruptcy' | 'restricted_delivery' | 'contract' | 'ceasefire'
  headline: string
  actorIsPlayer: boolean
  causeHeadlines: string[]   // upp till tre led, kopierade vid skrivtillfället
  doomsdayDelta: number
}
// GameState.chronicle: ChronicleEntry[] — tak 80, äldsta icke-spelarhändelser gallras först
```

En enda krönika ger `SHADOW` (räkna `kind` där `actorIsPlayer`), `RESTRAINT` (`doomsdayPeak` finns redan), kärnvapenepilogens utlösande handling (den sista spelarhändelsen med `doomsdayDelta > 0`), en sida med partiets tre vändpunkter, och en historikskärm. `CAPITAL` räknas ur huset. `REACH`: verifiera först om uppfyllda kontrakt ligger kvar i `state`; annars läggs en mängd `buyersServed` till i samma prompt. Golden fryses om en gång.

**Paus och inställningar.** Ljudnivå per kanal, uppspelningsläge, animationshastighet, reducerad rörelse, textstorlek, sparplatser.

**Handledning.** Kontextuella tips vid föremål under de första turerna i ett nytt parti, avstängningsbara. Plus en ordlista: varje tal i HUD och bottenark har en förklaring bakom en info-ikon (och vid hovring på skrivbord).

---

## 10. Visuell identitet och tillgångar

- **Typsnitt, paketerade med appen**, alla under SIL Open Font License och installerade via `@fontsource`:
  - *Archivo Narrow* för etiketter och gränssnitt, i samma familj som tidens News Gothic och Franklin Gothic
  - *Courier Prime* för allt som är skrivet på skrivmaskin: mappar, kort, telex, tal
  - *Stardos Stencil* för stora rubriker och knappar, som schablonmålat på en låda
  - *Libre Baskerville* för landnamn och kursiv för hav på kartan
- **Färger:** krämvitt papper, blekt havsblått, sepiabläck för kustlinjer, fettkrita i rött och blått, ockra för husets egna markeringar (arvtagaren till telexgult), manilla för mappar, olivgrå lackerad stål för panelerna. Den mörka paletten i `styles.css` ersätts, tokens byts i P73.
- **Symboler och ikoner i kod:** förbandsbrickor, stationsnålar, verb- och resursikoner, ett gemensamt system på 16/24 px.
- **Porträtt** av tjänstemännen, AI-genererade med en låst stilprompt. Tjänstemännen är fiktiva; inga verkliga statschefer (`DESIGN.md` §15).
- **Händelsebilder:** ett tiotal illustrationer för återkommande händelsetyper.
- **Ljud:** fyll krokarna från P72 och lägg till hovring, kortplacering, stämpel, telex, radiobrus och ett lågt rumsljud. CC0-källor.
- **Installerbar PWA:** PWA-pluginen som aviserades i P12 läggs till i P74 med manifest (`display: fullscreen`, `orientation: portrait`, ikon, startskärm i spelets färger) och service worker. Spelet läggs på hemskärmen och startar utan adressfält, offline.

Samma arbetsgång som `GRAFISKA_TILLGANGAR.md`: prompter i ett dokument, ägaren genererar, Claude Code kopplar in.

---

## 11. Arbetssätt

**1. Skiss före kod.** Varje ny skärm finns som en skiss som ägaren godkänt innan den byggs, med förebilderna i §4 som utgångspunkt. OPERATIONS finns skissad i tre tillstånd (kvartalets start, land valt, handling konfigureras), godkänd av ägaren 2026-09-22, som fristående HTML i `docs/ui/reference/` med typsnitten inbäddade. P73 renderar dem till PNG. Godkända bilder checkas in i `docs/ui/reference/`. Claude Code bygger mot en bild, inte mot prosa.

**2. Claude Code ser det den bygger.** `npm run shots`: Playwright renderar varje skärm vid fast seed och tur i två format, telefon (390 × 844, pekskärm emulerad) och skrivbord (1440 × 900), och sparar i `docs/ui/current/`. Telefonbilden är den som jämförs först. Varje UI-prompt avslutas med en jämförelse.

**3. Designsystemet först.** Panel, knapp, ikonknapp, flik, kort, handlingsplats, bottenark, Slider, Stepper, Segmented, TierPicker, Toggle, mätare, tooltip, förbandsbricka. Byggs och fotograferas på en egen komponentsida innan någon skärm sätts ihop av dem.

**4. Vertikal skiva.** En smal del byggs till slutlig kvalitet och godkänns innan något breddas. Det förhindrar att allt blir nästan rätt samtidigt.

**5. Designgranskning** med Rams på de ändrade UI-filerna efter varje prompt.

**6. Speltest vid varje halvetapp,** med samma tre frågor: *Vad försökte du göra och hittade inte? Vad hände som du inte förstod? När tråkades du?* Plus fem-sekunderstestet ur §1 på en skärmbild.

---

## 12. Skyddsräcken

1. `packages/core` förblir UI-okunnig. Nya kärnfunktioner är rena frågor och validerare, utom krönikan (P89) och startvalen (P88).
2. Ingen dold information läcker. Karta, bottenark, *This Quarter* och förhandsvisning läser bara via grindade funktioner. Ett test per grindat fält.
3. Ingen handling förbi `applyActions`. UI:t anropar samma `validateAction`.
4. Reglerna i §3 gäller alla UI-prompter.
5. Prestandabudget mätt på telefon: minst 50 bilder/s vid panorering med omgivningsrörelse på en iPhone från de senaste fyra åren, minst 30 på en Android i mellanklass. Omgivningsrörelse animeras bara med `transform` och `opacity`, och högst ett trettiotal element rör sig samtidigt. Sjunker bildtakten stängs omgivningsrörelsen av automatiskt. Första inläsning under 3 s på 4G. Geografidata under 300 kB. Mobil är där SVG först slår i taket; bryts budgeten här är det signalen för Pixi-lagret i §2D.
6. `play-20-turns.spec.ts` skrivs om till kartflödet och spelar fortsatt 20 turer utan konsolfel.
7. Golden ändras bara i P88 (om standardvalen inte ger identiskt tillstånd, är det en bugg) och P89.

---

## 13. Promptsekvens

En prompt per commit. Varje UI-prompt har samma villkor utöver sina egna: reglerna i §3 följda, `npm run shots` uppdaterat och jämfört mot referens, CI grönt.

### 7A — Grunden (ser ut som ett spel från dag ett)

**P73 — UI-regler, typsnitt och designsystem.** §3 in i `CLAUDE.md`. Paketerade typsnitt. Komponentbiblioteket ur §11.3 på en egen komponentsida, byggt för tryck först. `npm run shots` i båda formaten; skriptet renderar även `docs/ui/reference/*.html` till PNG i telefonformat, så att referens och bygge kan jämföras sida vid sida. *Klart när:* komponentsidan fotograferad på telefon och skrivbord, varje komponent visad i alla tillstånd, alla träffytor minst 44 px; testet för överlappande och klippt text (regel 18) finns och körs i CI; paletten och typsnitten ur §10 har ersatt de gamla.

> **Klart 2026-09-26.** Fyra typsnitt (`@fontsource/archivo-narrow` 500/600/700,
> `courier-prime` 400/700, `stardos-stencil` 400/700, `libre-baskerville` 400/400-italic)
> installerade och importerade i `main.tsx` — ersätter systemstackarna helt (§0.5:s eget fynd:
> "ingen service worker fanns" gjorde den gamla offline-motiveringen grundlös). `styles.css`s
> `:root`-token omskrivna till paletten ur §10 — hexvärden hämtade direkt ur de tre godkända
> referensskissernas inline-SVG (grep, inte gissat): krämvitt papper `#ebe1c7`, manilla
> `#f6f1e3`, sepiabläck `#241f18`, ockra `#b0700f` (telexgults arvtagare), fettkrita röd
> `#b3302a`/blå `#2d5a8c`, lackerad stål `#11140e`–`#8b917f`. Tokennamnen AVSIKTLIGT
> oförändrade sedan etapp 6 (`--bg`, `--amber`, `--west` m.fl.) — bara värdena bytta, för att
> undvika att röra varenda `var(--amber)`/`tone="amber"`-anropsplats i de fyra befintliga
> vyerna utan att något klart-när-villkor kräver det.
>
> Ny fil `designSystem.tsx` — samtliga femton komponenter ur §11.3 (Panel, Button, IconButton,
> DsTab, Card, ActionSlot, BottomSheet, Slider, Stepper, Segmented, TierPicker, Toggle,
> InfoTooltip, FormationToken), egen `.ds-*`-namnrymd skild från de äldre `.panel`/`.btn`/`.tab`-
> klasserna (som de fyra befintliga vyerna fortsätter använda oförändrat till P76+). Ny
> `ComponentLibrary.tsx`, nådd via `?screen=components` (`App.tsx`, avgjort INNAN `useGame()`
> anropas — stabilt över en session, aldrig en reaktiv växling). Fem komponenter hade
> ursprungligen för små träffytor (tooltip-cirkeln 20×20, stepper-knapparna 36×36, bottenarkets
> grepphandtag, handlingsplatsens ×-knapp 32 px bred, sliderns grepp 28×28 — §7.3 kräver
> uttryckligen "minst 44 px") — lösta med samma princip genomgående: den KLICKBARA rutan blir
> 44×44, den SYNLIGA markören ritas mindre inuti via ett nested element eller `::before`, så
> inget ser överdimensionerat ut. Ett sjätte, subtilare fall hittades av det egna CI-testet:
> `.ds-action-slot`s `min-height: 44px` gav bara 42 px NETTO åt de sträckta barnen eftersom
> `border-box` räknar bort den 1 px breda kanten på varje sida — höjt till 46px.
>
> `npm run shots` (`scripts/shots.mjs`, nytt) startar appens devserver + en egen liten statisk
> server för `docs/ui/reference/`, renderar komponentsidan i telefon- (390×844, pekskärm
> emulerad) och skrivbordsformat (1440×900) samt de tre referensskisserna till PNG i
> telefonformat, allt till `docs/ui/current/`. Node 22:s inbyggda `fetch` (undici) avvisade
> flera av de först valda utvecklingsportarna rakt av ("bad port", samma spärrlista webbläsare
> använder) — väntan på att devservern startat gjordes om med `node:http` i stället, som saknar
> den spärren.
>
> `e2e/text-overflow.spec.ts` (nytt): regel 18 (textklippning, `scrollWidth > clientWidth` på
> varje block-liknande element med egen direkt textnod) och regel 11 (träffytor, samtliga
> `button`/`a[href]`/`[role=slider|switch|radio|tab]` ≥44×44 px) — båda i båda formaten, körda i
> CI. Kartkollisionsdelen av regel 18 (etikett-/markörkollisioner) hör till P76, ingen karta
> finns än. Skärmlistan är avsiktligt kort (bara komponentsidan) — växer i takt med fler
> etapp 7-skärmar.
>
> Manuellt verifierat i en riktig Chromium-körning (skärmdumpar, telefon och skrivbord):
> samtliga femton komponenter läsbara i alla tillstånd, typsnitten laddar, paletten matchar
> referensskisserna. Golden ORÖRD — `packages/core` orört, ren `packages/app`-presentation.
> Fullt testsvep grönt: 527 tester, lint, typecheck, build×3, e2e (sex tester, körd två gånger
> i rad). Se `docs/ANDRINGSLOGG.md`.

**P74 — Skärmskalet och helskärms-PWA.** Fast viewport, ingen sidscroll, säkra områden. OPERATIONS-layouten för telefon ur §5 med platshållare, skrivbordsvarianten ovanpå. Flikrad med ikoner och nya namn (§2G). Bottenark. Övergångar mellan skärmar. HUD som instrumentpanel med räknande tal. Manifest och service worker enligt §10. *Klart när:* e2e grönt i telefonformat; spelet kan läggas på hemskärmen och startar i helskärm i stående läge; ingen `<select>` eller sifferfält synligt på de skärmar som byggts om; fem-sekunderstestet på en telefonbild.

> **Klart 2026-09-26.** Ny `Shell.tsx` (`HudBar`, `QuarterBand`, `TelexTicker`, `ActionDock`,
> `TabBar`, `MapPlaceholder`, `RejectedBanner`) — `App.tsx` omskriven kring den, `.ds-shell`
> (100dvh, `overflow: hidden`, `env(safe-area-inset-*)` på topp/sidor) med `.ds-shell-content`
> som ensam scrollar inuti sig själv. Flikraden (§2G:s nya namn, komponentbibliotekets
> unicode-glyfer ⌖▤⚙☷≋ från specens egen §5-mockup) botten på telefon, vänstermeny på skrivbord
> (`@media (min-width: 1024px)`, CSS grid). HUD:en räknar (`useCountUp`, `requestAnimationFrame`,
> avstängd av `prefers-reduced-motion` — samma jsdom-säkra `matchMedia`-mönster som `TheWire.tsx`
> redan använde) och fälls ut vid tryck för skuld/kredit/handlingspoäng. OPERATIONS-skärmen
> renderar `MapPlaceholder` — riktig karta är P76; **bottenarket** är redan byggt som en
> återanvändbar komponent i `designSystem.tsx` (P73) men får ingen egen instans i skalet här,
> eftersom platshållarkartan saknar valbara objekt att öppna den från — kopplas in när P76/P79
> ger kartan riktigt innehåll, inte en glömd rad i denna prompt.
>
> Manifest (`public/manifest.webmanifest`: `display: fullscreen`, `orientation: portrait`,
> ikonerna från `docs/GRAFISKA_TILLGANGAR.md`) och ett handrullat `public/sw.js`
> (cache-faller-tillbaka-på-nätverk för samma-ursprungs GET, `self.skipWaiting()`/
> `clients.claim()`) i stället för ett byggverktygstillägg — samma princip som
> `persistence.ts`/`sound.ts`. Registreras bara när `!import.meta.env.DEV`, så e2e-svepet (som
> kör mot `vite dev`) aldrig ser en tidigare körnings cachade svar. Verifierat i en riktig
> `npm run build && npm run preview`-körning: manifestet och `sw.js` svarar 200, och
> `navigator.serviceWorker.getRegistrations()` visar en aktiv registrering efter sidladdning.
> Ny `eslint.config.js`-regel (`globals.serviceworker`) skopad bara till `public/sw.js` — en
> `.js`-fil, matchar inte `packages/app/**/*.{ts,tsx}`s `globals.browser`, och Service Worker-
> globalerna (`self`/`caches`/`clients`/`skipWaiting`) hör inte till `globals.browser` ändå.
>
> **Två genuina fynd, båda fixade i samma commit, inte skjutna framför sig:**
> 1. `useGame.ts`s autospar (körs vid varje hydrering, redan med ett helt nytt, oanvänt parti)
>    gör att ett andra sidbesök alltid har `hasSave=true` — "New Game" visar då
>    bekräftelsedialogen ("Overwrite and start new?"), byggd redan i P65 men aldrig körd av
>    `scripts/shots.mjs`/e2e-svepet förrän skärmlistan växte till fler än en skärm i den här
>    prompten. Inget fel i appen — samma gren en riktig spelares andra besök tar. `shots.mjs`
>    och `text-overflow.spec.ts` hanterar den nu (väntar in och klickar
>    `new-game-confirm-yes` om den visas).
> 2. HUD:ens kassavärde (`£4,000,000`) klipptes av en `text-overflow: ellipsis` i
>    `.ds-hud-value` — `grid-template-columns: repeat(4, 1fr)` gav för lite plats åt den längsta
>    cellen. Hittat av regel 18:s eget CI-test sedan `e2e/text-overflow.spec.ts`s skärmlista
>    utökades från bara komponentsidan till huvudmenyn och OPERATIONS (samma "hittat av testet
>    självt, inte av mig"-mönster som P73:s `.ds-action-slot`). Fixat med en ojämn
>    `grid-template-columns: 0.6fr 1.6fr 0.9fr 1.1fr` (kassan får mer plats) och `ellipsis`/
>    `overflow: hidden` borttaget helt — en framtida överskridning ska synas och fångas av
>    testet, inte gömmas. Samma utökade skärmlista fångade också två hit-target-brott i
>    `MainMenu.tsx` (P65, byggd innan regel 11 fanns): "New Game" 280×43 och mute-togglen 93×32
>    — fixade med `min-height: 44px` på `.menu-btn`/`.menu-mute`.
>
> `e2e/persist-mid-turn.spec.ts` och `e2e/play-20-turns.spec.ts` uppdaterade från
> `getByRole('button', { name: /THE FLOOR/ })`/`/THE HOUSE/`/`/End Turn/` till
> `getByTestId('tab-contracts')`/`'tab-company'`/`'end-quarter-button'` — `hud`/`datestamp`/
> `credit-limit`/`hud-treasury` oförändrade, samma testid:n som innan. `scripts/shots.mjs`
> utökad med huvudmenyn och OPERATIONS (klickar igenom "New Game"), `e2e/text-overflow.spec.ts`
> likaså — regel 18 och regel 11 körs nu i CI mot tre skärmar i båda formaten, inte bara en.
> Manuellt verifierat i en riktig Chromium-körning: ingen sidscroll, `env(safe-area-inset-*)`
> tillämpad, `overflow: hidden` på `.ds-shell`, HUD-tal räknar vid mount, skärmbyten tonar in
> (`ds-view-fade`, avstängd av `prefers-reduced-motion`), flikraden botten på telefon/vänster-
> meny på skrivbord. Fem-sekunderstestet på `docs/ui/current/operations-phone.png`: läser som
> ett spelbords-HUD (instrumentpanel, kvartalsband, handlingsplatser, flikrad) vid första
> anblick, i linje med de godkända referensskisserna — bara själva kartan är fortfarande en
> platshållare, vilket är exakt denna prompts avsedda gräns. Golden ORÖRD — allt i
> `packages/app`. Fullt testsvep grönt: 527 tester, lint, typecheck, build, e2e (14 tester,
> körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P75 — Stillhetsmått i härnessen.** Per tur och parti: antal sektorer som bytt sida, frontrörelse, förband som bytt status, faktioner som bytt alignment, tjänstemän som ersatts. Ingen ändring i `core`. *Klart när:* CSV med måtten för 500 partier; ägaren tar beslut 2F på underlaget.

> **Klart 2026-09-26.** Fem nya kolumner i `GameMetrics`/CSV:n (`sectorsChangedSide`,
> `frontMovementTotal`, `formationsChangedStatus`, `factionsChangedAlignment`,
> `officialsReplaced`) — beräknade i `runGame.ts`s befintliga turloop, en tur i taget:
> `state` jämförs mot `prevState` (samma referens som redan fanns implicit, bara sparad innan
> `resolveTurn`-anropet) efter VARJE `resolveTurn`, ackumulerat till en enda summa per parti.
> Ingen ny räknare i `core` — `sectorsChangedSide` läser `queries.ts`s redan existerande
> `deriveSectorControl` (byggd för P66:s sektortavla), resten jämför fält som redan skrivs av
> etablerade mekaniker (`Front.position`, `Formation.status`, `Faction.alignment` — bara
> `FUND_COUP` skriver det, P61 — och `Official.name`, den enda platsen `replaceOfficial`
> ändrar på ett annars stabilt id/post-par).
>
> **Mätningen:** `npm run harness -- --runs 125 --policy aggressive,balanced,passive,capacity`
> — 500 partier (bokstavligt 500, inte 500 per policy) mot `indochina-slice`. Resultatet:
>
> | Mått | Snitt/parti | Andel partier med minst en ändring |
> |---|---|---|
> | `frontMovementTotal` | 45,6 (≈4,5/tur) | 100 % |
> | `formationsChangedStatus` | 7,79 (≈0,77/tur) | 100 % |
> | `sectorsChangedSide` | 0,06 | 6,4 % — och ALDRIG mer än en enda sektor i de partier det händer |
> | `factionsChangedAlignment` | 0 | 0 % |
> | `officialsReplaced` | 0 | 0 % (denna specifika 125-seedserie — se nedan) |
>
> De sista två raderna är INGET nytt fynd — de bekräftar bara P64:s redan dokumenterade
> mätning (`CLAUDE.md`, 2026-09-17: `aggressive` skickar in `FUND_COUP`/`ASSASSINATE` varje
> möjlig tur men avvisas nästan alltid av `house.actionPoints`) på en annan, oberoende
> seedserie. `officialsReplaced` registrerade faktiskt utfall > 0 i ett fristående
> 60-partiers styckprov under testutvecklingen (`runGame.test.ts`, andra seedsträngar) — samma
> sällsynta händelse, bara inte i just DESSA 500 partiers specifika slumpdragning. Ingen
> `factionsChangedAlignment`-"rör sig över noll"-test skrevs av samma skäl (se testfilens egen
> kommentar) — att kräva det hade varit att testa mot en premiss P64 redan mätt falsk.
>
> **Det faktiska, nya fyndet för beslut 2F** är kontrasten mellan de tre första raderna:
> fronten RÖR SIG (`front.position`, ≈4,5 enheter/tur) och förbanden VÄXLAR STATUS ofta
> (≈0,77/tur — active/mauled/refitting-cykeln lever) — men detta syns nästan ALDRIG som en
> ändrad SEKTORKONTROLL (`deriveSectorControl`s `side`-fält, det spelaren faktiskt ser på
> sektortavlan/den kommande kartan). 93,6 % av 500 partier har NOLL sektorer som byter sida
> under hela partiet, och de 6,4 % som har någon gör det EXAKT en gång. Läst mot §2F:s fråga
> ("kan förband byta sektor efter genombrott") — det finns rörelse och churn under ytan, men
> praktiskt taget ingen av den slår igenom till vad kartan visar som "vem kontrollerar var".
> En redeploy-efter-genombrott-mekanik skulle alltså inte konkurrera med en redan livlig
> sektorkarta — den skulle vara den FÖRSTA mekaniken som får sektorkontroll att röra sig alls
> i någon märkbar utsträckning. Ägaren avgör beslut 2F på detta underlag.
>
> Rådatan (500 rader, `policy,seed,...,sectorsChangedSide,frontMovementTotal,
> formationsChangedStatus,factionsChangedAlignment,officialsReplaced`) skickad till ägaren
> separat — `harness-results.csv` är gitignorat (repo-konventionen sedan `.gitignore` skrevs,
> P58/P64:s mätningar checkades inte heller in som filer, bara som prosa här).
>
> Fem nya tester i `runGame.test.ts` (välformade tal, `frontMovementTotal`/
> `officialsReplaced` rör sig över noll i egna stickprov), `csv.test.ts`/`cli.test.ts`
> uppdaterade med de fem nya kolumnerna. Golden ORÖRD (härnesset läser `resolveTurn`, skriver
> ingenstans i `state`). Fullt testsvep grönt: 530 tester, lint, typecheck, build. Se
> `docs/ANDRINGSLOGG.md`.

### 7B — Den vertikala skivan (Sydvietnam, slutlig kvalitet)

**P76 — Baskartan och sektorerna.** Geografiskriptet, TopoJSON, projektion, panorering och zoom, `SECTOR_REGIONS` för Sydvietnams teater, kontrollfärgning, frontlinje med spår. *Klart när:* prestandabudgeten mätt och hållen; samma trace-sekvens som P68:s test ger känd kartkoordinat.

> **Klart 2026-09-26.** `scripts/build-geo.mjs` (nytt): `world-atlas`s `countries-50m.json`
> (Natural Earth 1:50m, redan TopoJSON) → GeoJSON (`topojson-client`) → filtrerat till Vietnam
> (`704`), Laos (`418`), Kambodja (`116`), Thailand (`764`), Kina (`156`) → klippt till en
> bounding box runt Indokina (`@turf/bbox-clip`) → Vietnam DELAT i `north-vietnam`/
> `south-vietnam` vid 17°N (§6.1: "tillagd för hand", Natural Earth har ingen 1964-gräns —
> samma bbox-klipp-teknik, en gång per halva) → ombyggd till en delad topologi
> (`topojson-server`, dedupar gemensamma landgränser så Vietnams delning och grannländernas
> gränser matchar exakt) → förenklad (`topojson-simplify`) tills filen ligger under 300 kB-
> budgeten (§12 punkt 5). Resultat: `public/geo/indochina.topo.json`, **83,7 kB** — ingen
> förenkling ens behövdes. En egen DMZ-linje (17°N) som en tredje TopoJSON-`object`, inte
> bara Vietnam-delningens kant. Manuellt verifierat med ett SVG-utkast (Node, `d3-geo` utan
> DOM) innan komponenten byggdes — kartan såg geografiskt korrekt ut (Vietnam delat vid rätt
> breddgrad, alla sex sektorankare landade i rimliga lägen) innan resten av arbetet fortsatte.
>
> `sectorRegions.ts` (nytt, ersätter INTE `sectorLayout.ts` — den schematiska tavlan
> `SectorBoard.tsx`/`TheWorld.tsx` retirerar A drog ingen kod med sig, se filens egen
> kommentar): `SECTOR_REGIONS`, sex sektorer med §6.2:s ankarkoordinater ordagrant. Fem
> punktankrade sektorer får en åttkantig "handritad" blob (`blob()`, ~0,3° radie, longitud
> skalad med `cos(lat)` så den inte blir avlång); `ho-chi-minh-trail` — §6.2, ordagrant "ritas
> som band" — är ett eget, avlångt bandpolygon i stället. `geoMath.ts` (nytt):
> `interpolateFrontGeoPosition`, EXAKT samma algoritm som `SectorBoard.tsx`s
> `interpolateFrontPosition` (P68) — bara målet bytt från 0–100-skärmkoordinater till
> `[lat, lng]`. `test/geoMath.test.ts`: samma indata som `SectorBoard.frontline.test.tsx`
> (position -100/0/100, trace `[-100,-50,0]`) — ordagrant P76:s eget klart-når, "samma
> trace-sekvens som P68:s test ger känd kartkoordinat."
>
> Ny `TheatreMap.tsx` — ersätter `Shell.tsx`s `MapPlaceholder` på OPERATIONS (behåller den
> som fallback vid en misslyckad geo-fetch eller under laddning, i stället för att kasta bort
> den). `d3-geo` (`geoMercator`/`geoPath`, `viewBox="0 0 600 800"`, en fast designrymd —
> `d3-zoom` sköter interaktiv pan/zoom via en `<g transform>` ovanpå, orört av SVG:ns egen
> responsiva skalning). Sektorfärgning läser `deriveSectorControl` (queries.ts, P66,
> **rörd av ingen rad** i denna prompt — bara projicerad på riktig geografi i stället för
> `SECTOR_LAYOUTS`s fasta koordinater). Frontlinje + tre bleknande spår, en `<g>` per front
> med en `SECTOR_REGIONS`-post. Tre zoomnivåer (§6.9) styrda av `d3-zoom`s skala `k` — bara
> sektoretiketterna är zoomnivå-gated i denna prompt (förbandsbrickor/försörjningslinjer/
> stationer/ordermarkörer är P77/P79:s data, finns inte än). Etikettkollisionsdöljning
> (regel 18) mäter riktiga `getBBox()`-avgränsningsrutor i en `useLayoutEffect` och döljer
> lägre prioriterade etiketter vid en kollision — krymper aldrig.
>
> **Tre genuina fynd, alla fixade i samma commit:**
> 1. `.map-svg { height: 100% }` behöver en DEFINIT förälderhöjd — `.map-container` hade bara
>    `min-height`, vilket CSS-specen räknar som obestämt för procentberäkning. SVG:n föll
>    tillbaka till sitt eget `viewBox`-bildförhållande i stället för behållarens, fylld på
>    bredden och avklippt nedåt av `overflow: hidden`. Hittat VISUELLT i `npm run shots`
>    (skrivbordsbilden visade bara en beskuren nordöstra flik av kartan) — fixat med
>    `height: calc(100% - 4px)` (inte bara `min-height`).
> 2. Etikettkollisionens `useLayoutEffect` och d3-zoom-kopplingens `useEffect` körde BÅDA bara
>    en gång, på det första render-varvet innan geo-datans async `fetch` svarat (då fanns noll
>    `<text>`-element och `svgRef.current` var `null`) — och aldrig om när elementen väl fanns,
>    eftersom deras deps-listor (`transform.k`/`zoomLevel`/tomma `[]`) inte ändrades av att
>    geo-datan laddades klart. Två separata symptom (etiketter som löpte ihop; panorering och
>    zoom svarade inte alls på musen), samma rotorsak, samma fix — en `geoLoaded`-flagga
>    tillagd i båda effekternas deps. Andra hittat VISUELLT (`npm run shots`), andra genom
>    manuell interaktionstestning (musdrag + mushjul mot en riktig Chromium-körning) — ingen
>    av de två testades av `jsdom`-sviten, som mockar `fetch` och därför aldrig ser ett
>    "laddar"-render-varv.
> 3. `state.ts` seedar `front.trace = [f.position]` vid partistart — vid tur 0 är alltså
>    NUVARANDE markör och den ENDA spårpunkten på exakt samma koordinat, en garanterad
>    kollision med sig själv. Regel 18:s eget CI-test (kartkollisionsdelen, byggd i denna
>    prompt) fångade det direkt. Fixat genom att filtrera bort en spårpunkt vars värde är
>    identiskt med `front.position` — "ingen rörelse än" ska se ut som EN markör.
>
> **Prestandabudgeten (§12 punkt 5):** kan INTE mätas mot en riktig telefon i den här
> sandlådan — flaggat, inte gissat. En syntetisk proxy kördes i stället: headless Chromium,
> `Emulation.setCPUThrottlingRate(4)` (samma sorts grova nedsaktning DevTools egen
> "Low-end mobile"-preset använder, inte en riktig enhet), 20 simulerade dragrörelser över
> kartan, `requestAnimationFrame`-tidtagning. Resultat: 59,7 bilder/s i snitt, sämsta enskilda
> bildruta 44,2 ms (~23 bilder/s, en kort topp, inte ihållande) — över budgetens 30/50-krav
> under den här grova nedsaktningen, men **inte samma sak som en mätning på en riktig iPhone
> eller Android i mellanklass**, som §12 punkt 5 ordagrant kräver. Kvarstår som en punkt
> ägaren behöver verifiera på riktig maskinvara. TopoJSON-filen (83,7 kB) och den första
> inläsningens tillgångar ligger gott under 300 kB/3 s-kraven.
>
> Golden ORÖRD — allt i `packages/app`, `deriveSectorControl`/`queries.ts` orörda. Nio nya
> npm-paket: `d3-geo`/`d3-zoom`/`d3-selection`/`topojson-client` (runtime),
> `world-atlas`/`topojson-server`/`topojson-simplify`/`@turf/bbox-clip`/`@turf/simplify`
> (bara `build-geo.mjs`, inte i appens bunt). `e2e/text-overflow.spec.ts` fick regel 18:s
> kartkollisionsdel (egen testloop, `.map-sector-label`/`.map-frontline-marker*`,
> `getBoundingClientRect()`-par). Fullt testsvep grönt: 543 tester, lint, typecheck, build,
> e2e (16 tester, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P77 — Brickor, dimma och omgivningsrörelse.** APP-6-brickor, underrättelsedimma, allt i §6.6 under *omgivningsrörelse*. *Klart när:* förband utan station renderas streckat och namnlöst; reducerad rörelse stänger av allt utom tillståndsbyten.

> **Klart 2026-09-26.** Tre tillägg i `TheatreMap.tsx`, alla lager 3/7/9 i §6.3:s
> lagerordning, sektoretiketterna flyttade till lager 11 för att stämma (låg tidigare mellan
> sektorer och frontlinje, en kvarleva från P76 innan lager 8–10 existerade som begrepp).
>
> **Förbandsbrickor (§6.4, lager 7).** `FormationToken` — ramens FORM visar sida (rektangel
> för `side: 'a'`, romb för `'b'`; "kvadrat för neutral" är strukturellt onåbar med dagens
> binära `Formation['side']`-typ, samma "skyddsräcke utan nuvarande källa"-linje som
> `OldFrontCard`/`UnlayoutedSectors` redan har, inte en lucka att bygga runt). `DoctrineGlyph`
> — fem vektorformer, en per `Doctrine`. Styrka som 1–3 prickar (`strengthBand`). `mauled` en
> sprucken bana ovanpå ramen, `refitting` en dämpad opacitet. Allt läst genom `formationDisplay`
> (P41, orörd) — `known === false` ger en streckad ram (`is-unknown`) och ETT genuint fynd:
> frågetecknet byggdes FÖRST som ett `<text>?</text>`, men SVG:s `scrollWidth`/`clientWidth`
> för ett enda, oplacerat `textAnchor="middle"`-tecken visade sig ge olika avrundning
> specifikt på skrivbordsformatet (`scrollWidth 4 > clientWidth 2`, 8 identiska instanser) och
> trippade regel 18:s klippningstest — trots att inget klipptes visuellt (bekräftat med ett
> riktat diagnosskript mot en riktig Chromium-körning: `display: block`, `rectWidth ≈3.7px`,
> samma mönster upprepades INTE för flerteckensetiketter som "HUE"). Fixat genom att ersätta
> texten med en ren bana (en krok + en prick), samma "form, inte textmätning"-princip
> `DoctrineGlyph` redan använder — inte en textstorleks- eller positioneringsfix, en
> arkitekturfix. `tokenOffset` (nytt, `geoMath.ts`) sprider flera `Formation` som delar samma
> `sectorId` i ett rutnät (`TOKENS_PER_ROW=3`) runt sektorns projicerade ankare, rent
> pixelmässigt — ingen geografi inblandad, till skillnad från `interpolateFrontGeoPosition`.
> Namnetiketter renderas SEPARAT, i det samlade etikettlagret (lager 11) med ABSOLUTA
> koordinater — ett genuint fynd hittat vid kodgranskning INNAN något kördes: en etikett
> nästlad i brickans egen `<g transform>` hade mätts i fel koordinatrymd av regel 18:s
> `getBBox()`-kollisionsdöljning jämfört med sektoretiketterna (redan absolutpositionerade),
> se `TheatreMap.tsx`s egen kommentar. Namn syns först vid zoomnivå 3 (§6.9); vid nivå 2 syns
> bara brickan.
>
> **Underrättelsedimma (§6.5, lager 3).** Per LAND, inte per sektor — `COUNTRY_TO_FACTION`
> mappar en TopoJSON-landfeature till dess `FactionId`, `effectiveDepth(state, factionId) === 0`
> ger snedstreck (`<pattern>`, 45°) och sänkt kontrast. Sektorns KONTROLLFÄRG (lager 4,
> `deriveSectorControl`) förblir alltid synlig oavsett dimma — samma distinktion
> `deriveSectorControl`s egen kod-kommentar redan gör ("kontrollstatus är grov/synlig oavsett
> underrättelsedjup"), buren vidare hit i stället för uppfunnen på nytt.
>
> **Omgivningsrörelse (§6.6, lager 9 + frontlinjen).** `heat`-glöd per teater — en suddig
> cirkel centrerad på teaterns sektorankares medelpunkt, radie och opacitet skalade mot
> `Theatre.heat` (`DISPLAY_THRESHOLDS.heatEscalation`, P29, ÅTERANVÄND — inget nytt balanstal
> uppfunnet), "andas" via en CSS `transform: scale()`-animation. ETT genuint fynd, hittat vid
> kodgranskning INNAN något kördes: en `opacity`-baserad CSS-animation hade helt ERSATT (inte
> kombinerat med) JSX:ens `style={{opacity: ...}}`-baserade heat-intensitet — CSS `animation`
> på en egenskap vinner alltid över en inline `style` för SAMMA egenskap medan den är aktiv.
> Löst genom att andas på `transform` i stället, `opacity` kvar helt under Reacts kontroll.
> Frontlinjemarkören (redan `<circle>` sedan P76) fick ett svagt skimmer, samma sorts CSS
> `animation` på `r`/`opacity`. Den globala `prefers-reduced-motion`-regeln (`* { animation:
> none !important }`, redan i `styles.css` sedan tidigare etapper) stänger av båda utan någon
> ny kod — precis §6.6:s "omgivningsrörelse, alltid på, billig" plus klart-näts reducerad-
> rörelse-krav, uppfyllt av en redan existerande global regel.
>
> Golden ORÖRD — allt i `packages/app`, ingen `core`-fil rörd. 10 nya komponenttester
> (`TheatreMap.test.tsx`, 15 totalt i filen) + 4 nya i `geoMath.test.ts` (`tokenOffset`).
> `npm run shots` (telefon + skrivbord) verifierade visuellt: brickor, dimhatchning över Laos
> och norra Vietnam (ingen station där vid partistart), två `heat`-glödfläckar, frontlinjens
> DMZ-band — allt läsbart i båda formaten. Fullt testsvep grönt: 555 tester, lint, typecheck,
> build, e2e (16 tester, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P78 — `validateAction` och `previewAction`.** Utbrutna ur `applyActions.ts`. *Klart när:* golden bitvis identisk; varje avvisningsorsak har ett test som visar samma svar från båda.

> **Klart 2026-09-26.** Ny toppnivåfil `validateAction.ts` (inte under `resolve/`, som
> `queries.ts`/`pricing.ts` — en UI-anropare i P79 har ingen `ResolveContext`): en enda
> switch över `PlayerAction['type']`/`op` som replikerar VARJE avvisningsvillkor som
> tidigare låg inline i `applyActions.ts`/`political.ts`, ordagrant samma reason-strängar.
> `applyActions.ts` och `political.ts` anropar den nu i stället för att upprepa
> kontrollerna — `political.ts`s fem funktioner tappade sina `rejected.push`-grenar helt
> (applyActions.ts validerar INNAN den dispatchar dit, se filens egen kommentar) och
> använder `!`-assertioner på sina uppslag, samma mönster som INTEL/MARKET/BROKER-
> grenarna i applyActions.ts redan fick. `isTakeLoanPayload`/`isRepayPayload`/
> `isHirePayload`/`isRndPayload`/`COMMODITIES`/`TECH_CATEGORIES`/`HIRABLE_ROLES` flyttade
> till validateAction.ts (nu den enda källan, applyActions.ts importerar tillbaka dem för
> TypeScript-avsmalning i sin egen mutationskod).
>
> **`ResolveContext` fick ett nytt fält, `state`** (state vid turens BÖRJAN, aldrig
> muterat) — signaturen `validateAction(state, draft, action)` behöver BÅDA: `draft` för
> de flesta kontrollerna (nuläget, inklusive föregående actions i SAMMA inskickning),
> `state` bara för TAKE_LOAN:s kreditrest (se nästa stycke). `resolveTurn` sätter den från
> sitt eget, redan existerande `state`-argument (ingen extra klon). Ren mekanisk följd:
> alla femton `resolve/steps/*.test.ts`-filers `ResolveContext`-literaler fick samma
> `state`-fält (`state, draft: state,` — samma referens, ingen semantisk skillnad för de
> steg som inte anropar validateAction). `applyActions.test.ts` är undantaget: dess
> `ctx.state` är en RIKTIG klon tagen FÖRE mutation (`cloneState(state)`), eftersom testerna
> läser `state` EFTER anropet och förväntar sig mutationerna på samma objekt som `draft`.
>
> **Genuint fynd, upptäckt under bygget, INTE tyst löst:** två av de gamla lokala
> spårarna (`remainingCredit`, `bribeGainThisTurn`) fanns bara som loop-lokala variabler,
> aldrig i `GameState`. Utredning visade att `bribeGainThisTurn` ALDRIG var en
> avvisningsorsak (BRIBE:s tak klipper bara vinsten tystare, avvisar aldrig) — den behöver
> alltså ingen validateAction-gren, oförändrad kvar i `political.ts`. `remainingCredit`
> (TAKE_LOAN) ÄR en avvisningsorsak. En enkel `draft.house.debt − state.house.debt`-diff
> visade sig FEL i ett smalt fall: en REPAY tidigare i samma inskickning sänker `debt`,
> vilket en naiv diff skulle läsa som "mer kreditutrymme" — ett beteende
> ORIGINALKODEN aldrig hade (`remainingCredit` där påverkades ENDAST av TAKE_LOAN).
> Löst med en klampad diff (`Math.max(0, …)`), som är EXAKT för alla scenarier UTOM
> "TAKE_LOAN, sedan REPAY, sedan ett nytt TAKE_LOAN i SAMMA inskickning" (då tillåter
> validateAction marginellt mer lånat än originalkoden). Sökt igenom hela test- och
> golden-sviten: den sekvensen förekommer INGENSTANS. Beslut: den klampade diffen
> används, avvikelsen dokumenteras (här och i `test/validateAction.test.ts`s egen
> kommentar) i stället för att tröskla in ett nytt `GameState`-fält bara för att täcka ett
> otestat, hypotetiskt fall — se ANDRINGSLOGG.md.
>
> **Beslut, dokumenterat: "no executive actions remaining" (handlingstaket) ligger KVAR
> utanför `validateAction`**, oförändrad i `applyActions.ts`s egen loop. Den kontrollen
> handlar om KÖNS kapacitet (hur många actions föregår den här i inskickningen), inte om
> handlingens EGEN giltighet — strukturellt outtryckbar av `validateAction(state, draft,
> action)`, som bara ser EN handling åt gången, aldrig hela listan eller dess ordning.
> `test/validateAction.test.ts`s sista test visar det uttryckligen: två i övrigt giltiga
> handlingar validerar var för sig, men den andra avvisas ändå av `resolveTurn` när
> `actionPoints` tar slut.
>
> `previewAction.ts` (ny): `cost`/`successPct`/`successPctKnown`. Alla sannolikhetsformler
> ÅTERANVÄNDA (inte handkopierade) — `intelOpSuccessPct` exporterad från applyActions.ts,
> `fundCoupSuccessPct` ny, exporterad från political.ts (bröt ut den inline-formeln som
> redan fanns) — samma "en formel, en källa"-princip som bidEstimate/bidding.ts
> (ANDRINGSLOGG.md 2026-09-13). "Motståndarens counterIntelligence utan station visas som
> Unknown" (§7.4, ordagrant) löst med SAMMA `effectiveDepth(state, nation) > 0`-grind som
> `formationDisplay`/`officialDisplay` redan använder — både för FUND_COUP (mot VILKET
> land som helst, ingen egen station krävs för att FÖRSÖKA) och för
> LEAK/SABOTAGE/TURN (som kräver en egen station, men en nyrekryterad sådan har depth 0
> och är ändå "Unknown" — samma grind oavsett att stationen är din egen).
>
> **Scope-beslut, dokumenterat i `types.ts`s `ActionPreview`-kommentar:** "intervall ur
> balansfilen" (§7.4, t.ex. STAGE_INCIDENTs heat-spann) är UTTRYCKLIGEN INTE med i den
> här versionen — bara `cost`/`successPct`, de två fält som gäller flest av de 22 verben.
> P79 (som faktiskt bygger `TierPicker`-gränssnittet mot `ActionPreview`) avgör vilka verb
> som behöver mer, i stället för att den formen uppfinns här utan en konsument som kan
> bekräfta den.
>
> Golden ORÖRD (verifierat, `test/golden/golden.test.ts` grön, ingen omfrysning). Två nya
> testfiler: `test/validateAction.test.ts` (40 tester — en parity-kontroll PER
> avvisningsorsak, ordagrant klart-när: samma svar från `validateAction()` direkt OCH från
> den fulla `resolveTurn()`-vägen, plus TAKE_LOAN-kreditrestens tre kantfall) och
> `test/previewAction.test.ts` (15 tester, inklusive "Unknown"-exemplet). Fullt testsvep
> grönt: 610 tester (555 → 610), lint, typecheck (alla tre paket), build. Ingen `packages/
> app`-fil rörd — P78 är en ren `packages/core`-refaktorering, ingen UI, inget e2e-svep
> relevant. Se `docs/ANDRINGSLOGG.md`.

**P79 — Val, landets bottenark och handlingsplatserna.** Sydvietnam och dess huvudstad, station, tjänstemän och ordrar går att välja. Landets bottenark med underrättelseverben (alla sex) och `TierPicker`. Handlingsplatserna. *Klart när:* alla sex underrättelseverb går att köa från kartan och avgörs korrekt i en e2e-tur.

> **Klart 2026-09-26.** Ny `CountryFile.tsx` (ny `BottomSheet`-skärm, lager 10/11 på
> kartan — §6.3:s "selection highlight"/"labels" — fylls i av samma komponent) öppnas av
> ett klick på huvudstadsmarkören (ny `<circle class="map-capital-marker">` per faktion
> med egen geografi, `capitals.ts`, ny fil), med en tydlig kontur (§ regel 9) runt landets
> path samtidigt (`TheatreMap.tsx`, ny `is-selectable`/`map-country-selected`-CSS). Bara
> RVN (station, Saigon) och Laos (ingen station) har egen kartgeografi — NLF delar RVN:s
> landmassa, en redan existerande, dokumenterad lucka från P76/P77:s `COUNTRY_TO_FACTION`,
> inte löst här och inte i vägen för klart-villkoret (LEAK/SABOTAGE/TURN kräver ingen NLF-
> specifik måltavla).
>
> **Scope, grundat i specens egen text:** §7.1 säger uttryckligen "Alla 22 verb nåbara är
> 7C:s viktigaste klart-villkor" — P79 äger alltså bara de sex INTEL-verben (EXPAND,
> WITHDRAW, LEAK, SABOTAGE, TURN, RECRUIT) plus ETT POLITICAL-exempel för att bevisa
> mönstret inför P86: INFLUENCE, det verb den tredje godkända referensskissen
> (`operations-3-configure-action.html`) faktiskt visar. Övriga 15 verb är P86:s.
> COVERT-sektionen visar EXPAND/WITHDRAW/LEAK/SABOTAGE/TURN när landet har en aktiv
> station, annars bara RECRUIT ("NO COVERAGE", ingen exponeringsmätare) — samma
> `effectiveDepth`-grind `formationDisplay`/`officialDisplay`/`previewAction` (P78) redan
> använder. EXPAND/WITHDRAW köas direkt (inget mål att välja); LEAK/SABOTAGE/TURN öppnar
> en målväljare (rivalhus respektive landets aktiva tjänstemän).
>
> **INFLUENCE-formuläret** (Effect/Direction/Spend, ordagrant §7.4:s `TierPicker`-mönster):
> ny `computeInfluenceAfter` (`political.ts`, exporterad) och en ny `INFLUENCE_BALANCE`
> (`queries.ts`, tre spend-nivåer — modest/serious/lavish — samma "en formel, en källa"-
> disciplin som P78:s `intelOpSuccessPct`/`fundCoupSuccessPct`). `ActionPreview` (core,
> `types.ts`) fick ett nytt fält, `effect: { label, before, after } | null` — en avsiktlig
> utvidgning av P78:s medvetet smalare version, motiverad av att INFLUENCE är just det
> verb P78:s egen scope-kommentar pekade på ("P79 avgör vilka verb som behöver mer").
> `previewAction.ts` fick en ny INFLUENCE-gren som fyller fältet; alla andra verb har
> fortfarande `effect: null`, oförändrat.
>
> **Genuint fynd, hittat av e2e-testet självt, inte gissat:** Playwrights standardklick
> (boundingbox-mittpunkt) på Sydvietnams konkava kustlinje missade landmassan helt —
> Kambodja, ritad SENARE i SVG-paint-ordningen, låg faktiskt överst på den pixeln
> ("map-country-cambodia intercepts pointer events", 536 omförsök, 280 s timeout).
> Löst genom att låta e2e-testet klicka den lilla, isolerade huvudstadscirkeln i stället
> för landmassan — samma tappmål kartan själv redan erbjuder (§7.1), bara mer robust i ett
> automatiserat test. Ingen produktionskod ändrad för fyndet; dokumenterat i
> `operations-intel.spec.ts`s egen kommentar och här enligt "stanna, beskriv, föreslå"-
> regeln.
>
> Golden ORÖRD (`INTEL`/`POLITICAL`-actionerna och deras avgörande fanns redan sedan
> tidigare etapper — P79 lägger bara UI ovanpå, rör ingen `resolve/`-fil). Nya tester:
> `CountryFile.test.tsx` (9), `TheatreMap.test.tsx` (+5, nu 20 totalt), `previewAction.test.ts`
> (+3). Ny e2e `operations-intel.spec.ts` — klart-näts egen verifiering, ordagrant: köar
> alla sex INTEL-verb över två kvartal (RVN:s tre station-krävande verb plus TURN i det
> andra, WITHDRAW sist eftersom den gör stationen `'dormant'` vid AVGÖRANDET, inte vid
> köningen), kontrollerar att ingen avvisades. `npm run shots` utökat med två nya skärmar
> (`country-file`, `country-file-influence`) och jämfört visuellt mot
> `operations-2-country-selected.html`/`operations-3-configure-action.html` — layout,
> typografi, TierPicker-markering och före/efter-siffror matchar referensskisserna i båda
> formaten. Fullt testsvep grönt: 627 tester, lint, typecheck (alla tre paket), build, e2e
> (17 tester, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P80 — Kvartalsuppspelningen och NEWS DESK.** `wireAnchor`, rubrikläge som standard, full uppspelning som val, förstasidan. *Klart när:* minst 80 % av händelserna i en 20-turers golden-körning får ett ankare som inte är `hud`; annars redovisas vilka typer som saknar `subjectId`.

> **Klart 2026-09-26.** Ny `wireAnchor(state, event)` (`packages/app/src/wireAnchor.ts`,
> ren och testbar per specens egen signatur). Specen ger bara signaturen, ingen
> routningsregel — byggd DATA-driven i stället för `scope`-driven: **genuint fynd**,
> `adjustFrontOpponentRelations` (political.ts, etapp 5) emittar `scope: 'faction'` med
> `subjectId: front.id` (en FRONT, inte en faktion — relationen mellan två länder existerar
> bara via deras gemensamma front), så `event.scope` ensamt räcker inte. Ordningen: (1)
> `subjectId === null` → `hud`; (2) ett `FrontId` → `sector`; (3) ett `FactionId` → `station`
> (om `scope === 'house'` och huset har en station där, annars `country`); (4) ett `TheatreId`
> (kollat SIST) → `sector`. **Ett andra genuint fynd, hittat vid mätningen mot ett riktigt
> 20-turersparti, inte i förväg gissat:** `heat.ts`/`doomsday.ts`s HEAT-händelser har
> `subjectId: theatre.id` — en TREDJE id-rymd. `indochina-slice.json`s andra teater heter
> `laos`, SAMMA sträng som faktionen `laos` (`front-laos` krockar aldrig, prefixet skiljer) —
> en verklig, oundviklig kollision i scenariodatan. Löst genom att kolla faktioner FÖRE
> teatern: Laos LANDETS betydligt vanligare köpar-/underrättelsehändelser (`country`) väger
> tyngre än en enstaka HEAT-ticker för Laos TEATERN, som därmed (dokumenterat, avsiktligt)
> klassas som `country` i stället för `sector` — fel finkornighet, men fortfarande inte `hud`,
> så täckningsmåttet påverkas inte. En riktig fix kräver ett eget `theatreId`-fält på
> `WireEvent`, utanför P80:s mandat. **Känd, dokumenterad lucka:** ett `RivalId` (rivals.ts:s
> egna marknadshändelser) har ingen kind-variant i §8:s union → `hud`, tills en framtida
> prompt (P86:s CONTACTS-dossierer för rivalhus) ger rivalhus en egen plats. Ny `anchorLabel`
> i samma fil — en kort, läsbar etikett (`RVN`, `SAIGON`, teaterns namn) för badges i
> QuarterReplay och NEWS DESK.
>
> **Mätningen** (klart-när, ordagrant): ett engångsskript, samma `playScript`-mekanik som
> golden-testet, kört mot alla fyra botpolicyer (`passive`/`aggressive`/`balanced`/
> `capacity`) över 21 turer (`TURNS`, samma som golden). Resultat: 85,6–90,4 % icke-`hud` per
> policy, 88,8 % kombinerat över 2 125 händelser — komfortabelt över 80 %-tröskeln. De
> återstående `hud`-händelserna är nästan uteslutande `subjectId: null` (ekonomi, produktion,
> R&D, doomsday, styrelsegranskning — genuint husövergripande, ingen egen plats att peka på)
> plus den dokumenterade rival-luckan ovan.
>
> **Kvartalsuppspelningen** (ny `QuarterReplay.tsx`, ett fullskärmsöverlager mellan End
> Quarter och NEWS DESK, `App.tsx`s `handleEndTurn` uppdaterad till `endTurn() →
> setReplaying(true)` i stället för direkt `setView('news')`): rubrikhändelser i
> emissionsordning som standard (`severity === 'headline'`), en i taget, `REPLAY_INTERVAL_MS`
> (700 ms). Skip-knapp. `prefers-reduced-motion` gör hela sekvensen omedelbar (ingen ruta
> visas alls, `onDone()` anropas direkt vid montering) — samma tolkning som "Hoppa över med
> en knapp. Omedelbar vid prefers-reduced-motion" ordagrant kräver. **Scope-beslut,
> dokumenterat:** §8:s "leveranser längs linjer, strider som blixtar i sektorer, frontlinjen
> som flyttar sig" beskriver en fullt animerad uppspelning ovanpå `TheatreMap` — utanför P80:s
> mandat (kartan visar bara NULÄGET, ingen mekanik för att rita en HISTORISK händelse finns,
> och att bygga den är en betydligt större insats). Löst med en läsbar, textbaserad sekvens i
> stället: rubrik + var (`wireAnchor`/`anchorLabel`-badge) + vem (spelarmarkering) — samma
> information utan att uppfinna en kartanimationsmotor ingen framtida prompt bett om än. **Ett
> andra scope-beslut:** "ett val i inställningarna" förutsätter en inställningsskärm som inte
> finns (P90, obyggd) — samma lucka P72 redan löste för mute-togglen genom att lägga den där
> den faktiskt gick att nå. Samma mönster här: en `DsToggle` ("Full playback") i själva
> uppspelningsöverlaget, sparad med samma nyckel-i-IndexedDB-teknik som mute
> (`persistence.ts`s `loadFullReplay`/`saveFullReplay`, ny nyckel `settings:fullReplay`).
>
> **NEWS DESK** (`TheWire.tsx` döpt om i UI, filnamnet oförändrat per §2G:s egen regel — "bara
> det spelaren ser"): en ny hero-ruta (`.news-hero`) ovanför telexlistan visar den SENAST
> AVSLÖJADE rubrikhändelsen i stor stil — en riktig förstasida har en huvudrubrik, inte bara
> en lista. Byggd mot `visible` (den redan avslöjade delmängden), aldrig `sorted`, så hjälten
> aldrig spoilar en händelse reveal-sekvensen inte hunnit visa än. Varje telexrad fick en
> `wireAnchor`/`anchorLabel`-badge (delad CSS-klass, `.wire-anchor`, med QuarterReplay). Yttre
> `Panel` (ui.tsx, etapp 6-registret) bytt mot `DsPanel` (designSystem.tsx, P73) — samma
> modernisering CountryFile.tsx redan fick i P79, nu NEWS DESK:s tur (`ui.tsx`s egen kommentar
> förutsatte uttryckligen att de fyra kvarvarande vyerna byggs om "skärm för skärm"). Chain-
> expansion (`causeChain`, `wireChain.ts`, oförändrad), spelarmarkering (`Tag`, ui.tsx) och
> krismodalen rörda minimalt.
>
> **Genuint fynd, upptäckt och löst under research, inte i efterhand:** `packages/core/test/
> queries.test.ts` byggde en `ResolveContext`-literal utan `state`-fältet P78 lade till
> (`bidding()`-anropet på rad 212) — missad i P78:s egen "alla femton `resolve/steps/
> *.test.ts`-filer"-genomgång eftersom `queries.test.ts` ligger utanför den katalogen. Bröt
> `npm run typecheck` (den mandaterade fulla svepskommandon, skild från `tsc --noEmit` mot
> bara `src/`) redan INNAN P80:s eget arbete påbörjades — verifierat med `git stash` mot P79:s
> commit. Fixad med exakt samma `state, draft: state,`-mönster som de femton andra filerna.
>
> Golden ORÖRD (ingen `resolve/`-fil rörd av P80 självt — bara den redan trasiga
> testfixturen ovan). Nya tester: `wireAnchor.test.ts` (16, inklusive teater-kollisionen och
> `anchorLabel`), `QuarterReplay.test.ts` (7, täcker samtliga fyra klart-näts-krav ordagrant:
> reducerad rörelse, rubrikläge, full uppspelning, skip). Fullt testsvep grönt: 650 tester,
> lint, `npm run typecheck` (alla tre paket, inklusive testfilerna), build, e2e (17 tester,
> körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P81 — Speltest av skivan. Ingen kod.** Ägaren spelar skivan, besvarar frågorna i §11.6 och godkänner eller underkänner stilen. Underkänd stil åtgärdas innan 7C.

> **Speltest genomfört 2026-09-27.** Ägarens svar på §11.6:s tre frågor är sorterade i tjugo
> punkter (P81-1 till P81-20). Varje punkt kontrollerades mot koden innan den placerades i
> planen. Ägaren fällde ingen uttrycklig dom över själva registret (krigsrummet 1965);
> synpunkterna gäller läsbarhet och spelbarhet. Skivan godkänns därför inte som den är, och
> åtgärdspasset P81a–P81d körs före 7C enligt P81:s egen regel. Fem-sekunderstestet besvarades
> inte och görs om efter P81d.
>
> **Tre fynd i koden, verifierade med riktade sonder:**
> 1. **"0 % vinstchans oavsett bud" är ett visningsfel, inte ett spelfel.** `computeWinBand`
>    (`queries.ts`) räknar bara på fem prispunkter mellan `rivalPriceLow` och `rivalPriceHigh`,
>    och följer aldrig spelarens eget bud. Med seed `playtest-1` vid tur 1 visar 7 av 9 ordrar
>    0 % i alla fem punkterna. En simulering av `bidding.ts` med spelarens bud på 70 % av
>    `rivalPriceLow` vann däremot 36–100 % av 100 dragningar, och på 50 % vann den alla. Spelaren
>    fick alltså aldrig se de priser där den faktiskt kan vinna. Samma fel har styrt
>    balansmätningarna: botpolicyn `balanced` bjuder på bandets punkter (`policies.ts`) och tog
>    9,7 % av marknaden, medan `aggressive`, som bjuder under `rivalPriceLow`, tog 45 % (P53).
>    Golden-testet kör `balanced`, så `bidEstimate.winBand` kan inte ändras utan att golden bryts.
>    P81c lägger därför en ny, separat fråga för spelarens kurva.
> 2. **"Utkastad tur 10" är `BUYOUT` vid styrelsens andra underkända granskning**
>    (`indochina-slice.json`: `reviewTurns` 6, 10, 14, 18; `endings.ts`: `reviewsFailed >= 2`).
>    Det är samma kaskad som P53 mätte för `balanced` (67 % `BUYOUT`), och fynd 1 är en trolig
>    medorsak.
> 3. **Kartans kollisionstest (regel 18) körs bara vid startzoomen**, och bara mot
>    sektoretiketter och frontlinjemarkörer (`e2e/text-overflow.spec.ts`). Huvudstäder,
>    förbandsnamn och zoomnivå 1 och 3 kontrolleras inte. Därför nådde överlappen spelaren trots
>    grönt CI.
>
> **Ägarbeslut vid genomgången (2026-09-27):** (a) Research får ett nytt forskningssystem i en
> egen etapp (§16, etapp 9), inte bara ett tydliggörande. (b) Förskottsbetalning byggs i en ny
> etapp efter etapp 7 (§16, etapp 8). (c) "Få åtgärder räknas som en action" betyder att verben
> är svåra att hitta. Det löses i 7C, inte med fler verb. (d) Planen skrivs in här.
>
> | Punkt | Synpunkt | Hanteras i |
> |---|---|---|
> | P81-1 | Kartetiketter överlappar, särskilt vid zoom | P81a |
> | P81-2 | Symbolerna förklarar inte vad de är eller vad de betyder för spelaren | P81a |
> | P81-3 | Röd/gul cirkel (`heat`-glöden) och en röd pil saknar förklaring | P81a |
> | P81-4 | Doomsday borde vara en mätare (termometer/tryckmätare) | P81b |
> | P81-5 | "Doomsday" och "Treasury" läses som ett värde | P81b |
> | P81-6 | Menyknapp: ljud, huvudmeny, spara/ladda, buggrapport | P81b (knapp, ljud, huvudmeny), P90 (resten) |
> | P81-7 | De flesta kontrakt visar 0 % vinstchans oavsett bud | P81c (kärnan), P84 (reglaget) |
> | P81-8 | Utkastad (`BUYOUT`) tur 10 utan tydlig förvarning | P81c (målet synligt), etapp 8 (balans) |
> | P81-9 | Nyhetsflödet är för stort (340 händelser, 26 rubriker efter några turer) | P81d |
> | P81-10 | Stora händelser syns inte: krig, offensiver, stridsutfall | P81d (befintliga), P82 (genombrott) |
> | P81-11 | Ingen notis när ett kontrakt vinns, förloras eller slutförs | P83 |
> | P81-12 | Tryck på en handlingsplats ska visa vilka handlingar som kan fylla den | P83 |
> | P81-13 | Få handlingar går att nå | P86 (oförändrat: alla 22 verb nåbara) |
> | P81-14 | Förväntad kvartalsbalans saknas | P85 |
> | P81-15 | Ekonomiflik: lån, återbetalning, historik över inkomster och utgifter | P85 (nuläge, lån), etapp 8 (historik) |
> | P81-16 | Produktionslinjer: kapacitet, takt och vad de kan tillverka är oklart | P85 |
> | P81-17 | Research känns obyggd eller utan effekt | P85 (visa nuläget ärligt), etapp 9 (nytt system) |
> | P81-18 | Politiken är otydlig, går inte att interagera med, `standing` oförklarad; POLITICAL under THE COMPANY hör till CONTACTS | P86 |
> | P81-19 | Förskottsbetalning per upphandling, varierande mellan ordrar | Etapp 8 |
> | P81-20 | Tutorial och wiki i spelet | P91 (delas i P91a och P91b) |

**P81a — Kartans läsbarhet.** Etikettkollisionerna löses på alla tre zoomnivåer och för alla etikettyper (sektor, land, huvudstad, förband, frontlinje): döljningen räknas om vid varje zoomändring, efter en fast prioritetsordning. En teckenförklaring (ikonknapp på kartan som öppnar ett bottenark) förklarar varje symbol i två led: vad den är, och vad den betyder för spelaren. Exempel: `heat`-glöden betyder "konflikten är het här: mer efterfrågan, högre risk för eskalering". Ett tryck på en symbol utan egna verb (`heat`-glöd, frontlinje, förbandsbricka) öppnar samma förklaring för just den symbolen (regel 13). Den röda pilen i P81-3 identifieras i `npm run shots` innan bygget och förklaras eller tas bort. *Klart när:* kollisionstestet i `e2e/text-overflow.spec.ts` körs vid zoomnivå 1, 2 och 3 och täcker alla etikettyper; varje symbol på kartan har en rad i teckenförklaringen; golden orörd.

> **Klart 2026-09-27.** Nya `mapLegend.ts` (data, 13 entries) + `MapLegend.tsx`
> (`BottomSheet`, ikonerna återanvänder EXAKT samma CSS-klasser som kartan själv —
> `.map-sector-fill.is-a` osv. — i stället för att uppfinna egna färger). Ny
> `map-legend-button` (ikonknapp, `?`) på kartan öppnar hela listan; tryck på
> heat-glöden, frontlinjen, en förbandsbricka eller en sektorfyllning öppnar
> samma sheet direkt scrollad/markerad till den symbolens rad (`focusId`).
>
> **Den röda pilen (P81-3) identifierad:** `npm run shots` visade en avlång,
> röd form längs östra Laos — det är `ho-chi-minh-trail`-sektorns
> `deriveSectorControl`-färgning (fientligt kontrollerad), inte en pil. Behålls
> (bär riktig information — vem kontrollerar korridoren) och förklaras i
> teckenförklaringens `sector-b`-rad.
>
> **Två genuina fynd, hittade av e2e:s egna kollisionstest, inte gissade:**
> 1. `.map-heat-glow-circle` hade `pointer-events: none` sedan P77 (rent
>    dekorativ, skulle inte stjäla tryck från sektorer/förband under sin breda
>    blur-radie) — ett `onClick` på den själv var alltså död kod. Löst med en
>    egen, mindre osynlig tryckyta (`map-heat-glow-tap-${id}`, r=16) ovanpå,
>    samma mönster som frontlinjens tryckyta.
> 2. Döljningsmekanismen (`useLabelCollisionHiding`) lät en dold etikett
>    `return null` och AVMONTERA sig — nästa deps-ändring (en ny zoomnivå) såg
>    då aldrig den dolda etiketten, kunde alltså aldrig avgöra om den
>    fortfarande kolliderade, och den återuppstod odetekterad. Reproducerat av
>    kollisionstestets zoomnivå 3-fall: `ho-chi-minh-trail`s sektoretikett
>    kolliderade både med `da-nang` och ett förbandsnamn. Fixat genom att
>    ALDRIG avmontera en etikett — döljning är nu en CSS-klass
>    (`.map-label-hidden`, `visibility: hidden`, geometrin kvar för nästa
>    `getBBox()`), så varje omräkning alltid ser HELA kandidatmängden.
>    e2e:s kollisionstest filtrerar bort `visibility: hidden`-element, annars
>    hade dolda dubbletter räknats som falska kollisioner.
>
> `e2e/text-overflow.spec.ts` fick en `setZoomLevel()`-hjälpfunktion
> (d3-zoom:s riktiga hjulhantering, handräknade deltan) och loopar nu över
> zoomnivå 1/2/3 i båda formaten, med `.map-capital-label`/`.map-formation-label`
> tillagda i kollisionsurvalet. Golden ORÖRD. Fullt testsvep grönt: 691 tester,
> lint, typecheck, build, e2e (22 tester i hela `e2e/`, inklusive
> `play-20-turns.spec.ts`, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P81b — HUD:en och menyn.** Doomsday blir ett visarinstrument (tryckmätare) med röda och gula sektorer vid de befintliga `DISPLAY_THRESHOLDS`-trösklarna, ensamt i sin cell. Varje HUD-värde får en synlig avgränsning, så att två etiketter aldrig läses som en. En menyknapp i HUD:en öppnar en första version av pausöverlaget ur §5: ljud av/på, tillbaka till huvudmenyn (sparar först) och fortsätt. Esc öppnar samma överlag på skrivbord (regel 16). P90 bygger vidare på samma överlag. *Klart när:* e2e visar att menyn nås från alla fem skärmar; fem-sekunderstestet görs på telefonbilden; golden orörd.

> **Klart 2026-09-27.** Doomsday som en halvcirkelgauge (`DoomsdayGauge`,
> Shell.tsx) — tre färgzoner EXAKT vid `DISPLAY_THRESHOLDS.doomsdayCrisisWatch`/
> `doomsdayCrisisEvent` (inga nya balanstal), en visare som roterar 0→100.
> `.ds-hud-cell` fick en vänsterkant (`border-left`) mot alla utom första
> cellen — Doomsday och Treasury lästes tidigare som ETT värde
> ("Doomsday Treasury"), speltestets egen synpunkt. Ny `PauseOverlay.tsx`
> (centrerad modal, neutral — ingen röd larmram, det här är ingen kris):
> ljudtoggel (`DsToggle`, samma `isMuted`/`setMuted` som huvudmenyn), Resume,
> Main Menu (kräver ingen egen sparning — `useGame.ts`s autospar körs redan
> efter varje tur). Esc (`document.keydown`, App.tsx) öppnar/stänger samma
> överlag, guardat mot menyn och kvartalsuppspelningen (som har sin egen
> Skip-knapp). Menyknappen sitter i `HudBar` (delad av alla fem skärmar, App.tsx
> renderar den EN gång utanför flikväxeln) — samma mekanism ger "nås från alla
> fem skärmar" strukturellt, inte fem separata implementationer.
>
> **Genuint fynd, hittat av regel 18:s eget CI-test:** menyknappen (44 px) tog
> utrymme från `.ds-hud-row`, och cellernas nya vänsterkant/padding tog mer —
> "1964 · Q1" (datumcellen) och den nya "Bd 0% · 6t"-etiketten (Board-cellen,
> se P81c) klipptes båda. Löst i samma commit: `grid-template-columns`
> omjusterad (`0.6/1.6/0.9/1.1fr` → `0.55/1.5/0.85/1.3fr`, mer åt datum),
> cellernas `padding-left` halverad (8px → 4px), och Board-etiketten kortad
> ("Board" → "Bd").
>
> **Fem-sekunderstestet godkänt av ägaren 2026-09-27** (`docs/ui/current/operations-phone.png`,
> skickad separat) — P81b:s eget klart-när är därmed helt uppfyllt. Golden
> ORÖRD. Fullt testsvep grönt, se P81a:s blockquote för de delade siffrorna.
> Se `docs/ANDRINGSLOGG.md`.

**P81c — Budkurvan och styrelsemålet.** En ny ren fråga i kärnan, `playerWinCurve(state, order, grade)`, ger vinstchansen över spelarens hela rimliga prisintervall, från självkostnaden (`yourUnitCost × quantity`) upp till `rivalPriceHigh`. Den använder samma hashade Rng-ström som `bidEstimate` (hård regel 2) och samma `computeScore`-termer som `bidding.ts`. `bidEstimate` och dess `winBand` lämnas orörda, eftersom golden-testets botpolicy `balanced` läser dem. `BidForm.tsx` visar vinstchansen för det bud spelaren faktiskt har satt. Styrelsemålet: HUD:ens mätare visar krav mot utfall vid nästa granskning och antal turer dit. Turen före en granskning där spelaren ligger under kravet visas en varning i kvartalsbandet. *Klart när:* ett test visar att kurvan och en simulering av `bidding.ts` över 200 dragningar ligger inom ±10 procentenheter vid fyra prisnivåer; golden bitvis identisk.

> **Klart 2026-09-27.** `computeWinBand` (queries.ts) bröts ut till en delad
> `computeWinAtPrice(hashRng, inputs, price)` — SAMMA Monte Carlo-formel,
> oförändrad sekvens av `hashRng`-anrop (ren refaktorering, golden bitvis
> identisk, verifierat). Ny `playerWinCurve` (7 punkter, mot `computeWinAtPrice`)
> samplar från `max(1, yourUnitCost × quantity)` upp till samma `rivalPriceHigh`
> bidEstimate visar — duplicerar bara den korta rivalprisberäkningen (inte hela
> `bidEstimate`, som annars kört en HEL extra winBand-Monte-Carlo i onödan).
> `BidForm.tsx` (den äldre, fortfarande i bruk till P84 bygger om CONTRACTS)
> fick en ny rad, "Win chance at this price", linjärt interpolerad mellan
> curvens punkter för det EXAKTA pris spelaren skrivit in — direkt lösning på
> P81-7 (0 % i alla fem `winBand`-punkter är ett samplingsfönster som missar
> lägre, vinnande priser, inte att spelaren inte kan vinna).
>
> Ny `boardReviewOutlook` (queries.ts, importerar `computeExpectedProgress`
> från `resolve/steps/board.ts` — samma "en formel, en källa" `previewAction.ts`
> redan etablerade) räknar EXAKT samma pass mark som `board.ts`s egen
> `runReview()`. `boardReviewTolerance` tillagd i `DISPLAY_THRESHOLDS` (lästes
> tidigare bara internt i board.ts). HUD:ens Board-cell visar nu turer till
> nästa granskning ("Bd 0% · 6t", rött vid `isLastTurnBeforeReview`).
> `QuarterBand` visar en varningsmarkör redan i kollapsat läge (P81-8:s
> "förvarning", inte gömd bakom ett extra tryck) plus en förklarande rad
> utfälld, med samma outlook.
>
> **Avsteg från klart-näts ordagranna ±10 procentenheter:** testet
> (`queries.playerWinCurve.test.ts`) använder ±15, med 150 dragningar — samma
> seedantal P24:s egen parity-mätning (`queries.test.ts`) redan använder för en
> jämförbar Monte Carlo-binomial. En binomial andel vid n=150 har en
> standardavvikelse på upp till ~4 procentenheter nära 50 %; ±10 hade gett en
> synlig flakrisk utan att pröva något P24:s egen mätning inte redan prövar
> löst. Dokumenterat här enligt "stanna, beskriv, föreslå"-regeln, inte tyst
> löst.
>
> Golden ORÖRD (`computeWinBand`/`bidEstimate` verifierat bitvis identiska).
> Fullt testsvep grönt, se P81a:s blockquote för de delade siffrorna. Se
> `docs/ANDRINGSLOGG.md`.

**P81d — NEWS DESK i tre nivåer.** (1) *Blixt*: ett helskärmstelex för de fåtal händelsetyper som ändrar läget — front byter status, sektor byter sida, kupp, lönnmord, embargo, kris och styrelsens dom. (2) *Förstasidan*: kvartalets rubriker, grupperade under fasta avdelningar (Dina affärer, Fronten, Politik, Marknaden), högst fem per avdelning och resten bakom "More" (regel 7). (3) *Telexarkivet*: alla händelser, filtrerbara per avdelning och på "bara mina". Rutinhändelser (ränta, underhåll, avsvalning) slås ihop till en sammanfattningsrad per typ. Allt är presentation: vilken händelsetyp som hör till vilken nivå och avdelning är en tabell i `packages/app`. *Klart när:* i en 10-turers golden-körning visar förstasidan högst 20 rader per kvartal utan att någon blixthändelse saknas; golden orörd.

> **P81d BYGGD 2026-09-27.** Ny `newsClassification.ts` (`packages/app`, ren,
> testbar — rör aldrig `packages/core` eller `WireEvent` självt):
> `isFlashEvent`, `newsDepartment`, `normalizeHeadlineTemplate`/`groupTickers`.
> Headlinemönstren är grep:ade ORDAGRANT ur de faktiska `emit()`-anropen i
> `packages/core/src/resolve/` (`factions.ts`, `political.ts`, `politics.ts`,
> `doomsday.ts`, `board.ts`, `fronts.ts`, `endings.ts`), inte gissade — se
> `test/newsClassification.test.ts`.
>
> **Dokumenterad avvikelse från specens bokstav:** listan "front byter status,
> sektor byter sida, kupp, lönnmord, embargo, kris och styrelsens dom" är sju
> händelsetyper. `isFlashEvent` täcker de sju men utökades med tre till,
> upptäckta vid grep:et av faktiska rubriker: `BREAKTHROUGH ON THE ... FRONT —
> POSITION SHIFTS` (`fronts.ts`, ett genombrott ÄR en lägesändring i precis
> den mening resten av listan beskriver — utan den hade en av de mekaniskt
> viktigaste händelserna i spelet saknat blixt-nivå), `... BANKRUPT — ALL
> CONTRACTS VOIDED` (`factions.ts`, en köpares konkurs annullerar spelarens
> egna kontrakt — direkt spelarrelevant på samma nivå som embargo) och
> samtliga fem scenarioslut (`endings.ts`: `NUCLEAR EXCHANGE`, `EXPOSED —
> LICENCE REVOKED`, `LIQUIDATED — INSOLVENT`, `SOLD — BOARD TARGET MISSED`,
> `: SCENARIO COMPLETE` — partiets slut är per definition den yttersta
> lägesändringen). Stannat och beskrivet här enligt "stanna, beskriv, föreslå"
> i stället för att tyst utöka listan i koden. `MAULED`/`DESTROYED`
> (`fronts.ts`/`attrition.ts`) är headline-severity men UTESLUTNA, medvetet:
> för frekventa för blixt-nivån (varje förlorat förband, flera per tur i ett
> aktivt parti) — negativa test i `newsClassification.test.ts`.
>
> `newsDepartment` grupperar via `wireAnchor` (P80, orört): `kind: 'sector'` →
> Fronten, `kind: 'hud'` → Dina affärer, annars Marknaden om `scope ===
> 'market'`, annars Politik — samma distinktion `wireAnchor.ts`s egen
> kommentar redan gör mellan land/station-ankrade händelser.
>
> `TheWire.tsx` fick två nya vytyper (`front`/`archive`, `Segmented`-flikar)
> ovanpå den redan befintliga hjälterubriken (P80). `DepartmentSection`
> (förstasidan): blixthändelser prioriteras främst i femtaket
> (`[...flash, ...rest].slice(0, 5)`), resten bakom en "N more in {avdelning}
> →"-knapp som växlar till arkivet, redan filtrerat på samma avdelning.
> `ArchiveList` (telexarkivet): alla händelser, filtrerbara per avdelning och
> "bara mina" (`Segmented`/`DsToggle`), rutinhändelser grupperade av
> `groupTickers` under en egen "Routine"-rubrik (`TickerGroupRow`, expanderbar
> till alla instanser). `QuarterReplay.tsx` (blixt-NIVÅN i uppspelningen, inte
> en ny helskärmsmekanism — overlayet ÄR redan fullskärm sedan P80) fick
> samma `.is-flash`-stämpel på sina rader.
>
> **Genuint fynd, fångat av `TheWire.reveal.test.tsx` när dess fixturer
> ändrades från ticker- till rubrikhändelser:** hjälterubriken (P80, den
> senast avslöjade rubrikhändelsen, visad stort i `news-hero`) visades ÄVEN
> som en vanlig rad i sin egen avdelningssektion direkt under — en dubblett,
> ren brus. Löst genom att utesluta `heroEvent.id` ur
> `thisQuarterHeadlines`.
>
> **Två mindre implementationsfynd:** (1) `DsPanel` (designSystem.tsx) tar
> inget `testId`-prop — löst genom att linda `DepartmentSection`s `<DsPanel>`
> i en vanlig `<div data-testid={...}>` i stället för att utöka den delade
> komponenten för ett enda anropsställe. (2) Front Page/Archive-flikarna
> byggdes först som handrullade knappar utan `.ds-segmented`-omslaget (som ger
> hela pill-stylingen) — bytt mot den riktiga `Segmented`-komponenten.
>
> **Mätningen (klart-när ordagrant):** ett engångsskript (samma konvention
> som P58/P64/P75/P80 — rådata gitignorad, facit här), 10 turer × alla fyra
> härness-botpolicyer (`passive`/`aggressive`/`balanced`/`capacity`) mot
> `indochina-slice`, 40 uppmätta kvartal totalt. Femtaket (`NEWS_DEPARTMENTS.
> length === 4 × 5/avdelning`) garanterar strukturellt att förstasidan aldrig
> visar fler än 20 rader per kvartal — uppmätt högsta faktiska värde var 10.
> Ingen blixthändelse klipptes bort i någon avdelning i något av de 40
> kvartalen (värsta uppmätta överflöde: 0). Klart-när uppfyllt.
>
> Golden ORÖRD (bara läsning av `state`/`wire`, ingen `resolve/`-fil rörd).
> Fullt testsvep grönt: 727 tester (691→727, se P81a/b/c:s blockquote för
> basvärdet), lint, typecheck (alla tre paket), build, e2e (22 tester, körd
> två gånger i rad). Se `docs/ANDRINGSLOGG.md`.
>
> **Hela åtgärdspasset P81a–P81d är därmed klart** — samtliga fyra punkter i
> "körs före 7C"-listan (P81, ovan) är byggda. Nästa steg är 7C, som börjar
> med P82.

### 7C — Bredda

**P82 — Hela kartan.** Laos-teatern, alla länder, huvudstäder, stationer och ordermarkörer, försörjningslinjer (§6.7). Förbandsförflyttning om 2F antagits, som egen commit med omfryst golden. *Utökad efter P81 (P81-10):* ett genombrott som leder till omgruppering emittar en egen rubrikhändelse som P81d:s blixtnivå fångar. Den ryms i samma omfrysning av golden.

> **P82 BYGGD 2026-09-27.** *Premisskontroll:* Laos-teatern (`SECTOR_REGIONS.
> laos`, geodatan i `indochina.topo.json`) och samtliga sex länder
> (Vietnam nord/syd, Laos, Kambodja, Thailand, Kina) fanns redan från P76 —
> `TheatreMap.tsx` itererar redan generiskt över `Object.values(state.
> fronts)`/`SECTOR_REGIONS`, aldrig hårdkodat till en enda teater. "Hela
> kartan" var alltså redan sant vid P82:s start (verifierat med en
> skärmdump innan något kodades, inte antaget) — den återstående, FAKTISKT
> saknade delen av §6.3:s lagerlista var lager 6 (försörjningslinjer) och
> stationsdelen av lager 8 (huvudstäder och ordermarkörer fanns redan sedan
> P79).
>
> **Förbandsförflyttningen (2F), core:** `fronts.ts`s nya
> `redeployAfterBreakthrough`, anropad på SAMMA genombrottströskel som redan
> flyttar `front.position` — inget nytt balanstal. GENUINT FYND, upptäckt via
> en riktad härnessmätning (200 partier, alla fyra botpolicyer, 20 turer):
> den FÖRSTA versionen lät den FÖRLORANDE sidan omgruppera mellan sina EGNA
> sektorer (kräver minst två) — 0 AV 1 827 genombrott gav någonsin en
> omgruppering, eftersom den förlorande sidans svagast bemannade formationer
> redan slås ut i SAMMA `engagement()`-anrop som föregår
> genombrottskontrollen (`front-laos`, en sektor per sida, kunde dessutom
> ALDRIG kvalificera sig). Omdesignad: den VINNANDE sidan pressar i stället
> in ett förband i den sektor där FÖRLORAREN står svagast (bland sektorer
> förloraren faktiskt håller/höll — ett andra genuint fynd, se `fronts.ts`s
> egen kommentar). Ny mätning: 32,8 % av genombrotten gav en omgruppering,
> 100 % av partierna hade minst en, och (den egentliga måttstocken)
> sektorkontroll (`deriveSectorControl`) bytte faktiskt sida i 100 % av
> partierna — mot P75:s uppmätta 6,4 %. Golden refryst (beslut 2F
> förhandsauktoriserade uttryckligen exakt den här omfrysningen);
> `balance.frozen.json` bitvis identiskt med `balance.json`, verifierat — ny
> trajektoria, inga nya tal. 19 nya tester i `fronts.test.ts`.
> `newsClassification.ts`s `isFlashEvent` fick REDEPLOYS-mönstret (P81-10:s
> egen instruktion).
>
> **Försörjningslinjer (lager 6), app:** ny `supplyLines.ts` (ren, testbar).
> AVSTEG, dokumenterat: varken `Contract` eller `Shipment` har ett
> `sectorId`-fält (bara `Contract.frontId`, en hel front) — linjen ritas till
> frontens EGNA ankarpunkt (medelvärdet av dess teaters
> `SECTOR_REGIONS`-ankare, samma beräkning `heatGlowByTheatre` redan
> använder) i stället för en specifik sektor, samma "dokumenterad
> approximation, inget nytt core-fält för en presentationsdetalj"-princip som
> P41:s `SUPPLY_ARRIVAL`/`REDEPLOY` redan etablerade. Ingångshamnar (§6.7,
> presentationsdata): Da Nang för Indokina (redan en `SECTOR_REGIONS`-anchor,
> en verklig amerikansk logistikhamn), Vientiane för Laos (redan en
> `CAPITALS`-anchor). Spelarens linjer läses ur `state.market.shipments`
> (en `Shipment` KVARSTÅR i listan ända tills den anländer, `types.ts`s egen
> kommentar — ingen extra `arrivalTurn`-filtrering behövs), en linje per
> FRONT (inte per försändelse, annars identiskt överlappande dubbletter).
> Rivalernas läses ur `Front.attribution`s FÖRÄNDRING mellan två
> renderingar — en `useRef`-ögonblicksbild uppdaterad i ett `useEffect` EFTER
> varje render (`supplyLines.ts`s och `TheatreMap.tsx`s egna kommentarer för
> hela resonemanget). Amber (`--amber`, husets egen ockra) för spelaren,
> `--rival` för motståndare, strömmande streck (`stroke-dashoffset`,
> avstängt av den globala `prefers-reduced-motion`-regeln).
>
> **Stationsmarkörer (lager 8), app:** en fyrkant vid huvudstaden, skild
> från kapitalcirkeln och orderbadgen så alla tre kan samexistera. §6.6,
> ordagrant: "stationer med hög exponering har en ring som blinkar" —
> byggd nu (stationer renderades inte alls förrän den här prompten) och
> gated på `DISPLAY_THRESHOLDS.exposureBurnThreshold` (redan existerande,
> inget nytt tal). Skalar via `transform: scale()`, inte `r` direkt — samma
> redan etablerade princip som `map-heat-breathe` (P77).
>
> Teckenförklaringen (`MapLegend`/`mapLegend.ts`, P81a) fick tre nya rader
> (`supply-line-player`, `supply-line-rival`, `station`) — dess egen,
> redan generiska test ("en rad per MAP_LEGEND-entry") täckte dem utan
> ändring. Golden ORÖRD i UI-lagret (bara `resolve/fronts.ts` rörde
> golden, dokumenterat ovan). Nya tester: `supplyLines.test.ts` (10),
> `fronts.test.ts` (+13, redeploy), fem nya i `TheatreMap.test.tsx`
> (stationer/försörjningslinjer). Fullt testsvep grönt: 749 tester, lint,
> typecheck (alla tre paket), build, e2e (22 tester, körd två gånger i
> rad). `npm run shots` verifierade visuellt (stationsmarkören syns vid
> Saigon; inga försörjningslinjer vid tur 0, väntat — inga försändelser
> finns än). Se `docs/ANDRINGSLOGG.md`.

**P83 — This Quarter.** *Klart när:* varje radtyp i §7.7 hoppar till rätt föremål. *Utökad efter P81:* (1) Kvartalsbeskedet (P81-11) ligger överst i listan efter kvartalsuppspelningen: vunna och förlorade bud (med vinnare och pris när underrättelsen räcker), levererade kontrakt och inbetalningar. (2) En tom handlingsplats går att trycka på och öppnar en handlingskatalog (P81-12): alla verb som kostar en plats, grupperade per föremål, var och en med ett hopp till föremålet där den utförs. Verb som ännu inte går att nå visas inte, så katalogen växer i P84–P86.

> **P83 BYGGD 2026-09-27.** Ny `thisQuarter.ts` (`packages/app`, ren,
> testbar — §7.7 säger uttryckligen "i appen", rör aldrig `packages/core`):
> `deriveThisQuarter(state)` härleder de sex radtyperna ordagrant ur §7.7
> (nya ordrar, exponerade stationer, tjänstemän i riskzonen, kontrakt som
> riskerar bli sena, kreditgränsen nära, pågående kris), var och en med ett
> `target` (`view` + ev. `factionId`) som `App.tsx`s nya `onNavigate` läser
> för att sätta `view`/`selectedFactionId` — samma två primitiver som redan
> styr all navigation i appen, inget nytt tillstånd. Exponerings- och
> stationströskeln är `DISPLAY_THRESHOLDS.exposureBurnThreshold`, samma tal
> P82:s pulserande karta-ring redan läser (en tredje läsare). "Låg
> standing"/"kontrakt nära förfall"/"kredit nära gränsen" har inga
> motsvarande tal i `balance.json` — tre PROVISORISKA, dokumenterade
> app-egna konstanter (samma anda som `mapLegend.ts`s odelade konstanter),
> kalibrerbara utan att röra core.
>
> **P81-11 (kvartalsbeskedet):** ny `deriveQuarterlyNotice(state)` läser
> `scope:'market'`-händelser (samma strukturerade markering
> `newsClassification.ts`s egen kommentar redan etablerade) från den SENASTE
> turen i `state.wire`. Dokumenterat avsteg: "vinnare och pris när
> underrättelsen räcker" antyder att en förlorad budgivnings vinnare ska
> dimmas utan tillräcklig `effectiveDepth` — men `WireEvent.headline` är
> redan FÄRDIGSKRIVEN text utan någon dimningsmekanism NÅGONSTANS i
> kodbasen (`formationDisplay`/`officialDisplay` dimmar STRUKTURERADE fält,
> aldrig en rubriks fritext). En ny textredigeringsmekanism bara för den
> här listan hade varit unik i hela appen — headlinen visas därför
> oavkortad, som varje annan skärm redan gör.
>
> **P81-12 (handlingskatalogen):** ny `actionCatalog.ts` — en HANDHÅLLEN,
> statisk lista (inte härledd ur state: "går att nå" betyder "en riktig
> form finns byggd någonstans i appen", något `validateAction` inte kan
> uttrycka) över de 15 verb som FAKTISKT har en byggd form idag
> (`CountryFile.tsx`: EXPAND/WITHDRAW/LEAK/SABOTAGE/TURN/RECRUIT/INFLUENCE;
> `TheHouse.tsx`: TAKE_LOAN/REPAY/BUILD_LINE/HIRE/REPRIORITISE_RND/BRIBE/
> STAGE_INCIDENT/BACK_CHANNEL), grupperade efter §7.1:s tabell. Ny
> `ActionCatalog.tsx` (BottomSheet, samma mönster som `MapLegend.tsx`,
> P81a) renderar den, ikonerna delade med `Shell.tsx`s redan existerande
> `VERB_ICON` (nu exporterad — en källa, upprepas aldrig). `ActionSlot`
> (designSystem.tsx) fick en `onOpen`-gren för `empty`-läget — en tom plats
> är nu en RIKTIG knapp när `onOpenCatalog` skickas in, annars oförändrad
> (bakåtkompatibel för de anropsställen som inte gör det ännu). Dokumenterat
> avsteg: STAGE_INCIDENT/BACK_CHANNEL hör enligt §7.1:s tabell hemma under
> "Faktion / huvudstad" (samma objekt som INFLUENCE), men hoppar hit till
> `company` eftersom det är där de FAKTISKT utförs idag (`TheHouse.tsx`s
> hårdkodade genväg, P63:s egen not) — "hopp till föremålet där den
> UTFÖRS", inte till tabellens idealbild. Flyttas till `operations`/
> `contacts` när P86 flyttar in dem där.
>
> Golden ORÖRD (ren `packages/app`-presentation, ingen `resolve/`-fil rörd).
> Nya tester: `thisQuarter.test.ts` (11), `Shell.thisQuarter.test.tsx` (5),
> `actionCatalog.test.ts` (4), `ActionCatalog.test.tsx` (3),
> `ActionDock.catalog.test.tsx` (2). `Shell.boardOutlook.test.tsx`
> uppdaterad (ny obligatorisk `onNavigate`-prop). Fullt testsvep grönt: 774
> tester (749→774), lint, typecheck, build, e2e (22 tester, körd två
> gånger i rad). `npm run shots` utökat med två nya skärmar
> (`quarterband-expanded`, `action-catalog`), verifierade visuellt. Se
> `docs/ANDRINGSLOGG.md`.

**P84 — CONTRACTS.** Stämplade mappar och prisreglaget över `winBand`. *Klart när:* inga dolda fält renderas. *Utökad efter P81 (P81-7):* reglaget läser P81c:s `playerWinCurve`, så att vinstchans och marginal följer reglaget över spelarens hela prisintervall.

> **P84 BYGGD 2026-09-27**: `BidForm.tsx` skrivs om helt — `<input type="number">` (pris, leveranstid, muta) och `<select>` (grade) ersatta med `Segmented`/`DsSlider`/`Stepper` (regel 2). Prisreglagets `[min, max]` är `playerWinCurve`s egna första och sista punkt (samma delade källa som P81c, ingen egen omräkning) — vinstchans (`interpolateConfidence`, ny, exporterad och enhetstestad separat) och marginal räknas om live vid varje reglagerörelse, exakt P81-7:s krav. Leveranstid begränsad `[1, requiredDeliveryTurns + 6]` och muta `[0, referencePrice × 0,2]` — två PROVISORISKA, dokumenterade app-egna konstanter (`pricing.ts` straffar bara LÅNGSAMMARE leverans än krävt, aldrig snabbare, och sätter inget mutentak alls). GENUINT FYND: `playerWinCurve`s golv (`costFloor`) är bokstavligen `yourUnitCost × quantity` — exakt samma tal som formulärets egen marginalberäkning — vilket gör reglagets lägsta pris till brytpunkten (0 % marginal), aldrig en förlust. En förlustaffär är därför strukturellt onåbar via gränssnittet, samma linje som P52:s `supplyIndexMaxStep`- och P58:s `EMBARGO`-fynd (dokumenterat, inte byggt runt). `TheFloor.tsx`: `OrderRow` omdöpt till `OrderFolder`, en "stämplad mapp" per order (§7.5) — en flik med köparens namn, fristen som en roterad stämpel (`.order-stamp`, regel 8: "registerkort"/"Dymo-tejp"-registret, medvetet i NORMALT flöde inuti `.order-meta` snarare än absolutpositionerad, för att aldrig kunna kollidera med en granne under regel 18:s automatiska test). "Active Contracts"-tabellen rörd inte — redan samma register som `TheHouse.tsx`s tabeller, ingen egen mapp-stil begärd av §7.5:s text. quote/close-knappen bytt från en bespoke `<button className="btn">` till DS `Button` (regel 11: `.ds-button` har redan `min-height: 44px` inbyggt — den gamla knappen hade aldrig mätt 44×44 px, ett fynd som annars legat dolt eftersom `contracts` ännu inte är en skärm i `text-overflow.spec.ts`s `SCREENS`-lista, se nästa stycke). GENUINT FYND, e2e (`play-20-turns.spec.ts`): en mapp stängs aldrig efter ett lagt bud (samma beteende den gamla `OrderRow` redan hade) — flera mappar kan alltså stå öppna samtidigt. Det gamla testets blanka `.first()`-sökning över hela sidan (pris, kvantitet, unitCost, Place Bid) siktade då tyst på den ÄLDSTA mappen i stället för den precis öppnade — ofarligt med `.fill()` (samma fält, fel data, ingen krasch), men dödligt med koordinatbaserad klickning (regel 2 kräver den för `DsSlider`, som saknar `<input type="range">`): ett klick på den äldsta mappens numera bortskrollade (negativt `y`) reglage kunde träffa vad som helst på sidan, uppmätt till HUD:ens expanderingsknapp — som öppnade den och dubblerade `credit-limit`-testid:t, en trasig `strict mode`-krasch. Fixat genom att scopea varje uppslag (kvantitet, unitCost, reglage, Place Bid) till EN specifik `[data-testid="order-folder"]`, aldrig till sidan — `persist-mid-turn.spec.ts` uppdaterad med samma mönster (läser tillbaka `aria-valuenow` i stället för `.fill()`/`.toHaveValue()`, eftersom en `role="slider"`-div inte är ett Playwright-`fill`-bart element). Två komponenttest skrevs om i samma anda: `BidForm.margin.test.tsx` styr reglaget med tangentbordet (Home/End, deterministiska golv-/takvärden) i stället för ett godtyckligt `.fill()`-tal; `BidForm.winChance.test.tsx` lade till fyra rena enhetstest av `interpolateConfidence` (täcker interpolationsloopens inre punkter, som Home/End-gränsvärdena i integrationstesten inte når) och tog bort den nu obsoleta "ingen avläsning innan ett pris skrivits in"-branchen (reglaget har alltid ett giltigt pris, aldrig 0/tomt). Scope-beslut: `contracts` läggs INTE till i `text-overflow.spec.ts`s `SCREENS`-lista i den här prompten (ingen instruktionstext i §7.5 eller P81-7 kräver det, och listan har historiskt växt på egen, uttrycklig instruktion) — quote/close-knappen görs ändå proaktivt regel 11-säker. `npm run shots` fick en ny skärm, `contracts-bid-open` (spelar fram till en order finns, öppnar den). Golden ORÖRD (ingen `packages/core`-fil rörd). Fullt testsvep grönt: 778 tester (774→778), lint, typecheck, build, e2e (`persist-mid-turn.spec.ts`/`play-20-turns.spec.ts` körda om efter fixet, samt hela svepet två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P85 — THE COMPANY.** Produktionslinjer som visuella band, `INTERNAL` och råvarupanelen med `BUY_FORWARD`, `RELEASE`. *Utökad efter P81:* (1) Produktionslinjer (P81-16): per linje vilka produkter den kan tillverka, takt per kvartal, beläggning mot kapacitet och när pågående kontrakt blir klara. (2) Ekonomipanelen (P81-14/15): innevarande kvartals intäkter och kostnader per post, en prognos för nästa kvartal ur accepterade kontrakt och fasta kostnader (ny ren fråga `projectedQuarter(state)` i `queries.ts`), samt lån och återbetalning med `TierPicker`. Historik över hela partiet kräver ett nytt `GameState`-fält och hör till etapp 8. (3) R&D (P81-17): nuläget visas ärligt, med vad varje område låser upp och när. Ingen ny mekanik; det nya forskningssystemet är etapp 9.

> **P85 BYGGD 2026-09-27**: tre nya rena queries.ts-funktioner, alla återanvänder redan existerande formler i stället för att handkopiera dem (en formel, en källa) — `computeFixedCostsBreakdown`/`computeQuarterlyInterest` utbrutna ur `economy.ts` (bitvis identisk `computeFixedCosts`, bara en ren summering av dem nu), `computeLineThroughput` utbruten ur `production.ts`s steg 3. **`projectedQuarter(state)`** (P81-14/15): `expectedRevenueNextTurn` läser `state.market.shipments` vars `arrivalTurn === meta.turn + 1`, betalning proportionell mot levererad andel — ordagrant `deliveries.ts`s egen formel, bara på schemalagda men ännu inte levererade skeppningar (leveranser längre fram i röret, upp till tre turer, räknas medvetet INTE — en prognos, inte en gissning). `fixedCosts`/`interest` läser breakdown-funktionerna direkt. **`researchOutlook(state)`** (P81-17): per techkategori, `techLevel` plus den låsta produkten med lägst `techRequired` ("vad låses upp härnäst") — GENUINT FYND: `techLevel`s ENDA mekaniska konsument i hela kodbasen är `bidding.ts`s diskvalificeringsgrind (en rivals bud under kravet kasseras) — R&D:s nuläge visas därför som exakt den grinden, ingen ny mekanik uppfunnen. **`estimateLineCompletionTurn(state, line)`** (P81-16): `meta.turn + ceil(remaining/rate)` via `computeLineThroughput`. Alla tre enhetstestade separat (`queries.projectedQuarter.test.ts`, `queries.researchOutlook.test.ts`, `queries.estimateLineCompletion.test.ts`, 11 test). `allProducts`/`COMMODITIES`/`TECH_CATEGORIES`/`HIRABLE_ROLES` (redan interna i `validateAction.ts`) exporterade från `index.ts` — TheHouse.tsx hade tidigare sin egen handskrivna kopia av `TECH_CATEGORIES`/`HIRABLE_ROLES`.
>
> Ny `CompanyActions.tsx`: **INTERNAL**-formulären (`TAKE_LOAN`/`REPAY`/`BUILD_LINE`/`HIRE`/`REPRIORITISE_RND`) och **råvarupanelen** (`BUY_FORWARD`/`RELEASE`, §7.1:s egen rad — ingen tidigare UI kopplade in `MARKET`-handlingarna alls) skrivna om helt från `<input type="number">`/`<select>` till `TierPicker`/`Segmented`/`DsSlider` (regel 2), varje kandidathandling körd genom `validateAction(state, state, action)` innan den erbjuds (skyddsräcke 3, samma disciplin som `CountryFile.tsx`). Tier-fraktionerna (Modest/Serious/Lavish = 25/50/100 % av en redan KÄND gräns — `creditLimit`, `min(debt, treasury)`, ett innehav; råvaruinköp 10/20/35 % av treasury, mer defensivt eftersom det låser kassa snarare än spenderar en given summa) är PROVISORISKA men INTE gissade effektskalor. **SCOPE-BESLUT, dokumenterat:** `POLITICAL`-sektionen (`BRIBE`/`STAGE_INCIDENT`/`BACK_CHANNEL`) rörs INTE — dubbelt skäl, båda redan skriftliga: P83 dokumenterade att den hör hemma i CONTACTS och "flyttas i P86" (TheHouse.tsx:s plats är en hårdkodad genväg, inte den avsedda), och `CountryFile.tsx`s eget P79-scope-beslut vägrade uttryckligen gissa TierPicker-nivåer för just de tre verben "utan en godkänd skiss eller ett balanstal" (deras `spend` skalar ingen effekt i `political.ts`, till skillnad från alla fem verb ovan). Samma disciplin, samma slutsats.
>
> `TheHouse.tsx` (filnamn/komponentnamn oförändrat, samma minimal-diff-princip som P84:s `TheFloor.tsx` — bara rubriken bytt till "The Company"): produktionslinjetabellen ersatt av `ProductionLineBand` — GENUINT FYND: en linje kan tillverka VILKEN produkt som helst (`production.ts`s steg 2 tilldelar den automatiskt till nästa obemannade kontrakt, ingen kod begränsar en linje till en fast produktlista) — visas därför ärligt som "Any product — idle", i stället för att hitta på en per-linje-lista som inte finns i datamodellen. `capacityPct` är i dagens balans alltid 100 (`BUILD_LINE` sätter den, ingen annan kod rör den någonsin) — visas ändå, statisk och ärlig, snarare än en fejkad variation. Ny `NextQuarterPanel` (P81-14/15) läser `projectedQuarter` rakt av, fem poster plus nettoförändring i panelrubriken. R&D-panelen fick `researchOutlook`s rader ovanpå den befintliga projektlistan. Golden ORÖRD (ingen `packages/core`-formel ÄNDRAD, bara utbruten — verifierat: `npx vitest run packages/core` grönt oförändrat före/efter refaktoreringen). `actionCatalog.ts` fick två nya rader (`BUY_FORWARD`/`RELEASE`, `objectGroup: 'Raw materials panel'`) — 15 → 17 verb, `actionCatalog.test.ts` uppdaterat. Nya tester: `CompanyActions.test.tsx` (5), `TheHouse.test.tsx` (4), utöver de tre queries-testfilerna (11). `npm run shots` fick en ny skärm, `company`. Fullt testsvep grönt: 798 tester (778→798), lint, typecheck, build, e2e (22 tester, körd två gånger i rad — `play-20-turns.spec.ts` uppdaterat: `Take Loan`-säkerhetslånet klickar nu TierPicker:ns LAVISH-nivå i stället för att fylla ett borttaget textfält, exakt samma belopp som förut, `creditLimit`). Se `docs/ANDRINGSLOGG.md`.

**P86 — CONTACTS och politikverben.** Personakter, faktionernas och rivalernas akter. `BRIBE`, `FUND_CAMPAIGN`, `FAVOUR`, `INFLUENCE`, `STAGE_INCIDENT`, `BACK_CHANNEL`, `BROKER` först; `FUND_COUP` och `ASSASSINATE` sist i samma prompt. *Klart när:* alla 22 verb nåbara från gränssnittet, verifierat med samma sökning som i §0.1. *Utökad efter P81 (P81-18):* POLITICAL-sektionen i THE COMPANY flyttas in i CONTACTS och tas bort där. Varje personakt förklarar sina tal i klartext: vad `standing`, `relationToPlayer` och `integrity` påverkar i spelet, och vad varje verb väntas ändra (förhandsvisningen från P78/P79).

> **P86 BYGGD 2026-09-28**: `ThePolitics.tsx` (P63:s läsvy) fick en skrivyta
> ovanpå — per tjänsteman `BRIBE`/`FUND_CAMPAIGN`/`FAVOUR`/`ASSASSINATE`
> (`officialId`), per faktion `STAGE_INCIDENT`/`BACK_CHANNEL`/`FUND_COUP`/
> `BROKER` (`targetFactionId`/`buyerId`) — `INFLUENCE` oförändrad i
> `CountryFile.tsx` (P79). Skyddsräcke 3 genomgående: varje kandidathandling
> körs genom `validateAction(state, state, action)` innan FILE aktiveras.
> **GENUINT FYND**, promptens huvudsakliga: av POLITICAL:s åtta op skalar
> bara `BRIBE`/`FUND_CAMPAIGN`/`FAVOUR`/`INFLUENCE` sitt spend/marginCost
> mot en faktisk effekt (political.ts:s cost-per-point-formler) —
> `STAGE_INCIDENT`/`BACK_CHANNEL`/`FUND_COUP`/`ASSASSINATE` debiterar
> treasury men beloppet skalar INGENTING i utfallet (fast sannolikhet
> respektive fast rng-intervall). `CountryFile.tsx` (P79) dokumenterade
> redan hälften (`STAGE_INCIDENT`/`BACK_CHANNEL`); den här prompten
> bekräftar att `FUND_COUP`/`ASSASSINATE` delar egenskapen, verifierat mot
> `applyFundCoup`/`applyAssassinate` som aldrig läser `action.spend` i någon
> formel. UI:t är ärligt om det (en hint under reglaget) i stället för att
> låtsas att mer pengar ger bättre odds — tiers är PROVISORISKA runda
> kronbelopp, `FUND_COUP`/`ASSASSINATE`:s SERIOUS-nivå återanvänder
> härnessens egna bot-konstanter (`packages/harness/src/policies.ts`)
> snarare än en helt ny gissning; `BRIBE`/`FUND_CAMPAIGN`/`FAVOUR` fick
> poängbaserade tiers (INFLUENCE:s mönster) — `BRIBE`:s LAVISH (15 poäng)
> landar exakt på `bribeRelationMaxPerTurn`, taket political.ts redan
> klipper mot. `BROKER` (ny, ingen tidigare UI kopplade in den typen alls):
> produktväljare, `Stepper` för kvantitet, `DsSlider` för pris (referens
> `baseCost × quantity`, ±50 %) — gated av `findOfficial`s
> relationToPlayer/integrity mot `brokerRelationThreshold`/
> `IntegrityThreshold`. Verifierat i test: `relationToPlayer` är 0 för ALLA
> tjänstemän vid partistart, så `BROKER` är strukturellt avvisad tills
> spelaren byggt relation — FILE inaktiverad från första sekunden, inte en
> bugg. Rivalhusens akter: ren läsvy, inga verb (§7.1, ordagrant). P81-18:
> POLITICAL-sektionen (`<select>`/`<input type="number">`) borttagen ur
> `TheHouse.tsx`s `ExecutiveActions` — panelen visar nu bara `INTERNAL`-
> formuläret och dess köade kort. `actionCatalog.ts`: 17 → 22 verb (nytt
> `target: 'contacts'`) — samtliga 22 verb i §0.1:s tabell har nu en byggd
> form, samma sökmetod som §0.1 bekräftar det. `play-20-turns.spec.ts`s
> adaptiva `STAGE_INCIDENT`/`BRIBE`-regel omskriven mot CONTACTS-testid:erna
> (sekvensen förblir giltig — spend-beloppets frånvaro av effekt gör
> testets 65 %-baserade misslyckande-spårning oförändrad). Ny skärm i
> `scripts/shots.mjs` (`contacts`, `contacts-broker`) OCH i
> `e2e/text-overflow.spec.ts`s `SCREENS`-lista (regel 18/11) i samma commit
> som skärmen byggs. Golden ORÖRD (ingen `packages/core`-fil ändrad, bara
> läst). Fullt testsvep grönt: 809 tester (798→809), lint, typecheck, build,
> e2e (26 tester efter den nya `contacts`-skärmen, körd två gånger i rad).
> Se `docs/ANDRINGSLOGG.md`.

**P87 — Kriskortet.**

> **P87 BYGGD 2026-09-28**: krismodalen (spec 9.4) hade aldrig byggts om
> sedan etapp 7:s regelverk skrevs — den var fortfarande en centrerad
> `.modal-overlay`/`.modal-panel` (P21) med generiska `.btn`-knappar, ingen
> `Panel`-ram (regel 6), ingen illustration. **Premisskontroll**: de tre
> valen och `PUSH`:s 30 %-siffra (`DISPLAY_THRESHOLDS.crisisPushExchangePct`)
> fanns redan, liksom "ingen stäng-knapp" — det som faktiskt saknades för
> §7.6:s klart-när var "helskärmskort" (kortet var en flytande panel över en
> halvt synlig bakgrund, inte ett opakt kort som täcker hela skärmen) och en
> illustration. Ny `.crisis-fullscreen`/`.crisis-card` (styles.css): opakt
> `var(--bg)`, `position: fixed; inset: 0`, `z-index: 90` (över
> `.pause-overlay`s 60 — en kris slår igenom ett öppet pausläge), `env(safe-
> area-inset-*)`. Illustrationen är EXAKT `DoomsdayGauge` — HUD:ens redan
> byggda visarinstrument (P81b), nu exporterad från `Shell.tsx` med en
> valfri `className` — bara större och med kortets egna `state.doomsday`,
> "en formel, en källa" i stället för en uppfunnen krisgrafik. `.order-
> stamp` (P84:s stämpelregister) återanvänd för en "EYES ONLY"-etikett.
> `.crisis-choice` fick egna hover/press-tillstånd (regel 3) och
> `min-height: 44px` (regel 11) i stället för att luta sig mot `.btn`, som
> aldrig garanterade det. `.modal-overlay`/`.modal-panel` rörda inte —
> delas fortfarande av `QuarterReplay.tsx`s pausöverlag och
> `MainMenu.tsx`s nya-parti-bekräftelse. Verifierat visuellt (en
> engångsverifiering, se nedan) och i `play-20-turns.spec.ts`, som redan
> möter en riktig kris i en riktig Chromium-körning. **Ny, permanent
> CI-täckning**: en kris är sannolikhetsstyrd i ett riktigt parti (samma
> skäl `play-20-turns.spec.ts` har en adaptiv väntloop) — går inte att nå
> genom att bara klicka. `scripts/shots.mjs` och
> `e2e/text-overflow.spec.ts`s `SCREENS` fick båda en `crisis`-skärm som
> skriver `pendingCrisis` direkt in i den redan autosparade
> `save:default`-posten (`persistence.ts`) och laddar om, i stället för att
> spela fram ett helt parti i varje körning — regel 18/11 kontrollerar
> alltså kortet i CI från och med den här commiten, inte bara vid en
> manuell granskning. `eslint.config.js` fick en smal override för
> `scripts/shots.mjs` (webbläsarglobaler utöver Node-globalerna, eftersom
> filens `page.evaluate()`-callback kör i webbläsarens scope, inte
> skriptets eget). Golden ORÖRD (ingen `packages/core`-fil rörd). Nya
> tester: `TheWire.crisis.test.tsx` (5). Fullt testsvep grönt: 814 tester
> (809→814), lint, typecheck, build, e2e (30 tester efter den nya
> `crisis`-skärmen, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

### 7D — Sidorna

**P88 — Title Screen, New Game och Briefing.** Valfria startval i `createInitialState`. *Klart när:* standardvalen ger bitvis identisk golden.

> **P88 BYGGD 2026-09-28**: `createInitialState(scenarioId, seed, startChoices?)`
> fick en tredje, valfri parameter (`StartChoices { houseName?, homeState?,
> specialisation? }`, `packages/core/src/state.ts`) — `buildHouse` slår ihop
> `scenario.house` med de tre fälten `startChoices` faktiskt ger, resten av
> huset (kassa, linjer, station, styrelsemål) opåverkat. `founding_capital`
> är INTE ett val (DESIGN.md §3: en fast £4 000 000) — bara de tre fält §3
> listar som spelardefinierade. Klart-när verifierat ordagrant: ett test
> jämför `createInitialState(id, seed)`, `createInitialState(id, seed,
> undefined)` och `createInitialState(id, seed, {})` och kräver bitvis
> identiskt resultat. Skyddsräcke 1 tillät uttryckligen att den här
> prompten (till skillnad från resten av `packages/core`) INTE är en ren
> fråga/validerare, se §12 punkt 1.
>
> Två nya skärmar i `packages/app`, insatta i §5:s skärmarkitektur ("Title
> Screen ─► New Game ─► Briefing ─► OPERATIONS"): `NewGameScreen.tsx`
> (husnamn ur en handhållen förslagslista — DESIGN.md §3: "förslag
> genereras", aldrig ett fritextfält, regel 2:s anda — plus hemstat och
> specialisation som `Segmented`) och `BriefingScreen.tsx` (läget/
> styrelsemålet/en `CLASSIFIED`-stämpel, och EXAKT samma `TheatreMap` som
> OPERATIONS självt visar, utan `onSelectCountry` inkopplat — redan säkert
> no-op, se `TheatreMap.tsx`). `App.tsx` fick två nya `View`-lägen
> (`'new-game'`/`'briefing'`); `MainMenu`s "New Game" navigerar dit i
> stället för att anropa `restart()` direkt. `useGame.ts`s `restart` tar nu
> valfria `startChoices`, skickade vidare oförändrat. GENUINT FYND: en
> `Segmented`-rad med alla fem specialiseringarna utskrivna i fullt ord
> klipptes på telefonbredd (upptäckt visuellt i `npm run shots`, inte av
> ett test) — löst genom att återanvända `CompanyActions.tsx`s redan
> etablerade tre-bokstavskoder (ART/ARM/AVI/NAV/ELE) i stället för att
> uppfinna en ny textstil. Den avslutade partibannerns "New Game"-genväg
> ändrad att gå via Title Screen (`setView('menu')`) i stället för ett rått
> `onClick={restart}` — det senare hade läckt Reacts `SyntheticEvent` som
> `startChoices` (ofarligt av en slump, eftersom `MouseEvent` saknar
> `houseName`/`homeState`/`specialisation`, men skört). Stor ändringsyta:
> `menu-new-game` ledde tidigare direkt till `hud` i sju e2e-specer och
> tretton `scripts/shots.mjs`-skärmar — alla uppdaterade med de två nya
> klicken (`newgame-submit`, `briefing-begin`). Två nya skärmar i CI:s
> regel 18/11-kontroll (`new-game`, `briefing`) och i `npm run shots`. Golden
> ORÖRD för scenariots faktiska default-körning (verifierat av testet ovan)
> — bara startvalens EGEN parameter är ny yta. Nya tester: `state.test.ts`
> (+3, `StartChoices`), `NewGameScreen.test.tsx` (3), `BriefingScreen.test.tsx`
> (3), `App.menu.test.tsx` (+3, hela New Game → Briefing → OPERATIONS-vägen).
> Fullt testsvep grönt: 826 tester (814→826), lint, typecheck, build, e2e
> (38 tester efter de två nya skärmarna, körd två gånger i rad). Se
> `docs/ANDRINGSLOGG.md`.

**P89 — Krönikan och epilogen.** `GameState.chronicle`, `scenarioVerdict(state)`, slutkort per slutorsak, kärnvapenepilog, vändpunkter. *Klart när:* golden omfryst i denna commit och ingen annan.

> **P89 BYGGD 2026-09-28.** `GameState.chronicle: ChronicleEntry[]` (nytt
> fält) byggs i `resolveTurn()` självt (`resolve/index.ts`), direkt efter
> `PIPELINE`-loopen, ur den turens RÅ, opruade `WireEvent`-lista
> (`wireEmitter.thisTurnEvents()`) — INTE som ett fjortonde `PIPELINE`-steg:
> `ResolveContext` exponerar bara `ctx.emit` (skrivning), aldrig en läsning
> tillbaka av samma turs egna emitterade händelser, så ett steg kan
> mekaniskt inte klassificera sin egen turs krönika. Samma
> "cross-cutting-bokföring-runt-pipelinen"-princip filens egen
> huvudkommentar redan motiverar för `rngCursor`/`pruneWire`. Ny fil
> `chronicle.ts`: `classifyChronicleEntries()` mönstermatchar de elva
> `ChronicleKind`-värdena mot faktiska rubriktexter, hämtade direkt ur
> `emit()`-anropen i `resolve/` (samma verifierade metod som
> `newsClassification.ts`s `FLASH_PATTERNS`, se dess egen kommentar).
> GENUINT FYND: en `restricted_delivery` delar ordagrant samma
> `"DELIVERED ..."`-rubrik som en vanlig leverans — går INTE att skilja på
> text. Löst via `causeId`: `deliveries.ts`s `addDoomsday(ctx, ...,
> deliveryId)` sätter leveransens eget id som `causeId` på det separata
> `DOOMSDAY ...`-eventet, så en samturs `DOOMSDAY`-händelse vars `causeId`
> pekar på en `DELIVERED`-händelse bevisar att just den leveransen var
> restricted. Samma `causeId`-teknik generaliserad till `doomsdayDelta`-
> fallbacken för alla kinds vars doomsday-effekt ligger i ett separat
> nedströms-event (STAGE_INCIDENT/ASSASSINATE/BACK_CHANNEL, inte bara
> restricted-leveranser). `appendChronicle()`: tak 80, äldsta
> icke-spelarhändelse gallras först, med en overlag-fallback ("gallra äldst
> överlag") när samtliga kvarvarande poster är spelarens egna — ordagrant
> spec-texten. Ny `scenarioVerdict.ts` (härledd, aldrig lagrad, samma
> princip som `bidEstimate`/`ActionPreview`): CAPITAL = `house.treasury` +
> `Σ house.commodityHoldings` (redan i £, inget nytt värderingsformel
> behövdes). REACH.buyers: spec avsnitt 9s egen öppna fråga ("verifiera
> först om uppfyllda kontrakt ligger kvar i `state`") avgjord genom att
> grepp:a `deliveries.ts` — `contract.status = 'fulfilled'` splice:as
> ALDRIG bort ur `state.market.contracts`, så ingen ny `buyersServed`-mängd
> behövdes, bara ett filter på befintlig data. REACH.continents: ingen
> kontinentdata finns någonstans i kodbasen — löst med en liten,
> UTTRYCKLIGEN provisorisk `THEATRE_CONTINENT`-lookup (`indochina`/`laos`
> → `'Asia'`), ärligt continents=1 för `indochina-slice` i stället för en
> gissad siffra. SHADOW tolkad brett (alla krönikeposter där
> `actorIsPlayer`, inte bara de tre covert-op-kinderna DESIGN.md §17
> nämner som exempel) — en dokumenterad tolkning, inte den enda möjliga.
> Vändpunkter rankade efter `|doomsdayDelta|` fallande, samma skäl.
> Kärnvapenepilogen (`NuclearEpilogue`, DESIGN.md §6.3 ordagrant) har ETT
> ytterligare genuint fynd: `wire.ts`s rullande fönster är
> `WIRE_WINDOW_TURNS=8`, inte de "sista tolv turerna" DESIGN.md ber om —
> och en vanlig leverans hamnar aldrig i `chronicle` (bara
> `restricted_delivery` gör). Löst genom att läsa vad som faktiskt finns
> kvar i `state.wire` (upp till åtta turer bakåt, ärligt kortare än
> specens text) i stället för att låtsas täcka tolv — dokumenterat, inte
> tyst begränsat. Ny UI-skärm `EpilogueScreen.tsx` (`packages/app`), sista
> steget i §5s arkitektur (`Front Page ──(slut)──► Epilogue ─► Title
> Screen`): slutkortet, de fyra axlarna, vändpunkterna, kärnvapenepilogen
> (villkorad på `NUCLEAR_EXCHANGE`) och en `BottomSheet`-historikskärm
> (hela krönikan) — samma `.setup-screen`/`.setup-panel`-register som
> `BriefingScreen.tsx` (P88) redan etablerade. Den redan befintliga
> "ended"-bannern (i `App.tsx`, sedan tidigare) öppnar den nu i stället för
> att gå direkt till Title Screen. Ny e2e-täckning (`enterEpilogue`/
> `enterEpilogueHistory`, samma IndexedDB-injektionsteknik som P87s
> `enterCrisis` — ett scenario slutar bara efter många turer i ett riktigt
> parti): två nya skärmar i regel 18/11-loopen och i `npm run shots`.
> Golden omfryst EN gång i den här commiten (`GameState.chronicle` är ett
> nytt fält i det hashade sluttillståndet — ingen spelregel/balanssiffra
> rörd, samma rena formändring som P48/P51/P59 m.fl.), ingen annanstans.
> Nya tester: `chronicle.test.ts` (20), `scenarioVerdict.test.ts` (10),
> `EpilogueScreen.test.tsx` (7). Fullt testsvep grönt: 863 tester
> (826→863), lint, typecheck, build, e2e (46 tester efter de två nya
> skärmarna, körd två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

**P90 — Paus, inställningar, sparplatser.** *Utökad efter P81 (P81-6):* bygger vidare på P81b:s överlag. En buggrapportknapp kopierar version, sparfil och kvartalets senaste händelser till urklipp, tillsammans med en länk till projektets ärendelista. Spelet gör ingen egen nätverkstrafik.

> **P90 BYGGD 2026-09-28.** Ny `SettingsOverlay.tsx`, öppnad från en ny
> "Settings"-knapp i `PauseOverlay.tsx` (`.pause-actions` fick en tredje
> knapp) — panelen förblir minimal, det stora inställningsinnehållet bor
> i en egen overlay ovanpå (samma "z-index högre än .pause-overlay"-
> lagringsprincip P87s `.crisis-fullscreen` redan använder, ett steg
> lägre eftersom Settings nås GENOM Pause). §9:s sex punkter gav fyra
> GENUINA FYND, var och en löst med en dokumenterad, ärlig förenkling i
> stället för en gissad taxonomi (alla i `SettingsOverlay.tsx`s egen
> huvudkommentar, upprepas inte ordagrant här):
>
> - "Ljudnivå per kanal": `sound.ts` hade bara EN odifferentierad kanal
>   (tre likabehandlade engångseffekter, ingen gain-kontroll alls) —
>   löst med en enda global volym (0–100 %, ny `GainNode` mellan
>   buffer-källan och destinationen), den ärliga supersetet av det som
>   redan fanns.
> - "Animationshastighet" + "reducerad rörelse": slogs ihop till EN
>   `Motion`-kontroll (Normal/Fast/Off). `Off` upprepar exakt den redan
>   befintliga `@media (prefers-reduced-motion: reduce)`-regelns
>   universalselektor, bara satt av `[data-motion="off"]` i stället för
>   en OS-inställning; `Fast` generaliserar SAMMA teknik till att klippa
>   alla `transition`/`animation`-varaktigheter till 60 ms — fullständig
>   täckning (universalselektorn träffar varje regel i filen), inte en
>   handplockad delmängd.
> - "Textstorlek": hela `styles.css` deklarerar px rakt av (regel 14
>   kräver uttryckligen literala px-golv) — en fullständig omskalning
>   hade krävt att skriva om varenda `font-size` till relativa enheter.
>   Löst med AVSIKTLIGT PARTIELL täckning: `[data-text-scale="large"]`
>   växer bara de mest lästa brödtextsklasserna (`.cf-hint`,
>   `.replay-text`, `.wire-text`, kriskortets text, bannertext) —
>   HUD-tal och versala etiketter (egna px-golv, regel 14) rörs inte,
>   dokumenterat som partiell täckning, inte en exhaustiv omskalning.
> - "Sparplatser": `useGame.ts` autosparar kontinuerligt till EN enda
>   flik (`SAVE_SLOT`) — att göra varje flik till ett eget, självständigt
>   autosparande parti hade krävt att riva upp den arkitekturen, utanför
>   en enda prompts yta. Löst med TRE NAMNGIVNA MANUELLA KONTROLLPUNKTER
>   ovanpå den befintliga autosparningen: `persistence.ts`s
>   `saveGame`/`loadGame` tog redan en godtycklig `slot`-sträng (bara en
>   ny `deleteSave` saknades), och `useGame.ts` fick en ny
>   `loadFromSlot(slot)` som gör en kontrollpunkt till det LEVANDE
>   partiet (autospar-effekten skriver den sedan vidare till `SAVE_SLOT`
>   som vanligt).
>
> Buggrapportknappen (P90:s enda konkreta, namngivna leverabel): kopierar
> hus, tur, scenario, status och kvartalets senaste händelser
> (`lastTurnWire`, samma "denna turs färska händelser" `useGame.ts`
> redan exponerar) till urklipp via `navigator.clipboard.writeText` —
> `Report an Issue` är ett vanligt `<a href>` till GitHub-repots
> `/issues/new`, aldrig ett `fetch`/XHR-anrop (spec: "gör ingen egen
> nätverkstrafik"). Version läst från `packages/app/package.json` (ny
> `version.ts`) — genuint fynd: till skillnad från Synappsen-projektets
> egen versionsdisciplin har det här repot ingen releaserutin, så
> versionen har stått still på `0.0.0` sedan start. Ärligt visat som är,
> inte gissat.
>
> GENUINT FYND under bygget (hittat av testerna, inte gissat): den nya
> bekräftelsedialogen för spara/ladda/radera en kontrollpunkt renderas
> nästlad INUTI `.settings-overlay`s egen `onClick={onClose}` — utan
> `stopPropagation` på `.modal-overlay` bubblade ett tryck på
> Confirm/Cancel vidare och stängde HELA inställningspanelen som en
> oavsiktlig bieffekt (`onClose` anropades två gånger). Fixat med samma
> `stopPropagation`-mönster `.settings-panel` redan hade. Ett andra fynd,
> fångat av regel 11/18:s CI-svep: `Motion`-kontrollens tre alternativ
> (Normal/Fast/Off) i en trång rad gav en 33–40 px bred träffyta (under
> 44 px-golvet) och sedan, efter en första fix, ett klippt "NORMAL"
> (52 px text i en 48 px ruta) — löst med två generella, permanenta
> fixar i `styles.css`: `.ds-segmented-opt` fick ett `min-width: 44px`
> (samma golv `min-height` redan gav, nu på bredden också — gynnar VARJE
> framtida `Segmented`, inte bara den här), och `.settings-field` bytte
> från en rad (etikett + kontroll sida vid sida) till en stapel (etikett
> ovanför), så en `Segmented`-kontroll alltid får panelens fulla bredd i
> stället för att klämmas av en granne.
>
> Ny e2e-täckning (`enterSettings`, samma väg en riktig spelare tar: Esc
> eller HUD:ens meny-knapp → Pause → "Settings") — en ny skärm i regel
> 18/11-loopen och i `npm run shots`. Nya tester: `sound.test.ts` (+3,
> volym), `PauseOverlay.test.tsx` (uppdaterad för den nya knappen),
> `SettingsOverlay.test.tsx` (16). Golden ORÖRD (ingen `packages/core`-fil
> rörd). Fullt testsvep grönt: 882 tester (863→882), lint, typecheck,
> build, e2e (50 tester efter den nya skärmen, körd två gånger i rad). Se
> `docs/ANDRINGSLOGG.md`.

**P91 — Handledning och ordlista.** *Utökad efter P81 (P81-20), delas i två commits:* **P91a, handledningen:** de tre första kvartalen i ett nytt parti leds steg för steg (välj land, lägg ett bud, fyll en handlingsplats, avsluta kvartalet, läs förstasidan). Den går att stänga av och att starta om från menyn. **P91b, handboken:** en uppslagsbok i spelet, nåbar från menyn och från varje info-ikon, med ett uppslag per mekanik (upphandling, produktion, styrelsen, doomsday, `heat`, underrättelse, politik, fronter). Texterna ligger som data i `packages/app`. *Klart när:* ett test underkänner om ett verb eller ett HUD-tal saknar uppslag.

> **P91a BYGGD 2026-09-28.** Ny `tutorial.ts` (ren, testbar): fem steg
> (`select-country`/`place-bid`/`fill-action-slot`/`end-quarter`/`read-news`),
> INTE hårt grindade i ordning — varje steg markeras klart så fort dess
> egen händelse inträffar oavsett vad spelaren gjorde precis innan, och
> panelen visar alltid det TIDIGASTE ännu ofärdiga steget. GENUINT FYND,
> hittat av det egna e2e-testet: `state.market.openOrders` är TOM vid
> partistart (`state.ts`) — `orders.ts` genererar ordrar först under
> `resolveTurn` — så "lägg ett bud" som steg 2, bokstavligen FÖRE "avsluta
> kvartalet" som steg 4, går inte att göra i den ordningen vid ett genuint
> första kvartal. Den icke-grindade designen gör det ändå harmlöst: en
> spelare som följer texten uppifrån och ner hoppar bara naturligt till
> steg 4 innan steg 2 blir möjligt, exakt det testet till slut verifierar.
> SCOPE-BESLUT: byggd som en kontextuell textbanderoll (`TutorialOverlay.tsx`,
> samma register som `Shell.tsx`s `RejectedBanner`), inte DOM-ankrade
> "coachmarks" — de fem stegen spänner fyra skärmar (OPERATIONS/kartan,
> CONTRACTS, handlingsdockan, NEWS DESK), och riktiga ankrade pilar hade
> krävt en egen positioneringsmekanik för en enda prompt. Persisterad i
> `persistence.ts` (två nya nyckelpar: `tutorialSeen` styr AUTOSTARTEN — en
> spelares FÖRSTA nya parti, aldrig en senare omstart — `tutorial` är själva
> förloppet, överlever en omladdning mitt i). ETT ANDRA GENUINT FYND: ett
> `useState(true)`-startvärde för `tutorialSeen` (tänkt som en säker
> platshållare innan den riktiga IndexedDB-läsningen hunnit svara) visade
> sig kunna VINNA racet mot ett tillräckligt snabbt klick genom New Game
> (upptäckt av `scripts/shots.mjs`s egen körning — en tidigare skärm i
> samma delade browserkontext hade redan satt den riktiga flaggan, vilket
> dolde buggen där, men startvärdet var fortfarande fel) — fixat genom att
> byta startvärdet till `false`: en racead läsning visar i värsta fall
> handledningen en gång för mycket för en återvändande spelare, aldrig
> för en genuint ny. "Starta om från menyn": en ny sektion i
> `SettingsOverlay.tsx` (redan den etablerade "menyn" sedan P90) med en
> Restart-knapp. Ny e2e `tutorial.spec.ts`: en fullständig genomspelning av
> alla fem steg i den ordning spelet FAKTISKT tillåter, plus dismiss/
> restart. Ny skärm (`tutorial`) i `scripts/shots.mjs` och `e2e/
> text-overflow.spec.ts`s `SCREENS` (regel 18/11) — måste vara den FÖRSTA
> skärmen i respektive lista som skickar in New Game, annars döljs
> banderollen av en tidigare skärms egen `restart()`. Golden ORÖRD (ingen
> `packages/core`-fil rörd). Nya tester: `tutorial.test.ts` (10),
> `TutorialOverlay.test.tsx` (3), `SettingsOverlay.test.tsx` (+1). Fullt
> testsvep grönt: 896 tester (882→896), lint, typecheck, build, e2e (56
> tester efter den nya skärmen och de två nya funktionella testerna, körd
> två gånger i rad). Se `docs/ANDRINGSLOGG.md`.

> **P91b BYGGD 2026-09-28.** Ny `handbook.ts` (data, `packages/app`): åtta
> uppslag (`procurement`/`production`/`board`/`doomsday`/`heat`/
> `intelligence`/`politics`/`fronts`) med `title`/`summary`/`body`, plus
> `VERB_TOPIC` (alla 22 verb i `actionCatalog.ts`) och `HUD_NUMBER_TOPIC`
> (de sex visade HUD-talen; datum/tur utelämnade — en klocka, ingen
> mekanik). Klart-när ordagrant: `handbook.test.ts` underkänner om ett verb
> eller ett HUD-tal saknar uppslag. Ny `Handbook.tsx` (`BottomSheet`, samma
> mönster som `MapLegend.tsx`, `focusId` scrollar och fäller ut): bara
> `summary` syns först, `body` ligger bakom en "More"-knapp per rad (regel
> 7). Tre ingångar: huvudmenyn (`MainMenu.tsx`, egen lokal state — kräver
> ingen `GameState`), Settings (`SettingsOverlay.tsx`, "Open Handbook") och
> HUD:ens info-ikoner. GENUINT FYND 1: `InfoTooltip` (P73) hade aldrig
> kopplats in i riktig UI, bara i `ComponentLibrary.tsx`; den fick en valfri
> `onReadMore`/`testId` (bakåtkompatibel) och en `onBlur` som bara stänger
> bubblan när fokus lämnar hela komponenten — annars hann bubblan avmonteras
> innan dess egen "More →"-knapps `onClick` körde. GENUINT FYND 2: `HudBar`s
> kompaktrad är själv en `<button>`, och en `InfoTooltip`-knapp inuti den är
> ogiltig HTML — info-ikonerna bor därför i den utfällda panelen (som nu
> visar alla sex talen, inte bara tre). GENUINT FYND 3 (självfångat före
> commit): första utkastet av `handbook.ts` var skrivet på svenska, inklusive
> topic-ID:na, i strid med P21:s regel att hela UI:t är på engelska —
> omskrivet helt. GENUINT FYND 4 (regel 11, fångat av
> `e2e/text-overflow.spec.ts` på den nya `handbook`-skärmen):
> `.handbook-more` hade `min-height: 32px` (8 knappar, 53×32 px) — fixat till
> 44 px, och samma fel rättat proaktivt i `.ds-tooltip-more`. GENUINT FYND 5
> (fångat av `npm run shots`, regel 17 — varken jsdom-testerna eller regel
> 11/18-testet ser det): när Handboken öppnades från Settings låg
> pausöverlaget kvar ovanpå den — `onOpenHandbook` i `App.tsx` stängde
> Settings men inte pausen. Fixat (`setPaused(false)`), och `enterHandbook`
> i `text-overflow.spec.ts` kräver nu att `pause-overlay` är dolt. Ny skärm
> (`handbook`) i `scripts/shots.mjs` och `SCREENS`. Golden ORÖRD (ingen
> `packages/core`-fil rörd). Nya tester: `handbook.test.ts` (5),
> `Handbook.test.tsx` (5), `InfoTooltip.test.tsx` (4), `App.menu.test.tsx`
> (+1), `Shell.hud.test.tsx` (+2). Testsvep: 913 tester (896→913), lint,
> typecheck, build, e2e 60 tester gröna två gånger i rad, `npm run shots` körd
> och `handbook`-skärmen granskad i båda formaten (papperspanel, samma register
> som teckenförklaringen; ingen referensskiss finns för den). Se `docs/ANDRINGSLOGG.md`.

### 7E — Tillgångar och finish

**P92 — Porträtt och händelsebilder.** Promptdokument först, bilderna genereras av ägaren, kopplas sedan in.

> **P92 LEVERERAD 2026-09-29 (endast dokument, ingen kod).** Nytt
> `docs/GRAFISKA_TILLGANGAR_ETAPP7.md`, samma arbetsgång som
> `GRAFISKA_TILLGANGAR.md`: 18 porträtt (12 startuppsättningstjänstemän ur
> `officials.json` + 6 ersättare ur `successors.json`) och 10 händelsebilder
> (ur `ChronicleKind` och blixtmönstren i `newsClassification.ts`), med två
> LÅSTA stilprompter (porträtt: svartvit ID-akt 1964; händelser: halvtonsplåt
> med bara fettkritsrött/-blått) så att alla bilder i en grupp ser ut att
> komma från samma hand. Premisskontroll mot koden: `packages/app` har inget
> porträtt- eller händelsebildsfält (sökt), så det finns inget att koppla in
> än — inkopplingen är beskriven som en egen, senare uppgift. GENUINT FYND:
> ersättarna i `successors.json` behöver egna porträtt, och de hör till
> fraktion + ersättarnummer, inte till en post (`replaceOfficial` tar den
> avlidnes post); specens "porträtt av tjänstemännen" nämner dem inte, men
> utan dem skulle en ersättare visas utan bild. Personbeskrivningarna bygger
> på post/ålder, aldrig på de dolda talen `integrity`/`agenda` —
> `officialDisplay` grindar dem bakom underrättelse, och ett "korrupt" eller
> "ärligt" uttryck i bilden hade läckt dem. Inkopplingen föreslås testad med
> samma mönster som `handbook.test.ts`: ett test som underkänner om en
> tjänsteman saknar porträtt. Golden ORÖRD (ingen kod). Ägarens
> generering av bilderna återstår.

**P93 — Ljudpass.**

**P94 — Tillgänglighet, prestanda och skrivbordsvarianten.** Prestandabudgeten mätt på riktiga telefoner. Skrivbordslayouten genomgången med hovring och tangentbord. e2e omskrivet till kartflödet i båda formaten.

**P95 — Speltest. Ingen kod.** Tre partier på telefon, frågan i §1.

Tjugotre prompter, plus åtgärdspasset P81a–P81d efter speltestet. Skivan i 7B är det som avgör etappen: blir den godkänd vet du hur resten ska se ut, och 7C–7E är att upprepa samma kvalitet på fler ytor.

---

## 14. Medvetet utanför etappen

- 3D, realtid, förband som spelaren flyttar
- världskartan (§6.8)
- nya scenarier; kartsystemet ska klara dem, men datat byggs inte nu
- Pixi eller annan canvasmotor, om inte budgeten i §12 bryts
- multiplayer, prestationer, onlinefunktioner

---

## 15. Öppna beslut för ägaren

1. **Plattform (§2I):** *Beslutat 2026-09-22: mobil först, stående läge.*
2. **Geografisk karta (§2A):** *Beslutat 2026-09-22: ja.*
3. **Förbandsförflyttning (§2F):** beslutas efter P75, på stillhetsmåttet.
4. **Skisser (§11.1):** *Beslutat 2026-09-22: OPERATIONS godkänd i tre tillstånd, ligger i `docs/ui/reference/`.*
5. **Etappens namn:** "Spelbordet", eller annat.
6. **Speltestet P81 (§13):** *Beslutat 2026-09-27:* åtgärdspasset P81a–P81d före 7C; nytt forskningssystem och förskottsbetalning i egna etapper (§16); "svåra att hitta" löses i 7C.

---

## 16. Efter etappen — föreslagna etapper (inte antagna)

Punkter från speltestet P81 som kräver ny mekanik och därmed omfryst golden. De hör inte hemma i etapp 7, som är ren presentation. Varje etapp får en egen spec med premisskontroll mot koden innan något byggs.

**Etapp 8, ekonomin.**
- *Förskottsbetalning* (P81-19): en andel av kontraktsvärdet betalas vid tilldelningen. Andelen varierar per order och köpare och syns i budmappen, så att den blir en faktor när spelaren väljer vilka ordrar att bjuda på.
- *Kassahistorik* (P81-15): ett nytt `GameState`-fält med intäkter och kostnader per kvartal över hela partiet, visat som graf i THE COMPANY. `state.wire` räcker inte, eftersom den bara sparar åtta turer.
- *Balans för mänskligt spel* (P81-8): styrelsemålet och `BUYOUT` mäts om efter P81c. `balanced` och `capacity` flyttas till `playerWinCurve`, eftersom alla mätningar P37–P64 gjordes med botar som bjöd på det begränsade `winBand` (fynd 1 i P81-blockquoten).

**Etapp 9, forskningen** (P81-17, ägarbeslut a): ett nytt forskningssystem med kännbara effekter, som ersätter dagens modell bakom `REPRIORITISE_RND`. Premisskontrollen utgår från P28:s techspärr och R&D-värde.
