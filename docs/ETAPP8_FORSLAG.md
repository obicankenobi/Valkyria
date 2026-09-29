# Etapp 8 — Kassaboken

**THE SEVENTH FRONT** · förslag · skrivet 2026-09-29 mot `c660b90` (efter P94)

> **Status 2026-09-29 (uppdaterad):** etappen är **ANTAGEN och aktiv** (ägarbeslut
> 2026-09-29, `ANDRINGSLOGG.md`). Besluten 8A–8G är fattade, samtliga enligt förslagets egna
> rekommendationer (§2). **P95 (speltestet av etapp 7) är uppskjutet** — etapp 8 körs före det.
> P95 kan fortfarande flytta punkter hit eller härifrån. Ordningen är etapp 8 före etapp 9
> (forskningen). Beslut 8C gäller: golden får frysas om **bara** i P96, P98, P100 och P102,
> var och en i egen commit. Filen behåller namnet `ETAPP8_FORSLAG.md`.
>
> **Byggstatus:** P96 **BYGGD 2026-09-29** (formen utökad med tre rader efter ägarbeslut, se
> §3.1 och blockquoten under P96 i §9). P97 är inte påbörjad.

Etapp 7 gjorde om hur spelet ser ut. Etapp 8 gör om hur pengarna känns. Den tar de tre
ekonomipunkter som etapp 7 sköt fram (§16), och lägger till fyra till. Tre av dem är luckor i
koden som redan har upptäckts och dokumenterats men aldrig byggts. Den fjärde är att mäta
balansen mot mänskligt spel i stället för botarnas.

Förslaget följer samma form som tidigare etappspecar: premisskontroll först, sedan
ägarbeslut, mekanik, gränssnitt, måltabell, skyddsräcken och promptsekvens.

> **Förutsättning:** P95 (speltestet som avslutar etapp 7) ska vara genomfört innan det här
> förslaget antas. Speltestet kan flytta punkter hit eller härifrån, på samma sätt som P81
> skapade §16.

---

## 0. Premisskontroll

