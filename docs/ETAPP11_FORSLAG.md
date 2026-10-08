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
8. Gränssnittet · 9. Härness och måltabell · 9b. Kapaciteten blir knapp · 10. Skyddsräcken · 11. Promptsekvens ·
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
| **11O** | Vad gör kapaciteten knapp? (2026-10-07, efter P183) | **Huvudleverantörsregeln.** Huset får bara bjuda i en kategori där det har ett monteringsverk, och högst hälften av ett kontrakt får läggas ut. Ändrar 11E: underleverantörerna är en ventil med tak, inte obegränsad kapacitet. Se §9b. |
| **11P** | Hård eller mjuk spärr utan verk | **Mäts, och den som når måltabellen väljs.** Hård: inga bud utan verk i kategorin. Mjuk: små ordrar får tas, helt utlagda och med sämre marginal. Kodsessionen redovisar båda och väljer efter regeln i §9b. |
| **11Q** | Finansiering av byggen | **Byggnadslån.** En del av bygget lånas med anläggningen som säkerhet, utanför den vanliga kreditgränsen, och betalas av per kvartal. |
| **11R** | Orderstorlekar | **Höjs mot linjernas takt,** så att ett kontrakt håller en linje sysselsatt i flera kvartal. |
| **11S** | Ryktet som kostnad för utläggning | **Nej.** Fällde alla botar i mätningen och syns inte för spelaren. |
| **11T** | Speltestet P184 | **Flyttas till efter P186.** Före dess kan bara skärmarna bedömas. |
| **11U** | `human-broad` vinner 86–89 % mot taket 90 (2026-10-07, efter P186) | **Godkänns tills vidare.** Taket i spelbarhetstestet ändras inte. Siffran följer av den smala marknaden och mäts om efter P141. |
| **11V** | Marknadens bredd | **Löses i P141 (etapp 10), som körs direkt.** Köparna kan i dag bara beställa infanteri och artilleri, eftersom `blocTechLevelStep` står på 0. Ingen ny prompt i etapp 11. |
| **11W** | 11R:s klausul "marknadens värde ungefär oförändrat" | **Stryks.** Värdet steg cirka 3,4 gånger och styrelsens tröskel höjdes till 3,4. Utfallet godkänns; P141 kalibrerar om helheten. |
| **11X** | NLF:s och Laos budgetar | **Ändras inte nu.** En höjning bröt `capacity`-referensen. Ses över i P141. |
| **11Y** | Fältprovets sats, som växte med 11R | **Återställs** till storleken före P185 genom att andelen sänks. Görs i P141. |
| **11Z** | Speltestet P184 | **Flyttas till efter P141.** Ändrar 11T. Med dagens marknad får den som väljer en annan kategori än infanteri eller artilleri ett verk utan beställningar. |
| **11AA** | Utnyttjande 28 %, full tomt 0 %, driftsbeslut 44 % efter P141 (2026-10-08) | **Ny regel, P187: ett kontrakt kan tillverkas på flera linjer samtidigt.** Orsaken är att ett kontrakt i dag går på en linje i taget, så fler linjer bara hjälper med fler parallella kontrakt. Med regeln köper kapacitet snabbare leverans, som redan ger poäng i budet och tidigare betalning. |
| **11AB** | `human-specialist` 1 % | **Raden stryks.** Huvudleverantörsregeln (11O) gör en ren enkategorispecialist svag med avsikt: huset måste bygga för att växa. Specialiseringen vid start ger fortfarande labbet och budbonusen i startkategorin. `human-broad` och `human` mäter de två sätten att bygga. |
| **11AC** | Speltestet P184 | **Görs efter P187 och P188, före P150**, tillsammans med P148 (`docs/SPELTEST_ETAPP10A.md`). Ändrar 11Z. Ägaren har inte spelat sedan 2026-10-06, och hela etapp 11 och P141–P149 har byggts sedan dess. |
| **11AD** | P187 flyttade ingenting (2026-10-08) | **Premissfel i P187, designsessionens.** Specen antog att en kortare utlovad leveranstid ger poäng i budet. Det gör den inte: `computeScore` straffar bara en leveranstid som är längre än kravet. Kapacitet köper alltså ingen fördel. **Ny regel, P189:** en leveransterm efter `computeScore` (i `bidTerms.ts`, som `techTerm`) ger poäng för varje kvartal ett bud lovar under kravet, upp till ett tak. Rivalerna får samma term. |
| **11AE** | Kapacitetsraderna om P189 inte flyttar dem | **Förhandsbeslutat, ingen ny fråga:** når P189 inte utnyttjande 40 %, revideras raderna till utnyttjande "mäts, ingen gräns", full tomt "nåbar", nya anläggningar ≥ 1,5 per parti och driftsbeslut ≥ 40 %. Avsikten mäts då av raderna som redan nås: `human` minst 25 procentenheter över `human-static` och `human-builder` i konkurs i 10–30 %. Om verken känns som något man måste sköta avgör speltestet. |
| **11AF** | Speltestet P184 | **Efter P189 och P190, före P150.** Ändrar 11AC. |
| **11AG** | Leveranstermen efter P189 (2026-10-08) | **Stängs av till speltestet: `deliveryPromiseFactor` 0 och `boardTarget.threshold` tillbaka till 9,0**, det tillstånd som P189 verifierade som bit-identiskt med P188. Termen flyttade inte utnyttjandet (27 %), gav fler sena kontrakt (1,4 → 1,9) och gjorde kassadalen djupare (median −0,4 Mkr i kvartal 4–5), eftersom rivalerna nästan alltid tar den. Koden står kvar bakom talet. Ett undantag från "på eller bort" (10A) som gäller till speltestet; därefter slås den på med en rivalspärr eller tas bort. Förskottet ändras inte. P187 (flera linjer) och 11AE:s reviderade rader står kvar. |
| **11AH** | Kapaciteten | **Avgörs i speltestet**: känns verken som något man måste sköta? Inga fler regler för kapaciteten före det. |

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
>
> **Efter P185–P186 (2026-10-07):** se utfallstabellen i §9b — fem av de fetstilta raderna nås (`human` 48 %, +41 pp mot `human-static`, `human-broad` 86 %, `human-builder` konkurs 27 %, inkörningens andel 17 %); utnyttjande, `human-specialist`, driftsbeslut och tomten full nås inte.

