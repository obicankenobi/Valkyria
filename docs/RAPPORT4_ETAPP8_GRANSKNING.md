# Rapport 4 — etapp 8 granskad, och idéer framåt

**THE SEVENTH FRONT** · 2026-09-30, schemalagd körning 05:00 · mot `7606322` (efter P103)

> **Tolkningar i den här körningen.** Ägaren sov och kunde inte tillfrågas. (1) "Gå igenom
> implementeringen" tolkades som: jämför det byggda mot `ETAPP8_FORSLAG.md` och
> `ANDRINGSLOGG.md`, och mät spelet med harnessen. Ingen kodgranskning rad för rad. (2)
> Förbättringsförslagen ligger i den här rapporten (§4), inte i etapp 9-dokumentet, så att
> förslaget till etapp 9 går att anta utan att ta ställning till allt annat. (3) Ingen kod i
> `packages/` är ändrad. Harnessens CSV är gitignorerad och inte incheckad.

---

## 1. Vad etapp 8 har levererat

| Prompt | Innehåll | Läge |
|---|---|---|
| P96 | `GameState.ledger`, huvudboken, balanstest på kronan | byggd |
| P97 | Huvudboken i THE COMPANY, styrelsens PM | byggd |
| P98 | Förskott 10–40 %, behålls vid konkurs, betalas tillbaka vid utebliven leverans | byggd |
| P99 | Förskotts- och kreditstämpel i budmappen | byggd |
| P99b | **EMBARGO-fällan rättad** (RAPPORT3): relation startar på 30, varning turen innan | byggd, utanför ursprunglig plan |
| P99c | Tjänstemäns relation förfaller; botarna spenderar bara ur överskott | byggd, utanför ursprunglig plan |
| P99d | FAVOUR får en verklig kostnad (marginalskuld) | byggd, utanför ursprunglig plan |
| P100 | Stående order: linjeuppdrag, leverantörsavtal, stationsläge, tre larm | byggd |
| P101 | Anslagstavlan i THE COMPANY | byggd |
| P102 | Belopp som köper odds för fyra verb; "under utredning" (8E) | byggd |
| P103 | Botpolicyn `human`, `balanced-pwc`, `capacity-pwc`, sju nya mätkolumner | byggd |
| P104 | Balanspasset mot §7.2 | **ej påbörjad** |
| P105 | Speltest | **ej påbörjad** |

Tre saker i processen var bra. Embargorättelsen fick ett **spelbarhetstest i CI**
(`packages/harness/test/playability.test.ts`), precis det RAPPORT3 bad om. Harnessen skriver nu en
slutfördelning per bot efter varje körning. Och P99c/P99d hittade själva två följdfel (relationen
sjönk aldrig, FAVOUR var gratis) och rättade dem som ägarbeslut i stället för att bygga runt dem.

---

## 2. Spelet i dag: går att vinna, troligen för lätt

Harnessen vid `7606322`, 200 partier per bot:

| Bot | Vinst | Slutar (median) | Kontrakt | Utgångar |
|---|---|---|---|---|
| `passive` | 0 % | tur 14 | 13 | BUYOUT 200 |
| `aggressive` | 41,5 % | tur 20 | 37 | BUYOUT 115, vinst 83, NUCLEAR 2 |
| `balanced` | 68,5 % | tur 20 | 31 | vinst 137, BUYOUT 63 |
| `capacity` | 1,5 % | tur 10 | 3 | BUYOUT 187, INSOLVENCY 10 |
| **`human`** | **96,5 %** | tur 20 | 29 | vinst 193, BUYOUT 7 |
| `balanced-pwc` | **100 %** | tur 20 | 41 | vinst 200 |
| `capacity-pwc` | 9,5 % | tur 16 | 16 | INSOLVENCY 161, NUCLEAR 12 |

Jämfört med RAPPORT3 (6 vinster av 400) är det en vändning. Passivitet straffas nu, som
DESIGN.md §4 avser. Men den spelarlika boten vinner 96,5 % mot måltabellens 40–70 %, och en bot
som bara bjuder på rätt kurva vinner varje parti. **Så fort man bjuder rätt finns det nästan inget
motstånd.**

Övriga mått (samma körning):

