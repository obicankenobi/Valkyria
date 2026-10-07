# Speltest av etapp 11 (P184) — checklista för ägaren

P184 är ett speltest utan kod. Det kan inte göras av en kodsession: frågan är om verken gör produktionen till något som måste skötas — och
det avgörs av någon som spelar. Det här dokumentet är det en kodsession kan leverera i stället: vad härnessen redan visar (efter P185–P186,
100 partier per bot, `indochina-slice`) och vad du behöver känna efter själv. **Läs först avsnittet "Det härnessen visar" — det ändrar
vad du ska leta efter.** Inget här ersätter att spela. (Uppdaterat 2026-10-07 efter P185–P186; tidigare version byggde på P183.)

## Hur du spelar

Tre partier på telefon (390×844, installerad som helskärms-PWA). Spela hela scenariot (21 turer) eller tills partiet tar slut:

1. **Ett parti där du bara bjuder** och aldrig bygger (som `human-static`). Du kommer se låsta ordrar ("Requires an Assembly Works for …").
2. **Ett parti där du bygger** — ett monteringsverk i en andra kategori tidigt, gärna med byggnadslån, och en utbyggnad.
3. **Ett parti där du sköter driften** — bemanning, underhåll, en strejk, produktionstavlan, depån — så mycket du orkar.

## Vad som är nytt sedan P183

- **Huvudleverantörsregeln.** Ett bud i en kategori kräver ett monteringsverk i den (i drift, eller med högst ett kvartal kvar av bygget; verk utomlands räknas). *Mjuk spärr:* utan verk
  går det att ta små ordrar (högst en linjetur), helt utlagda, med 15 % högre utläggningspåslag. Högst hälften av ett kontrakt får läggas ut. Skälet visas i budmappen (LOCKED), på kartans
  orderlager ("N open, M locked") och i This Quarter.
- **Byggnadslån.** Byggmenyn och utbyggnaden har valet CASH / BUILDING LOAN (90 % av kostnaden, 8 % årsränta, avbetalning över 12 kvartal efter driftstart, anläggningen som säkerhet).
  Lånet syns på anläggningskortet, i Books (`build-loans`) och i Next quarter.
- **Större ordrar.** Kontrakten är 2–4 gånger linjetakten; färre ordrar (18 i stället för 42 per parti) men ~3,4 gånger så stort ordinarie värde. Leveransfristen växer med ordern (en linjetur extra per
  linjekvartal), annars vore varje stor order sen per konstruktion.

## Det härnessen visar

| Rad (§9) | Mål | Före (P183) | Efter (P186) | Läsning |
|---|---|---|---|---|
| `human`, `SCENARIO_COMPLETE` | 40–70 % | 53 % | **48 %** (18 % konkurs) | nådd |
| `human` mot `human-static`, vinst | ≥ 25 pp | +2 pp | **+41 pp** (48 mot 7 %) | **nådd** — att aldrig bygga lönar sig inte längre |
| `human-builder`, konkurs | 10–30 % | 90 % | **27 %** | nådd |
| `human-broad`, vinst | ≥ 35 % | 0 % | **86 %** | nådd — men nära spelbarhetstakets 90 % |
| `human-specialist`, vinst | ≥ 35 % | 12 % | **1 %** | inte nådd |
| `human-outsource`, vinst | 20–50 % | 48 % | 10 % | inte nådd (utläggning är nu en dålig strategi) |
| Utnyttjande, `human` | 70–90 % | 14 % | 18–25 % | inte nådd |
| Byggda anläggningar per parti, `human` | 3–6 | 0,4 | 0,1–1,0 | inte nådd |
| Kvartal med ett driftsbeslut | ≥ 60 % | 22 % | 24–29 % | inte nådd |
| Sena leveranser per parti, `human` | 1–4 | 0,7 | 0,8 | strax under |
| Partier där tomten tar slut | 30–60 % | 0 % | 0 % | inte nådd |
| Inkörningens andel av styckkostnadens fall | 15–30 % | ej mätt | **17 %** | nådd (`broad` 24 %, `static` 12 %) |

Övriga botar efter P186: `balanced` 9 %, `aggressive` 13 %, `passive` 5 %, `balanced-pwc` 27 %, `capacity` 0 % vinst / 100 % `BUYOUT` (referensen oförändrad).

## Varför de sista raderna inte nås (verifierat, inte gissat)

