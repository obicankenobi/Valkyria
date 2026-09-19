// THE WORLD — läsvy: fronter, faktioner, heat, DOOMSDAY, stationer. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8, DESIGN.md avsnitt 18. Fronterna ritas som
// en schematisk sektortavla (P66, ETAPP6_TEKNISK_SPEC.md §4, DESIGN.md §18
// reviderat 2026-09-18) — se SectorBoard.tsx.
import { DISPLAY_THRESHOLDS, formationDisplay } from '@seventh-front/core'
import type { Front, FormationDisplay, GameState } from '@seventh-front/core'
import { SECTOR_LAYOUTS } from '../sectorLayout.js'
import { SectorBoard, statusTone, strengthBandTone } from './SectorBoard.js'
import { Bar, Meter, Panel, Tag } from './ui.js'

function doomsdayTone(value: number): 'green' | 'amber' | 'red' {
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'red'
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'amber'
  return 'green'
}

// P41 (avsnitt 5.5): "THE_WORLD-specens deriveDeployment blir överflödig och
// ersätts: förbanden har redan en sectorId. Utgruppering behöver inte längre
// härledas — den finns." Grupperar bara, härleder ingenting.
//
// P66/P67 (ETAPP6_TEKNISK_SPEC.md §4.6): SectorBoard ersätter den här
// textlistan för varje theatre som redan har en post i SECTOR_LAYOUTS —
// P66 (front-1/indochina), P67 (front-laos/laos), utan att röra en rad här
// eller i SectorBoard.tsx (bara en ny dataspost). Funktionen och
// OldFrontCard nedan lever kvar oanvända av dagens enda scenario, men är
// fortfarande skyddsräcke 4:s helhetsfall för en FRAMTIDA theatre utan
// layoutdata — inte dödkod att städa bort.
function groupBySector(state: GameState, front: Front): Map<string, FormationDisplay[]> {
  const bySector = new Map<string, FormationDisplay[]>()
  for (const formation of front.formations) {
    const display = formationDisplay(state, formation)
    const group = bySector.get(display.sectorId)
    if (group) group.push(display)
    else bySector.set(display.sectorId, [display])
  }
  return bySector
}

