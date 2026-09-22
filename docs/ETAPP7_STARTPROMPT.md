# Startprompt för etapp 7

Klistra in texten nedan i Claude Code-sessionen efter att filerna laddats upp och sessionen hämtat dem.

---

Etapp 7 är antagen av mig. Läs `docs/ETAPP7_TEKNISK_SPEC.md` i sin helhet och `docs/ui/reference/README.md`, och öppna de tre referensskisserna i `docs/ui/reference/`.

Gör sedan detta, i den här ordningen, och inget mer:

1. **Premisskontroll**, som i tidigare etapper: stäm av specens påståenden om koden (§0) mot hur koden ser ut nu. Om något inte stämmer, stanna och fråga mig innan du fortsätter.
2. **Logga ägarbesluten** A–J i specens §2 i `docs/ANDRINGSLOGG.md` med dagens datum, i samma form som tidigare ägarbeslut. Beslut F (förbandsförflyttning) loggas som uppskjutet till efter P75. Ändra specens statusrad till "Antagen" med dagens datum.
3. **Lägg in reglerna i specens §3** som ett eget avsnitt i `CLAUDE.md`.
4. **Kör P73** enligt §13. Referensskisserna är facit för utseendet, inte kod att kopiera: bygg komponenterna i designsystemet och jämför mot skisserna.
5. **Stanna efter P73.** Visa mig skärmbilderna från `npm run shots` bredvid referensbilderna och resultatet av testet för överlappande och klippt text. Börja inte P74 förrän jag sagt till.

En commit per steg.
