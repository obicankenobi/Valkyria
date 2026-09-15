// rivals — rivalhusens drag utanför anbudsgivning. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 10 (P8-instruktionen), DESIGN.md avsnitt 12 och (P26) ETAPP2_TEKNISK_
// SPEC.md avsnitt 2.4/2.5.
//
// P8-instruktionen och DESIGN.md avsnitt 12 nämner tre saker rivaler gör: (1) lägger
// bud (redan byggt — bidding.ts, P4, computeRivalBid), (2) binder leverantörskapacitet
// så spelarens linjer stannar, (3) iscensätter egna incidenter, ibland attribuerade
// till spelaren. P8 lämnade (2)/(3) UTTRYCKLIGEN OBYGGDA — se den historiska
// motiveringen i ANDRINGSLOGG.md. P26 bygger båda, enligt avsnitt 2.4:
//
// "Rivalhusen växer om du är passiv. Marknadsandel är ett nollsummespel."
// (DESIGN.md avsnitt 12, P8). En spelare som varken lägger några bud eller
// använder några handlingar den här turen räknas som passiv; varje rivalhus växer då
// något i capital och marketShare. PROVISORISK formel (rivalPassiveGrowthCapital/
// -MarketShare) — specen ger ingen tillväxttakt. Ingen sann nollsummeinvariant
// hålls (House har inget marketShare-fält att dra ifrån), så "nollsummespel" är
// bara den narrativa motiveringen här, inte en bokförd sådan.
//
// (2) Leverantörskapacitet (avsnitt 2.4): en opportunist-rival med kapital över
// rivalSupplyPlayCapitalFloor kan en gång per rivalSupplyPlayCooldownTurns höja
// market.supplyCostIndex och tappa rivalSupplyPlayCost i capital. TILL SKILLNAD
// FRÅN passiv tillväxt är detta INTE villkorat av spelarens passivitet — en rival
// som binder kapacitet gör det oavsett vad spelaren gör den turen, annars vore
// det ingen "motståndare i kostnadsledet" (avsnitt 2.4:s egen motivering), bara
// ännu en bestraffning för att stå still.
//
// (3) Egna incidenter (avsnitt 2.4): en patriot-rival kan iscensätta en incident
// enligt SAMMA mekanik som spelarens STAGE_INCIDENT (stageIncidentSuccessPct,
// stageIncidentHeatMin/Max, stageIncidentDoomsdayMin/Max — applyActions.ts,
// återanvända här, inte en ny, egen skala). Ingen frekvens namnges (spelarens
// motsvarighet självbegränsas av actionPoints, en rival har inga) — ny,
// PROVISORISK rivalIncidentAttemptChancePct, kalibrerad mot orderGenerationChancePct
// (samma sorts "dice roll per tur"-fält). Misslyckad attribution pekar med
// rivalIncidentMisattributionPct sannolikhet på SPELAREN i stället för rivalen —
// då höjs en slumpvald AKTIV stations exposure med misattributionExposurePenalty
// (P29, avsnitt 4.1 — INTE house.exposureEvents.push direkt, samma korrigering
// som STAGE_INCIDENT-misattribution fick i samma prompt, se ANDRINGSLOGG.md).
//
// (2.5) sabotagedUntilTurn: dött sedan P1. Avsnitt 2.5 kopplar det uttryckligen
// till "en misslyckad egen incident" (utöver etapp 3:s ännu obyggda SABOTAGE) —
// den enda konkreta kopplingen tillgänglig i den här etappen. En rival vars
// incident misslyckas (oavsett vem som får skulden) blir sabotagedUntilTurn i
// rivalSabotageCooldownTurns (PROVISORISK, kalibrerad mot qualityScandalTurns —
// samma sorts "tillfälligt nedsatt" varaktighet). Effekten ("lägger inga bud och
// levererar inte", avsnitt 2.5 ordagrant) läses i bidding.ts/deliveries.ts. Se
// docs/ANDRINGSLOGG.md för den fulla motiveringen till den här tolkningen.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { addDoomsday } from '../doomsdayGate.js'
import type { ResolveStep } from '../index.js'
import type { FactionId, GameState, RivalHouse } from '../../types.js'

