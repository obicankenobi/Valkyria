// spendCurves — P102 (ETAPP8_FORSLAG.md §6.1, pelare 3: "spelet säger aldrig nej till en handling, det prissätter
// den"). STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP och ASSASSINATE fick en kurva från belopp till effekt med
// AVTAGANDE AVKASTNING och ETT TAK. Rena funktioner som BÅDE resolve (political.ts) och previewAction läser —
// en formel, en källa (samma princip som intelOpSuccessPct/fundCoupSuccessPct, P78).
//
// spendCurve(spend, half) = spend / (spend + half): 0 vid 0, växer med beloppet, avtar (varje extra krona ger
// mindre), och når ALDRIG 1 — dubbel summa ger märkbart mer men aldrig dubbelt så mycket, och aldrig säkert.
import balanceData from './data/balance.json' with { type: 'json' }

interface Balance {
  fundCoupSpendHalf: number
  fundCoupSpendBonusMaxPct: number
  stageIncidentSpendHalf: number
  stageIncidentHeatScaleMin: number
  stageIncidentHeatScaleMax: number
  backChannelSpendHalf: number
  backChannelGainScaleMin: number
  backChannelGainScaleMax: number
  relationsBackChannelGain: number
  assassinateSpendHalf: number
  assassinateMaxReductionPct: number
}
const BALANCE = balanceData as unknown as Balance

export function spendCurve(spend: number, half: number): number {
  if (!(spend > 0)) return 0
  return spend / (spend + half)
}

// FUND_COUP: procentenheter som läggs på lyckandechansen (före motpartens counterIntelligence och taket).
export function fundCoupBonusPct(spend: number): number {
  return BALANCE.fundCoupSpendBonusMaxPct * spendCurve(spend, BALANCE.fundCoupSpendHalf)
}

// STAGE_INCIDENT: multiplikator på heat-höjningen (spend 0 ger stageIncidentHeatScaleMin, inte 0).
export function stageIncidentHeatScale(spend: number): number {
  const curve = spendCurve(spend, BALANCE.stageIncidentSpendHalf)
  return BALANCE.stageIncidentHeatScaleMin + (BALANCE.stageIncidentHeatScaleMax - BALANCE.stageIncidentHeatScaleMin) * curve
}

// BACK_CHANNEL: relationspoäng mellan frontmotståndarna.
export function backChannelGain(spend: number): number {
  const curve = spendCurve(spend, BALANCE.backChannelSpendHalf)
  const scale = BALANCE.backChannelGainScaleMin + (BALANCE.backChannelGainScaleMax - BALANCE.backChannelGainScaleMin) * curve
  return BALANCE.relationsBackChannelGain * scale
}

// ASSASSINATE: faktor (≤ 1) som skalar counterIntelligence-höjningen och DOOMSDAY-risken. Golvet är
// 1 − assassinateMaxReductionPct/100 — konsekvenserna försvinner aldrig helt.
export function assassinateReductionFactor(spend: number): number {
  return 1 - (BALANCE.assassinateMaxReductionPct / 100) * spendCurve(spend, BALANCE.assassinateSpendHalf)
}