// Den gamla, rent typografiska framställningen (fallback, skyddsräcke 4) —
// oförändrad sedan P41, bara utbruten till en egen komponent så SectorBoard
// kan ta över för de theatres som har layoutdata utan att duplicera JSX:en
// för sidhuvud/mätare i själva .map()-anropet.
function OldFrontCard({ front, state }: { front: Front; state: GameState }) {
  const sideA = state.factions[front.sideA]
  const sideB = state.factions[front.sideB]
  const markerPct = ((front.position + 100) / 200) * 100
  const totalCasualties = front.casualtiesTotal.a + front.casualtiesTotal.b
  // P46 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2/8): "visa per front i THE WORLD
  // vilka kontrakt som matar den." Bara aktiva/sena — fulfilled/voided
  // levererar inte mer.
  const feedingContracts = state.market.contracts.filter(
    (c) => c.frontId === front.id && (c.status === 'active' || c.status === 'late'),
  ).length

  return (
    <div className="front">
      <div className="front-sides">
        <span className="side-a">{sideA ? sideA.name : front.sideA}</span>
        <span className="meter-label">
          {front.id} · attacking: side {front.attacker.toUpperCase()} · {totalCasualties} casualties ·{' '}
          {feedingContracts} contract{feedingContracts === 1 ? '' : 's'} feeding
        </span>
        <span className="side-b">{sideB ? sideB.name : front.sideB}</span>
      </div>

      <div className="frontline">
        <div className="frontline-center" />
        <div className="frontline-marker" style={{ left: `${markerPct}%` }} />
      </div>

      <div className="front-stats">
        <Meter label="Morale A" value={front.morale.a} display={front.morale.a.toFixed(0)} tone="blue" />
        <Meter label="Morale B" value={front.morale.b} display={front.morale.b.toFixed(0)} tone="red" />
        <Meter
          label="Strength A"
          value={front.strength.a}
          max={Math.max(front.strength.a, front.strength.b, 1)}
          display={front.strength.a.toFixed(0)}
          tone="blue"
        />
        <Meter
          label="Strength B"
          value={front.strength.b}
          max={Math.max(front.strength.a, front.strength.b, 1)}
          display={front.strength.b.toFixed(0)}
          tone="red"
        />
      </div>

      {/* P41 (avsnitt 5.1/5.5): förbanden, grupperade per sectorId — inte en
          karta (DESIGN.md §18/§21), samma typografiska lägesbord som resten
          av vyn. Namn/readiness/equipment dimmas per formationDisplay
          (skyddsräcke 3); status/doktrin/sektor visas alltid. */}
      {front.formations.length > 0 && (
        <div className="front-formations">
          {[...groupBySector(state, front).entries()].map(([sectorId, formations]) => (
            <div className="front-sector" key={sectorId}>
              <div className="front-sector-head">{sectorId.toUpperCase()}</div>
              {formations.map((formation) => (
                <div className="formation-row" key={formation.id}>
                  <span className={formation.side === 'a' ? 'side-a' : 'side-b'}>{formation.name}</span>
                  <span className="mono">{formation.doctrine}</span>
                  <Tag tone={statusTone(formation.status)}>{formation.status}</Tag>
                  <Tag tone={strengthBandTone(formation.strengthBand)}>{formation.strengthBand}</Tag>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
            label="Current level"
            value={state.doomsday}
            display={state.doomsday.toFixed(0)}
            tone={doomsdayTone(state.doomsday)}
            marks={[
              { at: DISPLAY_THRESHOLDS.doomsdayCrisisWatch, label: 'watch' },
              { at: DISPLAY_THRESHOLDS.doomsdayCrisisEvent, label: 'crisis' },
              { at: DISPLAY_THRESHOLDS.doomsdayNuclearExchange, label: 'exchange' },
            ]}
          />
          <p className="banner-sub" style={{ marginTop: 18 }}>
            Peak level so far: <span className="mono">{state.doomsdayPeak.toFixed(0)}</span>. The peak value decides
            the epilogue's verdict on restraint, not the final value.
          </p>
        </Panel>

        <Panel title="Theatres">
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.values(state.theatres).map((theatre) => (
              <Meter
                key={theatre.id}
                label={theatre.name}
                value={theatre.heat}
                display={theatre.heat.toFixed(0)}
                tone={theatre.heat >= DISPLAY_THRESHOLDS.heatEscalation ? 'red' : 'amber'}
                marks={[{ at: DISPLAY_THRESHOLDS.heatEscalation, label: 'escalation' }]}
              />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Fronts" flush>
        {Object.values(state.fronts).map((front) =>
          // P66/P67 (ETAPP6_TEKNISK_SPEC.md §4.6): SectorBoard ersätter hela
          // det gamla per-front-kortet för varje theatre SECTOR_LAYOUTS
          // känner till — i dag båda (front-1/indochina, front-laos/laos).
          // OldFrontCard nedan är skyddsräcke 4:s helhetsfall för en
          // FRAMTIDA theatre utan layoutdata, inte en bugg eller dödkod.
          SECTOR_LAYOUTS[front.theatreId] ? (
            <SectorBoard front={front} state={state} key={front.id} />
          ) : (
            <OldFrontCard front={front} state={state} key={front.id} />
          ),
        )}
      </Panel>

      <Panel title="Factions" flush>
        {Object.values(state.factions).map((faction) => {
          const alignPct = ((faction.alignment + 100) / 200) * 100
          return (
            <div className="faction-card" key={faction.id}>
              <div className="faction-head">
                <span className="faction-name">{faction.name}</span>
                {faction.bankrupt && <Tag tone="red">Bankrupt</Tag>}
                {faction.embargoed && <Tag tone="amber">Embargo</Tag>}
                {!faction.bankrupt && !faction.embargoed && <Tag tone="green">Trading</Tag>}
              </div>

              <div className="faction-meters">
                <Meter
                  label="Relation to you"
                  value={faction.relationToPlayer}
                  display={faction.relationToPlayer.toFixed(0)}
                  tone={faction.relationToPlayer >= 50 ? 'green' : 'amber'}
                />
                <Meter
                  label="Public support"
                  value={faction.publicSupport}
                  display={faction.publicSupport.toFixed(0)}
                  tone={faction.publicSupport < 25 ? 'red' : 'blue'}
                />
                <div>
                  <div className="meter-head">
                    <span className="meter-label">Bloc alignment</span>
                    <span className="meter-value">{faction.alignment.toFixed(0)}</span>
                  </div>
                  <div className="align-track">
                    <div className="align-marker" style={{ left: `${alignPct}%` }} />
                  </div>
                  <div className="align-legend">
                    <span>East</span>
                    <span>West</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </Panel>

      <Panel title="Stations">
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Nation</th>
              <th>Depth</th>
              <th>Coverage</th>
              <th style={{ width: 150 }}>Exposure</th>
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
                  {station.status === 'active' && <Tag tone="green">Active</Tag>}
                  {station.status === 'dormant' && <Tag>Dormant</Tag>}
                  {station.status === 'burned' && <Tag tone="red">Burned</Tag>}
                  {/* P29 (avsnitt 4.2): "ett slutvillkor spelaren inte ser komma är
                      inte ett beslut" — samma tröskel wire-reporten (upkeep.ts)
                      redan varnar mot, läst härifrån (DISPLAY_THRESHOLDS). */}
                  {station.status === 'active' && station.exposure > DISPLAY_THRESHOLDS.exposureBurnThreshold && (
                    <Tag tone="amber">Under surveillance</Tag>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
