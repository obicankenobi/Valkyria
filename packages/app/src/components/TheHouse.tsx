// THE HOUSE — läsvy: produktionslinjer, R&D, kassa, kredit, styrelsemål,
// personal. Visar uttryckligen MARGINAL PER AKTIVT KONTRAKT, inte bara kassa
// (DESIGN.md avsnitt 18: "Spelaren kan inte fatta prisbeslut på en siffra som
// bara rör sig"). Se ETAPP1_TEKNISK_SPEC.md avsnitt 8.
import { getProduct } from '@seventh-front/core'
import type { Contract, GameState } from '@seventh-front/core'

function formatMoney(amount: number): string {
  return `£${Math.round(amount).toLocaleString('sv-SE')}`
}

function contractMargin(contract: Contract): number | null {
  if (contract.price <= 0) return null
  const cost = contract.unitCostAtSigning * contract.quantity
  return ((contract.price - cost) / contract.price) * 100
}

export function TheHouse({ state }: { state: GameState }) {
  const house = state.house
  const target = house.boardTarget
  const nextReview = target.reviewTurns.find((t) => t > state.meta.turn) ?? null
  const activeContracts = state.market.contracts.filter((c) => c.status === 'active' || c.status === 'late')

  return (
    <section>
      <h2>THE HOUSE</h2>

      <table>
        <tbody>
          <tr>
            <td>Kassa</td>
            <td>{formatMoney(house.treasury)}</td>
          </tr>
          <tr>
            <td>Skuld</td>
            <td>{formatMoney(house.debt)}</td>
          </tr>
          <tr>
            <td>Kreditutrymme</td>
            <td>{formatMoney(house.creditLimit)}</td>
          </tr>
          <tr>
            <td>Rykte (kvalitet / pålitlighet)</td>
            <td>
              {house.reputation.quality.toFixed(0)} / {house.reputation.reliability.toFixed(0)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Styrelsemål: {target.label}</h3>
      <p>
        progressSnapshot {target.progressSnapshot.toFixed(2)} / mål {target.threshold} — förfaller tur{' '}
        {target.dueTurn}
        {nextReview !== null ? `, nästa kontrolltur T${nextReview}` : ', ingen kontrolltur kvar'}. Underkända
        kontroller: {target.reviewsFailed}/2.
      </p>

      <h3>Marginal per aktivt kontrakt</h3>
      {activeContracts.length === 0 ? (
        <p>Inga aktiva kontrakt.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Kontrakt</th>
              <th>Produkt</th>
              <th>Grade</th>
              <th>Levererat</th>
              <th>Bruttomarginal</th>
            </tr>
          </thead>
          <tbody>
            {activeContracts.map((c) => {
              const margin = contractMargin(c)
              return (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{getProduct(c.productId).name}</td>
                  <td>{c.grade}</td>
                  <td>
                    {c.unitsDelivered}/{c.quantity}
                  </td>
                  <td>{margin === null ? '—' : `${margin.toFixed(1)}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <h3>Produktionslinjer</h3>
      <table>
        <thead>
          <tr>
            <th>Linje</th>
            <th>Produkt</th>
            <th>Grade</th>
            <th>Kapacitet</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {house.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.id}</td>
              <td>{line.productId ? getProduct(line.productId).name : '—'}</td>
              <td>{line.grade}</td>
              <td>{line.capacityPct}%</td>
              <td>
                {line.status}
                {line.blockedReason ? ` (${line.blockedReason})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>R&D</h3>
      {house.rnd.length === 0 ? (
        <p>Inga pågående projekt.</p>
      ) : (
        <ul>
          {house.rnd.map((project) => (
            <li key={project.id}>
              {project.category}: {project.turnsRemaining}/{project.turnsTotal} turer kvar
            </li>
          ))}
        </ul>
      )}

      <h3>Personal</h3>
      <p>
        Chefsingenjör {house.staff.chiefEngineer} · Chefssäljare {house.staff.chiefSalesman} · Stabschef{' '}
        {house.staff.chiefOfStaff}
      </p>
    </section>
  )
}
