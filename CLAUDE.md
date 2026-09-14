# THE SEVENTH FRONT

Turbaserad kallakrigssimulator. TypeScript, strict. Kärnan är headless och ren.

Designdokumentet är `docs/DESIGN.md`. Den tekniska specen för etapp 1 är
`docs/ETAPP1_TEKNISK_SPEC.md` (P0–P12, klar). Den aktiva specen är nu **etapp 1,5**,
`docs/ETAPP1_5_TEKNISK_SPEC.md` (P13–P22, antagen som ägarbeslut 2026-09-14) — den ersätter
etapp 1-specens avsnitt 7.3-måltabell men lämnar resten av etapp 1-specen stående som historik.
Bakgrunden till etapp 1,5 finns i `docs/RAPPORT1_GRANSKNING.md` (extern granskning) och
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
