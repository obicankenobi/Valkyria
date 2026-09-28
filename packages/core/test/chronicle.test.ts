import { describe, expect, it } from 'vitest'
import { CHRONICLE_CAP, appendChronicle, classifyChronicleEntries } from '../src/chronicle.js'
import type { ChronicleEntry, WireEvent } from '../src/types.js'

function event(overrides: Partial<WireEvent> & Pick<WireEvent, 'id' | 'turn' | 'headline'>): WireEvent {
  return {
    severity: 'headline',
    scope: 'global',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...overrides,
  }
}

describe('classifyChronicleEntries', () => {
  it('klassificerar en kupp', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS', actorIsPlayer: true })]
    const entries = classifyChronicleEntries(events)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.kind).toBe('coup')
    expect(entries[0]!.actorIsPlayer).toBe(true)
  })

  it('klassificerar en lyckad och en misslyckad incident', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'INCIDENT STAGED AGAINST NLF', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'BOTCHED INCIDENT AGAINST RVN', actorIsPlayer: true }),
    ]
    const entries = classifyChronicleEntries(events)
    expect(entries.map((e) => e.kind)).toEqual(['incident', 'incident'])
  })

  it('klassificerar ett lönnmord', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'RVN HAS SENIOR OFFICIAL ASSASSINATED', actorIsPlayer: true })]
    expect(classifyChronicleEntries(events)[0]!.kind).toBe('assassination')
  })

  it('klassificerar en läcka och ett spårat läckageförsök', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'YOUR HOUSE LEAKS DAMAGING INFORMATION ABOUT A RIVAL', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'A LEAK IN YOUR HOUSE IS TRACED BACK', actorIsPlayer: false }),
    ]
    expect(classifyChronicleEntries(events).map((e) => e.kind)).toEqual(['leak', 'leak'])
  })

  it('klassificerar sabotage', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'YOUR HOUSE SABOTAGES RIVAL OPERATIONS IN LAOS', actorIsPlayer: true })]
    expect(classifyChronicleEntries(events)[0]!.kind).toBe('sabotage')
  })

  it('klassificerar krisval (PUSH/BACK DOWN/SELL THE FILE)', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'PUSH — YOU DOUBLE DOWN', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'BACK DOWN — THE FILE STAYS BURIED', actorIsPlayer: true }),
      event({ id: '1-2', turn: 1, headline: 'SELL THE FILE — YOU CASH OUT', actorIsPlayer: true }),
    ]
    expect(classifyChronicleEntries(events).map((e) => e.kind)).toEqual(['crisis', 'crisis', 'crisis'])
  })

  it('klassificerar en bränd station som exposure', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'STATION IN SAIGON BURNED', actorIsPlayer: true })]
    expect(classifyChronicleEntries(events)[0]!.kind).toBe('exposure')
  })

  it('klassificerar en faktions bankrutt', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'RVN BANKRUPT — ALL CONTRACTS VOIDED', actorIsPlayer: false })]
    expect(classifyChronicleEntries(events)[0]!.kind).toBe('bankruptcy')
  })

  it('klassificerar en vapenvila', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'CEASEFIRE ON THE FRONT-1 FRONT', actorIsPlayer: false })]
    expect(classifyChronicleEntries(events)[0]!.kind).toBe('ceasefire')
  })

  it('klassificerar spelarens eget vunna kontrakt men inte en rivals', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'YOUR HOUSE WINS CONTRACT: 40× RIFLES TO RVN', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'RIVAL HOUSE WINS CONTRACT: 20× RIFLES TO NLF', actorIsPlayer: false }),
    ]
    const entries = classifyChronicleEntries(events)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.kind).toBe('contract')
    expect(entries[0]!.actorIsPlayer).toBe(true)
  })

  it('en vanlig leverans utan doomsday-koppling ger ingen krönikepost alls', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'DELIVERED 10× RIFLES TO RVN (+£100)', actorIsPlayer: true })]
    expect(classifyChronicleEntries(events)).toHaveLength(0)
  })

  it('en restricted leverans upptäcks via causeId till ett separat DOOMSDAY-event, inte via rubriktext', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'DELIVERED 10× NAPALM TO RVN (+£100)', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'DOOMSDAY +3 → 12', causeId: '1-0', delta: { doomsday: 3 } }),
    ]
    const entries = classifyChronicleEntries(events)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.kind).toBe('restricted_delivery')
    expect(entries[0]!.doomsdayDelta).toBe(3)
    expect(entries[0]!.causeHeadlines).toEqual([])
  })

  it('doomsdayDelta faller tillbaka på ett orsakat DOOMSDAY-event när entryn själv saknar delta.doomsday', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'INCIDENT STAGED AGAINST NLF', actorIsPlayer: true }),
      event({ id: '1-1', turn: 1, headline: 'DOOMSDAY +2 → 5', causeId: '1-0', delta: { doomsday: 2 } }),
    ]
    const entries = classifyChronicleEntries(events)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.doomsdayDelta).toBe(2)
  })

  it('doomsdayDelta läses direkt från eventets eget delta.doomsday när det finns', () => {
    const events = [event({ id: '1-0', turn: 1, headline: 'YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS', actorIsPlayer: true, delta: { doomsday: 5 } })]
    expect(classifyChronicleEntries(events)[0]!.doomsdayDelta).toBe(5)
  })

  it('causeHeadlines bygger orsakskedjan upp till tre led bakåt', () => {
    const events = [
      event({ id: '1-0', turn: 1, headline: 'ROOT EVENT' }),
      event({ id: '1-1', turn: 1, headline: 'LED THREE', causeId: '1-0' }),
      event({ id: '1-2', turn: 1, headline: 'LED TWO', causeId: '1-1' }),
      event({ id: '1-3', turn: 1, headline: 'YOUR HOUSE FUNDS A SUCCESSFUL COUP IN LAOS', actorIsPlayer: true, causeId: '1-2' }),
    ]
    const entries = classifyChronicleEntries(events)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.causeHeadlines).toEqual(['LED TWO', 'LED THREE', 'ROOT EVENT'])
  })

  it('en händelse matchar högst en kind', () => {
    // BACK_CHANNEL och en incident kan aldrig dela rubrik, men principen
    // testas ändå genom att kontrollera att exakt en post skapas per event.
    const events = [event({ id: '1-0', turn: 1, headline: 'INCIDENT STAGED AGAINST NLF', actorIsPlayer: true })]
    expect(classifyChronicleEntries(events)).toHaveLength(1)
  })
})

