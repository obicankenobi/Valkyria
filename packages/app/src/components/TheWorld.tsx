// THE WORLD — läsvy: fronter, faktioner, heat, DOOMSDAY, stationer. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8, DESIGN.md avsnitt 18. Ingen karta —
// fronten ritas som en linje med en position, exakt vad simuleringen
// modellerar (DESIGN.md: "en karta som är mer detaljerad än modellen är ett
// löfte spelet inte kan hålla").
import { DISPLAY_THRESHOLDS } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { Bar, Meter, Panel, Tag } from './ui.js'

function doomsdayTone(value: number): 'green' | 'amber' | 'red' {
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'red'
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'amber'
  return 'green'
}

export function TheWorld({ state }: { state: GameState }) {
  return (
    <>
      <h2 className="view-title">The World</h2>

      <div className="grid-2">
        <Panel
          title="Doomsday"
          right={<Tag tone={doomsdayTone(state.doomsday)}>{state.doomsday.toFixed(0)} / 100</Tag>}
        >
          <Meter
            label="Nuvarande nivå"
            value={state.doomsday}
            display={state.doomsday.toFixed(0)}
            tone={doomsdayTone(state.doomsday)}
            marks={[
              { at: DISPLAY_THRESHOLDS.doomsdayCrisisWatch, label: 'bevakning' },
              { at: DISPLAY_THRESHOLDS.doomsdayCrisisEvent, label: 'kris' },
              { at: DISPLAY_THRESHOLDS.doomsdayNuclearExchange, label: 'utväxling' },
            ]}
          />
          <p className="banner-sub" style={{ marginTop: 18 }}>
            Högsta nivå hittills: <span className="mono">{state.doomsdayPeak.toFixed(0)}</span>. Toppvärdet avgör
            epilogens omdöme om återhållsamhet, inte slutvärdet.
          </p>
        </Panel>

        <Panel title="Teatrar">
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.values(state.theatres).map((theatre) => (
              <Meter
                key={theatre.id}
                label={theatre.name}
                value={theatre.heat}
                display={theatre.heat.toFixed(0)}
                tone={theatre.heat >= DISPLAY_THRESHOLDS.heatEscalation ? 'red' : 'amber'}
                marks={[{ at: DISPLAY_THRESHOLDS.heatEscalation, label: 'eskalering' }]}
              />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Fronter" flush>
        {Object.values(state.fronts).map((front) => {
          const sideA = state.factions[front.sideA]
          const sideB = state.factions[front.sideB]
          const markerPct = ((front.position + 100) / 200) * 100
          const totalCasualties = front.casualtiesTotal.a + front.casualtiesTotal.b

          return (
            <div className="front" key={front.id}>
              <div className="front-sides">
                <span className="side-a">{sideA ? sideA.name : front.sideA}</span>
                <span className="meter-label">
                  {front.id} · anfaller: sida {front.attacker.toUpperCase()} · {totalCasualties} förluster
                </span>
                <span className="side-b">{sideB ? sideB.name : front.sideB}</span>
              </div>

              <div className="frontline">
                <div className="frontline-center" />
                <div className="frontline-marker" style={{ left: `${markerPct}%` }} />
              </div>

              <div className="front-stats">
                <Meter label="Moral A" value={front.morale.a} display={front.morale.a.toFixed(0)} tone="blue" />
                <Meter label="Moral B" value={front.morale.b} display={front.morale.b.toFixed(0)} tone="red" />
                <Meter
                  label="Styrka A"
                  value={front.strength.a}
                  max={Math.max(front.strength.a, front.strength.b, 1)}
                  display={front.strength.a.toFixed(0)}
                  tone="blue"
                />
                <Meter
                  label="Styrka B"
                  value={front.strength.b}
                  max={Math.max(front.strength.a, front.strength.b, 1)}
                  display={front.strength.b.toFixed(0)}
                  tone="red"
                />
              </div>
            </div>
          )
        })}
      </Panel>

      <Panel title="Faktioner" flush>
        {Object.values(state.factions).map((faction) => {
          const alignPct = ((faction.alignment + 100) / 200) * 100
          return (
            <div className="faction-card" key={faction.id}>
              <div className="faction-head">
                <span className="faction-name">{faction.name}</span>
                {faction.bankrupt && <Tag tone="red">Bankrutt</Tag>}
                {faction.embargoed && <Tag tone="amber">Embargo</Tag>}
                {!faction.bankrupt && !faction.embargoed && <Tag tone="green">Handlande</Tag>}
              </div>

              <div className="faction-meters">
                <Meter
                  label="Relation till dig"
                  value={faction.relationToPlayer}
                  display={faction.relationToPlayer.toFixed(0)}
                  tone={faction.relationToPlayer >= 50 ? 'green' : 'amber'}
                />
                <Meter
                  label="Folkligt stöd"
                  value={faction.publicSupport}
                  display={faction.publicSupport.toFixed(0)}
                  tone={faction.publicSupport < 25 ? 'red' : 'blue'}
                />
                <div>
                  <div className="meter-head">
                    <span className="meter-label">Blocktillhörighet</span>
                    <span className="meter-value">{faction.alignment.toFixed(0)}</span>
                  </div>
                  <div className="align-track">
                    <div className="align-marker" style={{ left: `${alignPct}%` }} />
                  </div>
                  <div className="align-legend">
                    <span>Öst</span>
                    <span>Väst</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </Panel>

      <Panel title="Stationer">
        <table>
          <thead>
            <tr>
              <th>Stad</th>
              <th>Land</th>
              <th>Djup</th>
              <th>Täckning</th>
              <th style={{ width: 150 }}>Exponering</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.house.stations.map((station) => (
              <tr key={station.id}>
                <td className="is-key">{station.city}</td>
                <td>{state.factions[station.nation]?.name ?? station.nation}</td>
                <td>{station.depth}/5</td>
                <td>{station.coverage.join(', ')}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 28 }}>{station.exposure.toFixed(0)}</span>
                    <Bar ratio={station.exposure / 100} tone={station.exposure > 50 ? 'red' : 'green'} />
                  </div>
                </td>
                <td>
                  {station.status === 'active' && <Tag tone="green">Aktiv</Tag>}
                  {station.status === 'dormant' && <Tag>Vilande</Tag>}
                  {station.status === 'burned' && <Tag tone="red">Bränd</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
