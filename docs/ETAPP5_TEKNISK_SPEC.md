# THE SEVENTH FRONT — Teknisk spec, etapp 5: NÄST MÄKTIGAST I RUMMET

**Version 1.0.11 — antagen (ägarbeslut 2026-09-16), 5A (P53–P58) klar, P59/P60/P61 klara
(2026-09-17).**
Validerad mot `obicankenobi/Valkyria` commit `701c56a` (etapp 4 avslutad, alla P43–P52 körda,
båda P52-fynden avgjorda). Samtliga åtta öppna beslutspunkter avgjorda enligt förslagets egna
rekommendationer, se avsnitt 10. P53 delad i P53a/P53b/P53c efter mätning, se avsnitt 2.1 och
11. **5A (P53–P58) klar (2026-09-17, se avsnitt 8) — med två dokumenterade, kvarstående luckor
(P58:s blockquote: ingen live-utlösare för fallna tjänstemän, `EMBARGO` strukturellt onåbart mot
måltabellens 10–30 %-rad). P59 (5B:s första prompt, `Faction.relations`/`Front.status`), P60
(`INFLUENCE`/`Faction.counterIntelligence`/`LEAK`/`SABOTAGE`/`TURN`) och P61 (`FUND_COUP`,
`DESIGN.md` §13 omskriven i samma commit) klara samma dag. `P62` ("lönnmordet") är nästa
steg.**

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

> **Numrering:** etapp 4 slutade på P52. Etapp 5 är **P53–P64**, direkt efter, enligt ägarens
> beslut 2026-09-15 om rullande numrering utan glapp.

---

## 0. Frågan etappen ska besvara

Designdokumentets tredje pelare lyder: **"Du är alltid näst mäktigast i rummet. Du kan aldrig
vinna över en supermakt. Du kan bara få dem att gå i den riktning du redan tjänar pengar på.
Spelet säger aldrig nej till en handling, det prissätter den."**

Av de tre pelarna är det den enda som fortfarande **inte har någon mekanik alls**. Pelare 1
(vinst kräver våld) byggdes i etapp 1–2 och skärptes i etapp 3. Pelare 2 (varje affär har en
andrahandseffekt) är `THE WIRE` och `causeId`-kedjan. Pelare 3 har hittills bara varit prosa,
för att det inte finns något rum: allt i spelet prissätts anonymt. Det finns ingen människa som
skriver under, ingen som kan säga nej av fel skäl, ingen vars karriär spelaren kan investera i
eller avsluta.

**Frågan etapp 5 ska besvara:** *blir spelet bättre av att köparna får ansikten — eller är den
anonyma marknaden i själva verket det som gör anbudsspelet rent och läsbart?*

Det andra ledet är inte retorik. Etappen tillför den första mekaniken i spelet som kan göra det
SÄMRE: en politisk nivå som inte bär sin vikt förvandlar ett stramt ekonomiskt spel till ett
relationsspel med bokföring. Måltabellen (avsnitt 7) är därför skriven så att ett ärligt "nej"
går att mäta, inte bara ett ja.

---

## 1. Premisskontroll (genomgående krav 8)

Sökt igenom hela `packages/core/src` mot commit `701c56a` innan en rad av förslaget skrevs.
Tio fynd. Fem av dem ändrade förslaget.

### 1.1 Spelet har redan en anonym människa i varje affär — `Order.inspectorIntegrity`

```ts
// orders.ts:80
const inspectorIntegrity = p.rng.int(0, 100)
// types.ts:270
inspectorIntegrity: Pct // dold, avgör mutans effekt
```

Varje utlyst order slumpar fram en dold integritetssiffra som ensam avgör vad en muta köper
(`computeScore`s `bribeTerm`, `pricing.ts:230`). Det finns alltså **redan en tjänsteman i varje
affär** — hon har bara inget namn, inget minne och ingen egen vilja, och hon kastas bort när
ordern avgörs.

**Detta är etappens billigaste ingång, och den formar hela 5A:** ge henne ett namn, en post och
ett minne mellan turer. Mekaniken (muta → dold integritet → viktad poäng) byggs inte om — den
flyttas från ordern till personen. Se avsnitt 3.1.

### 1.2 `Faction.alignment` skrivs ALDRIG av någon kod

Läses på fyra ställen (`alignmentPenalty` vid varje bud, `rivalBlocTerm`, `STAGE_INCIDENT`s
doomsdaygrind i `applyActions.ts:337` och `rivals.ts:190`, `queries.ts:174`) — men sätts bara
en gång, ur scenariodata (`state.ts:262`). Ingen mekanik i spelet kan flytta ett land mellan
blocken.

`DESIGN.md` §13 lovar uttryckligen att `FUND COUP` "vid framgång" ger **ny alignment**. Den
första skrivaren till fältet blir alltså kupp-mekaniken i 5B. Fältet finns, konsumenterna finns,
och de reagerar redan korrekt — det saknas bara någon som vrider på det.

### 1.3 `house.reputation.westStanding`/`eastStanding` skrivs bara av ETT sällsynt krisval

`crisis.ts:210` (`SELL_THE_FILE`) är den enda skrivaren. Men `alignmentPenalty` (`pricing.ts:182`)
läser dem vid **varje enskilt bud**, i varje parti. I ett normalt parti är alltså spelarens
anseende hos de två blocken en konstant 50/50 som aldrig rör sig, trots att den multiplicerar in i
varje anbudspoäng.

Två färdigbyggda, kalibrerade spakar som ingenting drar i. 5A:s politiska beslut och 5B:s
operationer är de naturliga skrivarna.

### 1.4 `Station.coverage` är helt död data

```ts
coverage: ('procurement' | 'military' | 'cabinet' | 'industry')[]
```

Sätts vid scenarioladdning (`state.ts:197`) och hårdkodat till `['procurement']` vid `RECRUIT`
(`applyActions.ts:443`). **Läses av ingenting.** `'cabinet'` — täckningstypen som ordagrant
betyder tillgång till regeringen — ligger oanvänd i typen sedan etapp 1.

Det ger etappen sin informationsgrind gratis: vad spelaren FÅR VETA om en tjänstemans agenda,
integritet och ställning bör styras av om stationen i landet har `'cabinet'`-täckning. Samma
princip som `effectiveDepth` redan tillämpar på anbudsuppskattningar och förbandsvyn (P41).

### 1.5 Krig kan varken börja eller sluta

Det finns ingen status på `Front` eller `Theatre`. `heat.ts`s egen kommentar säger det rakt ut:
*"'Aktiv konflikt' tolkas som 'en front finns i teatern': etapp 1 har ingen dormant/fred-status
för en front"*. `factions.ts`s "forced peace" (`publicSupport < 25` i tre turer) är **bara en
notis** — ingen mekanisk konsekvens är specificerad eller byggd.

Det betyder att 5B:s "krig" inte är en justering av något befintligt utan en ny strukturell
egenskap. Det är etappens dyraste enskilda post och den enda som rör frontsimuleringen. Se
avsnitt 4.2 och beslutspunkt 4.

### 1.6 Det finns ingen relation mellan två länder

`RivalHouse.relations: Record<FactionId, Pct>` finns (`types.ts:482`) — ett rivalhus minns vad
det har för relation till varje köpare. `Faction` har **ingen motsvarighet alls**: inget
land vet något om något annat land. "Relationer mellan länder" är alltså helt ny data — men
formen finns redan som mönster i kodbasen, vilket gör den billig att kopiera.

### 1.7 `Faction.embargoed` har effekter men ingen utlösare

Fältet läses på fyra ställen: två i `orders.ts` (en embargerad faktion utlyser inga ordrar),
`factions.ts:112` (kvartalsvis kassadränering) och sedan P50 även `supply.ts` (råvarutryck via
`commoditySources`). **Ingen kod sätter det till `true`** — `state.ts:263` sätter `false` och
därefter rör ingen det. `factions.ts`s egen kommentar konstaterar det sedan P7.

`DESIGN.md` §1 räknar upp embargot bland de fem sakerna spelaren gör: *"Du säljer, läcker,
**embargerar**, mutar och iscensätter."* Verbet står i kärnidén, har en färdig effektkedja i tre
filer — och har aldrig kunnat utlösas av vare sig spelaren eller världen. 5A:s politiska beslut
blir fältets första skrivare (avsnitt 3.4).

### 1.8 Tre `IntelOp` är deklarerade men avvisas, och två verb saknas helt

`IntelOp = 'RECRUIT' | 'LEAK' | 'SABOTAGE' | 'TURN' | 'WITHDRAW' | 'EXPAND'` — men `LEAK`,
`SABOTAGE` och `TURN` avvisas med `'not implemented in this stage'` (`applyActions.ts:467`).
`ASSASSINATE` finns inte i unionen (`DESIGN.md` §9 flyttade den framåt), och `FUND_COUP` finns
inte i `PoliticalOp`.

Efter att P51 byggde `MARKET` är `BROKER` dessutom den sista handlingstypen som är en **helt tyst
no-op** — den konsumerar en actionPoint och gör ingenting, utan att ens hamna i `rejected`.

### 1.9 Ingen person-entitet finns någonstans i kodbasen

Sökt på hela `packages/core/src`: ingen `Official`, `Character`, `Person`, `Minister` eller
motsvarande. `DESIGN.md` §15 reserverar kategorin — *"Tjänstemän, ministrar, generaler,
inspektörer, agenter: fiktiva. De är spelarens måltavlor"* — men ingenting är byggt. Rivalhusen
(`rivals.json`) är den enda namngivna aktören i spelet, och de är institutioner, inte människor.

### 1.10 Härnessens botar anropar POLITICAL och INTERNAL — men aldrig INTEL, MARKET eller BROKER

`policies.ts` skickar `STAGE_INCIDENT`, `BACK_CHANNEL`, `TAKE_LOAN` och `REPRIORITISE_RND`.
Ingen bot har någonsin anropat `MARKET` — vilket är exakt varför P52 inte kunde mäta sin egen
`BUY_FORWARD`-rad och fick skriva "strukturellt omätbar" i måltabellen.

