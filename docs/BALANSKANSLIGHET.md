# Balanskänslighet — vilka tal spelar roll? (P140)

Mätt 2026-10-02 med känslighetsverktyget (`node packages/harness/dist/index.js --sensitivity …`, ETAPP10_FORSLAG.md §5 punkt 4). Ett balanstal i
taget ändras med +25 % och −25 % (heltal från 4 och uppåt flyttas minst ett steg; små heltal under 4 skalas fritt eftersom de oftast är faktorer; tal
som heter `…Pct` hålls inom 0–100; tabeller och listor skalas som en helhet). Botten `human` spelar samma frön med och utan ändringen — **parade
jämförelser**, så skillnaden är talets verkan och inte slump. Inga tal i `balance.json` är ändrade och inga noter omskrivna; **sorteringen i
fastställda, okänsliga och öppna tal görs i P147.**

**Metod och räckvidd.** 454 poster (429 enskilda tal + 25 tabeller; tre tal som är exakt 0 kan inte skalas: `programmePerformanceMargin`,
`blocTechLevelStep`, `officialRelationDecayFloor`). Steg 1: 50 partier per riktning för alla 454. Steg 2: de 50 som rörde sig mest körs om med 200
partier per riktning (kolumnen *förfinad*). Rörelsen är i procentenheter vinstandel för `human`; *se* är det parade standardfelet; *sig* betyder
att rörelsen är mer än två standardfel. Den fullständiga tabellen (alla 454 rader, med verkligt använd förändring i procent) finns i
`docs/balanskanslighet-p140.csv`.

**Läs så här.**
- Ett tal med stor rörelse är **inte** fel inställt — det är ett tal där en inställning avgör partiet. Det är de talen P147 ska väga noga.
- Ett tal utan mätbar rörelse (de flesta av de 454) rör inte `human`s vinstandel med ±25 %. Det betyder inte att det är okänsligt för *alla* bottar
  eller för spelare som beter sig annorlunda — bara att det inte spelar roll för den här spelaren i det här scenariot.
- Heltalstal med små värden (t.ex. `orderBiddingWindowTurns`) ändras minst ett steg, vilket kan vara betydligt mer än 25 % — se `upAppliedPct` och
  `downAppliedPct` i CSV:n. Rörelsen där är en grov fingervisning om hur nära en gräns talet ligger.
- Basvinstandelen är 52 % på de 50 frön steg 1 använder och 60 % på de 200 fröna i steg 2 (olika frön, `human` är samma bot) — jämför bara rörelser
  inom samma steg.

## De 29 tal som rör `human`s vinstandel mest (förfinade, 200 partier per riktning)

| # | Balanstal | Typ | Δ vid +25 % | Δ vid −25 % | Störst rörelse (pp) | se | Kassa (±%) |
|---|---|---|---|---|---|---|---|
| 1 | `orderBiddingWindowTurns` | tal | -60.0 | +0.0 | 60.0 | 3.5 | 121 |
| 2 | `policyDecisionStandingThreshold` | tal | +20.0 | -56.0 | 56.0 | 3.5 | 61 |
| 3 | `deliveryDelayMinTurns` | tal | -46.5 | -11.0 | 46.5 | 3.8 | 64 |
| 4 | `gradeCostFactor` | tabell | -44.0 | -2.0 | 44.0 | 4.5 | 86 |
| 5 | `fixedCosts` | tabell | -42.5 | +20.5 | 42.5 | 3.7 | 99 |
| 6 | `bidWeightsDefault` | tabell | -20.0 | -42.5 | 42.5 | 4.6 | 71 |
| 7 | `heatPriceElasticity` | tal | +26.0 | -41.0 | 41.0 | 3.6 | 35 |
| 8 | `orderTriggerThreshold` | tabell | -40.5 | +23.0 | 40.5 | 4.4 | 44 |
| 9 | `commodityIndexWeight` | tabell | +15.0 | -39.5 | 39.5 | 4.0 | 38 |
| 10 | `peacetimeReplacement` | tabell | +16.5 | -35.5 | 35.5 | 4.2 | 38 |
| 11 | `frontBaseAttritionPct` | tal | +7.5 | -34.5 | 34.5 | 4.2 | 17 |
| 12 | `priceTermWeight` | tal | -12.5 | -34.0 | 34.0 | 4.5 | 61 |
| 13 | `equipmentAttritionCoupling` | tal | +9.5 | -32.5 | 32.5 | 4.2 | 17 |
| 14 | `blocPenaltyScale` | tal | -31.5 | +8.0 | 31.5 | 4.2 | 56 |
| 15 | `categoryVulnerability` | tabell | +11.0 | -31.5 | 31.5 | 4.2 | 15 |
| 16 | `designBenchmarkBase` | tal | -29.0 | +30.0 | 30.0 | 3.4 | 29 |
| 17 | `destroyThreshold` | tal | +28.0 | -4.0 | 28.0 | 3.8 | 34 |
| 18 | `gradePriceFactor` | tabell | -26.0 | -11.5 | 26.0 | 4.6 | 54 |
| 19 | `designFocus` | tabell | +24.0 | -17.0 | 24.0 | 3.3 | 7 |
| 20 | `designAmbition` | tabell | -22.0 | +11.5 | 22.0 | 4.1 | 27 |
| 21 | `trueBudgetMaxFactor` | tal | +4.0 | -22.0 | 22.0 | 3.2 | 16 |
| 22 | `deliveryDelayMaxTurns` | tal | -19.0 | +16.5 | 19.0 | 4.1 | 23 |
| 23 | `repTermReliabilityDivisor` | tal | -19.0 | +14.0 | 19.0 | 3.6 | 13 |
| 24 | `supplyIndexMax` | tal | +0.0 | -19.0 | 19.0 | 2.8 | 11 |
| 25 | `reliabilityOnTimeBonus` | tal | +9.5 | -16.5 | 16.5 | 3.5 | 17 |
| 26 | `rivalDesignSchedule` | tabell | -13.5 | +7.5 | 13.5 | 4.2 | 11 |
| 27 | `scarcityPriceDivisor` | tal | -7.0 | +13.0 | 13.0 | 2.9 | 12 |
| 28 | `frontEquipmentWeight` | tal | +3.5 | -12.0 | 12.0 | 4.2 | 11 |
| 29 | `weightPressureShift` | tal | +11.5 | -8.0 | 11.5 | 3.0 | 9 |

