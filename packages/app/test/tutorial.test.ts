// tutorial.test.ts — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20).
import { describe, expect, it } from 'vitest'
import {
  INITIAL_TUTORIAL_STATE,
  TUTORIAL_STEPS,
  TUTORIAL_LATE_LIMIT,
  TUTORIAL_TURN_LIMIT,
  tutorialContext,
  completeTutorialStep,
  currentTutorialStep,
  startTutorial,
  stopTutorial,
  tutorialIsDone,
} from '../src/tutorial.js'

describe('tutorial (P91a)', () => {
  it('currentTutorialStep är null när tutorialen inte är aktiv', () => {
    expect(currentTutorialStep(INITIAL_TUTORIAL_STATE)).toBeNull()
  })

  it('startTutorial ger det första steget', () => {
    const t = startTutorial()
    expect(currentTutorialStep(t)?.id).toBe(TUTORIAL_STEPS[0]!.id)
  })

  it('completeTutorialStep flyttar till nästa steg', () => {
    let t = startTutorial()
    t = completeTutorialStep(t, 'select-country')
    expect(currentTutorialStep(t)?.id).toBe('place-bid')
  })

  it('completeTutorialStep är idempotent', () => {
    let t = startTutorial()
    t = completeTutorialStep(t, 'select-country')
    const again = completeTutorialStep(t, 'select-country')
    expect(again.completed).toEqual(t.completed)
  })

  it('steg markeras klara oavsett ordning — panelen visar alltid det tidigaste ofärdiga', () => {
    let t = startTutorial()
    t = completeTutorialStep(t, 'end-quarter') // spelaren hoppar direkt till sista steget
    expect(currentTutorialStep(t)?.id).toBe('select-country') // ändå det första som visas
  })

  it('P146: de tre sena stegen visas först från tur 3, i ordningen rita, anmäl, svara — och de två sista bara när något finns att göra', () => {
    expect(TUTORIAL_STEPS.filter((s) => s.phase === 'late').map((s) => s.id)).toEqual(['draw-design', 'enter-programme', 'answer-card'])
    const t = startTutorial()
    expect(currentTutorialStep(t, TUTORIAL_TURN_LIMIT)?.id).toBe('draw-design') // de tidiga stegen visas inte längre
    const drawn = completeTutorialStep(t, 'draw-design')
    expect(currentTutorialStep(drawn, 4)).toBeNull() // ingen infordran, inget kort: inget att visa
    expect(currentTutorialStep(drawn, 4, { programmeOpen: true })?.id).toBe('enter-programme')
    expect(currentTutorialStep(drawn, 4, { cardOpen: true })?.id).toBe('answer-card')
    expect(currentTutorialStep(drawn, 4, { programmeOpen: true, cardOpen: true })?.id).toBe('enter-programme')
    expect(currentTutorialStep(t, 1, { programmeOpen: true })?.id).toBe('select-country') // före tur 3 gäller de fem första
  })

  it('P146: tutorialContext läser öppen infordran och väntande kort ur staten', () => {
    const base = { programmes: [], traces: [], house: { investigations: [] } } as never
    expect(tutorialContext(base)).toEqual({ programmeOpen: false, cardOpen: false })
    const open = {
      programmes: [{ phase: 'announced', entrants: [] }],
      traces: [{ houseId: 'player', status: 'surfaced' }],
      house: { investigations: [] },
    } as never
    expect(tutorialContext(open)).toEqual({ programmeOpen: true, cardOpen: true })
    const entered = { programmes: [{ phase: 'announced', entrants: [{ houseId: 'player' }] }], traces: [], house: { investigations: [{ status: 'open' }] } } as never
    expect(tutorialContext(entered)).toEqual({ programmeOpen: false, cardOpen: true })
  })

  it('currentTutorialStep är null när alla steg är klara', () => {
    let t = startTutorial()
    for (const step of TUTORIAL_STEPS) t = completeTutorialStep(t, step.id)
    expect(currentTutorialStep(t)).toBeNull()
  })

  it('tutorialIsDone är sant när alla steg är klara', () => {
    let t = startTutorial()
    for (const step of TUTORIAL_STEPS) t = completeTutorialStep(t, step.id)
    expect(tutorialIsDone(t, 1)).toBe(true)
  })

  it(`tutorialIsDone är sant vid tur ${TUTORIAL_LATE_LIMIT} även om inte alla steg är klara (de tidiga stegen går ut vid tur ${TUTORIAL_TURN_LIMIT}, de sena får finnas kvar)`, () => {
    const t = startTutorial()
    expect(tutorialIsDone(t, TUTORIAL_LATE_LIMIT)).toBe(true)
    expect(tutorialIsDone(t, TUTORIAL_TURN_LIMIT)).toBe(false) // de sena stegen väntar
    expect(tutorialIsDone(t, TUTORIAL_TURN_LIMIT - 1)).toBe(false)
    let late = t
    for (const id of ['draw-design', 'enter-programme', 'answer-card'] as const) late = completeTutorialStep(late, id)
    expect(tutorialIsDone(late, TUTORIAL_TURN_LIMIT)).toBe(true)
  })

  it('tutorialIsDone är sant när tutorialen aldrig varit aktiv', () => {
    expect(tutorialIsDone(INITIAL_TUTORIAL_STATE, 0)).toBe(true)
  })

  it('P181: de tre stegen för verken kommer efter de fem första, i ordningen bygg, planera, läs ett larm', () => {
    expect(TUTORIAL_STEPS.filter((s) => s.phase === 'early').map((s) => s.id)).toEqual(['select-country', 'place-bid', 'fill-action-slot', 'end-quarter', 'read-news', 'build-works', 'plan-line', 'read-alarm'])
    let t = startTutorial()
    for (const id of ['select-country', 'place-bid', 'fill-action-slot', 'end-quarter', 'read-news'] as const) t = completeTutorialStep(t, id)
    expect(currentTutorialStep(t)?.id).toBe('build-works')
    t = completeTutorialStep(t, 'read-alarm') // ingen hård ordning: ett larm kan läsas före bygget
    expect(currentTutorialStep(t)?.id).toBe('build-works')
    t = completeTutorialStep(completeTutorialStep(t, 'build-works'), 'plan-line')
    expect(currentTutorialStep(t)).toBeNull()
  })

  it('stopTutorial gör active false', () => {
    const t = stopTutorial()
    expect(t.active).toBe(false)
    expect(currentTutorialStep(t)).toBeNull()
  })
})
