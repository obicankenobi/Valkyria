# ETAPP 6 — KARTAN OCH HUVUDMENYN

Teknisk spec, samma format som `ETAPP1`–`ETAPP5`. Bygger direkt vidare på
`UI_GRANSKNING_OCH_SKARMSPEC.md` (levererad föregående pass) och på det uttryckliga beslutet:
**riv "ingen karta"-pelaren, bygg en huvudmeny, gör spelet till ett spel.**

Ren frontend-etapp. Rör `packages/app` och (i ett enda, avgränsat undantag, §4.4) en ny
härledningsfunktion i `packages/core/src/queries.ts` — aldrig `resolve/`, aldrig `balance.json`,
aldrig golden-snapshoten. Kan köras parallellt med etapp 5 (P54–P63) utan krockrisk: ingen fil de
båda etapperna skriver i delas.

**Status (2026-09-18): P65 (huvudmenyn), P66 (sektortavlan, front-1/indochina) BYGGDA. P67–P72
återstår.**

> **Fynd vid antagandet (2026-09-18, se `docs/ANDRINGSLOGG.md`):** `UI_GRANSKNING_OCH_SKARMSPEC.md`,
> som §0 och §5 ovan hänvisar till som redan levererad, finns INTE i repot — sökt igenom hela
> git-historiken (`git log --all --diff-filter=A --name-only`), noll träffar. Samma mönster som
> den saknade "THE_WORLD-specen" i etapp 3 (se `ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` avsnitt
> 5.5.1). Ägaren tillfrågad vid antagandet: valde att fortsätta ändå — allt tekniskt innehåll §0–§7
> nedan behöver är självbärande i den här filen, ingen prompt P65–P72 läser
> `UI_GRANSKNING_OCH_SKARMSPEC.md` för något den inte redan säger själv. Flaggat, inte blockerande.

---

## 0. Ägarbeslut — läggs i `ANDRINGSLOGG.md` INNAN P65 körs

```
| 2026-09-18 | **DESIGN §18/§21 — ÄGARBESLUT: "ingen karta"-pelaren revideras** | Fronten får en
schematisk sektortavla (SVG, region-noder + linjer, INTE en geografiskt korrekt karta, INTE en
hexkarta) i stället för den rena panellistan. Motiv: (1) UI_GRANSKNING_OCH_SKARMSPEC.md visade att
en andra CSS-omgörning inte löser "dokumentkänslan" — komponentformen måste ändras, inte paletten;
(2) etapp 3B (P38, P41) gav redan `Formation.sectorId` verkliga geografiska namn (Hue, Da Nang, An
Loc, Cu Chi, Plain of Jars, Ho Chi Minh Trail) — invändningen i §18 ("en karta mer detaljerad än
modellen är ett löfte spelet inte kan hålla") höll när modellen bara hade en positionsskalär; den
håller inte längre nu när modellen redan namnger sex platser. §21:s övriga punkter (hexkarta som
TAKTISKT LAGER, realtid, sex samtidiga fronter, m.fl.) kvarstår oreviderade — bara "ingen karta"
som anti-mönster stryks. Se ETAPP6_TEKNISK_SPEC.md. |
```

Samma DESIGN.md-konvention som 14 september-revideringen (bevara den gamla texten som citat, inte
tyst radering). §18 nya lydelse:

```markdown
Sektortavlan — en schematisk regiontavla (SVG-noder + linjer mellan namngivna sektorer, se
ETAPP6_TEKNISK_SPEC.md §4) i stället för en rent typografisk panellista. Fortfarande INTE en
geografiskt korrekt karta och INTE ett taktiskt lager — sektorernas inbördes placering är fast,
handgjord layoutdata, inte härledd geografi, och en sektor är fortfarande bara en grupperingsnyckel
för `Formation.sectorId`, aldrig en yta trupper rör sig fritt över.

> Omprövat av ägaren igen 2026-09-18 (se `docs/ANDRINGSLOGG.md`). Raden löd tidigare: "Ingen karta i
> etapp 1 — fronten visas som en linje med en position, vilket är allt simuleringen faktiskt
> modellerar. Att rita en karta som är mer detaljerad än modellen är ett löfte spelet inte kan
> hålla." Invändningen höll fram till etapp 3B; sedan `Formation.sectorId` fick verkliga
> platsnamn håller den inte längre.
```

