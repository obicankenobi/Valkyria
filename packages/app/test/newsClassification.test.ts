// newsClassification.test.ts — P81d (ETAPP7_TEKNISK_SPEC.md §13,
// P81-blockquoten). Headlines nedan är kopierade ORDAGRANT ur de faktiska
// emit()-anropen (grep:ade ur packages/core/src/resolve, inte gissade) —
// se newsClassification.ts:s egen kommentar för filreferenserna.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import type { WireEvent } from '@seventh-front/core'
import {
  groupTickers,
  isFlashEvent,
  newsDepartment,
  normalizeHeadlineTemplate,
} from '../src/newsClassification.js'

function makeEvent(overrides: Partial<WireEvent>): WireEvent {
  return {
    id: 'e-1',
    turn: 1,
    severity: 'headline',
    scope: 'global',
    headline: 'TEST HEADLINE',
    causeId: null,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
    ...overrides,
  }
}

describe('isFlashEvent (P81d)', () => {
  const flashHeadlines = [
    'CEASEFIRE ON THE FRONT-1 FRONT — NEGOTIATED PEACE', // factions.ts
    'WAR RESUMES ON THE FRONT-1 FRONT — RELATIONS COLLAPSE', // factions.ts
    'MERIDIAN ARMS FUNDS A SUCCESSFUL COUP IN LAOS — ALIGNMENT 10 → -70', // political.ts
    "MERIDIAN ARMS'S COUP ATTEMPT IN LAOS FAILS — RELATIONS PERMANENTLY DAMAGED (−£300,000)", // political.ts
    'MERIDIAN ARMS HAS JOHN SMITH ASSASSINATED — SUCCEEDED BY JANE DOE (−£200,000)', // political.ts
    'JOHN SMITH (RVN) ISSUES EMBARGO', // politics.ts
    'TRINH VAN SANG (NATIONAL LIBERATION FRONT) IS PREPARING EMBARGO — RELATIONS BELOW 30; RAISE THEM TO 30 OR MORE THIS QUARTER TO AVOID IT', // politics.ts, P99b (varning)
    'CRISIS — DOOMSDAY AT 75. AWAITING YOUR CHOICE.', // doomsday.ts
    'CRISIS WATCH — DOOMSDAY CROSSES 60', // doomsday.ts
    'MERIDIAN ARMS BOARD REVIEW (TURN 6): ON TRACK FOR "DOUBLING"', // board.ts
    'MERIDIAN ARMS BOARD REVIEW FAILED (TURN 10) — "DOUBLING" BEHIND SCHEDULE (1/2), LOAN TERMS TIGHTENED', // board.ts
    'BREAKTHROUGH ON THE FRONT-1 FRONT — POSITION SHIFTS TOWARD SIDE A', // fronts.ts, genuint fynd 1
    '18TH ARTILLERY GROUP REDEPLOYS HUE → AN-LOC AFTER THE BREAKTHROUGH', // fronts.ts, P82 (beslut 2F, genuint fynd 4)
    'NATIONAL LIBERATION FRONT BANKRUPT — ALL CONTRACTS VOIDED', // factions.ts, genuint fynd 3
    'NUCLEAR EXCHANGE', // endings.ts, genuint fynd 2
    'MERIDIAN ARMS EXPOSED — LICENCE REVOKED', // endings.ts
    'MERIDIAN ARMS LIQUIDATED — INSOLVENT', // endings.ts
    'MERIDIAN ARMS SOLD — BOARD TARGET MISSED', // endings.ts
    'MERIDIAN ARMS: SCENARIO COMPLETE', // endings.ts
  ]

  for (const headline of flashHeadlines) {
    it(`flaggar: "${headline.slice(0, 50)}..."`, () => {
      expect(isFlashEvent(makeEvent({ headline, severity: 'headline' }))).toBe(true)
    })
  }

  it('flaggar aldrig en ticker- eller report-händelse, oavsett text', () => {
    expect(isFlashEvent(makeEvent({ headline: flashHeadlines[0]!, severity: 'ticker' }))).toBe(false)
    expect(isFlashEvent(makeEvent({ headline: flashHeadlines[0]!, severity: 'report' }))).toBe(false)
  })

  it('flaggar inte en vanlig, icke lägesändrande rubrik', () => {
    expect(isFlashEvent(makeEvent({ headline: 'MERIDIAN ARMS WINS THE CONTRACT FOR 105MM FIELD GUNS', severity: 'headline' }))).toBe(false)
    expect(isFlashEvent(makeEvent({ headline: "RVN'S MATERIEL NEED GROWS: 105MM FIELD GUN (PEACETIME REPLACEMENT)", severity: 'headline' }))).toBe(false)
    // D-3 MECHANISED REGIMENT DESTROYED/MAULED (fronts.ts/attrition.ts) är
    // headline-severity men för FREKVENT för blixt-nivån (medvetet uteslutna).
    expect(isFlashEvent(makeEvent({ headline: 'D-3 MECHANISED REGIMENT DESTROYED — TAKEN OUT OF THE LINE', severity: 'headline' }))).toBe(false)
    expect(isFlashEvent(makeEvent({ headline: '4TH DIVISION MAULED — READINESS 80 → 40', severity: 'headline' }))).toBe(false)
  })
})

