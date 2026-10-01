// race — P118 (ETAPP9_FORSLAG.md §7.1, beslut 9H). Blockens kapplöpning: generationsskiften, köparnas techLevel, rivalernas
// konstruktioner (P117) och märkningen av utfasade konstruktioner.
//
// PLACERING (loggad i ANDRINGSLOGG, ägarbeslut 2026-09-30: nya pipeline-steg får läggas in i etapp 9 med loggad placering):
// direkt efter `rivals` och före `orders`. Skälet: `orders` läser Faction.techLevel för att välja vilken produkt en köpare får
// beställa, och `bidding` prövar behörighet mot generationen — ett steg som tas den här turen ska gälla redan den här turen.
// Det ligger efter `fronts` och `rivals` så att en händelse den här turen (en stridsbeprövad konstruktion, en rivals nya
// konstruktion) hinner påskynda ett steg som sker samma tur. Ordningen i övrigt är orörd (hård regel 7).
import { advanceDesignLifecycle, advancePerception, advanceRace, checkBothSides, processRivalDesigns } from '../../race.js'
import type { ResolveStep } from '../index.js'

export const race: ResolveStep = (ctx) => {
  advanceRace(ctx) // 1. blocken som nått sitt steg går upp en generation, köparnas techLevel följer, rykten kan uppstå
  advancePerception(ctx) // 1b. (P120) rykten och LEAK-biaser löper ut eller avslöjas
  checkBothSides(ctx) // 1c. (P121) huset märks sälja till båda sidorna: kapplöpningen går fortare
  processRivalDesigns(ctx) // 2. rivalernas konstruktioner enligt schema (9F), läser de nya generationerna
  advanceDesignLifecycle(ctx) // 3. husets konstruktioner som nu är utfasade märks
}
