// SECTOR BOARD — en fronts fullständiga kort: sidor, moral/styrka, och en
// schematisk regiontavla i stället för den gamla panellistan (P66,
// ETAPP6_TEKNISK_SPEC.md §4.4). Ersätter TheWorld.tsx:s hela gamla
// per-front-markup (rad 86–158 i filen §4.4 hänvisar till) för varje theatre
// SECTOR_LAYOUTS redan känner till. INTE en geografiskt korrekt karta, INTE en
// hexkarta (DESIGN.md §18/§21, reviderat 2026-09-18) — sektorernas placering
// är fast, handgjord layoutdata (sectorLayout.ts), inte härledd geografi.
//
// P66 byggde sidhuvudet, moral/styrka-mätarna, linjerna, noderna och klick-
// för-att-expandera (§4.4 punkt 1/2/4). P68 (§4.4 punkt 3) lägger till
// frontlinje-indikatorn — front.position (plus de tre föregående värdena i
// front.trace, tonade svagare) interpolerat linjärt över sektorernas x/y i
// LISTORDNING (inte grannskapsgrafen — de råkar sammanfalla här eftersom
// båda theatres redan är en linjär kedja, men interpolateFrontPosition
// läser explicit `layout`-arrayen, aldrig `neighbours`).
import { useState } from 'react'
import { deriveSectorControl } from '@seventh-front/core'
import type { Front, FormationDisplay, GameState, SectorControl } from '@seventh-front/core'
import { SECTOR_LAYOUTS } from '../sectorLayout.js'
import type { SectorLayoutEntry } from '../sectorLayout.js'
import { Meter, Tag } from './ui.js'

export function statusTone(status: FormationDisplay['status']): 'green' | 'amber' | 'red' | 'neutral' {
  if (status === 'destroyed') return 'red'
  if (status === 'mauled') return 'amber'
  if (status === 'refitting') return 'neutral'
  return 'green'
}

export function strengthBandTone(band: FormationDisplay['strengthBand']): 'green' | 'amber' | 'red' {
  if (band === 'stark') return 'green'
  if (band === 'medel') return 'amber'
  return 'red'
}

function FormationList({ formations }: { formations: FormationDisplay[] }) {
  if (formations.length === 0) {
    return <p className="banner-sub">No formations here.</p>
  }
  return (
    <>
      {formations.map((formation) => (
        <div className="formation-row" key={formation.id}>
          <span className={formation.side === 'a' ? 'side-a' : 'side-b'}>{formation.name}</span>
          <span className="mono">{formation.doctrine}</span>
          <Tag tone={statusTone(formation.status)}>{formation.status}</Tag>
          <Tag tone={strengthBandTone(formation.strengthBand)}>{formation.strengthBand}</Tag>
        </div>
      ))}
    </>
  )
}

// Skyddsräcke 4 (§6): en sektor `deriveSectorControl` känner till men som
// SECTOR_LAYOUTS saknar en post för (nytt scenario, inte uppdaterad
// layoutdata) — fallback-rad, samma stil som den gamla listan, aldrig en
// krasch.
function UnlayoutedSectors({ controls }: { controls: SectorControl[] }) {
  if (controls.length === 0) return null
  return (
    <div className="front-formations" data-testid="sector-board-unlayouted">
      {controls.map((control) => (
        <div className="front-sector" key={control.sectorId}>
          <div className="front-sector-head">{control.sectorId.toUpperCase()} (no layout data)</div>
          <FormationList formations={control.formations} />
        </div>
      ))}
    </div>
  )
}

// Varje par listas åt BÅDA håll i SECTOR_LAYOUTS (hue→da-nang OCH da-nang→hue)
// — en linje per PAR, inte per riktning.
function uniqueEdges(layout: SectorLayoutEntry[]): [SectorLayoutEntry, SectorLayoutEntry][] {
  const byId = new Map(layout.map((entry) => [entry.sectorId, entry]))
  const seen = new Set<string>()
  const edges: [SectorLayoutEntry, SectorLayoutEntry][] = []
  for (const entry of layout) {
    for (const neighbourId of entry.neighbours) {
      const neighbour = byId.get(neighbourId)
      if (!neighbour) continue
      const key = [entry.sectorId, neighbourId].sort().join('::')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([entry, neighbour])
    }
  }
  return edges
}

// P68 (ETAPP6_TEKNISK_SPEC.md §4.4 punkt 3): "front.position ... interpolerat
// linjärt över sektorernas x/y i den ordning de listas för theatern — en ren
// visualisering av samma skalär TheWorld.tsx redan ritar som en 1D-markör,
// bara projicerad på tavlans två dimensioner i stället för en rak linje."
// position går -100 (sida A vunnit, längst mot layout[0]) … +100 (sida B
// vunnit, längst mot layout[sista]) — samma skala den gamla `markerPct`-
// beräkningen (`(position + 100) / 200`) redan använde. Klampad — position
// är redan -100..100 per types.ts, men en framtida ändring ska aldrig kunna
// producera en koordinat utanför tavlan.
export function interpolateFrontPosition(layout: SectorLayoutEntry[], position: number): { x: number; y: number } {
  const first = layout[0]
  if (!first) return { x: 50, y: 50 } // tom layout når aldrig hit i praktiken — SectorBoard renderar bara med layout.length > 0
  if (layout.length === 1) return { x: first.x, y: first.y }

  const clamped = Math.max(-100, Math.min(100, position))
  const t = (clamped + 100) / 200 // 0..1
  const segments = layout.length - 1
  const scaled = t * segments
  const index = Math.min(Math.floor(scaled), segments - 1)
  const localT = scaled - index

  const from = layout[index]!
  const to = layout[index + 1]!
  return {
    x: from.x + (to.x - from.x) * localT,
    y: from.y + (to.y - from.y) * localT,
  }
}

