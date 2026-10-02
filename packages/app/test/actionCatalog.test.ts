// actionCatalog.test.ts — P81-12 (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
import { describe, expect, it } from 'vitest'
import { ACTION_CATALOG } from '../src/actionCatalog.js'
import { VERB_ICON } from '../src/components/Shell.js'

describe('ACTION_CATALOG', () => {
  it('varje post har en ikon i Shell.tsx:s delade VERB_ICON — en källa, upprepas aldrig', () => {
    for (const entry of ACTION_CATALOG) {
      expect(VERB_ICON[entry.verb], `${entry.verb} saknar en ikon i VERB_ICON`).toBeTruthy()
    }
  })

  it('inget verb förekommer två gånger', () => {
    const verbs = ACTION_CATALOG.map((e) => e.verb)
    expect(new Set(verbs).size).toBe(verbs.length)
  })

  it('bara "operations", "company", "contacts" och "contracts" förekommer som mål (de enda skärmar med byggda former)', () => {
    for (const entry of ACTION_CATALOG) {
      expect(['operations', 'company', 'contacts', 'contracts']).toContain(entry.target)
    }
  })

  it('täcker exakt de 25 verb (22 + etapp 9:s FIELD_TRIAL/REVERSE_ENGINEER, P126) som faktiskt har en byggd form i appen (P86: CONTACTS ger STAGE_INCIDENT/BACK_CHANNEL/FUND_COUP/BROKER/FUND_CAMPAIGN/FAVOUR/ASSASSINATE en riktig form — §7.1:s klart-när, "alla 22 verb nåbara")', () => {
    const expected = [
      'EXPAND',
      'WITHDRAW',
      'LEAK',
      'SABOTAGE',
      'TURN',
      'RECRUIT',
      'INFLUENCE',
      'STAGE_INCIDENT',
      'BACK_CHANNEL',
      'FUND_COUP',
      'BROKER',
      'BRIBE',
      'FUND_CAMPAIGN',
      'FAVOUR',
      'ASSASSINATE',
      'TAKE_LOAN',
      'REPAY',
      'BUILD_LINE',
      'HIRE',
      'REPRIORITISE_RND',
      'BUY_FORWARD',
      'RELEASE',
      'FIELD_TRIAL',
      'REVERSE_ENGINEER',
      'PROCUREMENT',
    ]
    expect(ACTION_CATALOG.map((e) => e.verb).sort()).toEqual([...expected].sort())
  })
})
