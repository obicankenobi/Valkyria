# Etapp 14 — "Krigsrumsbordet" (P201–P207)

**Status: antagen 2026-11-08** (ägarens order: "Bygg hälften av de punkter du kan göra självständigt nu, schemalägg de resterande
du klarar själv till att påbörjas 23:00 svensk tid"). **Första halvan (P201–P203, punkt 1–6) byggd 2026-11-08. Andra halvan
(P204–P207, punkt 7–13) schemalagd till 2026-11-08 kl. 23:00.**

Underlaget är ägarens förslag "Etapp 12 — Krigsrumsbordet (PC)" (2026-11-04, skrivet mot koden efter P191). Förslaget hade inte sett
att etapp 12 "Krigsrummet" (P192–P198) och etapp 13 (P199–P200) redan var byggda: kartan avmonteras inte längre, Outbox och telexet
syns alltid, och kartan har brickor och fettkritsfrontlinje. Prompt- och beslutsnumren krockade därför och är bytta: etappen heter 14,
promptarna P201–P207. De delar som redan var byggda (förslagets del A och beslut 12A–12D) är strukna. Kvar står de punkter en
kodsession kan göra utan ägarbeslut, i den ordning de byggs.

Ren gränssnittsetapp: `packages/core` och golden orörda, inga balanstal ändras. Regel 16 (1–5 byter skärm) behålls; förslagets 1–4
för mappflikarna byggs inte utan ägarens beslut.

## Premisskontroll (förslagets §0 mot HEAD `a328a89`)

| # | Förslagets premiss | Läge |
|---|---|---|
| 0.1–0.4 | 220 px flikspalt, kartan avmonteras, docka och telex saknas | Redan lösta i etapp 12 (P193) |
| 0.5 | Vyboxen 600×800 och `fitSize` mot hela kartfilen | Stämde — **P201** |
| 0.6 | Landsakten är en `BottomSheet` | Stämde delvis (sedan P193 i mappen, men med draghandtag och med kartkortet kvar bredvid) — **P203** |
| 0.7 | Frontlinjen en cirkel, kartografi saknas | Frontlinjen redan fettkrita (P194); gradnät, kompass, skalstock och tryckta namn saknades — **P201** |
| 0.8 | Förbanden 10×10 px | Delvis (`WargameChit` sedan P194) — **P206** |
| 0.9 | Leveranslinjer till teaterns snitt, orderbrickor inte klickbara | Stämmer — **P204, P206** |
| 0.10 | Råa ID:n (`FRONT-1`, `PolicyDecision`, deltataggar), ingen orsak eller tjänsteman i ordermappen | Stämde — **P202** |
| 0.11 | Hopp till `news` efter uppspelningen | Stämde — **P202** (uppspelningen själv är redan en kartdocka, P196) |

## Utanför etappen — kräver ägarbeslut

- **Konvojer för vunna kontrakt till rätt sektor.** `Contract` saknar `sectorId` och `orderId`; att lägga till ett fält ändrar golden.
  P206 ritar sektorlinjer bara för öppna ordrar (förbandets sektor ur `Order.reason`).
- **Siffertangenterna 1–4 för mappflikarna** krockar med regel 16.
- Inget slagnamn hittas på i ordermappens orsak (10J, DESIGN.md §15): orsaken är förbandets namn och drabbningens kvartal.

## P201 — kartan på en bred skärm (punkt 1–2) — BYGGD 2026-11-08

- `mapFrame.ts` (ren): vyboxens bredd följer kartytans proportion (`viewWidthFor`, höjden fast 800), projektionen anpassas till
  Indokina (`FOCUS_BOUNDS`, 100–109,6°E, 8,4–22,6°N) i stället för till hela kartfilen. Svg:n beskär (`slice`) när kartkortet krymper
  kartan, så projektionen flyttar sig inte.
- Kartfilen (`scripts/build-geo.mjs`) breddad till 91–118°E, 3–26°N med Burma och Malaysia som sammanhang, så att utsnittet aldrig
  visar hav där det är land. DMZ-linjen har fasta ändpunkter (98–107°E, som förut).
- Kartografi: gradnät var annan grad, tryckta land- och havsnamn (Libre Baskerville, dämpat bläck), stämpeln **NO RECONNAISSANCE** över
  ett köparland utan underrättelse, kompassros och skalstock (km och nautiska mil, räknas om vid zoom). Namnen ingår i kartans
  kollisionsdöljning och prövas av regel 18:s kollisionstest; de ritas sist och offras först. Kartuschen placeras geografiskt.

**Klart när:** kartan fyller kartytan i 1440×900 och 1920×1080 utan tomma kanter; regel 18 grön på kartans tre zoomnivåer.

## P202 — namn i stället för ID:n, orsak i ordermappen, inget hopp till NEWS DESK (punkt 3–5) — BYGGD 2026-11-08

- `displayNames.ts` (ren): frontens namn ("Indochina front"), sektorns, kvartalet ("Q3 1965" i stället för "T07"), agendan i ord,
  orderns orsak ur `Order.reason` och handläggaren ur `order.officialId`, telexets deltarader i ord — interna räknare (materielbehov,
  utrustning per sida, kapplöpningens räknare, historikens nycklar) döljs.
- Ordermappen: plats (front · sektor), orsak och "Handled by …, procurement chief · relation n/100". Kontraktstabellen: löpnummer och
  frontnamn. CONTACTS: "cabinet decree" i stället för `PolicyDecision`. NEWS DESK: "Background: n reports" i stället för "cause ×n".
- `App.tsx`: spelaren stannar där hen var efter kvartalsuppspelningen — utom när en kris väntar: kriskortet bor på NEWS DESK och kräver
  ett svar, så då öppnas den (upptäckt av `play-20-turns.spec.ts`, som annars aldrig såg krisen).

**Klart när:** `test/displayNames.test.tsx` spelar åtta kvartal, renderar NEWS DESK, CONTRACTS och CONTACTS och fäller varje ID ur state
och varje fältnamn som syns.

## P203 — landsakten i mappen (punkt 6) — BYGGD 2026-11-08

- `CountryFile` är en akt i mappen (inget bottenark, inget draghandtag) med registerflikarna *Intelligence* (station, hemliga och
  politiska handlingar, som förut), *Cabinet* (landets tjänstemän och stödmätare — samma innehåll som CONTACTS-fliken,
  `ThePolitics onlyFaction`) och *Orders* (landets öppna ordrar och husets kontrakt, med en väg till CONTRACTS).
- Kartkortet stängs när akten öppnas, så att kartan får tillbaka sin höjd.

**Klart när:** landsakten öppnas från kartan utan bottenark, de tre flikarna fungerar och regel 11/18 och axe är gröna på landsaktens skärmar.

## P204–P207 — andra halvan (punkt 7–13), schemalagd 2026-11-08 23:00

- **P204 (punkt 7–8):** klickbara orderbrickor och stationsnålar vid huvudstäderna (öppnar CONTRACTS filtrerat på landet respektive
  landsakten); kopplingen karta↔mapp åt båda hållen (förband → dess ersättningsordrar, verk utomlands → kartan panorerar dit).
- **P205 (punkt 9):** EXPAND FOLIO för tomtplanen, ritbordet och kapplöpningstavlan; Esc fäller tillbaka.
- **P206 (punkt 10–11):** brickor läsbara vid standardzoom och hoverkort med de fält som finns (styrka, beredskap, utrustning, status;
  dolda utan station); konvojlinjer för öppna ordrar till förbandets sektor, med etiketter.
- **P207 (punkt 12–13):** kvartalsuppspelningen i tre faser på kartan (leveranser, strid och frontflytt, politik och nya ordrar), byggd
  på P196; `npm run shots` och e2e även i 1920×1080.
