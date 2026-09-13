# THE SEVENTH FRONT

Turbaserad kallakrigssimulator om ett privat vapenhus 1947–1991. Textbaserad, byggd som PWA.
Du säljer, läcker, embargerar, mutar och iscensätter. Du befaller aldrig en enda soldat.

Repot innehåller i nuläget **bara planeringsdokument**. Ingen kod är skriven än.

## Dokument

| Fil | Vad den är | Status |
|---|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designdokument v2.1 — vad spelet är, vilka pelare det vilar på, vad som är medvetet bortskuret | Levande |
| [`docs/ETAPP1_TEKNISK_SPEC.md`](docs/ETAPP1_TEKNISK_SPEC.md) | Teknisk spec för etapp 1 — datamodell, resolve-pipeline, anbudsalgoritm, testkrav, promptsekvens | Levande, fryst under P0–P12 |
| [`CLAUDE.md`](CLAUDE.md) | Hårda regler för kodsessioner i det här repot | Levande |

Läs `docs/DESIGN.md` först, `docs/ETAPP1_TEKNISK_SPEC.md` sedan. `CLAUDE.md` är operativ, inte
förklarande — den säger vad som är förbjudet, inte varför.

## Läget just nu

Etapp 1 är inte påbörjad. Nästa steg är **P0** i specens avsnitt 10.

Etapp 1 är en vertikal skiva: scenariot `INDOCHINA` avkortat till 20 turer, 1 front, 3 köpare,
3 rivalhus, 4 produktionslinjer, 1 underrättelsestation. Frågan skivan ska besvara står i
designdokumentets avsnitt 20 och är formulerad så att den faktiskt går att besvara med det som
byggs — inte med det som byggs i etapp 2.

## Språkkonvention

All prosa i dokumenten är på svenska. **All kod, alla identifierare, alla UI-strängar och all
speldata är på engelska** och ska användas ordagrant som de står i specen.
