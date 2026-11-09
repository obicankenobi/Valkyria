# Etapp 14 — "Krigsrumsbordet" (P201–P207)

**Status: antagen och BYGGD 2026-11-08** (ägarens order: "Bygg hälften av de punkter du kan göra självständigt nu, schemalägg de
resterande du klarar själv till att påbörjas 23:00 svensk tid"). Första halvan (P201–P203, punkt 1–6) byggd 2026-11-08 (commit
`5b76d62`); andra halvan (P204–P207, punkt 7–13) byggd samma natt av den schemalagda körningen.

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

## P204 — kartpjäser och synk mellan karta och mapp (punkt 7–8) — BYGGD 2026-11-08

- Orderbrickan vid en huvudstad är en pjäs: ett tryck öppnar CONTRACTS med just den köparens ordrar (`mapFocus.ts`: `OrdersFilter`,
  `ordersMatching`; filtret visas överst i mappen med SHOW ALL och släpps när spelaren lämnar CONTRACTS).
- Stationsnålen öppnar landsakten direkt (utan landsakt, i ett enhetstest, visar den stationens kort som förut).
- Ett förbands kort (och ett köparlands) har knappen *Replacement orders (n)* / *Open orders (n)* som öppnar CONTRACTS filtrerat.
- Mappen ber kartan visa ett föremål (`MapFocusContext`): ett verk utomlands har *SHOW ON MAP* i THE COMPANY; kartan panorerar dit
  (350 ms, direkt vid reducerad rörelse) och väljer verket.

## P205 — EXPAND FOLIO (punkt 9) — BYGGD 2026-11-08

- En bakelitknapp överst i CONTRACTS och THE COMPANY fäller ut mappen åt vänster över kartan (85 % av bredden; kartan står kvar
  monterad under, Outbox och kalendern där de är). Esc fäller tillbaka först; nästa Esc pausar som förut (regel 16 oförändrad).

## P206 — läsbara brickor, hoverkort och konvojer (punkt 10–11) — BYGGD 2026-11-08

- Brickorna i samma sektor låg ovanpå varandra (12 enheter mellan, brickan 25 bred) och den översta stal hovring och klick — nu
  28 × 34 enheter (`geoMath.ts`, test att grannar inte överlappar).
- Vid standardzoomen står en kort beteckning vid varje känt förband ("1st Inf Div", `shortDesignation`); namn och styrka i klartext
  som förut från zoomnivå 3. Okända förband får ingen etikett förrän nivå 3.
- Hovring visar förbandets kort: land, status, styrka, beredskap och utrustning ur `formationDisplay`; utan station bara status och
  styrkebandet ("No station: details unknown").
- Konvojlinjer för öppna ersättningsordrar (`orderConvoys`): en streckad blyertsbåge från teaterns ingångspunkt till förbandets
  sektor, etikett *WANTED · 80× 105MM FIELD GUN*, ett tryck öppnar förbandets ersättningsordrar. Spelarens leveranslinjer fick
  etiketten *YOU · 9 UNITS · ARRIVES Q3 1964* (ur `Shipment.arrivalTurn`). Etiketterna ingår i kollisionsdöljningen och regel 18:s test.

## P207 — uppspelningen i tre faser och 1920×1080 (punkt 12–13) — BYGGD 2026-11-08

- Kvartalsuppspelningen (P196:s kartdocka) spelar händelserna i tre faser — *1 · Convoys arrive*, *2 · The guns*, *3 · Telegrams*
  (`replayPhases.ts`: leveransrubrikerna, sedan `newsDepartment` = front, sedan resten) — med en fasremsa och en rubrik där varje fas
  börjar; kartans ring följer händelserna som förut.
- **Fynd:** rubriker från core innehåller kontraktets interna id (`CONTRACT contract-order-12 LATE …`). Core rörs inte; `cleanHeadline`
  byter id:t mot kontraktets löpnummer överallt där rubriker visas (NEWS DESK, telexremsan, uppspelningen, This Quarter).
- `e2e/screens.ts` `FORMATS` har 1920×1080 (`wide`): regel 11/18 och axe körs i båda formaten. `npm run shots` tar de viktigaste
  skärmarna även i 1920×1080 (`*-wide.png`).

## Ägarbeslut 2026-11-09 — de två öppna frågorna

**14A. Leveranslinjer för vunna kontrakt till rätt sektor.** Ägaren: "Du kan göra ett nytt fält i Core för detta även om du behöver
ändra golden." Byggt: `Contract.formationId?` (`types.ts`), ärvt av `Order.reason.formationId` när ordern ersätter ett förbands förluster
(`bidding.ts`); BROKER, krisköp och fredstida ersättning får inget. Ingen regel läser fältet. Kartan (`supplyLines.ts`) ritar en egen
linje per front och förband till sektorn där förbandet står nu — en omgruppering flyttar linjens slutpunkt; kartkortet säger "To: 1st
Infantry Division, Indochina front". **Golden-hasharna är oförändrade** (verifierat: hashen tar med hela tillståndet, men inget av de
skriptade golden-partierna vinner ett ersättningskontrakt), så ingen omfrysning behövdes. Test: `bidding.test.ts`, `convoys.test.ts`.

**14B. Kortkommandona.** Ägaren: "se över vilka keyboard shortcuts som behövs … och besluta själv". Beslut: en layout för en spelare med
höger hand på musen och vänster på tangenterna, allt inom räckhåll från 1–5. Regel 16 behålls och utökas; förslagets 1–4 för mappflikarna
byggs inte (registerflikarna inuti en mapp ligger på `[` `]` i stället, så 1–5 kan fortsätta betyda samma sak överallt).

| Tangent | Gör |
|---|---|
| 1–5 | Operations, Contracts, The Company, Contacts, News Desk |
| `[` `]` | föregående / nästa registerflik i den öppna mappen |
| F | fäll ut / fäll in mappen (Contracts, The Company) |
| Enter | avsluta kvartalet |
| Space | hoppa över kvartalsuppspelningen / kvittera styrelsens PM |
| Q / W / A | This Quarter / telexarkivet / handlingskatalogen |
| + − / 0 | zooma kartan (håll ned) / hela Indokina igen |
| L / K | nästa kartlager / teckenförklaringen |
| H / ? | handboken / tangentkartan (handboksuppslaget *Keyboard*) |
| Esc | stänger landsakten, sedan den utfällda mappen, sedan kartkortet; pausar först när inget av dem är öppet |

`shortcuts.ts` (beslutet, rent), `shortcutList.ts` (listan — handbokens uppslag skrivs ut ur den, testet binder dem), `App.tsx` (utförandet:
ett klick på den riktiga knappen; kartans zoom och lager via händelsen `MAP_COMMAND_EVENT`). Tester: `shortcuts.test.ts`, `keyboard.spec.ts`.
