# Fryst balansfixtur

`balance.frozen.json` frystes ursprungligen i P22 (etapp 1,5:s sista prompt, efter
balanspasset — se ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3: "fryses sist i etappen ... en fixtur
som fryses innan balansen är klar hade dödat balanspasset"), som en bitvis kopia av
`src/data/balance.json` i det ögonblicket. Omfryst i P32 (etapp 2:s sista prompt, samma
motivering — se ETAPP2_TEKNISK_SPEC.md avsnitt 9), efter att P24–P31 ändrat `balance.json`
upprepade gånger under tiden (golden-testet pendat under de prompterna, se
`docs/ANDRINGSLOGG.md`). Den uppdateras bara som ett medvetet, separat beslut — aldrig som en
bieffekt av ett balanspass i sig. `golden.test.ts`s första test jämför de två filerna bitvis
och failar tydligt om de glidit isär.
