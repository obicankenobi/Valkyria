# Speltest av etapp 11 (P184) — checklista för ägaren

P184 är ett speltest utan kod. Det kan inte göras av en kodsession: frågan är om verken gör produktionen till något som måste skötas — och
det avgörs av någon som spelar. Det här dokumentet är det en kodsession kan leverera i stället: vad härnessen redan visar (P182–P183,
100 partier per bot, `indochina-slice`) och vad du behöver känna efter själv. **Läs först avsnittet "Det härnessen visar" — det ändrar
vad du ska leta efter.** Inget här ersätter att spela.

## Hur du spelar

Tre partier på telefon (390×844, installerad som helskärms-PWA). Spela hela scenariot (21 turer) eller tills partiet tar slut:

1. **Ett parti där du bara bjuder** och aldrig bygger (som `human-static`).
2. **Ett parti där du bygger** — ett monteringsverk i en andra kategori när du ser att du lägger ut, och gärna en utbyggnad.
3. **Ett parti där du sköter driften** — bemanning, underhåll, en strejk, produktionstavlan, depån — så mycket du orkar.

## Det härnessen visar

| Rad (§9) | Mål | Mätt | Läsning |
|---|---|---|---|
| `human`, `SCENARIO_COMPLETE` | 40–70 % | **53 %** (8 % konkurs) | nådd |
| `human-outsource`, vinst | 20–50 % | **48 %** | nådd |
| `human` mot `human-static`, vinst | ≥ 25 pp | **+2 pp** (53 mot 51) | **inte nådd** — att inte bygga är lika bra |
| Utnyttjande, `human` | 70–90 % | **14 %** | **inte nådd** — kapaciteten binder inte |
| `human-builder`, konkurs | 10–30 % | **90 %** | inte nådd — att bygga tidigt fäller huset |
| `human-specialist` / `human-broad`, vinst | båda ≥ 35 % | **12 % / 0 %** | inte nådd |
| Byggda anläggningar per parti, `human` | 3–6 | 0,4 (+ 0,7 utbyggnader) | inte nådd |
| Kvartal med ett driftsbeslut (övre gräns) | ≥ 60 % | 22 % | inte nådd |
| Sena leveranser per parti, `human` | 1–4 | 0,7 | strax under |
| Partier där tomten tar slut | 30–60 % | 0 % | inte nådd — ingen bot fyller åtta platser |
| Fall i styckkostnad av inkörning (åtta kvartal) | 15–30 % | ej mätt | `runInLevel` 1,3 fördubblingar i snitt |

## Varför det ser ut så (diagnosen — verifierad, inte gissad)

1. **Kapaciteten binder inte.** Linjerna går 14 % av tiden. 77 % av husets kontraktsenheter byggs av en underleverantör (specialiseringen är
   en av sex kategorier). Orderstorlekarna är små mot linjernas takt: att sänka `subcontractUnitsFactor` från 0,6 till 0,2 ändrade *ingenting* (30
   partier, identiska utfall), och att dela alla produkters `unitsPerLineTurn` med tre höjde utnyttjandet till 27 % men fällde `human` till 20 %.
2. **Styckkostnaden är en liten del av priset.** Att höja utläggningens påslag 1,25 → 1,6 flyttar `human-static` 90 → 57 % men tar lika mycket
   av `human`; vid 1,9 vinner ingen. Det finns ingen inställning där ett bygge lönar sig mot en utläggning.
3. **Kassadalen.** Varje bot ligger nära noll i kassan kvartal 6–9 (lägsta kassa 0–0,5 Mkr). Ett bygge på 0,6–1,2 Mkr plus 90 000 per kvartal i
   fast kostnad och lön äter hela marginalen. `human-builder` och `human-broad` byggde tidigt och gick i konkurs.
4. **Rutnätssökning** (36 kombinationer av utläggningspåslag, fasta kostnader, grundlön och styrelsetröskel, 30 partier per bot): `human` kom
   aldrig över `human-static` med mer än 10 pp (bäst: 43 mot 33 %, men då vinner ingen annan bot något).

**Slutsats:** med reglerna som de är går det inte att göra att bygga lönsamt genom att ändra tal. Det som saknas är en regel som gör kapaciteten
knapp — se "Efter speltestet".

## Det du behöver känna efter

1. **Tomtplanen.** Är det tydligt vad lamporna betyder (cirkel = går, grå kvadrat = står, romb = bygger)? Hittar du anläggningskortet och
   byggmenyn utan att leta?
2. **Byggbeslutet.** Förstår du *varför* du skulle bygga? Ser du att du lägger ut ("Ready by", produktionstavlans underleverantörsrad)? Känns
   ett bygge som en investering eller som en förlust?
3. **Dalen.** Märker du att kassan sjunker kvartal 6–9 hur du än spelar? Tror du att du kan finansiera ett bygge då?
4. **Produktionstavlan.** Går det att förstå vad som byggs när, och dra ett kontrakt till en linje? Lönar sig planeringen?
5. **Driften.** Märker du underhåll, bemanning och strejk — eller är de bara siffror? Kom strejken någonsin?
6. **Larmen i This Quarter.** Hoppar de till rätt kort? Är "tomma linjer" ett larm du bryr dig om eller brus?
7. **Verk utomlands.** Går det att bygga i Vietnam eller Laos? Syns det på kartan? (Ingen bot provar det.)
8. **Handledningen.** Hinner du med stegen för att bygga, planera en linje och läsa ett larm på tre kvartal? (Planera en linje kräver ett vunnet
   kontrakt, så det steget hinns sällan.)

## Kända luckor att ha med dig

- Krasprogrammet "upptar labbet" är inte byggt (inget annat projekt att stanna).
- Verk i NLF:s land, civilt verk utomlands och historiska händelser som träffar ett verk finns inte.
- Depån (tillverkning på lager) och strejksvaren används inte av någon bot utom strejksvaret; depåns värde i botspel är 0.
- `OUTSOURCE`/`PLAN` fick sitt gränssnitt i P180 på eget förslag (specen nämner dem inte i §8).

## Efter speltestet

Avgör vilken regel som ska göra kapaciteten knapp — det är ett regelbeslut, inte ett balanstal. Kandidaterna, var och en mätbar i härnessen:

- **Ett tak på utläggningen** (högst en viss andel av kontraktsenheterna, eller ett antal samtidiga utlagda kontrakt per kategori), så att en bot som
  aldrig bygger faktiskt går miste om kontrakt.
- **Större orders mot linjetakten** (`orderQuantityMin/Max` i produktdatan), så att en linje är upptagen flera kvartal per kontrakt. Flyttar golden.
- **Finansiering av bygget** — ett lån knutet till bygget, eller lägre fasta kostnader i dalen — så att att bygga tidigt inte fäller huset.
- **Utläggningen kostar ryktet på riktigt** (`subcontractQualityPenalty` är 1; vid 6 faller alla botar).

**P185** finns inte i någon spec (etapp 11 slutar vid P184). Säg vad den ska vara.