1. **Marknaden är budgetbunden och smal.** Köparnas budget är 8 % av deras kassa per kvartal (≈ 2,2 Mkr/kvartal totalt) och marknaden innehåller bara infanteri- och artilleriordrar (köparnas tekniknivå
   är 2/1/1). Kapacitetsbehovet är ~1–1,5 linjekvartal per kvartal mot två linjer, så utnyttjandet kan inte komma upp i 70 % och ingen fyller åtta platser. NLF:s och Laos budgetar (2,5 / 1,2 Mkr) är mindre
   än ett 3–4 Mkr-kontrakt, så de beställer sent.
2. **Specialisten förlorar mot den breda.** I en marknad med två kategorier får `human-specialist` (en kategori, djupt) för få bud; `human-broad` bygger ett infanteriverk tidigt och tar hela infanterimarknaden.
3. **Att slå på fasta kostnader hjälper inte.** Dubbla fasta kostnader fäller även startpaketet; längre byggtider bryter ett test som pinnar 2–4 kvartal.

**Slutsats:** de kvarvarande raderna kräver en regel eller en efterfrågeändring (fler kategorier i marknaden, lägre linjetakt, större budgetar för de små köparna), inte ett tal.

## Det du behöver känna efter

1. **Låsta ordrar.** Är det tydligt *varför* en order är låst och vad du ska göra? Hittar du hoppet från This Quarter till rätt byggmeny?
2. **Byggnadslånet.** Förstår du valet CASH / LOAN, avbetalningen och att verket tas om du inte kan betala? Känns lånet som en hjälp eller som en fälla?
3. **Tomtplanen.** Är det tydligt vad lamporna betyder (cirkel = går, grå kvadrat = står, romb = bygger)? Hittar du anläggningskortet och byggmenyn utan att leta?
4. **Byggbeslutet.** Känns ett bygge som en investering eller som en förlust? Ser du att du lägger ut ("Ready by", produktionstavlans underleverantörsrad)?
5. **Dalen.** Märker du att kassan sjunker kvartal 6–9 hur du än spelar? (Hör till P141, inte till etapp 11.)
6. **Produktionstavlan.** Går det att förstå vad som byggs när, och dra ett kontrakt till en linje? Lönar sig planeringen?
7. **Driften.** Märker du underhåll, bemanning och strejk — eller är de bara siffror? Kom strejken någonsin?
8. **Larmen i This Quarter.** Hoppar de till rätt kort? Är "tomma linjer" ett larm du bryr dig om eller brus?
9. **Verk utomlands.** Går det att bygga i Vietnam eller Laos? Syns det på kartan? (Ingen bot provar det.)
10. **Handledningen.** Hinner du med stegen för att bygga, planera en linje och läsa ett larm på tre kvartal?

## Kända luckor att ha med dig

- Krasprogrammet "upptar labbet" är inte byggt (inget annat projekt att stanna).
- Verk i NLF:s land, civilt verk utomlands och historiska händelser som träffar ett verk finns inte.
- Depån (tillverkning på lager) och strejksvaren används inte av någon bot utom strejksvaret; depåns värde i botspel är 0.
- Ryktet som kostnad för utläggning är inte byggt (11S); `subcontractQualityPenalty` är oförändrad.
- Kassadalen kvartal 6–9 är inte åtgärdad (P141).
- `human-broad` vinner 86–89 % — under taket 90, men vakten kör 30 partier och marginalen är tunn.

## Beslut som behövs från ägaren

- **Taket för `human-broad`:** är 86–89 % acceptabelt, eller ska taket (90) eller marknaden ändras? Kodsessionen har inte rört spelbarhetstestet.
- **Marknadens bredd:** ska scenariot få fler kategorier i efterfrågan (så att specialisten och utnyttjandet kan nå sina rader)? Det är en regel/scenarioändring, inte ett tal.
- **11R:s klausul "marknadens värde ungefär oförändrat"** gick inte att hålla (värdet steg ~3,4×; en skalning av tröskelvärdena fällde alla botar) — godkänn utfallet eller ge en ny linje.
- **Små köparnas budgetar** (NLF 2,5 / Laos 1,2 Mkr mot ett kontrakt på 3–4 Mkr): ska de höjas?
- **`fieldTrialBatchFraction`:** fältprovets sats räknas mot `orderQuantityMin` och är nu större (bieffekt av 11R).