> **Efter P141 (2026-10-07; beslut 11U–11Z, 100 partier per bot).** Marknaden är bredare (tekniknivån följer blockens generation), fem gånger större (köparnas budgetandel 0,24) och styrelsetröskeln är 11. Se
> `docs/ETAPP10_FORSLAG.md` §6 för vad som slogs på och vad som prövades och förkastades.
>
> | Rad | Mål | Före (P186) | Efter (P141) | |
> |---|---|---|---|---|
> | `human`, `SCENARIO_COMPLETE` | 40–70 % | 48 % | **47 %** | nådd |
> | `human`, konkurs | ≤ 10 % | 18 % | **0 %** | nådd |
> | `human` mot `human-static`, vinst | ≥ 25 pp | +41 pp | **+47 pp** (47 mot 0 %) | nådd |
> | `human-builder`, konkurs | 10–30 % | 27 % | **18 %** | nådd |
> | `human-broad`, vinst | ≥ 35 % och under taket 90 | 86 % | **80 %** | nådd (marginalen mot taket växte) |
> | `human-outsource`, vinst | 20–50 % | 10 % | **33 %** | **nådd** (var inte nådd) |
> | Inkörningens andel av styckkostnadens fall | 15–30 % | 17 % | **27 %** | nådd (efter `runInCostPerDoubling` 3 → 2; utan det 44 %) |
> | Sena leveranser per parti, `human` | 1–4 | 0,8 | **1,0** | på gränsen |
> | `human-specialist`, vinst | ≥ 35 % | 1 % | 1 % | inte nådd |
> | Utnyttjande, `human` | 70–90 % | 18–25 % | 28 % | inte nådd |
> | Nya anläggningar per parti, `human` | 3–6 | 0,1 (+ 1,4 utbyggnader) | 1,8 (+ 2,0 utbyggnader = 3,8) | inte nådd för nya verk; inom för verk + utbyggnader |
> | Kvartal med driftsbeslut | ≥ 60 % | 24–29 % | 44 % | inte nådd |
> | Tomten full | 30–60 % | 0 % | 0 % | inte nådd |
>
> Övriga botar före → efter: `balanced` 9 → 36, `balanced-pwc` 27 → 36, `aggressive` 13 → 0, `passive` 5 → 0, `capacity` 0 % vinst / 100 → 97 % BUYOUT (referensen oförändrad), `human-classic` 12 → 0.
> Spelbarhetstestet (ingen bot över 90 %, bästa ≥ 30 %, bästa aktiva ≥ 20 %) och `capacity`-referensen **orörda och gröna**.
>
> **Varför de sista raderna inte nås:** i den här marknaden är artilleri ca 1,2 ordrar per kvartal och infanteri låst för den som inte byggt ett verk; en ren artillerispecialist når därför inte styrelsemålet hur den än
> bygger (`human-specialist` 0–3 % vid varje tröskel och i varje kombination som prövades), och eftersom ett kontrakt tillverkas på *en* linje i taget går `human`s linjer (som boten fyller på till 7,5 mot slutet) bara
> 28 % av tiden — en större marknad ger fler kontrakt, inte fler linjer per kontrakt. En order × 2, en linjetakt × 0,5, tre gånger så stor fredspåfyllning och en budgetandel på 0,4–0,6 flyttade utnyttjandet till högst 40 % och
> bröt andra rader. Det som skulle göra kapaciteten knapp är en regel (ett kontrakt som tar flera linjer, eller en marknad vars form hör ihop med husets specialisering), inte ett tal. **Beslut för ägaren:** se
> `docs/SPELTEST_ETAPP11.md`.

