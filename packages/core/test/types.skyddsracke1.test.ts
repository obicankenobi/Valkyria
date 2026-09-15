// types.skyddsracke1.test.ts — P51 klart-när: "ett test visar att inget fält i
// TurnSubmission kan referera ett formationId" (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 7, skyddsräcke 1: "Inga order till förband, någonsin.").
//
// Det här är en TYPNIVÅ-garanti, inte en körtidskontroll — det finns inget
// formationId-värde att avvisa i körtid, poängen är att TYPEN själv inte
// tillåter fältet att existera. expectTypeOf:s assertioner exekveras av
// `npm run typecheck` (tsc -p tsconfig.test.json); under `vitest run` är
// anropen i praktiken no-ops (typkontrollen redan skedde vid kompilering).
// keyof en union inkluderar bara nycklar GEMENSAMMA för alla medlemmar, så
// `expectTypeOf<PlayerAction>().not.toHaveProperty('formationId')` håller
// automatiskt även om en FRAMTIDA variant skulle lägga till fältet på bara
// EN gren av unionen — vilket är exakt den täta garanti skyddsräcke 1 kräver.
import { describe, expectTypeOf, it } from 'vitest'
import type { Bid, PlayerAction, StandingOrderChange, TurnSubmission } from '../src/types.js'

describe('skyddsräcke 1 (avsnitt 7): inga order till förband, någonsin', () => {
  it('TurnSubmission och alla dess beståndsdelar saknar ett formationId-fält', () => {
    expectTypeOf<TurnSubmission>().not.toHaveProperty('formationId')
    expectTypeOf<PlayerAction>().not.toHaveProperty('formationId')
    expectTypeOf<Bid>().not.toHaveProperty('formationId')
    expectTypeOf<StandingOrderChange>().not.toHaveProperty('formationId')
  })
})
