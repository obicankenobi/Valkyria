# THE SEVENTH FRONT

Turbaserad kallakrigssimulator om ett privat vapenhus 1947–1991. Byggd som PWA med en deterministisk,
headless kärna och ett gränssnitt som ett krigsrum från 1965: en geografisk karta med förband, mappar,
registerkort och telexpapper. Du säljer, läcker, embargerar, mutar och iscensätter. Du befaller aldrig en
enda soldat.

## Kom igång

```
npm ci                 # installerar alla workspaces
npm run build          # core → harness → app (i den ordningen; kärnan måste byggas först)
npm test               # vitest, alla paket (ca 2 400 tester)
npm run lint
npm run typecheck
npm run test:e2e       # Playwright mot en Vite-devserver på port 4174 (ca 400 tester, ca 12 min)
npm run shots          # skärmdumpar av varje skärm (1440×900) till docs/ui/current/
npm run harness -- --runs 100 --policy human,balanced    # botpartier och mätkolumner
```

## Paket

| Paket | Innehåll |
|---|---|
| `packages/core` | Ren, headless simulering: `resolveTurn(state, submission)`, arton-stegs-pipeline (`resolve/index.ts`), `balance.json`, scenario- och speldata, `queries.ts`. Inga DOM-beroenden, all slump via `createRng`. |
| `packages/harness` | Botpolicyer (`passive`, `aggressive`, `balanced`, `capacity`, `human` med många varianter), `runGame` och mätkolumner. Mäter balans; skriver aldrig tillbaka till kärnan. |
| `packages/app` | React/Vite-gränssnittet (karta, mappar, handbok, handledning, ljud), Playwright-tester och skärmdumpsskript. |

## Dokument

Läs `docs/DESIGN.md` först, sedan `CLAUDE.md` (operativ: vad som är förbjudet och projektets status), sedan specen
för den etapp du ska arbeta i. Varje etapp har en spec eller ett förslag; allt som ändras mot specen loggas i
`docs/ANDRINGSLOGG.md`.

| Fil | Vad den är | Status |
|---|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designdokument v2.1 — vad spelet är, pelarna, vad som är medvetet bortskuret | Levande (UI-avsnittet uppdaterat 2026-10-16) |
| [`CLAUDE.md`](CLAUDE.md) | Hårda regler, gränssnittsregler och löpande status för kodsessioner | Levande |
| [`docs/ANDRINGSLOGG.md`](docs/ANDRINGSLOGG.md) | En rad per ändring och ägarbeslut | Levande |
| `docs/ETAPP1_TEKNISK_SPEC.md` … `ETAPP6_TEKNISK_SPEC.md` | Etapp 1–6: den första skivan, motståndet, kriget som marknad, två krig, näst mäktigast, kartan och menyn | Klara, historik |
| [`docs/ETAPP7_TEKNISK_SPEC.md`](docs/ETAPP7_TEKNISK_SPEC.md) | Etapp 7, spelbordet (P73–P95): kartan, mappar, handbok, ljud | Byggd; speltestet P95 ersatt av det gemensamma speltestet |
| `docs/ETAPP8_FORSLAG.md`, `ETAPP9_FORSLAG.md` | Etapp 8 (kassaboken, förskott, stående order) och 9 (ritbordet, konstruktion, kapplöpning, upphandling) | Byggda |
| [`docs/ETAPP10_FORSLAG.md`](docs/ETAPP10_FORSLAG.md) | Etapp 10, världen svarar: 10A (slipningen) är körd t.o.m. P149 och P187–P191, 10B (P150–P161: historiska beslut, rivaler som motspelare) väntar | **Aktiv** |
| [`docs/ETAPP11_FORSLAG.md`](docs/ETAPP11_FORSLAG.md) | Etapp 11, verken (anläggningar, kapacitet, arbetsstyrka, lager, utlandsverk) | Byggd (P168–P191); utfall i §9b |
| [`docs/ETAPP12_FORSLAG.md`](docs/ETAPP12_FORSLAG.md) | Etapp 12, krigsrummet (PC-widescreen, skrivbord, levande karta; Gemini + Claude Code) | Antagen 2026-10-16; P192 körd (regler och testrigg), P193–P198 väntar på Geminis moduler G1–G5 |
| [`docs/SPELTEST_ETAPP10A.md`](docs/SPELTEST_ETAPP10A.md), [`SPELTEST_ETAPP11.md`](docs/SPELTEST_ETAPP11.md) | Checklistor för ägarens gemensamma speltest (P148 + P184) | **Nästa steg** |
| `docs/SPELTEST_ETAPP9.md`, `SPELTEST_SAMLAT.md` | Äldre speltestunderlag | Ersatta av ovan |
| `docs/RAPPORT1…4_*.md`, `docs/BALANS*.md` | Externa granskningar och balansmätningar | Referens |
| `docs/GRAFISKA_TILLGANGAR*.md`, `docs/LJUDTILLGANGAR.md` | Bild- och ljudtillgångar, promptar och status | Referens |
| `docs/ui/reference/`, `docs/ui/current/` | Godkända referensskisser och senaste skärmdumpar (`npm run shots`) | Referens / genereras |

