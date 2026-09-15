# THE SEVENTH FRONT

Turbaserad kallakrigssimulator. TypeScript, strict. Kärnan är headless och ren.

Designdokumentet är `docs/DESIGN.md`. Den tekniska specen för etapp 1 är
`docs/ETAPP1_TEKNISK_SPEC.md` (P0–P12, klar). Etapp 1,5, `docs/ETAPP1_5_TEKNISK_SPEC.md`
(P13–P22), är också klar. Etapp 2, "Motståndet", `docs/ETAPP2_TEKNISK_SPEC.md` (P23–P32), är
ÄVEN DEN klar — se avsnitt 6.3:s blockquote för balanspassets fulla facit (fem av åtta
fetstilta rader nådda, tre strukturellt reviderade). Etapp 3, "Kriget som marknad",
`docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` (P33–P42, antagen som ägarbeslut 2026-09-15,
validerad mot commit `e650be2`) är **KLAR — alla tio prompter (P33–P42) kördes klart samma
datum.** Den ersätter `orderGenerationChancePct`s tärningsdrivna ordergenerering med en
behovsdriven modell kopplad till materielförluster på fronten, i två halvor: 3A (förbrukning,
P33–P37) och 3B (namngivna förband, `Formation`, P38–P42). Se specens egna avsnitt 0–1 för de
fyra mätta fynd den bygger på, och avsnitt 8:s måltabell/blockquotes för balanspassens fulla
facit (P37 för 3A, P42 för 3B). Etapp 4, "Två krig, en kassabok",
`docs/ETAPP4_TEKNISK_SPEC.md` (P43–P52, antagen som ägarbeslut 2026-09-15, validerad mot
commit `42bb924`) är den **aktiva** specen — ingen prompt körd än. Den bygger vidare på 3B:s
förband i två oberoende halvor: 4A (en andra front, ny teater `LAOS`, P43–P47) och 4B
(råvarumarknaden — fem spor i stället för en enda `supplyCostIndex`-siffra, P48–P52). Se
specens avsnitt 1 för de fem premisskontrollerade fynd den bygger på (bl.a. att
`computePressureForFront` har samma "tar första matchande front"-brist som `deliveries.ts`s
`findFrontForBuyer` redan hade, och att `supplyCostIndex` kan bli ett härlett aggregat av de
fem råvarorna utan att röra `computeReferencePrice`). Avsnitt 10 protokollför de tre besluten
som togs vid antagandet: `DESIGN.md` avsnitt 16 uppdateras i samma commit som P45 (den raden
beskriver `INDOCHINA_SLICE` som enfronts, vilket P45 upphäver); `boardTarget`/`BUYOUT`-
kaskaden (se nästa stycke) lämnas orörd, med "löser andra fronten den?" som en mätbar rad i
P47:s måltabell snarare än ett antagande; namnet var "Två krig, en verkstad" i förslaget.
Etapp 1, 1,5, 2 och 3 lämnas stående som historik. **Känd lucka, upptäckt
vid antagandet (se `docs/ANDRINGSLOGG.md`, 2026-09-15): specens avsnitt 5.5 och skyddsräcke 1/3
(etapp 3B) refererade upprepade gånger till en "THE_WORLD-spec" med `deriveDeployment`,
`MovementArrow`, `sectorId` och ett INTEL-lager som om de redan fanns — sökt igenom hela repot,
noll träffar. Blockerade INTE P33–P37 (3A rör ingen av dessa) — men BLOCKERADE P41 först
(2026-09-15): fortsatt noll träffar, och `TheWorld.tsx` hade inget lägesbord. Ägaren tillfrågad
en första gång; valde att hoppa över P41. Tillfrågad en andra gång, samma datum: valde att
skriva `THE_WORLD`-spec-innehållet i efterhand (nu specens eget avsnitt 5.5.1) i stället för att
lämna P41 olyst. **P41 är nu BYGGD** — `sectorId`-utgruppering och INTEL-dimning (`queries.ts`s
`formationDisplay`, delar `effectiveDepth` med `bidEstimate`) finns i `TheWorld.tsx`;
`MovementArrow` finns och är testad men körs ännu inte mot riktig `SUPPLY_ARRIVAL`-data (skulle
kräva att röra `WireEvent.delta`, en del av golden-hashen — ägaren tillfrågad, valde att inte
göra den ändringen nu) eller `REDEPLOY`-data (ingen mekanik i simuleringen flyttar ett förbands
sektor alls). Se avsnitt 5.5.1 i specen och `docs/ANDRINGSLOGG.md` för hela resonemanget.**
**Ytterligare känd spänning, upptäckt under P37 (se
`docs/ANDRINGSLOGG.md`, 2026-09-15): styrelsegranskningens linjära intäktsmål (`board.ts`, P30,
etapp 2) och P35:s behovsdrivna ordrar går inte längre ihop — 200/200 `balanced`-partier slutar
i `BUYOUT`, i snitt vid tur ~11. Ägaren tillfrågad två gånger, valde att lämna `boardTarget`
(`indochina-slice.json`) orört; en riktig fix är en egen omkalibrering, inte gjord här.** Se
avsnitt 8:s P37-blockquote i `docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` för hela fyndet.
Bakgrunden till etapp 2 finns i dess egna avsnitt 0/1; den
ärver etapp 1,5:s egen bakgrund i `docs/RAPPORT1_GRANSKNING.md` (extern granskning) och
`docs/RAPPORT2_LANGSIKTIG_PLAN.md` (långsiktig plan). **Läs den promptens avsnitt i den spec som
gäller innan du börjar** — den är skriven för att följas ordagrant, inte för att tolkas.