function entry(overrides: Partial<ChronicleEntry> & Pick<ChronicleEntry, 'turn'>): ChronicleEntry {
  return {
    kind: 'ceasefire',
    headline: `event ${overrides.turn}`,
    actorIsPlayer: false,
    causeHeadlines: [],
    doomsdayDelta: 0,
    ...overrides,
  }
}

describe('appendChronicle', () => {
  it('lägger till nya poster utan att beskära under taket', () => {
    const existing = [entry({ turn: 1 })]
    const result = appendChronicle(existing, [entry({ turn: 2 })])
    expect(result).toHaveLength(2)
  })

  it('gallrar äldsta icke-spelarhändelser först när taket nås', () => {
    const existing = Array.from({ length: CHRONICLE_CAP }, (_, i) => entry({ turn: i, actorIsPlayer: false }))
    const result = appendChronicle(existing, [entry({ turn: 999, actorIsPlayer: true })])
    expect(result).toHaveLength(CHRONICLE_CAP)
    // Den äldsta (turn 0) ska vara borta — den nyaste spelarhändelsen finns kvar.
    expect(result.some((e) => e.turn === 0)).toBe(false)
    expect(result.some((e) => e.turn === 999)).toBe(true)
  })

  it('spelarens egna händelser skyddas — bara icke-spelarhändelser gallras medan några finns kvar', () => {
    const existing = [
      entry({ turn: 0, actorIsPlayer: true }),
      entry({ turn: 1, actorIsPlayer: false }),
      ...Array.from({ length: CHRONICLE_CAP - 2 }, (_, i) => entry({ turn: i + 2, actorIsPlayer: false })),
    ]
    const result = appendChronicle(existing, [entry({ turn: 1000, actorIsPlayer: false })])
    expect(result).toHaveLength(CHRONICLE_CAP)
    expect(result.some((e) => e.turn === 0)).toBe(true) // spelarens post överlever
    expect(result.some((e) => e.turn === 1)).toBe(false) // äldsta icke-spelarhändelsen gallrad
  })

  it('gallrar äldst överlag när samtliga kvarvarande är spelarens egna', () => {
    const existing = Array.from({ length: CHRONICLE_CAP }, (_, i) => entry({ turn: i, actorIsPlayer: true }))
    const result = appendChronicle(existing, [entry({ turn: 999, actorIsPlayer: true })])
    expect(result).toHaveLength(CHRONICLE_CAP)
    expect(result.some((e) => e.turn === 0)).toBe(false)
    expect(result.some((e) => e.turn === 999)).toBe(true)
  })
})
