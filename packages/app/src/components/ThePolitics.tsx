// THE POLITICS — läsvy: tjänstemännen, gated av officialDisplay (P63,
// ETAPP5_TEKNISK_SPEC.md avsnitt 8: "Politikpanelen i UI:t: tjänstemän, agendor,
// ställning och relation — gated av Station.coverage som inkluderar 'cabinet'
// (fynd 1.4). Ingen ny mekanik."). Samma läsmönster som TheWorld/formationDisplay:
// en gated projektion från core, ingen egen gating-logik här.
import { officialDisplay } from '@seventh-front/core'
import type { GameState, Official } from '@seventh-front/core'
import { Meter, Panel, Tag } from './ui.js'

function statusTone(status: Official['status']): 'green' | 'amber' | 'red' {
  if (status === 'dead') return 'red'
  if (status === 'fallen') return 'amber'
  return 'green'
}

function groupByFaction(state: GameState): Map<string, Official[]> {
  const byFaction = new Map<string, Official[]>()
  for (const official of Object.values(state.officials)) {
    const group = byFaction.get(official.factionId)
    if (group) group.push(official)
    else byFaction.set(official.factionId, [official])
  }
  return byFaction
}

export function ThePolitics({ state }: { state: GameState }) {
  return (
    <>
      <h2 className="view-title">The Politics</h2>

      {[...groupByFaction(state).entries()].map(([factionId, officials]) => {
        const faction = state.factions[factionId]
        return (
          <Panel title={faction ? faction.name : factionId} key={factionId} flush>
            {officials.map((official) => {
              const display = officialDisplay(state, official)
              return (
                <div className="faction-card" key={display.id}>
                  <div className="faction-head">
                    <span className="faction-name">
                      {display.name} · {display.post}
                    </span>
                    <Tag tone={statusTone(official.status)}>{official.status}</Tag>
                    {!display.cabinetCoverage && <Tag>No cabinet coverage</Tag>}
                  </div>

                  <div className="faction-meters">
                    <Meter
                      label="Standing"
                      value={display.standing}
                      display={display.standing.toFixed(0)}
                      tone="blue"
                    />
                    <Meter
                      label="Relation to you"
                      value={display.relationToPlayer}
                      display={display.relationToPlayer.toFixed(0)}
                      tone={display.relationToPlayer >= 50 ? 'green' : 'amber'}
                    />
                    <Meter
                      label="Integrity"
                      value={display.integrity ?? 0}
                      display={display.integrity === null ? 'UNKNOWN' : display.integrity.toFixed(0)}
                      tone="amber"
                    />
                  </div>

                  <p className="banner-sub">Agenda: {display.agenda ?? 'UNKNOWN'}</p>
                </div>
              )
            })}
          </Panel>
        )
      })}
    </>
  )
}
