# THE SEVENTH FRONT — Teknisk spec, etapp 3: KRIGET SOM MARKNAD

**Version 1.0 — förslag.** Validerad mot `obicankenobi/Valkyria` commit **`e650be2`**.

Prosan är på svenska. All kod, alla identifierare, alla UI-strängar och all speldata är på
engelska och ska användas ordagrant.

Specen är **fryst under P43–P52**. Den får ändras mellan promptar om en byggd sanning visar sig
strida mot den, men aldrig av en kodsession på eget initiativ. Se `CLAUDE.md`.

---

## 0. Frågan och det korta svaret

> *Kan inte en funktion med faktiska enheter på kartan vara ett sätt att påverka behovet av
> vilka/hur mycket vapen ett land vill köpa? Typ: ryska 1:a mekaniserade divisionen anfaller
> amerikanska 3:e infanteridivisionen = behov av x antal ny materiel.*

**Ja — och idén löser ett rotproblem som är allvarligare än den kartfråga den ställdes om.**

Efterfrågan i spelet är i dag frikopplad från kriget. `orders.ts` rullar en tärning:

```ts
if (!rng.chance(BALANCE.orderGenerationChancePct)) continue   // 35 %
```

Det är en provisorisk regel som `ANDRINGSLOGG.md` själv flaggar som **öppen fråga** sedan P4
(*"Ordergenereringens kadens (hur ofta, vilka köpare, vilka kvantiteter) ges aldrig"*). Den har
aldrig ersatts. Hela anbudsspelet — som specen kallar etapp 1:s kärna — matas alltså av ett
myntkast.

Din modell ersätter tärningen med kriget. Det är rätt lösning, och den fixar fyra mätta fel på
en gång. Men den är en **stridsmodellsändring**, inte en kartfunktion, och den måste byggas i
två steg för att inte spränga balansen. Det är vad det här dokumentet specificerar.

---

## 1. Fyra mätta fynd

Alla mätta på `e650be2`, 200 partier med `balanced`-boten.

### Fynd 1 — materiel förstörs aldrig

`front.equipment` skrivs på exakt två ställen i hela motorn:

```
packages/core/src/resolve/steps/deliveries.ts:126   front.equipment[side][cat] += shipment.units
packages/core/src/resolve/steps/deliveries.ts:287   front.equipment[side][cat] += delivered
```

Sökning efter `-=`, `Math.max` eller nollställning på `equipment` i hela `resolve/`: **noll
träffar.** Lagret är monotont växande. En köpare som fått 159 artilleripjäser har dem för alltid
och behöver aldrig fler.

**Det här är rotorsaken.** Efterfrågan kan inte vara kopplad till kriget i en modell där kriget
inte förbrukar något.

### Fynd 2 — fyra av sju produkter beställs aldrig

`isEligibleForRegularOrder` kräver `product.techRequired <= faction.techLevel[category]`.
Faktionernas tekniknivå sätts i scenariot och **växer aldrig** — ingen mekanik höjer den.

| Faktion | techLevel | Kan beställa |
|---|---|---|
| `rvn` | 2 | `m1_rifle` (1), `105mm_field_gun` (2) |
| `nlf` | 1 | `m1_rifle` |
| `laos` | 1 | `m1_rifle` |

Uppmätt orderfördelning över 200 partier:

| Antal ordrar | Produkt |
|---|---|
| **1 995** | M-1 Standard Infantry Rifle |
| **459** | 105mm Field Gun, Towed |
| 441 | Mk-9 Longhand *(bara via scriptade händelser)* |
| **0** | M-3 APC |
| **0** | CH-3 Transport Helicopter |
| **0** | Coastal Patrol Boat |
| **0** | Tactical Radio & Radar Suite |

De tre marginalklasser etapp 1,5 införde (massvara / specialitet / `restricted`) kollapsar i
praktiken till **två produkter**. Produktvalet, som spec 2.4 kallar *"Marginalen mellan dem är
spelet"*, finns inte.

### Fynd 3 — bara artilleri påverkar striden

`fronts.ts:84` läser enbart `equipment[side].artillery`. De andra fem kategorierna ackumuleras
utan verkan. Uppmätt slutlager: sida B **4 633 enheter**, nästan uteslutande gevär, med noll
effekt på fronten.

### Fynd 4 — köparnas vikter är identiska

```ts
weights: { ...BALANCE.bidWeightsDefault }      // orders.ts:79
```

Varje order i varje parti får samma dolda vikter. `DESIGN.md` §5 lovar motsatsen:

> Vikterna varierar per köpare och är delvis dolda. **En desperat köpare mitt i en offensiv bryr
> sig om leveranstid, inte pris.**

Den meningen har aldrig implementerats. Det är också den enskilt billigaste vinsten i hela det
här dokumentet.

### Sammanfattning

