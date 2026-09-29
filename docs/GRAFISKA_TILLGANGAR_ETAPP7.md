# Porträtt och händelsebilder — tillgångslista och AI-bildprompter (etapp 7, P92)

**THE SEVENTH FRONT** · P92 (`ETAPP7_TEKNISK_SPEC.md` §10/§13) · skriven 2026-09-29

Samma arbetsgång som `GRAFISKA_TILLGANGAR.md`: prompter i ett dokument, ägaren genererar,
en kodsession kopplar in. **P92 är bara dokumentet — ingen kod ändras och inga bilder finns
än.** Verifierat mot koden vid skrivandet: `packages/app` innehåller inget porträtt- eller
händelsebildsfält (sökt på `portrait`/`porträtt`), `ThePolitics.tsx` visar tjänstemän som ren
text, och `public/images/` har bara de tre tillgångar etapp 6 kopplade in. Inkopplingen är en
egen, senare uppgift (se "Inkoppling" sist).

## Vad som behövs

| Grupp | Antal | Källa i koden |
|---|---|---|
| Tjänsteporträtt, startuppsättning | 12 | `packages/core/src/data/officials.json` (fyra per fraktion: `rvn`, `nlf`, `laos`) |
| Tjänsteporträtt, ersättare | 6 | `packages/core/src/data/successors.json` (två per fraktion, används av `replaceOfficial`, P62) |
| Händelsebilder | 10 | `ChronicleKind` (`types.ts`, 11 värden) och blixtmönstren i `newsClassification.ts` |

**Regler som gäller allt (`DESIGN.md` §15):** tjänstemännen är fiktiva, inga verkliga eller
identifierbara personer, inga verkliga statschefer. Inga bokstavliga nationsflaggor, riksvapen
eller partiemblem (spelet använder verkliga 1960-talsstater som fraktioner). Ingen text, inga
bokstäver och inga vattenstämplar i bilden — all text ritas av appen.

## Låst stilprompt (klistra in först i VARJE porträttprompt, ändra aldrig)

Målet är att alla arton porträtt ska se ut att komma från samma fotograf och samma akt.
Registret är etapp 7:s, "det fysiska krigsrummet 1965" (`ETAPP7_TEKNISK_SPEC.md` §10), inte
etapp 6:s mörka telexgula. Färgerna kommer ur `styles.css` `:root`.

> STYLE LOCK — Black-and-white identity-file photograph from 1964, as clipped into a manila
> dossier: a formal head-and-shoulders portrait, subject facing the camera, neutral expression,
> plain pale backdrop, flat frontal studio flash, shallow grain, slightly soft focus, visible
> paper-photo texture with faint silver-gelatin fade. Shot on a large-format press camera.
> Tonal range only from warm grey to near-black; no colour. Centred composition with the eyes
> in the upper third and generous headroom. Period-correct 1960s clothing and hairstyle for a
> Southeast Asian civil servant or officer. No text, no lettering, no badges with readable
> writing, no flags, no national emblems, no watermark, no border. Square 1:1, 768×768.

**Efter generering:** färgbilden konverteras inte i appen — be modellen om gråskala redan i
prompten, och kassera en bild som kommer i färg. Appen lägger själv på en sepiatoning och en
ockrafärgad kant (se "Inkoppling"), så bilden ska vara neutral.

## 1. Tjänsteporträtt — startuppsättning (12)

Varje prompt är `STYLE LOCK` plus radens personbeskrivning. **Personbeskrivningen bygger på
`post`/`agenda`/`integrity` i `officials.json`, inte på namnet** — namnet är fiktivt och ska
inte påverka utseendet. Ålder och uttryck ger spelaren en läsbar ledtråd utan att avslöja
dolda tal (`integrity` och `agenda` är underrättelsegrindade i `officialDisplay`, `queries.ts`);
uttrycket får därför vara neutralt, aldrig "korrupt" eller "ärlig".

