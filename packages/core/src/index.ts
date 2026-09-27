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
export {
  bidEstimate,
  playerWinCurve,
  boardReviewOutlook,
  DISPLAY_THRESHOLDS,
  BOT_BALANCE,
  INFLUENCE_BALANCE,
  effectiveDepth,
  formationDisplay,
  officialDisplay,
  deriveSectorControl,
  projectedQuarter,
  researchOutlook,
  estimateLineCompletionTurn,
} from './queries.js'
export type { PlayerWinCurvePoint, BoardReviewOutlook, ProjectedQuarter, CategoryResearchOutlook } from './queries.js'
// getProduct/allProducts: paketets ENDA väg till produktkatalogen (avsnitt 6) för
// extern kod — packages/harness (P9) behöver getProduct för att avgöra om en order
// gäller en restricted-produkt (Order har bara productId, inte en kopia av
// restricted-flaggan). allProducts (P85): THE COMPANY behöver hela katalogen för
// att visa R&D:s "vad låser den här kategorin upp härnäst" (researchOutlook).
// computeUnitCostNow: appen (P21, spec 3.4) behöver den för att räkna marginal per
// aktivt kontrakt mot DAGENS kostnad (supplyCostIndex rör sig efter kontraktet
// tecknades), inte bara mot Contract.unitCostAtSigning.
export { getProduct, allProducts, computeUnitCostNow } from './pricing.js'
// officialId: appen och testerna behöver kunna slå upp en faktions
// procurement-tjänsteman utan att duplicera id-schemat (P54, se officials.ts).
export { officialId, findOfficial } from './officials.js'
// P78 (ETAPP7_TEKNISK_SPEC.md §7.4): validateAction/previewAction — appens
// enda väg att pröva ett kort mot exakt samma regler som resolveTurn faktiskt
// använder (P79). ActionValidation/ActionPreview exporteras redan via
// `export * from './types.js'` ovan.
export { validateAction } from './validateAction.js'
export { previewAction } from './previewAction.js'
// P85: THE COMPANY behöver samma vaktade konstanter INTERNAL/MARKET-formulären
// redan valideras mot (validateAction.ts), i stället för att TheHouse.tsx
// (P21) upprepar sin egen lokala kopia av TECH_CATEGORIES/HIRABLE_ROLES.
export { COMMODITIES, TECH_CATEGORIES, HIRABLE_ROLES } from './validateAction.js'
export type { HirableRole } from './validateAction.js'
