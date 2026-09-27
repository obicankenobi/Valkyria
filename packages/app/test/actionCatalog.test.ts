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

  it('bara "operations" och "company" förekommer som mål (de enda skärmar med byggda former)', () => {
    for (const entry of ACTION_CATALOG) {
      expect(['operations', 'company']).toContain(entry.target)
    }
  })

  it('täcker exakt de 17 verb som faktiskt har en byggd form i appen (CountryFile.tsx + TheHouse.tsx/CompanyActions.tsx, P85: BUY_FORWARD/RELEASE tillkom)', () => {
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
      'BRIBE',
      'TAKE_LOAN',
      'REPAY',
      'BUILD_LINE',
      'HIRE',
      'REPRIORITISE_RND',
      'BUY_FORWARD',
      'RELEASE',
    ]
    expect(ACTION_CATALOG.map((e) => e.verb).sort()).toEqual([...expected].sort())
  })
})
