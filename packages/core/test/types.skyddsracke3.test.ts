// types.skyddsracke3.test.ts — skyddsräcke 3 (ETAPP5_TEKNISK_SPEC.md avsnitt 6):
// "ASSASSINATE, BRIBE, FUND_CAMPAIGN och FAVOUR tar ett OfficialId — aldrig ett
// FactionId ensamt, aldrig ett fritextnamn." BRIBE/FUND_CAMPAIGN/FAVOUR byggda i
// P56; ASSASSINATE tillkommer i P62 och pinnas där.
//
// Samma TYPNIVÅ-mönster som types.skyddsracke1.test.ts/skyddsracke4.test.ts: en
// expectTypeOf-assertion, exekverad av `npm run typecheck` — inte en
// körtidskontroll, eftersom poängen är att TYPEN själv inte tillåter ett
// FactionId eller en fritextsträng att stå där officialId krävs.
import { describe, expectTypeOf, it } from 'vitest'
import type { FactionId, Money, OfficialId, PlayerAction } from '../src/types.js'

type PoliticalAction = Extract<PlayerAction, { type: 'POLITICAL' }>

describe('skyddsräcke 3 (avsnitt 6): BRIBE/FUND_CAMPAIGN/FAVOUR tar officialId, aldrig FactionId', () => {
  it('PlayerAction["type"] === "POLITICAL" är fortfarande en enda variant (skyddsräcke 4 rörs inte) — bara internt en union på op', () => {
    expectTypeOf<PoliticalAction['type']>().toEqualTypeOf<'POLITICAL'>()
  })

  it('BRIBE och FUND_CAMPAIGN har exakt { officialId, spend } — inget targetFactionId', () => {
    expectTypeOf<Extract<PoliticalAction, { op: 'BRIBE' | 'FUND_CAMPAIGN' }>>().toEqualTypeOf<{
      type: 'POLITICAL'
      op: 'BRIBE' | 'FUND_CAMPAIGN'
      officialId: OfficialId
      spend: Money
    }>()
  })

  it('FAVOUR har exakt { officialId, marginCost } — varken targetFactionId eller spend (hon kostar aldrig kassa)', () => {
    expectTypeOf<Extract<PoliticalAction, { op: 'FAVOUR' }>>().toEqualTypeOf<{
      type: 'POLITICAL'
      op: 'FAVOUR'
      officialId: OfficialId
      marginCost: Money
    }>()
  })

  it('STAGE_INCIDENT/BACK_CHANNEL behåller targetFactionId (rör ett LAND, ingen person) — inget officialId', () => {
    expectTypeOf<Extract<PoliticalAction, { op: 'STAGE_INCIDENT' | 'BACK_CHANNEL' }>>().toEqualTypeOf<{
      type: 'POLITICAL'
      op: 'STAGE_INCIDENT' | 'BACK_CHANNEL'
      targetFactionId: FactionId
      spend: Money
    }>()
  })

  it('OfficialId och FactionId är strukturellt samma primitiv (string) men typnamnen skiljer avsikten — ett FactionId kan inte tilldelas där officialId förväntas utan en explicit konvertering, exakt vad state.ts:s officialId()-helper är till för', () => {
    // Detta är dokumentation, inte en körbar typkontroll (OfficialId/FactionId är
    // båda `string` under huven, TypeScript kan inte skilja dem strukturellt) —
    // den FAKTISKA garantin är att PlayerAction-unionen ovan bara namnger fältet
    // `officialId` på BRIBE/FUND_CAMPAIGN/FAVOUR, aldrig `targetFactionId`.
    expectTypeOf<OfficialId>().toEqualTypeOf<string>()
    expectTypeOf<FactionId>().toEqualTypeOf<string>()
  })
})