Spelbarhetstestets golv och tak och capacity-referensen ska hålla, eller revideras uttryckligen av ägaren.
Etappen flyttar hela ekonomin, så en revidering är trolig och ska beslutas, inte ske tyst.

---

## 9b. Kapaciteten blir knapp (P185–P186)

Tillagt 2026-10-07 efter utfallet i P183. Mätningen visade att de fetstilta raderna om att bygga inte
nås och att inget balanstal ändrar det:

- 77 % av husets enheter byggs av underleverantörer, och linjerna går 14 % av tiden.
- `human` vinner 53 %, `human-static` 51 %. Den som aldrig bygger förlorar ingenting.
- Kassan ligger nära noll kvartal 6–9 för varje bot, så `human-builder` går i konkurs i 90 %.
- En rutnätssökning över 36 kombinationer gav aldrig mer än 10 procentenheter mellan dem.

Orsaken är beslut 11E som det skrevs: underleverantörerna saknar tak och kostar bara ett påslag på
styckkostnaden, som är en liten del av priset. Huset har därmed obegränsad kapacitet i alla sex kategorier
från första kvartalet. Det är ett fel i designen, inte i bygget.

### P185 — tre regler, mätta en i taget

**1. Huvudleverantörsregeln (11O).**
- Ett bud i en kategori kräver ett monteringsverk i den kategorin, i drift eller under byggnad med högst
  ett kvartal kvar. Ett verk utomlands räknas.
- Högst hälften av ett kontrakts enheter får läggas ut. Resten byggs på egna linjer.
- Ett låst bud säger vad som krävs: "Requires an Assembly Works for armour". Texten kommer ur
  `validateAction`, och samma skäl visas i budmappen, på kartans orderlager och i *This Quarter*.
- Regeln gäller rivalerna genom deras kapacitetstal (11L): en rival bjuder inte utanför sin specialisering
  utan kapacitet för det.
- Upphandlingar (etapp 9) följer samma regel: anmälan kräver ett verk i kategorin eller ett pågående bygge.
- Den civila grenen, licenser och motköp påverkas inte.

**Hård eller mjuk spärr (11P).** Kodsessionen mäter båda varianterna med samma frön:
- *Hård:* inga bud utan verk.
- *Mjuk:* utan verk får huset ta ordrar upp till en liten storlek, helt utlagda, med ett högre påslag.

Välj den variant som når flest fetstilta rader i §9. Vid lika väljs den hårda, eftersom den är lättast
att förstå. Om den hårda varianten ger `human` färre än två biddbara ordrar per kvartal i snitt under de
fyra första kvartalen väljs den mjuka.

**2. Byggnadslån (11Q).**
- Stående order `WORKS BUILD` får ett val: kontant eller lån.
- Lånet täcker en andel av byggkostnaden, ligger utanför `creditLimit`, löper med ränta och betalas av med
  lika delar under ett antal kvartal efter att anläggningen tagits i drift.
- Säkerheten är anläggningen. Vid utebliven betalning tas den, med linjer och arbetsstyrka.
- Lånet bokförs under `financing` i huvudboken och syns på anläggningskortet.
- Avveckling eller försäljning löser lånet först.

**3. Ordrar som fyller en linje (11R).**
- `orderQuantityMin` och `orderQuantityMax` i produktdatan höjs mot `unitsPerLineTurn`, så att ett
  typiskt kontrakt tar en linje i två till fyra kvartal.
- Antalet ordrar sänks i motsvarande mån, så att marknadens värde per kvartal är ungefär oförändrat.
- Förskott, leveranstider och styrelsens kurva kontrolleras mot de större kontrakten.

**Ordning och mätning.** Regel 1 först, sedan 2, sedan 3. Efter varje regel körs härnessen (100 partier
per bot, alla `human`-varianter) och utfallet mot §9 redovisas. Golden får frysas om en gång per regel,
i egen commit (11I). Botarna i `worksPolicy.ts` lärs reglerna: de bjuder inte där de saknar verk, bygger
ett verk i den kategori där flest ordrar går dem förbi, och tar byggnadslån när kassan inte räcker.

**Gränssnitt i samma prompt:** det låsta budet med skäl, lånevalet i byggmenyn, lånet på
anläggningskortet och i *Books*. `npm run shots` och regel 18.

**Inte i P185:** kassadalen kvartal 6–9 som sådan. Den beror på hur scenariots efterfrågan byggs upp och
hör till P141 i etapp 10. Byggnadslånet lindrar den för byggen men löser den inte.

### P186 — balanspass

