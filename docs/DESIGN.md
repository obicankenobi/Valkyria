# THE SEVENTH FRONT — Designdokument v2.1

*Kallakrigssimulator om ett privat vapenhus. Turbaserad, textbaserad, byggd som PWA.*

Dokumentet är skrivet på svenska. Alla systemnamn, fältnamn och UI-strängar är på engelska och
ska användas ordagrant i koden.

---

## 0. Vad som ändrats

### Sedan v2.0 (designgranskning)

| Problem i v2.0 | Lösning i v2.1 |
|---|---|
| Ingen produktionskostnad fanns i modellen. `grade C` sänkte priset men inte kostnaden, och var därför strikt sämre än A. Spelaren hade ingen marginal att räkna på. | Rörlig styckkostnad per produkt och grade. `supply_cost_index` verkar på **kostnaden**, inte på priset. Se avsnitt 5.1. |
| `QUOTE` kostade en executive action. Med anbud som enda intäktskälla gick varje tur åt till att bjuda, och turvalet var i praktiken redan fattat. | `QUOTE` är gratis. Den verkliga knappheten är **produktionskapacitet och leveranstid**, inte handlingsutrymme. De tre handlingarna reserveras för det diskretionära. Se avsnitt 4. |
| `INSOLVENCY` var trivialt undvikbar — lån utan tak. | Kreditgräns härledd ur omsättning, skuldkvot och `reliability`. Långivaren kan säga nej. Se avsnitt 7.1. |
| Styrelsemålet var femårigt och scenariot 20 turer, så `BUYOUT` kunde bara inträffa på sista turen. Passivitet straffades aldrig under tiden. | Styrelsen prövar prognosen vid tur 8 och 14. Två underkända kontroller i rad ger tidigt uppköp. Se avsnitt 7.3. |
| `heat` kunde aldrig nå de nivåer där pengarna finns, och spec och design angav olika avsvalningsregel. | Omkalibrerade konstanter och en entydig regel: avsvalning bara turer utan leverans in i aktiv konflikt. Se avsnitt 6.1. |
| Etapp 1 saknade varje `DOOMSDAY`-drivare utom iscensatta incidenter, och kunde alltså inte pröva designpelare 1. | `RESTRICTED`-produkter finns från etapp 1. Minst en affär per parti ska vara för lönsam för att tacka nej till och samtidigt farlig. Se avsnitt 5.2 och 20. |

### Sedan v1

| Problem i v1 | Lösning i v2 |
|---|---|
| Global spänningsmätare höjdes av rutinförsäljning och kunde inte kylas ner i takt med spelets premiss | Två lager: `heat` per krigsskådeplats (snabb, lokal, belönande) och `DOOMSDAY` globalt (långsam, rör sig bara på eskalerande handlingar) |
| Inget förlustvillkor utom kärnvapenkrig | Husets egen ekonomi kan gå under, och ägarna kan sälja dig. Passivitet förlorar långsamt. |
| 7 administrativa faser per tur → klickarbete | Standing orders som sätts sällan + 3 `executive actions` per tur som måste väljas bort |
| Orsak och verkan osynlig i 13 parallella system | `THE WIRE` — kausalmotor som arkitektoniskt krav, inte UI-feature |
| 176 turer i en kampanj 1947–1991 | Scenarier på 20–40 turer. Full kampanj är etapp 3, inte etapp 1. |
| Verkliga företag och namngivna mordoffer | Fiktiva hus. Verkliga stater och händelser, fiktiva tjänstemän. |
| Anbud var ett menyval | Anbudsspelet är spelets kärnmekanik med dold information |

---

## 1. Kärnidé

Du driver ett privat vapenhus 1947–1991. Du säljer, läcker, embargerar, mutar och iscensätter.
Du befaller aldrig en enda soldat.

Allt militärt är abstraherat till frontsimuleringar som drivs av materielkvot, manskap, moral och
försörjningsstress. Ditt inflytande är ekonomiskt: vem du säljer till, vem du svälter, vem du
beväpnar i hemlighet, vem du störtar.

Spelet handlar om att du tjänar pengar på krig men dör av krig.

---

## 2. Designpelare

Tre regler. Allt som inte tjänar minst en av dem skärs bort.

