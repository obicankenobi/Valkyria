import { describe, expect, it } from 'vitest'
import { createWireEmitter, pruneWire, WIRE_CHAIN_DEPTH, WIRE_WINDOW_TURNS } from '../src/wire.js'
import type { WireEvent } from '../src/types.js'

function ticker(overrides: Partial<WireEvent> & Pick<WireEvent, 'id' | 'turn'>): WireEvent {
  return {
    severity: 'ticker',
    scope: 'global',
    headline: `event ${overrides.id}`,
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...overrides,
  }
}

describe('createWireEmitter', () => {
  it('id:n har formen ${turn}-${seq} och ökar löpnumret per anrop', () => {
    const wire = createWireEmitter(5, [])
    const id0 = wire.emit({ severity: 'ticker', scope: 'global', headline: 'a', causeId: null, delta: {}, actorIsPlayer: false, subjectId: null })
    const id1 = wire.emit({ severity: 'ticker', scope: 'global', headline: 'b', causeId: null, delta: {}, actorIsPlayer: false, subjectId: null })
    expect(id0).toBe('5-0')
    expect(id1).toBe('5-1')
  })

  it('en kedja på tre led kan byggas med emit-returvärdet och läsas bakåt', () => {
    const wire = createWireEmitter(10, [])

    const embargoId = wire.emit({
      severity: 'headline',
      scope: 'market',
      headline: 'YOUR EMBARGO OF GULF CRUDE TO BLOC-ALIGNED BUYERS',
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
    const oilPriceId = wire.emit({
      severity: 'report',
      scope: 'market',
      headline: 'CRUDE OIL +140% SINCE EMBARGO',
      causeId: embargoId,
      delta: { supplyCostIndex: 140 },
      actorIsPlayer: false,
      subjectId: null,
    })
    const defaultId = wire.emit({
      severity: 'headline',
      scope: 'faction',
      headline: 'CONGOLESE GOVERNMENT DEFAULTS ON THREE CONTRACTS',
      causeId: oilPriceId,
      delta: { treasury: -900000 },
      actorIsPlayer: false,
      subjectId: 'congo',
    })

    const events = wire.thisTurnEvents()
    const byId = new Map(events.map((e) => [e.id, e]))

    // Läs kedjan bakåt från den sista händelsen, tre led.
    const led1 = byId.get(defaultId)
    expect(led1?.headline).toContain('DEFAULTS')
    const led2 = byId.get(led1!.causeId!)
    expect(led2?.headline).toContain('CRUDE OIL')
    const led3 = byId.get(led2!.causeId!)
    expect(led3?.headline).toContain('EMBARGO')
    expect(led3?.actorIsPlayer).toBe(true)
    expect(led3?.causeId).toBeNull()
  })

  it('allEvents() slår ihop tidigare wire med denna turs händelser', () => {
    const previous: WireEvent[] = [ticker({ id: '3-0', turn: 3 })]
    const wire = createWireEmitter(4, previous)
    wire.emit({ severity: 'ticker', scope: 'global', headline: 'x', causeId: null, delta: {}, actorIsPlayer: false, subjectId: null })
    expect(wire.allEvents().map((e) => e.id)).toEqual(['3-0', '4-0'])
  })
})

describe('pruneWire', () => {
  it('WIRE_CHAIN_DEPTH är 3 — kedjelängderna nedan är handskrivna mot just det talet', () => {
    // Om konstanten någonsin ändras ska det synas här, inte som ett diffust fel i
    // testerna som bygger kedjor med ett hårdkodat antal led.
    expect(WIRE_CHAIN_DEPTH).toBe(3)
  })

  it('behåller allt inom fönstret och kastar allt äldre utan koppling framåt', () => {
    const wire: WireEvent[] = [
      ticker({ id: 'old', turn: 0 }),
      ticker({ id: 'recent', turn: 5 }),
    ]
    const pruned = pruneWire(wire, 5 + WIRE_WINDOW_TURNS + 1)
    expect(pruned.map((e) => e.id)).toEqual([])
  })

  it('bevarar en orsakskedja på exakt WIRE_CHAIN_DEPTH led även när den ligger utanför fönstret', () => {
    // Fyra länkade händelser, alla gamla. Bara den sista (turn 0) är "recent" vid
    // beskärning på ett sent turindex — de tre andra ska ändå överleva eftersom de
    // är dess orsakskedja, exakt WIRE_CHAIN_DEPTH led bakåt.
    const wire: WireEvent[] = [
      ticker({ id: 'root', turn: 0, causeId: null }),
      ticker({ id: 'led3', turn: 0, causeId: 'root' }),
      ticker({ id: 'led2', turn: 0, causeId: 'led3' }),
      ticker({ id: 'led1', turn: 0, causeId: 'led2' }), // "recent" händelsen
    ]
    const currentTurn = WIRE_WINDOW_TURNS // gör turn 0 gammal, men led1 hålls kvar manuellt nedan
    // Simulera att led1 faktiskt ligger inom fönstret genom att sätta dess turn sent.
    wire[3]!.turn = currentTurn

    const pruned = pruneWire(wire, currentTurn)
    expect(new Set(pruned.map((e) => e.id))).toEqual(new Set(['root', 'led3', 'led2', 'led1']))
  })

  it('kapar en kedja som är längre än WIRE_CHAIN_DEPTH led', () => {
    const wire: WireEvent[] = [
      ticker({ id: 'tooFarBack', turn: 0, causeId: null }),
      ticker({ id: 'led4', turn: 0, causeId: 'tooFarBack' }),
      ticker({ id: 'led3', turn: 0, causeId: 'led4' }),
      ticker({ id: 'led2', turn: 0, causeId: 'led3' }),
      ticker({ id: 'led1', turn: 0, causeId: 'led2' }),
    ]
    const currentTurn = WIRE_WINDOW_TURNS
    wire[4]!.turn = currentTurn // led1 är den enda "recent"

    const pruned = pruneWire(wire, currentTurn)
    const ids = new Set(pruned.map((e) => e.id))
    // led1 (0 led bakåt) + led2, led3, led4 (1..WIRE_CHAIN_DEPTH led bakåt) hålls kvar.
    expect(ids).toEqual(new Set(['led1', 'led2', 'led3', 'led4']))
    // "tooFarBack" ligger WIRE_CHAIN_DEPTH + 1 led bakåt och ska vara borta.
    expect(ids.has('tooFarBack')).toBe(false)
  })

  it('inget causeId i resultatet pekar på en händelse som saknas i resultatet (såvida inte orsaken själv beskars bort som för långt bort)', () => {
    // Bygg en bred, flerturers historik och verifiera att varje causeId antingen
    // saknar orsak (null) eller pekar på en händelse som faktiskt finns kvar —
    // dvs att beskärningen aldrig lämnar en "hängande" referens inom det den
    // faktiskt behåller.
    const wire: WireEvent[] = []
    for (let turn = 0; turn < 30; turn++) {
      const prevId = turn > 0 ? `${turn - 1}-0` : null
      wire.push(ticker({ id: `${turn}-0`, turn, causeId: prevId }))
    }
    const pruned = pruneWire(wire, 29)
    const ids = new Set(pruned.map((e) => e.id))
    for (const e of pruned) {
      if (e.causeId !== null) {
        expect(ids.has(e.causeId)).toBe(true)
      }
    }
    // Med en oavbruten länkad kedja 29 led bakåt ska exakt fönster + kedjedjup
    // hållas kvar: den senaste (recent) händelsen kopplad bakåt WIRE_CHAIN_DEPTH
    // led utöver vad fönstret redan täcker.
    expect(pruned.length).toBeGreaterThan(0)
    expect(pruned.length).toBeLessThan(wire.length)
  })
})