Samma mål som §9, omätta rader inräknade (inkörningens andel av styckkostnadens fall ska mätas nu).
Startpaketet prövas mot regeln: räcker ett verk med två linjer i en kategori för att överleva de första
fyra kvartalen? Om inte justeras startkapital, startverkets nivå eller de fasta kostnaderna, i den
ordningen. Spelbarhetstestets gränser och `capacity`-referensen får revideras bara efter ägarens beslut;
behövs det, stanna och redovisa vad som krävs.

> **Utfall P185 (2026-10-07; 100 partier per bot, samma frön).**
> **Spärren (11P):** den hårda varianten gav `human` 0,25 biddbara ordrar per kvartal i snitt de fyra första kvartalen (av 1,01 ordrar totalt) — under gränsen på två — och alla botar slutade i
> 100 % `BUYOUT`. **Den mjuka valdes** (`leadSupplierMode` `soft`: utan verk tas ordrar upp till `leadSupplierSoftMaxLineTurns` 1 linjetur, helt utlagda, med påslag 1,15). Regel 1 isolerad:
> `off` human 53 / static 51 / builder 1 / outsource 48 / specialist 12 / broad 0; `soft` human 28 / static 41 / builder 0 / outsource 22 / specialist 14 / broad 0. Gapet `human`–`static` blev alltså
> *negativt* av regel 1 ensam — spärren straffar den som bjuder brett utan verk, men ger ingen belöning för att bygga så länge ordrarna är små.
> **Byggnadslånet (11Q)** bokförs under `financing`, ligger utanför `creditLimit` och tas av anläggningen vid utebliven betalning; ensamt gjorde det byggen *oftare* (human 28 → 12 %) utan att höja intäkten.
> **Orderstorlekarna (11R):** min/max sattes till 2×/4× `unitsPerLineTurn`; antalet ordrar föll 42 → 18 per parti och det ordinarie marknadsvärdet *steg* ~3,4× (≈ 2,7 Mkr/kvartal) i stället för att vara oförändrat.
> Att skala tröskelvärdena upp så att värdet höll sig oförändrat (specens ordalydelse) fällde varje bot till 0 % vinst — **klausulen "marknadens värde ungefär oförändrat" gick därför inte att hålla**;
> `boardTarget.threshold` höjdes i stället för att tröskeln följde med (2,9 → 2,45, sedan 3,4 i P186).
>
> **Utfall P186 (2026-10-07; 100 partier per bot).** Premissfel hittat: stora ordrar var *per konstruktion sena* — produktion (två linjekvartal) plus leveransfördröjning (1–3) översteg
> `requiredDeliveryTurns` (4), så "ready by"-grinden stängde varje stor order. Åtgärd: `requiredDeliveryFor` ger en frist som växer med antalet linjekvartal (`orderDeliveryTurnsPerLineQuarter` 1). Därefter lönar
> det sig att bygga. Balanstal: `buildCost` ×2 (tillbaka till P170-värdena), `boardTarget.threshold` 3,4, byggnadslånet 90 % / 8 % / 12 kvartal. Golden omfryst i egen commit för varje regel och för P186.
>
> | Rad (§9) | Mål | Före (P183) | Efter (P186) | |
> |---|---|---|---|---|
> | `human`, `SCENARIO_COMPLETE` | 40–70 % | 53 % | **48 %** (18 % konkurs) | **nådd** |
> | `human` mot `human-static`, vinst | ≥ 25 pp | +2 pp | **+41 pp** (48 mot 7 %) | **nådd** |
> | `human-specialist`, vinst | ≥ 35 % | 12 % | 1 % | inte nådd |
> | `human-broad`, vinst | ≥ 35 % | 0 % | **86 %** | nådd (men nära taket 90 %) |
> | `human-builder`, konkurs | 10–30 % | 90 % | **27 %** | **nådd** |
> | `human-outsource`, vinst | 20–50 % | 48 % | 10 % | inte nådd |
> | Utnyttjande, `human` | 70–90 % | 14 % | 18–25 % | inte nådd |
> | Byggda anläggningar per parti | 3–6 | 0,4 | 0,1–1,0 | inte nådd |
> | Kvartal med driftsbeslut | ≥ 60 % | 22 % | 24–29 % | inte nådd |
> | Sena leveranser per parti | 1–4 | 0,7 | 0,8 | strax under |
> | Tomten full | 30–60 % | 0 % | 0 % | inte nådd |
> | Inkörningens andel av styckkostnadens fall (8 kvartal) | 15–30 % | ej mätt | **17 %** (`human`; `broad` 24, `static` 12) | **nådd** |
>
> **Mätningen av inkörningsandelen** är ny (`runInShare.ts`, kolumnerna `runInSeries`/`runInSharePct`): en serie är en linje med samma uppsättning i minst åtta kvartal (tomgång tillåten).
> **Startpaketet** prövat mot regeln: ett verk med två linjer räcker för de första fyra kvartalen (ingen bot slutar före kvartal 5; lägsta kassa £1,7–2,0 Mkr för `static`/`classic`, £0,4 Mkr för byggarna) men är tunt,
> eftersom infanteriordrar är låsta utan verk i kategorin — ingen startparameter ändrades. **Orsak till de ej nådda raderna:** marknaden är budgetbunden (≈ 2,2 Mkr/kvartal, köparnas budget är 8 % av deras kassa)
> och innehåller bara infanteri- och artilleriordrar (köparnas tekniknivå 2/1/1); kapacitetsbehovet är ~1–1,5 linjekvartal per kvartal mot två linjer, så utnyttjandet kan inte nå 70 % och tomten fylls inte med tal.
> Att fördubbla de fasta kostnaderna fäller även startpaketet; längre byggtider bryter ett test (2–4 kvartal). **Det kräver en regel eller en efterfrågeändring (fler kategorier i marknaden, lägre linjetakt), inte ett tal.**
> Spelbarhetstestets golv och tak och `capacity`-referensen är **oförändrade och höll**; `human-broad` ligger dock på 86–89 % mot taket 90 (vakten kör 30 partier). Se `docs/ANDRINGSLOGG.md` (P185, P186) och `docs/SPELTEST_ETAPP11.md`.

