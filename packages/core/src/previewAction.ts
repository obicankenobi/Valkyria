// previewAction — P78 (ETAPP7_TEKNISK_SPEC.md §7.4), ordagrant:
// "previewAction(state, action): ActionPreview ... visar bara vad spelaren
// kan veta: kostnad, intervall ur balansfilen, sannolikheter där
// underrättelsen räcker. Motståndarens counterIntelligence utan station
// visas som Unknown."
//
// SCOPE-BESLUT (dokumenterat, inte tyst): den här första versionen täcker
// `cost`/`successPct`/`successPctKnown` — de två fält (kostnad, sannolikhet)
// som gäller FLEST av de 22 verben. Ett balansintervall PER VERB (t.ex.
// STAGE_INCIDENTs heat-spann, BACK_CHANNELs doomsday-spann) är UTTRYCKLIGEN
// inte med — se types.ts:s ActionPreview-kommentar och docs/ANDRINGSLOGG.md:
// P79 (som faktiskt bygger TierPicker-gränssnittet mot det här) avgör vilka
// verb som behöver mer, i stället för att den detaljen uppfinns här utan en
// konsument som kan bekräfta formen.
//
// Ren funktion, samma "en formel, en källa"-princip som bidEstimate: alla
// sannolikhetsformler ÅTERANVÄNDS från applyActions.ts/political.ts
// (exporterade därifrån i P78) i stället för handkopierade — en duplicerad
// formel hade varit exakt den tysta driftrisk ANDRINGSLOGG.md 2026-09-13
// redan varnar för (bidEstimate/bidding.ts).
import balanceData from './data/balance.json' with { type: 'json' }
import { effectiveDepth } from './queries.js'
import { intelOpSuccessPct } from './resolve/steps/applyActions.js'
import { fundCoupSuccessPct } from './resolve/political.js'
import { isRepayPayload } from './validateAction.js'
import type { ActionPreview, GameState, Money, PlayerAction, Pct } from './types.js'

interface Balance {
  buildLineCost: number
  hireCost: number
  intelExpandCost: number
  intelRecruitCost: number
  intelCovertOpCost: number
  stageIncidentSuccessPct: number
}
const BALANCE = balanceData as unknown as Balance

function finiteOrNull(value: number): Money | null {
  return Number.isFinite(value) ? value : null
}

function preview(cost: Money | null, successPct: Pct | null, successPctKnown = true): ActionPreview {
  return { cost, successPct, successPctKnown }
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
        case 'REPRIORITISE_RND':
          return preview(null, null)
      }
      break

    case 'POLITICAL':
      switch (action.op) {
        case 'STAGE_INCIDENT':
          // Fast, global sannolikhet — INTE gated av mottagarens
          // counterIntelligence (till skillnad från FUND_COUP/LEAK/SABOTAGE/
          // TURN nedan), se political.ts:s applyFactionTargetedPolitical.
          return preview(finiteOrNull(action.spend), BALANCE.stageIncidentSuccessPct)
        case 'BACK_CHANNEL':
          return preview(finiteOrNull(action.spend), null) // lyckas alltid
        case 'BRIBE':
        case 'FUND_CAMPAIGN':
          return preview(finiteOrNull(action.spend), null) // avvisas aldrig av rng, bara klippt vinst
        case 'FAVOUR':
          return preview(null, null) // "kostar inga pengar" (avsnitt 3.3)
        case 'INFLUENCE':
          return preview(finiteOrNull(action.spend), null) // "lyckas alltid" (avsnitt 4.3)
        case 'FUND_COUP': {
          const target = state.factions[action.targetFactionId]
          const known = effectiveDepth(state, action.targetFactionId) > 0
          return preview(finiteOrNull(action.spend), known && target ? fundCoupSuccessPct(target) : null, known)
        }
        case 'ASSASSINATE':
          return preview(finiteOrNull(action.spend), null) // "dödar alltid målet" (avsnitt 4.5)
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
