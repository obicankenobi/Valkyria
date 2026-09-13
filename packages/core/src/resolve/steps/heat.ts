// heat — heat per teater — stiger vid leverans in i aktiv konflikt, avsvalnar annars (spec 5, 6.1).
// No-op i P2 (implementeras i P7). Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10.
import type { ResolveStep } from '../index.js'

export const heat: ResolveStep = () => {}
