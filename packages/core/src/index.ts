// Publikt paketgränssnitt för @seventh-front/core.
//
// Fler exports läggs till allteftersom respektive prompt i
// ETAPP1_TEKNISK_SPEC.md avsnitt 10 bygger dem.
export * from './types.js'
export * from './rng.js'
export { round } from './money.js'
export { createInitialState, cloneState } from './state.js'
export { resolveTurn } from './resolve/index.js'
export { createWireEmitter, pruneWire, WIRE_WINDOW_TURNS, WIRE_CHAIN_DEPTH } from './wire.js'
export type { WireEmitter } from './wire.js'
export { bidEstimate, DISPLAY_THRESHOLDS } from './queries.js'
// getProduct: paketets ENDA väg till produktkatalogen (avsnitt 6) för extern kod —
// packages/harness (P9) behöver den för att avgöra om en order gäller en
// restricted-produkt (Order har bara productId, inte en kopia av restricted-flaggan).
export { getProduct } from './pricing.js'
