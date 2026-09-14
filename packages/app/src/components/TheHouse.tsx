// THE HOUSE — läsvy: produktionslinjer, R&D, kassa, kredit, styrelsemål,
// personal. Visar uttryckligen MARGINAL PER AKTIVT KONTRAKT, inte bara kassa
// (DESIGN.md avsnitt 18: "Spelaren kan inte fatta prisbeslut på en siffra som
// bara rör sig"). Se ETAPP1_TEKNISK_SPEC.md avsnitt 8.
import { getProduct } from '@seventh-front/core'
import type { Contract, GameState } from '@seventh-front/core'
import { Bar, Meter, Panel, Tag, formatMoney } from './ui.js'

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
  const totalRevenue = house.revenueByTurn.reduce((sum, r) => sum + r, 0)

  return (
    <>
      <h2 className="view-title">The House</h2>

      <div className="grid-2">
        <Panel title="Balansräkning">
          <dl className="kv">
            <dt>Kassa</dt>
            <dd>{formatMoney(house.treasury)}</dd>
            <dt>Skuld</dt>
            <dd>{formatMoney(house.debt)}</dd>
            <dt>Kreditutrymme</dt>
            <dd>{formatMoney(house.creditLimit)}</dd>
            <dt>Intäkter totalt</dt>
            <dd>{formatMoney(totalRevenue)}</dd>
            <dt>Ränta (årlig)</dt>
            <dd>{(house.debtRateAnnual * 100).toFixed(1)}%</dd>
          </dl>

          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <Meter
              label="Kvalitetsrykte"
              value={house.reputation.quality}
              display={house.reputation.quality.toFixed(0)}
              tone="blue"
            />
            <Meter
              label="Pålitlighet"
              value={house.reputation.reliability}
              display={house.reputation.reliability.toFixed(0)}
              tone={house.reputation.reliability < 40 ? 'red' : 'blue'}
            />
          </div>
        </Panel>

        <Panel
          title={`Styrelsemål: ${target.label}`}
          right={
            target.reviewsFailed > 0 ? (
              <Tag tone="red">{target.reviewsFailed}/2 underkända</Tag>
            ) : (
              <Tag tone="green">Inga anmärkningar</Tag>
            )
          }
        >
          <Meter
            label={`Bana mot målet (förfaller T${target.dueTurn})`}
            value={target.progressSnapshot}
            max={target.threshold}
            display={`${target.progressSnapshot.toFixed(2)} / ${target.threshold}`}
            tone={target.progressSnapshot >= target.threshold ? 'green' : 'amber'}
            marks={target.reviewTurns.map((reviewTurn) => ({
              at: (reviewTurn / target.dueTurn) * target.threshold,
              label: `T${reviewTurn}`,
            }))}
          />
          <p className="banner-sub" style={{ marginTop: 16 }}>
            {nextReview !== null
              ? `Nästa prognoskontroll tur ${nextReview} — styrelsen jämför mot den linjära banan, med tolerans.`
              : 'Inga fler prognoskontroller. Målet prövas skarpt vid förfall.'}
          </p>
        </Panel>
      </div>

      <Panel title="Marginal per aktivt kontrakt">
        {activeContracts.length === 0 ? (
          <p className="empty">Inga aktiva kontrakt.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kontrakt</th>
                <th>Produkt</th>
                <th>Grade</th>
                <th>Kontraktsvärde</th>
                <th>Levererat</th>
                <th style={{ width: 160 }}>Bruttomarginal</th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.map((contract) => {
                const margin = contractMargin(contract)
                return (
                  <tr key={contract.id}>
                    <td className="is-key">{contract.id}</td>
                    <td>{getProduct(contract.productId).name}</td>
                    <td>{contract.grade}</td>
                    <td>{formatMoney(contract.price)}</td>
                    <td>
                      {contract.unitsDelivered}/{contract.quantity}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 52, color: margin !== null && margin < 0 ? 'var(--red)' : undefined }}>
                          {margin === null ? '—' : `${margin.toFixed(1)}%`}
                        </span>
                        <Bar
                          ratio={margin === null ? 0 : Math.max(0, margin) / 100}
                          tone={margin !== null && margin >= 20 ? 'green' : 'amber'}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title="Produktionslinjer">
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
                  <td className="is-key">{line.id}</td>
                  <td>{line.productId ? getProduct(line.productId).name : '—'}</td>
                  <td>{line.grade}</td>
                  <td>{line.capacityPct}%</td>
                  <td>
                    {line.status === 'running' && <Tag tone="green">Kör</Tag>}
                    {line.status === 'idle' && <Tag>Ledig</Tag>}
                    {line.status === 'blocked' && <Tag tone="red">{line.blockedReason ?? 'Blockerad'}</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="R&D och personal">
          {house.rnd.length === 0 ? (
            <p className="empty">Inga pågående forskningsprojekt.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Kvar</th>
                </tr>
              </thead>
              <tbody>
                {house.rnd.map((project) => (
                  <tr key={project.id}>
                    <td className="is-key">{project.category}</td>
                    <td>
                      {project.turnsRemaining}/{project.turnsTotal} turer
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <Meter label="Chefsingenjör" value={house.staff.chiefEngineer} tone="blue" />
            <Meter label="Chefssäljare" value={house.staff.chiefSalesman} tone="blue" />
            <Meter label="Stabschef" value={house.staff.chiefOfStaff} tone="blue" />
          </div>
        </Panel>
      </div>
    </>
  )
}
