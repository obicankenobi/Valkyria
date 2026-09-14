# Fryst balansfixtur

`balance.frozen.json` frystes i P22 (etapp 1,5:s sista prompt, efter balanspasset — se
ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3: "fryses sist i etappen ... en fixtur som fryses innan
balansen är klar hade dödat balanspasset"), som en bitvis kopia av `src/data/balance.json` i
det ögonblicket. Den uppdateras därefter bara som ett medvetet, separat beslut — aldrig som en
bieffekt av ett senare balanspass. `golden.test.ts`s första test jämför de två filerna bitvis
och failar tydligt om de glidit isär.