describe('newsDepartment (P81d)', () => {
  const state = createInitialState('indochina-slice', 'news-dept-seed')
  const frontId = Object.keys(state.fronts)[0]!
  const factionId = Object.keys(state.factions)[0]!

  it('en sektor-ankrad händelse (front) hör till "front"', () => {
    const event = makeEvent({ scope: 'front', subjectId: frontId })
    expect(newsDepartment(state, event)).toBe('front')
  })

  it('en hud-ankrad händelse (subjectId null) hör till "business"', () => {
    const event = makeEvent({ scope: 'house', subjectId: null })
    expect(newsDepartment(state, event)).toBe('business')
  })

  it('en faktionsriktad händelse med scope market hör till "market"', () => {
    const event = makeEvent({ scope: 'market', subjectId: factionId })
    expect(newsDepartment(state, event)).toBe('market')
  })

  it('en faktionsriktad händelse med scope faction (politik/underrättelse) hör till "politics"', () => {
    const event = makeEvent({ scope: 'faction', subjectId: factionId })
    expect(newsDepartment(state, event)).toBe('politics')
  })

  it('en faktionsriktad händelse med scope house (t.ex. en underrättelseoperation) hör till "politics"', () => {
    const event = makeEvent({ scope: 'house', subjectId: factionId })
    expect(newsDepartment(state, event)).toBe('politics')
  })
})

describe('normalizeHeadlineTemplate / groupTickers (P81d, P81-9)', () => {
  it('maskerar belopp och rena tal, olika belopp samma tur ger samma mall', () => {
    const a = normalizeHeadlineTemplate('MERIDIAN ARMS DEBT INTEREST: -£12,000')
    const b = normalizeHeadlineTemplate('MERIDIAN ARMS DEBT INTEREST: -£45,500')
    expect(a).toBe(b)
    expect(a).toBe('MERIDIAN ARMS DEBT INTEREST: -£#')
  })

  it('olika rubriktyper ger olika mallar', () => {
    const a = normalizeHeadlineTemplate('MERIDIAN ARMS DEBT INTEREST: -£12,000')
    const b = normalizeHeadlineTemplate('MERIDIAN ARMS QUARTERLY FIXED COSTS: -£120,000')
    expect(a).not.toBe(b)
  })

  it('grupperar tickers efter mall, behåller alla instanser i sin grupp', () => {
    const events: WireEvent[] = [
      makeEvent({ id: 'e1', turn: 1, severity: 'ticker', headline: 'MERIDIAN ARMS DEBT INTEREST: -£10,000' }),
      makeEvent({ id: 'e2', turn: 2, severity: 'ticker', headline: 'MERIDIAN ARMS QUARTERLY FIXED COSTS: -£120,000' }),
      makeEvent({ id: 'e3', turn: 3, severity: 'ticker', headline: 'MERIDIAN ARMS DEBT INTEREST: -£11,000' }),
    ]
    const groups = groupTickers(events)
    expect(groups.length).toBe(2)
    const interest = groups.find((g) => g.events.some((e) => e.id === 'e1'))!
    expect(interest.events.map((e) => e.id)).toEqual(['e1', 'e3'])
    const fixedCosts = groups.find((g) => g.events.some((e) => e.id === 'e2'))!
    expect(fixedCosts.events.length).toBe(1)
  })
})
