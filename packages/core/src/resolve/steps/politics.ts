// politics — nytt steg (ETAPP5_TEKNISK_SPEC.md avsnitt 10 punkt 3, beslutat vid
// antagandet), insatt mellan factions och heat (CLAUDE.md hård regel 7 tillåter
// det just här, uttryckligen beslutat av ägaren). "En tjänsteman med tillräcklig
// standing vars agenda är ohörsammad fattar ett PolicyDecision som drabbar
// spelaren" (avsnitt 3.4).
//
// "Tillräcklig standing" och "agenda ohörsammad" operationaliseras mot två fält
// som redan finns (standing, relationToPlayer) i stället för ett nytt per-agenda-
// mätvärde — se balance.json:s _p57_note. VILKET av de fem besluten en
// ohörsammad tjänsteman fattar avgörs av hennes AGENDA, ett fast 1:1-schema (samma
// not) — inte slumpat, så samma spelläge alltid ger samma beslut (CLAUDE.md hård
// regel 3).
//
// Effekterna skrivs direkt till Faction/Station-fälten avsnitt 3.4:s tabell
// namnger (Faction.embargoed fanns redan, P7; Station.exposure fanns redan, P18)
// — ingen lagrad PolicyDecision-post i state, bara en WireEvent som namnger den.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Agenda, Faction, Official, PolicyDecision } from '../../types.js'

interface Balance {
  policyDecisionStandingThreshold: number
  policyDecisionRelationThreshold: number
  policyDecisionMinTurn: number
  policyPriceCapFactor: number
  tenderReformWeights: { price: number; delivery: number; relationship: number }
  licenceReviewExposurePenalty: number
}
const BALANCE = balanceData as unknown as Balance

// Se filens huvudkommentar / balance.json:s _p57_note för hela motiveringen
// bakom var och en av de fem parningarna.
const DECISION_FOR_AGENDA: Record<Agenda, PolicyDecision> = {
  REARM: 'TENDER_REFORM',
  AUSTERITY: 'PRICE_CAP',
  MODERNISE: 'LICENCE_REVIEW',
  NON_ALIGNMENT: 'EMBARGO',
  SELF_ENRICHMENT: 'PREFERRED_SUPPLIER',
}

export const politics: ResolveStep = (ctx) => {
  const { draft } = ctx

  // Official.relationToPlayer startar på 0 för ALLA (state.ts) och stiger bara
  // genom BRIBE/FUND_CAMPAIGN/FAVOUR riktat mot just henne — så "ohörsammad"
  // (relationToPlayer < tröskeln) är annars sant för varenda tjänsteman med
  // tillräcklig standing redan på tur 1, innan spelaren haft en enda tur att
  // agera. Utan den här grinden bröt P57 flera av etapp 3/4:s redan gröna
  // invarianttester (skyddsräcke 5) — en faktion kunde bli EMBARGO:ad tur 1,
  // innan den hunnit lägga en enda order. policyDecisionMinTurn (se
  // balance.json:s _p57_note) ger spelaren ett fönster att hinna reagera.
  if (draft.meta.turn < BALANCE.policyDecisionMinTurn) return

  for (const official of Object.values(draft.officials)) {
    if (official.status !== 'active') continue
    if (official.hasIssuedPolicyDecision) continue // en gång per tjänsteman, se types.ts:s kommentar
    if (official.standing < BALANCE.policyDecisionStandingThreshold) continue
    if (official.relationToPlayer >= BALANCE.policyDecisionRelationThreshold) continue // hörsammad — inget beslut

    issuePolicyDecision(ctx, official)
  }
}

function issuePolicyDecision(ctx: ResolveContext, official: Official): void {
  const { draft, rng, emit } = ctx
  const faction = draft.factions[official.factionId]
  if (!faction) return

  const decision = DECISION_FOR_AGENDA[official.agenda]
  official.hasIssuedPolicyDecision = true

  switch (decision) {
    case 'EMBARGO': {
      // Fynd 1.7 / avsnitt 3.4: "EMBARGO är den viktigaste raden i hela etappen
      // — ... den kan hända spelaren, inte bara av spelaren." Effektkedjan
      // (orders.ts, factions.ts, supply.ts) fanns redan sedan P7/P50 — det här
      // är dess FÖRSTA skrivare.
      faction.embargoed = true
      break
    }

    case 'PRICE_CAP': {
      // "trueBudget-faktorerna för faktionen" — permanent tak, läst av orders.ts.
      faction.trueBudgetCapFactor = BALANCE.policyPriceCapFactor
      break
    }

    case 'TENDER_REFORM': {
      // "Order.weights permanent för faktionen" — ERSÄTTER (inte skiftar)
      // pressure/agenda-vikterna, läst av orders.ts.
      faction.weightsOverride = { ...BALANCE.tenderReformWeights }
      break
    }

    case 'LICENCE_REVIEW': {
      // "Station.exposure i landet" — samma "ingen station, ingen effekt"-
      // princip som STAGE_INCIDENT:s misattribution (applyActions.ts/political.ts).
      raiseStationExposure(draft, official.factionId)
      break
    }

    case 'PREFERRED_SUPPLIER': {
      // "Poängbonus till spelaren ELLER en rival" — i just DEN HÄR triggern
      // (en ohörsammad tjänsteman som vänder sig MOT spelaren) går den alltid
      // till en rival, aldrig till spelaren själv: hon gynnar inte den som
      // ignorerar henne. Deterministiskt val bland faktionens kända rivaler
      // (CLAUDE.md hård regel 2 — all slump via ctx.rng).
      const rivalIds = Object.keys(draft.rivals)
      if (rivalIds.length > 0) {
        faction.preferredSupplier = rng.pick(rivalIds)
      }
      break
    }
  }

  emit({
    severity: 'headline',
    scope: 'faction',
    headline: `${official.name.toUpperCase()} (${faction.name.toUpperCase()}) ISSUES ${decision.replace('_', ' ')}`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: faction.id,
  })
}

function raiseStationExposure(draft: ResolveContext['draft'], nation: Faction['id']): void {
  const station = draft.house.stations.find((s) => s.nation === nation && s.status === 'active')
  if (!station) return
  station.exposure = Math.min(100, station.exposure + BALANCE.licenceReviewExposurePenalty)
}
