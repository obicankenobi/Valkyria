# Etapp 12 — Krigsrummet (PC widescreen och levande karta)

**THE SEVENTH FRONT** · **ANTAGEN 2026-10-16 (ägaren körde P192)** · skriven av Gemini (visuell arkitekt) för ägaren, mot grenen efter P191

> **Status:** förslaget lades in i repot 2026-10-16 på ägarens begäran, ordagrant utom att Geminis
> källhänvisningsmarkörer (`[cite: 1]`) är borttagna. **Inget är byggt och inget av besluten 12A–12F är loggat**:
> enligt specens egen P192 loggas de i `docs/ANDRINGSLOGG.md` först när etappen körs. Ägarens gemensamma
> speltest (`docs/SPELTEST_ETAPP10A.md`) och P150 (etapp 10B) ligger kvar före; ordningen mot etapp 12 är ett
> ägarbeslut som inte är fattat. Filen behåller namnet `ETAPP12_FORSLAG.md` som de andra förslagen.
>
> **Byggstatus (2026-10-17):** P192 körd. **P193 byggd** — Paket G1+G2 (`docs/ETAPP12_BUNDLE_G1_G2.md`) uppackade ordagrant och inkopplade; fyra fel i Geminis filer rättades minimalt och limmet ligger i `styles/desk-integration.css` (se `ANDRINGSLOGG.md` 2026-10-17). P194–P198 väntar på G3–G5. Raden "Paketen G1–G5 finns ännu inte" nedan gällde vid inläggningen.
>
> **Premisskontroll mot koden (2026-10-16, gjord vid inläggningen, inget ändrat):** specens fyra påståenden i §0 stämmer.
> (1) `TheatreMap.tsx` ritar frontlinjen som `<circle className="map-frontline-marker">` plus tre spårcirklar.
> (2) `QuarterReplay.tsx` är en platt lista (`<ol className="replay-list">`).
> (3) `MovementArrow.tsx` importeras av ingen annan fil. (4) `App.tsx` ritar `<TheatreMap>` bara när `view === 'operations'`.
> De sökvägar P192 pekar på finns (`packages/app/playwright.config.ts`, `e2e/screens.ts`, `e2e/text-overflow.spec.ts`,
> `scripts/shots.mjs`), liksom `public/art/wear/ink-wear-1..6.svg`, `public/art/portraits/` och `public/art/seals/`.
> **Paketen G1–G5 finns ännu inte i repot** (`DeskWorkspace.tsx`, `DeskYarn.tsx`, `RubberStampTool.tsx`,
> `RichTheatreMap.tsx`, `MapQuarterReplay.tsx` och deras hjälpfiler) — ägaren lägger in dem före respektive prompt.
>
> **Det en kodsession ska veta innan P192 (att avgöra av ägaren, inte tyst löst):**
> 1. Specen upphäver regel 10 (mobil först) och regel 13 (ingen information bara vid hovring) i `CLAUDE.md`. Regel 11
>    (träffytor 44×44), 12 (säkra områden), 1 (sidan scrollar aldrig) och 16 (kortkommandon) nämns inte och står kvar tills
>    något annat sägs; PWA:n (`manifest.webmanifest`, `sw.js`) och telefonformatet i `docs/ui/reference/` nämns inte heller.
> 2. En hovringstråd (12C) är information som bara nås med hovring; på pekskärm finns ingen motsvarighet, och regel 13 sade
>    uttryckligen att allt hovring visar ska nås med tryck. Specen låser därför mobilen ute (12A) — bekräfta att det är avsett.
> 3. "Du får aldrig förenkla Geminis moduler" gäller även mot `CLAUDE.md`s hårda regel att stanna och beskriva om en spec visar sig
>    omöjlig: om ett G-paket inte går att koppla mot `GameState` utan att ändra det, stannar sessionen och frågar.
> 4. P193 flyttar kartan till en permanent vänsterhalva; texttestet (regel 18) och kartkollisionstestet måste omprövas mot ett
>    annat kartmått än idag.

---

# ETAPP 12 — KRIGSRUMMET (PC WIDESCREEN & LEVANDE KARTA)