### P187 — ett kontrakt på flera linjer (regel, beslut 11AA)

- Produktionsplanen (`PLAN`) kan lägga ett kontrakt på flera linjer samtidigt, i samma verk eller i flera
  verk av kontraktets kategori. Enheterna fördelas på linjerna; kontraktets leveranser går ut när enheterna
  är klara.
- Varje linje som tar kontraktet ställs om för produkten enligt reglerna i P171. Att sprida ett kontrakt
  kostar alltså omställning per linje. Inkörningen räknas per linje.
- "Ready by" (`capacity.ts`) räknar med alla linjer kontraktet kan få. Budmappen visar den tidigaste
  leveranstiden huset kan lova med de linjer som är lediga.
- Kortare utlovad leveranstid ger redan poäng i budet och tidigare betalning. Ingen ny poängterm läggs
  till, och `computeScore` rörs inte.
- Utläggningen (högst hälften, 11O) räknas på hela kontraktet som förut.
- Botarna i `worksPolicy.ts` lägger lediga linjer på kontrakt som ligger efter, och lovar kortare
  leveranstid när de har lediga linjer.
- Gränssnitt: produktionstavlan visar ett kontrakt över flera linjer, och planen kan lägga till eller ta
  bort en linje från ett kontrakt. Engelsk text, `npm run shots`, regel 18.
- Mål: §9:s rader för utnyttjande, byggda anläggningar, full tomt och driftsbeslut. Kassadalen kvartal 5–8
  mäts före och efter, eftersom snabbare leverans ger tidigare betalning. `human` ska ligga på 40–70 %.
  Spaken för det är styrelsens tröskel.
- Golden får frysas om en gång, i egen commit (11I).