**Den lärdomen blir ett genomgående krav i den här etappen** (avsnitt 2.2): ett verb som ingen
botpolicy anropar kan inte balanseras, och ska därför inte byggas utan att samma prompt också
lär minst en bot att använda det.

---

## 2. Två spärrar som måste hanteras före första raden kod

### 2.1 `BUYOUT`-kaskaden är inte längre bara en mätföroreningsfråga

Fyra gånger har det konstaterats (P37, P42, P47, P52) att 200/200 `balanced`-partier slutar i
`BUYOUT` på **exakt en enda tur** — tur 10 i P47, tur 11 i P52. Fyra gånger har ägaren valt att
lämna `boardTarget` orört, varje gång med samma goda motivering: det låg utanför den etappens
mandat.

**För etapp 5 är avvägningen en annan, och det är förslagets viktigaste enskilda påstående.**

För etapp 3 och 4 var kaskaden ett *mätproblem*: mekaniken fungerade, men härnessen hann inte se
den. Etapp 5:s hela ämne är relationer som mognar, karriärer som stiger och faller, kampanjer som
betalar sig senare, kupper som tar tid att sätta. **Ett elva turer långt parti gör inte de
mekanikerna svårmätta — det gör dem obyggbara.** En kupp som mognar på fyra turer hinner spelaren
se två gånger. En tjänsteman vars ställning ska kunna stiga och falla hinner göra det en gång.
Att bygga ett politiskt system ovanpå ett elva turer långt parti är att bygga en mekanik som
aldrig får visa vad den är.

> **Reviderat 2026-09-17, efter mätning — se ANDRINGSLOGG.md.** Avsnitt 10 punkt 1:s ursprungliga
> beslut ("`boardTarget` omkalibreras som P53, ingen ny mekanik") mättes innan koden skrevs och
> höll INTE. Kvarstående i det här avsnittet av samma skäl som en felaktig rad i något annat
> dokument aldrig bara stryks: så att den korrigerade slutsatsen går att jämföra mot vad som
> faktiskt föreslogs och varför det inte räckte, inte bara vad som till sist byggdes.

**Grundorsaken är djupare än en kalibreringssiffra, och den ligger i två system etapp 5 inte
äger** (`board.ts`, P30, etapp 2; `orders.ts`, P35, etapp 3) — men mätningen visar att en ändring
BEGRÄNSAD till `boardTarget`-siffran, som avsnitt 10 punkt 1 ursprungligen beslutade, inte löser
den.

**Mätt (n=30–60 per botpolicy, `passive`/`aggressive`/`balanced`/`capacity`, härnessen körd med
och utan styrelsegranskningen):**

1. **Alla fyra botpolicyer har exakt 0 kr i bokförd intäkt vid den FÖRSTA granskningsturen (tur
   6)**, oavsett spelstil — mot ett krav på 2,16 Mkr. Ingen kalibrering av `threshold` löser en
   granskning som infaller innan intäkten fysiskt kan existera; det enda värdet som alltid
   klarar den är 0, vilket gör kontrollen informationslös (samma svar oavsett spelarens
   beslut).

2. **Med styrelsegranskningen helt avstängd dör `passive`, `balanced` och `capacity` ändå — i
   INSOLVENCY, vid tur 15–17, med 0,3–0,4 Mkr kumulativ intäkt mot ett mål på 8 Mkr.** Husets
   fasta kostnader (429 000 kr/tur, `economy.ts`) äter grundkapitalet (4 Mkr, 9,3 turers
   uthållighet utan intäkt) snabbare än ekonomin hinner generera någon. `BUYOUT` var alltså
   aldrig den egentliga dödsorsaken för tre av fyra strategier — bara den som råkade komma
   först. En omkalibrering av `boardTarget` byter dödsorsak, inte överlevnadschans.

3. **`aggressive` är undantaget — och avslöjar den verkliga snedheten.** Den botpolicyn
   överlever till `SCENARIO_COMPLETE` (29/30 utan granskning) med 45 % av det totala
   kontraktsvärdet mätt i kronor, mot `balanced`s 9,7 %. Samtliga fyra kaskadmätningar (P37,
   P42, P47, P52) kördes uteslutande mot `balanced` — en botstrategi som tar en tiondel av sin
   marknad. Det förklarar varför kaskaden mätts som total och genomgående: den mätande botens
   egen svaghet, inte bara scenariots ekonomi, drev siffran.

**Grundorsaken till 1–2, spårad till specifik kod:** varje faktions `materielNeed`
(`orders.ts`/`factions.ts`) initieras till **0** vid scenariostart (`state.ts`), trots att
scenariot beskriver arméer mitt i ett pågående krig 1964. Utlysning kräver att behovet
passerar `orderTriggerThreshold`, och fredstidspåfyllningen (`peacetimeReplacement`) tar 5–10
turer att nå dit från noll. **Resultat: inga ordrar alls, av någon faktion, turerna 1–4** —
medan husets fasta kostnader löper och styrelsen redan granskar vid tur 6.

**Reviderat beslut (avsnitt 10, punkt 1 — se den korrigerade texten där för hela
resonemanget): P53 delas i tre.**

- **P53a** (scenariodata, `indochina-slice.json`): seeda varje faktions `materielNeed` till
  `orderTriggerThreshold` vid partistart — krigförande arméer har redan ett stående
  upphandlingsbehov, de startar inte med tomma order men fulla förråd. Mätt effekt: första
  bokförda intäkten flyttar från tur 8,2 till tur 4,2; `passive` går från 30/30 `INSOLVENCY`
  till 30/30 `SCENARIO_COMPLETE` (utan granskning).
- **P53b** (`board.ts`): `progressSnapshot` byter mätvärde från enbart bokförd intäkt till
  bokförd intäkt **+ kontrakterat, ej levererat** (`contract.price × obetald andel`, summerat
  över aktiva/sena kontrakt) — ett försvarsbolags styrelse ser orderboken, inte bara kassan.
  Den linjära förväntanskurvan byts mot en kvadratisk ramp (låga krav tidigt, fullt
  `threshold` vid `dueTurn`), som matchar hur en behovsdriven ekonomi faktiskt växer. Mätt
  effekt (med P53a): `BUYOUT`-frekvens `passive` 100 %→13 %, `aggressive` 93 %→0 %, `balanced`
  100 %→80 %, `capacity` oförändrat 100 % — ordningen följer nu strategiernas faktiska
  ekonomiska styrka i stället för att vara identisk för alla fyra.
- **P53c** (balanspass, ingen kod): verifiera att `boardTarget.threshold` (2×) fortfarande är
  rätt siffra med P53a+P53b på plats — mätningen visar att den bästa boten når 7,4 Mkr mot
  målet 8 Mkr utan att röras, så den nuvarande siffran lämnas orörd om inget annat visar sig
  vid balanspasset.

Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för mätskripten och de fullständiga tabellerna bakom
punkterna ovan.

### 2.2 Genomgående krav för hela etappen

Utöver de krav som redan gäller (`CLAUDE.md`s tio hårda regler):

**GK-A. Varje nytt verb ska användas av minst en botpolicy i samma prompt som bygger det.**
Direkt lärdom av P52:s `BUY_FORWARD`-rad. Ett verb bara spelaren kan nå är ett verb balanspasset
inte kan uttala sig om.

**GK-B. Varje ny mekanik ska ha en avläsbar effekt inom fem turer.** Inga femårslöften
(`DESIGN.md` §13:s "förköpsrätt i fem år" för lyckad kupp skrivs om till något kortare, se 4.4).

**GK-C. Ingen ny slumpkälla, inget nytt magiskt tal.** Hård regel 2 och 5. Alla politiska
sannolikheter i `balance.json`, all slump via `ctx.rng`.

**GK-D. Verkliga personer rörs aldrig.** `DESIGN.md` §15 är bindande och görs till ett testat
skyddsräcke, se avsnitt 6.

---

## 3. 5A — RUMMET (P54–P58)

Halvan som ger köparna ansikten. Bygger ingen ny ekonomi: varje mekanik nedan skriver till fält
som redan finns och redan har konsekvenser.

### 3.1 `Official` — tjänstemannen som redan fanns, med namn och minne

```ts
export type Post = 'procurement' | 'defence' | 'finance' | 'interior'

export interface Official {
  id: string
  name: string                 // fiktivt, register per land — DESIGN.md §15
  factionId: FactionId
  post: Post
  integrity: Pct               // DOLD. Ärver Order.inspectorIntegrity:s roll
  standing: Pct                // hur säker posten är. Faller vid skandal, stiger vid kampanjstöd
  relationToPlayer: Pct
  agenda: Agenda               // se 3.2
  status: 'active' | 'fallen' | 'dead'
}
```

`Order` byter `inspectorIntegrity: Pct` mot `officialId: OfficialId` och läser integriteten ur
personen i stället. **Formeln i `computeScore` ändras inte en rad** — den får samma tal från en
annan källa. Det är hela poängen med att ta ingången här: mekaniken är redan kalibrerad (P4),
bara anonym.

Konsekvensen som gör det till ett spel: integriteten är inte längre nyrullad per order. Muta
samma person två gånger och du vet vad du köper. Muta en ny person och du vet ingenting — om du
inte har en station med `'cabinet'`-täckning i landet (fynd 1.4).

**Tjänstemän byts ut.** En `fallen` tjänsteman ersätts av en ny med ny `integrity`, ny `agenda`
och `relationToPlayer` nollställd. Relationskapital är färskvara, och det är den klocka som gör
politiken spännande inom ett kort parti (GK-B).

**Namnregistret är scenariodata**, i samma form som `rivals.json`. Fiktiva namn i respektive
lands register — `DESIGN.md` §15, ordagrant.

### 3.2 Agendan — det som gör två köpare olika

Varje tjänsteman vill ha något mätbart, och det ändrar hur hon viktar anbud:

| Agenda | Vad hon vill | Mekanisk effekt |
|---|---|---|
| `REARM` | Volym, snabbt | `weights.delivery` upp, `weights.price` ner |
| `AUSTERITY` | Lägsta pris | `weights.price` upp, allt annat ner |
| `MODERNISE` | Teknisk nivå | Kräver `product.techRequired` över ett golv; annars diskvalificerad |
| `NON_ALIGNMENT` | Ingen blockbindning | `alignmentPenalty`s utslag fördubblas |
| `SELF_ENRICHMENT` | Sig själv | Låg `integrity` per konstruktion — mutan biter hårdast, skandalrisken högst |

Hooken är redan byggd: `Order.weights` finns sedan P4 och skiftas redan av frontläget
(`weightPressureShift`, P36). Agendan blir en **andra** viktskiftare på samma ställe — samma
mönster, ingen ny struktur.

Det är också svaret på "olika politiska agendor" som en mekanik snarare än som färg: två köpare
med samma budget och samma behov blir olika affärer, och spelaren kan lära sig skillnaden.

### 3.3 Att påverka en människa

Tre verb, varav ett redan finns:

**`BRIBE` — riktas om.** Tar `officialId` i stället för bara `targetFactionId`. Spenderar som
förut, men relationsvinsten skalas mot personens `integrity` (låg integritet → mer för pengarna)
och höjer hennes `scandalRisk`. `bribeRelationMaxPerTurn`-taket behålls, per person i stället för
per faktion.

**`FUND_CAMPAIGN` — nytt.** Höjer `standing`. Billigt per punkt, verkar över flera turer, rör
inte `DOOMSDAY`. Det här är "stödja kampanjer": du betalar för att personen du redan äger ska
sitta kvar. Risken är dubbel — hon kan falla ändå (pengarna borta), och att finansiera en
utländsk politiker är precis den sortens sak som bränner en station.

**`FAVOUR` — nytt, och det enda verbet i spelet som inte kostar pengar.** Du prioriterar hennes
order framför en mer lönsam: kostnaden bokförs i **marginal**, inte i kassa. I ett spel där varje
annat verb prissätts i pund är det den enda handling som prissätts i det spelaren faktiskt mäts
på av styrelsen. Föreslås som etappens mest intressanta enskilda handling.

### 3.4 Beslutet — när politiken slår tillbaka

En tjänsteman med tillräcklig `standing` vars agenda är ohörsammad fattar ett `PolicyDecision`
som drabbar spelaren. Samtliga fem skriver till fält som **redan har färdiga effektkedjor**:

| Beslut | Skriver | Effekt som redan finns |
|---|---|---|
| `EMBARGO` | `Faction.embargoed = true` | Inga ordrar, kassadränering, råvarutryck (fynd 1.7) |
| `PRICE_CAP` | `trueBudget`-faktorerna för faktionen | Fler bud diskvalificeras över taket (`bidding.ts`) |
| `TENDER_REFORM` | `Order.weights` permanent för faktionen | Anbudspoängen förskjuts |
| `LICENCE_REVIEW` | `Station.exposure` i landet | Matar EXPOSURE-slutvillkoret (P29) |
| `PREFERRED_SUPPLIER` | Poängbonus till spelaren **eller en rival** | `computeScore` |

Att det sista kan gå till en rival är avsiktligt: politiken ska vara en arena där spelaren kan
förlora mot någon annan, inte bara ett bord med spakar.

**`EMBARGO` är den viktigaste raden i hela etappen** — den gör ett verb ur kärnidén (§1) till
något som faktiskt kan hända, och den kan hända spelaren, inte bara av spelaren.

### 3.5 `BROKER` byggs — den sista tysta handlingen

`BROKER` (förhandla direkt med en köpare utanför anbudsförfarandet) har varit deklarerad sedan
P2 och är efter P51 den enda kvarvarande helt tysta grenen i `applyActions.ts`. Den hör hemma
här: ett mäklat avtal är per definition ett avtal med en **person**, inte med ett anbudsförfarande.

Föreslagen form: ett direktkontrakt till ett pris spelaren sätter, som går igenom om
tjänstemannens `relationToPlayer` och `integrity` medger det — förbi `computeScore` helt, men med
en `standing`-kostnad för henne och en `scandalRisk` för båda. Hård regel 6 gäller: ogiltiga
`BROKER`-handlingar hamnar i `rejected` i stället för att sväljas.

---

## 4. 5B — VÄRLDEN (P59–P63)

Halvan som gör länderna till aktörer i stället för kunder. **Förutsätter 5A**: kupp och lönnmord
riktas mot 5A:s tjänstemän, och utan dem finns inget mål.

### 4.1 Relationer mellan länder

```ts
// Faction
relations: Record<FactionId, Pct>   // samma form som RivalHouse.relations (fynd 1.6)
```

Ny data, känt mönster. Relationen faller av leveranser till motståndaren, av iscensatta
incidenter och av framgångsrika påverkanskampanjer — och stiger av `BACK_CHANNEL` och tid.

### 4.2 Krig som ett läge, inte ett faktum

```ts
// Front
status: 'war' | 'ceasefire' | 'dormant'
```

Det strukturellt dyraste tillägget (fynd 1.5) och det som gör pelare 1 komplett. En front i
`ceasefire` genererar inga stridsförluster, alltså inget materielbehov, alltså inga ordrar
(hela etapp 3:s kedja) — och `heat` faller. **Fred är dyrt för dig.** Det är designdokumentets
centrala spänning, uttryckt på landnivå i stället för på doomsdaynivå.

Övergångarna drivs av `relations`, `publicSupport` och `doomsday` — inte av ett tärningskast, så
att spelaren kan räkna på dem. `STAGE_INCIDENT` (byggd sedan P18) blir därmed för första gången
ett verb som kan **starta** något, inte bara höja en siffra.

### 4.3 Påverkanskampanjer och underrättelsetjänster

**`INFLUENCE` (nytt POLITICAL-op)** — betala för att flytta en faktions `publicSupport` eller
dess `relations` mot ett annat land. Långsamt, förnekbart, billigt. Den icke-våldsamma vägen till
samma mål som `STAGE_INCIDENT`, och det som gör "påverkanskampanj" till ett val mot ett
alternativ i stället för till en enda knapp.

**`Faction.counterIntelligence: Pct` (nytt)** — landets egen tjänst. Skalar hur mycket
`exposure` spelarens operationer i landet genererar, och **stiger när spelaren åker fast**. Det
ger EXPOSURE-slutvillkoret (redan byggt, P29) en källa som svarar på vad spelaren gör, i stället
för att bara ticka på egen hand.

Med den på plats blir `LEAK`, `SABOTAGE` och `TURN` (deklarerade sedan etapp 1, avvisade sedan
dess — fynd 1.8) byggbara mot något som betyder något: de är billiga mot ett land med svag
tjänst och livsfarliga mot ett med stark.

### 4.4 `FUND_COUP`

`DESIGN.md` §13 ger formen ordagrant: stor, sällsynt, dyr. Vid framgång ny `alignment`
(fältets första skrivare, fynd 1.2), annullerade kontrakt hos den gamla regimen, företräde
därefter. Vid misslyckande: förlorade pengar, larmad kontraspionage
(`counterIntelligence` upp), permanent skadad relation.

**Ändring mot designdokumentet, avgjord vid antagandet (avsnitt 10, punkt 6):** §13:s
"förköpsrätt i **fem år**" (tjugo turer) skrivs om till ett kortare, mätbart företräde. GK-B —
ett löfte som sträcker sig längre än partiet är inte en mekanik, det är en slutscen. `DESIGN.md`
§13 uppdateras i samma commit som P61, med loggrad.

Med 5A byggt är en kupp naturligt "installera din egen tjänsteman": den nya regimen kommer med
tjänstemän vars `relationToPlayer` ärver en del av vad du byggt upp. Det är kopplingen som gör de
två halvorna till en etapp i stället för två.

### 4.5 `ASSASSINATE`

`DESIGN.md` §9 och §15 har redan avgjort formen, och den bär oförändrad hit: **riktas bara mot
fiktiva tjänstemän** (5A:s `Official`), aldrig mot verkliga namngivna statschefer. Sätter
`Official.status = 'dead'`, vilket utlöser samma ersättningskedja som `fallen` — med en mycket
högre `counterIntelligence`-kostnad och en `DOOMSDAY`-effekt om målets land är blockbundet.

Att målet är fiktivt är inte en smaksak utan en **typgaranti**: handlingen kan strukturellt inte
peka på något annat än ett `Official`-id, och `Official` finns bara som genererad, fiktiv
scenariodata. Skyddsräcke 3 (avsnitt 6) fäster det med ett test på typnivå, samma mönster som
etapp 3:s "inga order till förband".

---

## 5. Vad det kostar

Var ärlig om det här innan arbetet börjar.

**Det här är en större etapp än 3 och 4.** Tolv prompter mot tio, och två av tilläggen
(`Front.status`, `Official` som ersätter `inspectorIntegrity`) rör system som varit frusna sedan
etapp 1. Beslutspunkt 8 erbjuder en nedskärning till tio.

**`applyActions.ts` är redan 568 rader** — kodbasens största steg-fil. Etappen lägger till fem
till sju verb. Filen måste delas (samma mönster som P23 bröt ut `crisis.ts` och `upkeep.ts`),
och det ska ske i den prompt som spränger den, inte som en efterhandsstädning.

**Pipelinen får ett nytt steg, `politics`, mellan `factions` och `heat`** (avsnitt 10, punkt 3).
Hård regel 7 tillåter det eftersom ägaren själv beslutat det, uttryckligen, vid antagandet.

**Golden fryses om i varje prompt som ändrar `GameState`s form.** Med den här etappens omfång blir
det sex till åtta gånger. Samma uttryckliga budget som etapp 4 satte, av samma skäl: etapp 3
budgeterade två och behövde fyra, och den tystnaden var värre än kostnaden.

