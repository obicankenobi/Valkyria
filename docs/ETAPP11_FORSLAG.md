# Etapp 11 — Verken

**THE SEVENTH FRONT** · **ANTAGEN 2026-10-06** · skriven mot `e16b3ef`

> **Status:** antagen av ägaren 2026-10-06 med alla rekommendationer (besluten 11A–11M), loggat i
> `ANDRINGSLOGG.md`. Filen behåller namnet. Ägaren lade till ett beslut om namn (11N): enheten inne i ett
> monteringsverk heter **produktionslinje** ("Production line" i gränssnittet), inte "bås". Etappen körs
> efter P162–P167 i etapp 10 (beslut 10P). Premisskontrollen i §0 görs om mot koden före P168.
> Ägaren bad 2026-10-06 om ett större och fördjupat produktionssystem som blir en central del av spelet:
> det ska kännas som att leda ett företag, det ska inte gå att strunta i, och det ska behöva skötas och
> byggas ut under hela partiet. Olika anläggningar ska ha olika funktion. Huset ska börja med ett gratis
> forskningslabb för den utrustning spelaren valt och bygga ut resten själv.

---

## Innehåll

0. Premisskontroll · 1. Frågan · 2. Designprinciper · 3. Ägarbeslut ·
4. Del A, anläggningarna · 5. Del B, driften · 6. Del C, kunskapen · 7. Del D, utlandet ·
8. Gränssnittet · 9. Härness och måltabell · 10. Skyddsräcken · 11. Promptsekvens ·
12. Utanför etappen · Bilaga A, förebilder

---

## 0. Premisskontroll

Kontrollerat mot koden 2026-10-06.

| # | Premiss | Belägg |
|---|---|---|
| 0.1 | Huset börjar med fyra identiska linjer. En linje har ingen typ, plats, nivå eller kategori. | `types.ts:360-372`, `indochina-slice.json:14-15` |
| 0.2 | `BUILD_LINE` kostar £1 200 000 och en handling. Linjen står klar samma tur och är en kopia. Tak nio. | `applyActions.ts:240-266`, `balance.json` |
| 0.3 | Takten styrs av produkten, inte av linjen. Linjens egen faktor är alltid 1,0. | `production.ts:46-49, 167-171` |
| 0.4 | En ledig linje tar automatiskt första kontrakt som behöver produktion. Enda styrningen är kategori eller "any" och normal eller övertid. | `production.ts:113-135`, `StandingOrdersBoard.tsx:341-375` |
| 0.5 | Omställning kostar en tur och utlöses bara av byte av produkt, aldrig av byte av konstruktion. | `production.ts:137-152`, logg P112 |
| 0.6 | Kapaciteten binder inte. Utnyttjande över 30 partier: `human` 36 %, `balanced` 27 %, `aggressive` 49 %. Ingen bot bygger en linje. Spelarens hävda kontrakt per parti: 0. | mätning 2026-10-06 |
| 0.7 | Det finns sju produkter, en per kategori plus en restricted. | `data/products.json` |
| 0.8 | Forskning, konstruktion, provning och civil linje är stående order utan plats eller tak. De kostar pengar per tur och begränsas bara av kassan. | `research.ts`, `design.ts`, `civil.ts` |
| 0.9 | Personalen är tre tal (45 från start) som bara verkar över en tröskel. | `economy.ts:60`, `research.ts:38`, `queries.ts:345` |
| 0.10 | Specialiseringen ger tekniknivå 7 i sin kategori, 1 % budbonus och halverad forskningskostnad. Den påverkar inte linjerna. | `state.ts:80-88`, `bidTerms.ts:26-27` |
| 0.11 | Motköpet i en upphandling är ett löfte om lokal tillverkning som bara sänker marginalen. Ingen fabrik byggs. | `programme.ts`, P123 |
| 0.12 | Fasta kostnader: £18 000 per linje och tur, plus £45 000 i lön per linje utöver de fyra första. | `balance.json` `fixedCosts.lineUpkeep` / `payrollPerExtraLine` (tidigare hänvisad till `economy.ts:50, 78-81`) |

Följd: i dag finns inget beslut om produktion som spelaren måste fatta. Etappen ska ändra just det.