Din modell angriper alla fyra: förluster förbrukar materiel (1), förluster sker i alla
kategorier (3), behovet avgör vad som beställs (2), och hur illa det går avgör hur bråttom
köparen har (4).

---

## 2. Två steg, inte ett

Frestelsen är att bygga namngivna förband direkt. Gör inte det. Efterfrågeloopen måste
fungera **innan** den får namn, av två skäl: den kan testas isolerat, och om den visar sig
tråkig har du spenderat en etapp i stället för tre.

| Etapp | Innehåll | Ny entitet | Rör balansen |
|---|---|---|---|
| **3A — Förbrukning** | Materielförslitning, behovsdriven ordergenerering, frontberoende vikter | Nej | Ja, fullt balanspass |
| **3B — Förbanden** | Namngivna förband som dekomposition av aggregaten, engagemang, namngiven efterfrågan | `Formation` | Ja, andra balanspass |

3A är en förutsättning för 3B: utan förbrukning har ett förband ingenting att förlora.

---

# ETAPP 3A — FÖRBRUKNING

## 3. Materielförslitning

### 3.1 Regeln

I `fronts.ts`, efter att förluster beräknats och **före** genombrottsprövningen (så att
nästa turs materielkvot speglar den här turens förbrukning):

```
intensity(side)      = frontBaseAttritionPct × (1 + |clampedAdvantage|)   // 1,5 … 3,0
attritionPct(side)   = intensity(side) × equipmentAttritionCoupling
                       × (side === loser ? attritionLoserMultiplier : 1)

destroyed(side, cat) = floor(equipment[side][cat]
                       × attritionPct(side) / 100
                       × categoryVulnerability[cat])

equipment[side][cat] = max(0, equipment[side][cat] − destroyed(side, cat))
```

Nya fält i `balance.json`:

```jsonc
"equipmentAttritionCoupling": 4.0,
"attritionLoserMultiplier": 1.6,
"categoryVulnerability": {
  "infantry":    0.90,
  "artillery":   0.50,
  "armour":      0.70,
  "aviation":    0.30,
  "naval":       0.10,
  "electronics": 0.40
}
```

**Kalibreringsunderlag.** Uppmätt slutlager hos sida A är median 448 enheter efter ~11 turer.
`frontBaseAttritionPct` är 1,5. Med kopplingen 4,0 och sårbarhet 0,5–0,9 ger det 3–11 % lager
förbrukat per tur, alltså 15–50 enheter — samma storleksordning som `orderQuantityMin/Max`
(20–185). Det är utgångspunkten för P52:s balanspass, inte en fastslagen sanning.

### 3.2 Två konsekvenser som är hela poängen

**Fronten kan vända.** I dag är sida B:s artilleri median **0** i varje parti, så
`equipmentRatio` driver linjen monotont mot A (uppmätt slutposition median −30 till −55 från
start +5). Med förslitning tär A:s framryckning på A:s eget artilleri, och fronten kan stanna
eller vändas av försörjningstakt i stället för bara av leveransvolym. Det ger fynd 2 i
`THE_WORLD`-specen — "fronten rör sig bara åt ett håll" — en mekanisk lösning.

**Återkommande köpare.** En köpare vars lager töms måste köpa igen. Det är skillnaden mellan en
marknad och en engångsförsäljning, och det är vad som gör `reliability` och relationer värda
något över tjugo turer.

### 3.3 Wire

Förslitning emitterar en `ticker` per sida och tur med `delta` per kategori:

```
RVN LOSES 22 ARTILLERY, 140 INFANTRY TO ATTRITION ON THE FRONT-1 FRONT
```

`causeId` pekar på turens förlust-ticker (`fronts.ts:125`). Det är kedjans första led i den
orsakskedja som avsnitt 5 bygger vidare på.

---

## 4. Behovsdriven ordergenerering

### 4.1 Behovsregistret

Nytt fält på `Faction`:

```ts
materielNeed: Record<TechCategory, number>
```

Skrivs av två steg och av ingen annan:

```
fronts.ts   (efter förslitning)   need[cat] += destroyed(denna faktions sida, cat)
orders.ts   (vid utlysning)       need[cat] -= utlyst kvantitet
factions.ts (varje tur)           need[cat] += peacetimeReplacement[cat]
                                  need[cat]  = min(need[cat], needCeiling)
```

`peacetimeReplacement` är golvet som håller marknaden vid liv under de median **5–7 turer**
fronten står stilla i öppningen (mätt). Utan det torkar orderboken ut helt innan första
leveransen, och spelaren har ingenting att bjuda på i sina första kvartal.

```jsonc
"peacetimeReplacement": { "infantry": 12, "artillery": 2, "armour": 1,
                          "aviation": 0.3, "naval": 0.2, "electronics": 1 },
"needCeiling": 400,
"orderTriggerThreshold": { "infantry": 60, "artillery": 12, "armour": 8,
                           "aviation": 2, "naval": 2, "electronics": 6 }
```