§21 (Medvetet bortskuret): stryk raden "Hexkarta och taktiskt lager", ersätt med "**Taktiskt
lager** (enheter som rör sig fritt i realtid över en yta — se §18:s reviderade rad för vad som
ersatte det)" så att distinktionen mellan "sektortavla" (nu byggd) och "taktiskt lager" (fortsatt
bortskuret) inte suddas ut. Det är den distinktionen som gör att §21 fortsätter göra sitt jobb:
hindra att RIKTIG realtidstaktik smyger sig in via den nya tavlan.

---

## 1. Frågan etappen ska besvara

Läser THE SEVENTH FRONT som ett spel snarare än ett dokument efter att (a) en huvudmeny grindar
inträdet, (b) fronterna visas som en sektortavla i stället för en panellista, och (c) turövergången,
Stations-panelen och ett minimalt ljudlager är konsekventa med resten — utan att en enda rad i
`resolve/`, `balance.json` eller golden-snapshoten ändras?

## 2. Premisskontroll — vad som redan finns (verifierat mot commit `580cdcf`)

- **Ett enda scenario** (`indochina-slice`), hårdkodat som `SCENARIO_ID` i `useGame.ts` rad 33/115.
  Ingen scenarioväljare behövs i huvudmenyn — se §3.
- **`Formation.sectorId`** (types.ts rad 424) har redan verkliga platsnamn i scenariodata: fronten
  `front-1` (theatre `indochina`) har sektorerna `hue`, `da-nang`, `an-loc`, `cu-chi`; fronten
  `front-laos` (theatre `laos`) har `plain-of-jars`, `ho-chi-minh-trail`.
- **`Front.trace: number[]`** (types.ts rad 407, skrivs av `resolve/steps/fronts.ts` rad 98–99)
  finns redan — de senaste `FRONT_TRACE_LENGTH = 4` positionerna, äldst → nyast. Ingen ny
  kärnkod krävs för att visa frontlinjens rörelse över de senaste turerna.
- **`formationDisplay(state, formation)`** (`queries.ts` rad 104) finns redan och sköter redan
  skyddsräcke 3:s dimning (namn/styrka/materiel blir `null`/`'UNKNOWN FORMATION'` om huset saknar
  station i formationens land). Sektortavlan MÅSTE återanvända den här funktionen rakt av — aldrig
  läsa `Formation` direkt och rendera dess riktiga fält.
- **`MovementArrow.tsx`** finns, är testad, men har ingen producent (se ANDRINGSLOGG 15 sep). Den
  här etappen kopplar den INTE — se §4.5 för varför, uttryckligen avgränsat, inte glömt.
- **Sparning**: en enda flik, `SAVE_SLOT = 'default'` (`useGame.ts` rad 11). `persistence.ts`
  saknar i dag ett sätt att FRÅGA om en sparning finns utan att ladda den — se §3.
- **Noll bild- och ljudfiler** i repot, oförändrat sedan förra granskningen. §5.3 (ljud) är
  beroende av att filer skaffas separat — flaggat i §8.

---

## 3. Huvudmenyn (P65) — BYGGD 2026-09-18

Ny vy i unionen (`App.tsx` rad 15): `type View = 'menu' | 'wire' | 'floor' | 'house' | 'world'`.
`hydrated`-grenen (rad 73–79) ersätts: efter laddning visas `'menu'` som starttillstånd, inte
spelet direkt.

**`persistence.ts`**, nytt litet tillägg (ingen ändring av befintliga funktioner):

```ts
export async function hasSavedGame(slot: string): Promise<boolean> {
  const saved = await loadGame(slot) // redan exporterad, returnerar undefined om inget finns
  return saved !== undefined
}
```

**Ny komponent `components/MainMenu.tsx`:**

```tsx
export function MainMenu({
  houseName,
  hasSave,
  onContinue,
  onNewGame,
}: {
  houseName: string | null // null om inget sparat parti finns
  hasSave: boolean
  onContinue: () => void
  onNewGame: () => void // App.tsx visar en bekräftelsedialog själv om hasSave är true, INNAN denna anropas
}) { ... }
```