**Två balanspass**, ett per halva (P58, P63), plus P64 som slutgranskning av hela etappen.

---

## 6. Skyddsräcken

Fem regler. De ska stå som kommentar i koden.

**1. Pipelinens stegordning ändras bara enligt det beslutade nya `politics`-steget** (avsnitt 10,
punkt 3) — aldrig ytterligare, aldrig av bekvämlighet. Hård regel 7.

**2. Anbudsformeln räknas inte om.** `computeScore` får sina tal från nya källor (personens
integritet i stället för orderns, agendans vikter i stället för bara frontlägets) men formeln
själv är fryst. Ett test pinnar att samma indata ger samma poäng som före etappen.

**3. Verkliga personer kan inte röras.** `ASSASSINATE`, `BRIBE`, `FUND_CAMPAIGN` och `FAVOUR` tar
ett `OfficialId` — aldrig ett `FactionId` ensamt, aldrig ett fritextnamn. Ett typnivåtest
(`expectTypeOf`, samma mönster som `types.skyddsracke1.test.ts` och `types.skyddsracke4.test.ts`)
fäster att `PlayerAction` inte kan bära ett målfält som pekar på något annat än en genererad,
fiktiv tjänsteman.

**4. Varje nytt verb har en bot.** GK-A. Ett test räknar att samtliga nya `PlayerAction`-op
förekommer i minst en `policies.ts`-strategi.

**5. Etapp 3:s och 4:s invarianter håller.** Σ `formations[side].equipment` === `front.equipment`
på båda fronterna, och `supplyCostIndex` är fortsatt en funktion av `commodities`. Etapp 5 rör
varken förband eller råvaror — testerna flyttas inte, de ska bara fortsätta vara gröna.

---

## 7. Måltabell

Hypoteser, inte acceptanskriterier. Mäts med härnessen, 200 partier `balanced`, om inget annat
anges. **Samtliga rader förutsätter att P53 (`boardTarget`-omkalibreringen, avsnitt 10 punkt 1)
är körd** — med en oförändrad `boardTarget` är partiet elva turer långt och ungefär hälften av
raderna nedan är onåbara av samma skäl som i P47 och P52.

| Kriterium | Målvärde | Halva | Mätt (P58) |
|---|---|---|---|
| **Partier där minst en tjänsteman byts ut medan spelaren har en relation till henne** | **> 60 %** | 5A | **0 % — MISS, strukturellt (ingen live-utlösare byggd, se P58:s blockquote)** |
| Andel ordrar där agendan faktiskt ändrade vinnaren (mot samma order utan agenda) | 15–35 % | 5A | 34,5 % — TRÄFF |
| **Partier där spelaren drabbas av minst ett `PolicyDecision`** | **> 70 %** | 5A | **100 % — TRÄFF** |
| Partier där `EMBARGO` utlöses mot spelaren minst en gång | 10–30 % | 5A | **100 % — MISS, strukturellt (se P58:s blockquote)** |
| `FAVOUR` valt minst en gång av en bot som hade ett mer lönsamt alternativ | > 40 % | 5A | 50,8 % — TRÄFF |
| **Partier där minst en front byter `status` minst en gång** | **> 50 %** | 5B | ej mätt än — P64 |
| Partier där en `ceasefire` mätbart sänker ordervolymen turen efter | alltid, när den inträffar | 5B | ej mätt än — P64 |
| **Partier där `counterIntelligence` stigit mätbart av spelarens egna operationer** | **> 50 %** | 5B | ej mätt än — P64 |
| Lyckade kupper per parti | 0–1, aldrig fler | 5B | ej mätt än — P64 |
| `alignment` ändras minst en gång i ett parti | > 20 % | 5B | ej mätt än — P64 |
| Etapp 3:s och 4:s invarianter (skyddsräcke 5) | alltid | båda | höll (full CI grön genom P57, se `docs/ANDRINGSLOGG.md`) |
| **Är spelet bättre? (avsnitt 0)** | **Ägarens omdöme efter P64, inte en siffra** | båda | ej avgjort än — P64 |

Den sista raden är inte en formalitet. Den är den enda raden i hela dokumentet som kan underkänna
etappen, och den besvaras av en människa som spelat, inte av härnessen.

---

## 8. Promptsekvens

### Förberedelse

> **Reviderad 2026-09-17** (se avsnitt 2.1 och avsnitt 10 punkt 1 för hela mätningen bakom
> revideringen): den ursprungliga P53 ("omkalibrera `boardTarget`, ingen ny mekanik") ersätts
> av tre prompter. Ingen av dem rör `boardTarget.threshold` — måltalet (2×) mättes vara rätt,
> det var vad som mättes mot det som saknade grund.

