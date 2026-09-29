# Ljudtillgångar — musik, effekter och hur de kopplas in

**THE SEVENTH FRONT** · etapp 7 · skriven 2026-09-26 mot `6f500b1` (efter P74)

Samma arbetsgång som `GRAFISKA_TILLGANGAR.md`: det här dokumentet är en lista att arbeta ur,
inte en prompt i sekvensen. Ägaren genererar och laddar ner ljuden, Claude Code bearbetar och
kopplar in dem i P93 (eller tidigare, se avsnitt 6).

> **Status 2026-09-27:** Alla åtta musikspåren i avsnitt 2 är genererade och uppladdade —
> ligger i `audio-src/music/` med exakt de filnamn den här sidan förväntar sig
> (`title.mp3`, `ops-calm-a.mp3`, `ops-calm-b.mp3`, `ops-tension.mp3`, `crisis.mp3`,
> `newsreel-sting.mp3`, `epilogue-survived.mp3`, `epilogue-exchange.mp3`). Källa och licens
> loggad i `audio-src/LICENSER.md`. Ingen bearbetning gjord än — det är P93a:s jobb enligt
> avsnitt 5/6 nedan. Effekterna i avsnitt 3 är fortfarande inte hämtade.

> **Status 2026-09-29 (P93 byggd):** Motorn, kanalerna, musikregissören, `sw.js`-rättelsen och
> krokarna för alla effekter i avsnitt 3 är klara, och musiken är konverterad till
> `packages/app/public/music/` (12 MB) med `npm run build:audio`. **Det som återstår för ägaren är
> effekterna:** lägg dem i `audio-src/sfx/` med exakt namnen i avsnitt 3 (plus `room-tone` och
> `telex-loop`), skriv in dem i `audio-src/LICENSER.md`, och kör `npm run build:audio` — inget mer
> behöver ändras i koden. Avvikelser från avsnitt 5: MP3 i stället för AAC/`.m4a`, och
> `newsreel-sting` klipptes till 5,5 s och behandlas som effekt. Avsnitt 0 nedan beskriver läget
> INNAN P93.
>
> **Lyssna efter på telefonen** (ingen riktig telefon fanns i bygget): att musiken inte startar
> förrän första trycket; att den tonas över (inte klipps) när du går från menyn till kartan;
> att den sänks under kvartalsuppspelningen; att `ops-tension` tar över när Doomsday når 60;
> att kriskortet får `crisis.mp3` och att kriskortet inte drunknar i den; att en iPhone i tyst
> läge är tyst (avsett); att musiken pausar när du byter app och fortsätter när du kommer tillbaka.

---

## 0. Läget i koden

- `packages/app/src/sound.ts` (P72) har tre effektkrokar som redan anropas: `button-press`
  (varje knapp, via klickdelegering i `App.tsx`), `turn-end` och `doomsday-threshold` (båda i
  `useGame.ts`). Filerna saknas; `playSound()` tiger tyst tills de finns.
- Det finns ingen musik alls, inga kanaler (musik/effekter/miljö) och ingen volym per kanal.
- `sound.ts` avkodar varje fil till en `AudioBuffer` i minnet. Det fungerar för korta effekter
  men inte för musik: två minuter stereo blir runt 40 MB i minnet per spår.
- `public/sw.js` (P74) cachar svar med `cache.put` när `response.ok`. En webbläsare hämtar
  musik med Range-förfrågningar som svarar `206 Partial Content`, och `cache.put` avvisar
  206. Det måste hanteras innan musik läggs till (avsnitt 5).

---

## 1. Verktygsval

**Musik: Lyria 3.5** (Gemini-appen, Google AI Studio eller Gemini API). Den gör instrumentala
spår på upp till ett par minuter i 44,1 kHz stereo, och tar emot tempo och tonart i prompten.
Den är byggd för musik, inte för enstaka ljud.

**Effekter: inte Lyria.** En stämpel, ett skrivmaskinsslag eller en telefonsignal blir bättre
och snabbare från ett ljudbibliotek:
- **Kenney** (kenney.nl) — gränssnittsljud, CC0.
- **Freesound** (freesound.org) — filtrera på licensen *Creative Commons 0*. Här finns riktiga
  inspelningar av skrivmaskiner, teleprintrar, stämplar, bakelitströmbrytare och fingerskivetelefoner.
- **Sonniss GDC Game Audio Bundle** — stora gratispaket med professionella spelljud, fri licens
  för spel. Läs licenstexten i paketet.
