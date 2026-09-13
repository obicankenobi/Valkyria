// WireEvent-emitter, kausalkedjor, beskärning. Se ETAPP1_TEKNISK_SPEC.md avsnitt 2.6.
//
// Två saker lever här:
//  - createWireEmitter: bygger den här turens händelser med rätt id/turn och kedjar
//    dem ihop med causeId (id:t emit() returnerar — spec 2.6 regel 1).
//  - pruneWire: beskär state.wire till ett rullande fönster UTAN att göra en synlig
//    orsakskedja trasig (spec 2.6 regel 2, ny i v1.1). En kedja som tar slut mitt i
//    ser för spelaren ut som att spelet döljer något, när det bara har glömt.
import type { WireEvent } from './types.js'

// Arkitekturkonstanter för wire-systemet, fastställda i spec avsnitt 2.6. Inte
// balansdata (jämför CLAUDE.md hård regel 5) — de styr hur mycket historik som
// hålls, inte en spelregel P10:s balanspass någonsin skruvar på.
export const WIRE_WINDOW_TURNS = 8
export const WIRE_CHAIN_DEPTH = 3

export interface WireEmitter {
  emit: (e: Omit<WireEvent, 'id' | 'turn'>) => string
  thisTurnEvents: () => WireEvent[]
  allEvents: () => WireEvent[]
}

export function createWireEmitter(turn: number, previousWire: readonly WireEvent[]): WireEmitter {
  let seq = 0
  const thisTurn: WireEvent[] = []

  function emit(e: Omit<WireEvent, 'id' | 'turn'>): string {
    const id = `${turn}-${seq}`
    seq += 1
    const event: WireEvent = { id, turn, ...e }
    thisTurn.push(event)
    return id
  }

  return {
    emit,
    thisTurnEvents: () => thisTurn.slice(),
    allEvents: () => [...previousWire, ...thisTurn],
  }
}

// Behåller varje händelse vars turn ligger inom de WIRE_WINDOW_TURNS senaste
// turerna, plus den transitiva orsakskedjan bakåt — upp till WIRE_CHAIN_DEPTH led —
// för var och en av dem.
export function pruneWire(wire: readonly WireEvent[], turn: number): WireEvent[] {
  const byId = new Map(wire.map((e) => [e.id, e]))
  const recent = wire.filter((e) => e.turn > turn - WIRE_WINDOW_TURNS)

  const keep = new Set<string>()
  for (const e of recent) keep.add(e.id)

  for (const e of recent) {
    let cause = e.causeId ? byId.get(e.causeId) : undefined
    for (let depth = 0; depth < WIRE_CHAIN_DEPTH && cause; depth++) {
      keep.add(cause.id)
      cause = cause.causeId ? byId.get(cause.causeId) : undefined
    }
  }

  // En bevarad händelse vars EGEN orsak låg bortom WIRE_CHAIN_DEPTH led och därför
  // beskurits bort får sitt causeId satt till null i resultatet. Annars skulle en
  // synlig händelse peka på en osynlig — precis det regel 2 i spec 2.6 finns för
  // att förhindra. UI:t visar ändå aldrig mer än tre led bakåt, så det här är ingen
  // förlust av något som faktiskt går att rendera.
  //
  // Filtrera i ursprunglig (kronologisk) ordning snarare än att bygga om från
  // Set/Map-iterationsordning.
  return wire
    .filter((e) => keep.has(e.id))
    .map((e) => (e.causeId !== null && !keep.has(e.causeId) ? { ...e, causeId: null } : e))
}
