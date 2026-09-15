import { describe, expect, it } from 'vitest'
import { engagement } from '../src/resolve/engagement.js'
import { createInitialState } from '../src/state.js'
import type { Doctrine, Formation, Front, TechCategory, WireEvent } from '../src/types.js'

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

function makeEmit(): { emit: (e: Omit<WireEvent, 'id' | 'turn'>) => string; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  return {
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    emitted,
  }
}

function zeroEquipment(): Record<TechCategory, number> {
  const record = {} as Record<TechCategory, number>
  for (const category of TECH_CATEGORIES) record[category] = 0
  return record
}

function makeFormation(overrides: Partial<Formation> & { id: string; side: 'a' | 'b' }): Formation {
  return {
    name: overrides.id,
    factionId: overrides.side === 'a' ? 'rvn' : 'nlf',
    frontId: 'front-1',
    sectorId: 'test-sector',
    doctrine: 'infantry' as Doctrine,
    strength: 100,
    strengthAtFull: 100,
    equipment: zeroEquipment(),
    readiness: 100,
    status: 'active',
    engagedWith: null,
    turnsMauled: 0,
    ...overrides,
  }
}

function invariantHolds(front: Front): void {
  for (const side of ['a', 'b'] as const) {
    const sideFormations = front.formations.filter((f) => f.side === side)
    expect(sideFormations.reduce((sum, f) => sum + f.strength, 0)).toBe(front.strength[side])
    for (const category of TECH_CATEGORIES) {
      expect(sideFormations.reduce((sum, f) => sum + f.equipment[category], 0)).toBe(front.equipment[side][category])
    }
  }
}

