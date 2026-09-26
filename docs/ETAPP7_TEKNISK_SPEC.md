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

**P77 — Brickor, dimma och omgivningsrörelse.** APP-6-brickor, underrättelsedimma, allt i §6.6 under *omgivningsrörelse*. *Klart när:* förband utan station renderas streckat och namnlöst; reducerad rörelse stänger av allt utom tillståndsbyten.

**P78 — `validateAction` och `previewAction`.** Utbrutna ur `applyActions.ts`. *Klart när:* golden bitvis identisk; varje avvisningsorsak har ett test som visar samma svar från båda.

**P79 — Val, landets bottenark och handlingsplatserna.** Sydvietnam och dess huvudstad, station, tjänstemän och ordrar går att välja. Landets bottenark med underrättelseverben (alla sex) och `TierPicker`. Handlingsplatserna. *Klart när:* alla sex underrättelseverb går att köa från kartan och avgörs korrekt i en e2e-tur.

**P80 — Kvartalsuppspelningen och NEWS DESK.** `wireAnchor`, rubrikläge som standard, full uppspelning som val, förstasidan. *Klart när:* minst 80 % av händelserna i en 20-turers golden-körning får ett ankare som inte är `hud`; annars redovisas vilka typer som saknar `subjectId`.

**P81 — Speltest av skivan. Ingen kod.** Ägaren spelar skivan, besvarar frågorna i §11.6 och godkänner eller underkänner stilen. Underkänd stil åtgärdas innan 7C.

### 7C — Bredda

**P82 — Hela kartan.** Laos-teatern, alla länder, huvudstäder, stationer och ordermarkörer, försörjningslinjer (§6.7). Förbandsförflyttning om 2F antagits, som egen commit med omfryst golden.

**P83 — This Quarter.** *Klart när:* varje radtyp i §7.7 hoppar till rätt föremål.

**P84 — CONTRACTS.** Stämplade mappar och prisreglaget över `winBand`. *Klart när:* inga dolda fält renderas.

**P85 — THE COMPANY.** Produktionslinjer som visuella band, `INTERNAL` och råvarupanelen med `BUY_FORWARD`, `RELEASE`.

**P86 — CONTACTS och politikverben.** Personakter, faktionernas och rivalernas akter. `BRIBE`, `FUND_CAMPAIGN`, `FAVOUR`, `INFLUENCE`, `STAGE_INCIDENT`, `BACK_CHANNEL`, `BROKER` först; `FUND_COUP` och `ASSASSINATE` sist i samma prompt. *Klart när:* alla 22 verb nåbara från gränssnittet, verifierat med samma sökning som i §0.1.

**P87 — Kriskortet.**

### 7D — Sidorna

**P88 — Title Screen, New Game och Briefing.** Valfria startval i `createInitialState`. *Klart när:* standardvalen ger bitvis identisk golden.

**P89 — Krönikan och epilogen.** `GameState.chronicle`, `scenarioVerdict(state)`, slutkort per slutorsak, kärnvapenepilog, vändpunkter. *Klart när:* golden omfryst i denna commit och ingen annan.

**P90 — Paus, inställningar, sparplatser.**

**P91 — Handledning och ordlista.**

### 7E — Tillgångar och finish

**P92 — Porträtt och händelsebilder.** Promptdokument först, bilderna genereras av ägaren, kopplas sedan in.

**P93 — Ljudpass.**

**P94 — Tillgänglighet, prestanda och skrivbordsvarianten.** Prestandabudgeten mätt på riktiga telefoner. Skrivbordslayouten genomgången med hovring och tangentbord. e2e omskrivet till kartflödet i båda formaten.

**P95 — Speltest. Ingen kod.** Tre partier på telefon, frågan i §1.

Tjugotre prompter. Skivan i 7B är det som avgör etappen: blir den godkänd vet du hur resten ska se ut, och 7C–7E är att upprepa samma kvalitet på fler ytor.

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
