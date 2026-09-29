// soundCues.test.ts — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 3). Ren diff mellan två ögonblicksbilder → vilka effekter som ska
// spelas. Ingen ljudmotor, inget DOM.
import { describe, expect, it } from 'vitest'
import { ambienceLayers, soundCuesFor, type SoundSnapshot } from '../src/soundCues.js'

const idle: SoundSnapshot = {
  view: 'operations',
  actionTypes: [],
  bidCount: 0,
  openOrderCount: 0,
  pendingCrisis: false,
  selectedFactionId: null,
  replaying: false,
  turn: 3,
  wireHeadlines: [],
}

describe('soundCuesFor — inga signaler utan förändring', () => {
  it('identiska bilder ger tystnad', () => {
    expect(soundCuesFor(idle, { ...idle })).toEqual([])
  })
})

describe('soundCuesFor — skärmbyte och nyhetsförstasida', () => {
  it('ett byte mellan två spelskärmar ger tab-switch', () => {
    expect(soundCuesFor(idle, { ...idle, view: 'contracts' })).toEqual(['tab-switch'])
  })

  it('att öppna NEWS DESK ger newsreel-sting, inte tab-switch', () => {
    expect(soundCuesFor(idle, { ...idle, view: 'news' })).toEqual(['newsreel-sting'])
  })

  it('ett byte till eller från menyn ger ingen flik-signal (menyn har ingen flikrad)', () => {
    expect(soundCuesFor({ ...idle, view: 'menu' }, { ...idle, view: 'new-game' })).toEqual([])
    expect(soundCuesFor(idle, { ...idle, view: 'menu' })).toEqual([])
    expect(soundCuesFor({ ...idle, view: 'briefing' }, idle)).toEqual([])
  })
})

describe('soundCuesFor — handlingsplatser och bud', () => {
  it('en ny handling ger card-place, en borttagen ger card-remove', () => {
    expect(soundCuesFor(idle, { ...idle, actionTypes: ['RECRUIT'] })).toEqual(['card-place'])
    expect(soundCuesFor({ ...idle, actionTypes: ['RECRUIT'] }, idle)).toEqual(['card-remove'])
  })

  it('en ny BACK_CHANNEL ger backchannel i stället för card-place', () => {
    expect(soundCuesFor(idle, { ...idle, actionTypes: ['BACK_CHANNEL'] })).toEqual(['backchannel'])
  })

  it('en ersatt handling med samma antal ger ingen signal', () => {
    expect(soundCuesFor({ ...idle, actionTypes: ['RECRUIT'] }, { ...idle, actionTypes: ['EXPAND'] })).toEqual([])
  })

  it('ett nytt bud ger stamp, ett borttaget bud ger card-remove', () => {
    expect(soundCuesFor(idle, { ...idle, bidCount: 1 })).toEqual(['stamp'])
    expect(soundCuesFor({ ...idle, bidCount: 1 }, idle)).toEqual(['card-remove'])
  })
})

describe('soundCuesFor — kartan och nya ordrar', () => {
  it('att välja ett land ger map-select, att välja bort ger inget', () => {
    expect(soundCuesFor(idle, { ...idle, selectedFactionId: 'rvn' })).toEqual(['map-select'])
    expect(soundCuesFor({ ...idle, selectedFactionId: 'rvn' }, idle)).toEqual([])
  })

  it('att byta från ett land till ett annat ger map-select igen', () => {
    expect(soundCuesFor({ ...idle, selectedFactionId: 'rvn' }, { ...idle, selectedFactionId: 'laos' })).toEqual([
      'map-select',
    ])
  })

  it('fler öppna ordrar ger order-new, färre ger inget', () => {
    expect(soundCuesFor(idle, { ...idle, openOrderCount: 2 })).toEqual(['order-new'])
    expect(soundCuesFor({ ...idle, openOrderCount: 2 }, idle)).toEqual([])
  })
})