**Omkontroll 2026-10-07 (P168), mot koden efter P167:** 0.1–0.5, 0.7–0.10 och 0.12 håller; 0.1, 0.2, 0.7, 0.9 och 0.12 är nu bundna av
`packages/core/test/etapp11Premises.test.ts`, så att ett glid fäller ett test i stället för att upptäckas senare. 0.12:s hänvisning hade glidit
(talen ligger i `balance.json`, inte i `economy.ts`) och är rättad ovan. 0.6 mättes om, se §9 "Nolläge". Inget annat antagande föll.

---

## 1. Frågan

*Är huset något man bygger och sköter?* Delfrågor:

1. Tar kapaciteten slut, så att spelaren måste välja vilka affärer huset har råd att vinna?
2. Är två hus efter tio kvartal synbart olika, beroende på vad spelaren byggt?
3. Finns det varje kvartal minst ett beslut på verken som spelar roll?
4. Förlorar den som struntar i verken?
5. Känns det som ledning och inte som bokföring? (Avgörs i speltestet.)

---

## 2. Designprinciper

1. **Kapacitet är den knappa resursen.** Efterfrågan ska överstiga vad huset kan bygga. Varje vunnet
   kontrakt tar plats från ett annat.
2. **Anläggningar har olika uppgift.** Ingen anläggning är en kopia av en annan, och ingen är valfri för
   den som vill växa.
3. **Byggen tar tid.** Den som bygger i dag har kapaciteten om ett år. Det tvingar fram planering och gör
   varje historisk händelse och varje kravkort till en fråga om beredskap.
4. **Fasta kostnader gör fel beslut dyra.** En tom hall kostar. Ett hus som byggt för mycket blöder, ett
   som byggt för lite tappar affärer.
5. **Långa serier lönar sig.** Det som tillverkas länge blir billigare och går fortare. Det ger skäl att
   jaga seriekontrakt och att tveka inför omställning.
6. **En plats, inte en lista.** Verken visas som en tomtplan med byggnader, inte som rader i en tabell.
7. **Inga nya handlingsslag i onödan.** Byggen och driftsbeslut är stående order, som resten av huset
   sedan etapp 8. Handlingarna förblir tre per kvartal.
8. **Allt som i dag saknar plats får en.** Forskning sker i ett labb, konstruktion på ett ritkontor,
   provning på en provplats. Det som finns i etapp 9 görs inte om, det får väggar.

---

## 3. Ägarbeslut (fattade 2026-10-06)

| | Fråga | Beslut |
|---|---|---|
| **11A** | Fristående linjer eller linjer i anläggningar? | **Linjerna flyttar in.** Varje produktionslinje hör till ett monteringsverk. Inga fristående linjer finns kvar. En modell, inte två. |
| **11B** | Vad huset börjar med | **Ett monteringsverk med två produktionslinjer i den valda kategorin, ett gratis labb i samma kategori och ett ritkontor med ett bord.** Ingen provplats, ingen depå. |
| **11C** | Hur många tomter | **Åtta på hemmatomten.** Mer mark går att köpa, dyrt. Tomterna tar slut före pengarna. |
| **11D** | Arbetsstyrkans djup | **Bemanning och yrkesskicklighet per anläggning.** Inga namngivna arbetare. |
| **11E** | Underleverantörer | **Ja.** Ett kontrakt kan läggas ut: dyrare, lägre kvalitet, ingen inkörning. Det är säkerhetsventilen när kapaciteten är slut. |
| **11F** | Tillverkning på lager | **Ja, med en depå.** Färdiga varor kan levereras direkt, men åldras när blocken kliver en generation. |
| **11G** | Fabriker utomlands (del D) | **Ja, som sista del och första att kapa.** De gör motköpet till en verklig fabrik och sätter verken på kartan. |
| **11H** | Nytt steg i turordningen? (hård regel 7) | **Nej.** Byggen och inkörning räknas i `production`, löner och underhåll i `economy`. |
| **11I** | Golden | **Får frysas om i promptar märkta "regel" i §11,** egen commit, efter verifiering. Samma ordning som 10D. |
| **11J** | Personalens tre tal | **Behålls som husets tre direktörer.** Arbetsstyrkan är något annat och ligger på anläggningarna. |
| **11K** | Sparade partier | **Migreras:** fyra linjer blir två verk med två linjer var. Ett test bevisar det. |
| **11L** | Rivalernas kapacitet | **Ett enda tal per rival i den här etappen.** En rival som är fullbelagd bjuder dyrare. Egna verk för rivalerna hör till etapp 10B. |
| **11M** | Fler produkter | **Inte i den här etappen.** Sju produkter räcker, eftersom husets egna konstruktioner ger variationen. Se §12. |
| **11N** | Vad enheten i ett verk heter | **Produktionslinje.** "Production line" i gränssnittet, `line` i koden. Ordet "bås" används inte. |

