// state.buildWorld.test.ts — P43 klart-när (ETAPP4_TEKNISK_SPEC.md avsnitt 3.1,
// 8): "ett test visar att buildWorld bygger två teatrar med var sin front ur en
// konstruerad scenariofil". Testar buildWorld direkt (exporterad i state.ts,
// inte del av paketets publika yta) i stället för att gå via den hårdkodade
// SCENARIOS-katalogen, som bara innehåller indochina-slice.json — en fil P43
// medvetet INTE utökar med en andra front (ren formatändring, se ANDRINGSLOGG.md).
import { describe, expect, it } from 'vitest'
import { buildWorld } from '../src/state.js'
import type { ScenarioFile } from '../src/state.js'

function makeFront(overrides: Partial<ScenarioFile['fronts'][number]>): ScenarioFile['fronts'][number] {
  return {
    id: 'front-x',
    theatreId: 'theatre-x',
    sideA: 'rvn',
    sideB: 'nlf',
    attacker: 'a',
    position: 0,
    moraleA: 50,
    moraleB: 50,
    strengthA: 10,
    strengthB: 10,
    terrainBonus: 0,
    formations: [],
    ...overrides,
  }
}

describe('buildWorld (P43 klart-när)', () => {
  it('bygger två teatrar med var sin front ur en konstruerad scenariofil, korrekt bundna via theatreId', () => {
    const scenario: ScenarioFile = {
      id: 'two-theatre-test',
      name: 'Two Theatre Test',
      startYear: 1970,
      startQuarter: 1,
      turnCount: 10,
      rivalIds: [],
      house: undefined as unknown as ScenarioFile['house'],
      factions: [],
      theatres: [
        { id: 'north', name: 'NORTH', heat: 10 },
        { id: 'south', name: 'SOUTH', heat: 20 },
      ],
      fronts: [
        makeFront({ id: 'front-north', theatreId: 'north', sideA: 'rvn', sideB: 'nlf' }),
        makeFront({ id: 'front-south', theatreId: 'south', sideA: 'laos', sideB: 'nlf' }),
      ],
      scriptedEvents: [],
    }

    const { theatres, fronts } = buildWorld(scenario)

    expect(theatres).toHaveLength(2)
    expect(fronts).toHaveLength(2)

    const north = theatres.find((t) => t.id === 'north')!
    const south = theatres.find((t) => t.id === 'south')!
    expect(north.frontIds).toEqual(['front-north'])
    expect(south.frontIds).toEqual(['front-south'])
    expect(north.heat).toBe(10)
    expect(south.heat).toBe(20)

    const frontNorth = fronts.find((f) => f.id === 'front-north')!
    const frontSouth = fronts.find((f) => f.id === 'front-south')!
    expect(frontNorth.theatreId).toBe('north')
    expect(frontSouth.theatreId).toBe('south')
    expect(frontSouth.sideA).toBe('laos')
  })

  it('flera fronter kan dela samma teater (frontIds växer, inte bara sista fronten)', () => {
    const scenario: ScenarioFile = {
      id: 'shared-theatre-test',
      name: 'Shared Theatre Test',
      startYear: 1970,
      startQuarter: 1,
      turnCount: 10,
      rivalIds: [],
      house: undefined as unknown as ScenarioFile['house'],
      factions: [],
      theatres: [{ id: 'indochina', name: 'INDOCHINA', heat: 25 }],
      fronts: [
        makeFront({ id: 'front-a', theatreId: 'indochina' }),
        makeFront({ id: 'front-b', theatreId: 'indochina' }),
      ],
      scriptedEvents: [],
    }

    const { theatres } = buildWorld(scenario)

    expect(theatres).toHaveLength(1)
    expect(theatres[0]!.frontIds).toEqual(['front-a', 'front-b'])
  })

  it('varje front får förband via buildFormations, med frontId satt till sin egen front', () => {
    const scenario: ScenarioFile = {
      id: 'formations-test',
      name: 'Formations Test',
      startYear: 1970,
      startQuarter: 1,
      turnCount: 10,
      rivalIds: [],
      house: undefined as unknown as ScenarioFile['house'],
      factions: [],
      theatres: [{ id: 'theatre-x', name: 'X', heat: 0 }],
      fronts: [
        makeFront({
          id: 'front-x',
          formations: [
            { id: 'unit-1', name: 'Test Unit', factionId: 'rvn', side: 'a', sectorId: 'sector-1', doctrine: 'infantry', strength: 10 },
          ],
        }),
      ],
      scriptedEvents: [],
    }

    const { fronts } = buildWorld(scenario)

    expect(fronts[0]!.formations).toHaveLength(1)
    expect(fronts[0]!.formations[0]!.frontId).toBe('front-x')
  })
})