Visuellt: INTE ännu en `Panel`. En egen, full-bredd skärm som bryter panelmönstret medvetet — stor
displaytypografi (`--font-display`, redan definierad), samma mörka bas och telexgula radiella
ljusgradient som `body` redan har (`styles.css` rad 66–70) men skalad upp och centrerad som en
"omslagsbild" i stället för ett ljus över ett skrivbord. Ingen ny bildfil krävs för P65 — effekten
byggs av samma CSS-primitiv som redan finns, bara med andra mått. När riktiga bildtillgångar
skaffas (§8) är den här skärmen den naturliga första platsen att lägga in en bakgrundsbild, så
bygg den med en tom `.menu-backdrop`-yta avsedd för det redan nu.

**Klart när:** appen startar på `'menu'`, inte i spelet. "Fortsätt" är inaktiverad och `houseName`
är `null` om `hasSavedGame('default')` returnerar `false`. "Nytt parti" visar en bekräftelsedialog
("Det här skriver över ditt sparade parti") bara om `hasSave` är `true`. Ett nytt test
(`App.menu.test.tsx`) bevisar alla tre.

> **Klart.** Samtliga tre villkor uppfyllda. `hasSavedGame` byggd i `persistence.ts` — med en
> rättelse mot specens eget utkast: `loadGame` returnerar redan `SavedGame | null` (inte
> `undefined`), så implementationen jämför mot `null`, inte `undefined` — en ren premisskontroll
> mot den faktiska signaturen, ingen beteendeändring. `MainMenu.tsx` byggd exakt enligt det givna
> gränssnittet. **Ett litet, medvetet avsteg från prosans ansvarsfördelning:** bekräftelsedialogen
> ("App.tsx visar en bekräftelsedialog själv om hasSave är true") ligger i `MainMenu.tsx` själv,
> inte i `App.tsx` — samma `hasSave`-gren avgör redan "Continue"-knappens `disabled`, så att låta
> samma komponent äga båda undviker att grenen dupliceras i två filer. Beteendet är identiskt
> (dialogen visas innan `onNewGame` anropas); bara vilken fil JSX:en bor i skiljer sig. Motiverat
> även av testbarhet: jsdom saknar `indexedDB` helt (verifierat — `window.indexedDB` är
> `undefined`), så `hasSave=true`-grenen kan inte drivas genom en riktig `<App/>`-rendering i
> testmiljön; med logiken i `MainMenu` testas den grenen direkt mot komponenten med mockade props,
> utan att behöva `vi.mock` eller en `fake-indexeddb`-import (ingen sådan fanns i repot sedan
> tidigare). `SAVE_SLOT` flyttad från `useGame.ts` till `game.ts` och exporterad — `App.tsx`s
> `hasSavedGame`-koll och `useGame.ts`s egen `loadGame`/`saveGame` måste peka på exakt samma flik,
> inte två separata kopior av samma sträng. Två befintliga e2e-test (`persist-mid-turn.spec.ts`,
> `play-20-turns.spec.ts`) uppdaterade för att klicka igenom menyn vid varje spelstart/omladdning
> — en förväntad, genuin konsekvens av att menyn nu grindar VARJE sidladdning, inte en bugg i
> P65:s egen kod. Nya `App.menu.test.tsx` (7 tester): tre mot ett riktigt `<App/>`-render (startar
> på menyn; Continue inaktiverad/houseName utan sträng "Continue as" när inget sparat parti finns
> — jsdoms `indexedDB`-lucka faller tillbaka på exakt samma "otillgängligt"-gren som privat läge,
> verifierat att det INTE krascher; New Game går rakt in i spelet utan dialog när inget är sparat)
> och fyra mot `MainMenu` direkt (Continue aktiverad + husnamn när `hasSave` är `true`;
> bekräftelsedialogen visas och `onNewGame` anropas först vid bekräftelse; Avbryt stänger dialogen
> utan att anropa `onNewGame`; ingen krasch med `houseName=null`). Manuellt verifierat i en riktig
> Chromium-körning (skärmdumpar, `npm run dev`): menyn, den inaktiverade Continue-knappen, den
> ifyllda subtiteln efter en sparning, och bekräftelsedialogen ser alla ut som avsett. Golden
> ORÖRD — ingen kod i `packages/core` rörd. Fullt testsvep grönt (484 tester rotnivå, lint,
> typecheck, build×3, e2e — båda de uppdaterade e2e-testerna).