**1. Vinst kräver våld, för mycket våld avslutar spelet.**
Inkomsten kommer från aktiva krig. Aktiva krig matar `DOOMSDAY`. Du befinner dig alltid mellan
"för lite krig för att överleva kvartalet" och "för mycket krig för att överleva decenniet".

**2. Varje affär har en andrahandseffekt du ser och en du inte ser.**
Den sedda effekten skrivs ut i `THE WIRE`. Den osedda kommer tillbaka fyra turer senare och du
ska kunna spåra den bakåt när den gör det.

**3. Du är alltid näst mäktigast i rummet.**
Du kan aldrig vinna över en supermakt. Du kan bara få dem att gå i den riktning du redan tjänar
pengar på. Spelet säger aldrig nej till en handling, det prissätter den.

> **Konsekvens för avgränsning.** Pelare 1 är den enda av de tre som kan visa sig vara fel. Varje
> etapp måste därför innehålla minst en fungerande väg från "mycket lönsam affär" till "farligt
> läge", annars prövar etappen bara pelare 2 och 3, som är billiga att få rätt. Det var v2.0:s
> största avgränsningsfel och är åtgärdat i avsnitt 5.2.

---

## 3. Spelarrollen

**Huset** definieras vid scenariostart:

```
house_name          spelardefinierat (fiktivt, förslag genereras)
home_state          neutral/väst/öst-anknuten — påverkar exportlicens och misstanke
specialisation      artillery | armour | aviation | naval | electronics
                    (billigare R&D och +10 % anbudsstyrka i kategorin)
founding_capital    £4 000 000
```

Huset äger:
- 4 produktionslinjer (utbyggbart till 9)
- 1 R&D-avdelning med kö
- 1 underrättelsestation (utbyggbart till 5)
- En kassa, en skuld, en kreditgräns och en styrelse

**Styrelsen (`THE SYNDICATE`)** är den viktigaste NPC:n i spelet. De ställer ett mål per period
och prövar prognosen mot det två gånger innan perioden är slut. Missar du målet blir huset
uppköpt och scenariot slutar.

---

## 4. Turstruktur

Turlängd: ett kvartal. Scenario: 20–40 turer.

Turen har tre slags beslut, och skillnaden mellan dem är hela lösningen på grindproblemet.

### Standing orders — sätts sällan, driver av sig själva