*Teknisk specifikation och arbetsfördelning mellan **Gemini (Argon 4 medium/high effort) (Visuell Arkitekt)** och **Claude Code (Systemintegratör)**. Ren frontend-etapp i `packages/app`. Rör ALDRIG `packages/core/src/resolve/`, `balance.json` eller golden-snapshoten.*

---

## 0. Briefing till Claude Code — LÄS DETTA INNAN DU RÖR EN ENDA FIL

Den här etappen genomförs i ett **delat arbetsflöde** mellan två AI-system för att lösa det huvudproblem som identifierats under speltestning: att spelet hittills har känts som ett platt kalkylark/webbformulär istället för ett levande strategispel i stil med *Radio General*.

### Varför arbetsfördelningen ser ut som den gör
Under tidigare etapper (P76–P80) fattade kodsessioner i Claude Code defensiva förenklingsbeslut som skadade spelkänslan:
1. I `TheatreMap.tsx` reducerades referensskissens taggiga fettkrits-frontlinje till en enda cirkel på 4 pixlar (`<circle r={4} />`).
2. I `QuarterReplay.tsx` valdes kartanimering bort i en kodkommentar till förmån för en platt textlista (`<ol className="replay-list">`).
3. `MovementArrow.tsx` (byggd i P41) kopplades aldrig in trots att `fronts.ts` (`redeployAfterBreakthrough`) genererar faktiska förbandsförflyttningar.
4. I `App.tsx` avmonteras `<TheatreMap>` så fort spelaren byter till `contracts`, `company`, `contacts` eller `news`, vilket ersätter spelbordet med fullbreddstabeller (`<table>`).

### Hårda samarbetsregler för Claude Code i Etapp 12
1. **Ägaren levererar 5 färdiga visuella moduler (Paket G1–G5, skrivna av Gemini) direkt in i repot.**
2. **DU FÅR INTE FÖRENKLA, KRYMPA ELLER RITA OM GEMINIS LEVERERADE SVG-, CSS- ELLER KOMPONENTSTRUKTUR.** Om ett befintligt test i `packages/app/test/` eller `packages/app/e2e/` faller på grund av att en gammal flik eller platt tabell ersatts av krigsbordet, ska **testet** uppdateras till den nya komponenten — du får aldrig nedgradera den visuella komponenten för att passa ett gammalt test.
3. **Ditt uppdrag (Prompt P192–P198)** är att:
   - Avveckla mobil-först-tvånget (`390×844`) i `CLAUDE.md`, `scripts/shots.mjs` och `e2e/`.
   - Koppla ihop Geminis färdiga moduler (G1–G5) med `GameState`, `@seventh-front/core` (`queries.ts`, `validateAction`, `validateBid`, `previewAction`, `formationDisplay`, `officialDisplay`) och `useGame.ts`.
   - Säkerställa att alla skyddsräcken (särskilt Skyddsräcke 3: ingen läcka av dolda fält utan station) samt `npm test`, `npm run lint`, `npm run build` och `npm run test:e2e` är 100 % gröna.

---

## 1. Ägarbeslut (12A–12F) — Läggs i `docs/ANDRINGSLOGG.md` i P192