| Mått | `human` | Mål i ETAPP8 §7.2 | Kommentar |
|---|---|---|---|
| Förskottets andel av intäkterna | 42 % (alla botar 33–44 %) | 15–35 % | för generöst |
| Lägsta kassa tur 1–6 (median) | 2,2 Mkr | < 20 % under noll | kassatorkan är borta |
| Partier med minst en vapenvila | 4 % (övriga botar 0 %) | 20–50 % | pelare 1:s andra halva prövas nästan inte |
| Partier med minst ett larm från stående order | 2 % | > 50 % | stående order spelar sällan roll |
| Doomsday, median av högsta värde | 28 | – | kriser (≥ 75) i 4 av 200 partier |
| Lyckade kupper / utbytta tjänstemän | 0 % / 0 % (`aggressive`: 4 % / 15 %) | – | politiken syns nu i utfallen, men bara för `aggressive` |

`balanced-pwc` får 10,9 % av sina inskickade handlingar avvisade, mot 0,9 % för `human`. Det är
värt en titt i P104. En bot som vinner allt trots en tiondel ogiltiga handlingar säger något om
hur lite handlingarna betyder.

---

## 3. Vad P104 behöver veta

1. **Svårighetsgraden är fel håll nu.** Mätningen i RAPPORT3 och P99b handlade om att spelet inte
   gick att vinna. Nu är risken den motsatta. P104 bör i första hand sänka `human` mot 40–70 %.
   Förskottet (33–44 % av intäkterna, mot målet 15–35 %) är den mest uppenbara spaken: att sänka
   `advancePctMax` från 40 till 25 är en ren dataändring.
2. **Spelbarhetstestet har bara ett golv.** Det underkänner om ingen bot vinner 30 %, men inte om
   alla vinner. Lägg till ett tak: underkänn om någon *enkel* bot (`balanced-pwc`) vinner över
   90 %. Tröskeln är ett ägarbeslut.
3. **Vapenvilor och larm når inte sina rader.** Båda är strukturella, inte kalibreringsfrågor, och
   bör revideras med motivering hellre än tvingas fram med tal (samma linje som P52/P58).

---

## 4. Förbättringsförslag och idéer

### Spelet

- **Ett svårare motstånd i stället för sämre villkor.** Rivalerna har i dag ingen teknik, ingen
  kassa och ingen strategi utöver prissättning. En enkel rival som *reagerar* på spelaren, till
  exempel sänker priset hos köpare där spelaren vunnit tre kontrakt i rad, ger svårighet som
  känns rättvis. Det passar etapp 9 (rivalernas teknik) eller en egen liten etapp.
- **Låt vapenvila hända av sig själv ibland.** Den kräver i dag `BACK_CHANNEL` från spelaren, så
  ingen bot utom `human` når den. Pelare 1:s andra halva, "för lite krig för att överleva
  kvartalet", behöver att fred kan komma *mot spelarens vilja*: en stormakt som tvingar fram
  förhandlingar när doomsday varit högt länge. Då blir doomsday både ett hot och ett sätt att
  förlora kunder.
- **Köpare i Thailand och Kambodja** (RAPPORT3 §6, fortfarande aktuellt). Kartan ritar sex länder,
  tre köper.
- **Mät `SELL_THE_FILE`** (RAPPORT3 §3). Fortfarande omätt.

### Processen

- **Ett speltest, inte två.** P95 (etapp 7) och P105 (etapp 8) väntar båda. Efter P104 täcker
  ett och samma speltest båda etapperna, med frågan i ETAPP7 §1 och ETAPP8 §1.
- **`CLAUDE.md` växer fortfarande:** 8 800 ord nu, mot 8 000 för tre dagar sedan. Ändringsloggen
  har passerat 50 000 ord. Förslaget från RAPPORT3 står kvar: behåll regler, aktuellt läge och
  pekare i `CLAUDE.md`, och låt historiken bo i loggen och specarna. Det är en halvtimmes
  uppgift för en kodsession och sparar kontext i varje session därefter.
- **Slutfördelningen per bot i varje loggrad** som rör kärnan. P99b–P99d gjorde det redan, och det
  är skälet till att den här rapporten gick snabbt att skriva. Gör det till en regel i
  `CLAUDE.md`.

### Upplevelsen

- **Slutkortet som något att dela.** Epilogen (P89) har fyra axlar och vändpunkter. Ett
  "stencilerat PM" som går att spara som bild ger spelaren en anledning att spela om och jämföra,
  vilket är vad DESIGN.md §17 vill.
- **Ett andra scenario, `SUEZ`** (14 turer, en köpare, en kris), som prov på att systemen håller
  utanför Indokina. Kartan är redan byggd för det (ETAPP7 §14).
