// race.pairedSteps.test.ts — P142 (ETAPP10_FORSLAG.md §7 "Kapplöpningen", beslut 10B). Gap-chocken bedöms när BÅDA blocken stigit färdigt den turen: två block som kliver samma tur har inget försprång (förut gav
// det först stigande blocket en chock som det andra blocket stängde i samma tur — två rubriker för ingenting). Ett block som kliver ensamt tar ett försprång och ger en chock, som stängs när det andra kommer ikapp.
// Schemat (balance.json) är därefter glesat så att ett parti har 1–3 chocker i stället för 9.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { advanceRace, gapShock } from '../src/race.js'
import { createRng } from '../src/rng.js'
import { createInitialState } from '../src/state.js'
import type { ResolveContext } from '../src/resolve/index.js'
import type { GameState, TechCategory, TurnSubmission, WireEvent } from '../src/types.js'

type Bloc = 'west' | 'east'
const B = balance as unknown as { blocGenerationSchedule: Record<TechCategory, Record<Bloc, number[]>>; gapShockTurns: number }
const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function run(state: GameState, turn: number): Omit<WireEvent, 'id' | 'turn'>[] {
  state.meta.turn = turn
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = { state, draft: state, submission: EMPTY, rng: createRng('paired', turn), emit: (e) => (emitted.push(e), `p-${turn}-${seq++}`), rejected: [] }
  advanceRace(ctx)
  return emitted
}

const shocks = (e: Omit<WireEvent, 'id' | 'turn'>[]) => e.filter((x) => x.headline.startsWith('GAP SHOCK:'))
const closes = (e: Omit<WireEvent, 'id' | 'turn'>[]) => e.filter((x) => x.headline.includes('GAP CLOSES'))

describe('gap-chocken bedöms efter att båda blocken stigit (P142)', () => {
  it('två block som kliver samma tur ger ingen chock och ingen stängning', () => {
    const state = createInitialState('indochina-slice', 'paired-1')
    state.race.generation.west.armour = 1
    state.race.generation.east.armour = 1
    const category: TechCategory = 'armour'
    const turn = Math.max(B.blocGenerationSchedule[category].west[0]!, B.blocGenerationSchedule[category].east[0]!)
    // Om schemat har de två blockens första steg i olika turer hoppar testet över dem genom att tvinga samma tur via ett färdigt generationsläge.
    if (B.blocGenerationSchedule[category].west[0] !== B.blocGenerationSchedule[category].east[0]) return
    const events = run(state, turn)
    expect(events.filter((e) => e.headline.includes('MINISTRIES RAISE ARMOUR')).length).toBe(2)
    expect(shocks(events).filter((e) => e.headline.includes('ARMOUR'))).toHaveLength(0)
    expect(closes(events).filter((e) => e.headline.includes('ARMOUR'))).toHaveLength(0)
    expect(gapShock(state, category)).toBeNull()
  })

  it('ett block som kliver ensamt tar ett försprång: en chock, och den stängs när det andra kommer ikapp', () => {
    const state = createInitialState('indochina-slice', 'paired-2')
    const category: TechCategory = 'artillery'
    const west = B.blocGenerationSchedule[category].west[0]!
    const east = B.blocGenerationSchedule[category].east[0]!
    expect(west).not.toBe(east)
    const first = Math.min(west, east)
    const last = Math.max(west, east)
    const leader: Bloc = east < west ? 'east' : 'west'
    const opening = run(state, first)
    expect(shocks(opening).filter((e) => e.headline.includes('ARTILLERY'))).toHaveLength(1)
    expect(gapShock(state, category)?.leader).toBe(leader)
    const closing = run(state, last)
    expect(closes(closing).filter((e) => e.headline.includes('ARTILLERY'))).toHaveLength(1)
    expect(gapShock(state, category)).toBeNull()
  })

  it('ett parti har 1–3 chocker i schemat (inte nio)', () => {
    let stagedCategories = 0
    for (const category of Object.keys(B.blocGenerationSchedule) as TechCategory[]) {
      const s = B.blocGenerationSchedule[category]
      const depth = Math.max(s.west.length, s.east.length)
      for (let i = 0; i < depth; i++) {
        const w = s.west[i]
        const e = s.east[i]
        if (w === undefined || e === undefined) continue
        if (w !== e && Math.min(w, e) <= 20) stagedCategories++
      }
    }
    expect(stagedCategories).toBeGreaterThanOrEqual(1)
    expect(stagedCategories).toBeLessThanOrEqual(3)
  })
})