## Hårda regler

1. `packages/core` får aldrig importera react, DOM, `Date`, `Math.random`, `crypto`, `fs` eller `console`.
2. All slump går via `createRng(seed, cursor)`. Ingen annan slumpkälla finns. `queries.ts` drar aldrig ur den — härledda värden som behöver slump hashar `seed + id`.
3. `resolveTurn(state, submission)` är ren: samma indata ger bitvis identisk utdata. Indata muteras aldrig.
4. Varje state-ändring i ett resolve-steg måste emitta minst en `WireEvent`, med `causeId` när det finns en känd orsak. Tyst state-ändring är en bugg.
5. Alla balanssiffror ligger i `core/src/data/balance.json`. Inga magiska tal i kod.
6. Ogiltiga spelarhandlingar returneras i `result.rejected`. `resolveTurn` kastar aldrig.
7. Stegordningen i `resolve/index.ts` är spelregler. Ändra den aldrig utan att jag ber om det.
8. Allt penningräknande går genom `money.ts`. Inga decimaler i `Money`-fält.
9. `state.doomsday` skrivs bara av `doomsdayGate.ts`. Alla andra steg anropar `addDoomsday`.
10. Kostnad och pris är två skilda tal. `baseCost` är vad köparen förväntas betala, `unitCost` är vad det kostar dig att bygga. Blanda dem aldrig.

## Arbetssätt

- En uppgift i taget. Rör inte moduler som uppgiften inte nämner.
- Skriv testet före implementationen.
- Kör `npm test` innan du säger att du är klar.
- Om golden-snapshotet ändras: **stanna och fråga.** Uppdatera det aldrig själv. Snapshotet läser en fryst balansfil, så ett brott betyder alltid att en regel ändrats — aldrig att en siffra skruvats.
- Föreslå aldrig nya features. Specen är fryst för den prompt du kör.

## Om specen och verkligheten inte stämmer

Planen får ändras under utvecklingen — men inte tyst, och inte av en kodsession på eget initiativ.

Om du under bygget upptäcker att specen är omöjlig, motsäger sig själv, eller bygger på ett
antagande som inte håller: **stanna, beskriv vad som inte stämmer, och föreslå ändringen.** Bygg
inte runt problemet och skriv inte om specen själv.

När en ändring beslutas skrivs den in i specen **och** som en rad i `docs/ANDRINGSLOGG.md`, i
samma commit som koden. En ändrad spec utan loggrad är samma sak som ingen ändring.