Produktionslinjer, R&D-kö, leverantörsavtal, prisgolv, spionstationers underhållsläge. Dessa
ändras på eget initiativ, ofta bara var femte till tionde tur. Systemet larmar i `THE WIRE` när
en standing order blivit dålig ("LINE 2 har producerat mot ett kontrakt som annullerades i Q3
1961").

### Anbud — obegränsat många, men kapaciteten är knapp

`QUOTE` kostar **ingen** executive action. Du får bjuda på varje utlyst order varje tur.

Det låter generöst och är det inte. Varje vunnet kontrakt binder linjekapacitet under de turer
det tar att producera, och varje missad leveransdeadline sänker `reliability`, vilket sänker din
poäng i alla framtida anbud. Att bjuda på allt är därför den näst sämsta strategin i spelet,
strax efter att inte bjuda alls. **Knappheten ligger i vad du kan leverera, inte i vad du får
säga.** Det är en knapphet spelaren kan räkna på, till skillnad från ett godtyckligt handlingstak.

### Executive actions — 3 per tur, alltid fler alternativ än utrymme

En tur presenterar typiskt 6–9 möjliga handlingar. Du får göra tre. Detta är spelet.

```
BROKER       förhandla direkt med en köpare utanför anbudsförfarandet
INTEL        rekrytera, läcka, sabotera, vända eller dra tillbaka en agent
POLITICAL    muta, iscensätta incident, finansiera kupp, back-channel
MARKET       köp/dumpa råvara, binda leverantörskapacitet
INTERNAL     bygg linje, anställ, omprioritera R&D, ta lån, amortera
```

Antalet handlingar höjs till 4 med en `chief of staff` av hög kvalitet, och sänks till 2 under ett
kvartal när huset är under utredning.

### Turordning vid resolve

Den auktoritativa ordningen står i den tekniska specen, avsnitt 3.2. Den här listan är
sammanfattningen:

```
1. spelarens handlingar tillämpas
2. standing orders producerar (styckkostnad bokförs här)
3. leveranser anländer (fördröjning 1–3 turer efter kontraktsdatum), betalning bokförs
4. fronter tickar
5. faktionsekonomier uppdateras
6. heat uppdateras per teater
7. DOOMSDAY uppdateras
8. rivalhus agerar
9. nya ordrar utlyses (referenspriset fryses här)
10. anbud avgörs
11. husets ekonomi: fasta kostnader, ränta, kreditgräns
12. styrelsen prövar prognosen
13. slutvillkor kontrolleras
```

`THE WIRE` genereras inte som ett eget steg. Varje steg ovan emitterar sina egna händelser medan
det kör. Se avsnitt 8.

---

## 5. Den kommersiella kärnan: anbudsspelet

Detta är spelets hjärta och ska byggas först.

En köpare utlyser en order:

```
ORDER 1965-Q2 / REPUBLIC OF VIETNAM
  105 mm field guns × 120, delivery within 3 turns
  Stated budget:        £2 400 000   (uppskattning, kan vara lögn)
  Bidding houses:       4  (3 rivals + you)
  Inspector:            Col. Trân (integrity: unknown)
```

Du ser inte rivalernas anbud. Du ser en **uppskattning** vars precision beror på din
underrättelse:

| Underrättelse i landet | Visad uppskattning |
|---|---|
| ingen | "rivalanbud: £1,4 M – £3,2 M" |
| en agent, låg depth | "£1,9 M – £2,6 M" |
| station med djup | "£2,05 M – £2,30 M, Brandt-huset lägger lågt" |
| vänd inspektör | exakt siffra för ett rivalanbud |

Du sätter pris, leveranstid och kvalitetsnivå (`grade A/B/C`).

Vinnaren avgörs av `bid_score = price_weight × pris + delivery_weight × tid + relationship +
bribe + reputation`. Vikterna varierar per köpare och är delvis dolda. En desperat köpare mitt i
en offensiv bryr sig om leveranstid, inte pris.

Detta gör att underrättelse tjänar handeln istället för att vara en separat leksak. Varje
spionpoäng du lägger konverteras till anbudsprecision, och anbudsprecision är pengar.

> **Om exakt information.** Även på högsta djup får du rivalernas *pris*, aldrig deras *poäng*.
> Vikterna, köparens sanna budget och inspektörens integritet förblir dolda, och rivalernas
> relationer och rykten räknas med deras egna värden. Perfekt prisinformation avgör alltså inte
> anbudet. Därför ska UI:t uttrycka uppskattningen i beslutets valuta — ett prisintervall där du
> vinner med uppskattad sannolikhet — och inte som en siffra som ser ut som ett facit men inte är
> det. Se specens avsnitt 4.3.

### 5.1 Kostnad, marginal och grade

Varje produkt har en **styckkostnad**, inte bara ett baspris. Kostnaden bokförs när linjen
producerar, inte när kontraktet vinns.

```
grade A    kostnad × 1.00    pris × 1.00    ingen skandalrisk
grade B    kostnad × 0.82    pris × 0.86    låg skandalrisk
grade C    kostnad × 0.61    pris × 0.72    påtaglig skandalrisk, tre turers ryktesskada
```

Siffrorna är valda så att C ger **högre** marginal i procent och **lägre** i kronor per enhet än
A. Det gör valet till en verklig avvägning: C är rätt när du är trängd på kassa eller när köparen
är prisviktad, och fel när du har rykte att förlora. Om härnessen visar att en grade är
dominerande är det de här sex talen som ska skruvas först.

`supply_cost_index` multiplicerar **styckkostnaden**. Det är så global spänning pressar dig: ett
hett kvartal höjer både vad köparen betalar och vad du betalar, och nettot beror på om du hann
låsa priset innan indexet rörde sig.

### 5.2 `RESTRICTED`-produkter — pelare 1:s mekanik

Vissa produkter är märkta `restricted` med en `doomsdayOnDelivery`-siffra. De betalar tre till
fem gånger en ordinär order och rör `DOOMSDAY` när de levereras över blocklinjen.

Detta finns **från etapp 1**, inte från etapp 2. Utan det har spelet ingen frestelse, och
frestelsen är produkten. En spelare som aldrig ställs inför en affär som är för lönsam för att
tacka nej till har inte spelat det spel dokumentet beskriver — den har spelat en
tillverkningssimulator.

Designkravet på scenariot: **minst en `restricted`-order ska utlysas per parti**, tidigast tur 6
och senast tur 14, och den ska vara stor nog att ensam avgöra ett styrelsemål.

---

## 6. Hotsystemet

### 6.1 `heat` — per teater, 0–100

```
heatFromDeliveries = enheter levererade in i aktiv konflikt × heatPerUnit

om heatFromDeliveries > 0:   heat = min(100, heat + heatFromDeliveries − heatDecayActive)
annars:                      heat = max(0,   heat − heatDecayIdle)
```

Avsvalning sker alltså **bara turer utan leverans in i aktiv konflikt**, plus en liten löpande
avsvalning som ändå gäller. Det var tvetydigt i v2.0, där designdokumentet och specen angav olika
regel och specens konstanter gjorde mätaren död i praktiken.

Konstanterna ska kalibreras så att **en full linjes kvartalsleverans ger +7 till +21**, det vill
säga att tre till fem turers ihållande leverans räcker för att passera 40. Startvärden står i
`balance.json`. Om härnessen visar att `heat > 40` är ovanligt är `heatPerUnit` för lågt, och om
`heat` fastnar på 100 är `heatDecayActive` det.

Effekter:
- `heat > 40` — priserna i teatern stiger 20–60 %. Det är här du tjänar pengar.
- `heat > 70` — supermakterna börjar skicka egen materiel. Din marknadsandel krymper.
- `heat > 85` — risk per tur för `escalation event` som kan lyfta konflikten till `DOOMSDAY`-nivå.

Rutinförsäljning rör aldrig `DOOMSDAY`. Det var v1:s stora fel. Att sälja artilleri till Vietnam
1966 är inte en världshändelse, det är tisdag.

### 6.2 `DOOMSDAY` — globalt, 0–100

Rör sig bara på handlingar som korsar blocklinjen eller rör kärnvapentröskeln:

```
leverans av restricted-produkt över blocklinjen    +14 … +25   (etapp 1)
styrsystem/MIRV-underlag över blocklinjen          +10 … +18   (etapp 1)
iscensatt incident som involverar supermaktsenhet  +12 … +20   (etapp 1)
escalation event från heat > 85                     +5 … +15   (etapp 1)
kupp i en blockgränsstat                            +8 … +15   (etapp 2)
lönnmord på supermaktstjänsteman                    +6 … +10   (etapp 2)
naturlig avkylning                                  −3 per tur
back-channel (kostar 1 executive action + £)      −10 … −20
undertecknat fördrag (historisk händelse)         −12 … −18   (etapp 3)
```

Kolumnen längst till höger är ny i v2.1 och finns för att det ska gå att se, utan att räkna, om
en etapp har tillräckligt många drivare för att `DOOMSDAY` ska vara en levande mätare i den. De
fyra som är märkta etapp 1 räcker.

Trösklar:

- **≥ 60** — `CRISIS WATCH`. Nästa eskalerande handling triggar krisrullning.
- **≥ 75** — `CRISIS EVENT`. Du är alltid en av parterna krisen rör, aldrig en åskådare. Val:
  - `PUSH` — 30 % kärnvapenutbyte (slut), 70 % nedtrappning till 45 och du får ett femårskontrakt ur kaoset
  - `BACK DOWN` — till 40, du förlorar kvartalets aggressiva intäkt och en station blir exponerad
  - `SELL THE FILE` — sälj vad du vet till båda sidor: till 50, stor engångsintäkt, ditt rykte hos båda blocken faller permanent
- **≥ 95** — kärnvapenutbyte, scenariot slutar.

### 6.3 Om slutet

Kärnvapenslutet får inte vara en svart skärm. Det är exakt det misstag *Balance of Power* (1985)
gjorde och blev ökänd för. Spelet ska visa en epilog: vad ditt hus levererade under de sista tolv
turerna, vilka fronter som fanns, vilken enskild leverans som modellen kan spåra som utlösande,
och en dödsruna över huset. Spelaren ska kunna läsa sin egen skuld.

---

## 7. Husets ekonomi — förlustvillkoren

Detta saknades helt i v1 och är anledningen till att spelet där inte hade något tryck.

### 7.1 Fasta kostnader, rörliga kostnader och kredit

Fast per tur:

```
payroll                    £180 000 + £45 000 per linje över 4
line upkeep                £60 000 per aktiv linje
station upkeep             £90 000 per underrättelsestation
debt interest              4–11 % av skuld per år, beroende på hemstat och rykte
R&D overhead               £120 000 per aktivt projekt
```

Typiskt golv: **£900 000 per kvartal**. Du kan inte sitta still.

Rörligt: styckkostnaden för allt som produceras, enligt avsnitt 5.1. Den är den större posten i
ett aktivt kvartal och den enda du kan styra genom prissättning.

**Kreditgräns.** Nytt i v2.1. `TAKE_LOAN` prövas mot ett tak:

```
creditLimit = trailingFourTurnRevenue × creditMultiple(reliability, homeState)
              − debt
```

Långivaren säger nej när taket är nått, och säger nej *hårdare* när `reliability` har fallit. Det
gör `INSOLVENCY` till ett verkligt förlustvillkor istället för en formalitet, och det knyter ihop
ryktessystemet med ekonomin: en missad leveransdeadline kostar dig inte bara nästa anbud utan
också din möjlighet att låna dig ur kvartalet.

### 7.2 Fyra sätt att förlora

1. `INSOLVENCY` — kassa under noll i tre turer i rad. Huset likvideras.
2. `BUYOUT` — du missar styrelsens mål, eller underkänns i två prognoskontroller i rad.
3. `EXPOSURE` — tre stationer exponerade inom sex turer. Åtal, exportlicens dras in.
4. `NUCLEAR EXCHANGE` — `DOOMSDAY ≥ 95`.

### 7.3 Styrelsens mål och prognoskontroller

```
1955–1960  "Doubling"       omsättning ≥ 2× perioden innan
1960–1965  "Parity"         teknologinivå ≥ marknadsledaren i två kategorier
1965–1970  "Footprint"      minst 6 aktiva köpare på tre kontinenter
1970–1975  "Deleveraging"   skuld < 40 % av årsomsättningen
```

Målet prövas inte bara vid periodens slut. Styrelsen gör **prognoskontroller vid 40 % och 70 % av
perioden** — i ett 20-turersscenario alltså tur 8 och tur 14 — och jämför `progressSnapshot` mot
den linjära bana som skulle nå målet i tid, med en tolerans.

- Underkänd kontroll: varning i `THE WIRE`, skärpta lånevillkor.
- Två underkända kontroller i rad: `BUYOUT` omedelbart.

Utan detta kunde `BUYOUT` i v2.0 bara inträffa på scenariots sista tur, vilket gjorde det till en
enda tärning i stället för ett tryck som byggs. Nu är passivitet något spelaren *känner* från tur
8, vilket är hela poängen med villkoret.

Rivalhusen växer om du är passiv. Marknadsandel är ett nollsummespel. Det betyder att pacifism
förlorar långsamt men säkert, vilket är exakt det tematiska tryck spelet behöver: du kan välja att
inte elda på världen, men då blir du uppköpt av någon som vill.

---

## 8. `THE WIRE` — kausalmotorn

**Detta är ett arkitektoniskt krav, inte en UI-feature. Det måste finnas i etapp 1. Att
eftermontera det är oöverkomligt dyrt.**

Varje tillståndsändring i motorn måste emittera ett händelseobjekt med referens till sin orsak.
Typen står i den tekniska specen, avsnitt 2.6.

UI:t renderar kedjan bakåt, max tre led:

```
CONGOLESE GOVERNMENT DEFAULTS ON THREE CONTRACTS
  ← treasury exhausted, Q4 1961
    ← crude oil +140 % since Q2 1961
      ← your embargo of Gulf crude to Bloc-aligned buyers, Q1 1961
```

`actorIsPlayer` används för att markera dina egna spår i rött. Poängen är att spelaren ska kunna
se sin hand i katastrofen utan att spelet behöver anklaga honom.

En tur genererar typiskt 1–2 `headline`, 4–8 `report` och ett obegränsat antal `ticker`. Spelaren
läser headlines, kan fälla ut reports, och tickern finns för den som vill gräva.

**Beskärning får aldrig bryta en kedja.** Fönstret i `state.wire` är rullande, men en händelse
vars `causeId` fortfarande kan visas måste behålla sina förfäder. Regeln står i specens avsnitt
2.6. En kedja som tar slut mitt i är värre än ingen kedja, eftersom spelaren då tror att spelet
döljer något när det i själva verket bara har glömt.

---

## 9. Underrättelse

Förenklat från v1. Stationer, inte agenter, är den enhet spelaren tänker i.

```ts
interface Station {
  city: string                    // "MOSCOW", "HAVANA", "SAIGON"
  nation: string
  depth: 0-5                      // hur mycket precision den ger
  exposure: 0-100                 // stiger när den används
  coverage: ('procurement' | 'military' | 'cabinet' | 'industry')[]
}
```

`depth` är den siffra som betyder något: den avgör hur snäva dina anbudsuppskattningar blir och
vilka operationer som är möjliga. `exposure` stiger med 8–25 per operation och sjunker 5 per
vilande tur. Vid `exposure > 80` rullas varje tur mot avslöjande.

Operationer i etapp 1: `RECRUIT`, `LEAK`, `SABOTAGE`, `TURN`, `WITHDRAW`, `EXPAND`.

`ASSASSINATE` är **flyttad till etapp 2** och finns inte i `IntelOp` i etapp 1. Den riktas när den
byggs bara mot fiktiva tjänstemän (ministrar, generaler, inspektörer), aldrig mot verkliga
namngivna statschefer. Se avsnitt 15.

---

## 10. Frontsimulering

Behålls från v1, i princip oförändrad, den var bra. Ingen hexkarta, ingen taktik. Linjeposition,
moral, manskap, materielkvot, terräng, försörjningsstress.

Enda tillägget: varje front har ett `attribution`-fält som registrerar vems materiel som faktiskt
användes i varje sammandrabbning. Det matar `THE WIRE` och gör att spelet kan säga "de 400 pjäser
du sålde i Q2 dödade uppskattningsvis 9 000 man i Q4" utan att moralisera.

Antal samtidiga fronter: **1 i etapp 1, max 4 i full kampanj.** v1:s sex var för många för att
spelaren skulle kunna hålla dem i huvudet.

---

## 11. Faktioner

Förenklat från v1:s 20+ fält till 9. Allt som inte påverkar ett spelarbeslut är borta.

```ts
interface Faction {
  id: string
  treasury: number
  militaryBudget: number          // det som faktiskt kan köpa av dig
  manpower: number
  publicSupport: 0-100            // faller med förluster → tvingar fram fred
  techLevel: Record<TechCategory, 0-10>
  alignment: -100..100            // öst ← → väst
  relationToPlayer: 0-100
  embargoed: boolean
}
```

Bankrutt faktion → pågående kontrakt annulleras, du förlorar intäkten. Det skapar det fina
beslutet: ibland tar du ett sämre pris bara för att hålla köparen solvent.

Antal aktiva köpare: **3 i etapp 1, 8–12 i full kampanj.**

---

## 12. Rivalhus

3 i etapp 1, 5–7 i full kampanj. Varje hus har specialisering, prisaggressivitet och en böjelse
(`opportunist` / `patriot` / `cautious`).

Rivaler gör tre saker som spelaren märker:
1. lägger anbud mot dig
2. binder leverantörskapacitet så dina linjer stannar
3. iscensätter egna incidenter, ibland attribuerade till dig

Punkt 3 är viktig: den gör världen aktiv utan att kräva att spelaren gör något, och den ger `THE
WIRE` material som inte är spelarens fel. Utan det blir spelet solipsistiskt.

---

## 13. Politiska operationer

`BRIBE` — köp viktning i ett anbud, en fördragsröst eller en inspektörs blick. Billigt, låg risk,
rör inte `DOOMSDAY`.

`STAGE INCIDENT` — det verb som låter dig *skapa* efterfrågan istället för att vänta på den.
Sjöräd, nedskjutning, hamnbombning, radiostörning. Parametrar: kostnad, måltavla,
attributionsmål, `success_chance`, `heat`-ökning, `DOOMSDAY`-ökning om supermaktsenhet är
inblandad. Misslyckad attribution pekar tillbaka på dig.

`FUND COUP` — **etapp 2.** Stor, sällsynt, dyr. Vid framgång: ny alignment, annullerade kontrakt
hos den gamla regimen, förköpsrätt i fem år. Vid misslyckande: förlorade pengar, larmad
kontraspionage, permanent skadad relation.

`BACK CHANNEL` — den enda handling som sänker `DOOMSDAY` mycket. Kostar en executive action och
stora pengar. Spelet måste göra det frestande att skjuta upp den.

---

## 14. Råvarumarknad

**Skjuts till etapp 2.** I etapp 1 finns råvara som en enda siffra: `supply_cost_index`, som rör
sig med globalt `heat` och multiplicerar dina **styckkostnader** (avsnitt 5.1). Det räcker för att
skapa kostnadstryck utan att bygga sex råvaruspår.

I etapp 2: olja, stål, uran, titan, sällsynta jordartsmetaller. Priser drivs av krigsefterfrågan,
embargon, sabotage och dina egna inköp.

---

## 15. Verklighet och fiktion

Ett beslut som är billigt nu och dyrt om två år.

- **Stater, krig, fördrag och årtal: verkliga.** Suez 1956, Kuba 1962, Tet 1968, Yom Kippur 1973, Afghanistan 1979. Det är ryggraden.
- **Vapenhus: fiktiva.** Inga Krupp, inga Vickers. Generera namn i samma register.
- **Tjänstemän, ministrar, generaler, inspektörer, agenter: fiktiva.** De är spelarens måltavlor.
- **Statschefer: verkliga men passiva.** De nämns i `THE WIRE`, de kan inte mutas eller mördas av spelaren.

Detta ger historisk tyngd utan att spelet blir en simulator för mord på namngivna personer, vilket
är både ett butiks- och ett omdömesproblem.

---

## 16. Scenarier istället för kampanj

1947–1991 med kvartalsturer är 176 turer. Det är en grindmaskin. Spelets variation ska komma från
att man startar om i ett nytt läge, inte från att man sitter i samma läge länge.

| Scenario | År | Turer | Startläge |
|---|---|---|---|
| `INDOCHINA_SLICE` | 1964–1969 | 20 | **Etapp 1.** Avkortad INDOCHINA med eget styrelsemål. Se nedan. |
| `SUEZ` | 1955–1958 | 14 | Litet hus, en stor kund, hela scenariot är en enda kris |
| `INDOCHINA` | 1964–1972 | 34 | Etablerat hus, två fronter, hög `heat`, låg `DOOMSDAY` |
| `OCTOBER` | 1971–1975 | 17 | Hög `DOOMSDAY` från start, oljechock, kort lunta |
| `WINDS` | 1958–1968 | 41 | Avkolonisering, tolv nya köpare, ingen aktiv front vid start |
| `THE LONG WAR` | 1947–1991 | 176 | Etapp 3. Låses upp när ett scenario klarats. |

`INDOCHINA_SLICE` är etapp 1:s vertikala skiva och är **ett eget scenario, inte de första 20
turerna av `INDOCHINA`**. Skillnaden gjordes explicit i v2.1 eftersom det fulla scenariot är 34
turer och därför har ett styrelsemål på 20 kvartal som inte går att pröva i en kortare körning.
Skivan har ett eget femårsmål (`"Doubling"`, tur 20) med prognoskontroller vid tur 8 och 14, en
front, tre köpare och tre rivaler.

---

## 17. Vinst, förlust, epilog

Det finns ingen "vinst" i betydelsen att man besegrar något. Ett scenario avslutas och betygsätts
längs fyra axlar:

```
CAPITAL      slutkassa + tillgångar
REACH        antal köpare och kontinenter
SHADOW       kupper, incidenter, lönnmord — hur mycket av världen som är ditt verk
RESTRAINT    DOOMSDAY-toppvärde under scenariot (lägre är bättre)
```

Epilogen är en slutrapport som väver ihop de fyra: "Huset överlevde. Världen nästan inte." Höga
`CAPITAL` och `SHADOW` med låg `RESTRAINT` ger ett annat slutkort än höga `CAPITAL` med hög
`RESTRAINT`.

Detta ersätter poängsumma. Spelaren ska jämföra sina egna körningar mot varandra, inte mot ett
tak.

---

## 18. UI

Fyra vyer, inga fler i etapp 1.

```
THE WIRE     startvyn varje tur. Nyheter med utfällbar kausalkedja.
THE FLOOR    orders, anbud, kontrakt, leveranser. Här spenderas mest tid.
THE HOUSE    produktionslinjer, R&D, kassa, kredit, styrelsemål, personal.
THE WORLD    fronter, faktioner, heat, DOOMSDAY, stationer.
```

Estetik: **lägesrummet under lampan** — mörk yta, telexgult för spelarens egna spår, monospace med
tabellsiffror för allt räknebart. Registret är fortfarande papper, skrivmaskin och telexremsa, men
utfört som ett spelgränssnitt: paneler, mätare och staplar där ett tal har en skala att läsas mot.
Sparsamma övergångar, aldrig dekorativ rörelse, alltid avstängda vid `prefers-reduced-motion`.
Ingen karta i etapp 1 — fronten visas som en linje med en position, vilket är allt simuleringen
faktiskt modellerar. Att rita en karta som är mer detaljerad än modellen är ett löfte spelet inte
kan hålla.

> Omprövat av ägaren efter P12 (se `docs/ANDRINGSLOGG.md`). Raden löd tidigare "papper,
> skrivmaskin, telexremsa. Monospace för siffror. Ingen animation." — P11/P12 byggdes ordagrant
> efter den och resultatet läste som ett dokument, inte som ett spel.

`THE HOUSE` ska visa **marginal per aktivt kontrakt**, inte bara kassa. Spelaren kan inte fatta
prisbeslut på en siffra som bara rör sig.

---

## 19. Teknisk arkitektur

```
Språk            TypeScript, strict
Kärna            headless simuleringspaket, noll DOM-beroenden
UI               React, PWA
Persistens       IndexedDB, hela speltillståndet som JSON
Speldata         JSON i core/src/data (scenarier, faktioner, hus, händelser, teknik)
Slump            seedad PRNG, seed sparas i saven
Test             turresolve-tester + snapshot av 20-turers körning med fast seed och fryst balansfil
Distribution     web först, Capacitor för iOS/Android senare
```

Tre regler som är viktigare än de ser ut:

1. **Kärnan får inte känna till UI.** `resolveTurn(state, submission) → { state, wire, rejected }`. Rent, deterministiskt, testbart.
2. **Seedad slump.** Utan det kan du inte reproducera en bugg och inte balansera. Med det kan du köra 500 automatiska partier över natten och titta på fördelningen.
3. **All balansdata i JSON, ingen i koden.** Du kommer att ändra siffrorna hundratals gånger. De ska inte kräva en kodändring — och därför får regressionstesterna inte läsa den fil du skruvar i. Se specens avsnitt 7.2.

---

## 20. Etappplan

**Etapp 1 — vertikal skiva. `INDOCHINA_SLICE`, 20 turer.**
1 front, 3 köpare, 3 rivalhus, 4 produktionslinjer, 1 underrättelsestation, anbudsspelet med
kostnadsmodell, `heat`, `DOOMSDAY` med fyra levande drivare, `restricted`-produkter, husets ekonomi
med kreditgräns och alla fyra förlustvillkor, styrelsens prognoskontroller, `THE WIRE`.
Ingen råvarumarknad, inga kupper, inga fördrag, inga karaktärer, ingen avkolonisering, ingen
`ASSASSINATE`.

Frågan som etapp 1 ska besvara: **är tjugo turer av bara detta spännande — och tvingar de fram
minst ett beslut där lönsamhet och överlevnad pekar åt olika håll?**

Andra ledet är nytt i v2.1 och är det som gör frågan besvarbar. I v2.0 var etapp 1 avgränsad så
att `DOOMSDAY` i praktiken inte kunde röra sig, vilket hade gjort skivan till ett test av
affärssimulatorn och inte av designpelare 1. Om svaret på första ledet är nej spelar resten av
dokumentet ingen roll. Om svaret på andra ledet är nej är det avgränsningen som är fel, inte
spelet.

**Etapp 2 — bredd.** Andra fronten, kupper, `ASSASSINATE`, råvarumarknad, `SUEZ` och `OCTOBER`.

**Etapp 3 — djup.** Karaktärer med relationer, fördragssystem, avkolonisering, `WINDS`, `THE LONG WAR`.

---

## 21. Medvetet bortskuret

Så att det inte smyger tillbaka in.

- Hexkarta och taktiskt lager
- Realtid
- Sex samtidiga fronter
- Separata agenter som huvudenhet i underrättelsesystemet
- Detaljerad diplomatisk fördragsmaskin i etapp 1
- Verkliga företagsnamn
- Lönnmord på verkliga personer
- Poängsumma och highscore
- Grafik utöver typografi
- Handlingstak på anbud (ersatt av kapacitetsknapphet, se avsnitt 4)
