# Invarianttester

Tre tester som inte hör till något enskilt steg, se ETAPP1_TEKNISK_SPEC.md avsnitt 7.4:

- `money.test.ts` — inget `Money`-fält har decimaler efter 20 turer. Byggs i P1.
- `wire-chains.test.ts` — inget `causeId` pekar på en händelse som saknas i `state.wire`. Byggs i P2.
- `order-lifetime.test.ts` — ingen order har `expiresTurn` <= sin skapelsetur. Byggs i P4.