interface Balance {
  rivalPassiveGrowthCapital: number
  rivalPassiveGrowthMarketShare: number
  rivalSupplyPlayCapitalFloor: number
  rivalSupplyPlayCooldownTurns: number
  rivalSupplyPlayIndexPenalty: number
  rivalSupplyPlayCost: number
  supplyIndexMin: number
  supplyIndexMax: number
  rivalIncidentAttemptChancePct: number
  rivalIncidentMisattributionPct: number
  rivalSabotageCooldownTurns: number
  stageIncidentSuccessPct: number
  stageIncidentHeatMin: number
  stageIncidentHeatMax: number
  stageIncidentDoomsdayMin: number
  stageIncidentDoomsdayMax: number
  misattributionExposurePenalty: number
}
const BALANCE = balanceData as unknown as Balance

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isSabotaged(rival: RivalHouse, turn: number): boolean {
  return rival.sabotagedUntilTurn !== null && turn < rival.sabotagedUntilTurn
}

// Samma logik som applyActions.ts:s egen (privata) findTheatreForFaction —
// duplicerad här hellre än exporterad, av samma skäl som pricing.ts:s
// findLargestBuyerInTheatre: en enda extra konsument motiverar inte att bredda
// en annan fils publika yta.
//
// KÄND, FLAGGAD LUCKA sedan P44 — samma "första matchande front"-brist som
// applyActions.ts:s kopia (se den filens kommentar för hela resonemanget och
// varför den medvetet lämnas). Styr här vilken teater en rivals supply play
// träffar när en faktion står på två fronter.
function findTheatreForFaction(draft: GameState, factionId: FactionId): GameState['theatres'][string] | null {
  const front = Object.values(draft.fronts).find((f) => f.sideA === factionId || f.sideB === factionId)
  if (!front) return null
  return draft.theatres[front.theatreId] ?? null
}

