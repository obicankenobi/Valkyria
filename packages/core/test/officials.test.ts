import { describe, expect, it } from 'vitest'
import { findOfficial, officialId, replaceOfficial } from '../src/officials.js'
import { createInitialState } from '../src/state.js'
import officialsRegister from '../src/data/officials.json' with { type: 'json' }
import type { Official } from '../src/types.js'

describe('officialId (ETAPP5_TEKNISK_SPEC.md avsnitt 3.1)', () => {
  it('bygger samma id-schema som state.ts:s buildOfficials använder', () => {
    expect(officialId('rvn', 'procurement')).toBe('official-rvn-procurement')
  })
})

describe('createInitialState — Official (avsnitt 3.1)', () => {
  it('varje faktion i scenariot får fyra tjänstemän (en per post), lästa ur officials.json', () => {
    const state = createInitialState('indochina-slice', 'seed')

    for (const factionId of Object.keys(state.factions)) {
      for (const post of ['procurement', 'defence', 'finance', 'interior'] as const) {
        const official = findOfficial(state, factionId, post)
        expect(official, `${factionId}/${post}`).toBeDefined()
        expect(official!.factionId).toBe(factionId)
        expect(official!.post).toBe(post)
        expect(official!.status).toBe('active')
        expect(official!.relationToPlayer).toBe(0)
      }
    }
  })

  it('en tjänstemans startintegritet/agenda kommer ordagrant från officials.json, inte rullad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const seed = (officialsRegister as Record<string, { post: string; integrity: number; agenda: string }[]>)['rvn']!.find(
      (o) => o.post === 'procurement',
    )!

    const official = findOfficial(state, 'rvn', 'procurement')!
    expect(official.integrity).toBe(seed.integrity)
    expect(official.agenda).toBe(seed.agenda)
  })
})

// P54 klart-når, tredje punkten: "ett test visar att en fallen tjänsteman
// ersätts med nollställd relation." Ingen live-utlösare finns ännu i P54 (se
// officials.ts:s egen kommentar) — testar den rena transformationen isolerat.
describe('replaceOfficial (avsnitt 3.1, klart-når)', () => {
  it('en fallen tjänsteman ersätts av en ny person: relationToPlayer nollställd, status tillbaka till active, ny name/integrity/standing/agenda', () => {
    const fallen: Official = {
      id: 'official-rvn-procurement',
      name: 'Do Van Khanh',
      factionId: 'rvn',
      post: 'procurement',
      integrity: 55,
      standing: 0,
      relationToPlayer: 80, // hög relation byggd upp med den GAMLA personen
      agenda: 'REARM',
      status: 'fallen',
      scandalRisk: 60, // P56: skandalen som fällde henne
    }

    const replaced = replaceOfficial(fallen, { name: 'Ly Thi Xuan', integrity: 20, standing: 50, agenda: 'AUSTERITY' })

    expect(replaced.relationToPlayer).toBe(0)
    expect(replaced.status).toBe('active')
    expect(replaced.name).toBe('Ly Thi Xuan')
    expect(replaced.integrity).toBe(20)
    expect(replaced.standing).toBe(50)
    expect(replaced.agenda).toBe('AUSTERITY')
    expect(replaced.scandalRisk).toBe(0) // ny person, ingen ärvd skandalhistorik
    // Identitet (id/factionId/post) hör till POSTEN, inte personen — oförändrad.
    expect(replaced.id).toBe(fallen.id)
    expect(replaced.factionId).toBe(fallen.factionId)
    expect(replaced.post).toBe(fallen.post)
  })

  it('fungerar likadant för en död (assassinerad) tjänsteman — samma ersättningskedja som fallen', () => {
    const dead: Official = {
      id: 'official-nlf-interior',
      name: 'Dang Van Chau',
      factionId: 'nlf',
      post: 'interior',
      integrity: 50,
      standing: 40,
      relationToPlayer: 60,
      agenda: 'MODERNISE',
      status: 'dead',
      scandalRisk: 0,
    }

    const replaced = replaceOfficial(dead, { name: 'Vu Thi Hang', integrity: 65, standing: 45, agenda: 'NON_ALIGNMENT' })

    expect(replaced.relationToPlayer).toBe(0)
    expect(replaced.status).toBe('active')
  })
})