> **Utfall P187 (2026-10-08; regel, golden-hasharna oförändrade; 100 partier per bot, före = grenens läge efter P149).**
> **Byggt:** en linje i en annan linjes plan får ta samma kontrakt (`PLAN SET` avvisar inte längre "redan planerad på en annan linje"). I `production.ts` går en ledig linje med på ett kontrakt som ligger i *dess* plan så länge kontraktet
> har mer kvar än de linjer som redan har det hinner med den här turen (`coveredThisTurn`, golvade enheter) — en linje går alltså inte med i onödan. Varje linje ställs om för sig (P171, samma kod som förut) och inkörningen räknas per linje
> (`line.runIn`); skeppnings-id får linjens id som suffix när två linjer levererar samma tur. `ownRemaining` delar redan enheterna (försändelserna bokförs direkt). **"Ready by"** (`capacity.ts`): ett kontrakt i flera linjers planer räknas på
> alla; en NY order räknas på de linjer som är lediga nu, och de övriga börjar `multiLineJoinLagTurns` (1) tur senare (planen läggs tidigast nästa kvartal) — `CapacityOutlook.lines` och `BoardContract.lines` är nya. `estimateLineCompletionTurn`
> summerar takten över linjerna som har kontraktet. Utläggningstaket (50 %) gäller hela kontraktet som förut (ingen kod rörd). **Bot:** `spreadOrders` (`worksPolicy.ts`) lägger en ledig, redan uppsatt linje på ett kontrakt som har mer kvar än
> dess linjer hinner med; varianten `human-singleline` är `human` utan regeln. **Gränssnitt:** en brytare per linje i kontraktskortet på produktionstavlan (en linje som redan bygger visas som BUILDING), "L1 + L2" på kontraktsraden och spåret
> på båda linjerna, och en rad i budmappens "Ready by" när flera linjer räknas. Handbokens *works*-uppslag omskrivet. Engelsk text; regel 18 hålls (`npm run shots`, e2e). **Fält:** inget nytt i `GameState`, `Facility` eller `LinePlan`; ett nytt
> balanstal (`multiLineJoinLagTurns`, okänsligt) och nya härledda fält i `CapacityOutlook`/`BoardContract`.
>
> | Rad (§9) | Mål | Före | Efter P187 | |
> |---|---|---|---|---|
> | `human`, `SCENARIO_COMPLETE` | 40–70 % | 59 (300 partier) | 57 (100) / 59 (300) | oförändrad |
> | `human-singleline` (utan regeln), vinst | – | – | 69 (100) / 61 (300) | samma som `human` inom felet |
> | Utnyttjande, `human` | 70–90 % | 28 % | 28 % | **inte nådd** |
> | Byggda anläggningar per parti | 3–6 | 1,7 (+1,9 utbyggnader) | 1,8 (+1,9) | inte nådd för nya verk |
> | Tomten full | 30–60 % | 0 % | 0 % | inte nådd |
> | Kvartal med driftsbeslut | ≥ 60 % | 43 % | 43 % | inte nådd |
> | Sena kontrakt per parti | 1–4 | 1,2 | 1,1 | nådd |
> | Kassadalen, median kvartal 5/6/7/8 (Mkr) | – | 0,66 / 1,74 / 0,02 / 0,17 | identisk | oförändrad |
> | `human-builder` konkurs | 10–30 % | 20 % | 3 % | (brus: 88 → 100 % av partierna når slutet) |
>
> **Diagnos (verifierat, inte gissat):** spridningen används men räcker inte för att flytta något. I 38 av 60 partier ligger något kontrakt på mer än en linje, men bara 1,6 kontrakt-turer per parti; 61 % av linjeturerna står lediga,
> och 44 linjeturer per parti står lediga *medan ett kontrakt väntar* — de lediga linjerna kan inte ta det (fel kategori, fel uppsättning). Utnyttjandet bestäms av hur mycket efterfrågan det finns per linje, inte av att ett kontrakt bara kan stå på en
> linje: snabbare tillverkning gör kontrakten klara tidigare, så linjerna står lediga tidigare. Att ställa om en linje för att hjälpa ett sent kontrakt prövades i boten och sänkte vinsten (53 mot 57 %; inkörningen delas på fler linjer och
> omställningen kostar). **Premissfynd:** `computeScore`s leveranstermin straffar bara en lovad tid *efter* kravet (`max(0, bud − krav)`), så en kortare utlovad leveranstid än kravet ger ingen poäng — "lovar kortare leveranstid" blir i praktiken
> att `fitsCapacity` släpper igenom bud som annars var för sena, inte en poängspak (och `computeScore` rörs inte). **Golden:** verifierat bit-identisk (golden-botarna använder inga planer); bara `balance.frozen.json` fick den nya nyckeln.
> **Läsning:** de fyra raderna (utnyttjande, byggda anläggningar, full tomt, driftsbeslut) nås inte med den här regeln. Spaken som återstår är efterfrågan per linje (större eller fler ordrar), inte kontraktets exklusivitet — ägarbeslut,
> se `docs/SPELTEST_ETAPP10A.md`.

### P189 — kapacitet köper leveranstid (regel, beslut 11AD)

- En leveransterm läggs efter `computeScore` i `bidTerms.ts` och delas av `bidding.ts`, `bidEstimate` och
  `playerWinCurve` (en formel, en källa). Den ger poäng per kvartal som budet lovar under köparens krav,
  med ett tak. Talen i `balance.json`, provisoriska. `computeScore` rörs inte.
- Rivalerna får termen på samma villkor, begränsade av sin kapacitet (11L).
- Ett löfte som inte hålls behandlas som i dag: sen leverans.
- Budmappen visar termen bredvid leveranstiden, och "Ready by" visar vad lediga linjer gör möjligt.
- Botarna i `worksPolicy.ts` lovar kortare leveranstid när lediga linjer räcker, och lägger då linjer på
  kontraktet enligt P187.
- Mät mot §9: utnyttjande, nya anläggningar, full tomt, driftsbeslut, kassadalen, och `human` 40–70 %
  (spaken är styrelsens tröskel). Når utnyttjandet inte 40 % gäller 11AE.
- Golden får frysas om en gång, i egen commit (11I).

