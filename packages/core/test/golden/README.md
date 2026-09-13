# Golden-tester

Snapshot-tester med fast seed som spelar ett helt scriptat parti (`playScript`) och hashar
sluttillståndet. Se ETAPP1_TEKNISK_SPEC.md avsnitt 7.2.

**Läser `golden/fixtures/balance.frozen.json`, aldrig `src/data/balance.json`.** Det är den fil
P10:s balanspass skruvar i, och ett brutet snapshot ska alltid betyda "en regel ändrades" —
aldrig "en siffra justerades". Se CLAUDE.md.

Byggs i P2 (skelett) och P4–P8 (allteftersom respektive steg finns att spela mot).