---

## 4. Sektortavlan (P66–P69)

### 4.1 Omfattning

En **schematisk regiontavla**: sektorer ritade som noder/regioner i ett fast, handgjort
tvådimensionellt layoutschema, förbundna med linjer efter enkel grannskapsdata. **Inte** en
geografiskt korrekt karta, **inte** en hexkarta, **inte** ett ytligt lager enheter rör sig fritt
över. Samma abstraktionsnivå som `front.position` redan har — bara ritad i två dimensioner över
sex namngivna punkter i stället för en linje.

### 4.2 Ny layoutdata — i `packages/app`, INTE `packages/core`

Ren presentationsdata (godtyckliga skärmkoordinater), hör hemma i appen, inte i den
UI-okunniga kärnan (CLAUDE.md hård regel 1). Ny fil `packages/app/src/sectorLayout.ts`:

```ts
export interface SectorLayoutEntry {
  sectorId: string
  label: string // t.ex. "HUE" — visningsnamn, versaler, samma register som resten av UI:t
  x: number // 0–100, procent av tavlans bredd
  y: number // 0–100, procent av tavlans höjd
  neighbours: string[] // andra sectorId i SAMMA theatre — ritar en linje mellan noder
}

export const SECTOR_LAYOUTS: Record<string, SectorLayoutEntry[]> = {
  indochina: [
    { sectorId: 'hue', label: 'HUE', x: 70, y: 15, neighbours: ['da-nang'] },
    { sectorId: 'da-nang', label: 'DA NANG', x: 65, y: 40, neighbours: ['hue', 'an-loc'] },
    { sectorId: 'an-loc', label: 'AN LOC', x: 45, y: 65, neighbours: ['da-nang', 'cu-chi'] },
    { sectorId: 'cu-chi', label: 'CU CHI', x: 40, y: 85, neighbours: ['an-loc'] },
  ],
  laos: [
    { sectorId: 'plain-of-jars', label: 'PLAIN OF JARS', x: 30, y: 30, neighbours: ['ho-chi-minh-trail'] },
    { sectorId: 'ho-chi-minh-trail', label: 'HO CHI MINH TRAIL', x: 50, y: 70, neighbours: ['plain-of-jars'] },
  ],
}
```

Koordinaterna är en grov, stiliserad ungefärlighet av den verkliga geografin (Hue i norr, Cu Chi i
söder) — tillräckligt för igenkänning, uttryckligen inte en exakt kartprojektion. Eftersom bara ett
scenario finns i dag är en hårdkodad tabell rätt avvägning; **känd begränsning** om fler scenarion
tillkommer, se §8.

### 4.3 En ny härledningsfunktion — enda ändringen i `packages/core`

`queries.ts`, samma mönster och samma fil som `formationDisplay`/`bidEstimate`:

```ts
export interface SectorControl {
  sectorId: string
  side: 'a' | 'b' | 'contested' | 'empty'
  formations: FormationDisplay[] // återanvänder formationDisplay rakt av — skyddsräcke 3 ärvs gratis
}

export function deriveSectorControl(state: GameState, front: Front): SectorControl[] {
  // Grupperar front.formations på sectorId (samma logik som TheWorld.tsx:s groupBySector i dag,
  // FLYTTAD hit så att komponenten blir en ren presentation av redan härledd data — se skyddsräcke
  // i §6). side avgörs av vilken sidas SUMMA av strength (känd eller ej) är störst i sektorn;
  // 'empty' om inga formationer finns där, 'contested' vid (praktiskt taget) paritet.
}
```

Ingen ny slumpkälla, ingen ny balansdata, inget nytt fält på `GameState` — ren omgruppering av
data som redan finns, flyttad från UI-lagret (`TheWorld.tsx`) till `queries.ts` för att harnesset
i framtiden kan återanvända samma logik om det någonsin behöver den (samma motiv som redan styr
varför `DISPLAY_THRESHOLDS`/`BOT_BALANCE` bor där).

### 4.4 Ny komponent `SectorBoard.tsx`

SVG (inte `<canvas>` — SVG ger crisp text/linjer utan egen ritloop, och är trivialt att styla med
samma CSS-variabler som resten av appen). Per front: en `<svg>` som ritar