| Fil | Namn | Post | Personbeskrivning att lägga efter STYLE LOCK |
|---|---|---|---|
| `official-rvn-procurement.jpg` | Do Van Khanh | procurement | Man i femtioårsåldern, kortklippt hår, mörk kostymjacka med vit skjorta, smal slips |
| `official-rvn-defence.jpg` | Bui Quang Minh | defence | Man i fyrtioårsåldern, uniformskrage utan synliga märken, kepsen borttagen, ordnad blick |
| `official-rvn-finance.jpg` | Tran Thi Lan | finance | Kvinna i femtioårsåldern, hår uppsatt, ljus blus med hög krage, glasögon i tunn båge |
| `official-rvn-interior.jpg` | Vo Dinh Phuc | interior | Man i sextioårsåldern, tunt grånande hår, mörk jacka, något fylligare ansikte |
| `official-nlf-procurement.jpg` | Duong Thi Hoa | procurement | Kvinna i fyrtioårsåldern, hår i nacken, enkel mörk skjorta med hög krage |
| `official-nlf-defence.jpg` | Trinh Van Sang | defence | Man i femtioårsåldern, enkel funktionärsskjorta, kortklippt hår, allvarlig men neutral min |
| `official-nlf-finance.jpg` | Ngo Thi Kim | finance | Kvinna i sextioårsåldern, hår i knut, enkel ljus jacka, glasögon |
| `official-nlf-interior.jpg` | Dang Van Chau | interior | Man i trettiofemårsåldern, ung för sin post, enkel skjorta, öppen blick |
| `official-laos-procurement.jpg` | Khamsing Vongsavath | procurement | Man i femtioårsåldern, ljus kostymjacka, kortklippt hår |
| `official-laos-defence.jpg` | Bounthanh Sisavath | defence | Man i fyrtioårsåldern, uniformsjacka utan synliga märken, kepsen borttagen |
| `official-laos-finance.jpg` | Somchai Phommachan | finance | Man i femtioårsåldern, rund ansiktsform, ljus skjorta, slips, tunna glasögon |
| `official-laos-interior.jpg` | Vilayvanh Keomany | interior | Man i fyrtioårsåldern, mörk jacka, prydligt mittbenat hår |

## 2. Tjänsteporträtt — ersättare (6)

Ersättare installeras av `replaceOfficial` efter `ASSASSINATE` (P62) och nollställer
`relationToPlayer`. De hämtas i ordning ur `successors.json` per fraktion. Samma `STYLE LOCK`.
En ersättare tar den avlidnes post, så porträttet hör till **fraktion + ersättarnummer**, inte
till en post.

| Fil | Namn | Personbeskrivning |
|---|---|---|
| `successor-rvn-1.jpg` | Nguyen Van Thanh | Man i fyrtioårsåldern, kortklippt hår, mörk jacka, något lättare i uttrycket än de etablerade |
| `successor-rvn-2.jpg` | Le Thi Huong | Kvinna i fyrtioårsåldern, hår i nacken, ljus blus |
| `successor-nlf-1.jpg` | Pham Van Duc | Man i trettiofemårsåldern, enkel skjorta, kortklippt hår |
| `successor-nlf-2.jpg` | Tran Thi Nga | Kvinna i trettiofemårsåldern, hår i fläta över axeln, enkel mörk skjorta |
| `successor-laos-1.jpg` | Somsavat Keovilay | Man i femtioårsåldern, ljus kostymjacka, spänd nacke, neutral min |
| `successor-laos-2.jpg` | Bounmy Sirivong | Man i fyrtioårsåldern, mörk jacka, mittbenat hår |

## Låst stilprompt för händelsebilder (klistra in först i varje händelseprompt)

Händelsebilderna är **inte** porträtt och ska inte se ut som foton av verkliga händelser:
de är stiliserade *dokumentära föremål*, som en bild klippt ur ett dossier eller en
telexrapport. Inga människor i bild (ingen identifiering, inga ansikten att missförstå), inga
fotorealistiska vapen i närbild, inget våld visat. Tonen är le Carré, inte actionfilm.