### 4.2 Utlysningen

`orders.ts` ordinarie gren ersätts. Tärningen försvinner.

```
för varje faktion (ej bankrutt, ej embargerad):
    för varje TechCategory c, i fallande behovsordning:
        om need[c] < orderTriggerThreshold[c]:  hoppa över
        product = bästa produkt i c som faktionen får beställa
                  (techRequired <= techLevel[c], ej restricted)
        om ingen sådan produkt finns:  emitta ticker "UNMET NEED", hoppa över
        quantity = clamp(round(need[c]), product.orderQuantityMin, product.orderQuantityMax)

        # militaryBudget är en verklig gräns sedan P19
        medan referencePrice(product, quantity, …) > faction.militaryBudget och quantity > min:
            quantity = floor(quantity × 0.75)
        om referencePrice fortfarande > militaryBudget:  emitta ticker "CANNOT AFFORD", hoppa över

        utlys ordern
        need[c] -= quantity
        högst maxOrdersPerFactionPerTurn (2) per faktion och tur
```

**Behovet konsumeras vid utlysning, inte vid leverans.** Annars utlyser faktionen samma behov
varje tur tills någon hinner leverera, och orderboken översvämmas.

`UNMET NEED`-tickern är värdefull i sig: den säger att en köpare behöver något den inte får
köpa, vilket är ett affärstillfälle spelaren kan läsa på lägesbordet — och i etapp 4 en
öppning för `BROKER`.

### 4.3 Frontläget sätter vikterna

Det här är fynd 4:s lösning och den billigaste raden i dokumentet.

```
pressure(faction) = hur illa fronten går för faktionens sida, 0 … 1
                    härlett ur position-förändring senaste 3 turerna (front.trace)
                    plus morale-underläge

weights.delivery = bidWeightsDefault.delivery + pressure × weightPressureShift
weights.price    = bidWeightsDefault.price    − pressure × weightPressureShift
weights.relationship = bidWeightsDefault.relationship          // oförändrad
```

```jsonc
"weightPressureShift": 0.25
```

Vid `pressure = 1` går vikterna från `{ price 0,55 · delivery 0,30 }` till
`{ price 0,30 · delivery 0,55 }`. En köpare som håller på att förlora betalar för snabbhet.

Det gör tre saker samtidigt:

1. Uppfyller `DESIGN.md` §5:s löfte ordagrant.
2. Gör dold information **läsbar via kartan** — spelaren ser på lägesbordet att Saigon pressas
   och kan dra slutsatsen att nästa order viktar leverans. Det är exakt den underrättelseloop
   spelet vill ha, utan att någon siffra läcker.
3. Ger `bidEstimate`s `winBand` något att variera mot, vilket gör anbudsspelet mindre statiskt.

Vikterna förblir dolda i UI:t. `THE_WORLD`-specens regel gäller: `Order.weights` visas aldrig.

---

# ETAPP 3B — FÖRBANDEN

## 5. `Formation` — en dekomposition, inte en parallell sanning

### 5.1 Den bärande regeln

```
INVARIANT:  Σ formations[side].equipment[c] === front.equipment[side][c]   för varje c
            Σ formations[side].strength     === front.strength[side]
```

Förbanden är en **uppdelning av aggregaten som redan finns**, inte ett andra lager sanning.
`fronts.ts`:s befintliga formel (`ratioAdvantage`, `netAdvantage`, genombrottströskeln) rörs
**inte**. Den räknar vidare på aggregaten; förbanden bestämmer bara *vem som bar förlusten*.

Det är vad som gör det här byggbart utan att skriva om projektets minst specificerade fil, och
invarianten ska fästas av ett test som körs över 20 turer.

### 5.2 Datamodell

```ts
export type Doctrine = 'infantry' | 'mechanised' | 'armoured' | 'artillery' | 'irregular'

export interface Formation {
  id: string                                  // 'rvn-3rd-infantry'
  name: string                                // '3rd Infantry Division'
  factionId: FactionId
  frontId: FrontId
  side: 'a' | 'b'
  sectorId: string                            // vilken sektor förbandet står i
  doctrine: Doctrine
  strength: number
  equipment: Record<TechCategory, number>
  readiness: Pct                              // 0 = utslaget, 100 = stridsdugligt
  status: 'active' | 'mauled' | 'refitting' | 'destroyed'
  engagedWith: string | null                  // motståndarförbandets id, denna tur
}
// på Front:
formations: Formation[]
```

Doktrinen styr **hur materiel fördelas till förbandet** när leveranser anländer, och därmed vad
det behöver när det förlorar:

```jsonc
"doctrineProfile": {
  "infantry":   { "infantry": 0.75, "artillery": 0.15, "armour": 0.05, "electronics": 0.05 },
  "mechanised": { "infantry": 0.40, "armour": 0.35, "artillery": 0.15, "electronics": 0.10 },
  "armoured":   { "armour": 0.60, "infantry": 0.20, "artillery": 0.15, "electronics": 0.05 },
  "artillery":  { "artillery": 0.70, "infantry": 0.20, "electronics": 0.10 },
  "irregular":  { "infantry": 0.95, "artillery": 0.05 }
}
```

### 5.3 Engagemanget — din formel

Varje tur, i den omstridda sektorn:

```
1. Para ihop förband: anfallarens aktiva förband i sektorn mot försvararens,
   störst mot störst, oparade förband står i reserv.

2. För varje par (A anfaller D), med SAMMA matematik som fronts.ts redan använder:

   combatPower(F) = Σ_c ( F.equipment[c] × categoryCombatWeight[c] )
                    × (F.strength / F.strengthAtFull)
                    × (F.readiness / 100)

   pairAdvantage  = ratioAdvantage(combatPower(A), combatPower(D))
                    − terrainBonus/100                  (gynnar försvararen)
                    + (D.supplyStress − A.supplyStress)/100

3. Förluster per förband:
   lossPct(A) = engagementAttritionPct × (1 − clamp(pairAdvantage, −1, 1))
   lossPct(D) = engagementAttritionPct × (1 + clamp(pairAdvantage, −1, 1))

   F.strength           −= round(F.strength × lossPct/100)
   F.equipment[c]       −= round(F.equipment[c] × lossPct/100 × categoryVulnerability[c])
   F.readiness          −= lossPct × readinessLossMultiplier

4. Status:
   readiness < maulThreshold (35)     → 'mauled'     — genererar akut, namngiven efterfrågan
   strength  < destroyThreshold (10)  → 'destroyed'  — tas ur linjen, hela dess behov utlyses
   'mauled' utan strid i 2 turer      → 'refitting'  → 'active' när readiness > refitThreshold

5. Aggregaten skrivs om ur förbanden, så invarianten i 5.1 håller:
   front.equipment[side][c] = Σ formations[side].equipment[c]
   front.strength[side]     = Σ formations[side].strength
```

`categoryCombatWeight` är den plats där **fynd 3 äntligen rättas**: alla sex kategorier får en
vikt, i stället för att bara artilleri räknas.

```jsonc
"categoryCombatWeight": { "infantry": 0.10, "artillery": 1.00, "armour": 0.70,
                          "aviation": 0.50, "naval": 0.05, "electronics": 0.30 },
"engagementAttritionPct": 6,
"readinessLossMultiplier": 1.8,
"maulThreshold": 35,
"destroyThreshold": 10,
"refitThreshold": 70
```

`artillery: 1.00` behåller artilleriets särställning så att den befintliga balansen inte
kastas om över en natt — men nu kan 4 633 gevär faktiskt göra något, och en pansardivision är
värd att beväpna.

### 5.4 Namngiven efterfrågan

När ett förband blir `mauled` eller `destroyed` utlyses dess återanskaffningsbehov som **en
namngiven order**, inte som anonymt behov:

```
Order.reason: {
  kind: 'REPLACE_FORMATION_LOSSES'
  formationId: string
  formationName: string
  engagementWireId: string        // kedjan bakåt till striden
} | { kind: 'PEACETIME_REPLACEMENT' } | { kind: 'SCRIPTED' }
```

Och wire blir precis det du beskrev:

```
1ST MECHANISED (NLF) ATTACKS 3RD INFANTRY (RVN) AT DA NANG
  ↳ 3RD INFANTRY MAULED — READINESS 82 → 29
    ↳ REPUBLIC OF VIETNAM SEEKS M-3 ARMOURED PERSONNEL CARRIER × 34
      — REPLACING 3RD INFANTRY'S LOSSES
```

Tre led, varje led med `causeId` bakåt. Det är `DESIGN.md` §8:s kausalmotor använd för det den
byggdes för, och det är första gången en order i spelet har ett **skäl spelaren kan läsa**.

### 5.5 Kopplingen till lägesbordet

`THE_WORLD`-specens `deriveDeployment` (avsnitt 5.1) blir överflödig och ersätts: förbanden har
redan en `sectorId`. Utgruppering behöver inte längre härledas — den finns.

Rörelsetyperna i `THE_WORLD` avsnitt 5.2 blir samtidigt sanna i stark mening:

| Rörelse | Före 3B | Efter 3B |
|---|---|---|
| `REDEPLOY` | Härledd omfördelning av en aggregatmassa | **Ett namngivet förband byter sektor** |
| `FRONT_SHIFT` | Linjen flyttas | Oförändrat |
| `SUPPLY_ARRIVAL` | Materiel till en sida | **Materiel till ett namngivet förband** |
| `CAPTURE` | Sektor byter hand | Oförändrat |