---

## 4. Del A — Anläggningarna

### 4.1 Tomten

Huset har en hemmatomt med åtta platser. Varje anläggning tar en plats. Verken visas som en tomtplan
(§8). Mer mark kan köpas en gång, fyra platser till ett högt pris.

### 4.2 De sju anläggningarna

| Anläggning | Vad den gör | Utan den |
|---|---|---|
| **Monteringsverk** (Assembly Works) | Bygger materiel i en kategori. Har 2–6 produktionslinjer. Varje linje är uppsatt för en produkt eller konstruktion. | Ingen egen tillverkning i kategorin. Kontrakt måste läggas ut. |
| **Komponentverkstad** (Component Shop) | Tillverkar delar åt verken. Sänker styckkostnaden och halverar råvaruindexens genomslag. Betjänar högst två verk. | Verken köper delar utifrån, till fullt pris och med full råvarurisk. |
| **Laboratorium** (Laboratory) | Bedriver forskning i en kategori. Nivån sätter taket för tekniknivån och antalet samtidiga projekt. | Ingen forskning i kategorin. |
| **Ritkontor** (Design Office) | Rymmer konstruktionsprojekt, ett per bord. Chefskonstruktören sitter här. | Inga egna konstruktioner. |
| **Provplats** (Proving Ground) | Rymmer provning. Klimatkammare låser upp miljöprov (djungel, monsun, berg) och avslöjar miljöbrister före leverans. | Provning kan inte beställas. Brister upptäcks i fält. |
| **Depå** (Depot) | Lagrar färdig materiel och reservdelar. Tillåter tillverkning på lager och uppgraderingssatser ur hyllan. | Allt byggs mot order. |
| **Civilt verk** (Civil Works) | Den civila grenen från etapp 9, nu en byggnad. Kan ställas om till monteringsverk och tillbaka, med omställningstid. | Ingen civil intäkt. |

Varje anläggning har **nivå** 1–3, **skick** 0–100, **bemanning**, **status** (under byggnad, i drift,
omställning, stillestånd, strejk) och en **fast kostnad** per kvartal.

### 4.3 Att bygga

- Ett bygge är en stående order (`WORKS BUILD`). Det kostar ingen handling.
- **Byggtid:** två till fyra kvartal, beroende på slag och nivå. Kostnaden betalas i rater under bygget.
- **Utbyggnad:** en anläggning kan byggas ut en nivå. Verk får fler linjer, labb högre tak, ritkontor fler bord.
  En utbyggnad stör driften: anläggningen går på halv fart under bygget.
- **Forcerat bygge:** halva tiden mot dubbla priset.
- **Avveckling:** en anläggning kan säljas för en del av värdet. Arbetsstyrkan försvinner.
- Tillgångarna syns i balansräkningen. Styrelsen räknar dem inte som intäkt.

### 4.4 Startpaketet

Valet av specialisering vid nytt parti avgör vad som står på tomten:

- ett monteringsverk, nivå 1, två produktionslinjer, i den valda kategorin
- ett **laboratorium, nivå 1, i samma kategori, utan byggkostnad** (ägarens önskemål)
- ett ritkontor med ett bord

Fem platser är tomma. Grundkapitalet räcker till ungefär två anläggningar till, inte fem. Första årets
fråga blir därmed vad huset ska bli.

### 4.5 Linjer och uppsättning

- En produktionslinje är **uppsatt** (tooled) för en produkt eller en av husets konstruktioner.
- **Omställning** kostar tid och pengar. Byte inom samma familj (en uppgradering av samma konstruktion) är
  kort. Byte till en ny konstruktion är längre. Byte till en annan produkt är längst.
- Därmed avgörs premissfyndet från P112: **en ny konstruktion kräver omställning.**
- Spelaren lägger en **produktionsplan**: vilken linje bygger vad, i vilken ordning. Lämnas den tom fördelar
  huset själv, men sämre än en uppmärksam spelare (det är avsikten).

### 4.6 Kapaciteten räknas om

