// ledgerChart — huvudbokens diagramdata (P97, ETAPP8_FORSLAG.md §3.2). Ren och testbar:
// härleder allt LedgerChart.tsx ritar ur GameState, utan att räkna om något som redan
// har en källa. Staplarna och kassakurvan läses rakt ur `state.ledger` (P96). Styrelsens
// röda streckade linje är kravet på KUMULATIV BOKFÖRD INTÄKT + ORDERBOK (progressSnapshot,
// board.ts) i kronor — boardReviewRequirement × foundingCapital, samma formel som avgör
// granskningen — och "BOOK NOW" är samma storhet i dag (progressSnapshot × foundingCapital),
// så punkten och linjen är direkt jämförbara. Kassan (treasury) och boken är två olika
// saker på samma kronaxel; det är därför de är tydligt olika ritade och benämnda.
import { boardReviewRequirement } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'

export interface LedgerBar {
  turn: number
  income: number // ≥ 0, ritas uppåt från nolllinjen
  expenses: number // ≥ 0, ritas nedåt från nolllinjen
}

export interface LedgerChartData {
  bars: LedgerBar[]
  cash: { turn: number; value: number }[]
  target: { turn: number; value: number }[] // krav på kumulativ bok, tur 0 … nästa granskning
  reviewMarks: { turn: number; value: number }[] // granskningsturerna inom det ritade fönstret
  bookNow: { turn: number; value: number } | null
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  yTicks: number[]
}

// 1–2–5-steg så att axeln får runda tal (£0,5M, £1M, £2M …) oavsett skala.
export function niceTicks(min: number, max: number, targetCount = 4): number[] {
  if (!(max > min)) return [min]
  const rawStep = (max - min) / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const residual = rawStep / magnitude
  const step = (residual >= 5 ? 5 : residual >= 2 ? 2 : 1) * magnitude
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v) || 0) // `|| 0` skalar bort -0
  return ticks
}

export function deriveLedgerChart(state: GameState): LedgerChartData | null {
  const ledger = state.ledger
  if (ledger.length === 0) return null

  const house = state.house
  const target = house.boardTarget
  const capital = house.foundingCapital
  const lastTurn = ledger[ledger.length - 1]!.turn

  const bars: LedgerBar[] = ledger.map((entry) => ({
    turn: entry.turn,
    income: Object.values(entry.income).reduce((sum, v) => sum + v, 0),
    expenses: Object.values(entry.expenses).reduce((sum, v) => sum + v, 0),
  }))
  const cash = ledger.map((entry) => ({ turn: entry.turn, value: entry.treasuryEnd }))

  // Målkurvan sträcker sig bara till nästa granskning (eller sista bokförda turen om alla
  // är avklarade): längre än så dominerar kravet axeln och krymper staplarna till streck.
  const nextReview = target.reviewTurns.find((t) => t > lastTurn) ?? null
  const xMax = Math.max(nextReview ?? lastTurn, lastTurn)
  const requirement = (turn: number) => Math.round(boardReviewRequirement(target, turn) * capital)
  const targetLine: { turn: number; value: number }[] = []
  for (let t = 0; t <= xMax; t++) targetLine.push({ turn: t, value: requirement(t) })
  const reviewMarks = target.reviewTurns.filter((t) => t <= xMax).map((t) => ({ turn: t, value: requirement(t) }))

  const bookNow = { turn: lastTurn, value: Math.round(target.progressSnapshot * capital) }

  const values = [
    0,
    ...bars.map((b) => b.income),
    ...bars.map((b) => -b.expenses),
    ...cash.map((c) => c.value),
    ...targetLine.map((p) => p.value),
    bookNow.value,
  ]
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = (rawMax - rawMin) * 0.06 || 1
  const yTicks = niceTicks(rawMin - (rawMin < 0 ? pad : 0), rawMax + pad)
  return {
    bars,
    cash,
    target: targetLine,
    reviewMarks,
    bookNow,
    xMin: 0,
    xMax,
    yMin: Math.min(rawMin - (rawMin < 0 ? pad : 0), yTicks[0] ?? rawMin),
    yMax: Math.max(rawMax + pad, yTicks[yTicks.length - 1] ?? rawMax),
    yTicks,
  }
}

// Vilken tur ett tryck vid `ratio` (0..1 över diagrambredden) hamnar på, klampat till
// turer som faktiskt har en huvudboksrad. Ren så att den går att testa utan DOM.
export function turnAtRatio(data: LedgerChartData, ratio: number): number {
  const turns = data.bars.map((b) => b.turn)
  const raw = data.xMin + Math.max(0, Math.min(1, ratio)) * (data.xMax - data.xMin)
  let best = turns[0]!
  for (const t of turns) if (Math.abs(t - raw) < Math.abs(best - raw)) best = t
  return best
}