- Om något saknas: en AI-generator för ljudeffekter (till exempel ElevenLabs). Kontrollera att
  planen tillåter kommersiell användning.

**Bara CC0 eller motsvarande** från fria bibliotek, så att inga namnkrediteringar behövs. Varje
fil skrivs in i `audio-src/LICENSER.md` med källa, länk och licens.

### Licens för Lyria

Google gör inte anspråk på äganderätt till genererat innehåll, och varje spår bär en osynlig
SynthID-vattenstämpel. Kommersiell användning är uttryckligen angiven för betalda planer i Flow
Music och för betald API-användning; för gratisnivåer och Gemini-appen är villkoren mindre
tydliga. **Innan spelet släpps kommersiellt:** läs de gällande villkoren för det sätt spåren
genererades på, och generera om vid behov via API:t (runt 0,08 USD per spår). För utveckling
och speltest spelar det ingen roll.

Lyria blockerar prompter som nämner verkliga artister. Promptarna nedan beskriver stil med
instrument och epok i stället.

---

## 2. Musiken

### Ljudbilden

Kalla krigets spionthriller 1964–65, sedd från ett krigsrum: sparsmakad jazz och kammarmusik,
inte heroisk orkester och inte syntar. Vibrafon, kontrabas, borstar på trumma, dämpad trumpet,
cembalo, låga stråkar. Tyst mer än högt. Musiken ligger under ett spel där spelaren läser och
tänker; den får aldrig kräva uppmärksamhet.

Alla spår i spelläget delar **tonart och tempo, d-moll i 72 BPM**, så att de kan tonas över i
varandra utan att det skär sig.

**Musik med pauser.** Ett spår spelas, sedan 20–60 sekunders tystnad, sedan nästa. Oavbruten
musik i ett turbaserat spel blir tröttsam efter en halvtimme.

### Spårlista och prompter

Generera 2–3 versioner av varje och välj den bästa. Klistra in prompten som den står.
Filnamnen är de som Claude Code förväntar sig.

**M1 · `title.mp3` — huvudmenyn, ca 2 min**
```
Instrumental only, no vocals. A 2-minute main theme for a Cold War espionage strategy game set
in 1965. Small jazz ensemble recorded in a dry, wood-panelled room: a muted trumpet carries a
slow, melancholy melody, vibraphone chords, upright bass, brushes on snare, a low string pad
underneath. D minor, 72 BPM. Restrained, tense and mysterious rather than heroic. Warm analogue
tape sound, slight hiss, no modern production, no synthesizers.
```

**M2 · `ops-calm-a.mp3` och M3 · `ops-calm-b.mp3` — kartan, ca 2 min vardera**
```
Instrumental only, no vocals. 2 minutes of quiet background music for a turn-based Cold War
strategy game, to sit underneath reading and planning. Sparse and spacious: soft vibraphone,
upright bass, occasional harpsichord or felt piano notes, very soft brushes or no drums at all.
No prominent melody, nothing that demands attention, long pauses between phrases. D minor,
72 BPM. 1960s analogue recording, intimate room, low dynamics throughout.
```
För M3, lägg till i slutet: `A distant, sparse solo dan bau (Vietnamese monochord) answers the
vibraphone now and then.` Låter det som en karikatyr, ta bort meningen och generera om.

**M4 · `ops-tension.mp3` — kartan när Doomsday passerat bevakningströskeln, ca 2 min**
```
Instrumental only, no vocals. 2 minutes of tense background music for a Cold War strategy game
when the world is close to crisis. Same palette as a sparse spy-jazz score: vibraphone, upright
bass, low strings, but now with a slow pizzicato ostinato, soft timpani pulses, quiet
dissonant string clusters and occasional muted brass swells. D minor, 72 BPM. Uneasy and
building, but never loud; it must stay underneath the game. 1960s analogue recording.
```

**M5 · `crisis.mp3` — kriskortet, ca 1 min**
```
Instrumental only, no vocals. A 1-minute cue for a nuclear standoff in a 1960s Cold War game.
Sustained low strings, a timpani heartbeat that slowly quickens, dissonant muted brass stabs,
a high violin harmonic held throughout. D minor, 72 BPM rising to 84. Builds tension without
any resolution and ends suspended. Analogue orchestral recording, no synthesizers.
```

