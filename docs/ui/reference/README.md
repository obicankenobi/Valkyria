# Referensskisser — etapp 7

Godkända av ägaren 2026-09-22. Facit för **utseende och känsla**, inte kod att kopiera.

| Fil | Tillstånd |
|---|---|
| `operations-1-start.html` | OPERATIONS vid kvartalets start, teaterzoom |
| `operations-2-country-selected.html` | Land valt: regionzoom, landets akt som manillamapp |
| `operations-3-configure-action.html` | En handling konfigureras (`INFLUENCE`), formulär, tre nivåer, förhandsvisning |

## Så används de

- Öppna filerna i en webbläsare i 390 × 844 (telefon, stående). Typsnitten ligger i `fonts/` och laddas lokalt; ingen nätverkstrafik behövs.
- `npm run shots` renderar dem till PNG bredvid bygget (P73), så att varje UI-prompt kan jämföras mot dem.
- Bygg de riktiga skärmarna av komponenterna i designsystemet (`ETAPP7_TEKNISK_SPEC.md` §3, §10, §11.3), inte genom att klistra in markup härifrån. Skisserna är handritad SVG och inline-stil; produktionskoden ska vara React-komponenter som läser `GameState`.
- **Alla värden är exempel** (kassa, relation, nivåbelopp, orderantal). Namn på faktioner, förband, sektorer, rivaler och tjänstemän samt kostnaderna för underrättelseverben är hämtade ur repots data per commit `22a5ea2`.
- Kustlinjer och gränser i skisserna är grovt handritade. Den riktiga kartan byggs ur Natural Earth enligt §6.1.

## Vad som är bindande

Registret (§2J, §4): papperskarta, acetat och fettkrita, manillamappar, skrivmaskin, stämplar, Dymo, bakelit, visarinstrument, telexpapper. Typsnitten och färgerna (§10). Layouten för telefon (§5). Zoomnivåerna (§6.9). Ingen överlappande eller klippt text (§3 regel 18).

## Typsnitt

Archivo Narrow, Courier Prime, Stardos Stencil och Libre Baskerville, alla under SIL Open Font License (licenserna ligger i `fonts/`). Produktionskoden installerar dem via `@fontsource`.