Av de 50 förfinade talen var 36 fortfarande tydligt över brusnivån med 200 partier; resten av de 454 (404 tal) rörde sig bara
på steg 1:s 50 partier, där en enda förändrad utgång ger 2 pp och standardfelet är 4–9 pp. 8 av dem var ändå över två standardfel på det
steget och bör förfinas i P147 om de hamnar i granskningen: `doomsdayCrisisEventThreshold`, `doomsdayNuclearExchangeThreshold`, `testingOverheadFactor`, `heatDecayActive`, `trueBudgetMinFactor`, `gradeScandalChance`, `heatEscalationDoomsdayMax`, `doctrineProfile`.

## Vad listan säger om etapp 10

- **Mekaniken som förväntades slå hårdast gör det.** Orderflödets timing och volym — `orderBiddingWindowTurns`, `orderTriggerThreshold`,
  `peacetimeReplacement`, `deliveryDelayMinTurns`/`MaxTurns` — och köparnas budvikter (`bidWeightsDefault`, `priceTermWeight`, `gradeCostFactor`,
  `gradePriceFactor`) står överst. Det är marknadens och krigets grundform, inte etapp 9:s tillägg.
- **Etapp 9:s egna tal ligger långt ner.** `designBidWeight` (rang 59, 7,5 pp), `designFocus`/`designAmbition` (rang 19–20) och
  `designBenchmarkBase` (rang 16) rör, men inget av kapplöpningens tal (`blocGenerationSchedule`, `requirementCardHorizon`,
  `rivalDesignSchedule` rang 26) når upp bland de tydligaste. Konstruktionerna bär alltså fortfarande en liten del av utfallet — samma sak som
  P129:s mått "intäkt från unga konstruktioner" (19 % mot målet 30–60 %) visade.
- **De fyra talen i §0.10–0.11 är nollade eller nedskruvade av en orsak** (`blocTechLevelStep` 0; `techMarginWeight`, `specialisationBidBonusPct`
  och `counterDemandOrders` på sina tak). `techMarginWeight` (rang 131, 2 pp), `counterDemandOrders` (rang 120, 2 pp) och `specialisationBidBonusPct` (rang 70, 6 pp) syns inte bland de 60 översta, och inget av dem rör `human` över brusnivån; se P141-mätningen i `docs/ANDRINGSLOGG.md` för vad
  `blocTechLevelStep` gör.
- **Fasta kostnader är en av de största spakarna** (`fixedCosts`, rang 5, −42,5 pp vid +25 %, och kassan flyttas ±99 %): spelets första
  kvartal är en kassaprövning, vilket stämmer med att `BUYOUT` är det vanliga utfallet för bottar som inte hushåller.