> EVENT STYLE LOCK — A flat archival illustration of an object or scene detail, printed as a
> halftone plate on aged off-white paper, as clipped into a 1960s intelligence dossier. Limited
> palette: warm black ink, pale cream paper, and only two accents — a muted grease-pencil red
> (#b3302a) and a muted grease-pencil blue (#2d5a8c), used sparingly. Visible halftone dots
> and slight misregistration. Composition centred with generous empty margin, one clear
> subject, no people, no faces, no readable text or lettering, no flags, no national emblems,
> no logos, no watermark. Calm, documentary, slightly ominous — never gory, never heroic.
> 16:10 landscape, 1280×800.

## 3. Händelsebilder (10)

Tio återkommande händelsetyper. Valet följer de mest visade rubrikerna: `ChronicleKind`
(`coup`, `incident`, `assassination`, `leak`, `sabotage`, `crisis`, `exposure`, `bankruptcy`,
`restricted_delivery`, `contract`, `ceasefire`) och blixtmönstren i `newsClassification.ts`.
`ceasefire` och `contract` delar bild med sina motsatser i tabellen nedan för att hålla
antalet på tio; **`WAR RESUMES` och `REDEPLOYS` saknar egen bild** och återanvänder
`front-line-shift`. Om ägaren vill ha fler är det ett tillägg, inget krav.

| Fil | Händelsetyp | Motiv att lägga efter EVENT STYLE LOCK |
|---|---|---|
| `event-coup.jpg` | `coup` (lyckad/misslyckad) | A government building's heavy double doors, one door ajar, a single chair overturned on the steps, empty street |
| `event-incident.jpg` | `incident` | A blank telegram form on a desk beside a black rotary telephone with its receiver off the hook |
| `event-assassination.jpg` | `assassination` | A single empty office chair behind a large desk, a closed dossier on the desk, one lamp, no person |
| `event-leak.jpg` | `leak` | A torn-open manila envelope with loose blank typewritten sheets fanned across a wooden table |
| `event-sabotage.jpg` | `sabotage` | A close view of a factory floor lathe stopped mid-cut, a wrench lying on the bed beside it, no worker |
| `event-crisis.jpg` | `crisis` / `CRISIS WATCH` | A red desk telephone (grease-pencil red) on a bare table, the only saturated object in the frame |
| `event-exposure.jpg` | `exposure` / `EXPOSED` | A warehouse crate half-open under a hanging bulb, its lid stencil unreadable, packing straw spilling out |
| `event-bankruptcy.jpg` | `bankruptcy` / `LIQUIDATED` | A padlocked shutter on a trading-house door with a paper notice pinned to it, the notice blank |
| `event-restricted-delivery.jpg` | `restricted_delivery` / `contract` | Wooden crates stacked on a dockside pallet beside a crane hook, harbour haze behind, no people or vessels' names |
| `event-front-line-shift.jpg` | `ceasefire` / `WAR RESUMES` / `BREAKTHROUGH` / `REDEPLOYS` | A paper map on a table with a single grease-pencil line drawn across it and a few blue and red pins, no readable place names |

**Om ett motiv avvisas eller blir för detaljerikt:** be modellen förenkla ("one object, empty
background, no people") eller byt föremål inom samma idé. Kassera en bild som visar en
identifierbar person, en läsbar text eller en bokstavlig flagga.

## Tekniska krav på leveransen

- Porträtt: JPG, 768×768 (visas som 96–160 px, max 4× för skärpa), **under 60 KB styck**.
- Händelsebilder: JPG eller WebP, 1280×800, **under 120 KB styck**.
- Total mängd: 18 × 60 + 10 × 120 ≈ 2,3 MB värsta fall. Appen är en offline-PWA och
  service workern (`public/sw.js`) cachar varje bild när den första gången hämtas, så bilderna
  ska **laddas lat** (bara när en tjänsteman/händelse faktiskt visas), aldrig förhandsladdas —
  §12 punkt 5:s krav på första inläsning under 3 s på 4G gäller.
- Filerna läggs i `packages/app/public/images/officials/` respektive
  `packages/app/public/images/events/`. Filnamnen ovan är kontraktet; ändras ett namn måste
  inkopplingens uppslagstabell ändras med det.

## Inkoppling (egen, senare uppgift — inte gjord i P92)

Byggs när ägaren har levererat bilderna. Rekommenderad omfattning, för att inte gissa den nu:

1. En ren uppslagsfunktion `officialPortrait(factionId, post | successorIndex)` i
   `packages/app`, testad så att **varje tjänsteman i `officials.json` och varje namn i
   `successors.json` har en fil** — samma mönster som `handbook.test.ts` (P91b), så att en ny
   tjänsteman utan porträtt underkänns av ett test i stället för att glömmas.
2. `ThePolitics.tsx`: porträttet visas för en tjänsteman i samma ram som mappen (regel 8), med
   en ockrafärgad kant och sepiatoning i CSS. En saknad eller trasig bild faller tillbaka på en
   tom ram med initialerna — aldrig ett trasigt bildikon.
3. Händelsebilder: i NEWS DESK-rubrikkortet (`TheWire.tsx` hero, P80) och kriskortet
   (`CrisisModal`, P87), via `ChronicleKind`/`isFlashEvent`. En händelse utan bild visas som
   i dag.
4. Regel 18/11-testet (`e2e/text-overflow.spec.ts`) får en skärm som visar ett porträtt, och
   `npm run shots` utökas i samma commit.
5. `public/sw.js` behöver ingen ändring: den cachar redan varje samma-ursprungs-GET först när
   den hämtas (nätverk först, cache som reserv offline), alltså lat. Verifiera bara att
   bilderna hämtas först när de visas, inte förhandsladdas i koden.

## Status

**2026-09-29: promptdokumentet klart, inga bilder genererade.** Väntar på ägaren. Ingen
kodändring i P92.
