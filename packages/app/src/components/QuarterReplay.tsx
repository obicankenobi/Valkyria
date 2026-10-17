// P196: the quarter replay now lives in MapQuarterReplay (a compact dock along the map edge
// with MovementArrow for REDEPLOY). This module keeps the old import path and exports.
export { MapQuarterReplay as QuarterReplay, REPLAY_INTERVAL_MS } from './MapQuarterReplay.js'
