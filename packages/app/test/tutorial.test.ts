// tutorial.test.ts — P91a (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20).
import { describe, expect, it } from 'vitest'
import {
  INITIAL_TUTORIAL_STATE,
  TUTORIAL_STEPS,
  TUTORIAL_TURN_LIMIT,
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

  it('currentTutorialStep är null när alla fem steg är klara', () => {
    let t = startTutorial()
    for (const step of TUTORIAL_STEPS) t = completeTutorialStep(t, step.id)
    expect(currentTutorialStep(t)).toBeNull()
  })

  it('tutorialIsDone är sant när alla steg är klara', () => {
    let t = startTutorial()
    for (const step of TUTORIAL_STEPS) t = completeTutorialStep(t, step.id)
    expect(tutorialIsDone(t, 1)).toBe(true)
  })

  it(`tutorialIsDone är sant vid tur ${TUTORIAL_TURN_LIMIT} även om inte alla steg är klara`, () => {
    const t = startTutorial()
    expect(tutorialIsDone(t, TUTORIAL_TURN_LIMIT)).toBe(true)
    expect(tutorialIsDone(t, TUTORIAL_TURN_LIMIT - 1)).toBe(false)
  })

  it('tutorialIsDone är sant när tutorialen aldrig varit aktiv', () => {
    expect(tutorialIsDone(INITIAL_TUTORIAL_STATE, 0)).toBe(true)
  })

  it('stopTutorial gör active false', () => {
    const t = stopTutorial()
    expect(t.active).toBe(false)
    expect(currentTutorialStep(t)).toBeNull()
  })
})
