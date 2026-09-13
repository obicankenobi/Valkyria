// bidding — avgör anbud som löper ut denna tur (spec 4.2, 4.4).
// No-op i P2 (implementeras i P4). Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10.
import type { ResolveStep } from '../index.js'

export const bidding: ResolveStep = () => {}
