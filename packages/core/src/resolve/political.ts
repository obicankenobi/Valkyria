// political — POLITICAL-handlingarna (BRIBE, STAGE_INCIDENT, BACK_CHANNEL,
// FUND_CAMPAIGN, FAVOUR). Utbruten ur applyActions.ts i P56 (ETAPP5_TEKNISK_SPEC.md
// avsnitt 5, "filen måste delas ... i den prompt som spränger den") — samma mönster
// som P23 bröt ut crisis.ts/upkeep.ts. STAGE_INCIDENT/BACK_CHANNEL-logiken är
// oförändrad, bara flyttad; BRIBE riktades om mot officialId (avsnitt 3.3); FUND_
// CAMPAIGN/FAVOUR är nya. applyPolitical är den enda funktionen som anropas utifrån
// (från applyActions.ts), samma "en export, ett anropsställe"-princip som
// resolvePendingCrisis.
import balanceData from '../data/balance.json' with { type: 'json' }
import { addDoomsday } from './doomsdayGate.js'
import type { ResolveContext } from './index.js'
import type { GameState, OfficialId, PlayerAction } from '../types.js'

interface Balance {
  bribeRelationCostPerPoint: number
  bribeRelationMaxPerTurn: number
  bribeLowIntegrityGainBonus: number
  bribeScandalRiskCostPerPoint: number
  fundCampaignStandingCostPerPoint: number
  favourRelationCostPerPoint: number
  stageIncidentSuccessPct: number
  stageIncidentHeatMin: number
  stageIncidentHeatMax: number
  stageIncidentDoomsdayMin: number
  stageIncidentDoomsdayMax: number
  backChannelDoomsdayMin: number
  backChannelDoomsdayMax: number
  misattributionExposurePenalty: number
}
const BALANCE = balanceData as unknown as Balance

// Flyttad ordagrant ur applyActions.ts (P56) — se den filens tidigare version i
// git-historiken för den oförändrade kommentaren.
function findTheatreForFaction(draft: GameState, factionId: string): GameState['theatres'][string] | null {
  const front = Object.values(draft.fronts).find((f) => f.sideA === factionId || f.sideB === factionId)
  if (!front) return null
  return draft.theatres[front.theatreId] ?? null
}

type PoliticalAction = Extract<PlayerAction, { type: 'POLITICAL' }>

export function applyPolitical(
  ctx: ResolveContext,
  action: PoliticalAction,
  bribeGainThisTurn: Map<OfficialId, number>,
): void {
  switch (action.op) {
    case 'STAGE_INCIDENT':
    case 'BACK_CHANNEL':
      applyFactionTargetedPolitical(ctx, action)
      return
    case 'BRIBE':
    case 'FUND_CAMPAIGN':
    case 'FAVOUR':
      applyOfficialTargetedPolitical(ctx, action, bribeGainThisTurn)
      return
  }
}

// STAGE_INCIDENT/BACK_CHANNEL — oförändrad logik sedan P18/P20, flyttad
// ordagrant hit ur applyActions.ts i P56. Rör ett LAND (targetFactionId), ingen
// person.
function applyFactionTargetedPolitical(
  ctx: ResolveContext,
  action: Extract<PoliticalAction, { op: 'STAGE_INCIDENT' | 'BACK_CHANNEL' }>,
): void {
  const { draft, rng, emit, rejected } = ctx
  const house = draft.house

  const target = draft.factions[action.targetFactionId]
  if (!target) {
    rejected.push({ action, reason: 'unknown target faction' })
    return
  }
  if (!Number.isFinite(action.spend) || action.spend < 0) {
    rejected.push({ action, reason: 'invalid spend amount' })
    return
  }

  if (action.op === 'STAGE_INCIDENT') {
    house.treasury -= action.spend
    const succeeded = rng.chance(BALANCE.stageIncidentSuccessPct)

    if (succeeded) {
      const theatre = findTheatreForFaction(draft, target.id)
      let headline = `INCIDENT STAGED AGAINST ${target.name.toUpperCase()}`
      if (theatre) {
        const before = theatre.heat
        theatre.heat = Math.min(100, theatre.heat + rng.int(BALANCE.stageIncidentHeatMin, BALANCE.stageIncidentHeatMax))
        headline = `INCIDENT STAGED AGAINST ${target.name.toUpperCase()} — ${theatre.name.toUpperCase()} HEAT ${before.toFixed(0)} → ${theatre.heat.toFixed(0)}`
      }
      const incidentId = emit({
        severity: 'headline',
        scope: 'faction',
        headline,
        causeId: null,
        delta: { treasury: -action.spend },
        actorIsPlayer: true,
        subjectId: target.id,
      })

      if (Math.abs(target.alignment) > 60) {
        const amount = rng.int(BALANCE.stageIncidentDoomsdayMin, BALANCE.stageIncidentDoomsdayMax)
        addDoomsday(ctx, amount, incidentId)
      }
    } else {
      // P29 (avsnitt 4.1): misslyckad attribution höjer en stations exposure —
      // den bränner INTE en station direkt och pushar INTE house.exposureEvents
      // (det är vad en FAKTISKT bränd station gör, se advanceStations/
      // resolveBackDown). EXPOSURE ska kräva tre brända stationer, inte tre
      // misslyckade attributioner.
      const attributionId = emit({
        severity: 'headline',
        scope: 'house',
        headline: `${house.name.toUpperCase()} LINKED TO INCIDENT AGAINST ${target.name.toUpperCase()} — ATTRIBUTION FAILED`,
        causeId: null,
        delta: { treasury: -action.spend },
        actorIsPlayer: true,
        subjectId: target.id,
      })

      const activeStations = house.stations.filter((s) => s.status === 'active')
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
    }
    return
  }

  // BACK_CHANNEL
  house.treasury -= action.spend
  const channelId = emit({
    severity: 'ticker',
    scope: 'faction',
    headline: `${house.name.toUpperCase()} OPENS A BACK CHANNEL WITH ${target.name.toUpperCase()} (−£${action.spend.toLocaleString('en-GB')})`,
    causeId: null,
    delta: { treasury: -action.spend },
    actorIsPlayer: true,
    subjectId: target.id,
  })
  const amount = rng.int(BALANCE.backChannelDoomsdayMin, BALANCE.backChannelDoomsdayMax)
  addDoomsday(ctx, -amount, channelId)
}