- Takten per linje sänks och orderstorlekarna ses över, så att huset från start klarar ungefär hälften av
  de affärer det kan vinna.
- **Sen leverans** får följder som i dag: vite, tappad pålitlighet, återbetalt förskott. Skillnaden är att
  det nu händer.
- Budmappen visar **när ordern kan vara klar** med dagens plan, och vad den tränger undan.
- Målet är ett utnyttjande på 70–90 % för en spelare som sköter verken.

---

## 5. Del B — Driften

### 5.1 Arbetsstyrkan

- Varje anläggning har **bemanning** (andel av full styrka) och **yrkesskicklighet** (0–100).
- Att anställa tar ett kvartal. Nyanställda sänker skickligheten först och höjer den sedan.
- **Uppsägning** sparar lön direkt, men skickligheten går förlorad och stämningen på de andra
  anläggningarna sjunker.
- **Lönerna stiger** när kriget trappas upp och hela industrin anställer.
- **Strejk:** låg stämning, mycket övertid och uppsägningar kan utlösa en strejk. Anläggningen står tills
  spelaren ger med sig (lön), väntar ut den (tid) eller bryter den (stämning och redbarhet).

### 5.2 Inkörning

- En linje som bygger samma sak blir bättre på det. Styckkostnaden faller och takten stiger för varje
  fördubbling av antalet byggda enheter, upp till ett tak.
- Omställning nollställer inkörningen för den linjen. Samma familj behåller en del.
- Följden är att en lång serie är värd mer än summan av sina kvartal, och att ett seriekontrakt ur en
  upphandling (etapp 9) blir det stora priset.

### 5.3 Skick och underhåll

- Skicket sjunker med användning, fortare på övertid.
- Spelaren sätter en **underhållsnivå** per anläggning (låg, normal, hög). Låg sparar pengar nu.
- Dåligt skick ger haverier (stillestånd) och sämre kvalitet på det som byggs, vilket slår mot
  konstruktionernas rykte i fält.
- **Modernisering** (nya verktygsmaskiner) återställer skicket och höjer takten. Det är en investering
  med byggtid.

### 5.4 Övertid och skift

Övertiden från etapp 8 flyttar in här: normalt skift, övertid eller två skift. Två skift kräver
dubbel bemanning och sliter mer.

### 5.5 Lägga ut tillverkning

- Ett kontrakt, eller en del av det, kan läggas ut på en underleverantör (11E).
- Det kostar mer per enhet, ger ingen inkörning och ger kvalitet i underkant.
- Underleverantören kan bli sen, och då är det husets namn på kontraktet.
- Underleverantören lär sig. Den som lägger ut för mycket för länge föder en konkurrent, på samma sätt
  som licenstagaren i etapp 9.

### 5.6 Depån

- Med en depå kan en linje bygga **på lager** när den saknar order.
- Lagervaror kan levereras samma kvartal som budet vinns, vilket ger bättre leveranspoäng och gör
  nödleveranser möjliga (Tet, en gap-chock).
- Lager binder pengar och **åldras**: när blocket kliver en generation faller värdet.

---

## 6. Del C — Kunskapen

Etapp 9:s system får väggar. Reglerna i dem ändras inte, bara var de sker och hur mycket som ryms.

- **Laboratoriet.** Ett forskningsspår kräver ett labb i kategorin. Nivå 1 når tekniknivå 6, nivå 2 når 8,
  nivå 3 når 10. Nivån avgör också hur många projekt som kan drivas samtidigt. Det fria labbet vid start
  är husets försprång i den valda kategorin. Att bredda sig till en ny kategori kostar ett labb och en plats.
- **Ritkontoret.** Ett konstruktionsprojekt kräver ett ledigt bord. Chefskonstruktören arbetar på ett
  kontor och ger sin egenskap åt projekten där.
- **Provplatsen.** Provning kräver en provplats. Utan klimatkammare kan en miljöbrist inte avslöjas
  hemma. Med kammaren för rätt miljö hittas den före leverans.
- **Krasprogrammet** tar ett labb i anspråk helt: övriga projekt i det labbet står stilla.
- **Kopplingen till verken:** en konstruktion som ritats för enkel tillverkning (inriktning) ställs om
  fortare och körs in fortare. Det ger inriktningen ett pris som märks på verkstadsgolvet.

---

## 7. Del D — Utlandet