- **12A — PC Widescreen först, mobilversionen läggs på is.** Regel 10 i `CLAUDE.md` ("Mobil först, 390×844") och Regel 13 ("Ingen information bara vid hovring") upphävs. Standardformatet är **PC Widescreen (1440×900 och 1920×1080)**. `scripts/shots.mjs` och Playwright-testerna i `packages/app/e2e/` körs enbart mot desktop-viewport (`1440×900`).
- **12B — Diegetiskt skrivbord i *Radio General*-stil ersätter femfliksskalet.** `<TheatreMap>` avmonteras aldrig under pågående parti. Skärmen är ett sammanhängande direktionsbord där kartan alltid ligger fastnålad på vänstra/mellersta delen av bordet (ca 58 % bredd) och alla arbetsvyer (`Tenders/Contracts`, `The Works`, `Dossiers/Contacts`, `The Wire & Ledger`) öppnas som fysiska, staplade manillamappar och blåkopior på bordets högra sida (ca 42 % bredd).
- **12C — Röda karttrådar vid hovring (`DeskYarn`).** När spelaren hovrar över eller väljer ett orderkort, en tjänsteman, ett utbox-kort eller en rad på kvartalets skrivblock (`This Quarter`), ritas en fysisk röd tråd/peklinje i realtid från DOM-elementet i mappen till exakt rätt DOM-nod (`[data-map-node="<id>"]`) på kartan via `getBoundingClientRect()`.
- **12D — Rik militär generalstabskarta (1965) + Dynamiska världsspår.** Bas-kartan byggs ut med topografiska höjdkurvor, flodsystem (Mekong + Röda floden), huvudvägar (Route 1, Route 9, Route 13), flyg-/flottbaser och militär kartusch. Förband ritas som fysiska 3D-pappbrickor ("Wargame Chits"). Världsläget (`supplyLines.ts`, `Theatre.heat`, `Faction.embargoed`, `GameState.history`, `foreignWorks`) ritar ut fysiska fraktfartyg till havs, stridsärr vid hög `heat`, fastnålade historiska händelsekort och embargostämplar över stängda hamnar.
- **12E — Kvartalsuppspelningen sker på kartan (`MapQuarterReplay` + `MovementArrow`).** Den gamla textlistan i `QuarterReplay.tsx` ersätts av en koreograferad uppspelning direkt på `<TheatreMap>` där leveranser rör sig längs rutterna, strider blixtrar i sektorer, fettkrits-frontlinjen flyttar sig och `MovementArrow.tsx` ritas ut när förband omgrupperar (`REDEPLOY`).
- **12F — Fysiskt stämpelverktyg (`RubberStampTool`) och fastgemade porträtt.** Att skicka in ett bud eller arkivera en order sker genom ett fysiskt stämpelverktyg där muspekaren blir en trästämpel som vid klick lämnar ett slitet bläckavtryck (`public/art/wear/ink-wear-1..6.svg`) på dokumentet. Befintliga SVG-porträtt (`public/art/portraits/*.svg`) och sigill (`public/art/seals/*.svg`) monteras med fysiska gem på person- och rivalakterna.

---

## 2. DEL 1 — Geminis Leveranspaket (G1–G5)

*Dessa 5 moduler skrivs i sin helhet av Gemini och läggs in i repot av ägaren inför respektive prompt. Claude Code ska importera och koppla in dem — aldrig skriva om deras grafik eller CSS.*

| Paket | Filer som levereras av Gemini | Vad modulen innehåller | Kopplas in i prompt |
| :--- | :--- | :--- | :--- |
| **G1** | `packages/app/src/components/DeskWorkspace.tsx`<br>`packages/app/src/styles/desk-war-room.css` | Hela det diegetiska mahognyskrivbordet: belysningskon (Lamp Hi/Low), stålpanel med Doomsday-mätare + mekaniska siffertrummor (`Odometer`) för kassa + bakelittelefon, Telex-maskin nere till vänster, mässingsskrivblock (`This Quarter`), manillamapps-stapel med utstickande registerflikar till höger, ståltrådskorg (`Outbox` för 3 handlingar) och bläddringsbar bordskalender (`End Quarter`). | **P193** |
| **G2** | `packages/app/src/components/DeskYarn.tsx`<br>`packages/app/src/deskYarnContext.ts` | Global SVG-overlay (`position: fixed; inset: 0; pointer-events: none`) och React-context (`useDeskYarn`) som tar ett käll-DOM-element och ett `targetNodeId`, slår upp `[data-map-node="${targetNodeId}"]` i `TheatreMap`, räknar ut skärmkoordinater via `getBoundingClientRect()` (lyssnar även på `d3-zoom`-transformen) och ritar en böjd röd tråd med mässingsnål och slagskugga. | **P193** |
| **G3** | `packages/app/src/components/RubberStampTool.tsx`<br>`packages/app/src/components/PaperclipPhoto.tsx` | Interaktiv stämpelzon och trästämpel-markör: när musen förs in i signaturrutan visas stämpelns skugga; vid klick spelas stämpelljud (`playSound('stamp')`), en kompressionsanimation körs och ett permanent stämpelavtryck med deterministisk lutning (`stampWear.ts`) och `mask-image: url(/art/wear/ink-wear-N.svg)` slås fast. Inkluderar även `PaperclipPhoto` för fastgemade porträtt (`public/art/portraits/`). | **P197** |
| **G4** | `packages/app/src/components/RichTheatreMap.tsx`<br>`packages/app/src/mapMilitaryOverlay.ts` | Den utbyggda militärkartan: (1) Topografiska höjdkurvor, Mekongfloden, vägnät (Route 1/9/13), flygbaser, djuphamnar, kartusch; (2) Taggiga fettkrits-frontlinjer (`<polyline>` med `feDisplacementMap` och 3 spår bakåt ur `front.trace`); (3) 3D-pappbrickor (`WargameChit`) med fasad kant, slagskugga och `MAULED`-metallflik; (4) Dynamiska lager för fartygsbrickor till havs (`supplyLines`), stridsärr/7th Fleet-siluetter skalade efter `theatre.heat`, embargostämplar (`faction.embargoed`) och fastnålade historiska polaroidkort (`state.history`). | **P194 & P195** |
| **G5** | `packages/app/src/components/MapQuarterReplay.tsx` | Koreograferad kvartalsuppspelning som körs *ovanpå* den synliga kartan i 4 faser (Deliveries → Engagements → Breakthrough/Redeploy → Political/History): animerar konvojer, ritar ut stridsblixtar och förlustbrickor vid drabbade sektorer, interpolerar frontlinjens flytt, renderar `MovementArrow.tsx` på kartan vid `REDEPLOY` och matar fram händelserna i Telex-maskinen nere till vänster. | **P196** |