Det är också svaret på din ursprungliga fråga i kartspecen: efter 3B finns det faktiska enheter
att rita, och de rör sig av skäl spelaren kan följa.

**Spelaren befaller dem fortfarande aldrig.** Förbanden ägs av faktionerna och löses av
simuleringen. Spelarens enda inflytande är kommersiellt: vem som får köpa vad, hur fort, till
vilket pris. Det skyddsräcket är icke förhandlingsbart — se avsnitt 7.

---

## 6. Vad det kostar

Var ärlig om det här innan arbetet börjar.

**Balansen måste köras om två gånger.** Ordergenereringen är den enskilda ingången till all
intäkt. Att byta den från 35 %-tärning till behovsdriven flyttar varje rad i varje måltabell —
`ETAPP2_TEKNISK_SPEC.md` avsnitt 6.3 inkluderad. Budgetera ett fullt balanspass efter 3A och
ett till efter 3B.

**Golden-snapshoten fryses om två gånger**, en gång per etapphalva, var och en i en egen commit
med loggrad. Ingen annan ändring får ligga i de commitarna.

**`fronts.ts` växer.** Filen är redan flaggad som projektets minst specificerade. 3A lägger till
ett förslitningssteg; 3B lägger till engagemangsupplösning. Bryt ut till
`resolve/steps/attrition.ts` respektive `resolve/engagement.ts` hellre än att låta filen bli
ett nytt `applyActions.ts` (724 rader innan den bröts upp i P23).

**Scenariodata växer.** `INDOCHINA_SLICE` behöver en förbandsordning: 6–10 namngivna förband
fördelade på två sidor, med doktrin och startstyrka som summerar till dagens
`strengthA: 100 / strengthB: 80`.

---

## 7. Skyddsräcken

Tre regler som gör att det här inte blir ett wargame. De ska stå som kommentar i koden.

**1. Inga order till förband, någonsin.** `PlayerAction`-unionen får ingen variant som rör en
`Formation`. Ett test ska fästa att inget fält i `TurnSubmission` kan referera ett
`formationId`. `DESIGN.md` §21 stryker "hexkarta och taktiskt lager" och
`ETAPP1_TEKNISK_SPEC.md` avsnitt 9 stryker karta — ägarbeslutet i `THE_WORLD`-specen omprövade
*territorium*, inte *befäl*.

**2. Förbanden är en dekomposition.** Invarianten i 5.1 är ett test som körs över 20 turer.
Bryts den har förbanden blivit en parallell sanning, och då är `fronts.ts`:s formel inte längre
den som avgör kriget.

**3. Spelaren ser aldrig ett förbands dolda värden.** `readiness` och exakt `equipment` per
förband visas bara på den underrättelsenivå `Station.depth` i landet medger — samma princip som
`bidEstimate`. Utan station: `UNKNOWN FORMATION` och ett styrkeband. Det är
`THE_WORLD`-specens INTEL-lager, som i dag nästan saknar innehåll, och som med förbanden får
sitt syfte.

---

## 8. Måltabell

Mätt läge i högerkolumnen är P52 (efter `53b2512`, P51 hoppades över — se blockquote nedan),
200 partier `balanced`, om inget annat anges.

> **Rad omprövad under P45, se `docs/ANDRINGSLOGG.md`.** "Produkter som beställs minst en gång
> per 100 partier" kan strukturellt aldrig nå 6 av 7: fyra av de sju produkterna (armour/
> aviation/naval/electronics) kräver `faction.techLevel ≥ 3`, men ingen faktion i
> `indochina-slice.json` har `techLevelDefault` över 2 (`rvn`), och ingen mekanik i etapp 1–3
> höjer en FAKTIONS tekniknivå (till skillnad från husets egen, som `REPRIORITISE_RND` styr).
> P45:s eget klart när kräver 3 av 7 (m1_rifle, 105mm_field_gun, mk9_longhand_shell) — uppmätt
> 100 % av partier når alla tre, efter en golvningsfix i `orders.ts` (se samma loggrad:
> `need[c] -= quantity` drev annars behovet djupt negativt så fort en produkts
> `orderQuantityMin` översteg dess `orderTriggerThreshold`, vilket permanent kvävde framtida
> ordrar i den kategorin). Målvärdet sänkt till 3 av 7 tills en framtida etapp ger faktioner en
> egen tekniknivåstillväxt — ägaren tillfrågad, valde revision i stället för att bygga den
> mekaniken i förbigående här.