// BRIBE/FUND_CAMPAIGN/FAVOUR — samtliga tre tar officialId (skyddsräcke 3, se
// types.skyddsracke3.test.ts), aldrig ett FactionId ensamt.
function applyOfficialTargetedPolitical(
  ctx: ResolveContext,
  action: Extract<PoliticalAction, { op: 'BRIBE' | 'FUND_CAMPAIGN' | 'FAVOUR' }>,
  bribeGainThisTurn: Map<OfficialId, number>,
): void {
  const { draft, emit, rejected } = ctx
  const house = draft.house

  const official = draft.officials[action.officialId]
  if (!official) {
    rejected.push({ action, reason: 'unknown official' })
    return
  }

  if (action.op === 'FAVOUR') {
    if (!Number.isFinite(action.marginCost) || action.marginCost < 0) {
      rejected.push({ action, reason: 'invalid margin cost' })
      return
    }
    // P56 (avsnitt 3.3): "det enda verbet i spelet som inte kostar pengar" —
    // treasury rörs ALDRIG här. house.favourMarginSpent är den enda bokföringen
    // (types.ts:s egen kommentar) — kostnaden mäts i utebliven marginal, inte i
    // en post board.ts/economy.ts redan läser, så ingen av dem rörs.
    const gain = Math.min(action.marginCost / BALANCE.favourRelationCostPerPoint, 100 - official.relationToPlayer)
    official.relationToPlayer += gain
    house.favourMarginSpent += action.marginCost
    emit({
      severity: 'ticker',
      scope: 'faction',
      headline: `${house.name.toUpperCase()} DOES ${official.name.toUpperCase()} A FAVOUR (MARGIN COST £${action.marginCost.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { relationToPlayer: gain, favourMarginSpent: action.marginCost },
      actorIsPlayer: true,
      subjectId: official.factionId,
    })
    return
  }

  // BRIBE / FUND_CAMPAIGN — kostar treasury (spend).
  if (!Number.isFinite(action.spend) || action.spend < 0) {
    rejected.push({ action, reason: 'invalid spend amount' })
    return
  }

  if (action.op === 'FUND_CAMPAIGN') {
    house.treasury -= action.spend
    const gain = Math.min(action.spend / BALANCE.fundCampaignStandingCostPerPoint, 100 - official.standing)
    official.standing += gain
    emit({
      severity: 'ticker',
      scope: 'faction',
      headline: `${house.name.toUpperCase()} FUNDS ${official.name.toUpperCase()}'S CAMPAIGN (−£${action.spend.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { treasury: -action.spend, standing: gain },
      actorIsPlayer: true,
      subjectId: official.factionId,
    })
    return
  }

  // BRIBE. Taket (bribeRelationMaxPerTurn) är PER TJÄNSTEMAN nu, inte per
  // faktion (avsnitt 3.3, ordagrant) — bribeGainThisTurn nycklas på officialId.
  house.treasury -= action.spend
  const alreadyGained = bribeGainThisTurn.get(official.id) ?? 0
  const roomLeftThisTurn = Math.max(0, BALANCE.bribeRelationMaxPerTurn - alreadyGained)
  // "relationsvinsten skalas mot personens integrity (låg integritet -> mer för
  // pengarna)" — samma (1 - integrity/100)-term som computeScore:s bribeTerm,
  // se balance.json:s _p56_note.
  const integrityMultiplier = 1 + (1 - official.integrity / 100) * BALANCE.bribeLowIntegrityGainBonus
  const rawGain = (action.spend / BALANCE.bribeRelationCostPerPoint) * integrityMultiplier
  const gain = Math.min(rawGain, roomLeftThisTurn, 100 - official.relationToPlayer)
  official.relationToPlayer += gain
  bribeGainThisTurn.set(official.id, alreadyGained + gain)

  // "... och höjer hennes scandalRisk."
  const scandalGain = Math.min(action.spend / BALANCE.bribeScandalRiskCostPerPoint, 100 - official.scandalRisk)
  official.scandalRisk += scandalGain

  emit({
    severity: 'ticker',
    scope: 'faction',
    headline: `${house.name.toUpperCase()} CULTIVATES ${official.name.toUpperCase()} (−£${action.spend.toLocaleString('en-GB')})`,
    causeId: null,
    delta: { treasury: -action.spend, relationToPlayer: gain, scandalRisk: scandalGain },
    actorIsPlayer: true,
    subjectId: official.factionId,
  })
}
