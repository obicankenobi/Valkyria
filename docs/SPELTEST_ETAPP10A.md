# Speltest av 10A (P148) — checklista för ägaren

P148 är ett speltest utan kod. Det kan inte göras av en kodsession: frågan är om slipningen i 10A (P141–P147) gjorde spelet begripligare och mer levande, och det avgörs av någon som spelar.
Det här dokumentet är det en kodsession kan leverera i stället: vad som ändrats sedan förra speltestet, vad härnessen visar, och vad du behöver känna efter själv.
Det ersätter inte att spela. (Skrivet 2026-10-08 efter P141–P147 och P149; P149 hör egentligen till 10B men ingår här eftersom den är det du ser först: förstasidor och telex.)

## Hur du spelar

Tre partier på telefon (390×844, installerad som helskärms-PWA):

1. **Ett parti som följer handledningen** — gör de tre sena stegen (rita en konstruktion, anmäl dig till en upphandling, svara på ett kort) när de dyker upp runt tur 3–12.
2. **Ett parti som fuskar** — knepen i upphandlingsmappen, muta nämnden, juridisk rådgivare. Se vad som kommer fram, och vad ett utredningskort kostar.
3. **Ett parti som håller sig rent** och anmäler rivalernas fusk när du har en station i köparens land.

## Vad som är nytt sedan förra speltestet

- **Kapplöpningens takt (P142).** Blocken stiger parvis, så gap-chocker kommer 2–3 gånger per parti i stället för tio. Att sälja till båda sidor lägger +10 på doomsday och rubriken namnger huset.
- **Fusket får verklig risk (P143).** Ungefär en tredjedel av spåren kommer fram under ett parti. En anmälan av en rival lyckas om rivalen faktiskt mutat nämnden, och med en station i landet ser du vilka som gjort det.
- **Konstruktionerna bär mer (P144).** En ny konstruktion drar mer uppmärksamhet och åldras fortare; en dold brist ger en olycksfågel i ungefär var tionde parti.
- **Handledning, handbok och PM (P146).** Tre sena handledningssteg, två nya handboksuppslag (*The Arms Race*, *The Paper Trail*), tre nya PM. Kapplöpningstavlan visar motmedelskedjan och vem som är först på plats; ordermappen visar vad köparen väger (med station); typbladet visar först på plats och måttstock; landmappens LEAK-väljare kan plantera ett rykte om ett block.
- **Förstasidor och telex (P149).** Elva verkliga förstasidor (Laoskuppen, Kinas atombomb, Rolling Thunder, Saigon-generalerna, …) och 23 telexrader, med verkligt datum och källa. Förstasidan visas som en tidningssida i kvartalsuppspelningen och överst på NEWS DESK, telexen under avdelningen *World*. Prologen (fem förstasidor 1961–63) står i genomgången, efterordet (Ussuri, My Lai) och en tidslinje i epilogen.

## Det härnessen visar

Se `docs/ETAPP10_FORSLAG.md` §7 (utfallsblocken för P142–P144), `docs/ANDRINGSLOGG.md` (en rad per prompt) och `docs/BALANSTAL_10A.md` (P147: vilka tal som spelar roll).

| Rad | Mål | Nu | Läsning |
|---|---|---|---|
| Gap-chocker per parti | 1–3 | 2,7 | nådd |
| Andel spår som kommer fram | 30–60 % | ca 32 % | nådd |
| `human-clean` / `human-dirty`, vinst | båda ≥ 35 % | 64 / 57 | nådd |
| Intäkt från unga konstruktioner | 30–60 % | 22 % för `human` (31–37 för tre varianter) | delvis |
| Olycksfåglar | 10–25 % av partierna | 7 % (`human`), 17–32 % (varianterna) | delvis |
| Först på plats i botspel | förekommer | 0–7 % | **inte nådd** — rivalernas konstruktioner kommer före husets |
| Hävda kontrakt | förekommer | ca 0,03 per parti | sant men svagt |
| `human`, `SCENARIO_COMPLETE` | 40–70 % | 59 % (efter historiens steg och tröskeln 9,5) | nådd |

## Det du behöver känna efter

1. **Handledningen.** Dyker de tre sena stegen upp när det går att göra dem? Är texten tydlig, eller i vägen?
2. **Kapplöpningstavlan.** Förstår du kedjan ("armour pulls infantry …") och vad ett gap betyder för priset? Märker du en gap-chock?
3. **Utredningskort.** Är det tydligt vad ett pappersspårs kort kostar i de tre svaren? Känns ett förnekande som en frestelse eller som en fälla?
4. **Anmälan.** Hittar du fram till att anmäla en rival, och förstår du varför bara vissa kan anmälas?
5. **Konstruktionerna.** Känns det som att en egen konstruktion lönar sig? Märker du en olycksfågel — och vad gör du?
6. **Förstasidorna.** Är de ett nöje eller ett avbrott? Är datumen och texterna rätt ton? (Tonen i texterna är ett omdömesbeslut — se spec §16 punkt 4.)
7. **Telexraderna.** Syns de under *World* utan att dränka resten av NEWS DESK?
8. **Prologen och efterordet.** Passar prologen i genomgången? Är efterordet om My Lai rätt sagt — det står rakt ut att det hände under partiet.
9. **Tidslinjen** i epilogen: ger den något, eller är den bara en lista?

## Kända luckor att ha med dig

- **De åtta besluten** (Tonkinbukten, TSR-2, Starfighter, Sexdagarskriget, M16, Pentagon, Tet, Paris) är inte byggda — de kommer i P150, och vapenvilan mot spelarens vilja i P151. Förstasidor och telex är byggda; beslutskorten saknas.
- **Några förstasidor har bara text, ingen mekanisk effekt** (Indisk-pakistanska kriget, forskaruppropet) — spelet saknar de krokar effekten kräver.
- **Först på plats** nås inte av botarna; mekaniken är byggd och testad.
- **`passive`, `capacity` och `aggressive`** vinner inte; `capacity` är en referensmätare (ägarbeslut 2026-09-30).
- **Kassadalen** kvartal 5–8 finns kvar (P141).
- **Ljudeffekter och porträtt/händelsebilder** saknas fortfarande (P93, P92).

## Beslut som behövs från ägaren

- **Först på plats:** ska raden strykas, eller ska rivalernas konstruktionstidtabell (`rivalDesignSchedule`) skjutas så att huset hinner före? En senare tidtabell prövades och kostade `human` ca 6 procentenheter utan att öppna fönstret för de andra botarna.
- **Hävda kontrakt:** en riktig åtgärd är en regel (fler spår kopplas till ett kontrakt, eller ett avslöjat spår kan häva en redan levererad order).
- **Tonen i händelsetexterna** (spec §16 punkt 4), särskilt My Lai-efterordet.
- **P149:s effekter** är provisoriska (`historyEffects` i `balance.json`) tills balanspasset P160.
