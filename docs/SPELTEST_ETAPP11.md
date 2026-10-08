# Speltest av etapp 11 (P184) — checklista för ägaren

> **2026-10-08 (beslut 11AC):** speltestet görs tillsammans med P148, efter P187 och P188 och före P150. Det gemensamma underlaget, med vad P187 (ett kontrakt på flera linjer) och P188 (forskningen lönar sig) ändrade och mätte, står i `docs/SPELTEST_ETAPP10A.md`. Den här listan gäller oförändrad för verken och driften.

P184 är ett speltest utan kod. Det kan inte göras av en kodsession: frågan är om verken gör produktionen till något som måste skötas — och
det avgörs av någon som spelar. Det här dokumentet är det en kodsession kan leverera i stället: vad härnessen redan visar (efter P185–P186,
100 partier per bot, `indochina-slice`) och vad du behöver känna efter själv. **Läs först avsnittet "Det härnessen visar" — det ändrar
vad du ska leta efter.** Inget här ersätter att spela. (Uppdaterat 2026-10-07 efter P141, som körs före speltestet enligt beslut 11Z; tidigare versioner byggde på P183 och P186.)

## Hur du spelar

Tre partier på telefon (390×844, installerad som helskärms-PWA). Spela hela scenariot (21 turer) eller tills partiet tar slut:

1. **Ett parti där du bara bjuder** och aldrig bygger (som `human-static`). Du kommer se låsta ordrar ("Requires an Assembly Works for …").
2. **Ett parti där du bygger** — ett monteringsverk i en andra kategori tidigt, gärna med byggnadslån, och en utbyggnad.
3. **Ett parti där du sköter driften** — bemanning, underhåll, en strejk, produktionstavlan, depån — så mycket du orkar.

## Vad som är nytt sedan P183

- **Huvudleverantörsregeln** (P185). Ett bud i en kategori kräver ett monteringsverk i den (i drift, eller med högst ett kvartal kvar av bygget; verk utomlands räknas). *Mjuk spärr:* utan verk går det att ta små ordrar
  (högst en linjetur), helt utlagda, med 15 % högre utläggningspåslag. Högst hälften av ett kontrakt får läggas ut. Skälet visas i budmappen (LOCKED), på kartans orderlager ("N open, M locked") och i This Quarter.
- **Byggnadslån** (P185). Byggmenyn och utbyggnaden har valet CASH / BUILDING LOAN (90 % av kostnaden, 8 % årsränta, avbetalning över 12 kvartal efter driftstart, anläggningen som säkerhet).
- **Större ordrar och frist som växer med ordern** (P185–P186). Kontrakten är 2–4 gånger linjetakten; leveransfristen växer med en tur per linjekvartal.
- **Marknaden är bredare och större** (P141). Köparnas tekniknivå följer blockens generation (`blocTechLevelStep` 1): marin öppnas för RVN tur 4, pansar och elektronik tur 12, NLF får artilleri tur 4. Köparnas budgetandel är
  0,24 (var 0,08), så marknaden är ca 7 Mkr per kvartal (var ca 2,2). Teknik- och specialiseringsbonusen i budpoängen är på specens nivå (2 och 10 %), och en stridsbeprövad eller rivalernas nya konstruktion ger motsidan
  ett helt behov i motmedelskategorin. Styrelsens tröskel är 11 (var 3,4).

## Det härnessen visar

| Rad (§9) | Mål | Före (P186) | Efter (P141) | Läsning |
|---|---|---|---|---|
| `human`, `SCENARIO_COMPLETE` | 40–70 % | 48 % (18 % konkurs) | **47 %** (0 % konkurs) | nådd |
| `human` mot `human-static`, vinst | ≥ 25 pp | +41 pp | **+47 pp** (47 mot 0 %) | nådd |
| `human-builder`, konkurs | 10–30 % | 27 % | **18 %** | nådd |
| `human-broad`, vinst | ≥ 35 %, under 90 | 86 % | **80 %** | nådd |
| `human-outsource`, vinst | 20–50 % | 10 % | **33 %** | nådd |
| Inkörningens andel | 15–30 % | 17 % | **27 %** | nådd |
| Sena leveranser per parti | 1–4 | 0,8 | 1,0 | på gränsen |
| `human-specialist`, vinst | ≥ 35 % | 1 % | **1 %** | inte nådd |
| Utnyttjande, `human` | 70–90 % | 18–25 % | **28 %** | inte nådd |
| Nya anläggningar per parti, `human` | 3–6 | 0,1 | **1,8** (+ 2,0 utbyggnader) | inte nådd |
| Kvartal med ett driftsbeslut | ≥ 60 % | 24–29 % | **44 %** | inte nådd |
| Partier där tomten tar slut | 30–60 % | 0 % | **0 %** | inte nådd |