**P53a — arméerna startar mitt i kriget, inte i fred — BYGGD 2026-09-17**
> `Faction.materielNeed[cat]` seedas till `balance.json`s `orderTriggerThreshold[cat]` för varje
> faktion vid scenariostart (`state.ts`), inte 0. Ingen kod i `orders.ts`/`factions.ts` rörs —
> bara startvärdet. Scenariodata, inte en ny mekanik.
>
> *Klart när:* ett test visar att `createInitialState` ger varje faktion `materielNeed` lika med
> `orderTriggerThreshold` för samtliga kategorier vid tur 0; en härnessmätning (n≥30, samtliga
> fyra botpolicyer) visar att första bokförda intäkten sker mätbart tidigare än före ändringen;
> golden omfryst i denna commit och ingen annan, med loggrad.
>
> **Klart:** samtliga tre villkor uppfyllda. Två nya tester i `state.test.ts` (exakt
> `orderTriggerThreshold` per faktion, oberoende objekt per faktion). Härnessmätning n=30/
> botpolicy, första bokförda intäkt: `passive` tur 10,00→7,60 (var 29/30 utan intäkt alls →
> 0/30), `aggressive` 7,21→3,33, `balanced` 7,73→3,50, `capacity` 7,73→3,57 — mätbart tidigare
> för alla fyra. `golden.test.ts`s tre `expectedHash` omfrysta, `fixtures/balance.frozen.json`
> orörd (`orderTriggerThreshold` fanns redan i `balance.json`). Fullt testsvep grönt (391
> tester, lint, typecheck, build, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela
> mätningen.

**P53b — styrelsen mäter orderboken, inte bara kassan — BYGGD 2026-09-17**
> `board.ts`s `updateProgressSnapshot`: `progressSnapshot` = (bokförd intäkt + kontrakterat,
> ej levererat värde) / `foundingCapital`, i stället för bara bokförd intäkt. `runReview`s
> `expectedProgress`-formel byts från linjär (`threshold × turn/dueTurn`) till kvadratisk
> (`threshold × (turn/dueTurn)²`) — samma `threshold` vid `dueTurn`, lägre krav tidigt.
>
> *Klart när:* ett test visar att `progressSnapshot` inkluderar aktiva/sena kontrakts obetalda
> andel (`contract.price × (1 − unitsDelivered/quantity)`), summerat, inte bara
> `revenueByTurn`; ett test visar att `expectedProgress` vid `turn = dueTurn/2` är en fjärdedel
> av `threshold`, inte hälften; en härnessmätning (n≥30) visar att `BUYOUT`-frekvensen skiljer
> sig mellan botpolicyer i stället för att vara identisk för alla fyra; golden omfryst i denna
> commit och ingen annan, med loggrad.
>
> **Klart:** samtliga fyra villkor uppfyllda. `progressSnapshot`-testet och `computeExpectedProgress`-
> testet (en ny, exporterad ren funktion, samma mönster som P50:s `deriveSupplyCostIndex`) båda i
> `board.test.ts`. Härnessmätning n=30/botpolicy: `BUYOUT`-frekvens `passive` 0 %, `aggressive`
> 0 % (29/30 `SCENARIO_COMPLETE`), `balanced` 67 %, `capacity` 70 % — tydligt olika, och följer nu
> policyernas mätta ekonomiska styrka (snittintäkt 6,50/7,52/2,08/0,81 Mkr) i stället för att vara
> identisk 100 % för alla fyra. `golden.test.ts`s tre `expectedHash` omfrysta. Fullt testsvep
> grönt (393 tester, lint, typecheck, build, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela
> mätningen.

**P53c — balanspass: håller 2×? — VERIFIERAD 2026-09-17, INGEN KOD ELLER DATA ÄNDRAD**
> Ingen kod. Härnessen mot `boardTarget.threshold` (2×) med P53a+P53b på plats. Skruva bara
> `balance.json`/scenariodata om måltalet inte håller, med motivering och loggrad — annars
> lämnas det orört.
>
> *Klart när:* `threshold` verifierad eller reviderad med motivering och loggrad; `BUYOUT`-
> frekvensen följer strategiernas mätta ekonomiska styrka (bättre bot → lägre frekvens), inte
> identisk för alla fyra; hela CI-kedjan grön.
>
> **Klart:** samtliga tre villkor uppfyllda. Känslighetsanalys (n=30/botpolicy, threshold
> injicerat direkt i `state.house.boardTarget.threshold` efter uppresning — ingen kod eller
> `balance.json`/scenariodata rörd) mot 1,5×/2×/2,5×: **1,5× är för löst** (svag diskriminering,
> även de svagaste botarna klarar sig ofta); **2× (nuvarande) ger tydligast diskriminering**
> (`passive`/`aggressive` i praktiken alltid godkända, `balanced`/`capacity` mestadels
> underkända, ordningen följer exakt den mätta ekonomiska styrkan); **2,5× är för strängt**
> (mättar mot nästan enhetligt `BUYOUT` 70–87 % för alla fyra, inklusive den starkaste boten).
> **Avgjort: `threshold` (2×) lämnas orört** — bekräftar prototypens tidigare punktmätning (se
> avsnitt 2.1) med en faktisk känslighetsanalys. Fullt testsvep grönt (393 tester, lint,
> typecheck, build, e2e) utan någon kodändring. **P53 (P53a+P53b+P53c) därmed HELT KLAR** — se
> `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela mätningen.

### 5A — Rummet

**P54 — tjänstemannen får ett namn — BYGGD 2026-09-17**
> `Official`, namnregistret som scenariodata, `Order.inspectorIntegrity` → `Order.officialId`.
> Dela `applyActions.ts` om den spränger.
>
> *Klart när:* ett test visar att `computeScore` ger identisk poäng som före för samma
> integritetstal; ett test visar att samma tjänsteman ger samma integritet två turer i rad; ett
> test visar att en `fallen` tjänsteman ersätts med nollställd relation; golden omfryst.
>
> **Klart:** samtliga fyra villkor uppfyllda. `pricing.test.ts` pinnar `computeScore` mot ett
> hårdkodat värde (skyddsräcke 2 — formeln själv oförändrad, bara källan för
> `inspectorIntegrity`-talet flyttad från `Order` till `state.officials`). `orders.test.ts`
> visar att en order en senare tur pekar på SAMMA `officialId` med OFÖRÄNDRAD integritet. Nytt
> `officials.test.ts`: `replaceOfficial` (ren funktion, ingen live-utlösare ännu — se
> `officials.ts`s egen kommentar, byggs i P56/P57) nollställer `relationToPlayer` och sätter
> `status: 'active'` för både en `fallen` och en `dead` tjänsteman. `applyActions.ts` INTE rörd
> — P54 bygger ingen ny `PlayerAction`, sprängpunkten hör till P56/P57. `golden.test.ts`s tre
> `expectedHash` omfrysta — genuin trajektorieändring (en faktions procurement-integritet är nu
> FAST i stället för nyrullad per order), inte bara formen. Fullt testsvep grönt (400 tester,
> lint, typecheck, build, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet.

**P55 — agendan viktar affären — BYGGD 2026-09-17**
> `Agenda` enligt 3.2, som andra viktskiftare vid sidan av `weightPressureShift`.
>
> *Klart när:* ett test visar att två köpare med identiskt behov men olika agenda ger olika
> vinnare; ett test visar att `MODERNISE` diskvalificerar under teknikgolvet; golden omfryst.
>
> **Klart:** samtliga tre villkor uppfyllda. `weightsForOrder(pressure, agenda)` (`orders.ts`)
> — REARM/AUSTERITY skiftar `order.weights` (verifierat: två riktigt genererade ordrar, samma
> köpare, bara agendan olika, ger olika vinnare mellan samma två konkurrerande bud).
> `bestEligibleProduct` fick ett tredje filter (`techRequired > agendaModerniseTechFloor`) för
> MODERNISE. NON_ALIGNMENT fördubblar `blocTerm` i både `bidding.ts` och `queries.ts` (håller
> P24:s invariant). SELF_ENRICHMENT krävde ingen ny kod (redan i `officials.json`s startdata,
> P54). Tre nya, PROVISORISKA balanstal. Tre pre-existerande tester i `orders.test.ts`
> fixade (byggde på standardvikter vid pressure 0, som inte längre håller för en köpare med
> icke-neutral standardagenda). `golden.test.ts`s tre `expectedHash` omfrysta,
> `fixtures/balance.frozen.json` synkad. Fullt testsvep grönt (403 tester, lint, typecheck,
> build, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet.

**P56 — att påverka en människa — BYGGD 2026-09-17**
> `BRIBE` riktas om mot `officialId`. `FUND_CAMPAIGN` och `FAVOUR` byggs. Minst en bot lär sig
> använda var och en (GK-A).
>
> *Klart när:* ett test visar att `FUND_CAMPAIGN` håller kvar en tjänsteman som annars fallit;
> ett test visar att `FAVOUR` kostar marginal och inte kassa; ett test visar att ogiltiga
> handlingar hamnar i `rejected`; golden omfryst.
>
> **Klart:** samtliga fyra villkor uppfyllda, plus skyddsräcke 3 (`types.skyddsracke3.test.ts`)
> och skyddsräcke 4 (`policies.test.ts`) i samma commit. `Official.scandalRisk`/`House.
> favourMarginSpent` nya fält. `PlayerAction`s `POLITICAL` delad i tre varianter (`type`
> oförändrad). `applyActions.ts` (568 rader) sprängdes — POLITICAL utbruten till ny
> `resolve/political.ts` (427 rader kvar i `applyActions.ts`), samma mönster som P23:s
> `crisis.ts`/`upkeep.ts`. BRIBE: relationsvinst skalad mot låg integritet, höjer `scandalRisk`,
> taket per tjänsteman. FUND_CAMPAIGN (`aggressive`) och FAVOUR (`balanced`) — vardera en bot.
> Golden omfryst. Fullt testsvep grönt (415 tester, lint, typecheck, build, e2e). Se
> `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet.

**P57 — politiken slår tillbaka — BYGGD 2026-09-17**
> `PolicyDecision` enligt 3.4, inklusive `EMBARGO` som första skrivare till `Faction.embargoed`.
> `BROKER` byggs (3.5).
>
> *Klart när:* ett test visar att en ohörsammad agenda leder till ett beslut; ett test visar att
> `EMBARGO` stoppar faktionens ordrar via den redan byggda kedjan; ett test visar att
> `PREFERRED_SUPPLIER` kan gå till en rival; golden omfryst.
>
> **Klart:** samtliga tre villkor uppfyllda. Nytt steg `politics.ts`, insatt mellan `factions`
> och `heat` (ägarbeslutet, avsnitt 10 punkt 3). Ett fast, PROVISORISKT 1:1-schema agenda→beslut
> (`balance.json`s `_p57_note`): REARM→TENDER_REFORM, AUSTERITY→PRICE_CAP, MODERNISE→
> LICENCE_REVIEW, NON_ALIGNMENT→EMBARGO, SELF_ENRICHMENT→PREFERRED_SUPPLIER. "Tillräcklig
> standing"/"ohörsammad" operationaliserat mot `standing`/`relationToPlayer`, som redan fanns.
> PREFERRED_SUPPLIER går i den här triggern alltid till en rival, aldrig spelaren. `BROKER`
> byggd: direktkontrakt förbi `computeScore` helt, avgjort av köparens procurement-tjänstemans
> relation/integrity — vid godkännande drabbas hennes `standing`/`scandalRisk` och (husets sida
> av "en scandalRisk för båda") landets `Station.exposure`. **Ett genuint fynd under bygget:**
> `Official.relationToPlayer` startar på 0 för alla, så "ohörsammad" var annars sant redan tur
> 1 för varje tillräckligt högt stående tjänsteman — bröt två av etapp 3/4:s gröna
> invarianttester (skyddsräcke 5). Fixat med ett nytt PROVISORISKT balanstal
> `policyDecisionMinTurn` (4) som gate:ar hela steget. `bidding.ts` fick en
> `preferredSupplierScoreBonus` adderad EFTER `computeScore` (skyddsräcke 2 intakt). `aggressive`
> (harness) fick `brokerFavourableDeal` (GK-A/skyddsräcke 4). Elva nya PROVISORISKA balanstal.
> Golden omfryst. Fullt testsvep grönt (core 376 + harness 42 + app 11 = 429 tester, lint,
> typecheck, build, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet och
> `policyDecisionMinTurn`-fyndet.

**P58 — balanspass 5A — MÄTT 2026-09-17**
> Ingen kod. Härnessen mot avsnitt 7:s 5A-rader. Skruva `balance.json` och scenariodata.
>
> **Mätt:** ad-hoc härnesskript (ej committat, samma mönster som P37/P42/P47/P52/P53), n=200,
> `balanced` (avsnitt 7:s eget metodval, "om inget annat anges"). Resultat mot avsnitt 7:s fem
> 5A-rader:
>
> | Rad | Mål | Mätt | Utfall |
> |---|---|---|---|
> | Tjänsteman byts ut med kvarvarande relation | > 60 % | **0 %** | MISS — strukturellt |
> | Agendan ändrar vinnaren | 15–35 % | **34,5 %** | TRÄFF |
> | Spelaren drabbas av minst ett `PolicyDecision` | > 70 % | **100 %** | TRÄFF |
> | `EMBARGO` mot spelaren minst en gång | 10–30 % | **100 %** | MISS — strukturellt |
> | `FAVOUR` trots mer lönsamt alternativ | > 40 % | **50,8 %** | TRÄFF |
>
> **Rad 1 (0 %) — INGEN kalibrering kan fixa den här, `replaceOfficial` har aldrig fått en
> anropare.** `officials.ts`s egen kommentar (skriven i P54) förutsatte att "den faktiska
> utlösaren — standing som faller till 0, skandal — hör till P56/P57." Varken P56 eller P57
> byggde den. Sökt igenom hela `src/`: `replaceOfficial` anropas ingenstans, `status: 'fallen'`
> sätts ingenstans. Det här är samma sorts fynd som P41:s `THE_WORLD`-gap — en spec-förutsättning
> som visade sig inte hålla, upptäckt vid mätning, inte vid bygget. Ingen ägare fanns att fråga i
> den här sessionen (autonomt läge); i stället för att uppfinna en lösning under ett "ingen
> kod"-pass (scope creep in i P58, byggt runt problemet — exakt vad `CLAUDE.md` säger åt mig att
> INTE göra) dokumenteras fyndet här, ärligt, som 0 % — inte ett falskt ✅. En riktig utlösare
> (`standing`/`scandalRisk`-tröskel → `replaceOfficial`, plus ett namnregister för ERSÄTTARE,
> som `officials.json` idag saknar) är ett eget, obyggt stycke arbete utanför P53–P64:s
> nuvarande promptlista.
>
> **Rad 4 (100 %) — strukturellt onåbar mot EXAKT den botpolicy avsnitt 7 föreskriver, av samma
> skäl som P52:s `supplyIndexMaxStep`-fynd (`ETAPP4_TEKNISK_SPEC.md` avsnitt 7).** `Policy` har
> ingen `rng` (hård regel 2) — `balanced`s `favourBestRelationOfficial` väljer alltid EXAKT samma
> tjänsteman (först i `Object.values(state.officials)`s fasta iterationsordning, oavsett seed),
> så `relationToPlayer` för alla ÖVRIGA elva tjänstemän förblir 0 i varje enda parti. Bara EN
> tjänsteman i hela scenariot (`officials.json`) har både `NON_ALIGNMENT` och `standing` (65) över
> `policyDecisionStandingThreshold` (60): `nlf`s försvarsminister. Utan RNG i vägen dit är hennes
> EMBARGO antingen 0 % eller 100 % för HELA populationen beroende på var tröskeln sätts — aldrig
> något däremellan. Verifierat: sänkt hennes `standing` under tröskeln ger 0 %, inte ett tal i
> 10–30-intervallet. En riktig fix kräver kod (rng-baserat FAVOUR-mål, eller flera samtidigt
> sårbara `NON_ALIGNMENT`-tjänstemän så att EN skyddas och resten inte) — inte data. **Lämnas
> orört**, samma linje som `supplyIndexMaxStep`/`boardTarget`/`BUY_FORWARD`.
>
> Rad 2/3/5 träffar mål utan någon ändring i `balance.json` eller scenariodata — ingen
> kalibrering behövdes för de tre. **P58 avslutar 5A:s kodbygge (P54–P57) med två ärliga, kvarstående
> luckor** — se ovan för exakt vad som saknas och varför de inte byggs här. Se
> `docs/ANDRINGSLOGG.md`, 2026-09-17, för mätskriptets fulla metodik (inklusive kontrafaktisk
> agenda-neutralisering för rad 2, och varför den mätningen begränsas till turer före
> `policyDecisionMinTurn`).

### 5B — Världen

**P59 — länderna ser varandra — BYGGD 2026-09-17**
> `Faction.relations` och `Front.status` enligt 4.1–4.2.
>
> *Klart när:* ett test visar att en `ceasefire` stoppar stridsförluster och därmed
> behovsgenereringen; ett test visar att övergångarna är deterministiska funktioner av
> `relations`/`publicSupport`/`doomsday`; golden omfryst.
>
> **Klart:** samtliga tre villkor uppfyllda. `Faction.relations: Record<FactionId, Pct>`
> (land-till-land, helt separat från `relationToPlayer`) och `Front.status: 'war' | 'ceasefire' |
> 'dormant'` (alla scenariofronter startar `'war'`, fynd 1.5 — `'dormant'` har ingen övergångsregel
> än). `fronts.ts`/`attrition.ts` gate:ar nu på `front.status !== 'war'` (INNAN den redan
> existerande artilleri-stagnationskontrollen, inte i stället för den) — en `ceasefire`-front
> genererar varken stridsförluster eller materielbehov, verifierat med gott om materiel på båda
> sidor. `relations` faller symmetriskt av leveranser till en front (`deliveries.ts`, både
> spelarens och rivalers) och av ett lyckat `STAGE_INCIDENT` (`political.ts`, mot målets
> frontmotståndare — inte målet självt), stiger av `BACK_CHANNEL` (symmetriskt, samma
> frontmotståndare) och av en liten, enkelriktad passiv återhämtning varje tur (`factions.ts`,
> "tid"). `Front.status`-övergångarna (`factions.ts`s nya `updateFrontStatuses`, körd sist i
> steget) är rena tröskeljämförelser, ingen rng: war→ceasefire vid antingen "FORCED TO SUE FOR
> PEACE" (den befintliga, tidigare rent kosmetiska notisen, fynd 1.5 — nu dess FÖRSTA mekaniska
> konsekvens) eller ömsesidigt höga relationer; ceasefire→war vid hög `doomsday` eller kollapsade
> relationer. Nio nya PROVISORISKA balanstal. Golden omfryst — den STÖRSTA enskilda
> trajektorieändringen sedan P53b (en front kan nu stanna av helt mitt i ett parti). Fullt
> testsvep grönt (443 tester rotnivå — `npx vitest run` — plus lint, typecheck, build för alla
> tre paket, e2e). Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet.

**P60 — kampanjen och tjänsten — BYGGD 2026-09-17**
> `INFLUENCE` och `Faction.counterIntelligence`. `LEAK`, `SABOTAGE` och `TURN` byggs mot den.
>
> *Klart när:* ett test visar att samma operation ger mer `exposure` i ett land med hög
> `counterIntelligence`; ett test visar att tjänsten stiger när spelaren åker fast; ett test
> visar att de tre tidigare avvisade op:en inte längre avvisas; golden omfryst.
>
> **Klart:** samtliga tre villkor uppfyllda. `Faction.counterIntelligence: Pct` (nytt,
> `counterIntelligenceDefault` är BÅDE startvärdet och nämnaren i exposure-skalningsformeln, så
> ett obehandlat parti ger multiplier 1,0). Skalningen gäller ALLA INTEL-operationer med en
> exposure-effekt, inte bara de tre nya — `EXPAND`s befintliga exponeringsroll (P18) skalas nu
> också. `LEAK`/`SABOTAGE`/`TURN` delar en gemensam lyckandechans
> (`intelOpBaseSuccessPct − counterIntelligence`, ordagrant "billiga mot ett land med svag
> tjänst och livsfarliga mot ett med stark") och en gemensam "åker fast"-bestraffning
> (`markIntelOpCaught`: tjänsten stiger, utförande stationens exposure stiger) — bara
> framgångseffekten skiljer dem åt. `LEAK` sänker en rivals `relations[nation]` (rivalens
> ställning hos DEN köparen). `SABOTAGE` sätter `rival.sabotagedUntilTurn` — fältets FÖRSTA
> spelarstyrda skrivare (`bidding.ts` hoppade redan över en saboterad rivals bud sedan P25).
> `TURN` riktas mot ett `Official` (targetId, i samma lands nation som stationen): lyckad höjer
> `relationToPlayer` kraftigt, misslyckad sänker `standing`. `INFLUENCE` (nytt `POLITICAL`-op,
> alltid lyckad — "förnekbart" betyder att det inte finns något att bli avslöjad för) flyttar
> antingen en faktions `publicSupport` eller dess ENKELRIKTADE `relations` mot ett annat land,
> `direction`-styrt (upp eller ner). `aggressive` fick `LEAK`/`SABOTAGE`, `balanced` fick
> `INFLUENCE`/`TURN` (skyddsräcke 4/GK-A — alla fyra verb var antingen helt nya eller gick från
> "deklarerad, avvisad" till faktiskt byggda i den här prompten). Tio nya PROVISORISKA
> balanstal. Golden omfryst (ny form: `counterIntelligence`; ny trajektoria: fyra nya op
> faktiskt skickade). Fullt testsvep grönt (459 tester rotnivå, lint, typecheck, build, e2e). Se
> `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet.

**P61 — kuppen — BYGGD 2026-09-17**
> `FUND_COUP` enligt 4.4, inklusive den första skrivningen till `Faction.alignment`.
>
> *Klart när:* ett test visar att en lyckad kupp ändrar `alignment` och annullerar den gamla
> regimens kontrakt; ett test visar att en misslyckad höjer `counterIntelligence` permanent;
> golden omfryst.
>
> **Klart:** samtliga två tester skrivna och gröna. `FUND_COUP` (nytt `POLITICAL`-op, samma
> `targetFactionId`/`spend`-form som `STAGE_INCIDENT`/`BACK_CHANNEL` men en egen unionsmedlem).
> Lyckandechansen följer P60:s "base − counterIntelligence"-mönster mot en LÄGRE bas
> (`fundCoupBaseSuccessPct` 40, mot `intelOp`-familjens 90) — "stor" läst som svårare, inte bara
> dyrare. "Sällsynt" löst med en engångsspärr per faktion (`Faction.coupAttempted`, vinst eller
> förlust), inte en gissad nedkylningslängd. Vid framgång: `target.alignment` flippas
> (`Faction.alignment`s FÖRSTA skrivare, fynd 1.2 — en redan neutral faktion skjuts till
> `fundCoupNeutralAlignmentShift` i stället för en verkningslös 0→0), samtliga den gamla
> regimens kontrakt annulleras (spelarens OCH varje rivals), och `preferredSupplier`/`
> relations` sätts med ett UTGÅNGSDATUM (`preferredSupplierUntilTurn`, `factions.ts`s nya
> `expirePreferredSupplier`) — DESIGN.md §13:s "förköpsrätt i fem år" skrivs om till fem TURER
> (GK-B, avsnitt 10 punkt 6, uppdaterat i samma commit med loggrad). Vid misslyckande:
> `counterIntelligence` stiger permanent, `relationToPlayer` skadas permanent. `aggressive`
> (harness) fick `fundCoupWeakestCounterIntelligence` (skyddsräcke 4/GK-A) — kräver en kassabuffert
> på 2× `fundCoupCost` innan den ens övervägs, riktad mot den enklaste måltavlan. Sex nya
> PROVISORISKA balanstal. **Golden VERIFIERAD, inte omfrysning som krävdes:** samtliga tre
> scriptade partier gav identiska hash-värden — `coupAttempted`/`preferredSupplierUntilTurn` är
> optionella och oskrivna tills första gången de faktiskt sätts (ingen formändring för de
> specifika partierna), och `aggressive`s nya kassabuffert (2× 1 000 000) nåddes aldrig av något
> av de tre scriptade partierna inom sina respektive slutlägen (ingen trajektorieändring). Fullt
> testsvep grönt (468 tester rotnivå, lint, typecheck, build, e2e). Se `docs/ANDRINGSLOGG.md`,
> 2026-09-17, för hela genomförandet.

**P62 — lönnmordet**
> `ASSASSINATE` enligt 4.5, med skyddsräcke 3:s typnivåtest i samma commit.
>
> *Klart när:* typnivåtestet visar att handlingen inte kan rikta sig mot något annat än ett
> `Official`; ett test visar ersättningskedjan och `counterIntelligence`-kostnaden; golden omfryst.

**P63 — rummet blir synligt**
> Politikpanelen i UI:t: tjänstemän, agendor, ställning och relation — gated av
> `Station.coverage` som inkluderar `'cabinet'` (fynd 1.4). Ingen ny mekanik.
>
> *Klart när:* ett komponenttest visar att en tjänsteman utan `'cabinet'`-täckning visas utan
> integritet och agenda; ett test visar att vyn inte kraschar utan station; **golden orörd**.

**P64 — balanspass 5B och etappgranskning**
> Ingen kod. Härnessen mot hela avsnitt 7. Sedan den sista raden: ägaren spelar och svarar på
> avsnitt 0:s fråga.

---

## 9. Vad som avsiktligt inte finns i etapp 5

**Fördragssystem.** `DESIGN.md` §20 lägger det i "djup" tillsammans med karaktärer, och §21
skar bort "detaljerad diplomatisk fördragsmaskin" redan i etapp 1. Med `Faction.relations`
byggt i 5B blir fördrag billigt senare — men det är en egen etapp, inte en bilaga till den här.

**Avkolonisering, nya scenarier (`SUEZ`, `OCTOBER`, `WINDS`, `THE LONG WAR`), en tredje front,
hexkarta, taktiskt lager.** Oförändrat sedan etapp 4:s avsnitt 9.

**Verkliga statschefer som handlingsmål.** `DESIGN.md` §15 och skyddsräcke 3. De nämns i
`THE WIRE` och är passiva. Det är inte en avgränsning som kan omprövas av en kodsession.

**En femte förlustväg.** Frestelsen finns — en politisk katastrof som avslutar partiet vore
tematiskt logisk. Men fyra förlustvillkor är redan fler än spelaren håller i huvudet, och
`EXPOSURE` täcker redan "politiken kom ikapp dig". Etappen matar det befintliga villkoret i
stället för att lägga till ett nytt.

---

## 10. Beslut vid antagandet (2026-09-16)

Åtta punkter var öppna i förslaget. **Samtliga avgjorda av ägaren samma dag, enligt förslagets
egna rekommendationer, ordagrant.**

1. **`boardTarget` och `BUYOUT`-kaskaden — femte gången frågan ställs.** **Avgjort: omkalibreras
   som etappens första prompt, P53.** Se avsnitt 2.1 — för etapp 3 och 4 var kaskaden ett
   mätproblem, för etapp 5 är den ett byggproblem: elva turer räcker inte för mekanik som
   handlar om relationer som mognar.

   > **Reviderat 2026-09-17, efter mätning, innan P53 kördes.** Beslutet ovan ("omkalibreras,
   > ingen ny mekanik") visade sig otillräckligt så fort det mättes mot faktisk kod: en ren
   > `boardTarget`-kalibrering byter bara dödsorsak (`BUYOUT` → `INSOLVENCY`, tre av fyra
   > botpolicyer dör ändå, vid tur 15–17) eftersom grundorsaken är att `Faction.materielNeed`
   > startar på 0 — inga ordrar alls genereras turerna 1–4, medan husets fasta kostnader löper
   > från tur 1. **Reviderat beslut: P53 delas i tre** — P53a (scenariodata: krigförande arméer
   > startar med ett stående upphandlingsbehov, inte tomt), P53b (`board.ts`: styrelsen mäter
   > orderbok + en rampad förväntanskurva i stället för bara bokförd intäkt linjärt) och P53c
   > (balanspass, verifierar att `threshold` 2× fortsatt är rätt siffra). `boardTarget.threshold`
   > självt rörs INTE — det höll sig till mätningen visade sig vara rätt siffra hela tiden, det
   > var VAD som mättes mot den som var fel. Se avsnitt 2.1 för de fullständiga mätningarna och
   > `docs/ANDRINGSLOGG.md`, 2026-09-17, för mätskripten.

2. **Ersätter `Official` `Order.inspectorIntegrity`?** **Avgjort: ja.** Ingen parallell sanning
   om vem som bedömer ett anbud — `computeScore` läser samma tal från en ny källa, formeln rörs
   inte.

3. **Ett nytt pipeline-steg (`politics`)?** **Avgjort: ja, mellan `factions` och `heat`.** Hård
   regel 7 tillåter ändringen eftersom ägaren själv beslutar den här, uttryckligen, i samma
   commit som P53 antar hela specen.

4. **Byggs `Front.status` (4.2)?** **Avgjort: ja.** Utan den är 5B verb utan effekt på världen.

5. **Byggs `LEAK`/`SABOTAGE`/`TURN` (P60)?** **Avgjort: ja.** Tre op som varit deklarerade och
   avvisade sedan etapp 1 får äntligen en mekanik (`counterIntelligence`) att betyda något mot.

6. **`DESIGN.md` §13:s "förköpsrätt i fem år" efter lyckad kupp.** **Avgjort: skrivs om till
   något som betalar sig inom partiet** (GK-B), i samma commit som P61, med loggrad — samma
   mönster som P45 följde för §16 vid etapp 4:s antagande.

7. **Etappens namn.** **Avgjort: "NÄST MÄKTIGAST I RUMMET"** — ur designdokumentets tredje
   pelare, den pelare etappen finns för att ge mekanik. Namnet är genomfört i hela specen redan
   från förslaget.

8. **Tolv prompter eller tio?** **Avgjort: tolv.** En nedskärning till tio (stryk P62/P63) hade
   gjort 5A byggt men osynligt — exakt det fel P46 fanns till för att undvika i etapp 4.

---

## 11. Versionshistorik

| Version | Datum | Ändring |
|---|---|---|
| 1.0 | 2026-09-16 | Första förslaget. Premisskontroll (avsnitt 1) mot commit `701c56a` gav tio fynd, varav fem formade förslaget: den anonyma tjänstemannen i `Order.inspectorIntegrity` (blev 5A:s ingång), att `alignment` aldrig skrivs (blev kuppens uppgift), att `Station.coverage` är död data (blev informationsgrinden), att krig varken kan börja eller sluta (blev 5B:s dyraste post) och att `Faction.embargoed` har effekter men ingen utlösare (blev det politiska beslutets kvitto). Åtta beslutspunkter öppna |
| 1.0.1 | 2026-09-16 | **ANTAGEN.** Ägaren godkände samtliga åtta beslutspunkter enligt förslagets egna rekommendationer, ordagrant (se `docs/ANDRINGSLOGG.md` samma datum). Avsnitt 10 omskrivet från öppna frågor till ett beslutsprotokoll. Inga sakändringar mot 1.0 — namnet, prompträckvidden (P53–P64), `politics`-steget, `Official`-ersättningen, `Front.status`, `LEAK`/`SABOTAGE`/`TURN` och den omskrivna femårsklausulen stod redan som rekommendationer och blev nu beslut. `P53` är nästa steg |
| 1.0.2 | 2026-09-17 | **P53 reviderad innan den kördes, efter mätning.** Ägaren bad om en långsiktig lösning på `BUYOUT`-kaskaden i stället för P53:s ursprungliga "omkalibrera `boardTarget`". Mätning (härnessen, n=30–60/botpolicy, med och utan styrelsegranskning) visade att en ren kalibrering inte hade räckt: alla fyra botpolicyer har 0 kr bokförd intäkt vid tur 6 (kravet: 2,16 Mkr), och utan granskningen dör tre av fyra ändå i `INSOLVENCY` vid tur 15–17 — grundorsaken är att `Faction.materielNeed` startar på 0, vilket ger noll ordrar turerna 1–4 medan fasta kostnader löper. `aggressive` (45 % marknadsandel) överlever, vilket avslöjar att alla fyra kaskadmätningarna (P37/P42/P47/P52) kördes mot `balanced` (9,7 % marknadsandel) — en svag botstrategi, inte bara en svag ekonomi. P53 delad i P53a (seeda `materielNeed` vid start), P53b (`board.ts` mäter orderbok + rampad kurva) och P53c (balanspass, verifierar `threshold`). Avsnitt 2.1 och avsnitt 10 punkt 1 fick varsin reviderad-blockquote, ingen gammal rad redigerad. Se `docs/ANDRINGSLOGG.md` samma datum för mätskripten och fullständiga tabeller |
| 1.0.3 | 2026-09-17 | **P53 (P53a+P53b+P53c) helt klar.** P53a byggd: `Faction.materielNeed` seedas till `orderTriggerThreshold` (`state.ts`), härnessmätning bekräftar mätbart tidigare första bokförda intäkt för alla fyra botpolicyer. P53b byggd: `board.ts`s `progressSnapshot` inkluderar nu orderbokens obetalda andel, `expectedProgress` bytt från linjär till kvadratisk bana (`computeExpectedProgress`), härnessmätning visar `BUYOUT`-frekvens 0 %/0 %/67 %/70 % (var identisk 100 % för alla fyra). P53c verifierad, ingen kod/data ändrad: känslighetsanalys mot 1,5×/2×/2,5× bekräftar att `boardTarget.threshold` (2×) ger den tydligaste diskrimineringen. Golden omfryst i både P53a och P53b (separata commits). Avsnitt 8:s tre prompter fick var sin "BYGGD/VERIFIERAD"-rubrik och klart-blockquote. `P54` är nästa steg. Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för samtliga mätningar och exakta hash-värden |
| 1.0.4 | 2026-09-17 | **P54 byggd — 5A:s ingång, `Official` ersätter `Order.inspectorIntegrity`.** `Official`/`Post`/`Agenda`-typerna (avsnitt 3.1/3.2 — typen nu, viktseffekten i P55), `GameState.officials`, ny `officials.json` (fyra fiktiva tjänstemän per faktion) läst av `state.ts`s nya `buildOfficials`, ny ren modul `officials.ts` (`officialId`/`findOfficial`/`replaceOfficial`). `Order.officialId` ersätter `inspectorIntegrity` — `orders.ts` slår upp köparens `procurement`-tjänsteman i stället för att rulla ett nytt tal per order. `computeScore` (`pricing.ts`) HELT ORÖRD, skyddsräcke 2 pinnat med ett test. `applyActions.ts` medvetet inte rörd (ingen ny `PlayerAction` i P54). Golden omfryst — genuin trajektorieändring, inte bara ny form. Avsnitt 8:s P54-block fick en "BYGGD"-rubrik och klart-blockquote. `P55` är nästa steg. Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet |
| 1.0.5 | 2026-09-17 | **P55 byggd — agendan viktar affären.** `weightsForOrder` (`orders.ts`) ersätter `weightsForPressure` — REARM/AUSTERITY skiftar `order.weights`, en andra viktskiftare vid sidan av `weightPressureShift` (P36). `bestEligibleProduct` fick ett MODERNISE-filter (`techRequired > agendaModerniseTechFloor`). NON_ALIGNMENT fördubblar `blocTerm` i `bidding.ts`/`queries.ts`. SELF_ENRICHMENT krävde ingen ny kod (redan i `officials.json`, P54). Tre nya PROVISORISKA balanstal. Golden omfryst. Avsnitt 8:s P55-block fick en "BYGGD"-rubrik och klart-blockquote. `P56` är nästa steg. Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet |
| 1.0.6 | 2026-09-17 | **P56 byggd — att påverka en människa.** `Official.scandalRisk`/`House.favourMarginSpent` nya fält. `PlayerAction`s `POLITICAL`-variant delad i tre (skyddsräcke 3: BRIBE/FUND_CAMPAIGN tar officialId, FAVOUR tar officialId+marginCost, STAGE_INCIDENT/BACK_CHANNEL behåller targetFactionId — `type` oförändrad, skyddsräcke 4 intakt). `applyActions.ts` (568 rader) sprängdes — POLITICAL utbruten till ny `resolve/political.ts` (427 rader kvar), samma mönster som P23. BRIBE riktades om (relationsvinst skalad mot låg integritet, höjer scandalRisk, taket per tjänsteman). FUND_CAMPAIGN/FAVOUR nya, vardera en bot (aggressive/balanced). Golden omfryst. Avsnitt 8:s P56-block fick en "BYGGD"-rubrik och klart-blockquote. `P57` är nästa steg. Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet |
| 1.0.7 | 2026-09-17 | **P57 byggd — politiken slår tillbaka, 5A klar.** Nytt steg `politics.ts` (mellan `factions`/`heat`, ägarbeslutet). Ett fast, PROVISORISKT agenda→`PolicyDecision`-schema; `EMBARGO` är `Faction.embargoed`s FÖRSTA skrivare (fynd 1.7); `PREFERRED_SUPPLIER` går i den här triggern alltid till en rival. `BROKER` byggd (avsnitt 3.5, den sista helt tysta grenen) — direktkontrakt förbi `computeScore`, avgjort av köparens procurement-tjänstemans relation/integrity. `bidding.ts` fick en poängbonus adderad EFTER `computeScore` (skyddsräcke 2 intakt). **Genuint fynd under bygget:** `Official.relationToPlayer` startar på 0 för alla, så en obehandlad grind gjorde "ohörsammad" sant redan tur 1 och bröt två av etapp 3/4:s gröna invarianttester (skyddsräcke 5) — fixat med ett nytt PROVISORISKT balanstal `policyDecisionMinTurn` (4). `aggressive` (harness) fick `brokerFavourableDeal` (GK-A/skyddsräcke 4). Elva nya PROVISORISKA balanstal. Golden omfryst. Avsnitt 8:s P57-block fick en "BYGGD"-rubrik och klart-blockquote. **5A:s kodbygge (P54–P57) är därmed klart** — `P58` (balanspass, ingen kod) är sista steget i 5A. Se `docs/ANDRINGSLOGG.md`, 2026-09-17, för hela genomförandet och kalibreringsfyndet |
| 1.0.8 | 2026-09-17 | **P58 mätt — 5A klar med två dokumenterade luckor.** Härnessmätning n=200/`balanced` mot avsnitt 7:s fem 5A-rader: tre träffar (agendan ändrar vinnaren 34,5 % av 15–35 %; minst ett `PolicyDecision` 100 % av >70 %; `FAVOUR` trots bättre alternativ 50,8 % av >40 %) utan att röra `balance.json`/scenariodata. Två strukturella missar, ingen fixad med kalibrering: (1) "tjänsteman byts ut" 0 % — `replaceOfficial` (P54) har aldrig fått en live-utlösare; varken P56 eller P57 byggde den `officials.ts`s egen kommentar förutsatte. (2) `EMBARGO` 100 % (mål 10–30 %) — `Policy` saknar rng (hård regel 2), så `balanced`s `favourBestRelationOfficial` skyddar alltid EXAKT samma tjänsteman oavsett seed, vilket gör den enda `NON_ALIGNMENT`-kvalificerade tjänstemannens EMBARGO strukturellt bimodal (0 eller 100 %, aldrig ett mellanläge) — verifierat, inte gissat. Båda kräver kod, inte data, och byggs INTE i ett "ingen kod"-pass — lämnas dokumenterade, samma linje som P52:s `supplyIndexMaxStep`-fynd | Avsnitt 7:s måltabell fick en "Mätt (P58)"-kolumn och avsnitt 8:s P58-block ett fullt blockquote, per P58:s eget syfte: mäta, kalibrera det som går, dokumentera ärligt det som inte gör det |
| 1.0.9 | 2026-09-17 | **P59 byggd — länderna ser varandra, 5B påbörjad.** `Faction.relations: Record<FactionId, Pct>` (land-till-land) och `Front.status: 'war' | 'ceasefire' | 'dormant'` (alla scenariofronter startar 'war'). `fronts.ts`/`attrition.ts` gate:ar på `status !== 'war'` -- en ceasefire-front genererar varken stridsförluster eller materielbehov. `relations` faller av leveranser (`deliveries.ts`, symmetriskt) och lyckade `STAGE_INCIDENT` (`political.ts`, mot frontmotståndaren), stiger av `BACK_CHANNEL` och en liten passiv återhämtning varje tur (`factions.ts`). `Front.status`-övergångarna är rena tröskeljämförelser (ingen rng): war->ceasefire vid "FORCED TO SUE FOR PEACE" (tidigare bara en notis, fynd 1.5 -- nu dess FÖRSTA mekaniska konsekvens) eller ömsesidigt höga relationer; ceasefire->war vid hög doomsday eller kollapsade relationer. Nio nya PROVISORISKA balanstal. Golden omfryst -- den största enskilda trajektorieändringen sedan P53b. Fullt testsvep grönt (443 tester rotnivå, lint, typecheck, build, e2e) | Avsnitt 4.1/4.2, avsnitt 8:s P59-block fick en "BYGGD"-rubrik och klart-blockquote, per P59:s eget klart-når |
| 1.0.10 | 2026-09-17 | **P60 byggd — kampanjen och tjänsten.** `Faction.counterIntelligence: Pct` (nytt; `counterIntelligenceDefault` är både startvärdet och nämnaren i exposure-skalningsformeln). Skalar exposure för ALLA INTEL-operationer med en exponeringseffekt, inklusive det redan byggda `EXPAND` (P18), inte bara de tre nya. `LEAK`/`SABOTAGE`/ `TURN` delar en gemensam lyckandechans (`intelOpBaseSuccessPct - counterIntelligence`) och en gemensam "åker fast"-bestraffning (`markIntelOpCaught`). `LEAK` sänker en rivals `relations[nation]`. `SABOTAGE` sätter `rival.sabotagedUntilTurn` -- fältets FÖRSTA spelarstyrda skrivare, `bidding.ts` hoppade redan över en saboterad rivals bud sedan P25. `TURN` riktas mot ett `Official`: lyckad höjer `relationToPlayer`, misslyckad sänker `standing`. `INFLUENCE` (nytt `POLITICAL`-op, alltid lyckad) flyttar en faktions `publicSupport` eller dess enkelriktade `relations` mot ett annat land, `direction`-styrt. `aggressive` fick LEAK/SABOTAGE, `balanced` fick INFLUENCE/TURN (skyddsräcke 4/GK-A). Tio nya PROVISORISKA balanstal. Golden omfryst. Fullt testsvep grönt (459 tester rotnivå, lint, typecheck, build, e2e) | Avsnitt 4.3, avsnitt 8:s P60-block fick en "BYGGD"-rubrik och klart-blockquote, per P60:s eget klart-når |
| 1.0.11 | 2026-09-17 | **P61 byggd — kuppen.** `FUND_COUP` (nytt `POLITICAL`-op, samma form som STAGE_INCIDENT/BACK_CHANNEL, egen unionsmedlem). Lyckandechans mot en lägre bas än P60:s INTEL-familj (fundCoupBaseSuccessPct 40) minus counterIntelligence. "Sällsynt" löst med en engångsspärr per faktion (Faction.coupAttempted). Vid framgång: Faction.alignment flippas (fältets FÖRSTA skrivare, fynd 1.2 -- en neutral faktion skjuts till fundCoupNeutralAlignmentShift), den gamla regimens samtliga kontrakt annulleras (spelarens OCH rivalers), och en tidsbegränsad förköpsrätt sätts (preferredSupplierUntilTurn, factions.ts:s nya expirePreferredSupplier). DESIGN.md §13:s "förköpsrätt i fem år" skrevs om till fem TURER i samma commit (GK-B, avsnitt 10 punkt 6, med loggrad). Vid misslyckande: counterIntelligence och relationToPlayer skadas permanent. `aggressive` fick fundCoupWeakestCounterIntelligence (skyddsräcke 4/GK-A). Sex nya PROVISORISKA balanstal. Golden VERIFIERAD (inte omfrysning som krävdes) -- inget av de tre scriptade partierna triggade vare sig fältformändringen eller botens kassabuffert-tröskel. Fullt testsvep grönt (468 tester rotnivå, lint, typecheck, build, e2e) | Avsnitt 4.4, avsnitt 8:s P61-block fick en "BYGGD"-rubrik och klart-blockquote, per P61:s eget klart-når |
