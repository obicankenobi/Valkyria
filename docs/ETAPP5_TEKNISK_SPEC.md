# THE SEVENTH FRONT — Teknisk spec, etapp 5: NÄST MÄKTIGAST I RUMMET

**Version 1.0.1 — antagen (ägarbeslut 2026-09-16).** Validerad mot `obicankenobi/Valkyria`
commit `701c56a` (etapp 4 avslutad, alla P43–P52 körda, båda P52-fynden avgjorda). Samtliga åtta
öppna beslutspunkter avgjorda enligt förslagets egna rekommendationer, se avsnitt 10. `P53` är
nästa steg.

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

Grundorsaken är känd och entydig, och den ligger i två system som etapp 5 inte rör:
`board.ts`s linjära intäktsmål (P30) förutsätter jämn intäkt från tur 1, medan `orders.ts`s
behovsdrivna utlysning (P35) inte kan producera en enda full kontraktscykel — utlysning, bud,
produktion, leveransfördröjning, bokförd intäkt — före den första granskningsturen (tur 6). Båda
granskningarna (tur 6 och 10) underkänns därför nästan med automatik, och två underkända i rad
är `BUYOUT` (`endings.ts:54`).

**Avgjort vid antagandet (avsnitt 10, punkt 1): `boardTarget` omkalibreras som etappens FÖRSTA
prompt (P53), före allt annat.** Det är en ändring i `indochina-slice.json` — scenariodata, inte
kod — och den går att mäta direkt med härnessen.

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

| Kriterium | Målvärde | Halva |
|---|---|---|
| **Partier där minst en tjänsteman byts ut medan spelaren har en relation till henne** | **> 60 %** | 5A |
| Andel ordrar där agendan faktiskt ändrade vinnaren (mot samma order utan agenda) | 15–35 % | 5A |
| **Partier där spelaren drabbas av minst ett `PolicyDecision`** | **> 70 %** | 5A |
| Partier där `EMBARGO` utlöses mot spelaren minst en gång | 10–30 % | 5A |
| `FAVOUR` valt minst en gång av en bot som hade ett mer lönsamt alternativ | > 40 % | 5A |
| **Partier där minst en front byter `status` minst en gång** | **> 50 %** | 5B |
| Partier där en `ceasefire` mätbart sänker ordervolymen turen efter | alltid, när den inträffar | 5B |
| **Partier där `counterIntelligence` stigit mätbart av spelarens egna operationer** | **> 50 %** | 5B |
| Lyckade kupper per parti | 0–1, aldrig fler | 5B |
| `alignment` ändras minst en gång i ett parti | > 20 % | 5B |
| Etapp 3:s och 4:s invarianter (skyddsräcke 5) | alltid | båda |
| **Är spelet bättre? (avsnitt 0)** | **Ägarens omdöme efter P64, inte en siffra** | båda |

Den sista raden är inte en formalitet. Den är den enda raden i hela dokumentet som kan underkänna
etappen, och den besvaras av en människa som spelat, inte av härnessen.

---

## 8. Promptsekvens

### Förberedelse

**P53 — partiet blir spelbart**
> Omkalibrera `boardTarget` i `indochina-slice.json` enligt beslutspunkt 1. Ingen ny mekanik.
>
> *Klart när:* `SCENARIO_COMPLETE` nås i minst 25 % av 200 `balanced`-partier; `BUYOUT` slutar
> inträffa på exakt samma tur i alla partier; golden omfryst i denna commit och ingen annan,
> med loggrad.

### 5A — Rummet

**P54 — tjänstemannen får ett namn**
> `Official`, namnregistret som scenariodata, `Order.inspectorIntegrity` → `Order.officialId`.
> Dela `applyActions.ts` om den spränger.
>
> *Klart när:* ett test visar att `computeScore` ger identisk poäng som före för samma
> integritetstal; ett test visar att samma tjänsteman ger samma integritet två turer i rad; ett
> test visar att en `fallen` tjänsteman ersätts med nollställd relation; golden omfryst.

**P55 — agendan viktar affären**
> `Agenda` enligt 3.2, som andra viktskiftare vid sidan av `weightPressureShift`.
>
> *Klart när:* ett test visar att två köpare med identiskt behov men olika agenda ger olika
> vinnare; ett test visar att `MODERNISE` diskvalificerar under teknikgolvet; golden omfryst.

**P56 — att påverka en människa**
> `BRIBE` riktas om mot `officialId`. `FUND_CAMPAIGN` och `FAVOUR` byggs. Minst en bot lär sig
> använda var och en (GK-A).
>
> *Klart när:* ett test visar att `FUND_CAMPAIGN` håller kvar en tjänsteman som annars fallit;
> ett test visar att `FAVOUR` kostar marginal och inte kassa; ett test visar att ogiltiga
> handlingar hamnar i `rejected`; golden omfryst.

**P57 — politiken slår tillbaka**
> `PolicyDecision` enligt 3.4, inklusive `EMBARGO` som första skrivare till `Faction.embargoed`.
> `BROKER` byggs (3.5).
>
> *Klart när:* ett test visar att en ohörsammad agenda leder till ett beslut; ett test visar att
> `EMBARGO` stoppar faktionens ordrar via den redan byggda kedjan; ett test visar att
> `PREFERRED_SUPPLIER` kan gå till en rival; golden omfryst.

**P58 — balanspass 5A**
> Ingen kod. Härnessen mot avsnitt 7:s 5A-rader. Skruva `balance.json` och scenariodata.

### 5B — Världen

**P59 — länderna ser varandra**
> `Faction.relations` och `Front.status` enligt 4.1–4.2.
>
> *Klart när:* ett test visar att en `ceasefire` stoppar stridsförluster och därmed
> behovsgenereringen; ett test visar att övergångarna är deterministiska funktioner av
> `relations`/`publicSupport`/`doomsday`; golden omfryst.

**P60 — kampanjen och tjänsten**
> `INFLUENCE` och `Faction.counterIntelligence`. `LEAK`, `SABOTAGE` och `TURN` byggs mot den.
>
> *Klart när:* ett test visar att samma operation ger mer `exposure` i ett land med hög
> `counterIntelligence`; ett test visar att tjänsten stiger när spelaren åker fast; ett test
> visar att de tre tidigare avvisade op:en inte längre avvisas; golden omfryst.

**P61 — kuppen**
> `FUND_COUP` enligt 4.4, inklusive den första skrivningen till `Faction.alignment`.
>
> *Klart när:* ett test visar att en lyckad kupp ändrar `alignment` och annullerar den gamla
> regimens kontrakt; ett test visar att en misslyckad höjer `counterIntelligence` permanent;
> golden omfryst.

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
