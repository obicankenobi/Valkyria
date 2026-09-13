# Ändringslogg — design och spec

En rad per beslutad ändring i `docs/DESIGN.md` eller `docs/ETAPP1_TEKNISK_SPEC.md`. Byggs
framåtriktat. **Ändra aldrig en gammal rad** — ett omprövat beslut får en ny.

Loggen finns för att planen är avsiktligt flexibel. Flexibilitet utan spår blir drift, och drift
är det som gör att ingen längre vet vilken version av reglerna som faktiskt gäller.

Regeln: en ändrad spec utan rad här är samma sak som ingen ändring.

| Datum | Dokument | Ändring | Varför |
|---|---|---|---|
| 2026-09-13 | DESIGN v2.0 → v2.1, SPEC v1.0 → v1.1 | Styckkostnad och COGS införda; `supplyCostIndex` verkar på kostnad i stället för pris | `grade C` var strikt sämre än A och spelaren hade ingen marginal att räkna på |
| 2026-09-13 | DESIGN, SPEC | `QUOTE` kostar inte längre en executive action; knappheten flyttad till produktionskapacitet och `reliability` | Anbud var enda intäktskällan, så alla tre handlingar gick åt till att bjuda och turvalet var redan fattat |
| 2026-09-13 | SPEC | `referencePrice` fryses när ordern skapas | Räknades tidigare om i `bidding`, efter att `heat` hunnit röra sig i samma tur — spelaren bjöd mot ett tal som flyttade sig |
| 2026-09-13 | SPEC | `trueBudget` diskvalificerar bud över taket | Fältet var oanvänt, vilket gjorde `statedBudget`-lögnen betydelselös |
| 2026-09-13 | DESIGN, SPEC | `creditLimit` införd, `TAKE_LOAN` prövas mot tak | `INSOLVENCY` var trivialt undvikbar genom att låna vidare i all oändlighet |
| 2026-09-13 | DESIGN, SPEC | Styrelsens prognoskontroller vid tur 8 och 14; `BUYOUT` vid två underkända i rad | `BUYOUT` kunde annars bara inträffa på scenariots sista tur, så passivitet kändes aldrig under tiden |
| 2026-09-13 | DESIGN, SPEC | `heat` omkalibrerad; avsvalning bara turer utan leverans in i aktiv konflikt | Design och spec angav olika regel, och specens konstanter krävde 200 enheter per tur bara för att stå stilla |
| 2026-09-13 | DESIGN, SPEC | `restricted`-produkter med `doomsdayOnDelivery` införda i etapp 1 | Etapp 1 saknade varje `DOOMSDAY`-drivare utom iscensatta incidenter och kunde alltså inte pröva designpelare 1 |
| 2026-09-13 | SPEC | Wire-beskärning behåller orsakskedjor; invarianttest tillagt | En kedja som tar slut mitt i ser ut som att spelet döljer något |
| 2026-09-13 | SPEC | Golden-testet läser `balance.frozen.json` i stället för den levande balansfilen | P10 skruvar `balance.json` hundratals gånger medan `CLAUDE.md` kräver stopp vid brutet snapshot — kraven hade dödat varandra |
| 2026-09-13 | SPEC | P4:s acceptanstest utbytt mot fyra icke-triviala krav | Det gamla ("vinstchansen monoton i pris") följer av formelns konstruktion och kunde inte misslyckas |
| 2026-09-13 | DESIGN, SPEC | `INDOCHINA_SLICE` är ett eget 20-turersscenario, inte en avkortning av `INDOCHINA` (34 turer) | Det fulla scenariots femårsmål går inte att pröva i en kortare körning |
| 2026-09-13 | DESIGN, SPEC | `ASSASSINATE` uttryckligen flyttad till etapp 2 | Fanns i designdokumentet men saknades i `IntelOp` — otydligheten hade byggts av misstag |
| 2026-09-13 | SPEC | Invarianttester för penningavrundning och orderlivslängd tillagda | `Money` säger "hela £" men ränta producerar flyttal; en nygenererad order kunde avgöras samma tur den föddes |
| 2026-09-13 | SPEC | `bidEstimate` returnerar `winBand` (pris → vinstsannolikhet) och `yourUnitCost` | En exakt rivalprissiffra avgör ändå inte anbudet och ser ut som ett facit utan att vara det |