> **Utfall P189 (2026-10-08; regel, golden omfryst i egen commit; 100 partier per bot, före = grenens läge efter P188).**
> **Byggt:** `deliveryPromiseTerm` (`bidTerms.ts`, efter `computeScore`): `deliveryPromiseFactor` 0,3 × köparens leveransvikt × `deliveryTermWeight` × kvartal ett bud lovar under kravet, högst `deliveryPromiseCapTurns` 2. Samma term i `bidding.ts` (avgörandet),
> `bidEstimate` och `playerWinCurve` (nytt valfritt `deliveryTurns`, standard kravet), och rivalerna får den med sina egna leveranstider — en fullbelagd rival (`rivalCapacityContracts` aktiva kontrakt) får ingen (`rivalDeliveryPromiseTerm`). Ett löfte som
> inte hålls är en sen leverans som förut. Budmappen visar poängen under leveranstiden ("Promising 1 quarter early adds N points …"). `human` lovar den kortaste tid "ready by" säger att huset hinner med (`promiseTurns`, `worksPolicy.ts`) och lättar löftet mot
> kravet när de bud som redan lagts den turen tagit linjerna; `human-nopromise` är `human` utan det. `boardTarget.threshold` 9,0 → 7,5 (regelns data). Inget nytt `GameState`-fält. **Golden** attribuerad: faktorn 0 och tröskeln 9,0 är bit-identiska med förra raden.
> **Premissfynd:** rivalernas leveranstider ligger i regel 1–3 kvartal under kravet (köparens krav är minsta leveranstid + marginal), så rivalerna tjänar termen nästan alltid medan huset bara tjänar den när linjerna räcker — termen sänker alla botar och tröskeln fick sänkas för att hålla `human` inom 40–70.
>
> | Rad | Mål | Före (P188) | Efter (P189) | |
> |---|---|---|---|---|
> | `human`, vinst | 40–70 % | 67 | **65** | nådd (tröskel 7,5) |
> | `human-nopromise` (utan löftet) | – | – | 61 | löftet ger ca +4 pp, inom felet |
> | Utnyttjande, `human` | 40 % (11AE: 70–90 ej längre mål) | 28 | **27** | **inte 40 → 11AE gäller** |
> | Nya verk per parti (+ utbyggnader) | ≥ 1,5 (11AE) | 1,6 (+2,0) | 1,4 (+1,7) | 3,1 totalt; nya verk strax under |
> | Tomten full | "nåbar" (11AE) | 0 % | 0 % | nåbar i test, aldrig i botspel |
> | Driftsbeslut | ≥ 40 % (11AE) | 44 % | **45 %** | nådd |
> | Sena kontrakt per parti | 1–4 | 1,4 | 1,9 | nådd, men upp (kortare löften) |
> | Kassadalen, median kvartal 4/5/6/7/8 (Mkr) | – | 0,83 / 0,42 / 1,53 / −0,07 / 0,09 | −0,42 / −0,45 / 0,78 / −0,19 / −0,03 | **djupare** |
> | `human` mot `human-static`, vinst | ≥ 25 pp (11AE) | +67 (67 mot 0) | +62 (65 mot 3) | nådd |
> | `human-builder`, konkurs | 10–30 % (11AE) | 0 % | 3 % | **inte nådd** (för lågt, inte för högt) |
>
> Övriga botar före → efter: `human-noresearch` 32 → 33, `human-broad` 74 → 83, `balanced` 40 → 60, `balanced-pwc` 52 → 67, `aggressive` 0, `passive` 0, `capacity` 0 % vinst och 94 → 99 % BUYOUT (referensen 96,7 ± 10 håller). Spelbarhetstestet och `capacity`-referensen
> gröna utan revidering. **Läsning:** utnyttjandet nås inte (27 %, mål 40 %), för att huset sällan kan lova mer än kravet: med två till tre linjer hinner det inte snabbare, så kapacitet köper inte leveranstid i botspel — det som binder är fortfarande efterfrågan per linje
> (61 % av linjeturerna står lediga). Ytterligare en bieffekt är att den djupare kassadalen i kvartal 4–5 kommer av att rivalerna tar de tidiga kontrakten. **11AE tillämpad:** raderna är nu utnyttjande "mäts, ingen gräns", full tomt "nåbar", nya anläggningar ≥ 1,5 per parti
> (1,4 nya verk + 1,7 utbyggnader), driftsbeslut ≥ 40 % (45 %); avsikten mäts av `human` +62 pp över `human-static` (nådd) och `human-builder` i konkurs 10–30 % (3 % — inte nådd, och i fel riktning mot vad raden fruktade). Om verken känns som något man måste sköta avgör speltestet.

### P191 — leveranstermen av och raderna i ordning (data, beslut 11AG och 10AA)

- `deliveryPromiseFactor` 0 och `boardTarget.threshold` 9,0. Verifiera att golden-hasharna blir desamma som
  efter P188, och frys om i egen commit. Bli de inte det: stanna och redovisa.
- Mät `human`-familjen (100 partier per bot) och redovisa raderna i §9 och etapp 10 §7 mot det. Vakterna
  ska hålla.
- Budmappen ska inte visa en leveransterm som är noll.
- Raden "`human` högst 5 pp under bara forskningsspår" i etapp 10 §7 stryks (10AA).
- `docs/SPELTEST_ETAPP10A.md` uppdateras så att den frågar efter det besluten nu hänger på: om verken
  känns som något man måste sköta (11AH), och om egna konstruktioner känns värda priset (10AA).

