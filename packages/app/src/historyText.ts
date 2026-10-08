// historyText — P149 (ETAPP10 §9). Presentation av de verkliga, daterade händelserna: ett datum skrivs som ett riktigt datum (\"19 APRIL 1964\") eller, när dagen inte är belagd,
// som månad (\"FEBRUARY 1965\"). Rena funktioner; datan och äkthetskontrollen bor i packages/core (history.ts, history.data.test.ts).
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] as const

export function historyDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date)
  if (!m) return date
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return date
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`
}

// Kvartalet en turn tillhör, i spelets egen tideräkning (tur 0 = 1964 Q1) — används av epilogens tidslinje.
export function quarterLabelOfTurn(turn: number): string {
  return `${1964 + Math.floor(turn / 4)} Q${(turn % 4) + 1}`
}