---

## 3. DEL 2 — Claude Codes Promptsekvens (P192–P198)

### P192 — Nya PC-regler, viewport-skifte och testinfrastruktur (Claude Code)
**Ingen ny UI-kod ännu — bara regler och testrigg.**
1. Uppdatera `CLAUDE.md` ("Spelgränssnitt — regler"):
   - Ersätt Regel 10 ("Mobil först, 390×844") med: *"10. PC Widescreen först. Varje skärm byggs för 1440×900 (och skalas upp till 1920×1080) som ett sammanhängande krigsbord där kartan alltid ligger synlig till vänster och arbetsmapparna till höger."*
   - Ersätt Regel 13 ("Ingen information bara vid hovring") med: *"13. Hovring på skrivbordet spänner en röd karttråd (`DeskYarn`) till berörd plats eller förband på kartan; ett klick låser markeringen."*
   - Uppdatera Regel 17 så att `npm run shots` bara tar desktop-skärmbilder (`1440×900`).
2. Lägg in ägarbesluten **12A–12F** i `docs/ANDRINGSLOGG.md`.
3. Uppdatera `packages/app/playwright.config.ts`, `packages/app/e2e/screens.ts`, `packages/app/e2e/text-overflow.spec.ts` och `packages/app/scripts/shots.mjs` så att telefon-viewporten (`390×844`) tas bort och desktop-viewporten sätts till `1440×900`.
4. **Klart när:** `npm test` och `npm run test:e2e` går igenom i `1440×900`.

---

### P193 — Skrivbordsskalet (`DeskWorkspace`) och Röda Tråden (`DeskYarn`) (Gemini G1+G2 → Claude Code)
**Förutsättning:** Ägaren har lagt in `DeskWorkspace.tsx`, `desk-war-room.css`, `DeskYarn.tsx` och `deskYarnContext.ts` (Paket G1 & G2 från Gemini).
**Claude Codes uppgift:**
1. Importera `desk-war-room.css` i `packages/app/src/main.tsx` (efter `styles.css`).
2. Bygg om `packages/app/src/App.tsx` och `Shell.tsx` så att alla in-game-vyer (`operations`, `contracts`, `company`, `contacts`, `news`) renderas inuti `<DeskWorkspace>` (G1) och `<DeskYarnProvider>` (G2):
   - **Vänster bordshalva:** Renderar *alltid* `<TheatreMap>` (avmonteras aldrig när spelaren byter mapp!), flankerad av Stål-HUD:en överst (med `Odometer` för `state.house.treasury`, `DoomsdayGauge` för `state.doomsday`, styrelseindikator och bakelittelefon som ringer när `state.pendingCrisis !== null`) samt Telex-maskinen och `This Quarter`-skrivblocket nederst.
   - **Höger bordshalva (Manillamappen):** Renderar den aktiva mappen utifrån vald registerflik (`contracts` → `<TheFloor>`, `company` → `<TheHouse>`, `contacts` → `<ThePolitics>`, `news` → `<TheWire>`, eller `<CountryFile>` när ett land valts på kartan).
   - **Nedre högra hörnet:** Renderar `Outbox`-korgen (`draft.actions`) och bordskalendern (`End Quarter`, kopplad till `handleEndTurn`).