Varje påstående nedan är kontrollerat mot koden på `c660b90` eller hämtat ur en
blockquote där Code-sessionen redan har verifierat det. En kodsession ska ändå göra om
kontrollen innan P96 och stanna om något inte stämmer (CLAUDE.md, "Om specen och
verkligheten inte stämmer").

| # | Påstående | Källa |
|---|---|---|
| 0.1 | Spelaren får betalt **först vid leverans**, proportionellt mot levererad mängd. Ingenting betalas när kontraktet tilldelas. | `resolve/steps/deliveries.ts` (`house.treasury += revenue`) |
| 0.2 | De första turerna ger ingen intäkt medan de fasta kostnaderna redan löper (429 000 kr per tur när P53 mättes). Det var grundorsaken till `BUYOUT`-kaskaden. | CLAUDE.md, P53 |
| 0.3 | **Standing orders finns inte.** `StandingOrderChange` är en platshållare (`kind: string, payload: Record<string, unknown>`) som ingen kod läser sedan P2. DESIGN.md §4 beskriver dem som ett av turens tre beslutsslag. | `types.ts` rad ~760, DESIGN.md §4 |
| 0.4 | En produktionslinje tillverkar vilken produkt som helst, och tilldelningen sker automatiskt. `capacityPct` är alltid 100 och ändras aldrig av någon kod. | P85-blockquoten, `state.ts`, `applyActions.ts` |
| 0.5 | `BUY_FORWARD` är en platt pool med samma belopp in och ut, som inte är prisindexerad. Den kan därför aldrig bli olönsam. Ägaren beslutade 2026-09-16 att den platta poolen är avsedd. | CLAUDE.md, P52 |
| 0.6 | Hos fyra av de åtta `POLITICAL`-operationerna påverkar beloppet ingenting: `STAGE_INCIDENT`, `BACK_CHANNEL`, `FUND_COUP` och `ASSASSINATE` drar pengar från kassan, men sannolikhet och utfall är desamma oavsett summa. Gränssnittet säger det ärligt med en hint. | P86-blockquoten, `political.ts` |
| 0.7 | `bidEstimate.winBand` räknar bara på rivalernas prisintervall. Golden-testets `balanced`-bot bjuder på bandets punkter och tog därför 9,7 % av marknaden. Alla balansmätningar P37–P64 gjordes mot den boten. `playerWinCurve` (P81c) visar spelarens egen kurva, men ingen bot använder den. | P81, fynd 1 |
| 0.8 | Styrelsen granskar vid tur 6, 10, 14 och 18. Två underkända granskningar ger `BUYOUT`. | `indochina-slice.json`, `endings.ts` |
| 0.9 | Frontstatus ändras nästan aldrig. Det krävs `BACK_CHANNEL` för att nå `ceasefireRelationThreshold` (70) inom ett parti, och ingen mätning har visat att en vapenvila faktiskt inträffar. Pelare 1:s andra halva ("för lite krig för att överleva kvartalet") har därför aldrig prövats. | P64, `balance.json` `_p59_note` |
| 0.10 | `state.wire` sparar bara de senaste turerna, så någon ekonomisk historik över hela partiet finns inte. | ETAPP7 §16 (*verifieras i P96*) |
| 0.11 | `chiefOfStaff` ger redan en fjärde handling (DESIGN.md §4). Den andra halvan i DESIGN.md, "sänks till 2 under ett kvartal när huset är under utredning", finns inte. | `economy.ts`, sökning efter `investigation` gav noll träffar |

**Slutsats.** Hela ekonomin avgörs i dag av ett enda ögonblick: leveransen. Det finns inga
villkor att förhandla om, inga stående beslut att sköta och ingen historik att läsa. Pengar på
fel ställen, som de fyra politiska beloppen i 0.6, köper ingenting. Balansen har aldrig mätts
mot ett spelsätt som liknar spelarens.

---

## 1. Frågan etappen ska besvara

**Kan spelaren läsa sina pengar, och fattar hen beslut om dem som kostar något?**

Tre delfrågor gör frågan mätbar:

1. **Läsbarhet:** Kan spelaren efter tio turer peka ut kvartalet där det gick fel, och varför, utan att öppna NEWS DESK?
2. **Avvägning:** Finns det minst ett bud per parti där spelaren väljer ett lägre pris för ett bättre förskott, eller låter bli en god affär på grund av köparens betalningsrisk?
3. **Pelare 1, andra halvan:** Kan spelaren förlora på för lite krig? Det vill säga: leder en vapenvila som spelaren själv har orsakat till en märkbar intäktsförlust?

---

## 2. Ägarbeslut — fattade 2026-09-29, loggade i `ANDRINGSLOGG.md`

| | Fråga | Beslut (2026-09-29) |
|---|---|---|
| **8A** | Etappens namn | "Kassaboken" |
| **8B** | Ska standing orders (DESIGN.md §4) byggas här eller i en egen etapp? | **Här**, men bara tre av DESIGN.md:s fem slag (se §4). R&D-kön hör till etapp 9. |
| **8C** | Får golden frysas om i de prompter som ändrar regler, i egen commit, utan att sessionen stannar och frågar? | **Ja**, men bara i P96, P98, P100 och P102, som var och en listas uttryckligen. Samma sorts förhandsauktorisering som beslut 2F i etapp 7. Alla andra prompter lämnar golden orörd. |
| **8D** | Vilket spann ska förskottet ha? | **10–40 %** av kontraktsvärdet, som startvärde för balanspasset i P104. |
| **8E** | Ska "under utredning" (0.11) ingå? | **Ja, som tillval i P102.** Det ger `EXPOSURE` ett mellansteg före `EXPOSURE`-slutet. Stryks om P102 blir för stor. |
| **8F** | Vilken bot räknas som "spelarlik" i måltabellen? | En ny policy, **`human`** (P103). Den bjuder på `playerWinCurve`, sköter standing orders och väljer bud med förskottet i åtanke. `balanced` behålls orörd för golden. |
| **8G** | `BUY_FORWARD`: ska beslutet från 2026-09-16 omprövas? | **Nej. Den platta poolen står kvar.** Leverantörsavtalet i §4 är det nya, prisindexerade alternativet vid sidan av. |

---

## 3. Del 8A — Huvudboken (P96–P97)

### 3.1 Mekanik: `GameState.ledger`

Ett nytt fält med en post per kvartal för hela partiet, avsett för läsning och aldrig för
beslut:

```
LedgerEntry {
  turn
  income:   { contracts, advances, broker, commodityRelease, fileSale }
  expenses: { fixedCosts, production, interest, political, intel, commodityPurchase, hiring, lines, clawback }
  financing: { loans, repayments }
  treasuryEnd, debtEnd, creditLimitEnd
}
```

> **Formen utökad 2026-09-29 (ägarbeslut vid P96:s premisskontroll).** Tre rader tillagda
> jämfört med förslagets ursprungliga form: `income.fileSale`, `expenses.clawback` och
> `financing: { loans, repayments }`. De rymmer de fyra flöden som inte passade någon rad
> (`SELL_THE_FILE`, `BACK_DOWN`s återtagande, `TAKE_LOAN`, `REPAY`), utan en "övrigt"-rad.
> Kontrollen nedan blir därmed: Δ`house.treasury` = Σ`income` − Σ`expenses` + `financing.loans`
> − `financing.repayments`.

- Varje befintligt steg som flyttar pengar skriver sin rad i samma anrop som det redan emittar
  sin `WireEvent` (hård regel 4). Inga nya penningflöden, bara bokföring av de befintliga, och
  allt räknas genom `money.ts` (hård regel 8).
- **Kontroll:** summan av kvartalets rader (med formeln ovan) ska vara exakt lika med förändringen i
  `house.treasury`. Ett test underkänner varje tur där de skiljer sig med så mycket som en
  krona. Testet fångar alla penningflöden som i dag går förbi en `WireEvent`.
- Fältet ändrar statens form, så golden-hashen ändras (**8C, P96**). Alla andra fält ska vara
  bitvis identiska före och efter. Det ska verifieras, inte antas.

### 3.2 Gränssnitt: huvudboken i THE COMPANY

- **Grafen** ritas som en huvudbok från 1965: grönlinjerat bokföringspapper med intäkter och
  kostnader som staplar i blyerts, kassan som en kurva i blått fettkrita och styrelsens mål
  som en röd streckad linje. Tryck på ett kvartal öppnar kvartalets verifikationer (regel 13).
- **Styrelsens kvartalsrapport:** vid varje granskningstur (6/10/14/18) visas ett stencilerat
  PM från THE SYNDICATE i kvartalsuppspelningen. Det innehåller prognos mot mål, de tre största
  posterna och en mening om vad styrelsen vill se. PM:et ger förvarningen som P81-8 saknade
  och bygger på `boardReviewOutlook` (P81c), inte på någon ny formel.
- Regel 18 och regel 11 gäller: grafen får en egen skärm i `e2e/text-overflow.spec.ts` och i
  `npm run shots`.

---

## 4. Del 8B — Förskottet och betalningsrisken (P98–P99)

### 4.1 Mekanik: betalningsvillkor per order

Varje `Order` får ett `advancePct` som sätts när ordern utlyses och fryses där, på samma sätt
som `referencePrice` (ANDRINGSLOGG 2026-09-13). Andelen härleds ur tre saker som redan finns i
staten, så inget nytt dolt tal behövs:

- **Brådska:** köparens `materielNeed` mot `orderTriggerThreshold`. En köpare i nöd betalar mer
  i förskott. Det kopplar förskottet till kriget, och därmed till pelare 1.
- **Betalningsförmåga:** köparens `militaryBudget` och `treasury`. En köpare med ont om pengar
  betalar mindre i förskott.
- **Relation:** procurement-tjänstemannens `relationToPlayer` ger en liten bonus. Det ger 5A:s
  tjänstemän en ekonomisk följd till.

Utfallet:

- **Vid tilldelning** betalas `advancePct × kontraktsvärde` till kassan och bokförs i
  `ledger.income.advances`.
- **Vid leverans** betalas resten, proportionellt som i dag.
- **Köparen går i konkurs** (`... BANKRUPT — ALL CONTRACTS VOIDED`, `factions.ts`): förskottet
  behålls. Det här är förskottets egentliga värde, en försäkring mot köparen.
- **Spelaren levererar inte i tid och kontraktet annulleras:** förskottet ska betalas tillbaka.
  Räcker inte kassan blir resten skuld. Det ger en ny väg in i `INSOLVENCY`, och det är
  avsiktligt.
- Nya balanstal i `balance.json`: `advancePctMin`, `advancePctMax` och tre vikter. Alla är
  provisoriska fram till P104.

**Varför det här löser mer än P81-19:** Förskottet ger intäkt i tur 1–4, innan den första
leveransen. Det är precis det glapp som P53 pekade ut som roten till kaskaden (0.2). Förskottet
kan alltså göra styrelsemålet nåbart utan att målet självt behöver ändras. P104 mäter om det
stämmer.

### 4.2 Gränssnitt: villkoren i budmappen

- Förskottet stämplas på ordermappen i CONTRACTS, till exempel "ADVANCE 30 %", med samma
  stämpelregister som fristen (`.order-stamp`, P84).
- Köparens betalningsförmåga visas som en kreditstämpel, **A**, **B** eller **C**, i mappens
  flik. Den härleds ur köparens `treasury` och `militaryBudget`, som redan finns i staten.
  Underrättelsen styr vad som syns: utan station är stämpeln "?", med samma
  `effectiveDepth`-grind som `formationDisplay`.
- `BidForm` visar tre tal vid prisreglaget: vinstchans, marginal och **pengar i kassan nästa
  kvartal** (förskottet). Avvägning 2 i §1 ska synas i ett enda ögonkast.

---

## 5. Del 8C — Stående order (P100–P101)

DESIGN.md §4 beskriver tre slags beslut per tur: stående order, anbud och executive actions.
Anbud och handlingar är byggda. De stående ordrarna har varit en tom typ sedan P2 (0.3).
Förslaget bygger tre av DESIGN.md:s fem slag, de tre som är ekonomi.

### 5.1 Mekanik

`StandingOrderChange` blir en diskriminerad union, och `house.standingOrders` lagrar det gällande
läget. En ändring kostar **ingen** handling, precis som ett bud. Den gäller från nästa tur och
ligger kvar tills spelaren ändrar den.

| Slag | Vad spelaren sätter | Vad det gör | Varför |
|---|---|---|---|
| **Linjeuppdrag** | Per linje: en produktkategori (eller "fritt") och ett skift, *normal* eller *övertid* | Övertid ger `capacityPct` 125 till högre styckkostnad och en liten slitagerisk. "Fritt" behåller dagens automatiska tilldelning. | `capacityPct` får sin första skrivare (0.4). Produktionen blir ett beslut i stället för något som bara händer. |
| **Leverantörsavtal** | Råvara, volym per tur, löptid på 4–8 turer | Låser priset till dagens råvaruindex. Volymen levereras och betalas varje tur oavsett behov. Stiger indexet tjänar spelaren, sjunker det förlorar spelaren. | Det prisindexerade alternativet till `BUY_FORWARD` (0.5, beslut 8G). Det kan bli olönsamt, och just därför blir det ett beslut. |
| **Stationsläge** | Per station: *tyst*, *normal* eller *aktiv* | Tyst ger lägre upphållskostnad, långsammare djup och lägre exponering. Aktiv ger det omvända. | Stationerna är i dag en fast kostnad. Nu blir de en ratt som spelaren sköter. |

**Larm (DESIGN.md §4, ordagrant):** en stående order som har blivit dålig emittar en
`WireEvent` med `causeId`. Tre mönster byggs:

- en linje som tillverkar mot ett annullerat kontrakt
- ett leverantörsavtal som går med förlust tre turer i rad
- en station på *aktiv* vars exponering passerar `exposureBurnThreshold`

Golden fryses om (**8C, P100**). `balanced` och de andra befintliga botarna skickar inga
stående order, så deras beteende ska vara oförändrat. Omfrysningen ska bara spegla den nya
fältformen, och det ska verifieras.

### 5.2 Gränssnitt: anslagstavlan

- En korktavla i THE COMPANY med stående ordrar som registerkort under tumstift, ett per linje,
  avtal och station. Ett tryck vänder kortet. Ändringar görs med `Segmented` och `Stepper`,
  aldrig med webbläsarkontroller (regel 2).
- Ett kort med larm får ett rött fettkritsstreck och en rad i This Quarter (P83), som hoppar
  till kortet.
- Linjekorten sitter ihop med produktionslinjebanden från P85, så att samma linje inte visas på
  två ställen med olika sanning.

---

## 6. Del 8D — Handlingarnas pris (P102)

Pelare 3 säger: "Spelet säger aldrig nej till en handling, det prissätter den." Hos fyra av de
åtta politiska operationerna prissätter spelet dem i dag inte alls. Summan dras från kassan men
köper ingenting (0.6).

### 6.1 Mekanik

- `STAGE_INCIDENT`, `BACK_CHANNEL`, `FUND_COUP` och `ASSASSINATE` får en kurva från belopp till
  effekt med **avtagande avkastning och ett tak**. Dubbel summa ska ge märkbart bättre odds eller
  större effekt, men aldrig dubbelt så bra, och aldrig säkert.
  - `FUND_COUP`: lyckandechansen stiger med beloppet, med ett tak under 100.
  - `ASSASSINATE`: beloppet sänker `counterIntelligence`-höjningen och DOOMSDAY-risken. Utfallet (målet dör) står kvar.
  - `STAGE_INCIDENT`: beloppet styr hur stor `heat`-höjningen blir.
  - `BACK_CHANNEL`: beloppet styr relationsvinsten. Det är vägen mot vapenvila, och därmed pelare 1 (0.9).
- `previewAction` (P78) räknar ut oddsen per nivå med samma formel, så `TierPicker` visar tre
  riktiga tal. Hintarna från P86 om att beloppet inte påverkar något tas bort.
- **Tillval (8E), "under utredning":** när en stations exponering passerar tröskeln och
  stationen bränns öppnas en utredning. Under det kvartalet har huset två handlingar i stället
  för tre (DESIGN.md §4). Det blir ett mellansteg före `EXPOSURE`-slutet, och det svider i
  handlingsekonomin.
- Golden fryses om (**8C, P102**). `aggressive` skickar `FUND_COUP` och `ASSASSINATE` med fasta
  belopp, och deras utfall ändras.

---

## 7. Del 8E — Balans för mänskligt spel (P103–P104)

### 7.1 Härnessen (P103, ingen `core`-ändring)

- Ny botpolicy **`human`** (beslut 8F). Den bjuder på `playerWinCurve`, föredrar förskott när
  kassan är låg, sätter linjeuppdrag och ett leverantörsavtal när råvaruindexet är lågt, och
  använder `BACK_CHANNEL` när en front ger dålig intäkt. Den ska vara en rimlig spelare, inte en
  optimal.
- ETAPP7 §16 säger att `balanced` och `capacity` ska flyttas till `playerWinCurve`. Men
  golden-testet läser `balanced` direkt ur härnesspaketet (P22), så en ändring där bryter
  golden. Förslaget: **`balanced` lämnas orörd**, och två nya varianter, `balanced-pwc` och
  `capacity-pwc`, bjuder på `playerWinCurve` och används i måltabellen.
- Nya `GameMetrics`-kolumner: förskottets andel av intäkterna, lägsta kassa under tur 1–6,
  antal vapenvilor, antal larm från stående order och vilken granskning `BUYOUT` inträffar vid.

### 7.2 Måltabell (P104 mäter och reviderar)

Startvärden. P104 får revidera vilken rad som helst med motivering och loggrad, samma regel som
tidigare balanspass.

| Rad | Mål | Fetstilt |
|---|---|---|
| `human`: `SCENARIO_COMPLETE` | 40–70 % | **ja** |
| `human`: `BUYOUT` | 15–35 % | **ja** |
| `human`: `INSOLVENCY` | 5–20 % | |
| `passive`: `BUYOUT` | > 60 % (passivitet ska fortfarande straffa sig) | **ja** |
| Förskottets andel av intäkterna, `human` | 15–35 % | |
| Partier där kassan går under noll före tur 5, `human` | < 20 % | **ja** |
| Minst en vapenvila, `human` | 20–50 % av partierna | **ja** |
| Intäkt kvartalet efter en vapenvila mot kvartalet före, samma front | minst 30 % lägre | **ja** (pelare 1) |
| Minst ett larm från en stående order, `human` | > 50 % av partierna | |
| `FUND_COUP` på högsta nivån mot lägsta, `aggressive` | minst +15 procentenheter i lyckandechans | |

Balanspasset ändrar bara `balance.json` och scenariodatan. `balance.frozen.json` fryses om **sist
i etappen**, samma praxis som P22.

---

## 8. Skyddsräcken

1. **Inga nya penningflöden utan en rad i huvudboken.** Balanstestet i §3.1 körs varje tur i
   varje härnessparti och underkänner om kassan och huvudboken skiljer sig åt.
2. **Golden fryses bara om i P96, P98, P100 och P102**, var och en i egen commit, och bara när
   förändringen är den som prompten beskriver. I alla andra lägen gäller CLAUDE.md: stanna och
   fråga.
3. **`bidEstimate.winBand` och botpolicyn `balanced` rörs inte** (0.7). Golden läser båda.
4. **Inga dolda tal i gränssnittet.** Kreditstämpeln och förskottets orsaker grindas genom
   underrättelse. Faktorerna bakom `advancePct` visas bara med en station.
5. **Etapp 7:s spelgränssnittsregler (1–18) gäller oförändrade.** Varje UI-prompt avslutas med
   `npm run shots` och körs mot regel 18 och regel 11 i CI.
6. **Standing orders kostar aldrig en handling.** Blir det frestande att låta dem göra det, är
   det ett tecken på att en stående order borde vara en handling. Stanna och fråga.

---

## 9. Promptsekvens

**8A — Huvudboken**

**P96 — Premisskontroll och `GameState.ledger`.** Gör om §0 mot koden och stanna vid avvikelser.
Bygg sedan fältet, skrivningarna i varje penningflyttande steg och balanstestet. *Klart när:*
balanstestet är grönt i 500 härnesspartier över alla policyer, och golden är omfryst med alla
andra fält verifierat identiska.

> **P96 — STANNAD vid premisskontrollen, 2026-09-29 (inget byggt).** Punkterna 0.1–0.9 och 0.11
> stämmer mot koden på `c660b90` (0.11: sökning efter `investigat` ger noll träffar i `core/src`;
> `chiefOfStaff` ger fjärde handlingen, den andra halvan saknas). **0.10 stämmer bara till hälften:**
> `state.wire` beskär till 8 turer, men `house.revenueByTurn` är redan en intäktshistorik över hela
> partiet — det som saknas är kostnadssidan och uppdelningen per post. Påverkar inte P96.
>
> **Alla skrivningar till `house.treasury`/`house.debt` i `packages/core/src`:**
> `economy.ts` (fasta kostnader → `expenses.fixedCosts`, ränta → `expenses.interest`);
> `production.ts` (styckkostnad netto efter forward-innehav → `expenses.production`);
> `deliveries.ts` (leveransintäkt → `income.contracts`, eller `income.broker` för `contract-broker-*`);
> `applyActions.ts` (BUILD_LINE → `lines`, HIRE → `hiring`, EXPAND/RECRUIT/LEAK/SABOTAGE/TURN → `intel`,
> `BUY_FORWARD` → `commodityPurchase`, `RELEASE` → `income.commodityRelease`);
> `political.ts` (BRIBE, FUND_CAMPAIGN, INFLUENCE, STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP, ASSASSINATE → `political`);
> **passar ingen rad:** `applyActions.ts` `TAKE_LOAN`/`REPAY` (kassa och skuld rör sig lika mycket åt
> samma håll — finansiering, inte intäkt/kostnad) samt `crisis.ts` `resolveBackDown` (−`restrictedRevenueThisTurn`,
> ett återtagande av redan bokförd leveransintäkt) och `resolveSellTheFile` (+`crisisSellFileRevenue`,
> en engångsintäkt som varken är kontrakt, förskott, broker eller råvaruförsäljning).
> `factions.ts` rör bara en FAKTIONS kassa (`embargoTreasuryDrainPerTurn`), inte huset. `BROKER`
> flyttar inga pengar själv; dess intäkt är en vanlig leverans.
>
> **Frågor till ägaren innan P96 byggs** (formen är det golden fryser; en tillagd rad efteråt kostar en
> omfrysning som 8C inte förhandsgodkänner): se `ANDRINGSLOGG.md` 2026-09-29, P96-raden, och
> sessionens rapport.

> **P96 — BYGGD 2026-09-29** (efter ägarbeslutet att utöka formen, se stoppet ovan och §3.1).
> Ny `ledger.ts` (`recordIncome`/`recordExpense`/`recordFinancing`/`sealLedger`), `GameState.ledger`,
> `LedgerEntry` (types.ts). Varje penningflyttande gren skriver sin rad på raden intill sin
> `house.treasury +=/-=`; `resolveTurn()` förseglar `treasuryEnd`/`debtEnd`/`creditLimitEnd` efter
> sista steget och före `advanceTurn` (samma "bokföring runt pipelinen" som krönikan — inget
> fjortonde steg, stegordningen orörd). Raden hittas på `draft.meta.turn`; en tur utan
> penningflytt får ändå en rad (förseglingen skapar den).
>
> **Flödena och deras rad:** `economy.ts` → `fixedCosts`/`interest`; `production.ts` → `production`
> (kontant kostnad, forward-innehavet är ingen kassarörelse); `deliveries.ts` → `contracts`, eller
> `broker` för `contract-broker-*` (prefixet är nu en exporterad konstant, `BROKER_CONTRACT_ID_PREFIX`,
> som både `applyActions.ts` och `deliveries.ts` läser); `applyActions.ts` → `lines`, `hiring`,
> `intel` (EXPAND/RECRUIT/LEAK/SABOTAGE/TURN), `commodityPurchase`, `commodityRelease`,
> `financing.loans`/`repayments`; `political.ts` → `political` (alla åtta ställen där `spend`
> dras: BRIBE, FUND_CAMPAIGN, STAGE_INCIDENT, BACK_CHANNEL, INFLUENCE ×2, FUND_COUP, ASSASSINATE;
> FAVOUR kostar marginal, inte kassa, och skriver ingenting); `crisis.ts` → `clawback`
> (BACK_DOWN) och `fileSale` (SELL_THE_FILE). `advances` är alltid 0 till P98.
>
> **Test:** 35 enhetstester (`test/ledger.test.ts`, minst ett per gren, varje med exakt balans) +
> `test/invariants/ledger-balance.test.ts`: (a) 500 hela partier (125 frön × fyra policyer), varje
> tur balanserar till kronan, en rad per spelad tur; (b) en kontroll av kontrollen (en dopad krona
> gör den röd); (c) 200 fuzz-partier med slumpade handlingar ur alla verb. Mutationsprov: att ta bort
> `recordExpense(..., 'interest', ...)` gör både enhetstestet och balanstestet röda (diff −6 801 kr på
> tur 7 i första partiet), återställt därefter.
>
> **Genuina fynd.** (1) **De 500 botpartierna täcker bara sju rader** (mätt: `fixedCosts`, `production`,
> `contracts`, `interest`, `loans`, `political`, `intel`) — inget parti rör `REPAY`, `BUILD_LINE`,
> `HIRE`, MARKET, BROKER eller krisvalen. Balanstestet över botpartierna ensamt hade alltså missat en
> läcka i de grenarna; därför fuzz-testet (c), som med ett assertat täckningsbevis når alla rader
> utom `advances` (0 till P98) och `clawback` (kräver en kris OCH en restricted-leverans samma
> kvartal, nås inte av fuzzen, ligger bara i enhetstestet). (2) **`applyInfluence` (`political.ts`) drar kassa och sedan
> `return`:ar utan att emitta** när effekten är noll (t.ex. `publicSupport` redan på taket) — en
> tyst statsändring, hård regel 4 brutet sedan P60. Huvudboken bokför den (kassan rörde sig
> faktiskt) och ett test pinnar det. **Inte fixad här:** en tillagd `WireEvent` ändrar `state.wire`,
> alltså golden-hashen, och P96 lovar att inget annat fält ändras. Kräver ett eget beslut.
> (3) **Ett sparat parti från före P96 saknar `ledger`** och kraschar i `recordX` vid nästa
> `resolveTurn` (`persistence.ts` `migrate()` känner bara `meta.version` 1, och versionen höjdes
> inte — samma läge som `chronicle` efter P89). Inte åtgärdat (utanför P96:s mandat); en
> `ledger: []`-migrering vore trivial, men P97-grafen måste då tåla en huvudbok som inte börjar på
> tur 0. (4) **Punkt 0.10 stämde bara till hälften:** `state.wire` beskär till 8 turer, men
> `house.revenueByTurn` är redan en intäktshistorik över hela partiet. Kontroll: huvudbokens
> `contracts + broker + fileSale − clawback`, summerat över partiet, är exakt lika med summan av
> `revenueByTurn` i alla tre golden-partier (per tur gäller det inte: `clawback` skriver om den
> FLAGGADE, tidigare turens `revenueByTurn`).
>
> **Golden.** Före omfrysningen: hashen av sluttillståndet UTAN `ledger` är bit-identisk med de gamla
> frysta värdena i alla tre partier (`13410cbd5a4b`, `32259821910dc`, `72f55dcef5b0c`) — inget
> annat fält ändrades. Omfrysningen ligger i en egen commit (beslut 8C); nya hashar `113da6660a841`
> (passive), `15102b645ed08b` (aggressive), `16561a24fce781` (balanced), 11 huvudboksrader vardera.
> `balance.frozen.json` bit-identisk med `balance.json` (ingen balanssiffra rörd).
> Testsvep: 1 032 vitest (994→1 032), lint, typecheck (alla tre paket), build, e2e.

**P97 — Huvudboken och styrelsens PM.** Grafen i THE COMPANY, kvartalets verifikationer och
styrelsens PM vid granskningsturerna. *Klart när:* varje granskningstur visar ett PM, och grafen
klarar regel 18 i båda formaten. Golden orörd.

**8B — Förskottet**

**P98 — Betalningsvillkor.** `advancePct`, betalning vid tilldelning, förskottet behålls vid
konkurs och återbetalas vid annullering. *Klart när:* varje utfall i §4.1 har ett test, och
golden är omfryst.

**P99 — Villkoren i budmappen.** Förskottsstämpeln, kreditstämpeln och talet för pengar i kassan
nästa kvartal. *Klart när:* alla tre syns utan att mappen scrollas på 390×844. Golden orörd.

**8C — Stående order**

**P100 — Stående order i kärnan.** Unionen, lagringen och de tre slagen med sina tre larm.
*Klart när:* varje slag och varje larm har ett test, befintliga botars beteende är oförändrat,
och golden är omfryst.

**P101 — Anslagstavlan.** *Klart när:* alla tre slag går att sätta och ändra från tavlan, och
ett larm hoppar från This Quarter till rätt kort. Golden orörd.

**8D — Handlingarnas pris**

**P102 — Belopp som köper odds.** Kurvorna för de fyra operationerna, `previewAction` per nivå,
och tillvalet "under utredning" om 8E har antagits. *Klart när:* högsta nivån ger mätbart bättre
utfall än lägsta för alla fyra, ingen nivå ger säker framgång, och golden är omfryst.

**8E — Balans**

**P103 — Härnessen.** Policyn `human`, flytten till `playerWinCurve` och de nya kolumnerna. Ingen
`core`-ändring. *Klart när:* `human` kör 500 partier utan avvisade handlingar över 5 %.

**P104 — Balanspasset.** Mät mot §7.2 och justera bara data. Fetstilta rader ska vara uppfyllda
eller uttryckligen reviderade med motivering. Frys om `balance.frozen.json` sist.

**P105 — Speltest. Ingen kod.** Tre partier på telefon. Frågan i §1, plus de tre vanliga: *Vad
försökte du göra och hittade inte? Vad hände som du inte förstod? När tråkades du?*

Tio prompter. 8A och 8B är kärnan. Om etappen behöver kortas stryks 8D först och sedan 8C.

---

## 10. Medvetet utanför etappen

- **Forskningen** (P81-17). Den är etapp 9 enligt ägarbeslut (a) den 27 september. R&D-kön som
  stående order hör också dit.
- **Prisgolv** och **automatiska bud** som stående order. Båda är möjliga slag enligt
  DESIGN.md §4, men de tar bort beslut i stället för att ge nya, och det motsäger frågan i §1.
- **Nya scenarier.** De hör till en senare etapp, se §12.
- **Rivalhusens ekonomi** som egen simulering. Rivalerna har marknadsandel men ingen kassa, och
  det får vara så.
- **Porträtten och händelsebilderna** (P92). De kopplas in när ägaren har genererat dem, som en
  fristående uppgift som inte är beroende av den här etappen.

---

## 11. Öppna beslut för ägaren

1. ~~Besluten 8A–8G i §2.~~ *Fattade 2026-09-29.*
2. ~~**Ordningen mellan etapp 8 och 9.**~~ *Beslutat 2026-09-29: etapp 8 först.* Kan omprövas efter
   P95. De två etapperna rör olika delar av koden och krockar inte.
3. **Ljudeffekterna** (P93, fynd 1) saknas fortfarande. Huvudbokens bläddring, stämpeln och
   kassaapparaten vid förskottet är tre nya ljud som passar etappen, om du vill hämta dem i
   samma veva.

---

## 12. Efter etappen — kandidater (inte föreslagna här)

- **Etapp 9, forskningen** (redan i ETAPP7 §16).
- **Andra scenariot, `SUEZ`** (DESIGN.md §16): 14 turer, en stor köpare och hela scenariot är en
  enda kris. Det är det billigaste sättet att pröva om systemen generaliserar, eftersom
  kartsystemet redan är byggt för det (ETAPP7 §14). DESIGN.md säger att variationen ska komma
  från nya startlägen, inte från längre partier.
- **Avkolonisering och fördrag** (DESIGN.md §20, etapp 3 i originalplanen). De förutsätter att
  vapenvilor faktiskt inträffar, och det är just det P104 mäter.
