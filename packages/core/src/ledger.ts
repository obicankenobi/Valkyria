// ledger — huvudboken, P96 (ETAPP8_FORSLAG.md §3.1). Ren bokföring av pengar som
// REDAN flyttas av andra steg: inga nya penningflöden, ingen regel, aldrig ett
// underlag för ett beslut (skyddsräcke 1). Varje penningflyttande gren anropar
// recordIncome/recordExpense/recordFinancing precis intill sin
// `house.treasury +=/-=` och sin WireEvent (hård regel 4); resolveTurn()
// förseglar slutsaldona med sealLedger() när alla steg körts.
//
// En rad per tur, hittad på `draft.meta.turn` — turräknaren stegas först efter
// pipelinen (resolve/index.ts:advanceTurn), så alla steg och förseglingen delar
// samma turnummer. Allt belopp avrundas via money.ts (hård regel 8).
import { round } from './money.js'
import type { GameState, LedgerEntry, Money } from './types.js'

// BROKER-kontraktens id-prefix — EN källa: applyActions.ts bygger id:t med det,
// deliveries.ts läser det för att bokföra intäkten på income.broker.
export const BROKER_CONTRACT_ID_PREFIX = 'contract-broker-'

export type LedgerIncomeRow = keyof LedgerEntry['income']
export type LedgerExpenseRow = keyof LedgerEntry['expenses']
export type LedgerFinancingRow = keyof LedgerEntry['financing']

function emptyEntry(turn: number): LedgerEntry {
  return {
    turn,
    income: { contracts: 0, advances: 0, broker: 0, commodityRelease: 0, fileSale: 0 },
    expenses: {
      fixedCosts: 0,
      production: 0,
      interest: 0,
      political: 0,
      intel: 0,
      commodityPurchase: 0,
      hiring: 0,
      lines: 0,
      clawback: 0,
    },
    financing: { loans: 0, repayments: 0 },
    treasuryEnd: 0,
    debtEnd: 0,
    creditLimitEnd: 0,
  }
}

// Innevarande turs rad; skapas vid första skrivningen. Stegen körs alltid inom en
// och samma tur, så den sista raden är antingen innevarande turs eller (första
// skrivningen) saknas.
function currentEntry(draft: GameState): LedgerEntry {
  const last = draft.ledger[draft.ledger.length - 1]
  if (last && last.turn === draft.meta.turn) return last
  const entry = emptyEntry(draft.meta.turn)
  draft.ledger.push(entry)
  return entry
}

export function recordIncome(draft: GameState, row: LedgerIncomeRow, amount: Money): void {
  const entry = currentEntry(draft)
  entry.income[row] = (entry.income[row] ?? 0) + round(amount)
}

export function recordExpense(draft: GameState, row: LedgerExpenseRow, amount: Money): void {
  const entry = currentEntry(draft)
  entry.expenses[row] = (entry.expenses[row] ?? 0) + round(amount)
}

export function recordFinancing(draft: GameState, row: LedgerFinancingRow, amount: Money): void {
  const entry = currentEntry(draft)
  entry.financing[row] += round(amount)
}

// Anropas av resolveTurn() efter att sista steget kört. Skapar raden om ingen
// pengaflytt skedde (ett kvartal utan rörelser är fortfarande ett kvartal), och
// skriver slutsaldona rakt ur house — ingen beräkning, bara avläsning.
export function sealLedger(draft: GameState): void {
  const entry = currentEntry(draft)
  entry.treasuryEnd = draft.house.treasury
  entry.debtEnd = draft.house.debt
  entry.creditLimitEnd = draft.house.creditLimit
}