Övriga botar efter P141: `balanced` 36 %, `balanced-pwc` 36 %, `aggressive` 0 %, `passive` 0 %, `human-classic` 0 %, `capacity` 0 % vinst / 97 % `BUYOUT` (referensen oförändrad).

## Kassadalen (P141 tog med den)

`human`, kassa i början av kvartalet, medel / median (Mkr), före → efter: kvartal 7 0,21 / 0,14 → 0,21 / −0,01; kvartal 8 0,30 / 0,36 → 0,16 / 0,08; kvartal 9 0,12 / −0,03 → 1,39 / 1,37; kvartal 10 0,80 / 0,85 → 2,21 / 2,33; kvartal 20
−0,42 / −0,56 → 3,88 / 3,51. Konkurs 18 % → 0 %. **Dalen i kvartal 5–8 finns kvar** (medianen ligger runt noll, lägsta enskilda −0,5 Mkr): inga kontrakt är bokförda de första fyra kvartalen medan fasta kostnader och tillverkning
löper. Huset kommer ur den ett till två kvartal tidigare. Du märker den i spelet som en kassa som sjunker från 4 Mkr till nära noll och en första leverans som ger luft.

## Varför de sista raderna inte nås (verifierat, inte gissat)

1. **En ren artillerispecialist kan inte nå styrelsemålet.** Artilleri är ca 1,2 ordrar per kvartal; infanteri är hälften av marknadens värde men låst för den som inte byggt ett infanteriverk. `human-specialist` fick 0–3 % vid varje
   tröskel (8–15) och i varje kombination som prövades.
2. **Ett kontrakt tillverkas på en linje i taget.** `human` har 3,5–4,7 aktiva kontrakt men fyller på till 7,5 linjer mot slutet; linjerna går 28 % av tiden. En större marknad ger fler kontrakt, inte fler linjer per kontrakt.
3. **Prövat och förkastat:** orderstorlekar × 2, linjetakt × 0,5 med orderstorlekar × 0,5 (bryter `capacity`-referensen), tre gånger fredspåfyllning, dubbel förbrukningskoppling, budgetandel 0,4–0,6, spridda startbehov, höjda NLF/Laos-
   budgetar. Se `docs/ETAPP10_FORSLAG.md` §6 för talen.

**Slutsats:** de kvarvarande raderna kräver en regel (ett kontrakt som tar flera linjer, eller en marknad vars form hör ihop med husets specialisering), inte ett tal.

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
- Kassadalen kvartal 5–8 finns kvar i djupet (P141 flyttade bara utgången).

## Beslut som behövs från ägaren

- **11U–11Z är genomförda** (P141): `human-broad` 80 % (taket orört), marknadens bredd löst (tekniknivån följer blocken), 11R-klausulen struken, NLF/Laos lämnade som de är efter mätning, fältprovets sats återställd, och
  speltestet P184 kan göras nu (11Z).
- **Rader som inte nåddes — välj regel eller sänk raden:** (a) ska ett kontrakt kunna tillverkas på flera linjer samtidigt (det gör kapaciteten knapp och bygge/specialisering lönsamma, men ändrar `production.ts` och golden)?
  (b) ska marknaden formas efter husets specialisering (t.ex. artilleriköpare i större andel), eller ska raden "specialist ≥ 35 %" strykas? (c) är "driftsbeslut ≥ 60 % av kvartalen" och "full tomt 30–60 %" rätt rader
  för en bot som bygger efter behov, eller ska de följa botens val?
- **`runInCostPerDoubling` 3 → 2** hölls för att behålla raden "inkörningens andel" (annars 44 %). Specens 3 var markerad provisorisk (P174); godkänn eller ange en annan väg.
- **Kassadalen** kvartal 5–8 är oförändrad i djup. Vill du ha en regel som mildrar den (större förskott, första ordern garanterad, lägre fasta kostnader de första fyra kvartalen)?