**M6 · `newsreel-sting.mp3` — tidningens förstasida, kort signatur**
Generera med 30-sekundersmodellen (Lyria 3 Clip); Claude Code klipper ut 4–6 sekunder.
```
Instrumental only. A short 1960s newsreel opening fanfare: snare drum roll, bright brass
fanfare, orchestra hit, mono AM-radio character, slightly worn vinyl sound.
```

**M7 · `epilogue-survived.mp3` — slutet när världen överlevde, ca 2 min**
```
Instrumental only, no vocals. A 2-minute closing piece for a Cold War game in which the world
narrowly survived. Solo piano, joined by a quiet string quartet halfway through. Bittersweet
and reflective, relief mixed with guilt. D minor resolving to D major only in the final chord.
72 BPM, rubato. Intimate 1960s recording.
```

**M8 · `epilogue-exchange.mp3` — slutet efter kärnvapenutbytet, ca 1,5 min**
```
Instrumental only, no vocals. A 90-second piece for the aftermath of a nuclear war. Almost
silence: a low sustained drone, wind, a single celesta playing a slow fragment of a simple
melody, very sparse, fading into nothing. Desolate and quiet, not dramatic, no percussion.
```

### Vad som spelas när

| Läge | Musik |
|---|---|
| Huvudmeny, New Game, Briefing | M1 |
| Kartan, Doomsday under 60 | M2 och M3 omväxlande, med pauser |
| Kartan, Doomsday 60 eller högre | M4, tonas in över 4 s; tillbaka till M2/M3 när värdet sjunker |
| Kriskortet | M5; allt annat dämpas |
| Kvartalsuppspelningen | Pågående spår sänks 6 dB, effekterna tar över |
| Tidningens förstasida | M6 en gång |
| Epilog | M7 eller M8 efter slutorsak |
| Appen i bakgrunden | Pausa; återuppta när den visas igen |

---

## 3. Ljudeffekterna

Registret är samma som bilden: föremål på ett bord 1965. Korta, torra, mono, utan efterklang.

| Fil (`sounds/`) | Ljud | Används vid | Finns kroken? |
|---|---|---|---|
| `button-press` | Bakelitströmbrytare, kort klick | Varje knapp | Ja |
| `turn-end` | Teleprinter som slår en rad, avslutas med klocka | End Quarter | Ja |
| `doomsday-threshold` | Kort larmklocka, eller en avlägsen sirén som varvar upp | Doomsday passerar en tröskel | Ja |
| `tab-switch` | Metallflik, lätt klick | Byte av skärm | Nej |
| `sheet-open` / `sheet-close` | Manillamapp dras över bordet | Bottenarket | Nej |
| `card-place` | Registerkort läggs på bord | Handling i en plats | Nej |
| `card-remove` | Kort dras bort | Handling tas bort | Nej |
| `stamp` | Gummistämpel, dov duns | *File in slot*, vunnet kontrakt | Nej |
| `typewriter` | 3–4 snabba skrivmaskinsslag | Formulär öppnas | Nej |
| `tier-select` | Blyerts som ringar in | Nivå väljs | Nej |
| `map-select` | Blyerts som knackar på papper | Föremål på kartan väljs | Nej |
| `order-new` | Liten teleprinterklocka | Ny order på kartan | Nej |
| `counter-tick` | Mekaniskt räkneverk | HUD-tal som räknar | Nej |
| `crisis-phone` | Telefonsignal från 60-talet, två signaler | Kriskortet öppnas | Nej |
| `backchannel` | Fingerskiva som dras | `BACK_CHANNEL` köas | Nej |
| `static-burst` | Kort radiobrus som klipps | Station bränd | Nej |
| `telex-loop` | Teleprinter som slår, loopbar, 10–20 s | Under kvartalsuppspelningen | Nej |
| `room-tone` | Rumsljud: ventilation, en klocka, avlägsna skrivmaskiner, loopbar 60 s | Hela tiden, mycket lågt | Nej |

---

## 4. Så gör du

1. **Generera musiken** i Gemini-appen eller AI Studio med promptarna i avsnitt 2. Välj den
   bästa versionen av varje och ladda ner som mp3.
2. **Hämta effekterna** från källorna i avsnitt 1. Lyssna i telefonhögtalaren, inte bara i
   hörlurar; det är där spelet spelas.
3. **Döp filerna** exakt som i listorna (`title.mp3`, `stamp.mp3` och så vidare). Filformatet
   spelar ingen roll, Claude Code konverterar.
4. **Skriv in varje effekt** i `audio-src/LICENSER.md`: filnamn, källa, länk, licens.
   Musikfilerna skrivs in med "Lyria 3.5", hur de genererades och datum.