> **P47: "balanced" slutar nu praktiskt taget alltid i `BUYOUT` — två fetstilta rader kunde
> därför inte nås inom mandatet ("Ingen kod. ... Skruva bara balance.json"), se
> `docs/ANDRINGSLOGG.md`.** Styrelsegranskningen (`board.ts`, P30, etapp 2) förutsätter linjär
> intäkt från tur 0 mot 2× grundkapitalet (8 Mkr) vid tur 20. P45:s behovsdrivna ordrar ger i
> stället en uppvärmningsperiod (första leverans typiskt tur 4–7) och en total marknadsvolym en
> storleksordning under det målet — uppmätt medianprogress ~7 % av målet vid tur 20, ett läge som
> inte förbättras av VILKEN tur granskningen förläggs till (testat separat, se ANDRINGSLOGG).
> Konsekvens: 200/200 `balanced`-partier slutade i `BUYOUT`, i snitt vid tur ~11. Ägaren
> tillfrågad två gånger under P47 (en tajmingfix, sedan en större omskalning av `boardTarget`);
> valde att lämna styrelsemålet OFÖRÄNDRAT — det är ingen av de fem fetstilta raderna, och en
> riktig fix är en egen omkalibrering, inte en balanspass-justering. Kvarstår som ett öppet,
> loggat spänningsförhållande mellan P30 och P45 för ett framtida beslut.
>
> Två fetstilta rader av samma skäl inte nåbara med bara `balance.json`:
> - **Andel ordrar som är gevär** (67 %, mål < 45 %): `orderTriggerThreshold`/
>   `peacetimeReplacement` är specens egna, ordagranna tal (P44:s not i `balance.json`) — inte
>   provisoriska, alltså inte P47:s att skruva. Roten ligger heller inte där: fyra av sex
>   kategorier (armour/aviation/naval/electronics) saknar en beställningsbar produkt för de
>   flesta faktioners tekniknivå (samma orsak som blockquoten ovan) och faller ständigt till
>   `UNMET NEED` i stället för en order — bara gevär konverterar tillförlitligt behov till en
>   faktisk utlysning. En riktig fix är fler produkter per kategori eller lägre `techRequired`,
>   dvs. `products.json`, inte `balance.json`.
> - **Partier där fronten byter riktning minst en gång** (0 %, mål > 30 %): partierna slutar i
>   snitt vid tur ~11 — för kort tid för att en leverans ska hinna vända ett övertag. Direkt
>   nedströms av samma `BUYOUT`-kaskad.
>
> **Materiellager hos en sida vid partiets slut < 2× lagret vid tur 10** klarar sig tekniskt
> (1,05, max 1,15) men trivialt: partiet slutar i snitt bara en tur efter tur 10, så måttet säger
> knappast något om långsiktig materieltillväxt — radens egentliga syfte. Uppfylld bokstavligt,
> inte i avsedd mening.

> **P50: "Ordrar med `reason.kind === 'REPLACE_FORMATION_LOSSES'`" reviderad, 40 % → 15–20 %,
> ägaren tillfrågad två gånger.** Samma tekniknivå-lucka som P45:s blockquote ovan
> (`rvn` techLevel 2, `nlf`/`laos` 1 — bara gevär köpbart av alla tre, artilleri bara av `rvn`,
> pansar/luftvärn/elektronik/marint av ingen): ett mauled/destroyed förband vars förlust ligger i
> en spärrad kategori blir `UNMET NEED` i stället för en namngiven order. Första mätningen
> (P48:s ursprungliga roster, en jämn blandning av doktriner): 12,7 %. Ägaren tillfrågad, valde
> att göra rostret mer infanteritungt (`indochina-slice.json`s `front.formations` — egen
> scenariodata, inte specbunden) i stället för att revidera direkt — höjde måttet till 16,9 %,
> en verklig, kvarhållen förbättring (konverteringsgraden för en FAKTISK mauling/förstöring steg
> till ~67 %). Kvarstående gap är volym, inte konvertering: `PEACETIME_REPLACEMENT` (69 %) byggs
> upp betydligt snabbare än förbandsstrid hinner utveckla sig, förstärkt av den redan loggade
> P47-kaskaden (partier slutar ofta runt tur 10, se `SCENARIO_COMPLETE`-raden nedan) som lämnar
> för lite tid för upprepad strid. Ägaren tillfrågad en andra gång; valde att behålla
> rosterfixen och revidera målet i stället för att jaga volymen vidare (skulle kräva att röra
> `boardTarget` igen, redan avgjort orört i P47) | Uppmätt 16,9 % (n=200, `balanced`) — inom det
> reviderade intervallet |

