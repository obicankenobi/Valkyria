# Golden-tester

Snapshot-tester med fast seed som spelar ett helt scriptat parti (`playScript`, mot en av
`@seventh-front/harness`s tre ursprungliga botpolicyer) och hashar sluttillståndet
(`hashState`). Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3. Byggt i P22, den sista prompten i
etapp 1,5 — se `golden.test.ts` för de tre policyerna/seedarna/hasharna och
`docs/ANDRINGSLOGG.md` för varför just tre (inte alla fyra) botpolicyer.

**Skyddet mot att ett balanspass tyst spelar mot fel tal** är inte en balansfil-injektion
(`resolveTurn` importerar `src/data/balance.json` statiskt i varje steg, inte via ett
konfigobjekt — se `playScript.ts`s egen kommentar för varför det aldrig byggdes om). I
stället failar `golden.test.ts` HÖGT, innan ett enda parti spelas, om
`fixtures/balance.frozen.json` någonsin skiljer sig bitvis från `src/data/balance.json`.
Effekten är densamma: ett brutet snapshot ska alltid betyda "en regel ändrades" — aldrig "en
siffra justerades utan att frysa om". Se CLAUDE.md.