3. Sätt `data-map-node="<id>"` på huvudstäder, sektorer och förband i `TheatreMap.tsx`, och koppla `useDeskYarn()` (hover-ankare) på raderna i `QuarterBand`/`This Quarter`, ordermapparna i `TheFloor.tsx`, tjänstemännen i `ThePolitics.tsx` och korten i `ActionDock`.
4. **Klart när:** Kartan ligger kvar till vänster oavsett vilken mapp som öppnas till höger, hovring på en order eller ett larm ritar den röda tråden till rätt punkt på kartan, och alla Shell/App-tester i `packages/app/test/` är uppdaterade och gröna.

---

### P194 — Militärkartan 1965, Fettkrits-frontlinjer och 3D-Chits (Gemini G4 del A → Claude Code)
**Förutsättning:** Ägaren har lagt in `RichTheatreMap.tsx` och `mapMilitaryOverlay.ts` (Paket G4 från Gemini).
**Claude Codes uppgift:**
1. Koppla in Geminis topografiska och militära baslager (`mapMilitaryOverlay.ts`: höjdkurvor, Mekongfloden, Route 1/9/13, flygbaser, flottbaser och kartusch) i `TheatreMap.tsx`.
2. Ersätt den gamla 4px-cirkeln (`map-frontline-marker`) i `TheatreMap.tsx` med Geminis taggiga fettkrits-frontlinje (`FrontlineGreasePolyline`) som läser `front.position` och de 3 bakåtspåren i `front.trace`.
3. Ersätt den platta `FormationToken` i `TheatreMap.tsx` med Geminis 3D-pappbricka (`WargameChit`):
   - **Skyddsräcke 3 gäller strikt:** All data till `WargameChit` MÅSTE fortsätta gå via `formationDisplay(state, formation)`. Utan station i landet visas den streckade `? UNKNOWN`-pappbrickan utan att läcka styrka eller namn.
   - Visa förbandsnamn och styrka direkt på brickans etikett även på standardzoom (`zoomLevel >= 1`), eftersom widescreen-kartan nu har plats för det.
4. **Klart när:** `TheatreMap.test.tsx`, `mapInfo.test.ts` och `e2e/text-overflow.spec.ts` är gröna med de nya 3D-brickorna och frontlinjerna.

---

### P195 — Dynamiska världsspår på kartan (Gemini G4 del B → Claude Code)
**Claude Codes uppgift:**
Koppla ihop Geminis dynamiska världslager i `RichTheatreMap.tsx` med faktisk data ur `GameState`:
1. **Fraktfartyg & Konvojer (`ShipChit` / `ConvoyMarker`):** Läs `playerSupplyLines` och `rivalSupplyLines` ur `supplyLines.ts` samt `state.market.shipments`. Rita ut fartygsbrickorna i Sydkinesiska sjön på väg mot Da Nang / Vientiane med lastetikett, och markera kärnvapenleveranser (`mk9_longhand_shell`) med varningssymbol.
2. **Krigets ärr & Eskalering (`HeatScarsLayer`):** Läs `state.theatres[id].heat` samt senaste turens stridshändelser ur `state.wire` (`scope === 'front'`). Vid `heat >= 30` visas artillerikors/stridsmarkörer i drabbade sektorer; vid `heat >= 60` (eller efter *Rolling Thunder*) visas 7th Fleet-hangarfartyg i Tonkinbukten.
3. **Embargostämpel & Utlandsverk:** Om `state.factions[id].embargoed === true`, rendera den röda `PORT CLOSED — EMBARGO`-stämpeln över köparens hamn/huvudstad. Behåll och stila `foreignWorks(state.house)` som fysiska byggnadsbrickor på kartan.
4. **Fastnålade Historiska Polaroider (`PinnedHistoryCards`):** Läs `state.history` (från P149) och nåla fast miniatyrkort vid rätt geografiskt ankare (Tonkinbukten, Da Nang, Saigon, Vientiane) för inträffade förstasideshändelser.
5. **Klart när:** Nya enhetstester i `TheatreMap.test.tsx` verifierar att fartyg, embargostämpel, heat-markörer och historiekort renderas deterministiskt ur `GameState`.