- en linje mellan varje `neighbours`-par ur `SECTOR_LAYOUTS[theatreId]` (den fasta "vägkartan")
- en cirkel/nod per sektor, färgad efter `deriveSectorControl`s `side` (`--west`/`--east`/grå för
  `'contested'`/`'empty'` — samma variabler `align-track` redan använder, se `styles.css` rad
  460-ish)
- en frontlinje-indikator: `front.position` (och de tre föregående värdena i `front.trace`,
  tonade svagare) interpolerat linjärt över sektorernas `x`/`y` i den ordning de listas för
  theatern — en ren visualisering av samma skalär `TheWorld.tsx` redan ritar som en 1D-markör
  (rad 110–113), bara projicerad på tavlans två dimensioner i stället för en rak linje
- ett klick/tryck på en nod öppnar (expanderar) den sektorns formationslista under tavlan —
  samma `formation-row`-rader som redan finns (rad 144–150 i dagens `TheWorld.tsx`), bara
  gömda tills en sektor väljs i stället för alltid synliga. Det är den **första riktiga
  interaktionen** i vyn som inte är ett formulär — spelaren utforskar tavlan i stället för att
  läsa en lista uppifrån och ner.

`TheWorld.tsx`s befintliga "Fronts"-panel (rad 86–158) ersätts av `<SectorBoard front={front}
state={state} />` per front. `frontline`/`frontline-marker`-CSS:en (rad 942–969) kan återanvändas
som fallback/referens för färgtoner, inte tas bort — ingen annan vy använder den, men den kostar
inget att låta ligga.

### 4.5 MovementArrow — uttryckligen INTE kopplad i den här etappen

`ANDRINGSLOGG.md` (15 sep) flaggade redan att `REDEPLOY` saknar en producent i simuleringen helt
och hållet, och att `SUPPLY_ARRIVAL` skulle kräva att `WireEvent.delta` bär
leverans-per-förband-attribution — en ändring av det hashade sluttillståndet golden-testet fryser,
som ägaren redan en gång avstod från att göra. Den här etappen river "ingen karta"-pelaren, men
river INTE det separata, tidigare beslutet om `WireEvent`. Sektortavlan är därför ett **korrekt,
fullständigt ögonblicksbild-uppdaterat-varje-tur** läge — den lever tur till tur, inte animerat
inom en tur. Riktiga rörelsepilar (`MovementArrow` kopplad till verklig data) kräver ett eget,
framtida ägarbeslut om att röra kärnan och en golden-snapshot-omfrysning. Om du vill ta det steget
också: säg till, det blir en egen liten spec (en enda ny mekanik: vad får ett förband att byta
`sectorId`?), inte en del av P65–P69.

### 4.6 Klart när (P66–P69, en prompt per punkt)

**P66** — `deriveSectorControl` + `SECTOR_LAYOUTS` + `SectorBoard.tsx` byggd, ersätter
`TheWorld.tsx`s Fronts-panel för `front-1`/`indochina`. Test: `queries.deriveSectorControl.test.ts`
(gruppering, `side`-beräkning, `'empty'`/`'contested'`-fallen), `SectorBoard.test.tsx` (jsdom-render,
en nod per sektor, ingen förbandsdata synlig innan sektorn klickats).

