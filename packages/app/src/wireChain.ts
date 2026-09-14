// wireChain — orsakskedjan bakåt för en WireEvent, för THE WIRE:s utfällbara
// kedjor. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8: "max tre led bakåt via causeId."
import { WIRE_CHAIN_DEPTH } from '@seventh-front/core'
import type { WireEvent } from '@seventh-front/core'

export function causeChain(wire: readonly WireEvent[], event: WireEvent): WireEvent[] {
  const byId = new Map(wire.map((e) => [e.id, e]))
  const chain: WireEvent[] = []

  let current = event
  for (let depth = 0; depth < WIRE_CHAIN_DEPTH; depth++) {
    if (current.causeId === null) break
    const cause = byId.get(current.causeId)
    if (!cause) break // beskuret bort (utanför fönstret) — se pruneWire
    chain.push(cause)
    current = cause
  }

  return chain
}