---

### P196 — Koreograferad kvartalsuppspelning på kartan & `MovementArrow` (Gemini G5 → Claude Code)
**Förutsättning:** Ägaren har lagt in `MapQuarterReplay.tsx` (Paket G5 från Gemini).
**Claude Codes uppgift:**
1. Ersätt den gamla textmodalen i `QuarterReplay.tsx` med Geminis `MapQuarterReplay.tsx`:
   - Uppspelningen dämpar inte längre bort kartan bakom en svart ruta, utan spelas upp direkt *på* `<TheatreMap>` medan rubrikerna matas fram i Telex-maskinen nere till vänster.
   - Styrelsens PM (`BoardMemo`) och historiska förstasidor (`FrontPageCard`) visas som fysiska papper som läggs fram på skrivbordet i slutet av uppspelningen och kvitteras av spelaren.
2. **Koppla äntligen in `MovementArrow.tsx` (från P41!):** Extrahera förbandsförflyttningar (`REDEPLOY` ur `fronts.ts` `redeployAfterBreakthrough`) och leveransankomster (`SUPPLY_ARRIVAL`) ur `lastTurnWire` och rendera både den grafiska pilen på kartan och `<MovementArrow>`-etiketten under och efter uppspelningen.
3. Respektera `prefers-reduced-motion` och inställningen `motion === 'off'` (hoppar direkt till slutläget utan fördröjning).
4. **Klart när:** `QuarterReplay.test.tsx`, `QuarterReplay.memo.test.tsx` och `MovementArrow.test.tsx` är gröna och verifierar att `REDEPLOY`-händelser i `wire` faktiskt renderar `MovementArrow`.

---

### P197 — Fysiskt stämpelverktyg (`RubberStampTool`) och fastgemade porträtt (Gemini G3 → Claude Code)
**Förutsättning:** Ägaren har lagt in `RubberStampTool.tsx` och `PaperclipPhoto.tsx` (Paket G3 från Gemini).
**Claude Codes uppgift:**
1. I `BidForm.tsx`: Ersätt den vanliga `Place Bid`/`Update Bid`-knappen med Geminis `<RubberStampTool label="SEALED BID" onStamp={() => onSubmit(bid)} />` så att spelaren fysiskt stämplar sin offert på kontraktsformuläret.
2. I `CountryFile.tsx` och `ThePolitics.tsx`: Ersätt `FILE`-knappen på rekvisitionsblanketterna med `<RubberStampTool label="AUTHORISED" onStamp={...} />`.
3. I `ThePolitics.tsx` och `CountryFile.tsx`: Använd `<PaperclipPhoto>` för att fästa tjänstemännens porträttsiluetter (`/art/portraits/official-${factionId}-${post}.svg`) och rivalordförandenas porträtt/sigill (`/art/portraits/chairman-${rivalId}.svg`, `/art/seals/${rivalId}.svg`) med ett fysiskt gem uppe i hörnet på varje aktkort.
4. **Klart när:** Alla formulärtester (`BidForm.*.test.tsx`, `CountryFile.test.tsx`, `ThePolitics.actions.test.tsx`) triggar stämpeln och är 100 % gröna.

---

### P198 — Sanering, fullt testsvep och visuell granskning (Claude Code)
1. Kör hela testsviten: `npm test`, `npm run lint`, `npm run build` och `npm run test:e2e`.
2. Kör `npm run shots` och verifiera samtliga desktop-skärmbilder i `docs/ui/current/`.
3. Verifiera att golden-snapshoten (`packages/core/test/golden/golden.test.ts`) är helt orörd.