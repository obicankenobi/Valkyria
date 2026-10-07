// actionReport.test.ts — P164 (ETAPP10_FORSLAG.md §3b, S3): "Your actions" — en rad per handling, utfall och orsakskedja, avvisade i samma lista.
import { describe, expect, it } from 'vitest'
import { createInitialState, officialId, resolveTurn } from '@seventh-front/core'
import type { Bid, GameState, PlayerAction, StandingOrderChange } from '@seventh-front/core'
import { buildActionReport, describeAction } from '../src/actionReport.js'
import type { ActionReportInput } from '../src/actionReport.js'

function runTurn(seed: string, actions: PlayerAction[], extra: { bids?: Bid[]; standingOrders?: StandingOrderChange[] } = {}): ActionReportInput & { after: GameState } {
  const before = createInitialState('indochina-slice', seed)
  before.house.treasury = 5_000_000
  return runFrom(before, actions, extra)
}

function runFrom(before: GameState, actions: PlayerAction[], extra: { bids?: Bid[]; standingOrders?: StandingOrderChange[] } = {}) {
  const submission = { standingOrders: extra.standingOrders ?? [], bids: extra.bids ?? [], actions }
  const result = resolveTurn(before, submission)
  return { before, submission, wire: result.wire, rejected: result.rejected, after: result.state }
}

const station = (s: GameState) => s.house.stations[0]!