> **P52: invarianten i 5.1 höll INTE — en äkta bugg hittad och rättad, ägaren tillfrågad.**
> Härnessmätningen (n=200, `balanced`, full `resolveTurn`) visade 800 brutna kontroller av
> 28 800, alltid `strength`, aldrig `equipment`. Grundorsak: `steps/fronts.ts`s `resolveFront`
> (P6, långt före förbanden) minskar `front.strength[sida]` direkt via sin egen förlustformel,
> utan att röra formationerna — den körs direkt EFTER `engagement()` i samma `fronts()`-anrop,
> så den desynkar `front.strength` från förbanden igen varje stridstur (`attrition.ts`s
> motsvarande brist för `equipment` hittades och rättades redan i P49 — den här var samma
> mönster, bara för `strength`, och missades då). P52:s eget mandat är "ingen kod", så ägaren
> tillfrågad innan fixen gjordes: en ny `reduceFormationsStrength` (`steps/fronts.ts`, samma
> proportionella fördelning som `attrition.ts`s `reduceFormationsEquipment`) håller nu
> `front.strength[sida]` i synk med formationerna, verifierat: 0 brutna kontroller av 33 600
> efter fixen, plus ett nytt regressionstest (`fronts.test.ts`). Ett medvetet, motiverat
> undantag från "ingen kod" — en bugfix, inte en balans- eller designändring |
>
> **(3B) Förband som blir `mauled` per parti** (1,45, mål 2–6) inte nått — samma `BUYOUT`-kaskad
> som redan förklarar de flesta ouppfyllda raderna ovan: partier slutar i snitt vid tur ~11, för
> kort tid för flera mauled-cykler per parti, och `destroyThreshold`/`maulThreshold` är specens
> egna, ordagranna tal (P49:s not) — inte P52:s att skruva för att flytta fler händelser från
> `destroyed` till `mauled`. Destroyed-frekvensen (2,35/parti) är hög av samma skäl P50:s roster-
> omkalibrering redan gav (mindre formationer, se P50-blockquoten) — en avvägning som redan gjord,
> inte omprövad här |

| Kriterium | Målvärde | Mätt nu |
|---|---|---|
| **Produkter som beställs minst en gång per 100 partier** | **3 av 3 möjliga** (se blockquote ovan) | **3 av 3 (100 %)** |
| **Andel ordrar som är gevär** | **< 45 %** | **70,3 % — ej uppfyllt, se P47-blockquote** |
| Utlysta ordrar per tur | 1,0–1,8 | 1,33 |
| **Materiellager hos en sida vid partiets slut** | **< 2× lagret vid tur 10** | **1,06 (max 1,26) — uppfyllt, men trivialt, se P47-blockquote** |
| **Partier där fronten byter riktning minst en gång** | **> 30 %** | **0 % — ej uppfyllt, se P47-blockquote** |
| **Ordrar med `weights.delivery > weights.price`** | **8–25 %** | **20,9 %** |
| Partier där en köpare har `UNMET NEED` minst en tur | 20–60 % | 100 % |
| **(3B) Förband som blir `mauled` per parti** | **2–6** | **1,45 — ej uppfyllt, se P52-blockquote** |
| **(3B) Ordrar med `reason.kind === 'REPLACE_FORMATION_LOSSES'`** | **15–20 % (reviderat, se P50-blockquote)** | **19,5 %** |
| **Invarianten i 5.1 håller över 20 turer** | **alltid** | **Ja, 0/33 600 brutna kontroller — se P52-blockquote (bugfix)** |
| Rivalerna vinner ordrar (`balanced`) | 25–45 % | 71,2 % |
| `balanced` når `SCENARIO_COMPLETE` | 50–75 % | 0 % (200/200 `BUYOUT`, se P47-blockquote) |

**P51 obyggd, inte klarmarkerad** — blockerad av den THE_WORLD-spec-lucka som flaggades vid
antagandet (`CLAUDE.md`, `docs/ANDRINGSLOGG.md`). Ingen rad ovan beror av lägesbordet.

**Måltabellen är hypoteser, inte acceptanskriterier.** Om härnessen envist säger något annat och
partierna ändå är roliga att spela är det tabellen som ska skrivas om — men som ett medvetet
beslut med en motivering och en loggrad.

---

## 9. Promptsekvens

**P43 — materielförslitning**
> Bryt ut `resolve/steps/attrition.ts` och sätt in det i pipelinen direkt efter `fronts`. Implementera 3.1 och wire-händelsen i 3.3. Ingen ordergenereringsändring.
>
> *Klart när:* ett test visar att `front.equipment` minskar efter en stridstur och aldrig går under noll; ett test visar att förlorande sida förbrukar mer än vinnande; ett test visar att en front utan strid inte förbrukar något; golden-snapshoten omfryst i **denna commit och ingen annan**, med loggrad.

**P44 — behovsregistret**
> Lägg till `Faction.materielNeed`. Låt `attrition.ts` fylla på det och `factions.ts` addera `peacetimeReplacement` och klampa mot `needCeiling`. Ingen utlysningsändring än.
>
> *Klart när:* ett test visar att behovet växer med förlusterna och aldrig överstiger taket; ett test visar att fredstidspåfyllningen ensam når `orderTriggerThreshold` för `infantry` inom 5 turer utan strid.

