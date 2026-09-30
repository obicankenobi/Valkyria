// previewAction — P78 (ETAPP7_TEKNISK_SPEC.md §7.4), ordagrant:
// "previewAction(state, action): ActionPreview ... visar bara vad spelaren
// kan veta: kostnad, intervall ur balansfilen, sannolikheter där
// underrättelsen räcker. Motståndarens counterIntelligence utan station
// visas som Unknown."
//
// P78 byggde en första version med bara `cost`/`successPct`/`successPctKnown`
// (de två fält som gäller FLEST av de 22 verben) — ett balansintervall PER
// VERB (t.ex. STAGE_INCIDENTs heat-spann) sköts UTTRYCKLIGEN upp: "P79 avgör
// vilka verb som behöver mer, i stället för att den detaljen uppfinns utan en
// konsument." P79 är den konsumenten: `effect` (types.ts) ger INFLUENCE en
// beräknad före/efter-siffra, referensskissens "PUBLIC SUPPORT 52 → ~67"
// (operations-3-configure-action.html) — det enda verbet som faktiskt bygger
// mot en godkänd skiss i den här prompten. Övriga verb får `effect: null`
// oförändrat; nästa verb som behöver mer än cost/successPct/effect avgörs av
// SIN egen prompt, samma "ingen detalj utan konsument"-princip.
//
// Ren funktion, samma "en formel, en källa"-princip som bidEstimate: alla
// formler ÅTERANVÄNDS från applyActions.ts/political.ts (exporterade
// därifrån i P78/P79) i stället för handkopierade — en duplicerad formel
// hade varit exakt den tysta driftrisk ANDRINGSLOGG.md 2026-09-13 redan
// varnar för (bidEstimate/bidding.ts).
import balanceData from './data/balance.json' with { type: 'json' }
import { effectiveDepth } from './queries.js'
import { intelOpSuccessPct } from './resolve/steps/applyActions.js'
import { computeInfluenceAfter, findTheatreForFaction, frontOpponentOf, fundCoupSuccessPct } from './resolve/political.js'
import { assassinateReductionFactor, backChannelGain, stageIncidentHeatScale } from './spendCurves.js'
import { capturedSystem, reverseEngineerTurns } from './capture.js'
import { fieldTrialBatch } from './design.js'
import { crashProgrammeCost } from './research.js'
import { isRepayPayload, isRndPayload } from './validateAction.js'
import type { ActionPreview, GameState, Money, PlayerAction, Pct } from './types.js'

interface Balance {
  reverseEngineerCost: number
  headStartCap: number
  fieldTrialUncertaintySteps: number
  buildLineCost: number
  hireCost: number
  intelExpandCost: number
  intelRecruitCost: number
  intelCovertOpCost: number
  stageIncidentSuccessPct: number
  stageIncidentHeatMin: number
  stageIncidentHeatMax: number
  assassinateCounterIntelligenceGain: number
}
const BALANCE = balanceData as unknown as Balance

function finiteOrNull(value: number): Money | null {
  return Number.isFinite(value) ? value : null
}

function preview(
  cost: Money | null,
  successPct: Pct | null,
  successPctKnown = true,
  effect: ActionPreview['effect'] = null,
): ActionPreview {
  return { cost, successPct, successPctKnown, effect }
}

