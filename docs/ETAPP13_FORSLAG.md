# Etapp 13 — "Mappflikarna" (P199–P200)

**Status: antagen 2026-10-17** (ägarens order: "Bygg förslagen 13-3 och 13-5 som etapp 13"). Byggd samma dag.
Underlaget är ägarens speltest 2026-10-17, `docs/SPELTEST_2026-10-17.md`: punkt 12 (menyerna smälter ihop, svårt att hitta
underkategorin) och punkt 17 (stödsystemet otydligt). Ren gränssnittsetapp: `packages/core` får bara läsande exporter, golden är
orörd, inga balanstal ändras.

Förslagen 13-1 (lönnmord som chans, spaning och utpressning), 13-2 (en djupare forskning) och 13-4 (motmedelskedjans plats) ingår
inte och väntar fortfarande på ägaren.

## Beslut

- **13B.** Varje lång mapp får registerflikar överst (en gemensam komponent, `FolderTabs`); en flik visar bara sin del av mappen.
- **13C.** Folkligt stöd visas som en mätare per land med gränsen där landet tvingas söka fred, och varnas för innan det händer.
  Gränsen och antalet kvartal läses ur `balance.json` (`DISPLAY_THRESHOLDS.lowSupportThreshold`/`lowSupportTurns`), samma tal som
  `factions.ts` dömer efter. Hur nära gränsen ett land får komma innan This Quarter varnar (`SUPPORT_NEAR_MARGIN`, 5) är appens egen,
  provisoriska siffra.

## P199 — registerflikarna (förslag 13-3)

- `FolderTabs.tsx`: flikar med `role="tab"`, piltangenterna flyttar, ett tal på fliken (antal) och en röd markering för det som väntar.
  Flikraden står kvar överst när mappen scrollas.
- **CONTRACTS:** *Orders* (öppna ordrar och aktiva kontrakt, standard) · *Tenders* (utvecklingsupphandlingarna) · *Arms race*
  (kapplöpningstavlan och motmedelskedjan).
- **CONTACTS:** en flik per land (tjänstemännen och landets handlingar) och *Rival houses*. Mappen öppnar på det land landsakten
  eller en rad i This Quarter pekar på; annars på det första.
- **THE COMPANY:** de fyra lådorna använder samma komponent (oförändrade testid:n); *Legal* är röd när ett utredningskort väntar på svar.

**Klart när:** ingen av de tre mapparna visar mer än en del åt gången; landsakten och This Quarter öppnar CONTACTS på rätt land;
regel 11/18 och axe gröna på de nya skärmarna (`contacts-laos`, `contacts-rivals`).

## P200 — stödmätaren (förslag 13-5)

- `supportOutlook.ts` (ren): stöd, gräns, kvartal i rad under gränsen, kvartal kvar till fred, om landet är i krig.
- **CONTACTS:** överst i varje lands flik en mätare *Public support* med gränsen markerad och en mening om läget; landets flik är röd
  när stödet ligger under gränsen och freden ännu inte kommit.
- **Kartans POL-lager:** under gränsen står `support 22 ▼ 1/3` (kvartal under gränsen av de som tvingar fram fred).
- **This Quarter:** en rad för ett land i krig vars stöd ligger under gränsen ("peace in 2 quarters unless it rises") eller nära den;
  raden öppnar landets flik i CONTACTS.

**Klart när:** talen kommer ur `DISPLAY_THRESHOLDS`, inte ur appen; varningen syns i alla tre lägen i ett test med ett land under gränsen.
