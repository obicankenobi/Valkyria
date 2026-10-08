# Balanstalen sorterade (P147)

**Mätningen.** `npm run harness -- --sensitivity --policy human --runs 20` ändrar ETT balanstal i taget med ±25 % och mäter hur mycket `human`s vinstandel rör sig, på samma frön som utgångsläget (parade jämförelser).
554 tal × 2 riktningar × 20 partier, 2026-10-08, utgångsläge: `human` vinner 55 % på de 20 fröna. Rådata: `sensitivity-results.csv` (inte incheckad; kolumnerna beskrivs i `packages/harness/src/sensitivity.ts`).

**Sorteringen** (`packages/core/test/fixtures/balanceClasses.json`, bevakad av `balanceClasses.test.ts` — ett nytt tal måste sorteras):

- **Fastställda (12)** — rör `human` minst 20 procentenheter eller mer än 2 standardfel, och har avvägts i en loggrad (nämns i `docs/ANDRINGSLOGG.md`).
- **Öppna (11)** — rör och har inte avvägts, plus de nya historiktalen (P149, provisoriska tills P160). **Målet var färre än 30.**
- **Okänsliga (538)** — rörde inte mätbart. De fryses som de är; `PROVISORISKA tills …` i äldre noter som gäller dem är därmed avgjorda.

**Begränsning.** Med 20 partier per riktning ligger standardfelet på 7–14 procentenheter. Ett tal med en verklig men liten effekt (under ca 15 pp) kan därför ligga bland de okänsliga. Vill man vara säker: `--runs 100 --refine-top 30`.
Tre tal är exakt 0 och går inte att skala (`programmePerformanceMargin`, `officialRelationDecayFloor`, `maintenanceRestoreLow`) — det är naturliga nollor (en marginal på noll, ett golv på noll, inget underhåll återställer inget), inte avstängda mekaniker.

## Fastställda

| Tal | +25 % (pp) | −25 % (pp) | största (pp) | över 2 se |
|---|---|---|---|---|
| `orderDeliveryTurnsPerLineQuarter` | -5 | -55 | 55 | ja |
| `policyDecisionStandingThreshold` | +25 | -50 | 50 | ja |
| `blocTechLevelStep` | +0 | -45 | 45 | ja |
| `gradeCostFactor` | -40 | +30 | 40 | ja |
| `militaryBudgetQuarterlyShare` | +5 | -35 | 35 | ja |
| `fixedCosts` | +30 | -20 | 30 | ja |
| `orderTriggerThreshold` | -5 | -30 | 30 | nej |
| `blocGenerationSchedule` | -25 | -10 | 25 | nej |
| `destroyThreshold` | -10 | -25 | 25 | nej |
| `rivalDesignSchedule` | -25 | -15 | 25 | ja |
| `commodityIndexWeight` | +5 | -20 | 20 | nej |
| `supplyIndexMax` | +0 | -20 | 20 | nej |

## Öppna

| Tal | +25 % (pp) | −25 % (pp) | största (pp) | över 2 se |
|---|---|---|---|---|
| `deliveryDelayMaxTurns` | -55 | +5 | 55 | ja |
| `orderDeliverySlackTurns` | -5 | -55 | 55 | ja |
| `orderBiddingWindowTurns` | -45 | +0 | 45 | ja |
| `deliveryDelayMinTurns` | -30 | +10 | 30 | ja |
| `advanceUrgencyFullAt` | -5 | -25 | 25 | ja |
| `designBenchmarkBase` | +5 | -25 | 25 | ja |
| `rivalMarginAggressionScale` | -25 | -10 | 25 | ja |
| `designAmbition` | +0 | -20 | 20 | nej |
| `historyEffects` | – | – | – | (ny, ej mätt) |
| `historyEnabled` | – | – | – | (ny, ej mätt) |
| `historyThieuKyCourtedTurns` | – | – | – | (ny, ej mätt) |

De åtta mätta öppna talen styr huvudsakligen leveranstider och budfönster (`deliveryDelayMaxTurns`, `deliveryDelayMinTurns`, `orderDeliverySlackTurns`, `orderBiddingWindowTurns`), rivalernas marginal (`rivalMarginAggressionScale`), konstruktionernas riktmärke och ambition (`designBenchmarkBase`, `designAmbition`) och förskottets brådska (`advanceUrgencyFullAt`).
De är de tal ett kommande balanspass (P160) bör väga först. Att flytta något av dem ändrar golden.

## Etapp 9:s målrader (alla har ett öde)

Se `docs/ETAPP10_FORSLAG.md` §12 ("Utfall P147") för tabellen med utfall per rad: nådd, reviderad eller struken.