**P45 — behovsdriven utlysning**
> Ersätt `orders.ts`:s ordinarie gren enligt 4.2. Ta bort `orderGenerationChancePct`. Behåll den scriptade grenen oförändrad. Emitta `UNMET NEED` och `CANNOT AFFORD` som tickers.
>
> *Klart när:* ett test visar att en faktion utlyser en order i den kategori där behovet är störst; ett test visar att behovet konsumeras vid utlysning; ett test visar att en faktion utan råd inte utlyser; härnessen visar minst 6 av 7 produkter beställda över 100 partier.

**P46 — frontläget sätter vikterna**
> Implementera `pressure` och viktförskjutningen enligt 4.3, härledd ur `front.trace`.
>
> *Klart när:* ett test visar att en faktion som förlorar mark får `weights.delivery > weights.price`; ett test visar att `Order.weights` aldrig exponeras i något UI-element; härnessen visar 8–25 % ordrar med leveransövervikt.

**P47 — balanspass 3A**
> Ingen kod. Kör härnessen mot avsnitt 8:s rader som inte är märkta (3B). Skruva bara `balance.json`. Frys om golden när tabellen står.
>
> *Klart när:* de fem fetstilta 3A-raderna är uppfyllda eller reviderade med motivering och loggrad; hela CI-kedjan grön.

**P48 — `Formation`-modellen**
> Lägg till `Formation`, `Front.formations` och `doctrineProfile`. Skriv förbandsordningen i `indochina-slice.json` (6–10 förband, summerande till dagens startstyrkor). Låt `deliveries.ts` fördela ankommen materiel över förbanden enligt doktrin. Ingen stridsupplösning än.
>
> *Klart när:* ett test visar att invarianten i 5.1 håller efter 20 turers leveranser; ett test visar att ett `mechanised`-förband får mer `armour` än ett `infantry`-förband av samma leverans; **golden omfryst i denna commit och ingen annan**.

**P49 — engagemanget**
> Bygg `resolve/engagement.ts` enligt 5.3 och anropa det från `fronts.ts` före aggregatberäkningen. Implementera status, `mauled`, `destroyed` och `refitting`.
>
> *Klart när:* ett test visar att invarianten håller efter 20 turers strid; ett test visar att ett förband med övertag tar mindre förluster; ett test visar att ett `destroyed`-förband lämnar linjen och att aggregaten minskar i motsvarande grad; ett test visar att `categoryCombatWeight` gör infanteri icke-noll i utfallet.

**P50 — namngiven efterfrågan**
> Lägg till `Order.reason` enligt 5.4. Låt `mauled`/`destroyed` utlysa namngivna ersättningsordrar med `causeId` bakåt till striden.
>
> *Klart när:* ett test följer kedjan strid → mauled → order genom `causeId` i tre led; ett test visar att kedjan överlever `pruneWire` över 8 turer; härnessen visar > 40 % ordrar med `REPLACE_FORMATION_LOSSES`.

**P51 — förbanden på lägesbordet**
> Ersätt `deriveDeployment` med förbandens faktiska `sectorId`. Uppgradera `REDEPLOY` och `SUPPLY_ARRIVAL` enligt 5.5. Bygg INTEL-lagrets dimning enligt skyddsräcke 3.
>
> *Klart när:* ett test visar att ett förband utan station i landet visas som `UNKNOWN FORMATION`; ett test visar att `MovementArrow` fortfarande inte tar någon state-ändrande prop; ett test visar att inget fält i `TurnSubmission` kan referera ett `formationId`.

**P52 — balanspass 3B**
> Ingen kod. Kör härnessen mot hela avsnitt 8. Skruva `balance.json` och scenariodata. Frys om golden när tabellen står.
>
> *Klart när:* alla rader uppfyllda eller reviderade med motivering och loggrad; hela CI-kedjan grön.

---

## 10. Vad som avsiktligt inte finns i etapp 3

Order till förband, hexrutenät, taktiskt lager, stridsupplösning per pluton, fog-of-war där
spelaren spanar manuellt, förband spelaren äger, en andra front, nya scenarier, råvaruspår
utöver `supplyCostIndex`, `FUND_COUP`, `ASSASSINATE`, namngivna tjänstemän, fördrag,
avkolonisering.

Bredden (andra fronten, råvarumarknaden, `OCTOBER`, `SUEZ`) flyttas till etapp 4. Den blir
rimligare efter det här arbetet, inte tvärtom: en andra front med behovsdriven efterfrågan är
två marknader som konkurrerar om samma produktionskapacitet — vilket är ett riktigt beslut.
Med dagens tärning hade det bara varit dubbelt så många myntkast.
