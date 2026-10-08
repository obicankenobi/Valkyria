// history — P149 (ETAPP10 §9.2, beslut 10E). Verkliga, daterade händelser för kvartalet: förstasidor och telex (och, i P150, besluten). Steget ligger direkt
// efter applyActions så att effekterna verkar på samma kvartals fronter, heat och ordrar — se history.ts för allt innehåll och för brytaren historyEnabled.
import { advanceHistory } from '../../history.js'
import type { ResolveStep } from '../index.js'

export const history: ResolveStep = (ctx) => {
  advanceHistory(ctx)
}
