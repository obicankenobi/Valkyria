// ledgerLabels — huvudbokens radnamn på spelarens språk (P97, ETAPP8_FORSLAG.md §3.2).
// Raderna i LedgerEntry (packages/core, P96) är tekniska nycklar; verifikationerna och
// styrelsens PM visar dem med de här etiketterna. En källa, aldrig en lokal kopia i en
// komponent.
import type { LedgerEntry } from '@seventh-front/core'

export const INCOME_LABELS: Required<Record<keyof LedgerEntry['income'], string>> = {
  contracts: 'Contract deliveries',
  advances: 'Advances',
  broker: 'Brokered deliveries',
  commodityRelease: 'Commodity release',
  fileSale: 'Sale of the file',
  civil: 'Civil lines',
  licence: 'Licences and royalties',
}

export const EXPENSE_LABELS: Record<keyof LedgerEntry['expenses'], string> = {
  fixedCosts: 'Fixed costs',
  production: 'Production',
  interest: 'Interest',
  political: 'Political operations',
  intel: 'Intelligence',
  commodityPurchase: 'Commodity purchases',
  hiring: 'Hiring',
  lines: 'New production lines',
  clawback: 'Revenue clawback',
}

export const FINANCING_LABELS: Record<keyof LedgerEntry['financing'], string> = {
  loans: 'Loans taken',
  repayments: 'Repayments',
}

// Etikett för en post ur BoardMemo.topItems (kind + rad-nyckel som sträng).
export function ledgerItemLabel(kind: 'income' | 'expense', row: string): string {
  const table: Record<string, string> = kind === 'income' ? INCOME_LABELS : EXPENSE_LABELS
  return table[row] ?? row
}
