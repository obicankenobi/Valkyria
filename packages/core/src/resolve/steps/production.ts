// production — linjer producerar mot kontrakt; styckkostnad bokförs här (spec 4.1, 5).
// No-op i P2 (implementeras i P5). Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10.
import type { ResolveStep } from '../index.js'

export const production: ResolveStep = () => {}