> **Klart 2026-09-18.** Samtliga klart-när-villkor uppfyllda. `deriveSectorControl` (`queries.ts`)
> grupperar `front.formations` på `sectorId` (samma logik som den gamla `groupBySector`, flyttad
> hit). `side` avgörs av sida A:s andel av total styrka i sektorn mot EXAKT samma tröskelpar
> `formationDisplay` redan definierar (`formationStrengthBandLowPct`/`-HighPct`, 33/66) — inget
> nytt balanstal, samma "återanvänd en befintlig, konceptuellt likartad tröskel"-princip som P62:s
> DOOMSDAY-gräns. `'empty'` läst som "sammanlagd styrka noll" (täcker både tomma sektorer och
> sektorer där allt slagits ut), beräknat på RIKTIG `Formation.strength` — inte det
> `formationDisplay`-dimmade värdet, eftersom kontrollstatus är grov/synlig oavsett
> underrättelsedjup (samma princip som `front.position` alltid varit synlig utan station).
> `SectorControl` (nytt, i `types.ts` — inte inline i `queries.ts` som specens illustrativa
> snippet visade, för att matcha den etablerade konventionen `FormationDisplay`/`OfficialDisplay`
> redan följer). `SECTOR_LAYOUTS` (`sectorLayout.ts`, ny fil i `packages/app`) fylld bara för
> `indochina` — `laos` är uttryckligen P67:s eget tillägg, inte en del av den här prompten.
> `SectorBoard.tsx` (ny komponent) — ett litet, dokumenterat avsteg från §4.4:s bokstav: eftersom
> `TheWorld.tsx`s "Fronts-panel (rad 86–158)" faktiskt var HELA per-front-kortet (sidhuvud,
> moral/styrka-mätare, den gamla 1D-frontlinjen, förbandslistan), inte bara visualiseringen,
> äger `SectorBoard` nu HELA kortet för en theatre med layoutdata — sidhuvud och mätare
> oförändrade, bara den gamla 1D-stapeln och textlistan bytt mot SVG-tavlan. Frontlinje-
> indikatorn (§4.4 punkt 3) byggs INTE här — uttryckligen P68:s egen prompt, en medveten,
> tillfällig lucka för `front-1` mellan P66 och P68 (den gamla 1D-stapeln försvinner, den nya
> 2D-markören finns inte än), inte glömd. Klick-för-att-expandera byggd med en enda
> `expandedSectorId: string | null`-state (i stället för en toggle-mängd) — enklaste rimliga
> datastruktur för "vilken sektor är öppen", som redan-av-sig-själv ger P69:s "en sektor åt
> gången"-egenskap; P69 blir därmed sin egen, dedikerade verifiering snarare än en kodändring,
> samma "verifierad, ingen kod krävdes"-mönster som P53c/P61/P62. Skyddsräcke 4 byggd åt BÅDA
> hållen: en hel theatre utan layoutdata (`front-laos`, till P67) faller tillbaka på den gamla
> textlistan; en enskild sektor `deriveSectorControl` känner till men `SECTOR_LAYOUTS` saknar
> (ett nytt scenario, inte uppdaterad layoutdata) renderas som en fallback-rad, aldrig en krasch
> — testat med en teknicerad "spökformation" i en okänd sektor. Fyra befintliga tester
> uppdaterade (`TheWorld.formations.test.tsx`s två P41-fall klickar nu igenom rätt sektornod i
> stället för att läsa `container.textContent` direkt, eftersom förbandsdata nu är gömd tills
> klick). Ett latent, tidigare osynligt race upptäckt och fixat i samma svep: `play-20-turns.
> spec.ts`s `startFreshGame` raderade IndexedDB samtidigt som appens egen hydrering (nu även
> huvudmenyns `hasSavedGame`-koll, P65) asynkront kunde återskapa databasen EFTER raderingen —
> osynligt innan P65:s meny gav ett `hasSave`-beroende steg att avslöja det på. Fixat genom att
> vänta in att menyn faktiskt hydrerats INNAN radering, aldrig radera medan appen fortfarande
> öppnar sin egen anslutning. Manuellt verifierat i en riktig Chromium-körning (skärmdumpar):
> fyra noder, korrekt färgning, klick-för-att-expandera, Laos-fallbacken. Golden ORÖRD — ingen
> `resolve/`, ingen `balance.json`. Fullt testsvep grönt (498 tester rotnivå, lint, typecheck,
> build×3, e2e körd tre gånger i rad för att verifiera racet var löst). Se `docs/ANDRINGSLOGG.md`.

**P67** — samma för `front-laos`/`laos` (bevisar att layouten och komponenten generaliserar över
fler än en theatre utan hårdkodning av frontantal).

**P68** — frontlinje-interpolationen (§4.4, punkt 3) med `front.trace`-tondämpning. Test: en känd
`trace`-sekvens ger en känd, avrundningsbar SVG-koordinat (ingen pixel-för-pixel-snapshot — en
toleransbaserad assertion, samma stil som andra numeriska tester i repot).

**P69** — klick-för-att-expandera-sektor (§4.4, punkt 4). Test: `formation-row` är frånvarande i
DOM innan klick, närvarande efter, försvinner vid klick på en annan sektor (en expanderad sektor
åt gången — håller tavlan kompakt).