Kan kapas utan att resten faller (11G).

- Huset kan bygga ett **monteringsverk i ett köparland**. Det syns på teaterkartan.
- **Motköpet blir verkligt:** löftet om lokal tillverkning i en upphandling uppfylls genom att fabriken
  byggs. Ett ouppfyllt löfte kostar relation och ger vite.
- **Fördelar:** lägre löner, korta leveranser, högre poäng hos alliansfria tjänstemän, och en hållhake:
  landet vill inte stänga sin egen fabrik.
- **Risker:**
  - **Kriget.** Ett verk i en sektor som byter sida är förlorat, med allt som står i det.
  - **Regimskifte.** Efter en kupp kan fabriken förstatligas. En fabrik som huset själv hjälpt en kupp
    att ta över blir en fråga för redbarheten.
  - **Kunskapsspridning.** Arbetsstyrkan lär sig. Landet närmar sig egen tillverkning, som en licenstagare.
  - **Exportreglerna** från etapp 9 gäller det som byggs där.
- **De historiska händelserna** (etapp 10B) får något att träffa: Tet hotar ett verk i Saigon, fredssamtalen
  gör det värdelöst som vapenfabrik och värdefullt som civilt verk.

---

## 8. Gränssnittet

THE COMPANY byggs om kring verken. Det ersätter P145 i etapp 10.

1. **Tomtplanen (THE WORKS).** En ritad situationsplan över hemmatomten i 1965 års stil: byggnader sedda
   uppifrån, spår, grindar, tomma platser med stakade hörn. Varje byggnad visar med lampor om den går,
   står eller bygger. Ett tryck öppnar anläggningens kort. Ett tryck på en tom plats öppnar byggmenyn.
   Planen och byggnaderna ritas av tillgångsfabriken.
2. **Anläggningskortet.** Vad anläggningen gör i en mening, nivå, skick, bemanning, fast kostnad, vad
   den håller på med, och vad nästa nivå skulle ge. Samma kortmall som handlingskortet i P163.
3. **Produktionstavlan.** En planeringstavla med ett spår per linje och kvartalen som kolumner: vad som
   byggs, när det är klart, vad som står i kö, var omställningar ligger. Kontrakt dras till en linje.
4. **Budmappen** visar "ready by" och vad ordern tränger undan.
5. **Larm** i *This Quarter*: tom linje, kontrakt som blir sent, underbemannat, dåligt skick, strejkrisk,
   bygge klart.
6. **THE COMPANY** får fyra lådor: *Works* (tomtplan och produktionstavla), *Drawing office* (ritkontor,
   labb, provplats, typblad), *Books* (balans, huvudbok, styrelse) och *Legal*.
7. **Nytt parti:** valet av specialisering visar startpaketet som en liten tomtplan.
8. **Handledningen** får steg för att bygga, planera en linje och läsa ett larm.

UI-reglerna 1–18 och `art-director` gäller.

---

## 9. Härness och måltabell

**Härnessen:**
- `human` sköter verken efter enkla regler. Nya varianter: `human-builder` (bygger tidigt och mycket),
  `human-static` (bygger aldrig), `human-outsource` (lägger ut i stället för att bygga),
  `human-specialist` (en kategori, djupt) och `human-broad` (tre kategorier, grunt).
- Nya kolumner: utnyttjande per kvartal, byggda anläggningar per slag, sena leveranser, utlagd andel,
  inkörningsnivå, strejker, haverier, lagervärde, förlorade verk utomlands.

**Nolläge (P168, 2026-10-07).** 100 partier per bot mot `indochina-slice`, före all etapp 11-kod. Kolumnerna är nya i P168
(`lineUtilizationPct`, `peakLineUtilizationPct`, `linesBuilt`, `lateContracts`); utnyttjande = andelen linjer med status `running` efter en turs
avgörande, medel över spelade turer. "Hela partier" = bara partier som nådde `SCENARIO_COMPLETE` (annars drar korta partier ned medlet).

