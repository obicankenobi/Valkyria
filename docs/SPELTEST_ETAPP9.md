# Speltest av etapp 9 (P131) — checklista för ägaren

P131 är ett speltest utan kod. Det kan inte göras av en kodsession: frågan i `docs/ETAPP9_FORSLAG.md` §1
("Kan en produkt avgöra ett parti?") besvaras av någon som spelar. Det här dokumentet är det en
kodsession kan leverera i stället — vad som redan är mätt i härnessen (så att du slipper gissa) och vad
du behöver känna efter själv. Inget i det här dokumentet ersätter att spela.

## Hur du spelar

Tre partier på telefon (390×844, installerad som helskärms-PWA), minst ett av dem som ett hus som
**ritar** (ritbordet i THE COMPANY) och minst ett som **inte** gör det. Spela hela scenariot (21 turer)
eller tills partiet tar slut.

## Det härnessen redan visar (200 partier per bot, `indochina-slice`, efter P130)

| Delfråga (§1) | Mätt | Läsning |
|---|---|---|
| 1. Lyft | `human` 70,5 % mot `human-noresearch` 51,5 % vinst | +19 pp — en spelare som ritar och forskar vinner klart oftare |
| 2. Spelstil | `human-robust` 74,0 %, `human-advanced` 39,5 % | båda vinner, men `advanced` bara precis (och 27 av 200 går i konkurs) |
| 3. Dynamik | gap-chocker 9,7 per parti, unga intäkter 18 % | kapplöpningen är **mer** än tillräcklig; konstruktionerna bär ännu bara en femtedel av intäkten |
| 4. Spårbarhet | olycksfåglar 0,09 per parti | ett haveri som går att spåra inträffar nästan aldrig i botspel — **måste kännas efter av en människa** |
| 5. Pelare 1 | doomsday-topp 48,9 (`human`) mot 50,1 (`human-bothsides`) | att sälja till båda sidor syns knappt i doomsday — fråga dig om det känns rätt |
| 6. Rent/smutsigt | `human-clean` 40,5 %, `human-dirty` 55,5 % | båda spelbara; smutsigt ger mer vinst, men spåren kommer sällan fram (12 %) och hävda kontrakt är 0 |

## Det du behöver känna efter

1. **Ritbordet.** Är det begripligt vad inriktning och ambition köper? Förstår du varför en ritning inte
   bjuds på alla ordrar (en konstruktion gäller bara basprodukten i sin kategori)?
2. **Typbladet.** Känns intervallet "B ±1" som information eller som brus? Smalnar det av när du provar?
3. **Kapplöpningstavlan.** Märker du gap-chockerna när de sker? Är nio per parti för många?
4. **Upphandlingsmappen.** Hittar du anmälan, prototypen och de sex knepen? Är det tydligt vad som är
   LEGAL / GREY ZONE / PAPER TRAIL? Är det rimligt att du förlorar de flesta upphandlingar (botarna
   vinner 0,4 av 3)?
5. **Utredningskortet.** Går de tre dåliga vägarna (förneka / offra / förlikas) att skilja åt på prickarna?
   Kommer du ihåg att svara inom tre turer, eller faller standardsvaret (förneka) oftast?
6. **Pappersspåret.** Är 12 % framkomna spår för lite för att korruption ska kännas riskabel?
7. **Handboken.** Räcker uppslagen `design` och `programmes`?

## Kända luckor att ha med dig

- `SABOTAGE`/`LEAK` mot en specifik upphandling har ingen egen knapp i mappen (nås bara via landsakten).
- Prestanda och ljud är inte mätta på en riktig telefon (se `docs/ETAPP7_TEKNISK_SPEC.md` P93/P94).
- Rivalernas konstruktioner är enkla (beslut 9F); de syns som rubriker, inte som något du kan bedöma på kartan.
- **Del F är byggd (P132–P137) med gränssnitt:** exportregler och exklusivitet, civil gren, specialprojekt, namngivna chefskonstruktörer, licenser med
  embargo-konkurrent och kundanpassning. Känn efter på telefon: typbladets taggar och licenssektion, ritbordets civila linje, specialprojekt och
  chefskonstruktör, budmappens kundanpassning och exportstämplar. Inga botspel når exportbrottet (`exportBreaches` 0) — det måste provas för hand
  (rita `forward`/`ahead` till generation 2 och sälj över blockgränsen). Se `docs/ANDRINGSLOGG.md` 2026-10-02.

## Efter speltestet

Avgör (§14 punkt 3) om resten av del F byggs i etapp 9 eller blir en egen etapp, och vilka av de
strukturella missarna i P130:s blockquote som ska bli kod snarare än data:

- gap-chocker per parti (ägarbeslutet om schemat 2026-09-30 mot måltabellens 1–3),
- pappersspår som kommer fram,
- hävda kontrakt,
- unga intäkter och först på plats.