describe('soundCuesFor — kris och turhändelser', () => {
  it('en ny kris ger crisis-phone, bara när den dyker upp', () => {
    expect(soundCuesFor(idle, { ...idle, pendingCrisis: true })).toEqual(['crisis-phone'])
    expect(soundCuesFor({ ...idle, pendingCrisis: true }, { ...idle, pendingCrisis: true })).toEqual([])
    expect(soundCuesFor({ ...idle, pendingCrisis: true }, idle)).toEqual([])
  })

  it('en bränd station i den nya turens rubriker ger static-burst', () => {
    const next = { ...idle, turn: 4, wireHeadlines: ['STATION SAIGON BURNED — EXPOSURE 96'] }
    expect(soundCuesFor(idle, next)).toEqual(['static-burst'])
  })

  it('ett vunnet kontrakt i den nya turens rubriker ger stamp', () => {
    const next = { ...idle, turn: 4, wireHeadlines: ['MERIDIAN ARMS WINS THE CONTRACT FOR 105MM FIELD GUNS'] }
    expect(soundCuesFor(idle, next)).toEqual(['stamp'])
  })

  it('samma rubriker på oförändrad tur upprepar inte signalen', () => {
    const same = { ...idle, turn: 4, wireHeadlines: ['STATION SAIGON BURNED — EXPOSURE 96'] }
    expect(soundCuesFor(same, { ...same })).toEqual([])
  })
})

describe('soundCuesFor — flera händelser på en gång', () => {
  it('ger varje signal högst en gång, i en stabil ordning', () => {
    const next: SoundSnapshot = {
      ...idle,
      turn: 4,
      openOrderCount: 3,
      pendingCrisis: true,
      wireHeadlines: ['STATION HUE BURNED IN THE FALLOUT', 'STATION SAIGON BURNED — EXPOSURE 97'],
    }
    const cues = soundCuesFor(idle, next)
    expect(new Set(cues).size).toBe(cues.length)
    expect(cues).toEqual(['order-new', 'crisis-phone', 'static-burst'])
  })
})

describe('soundCuesFor — inga spöksignaler vid laddning eller från titelskärmen', () => {
  const loaded: SoundSnapshot = {
    ...idle,
    turn: 9,
    openOrderCount: 4,
    pendingCrisis: true,
    wireHeadlines: ['STATION SAIGON BURNED — EXPOSURE 96'],
  }

  it('att komma in i spelet från menyn med ett laddat parti spelar inga tillståndssignaler', () => {
    expect(soundCuesFor({ ...idle, view: 'menu' }, loaded)).toEqual([])
    expect(soundCuesFor({ ...idle, view: 'briefing' }, loaded)).toEqual([])
  })

  it('ett tur-hopp (laddat sparat parti mitt i spelet) spelar inga signaler', () => {
    expect(soundCuesFor(idle, loaded)).toEqual([])
    expect(soundCuesFor({ ...loaded, turn: 9 }, { ...idle, turn: 2 })).toEqual([])
  })

  it('en vanlig turövergång (exakt +1) spelar fortfarande sina signaler', () => {
    expect(soundCuesFor(idle, { ...idle, turn: 4, openOrderCount: 1 })).toEqual(['order-new'])
  })
})

describe('ambienceLayers — rumsljud i spelet, teleprinter under uppspelningen', () => {
  it('ingen ambience i menyn, briefingen eller epilogen', () => {
    for (const view of ['menu', 'new-game', 'briefing', 'epilogue']) {
      expect(ambienceLayers({ ...idle, view })).toEqual([])
    }
  })

  it('rumsljud på alla spelskärmar', () => {
    for (const view of ['operations', 'contracts', 'company', 'contacts', 'news']) {
      expect(ambienceLayers({ ...idle, view })).toEqual(['room-tone'])
    }
  })

  it('under kvartalsuppspelningen läggs telex-loop till', () => {
    expect(ambienceLayers({ ...idle, replaying: true })).toEqual(['room-tone', 'telex-loop'])
  })
})
