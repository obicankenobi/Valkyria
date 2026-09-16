# THE SEVENTH FRONT

Turbaserad kallakrigssimulator om ett privat vapenhus 1947–1991. Textbaserad, byggd som PWA.
Du säljer, läcker, embargerar, mutar och iscensätter. Du befaller aldrig en enda soldat.

Repot innehåller i nuläget **bara planeringsdokument**. Ingen kod är skriven än.

## Dokument

| Fil | Vad den är | Status |
|---|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designdokument v2.1 — vad spelet är, vilka pelare det vilar på, vad som är medvetet bortskuret | Levande |
| [`docs/ETAPP1_TEKNISK_SPEC.md`](docs/ETAPP1_TEKNISK_SPEC.md) | Teknisk spec för etapp 1 — datamodell, resolve-pipeline, anbudsalgoritm, testkrav, promptsekvens | Levande, fryst under P0–P12 |
| [`CLAUDE.md`](CLAUDE.md) | Hårda regler för kodsessioner i det här repot | Levande |

Läs `docs/DESIGN.md` först, `docs/ETAPP1_TEKNISK_SPEC.md` sedan. `CLAUDE.md` är operativ, inte
förklarande — den säger vad som är förbjudet, inte varför.

## Läget just nu

Etapp 1 är inte påbörjad. Nästa steg är **P0** i specens avsnitt 10.

Etapp 1 är en vertikal skiva: scenariot `INDOCHINA` avkortat till 20 turer, 1 front, 3 köpare,
3 rivalhus, 4 produktionslinjer, 1 underrättelsestation. Frågan skivan ska besvara står i
designdokumentets avsnitt 20 och är formulerad så att den faktiskt går att besvara med det som
byggs — inte med det som byggs i etapp 2.

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