> **Utfall P191 (2026-10-08; data, golden tillbaka på P188:s hashar i egen commit; 100 partier per bot).**
> **Byggt:** `deliveryPromiseFactor` 0 och `boardTarget.threshold` 9,0. **Golden:** med de två talen är alla tre hashar bit-identiska med raden efter P188 — passive `8043621c952e`, aggressive `124d9ae3c35771`, balanced `8f30f586b617b` — verifierat med ombyggd dist, inte antaget; raden omfryst i egen commit med attribution i `golden.test.ts`. Koden för termen
> står kvar bakom talet (`deliveryPromiseTerm`, `rivalDeliveryPromiseTerm`, `deliveryTurns` i `bidEstimate`/`playerWinCurve`). Budmappen visar ingen leveransterm när den är noll (`BidForm.tsx`, `promiseActive`); testet `BidForm.promise.test.tsx` binder det. `stockDesignAsFamily` förblir av; P187 och 11AE:s reviderade rader står kvar.
> **Mätt (100 partier per bot):**
>
> | Rad | Mål | P189 (termen på) | P191 (termen av) | |
> |---|---|---|---|---|
> | `human`, vinst | 40–70 % | 65 | **64** | nådd |
> | `human-noresearch`, vinst | ≥ 30 % | 33 | **36** | nådd |
> | Ingen variant över 90 % | – | 83 | **81** (`human-tracks`; `human-broad` 78) | nådd |
> | `human` mot `human-static`, vinst | ≥ 25 pp (11AE) | +62 | **+64** (64 mot 0) | nådd |
> | Utnyttjande, `human` | mäts (11AE) | 27 | 26 | mäts |
> | Nya verk (+ utbyggnader) | ≥ 1,5 (11AE) | 1,4 (+1,7) | 1,2 (+2,1) | 3,3 totalt; nya verk under |
> | Tomten full | nåbar | 0 % | 0 % | nåbar i test |
> | Driftsbeslut | ≥ 40 % (11AE) | 45 | 48 | nådd |
> | Sena kontrakt per parti | 1–4 | 1,9 | 1,9 | nådd |
> | `human-builder`, konkurs | 10–30 % (11AE) | 3 | 0 (vinst 42) | inte nådd |
> | `human`, kärnvapenutbyte | ≤ 10 % | 5 | 8 | nådd |
> | Kassadalen, median kvartal 4/5 (Mkr) | – | −0,42 / −0,45 | −0,41 / −0,43 | **fortfarande djupare än P188 (0,83 / 0,42)** |
>
> Övriga botar: `human-hawk` 61, `human-outsource` 67, `human-nopromise` 62, `balanced` 40, `balanced-pwc` 52, `passive` 0, `aggressive` 0, `capacity` 0 % vinst och 94 % BUYOUT (referensen 96,7 ± 10 håller). Spelbarhetstestet och `capacity`-referensen gröna utan revidering.
> **Fynd (inte åtgärdat, inga andra tal än de två):** kassadalen blev inte tillbaka på P188:s nivå trots att termen är av. Orsaken är inte termen utan `human`s eget beteende: boten lovar fortfarande den kortaste leveranstid "ready by" tillåter (`promise`, standard på), och utan termen ger ett kortare löfte
> bara en tidigare förfallodag. `human-nopromise` har kvartal 4-medianen +0,82 Mkr. Raden i tabellen är alltså en botinställning, inte en regel; att låta löftet följa faktorn (av när faktorn är 0) är en harness-ändring jag inte gjorde eftersom uppdraget var "inga andra tal". Speltestet avgör: en spelare har ingen sådan bot.

### P184 efter P189 och P190

Speltestet görs efter P189 och P190 (etapp 10) och före P150 (11AF).

### P184 efter P187 och P188 (ersatt av 11AF)

Speltestet görs när P187 och P188 (etapp 10) är klara, före P150 (11AC, ändrar 11Z och 11T). Det görs
tillsammans med speltestet av 10A (P148, `docs/SPELTEST_ETAPP10A.md`). `docs/SPELTEST_ETAPP11.md` uppdateras då
med det nya utfallet.

### Raderna som återstår efter P186

Utnyttjande, byggda anläggningar, full tomt, driftsbeslut, `human-specialist` och `human-outsource` nåddes
inte i P186. Orsaken är marknadens bredd, inte verken (11V). De förs över som mål till P141 i
`docs/ETAPP10_FORSLAG.md` §6, som mäter dem mot samma tabell (§9 här).

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
| **Kapaciteten** | P185 | Huvudleverantörsregeln, byggnadslån och ordrar som fyller en linje (§9b) | regel |
| | P186 | Balanspass mot §9 efter P185 | regel |
| | P187 | Ett kontrakt på flera linjer (11AA) | regel |
| | P189 | Kapacitet köper leveranstid (11AD) | regel |
| | P191 | Leveranstermen av, raderna i ordning (11AG, 10AA) | data |
| | P184 | Speltest, efter P191, före P150 | ingen kod |

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