describe('engagement (resolve/engagement.js, ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.3)', () => {
  it('(P49 klart-når) invarianten i 5.1 håller efter 20 turers strid', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.terrainBonus = 0
    front.formations = [
      makeFormation({
        id: 'a-1',
        side: 'a',
        doctrine: 'infantry',
        strength: 200,
        strengthAtFull: 200,
        equipment: { ...zeroEquipment(), infantry: 400, artillery: 60 },
      }),
      makeFormation({
        id: 'a-2',
        side: 'a',
        doctrine: 'armoured',
        strength: 120,
        strengthAtFull: 120,
        equipment: { ...zeroEquipment(), armour: 80, infantry: 100 },
      }),
      makeFormation({
        id: 'b-1',
        side: 'b',
        doctrine: 'infantry',
        strength: 180,
        strengthAtFull: 180,
        equipment: { ...zeroEquipment(), infantry: 350, artillery: 40 },
      }),
      makeFormation({
        id: 'b-2',
        side: 'b',
        doctrine: 'mechanised',
        strength: 90,
        strengthAtFull: 90,
        equipment: { ...zeroEquipment(), armour: 50, infantry: 80 },
      }),
    ]
    // Ingen invariantHolds-kontroll HÄR — front.strength/equipment sätts inte
    // manuellt ovan (bara formations), och engagement()s steg 5 skriver om dem
    // FRÅN formationerna vid varje anrop, oavsett vad de var innan. Invarianten
    // gäller alltså per definition EFTER varje strid, vilket är precis vad
    // klart-när-villkoret ber om — inte före den första.

    const { emit } = makeEmit()
    for (let turn = 0; turn < 20; turn++) {
      engagement(state, front, front.attacker, front.attacker === 'a' ? 'b' : 'a', emit)
      invariantHolds(front)
    }
  })

  it('(P49 klart-når) ett förband med övertag tar mindre förluster', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.terrainBonus = 0
    front.supplyStress = { a: 0, b: 0 }

    const strongAttacker = makeFormation({
      id: 'strong-attacker',
      side: 'a',
      strength: 200,
      strengthAtFull: 200,
      equipment: { ...zeroEquipment(), artillery: 500 },
    })
    const weakDefender = makeFormation({
      id: 'weak-defender',
      side: 'b',
      strength: 200,
      strengthAtFull: 200,
      equipment: { ...zeroEquipment(), artillery: 10 },
    })
    front.formations = [strongAttacker, weakDefender]

    const strengthBeforeAttacker = strongAttacker.strength
    const strengthBeforeDefender = weakDefender.strength

    engagement(state, front, 'a', 'b', makeEmit().emit)

    const attackerLoss = strengthBeforeAttacker - strongAttacker.strength
    const defenderLoss = strengthBeforeDefender - weakDefender.strength
    expect(attackerLoss).toBeLessThan(defenderLoss)
  })

  it('(P49 klart-når) ett destroyed-förband lämnar linjen och aggregaten minskar i motsvarande grad', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.terrainBonus = 0
    front.supplyStress = { a: 0, b: 0 }

    // Försvararen precis ovanför destroyThreshold (10) — ett enda kraftigt
    // missgynnat drabbning räcker för att knuffa den under.
    const overwhelmingAttacker = makeFormation({
      id: 'overwhelming-attacker',
      side: 'a',
      strength: 500,
      strengthAtFull: 500,
      equipment: { ...zeroEquipment(), artillery: 1000, armour: 1000 },
    })
    // Vid maximal missgynnad (pairAdvantage klampad till 1) blir defenderLossPct
    // engagementAttritionPct × 2 = 12 % — strength 10 → round(10×0.12)=1 förlorad
    // → 9, precis under destroyThreshold (10). strength 12 hade bara gett 11,
    // INTE under tröskeln (uppmätt, inte gissat).
    const nearDeath = makeFormation({
      id: 'near-death',
      side: 'b',
      strength: 10,
      strengthAtFull: 200,
      readiness: 40,
      equipment: { ...zeroEquipment(), infantry: 5 },
    })
    const untouchedReserve = makeFormation({
      id: 'untouched-reserve',
      side: 'b',
      status: 'mauled', // inte 'active' — paras aldrig, rörs inte av den här drabbningen
      strength: 50,
      strengthAtFull: 50,
      equipment: { ...zeroEquipment(), infantry: 30 },
    })
    front.formations = [overwhelmingAttacker, nearDeath, untouchedReserve]

    engagement(state, front, 'a', 'b', makeEmit().emit)

    expect(nearDeath.status).toBe('destroyed')
    expect(nearDeath.strength).toBe(0)
    for (const category of TECH_CATEGORIES) expect(nearDeath.equipment[category]).toBe(0)

    // Aggregaten (skrivna om ur förbanden i steg 5) ska motsvara EXAKT det som
    // finns kvar — den utplånade bidrar noll, reserven orörd.
    expect(front.strength.b).toBe(untouchedReserve.strength)
    expect(front.equipment.b.infantry).toBe(untouchedReserve.equipment.infantry)
    invariantHolds(front)
  })

  it('(P49 klart-når) categoryCombatWeight gör infanteri icke-noll i utfallet', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.terrainBonus = 0
    front.supplyStress = { a: 0, b: 0 }

    // Anfallaren har ENBART infanteri (ingen artilleri/annat) — fynd 3
    // (avsnitt 0/5.3) beskriver den GAMLA motorn som bara räknade artilleri.
    // Om categoryCombatWeight.infantry vore 0 skulle den här anfallaren ha
    // combatPower 0, precis som den helt tomma försvararen — och ingen sida
    // skulle vara missgynnad. Med en verklig, ickenoll infanterivikt vinner
    // anfallaren tydligt trots att den saknar allt annat.
    const infantryOnlyAttacker = makeFormation({
      id: 'infantry-only-attacker',
      side: 'a',
      strength: 300,
      strengthAtFull: 300,
      equipment: { ...zeroEquipment(), infantry: 2000 },
    })
    const emptyDefender = makeFormation({
      id: 'empty-defender',
      side: 'b',
      strength: 300,
      strengthAtFull: 300,
      equipment: zeroEquipment(),
    })
    front.formations = [infantryOnlyAttacker, emptyDefender]

    const attackerStrengthBefore = infantryOnlyAttacker.strength
    const defenderStrengthBefore = emptyDefender.strength

    engagement(state, front, 'a', 'b', makeEmit().emit)

    const attackerLoss = attackerStrengthBefore - infantryOnlyAttacker.strength
    const defenderLoss = defenderStrengthBefore - emptyDefender.strength
    expect(defenderLoss).toBeGreaterThan(attackerLoss)
  })

  it('mauled → refitting → active: ett förband återhämtar sig utan att strida (nödvändigt tillägg, se ANDRINGSLOGG.md)', () => {
    const state = createInitialState('indochina-slice', 'seed')
    const front = state.fronts['front-1']!
    front.terrainBonus = 0
    front.supplyStress = { a: 0, b: 0 }

    const mauledFormation = makeFormation({
      id: 'mauled-formation',
      side: 'a',
      status: 'mauled',
      readiness: 20, // under maulThreshold (35), som väntat för ett redan mauled förband
      strength: 100,
      strengthAtFull: 100,
      equipment: zeroEquipment(),
    })
    // En reserv på motståndarsidan, aktiv men oparad (finns ingen aktiv
    // motpart på sida a) — håller fronten "i strid" (front-1:s grundutrustning
    // stagnerar annars aldrig ens hit, se createInitialState).
    const opponentActive = makeFormation({ id: 'opponent-active', side: 'b', equipment: { ...zeroEquipment(), artillery: 1 } })
    front.formations = [mauledFormation, opponentActive]

    const { emit } = makeEmit()

    // Tur 1: fortfarande mauled (bara EN tur utan strid hittills).
    engagement(state, front, 'b', 'a', emit)
    expect(mauledFormation.status).toBe('mauled')
    expect(mauledFormation.turnsMauled).toBe(1)

    // Tur 2: två turer utan strid i rad — övergår till refitting.
    engagement(state, front, 'b', 'a', emit)
    expect(mauledFormation.status).toBe('refitting')

    // Ytterligare turer: readiness stiger tills refitThreshold (70) passeras.
    for (let turn = 0; turn < 10 && mauledFormation.status === 'refitting'; turn++) {
      engagement(state, front, 'b', 'a', emit)
    }
    expect(mauledFormation.status).toBe('active')
    expect(mauledFormation.readiness).toBeGreaterThan(70)
  })
})