| Bot | Utnyttjande, medel | … hela partier | Topp, enskild tur | Byggda linjer | Sena kontrakt per parti | Partier med minst ett sent | Vinst |
|---|---|---|---|---|---|---|---|
| `human` | 32,6 % | 34,9 % | 93,2 % | 0,0 | 0,00 | 0 % | 56 % |
| `balanced` | 19,2 % | 36,2 % | 65,2 % | 0,0 | 0,01 | 1 % | 33 % |
| `aggressive` | 38,0 % | 49,0 % | 92,2 % | 0,0 | 0,05 | 4 % | 5 % |
| `passive` | 19,9 % | – | 65,8 % | 0,0 | 0,00 | 0 % | 0 % |
| `capacity` | 14,5 % | 26,8 % | 55,0 % | 0,0 | 0,00 | 0 % | 2 % |

Utnyttjandet över hela partier (27–49 %) ligger i samma band som 2026-10-06-mätningen (27–49 %), så premiss 0.6 står: kapaciteten binder inte, ingen bot
bygger en linje, och sena leveranser är i praktiken noll (målet efter etappen är 1–4 per parti). Toppen når 93 % en enskild tur — linjerna är sällan
fulla samtidigt, vilket är den siffra P172 (kapaciteten räknas om) ska flytta. Mätningen ändrar ingen regel; golden är orörd.

**Måltabell:**

| Rad | Mål | Fetstilt |
|---|---|---|
| Utnyttjande, `human` | 70–90 % | **ja** |
| `human` mot `human-static`, vinst | ≥ 25 procentenheter högre | **ja** (går inte att strunta i) |
| `human-builder`, konkurs | 10–30 % (att bygga för mycket ska kunna fälla huset) | **ja** |
| `human-specialist` och `human-broad`, vinst | båda ≥ 35 % | **ja** (två sätt att bygga) |
| `human-outsource`, vinst | 20–50 % (en ventil, inte en strategi) | |
| Byggda anläggningar per parti, `human` | 3–6 | |
| Kvartal där `human` har minst ett driftsbeslut som ändrar utfallet | ≥ 60 % | **ja** |
| Sena leveranser per parti, `human` | 1–4 | |
| Partier där tomterna tar slut före partiets slut | 30–60 % | |
| Andel av styckkostnadens fall som kommer av inkörning i en serie på åtta kvartal | 15–30 % | |
| `human`, `SCENARIO_COMPLETE` | 40–70 % | **ja** |

> **Utfall (P182–P183, 2026-10-07; 100 partier per bot, efter att `buildCost` halverats och `boardTarget.threshold` höjts 2,45 → 2,9).**
> **Nådda:** `human` `SCENARIO_COMPLETE` 53 % (mål 40–70) och `human-outsource` 48 % (20–50). **Inte nådda:** `human` mot `human-static` +2 pp (≥ 25);
> utnyttjande 14 % (70–90); `human-builder` konkurs 90 % (10–30); `human-specialist` 12 % och `human-broad` 0 % (≥ 35); byggda anläggningar 0,4 + 0,7
> utbyggnader (3–6); driftsbeslut 22 % som övre gräns (≥ 60); sena leveranser 0,7 (1–4); tomten full 0 % (30–60); inkörningens andel ej mätt.
> **Diagnos:** kapaciteten binder inte (77 % av enheterna går via underleverantör; `subcontractUnitsFactor` 0,2–0,6 gav identiska utfall), styckkostnaden är en
> liten del av priset, och kassan ligger nära noll kvartal 6–9, så ett bygge fäller huset. En rutnätssökning över 36 kombinationer av tal gav aldrig mer än +10 pp
> för `human`. **Att bygga lönar sig alltså inte med reglerna som de är; det behövs en regel (utläggningstak, större orders mot linjetakten, finansiering av bygget
> eller ryktet som kostnad), inte ett tal — ägarens beslut efter P184.** Vakterna (spelbarhetstestet och `capacity`-referensen) håller utan revidering. Se
> `docs/ANDRINGSLOGG.md` (P182, P183) och `docs/SPELTEST_ETAPP11.md`.

Spelbarhetstestets golv och tak och capacity-referensen ska hålla, eller revideras uttryckligen av ägaren.
Etappen flyttar hela ekonomin, så en revidering är trolig och ska beslutas, inte ske tyst.

---

## 10. Skyddsräcken

1. **En modell.** När del A är byggd finns inga fristående linjer kvar i kod eller data.
2. **`computeScore` rörs inte.**
3. **En formel, en källa:** takt, klar-datum och styckkostnad räknas på ett ställe och läses av kärnan,
   budmappen och produktionstavlan.
