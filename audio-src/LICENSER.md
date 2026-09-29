# Ljudkällor och licenser

En rad per ljudfil i `audio-src/`, enligt `docs/LJUDTILLGANGAR.md` avsnitt 4 punkt 4.
Musik antecknas med genereringsverktyg, ägarens originaltitel och datum.

## Musik (`audio-src/music/`)

Samtliga åtta spår genererade av ägaren med **Gemini (Lyria 3.5)**, delade via
`share.gemini.google.com` och laddade upp till den här sessionen som mp4
(video+ljud); ljudspåret extraherat (`ffmpeg -vn`, ingen omkodning av
ljuddata utöver container-bytet till mp3) och filerna namngivna enligt
`LJUDTILLGANGAR.md` avsnitt 2. Ingen ytterligare bearbetning (normalisering,
klipp, fades) gjord här — det sker i P93a enligt avsnitt 5 i samma dokument.

| Fil | Ägarens originaltitel | Genererat | Datum uppladdat |
|---|---|---|---|
| `title.mp3` | The Unmarked Briefcase | Gemini / Lyria 3.5 | 2026-09-27 |
| `ops-calm-a.mp3` | The Midnight Briefing | Gemini / Lyria 3.5 | 2026-09-27 |
| `ops-calm-b.mp3` | The Unmarked Reel | Gemini / Lyria 3.5 | 2026-09-27 |
| `ops-tension.mp3` | The Unread Telegram | Gemini / Lyria 3.5 | 2026-09-27 |
| `crisis.mp3` | One Final Briefing | Gemini / Lyria 3.5 | 2026-09-27 |
| `newsreel-sting.mp3` | Headlines From the Front | Gemini / Lyria 3.5 | 2026-09-27 |
| `epilogue-survived.mp3` | The Last Map | Gemini / Lyria 3.5 | 2026-09-27 |
| `epilogue-exchange.mp3` | Winter at the Edge | Gemini / Lyria 3.5 | 2026-09-27 |

**Licens:** Google gör inte anspråk på äganderätt till Lyria-genererat innehåll;
varje spår bär en osynlig SynthID-vattenstämpel. Kommersiella villkor är
tydligast angivna för betalda Flow Music-/API-planer — se
`docs/LJUDTILLGANGAR.md` avsnitt 1 för den fulla reservationen. Gäller utan
begränsning för utveckling och speltest.

**Uppmätt vid uppladdning** (informativt, ingen normalisering gjord än):
mean volume −14,3 till −14,7 dB över alla åtta spår (konsekvent, ingen
klippning) — se `docs/LJUDTILLGANGAR.md` för hur P93a normaliserar till
LUFS-målet.

## Effekter (`audio-src/sfx/`)

Inga uppladdade än. Se `docs/LJUDTILLGANGAR.md` avsnitt 1 och 3 för källor
(Kenney/Freesound/Sonniss, CC0) och den 18-radiga listan.

## Bearbetning (P93, 2026-09-29)

`npm run build:audio --workspace=packages/app` (`packages/app/scripts/build-audio.mjs`, ffmpeg)
konverterar källfilerna ovan till det appen serverar. Källfilerna i `audio-src/` ändras inte.

| Källa | Utdata | Bearbetning |
|---|---|---|
| `music/*.mp3` (sju spår) | `packages/app/public/music/*.mp3` | MP3 128 kbps, loudnorm ≈ −16 LUFS (uppmätt −14,4 till −15,9), metadata borttagen |
| `music/newsreel-sting.mp3` | `packages/app/public/sounds/newsreel-sting.mp3` | klippt från 61 s till 5,5 s, 1 s fade ut, ≈ −18 LUFS (uppmätt −17,6) |
| `sfx/*` | `packages/app/public/sounds/*.mp3` | **inga källfiler finns ännu** — se `docs/LJUDTILLGANGAR.md` avsnitt 3–4 |

Effekter skrivs in här (filnamn, källa, länk, licens) när de läggs till i `audio-src/sfx/`.