// Sidhuvudet och moral/styrka-mätarna, oförändrade mot den gamla markupen —
// samma information, bara den gamla 1D-frontlinjestapeln och den gamla
// textlistan under den bytt mot tavlan.
function FrontHeader({ front, state }: { front: Front; state: GameState }) {
  const sideA = state.factions[front.sideA]
  const sideB = state.factions[front.sideB]
  const totalCasualties = front.casualtiesTotal.a + front.casualtiesTotal.b
  // P46 (ETAPP4_TEKNISK_SPEC.md avsnitt 3.2/8): "visa per front i THE WORLD
  // vilka kontrakt som matar den." Bara aktiva/sena — fulfilled/voided
  // levererar inte mer.
  const feedingContracts = state.market.contracts.filter(
    (c) => c.frontId === front.id && (c.status === 'active' || c.status === 'late'),
  ).length

  return (
    <>
      <div className="front-sides">
        <span className="side-a">{sideA ? sideA.name : front.sideA}</span>
        <span className="meter-label">
          {front.id} · attacking: side {front.attacker.toUpperCase()} · {totalCasualties} casualties ·{' '}
          {feedingContracts} contract{feedingContracts === 1 ? '' : 's'} feeding
        </span>
        <span className="side-b">{sideB ? sideB.name : front.sideB}</span>
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
    </>
  )
}

export function SectorBoard({ front, state }: { front: Front; state: GameState }) {
  const [expandedSectorId, setExpandedSectorId] = useState<string | null>(null)
  const layout = SECTOR_LAYOUTS[front.theatreId]
  const controls = deriveSectorControl(state, front)

  // Ingen layoutdata alls för den här theatern (ETAPP6_TEKNISK_SPEC.md §4.2:
  // "känd begränsning" tills en framtida prompt/scenario lägger till den) —
  // skyddsräcke 4:s helhetsfall: sidhuvud/mätare som vanligt, sektorerna som
  // en enkel textlista, ingen krasch.
  if (!layout) {
    return (
      <div className="front">
        <FrontHeader front={front} state={state} />
        <UnlayoutedSectors controls={controls} />
      </div>
    )
  }

  const controlBySector = new Map(controls.map((control) => [control.sectorId, control]))
  const layoutIds = new Set(layout.map((entry) => entry.sectorId))
  const unlayoutedControls = controls.filter((control) => !layoutIds.has(control.sectorId))
  const edges = uniqueEdges(layout)
  const expandedControl = expandedSectorId ? controlBySector.get(expandedSectorId) : undefined
  const expandedEntry = expandedSectorId ? layout.find((entry) => entry.sectorId === expandedSectorId) : undefined

  // §4.4 punkt 3, ordagrant: "de TRE föregående värdena i front.trace" — inte
  // alla fyra FRONT_TRACE_LENGTH kan hålla (fronts.ts). trace:s sista element
  // är den SENASTE föregående positionen (pushad före front.position
  // uppdateras samma tur, se fronts.ts), så de tre sista är exakt "de tre
  // föregående", äldst→nyast i arrayen. Visas nyast→äldst (mest → minst
  // synlig) för att tondämpningen ska läsas som "bakåt i tiden".
  const tracePositions = front.trace.slice(-3).reverse()

  return (
    <div className="front">
      <FrontHeader front={front} state={state} />

      <div className="sector-board">
        <svg className="sector-board-svg" viewBox="0 0 100 100" role="img" aria-label={`${front.theatreId} sector board`}>
          {edges.map(([a, b]) => (
            <line key={`${a.sectorId}-${b.sectorId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sector-edge" />
          ))}
          {layout.map((entry) => {
            const control = controlBySector.get(entry.sectorId) ?? {
              sectorId: entry.sectorId,
              side: 'empty' as const,
              formations: [],
            }
            return (
              <g
                key={entry.sectorId}
                className="sector-node-group"
                data-testid={`sector-node-${entry.sectorId}`}
                onClick={() => setExpandedSectorId((current) => (current === entry.sectorId ? null : entry.sectorId))}
              >
                <circle cx={entry.x} cy={entry.y} r={4} className={`sector-node is-${control.side}`} />
                <text x={entry.x} y={entry.y + 8} className="sector-node-label" textAnchor="middle">
                  {entry.label}
                </text>
              </g>
            )
          })}
          {tracePositions.map((tracePosition, i) => {
            const point = interpolateFrontPosition(layout, tracePosition)
            return (
              <circle
                key={`trace-${i}`}
                cx={point.x}
                cy={point.y}
                r={2}
                className="frontline-marker-trace"
                style={{ opacity: 0.5 - i * 0.15 }}
                data-testid={`frontline-marker-trace-${i}`}
              />
            )
          })}
          {(() => {
            const point = interpolateFrontPosition(layout, front.position)
            return <circle cx={point.x} cy={point.y} r={2.6} className="frontline-marker" data-testid="frontline-marker" />
          })()}
        </svg>

        {expandedEntry && (
          <div className="front-formations" data-testid="sector-detail">
            <div className="front-sector-head">{expandedEntry.label}</div>
            <FormationList formations={expandedControl?.formations ?? []} />
          </div>
        )}

        <UnlayoutedSectors controls={unlayoutedControls} />
      </div>
    </div>
  )
}
