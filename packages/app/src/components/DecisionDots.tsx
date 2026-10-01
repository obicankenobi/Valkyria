// DecisionDots — P127 (ETAPP9_FORSLAG.md §9). "Beslutskort (olycksfåglar, fältprov, upphandlingar) markerar med prickar vilka mätare de
// påverkar, utan tal." En prick per påverkad mätare, med mätarens namn som liten etikett (regel 5/18: text i DOM, minst 11 px) — aldrig ett
// belopp. Vilka mätare ett kort rör är redaktionellt val i appen (en handhållen lista per kort), inte en beräkning.
export type DecisionGauge = 'cash' | 'reputation' | 'relations' | 'time' | 'rivals' | 'doomsday'

const GAUGE_LABEL: Record<DecisionGauge, string> = {
  cash: 'CASH',
  reputation: 'REPUTATION',
  relations: 'RELATIONS',
  time: 'TIME',
  rivals: 'RIVALS',
  doomsday: 'DOOMSDAY',
}

export function DecisionDots({ gauges, testId }: { gauges: readonly DecisionGauge[]; testId?: string }) {
  return (
    <span className="decision-dots" role="img" aria-label={`Affects: ${gauges.map((g) => GAUGE_LABEL[g].toLowerCase()).join(', ')}`} data-testid={testId}>
      {gauges.map((g) => (
        <span className={`decision-dot is-${g}`} key={g}>
          <i aria-hidden="true" />
          {GAUGE_LABEL[g]}
        </span>
      ))}
    </span>
  )
}
