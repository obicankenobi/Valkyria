// types.skyddsracke4.test.ts — P51 klart-när: "ett test visar att PlayerAction-
// unionens variantlista är oförändrad" (ETAPP4_TEKNISK_SPEC.md avsnitt 6,
// skyddsräcke 4: "Ingen ny PlayerAction-variant. MARKET utvidgas med
// commodity; BROKER förblir obyggd.").
//
// Samma TYPNIVÅ-mönster som types.skyddsracke1.test.ts (etapp 3): en
// expectTypeOf-assertion, exekverad av `npm run typecheck`
// (tsc -p tsconfig.test.json) — inte en körtidskontroll, eftersom det inte
// finns någon körtidsversion av "unionens medlemslista" att avvisa. Poängen är
// att TYPEN PlayerAction['type'] själv inte tillåter en sjunde variant att
// existera, oavsett vad MARKET:s egna fält (commodity, tillagt i P51) innehåller.
import { describe, expectTypeOf, it } from 'vitest'
import type { Commodity, Money, PlayerAction } from '../src/types.js'

describe('skyddsräcke 4 (avsnitt 6): ingen ny PlayerAction-variant', () => {
  it('PlayerAction["type"] är exakt samma sex varianter som fanns innan P51', () => {
    expectTypeOf<PlayerAction['type']>().toEqualTypeOf<'BROKER' | 'INTEL' | 'POLITICAL' | 'MARKET' | 'INTERNAL' | 'CRISIS'>()
  })

  it('MARKET-varianten fick bara commodity tillagt (P51, avsnitt 4.5) — inga andra fält', () => {
    expectTypeOf<Extract<PlayerAction, { type: 'MARKET' }>>().toEqualTypeOf<{
      type: 'MARKET'
      op: 'BUY_FORWARD' | 'RELEASE'
      commodity: Commodity
      spend: Money
    }>()
  })
})
