# THE SEVENTH FRONT

Turbaserad kallakrigssimulator. TypeScript, strict. Kärnan är headless och ren.

Designdokumentet är `docs/DESIGN.md`. Den tekniska specen för etapp 1 är
`docs/ETAPP1_TEKNISK_SPEC.md` (P0–P12, klar). Etapp 1,5, `docs/ETAPP1_5_TEKNISK_SPEC.md`
(P13–P22), är också klar. Etapp 2, "Motståndet", `docs/ETAPP2_TEKNISK_SPEC.md` (P23–P32), är
ÄVEN DEN klar — se avsnitt 6.3:s blockquote för balanspassets fulla facit (fem av åtta
fetstilta rader nådda, tre strukturellt reviderade). Den aktiva specen är nu **etapp 3, "Kriget
som marknad"**, `docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` (P43–P52, antagen som
ägarbeslut 2026-09-15, validerad mot commit `e650be2`) — den ersätter `orderGenerationChancePct`s
tärningsdrivna ordergenerering med en behovsdriven modell kopplad till materielförluster på
fronten, i två halvor: 3A (förbrukning, P43–P47, rör INTE balansen förrän P47) och 3B (namngivna
förband, `Formation`, P48–P52). Se specens egna avsnitt 0–1 för de fyra mätta fynd den bygger på.
Etapp 1, 1,5 och 2 lämnas stående som historik. **Känd lucka, upptäckt vid antagandet (se
`docs/ANDRINGSLOGG.md`, 2026-09-15): specens avsnitt 5.5 och skyddsräcke 1/3 (etapp 3B) refererar
upprepade gånger till en "THE_WORLD-spec" med `deriveDeployment`, `MovementArrow`, `sectorId` och
ett INTEL-lager som om de redan finns — sökt igenom hela repot, noll träffar. Blockerar INTE
P43–P47 (3A rör ingen av dessa) — men BLOCKERADE P51, som verifierat gjorde antagandet sant
igen (2026-09-15): fortsatt noll träffar, och `packages/app/src/components/TheWorld.tsx` (den
enda lägesvyn) har inget lägesbord, ingen `sectorId`-utgruppering, inget INTEL-lager. Ägaren
tillfrågad; valde att hoppa över P51 i stället för att skriva en egen THE_WORLD-tillsatsspec.
**P51 är alltså OBYGGD, inte klarmarkerad** — kvarstår som öppen punkt tills någon skriver den
saknade specen, eller skriver om 5.5/skyddsräcke 1&3, eller ett uttryckligt ägarbeslut stryker
P51 helt.** **Ytterligare känd spänning, upptäckt under P47 (se
`docs/ANDRINGSLOGG.md`, 2026-09-15): styrelsegranskningens linjära intäktsmål (`board.ts`, P30,
etapp 2) och P45:s behovsdrivna ordrar går inte längre ihop — 200/200 `balanced`-partier slutar
i `BUYOUT`, i snitt vid tur ~11. Ägaren tillfrågad två gånger, valde att lämna `boardTarget`
(`indochina-slice.json`) orört; en riktig fix är en egen omkalibrering, inte gjord här.** Se
avsnitt 8:s P47-blockquote i `docs/ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md` för hela fyndet.
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
