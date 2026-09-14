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
// P31 (ETAPP2_TEKNISK_SPEC.md avsnitt 6.2): härnessens rivalAttributionShare-
// kolumn måste skilja spelarens nyckel i Front.attribution från en rivals —
// samma "läs källan, upprepa den aldrig" som DISPLAY_THRESHOLDS/BOT_BALANCE.
export { PLAYER_ATTRIBUTION_KEY } from './resolve/steps/deliveries.js'
export type { WireEmitter } from './wire.js'
export { bidEstimate, DISPLAY_THRESHOLDS, BOT_BALANCE } from './queries.js'
// getProduct: paketets ENDA väg till produktkatalogen (avsnitt 6) för extern kod —
// packages/harness (P9) behöver den för att avgöra om en order gäller en
// restricted-produkt (Order har bara productId, inte en kopia av restricted-flaggan).
// computeUnitCostNow: appen (P21, spec 3.4) behöver den för att räkna marginal per
// aktivt kontrakt mot DAGENS kostnad (supplyCostIndex rör sig efter kontraktet
// tecknades), inte bara mot Contract.unitCostAtSigning.
export { getProduct, computeUnitCostNow } from './pricing.js'