## Läget just nu

Etapp 1–11 är byggda. Scenariot `INDOCHINA_SLICE` är 20 turer (kvartal) med två fronter (Sydvietnam och Laos), tre
köpare (RVN, NLF, Laos), rivalhus och ett eget femårsmål med styrelsegranskningar. Hela produktionssystemet
(anläggningar på en tomt, byggen, linjer, kapacitet, arbetsstyrka, underleverantörer, lager, utlandsverk),
konstruktion och forskning, kapplöpningen mellan blocken, upphandlingar med fusk och pappersspår, historiska
förstasidor och telex samt förskott och huvudbok finns i spelet. Balansen mäts med botpolicyn `human`
(ca 64 % vinst i 100 partier) och hålls av två vakter: ingen bot över 90 % vinst och `capacity` som fast referens.

**Nästa steg är ägarens gemensamma speltest** (`docs/SPELTEST_ETAPP10A.md`), därefter etapp 10B från P150. Etapp 12
(`docs/ETAPP12_FORSLAG.md`) är antagen och P192 körd: skrivbordsformatet 1440×900 är nu enda testade format (telefonen på is).

## Språkkonvention

All prosa i dokumenten är på svenska. **All kod, alla identifierare, alla UI-strängar och all
speldata är på engelska** och ska användas ordagrant som de står i specen.

## Deploy

`packages/app` (Vite + React) deployas till Vercel, kopplat direkt mot GitHub-repot — varje push
till produktionsgrenen bygger och publicerar automatiskt, ingen manuell `npm run dev` krävs för
att öppna spelet i en webbläsare (dator eller mobil).

**`vercel.json`** (repo-roten) styr build-processen, nödvändigt eftersom det här är ett npm
workspaces-monorepo där `packages/app` beror på `packages/core` (`@seventh-front/core`, löst via
workspace-symlink) — Vercels Root Directory måste därför vara **repo-roten**, inte
`packages/app`, annars hittar `npm install` aldrig workspace-beroendet:

| Fält | Värde | Varför |
|---|---|---|
| `installCommand` | `npm ci` | Samma kommando som `.github/workflows/ci.yml`, installerar alla workspaces från `package-lock.json` |
| `buildCommand` | `npm run build` | Root-scriptet som redan bygger i rätt ordning: `core` → `harness` → `app` (se root `package.json`) — samma kommando CI redan kör och verifierar varje push |
| `outputDirectory` | `packages/app/dist` | `vite build`s utdata, relativt repo-roten |
| `framework` | `null` | Inaktiverar auto-detektion — build-processen är redan explicit ovan |

Ingen server-sida, ingen databas, inget klientsidesrouting (`react-router` eller motsvarande
finns inte i `packages/app`) — statiska filer, inga `rewrites` behövs.

Verifierat lokalt innan kopplingen sattes upp: `npm ci && npm run build` (exakt
`vercel.json`s kommandon) går igenom felfritt, och `packages/app/dist` serverad och öppnad i en
riktig webbläsare (Chromium) renderar utan konsolfel.

**Kopplingen är satt upp** (`vercel link`, Vercel-projekt `obicankenobi/valkyria`) och verifierad
skarpt: en push till `claude/funny-lamport-nvno9f` (repots faktiska default-/produktionsgren —
**ingen `main`-gren finns i det här repot**) triggade automatiskt en byggd och publicerad
produktionsdeploy via GitHub-webhooken, inget manuellt `vercel deploy` behövdes. Spelet nås på
**https://valkyria-rose.vercel.app**. Byter repots default-gren namn senare måste Vercels
Project Settings → Git → Production Branch uppdateras till den nya, annars slutar
auto-deployen matcha.
