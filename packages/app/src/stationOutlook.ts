// stationOutlook — P163 (ETAPP10_FORSLAG.md §3b, S5): vad en station är, vad just den här stationen ger i landet och vad nästa djupnivå skulle ge. Allt härleds ur
// kärnans egna frågor (effectiveDepth, formationDisplay, previewAction); det enda som speglas är prisbandets bredd per djup, eftersom kärnan inte exporterar sin tabell
// (DEPTH_BAND_PCT i queries.ts, och kärnan rörs inte av P163). test/stationOutlook.test.tsx binder spegeln mot bidEstimate.
import { effectiveDepth, previewAction } from '@seventh-front/core'
import type { FactionId, GameState } from '@seventh-front/core'

export const WHAT_A_STATION_IS =
  'A station is your intelligence post in a country. Its depth, from 0 to 5, decides how much you can see there.'

// Prisbandets halva bredd i procent kring lägsta rivalbud, per effektivt djup (queries.ts: DEPTH_BAND_PCT × 100).
export const STATION_BAND_PCT: readonly number[] = [35, 22, 14, 8, 4, 0]

// De verb som kräver en av dina stationer i landet. RECRUIT är tvärtom vägen att få en.
export const STATION_VERBS = ['EXPAND', 'WITHDRAW', 'LEAK', 'SABOTAGE', 'TURN'] as const

export interface DepthStep {
  depth: number // effektivt djup efter steget
  bandPct: number
  gains: string[]
  cost: number | null // vad steget kostar (EXPAND eller RECRUIT), ur previewAction
  how: 'EXPAND' | 'RECRUIT'
}

export interface StationOutlook {
  hasStation: boolean
  stationDepth: number | null // stationens eget djup
  effective: number // det du faktiskt ser med (stationen, +1 med en skicklig chefsförsäljare)
  salesmanBonus: boolean
  bandPct: number
  buyerTermsVisible: boolean
  formationCount: number
  formationsKnown: boolean
  verbs: readonly string[] // verb som den här stationen låser upp (tom utan station)
  next: DepthStep | null // null på högsta djup, eller när stationen är vilande eller bränd
}

function gainsFor(from: number, to: number): string[] {
  const gains: string[] = []
  if (from === 0 && to >= 1) {
    gains.push('formations show their exact strength', 'buyers\' credit and terms show on their orders', 'the chance of covert operations and coups there is shown')
  }
  if (to < 5) gains.push(`price bands narrow from ±${STATION_BAND_PCT[from]}% to ±${STATION_BAND_PCT[to]}%`)
  else gains.push(`price bands become exact (from ±${STATION_BAND_PCT[from]}%)`)
  if (from < 4 && to >= 4) gains.push('the rival house with the lowest bid is named')
  return gains
}

export function stationOutlook(state: GameState, factionId: FactionId): StationOutlook {
  const station = state.house.stations.find((s) => s.nation === factionId && s.status === 'active')
  const effective = effectiveDepth(state, factionId)
  const formations = Object.values(state.fronts)
    .flatMap((f) => f.formations)
    .filter((f) => f.factionId === factionId)

  let next: DepthStep | null = null
  if (effective < 5) {
    if (station) {
      const cost = previewAction(state, { type: 'INTEL', op: 'EXPAND', stationId: station.id }).cost
      next = { depth: effective + 1, bandPct: STATION_BAND_PCT[effective + 1]!, gains: gainsFor(effective, effective + 1), cost, how: 'EXPAND' }
    } else {
      // Utan station är RECRUIT första steget: en station på djup 0 ger dig själv inget mer än du ser nu (salesmanBonus räknas redan i `effective`).
      const cost = previewAction(state, { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: factionId }).cost
      next = { depth: effective, bandPct: STATION_BAND_PCT[effective]!, gains: ['a station at depth 0 that you can then build up with EXPAND'], cost, how: 'RECRUIT' }
    }
  }

  return {
    hasStation: station !== undefined,
    stationDepth: station ? station.depth : null,
    effective,
    salesmanBonus: state.house.staff.chiefSalesman > 75,
    bandPct: STATION_BAND_PCT[effective]!,
    buyerTermsVisible: effective > 0,
    formationCount: formations.length,
    formationsKnown: effective > 0,
    verbs: station ? STATION_VERBS : [],
    next,
  }
}
