// golden.test.ts — snapshot-tester med fast frö, ett helt scriptat parti per
// botpolicy, hashat sluttillstånd. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt 11.3.
//
// Tre policyer, inte alla fyra: `passive`/`aggressive`/`balanced` är de tre
// ursprungliga botarkeetyperna (ETAPP1_TEKNISK_SPEC.md avsnitt 7.3) — `capacity`
// är etapp 1,5:s EGNA tillägg (P14, avsnitt 10.2) och dess ekonomi är redan
// separat, djupt utredd i avsnitt 13:s måltabell (se docs/ANDRINGSLOGG.md,
// P22-balanspasset: `capacity` mot `aggressive` är en av de fem medvetet
// reviderade raderna). Tre snapshots räcker för avsnitt 11.3:s krav och
// undviker att frysa ett fjärde partis hash mot en bot vars egen ekonomi redan
// är dokumenterat instabil mellan balanspass.
// POLICIES importeras från policies.js direkt, INTE paketets main
// (dist/index.js) — den filen är harness-CLI:ts eget skript och kör (main +
// skriver en CSV) så fort den laddas, se packages/harness/src/index.ts.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@seventh-front/harness/dist/policies.js'
import type { Policy } from '@seventh-front/harness/dist/policies.js'
import { playScript } from './playScript.js'
import { hashState } from './hashState.js'
import balanceLive from '../../src/data/balance.json' with { type: 'json' }
import balanceFrozen from './fixtures/balance.frozen.json' with { type: 'json' }

const SCENARIO = 'indochina-slice'
const TURNS = 21 // MAX_TURNS, se packages/harness/src/runGame.ts — turn 0..20

// Avsnitt 11.3: "Snapshotet fryses sist i etappen ... en fixtur som fryses
// innan balansen är klar hade dödat balanspasset." Omvänt: en gång fryst får
// den ALDRIG tyst glida isär från den levande filen — CLAUDE.md, "Om
// golden-snapshotet ändras: stanna och fråga. Uppdatera det aldrig själv."
// Den här kontrollen är mekaniken bakom det löftet: den failar HÖGT och
// TYDLIGT innan ett enda parti ens spelas, i stället för att låta ett senare
// balanspass tyst spela mot fel tal och producera ett meningslöst snapshot.
//
// Återaktiverad i P32 (ETAPP2_TEKNISK_SPEC.md avsnitt 9), omfryst mot P24–P31s
// balans. PENDAD IGEN från och med P44 (ägarbeslut 2026-09-15, se
// ANDRINGSLOGG.md samma datum): ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 6 säger uttryckligen "golden-snapshoten fryses om TVÅ GÅNGER, en
// gång per etapphalva" — dvs. P47 (balanspass 3A) är den avsedda
// omfrysningspunkten för hela 3A (P43–P46), inte varje enskild prompt inom
// den. P44s materielNeed-påfyllnad (varje tur, för varje faktion) bryter
// redan hash-en även om ingen balanssiffra "skruvats" i vanlig mening — precis
// den sortens förväntad, avsedd konsekvens P47 finns till för att samla ihop
// och frysa om på en gång, inte P43/P44/P45/P46 var för sig. Samma mönster
// och samma motivering som P24s pendning (se den raden i ANDRINGSLOGG.md):
// hellre pendat och synligt kommenterat än rött i fyra commit-cykler eller
// omfryst fyra separata gånger. Återaktiveras och fryses om i P47.
it.skip('fixtures/balance.frozen.json är bitvis identisk med src/data/balance.json', () => {
  expect(balanceFrozen).toEqual(balanceLive)
})

describe.skip('golden — ett scriptat parti per botpolicy, seed och sluttillstånd frysta (avsnitt 11.3)', () => {
  const cases: { policyName: 'passive' | 'aggressive' | 'balanced'; seed: string; expectedHash: string }[] = [
    { policyName: 'passive', seed: 'golden-passive-p22', expectedHash: '19eaa8e478234' },
    { policyName: 'aggressive', seed: 'golden-aggressive-p22', expectedHash: '4a5a34a1ce76f' },
    { policyName: 'balanced', seed: 'golden-balanced-p22', expectedHash: 'ed5ee5fbb4f09' },
  ]

  for (const { policyName, seed, expectedHash } of cases) {
    it(`${policyName}: sluttillståndets hash är oförändrad, och partiet ger > 12 rubriker`, () => {
      const policy = POLICIES[policyName] as Policy
      const { finalState, wireLog } = playScript(SCENARIO, seed, policy, TURNS)

      const headlineCount = wireLog.filter((e) => e.severity === 'headline').length
      expect(headlineCount).toBeGreaterThan(12)

      expect(hashState(finalState)).toBe(expectedHash)
    })
  }
})
