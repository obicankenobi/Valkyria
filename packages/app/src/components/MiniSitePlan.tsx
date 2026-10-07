// MiniSitePlan — P181 (ETAPP11_FORSLAG.md §8 punkt 7): en liten, icke-interaktiv tomtplan. Ny-parti-skärmen visar med den vad valet av specialisering ger i startpaketet: samma markplan
// och samma byggnader (tillgångsfabrikens, P178) som THE WORKS ritar, bara mindre och utan knappar. Geometrin delas med WorksPlan (worksLayout.ts).
import type { Facility } from '@seventh-front/core'
import { SLOT_GEOMETRY, groundAsset, groundHeight, slotRect } from '../worksLayout.js'

export function MiniSitePlan({ works, slots = 8, label, testId = 'mini-site-plan' }: { works: Pick<Facility, 'id' | 'kind'>[]; slots?: number; label: string; testId?: string }) {
  const height = groundHeight(slots)
  const pct = (n: number, of: number) => `${(n / of) * 100}%`
  return (
    <div className="mini-plan" role="img" aria-label={label} style={{ aspectRatio: `${SLOT_GEOMETRY.plotWidth} / ${height}` }} data-testid={testId}>
      <img className="mini-plan-ground" src={groundAsset(slots)} alt="" aria-hidden="true" draggable={false} />
      {works.map((w, i) => {
        const r = slotRect(i)
        return (
          <img
            key={w.id}
            className="mini-plan-building"
            src={`/art/works/${w.kind}.svg`}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ left: pct(r.x, SLOT_GEOMETRY.plotWidth), top: pct(r.y, height), width: pct(r.width, SLOT_GEOMETRY.plotWidth), height: pct(r.height, height) }}
            data-testid={`mini-plan-${w.kind}`}
          />
        )
      })}
    </div>
  )
}