export function previewAction(state: Readonly<GameState>, action: PlayerAction): ActionPreview {
  switch (action.type) {
    case 'CRISIS':
      return preview(null, null)

    case 'INTERNAL':
      switch (action.op) {
        case 'TAKE_LOAN':
          // Ett lån är ett inflöde, ingen kostnad att förhandsvisa.
          return preview(null, null)
        case 'REPAY':
          return preview(isRepayPayload(action.payload) ? action.payload.amount : null, null)
        case 'BUILD_LINE':
          return preview(BALANCE.buildLineCost, null)
        case 'HIRE':
          return preview(BALANCE.hireCost, null)
        case 'REVERSE_ENGINEER': {
          // P116: studiens kostnad och försprångets före → efter i kategorins bank (turer, aldrig över headStartCap).
          const systemId = (action.payload as { systemId?: unknown }).systemId
          const entry = typeof systemId === 'string' ? capturedSystem(state.house, systemId) : undefined
          if (!entry) return preview(null, null)
          const before = state.house.researchHeadStart?.[entry.category] ?? 0
          return preview(BALANCE.reverseEngineerCost, null, true, {
            label: 'R&D HEAD START (TURNS)',
            before,
            after: Math.min(BALANCE.headStartCap, before + reverseEngineerTurns(entry.units)),
          })
        }
        case 'REPRIORITISE_RND':
          // P108: krasprogrammets totalkostnad (halverad tid, dubbel totalkostnad), inte längre "ingen kostnad".
          return preview(isRndPayload(action.payload) ? crashProgrammeCost(state.house, action.payload.category) : null, null)
      }
      break

    case 'POLITICAL':
      switch (action.op) {
        case 'STAGE_INCIDENT':
          // Fast, global sannolikhet — INTE gated av mottagarens
          // counterIntelligence (till skillnad från FUND_COUP/LEAK/SABOTAGE/
          // TURN nedan), se political.ts:s applyFactionTargetedPolitical.
          // P102: beloppet styr hur stor heat-höjningen blir — visad som nuvarande → FÖRVÄNTAT värde
          // (mittpunkten av stageIncidentHeatMin–Max × kurvans skala), samma formel som resolve.
          {
            const theatre = findTheatreForFaction(state, action.targetFactionId)
            const spend = finiteOrNull(action.spend)
            const effect =
              theatre && spend !== null
                ? {
                    label: 'HEAT',
                    before: theatre.heat,
                    after: Math.min(100, theatre.heat + ((BALANCE.stageIncidentHeatMin + BALANCE.stageIncidentHeatMax) / 2) * stageIncidentHeatScale(spend)),
                  }
                : null
            return preview(spend, BALANCE.stageIncidentSuccessPct, true, effect)
          }
        case 'BACK_CHANNEL': {
          // P102: beloppet styr relationsvinsten mellan frontmotståndarna — lyckas alltid, effekten är deterministisk.
          const spend = finiteOrNull(action.spend)
          const faction = state.factions[action.targetFactionId]
          const opponentId = frontOpponentOf(state, action.targetFactionId)
          if (spend === null || !faction || !opponentId) return preview(spend, null)
          const before = faction.relations[opponentId] ?? 0
          return preview(spend, null, true, { label: 'RELATIONS', before, after: Math.min(100, before + backChannelGain(spend)) })
        }
        case 'BRIBE':
        case 'FUND_CAMPAIGN':
          return preview(finiteOrNull(action.spend), null) // avvisas aldrig av rng, bara klippt vinst
        case 'FIELD_TRIAL': {
          // P115: satsens kostnad (självkostnad) och intervallets före → efter; lyckas alltid.
          const design = state.house.designs?.find((d) => d.id === action.designId)
          if (!design) return preview(null, null)
          return preview(fieldTrialBatch(state, design).cost, null, true, {
            label: 'CLASS UNCERTAINTY',
            before: design.uncertainty,
            after: Math.max(0, design.uncertainty - BALANCE.fieldTrialUncertaintySteps),
          })
        }
        case 'FAVOUR':
          return preview(null, null) // ingen kassa dras (avsnitt 3.3) — kostnaden är en marginalskuld (P99d), se favourMarginOwed
        case 'INFLUENCE': {
          // "lyckas alltid" (avsnitt 4.3) — successPct null, men det ENDA
          // verbet i P79 som visar en beräknad effekt (se filens huvudkommentar).
          const spend = finiteOrNull(action.spend)
          if (spend === null) return preview(null, null)
          const target = state.factions[action.targetFactionId]
          if (!target) return preview(spend, null)
          if (action.effect.kind === 'publicSupport') {
            const before = target.publicSupport
            const after = computeInfluenceAfter('publicSupport', before, spend, action.direction)
            return preview(spend, null, true, { label: 'PUBLIC SUPPORT', before, after })
          }
          const before = target.relations[action.effect.towardFactionId] ?? 0
          const after = computeInfluenceAfter('relations', before, spend, action.direction)
          return preview(spend, null, true, { label: 'RELATIONS', before, after })
        }
        case 'FUND_COUP': {
          const target = state.factions[action.targetFactionId]
          const known = effectiveDepth(state, action.targetFactionId) > 0
          const spend = finiteOrNull(action.spend)
          return preview(spend, known && target && spend !== null ? fundCoupSuccessPct(target, spend) : null, known)
        }
        case 'ASSASSINATE': {
          // "dödar alltid målet" (avsnitt 4.5) — beloppet sänker konsekvenserna (P102): counterIntelligence-
          // höjningen visas före → efter, gated av samma effectiveDepth-grind som FUND_COUP.
          const spend = finiteOrNull(action.spend)
          const official = state.officials[action.officialId]
          const target = official ? state.factions[official.factionId] : undefined
          if (!official || !target) return preview(spend, null)
          const known = effectiveDepth(state, official.factionId) > 0
          if (!known || spend === null) return preview(spend, null, known)
          const before = target.counterIntelligence
          const after = Math.min(100, before + BALANCE.assassinateCounterIntelligenceGain * assassinateReductionFactor(spend))
          return preview(spend, null, true, { label: 'COUNTER-INTELLIGENCE', before, after })
        }
      }
      break

    case 'INTEL': {
      const station = state.house.stations.find((s) => s.id === action.stationId)
      switch (action.op) {
        case 'EXPAND':
          return preview(BALANCE.intelExpandCost, null)
        case 'RECRUIT':
          return preview(BALANCE.intelRecruitCost, null)
        case 'WITHDRAW':
          return preview(null, null)
        case 'LEAK':
        case 'SABOTAGE':
        case 'TURN': {
          const known = station ? effectiveDepth(state, station.nation) > 0 : false
          const successPct = known && station ? intelOpSuccessPct(state, station.nation) : null
          return preview(BALANCE.intelCovertOpCost, successPct, known)
        }
      }
      break
    }

    case 'MARKET':
      // RELEASE säljer TILLBAKA ett innehav (inflöde) — ingen kostnad.
      return preview(action.op === 'BUY_FORWARD' ? finiteOrNull(action.spend) : null, null)

    case 'BROKER':
      // Inget upfront treasury-uttag (se applyActions.ts:s BROKER-gren) — kostnaden
      // ligger i konsekvenserna (tjänstemannens standing/scandalRisk), inte i cost.
      return preview(null, null)
  }

  return preview(null, null)
}