5. **Ladda upp** till repot, grenen `claude/funny-lamport-nvno9f`: musiken i `audio-src/music/`,
   effekterna i `audio-src/sfx/`. GitHubs webbuppladdning tar högst 25 MB per fil, så välj mp3
   framför wav.
6. **Ge Claude Code prompten** i avsnitt 6.

Allt behöver inte vara klart på en gång. Motorn spelar det som finns och tiger om resten.

---

## 5. Tekniskt, för Claude Code

- **Två motorer.** Korta effekter som i dag: `AudioBuffer`, cachade. Musik och loopade
  miljöljud strömmas genom ett `HTMLAudioElement` kopplat till en `MediaElementAudioSourceNode`,
  så att de kan tonas via Web Audio utan att avkodas i minnet.
- **Kanaler.** En `GainNode` per kanal (master, music, sfx, ambience). Volym per kanal sparas som
  mute-flaggan i dag (`persistence.ts`, `settings:sound`) och får reglage i P90.
- **Övertoning och pauser.** Inga försök till sömlösa loopar av genererad musik. En spelare väljer
  nästa spår i läget, tonar över 3–4 s, och lägger in tystnad enligt avsnitt 2.
  Läget styrs av speltillståndet (`view`, `doomsday` mot `DISPLAY_THRESHOLDS`, `pendingCrisis`,
  `status`). Inga nya balanstal i kärnan.
- **Mobil.** `AudioContext` startar pausad tills användaren rört skärmen: anropa `resume()` vid
  första tryck (huvudmenyns knappar räcker). Pausa allt vid `visibilitychange` till `hidden`.
  Tysta läget på en iPhone stänger av webbljud; det är avsett beteende, inte en bugg.
- **Service worker.** `sw.js` får inte köra `cache.put` på svar med status 206. Enklast: låt
  `/music/` gå förbi service workern helt, eller hämta hela filen i bakgrunden och servera
  Range-förfrågningar ur cachen. Spelet ska fungera offline utan musik om den inte hunnit hämtas.
- **Bearbetning.** Källfilerna i `audio-src/` konverteras till `packages/app/public/music/` och
  `packages/app/public/sounds/` med ett skript (`scripts/build-audio.mjs`, ffmpeg): musik till AAC
  i `.m4a`, ca 128 kbps, ljudnivå normaliserad till ungefär −16 LUFS; effekter till mono, tystnad
  i början och slutet borttagen, normaliserade så att de ligger jämnt med varandra. `audio-src/`
  ingår inte i bygget.
- **Budget.** Musik totalt under 15 MB, effekter under 1 MB. Musiken laddas först när den ska
  spelas, aldrig vid start.
- **Tillgänglighet.** Inget i spelet får bara finnas som ljud. Varje ljud har redan en visuell
  motsvarighet; så ska det förbli.
- **Test.** Regeln från P72 gäller: saknade filer, avkodningsfel och webbläsare utan Web Audio
  ger tystnad, aldrig ett fel. e2e-testernas krav på noll konsolfel ska hålla med och utan filer.

---

## 6. När och hur det kopplas in

Specen lägger ljudet i P93, efter allt annat. **Rekommendation:** dela P93 och flytta första
delen till före P81, eftersom ljud påverkar kraftigt om något känns som ett spel, och P81 är
speltestet där stilen godkänns.

- **P93a (före P81):** motorn, kanalerna, service worker-rättelsen, all musik och effekterna för
  de skärmar som finns i skivan.
- **P93b (kvar i 7E):** effekterna för skärmarna som byggs i 7C och 7D.

Prompt att ge Claude Code när filerna är uppladdade:

```
Ljudfilerna ligger i audio-src/ och docs/LJUDTILLGANGAR.md beskriver dem. Ägarbeslut: P93 delas
i P93a och P93b enligt avsnitt 6 i det dokumentet, och P93a körs före P81. Logga beslutet i
ANDRINGSLOGG.md och uppdatera promptsekvensen i ETAPP7_TEKNISK_SPEC.md.

Om ni är mitt i en annan prompt: gör klart den först.

Kör sedan P93a enligt avsnitt 5. Stäm först av avsnitt 0 mot koden och stanna om något inte
stämmer. Lista vilka filer i avsnitt 2 och 3 som saknas i audio-src/ och fortsätt ändå; motorn
ska spela det som finns. Stanna efter P93a och berätta vad jag ska lyssna efter på telefonen.
```
