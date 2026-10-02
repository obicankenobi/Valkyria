# Samlat speltest (P139) — för ägaren

Det här ersätter de tre speltesten som är ogjorda: P95 (etapp 7), P105 (etapp 8) och P138 (etapp 9).
Ingen människa har spelat sedan P81. Du behöver inte kunna något om koden — spela och skriv ner vad du
tyckte. Mer detaljer finns i `docs/SPELTEST_ETAPP9.md`.

## Så här spelar du

Spela **tre partier på telefon** (390×844, installerad som helskärmsapp). Ett parti tar cirka 20 turer.

1. Ett hus som **ritar egna vapen och fuskar** (mutor, knep i upphandlingar).
2. Ett hus som **håller sig rent** (ritar, men ingen korruption, anmäl en rival).
3. Ett hus som **inte ritar alls** (bara säljer det som finns).

Skriv under spelets gång tre saker: *Vad försökte jag göra och hittade inte? Vad hände som jag inte
förstod? När tråkades jag?* Numrera dem 1, 2, 3 … — jag sorterar dem efter testet.

## Fråga att svara på, per etapp

- **Etapp 7:** ser det ut som ett spel inom fem sekunder, och går det att spela hela partiet med bara tummen?
- **Etapp 8:** kan du läsa dina pengar, och gör du val som kostar något (lägre pris mot bättre förskott)?
- **Etapp 9:** kan en egen konstruktion avgöra ett parti — och känns det rätt att fuska eller vara ren?

## Känn efter, skärm för skärm

| Skärm | Vad du tittar efter |
|---|---|
| **Start, nytt spel, genomgång** | Förstår du läget och styrelsens mål? Fungerar handledningen — nämner den ritbordet eller upphandlingar (det gör den inte än)? |
| **OPERATIONS (kartan)** | Går det att läsa kartan? Förstår du teckenförklaringen? Är något för litet att trycka på? Går det att trycka sig fram till varje handling med en tumme? |
| **Landsakten** (tryck på en huvudstad) | Hittar du spionverken och påverkansverken? Är det tydligt vad en nivå av belopp köper? |
| **CONTRACTS** | Förstår du förskotts- och kreditstämplarna? Gjorde du något val där du tog lägre pris för bättre förskott? Märker du gap-chockerna på kapplöpningstavlan — är ungefär nio per parti för många? Hittar du upphandlingsmappen, anmälan, prototypen och de sex knepen (LEGAL / GREY ZONE / PAPER TRAIL)? |
| **THE COMPANY** | Kan du efter tio turer peka ut kvartalet där det gick fel, och varför, utan att öppna nyheterna? Är sidan för lång (den har 13 paneler)? Är det begripligt vad inriktning och ambition köper på ritbordet? Känns "B ±1" på typbladet som information eller brus? Svarar du på utredningskortet inom tre turer, eller faller svaret oftast till "förneka"? |
| **CONTACTS** | Går det att skilja de sju politiska verben åt? Är rivalhusen intressanta, eller bara en lista? |
| **NEWS DESK och kvartalsuppspelningen** | Förstår du varför saker hände? Är blixtrubrikerna rätt saker? Händer det nog — eller för lite krig? |
| **Paus, inställningar, Handbok** | Hittar du ljud av/på, sparplatser och Handboken? Räcker uppslagen om ritbord och upphandlingar? |
| **Epilogen** | Berättar slutet partiets historia? Kändes en vapenvila du själv orsakat som en förlust? |

## Bara på en riktig telefon (går inte att mäta härifrån)

- Går panorering och zoom på kartan mjukt (mål 60 bilder per sekund)?
- Hur låter spelet? Bara titelmusiken och ett nyhetsljud finns; övriga effekter saknas än.
- Skärmläsare och teckenstorlek.

## Besluten du ska kvittera (samtidigt med speltestet)

Det här är tre saker kodsessionen avgjorde själv i etapp 9, fast specen sa att det var ditt val
(premiss 0.21). Svara ja, nej eller "ändra" på varje:

1. **Golden frystes om i P130** på kodsessionens eget beslut. Golden är den fasta kontrollsumman som
   bevisar att spelet räknar likadant varje gång. Är det okej att den fick bytas då? *(Beslut 10B)*
2. **Del F byggdes i etapp 9** (exportregler, civil linje, specialprojekt, chefskonstruktörer, licenser,
   kundanpassning) i stället för att bli en egen etapp. Är det okej att den fanns med? *(Beslut 10B)*
3. **Tidsschemat för blockens teknikgenerationer** (P118) är kodsessionens förslag och blev aldrig
   godkänt av dig. Det ger cirka 9,7 gap-chocker per parti mot målet 1–3. Ska det ses över i P142? *(Beslut 10B)*
4. **Sju av fjorton målrader i etapp 9 är inte nådda eller mätta.** Varje rad ska få ett av tre öden i
   P147: *nådd*, *reviderad med skäl* eller *struken tillsammans med sin mekanik*. Ingen får lämnas
   öppen. Du behöver inte välja nu — men säg om du redan vet att en rad inte spelar någon roll. *(Beslut 10C)*

## Efteråt

Skicka dina numrerade punkter. De sorteras som efter P81: placerade i en prompt i 10A, i 10B eller utanför
etappen. Speltestet får ändra ordningen i etapp 10:s §5–§8 — det är meningen.