4. **All slump via `ctx.rng`** (haverier, strejker).
5. **Alla tal i `balance.json`.** Anläggningarnas data ligger i en egen datafil.
6. **Varje ändring ger en `WireEvent`** med orsak: bygge klart, haveri, strejk, sen leverans.
7. **Sparade partier migreras** och ett test bevisar det (11K).
8. **Golden** fryses bara om enligt 11I.
9. **Stegordningen ändras inte** (11H).
10. **Etapp 9:s regler för forskning, konstruktion och provning ändras inte,** bara deras tak och plats.

---

## 11. Promptsekvens

| Del | Prompt | Innehåll | Typ |
|---|---|---|---|
| **Grund** | P168 | Premisskontroll; härnesskolumner för utnyttjande, byggen och sena leveranser; nolläge | mätning |
| **A Anläggningarna** | P169 | Anläggningsmodellen, datafilen, linjerna flyttar in i verk, migrering av sparade partier | regel |
| | P170 | Tomten, byggen med byggtid och rater, utbyggnad, forcering, avveckling; startpaketet och det fria labbet | regel |
| | P171 | Uppsättning och omställning, även för konstruktioner; produktionsplanen | regel |
| | P172 | Kapaciteten räknas om; "ready by" och undanträngning; underleverantörer | regel |
| **B Driften** | P173 | Arbetsstyrkan: bemanning, skicklighet, löner, uppsägning, strejk | regel |
| | P174 | Inkörning; skick, underhåll, modernisering; skift | regel |
| | P175 | Depån och tillverkning på lager | regel |
| **C Kunskapen** | P176 | Labb, ritkontor och provplats sätter tak för forskning, konstruktion och provning | regel |
| **D Utlandet** | P177 | Verk i köparland: motköpet, krigsrisk, förstatligande, kunskapsspridning | regel |
| **Gränssnitt** | P178 | Tillgångsfabriken: tomtplan och byggnader | tillgång |
| | P179 | Tomtplanen, anläggningskortet, byggmenyn; THE COMPANY i fyra lådor | UI |
| | P180 | Produktionstavlan; "ready by" i budmappen; larm | UI |
| | P181 | Nytt parti, handledning, handbok; verk på teaterkartan | UI |
| **Mätning** | P182 | Härnessens botar och kolumner | mätning |
| | P183 | Balanspass; vakterna revideras om ägaren beslutar det | regel |
| | P184 | Speltest | ingen kod |

**Kapningsordning:** P177 (utlandet) först, sedan P175 (depån), sedan strejkerna i P173. Anläggningarna,
byggtiden, omställningen, kapaciteten och inkörningen kapas inte.

**Tidigt speltest:** efter P172 och P179 finns en spelbar kärna. Ägaren bör spela då, innan del B byggs.

---

## 12. Utanför etappen

- **Fler produkter per kategori.** Sju produkter gör uppsättningen grov. En produktkatalog med två eller
  tre per kategori skulle ge verken mer att välja mellan, men den flyttar hela ordermodellen.
- **Rivalernas egna verk.** Här har de ett kapacitetstal. Verk som går att sabotera hör till etapp 10B.
- **Leveranskedjor** med flera led och namngivna underleverantörer.
- **Flera hemmatomter** och transporter mellan dem.
- **Fackföreningar som aktörer** med egna krav och ledare.

---

## Bilaga A — Förebilder

Allt i spelet förblir fiktivt (DESIGN.md §15). Förebilderna visar att mekaniken har verklig grund.

- **Inkörningen** följer den lärkurva som T. P. Wright beskrev för flygplanstillverkning 1936: kostnaden
  per enhet faller med en fast andel för varje fördubbling av antalet byggda.
- **Skuggfabrikerna** i Storbritannien från 1930-talets mitt: staten lät bilindustrin bygga och driva
  flygfabriker i reserv. Förebild för forcerade byggen och för civila verk som ställs om.
- **Licensbygget av F-104G** i Västeuropa från 1960: flera länder byggde samma flygplan i egna fabriker.
  Förebild för verk i köparland, motköp och kunskapsspridning.
- **Starfighter-krisen** och **M16-utredningen** (bilaga A i etapp 10) visar vad tillverkningskvalitet och
  underhåll betyder i fält.

Uppgifterna är allmänt kända men inte källkontrollerade på samma sätt som händelserna i etapp 10. De
kontrolleras innan något av dem skrivs in i speltext.