describe('buildActionReport — en rad per handling', () => {
  it('varje avgjord handling får sin egen rad, i inskickad ordning, med sitt utfall — även när utfallet är en ticker-rad', () => {
    const base = createInitialState('indochina-slice', 'report-seed-1')
    const actions: PlayerAction[] = [
      { type: 'INTEL', op: 'EXPAND', stationId: station(base).id },
      { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } },
    ]
    const input = runTurn('report-seed-1', actions)
    const rows = buildActionReport(input)
    expect(rows.map((r) => r.verb)).toEqual(['EXPAND', 'HIRE'])
    expect(rows[0]!.outcome).toMatch(/EXPANDED — DEPTH 1 → 2/)
    expect(rows[1]!.outcome).toMatch(/HIRES A NEW CHIEF ENGINEER/)
    // båda utfallen är ticker-rader i kärnan — de ska ändå med
    for (const row of rows) {
      const event = input.wire.find((e) => e.headline === row.outcome)!
      expect(event.severity).toBe('ticker')
      expect(row.status).toBe('done')
    }
  })

  it('en avvisad handling står i samma lista, med orsaken som utfall och utan orsakskedja', () => {
    const base = createInitialState('indochina-slice', 'report-seed-2')
    const hire: PlayerAction = { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }
    const actions: PlayerAction[] = [
      { type: 'INTEL', op: 'EXPAND', stationId: station(base).id },
      hire,
      { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } },
      hire, // fjärde handlingen: ingen handlingspoäng kvar (tre)
      { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefOfStaff' } },
    ]
    const input = runTurn('report-seed-2', actions)
    expect(input.rejected.length).toBe(2)
    const rows = buildActionReport(input)
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.status)).toEqual(['done', 'done', 'done', 'rejected', 'rejected'])
    expect(rows[3]!.outcome).toBe('no executive actions remaining')
    expect(rows[3]!.chain).toEqual([])
  })

  it('en handlings händelser hamnar på rätt rad: ett misslyckat LEAK får sina två följder, nästa handling tar inte över dem', () => {
    const base = createInitialState('indochina-slice', 'wire-dump')
    const rival = Object.values(base.rivals)[0]!
    const actions: PlayerAction[] = [
      { type: 'INTEL', op: 'EXPAND', stationId: station(base).id },
      { type: 'INTEL', op: 'LEAK', stationId: station(base).id, targetId: rival.id },
      { type: 'INTEL', op: 'TURN', stationId: station(base).id, targetId: officialId('rvn', 'procurement') },
    ]
    const rows = buildActionReport(runTurn('wire-dump', actions))
    expect(rows.map((r) => r.verb)).toEqual(['EXPAND', 'LEAK', 'TURN'])
    expect(rows[1]!.status).toBe('failed')
    expect(rows[1]!.outcome).toMatch(/TRACED BACK/)
    expect(rows[1]!.chain.map((c) => c.headline).join(' | ')).toMatch(/COUNTER-INTELLIGENCE SERVICE SHARPENS.*EXPOSURE RISES/)
    expect(rows[0]!.chain).toEqual([]) // EXPAND har inga följder
    expect(rows[2]!.outcome).toMatch(/TURNS DO VAN KHANH/)
    expect(rows[2]!.chain).toEqual([]) // och TURN fick inte LEAK:s följder
  })

  it('en följd som kärnan kopplat med causeId syns i kedjan, med djup', () => {
    // STAGE_INCIDENT: lyckat → relationer/heat/doomsday kopplas till incidentens id. Sök ett frö där incidenten lyckas.
    let found = false
    for (let i = 0; i < 40 && !found; i++) {
      const base = createInitialState('indochina-slice', `incident-${i}`)
      base.house.treasury = 5_000_000
      const rows = buildActionReport(runTurn(`incident-${i}`, [{ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50_000 }]))
      const row = rows[0]!
      if (row.status === 'done' && row.chain.length > 0) {
        found = true
        expect(row.outcome).toMatch(/INCIDENT STAGED AGAINST/)
        expect(row.chain.every((c) => c.depth >= 1)).toBe(true)
      }
    }
    expect(found).toBe(true)
  })

  it('missade och lyckade utfall skiljs åt av just de rubriker kärnan skriver (LEAK, SABOTAGE, TURN, STAGE_INCIDENT)', () => {
    const seen = new Map<string, Set<string>>()
    const mk = (verb: string, s: GameState): PlayerAction => {
      const st = station(s)
      const rival = Object.values(s.rivals)[0]!
      if (verb === 'LEAK' || verb === 'SABOTAGE') return { type: 'INTEL', op: verb, stationId: st.id, targetId: rival.id }
      if (verb === 'TURN') return { type: 'INTEL', op: 'TURN', stationId: st.id, targetId: officialId('rvn', 'procurement') }
      return { type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: 'rvn', spend: 50_000 }
    }
    for (const verb of ['LEAK', 'SABOTAGE', 'TURN', 'STAGE_INCIDENT']) {
      seen.set(verb, new Set())
      for (let i = 0; i < 60 && seen.get(verb)!.size < 2; i++) {
        const base = createInitialState('indochina-slice', `tone-${verb}-${i}`)
        base.house.treasury = 5_000_000
        const row = buildActionReport(runFrom(base, [mk(verb, base)]))[0]!
        seen.get(verb)!.add(row.status)
      }
      expect([...seen.get(verb)!].sort(), `${verb}: både lyckat och missat ska gå att se`).toEqual(['done', 'failed'])
    }
  })

  it('ett avvisat bud och en avvisad stående order står i samma lista, efter handlingarna', () => {
    const base = createInitialState('indochina-slice', 'report-seed-3')
    const bid = { orderId: 'no-such-order', price: 1000, grade: 'A' } as unknown as Bid
    const standing = { kind: 'LINE', op: 'SET', lineId: 'no-such-line', category: 'armour', shift: 'normal' } as unknown as StandingOrderChange
    const input = runFrom(base, [{ type: 'INTEL', op: 'EXPAND', stationId: station(base).id }], { bids: [bid], standingOrders: [standing] })
    const rows = buildActionReport(input)
    expect(rows[0]!.verb).toBe('EXPAND')
    expect(rows.slice(1).every((r) => r.status === 'rejected')).toBe(true)
    expect(rows.slice(1).length).toBe(input.rejected.length)
    expect(rows.some((r) => r.label === 'Bid' && r.detail === 'no-such-order')).toBe(true)
  })

  it('ett svar på en kris är inget verb och får ingen rad', () => {
    const base = createInitialState('indochina-slice', 'report-seed-4')
    const rows = buildActionReport(runFrom(base, [{ type: 'CRISIS', choice: 'BACK_DOWN' } as PlayerAction]))
    expect(rows).toEqual([])
  })

  it('stämmer omkörningen inte med det riktiga kvartalet visas raderna utan utfall i stället för ett gissat utfall', () => {
    const base = createInitialState('indochina-slice', 'report-seed-5')
    const input = runFrom(base, [{ type: 'INTEL', op: 'EXPAND', stationId: station(base).id }])
    const tampered = { ...input, wire: input.wire.slice(1) }
    const rows = buildActionReport(tampered)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ verb: 'EXPAND', status: 'done', outcome: 'Filed', chain: [] })
  })

  it('ingen handling = ingen rad, och inget omkörs', () => {
    const base = createInitialState('indochina-slice', 'report-seed-6')
    expect(buildActionReport(runFrom(base, []))).toEqual([])
  })
})

describe('describeAction', () => {
  it('namnger stationen, målet och beloppet', () => {
    const s = createInitialState('indochina-slice', 'describe-seed')
    const rival = Object.values(s.rivals)[0]!
    expect(describeAction(s, { type: 'INTEL', op: 'LEAK', stationId: station(s).id, targetId: rival.id })).toMatchObject({
      verb: 'LEAK',
      label: 'Leak against a rival',
      detail: `${station(s).city} → ${rival.name}`,
    })
    expect(describeAction(s, { type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: 'rvn', spend: 50_000 }).detail).toBe('Republic of Vietnam · £50,000')
    expect(describeAction(s, { type: 'INTERNAL', op: 'REPAY', payload: { amount: 1000 } }).detail).toBe('£1,000')
  })
})