export const rivals: ResolveStep = (ctx) => {
  const { draft, submission, rng, emit } = ctx

  // (1) Passiv tillväxt — bara när spelaren är helt passiv, se filens huvudkommentar.
  const playerIsPassive = submission.actions.length === 0 && submission.bids.length === 0
  if (playerIsPassive) {
    for (const rival of Object.values(draft.rivals)) {
      rival.capital += BALANCE.rivalPassiveGrowthCapital
      rival.marketShare = Math.min(100, rival.marketShare + BALANCE.rivalPassiveGrowthMarketShare)

      emit({
        severity: 'ticker',
        scope: 'market',
        headline: `${rival.name.toUpperCase()} EXPANDS WHILE THE MARKET GOES UNCONTESTED`,
        causeId: null,
        delta: { capital: BALANCE.rivalPassiveGrowthCapital, marketShare: BALANCE.rivalPassiveGrowthMarketShare },
        actorIsPlayer: false,
        subjectId: rival.id,
      })
    }
  }

  // (2)/(3) körs OAVSETT spelarens passivitet — se filens huvudkommentar.
  for (const rival of Object.values(draft.rivals)) {
    if (isSabotaged(rival, draft.meta.turn)) continue

    if (
      rival.temperament === 'opportunist' &&
      rival.capital > BALANCE.rivalSupplyPlayCapitalFloor &&
      (rival.supplyPlayCooldownUntilTurn === null || draft.meta.turn >= rival.supplyPlayCooldownUntilTurn)
    ) {
      const before = draft.market.supplyCostIndex
      draft.market.supplyCostIndex = clamp(before + BALANCE.rivalSupplyPlayIndexPenalty, BALANCE.supplyIndexMin, BALANCE.supplyIndexMax)
      rival.capital -= BALANCE.rivalSupplyPlayCost
      rival.supplyPlayCooldownUntilTurn = draft.meta.turn + BALANCE.rivalSupplyPlayCooldownTurns

      emit({
        severity: 'headline',
        scope: 'market',
        headline: `${rival.name.toUpperCase()} PLAYS THE SUPPLY MARKET — COST INDEX ${before.toFixed(0)} → ${draft.market.supplyCostIndex.toFixed(0)}`,
        causeId: null,
        delta: { supplyCostIndex: draft.market.supplyCostIndex - before, capital: -BALANCE.rivalSupplyPlayCost },
        actorIsPlayer: false,
        subjectId: rival.id,
      })
    }

    if (rival.temperament === 'patriot' && rng.chance(BALANCE.rivalIncidentAttemptChancePct)) {
      const factions = Object.values(draft.factions)
      if (factions.length === 0) continue
      const target = rng.pick(factions)
      const succeeded = rng.chance(BALANCE.stageIncidentSuccessPct)

      if (succeeded) {
        const theatre = findTheatreForFaction(draft, target.id)
        let headline = `${rival.name.toUpperCase()} STAGES AN INCIDENT AGAINST ${target.name.toUpperCase()}`
        if (theatre) {
          const heatBefore = theatre.heat
          theatre.heat = Math.min(100, theatre.heat + rng.int(BALANCE.stageIncidentHeatMin, BALANCE.stageIncidentHeatMax))
          headline = `${rival.name.toUpperCase()} STAGES AN INCIDENT AGAINST ${target.name.toUpperCase()} — ${theatre.name.toUpperCase()} HEAT ${heatBefore.toFixed(0)} → ${theatre.heat.toFixed(0)}`
        }
        const incidentId = emit({
          severity: 'headline',
          scope: 'faction',
          headline,
          causeId: null,
          delta: {},
          actorIsPlayer: false,
          subjectId: target.id,
        })

        if (Math.abs(target.alignment) > 60) {
          const amount = rng.int(BALANCE.stageIncidentDoomsdayMin, BALANCE.stageIncidentDoomsdayMax)
          addDoomsday(ctx, amount, incidentId)
        }
      } else {
        // Avsnitt 2.5: en misslyckad egen incident sabotagerar rivalen SJÄLV,
        // oavsett vem attributionen till sist pekar på.
        rival.sabotagedUntilTurn = draft.meta.turn + BALANCE.rivalSabotageCooldownTurns

        if (rng.chance(BALANCE.rivalIncidentMisattributionPct)) {
          // P29 (avsnitt 4.1): samma korrigering som STAGE_INCIDENT — misslyckad
          // attribution höjer en stations exposure, pushar INTE
          // house.exposureEvents direkt (det är bara vad en FAKTISKT bränd
          // station gör).
          const attributionId = emit({
            severity: 'headline',
            scope: 'house',
            headline: `${draft.house.name.toUpperCase()} LINKED TO ${rival.name.toUpperCase()}'S BOTCHED INCIDENT AGAINST ${target.name.toUpperCase()} — ATTRIBUTION FAILED`,
            causeId: null,
            delta: {},
            actorIsPlayer: false,
            subjectId: target.id,
          })

          const activeStations = draft.house.stations.filter((s) => s.status === 'active')
          if (activeStations.length > 0) {
            const station = rng.pick(activeStations)
            const before = station.exposure
            station.exposure = Math.min(100, before + BALANCE.misattributionExposurePenalty)
            emit({
              severity: 'ticker',
              scope: 'house',
              headline: `STATION ${station.city.toUpperCase()} EXPOSURE RISES — ${before.toFixed(0)} → ${station.exposure.toFixed(0)}`,
              causeId: attributionId,
              delta: { exposure: station.exposure - before },
              actorIsPlayer: false,
              subjectId: station.nation,
            })
          }
        } else {
          emit({
            severity: 'ticker',
            scope: 'faction',
            headline: `${rival.name.toUpperCase()}'S INCIDENT AGAINST ${target.name.toUpperCase()} IS TRACED BACK TO THEM`,
            causeId: null,
            delta: {},
            actorIsPlayer: false,
            subjectId: rival.id,
          })
        }
      }
    }
  }
}