---

## 5. Övriga tillägg för spelkänsla (P70–P72)

Från `UI_GRANSKNING_OCH_SKARMSPEC.md` §5.2–5.4, konsoliderat hit som en del av samma etapp
eftersom de nu byggs tillsammans med menyn och tavlan i stället för separat:

**P70 — Turövergången dramatiseras.** `handleEndTurn()` (App.tsx rad 92–95) byter i dag vy direkt.
Ny sekvens: `WireEvent`-listan (redan orsakskedjad via `causeId`) avslöjas en händelse i taget med
kort fördröjning, avstängd vid `prefers-reduced-motion` (samma respekt som redan finns i
`styles.css`-kommentaren). Klart när: ett test bevisar att alla händelser renderas synkront när
`prefers-reduced-motion: reduce` är satt, och sekventiellt annars.

**P71 — Stations blir kort.** `TheWorld.tsx`s Stations-`<table>` (rad 204–244) byggs om till samma
kort-mönster `Factions`-panelen redan använder (rad 160–202). Ren konsekvens, ingen ny data. Klart
när: ingen `<table>` kvar i `TheWorld.tsx`, ett snapshot-test uppdaterat.

**P72 — Ljudlager.** Web Audio-baserade korta effekter (turavslut, doomsday-tröskelpassage,
knapptryck), en global mute-toggle sparad i `persistence.ts` och synlig i huvudmenyn (§3).
**Förutsätter att ljudfiler skaffats** (CC0-källor, se §8) — bygg den tysta infrastrukturen
(mute-toggle, uppspelningskrokar) även om filerna saknas vid körtillfället; koppla in de faktiska
ljuden så fort de finns, utan att behöva röra koden igen.

---

## 6. Skyddsräcken

1. **Skyddsräcke 3 ärvs, aldrig kringgås.** `SectorBoard`/`deriveSectorControl` läser ALDRIG
   `Formation` direkt — bara `FormationDisplay` via `formationDisplay()`. En sektor med bara
   okända formationer visar `'UNKNOWN FORMATION'`-rader, aldrig riktiga namn/styrkor, exakt som
   dagens lista.
2. **`resolve/`, `balance.json`, golden-snapshoten: oförändrade** i P65–P72. `deriveSectorControl`
   (§4.3) är den enda nya koden i `packages/core`, och den är en ren omgruppering av redan
   existerande, redan lästa fält — ingen ny slumpkälla, inget nytt state-fält.
3. **`prefers-reduced-motion` respekteras** av allt nytt (menyns ev. övergångar, P70:s
   händelsesekvens) — samma standard som redan gäller.
4. **Sektortavlans layout är data, inte kod.** Ett nytt scenario med nya `sectorId` kräver en ny
   post i `SECTOR_LAYOUTS` (§4.2) — flaggat som känd begränsning, inte en dold krasch: om en
   sektor saknar layoutdata, rendera den i en enkel fallback-rad (samma stil som dagens lista)
   i stället för att kasta.

## 7. Vad som avsiktligt inte finns i etapp 6

- Äkta animerade förbandsrörelser — `MovementArrow` förblir byggd men oansluten (§4.5), kräver ett
  eget framtida beslut som rör kärnan.
- Stöd för fler scenarier eller en generisk kart-editor — `SECTOR_LAYOUTS` är hårdkodad för det
  enda scenario som finns.
- Grafiska bild- och ljudtillgångar själva (bara krokarna för dem, §3 och P72) — en egen,
  avgränsad uppgift när du vill ta den: en tillgångslista och färdiga AI-bildprompter, eller tips
  om gratis CC0-paket.
- Resten av `DESIGN.md` §21 — hexkarta **som taktiskt realtidslager**, realtid, sex samtidiga
  fronter, m.fl. — kvarstår bortskuret. Den här etappen river uttryckligen bara raden om att
  fronten inte får någon rumslig representation alls.

## 8. Nästa steg när du vill fortsätta

När du vill ta det sista, återstående steget (riktiga tillgångar), säg bara till — det blir en
egen, kort leverans (tillgångslista + AI-bildprompter eller CC0-tips), inte en del av den här
promptsekvensen, exakt som du valde i förra rundan.
